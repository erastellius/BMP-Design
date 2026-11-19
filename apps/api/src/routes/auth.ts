import type { FastifyInstance } from "fastify";
import { hash, verify } from "@node-rs/argon2";
import crypto from "node:crypto";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import { db, type DbUser } from "../db/client";
import { requireAuth } from "../middleware/requireAuth";

type Challenge = { sub: number; challenge: true; exp?: number };

function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function cookieOptions() {
  return { httpOnly: true, secure: false, sameSite: "lax" as const, path: "/", maxAge: 60 * 60 * 8 };
}

export async function authRoutes(app: FastifyInstance) {
  app.post("/api/auth/register", async (request, reply) => {
    const { email, password } = request.body as { email?: string; password?: string };
    if (!email || !password || password.length < 12) {
      return reply.code(400).send({ error: "Email and a 12-character password are required" });
    }
    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email.toLowerCase());
    if (existing) return reply.code(409).send({ error: "Email already registered" });
    const passwordHash = await hash(password, { algorithm: 2 });
    const result = db.prepare("INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'customer')").run(email.toLowerCase(), passwordHash);
    db.prepare("INSERT INTO audit_logs (user_id, action, ip_address) VALUES (?, 'register', ?)").run(result.lastInsertRowid, request.ip);
    return reply.code(201).send({ id: result.lastInsertRowid });
  });

  app.post("/api/auth/login", {
    config: { rateLimit: { max: 5, timeWindow: "15 minutes" } }
  }, async (request, reply) => {
    const { email, password } = request.body as { email?: string; password?: string };
    if (!email || !password) return reply.code(400).send({ error: "Email and password required" });
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase()) as DbUser | undefined;
    if (!user || user.is_active !== 1) return reply.code(401).send({ error: "Invalid credentials" });
    if (user.locked_until && user.locked_until > Date.now()) {
      return reply.code(423).send({ error: "Account temporarily locked" });
    }

    const valid = await verify(user.password_hash, password);
    if (!valid) {
      const attempts = user.failed_attempts + 1;
      const lockedUntil = attempts >= 5 ? Date.now() + 15 * 60 * 1000 : null;
      db.prepare("UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?").run(attempts, lockedUntil, user.id);
      return reply.code(401).send({ error: "Invalid credentials" });
    }
    db.prepare("UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?").run(user.id);
    const challengeToken = app.jwt.sign({ sub: user.id, challenge: true }, { expiresIn: "5m" });
    return reply.send({ challengeToken, mfaRequired: user.two_factor_enabled === 1 });
  });

  app.post("/api/auth/2fa/setup", async (request, reply) => {
    const { challengeToken } = request.body as { challengeToken?: string };
    if (!challengeToken) return reply.code(401).send({ error: "Challenge token required" });
    let payload: Challenge;
    try { payload = app.jwt.verify<Challenge>(challengeToken); } catch { return reply.code(401).send({ error: "Invalid challenge" }); }
    if (!payload.challenge) return reply.code(401).send({ error: "Invalid challenge" });

    const secret = authenticator.generateSecret();
    const codes = Array.from({ length: 8 }, () => crypto.randomBytes(5).toString("hex").toUpperCase());
    const backupCodesHash = await Promise.all(codes.map(async code => `${code}:${await hash(code, { algorithm: 2 })}`));
    db.prepare("UPDATE users SET two_factor_secret = ?, backup_codes_hash = ? WHERE id = ?")
      .run(secret, JSON.stringify(backupCodesHash), payload.sub);
    const user = db.prepare("SELECT email FROM users WHERE id = ?").get(payload.sub) as { email: string };
    const qrDataUrl = await QRCode.toDataURL(authenticator.keyuri(user.email, "BMP-Design", secret));
    return reply.send({ qrDataUrl, secret, backupCodes: codes });
  });

  app.post("/api/auth/2fa/verify", async (request, reply) => {
    const { challengeToken, code } = request.body as { challengeToken?: string; code?: string };
    if (!challengeToken || !code) return reply.code(400).send({ error: "Challenge token and code required" });
    let payload: Challenge;
    try { payload = app.jwt.verify<Challenge>(challengeToken); } catch { return reply.code(401).send({ error: "Invalid challenge" }); }
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(payload.sub) as DbUser | undefined;
    if (!user || user.is_active !== 1) return reply.code(401).send({ error: "Account unavailable" });

    let valid = false;
    if (/^\d{6}$/.test(code) && user.two_factor_secret) {
      valid = authenticator.check(code, user.two_factor_secret);
    } else if (user.backup_codes_hash) {
      const records = JSON.parse(user.backup_codes_hash) as string[];
      for (const record of records) {
        const separator = record.indexOf(":");
        const plain = record.slice(0, separator);
        const hashed = record.slice(separator + 1);
        if (plain === code.toUpperCase()) {
          valid = await verify(hashed, code);
          if (valid) {
            const remaining = records.filter(item => item !== record);
            db.prepare("UPDATE users SET backup_codes_hash = ? WHERE id = ?").run(JSON.stringify(remaining), user.id);
          }
        }
      }
    }
    if (!valid) return reply.code(401).send({ error: "Invalid verification code" });

    db.prepare("UPDATE users SET two_factor_enabled = 1 WHERE id = ?").run(user.id);
    const token = app.jwt.sign({ sub: user.id, role: user.role, mfa: true, ver: user.token_version }, { expiresIn: "8h" });
    reply.setCookie("auth", token, cookieOptions());
    db.prepare("INSERT INTO audit_logs (user_id, action, ip_address) VALUES (?, 'login', ?)").run(user.id, request.ip);
    return reply.send({ user: { id: user.id, email: user.email, role: user.role } });
  });

  app.post("/api/auth/password/forgot", async (request, reply) => {
    const { email } = request.body as { email?: string };
    if (!email) return reply.send({ ok: true });
    const user = db.prepare("SELECT id FROM users WHERE email = ?").get(email.toLowerCase()) as { id: number } | undefined;
    if (user) {
      const raw = crypto.randomBytes(32).toString("hex");
      db.prepare("INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(sha256(raw), user.id, Date.now() + 15 * 60 * 1000);
      // Returning the token is safe for this self-hosted demo; production email delivery should replace this.
      return reply.send({ ok: true, resetToken: raw });
    }
    return reply.send({ ok: true });
  });

  app.post("/api/auth/password/reset", async (request, reply) => {
    const { token, password } = request.body as { token?: string; password?: string };
    if (!token || !password || password.length < 12) return reply.code(400).send({ error: "Valid token and 12-character password required" });
    const reset = db.prepare("SELECT * FROM password_resets WHERE token_hash = ? AND used = 0").get(sha256(token)) as { user_id: number; expires_at: number } | undefined;
    if (!reset || reset.expires_at < Date.now()) return reply.code(400).send({ error: "Reset token expired or invalid" });
    const passwordHash = await hash(password, { algorithm: 2 });
    db.prepare("UPDATE users SET password_hash = ?, token_version = token_version + 1, failed_attempts = 0, locked_until = NULL WHERE id = ?").run(passwordHash, reset.user_id);
    db.prepare("UPDATE password_resets SET used = 1 WHERE token_hash = ?").run(sha256(token));
    db.prepare("INSERT INTO audit_logs (user_id, action, ip_address) VALUES (?, 'password_reset', ?)").run(reset.user_id, request.ip);
    reply.clearCookie("auth", { path: "/" });
    return reply.send({ ok: true });
  });

  app.post("/api/auth/logout", async (request, reply) => {
    reply.clearCookie("auth", { path: "/" });
    return reply.send({ ok: true });
  });

  app.post("/api/auth/logout-all", { preHandler: [requireAuth("customer", "sales_rep", "admin")] }, async (request, reply) => {
    const user = (request as any).authUser as DbUser;
    db.prepare("UPDATE users SET token_version = token_version + 1 WHERE id = ?").run(user.id);
    reply.clearCookie("auth", { path: "/" });
    return reply.send({ ok: true });
  });

  app.get("/api/admin/users", { preHandler: [requireAuth("admin")] }, async (_request, reply) => {
    const users = db.prepare("SELECT id, email, role, is_active, two_factor_enabled, token_version, created_at FROM users").all();
    return reply.send(users);
  });

  app.post("/api/admin/users/:id/revoke", { preHandler: [requireAuth("admin")] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { suspend?: boolean } | undefined;
    if (body?.suspend) db.prepare("UPDATE users SET is_active = 0 WHERE id = ?").run(id);
    db.prepare("UPDATE users SET token_version = token_version + 1 WHERE id = ?").run(id);
    const admin = (request as any).authUser as DbUser;
    db.prepare("INSERT INTO audit_logs (user_id, action, ip_address) VALUES (?, 'admin_revoke_user', ?)").run(admin.id, request.ip);
    return reply.send({ ok: true });
  });
}

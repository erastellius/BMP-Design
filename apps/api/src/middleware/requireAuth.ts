import type { FastifyReply, FastifyRequest } from "fastify";
import { db, type DbUser } from "../db/client";

export function requireAuth(...allowedRoles: Array<"customer" | "sales_rep" | "admin">) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
      const payload = (request as any).user as { sub: number; mfa: boolean; ver: number };
      if (!payload.mfa) {
        return reply.code(401).send({ error: "Two-factor authentication required" });
      }

      const user = db.prepare("SELECT * FROM users WHERE id = ?").get(payload.sub) as DbUser | undefined;
      if (!user || user.is_active !== 1) {
        return reply.code(401).send({ error: "Account is inactive" });
      }
      if (payload.ver !== user.token_version) {
        return reply.code(401).send({ error: "Session has been revoked" });
      }
      if (allowedRoles.length && !allowedRoles.includes(user.role)) {
        return reply.code(403).send({ error: "Insufficient permissions" });
      }
      (request as any).authUser = user;
    } catch {
      return reply.code(401).send({ error: "Invalid or missing authentication cookie" });
    }
  };
}

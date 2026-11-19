import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import { seedDatabase } from "./db/client";
import { authRoutes } from "./routes/auth";
import { aiRoutes } from "./routes/ai";
import { projectRoutes } from "./routes/projects";

const app = Fastify({ bodyLimit: 10 * 1024 * 1024, trustProxy: true });

async function start() {
  await app.register(cors, { origin: "http://localhost:5173", credentials: true });
  await app.register(cookie);
  await app.register(jwt, { secret: process.env.JWT_SECRET || "bmp-design-development-secret", cookie: { cookieName: "auth", signed: false } });
  await app.register(rateLimit, { global: false, max: 100, timeWindow: "1 minute" });

  await seedDatabase();
  await authRoutes(app);
  await aiRoutes(app);
  await projectRoutes(app);

  app.get("/api/health", async () => ({ ok: true }));
  await app.listen({ port: 4000, host: "0.0.0.0" });
  console.log("BMP-Design API listening on http://0.0.0.0:4000");
}

start().catch(error => {
  console.error(error);
  process.exit(1);
});

import type { FastifyInstance } from "fastify";
import { db, type DbUser } from "../db/client";
import { requireAuth } from "../middleware/requireAuth";

export async function projectRoutes(app: FastifyInstance) {
  app.get("/api/projects", { preHandler: [requireAuth("customer", "sales_rep", "admin")] }, async (request, reply) => {
    const user = (request as any).authUser as DbUser;
    const projects = db.prepare(`
      SELECT id, name, canvas_json, bom_json, total_usd, updated_at
      FROM projects WHERE user_id = ? ORDER BY updated_at DESC
    `).all(user.id);
    return reply.send(projects);
  });

  app.post("/api/projects", { preHandler: [requireAuth("customer", "sales_rep", "admin")] }, async (request, reply) => {
    const user = (request as any).authUser as DbUser;
    const body = request.body as { name?: string; canvasJson?: unknown; bomJson?: unknown; totalUsd?: number };
    if (!body.name) return reply.code(400).send({ error: "Project name is required" });
    const result = db.prepare(`
      INSERT INTO projects (user_id, name, canvas_json, bom_json, total_usd)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      user.id,
      body.name,
      JSON.stringify(body.canvasJson || {}),
      JSON.stringify(body.bomJson || {}),
      Number(body.totalUsd || 0)
    );
    return reply.code(201).send({ id: result.lastInsertRowid });
  });
}

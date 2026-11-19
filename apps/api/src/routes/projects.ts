import type { FastifyInstance } from "fastify";
import { db, type DbUser } from "../db/client";
import { requireAuth } from "../middleware/requireAuth";

const authenticated = () => ({ preHandler: [requireAuth("customer", "sales_rep", "admin")] });

type ProjectRow = {
  id: number;
  name: string;
  thumbnail_data_url: string | null;
  canvas_json: string | null;
  bom_json: string | null;
  total_usd: number;
  created_at: string;
  updated_at: string;
};

function getUser(request: unknown) {
  return (request as { authUser: DbUser }).authUser;
}

function parseJson(value: string | null, fallback: unknown) {
  return value === null ? fallback : JSON.parse(value);
}

export async function projectRoutes(app: FastifyInstance) {
  app.get("/api/projects", authenticated(), async (request, reply) => {
    const user = getUser(request);
    const projects = db.prepare(`
      SELECT id, name, thumbnail_data_url, total_usd, created_at, updated_at
      FROM projects
      WHERE user_id = ?
      ORDER BY updated_at DESC
    `).all(user.id) as Array<{
      id: number;
      name: string;
      thumbnail_data_url: string | null;
      total_usd: number;
      created_at: string;
      updated_at: string;
    }>;
    return reply.send(projects.map(project => ({
      id: project.id,
      name: project.name,
      thumbnailDataUrl: project.thumbnail_data_url,
      totalUsd: project.total_usd,
      createdAt: project.created_at,
      updatedAt: project.updated_at
    })));
  });

  app.get("/api/projects/:id", authenticated(), async (request, reply) => {
    const user = getUser(request);
    const { id } = request.params as { id: string };
    const projectId = Number(id);
    if (!Number.isSafeInteger(projectId) || projectId <= 0) {
      return reply.code(400).send({ error: "Project id must be a positive integer" });
    }

    const project = db.prepare(`
      SELECT id, name, thumbnail_data_url, canvas_json, bom_json, total_usd, created_at, updated_at
      FROM projects
      WHERE id = ? AND user_id = ?
    `).get(projectId, user.id) as ProjectRow | undefined;
    if (!project) return reply.code(404).send({ error: "Project not found" });

    return reply.send({
      id: project.id,
      name: project.name,
      thumbnailDataUrl: project.thumbnail_data_url,
      canvasState: parseJson(project.canvas_json, {}),
      bomItems: parseJson(project.bom_json, []),
      totalUsd: project.total_usd,
      createdAt: project.created_at,
      updatedAt: project.updated_at
    });
  });

  app.post("/api/projects", authenticated(), async (request, reply) => {
    const user = getUser(request);
    const body = request.body as {
      id?: number;
      name?: string;
      thumbnailDataUrl?: string | null;
      canvasState?: unknown;
      bomItems?: unknown;
      totalUsd?: number;
    };
    if (typeof body?.name !== "string" || !body.name.trim()) {
      return reply.code(400).send({ error: "Project name is required" });
    }
    const name = body.name.trim();
    if (body.thumbnailDataUrl !== undefined &&
        body.thumbnailDataUrl !== null &&
        typeof body.thumbnailDataUrl !== "string") {
      return reply.code(400).send({ error: "thumbnailDataUrl must be a string or null" });
    }
    const totalUsd = body.totalUsd ?? 0;
    if (typeof totalUsd !== "number" || !Number.isFinite(totalUsd) || totalUsd < 0) {
      return reply.code(400).send({ error: "totalUsd must be a non-negative number" });
    }

    const canvasJson = JSON.stringify(body.canvasState ?? {});
    const bomJson = JSON.stringify(body.bomItems ?? []);
    const thumbnailDataUrl = body.thumbnailDataUrl ?? null;

    if (body.id !== undefined) {
      if (!Number.isSafeInteger(body.id) || body.id <= 0) {
        return reply.code(400).send({ error: "Project id must be a positive integer" });
      }
      const existing = db.prepare("SELECT id FROM projects WHERE id = ? AND user_id = ?").get(body.id, user.id);
      if (!existing) return reply.code(404).send({ error: "Project not found" });

      db.prepare(`
        UPDATE projects
        SET name = ?, thumbnail_data_url = ?, canvas_json = ?, bom_json = ?, total_usd = ?, updated_at = datetime('now')
        WHERE id = ? AND user_id = ?
      `).run(name, thumbnailDataUrl, canvasJson, bomJson, totalUsd, body.id, user.id);
      return reply.send({ id: body.id, name });
    }

    const result = db.prepare(`
      INSERT INTO projects (user_id, name, thumbnail_data_url, canvas_json, bom_json, total_usd, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(user.id, name, thumbnailDataUrl, canvasJson, bomJson, totalUsd);
    return reply.code(201).send({ id: Number(result.lastInsertRowid), name });
  });

  app.delete("/api/projects/:id", authenticated(), async (request, reply) => {
    const user = getUser(request);
    const { id } = request.params as { id: string };
    const projectId = Number(id);
    if (!Number.isSafeInteger(projectId) || projectId <= 0) {
      return reply.code(400).send({ error: "Project id must be a positive integer" });
    }

    const result = db.prepare("DELETE FROM projects WHERE id = ? AND user_id = ?").run(projectId, user.id);
    if (result.changes === 0) return reply.code(404).send({ error: "Project not found" });
    return reply.send({ ok: true });
  });
}

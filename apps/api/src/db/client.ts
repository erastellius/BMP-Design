import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { hash } from "@node-rs/argon2";

const dbPath = path.resolve(process.cwd(), "data", "pergola.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma("foreign_keys = ON");

const schemaPath = path.join(__dirname, "schema.sql");
db.exec(fs.readFileSync(schemaPath, "utf8"));

const projectColumns = new Set(
  (db.pragma("table_info(projects)") as Array<{ name: string }>).map(column => column.name)
);
if (!projectColumns.has("thumbnail_data_url")) {
  db.exec("ALTER TABLE projects ADD COLUMN thumbnail_data_url TEXT");
}
if (!projectColumns.has("created_at")) {
  db.exec("ALTER TABLE projects ADD COLUMN created_at TEXT");
  db.exec("UPDATE projects SET created_at = datetime('now') WHERE created_at IS NULL");
}
if (!projectColumns.has("updated_at")) {
  db.exec("ALTER TABLE projects ADD COLUMN updated_at TEXT");
  db.exec("UPDATE projects SET updated_at = datetime('now') WHERE updated_at IS NULL");
}
db.exec("CREATE INDEX IF NOT EXISTS idx_projects_user_updated ON projects(user_id, updated_at DESC)");

export async function seedDatabase() {
  const count = db.prepare("SELECT COUNT(*) AS count FROM users").get() as { count: number };
  if (count.count === 0) {
    const passwordHash = await hash("Admin12345!", { algorithm: 2 });
    db.prepare(`
      INSERT INTO users (email, password_hash, role)
      VALUES (?, ?, 'admin')
    `).run("admin@bmpdesign.local", passwordHash);
  }
}

export type DbUser = {
  id: number;
  email: string;
  password_hash: string;
  role: "customer" | "sales_rep" | "admin";
  is_active: number;
  two_factor_enabled: number;
  two_factor_secret: string | null;
  backup_codes_hash: string | null;
  token_version: number;
  failed_attempts: number;
  locked_until: number | null;
  created_at: string;
};

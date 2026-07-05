import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { app } from "electron";

let db: Database.Database | null = null;

/**
 * Returns a singleton better-sqlite3 connection, initializing the schema
 * on first use. The DB file lives in the OS-standard userData directory,
 * NOT inside the app bundle, so it survives app updates/reinstalls.
 */
export function getDb(): Database.Database {
  if (db) return db;

  const userDataDir = app.getPath("userData");
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }
  const dbPath = path.join(userDataDir, "wp-ai-image-publisher.sqlite3");

  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  const schemaPath = app.isPackaged
    ? path.join(process.resourcesPath, "schema.sql")
    : path.join(__dirname, "schema.sql");

  const schemaSql = fs.readFileSync(schemaPath, "utf-8");
  db.exec(schemaSql);

  migrateOldJobsTableIfNeeded(db);

  return db;
}

/**
 * Phase 1 shipped a `jobs` table with columns (stage, error_reason) that
 * were never actually written to. Later phases use a richer shape
 * (logs_json, error_message, content_title, provider). If an existing
 * install has the old shape, migrate it once; CREATE TABLE IF NOT EXISTS
 * in schema.sql already created the new shape for fresh installs, so this
 * only fires for upgrades from that earlier version.
 */
function migrateOldJobsTableIfNeeded(db: Database.Database): void {
  const columns = db.prepare("PRAGMA table_info(jobs)").all() as Array<{ name: string }>;
  const hasNewShape = columns.some((c) => c.name === "logs_json");
  if (hasNewShape || columns.length === 0) return;

  // Old shape detected and it never had real rows in practice (Phase 1
  // never wrote to it), so a straight rename+recreate is safe here.
  db.exec(`
    ALTER TABLE jobs RENAME TO jobs_old_phase1;
    CREATE TABLE jobs (
      id             TEXT PRIMARY KEY,
      website_id     TEXT NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
      content_id     INTEGER NOT NULL,
      content_title  TEXT NOT NULL DEFAULT '',
      provider       TEXT NOT NULL DEFAULT 'manual',
      status         TEXT NOT NULL DEFAULT 'pending',
      progress       INTEGER NOT NULL DEFAULT 0,
      logs_json      TEXT NOT NULL DEFAULT '[]',
      error_message  TEXT,
      created_at     TEXT NOT NULL,
      updated_at     TEXT NOT NULL
    );
    DROP TABLE jobs_old_phase1;
  `);
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

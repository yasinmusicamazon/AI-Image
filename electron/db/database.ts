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

  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

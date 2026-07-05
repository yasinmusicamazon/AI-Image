import { randomUUID } from "crypto";
import { getDb } from "../db/database";
import { getContentDetail, updateContent } from "./wordpress";

interface WpCredsForBackup {
  siteUrl: string;
  username: string;
  applicationPassword: string;
}

/**
 * Saves the current live content as a backup row BEFORE any update is
 * made. This is called unconditionally ahead of every content-modifying
 * operation (insertion, featured image change) — never skipped, per the
 * "always backup before update" requirement.
 */
export async function createBackup(
  creds: WpCredsForBackup,
  websiteId: string,
  contentId: number,
  type: "page" | "post"
): Promise<string> {
  const detail = await getContentDetail(creds, contentId, type);
  const db = getDb();
  const id = randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO content_backups (id, website_id, content_id, original_content_raw, original_featured_media, created_at, restored_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL)`
  ).run(id, websiteId, contentId, detail.rawContent, detail.featuredMedia, now);

  return id;
}

export function listBackupsForContent(websiteId: string, contentId: number) {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM content_backups WHERE website_id = ? AND content_id = ? ORDER BY created_at DESC`
    )
    .all(websiteId, contentId) as any[];

  return rows.map((row) => ({
    id: row.id,
    websiteId: row.website_id,
    contentId: row.content_id,
    originalContentRaw: row.original_content_raw,
    originalFeaturedMedia: row.original_featured_media,
    createdAt: row.created_at,
    restoredAt: row.restored_at
  }));
}

/** Restores a page/post's content and featured image to a prior backup snapshot. */
export async function rollbackToBackup(
  creds: WpCredsForBackup,
  backupId: string,
  type: "page" | "post"
): Promise<void> {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM content_backups WHERE id = ?`).get(backupId) as any;
  if (!row) throw new Error("Backup not found.");

  await updateContent(creds, row.content_id, type, {
    content: row.original_content_raw,
    featuredMedia: row.original_featured_media ?? 0
  });

  db.prepare(`UPDATE content_backups SET restored_at = ? WHERE id = ?`).run(
    new Date().toISOString(),
    backupId
  );
}

import { ipcMain } from "electron";
import { randomUUID } from "crypto";
import { getDb } from "../db/database";
import {
  setSecret,
  getSecret,
  deleteSecret,
  generateCredentialKey,
  CREDENTIAL_KEYS
} from "../services/credentials";
import { testOpenAiKey } from "../services/openai";
import { testGeminiKey } from "../services/gemini";
import { testWordPressConnection, loadWebsiteContent } from "../services/wordpress";
import {
  IPC,
  type AiProvider,
  type ApiKeyStatus,
  type ApiSettings,
  type DashboardSummary,
  type Website,
  type WpContentItem
} from "../types";

function nowIso(): string {
  return new Date().toISOString();
}

/** Row shapes returned directly from better-sqlite3 (snake_case columns). */
interface WebsiteRow {
  id: string;
  name: string;
  site_url: string;
  username: string;
  credential_key: string;
  default_image_sizes_json: string;
  default_image_format: string;
  default_compression_quality: number;
  default_insertion_rule: string;
  excluded_slugs_json: string;
  brand_style_notes: string;
  connection_status: string;
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
}

function rowToWebsite(row: WebsiteRow): Website {
  return {
    id: row.id,
    name: row.name,
    siteUrl: row.site_url,
    username: row.username,
    credentialKey: row.credential_key,
    defaultImageSizes: JSON.parse(row.default_image_sizes_json),
    defaultImageFormat: row.default_image_format as Website["defaultImageFormat"],
    defaultCompressionQuality: row.default_compression_quality,
    defaultInsertionRule: row.default_insertion_rule as Website["defaultInsertionRule"],
    excludedSlugs: JSON.parse(row.excluded_slugs_json),
    brandStyleNotes: row.brand_style_notes,
    connectionStatus: row.connection_status as Website["connectionStatus"],
    lastCheckedAt: row.last_checked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

const DEFAULT_IMAGE_SIZES = {
  featured: "1600x900",
  hero: "1920x1080",
  section: "1200x800",
  inline: "1000x667",
  ctaBackground: "1600x700",
  blogCard: "800x600"
};

export function registerIpcHandlers(): void {
  // ---------- API Settings ----------

  ipcMain.handle(IPC.getApiSettings, (): ApiSettings => {
    const db = getDb();
    const row = db.prepare("SELECT * FROM api_settings WHERE id = 1").get() as any;
    return {
      defaultProvider: row.default_provider,
      openaiModel: row.openai_model,
      geminiModel: row.gemini_model,
      requestTimeoutMs: row.request_timeout_ms,
      maxRetries: row.max_retries,
      rateLimitPerMinute: row.rate_limit_per_minute
    };
  });

  ipcMain.handle(IPC.setApiSettings, (_evt, settings: ApiSettings) => {
    const db = getDb();
    db.prepare(
      `UPDATE api_settings SET default_provider = ?, openai_model = ?, gemini_model = ?,
       request_timeout_ms = ?, max_retries = ?, rate_limit_per_minute = ? WHERE id = 1`
    ).run(
      settings.defaultProvider,
      settings.openaiModel,
      settings.geminiModel,
      settings.requestTimeoutMs,
      settings.maxRetries,
      settings.rateLimitPerMinute
    );
    return { ok: true };
  });

  ipcMain.handle(
    IPC.saveApiKey,
    async (_evt, args: { provider: AiProvider; apiKey: string }) => {
      const account =
        args.provider === "openai" ? CREDENTIAL_KEYS.openaiApiKey : CREDENTIAL_KEYS.geminiApiKey;
      await setSecret(account, args.apiKey);

      const db = getDb();
      db.prepare(
        `UPDATE api_key_status SET configured = 1 WHERE provider = ?`
      ).run(args.provider);

      return { ok: true };
    }
  );

  ipcMain.handle(IPC.getApiKeyStatus, (): { openai: ApiKeyStatus; gemini: ApiKeyStatus } => {
    const db = getDb();
    const rows = db.prepare("SELECT * FROM api_key_status").all() as any[];
    const byProvider: Record<string, ApiKeyStatus> = {};
    for (const row of rows) {
      byProvider[row.provider] = {
        provider: row.provider,
        configured: Boolean(row.configured),
        lastTestedAt: row.last_tested_at,
        lastTestResult: row.last_test_result,
        lastTestMessage: row.last_test_message
      };
    }
    return {
      openai:
        byProvider["openai"] ??
        { provider: "openai", configured: false, lastTestedAt: null, lastTestResult: null, lastTestMessage: null },
      gemini:
        byProvider["gemini"] ??
        { provider: "gemini", configured: false, lastTestedAt: null, lastTestResult: null, lastTestMessage: null }
    };
  });

  ipcMain.handle(IPC.testApiKey, async (_evt, args: { provider: AiProvider }) => {
    const account =
      args.provider === "openai" ? CREDENTIAL_KEYS.openaiApiKey : CREDENTIAL_KEYS.geminiApiKey;
    const apiKey = await getSecret(account);

    if (!apiKey) {
      return { success: false, message: "No API key saved for this provider yet." };
    }

    const result =
      args.provider === "openai" ? await testOpenAiKey(apiKey) : await testGeminiKey(apiKey);

    const db = getDb();
    db.prepare(
      `UPDATE api_key_status SET last_tested_at = ?, last_test_result = ?, last_test_message = ? WHERE provider = ?`
    ).run(nowIso(), result.success ? "success" : "error", result.message, args.provider);

    return result;
  });

  // ---------- Website Manager ----------

  ipcMain.handle(IPC.listWebsites, (): Website[] => {
    const db = getDb();
    const rows = db.prepare("SELECT * FROM websites ORDER BY created_at DESC").all() as WebsiteRow[];
    return rows.map(rowToWebsite);
  });

  ipcMain.handle(
    IPC.addWebsite,
    async (
      _evt,
      args: { name: string; siteUrl: string; username: string; applicationPassword: string }
    ): Promise<Website> => {
      const db = getDb();
      const id = randomUUID();
      const credentialKey = generateCredentialKey("wp-site");

      await setSecret(credentialKey, args.applicationPassword);

      const timestamp = nowIso();
      db.prepare(
        `INSERT INTO websites
         (id, name, site_url, username, credential_key, default_image_sizes_json,
          default_image_format, default_compression_quality, default_insertion_rule,
          excluded_slugs_json, brand_style_notes, connection_status, last_checked_at,
          created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'webp', 82, 'after_first_h2', '[]', '', 'untested', NULL, ?, ?)`
      ).run(
        id,
        args.name,
        args.siteUrl,
        args.username,
        credentialKey,
        JSON.stringify(DEFAULT_IMAGE_SIZES),
        timestamp,
        timestamp
      );

      const row = db.prepare("SELECT * FROM websites WHERE id = ?").get(id) as WebsiteRow;
      return rowToWebsite(row);
    }
  );

  ipcMain.handle(
    IPC.updateWebsite,
    (_evt, args: { id: string; patch: Partial<Website> }) => {
      const db = getDb();
      const existing = db.prepare("SELECT * FROM websites WHERE id = ?").get(args.id) as
        | WebsiteRow
        | undefined;
      if (!existing) throw new Error("Website not found");

      const merged: WebsiteRow = {
        ...existing,
        name: args.patch.name ?? existing.name,
        site_url: args.patch.siteUrl ?? existing.site_url,
        username: args.patch.username ?? existing.username,
        default_image_sizes_json: args.patch.defaultImageSizes
          ? JSON.stringify(args.patch.defaultImageSizes)
          : existing.default_image_sizes_json,
        default_image_format: args.patch.defaultImageFormat ?? existing.default_image_format,
        default_compression_quality:
          args.patch.defaultCompressionQuality ?? existing.default_compression_quality,
        default_insertion_rule: args.patch.defaultInsertionRule ?? existing.default_insertion_rule,
        excluded_slugs_json: args.patch.excludedSlugs
          ? JSON.stringify(args.patch.excludedSlugs)
          : existing.excluded_slugs_json,
        brand_style_notes: args.patch.brandStyleNotes ?? existing.brand_style_notes,
        updated_at: nowIso()
      };

      db.prepare(
        `UPDATE websites SET name = ?, site_url = ?, username = ?, default_image_sizes_json = ?,
         default_image_format = ?, default_compression_quality = ?, default_insertion_rule = ?,
         excluded_slugs_json = ?, brand_style_notes = ?, updated_at = ? WHERE id = ?`
      ).run(
        merged.name,
        merged.site_url,
        merged.username,
        merged.default_image_sizes_json,
        merged.default_image_format,
        merged.default_compression_quality,
        merged.default_insertion_rule,
        merged.excluded_slugs_json,
        merged.brand_style_notes,
        merged.updated_at,
        args.id
      );

      return rowToWebsite(db.prepare("SELECT * FROM websites WHERE id = ?").get(args.id) as WebsiteRow);
    }
  );

  ipcMain.handle(IPC.deleteWebsite, async (_evt, args: { id: string }) => {
    const db = getDb();
    const row = db.prepare("SELECT * FROM websites WHERE id = ?").get(args.id) as
      | WebsiteRow
      | undefined;
    if (row) {
      await deleteSecret(row.credential_key);
      db.prepare("DELETE FROM websites WHERE id = ?").run(args.id);
    }
    return { ok: true };
  });

  ipcMain.handle(IPC.testWebsiteConnection, async (_evt, args: { id: string }) => {
    const db = getDb();
    const row = db.prepare("SELECT * FROM websites WHERE id = ?").get(args.id) as
      | WebsiteRow
      | undefined;
    if (!row) throw new Error("Website not found");

    db.prepare("UPDATE websites SET connection_status = 'checking' WHERE id = ?").run(args.id);

    const applicationPassword = await getSecret(row.credential_key);
    if (!applicationPassword) {
      db.prepare("UPDATE websites SET connection_status = 'error' WHERE id = ?").run(args.id);
      return {
        ok: false,
        steps: {
          restApiReachable: false,
          authenticationValid: false,
          canReadContent: false,
          canUploadMedia: false,
          canUpdateContent: false
        },
        errors: ["No stored application password found for this site. Try re-adding the website."]
      };
    }

    const result = await testWordPressConnection({
      siteUrl: row.site_url,
      username: row.username,
      applicationPassword
    });

    db.prepare(
      "UPDATE websites SET connection_status = ?, last_checked_at = ? WHERE id = ?"
    ).run(result.ok ? "connected" : "error", nowIso(), args.id);

    return result;
  });

  ipcMain.handle(IPC.loadWebsiteContent, async (_evt, args: { id: string }) => {
    const db = getDb();
    const row = db.prepare("SELECT * FROM websites WHERE id = ?").get(args.id) as
      | WebsiteRow
      | undefined;
    if (!row) throw new Error("Website not found");

    const applicationPassword = await getSecret(row.credential_key);
    if (!applicationPassword) {
      throw new Error("No stored application password found for this site.");
    }

    const items = await loadWebsiteContent({
      siteUrl: row.site_url,
      username: row.username,
      applicationPassword
    });

    const insert = db.prepare(
      `INSERT INTO wp_content
       (id, website_id, type, title, slug, url, status, modified_at, featured_image_id,
        existing_image_count, categories_json, tags_json, seo_title, seo_meta, synced_at)
       VALUES (@id, @websiteId, @type, @title, @slug, @url, @status, @modifiedAt, @featuredImageId,
        @existingImageCount, @categoriesJson, @tagsJson, @seoTitle, @seoMeta, @syncedAt)
       ON CONFLICT(id, website_id) DO UPDATE SET
         title = excluded.title, slug = excluded.slug, url = excluded.url, status = excluded.status,
         modified_at = excluded.modified_at, featured_image_id = excluded.featured_image_id,
         seo_title = excluded.seo_title, seo_meta = excluded.seo_meta, synced_at = excluded.synced_at`
    );

    const syncedAt = nowIso();
    const insertMany = db.transaction((rows: typeof items) => {
      for (const item of rows) {
        insert.run({
          id: item.id,
          websiteId: args.id,
          type: item.type,
          title: item.title,
          slug: item.slug,
          url: item.url,
          status: item.status,
          modifiedAt: item.modifiedAt,
          featuredImageId: item.featuredImageId,
          existingImageCount: item.existingImageCount,
          categoriesJson: JSON.stringify(item.categories),
          tagsJson: JSON.stringify(item.tags),
          seoTitle: item.seoTitle,
          seoMeta: item.seoMeta,
          syncedAt
        });
      }
    });
    insertMany(items);

    return { count: items.length };
  });

  // ---------- Content ----------

  ipcMain.handle(IPC.listContent, (_evt, args: { websiteId: string }): WpContentItem[] => {
    const db = getDb();
    const rows = db
      .prepare("SELECT * FROM wp_content WHERE website_id = ? ORDER BY modified_at DESC")
      .all(args.websiteId) as any[];

    return rows.map((row) => ({
      id: row.id,
      websiteId: row.website_id,
      type: row.type,
      title: row.title,
      slug: row.slug,
      url: row.url,
      status: row.status,
      modifiedAt: row.modified_at,
      featuredImageId: row.featured_image_id,
      existingImageCount: row.existing_image_count,
      categories: JSON.parse(row.categories_json),
      tags: JSON.parse(row.tags_json),
      seoTitle: row.seo_title,
      seoMeta: row.seo_meta
    }));
  });

  // ---------- Dashboard ----------

  ipcMain.handle(IPC.getDashboardSummary, async (): Promise<DashboardSummary> => {
    const db = getDb();
    const totalWebsites = (db.prepare("SELECT COUNT(*) as c FROM websites").get() as any).c;
    const totalContentLoaded = (
      db.prepare("SELECT COUNT(*) as c FROM wp_content").get() as any
    ).c;
    const pendingJobs = (
      db.prepare("SELECT COUNT(*) as c FROM jobs WHERE status IN ('pending','analyzing','generating','processing','uploading','updating')").get() as any
    ).c;
    const completedJobs = (
      db.prepare("SELECT COUNT(*) as c FROM jobs WHERE status = 'completed'").get() as any
    ).c;
    const failedJobs = (
      db.prepare("SELECT COUNT(*) as c FROM jobs WHERE status = 'failed'").get() as any
    ).c;

    const statusRows = db.prepare("SELECT * FROM api_key_status").all() as any[];
    const byProvider: Record<string, ApiKeyStatus> = {};
    for (const row of statusRows) {
      byProvider[row.provider] = {
        provider: row.provider,
        configured: Boolean(row.configured),
        lastTestedAt: row.last_tested_at,
        lastTestResult: row.last_test_result,
        lastTestMessage: row.last_test_message
      };
    }

    return {
      totalWebsites,
      totalContentLoaded,
      pendingJobs,
      completedJobs,
      failedJobs,
      openaiStatus:
        byProvider["openai"] ??
        { provider: "openai", configured: false, lastTestedAt: null, lastTestResult: null, lastTestMessage: null },
      geminiStatus:
        byProvider["gemini"] ??
        { provider: "gemini", configured: false, lastTestedAt: null, lastTestResult: null, lastTestMessage: null }
    };
  });
}

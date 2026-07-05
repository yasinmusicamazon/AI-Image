-- WP AI Image Publisher — SQLite schema
-- Notes:
--  * No API keys or WordPress application passwords are ever stored here.
--    Secrets live exclusively in the OS keychain (see services/credentials.ts).
--    This DB only stores a `credential_key` reference string.
--  * Timestamps are stored as ISO-8601 text (UTC) for portability.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS websites (
  id                          TEXT PRIMARY KEY,
  name                        TEXT NOT NULL,
  site_url                    TEXT NOT NULL,
  username                    TEXT NOT NULL,
  credential_key              TEXT NOT NULL UNIQUE, -- keytar account name
  default_image_sizes_json    TEXT NOT NULL,          -- JSON blob, see types.ts
  default_image_format        TEXT NOT NULL DEFAULT 'webp',
  default_compression_quality INTEGER NOT NULL DEFAULT 82,
  default_insertion_rule      TEXT NOT NULL DEFAULT 'after_first_h2',
  excluded_slugs_json         TEXT NOT NULL DEFAULT '[]',
  brand_style_notes           TEXT NOT NULL DEFAULT '',
  connection_status           TEXT NOT NULL DEFAULT 'untested',
  last_checked_at             TEXT,
  created_at                  TEXT NOT NULL,
  updated_at                  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS wp_content (
  id                    INTEGER NOT NULL,        -- WordPress post/page ID
  website_id            TEXT NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  type                  TEXT NOT NULL,            -- 'page' | 'post'
  title                 TEXT NOT NULL,
  slug                  TEXT NOT NULL,
  url                   TEXT NOT NULL,
  status                TEXT NOT NULL,
  modified_at           TEXT NOT NULL,
  featured_image_id     INTEGER,
  existing_image_count  INTEGER,
  categories_json       TEXT NOT NULL DEFAULT '[]',
  tags_json             TEXT NOT NULL DEFAULT '[]',
  seo_title             TEXT,
  seo_meta              TEXT,
  synced_at             TEXT NOT NULL,
  PRIMARY KEY (id, website_id)
);

CREATE INDEX IF NOT EXISTS idx_wp_content_website ON wp_content(website_id);
CREATE INDEX IF NOT EXISTS idx_wp_content_status ON wp_content(status);

CREATE TABLE IF NOT EXISTS api_settings (
  id                     INTEGER PRIMARY KEY CHECK (id = 1), -- singleton row
  default_provider       TEXT NOT NULL DEFAULT 'manual',
  openai_model           TEXT NOT NULL DEFAULT 'gpt-image-1',
  gemini_model           TEXT NOT NULL DEFAULT 'gemini-2.5-flash-image',
  request_timeout_ms     INTEGER NOT NULL DEFAULT 60000,
  max_retries            INTEGER NOT NULL DEFAULT 2,
  rate_limit_per_minute  INTEGER NOT NULL DEFAULT 20
);

CREATE TABLE IF NOT EXISTS api_key_status (
  provider            TEXT PRIMARY KEY, -- 'openai' | 'gemini'
  configured          INTEGER NOT NULL DEFAULT 0,
  last_tested_at      TEXT,
  last_test_result    TEXT, -- 'success' | 'error'
  last_test_message   TEXT
);

-- Generated images: one row per planned/generated image for a content item.
CREATE TABLE IF NOT EXISTS generated_images (
  id                    TEXT PRIMARY KEY,
  website_id            TEXT NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  content_id            INTEGER NOT NULL,
  image_type            TEXT NOT NULL, -- featured_image | hero_image | section_image | cta_image | infographic
  purpose               TEXT NOT NULL DEFAULT '',
  prompt                TEXT NOT NULL,
  file_name             TEXT NOT NULL,
  alt_text              TEXT NOT NULL DEFAULT '',
  caption               TEXT NOT NULL DEFAULT '',
  description           TEXT NOT NULL DEFAULT '',
  placement             TEXT NOT NULL DEFAULT 'manual_only',
  target_size           TEXT NOT NULL DEFAULT '1200x800',
  provider              TEXT, -- 'openai' | 'gemini', set once generated
  status                TEXT NOT NULL DEFAULT 'planned', -- planned|generating|generated|watermark_flagged|approved|skipped|processed|uploaded|inserted|failed
  local_path            TEXT,
  processed_path        TEXT,
  original_file_size    INTEGER,
  processed_file_size   INTEGER,
  watermark_flag        INTEGER NOT NULL DEFAULT 0,
  watermark_reason      TEXT,
  wp_media_id           INTEGER,
  wp_media_url          TEXT,
  error_message         TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_generated_images_content ON generated_images(website_id, content_id);

-- Backups of original content, taken before any WordPress update, to
-- support "view before/after" and one-click rollback.
CREATE TABLE IF NOT EXISTS content_backups (
  id                      TEXT PRIMARY KEY,
  website_id              TEXT NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  content_id              INTEGER NOT NULL,
  original_content_raw    TEXT NOT NULL,
  original_featured_media INTEGER,
  created_at              TEXT NOT NULL,
  restored_at             TEXT
);

CREATE INDEX IF NOT EXISTS idx_content_backups_content ON content_backups(website_id, content_id);

-- Prompt templates: built-in seeded rows (is_builtin = 1) plus user-created
-- custom templates.
CREATE TABLE IF NOT EXISTS prompt_templates (
  id                   TEXT PRIMARY KEY,
  name                 TEXT NOT NULL,
  image_style          TEXT NOT NULL DEFAULT '',
  things_to_avoid      TEXT NOT NULL DEFAULT '',
  alt_text_rules       TEXT NOT NULL DEFAULT '',
  filename_rules       TEXT NOT NULL DEFAULT '',
  prompt_format        TEXT NOT NULL DEFAULT '',
  default_image_count  INTEGER NOT NULL DEFAULT 2,
  is_builtin           INTEGER NOT NULL DEFAULT 0,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL
);

-- Global settings: singleton row.
CREATE TABLE IF NOT EXISTS global_settings (
  id                          INTEGER PRIMARY KEY CHECK (id = 1),
  default_images_per_page     INTEGER NOT NULL DEFAULT 2,
  default_provider             TEXT NOT NULL DEFAULT 'manual',
  default_image_format        TEXT NOT NULL DEFAULT 'webp',
  default_compression_quality INTEGER NOT NULL DEFAULT 82,
  auto_approve_images         INTEGER NOT NULL DEFAULT 0,
  auto_upload_after_approval  INTEGER NOT NULL DEFAULT 0,
  auto_insert_after_upload    INTEGER NOT NULL DEFAULT 0,
  dry_run_mode                INTEGER NOT NULL DEFAULT 1,
  backup_before_update        INTEGER NOT NULL DEFAULT 1, -- always enforced regardless of this flag
  watermark_detection_enabled INTEGER NOT NULL DEFAULT 1,
  manual_approval_required    INTEGER NOT NULL DEFAULT 1,
  active_template_id          TEXT
);

INSERT OR IGNORE INTO global_settings (id) VALUES (1);

-- Rework of the jobs table: the Phase 1 version was a placeholder shape
-- with no rows ever written to it. CREATE TABLE IF NOT EXISTS is safe to
-- run on every startup; a one-time migration for anyone who already has
-- the old column shape is handled in code (see database.ts) rather than
-- here, since dropping the table on every launch would destroy real job
-- history for everyone after this point.
CREATE TABLE IF NOT EXISTS jobs (
  id             TEXT PRIMARY KEY,
  website_id     TEXT NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  content_id     INTEGER NOT NULL,
  content_title  TEXT NOT NULL DEFAULT '',
  provider       TEXT NOT NULL DEFAULT 'manual',
  status         TEXT NOT NULL DEFAULT 'pending', -- pending|analyzing|generating|processing|uploading|updating|completed|failed|skipped|canceled
  progress       INTEGER NOT NULL DEFAULT 0,
  logs_json      TEXT NOT NULL DEFAULT '[]',
  error_message  TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_website ON jobs(website_id);

INSERT OR IGNORE INTO api_settings (id) VALUES (1);
INSERT OR IGNORE INTO api_key_status (provider, configured) VALUES ('openai', 0);
INSERT OR IGNORE INTO api_key_status (provider, configured) VALUES ('gemini', 0);

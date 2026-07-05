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

-- Job queue table, created now so later phases don't need a migration
-- just to introduce the table shape. Not populated until Phase 6 wiring,
-- but the dashboard can safely COUNT() against it starting Phase 1.
CREATE TABLE IF NOT EXISTS jobs (
  id             TEXT PRIMARY KEY,
  website_id     TEXT NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  content_id     INTEGER NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending',
  stage          TEXT NOT NULL DEFAULT 'pending',
  progress       INTEGER NOT NULL DEFAULT 0,
  error_reason   TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);

INSERT OR IGNORE INTO api_settings (id) VALUES (1);
INSERT OR IGNORE INTO api_key_status (provider, configured) VALUES ('openai', 0);
INSERT OR IGNORE INTO api_key_status (provider, configured) VALUES ('gemini', 0);

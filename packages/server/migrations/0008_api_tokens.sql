-- Site-scoped API tokens for open query API (hashed secrets only)
CREATE TABLE IF NOT EXISTS api_tokens (
  token_id TEXT PRIMARY KEY NOT NULL,
  site_id TEXT NOT NULL,
  name TEXT NOT NULL,
  token_prefix TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_api_tokens_site ON api_tokens(site_id);
CREATE INDEX IF NOT EXISTS idx_api_tokens_prefix ON api_tokens(token_prefix);

-- Conversion funnels (ordered URL/event steps)
CREATE TABLE IF NOT EXISTS funnels (
    funnel_id TEXT PRIMARY KEY NOT NULL,
    site_id TEXT NOT NULL,
    name TEXT NOT NULL,
    -- JSON array of { "type": "url"|"event", "value": string, "mode"?: "exact"|"prefix"|"contains" }
    steps_json TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_funnels_site ON funnels(site_id);

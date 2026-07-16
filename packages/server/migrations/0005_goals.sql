-- Conversion goals (URL match / custom event)
CREATE TABLE IF NOT EXISTS goals (
    goal_id TEXT PRIMARY KEY NOT NULL,
    site_id TEXT NOT NULL,
    name TEXT NOT NULL,
    -- 'url' | 'event'
    goal_type TEXT NOT NULL,
    -- url: path pattern; event: event name
    match_value TEXT NOT NULL,
    -- url only: 'exact' | 'prefix' | 'contains'
    match_mode TEXT NOT NULL DEFAULT 'exact',
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_goals_site ON goals(site_id);
CREATE INDEX IF NOT EXISTS idx_goals_site_enabled ON goals(site_id, enabled);

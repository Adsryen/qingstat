-- Traffic alert rules + evaluation state
CREATE TABLE IF NOT EXISTS alert_rules (
  rule_id TEXT PRIMARY KEY NOT NULL,
  site_id TEXT NOT NULL,
  name TEXT NOT NULL,
  metric TEXT NOT NULL,          -- views | visitors
  condition TEXT NOT NULL,       -- drop_pct | spike_pct | below_abs
  threshold REAL NOT NULL,
  window_interval TEXT NOT NULL DEFAULT '1d',
  webhook_url TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  silence_minutes INTEGER NOT NULL DEFAULT 360,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_alert_rules_site ON alert_rules(site_id);

CREATE TABLE IF NOT EXISTS alert_state (
  rule_id TEXT PRIMARY KEY NOT NULL,
  status TEXT NOT NULL DEFAULT 'ok',  -- ok | firing
  last_evaluated_at TEXT,
  last_fired_at TEXT,
  last_recovered_at TEXT,
  last_value REAL,
  last_baseline REAL,
  last_error TEXT,
  consecutive_breaches INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (rule_id) REFERENCES alert_rules(rule_id) ON DELETE CASCADE
);

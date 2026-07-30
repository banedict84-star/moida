CREATE TABLE IF NOT EXISTS ai_usage_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  run_id TEXT NOT NULL DEFAULT '',
  agent TEXT NOT NULL DEFAULT 'secretary',
  model TEXT NOT NULL,
  operation TEXT NOT NULL DEFAULT 'chat',
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  cached_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  image_count INTEGER NOT NULL DEFAULT 0,
  cost_usd_micros REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_tenant_created
  ON ai_usage_events(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_tenant_model
  ON ai_usage_events(tenant_id, model, created_at DESC);

CREATE TABLE IF NOT EXISTS google_calendar_connections (
  tenant_id TEXT PRIMARY KEY,
  google_email TEXT NOT NULL DEFAULT '',
  calendar_id TEXT NOT NULL DEFAULT 'primary',
  refresh_token_cipher TEXT NOT NULL,
  refresh_token_iv TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_google_calendar_updated
  ON google_calendar_connections(updated_at DESC);


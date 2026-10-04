-- Additive only. No original image bytes or Firebase tokens are persisted.
CREATE TABLE IF NOT EXISTS poster_scene_jobs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','succeeded','failed','cancelled')),
  result_json TEXT,
  error_code TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(tenant_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS poster_scene_jobs_tenant_created ON poster_scene_jobs(tenant_id, created_at);

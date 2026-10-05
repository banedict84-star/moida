CREATE TABLE IF NOT EXISTS secretary_sessions (
 tenant_id TEXT NOT NULL, thread_id TEXT NOT NULL, session_id TEXT,
 active_request_id TEXT, model TEXT NOT NULL, created_at INTEGER NOT NULL,
 PRIMARY KEY (tenant_id, thread_id)
);
CREATE TABLE IF NOT EXISTS secretary_turns (
 tenant_id TEXT NOT NULL, thread_id TEXT NOT NULL, request_id TEXT NOT NULL,
 input_json TEXT NOT NULL, turn_id TEXT, status TEXT NOT NULL,
 baseline_json TEXT NOT NULL DEFAULT '[]', output_text TEXT, error TEXT,
 created_at INTEGER NOT NULL,
 PRIMARY KEY (tenant_id, thread_id, request_id)
);
CREATE TABLE IF NOT EXISTS secretary_calls (
 tenant_id TEXT NOT NULL, thread_id TEXT NOT NULL, request_id TEXT NOT NULL,
 call_id TEXT NOT NULL, turn_id TEXT NOT NULL, name TEXT NOT NULL,
 arguments_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', result_json TEXT,
 PRIMARY KEY (tenant_id, thread_id, request_id, call_id)
);

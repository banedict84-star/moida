// Additive tables initialized through the existing D1 binding.
export const SECRETARY_SCHEMA = [
 "CREATE TABLE IF NOT EXISTS secretary_staff_jobs (tenant_id TEXT NOT NULL,parent_thread TEXT NOT NULL,parent_request TEXT NOT NULL,parent_call TEXT NOT NULL,agent_id TEXT NOT NULL,child_thread TEXT NOT NULL,child_request TEXT NOT NULL,status TEXT NOT NULL,created_at INTEGER NOT NULL,lease_at INTEGER NOT NULL DEFAULT 0,last_step INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(tenant_id,parent_thread,parent_request,parent_call))",

  "CREATE TABLE IF NOT EXISTS secretary_sessions (\n tenant_id TEXT NOT NULL, thread_id TEXT NOT NULL, session_id TEXT,\n active_request_id TEXT, model TEXT NOT NULL, created_at INTEGER NOT NULL,\n PRIMARY KEY (tenant_id, thread_id)\n)",
  "CREATE TABLE IF NOT EXISTS secretary_turns (\n tenant_id TEXT NOT NULL, thread_id TEXT NOT NULL, request_id TEXT NOT NULL,\n input_json TEXT NOT NULL, turn_id TEXT, status TEXT NOT NULL,\n baseline_json TEXT NOT NULL DEFAULT '[]', output_text TEXT, error TEXT,\n created_at INTEGER NOT NULL,\n PRIMARY KEY (tenant_id, thread_id, request_id)\n)",
  "CREATE TABLE IF NOT EXISTS secretary_calls (\n tenant_id TEXT NOT NULL, thread_id TEXT NOT NULL, request_id TEXT NOT NULL,\n call_id TEXT NOT NULL, turn_id TEXT NOT NULL, name TEXT NOT NULL,\n arguments_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', result_json TEXT,\n PRIMARY KEY (tenant_id, thread_id, request_id, call_id)\n)"
];

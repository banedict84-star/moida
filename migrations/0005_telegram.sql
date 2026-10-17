CREATE TABLE IF NOT EXISTS telegram_users (
 user_id TEXT PRIMARY KEY, office_id TEXT, approved INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS telegram_inbox (
 update_id INTEGER PRIMARY KEY, user_id TEXT NOT NULL, chat_id TEXT NOT NULL,
 text TEXT NOT NULL, reply TEXT, state TEXT NOT NULL DEFAULT 'pending',
 attempts INTEGER NOT NULL DEFAULT 0, lease_until INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS telegram_pending ON telegram_inbox(state, lease_until);
CREATE TABLE IF NOT EXISTS telegram_notes (
 update_id INTEGER PRIMARY KEY, office_id TEXT NOT NULL, user_id TEXT NOT NULL,
 text TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS telegram_office_notes ON telegram_notes(office_id, created_at);

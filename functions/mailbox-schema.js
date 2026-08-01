const MAILBOX_MIGRATION_ID = 'mailbox-friend-chat-v1';
const schemaPromises = new WeakMap();

async function run(db, sql, params = []) {
  return db.prepare(sql).bind(...params).run();
}

async function initialize(db) {
  await run(db, `CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    applied_at INTEGER NOT NULL
  )`);

  await run(db, `CREATE TABLE IF NOT EXISTS mailbox_visitors (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    preferred_name TEXT,
    passphrase_hash TEXT NOT NULL UNIQUE,
    passphrase_lookup TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_seen_at TEXT,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    allow_memory INTEGER NOT NULL DEFAULT 1 CHECK (allow_memory IN (0, 1)),
    privacy_level TEXT NOT NULL DEFAULT 'sealed' CHECK (privacy_level = 'sealed'),
    note_for_owner TEXT
  )`);

  await run(db, `CREATE TABLE IF NOT EXISTS mailbox_patrol_batches (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'processing'
      CHECK (status IN ('processing', 'completed')),
    visitor_count INTEGER NOT NULL DEFAULT 0,
    message_count INTEGER NOT NULL DEFAULT 0,
    reply_count INTEGER NOT NULL DEFAULT 0,
    failure_count INTEGER NOT NULL DEFAULT 0,
    needs_owner_attention_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    completed_at TEXT
  )`);

  await run(db, `CREATE TABLE IF NOT EXISTS mailbox_messages (
    id TEXT PRIMARY KEY,
    visitor_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('visitor', 'myri', 'system')),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'sent'
      CHECK (status IN ('sent', 'waiting_for_myri', 'replied', 'hidden', 'error')),
    reply_batch_id TEXT,
    is_visible_to_owner INTEGER NOT NULL DEFAULT 0
      CHECK (is_visible_to_owner IN (0, 1)),
    safety_flag TEXT,
    FOREIGN KEY(visitor_id) REFERENCES mailbox_visitors(id),
    FOREIGN KEY(reply_batch_id) REFERENCES mailbox_patrol_batches(id)
  )`);

  await run(db, `CREATE TABLE IF NOT EXISTS mailbox_reply_queue (
    id TEXT PRIMARY KEY,
    visitor_id TEXT NOT NULL UNIQUE,
    latest_message_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'processing', 'replied', 'needs_owner_attention', 'error')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    processed_at TEXT,
    processed_by TEXT,
    error_note TEXT,
    needs_owner_attention INTEGER NOT NULL DEFAULT 0
      CHECK (needs_owner_attention IN (0, 1)),
    owner_attention_reason TEXT,
    processing_batch_id TEXT,
    FOREIGN KEY(visitor_id) REFERENCES mailbox_visitors(id),
    FOREIGN KEY(latest_message_id) REFERENCES mailbox_messages(id),
    FOREIGN KEY(processing_batch_id) REFERENCES mailbox_patrol_batches(id)
  )`);

  await run(db, `CREATE TABLE IF NOT EXISTS visitor_notebook_entries (
    id TEXT PRIMARY KEY,
    visitor_id TEXT NOT NULL,
    content TEXT NOT NULL,
    source_message_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    confidence REAL NOT NULL DEFAULT 1 CHECK (confidence >= 0 AND confidence <= 1),
    visibility TEXT NOT NULL DEFAULT 'myri_only'
      CHECK (visibility IN ('myri_only', 'visitor_visible')),
    archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
    FOREIGN KEY(visitor_id) REFERENCES mailbox_visitors(id),
    FOREIGN KEY(source_message_id) REFERENCES mailbox_messages(id)
  )`);

  await run(db, `CREATE TABLE IF NOT EXISTS mailbox_thinking_notes (
    id TEXT PRIMARY KEY,
    visitor_id TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    source_message_id TEXT,
    archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
    FOREIGN KEY(visitor_id) REFERENCES mailbox_visitors(id),
    FOREIGN KEY(source_message_id) REFERENCES mailbox_messages(id)
  )`);

  await run(db, `CREATE INDEX IF NOT EXISTS idx_mailbox_messages_visitor_created
    ON mailbox_messages(visitor_id, created_at)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_mailbox_messages_waiting
    ON mailbox_messages(visitor_id, status, created_at)`);
  await run(db, `CREATE UNIQUE INDEX IF NOT EXISTS idx_mailbox_myri_reply_batch
    ON mailbox_messages(visitor_id, reply_batch_id)
    WHERE role = 'myri' AND reply_batch_id IS NOT NULL`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_mailbox_queue_status_updated
    ON mailbox_reply_queue(status, updated_at)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_mailbox_notebook_visitor_active
    ON visitor_notebook_entries(visitor_id, archived, updated_at)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_mailbox_thinking_visitor_active
    ON mailbox_thinking_notes(visitor_id, archived, updated_at)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_mailbox_patrol_completed
    ON mailbox_patrol_batches(completed_at)`);

  await run(db, 'INSERT OR IGNORE INTO schema_migrations (id, applied_at) VALUES (?, ?)', [
    MAILBOX_MIGRATION_ID,
    Date.now(),
  ]);
}

export async function ensureMailboxSchema(db) {
  let ready = schemaPromises.get(db);
  if (!ready) {
    ready = initialize(db);
    schemaPromises.set(db, ready);
  }
  try {
    await ready;
  } catch (error) {
    schemaPromises.delete(db);
    throw error;
  }
}

export const mailboxMigrationIds = Object.freeze([MAILBOX_MIGRATION_ID]);

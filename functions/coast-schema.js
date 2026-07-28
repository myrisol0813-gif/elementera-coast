const MIGRATION_ID = 'mcp-porch-v1';
const schemaPromises = new WeakMap();

async function run(db, sql, params = []) {
  return db.prepare(sql).bind(...params).run();
}

async function initialize(db) {
  await run(db, `CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    applied_at INTEGER NOT NULL
  )`);
  await run(db, `CREATE TABLE IF NOT EXISTS coast_soil_entries (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    actor TEXT NOT NULL,
    surface TEXT NOT NULL,
    model_label TEXT,
    model_nickname TEXT,
    symbol TEXT NOT NULL,
    display_author TEXT NOT NULL,
    usage_json TEXT,
    source_conversation_id TEXT,
    source_turn_id TEXT,
    tool_call_id TEXT UNIQUE,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
  await run(db, `CREATE TABLE IF NOT EXISTS coast_radio_messages (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL DEFAULT 'radio',
    text TEXT NOT NULL,
    actor TEXT NOT NULL,
    surface TEXT NOT NULL,
    model_label TEXT,
    model_nickname TEXT,
    symbol TEXT NOT NULL,
    display_author TEXT NOT NULL,
    usage_json TEXT,
    source_conversation_id TEXT,
    source_turn_id TEXT,
    tool_call_id TEXT UNIQUE,
    created_at INTEGER NOT NULL
  )`);
  await run(db, `CREATE TABLE IF NOT EXISTS coast_lighthouse_letters (
    id TEXT PRIMARY KEY,
    subject TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL,
    actor TEXT NOT NULL,
    surface TEXT NOT NULL,
    model_label TEXT,
    model_nickname TEXT,
    symbol TEXT NOT NULL,
    display_author TEXT NOT NULL,
    usage_json TEXT,
    source_conversation_id TEXT,
    source_turn_id TEXT,
    tool_call_id TEXT UNIQUE,
    read_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_coast_soils_surface_created
    ON coast_soil_entries(surface, created_at DESC)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_coast_radio_room_created
    ON coast_radio_messages(room_id, created_at DESC)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_coast_lighthouse_created
    ON coast_lighthouse_letters(created_at DESC)`);
  await run(db, 'INSERT OR IGNORE INTO schema_migrations (id, applied_at) VALUES (?, ?)', [
    MIGRATION_ID,
    Date.now(),
  ]);
}

export async function ensureCoastSchema(db) {
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

export const coastMigrationIds = Object.freeze([MIGRATION_ID]);

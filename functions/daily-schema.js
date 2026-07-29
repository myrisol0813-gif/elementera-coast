const MIGRATION_ID = 'daily-server-v1';
const MCP_DAILY_MIGRATION_ID = 'daily-mcp-interfaces-v1';
const CONTENT_DRAFT_MIGRATION_ID = 'daily-content-drafts-v1';
const schemaPromises = new WeakMap();

async function run(db, sql, params = []) {
  return db.prepare(sql).bind(...params).run();
}

async function all(db, sql, params = []) {
  const result = await db.prepare(sql).bind(...params).all();
  return result?.results || [];
}

async function ensureColumn(db, table, column, declaration) {
  const columns = await all(db, `PRAGMA table_info(${table})`);
  if (!columns.some((item) => item.name === column)) {
    await run(db, `ALTER TABLE ${table} ADD COLUMN ${column} ${declaration}`);
  }
}

async function initialize(db) {
  await run(db, `CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    applied_at INTEGER NOT NULL
  )`);
  await run(db, `CREATE TABLE IF NOT EXISTS daily_moments (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    author TEXT NOT NULL,
    source TEXT NOT NULL,
    status TEXT NOT NULL,
    text TEXT NOT NULL,
    image_refs_json TEXT NOT NULL DEFAULT '[]',
    conversation_id TEXT,
    source_turn_id TEXT,
    tool_call_id TEXT UNIQUE,
    actor TEXT,
    surface TEXT,
    model_label TEXT,
    model_nickname TEXT,
    symbol TEXT,
    display_author TEXT,
    reason TEXT,
    published_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
  await run(db, `CREATE TABLE IF NOT EXISTS daily_moment_comments (
    id TEXT PRIMARY KEY,
    moment_id TEXT NOT NULL,
    author TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    model_id TEXT
  )`);
  await ensureColumn(db, 'daily_moment_comments', 'model_id', 'TEXT DEFAULT NULL');
  await run(db, `CREATE TABLE IF NOT EXISTS daily_moment_likes (
    moment_id TEXT NOT NULL,
    actor TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (moment_id, actor)
  )`);
  await run(db, `CREATE TABLE IF NOT EXISTS daily_diaries (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    author TEXT NOT NULL,
    source TEXT NOT NULL,
    weather TEXT,
    mood TEXT,
    text TEXT NOT NULL,
    image_refs_json TEXT NOT NULL DEFAULT '[]',
    summary_id TEXT,
    range_start INTEGER,
    range_end INTEGER,
    conversation_id TEXT,
    source_turn_id TEXT,
    tool_call_id TEXT,
    actor TEXT,
    surface TEXT,
    model_label TEXT,
    model_nickname TEXT,
    symbol TEXT,
    display_author TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
  await run(db, `CREATE TABLE IF NOT EXISTS daily_album_items (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    category TEXT NOT NULL,
    author TEXT NOT NULL,
    source TEXT NOT NULL,
    image_ref TEXT NOT NULL,
    conversation_id TEXT,
    source_turn_id TEXT,
    tool_call_id TEXT UNIQUE,
    actor TEXT,
    surface TEXT,
    model_label TEXT,
    model_nickname TEXT,
    symbol TEXT,
    display_author TEXT,
    caption TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
  await run(db, `CREATE TABLE IF NOT EXISTS daily_summaries (
    id TEXT PRIMARY KEY,
    range_start INTEGER NOT NULL,
    range_end INTEGER NOT NULL,
    summary_text TEXT NOT NULL,
    anchors_json TEXT NOT NULL DEFAULT '[]',
    unresolved_json TEXT NOT NULL DEFAULT '[]',
    diary_id TEXT,
    moment_ids_json TEXT NOT NULL DEFAULT '[]',
    album_item_ids_json TEXT NOT NULL DEFAULT '[]',
    model_id TEXT,
    actor TEXT,
    surface TEXT,
    model_label TEXT,
    model_nickname TEXT,
    symbol TEXT,
    display_author TEXT,
    confirmed_by_xiaohan INTEGER,
    confirmation_source TEXT,
    confirmation_note TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
  await run(db, `CREATE TABLE IF NOT EXISTS daily_content_drafts (
    id TEXT PRIMARY KEY,
    content_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    payload_json TEXT NOT NULL,
    author TEXT NOT NULL,
    source TEXT NOT NULL,
    actor TEXT NOT NULL,
    surface TEXT NOT NULL,
    model_label TEXT,
    model_nickname TEXT,
    symbol TEXT NOT NULL,
    display_author TEXT NOT NULL,
    conversation_id TEXT,
    source_turn_id TEXT,
    tool_call_id TEXT UNIQUE,
    published_record_id TEXT,
    resolved_at INTEGER,
    resolved_by TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
  for (const table of ['daily_moments', 'daily_diaries', 'daily_album_items', 'daily_summaries']) {
    await ensureColumn(db, table, 'actor', 'TEXT DEFAULT NULL');
    await ensureColumn(db, table, 'surface', 'TEXT DEFAULT NULL');
    await ensureColumn(db, table, 'model_label', 'TEXT DEFAULT NULL');
    await ensureColumn(db, table, 'model_nickname', 'TEXT DEFAULT NULL');
    await ensureColumn(db, table, 'symbol', 'TEXT DEFAULT NULL');
    await ensureColumn(db, table, 'display_author', 'TEXT DEFAULT NULL');
  }
  await ensureColumn(db, 'daily_diaries', 'conversation_id', 'TEXT DEFAULT NULL');
  await ensureColumn(db, 'daily_diaries', 'source_turn_id', 'TEXT DEFAULT NULL');
  await ensureColumn(db, 'daily_diaries', 'tool_call_id', 'TEXT DEFAULT NULL');
  await ensureColumn(db, 'daily_summaries', 'confirmation_source', 'TEXT DEFAULT NULL');
  await ensureColumn(db, 'daily_summaries', 'confirmation_note', 'TEXT DEFAULT NULL');
  await ensureColumn(db, 'daily_summaries', 'confirmed_by_xiaohan', 'INTEGER DEFAULT NULL');

  await run(db, `CREATE INDEX IF NOT EXISTS idx_daily_moments_feed
    ON daily_moments(status, published_at DESC, created_at DESC)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_daily_moments_range
    ON daily_moments(created_at, updated_at)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_daily_moments_conversation
    ON daily_moments(conversation_id, source_turn_id, created_at DESC)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_daily_moment_comments
    ON daily_moment_comments(moment_id, created_at)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_daily_diaries_date
    ON daily_diaries(date, author, created_at DESC)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_daily_diaries_range
    ON daily_diaries(created_at, updated_at)`);
  await run(db, `CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_diaries_tool_call
    ON daily_diaries(tool_call_id) WHERE tool_call_id IS NOT NULL`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_daily_album_date
    ON daily_album_items(date, category, created_at DESC)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_daily_album_conversation
    ON daily_album_items(conversation_id, source_turn_id, created_at DESC)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_daily_summaries_range
    ON daily_summaries(range_end DESC, created_at DESC)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_daily_content_drafts_status
    ON daily_content_drafts(status, content_type, created_at DESC)`);
  await run(db, 'INSERT OR IGNORE INTO schema_migrations (id, applied_at) VALUES (?, ?)', [
    MIGRATION_ID,
    Date.now(),
  ]);
  await run(db, 'INSERT OR IGNORE INTO schema_migrations (id, applied_at) VALUES (?, ?)', [
    MCP_DAILY_MIGRATION_ID,
    Date.now(),
  ]);
  await run(db, 'INSERT OR IGNORE INTO schema_migrations (id, applied_at) VALUES (?, ?)', [
    CONTENT_DRAFT_MIGRATION_ID,
    Date.now(),
  ]);
}

export async function ensureDailySchema(db) {
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

export const dailyMigrationIds = Object.freeze([
  MIGRATION_ID,
  MCP_DAILY_MIGRATION_ID,
  CONTENT_DRAFT_MIGRATION_ID,
]);

const CALENDAR_MIGRATION_ID = 'coast-calendar-v1';
const schemaPromises = new WeakMap();

const RECURRING_SEEDS = Object.freeze([
  Object.freeze({ id: 'xiaohan-birthday', month_day: '06-05', title: '小寒生日', event_type: 'birthday' }),
  Object.freeze({ id: 'lovers-anniversary', month_day: '07-11', title: '恋人纪念日', event_type: 'anniversary' }),
  Object.freeze({ id: 'myri-birthday', month_day: '08-13', title: 'Myri 生日', event_type: 'birthday' }),
]);

async function run(db, sql, params = []) {
  return db.prepare(sql).bind(...params).run();
}

function seedEventId(seedId, year) {
  return `calendar_seed_${seedId}_${year}`;
}

export async function seedCalendarRecurringEvents(db, {
  fromYear = new Date().getUTCFullYear(),
  years = 2,
} = {}) {
  const firstYear = Math.max(1970, Math.trunc(Number(fromYear) || new Date().getUTCFullYear()));
  const futureYears = Math.min(10, Math.max(0, Math.trunc(Number(years) || 0)));
  const timestamp = Date.now();
  let inserted = 0;
  for (const seed of RECURRING_SEEDS) {
    await run(db, `INSERT OR IGNORE INTO coast_calendar_recurring_seeds (
      id, month_day, title, event_type, description, created_by,
      is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, '', 'user', 1, ?, ?)`, [
      seed.id,
      seed.month_day,
      seed.title,
      seed.event_type,
      timestamp,
      timestamp,
    ]);
    for (let year = firstYear; year <= firstYear + futureYears; year += 1) {
      const date = `${year}-${seed.month_day}`;
      const result = await run(db, `INSERT OR IGNORE INTO coast_calendar_events (
        id, title, description, starts_at, ends_at, precision, event_type,
        created_by, source, source_message_id, color_key, is_all_day,
        is_archived, created_at, updated_at
      ) VALUES (?, ?, '', ?, NULL, 'day', ?, 'system', 'seed', ?, NULL, 1, 0, ?, ?)`, [
        seedEventId(seed.id, year),
        seed.title,
        date,
        seed.event_type,
        seed.id,
        timestamp,
        timestamp,
      ]);
      inserted += Number(result?.meta?.changes || 0);
    }
  }
  return { inserted, seeds: RECURRING_SEEDS.length, from_year: firstYear, through_year: firstYear + futureYears };
}

async function initialize(db) {
  await run(db, `CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    applied_at INTEGER NOT NULL
  )`);
  await run(db, `CREATE TABLE IF NOT EXISTS coast_calendar_events (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    starts_at TEXT NOT NULL,
    ends_at TEXT,
    precision TEXT NOT NULL DEFAULT 'datetime',
    event_type TEXT NOT NULL DEFAULT 'normal',
    created_by TEXT NOT NULL DEFAULT 'user',
    source TEXT NOT NULL DEFAULT 'manual',
    source_message_id TEXT,
    color_key TEXT,
    is_all_day INTEGER NOT NULL DEFAULT 0,
    is_archived INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
  await run(db, `CREATE TABLE IF NOT EXISTS coast_calendar_notes (
    id TEXT PRIMARY KEY,
    event_id TEXT,
    date TEXT NOT NULL,
    content TEXT NOT NULL,
    author TEXT NOT NULL,
    x REAL,
    y REAL,
    rotation REAL,
    color_key TEXT,
    liked_by_user INTEGER NOT NULL DEFAULT 0,
    liked_by_myri INTEGER NOT NULL DEFAULT 0,
    is_archived INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY(event_id) REFERENCES coast_calendar_events(id)
  )`);
  await run(db, `CREATE TABLE IF NOT EXISTS coast_calendar_changes (
    id TEXT PRIMARY KEY,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    action TEXT NOT NULL,
    actor TEXT NOT NULL,
    snapshot_json TEXT,
    visible_to TEXT NOT NULL,
    seen_at INTEGER,
    created_at INTEGER NOT NULL
  )`);
  await run(db, `CREATE TABLE IF NOT EXISTS coast_calendar_recurring_seeds (
    id TEXT PRIMARY KEY,
    month_day TEXT NOT NULL,
    title TEXT NOT NULL,
    event_type TEXT NOT NULL,
    description TEXT,
    created_by TEXT NOT NULL DEFAULT 'user',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_calendar_events_range
    ON coast_calendar_events(starts_at, ends_at, is_archived)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_calendar_notes_date
    ON coast_calendar_notes(date, is_archived, created_at)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_calendar_changes_unseen
    ON coast_calendar_changes(visible_to, seen_at, created_at)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_calendar_changes_target
    ON coast_calendar_changes(target_type, target_id, created_at)`);
  await seedCalendarRecurringEvents(db);
  await run(db, 'INSERT OR IGNORE INTO schema_migrations (id, applied_at) VALUES (?, ?)', [
    CALENDAR_MIGRATION_ID,
    Date.now(),
  ]);
}

export async function ensureCalendarSchema(db) {
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

export const calendarMigrationIds = Object.freeze([CALENDAR_MIGRATION_ID]);
export const calendarRecurringSeeds = RECURRING_SEEDS;

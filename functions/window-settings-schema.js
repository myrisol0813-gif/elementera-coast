const WINDOW_SETTINGS_MIGRATION_ID = 'coast-window-settings-v1';
const schemaPromises = new WeakMap();

async function initialize(db) {
  const timestamp = Date.now();
  await db.prepare(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    applied_at INTEGER NOT NULL
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS coast_window_settings (
    conversation_id TEXT PRIMARY KEY,
    cross_window_light_recall_enabled INTEGER NOT NULL DEFAULT 0,
    today_coast_reference_enabled INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`).run();
  await db.prepare('INSERT OR IGNORE INTO schema_migrations (id, applied_at) VALUES (?, ?)')
    .bind(WINDOW_SETTINGS_MIGRATION_ID, timestamp).run();
}

export async function ensureWindowSettingsSchema(db) {
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

export const windowSettingsMigrationIds = Object.freeze([WINDOW_SETTINGS_MIGRATION_ID]);

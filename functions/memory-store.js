import { ensureChatSchema, getConversation, sanitizeId } from './chat-store.js';

export const MEMORY_OWNER_ID = 'owner';

const MAX_SOURCE_TEXT = 12000;
const MAX_TITLE = 120;
const MAX_LIFE_CORE = 2000;
const MAX_HINT = 1200;
const MAX_SOIL_TEXT = 4000;
const MAX_HAND_SEEDS = 7;
const POCKET_SOURCE_TYPES = new Set(['message', 'turn', 'selection', 'soil']);
const POCKET_STATUSES = new Set(['pending', 'confirmed', 'discarded', 'stone']);
const schemaPromises = new WeakMap();

export class MemoryStoreError extends Error {
  constructor(type, message, status = 400) {
    super(message);
    this.name = 'MemoryStoreError';
    this.type = type;
    this.status = status;
  }
}

export function hasMemoryDatabase(env) {
  return Boolean(env?.COAST_CHAT_DB && typeof env.COAST_CHAT_DB.prepare === 'function');
}

function clip(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

function bool(value, fallback = false) {
  if (value == null) return fallback;
  return value === true || Number(value) === 1;
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value || '') ?? fallback;
  } catch {
    return fallback;
  }
}

function iso(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? new Date(number).toISOString() : null;
}

async function run(db, sql, params = []) {
  return db.prepare(sql).bind(...params).run();
}

async function first(db, sql, params = []) {
  return db.prepare(sql).bind(...params).first();
}

async function all(db, sql, params = []) {
  const result = await db.prepare(sql).bind(...params).all();
  return result?.results || [];
}

async function initializeMemorySchema(db) {
  await ensureChatSchema(db);
  await run(db, `CREATE TABLE IF NOT EXISTS conversation_soils (
    conversation_id TEXT PRIMARY KEY,
    current_text TEXT NOT NULL DEFAULT '',
    hand_seeds_json TEXT NOT NULL DEFAULT '[]',
    do_not_repeat TEXT NOT NULL DEFAULT '',
    pocket_candidates_json TEXT NOT NULL DEFAULT '[]',
    manual_locked INTEGER NOT NULL DEFAULT 0,
    auto_refresh_enabled INTEGER NOT NULL DEFAULT 1,
    revision INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
  )`);
  await run(db, `CREATE TABLE IF NOT EXISTS memory_pockets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT 'owner',
    conversation_id TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_ref_json TEXT NOT NULL DEFAULT '{}',
    source_text TEXT NOT NULL,
    suggested_title TEXT NOT NULL DEFAULT '',
    suggested_life_core TEXT NOT NULL DEFAULT '',
    suggested_usage_hint TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    resolved_entry_id TEXT DEFAULT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER DEFAULT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
  )`);
  await run(db, 'CREATE INDEX IF NOT EXISTS idx_soils_updated ON conversation_soils(updated_at)');
  await run(db, `CREATE INDEX IF NOT EXISTS idx_pockets_conversation_status
    ON memory_pockets(conversation_id, status, created_at)`);
}

export async function ensureMemorySchema(db) {
  let ready = schemaPromises.get(db);
  if (!ready) {
    ready = initializeMemorySchema(db);
    schemaPromises.set(db, ready);
  }
  try {
    await ready;
  } catch (error) {
    schemaPromises.delete(db);
    throw error;
  }
}

function normalizeHandSeed(value = {}) {
  if (typeof value === 'string') {
    const lifeCore = clip(value, MAX_LIFE_CORE);
    return lifeCore ? { name: clip(lifeCore, MAX_TITLE), life_core: lifeCore, usage_hint: '', avoid_hint: '' } : null;
  }
  const lifeCore = clip(value.life_core ?? value.lifeCore, MAX_LIFE_CORE);
  const name = clip(value.name ?? value.title, MAX_TITLE);
  if (!lifeCore && !name) return null;
  return {
    name: name || clip(lifeCore, MAX_TITLE),
    life_core: lifeCore || name,
    usage_hint: clip(value.usage_hint ?? value.usageHint, MAX_HINT),
    avoid_hint: clip(value.avoid_hint ?? value.avoidHint, MAX_HINT),
  };
}

export function normalizeHandSeeds(value) {
  return (Array.isArray(value) ? value : [])
    .map(normalizeHandSeed)
    .filter(Boolean)
    .slice(0, MAX_HAND_SEEDS);
}

function normalizePocketCandidates(value) {
  return (Array.isArray(value) ? value : [])
    .map((item) => clip(typeof item === 'string' ? item : item?.text ?? item?.life_core ?? item?.name, MAX_LIFE_CORE))
    .filter(Boolean)
    .slice(0, MAX_HAND_SEEDS);
}

function soilFromRow(row) {
  return {
    conversation_id: row.conversation_id,
    current_text: row.current_text || '',
    hand_seeds: normalizeHandSeeds(parseJson(row.hand_seeds_json, [])),
    do_not_repeat: row.do_not_repeat || '',
    pocket_candidates: normalizePocketCandidates(parseJson(row.pocket_candidates_json, [])),
    manual_locked: Number(row.manual_locked || 0) === 1,
    auto_refresh_enabled: Number(row.auto_refresh_enabled ?? 1) === 1,
    revision: Math.max(1, Number(row.revision || 1)),
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  };
}

async function ensureSoilRow(db, conversationId) {
  await getConversation(db, conversationId);
  const timestamp = Date.now();
  await run(db, `INSERT OR IGNORE INTO conversation_soils (
    conversation_id, current_text, hand_seeds_json, do_not_repeat,
    pocket_candidates_json, manual_locked, auto_refresh_enabled, revision, created_at, updated_at
  ) VALUES (?, '', '[]', '', '[]', 0, 1, 1, ?, ?)`, [conversationId, timestamp, timestamp]);
}

export async function readSoil(db, id) {
  await ensureMemorySchema(db);
  const conversationId = sanitizeId(id, 'conversation');
  await ensureSoilRow(db, conversationId);
  return soilFromRow(await first(db, 'SELECT * FROM conversation_soils WHERE conversation_id = ?', [conversationId]));
}

export async function writeSoil(db, id, value = {}, { automatic = false } = {}) {
  await ensureMemorySchema(db);
  const conversationId = sanitizeId(id, 'conversation');
  const current = await readSoil(db, conversationId);
  if (automatic && (current.manual_locked || !current.auto_refresh_enabled)) {
    throw new MemoryStoreError('soil_locked', '思维壤已由小寒手动锁定。', 409);
  }
  const has = (name) => Object.prototype.hasOwnProperty.call(value, name);
  const next = {
    current_text: has('current_text') ? clip(value.current_text, MAX_SOIL_TEXT) : current.current_text,
    hand_seeds: has('hand_seeds') ? normalizeHandSeeds(value.hand_seeds) : current.hand_seeds,
    do_not_repeat: has('do_not_repeat') ? clip(value.do_not_repeat, MAX_SOIL_TEXT) : current.do_not_repeat,
    pocket_candidates: has('pocket_candidates') ? normalizePocketCandidates(value.pocket_candidates) : current.pocket_candidates,
    manual_locked: has('manual_locked') ? bool(value.manual_locked) : !automatic,
    auto_refresh_enabled: has('auto_refresh_enabled') ? bool(value.auto_refresh_enabled) : current.auto_refresh_enabled,
  };
  const timestamp = Date.now();
  await run(db, `UPDATE conversation_soils SET
    current_text = ?, hand_seeds_json = ?, do_not_repeat = ?, pocket_candidates_json = ?,
    manual_locked = ?, auto_refresh_enabled = ?, revision = revision + 1, updated_at = ?
    WHERE conversation_id = ?`, [
    next.current_text,
    JSON.stringify(next.hand_seeds),
    next.do_not_repeat,
    JSON.stringify(next.pocket_candidates),
    next.manual_locked ? 1 : 0,
    next.auto_refresh_enabled ? 1 : 0,
    timestamp,
    conversationId,
  ]);
  return readSoil(db, conversationId);
}

function sourceRef(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const serialized = JSON.stringify(value);
  if (serialized.length > 4000) throw new MemoryStoreError('source_ref_too_large', '落袋来源信息过长。', 413);
  return JSON.parse(serialized);
}

function pocketFromRow(row) {
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    source_type: row.source_type,
    source_ref: sourceRef(parseJson(row.source_ref_json, {})),
    source_text: row.source_text || '',
    suggested_title: row.suggested_title || '',
    suggested_life_core: row.suggested_life_core || '',
    suggested_usage_hint: row.suggested_usage_hint || '',
    status: row.status,
    resolved_entry_id: row.resolved_entry_id || null,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
    deleted_at: iso(row.deleted_at),
  };
}

async function requirePocketRow(db, id) {
  const pocketId = sanitizeId(id, 'pocket');
  const row = await first(db, `SELECT * FROM memory_pockets
    WHERE id = ? AND user_id = ? AND deleted_at IS NULL`, [pocketId, MEMORY_OWNER_ID]);
  if (!row) throw new MemoryStoreError('pocket_not_found', '待确认袋条目不存在。', 404);
  return row;
}

export async function createPocket(db, value = {}) {
  await ensureMemorySchema(db);
  const conversationId = sanitizeId(value.conversation_id, 'conversation');
  await getConversation(db, conversationId);
  const sourceType = String(value.source_type || 'message');
  if (!POCKET_SOURCE_TYPES.has(sourceType)) throw new MemoryStoreError('invalid_source_type', '落袋来源类型无效。');
  const sourceText = clip(value.source_text, MAX_SOURCE_TEXT);
  if (!sourceText) throw new MemoryStoreError('source_text_required', '没有可以落袋的内容。');
  const reference = sourceRef(value.source_ref);
  const id = sanitizeId(crypto.randomUUID(), 'pocket');
  const timestamp = Date.now();
  await run(db, `INSERT INTO memory_pockets (
    id, user_id, conversation_id, source_type, source_ref_json, source_text,
    suggested_title, suggested_life_core, suggested_usage_hint, status,
    resolved_entry_id, created_at, updated_at, deleted_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, '', '', 'pending', NULL, ?, ?, NULL)`, [
    id,
    MEMORY_OWNER_ID,
    conversationId,
    sourceType,
    JSON.stringify(reference),
    sourceText,
    clip(value.suggested_title || sourceText.replace(/\s+/g, ' '), MAX_TITLE),
    timestamp,
    timestamp,
  ]);
  return pocketFromRow(await requirePocketRow(db, id));
}

export async function listPockets(db, { conversation_id: conversationIdValue, status = 'pending' } = {}) {
  await ensureMemorySchema(db);
  const conversationId = sanitizeId(conversationIdValue, 'conversation');
  await getConversation(db, conversationId);
  const pocketStatus = String(status || 'pending');
  if (!POCKET_STATUSES.has(pocketStatus)) throw new MemoryStoreError('invalid_pocket_status', '待确认袋状态无效。');
  const rows = await all(db, `SELECT * FROM memory_pockets
    WHERE user_id = ? AND conversation_id = ? AND status = ? AND deleted_at IS NULL
    ORDER BY created_at DESC`, [MEMORY_OWNER_ID, conversationId, pocketStatus]);
  return rows.map(pocketFromRow);
}

export async function patchPocket(db, id, value = {}) {
  await ensureMemorySchema(db);
  const row = await requirePocketRow(db, id);
  const status = value.status == null ? row.status : String(value.status);
  if (!POCKET_STATUSES.has(status)) throw new MemoryStoreError('invalid_pocket_status', '待确认袋状态无效。');
  const timestamp = Date.now();
  await run(db, `UPDATE memory_pockets SET
    suggested_title = ?, suggested_life_core = ?, suggested_usage_hint = ?, status = ?, updated_at = ?
    WHERE id = ? AND user_id = ? AND deleted_at IS NULL`, [
    value.suggested_title == null ? row.suggested_title : clip(value.suggested_title, MAX_TITLE),
    value.suggested_life_core == null ? row.suggested_life_core : clip(value.suggested_life_core, MAX_LIFE_CORE),
    value.suggested_usage_hint == null ? row.suggested_usage_hint : clip(value.suggested_usage_hint, MAX_HINT),
    status,
    timestamp,
    row.id,
    MEMORY_OWNER_ID,
  ]);
  return pocketFromRow(await requirePocketRow(db, row.id));
}

export async function deletePocket(db, id) {
  await ensureMemorySchema(db);
  const row = await requirePocketRow(db, id);
  const timestamp = Date.now();
  await run(db, `UPDATE memory_pockets SET deleted_at = ?, updated_at = ?
    WHERE id = ? AND user_id = ? AND deleted_at IS NULL`, [timestamp, timestamp, row.id, MEMORY_OWNER_ID]);
  return { ...pocketFromRow(row), deleted_at: iso(timestamp) };
}

export const memoryLimits = Object.freeze({
  sourceText: MAX_SOURCE_TEXT,
  title: MAX_TITLE,
  lifeCore: MAX_LIFE_CORE,
  hint: MAX_HINT,
  handSeeds: MAX_HAND_SEEDS,
});

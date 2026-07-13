import { ensureChatSchema, getConversation, sanitizeId } from './chat-store.js';

export const MEMORY_OWNER_ID = 'owner';

const MAX_SOURCE_TEXT = 12000;
const MAX_TITLE = 120;
const MAX_LIFE_CORE = 2000;
const MAX_HINT = 1200;
const MAX_ENTRY_CONTENT = 6000;
const MAX_SOIL_TEXT = 4000;
const MAX_HAND_SEEDS = 7;
const POCKET_SOURCE_TYPES = new Set(['message', 'turn', 'selection', 'soil']);
const POCKET_STATUSES = new Set(['pending', 'confirmed', 'discarded', 'stone']);
const ENTRY_TYPES = new Set(['seed', 'memory']);
const ENTRY_SCOPES = new Set(['conversation', 'global']);
const ENTRY_STATUSES = new Set(['active', 'dormant', 'archived', 'stone', 'discarded']);
const MEMORY_LEVELS = new Set(['ordinary', 'core']);
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
  await run(db, `CREATE TABLE IF NOT EXISTS memory_entries (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT 'owner',
    entry_type TEXT NOT NULL,
    scope TEXT NOT NULL,
    conversation_id TEXT DEFAULT NULL,
    title TEXT NOT NULL,
    life_core TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    usage_hint TEXT NOT NULL DEFAULT '',
    avoid_hint TEXT NOT NULL DEFAULT '',
    source_type TEXT NOT NULL DEFAULT 'manual',
    source_ref_json TEXT NOT NULL DEFAULT '{}',
    promoted_from_id TEXT DEFAULT NULL,
    memory_level TEXT NOT NULL DEFAULT 'ordinary',
    status TEXT NOT NULL DEFAULT 'active',
    user_confirmed INTEGER NOT NULL DEFAULT 1,
    recall_count INTEGER NOT NULL DEFAULT 0,
    last_recalled_at INTEGER DEFAULT NULL,
    vector_id TEXT DEFAULT NULL,
    embedding_model TEXT DEFAULT NULL,
    embedding_version TEXT DEFAULT NULL,
    embedding_status TEXT NOT NULL DEFAULT 'pending',
    embedded_at INTEGER DEFAULT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER DEFAULT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
  )`);
  await run(db, 'CREATE INDEX IF NOT EXISTS idx_soils_updated ON conversation_soils(updated_at)');
  await run(db, `CREATE INDEX IF NOT EXISTS idx_pockets_conversation_status
    ON memory_pockets(conversation_id, status, created_at)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_entries_scope_type
    ON memory_entries(user_id, scope, entry_type, status, updated_at)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_entries_conversation
    ON memory_entries(conversation_id, entry_type, status, updated_at)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_entries_recall
    ON memory_entries(last_recalled_at, recall_count)`);
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

function entryFromRow(row) {
  return {
    id: row.id,
    entry_type: row.entry_type,
    scope: row.scope,
    conversation_id: row.conversation_id || null,
    title: row.title || '',
    life_core: row.life_core || '',
    content: row.content || '',
    usage_hint: row.usage_hint || '',
    avoid_hint: row.avoid_hint || '',
    source_type: row.source_type || 'manual',
    source_ref: sourceRef(parseJson(row.source_ref_json, {})),
    promoted_from_id: row.promoted_from_id || null,
    memory_level: row.memory_level || 'ordinary',
    status: row.status,
    user_confirmed: Number(row.user_confirmed || 0) === 1,
    recall_count: Number(row.recall_count || 0),
    last_recalled_at: iso(row.last_recalled_at),
    vector_id: row.vector_id || null,
    embedding_model: row.embedding_model || null,
    embedding_version: row.embedding_version || null,
    embedding_status: row.embedding_status || 'pending',
    embedded_at: iso(row.embedded_at),
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
    deleted_at: iso(row.deleted_at),
  };
}

async function requireEntryRow(db, id) {
  const entryId = sanitizeId(id, 'memory');
  const row = await first(db, `SELECT * FROM memory_entries
    WHERE id = ? AND user_id = ? AND deleted_at IS NULL`, [entryId, MEMORY_OWNER_ID]);
  if (!row) throw new MemoryStoreError('entry_not_found', '种子或记忆不存在。', 404);
  return row;
}

function normalizeEntryType(value) {
  const entryType = String(value || 'memory');
  if (!ENTRY_TYPES.has(entryType)) throw new MemoryStoreError('invalid_entry_type', '种子或记忆类型无效。');
  return entryType;
}

function normalizeScope(value) {
  const scope = String(value || 'conversation');
  if (!ENTRY_SCOPES.has(scope)) throw new MemoryStoreError('invalid_entry_scope', '记忆范围无效。');
  return scope;
}

function normalizeStatus(value, fallback = 'active') {
  const status = String(value || fallback);
  if (!ENTRY_STATUSES.has(status)) throw new MemoryStoreError('invalid_entry_status', '种子或记忆状态无效。');
  return status;
}

function normalizeMemoryLevel(value, entryType) {
  const level = String(value || 'ordinary');
  if (!MEMORY_LEVELS.has(level)) throw new MemoryStoreError('invalid_memory_level', '记忆保护级别无效。');
  return entryType === 'memory' ? level : 'ordinary';
}

async function normalizedEntry(db, value = {}, defaults = {}) {
  const entryType = normalizeEntryType(value.entry_type ?? defaults.entry_type);
  const scope = normalizeScope(value.scope ?? defaults.scope);
  const conversationId = scope === 'conversation'
    ? sanitizeId(value.conversation_id ?? defaults.conversation_id, 'conversation')
    : null;
  if (conversationId) await getConversation(db, conversationId);
  const title = clip(value.title ?? defaults.title, MAX_TITLE);
  const lifeCore = clip(value.life_core ?? defaults.life_core, MAX_LIFE_CORE);
  if (!title || !lifeCore) throw new MemoryStoreError('entry_fields_required', '标题与生命核不能为空。');
  return {
    id: sanitizeId(value.id ?? defaults.id ?? crypto.randomUUID(), 'memory'),
    entry_type: entryType,
    scope,
    conversation_id: conversationId,
    title,
    life_core: lifeCore,
    content: clip(value.content ?? defaults.content, MAX_ENTRY_CONTENT),
    usage_hint: clip(value.usage_hint ?? defaults.usage_hint, MAX_HINT),
    avoid_hint: clip(value.avoid_hint ?? defaults.avoid_hint, MAX_HINT),
    source_type: clip(value.source_type ?? defaults.source_type ?? 'manual', 40) || 'manual',
    source_ref: sourceRef(value.source_ref ?? defaults.source_ref),
    promoted_from_id: value.promoted_from_id ?? defaults.promoted_from_id ?? null,
    memory_level: normalizeMemoryLevel(value.memory_level ?? defaults.memory_level, entryType),
    status: normalizeStatus(value.status ?? defaults.status, entryType === 'seed' ? 'dormant' : 'active'),
  };
}

function insertEntryStatement(db, entry, timestamp) {
  return db.prepare(`INSERT INTO memory_entries (
    id, user_id, entry_type, scope, conversation_id, title, life_core, content,
    usage_hint, avoid_hint, source_type, source_ref_json, promoted_from_id,
    memory_level, status, user_confirmed, recall_count, last_recalled_at,
    vector_id, embedding_model, embedding_version, embedding_status, embedded_at,
    created_at, updated_at, deleted_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, NULL, NULL, NULL, NULL, 'pending', NULL, ?, ?, NULL)`).bind(
    entry.id,
    MEMORY_OWNER_ID,
    entry.entry_type,
    entry.scope,
    entry.conversation_id,
    entry.title,
    entry.life_core,
    entry.content,
    entry.usage_hint,
    entry.avoid_hint,
    entry.source_type,
    JSON.stringify(entry.source_ref),
    entry.promoted_from_id,
    entry.memory_level,
    entry.status,
    timestamp,
    timestamp,
  );
}

export async function getEntry(db, id) {
  await ensureMemorySchema(db);
  return entryFromRow(await requireEntryRow(db, id));
}

export async function createEntry(db, value = {}) {
  await ensureMemorySchema(db);
  const entry = await normalizedEntry(db, value);
  await insertEntryStatement(db, entry, Date.now()).run();
  return getEntry(db, entry.id);
}

export async function listEntries(db, options = {}) {
  await ensureMemorySchema(db);
  const conditions = ['user_id = ?', 'deleted_at IS NULL'];
  const params = [MEMORY_OWNER_ID];
  if (options.entry_type) {
    conditions.push('entry_type = ?');
    params.push(normalizeEntryType(options.entry_type));
  }
  if (options.scope) {
    const scope = normalizeScope(options.scope);
    conditions.push('scope = ?');
    params.push(scope);
    if (scope === 'conversation') {
      const conversationId = sanitizeId(options.conversation_id, 'conversation');
      await getConversation(db, conversationId);
      conditions.push('conversation_id = ?');
      params.push(conversationId);
    } else {
      conditions.push('conversation_id IS NULL');
    }
  }
  if (options.status) {
    conditions.push('status = ?');
    params.push(normalizeStatus(options.status));
  }
  const query = clip(options.q, 240);
  if (query) {
    conditions.push('(title LIKE ? OR life_core LIKE ? OR content LIKE ? OR usage_hint LIKE ?)');
    const pattern = `%${query}%`;
    params.push(pattern, pattern, pattern, pattern);
  }
  const limit = Math.min(100, Math.max(1, Number(options.limit) || 40));
  const offset = Math.max(0, Number(options.cursor) || 0);
  const rows = await all(db, `SELECT * FROM memory_entries
    WHERE ${conditions.join(' AND ')}
    ORDER BY updated_at DESC, created_at DESC
    LIMIT ? OFFSET ?`, [...params, limit + 1, offset]);
  const more = rows.length > limit;
  return {
    entries: rows.slice(0, limit).map(entryFromRow),
    next_cursor: more ? String(offset + limit) : null,
  };
}

export async function patchEntry(db, id, value = {}) {
  await ensureMemorySchema(db);
  const row = await requireEntryRow(db, id);
  const requestedScope = value.scope == null ? row.scope : normalizeScope(value.scope);
  if (row.scope === 'global' && requestedScope === 'conversation') {
    const copy = await createEntry(db, {
      entry_type: row.entry_type,
      scope: 'conversation',
      conversation_id: value.conversation_id,
      title: value.title ?? row.title,
      life_core: value.life_core ?? row.life_core,
      content: value.content ?? row.content,
      usage_hint: value.usage_hint ?? row.usage_hint,
      avoid_hint: value.avoid_hint ?? row.avoid_hint,
      source_type: 'manual',
      source_ref: { copied_from: row.id },
      promoted_from_id: row.id,
      memory_level: value.memory_level ?? row.memory_level,
      status: value.status ?? row.status,
    });
    return { entry: copy, copied: true };
  }

  const conversationId = requestedScope === 'conversation'
    ? sanitizeId(value.conversation_id ?? row.conversation_id, 'conversation')
    : null;
  if (conversationId) await getConversation(db, conversationId);
  const title = value.title == null ? row.title : clip(value.title, MAX_TITLE);
  const lifeCore = value.life_core == null ? row.life_core : clip(value.life_core, MAX_LIFE_CORE);
  if (!title || !lifeCore) throw new MemoryStoreError('entry_fields_required', '标题与生命核不能为空。');
  const status = value.status == null ? row.status : normalizeStatus(value.status);
  const memoryLevel = value.memory_level == null
    ? row.memory_level
    : normalizeMemoryLevel(value.memory_level, row.entry_type);
  const timestamp = Date.now();
  await run(db, `UPDATE memory_entries SET
    scope = ?, conversation_id = ?, title = ?, life_core = ?, content = ?,
    usage_hint = ?, avoid_hint = ?, status = ?, memory_level = ?,
    embedding_status = 'pending', updated_at = ?
    WHERE id = ? AND user_id = ? AND deleted_at IS NULL`, [
    requestedScope,
    conversationId,
    title,
    lifeCore,
    value.content == null ? row.content : clip(value.content, MAX_ENTRY_CONTENT),
    value.usage_hint == null ? row.usage_hint : clip(value.usage_hint, MAX_HINT),
    value.avoid_hint == null ? row.avoid_hint : clip(value.avoid_hint, MAX_HINT),
    status,
    memoryLevel,
    timestamp,
    row.id,
    MEMORY_OWNER_ID,
  ]);
  return { entry: await getEntry(db, row.id), copied: false };
}

export async function deleteEntry(db, id) {
  await ensureMemorySchema(db);
  const row = await requireEntryRow(db, id);
  const timestamp = Date.now();
  await run(db, `UPDATE memory_entries SET deleted_at = ?, updated_at = ?
    WHERE id = ? AND user_id = ? AND deleted_at IS NULL`, [timestamp, timestamp, row.id, MEMORY_OWNER_ID]);
  return { ...entryFromRow(row), deleted_at: iso(timestamp) };
}

export async function resolvePocket(db, id, value = {}) {
  await ensureMemorySchema(db);
  const pocket = await requirePocketRow(db, id);
  if (pocket.status !== 'pending') throw new MemoryStoreError('pocket_already_resolved', '这条内容已经离开待确认袋。', 409);
  const action = String(value.action || '');
  if (action === 'stone' || action === 'discard') {
    const status = action === 'stone' ? 'stone' : 'discarded';
    const timestamp = Date.now();
    await db.batch([
      db.prepare(`UPDATE memory_pockets SET status = ?, updated_at = ?
        WHERE id = ? AND user_id = ? AND status = 'pending' AND deleted_at IS NULL`)
        .bind(status, timestamp, pocket.id, MEMORY_OWNER_ID),
    ]);
    return { pocket: pocketFromRow({ ...pocket, status, updated_at: timestamp }), entry: null };
  }
  const destinations = {
    conversation_seed: ['seed', 'conversation'],
    global_seed: ['seed', 'global'],
    conversation_memory: ['memory', 'conversation'],
    global_memory: ['memory', 'global'],
  };
  const destination = destinations[action];
  if (!destination) throw new MemoryStoreError('invalid_pocket_action', '待确认袋去向无效。');
  const [entryType, scope] = destination;
  const entry = await normalizedEntry(db, {
    entry_type: entryType,
    scope,
    conversation_id: scope === 'conversation' ? pocket.conversation_id : null,
    title: value.title || pocket.suggested_title || pocket.source_text,
    life_core: value.life_core || pocket.suggested_life_core || pocket.source_text,
    content: value.content ?? pocket.source_text,
    usage_hint: value.usage_hint ?? pocket.suggested_usage_hint,
    avoid_hint: value.avoid_hint,
    source_type: 'pocket',
    source_ref: { pocket_id: pocket.id, source_type: pocket.source_type, source_ref: parseJson(pocket.source_ref_json, {}) },
    memory_level: value.memory_level,
  });
  const timestamp = Date.now();
  await db.batch([
    insertEntryStatement(db, entry, timestamp),
    db.prepare(`UPDATE memory_pockets SET status = 'confirmed', resolved_entry_id = ?, updated_at = ?
      WHERE id = ? AND user_id = ? AND status = 'pending' AND deleted_at IS NULL`)
      .bind(entry.id, timestamp, pocket.id, MEMORY_OWNER_ID),
  ]);
  return {
    pocket: pocketFromRow({ ...pocket, status: 'confirmed', resolved_entry_id: entry.id, updated_at: timestamp }),
    entry: await getEntry(db, entry.id),
  };
}

export const memoryLimits = Object.freeze({
  sourceText: MAX_SOURCE_TEXT,
  title: MAX_TITLE,
  lifeCore: MAX_LIFE_CORE,
  hint: MAX_HINT,
  entryContent: MAX_ENTRY_CONTENT,
  handSeeds: MAX_HAND_SEEDS,
});

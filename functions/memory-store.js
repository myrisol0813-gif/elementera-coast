import { ensureChatSchema, getConversation, sanitizeId } from './chat-store.js';
import { MEMORY_CONFIG } from './memory-config.js';

export const MEMORY_OWNER_ID = MEMORY_CONFIG.owner;

const MAX_SOURCE_TEXT = 12000;
const MAX_TITLE = 120;
const MAX_LIFE_CORE = 2000;
const MAX_HINT = 1200;
const MAX_ENTRY_CONTENT = 6000;
const MAX_SOIL_TEXT = 4000;
const MAX_SOURCE_EXCERPT = 1200;
const MAX_HAND_SEEDS = MEMORY_CONFIG.soil.maxHandSeeds;
const POCKET_SOURCE_TYPES = new Set(['message', 'turn', 'selection', 'soil']);
const POCKET_STATUSES = new Set(['pending', 'confirmed', 'discarded', 'stone', 'archived']);
const POCKET_MEMBERSHIP_SCOPES = new Set(['conversation', 'global']);
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

async function ensureColumn(db, table, column, declaration) {
  const columns = await all(db, `PRAGMA table_info(${table})`);
  if (columns.some((item) => item.name === column)) return;
  try {
    await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${declaration}`).run();
  } catch (error) {
    const current = await all(db, `PRAGMA table_info(${table})`);
    if (!current.some((item) => item.name === column)) throw error;
  }
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
    organized_through_turn_id TEXT NOT NULL DEFAULT '',
    revision INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
  )`);
  await ensureColumn(db, 'conversation_soils', 'organized_through_turn_id', "TEXT NOT NULL DEFAULT ''");
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
    suggested_avoid_hint TEXT NOT NULL DEFAULT '',
    candidate_id TEXT DEFAULT NULL,
    title TEXT NOT NULL DEFAULT '',
    life_core TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    usage_hint TEXT NOT NULL DEFAULT '',
    avoid_hint TEXT NOT NULL DEFAULT '',
    source_refs_json TEXT NOT NULL DEFAULT '[]',
    source_excerpt TEXT NOT NULL DEFAULT '',
    fingerprint TEXT DEFAULT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    resolved_entry_id TEXT DEFAULT NULL,
    recall_count INTEGER NOT NULL DEFAULT 0,
    last_recalled_at INTEGER DEFAULT NULL,
    vector_ids_json TEXT NOT NULL DEFAULT '[]',
    embedding_model TEXT DEFAULT NULL,
    embedding_version TEXT DEFAULT NULL,
    embedding_status TEXT NOT NULL DEFAULT 'pending',
    embedded_at INTEGER DEFAULT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER DEFAULT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
  )`);
  for (const [column, declaration] of [
    ['suggested_avoid_hint', "TEXT NOT NULL DEFAULT ''"],
    ['candidate_id', 'TEXT DEFAULT NULL'],
    ['title', "TEXT NOT NULL DEFAULT ''"],
    ['life_core', "TEXT NOT NULL DEFAULT ''"],
    ['content', "TEXT NOT NULL DEFAULT ''"],
    ['usage_hint', "TEXT NOT NULL DEFAULT ''"],
    ['avoid_hint', "TEXT NOT NULL DEFAULT ''"],
    ['source_refs_json', "TEXT NOT NULL DEFAULT '[]'"],
    ['source_excerpt', "TEXT NOT NULL DEFAULT ''"],
    ['fingerprint', 'TEXT DEFAULT NULL'],
    ['recall_count', 'INTEGER NOT NULL DEFAULT 0'],
    ['last_recalled_at', 'INTEGER DEFAULT NULL'],
    ['vector_ids_json', "TEXT NOT NULL DEFAULT '[]'"],
    ['embedding_model', 'TEXT DEFAULT NULL'],
    ['embedding_version', 'TEXT DEFAULT NULL'],
    ['embedding_status', "TEXT NOT NULL DEFAULT 'pending'"],
    ['embedded_at', 'INTEGER DEFAULT NULL'],
  ]) await ensureColumn(db, 'memory_pockets', column, declaration);
  await run(db, `CREATE TABLE IF NOT EXISTS pocket_recall_memberships (
    pocket_id TEXT NOT NULL,
    scope TEXT NOT NULL,
    conversation_id TEXT DEFAULT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (pocket_id, scope),
    FOREIGN KEY (pocket_id) REFERENCES memory_pockets(id),
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
  await run(db, `CREATE UNIQUE INDEX IF NOT EXISTS idx_pockets_fingerprint
    ON memory_pockets(user_id, fingerprint)
    WHERE fingerprint IS NOT NULL AND fingerprint <> ''`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_pocket_memberships_scope
    ON pocket_recall_memberships(scope, conversation_id, pocket_id)`);
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

function stableCandidateKey(value) {
  let hash = 2166136261;
  for (const character of String(value || '').normalize('NFKC')) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function normalizeCandidateSourceRef(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const turnId = clip(value.turn_id ?? value.turnId, 160);
  const role = String(value.role || '').trim();
  if (!turnId || !['user', 'assistant', 'turn'].includes(role)) return null;
  return { turn_id: turnId, role };
}

function normalizeCandidateId(value, lifeCore) {
  const supplied = String(value || '').replace(/[^\w:.-]/g, '_').replace(/^_+|_+$/g, '').slice(0, 160);
  return supplied || `candidate_${stableCandidateKey(lifeCore)}`;
}

function normalizePocketCandidate(value, options = {}) {
  if (typeof value === 'string') {
    const text = clip(value, MAX_LIFE_CORE);
    if (!text) return null;
    return {
      candidate_id: normalizeCandidateId('', text),
      title: clip(text, MAX_TITLE),
      life_core: text,
      content: clip(text, MAX_ENTRY_CONTENT),
      usage_hint: '',
      avoid_hint: '',
      source_refs: [],
      source_excerpt: '',
    };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const title = clip(value.title ?? value.name, MAX_TITLE);
  const lifeCore = clip(value.life_core ?? value.lifeCore ?? value.text ?? value.content ?? title, MAX_LIFE_CORE);
  if (!title && !lifeCore) return null;
  const allowedTurnIds = options.allowedTurnIds instanceof Set ? options.allowedTurnIds : null;
  let sourceRefs = (Array.isArray(value.source_refs) ? value.source_refs : [])
    .map(normalizeCandidateSourceRef)
    .filter((reference) => reference && (!allowedTurnIds || allowedTurnIds.has(reference.turn_id)))
    .slice(0, 8);
  if (!sourceRefs.length && options.fallbackSourceRef) {
    const fallback = normalizeCandidateSourceRef(options.fallbackSourceRef);
    if (fallback && (!allowedTurnIds || allowedTurnIds.has(fallback.turn_id))) sourceRefs = [fallback];
  }
  return {
    candidate_id: normalizeCandidateId(value.candidate_id ?? value.candidateId, lifeCore || title),
    title: title || clip(lifeCore, MAX_TITLE),
    life_core: lifeCore || title,
    content: clip(value.content ?? value.text ?? lifeCore ?? title, MAX_ENTRY_CONTENT),
    usage_hint: clip(value.usage_hint ?? value.usageHint, MAX_HINT),
    avoid_hint: clip(value.avoid_hint ?? value.avoidHint, MAX_HINT),
    source_refs: sourceRefs,
    source_excerpt: clip(value.source_excerpt ?? value.sourceExcerpt ?? options.fallbackExcerpt, MAX_SOURCE_EXCERPT),
  };
}

export function normalizePocketCandidates(value, options = {}) {
  return (Array.isArray(value) ? value : [])
    .map((item) => normalizePocketCandidate(item, options))
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
    organized_through_turn_id: row.organized_through_turn_id || '',
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
    organized_through_turn_id: has('organized_through_turn_id') ? clip(value.organized_through_turn_id, 180) : current.organized_through_turn_id,
    manual_locked: has('manual_locked') ? bool(value.manual_locked) : !automatic,
    auto_refresh_enabled: has('auto_refresh_enabled') ? bool(value.auto_refresh_enabled) : current.auto_refresh_enabled,
  };
  const timestamp = Date.now();
  await run(db, `UPDATE conversation_soils SET
    current_text = ?, hand_seeds_json = ?, do_not_repeat = ?, pocket_candidates_json = ?,
    manual_locked = ?, auto_refresh_enabled = ?, organized_through_turn_id = ?, revision = revision + 1, updated_at = ?
    WHERE conversation_id = ?`, [
    next.current_text,
    JSON.stringify(next.hand_seeds),
    next.do_not_repeat,
    JSON.stringify(next.pocket_candidates),
    next.manual_locked ? 1 : 0,
    next.auto_refresh_enabled ? 1 : 0,
    next.organized_through_turn_id,
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
  const reference = sourceRef(parseJson(row.source_ref_json, {}));
  let sourceRefs = (Array.isArray(parseJson(row.source_refs_json, [])) ? parseJson(row.source_refs_json, []) : [])
    .map(normalizeCandidateSourceRef)
    .filter(Boolean)
    .slice(0, 8);
  if (!sourceRefs.length) {
    const legacyReference = normalizeCandidateSourceRef(reference);
    if (legacyReference) sourceRefs = [legacyReference];
  }
  const title = row.title || row.suggested_title || clip(row.source_text, MAX_TITLE);
  const lifeCore = row.life_core || row.suggested_life_core || row.source_text || title;
  const content = row.content || row.source_text || lifeCore;
  const usageHint = row.usage_hint || row.suggested_usage_hint || '';
  const avoidHint = row.avoid_hint || row.suggested_avoid_hint || '';
  return {
    id: row.id,
    entry_type: 'pocket',
    conversation_id: row.conversation_id,
    source_type: row.source_type,
    source_ref: reference,
    source_text: row.source_text || '',
    candidate_id: row.candidate_id || normalizeCandidateId('', lifeCore),
    title,
    life_core: lifeCore,
    content,
    usage_hint: usageHint,
    avoid_hint: avoidHint,
    source_refs: sourceRefs,
    source_excerpt: row.source_excerpt || '',
    fingerprint: row.fingerprint || null,
    suggested_title: title,
    suggested_life_core: lifeCore,
    suggested_usage_hint: usageHint,
    suggested_avoid_hint: avoidHint,
    status: row.status,
    resolved_entry_id: row.resolved_entry_id || null,
    user_confirmed: row.status === 'confirmed',
    recall_count: Number(row.recall_count || 0),
    last_recalled_at: iso(row.last_recalled_at),
    vector_ids: (Array.isArray(parseJson(row.vector_ids_json, [])) ? parseJson(row.vector_ids_json, []) : []).map(String).filter(Boolean),
    embedding_model: row.embedding_model || null,
    embedding_version: row.embedding_version || null,
    embedding_status: row.embedding_status || 'pending',
    embedded_at: iso(row.embedded_at),
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

export async function getPocket(db, id) {
  await ensureMemorySchema(db);
  return pocketFromRow(await requirePocketRow(db, id));
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
  let sourceRefs = (Array.isArray(value.source_refs) ? value.source_refs : [])
    .map(normalizeCandidateSourceRef)
    .filter(Boolean)
    .slice(0, 8);
  if (!sourceRefs.length) {
    const legacyReference = normalizeCandidateSourceRef(reference);
    if (legacyReference) sourceRefs = [legacyReference];
  }
  const title = clip(value.title ?? value.suggested_title ?? sourceText.replace(/\s+/g, ' '), MAX_TITLE);
  const lifeCore = clip(value.life_core ?? value.suggested_life_core ?? sourceText, MAX_LIFE_CORE);
  const content = clip(value.content ?? sourceText, MAX_ENTRY_CONTENT);
  const usageHint = clip(value.usage_hint ?? value.suggested_usage_hint, MAX_HINT);
  const avoidHint = clip(value.avoid_hint ?? value.suggested_avoid_hint, MAX_HINT);
  const sourceExcerpt = clip(value.source_excerpt, MAX_SOURCE_EXCERPT);
  const fingerprint = clip(value.fingerprint, 160) || null;
  const id = sanitizeId(crypto.randomUUID(), 'pocket');
  const timestamp = Date.now();
  await run(db, `INSERT INTO memory_pockets (
    id, user_id, conversation_id, source_type, source_ref_json, source_text,
    suggested_title, suggested_life_core, suggested_usage_hint, suggested_avoid_hint,
    candidate_id, title, life_core, content, usage_hint, avoid_hint,
    source_refs_json, source_excerpt, fingerprint, status, resolved_entry_id,
    recall_count, last_recalled_at, vector_ids_json, embedding_model,
    embedding_version, embedding_status, embedded_at, created_at, updated_at, deleted_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
    'pending', NULL, 0, NULL, '[]', NULL, NULL, 'pending', NULL, ?, ?, NULL)`, [
    id,
    MEMORY_OWNER_ID,
    conversationId,
    sourceType,
    JSON.stringify(reference),
    sourceText,
    title,
    lifeCore,
    usageHint,
    avoidHint,
    normalizeCandidateId(value.candidate_id, lifeCore),
    title,
    lifeCore,
    content,
    usageHint,
    avoidHint,
    JSON.stringify(sourceRefs),
    sourceExcerpt,
    fingerprint,
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
  if (status === 'confirmed' && row.status !== 'confirmed') {
    throw new MemoryStoreError('pocket_confirm_requires_resolve', '请使用“确认落袋”完成双路径确认。', 409);
  }
  const current = pocketFromRow(row);
  const title = value.title == null && value.suggested_title == null
    ? current.title : clip(value.title ?? value.suggested_title, MAX_TITLE);
  const lifeCore = value.life_core == null && value.suggested_life_core == null
    ? current.life_core : clip(value.life_core ?? value.suggested_life_core, MAX_LIFE_CORE);
  if (!title || !lifeCore) throw new MemoryStoreError('pocket_fields_required', '落袋标题与生命核不能为空。');
  const content = value.content == null && value.source_text == null
    ? current.content : clip(value.content ?? value.source_text, MAX_ENTRY_CONTENT);
  const usageHint = value.usage_hint == null && value.suggested_usage_hint == null
    ? current.usage_hint : clip(value.usage_hint ?? value.suggested_usage_hint, MAX_HINT);
  const avoidHint = value.avoid_hint == null && value.suggested_avoid_hint == null
    ? current.avoid_hint : clip(value.avoid_hint ?? value.suggested_avoid_hint, MAX_HINT);
  const sourceRefs = value.source_refs == null
    ? current.source_refs
    : (Array.isArray(value.source_refs) ? value.source_refs : []).map(normalizeCandidateSourceRef).filter(Boolean).slice(0, 8);
  const timestamp = Date.now();
  await run(db, `UPDATE memory_pockets SET
    source_text = ?, suggested_title = ?, suggested_life_core = ?, suggested_usage_hint = ?,
    suggested_avoid_hint = ?, candidate_id = ?, title = ?, life_core = ?, content = ?,
    usage_hint = ?, avoid_hint = ?, source_refs_json = ?, source_excerpt = ?,
    status = ?, embedding_status = 'pending', updated_at = ?
    WHERE id = ? AND user_id = ? AND deleted_at IS NULL`, [
    content,
    title,
    lifeCore,
    usageHint,
    avoidHint,
    value.candidate_id == null ? current.candidate_id : normalizeCandidateId(value.candidate_id, lifeCore),
    title,
    lifeCore,
    content,
    usageHint,
    avoidHint,
    JSON.stringify(sourceRefs),
    value.source_excerpt == null ? current.source_excerpt : clip(value.source_excerpt, MAX_SOURCE_EXCERPT),
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
  await db.batch([
    db.prepare(`DELETE FROM pocket_recall_memberships WHERE pocket_id = ?`).bind(row.id),
    db.prepare(`UPDATE memory_pockets SET deleted_at = ?, updated_at = ?
      WHERE id = ? AND user_id = ? AND deleted_at IS NULL`).bind(timestamp, timestamp, row.id, MEMORY_OWNER_ID),
  ]);
  return { ...pocketFromRow(row), deleted_at: iso(timestamp) };
}

function normalizedFingerprintCore(value) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase('zh-CN').replace(/\s+/g, ' ').trim();
}

export async function pocketFingerprint(conversationIdValue, lifeCore) {
  const conversationId = sanitizeId(conversationIdValue, 'conversation');
  const normalized = normalizedFingerprintCore(lifeCore);
  if (!normalized) throw new MemoryStoreError('pocket_life_core_required', '可落袋候选缺少生命核。');
  const bytes = new TextEncoder().encode(`${conversationId}\u0000${normalized}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hexadecimal = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `soil:${hexadecimal}`;
}

export async function upsertSoilPocketCandidates(db, conversationIdValue, value) {
  await ensureMemorySchema(db);
  const conversationId = sanitizeId(conversationIdValue, 'conversation');
  await getConversation(db, conversationId);
  const candidates = normalizePocketCandidates(value);
  const result = { created: 0, updated: 0, suppressed: 0, pockets: [] };
  for (const candidate of candidates) {
    const fingerprint = await pocketFingerprint(conversationId, candidate.life_core);
    let row = await first(db, `SELECT * FROM memory_pockets
      WHERE user_id = ? AND fingerprint = ?
      ORDER BY created_at ASC LIMIT 1`, [MEMORY_OWNER_ID, fingerprint]);
    if (row) {
      if (row.status === 'pending' && !row.deleted_at) {
        const pocket = await patchPocket(db, row.id, candidate);
        result.updated += 1;
        result.pockets.push(pocket);
      } else {
        result.suppressed += 1;
        result.pockets.push(pocketFromRow(row));
      }
      continue;
    }
    try {
      const pocket = await createPocket(db, {
        conversation_id: conversationId,
        source_type: 'soil',
        source_ref: { conversation_id: conversationId, candidate_id: candidate.candidate_id },
        source_text: candidate.content,
        ...candidate,
        fingerprint,
      });
      result.created += 1;
      result.pockets.push(pocket);
    } catch (error) {
      row = await first(db, `SELECT * FROM memory_pockets
        WHERE user_id = ? AND fingerprint = ?
        ORDER BY created_at ASC LIMIT 1`, [MEMORY_OWNER_ID, fingerprint]);
      if (!row) throw error;
      result.suppressed += 1;
      result.pockets.push(pocketFromRow(row));
    }
  }
  return result;
}

function membershipFromRow(row) {
  return {
    pocket_id: row.pocket_id,
    scope: row.scope,
    conversation_id: row.conversation_id || null,
    created_at: iso(row.created_at),
  };
}

export async function listPocketMemberships(db, id) {
  await ensureMemorySchema(db);
  const pocket = await getPocket(db, id);
  const rows = await all(db, `SELECT * FROM pocket_recall_memberships
    WHERE pocket_id = ? ORDER BY scope ASC`, [pocket.id]);
  return rows.map(membershipFromRow);
}

export async function listRecallPocketPool(db, { conversation_id: conversationIdValue, scope: scopeValue } = {}) {
  await ensureMemorySchema(db);
  const scope = String(scopeValue || 'conversation');
  if (!POCKET_MEMBERSHIP_SCOPES.has(scope)) throw new MemoryStoreError('invalid_pocket_scope', '落袋召回范围无效。');
  const params = [MEMORY_OWNER_ID, scope];
  let membershipCondition = 'm.conversation_id IS NULL';
  if (scope === 'conversation') {
    const conversationId = sanitizeId(conversationIdValue, 'conversation');
    await getConversation(db, conversationId);
    membershipCondition = 'm.conversation_id = ?';
    params.push(conversationId);
  }
  const rows = await all(db, `SELECT p.* FROM memory_pockets p
    INNER JOIN pocket_recall_memberships m ON m.pocket_id = p.id
    WHERE p.user_id = ? AND m.scope = ? AND ${membershipCondition}
      AND p.status = 'confirmed' AND p.deleted_at IS NULL
    ORDER BY p.updated_at DESC
    LIMIT 240`, params);
  return rows.map((row) => ({ ...pocketFromRow(row), recall_scope: scope }));
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
  if (action === 'confirm_pocket') {
    const current = pocketFromRow(pocket);
    const title = clip(value.title ?? current.title, MAX_TITLE);
    const lifeCore = clip(value.life_core ?? current.life_core, MAX_LIFE_CORE);
    if (!title || !lifeCore) throw new MemoryStoreError('pocket_fields_required', '落袋标题与生命核不能为空。');
    const content = clip(value.content ?? current.content, MAX_ENTRY_CONTENT);
    const usageHint = clip(value.usage_hint ?? current.usage_hint, MAX_HINT);
    const avoidHint = clip(value.avoid_hint ?? current.avoid_hint, MAX_HINT);
    const sourceRefs = (Array.isArray(value.source_refs) ? value.source_refs : current.source_refs)
      .map(normalizeCandidateSourceRef).filter(Boolean).slice(0, 8);
    const sourceExcerpt = clip(value.source_excerpt ?? current.source_excerpt, MAX_SOURCE_EXCERPT);
    const timestamp = Date.now();
    await db.batch([
      db.prepare(`UPDATE memory_pockets SET
        source_text = ?, suggested_title = ?, suggested_life_core = ?,
        suggested_usage_hint = ?, suggested_avoid_hint = ?, title = ?, life_core = ?,
        content = ?, usage_hint = ?, avoid_hint = ?, source_refs_json = ?,
        source_excerpt = ?, status = 'confirmed', resolved_entry_id = NULL,
        embedding_status = 'pending', updated_at = ?
        WHERE id = ? AND user_id = ? AND status = 'pending' AND deleted_at IS NULL`).bind(
        content,
        title,
        lifeCore,
        usageHint,
        avoidHint,
        title,
        lifeCore,
        content,
        usageHint,
        avoidHint,
        JSON.stringify(sourceRefs),
        sourceExcerpt,
        timestamp,
        pocket.id,
        MEMORY_OWNER_ID,
      ),
      db.prepare(`INSERT OR IGNORE INTO pocket_recall_memberships
        (pocket_id, scope, conversation_id, created_at) VALUES (?, 'conversation', ?, ?)`).bind(
        pocket.id,
        pocket.conversation_id,
        timestamp,
      ),
      db.prepare(`INSERT OR IGNORE INTO pocket_recall_memberships
        (pocket_id, scope, conversation_id, created_at) VALUES (?, 'global', NULL, ?)`).bind(
        pocket.id,
        timestamp,
      ),
    ]);
    return {
      pocket: await getPocket(db, pocket.id),
      memberships: await listPocketMemberships(db, pocket.id),
      entry: null,
    };
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
  const current = pocketFromRow(pocket);
  const entry = await normalizedEntry(db, {
    entry_type: entryType,
    scope,
    conversation_id: scope === 'conversation' ? pocket.conversation_id : null,
    title: value.title || current.title,
    life_core: value.life_core || current.life_core,
    content: value.content ?? current.content,
    usage_hint: value.usage_hint ?? current.usage_hint,
    avoid_hint: value.avoid_hint ?? current.avoid_hint,
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
    pocket: await getPocket(db, pocket.id),
    entry: await getEntry(db, entry.id),
  };
}

export async function updateEmbeddingState(db, id, value = {}) {
  await ensureMemorySchema(db);
  const row = await requireEntryRow(db, id);
  const status = ['pending', 'ready', 'error'].includes(value.embedding_status)
    ? value.embedding_status
    : row.embedding_status;
  const timestamp = Date.now();
  await run(db, `UPDATE memory_entries SET
    vector_id = ?, embedding_model = ?, embedding_version = ?, embedding_status = ?,
    embedded_at = ?, updated_at = ?
    WHERE id = ? AND user_id = ? AND deleted_at IS NULL`, [
    value.vector_id === undefined ? row.vector_id : value.vector_id,
    value.embedding_model === undefined ? row.embedding_model : value.embedding_model,
    value.embedding_version === undefined ? row.embedding_version : value.embedding_version,
    status,
    value.embedded_at === undefined ? row.embedded_at : value.embedded_at,
    timestamp,
    row.id,
    MEMORY_OWNER_ID,
  ]);
  return getEntry(db, row.id);
}

export async function updatePocketEmbeddingState(db, id, value = {}) {
  await ensureMemorySchema(db);
  const row = await requirePocketRow(db, id);
  const status = ['pending', 'ready', 'error'].includes(value.embedding_status)
    ? value.embedding_status
    : row.embedding_status;
  const vectorIds = value.vector_ids === undefined
    ? parseJson(row.vector_ids_json, [])
    : (Array.isArray(value.vector_ids) ? value.vector_ids : []).map(String).filter(Boolean).slice(0, 2);
  const timestamp = Date.now();
  await run(db, `UPDATE memory_pockets SET
    vector_ids_json = ?, embedding_model = ?, embedding_version = ?, embedding_status = ?,
    embedded_at = ?, updated_at = ?
    WHERE id = ? AND user_id = ? AND deleted_at IS NULL`, [
    JSON.stringify(vectorIds),
    value.embedding_model === undefined ? row.embedding_model : value.embedding_model,
    value.embedding_version === undefined ? row.embedding_version : value.embedding_version,
    status,
    value.embedded_at === undefined ? row.embedded_at : value.embedded_at,
    timestamp,
    row.id,
    MEMORY_OWNER_ID,
  ]);
  return getPocket(db, row.id);
}

export async function embeddingCounts(db) {
  await ensureMemorySchema(db);
  const rows = await all(db, `SELECT embedding_status, COUNT(*) AS count
    FROM memory_entries
    WHERE user_id = ? AND deleted_at IS NULL AND user_confirmed = 1
      AND status IN ('active', 'dormant')
    GROUP BY embedding_status`, [MEMORY_OWNER_ID]);
  const counts = { pending: 0, ready: 0, error: 0 };
  for (const row of rows) {
    if (Object.prototype.hasOwnProperty.call(counts, row.embedding_status)) counts[row.embedding_status] = Number(row.count || 0);
  }
  const pocketRows = await all(db, `SELECT embedding_status, COUNT(*) AS count
    FROM memory_pockets
    WHERE user_id = ? AND deleted_at IS NULL AND status = 'confirmed'
      AND resolved_entry_id IS NULL
    GROUP BY embedding_status`, [MEMORY_OWNER_ID]);
  for (const row of pocketRows) {
    if (Object.prototype.hasOwnProperty.call(counts, row.embedding_status)) counts[row.embedding_status] += Number(row.count || 0);
  }
  return counts;
}

export async function pendingEmbeddingEntries(db, limit = 4) {
  await ensureMemorySchema(db);
  const rows = await all(db, `SELECT * FROM memory_entries
    WHERE user_id = ? AND user_confirmed = 1 AND deleted_at IS NULL
      AND status IN ('active', 'dormant')
      AND (embedding_status = 'pending' OR (embedding_status = 'error' AND updated_at < ?))
    ORDER BY updated_at ASC
    LIMIT ?`, [MEMORY_OWNER_ID, Date.now() - MEMORY_CONFIG.vector.retryAfterMs, Math.min(20, Math.max(1, Number(limit) || 4))]);
  return rows.map(entryFromRow);
}

export async function pendingEmbeddingPockets(db, limit = 4) {
  await ensureMemorySchema(db);
  const rows = await all(db, `SELECT * FROM memory_pockets
    WHERE user_id = ? AND status = 'confirmed' AND deleted_at IS NULL
      AND resolved_entry_id IS NULL
      AND (embedding_status = 'pending' OR (embedding_status = 'error' AND updated_at < ?))
    ORDER BY updated_at ASC
    LIMIT ?`, [MEMORY_OWNER_ID, Date.now() - MEMORY_CONFIG.vector.retryAfterMs, Math.min(20, Math.max(1, Number(limit) || 4))]);
  return rows.map(pocketFromRow);
}

export async function listRecallPool(db, { conversation_id: conversationIdValue, entry_type: entryTypeValue, scope: scopeValue } = {}) {
  await ensureMemorySchema(db);
  const entryType = normalizeEntryType(entryTypeValue);
  const scope = normalizeScope(scopeValue);
  const conditions = [
    'user_id = ?',
    'entry_type = ?',
    'scope = ?',
    "status IN ('active', 'dormant')",
    'user_confirmed = 1',
    'deleted_at IS NULL',
  ];
  const params = [MEMORY_OWNER_ID, entryType, scope];
  if (scope === 'conversation') {
    const conversationId = sanitizeId(conversationIdValue, 'conversation');
    await getConversation(db, conversationId);
    conditions.push('conversation_id = ?');
    params.push(conversationId);
  } else conditions.push('conversation_id IS NULL');
  const rows = await all(db, `SELECT * FROM memory_entries
    WHERE ${conditions.join(' AND ')}
    ORDER BY updated_at DESC
    LIMIT 240`, params);
  return rows.map(entryFromRow);
}

export async function entriesByIds(db, ids = []) {
  await ensureMemorySchema(db);
  const clean = [...new Set((Array.isArray(ids) ? ids : []).map((id) => sanitizeId(id, 'memory')).filter(Boolean))].slice(0, 100);
  if (!clean.length) return [];
  const placeholders = clean.map(() => '?').join(',');
  const rows = await all(db, `SELECT * FROM memory_entries
    WHERE user_id = ? AND id IN (${placeholders}) AND user_confirmed = 1
      AND status IN ('active', 'dormant') AND deleted_at IS NULL`, [MEMORY_OWNER_ID, ...clean]);
  const order = new Map(clean.map((id, index) => [id, index]));
  return rows.map(entryFromRow).sort((left, right) => order.get(left.id) - order.get(right.id));
}

export async function markEntriesRecalled(db, ids = []) {
  await ensureMemorySchema(db);
  const clean = [...new Set((Array.isArray(ids) ? ids : []).map((id) => sanitizeId(id, 'memory')).filter(Boolean))].slice(0, 20);
  if (!clean.length) return;
  const timestamp = Date.now();
  await db.batch(clean.flatMap((id) => [
    db.prepare(`UPDATE memory_entries
      SET recall_count = recall_count + 1, last_recalled_at = ?
      WHERE id = ? AND user_id = ? AND deleted_at IS NULL`).bind(timestamp, id, MEMORY_OWNER_ID),
    db.prepare(`UPDATE memory_pockets
      SET recall_count = recall_count + 1, last_recalled_at = ?
      WHERE id = ? AND user_id = ? AND status = 'confirmed' AND deleted_at IS NULL`).bind(timestamp, id, MEMORY_OWNER_ID),
  ]));
}

export const memoryLimits = Object.freeze({
  sourceText: MAX_SOURCE_TEXT,
  title: MAX_TITLE,
  lifeCore: MAX_LIFE_CORE,
  hint: MAX_HINT,
  entryContent: MAX_ENTRY_CONTENT,
  sourceExcerpt: MAX_SOURCE_EXCERPT,
  handSeeds: MAX_HAND_SEEDS,
});

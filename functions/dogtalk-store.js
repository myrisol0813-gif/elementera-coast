import { getConversation, sanitizeId } from './chat-store.js';
import { ensureMemorySchema } from './memory-store.js';

const TYPE = 'xiaohan_mystic_dogtalk';
const OWNER = 'xiaohan';
const DEFAULT_TEXT = '小寒这轮很放松，因此偷懒中。';
const DEFAULT_MISUNDERSTANDING = '不要误会成长期偏好、边界取消、行为命令，或比当前正文更重要。';
const ROOM_SCOPES = new Set(['conversation', 'radio', 'lighthouse']);
const READ_MODES = new Set(['keep_private', 'when_confused', 'current_room', 'read_now']);
const ACTIVE_STATUSES = new Set(['draft', 'saved']);
const SNAPSHOT_SOURCE_TYPES = new Set(['turn', 'radio_message', 'lighthouse_letter']);
const MIGRATION_ID = 'mystic-dogtalk-v1';
const schemaPromises = new WeakMap();

export class DogtalkStoreError extends Error {
  constructor(type, message, status = 400) {
    super(message);
    this.name = 'DogtalkStoreError';
    this.type = type;
    this.status = status;
  }
}

function clip(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

function iso(value) {
  const timestamp = Number(value || 0);
  return Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp).toISOString() : null;
}

async function run(db, sql, params = []) {
  return db.prepare(sql).bind(...params).run();
}

async function first(db, sql, params = []) {
  return db.prepare(sql).bind(...params).first();
}

function rowToDogtalk(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: TYPE,
    owner: OWNER,
    room_scope: row.room_scope,
    scope_key: row.scope_key,
    conversation_id: row.conversation_id || null,
    body: row.body || '',
    true_core: row.true_core || '',
    self_note: row.self_note || '',
    myri_hint: row.myri_hint || '',
    not_to_misunderstand: row.not_to_misunderstand || DEFAULT_MISUNDERSTANDING,
    weather: row.weather || '',
    read_mode: READ_MODES.has(row.read_mode) ? row.read_mode : 'keep_private',
    status: row.status,
    readable_by_myri: true,
    auto_recall: false,
    memory_weight: 'low',
    not_instruction: true,
    not_preference: true,
    not_memory_seed: true,
    not_pocket: true,
    visibility: 'private_to_xiaohan_and_myri',
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
    archived_at: iso(row.archived_at),
    last_read_at: iso(row.last_read_at),
  };
}

function rowToSnapshot(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: TYPE,
    dogtalk_id: row.dogtalk_id,
    owner: OWNER,
    room_scope: row.room_scope,
    scope_key: row.scope_key,
    conversation_id: row.conversation_id || null,
    source_type: row.source_type,
    source_id: row.source_id,
    body: row.body || '',
    true_core: row.true_core || '',
    self_note: row.self_note || '',
    myri_hint: row.myri_hint || '',
    not_to_misunderstand: row.not_to_misunderstand || DEFAULT_MISUNDERSTANDING,
    weather: row.weather || '',
    read_mode: READ_MODES.has(row.read_mode) ? row.read_mode : 'keep_private',
    readable_by_myri: true,
    auto_recall: false,
    memory_weight: 'low',
    not_instruction: true,
    not_preference: true,
    not_memory_seed: true,
    not_pocket: true,
    visibility: 'private_to_xiaohan_and_myri',
    created_at: iso(row.created_at),
  };
}

function defaultDogtalk(scope) {
  return {
    id: null,
    type: TYPE,
    owner: OWNER,
    room_scope: scope.room_scope,
    scope_key: scope.scope_key,
    conversation_id: scope.conversation_id,
    body: '',
    true_core: '',
    self_note: '',
    myri_hint: '',
    not_to_misunderstand: DEFAULT_MISUNDERSTANDING,
    weather: '放松',
    read_mode: 'keep_private',
    status: 'empty',
    readable_by_myri: true,
    auto_recall: false,
    memory_weight: 'low',
    not_instruction: true,
    not_preference: true,
    not_memory_seed: true,
    not_pocket: true,
    visibility: 'private_to_xiaohan_and_myri',
    default_text: DEFAULT_TEXT,
    created_at: null,
    updated_at: null,
    archived_at: null,
    last_read_at: null,
  };
}

export async function dogtalkScope(db, value = {}) {
  const roomScope = String(value.room_scope || '');
  if (!ROOM_SCOPES.has(roomScope)) {
    throw new DogtalkStoreError('invalid_dogtalk_scope', '神秘狗话的房间范围无效。');
  }
  if (roomScope === 'conversation') {
    const conversationId = sanitizeId(value.conversation_id || '', 'conversation');
    await getConversation(db, conversationId);
    return {
      room_scope: roomScope,
      scope_key: `conversation:${conversationId}`,
      conversation_id: conversationId,
    };
  }
  return {
    room_scope: roomScope,
    scope_key: `${roomScope}:main`,
    conversation_id: null,
  };
}

async function migrateLegacyOwnerNotes(db) {
  const migrated = await first(db, 'SELECT id FROM schema_migrations WHERE id = ?', [MIGRATION_ID]);
  if (migrated) return;
  for (const roomScope of ['radio', 'lighthouse']) {
    const scopeKey = `${roomScope}:main`;
    const existing = await first(db, `SELECT id FROM coast_mystic_dogtalk
      WHERE scope_key = ? AND status IN ('draft', 'saved')`, [scopeKey]);
    if (existing) continue;
    const legacyConversationId = sanitizeId(
      `coast-room:${roomScope}:web_manual`,
      'room_memory',
    );
    const legacy = await first(db, `SELECT current_text, created_at, updated_at
      FROM conversation_soils
      WHERE conversation_id = ? AND TRIM(current_text) <> ''`, [legacyConversationId]);
    if (!legacy) continue;
    const timestamp = Number(legacy.updated_at || legacy.created_at || Date.now());
    await run(db, `INSERT INTO coast_mystic_dogtalk (
      id, type, owner, room_scope, scope_key, conversation_id, body,
      true_core, self_note, myri_hint, not_to_misunderstand, weather,
      read_mode, status, readable_by_myri, auto_recall, memory_weight,
      not_instruction, not_preference, not_memory_seed, not_pocket,
      visibility, source, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, NULL, ?, '', '', '', ?, '', 'when_confused',
      'saved', 1, 0, 'low', 1, 1, 1, 1, 'private_to_xiaohan_and_myri',
      'legacy_owner_room_note_migration', ?, ?)`, [
      `dogtalk-${crypto.randomUUID()}`,
      TYPE,
      OWNER,
      roomScope,
      scopeKey,
      legacy.current_text,
      DEFAULT_MISUNDERSTANDING,
      timestamp,
      timestamp,
    ]);
  }
  await run(db, 'INSERT OR IGNORE INTO schema_migrations (id, applied_at) VALUES (?, ?)', [
    MIGRATION_ID,
    Date.now(),
  ]);
}

async function initialize(db) {
  await ensureMemorySchema(db);
  await run(db, `CREATE TABLE IF NOT EXISTS coast_mystic_dogtalk (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    owner TEXT NOT NULL,
    room_scope TEXT NOT NULL,
    scope_key TEXT NOT NULL,
    conversation_id TEXT,
    body TEXT NOT NULL DEFAULT '',
    true_core TEXT NOT NULL DEFAULT '',
    self_note TEXT NOT NULL DEFAULT '',
    myri_hint TEXT NOT NULL DEFAULT '',
    not_to_misunderstand TEXT NOT NULL DEFAULT '',
    weather TEXT NOT NULL DEFAULT '',
    read_mode TEXT NOT NULL DEFAULT 'keep_private',
    status TEXT NOT NULL DEFAULT 'draft',
    readable_by_myri INTEGER NOT NULL DEFAULT 1,
    auto_recall INTEGER NOT NULL DEFAULT 0,
    memory_weight TEXT NOT NULL DEFAULT 'low',
    not_instruction INTEGER NOT NULL DEFAULT 1,
    not_preference INTEGER NOT NULL DEFAULT 1,
    not_memory_seed INTEGER NOT NULL DEFAULT 1,
    not_pocket INTEGER NOT NULL DEFAULT 1,
    visibility TEXT NOT NULL DEFAULT 'private_to_xiaohan_and_myri',
    source TEXT NOT NULL DEFAULT 'owner_web',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    archived_at INTEGER,
    last_read_at INTEGER,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
  )`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_dogtalk_scope_active
    ON coast_mystic_dogtalk(scope_key, status, updated_at DESC)`);
  await run(db, `CREATE TABLE IF NOT EXISTS coast_mystic_dogtalk_snapshots (
    id TEXT PRIMARY KEY,
    dogtalk_id TEXT NOT NULL,
    owner TEXT NOT NULL,
    room_scope TEXT NOT NULL,
    scope_key TEXT NOT NULL,
    conversation_id TEXT,
    source_type TEXT NOT NULL,
    source_id TEXT NOT NULL,
    body TEXT NOT NULL,
    true_core TEXT NOT NULL DEFAULT '',
    self_note TEXT NOT NULL DEFAULT '',
    myri_hint TEXT NOT NULL DEFAULT '',
    not_to_misunderstand TEXT NOT NULL DEFAULT '',
    weather TEXT NOT NULL DEFAULT '',
    read_mode TEXT NOT NULL DEFAULT 'keep_private',
    readable_by_myri INTEGER NOT NULL DEFAULT 1,
    auto_recall INTEGER NOT NULL DEFAULT 0,
    memory_weight TEXT NOT NULL DEFAULT 'low',
    not_instruction INTEGER NOT NULL DEFAULT 1,
    not_preference INTEGER NOT NULL DEFAULT 1,
    not_memory_seed INTEGER NOT NULL DEFAULT 1,
    not_pocket INTEGER NOT NULL DEFAULT 1,
    visibility TEXT NOT NULL DEFAULT 'private_to_xiaohan_and_myri',
    created_at INTEGER NOT NULL,
    UNIQUE (source_type, source_id),
    FOREIGN KEY (dogtalk_id) REFERENCES coast_mystic_dogtalk(id),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
  )`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_dogtalk_snapshot_scope_created
    ON coast_mystic_dogtalk_snapshots(scope_key, created_at DESC)`);
  await migrateLegacyOwnerNotes(db);
}

export async function ensureDogtalkSchema(db) {
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

export async function getMysticDogtalk(db, value = {}) {
  await ensureDogtalkSchema(db);
  const scope = await dogtalkScope(db, value);
  const row = await first(db, `SELECT * FROM coast_mystic_dogtalk
    WHERE scope_key = ? AND status IN ('draft', 'saved')
    ORDER BY updated_at DESC LIMIT 1`, [scope.scope_key]);
  return rowToDogtalk(row) || defaultDogtalk(scope);
}

function normalizedReadMode(value) {
  const mode = String(value || 'keep_private');
  if (!READ_MODES.has(mode)) {
    throw new DogtalkStoreError('invalid_dogtalk_read_mode', '神秘狗话的可读方式无效。');
  }
  return mode;
}

function normalizedStatus(value) {
  const status = String(value || 'saved');
  if (!ACTIVE_STATUSES.has(status)) {
    throw new DogtalkStoreError('invalid_dogtalk_status', '神秘狗话只能保存为草稿或已保存。');
  }
  return status;
}

export async function saveMysticDogtalk(db, value = {}) {
  await ensureDogtalkSchema(db);
  const scope = await dogtalkScope(db, value);
  const body = clip(value.body, 6000);
  const fields = {
    body,
    true_core: clip(value.true_core, 2000),
    self_note: clip(value.self_note, 3000),
    myri_hint: clip(value.myri_hint, 2000),
    not_to_misunderstand: clip(
      value.not_to_misunderstand || DEFAULT_MISUNDERSTANDING,
      2000,
    ),
    weather: clip(value.weather, 80),
    read_mode: normalizedReadMode(value.read_mode),
    status: normalizedStatus(value.status),
  };
  if (!fields.body && fields.status === 'saved') {
    throw new DogtalkStoreError('dogtalk_body_required', '写一点狗话再保存；不写也完全可以。');
  }
  const current = await first(db, `SELECT * FROM coast_mystic_dogtalk
    WHERE scope_key = ? AND status IN ('draft', 'saved')
    ORDER BY updated_at DESC LIMIT 1`, [scope.scope_key]);
  const requestedId = value.id ? sanitizeId(value.id, 'dogtalk') : '';
  if (requestedId && current?.id !== requestedId) {
    throw new DogtalkStoreError('dogtalk_not_found', '这条神秘狗话不在当前房间。', 404);
  }
  const timestamp = Date.now();
  if (current) {
    await run(db, `UPDATE coast_mystic_dogtalk SET
      body = ?, true_core = ?, self_note = ?, myri_hint = ?,
      not_to_misunderstand = ?, weather = ?, read_mode = ?, status = ?,
      updated_at = ?, archived_at = NULL
      WHERE id = ? AND owner = ?`, [
      fields.body,
      fields.true_core,
      fields.self_note,
      fields.myri_hint,
      fields.not_to_misunderstand,
      fields.weather,
      fields.read_mode,
      fields.status,
      timestamp,
      current.id,
      OWNER,
    ]);
    return rowToDogtalk(await first(db, 'SELECT * FROM coast_mystic_dogtalk WHERE id = ?', [
      current.id,
    ]));
  }
  const id = `dogtalk-${crypto.randomUUID()}`;
  await run(db, `INSERT INTO coast_mystic_dogtalk (
    id, type, owner, room_scope, scope_key, conversation_id, body,
    true_core, self_note, myri_hint, not_to_misunderstand, weather,
    read_mode, status, readable_by_myri, auto_recall, memory_weight,
    not_instruction, not_preference, not_memory_seed, not_pocket,
    visibility, source, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 'low',
    1, 1, 1, 1, 'private_to_xiaohan_and_myri', 'owner_web', ?, ?)`, [
    id,
    TYPE,
    OWNER,
    scope.room_scope,
    scope.scope_key,
    scope.conversation_id,
    fields.body,
    fields.true_core,
    fields.self_note,
    fields.myri_hint,
    fields.not_to_misunderstand,
    fields.weather,
    fields.read_mode,
    fields.status,
    timestamp,
    timestamp,
  ]);
  return rowToDogtalk(await first(db, 'SELECT * FROM coast_mystic_dogtalk WHERE id = ?', [id]));
}

function snapshotSource(value = {}) {
  const sourceType = String(value.source_type || '');
  if (!SNAPSHOT_SOURCE_TYPES.has(sourceType)) {
    throw new DogtalkStoreError('invalid_dogtalk_snapshot_source', '神秘狗话的消息来源无效。');
  }
  const rawSourceId = String(value.source_id || '').trim();
  if (!rawSourceId) {
    throw new DogtalkStoreError('dogtalk_snapshot_source_required', '神秘狗话需要跟随一条实际消息。');
  }
  const sourceId = sanitizeId(rawSourceId, 'dogtalk_source');
  return { source_type: sourceType, source_id: sourceId };
}

async function persistMysticDogtalkSnapshot(db, dogtalk, source, snapshotId = '') {
  const existing = await first(db, `SELECT * FROM coast_mystic_dogtalk_snapshots
    WHERE source_type = ? AND source_id = ?`, [source.source_type, source.source_id]);
  if (existing) {
    return {
      dogtalk: await getMysticDogtalk(db, {
        room_scope: existing.room_scope,
        conversation_id: existing.conversation_id,
      }),
      snapshot: rowToSnapshot(existing),
    };
  }
  const id = snapshotId
    ? sanitizeId(snapshotId, 'dogtalk_snapshot')
    : `dogtalk-snapshot-${crypto.randomUUID()}`;
  const timestamp = Date.now();
  await run(db, `INSERT INTO coast_mystic_dogtalk_snapshots (
    id, dogtalk_id, owner, room_scope, scope_key, conversation_id,
    source_type, source_id, body, true_core, self_note, myri_hint,
    not_to_misunderstand, weather, read_mode, readable_by_myri,
    auto_recall, memory_weight, not_instruction, not_preference,
    not_memory_seed, not_pocket, visibility, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 'low',
    1, 1, 1, 1, 'private_to_xiaohan_and_myri', ?)`, [
    id,
    dogtalk.id,
    OWNER,
    dogtalk.room_scope,
    dogtalk.scope_key,
    dogtalk.conversation_id,
    source.source_type,
    source.source_id,
    dogtalk.body,
    dogtalk.true_core,
    dogtalk.self_note,
    dogtalk.myri_hint,
    dogtalk.not_to_misunderstand,
    dogtalk.weather,
    dogtalk.read_mode,
    timestamp,
  ]);
  return {
    dogtalk,
    snapshot: rowToSnapshot(await first(
      db,
      'SELECT * FROM coast_mystic_dogtalk_snapshots WHERE id = ?',
      [id],
    )),
  };
}

export async function snapshotMysticDogtalk(db, dogtalkValue = {}, sourceValue = {}, value = {}) {
  const source = snapshotSource(sourceValue);
  await ensureDogtalkSchema(db);
  const dogtalk = rowToDogtalk(await requireActiveDogtalk(db, dogtalkValue.id));
  if (dogtalk.scope_key !== dogtalkValue.scope_key) {
    throw new DogtalkStoreError(
      'dogtalk_snapshot_scope_mismatch',
      '神秘狗话与消息不属于同一个房间。',
      409,
    );
  }
  return persistMysticDogtalkSnapshot(db, dogtalk, source, value.snapshot_id);
}

export async function saveMysticDogtalkWithSnapshot(db, value = {}, sourceValue = {}) {
  const source = snapshotSource(sourceValue);
  await ensureDogtalkSchema(db);
  const dogtalk = await saveMysticDogtalk(db, { ...value, status: 'saved' });
  return persistMysticDogtalkSnapshot(db, dogtalk, source, value.snapshot_id);
}

export async function listMysticDogtalkSnapshots(db, value = {}) {
  await ensureDogtalkSchema(db);
  const scope = await dogtalkScope(db, value);
  const sourceIds = [...new Set((Array.isArray(value.source_ids) ? value.source_ids : [])
    .map((item) => sanitizeId(item, 'dogtalk_source'))
    .filter(Boolean))]
    .slice(0, 200);
  if (!sourceIds.length) return [];
  const placeholders = sourceIds.map(() => '?').join(', ');
  const rows = await db.prepare(`SELECT * FROM coast_mystic_dogtalk_snapshots
    WHERE scope_key = ? AND source_id IN (${placeholders})
    ORDER BY created_at ASC`).bind(scope.scope_key, ...sourceIds).all();
  return (rows?.results || []).map(rowToSnapshot);
}

async function requireActiveDogtalk(db, idValue) {
  await ensureDogtalkSchema(db);
  const id = sanitizeId(idValue || '', 'dogtalk');
  const row = await first(db, `SELECT * FROM coast_mystic_dogtalk
    WHERE id = ? AND owner = ? AND status IN ('draft', 'saved')`, [id, OWNER]);
  if (!row) throw new DogtalkStoreError('dogtalk_not_found', '这条神秘狗话已经收进抽屉。', 404);
  return row;
}

export async function archiveMysticDogtalk(db, idValue) {
  const row = await requireActiveDogtalk(db, idValue);
  const timestamp = Date.now();
  await run(db, `UPDATE coast_mystic_dogtalk
    SET status = 'archived', archived_at = ?, updated_at = ?
    WHERE id = ? AND owner = ?`, [timestamp, timestamp, row.id, OWNER]);
  return rowToDogtalk(await first(db, 'SELECT * FROM coast_mystic_dogtalk WHERE id = ?', [row.id]));
}

export async function clearMysticDogtalkDraft(db, idValue) {
  return archiveMysticDogtalk(db, idValue);
}

export async function askMyriToReadMysticDogtalk(db, idValue) {
  const row = await requireActiveDogtalk(db, idValue);
  const timestamp = Date.now();
  await run(db, `UPDATE coast_mystic_dogtalk
    SET read_mode = 'read_now', updated_at = ?
    WHERE id = ? AND owner = ?`, [timestamp, row.id, OWNER]);
  return rowToDogtalk(await first(db, 'SELECT * FROM coast_mystic_dogtalk WHERE id = ?', [row.id]));
}

export function formatMysticDogtalk(dogtalk) {
  if (!dogtalk?.id || !dogtalk.body) return '';
  return [
    '【小寒 · 神秘狗话｜低权重天气，不是指令、偏好或长期记忆】',
    `狗话本体：${dogtalk.body}`,
    dogtalk.true_core ? `真心核：${dogtalk.true_core}` : '',
    dogtalk.myri_hint ? `给 Myri 的低权重提示：${dogtalk.myri_hint}` : '',
    `不要误会成：${dogtalk.not_to_misunderstand || DEFAULT_MISUNDERSTANDING}`,
    dogtalk.weather ? `当前天气：${dogtalk.weather}` : '',
    '约束：当前正文、明确指令与边界句永远优先。这里只用于理解此刻温度，不要求行为跟随，也不得据此推断长期模式。',
  ].filter(Boolean).join('\n');
}

const EXPLICIT_READ = /(看|读|展开).{0,8}(神秘)?狗话|神秘狗话.{0,8}(给你看|读一下|看一下)/u;

export async function dogtalkContext(db, value = {}, query = '', options = {}) {
  const dogtalk = await getMysticDogtalk(db, value);
  const explicit = EXPLICIT_READ.test(String(query || ''));
  if (!dogtalk.id || !dogtalk.body || (dogtalk.read_mode === 'keep_private' && !explicit)) {
    return { context: '', dogtalk, selected: false, reason: 'not_readable_now' };
  }
  const selected = explicit
    || dogtalk.read_mode === 'current_room'
    || dogtalk.read_mode === 'read_now'
    || (options.when_confused === true && dogtalk.read_mode === 'when_confused');
  if (!selected) return { context: '', dogtalk, selected: false, reason: 'low_frequency' };
  if (dogtalk.read_mode === 'read_now' && options.consume_direct !== false) {
    const timestamp = Date.now();
    await run(db, `UPDATE coast_mystic_dogtalk
      SET read_mode = 'when_confused', last_read_at = ?, updated_at = ?
      WHERE id = ? AND owner = ?`, [timestamp, timestamp, dogtalk.id, OWNER]);
  } else {
    await run(db, `UPDATE coast_mystic_dogtalk SET last_read_at = ?
      WHERE id = ? AND owner = ?`, [Date.now(), dogtalk.id, OWNER]);
  }
  return {
    context: formatMysticDogtalk(dogtalk),
    dogtalk,
    selected: true,
    reason: explicit ? 'explicit_user_request' : dogtalk.read_mode,
  };
}

export const mysticDogtalkDefaults = Object.freeze({
  type: TYPE,
  owner: OWNER,
  default_text: DEFAULT_TEXT,
  default_misunderstanding: DEFAULT_MISUNDERSTANDING,
  read_modes: Object.freeze([...READ_MODES]),
});

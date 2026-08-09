import { DEFAULT_CONTEXT_SETTINGS, ensureContextSchema } from './context-schema.js';

const MODE_SCOPES = new Set(['owner', 'visitor']);
const CALENDAR_INJECTION = new Set(['off', 'today_only', 'only_when_events', 'manual']);

export class ContextModeError extends Error {
  constructor(type, message, status = 400) {
    super(message);
    this.name = 'ContextModeError';
    this.type = type;
    this.status = status;
  }
}

async function run(db, sql, params = []) { return db.prepare(sql).bind(...params).run(); }
async function first(db, sql, params = []) { return db.prepare(sql).bind(...params).first(); }
async function all(db, sql, params = []) {
  const result = await db.prepare(sql).bind(...params).all();
  return result?.results || [];
}
function clip(value, max) { return String(value ?? '').trim().slice(0, max); }
function parseJson(value, fallback) { try { return JSON.parse(value || '') ?? fallback; } catch { return fallback; } }
function bool(value, fallback) { return value == null ? fallback : value === true || Number(value) === 1; }
function integer(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.trunc(number))) : fallback;
}
function stringList(value, max = 40) {
  return [...new Set((Array.isArray(value) ? value : []).map((item) => clip(item, 100)).filter(Boolean))].slice(0, max);
}

function cardFromRow(row) {
  return {
    id: row.id,
    mode_key: row.mode_key,
    title: row.title,
    description: row.description || '',
    prompt: row.prompt,
    enabled: Number(row.enabled || 0) === 1,
    scope: row.scope,
    tool_allowlist: stringList(parseJson(row.tool_allowlist_json, [])),
    worldbook_scope: row.worldbook_scope || null,
    default_context_settings: parseJson(row.default_context_settings_json, {}),
    created_at: new Date(Number(row.created_at)).toISOString(),
    updated_at: new Date(Number(row.updated_at)).toISOString(),
  };
}

export function normalizeContextSettings(value = {}, defaults = DEFAULT_CONTEXT_SETTINGS) {
  const ambientValue = value.ambient && typeof value.ambient === 'object' ? value.ambient : {};
  const ambientDefaults = defaults.ambient || DEFAULT_CONTEXT_SETTINGS.ambient;
  const requestedCalendar = String(value.calendar_injection ?? defaults.calendar_injection);
  return {
    ambient: {
      time: bool(ambientValue.time, ambientDefaults.time),
      calendar: bool(ambientValue.calendar, ambientDefaults.calendar),
      tools: bool(ambientValue.tools, ambientDefaults.tools),
      room: bool(ambientValue.room, ambientDefaults.room),
      model: bool(ambientValue.model, ambientDefaults.model),
    },
    calendar_injection: CALENDAR_INJECTION.has(requestedCalendar) ? requestedCalendar : 'only_when_events',
    worldbook_enabled: bool(value.worldbook_enabled, defaults.worldbook_enabled),
    memory_facets_enabled: bool(value.memory_facets_enabled, defaults.memory_facets_enabled),
    context_debug: bool(value.context_debug, defaults.context_debug),
    context_budget: integer(value.context_budget, defaults.context_budget, 1000, 48000),
    recent_message_turns: integer(value.recent_message_turns, defaults.recent_message_turns, 2, 40),
    soil_budget: integer(value.soil_budget, defaults.soil_budget, 200, 2400),
    worldbook_limit: integer(value.worldbook_limit, defaults.worldbook_limit, 0, 6),
    memory_limit: integer(value.memory_limit, defaults.memory_limit, 0, 12),
  };
}

async function requireModeRow(db, modeKey, { allowDisabled = false } = {}) {
  const key = clip(modeKey, 80);
  const row = await first(db, `SELECT * FROM coast_mode_cards WHERE mode_key = ?${allowDisabled ? '' : ' AND enabled = 1'}`, [key]);
  if (!row) throw new ContextModeError('mode_not_found', '这张情境卡不存在或已停用。', 404);
  return row;
}

export async function listModeCards(db, { include_disabled: includeDisabled = true } = {}) {
  await ensureContextSchema(db);
  const rows = await all(db, `SELECT * FROM coast_mode_cards${includeDisabled ? '' : ' WHERE enabled = 1'} ORDER BY created_at ASC`);
  return rows.map(cardFromRow);
}

export async function getModeCard(db, modeKey = 'normal_chat') {
  await ensureContextSchema(db);
  return cardFromRow(await requireModeRow(db, modeKey));
}

export async function getContextState(db, { conversation_id: conversationId } = {}) {
  await ensureContextSchema(db);
  const scopeId = clip(conversationId, 200) ? `conversation:${clip(conversationId, 200)}` : 'owner';
  const [specific, owner] = await Promise.all([
    first(db, 'SELECT * FROM coast_context_state WHERE scope_id = ?', [scopeId]),
    first(db, "SELECT * FROM coast_context_state WHERE scope_id = 'owner'"),
  ]);
  const state = specific || owner;
  const mode = await getModeCard(db, state?.current_mode_key || 'normal_chat');
  return {
    scope_id: scopeId,
    mode,
    settings: normalizeContextSettings(parseJson(state?.settings_json, {})),
    updated_at: state?.updated_at ? new Date(Number(state.updated_at)).toISOString() : null,
  };
}

export async function setCurrentMode(db, modeKey, { conversation_id: conversationId, settings } = {}) {
  await ensureContextSchema(db);
  const mode = cardFromRow(await requireModeRow(db, modeKey));
  const scopeId = clip(conversationId, 200) ? `conversation:${clip(conversationId, 200)}` : 'owner';
  const current = await getContextState(db, { conversation_id: conversationId });
  const nextSettings = settings ? normalizeContextSettings(settings, current.settings) : current.settings;
  const timestamp = Date.now();
  await run(db, `INSERT INTO coast_context_state (scope_id, current_mode_key, settings_json, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(scope_id) DO UPDATE SET
      current_mode_key = excluded.current_mode_key,
      settings_json = excluded.settings_json,
      updated_at = excluded.updated_at`, [scopeId, mode.mode_key, JSON.stringify(nextSettings), timestamp]);
  return { scope_id: scopeId, mode, settings: nextSettings, updated_at: new Date(timestamp).toISOString() };
}

export async function createModeCard(db, value = {}) {
  await ensureContextSchema(db);
  const modeKey = clip(value.mode_key, 80).replace(/[^a-z0-9_-]/g, '_');
  const title = clip(value.title, 120);
  const prompt = clip(value.prompt, 8000);
  if (!modeKey || !title || !prompt) throw new ContextModeError('mode_fields_required', '情境卡键、标题与提示不能为空。');
  const scope = MODE_SCOPES.has(value.scope) ? value.scope : 'owner';
  const timestamp = Date.now();
  try {
    await run(db, `INSERT INTO coast_mode_cards (
      id, mode_key, title, description, prompt, enabled, scope,
      tool_allowlist_json, worldbook_scope, default_context_settings_json,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      `mode_${crypto.randomUUID()}`, modeKey, title, clip(value.description, 1000), prompt,
      bool(value.enabled, true) ? 1 : 0, scope, JSON.stringify(stringList(value.tool_allowlist)),
      clip(value.worldbook_scope, 60) || null,
      JSON.stringify(value.default_context_settings || {}), timestamp, timestamp,
    ]);
  } catch (error) {
    if (/UNIQUE/i.test(String(error?.message))) throw new ContextModeError('mode_exists', '情境卡键已经存在。', 409);
    throw error;
  }
  return getModeCard(db, modeKey);
}

export async function updateModeCard(db, modeKey, value = {}) {
  await ensureContextSchema(db);
  const row = await requireModeRow(db, modeKey, { allowDisabled: true });
  const current = cardFromRow(row);
  if (row.mode_key === 'normal_chat' && value.enabled === false) {
    throw new ContextModeError('normal_mode_required', '普通聊天是海岸的必备情境，不能停用。', 409);
  }
  const title = value.title == null ? current.title : clip(value.title, 120);
  const prompt = value.prompt == null ? current.prompt : clip(value.prompt, 8000);
  if (!title || !prompt) throw new ContextModeError('mode_fields_required', '情境卡标题与提示不能为空。');
  await run(db, `UPDATE coast_mode_cards SET
    title = ?, description = ?, prompt = ?, enabled = ?, scope = ?,
    tool_allowlist_json = ?, worldbook_scope = ?, default_context_settings_json = ?, updated_at = ?
    WHERE mode_key = ?`, [
    title,
    value.description == null ? current.description : clip(value.description, 1000),
    prompt,
    bool(value.enabled, current.enabled) ? 1 : 0,
    MODE_SCOPES.has(value.scope) ? value.scope : current.scope,
    JSON.stringify(value.tool_allowlist == null ? current.tool_allowlist : stringList(value.tool_allowlist)),
    value.worldbook_scope == null ? current.worldbook_scope : clip(value.worldbook_scope, 60) || null,
    JSON.stringify(value.default_context_settings == null ? current.default_context_settings : value.default_context_settings),
    Date.now(), row.mode_key,
  ]);
  return cardFromRow(await requireModeRow(db, row.mode_key, { allowDisabled: true }));
}

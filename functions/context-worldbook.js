import { ensureContextSchema } from './context-schema.js';

const SCOPES = new Set([
  'owner', 'visitor', 'both', 'construction', 'mailbox', 'calendar',
  'lighthouse', 'radio', 'official_mcp', 'daily',
]);
const POSITIONS = new Set(['before_memory', 'after_memory']);
const MAX_CONSTANT_ENTRIES = 4;

export class WorldbookError extends Error {
  constructor(type, message, status = 400) {
    super(message);
    this.name = 'WorldbookError';
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
function bool(value, fallback = false) { return value == null ? fallback : value === true || Number(value) === 1; }
function integer(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.trunc(number))) : fallback;
}
function parseJson(value, fallback) { try { return JSON.parse(value || '') ?? fallback; } catch { return fallback; } }
function keywords(value) {
  return [...new Set((Array.isArray(value) ? value : []).map((item) => clip(item, 160)).filter(Boolean))].slice(0, 30);
}
function entryFromRow(row) {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    keywords: keywords(parseJson(row.keywords_json, [])),
    use_regex: Number(row.use_regex || 0) === 1,
    case_sensitive: Number(row.case_sensitive || 0) === 1,
    constant_active: Number(row.constant_active || 0) === 1,
    priority: Number(row.priority || 0),
    scan_depth: Number(row.scan_depth || 4),
    inject_position: row.inject_position,
    enabled: Number(row.enabled || 0) === 1,
    scope: row.scope,
    visitor_safe: Number(row.visitor_safe || 0) === 1,
    created_at: new Date(Number(row.created_at)).toISOString(),
    updated_at: new Date(Number(row.updated_at)).toISOString(),
  };
}

function normalized(value = {}, defaults = {}) {
  const title = clip(value.title ?? defaults.title, 160);
  const content = clip(value.content ?? defaults.content, 12000);
  if (!title || !content) throw new WorldbookError('worldbook_fields_required', '词条标题与内容不能为空。');
  const scope = SCOPES.has(value.scope) ? value.scope : defaults.scope || 'owner';
  const position = POSITIONS.has(value.inject_position) ? value.inject_position : defaults.inject_position || 'before_memory';
  const regex = bool(value.use_regex, defaults.use_regex);
  const list = value.keywords == null ? defaults.keywords || [] : keywords(value.keywords);
  if (regex) {
    for (const pattern of list) {
      try { new RegExp(pattern, bool(value.case_sensitive, defaults.case_sensitive) ? '' : 'i'); }
      catch { throw new WorldbookError('worldbook_regex_invalid', `正则表达式无效：${pattern}`); }
    }
  }
  return {
    title,
    content,
    keywords: list,
    use_regex: regex,
    case_sensitive: bool(value.case_sensitive, defaults.case_sensitive),
    constant_active: bool(value.constant_active, defaults.constant_active),
    priority: integer(value.priority, defaults.priority || 0, -1000, 1000),
    scan_depth: integer(value.scan_depth, defaults.scan_depth || 4, 1, 20),
    inject_position: position,
    enabled: bool(value.enabled, defaults.enabled ?? true),
    scope,
    visitor_safe: bool(value.visitor_safe, defaults.visitor_safe),
  };
}

async function requireRow(db, id) {
  const row = await first(db, 'SELECT * FROM coast_worldbook_entries WHERE id = ?', [clip(id, 180)]);
  if (!row) throw new WorldbookError('worldbook_not_found', '这条海岸词典词条不存在。', 404);
  return row;
}

async function assertConstantCapacity(db, entry, excludingId = '') {
  if (!entry.enabled || !entry.constant_active) return;
  const row = await first(db, `SELECT COUNT(*) AS count FROM coast_worldbook_entries
    WHERE enabled = 1 AND constant_active = 1${excludingId ? ' AND id <> ?' : ''}`, excludingId ? [excludingId] : []);
  if (Number(row?.count || 0) >= MAX_CONSTANT_ENTRIES) {
    throw new WorldbookError('worldbook_constant_limit', `常驻词条最多 ${MAX_CONSTANT_ENTRIES} 条，请先停用一条。`, 409);
  }
}

export async function listWorldbookEntries(db, { include_disabled: includeDisabled = true } = {}) {
  await ensureContextSchema(db);
  const rows = await all(db, `SELECT * FROM coast_worldbook_entries${includeDisabled ? '' : ' WHERE enabled = 1'} ORDER BY priority DESC, title ASC`);
  return rows.map(entryFromRow);
}

export async function createWorldbookEntry(db, value = {}) {
  await ensureContextSchema(db);
  const entry = normalized(value);
  await assertConstantCapacity(db, entry);
  const id = clip(value.id, 180) || `world_${crypto.randomUUID()}`;
  const timestamp = Date.now();
  await run(db, `INSERT INTO coast_worldbook_entries (
    id, title, content, keywords_json, use_regex, case_sensitive, constant_active,
    priority, scan_depth, inject_position, enabled, scope, visitor_safe,
    created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    id, entry.title, entry.content, JSON.stringify(entry.keywords), entry.use_regex ? 1 : 0,
    entry.case_sensitive ? 1 : 0, entry.constant_active ? 1 : 0, entry.priority,
    entry.scan_depth, entry.inject_position, entry.enabled ? 1 : 0, entry.scope,
    entry.visitor_safe ? 1 : 0, timestamp, timestamp,
  ]);
  return entryFromRow(await requireRow(db, id));
}

export async function updateWorldbookEntry(db, id, value = {}) {
  await ensureContextSchema(db);
  const row = await requireRow(db, id);
  const entry = normalized(value, entryFromRow(row));
  await assertConstantCapacity(db, entry, row.id);
  await run(db, `UPDATE coast_worldbook_entries SET
    title = ?, content = ?, keywords_json = ?, use_regex = ?, case_sensitive = ?,
    constant_active = ?, priority = ?, scan_depth = ?, inject_position = ?, enabled = ?,
    scope = ?, visitor_safe = ?, updated_at = ? WHERE id = ?`, [
    entry.title, entry.content, JSON.stringify(entry.keywords), entry.use_regex ? 1 : 0,
    entry.case_sensitive ? 1 : 0, entry.constant_active ? 1 : 0, entry.priority,
    entry.scan_depth, entry.inject_position, entry.enabled ? 1 : 0, entry.scope,
    entry.visitor_safe ? 1 : 0, Date.now(), row.id,
  ]);
  return entryFromRow(await requireRow(db, row.id));
}

export async function deleteWorldbookEntry(db, id) {
  await ensureContextSchema(db);
  const row = await requireRow(db, id);
  await run(db, 'UPDATE coast_worldbook_entries SET enabled = 0, updated_at = ? WHERE id = ?', [Date.now(), row.id]);
  return entryFromRow(await requireRow(db, row.id));
}

function inScope(entry, {
  surface = 'main_chat',
  worldbook_scope: modeScope,
  allowed_scopes: allowedScopes,
} = {}) {
  const visitor = surface === 'mailbox_visitor';
  if (visitor) return entry.visitor_safe && ['visitor', 'both'].includes(entry.scope);
  if (Array.isArray(allowedScopes) && allowedScopes.length) return allowedScopes.includes(entry.scope);
  if (entry.scope === 'visitor') return false;
  if (['owner', 'both'].includes(entry.scope)) return true;
  if (entry.scope === 'mailbox') return surface === 'mailbox_owner';
  if (entry.scope === 'calendar') return surface === 'calendar' || modeScope === 'calendar';
  if (entry.scope === 'lighthouse') return surface === 'lighthouse';
  if (entry.scope === 'radio') return surface === 'radio';
  if (entry.scope === 'official_mcp') return surface === 'official_mcp';
  if (entry.scope === 'daily') return surface === 'daily';
  if (entry.scope === 'construction') return modeScope === 'construction';
  return entry.scope === modeScope;
}

function matches(entry, text) {
  if (entry.constant_active) return { matched: true, triggers: ['constant_active'] };
  const haystack = entry.case_sensitive ? text : text.toLocaleLowerCase('zh-CN');
  const triggers = [];
  for (const keyword of entry.keywords) {
    if (entry.use_regex) {
      try {
        if (new RegExp(keyword, entry.case_sensitive ? '' : 'i').test(text)) triggers.push(keyword);
      } catch { /* invalid regexes are rejected on write */ }
    } else {
      const needle = entry.case_sensitive ? keyword : keyword.toLocaleLowerCase('zh-CN');
      if (needle && haystack.includes(needle)) triggers.push(keyword);
    }
  }
  return { matched: triggers.length > 0, triggers };
}

export async function matchWorldbook(db, {
  input = '',
  messages = [],
  surface_text: surfaceText = [],
  surface = 'main_chat',
  worldbook_scope: modeScope = 'owner',
  allowed_scopes: allowedScopes,
  limit = 6,
} = {}) {
  await ensureContextSchema(db);
  const entries = await listWorldbookEntries(db, { include_disabled: false });
  const matched = [];
  for (const entry of entries) {
    if (!inScope(entry, { surface, worldbook_scope: modeScope, allowed_scopes: allowedScopes })) continue;
    if (entry.constant_active) {
      matched.push({
        ...entry,
        matched_keywords: ['constant_active'],
        matched_source: 'constant_active',
        match_reason: 'constant_active',
      });
      continue;
    }
    const inputResult = matches(entry, String(input || ''));
    if (inputResult.matched) {
      matched.push({
        ...entry,
        matched_keywords: inputResult.triggers,
        matched_source: 'user_input',
        match_reason: 'keyword',
      });
      continue;
    }
    const recent = (Array.isArray(messages) ? messages : [])
      .filter((message) => ['user', 'assistant'].includes(message?.role))
      .slice(-entry.scan_depth);
    const recentResult = matches(entry, recent.map((message) => message.content || '').join('\n'));
    if (recentResult.matched) {
      matched.push({
        ...entry,
        matched_keywords: recentResult.triggers,
        matched_source: 'recent_message',
        match_reason: 'keyword',
      });
      continue;
    }
    const explicitResult = matches(entry, (Array.isArray(surfaceText) ? surfaceText : []).join('\n'));
    if (explicitResult.matched) {
      matched.push({
        ...entry,
        matched_keywords: explicitResult.triggers,
        matched_source: 'explicit_surface',
        match_reason: 'keyword',
      });
    }
  }
  return matched
    .sort((a, b) => b.priority - a.priority || a.title.localeCompare(b.title, 'zh-CN'))
    .slice(0, Math.min(6, Math.max(0, Number(limit) || 0)));
}

export function formatWorldbookContext(entries = []) {
  if (!entries.length) return '';
  return ['【海岸词典】', ...entries.map((entry) => `- ${entry.title}：${entry.content}`)].join('\n');
}

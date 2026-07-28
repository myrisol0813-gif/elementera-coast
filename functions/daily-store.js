import { ensureDailySchema } from './daily-schema.js';

const MOMENT_AUTHORS = new Set(['xiaohan', 'myri', 'api', 'mcp']);
const DIARY_AUTHORS = new Set(['xiaohan', 'api', 'mcp']);
const SOURCES = new Set(['manual', 'chat_tool', 'daily_summary']);
const DIARY_SOURCES = new Set(['manual', 'daily_summary']);
const MOMENT_STATUSES = new Set(['draft', 'candidate', 'published']);
const ALBUM_CATEGORIES = new Set(['xiaohan', 'myri', 'together']);
const COMMENT_AUTHORS = new Set(['xiaohan', 'myri', 'api', 'mcp']);
const MAX_TEXT = 24000;
const MAX_IMAGE_REF = 2048;

export class DailyStoreError extends Error {
  constructor(type, message, status = 400, details = {}) {
    super(message);
    this.name = 'DailyStoreError';
    this.type = type;
    this.status = status;
    this.details = details;
  }
}

export function hasDailyDatabase(env) {
  return Boolean(env?.COAST_CHAT_DB && typeof env.COAST_CHAT_DB.prepare === 'function');
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

function clip(value, max = MAX_TEXT) {
  return String(value ?? '').trim().slice(0, max);
}

function cleanId(value, prefix = 'daily') {
  const clean = String(value || '').replace(/[^\w:.-]/g, '_').slice(0, 160);
  return clean || `${prefix}_${crypto.randomUUID()}`;
}

function optionalId(value) {
  return value ? cleanId(value, 'ref') : null;
}

function trustedOrValue(defaults, key, value) {
  return Object.prototype.hasOwnProperty.call(defaults, key) ? defaults[key] : value;
}

function enumValue(value, allowed, fallback, label) {
  const clean = String(value || fallback || '').trim();
  if (!allowed.has(clean)) throw new DailyStoreError('invalid_daily_field', `${label}无效。`, 400);
  return clean;
}

function dateKey(value, fallback = new Date()) {
  const clean = String(value || '').trim();
  const parsed = new Date(`${clean}T00:00:00.000Z`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)
    && !Number.isNaN(parsed.getTime())
    && parsed.toISOString().slice(0, 10) === clean) return clean;
  if (value) throw new DailyStoreError('invalid_daily_date', '日期格式无效。', 400);
  return fallback.toISOString().slice(0, 10);
}

function optionalIso(value) {
  const timestamp = Number(value || 0);
  return Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp).toISOString() : null;
}

function iso(value) {
  return optionalIso(value) || new Date().toISOString();
}

function timestamp(value, label) {
  const number = typeof value === 'number' ? value : Date.parse(String(value || ''));
  if (!Number.isFinite(number) || number <= 0) {
    throw new DailyStoreError('invalid_daily_range', `${label}无效。`, 400);
  }
  return Math.trunc(number);
}

function parseList(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function sanitizeImageRef(value) {
  const clean = String(value || '').trim().slice(0, MAX_IMAGE_REF);
  if (!clean) return '';
  if (/^data:/i.test(clean)) {
    throw new DailyStoreError('image_data_url_not_allowed', '图片 data URL 不会写入 D1；请使用稳定图片引用。', 400);
  }
  if (!/^(https?:\/\/|\/|r2:\/\/|asset:\/\/|coast:\/\/)/i.test(clean)) {
    throw new DailyStoreError('invalid_image_ref', '图片引用必须是 https、站内路径或海岸存储引用。', 400);
  }
  return clean;
}

export function sanitizeImageRefs(value) {
  const source = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(source.map(sanitizeImageRef).filter(Boolean))].slice(0, 6);
}

function commentFromRow(row) {
  return {
    id: row.id,
    moment_id: row.moment_id,
    author: row.author,
    text: row.text || '',
    created_at: iso(row.created_at),
  };
}

function momentFromRow(row, comments = [], like = {}) {
  return {
    id: row.id,
    date: row.date,
    author: row.author,
    source: row.source,
    status: row.status,
    text: row.text || '',
    image_refs: parseList(row.image_refs_json),
    conversation_id: row.conversation_id || null,
    source_turn_id: row.source_turn_id || null,
    tool_call_id: row.tool_call_id || null,
    reason: row.reason || '',
    published_at: optionalIso(row.published_at),
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
    like_count: Number(like.like_count || 0),
    liked: Number(like.liked || 0) === 1,
    comments,
  };
}

async function hydrateMoments(db, rows, actor = 'xiaohan') {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const placeholders = ids.map(() => '?').join(',');
  const commentRows = await all(db, `SELECT id, moment_id, author, text, created_at
    FROM daily_moment_comments
    WHERE moment_id IN (${placeholders})
    ORDER BY created_at ASC`, ids);
  const likeRows = await all(db, `SELECT moment_id, COUNT(*) AS like_count,
      MAX(CASE WHEN actor = ? THEN 1 ELSE 0 END) AS liked
    FROM daily_moment_likes
    WHERE moment_id IN (${placeholders})
    GROUP BY moment_id`, [actor, ...ids]);
  const comments = new Map();
  for (const row of commentRows) {
    const list = comments.get(row.moment_id) || [];
    list.push(commentFromRow(row));
    comments.set(row.moment_id, list);
  }
  const likes = new Map(likeRows.map((row) => [row.moment_id, row]));
  return rows.map((row) => momentFromRow(row, comments.get(row.id) || [], likes.get(row.id) || {}));
}

async function requireMomentRow(db, id) {
  const row = await first(db, 'SELECT * FROM daily_moments WHERE id = ?', [cleanId(id, 'moment')]);
  if (!row) throw new DailyStoreError('moment_not_found', '这条碳硅圈动态不存在。', 404);
  return row;
}

export async function listMoments(db, filters = {}) {
  await ensureDailySchema(db);
  const clauses = [];
  const params = [];
  if (filters.status) {
    clauses.push('status = ?');
    params.push(enumValue(filters.status, MOMENT_STATUSES, '', '动态状态'));
  }
  if (filters.date) {
    clauses.push('date = ?');
    params.push(dateKey(filters.date));
  }
  const limit = Math.min(300, Math.max(1, Number(filters.limit || 200)));
  const rows = await all(db, `SELECT * FROM daily_moments
    ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
    ORDER BY COALESCE(published_at, created_at) DESC, created_at DESC
    LIMIT ?`, [...params, limit]);
  return hydrateMoments(db, rows, filters.actor || 'xiaohan');
}

export async function getMoment(db, id, actor = 'xiaohan') {
  await ensureDailySchema(db);
  return (await hydrateMoments(db, [await requireMomentRow(db, id)], actor))[0];
}

function normalizeMoment(value = {}, defaults = {}) {
  const now = Date.now();
  const status = enumValue(value.status || value.visible_status, MOMENT_STATUSES, defaults.status || 'published', '动态状态');
  const text = clip(value.text, 12000);
  const imageRefs = sanitizeImageRefs(value.image_refs);
  if (!text && !imageRefs.length) {
    throw new DailyStoreError('empty_moment', '碳硅圈动态需要正文或图片引用。', 400);
  }
  return {
    id: cleanId(value.id, 'moment'),
    date: dateKey(value.date, new Date(now)),
    author: enumValue(trustedOrValue(defaults, 'author', value.author), MOMENT_AUTHORS, 'xiaohan', '动态作者'),
    source: enumValue(trustedOrValue(defaults, 'source', value.source), SOURCES, 'manual', '动态来源'),
    status,
    text,
    image_refs_json: JSON.stringify(imageRefs),
    conversation_id: optionalId(trustedOrValue(defaults, 'conversation_id', value.conversation_id)),
    source_turn_id: optionalId(trustedOrValue(defaults, 'source_turn_id', value.source_turn_id)),
    tool_call_id: optionalId(trustedOrValue(defaults, 'tool_call_id', value.tool_call_id)),
    reason: clip(value.reason, 1000),
    published_at: status === 'published' ? now : null,
    created_at: now,
    updated_at: now,
  };
}

export async function createMoment(db, value = {}, defaults = {}) {
  await ensureDailySchema(db);
  if (value.id) {
    const existing = await first(db, 'SELECT id FROM daily_moments WHERE id = ?', [cleanId(value.id, 'moment')]);
    if (existing) return getMoment(db, existing.id);
  }
  const item = normalizeMoment(value, defaults);
  if (item.tool_call_id) {
    const existing = await first(db, 'SELECT id FROM daily_moments WHERE tool_call_id = ?', [item.tool_call_id]);
    if (existing) return getMoment(db, existing.id);
  }
  try {
    await run(db, `INSERT INTO daily_moments (
    id, date, author, source, status, text, image_refs_json, conversation_id,
    source_turn_id, tool_call_id, reason, published_at, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      item.id,
      item.date,
      item.author,
      item.source,
      item.status,
      item.text,
      item.image_refs_json,
      item.conversation_id,
      item.source_turn_id,
      item.tool_call_id,
      item.reason || null,
      item.published_at,
      item.created_at,
      item.updated_at,
    ]);
  } catch (error) {
    if (!item.tool_call_id) throw error;
    const existing = await first(db, 'SELECT id FROM daily_moments WHERE tool_call_id = ?', [item.tool_call_id]);
    if (!existing) throw error;
    return getMoment(db, existing.id);
  }
  return getMoment(db, item.id);
}

export async function patchMoment(db, id, value = {}) {
  await ensureDailySchema(db);
  const row = await requireMomentRow(db, id);
  const momentId = row.id;
  const updates = [];
  const params = [];
  if (Object.prototype.hasOwnProperty.call(value, 'text')) {
    updates.push('text = ?');
    params.push(clip(value.text, 12000));
  }
  if (Object.prototype.hasOwnProperty.call(value, 'image_refs')) {
    updates.push('image_refs_json = ?');
    params.push(JSON.stringify(sanitizeImageRefs(value.image_refs)));
  }
  if (Object.prototype.hasOwnProperty.call(value, 'reason')) {
    updates.push('reason = ?');
    params.push(clip(value.reason, 1000) || null);
  }
  if (Object.prototype.hasOwnProperty.call(value, 'status') || Object.prototype.hasOwnProperty.call(value, 'visible_status')) {
    const status = enumValue(value.status || value.visible_status, MOMENT_STATUSES, row.status, '动态状态');
    updates.push('status = ?', 'published_at = ?');
    params.push(status, status === 'published' ? Number(row.published_at || Date.now()) : null);
  }
  if (!updates.length) throw new DailyStoreError('empty_patch', '没有可更新的动态字段。', 400);
  updates.push('updated_at = ?');
  params.push(Date.now(), momentId);
  await run(db, `UPDATE daily_moments SET ${updates.join(', ')} WHERE id = ?`, params);
  return getMoment(db, momentId);
}

export async function addMomentComment(db, id, value = {}) {
  await ensureDailySchema(db);
  const momentId = (await requireMomentRow(db, id)).id;
  const text = clip(value.text, 2000);
  if (!text) throw new DailyStoreError('empty_comment', '评论不能为空。', 400);
  const commentId = cleanId(value.id, 'moment_comment');
  if (value.id) {
    const existing = await first(db, 'SELECT id FROM daily_moment_comments WHERE id = ?', [commentId]);
    if (existing) return getMoment(db, momentId);
  }
  await run(db, `INSERT INTO daily_moment_comments (id, moment_id, author, text, created_at)
    VALUES (?, ?, ?, ?, ?)`, [
    commentId,
    momentId,
    enumValue(value.author, COMMENT_AUTHORS, 'xiaohan', '评论作者'),
    text,
    Date.now(),
  ]);
  await run(db, 'UPDATE daily_moments SET updated_at = ? WHERE id = ?', [Date.now(), momentId]);
  return getMoment(db, momentId);
}

export async function setMomentLike(db, id, liked, actorValue = 'xiaohan') {
  await ensureDailySchema(db);
  const momentId = (await requireMomentRow(db, id)).id;
  const actor = enumValue(actorValue, COMMENT_AUTHORS, 'xiaohan', '点赞者');
  if (liked) {
    await run(db, `INSERT OR IGNORE INTO daily_moment_likes (moment_id, actor, created_at)
      VALUES (?, ?, ?)`, [momentId, actor, Date.now()]);
  } else {
    await run(db, 'DELETE FROM daily_moment_likes WHERE moment_id = ? AND actor = ?', [momentId, actor]);
  }
  await run(db, 'UPDATE daily_moments SET updated_at = ? WHERE id = ?', [Date.now(), momentId]);
  return getMoment(db, momentId, actor);
}

function diaryFromRow(row) {
  return {
    id: row.id,
    date: row.date,
    author: row.author,
    source: row.source,
    weather: row.weather || '未标注',
    mood: row.mood || '未标注',
    text: row.text || '',
    image_refs: parseList(row.image_refs_json),
    summary_id: row.summary_id || null,
    range_start: optionalIso(row.range_start),
    range_end: optionalIso(row.range_end),
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  };
}

export async function listDiaries(db, filters = {}) {
  await ensureDailySchema(db);
  const clauses = [];
  const params = [];
  if (filters.date) {
    clauses.push('date = ?');
    params.push(dateKey(filters.date));
  }
  if (filters.author) {
    clauses.push('author = ?');
    params.push(enumValue(filters.author, DIARY_AUTHORS, '', '日记作者'));
  }
  const rows = await all(db, `SELECT * FROM daily_diaries
    ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
    ORDER BY date DESC, created_at DESC
    LIMIT 300`, params);
  return rows.map(diaryFromRow);
}

function normalizeDiary(value = {}, defaults = {}) {
  const now = Date.now();
  const text = clip(value.text);
  const imageRefs = sanitizeImageRefs(value.image_refs);
  if (!text && !imageRefs.length) throw new DailyStoreError('empty_diary', '日记需要正文或图片引用。', 400);
  const range = value.range || {};
  return {
    id: cleanId(value.id, 'diary'),
    date: dateKey(value.date, new Date(now)),
    author: enumValue(trustedOrValue(defaults, 'author', value.author), DIARY_AUTHORS, 'xiaohan', '日记作者'),
    source: enumValue(trustedOrValue(defaults, 'source', value.source), DIARY_SOURCES, 'manual', '日记来源'),
    weather: clip(value.weather || '未标注', 80),
    mood: clip(value.mood || '未标注', 120),
    text,
    image_refs_json: JSON.stringify(imageRefs),
    summary_id: optionalId(value.summary_id || defaults.summary_id),
    range_start: range.from ? timestamp(range.from, '日记生成起点') : defaults.range_start || null,
    range_end: range.to ? timestamp(range.to, '日记生成终点') : defaults.range_end || null,
    created_at: now,
    updated_at: now,
  };
}

async function matchingDiaries(db, date, author) {
  return all(db, `SELECT * FROM daily_diaries
    WHERE date = ? AND author = ?
    ORDER BY created_at DESC`, [date, author]);
}

export async function createDiary(db, value = {}, defaults = {}) {
  await ensureDailySchema(db);
  if (value.id) {
    const existingById = await first(db, 'SELECT * FROM daily_diaries WHERE id = ?', [cleanId(value.id, 'diary')]);
    if (existingById) return diaryFromRow(existingById);
  }
  const item = normalizeDiary(value, defaults);
  const existing = await matchingDiaries(db, item.date, item.author);
  const mode = String(value.conflict_mode || '').trim();
  if (existing.length && !['append', 'replace'].includes(mode)) {
    throw new DailyStoreError('diary_conflict', '同日同作者已有日记，请明确选择追加或替换。', 409, {
      existing_ids: existing.map((row) => row.id),
    });
  }
  if (mode === 'replace' && existing.length) {
    const target = existing.find((row) => row.id === value.replace_id) || existing[0];
    await run(db, `UPDATE daily_diaries SET
      source = ?, weather = ?, mood = ?, text = ?, image_refs_json = ?,
      summary_id = ?, range_start = ?, range_end = ?, updated_at = ?
      WHERE id = ?`, [
      item.source,
      item.weather,
      item.mood,
      item.text,
      item.image_refs_json,
      item.summary_id,
      item.range_start,
      item.range_end,
      item.updated_at,
      target.id,
    ]);
    return diaryFromRow(await first(db, 'SELECT * FROM daily_diaries WHERE id = ?', [target.id]));
  }
  await run(db, `INSERT INTO daily_diaries (
    id, date, author, source, weather, mood, text, image_refs_json, summary_id,
    range_start, range_end, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    item.id,
    item.date,
    item.author,
    item.source,
    item.weather,
    item.mood,
    item.text,
    item.image_refs_json,
    item.summary_id,
    item.range_start,
    item.range_end,
    item.created_at,
    item.updated_at,
  ]);
  return diaryFromRow(await first(db, 'SELECT * FROM daily_diaries WHERE id = ?', [item.id]));
}

export async function patchDiary(db, id, value = {}) {
  await ensureDailySchema(db);
  const diaryId = cleanId(id, 'diary');
  const row = await first(db, 'SELECT * FROM daily_diaries WHERE id = ?', [diaryId]);
  if (!row) throw new DailyStoreError('diary_not_found', '这张日记纸页不存在。', 404);
  const updates = [];
  const params = [];
  for (const [field, column, max] of [
    ['weather', 'weather', 80],
    ['mood', 'mood', 120],
    ['text', 'text', MAX_TEXT],
  ]) {
    if (Object.prototype.hasOwnProperty.call(value, field)) {
      updates.push(`${column} = ?`);
      params.push(clip(value[field], max));
    }
  }
  if (Object.prototype.hasOwnProperty.call(value, 'image_refs')) {
    updates.push('image_refs_json = ?');
    params.push(JSON.stringify(sanitizeImageRefs(value.image_refs)));
  }
  if (!updates.length) throw new DailyStoreError('empty_patch', '没有可更新的日记字段。', 400);
  updates.push('updated_at = ?');
  params.push(Date.now(), diaryId);
  await run(db, `UPDATE daily_diaries SET ${updates.join(', ')} WHERE id = ?`, params);
  return diaryFromRow(await first(db, 'SELECT * FROM daily_diaries WHERE id = ?', [diaryId]));
}

function albumFromRow(row) {
  return {
    id: row.id,
    date: row.date,
    category: row.category,
    author: row.author,
    source: row.source,
    image_ref: row.image_ref,
    conversation_id: row.conversation_id || null,
    source_turn_id: row.source_turn_id || null,
    tool_call_id: row.tool_call_id || null,
    caption: row.caption || '',
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  };
}

export async function listAlbumItems(db, filters = {}) {
  await ensureDailySchema(db);
  const clauses = [];
  const params = [];
  if (filters.date) {
    clauses.push('date = ?');
    params.push(dateKey(filters.date));
  }
  if (filters.category) {
    clauses.push('category = ?');
    params.push(enumValue(filters.category, ALBUM_CATEGORIES, '', '相册分类'));
  }
  const rows = await all(db, `SELECT * FROM daily_album_items
    ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
    ORDER BY date DESC, created_at DESC
    LIMIT 500`, params);
  return rows.map(albumFromRow);
}

function normalizeAlbumItem(value = {}, defaults = {}) {
  const now = Date.now();
  const imageRef = sanitizeImageRef(value.image_ref);
  if (!imageRef) throw new DailyStoreError('empty_album_ref', '相册第一版需要稳定图片引用。', 400);
  return {
    id: cleanId(value.id, 'album'),
    date: dateKey(value.date, new Date(now)),
    category: enumValue(trustedOrValue(defaults, 'category', value.category), ALBUM_CATEGORIES, 'xiaohan', '相册分类'),
    author: enumValue(trustedOrValue(defaults, 'author', value.author), MOMENT_AUTHORS, 'xiaohan', '相册作者'),
    source: enumValue(trustedOrValue(defaults, 'source', value.source), SOURCES, 'manual', '相册来源'),
    image_ref: imageRef,
    conversation_id: optionalId(trustedOrValue(defaults, 'conversation_id', value.conversation_id)),
    source_turn_id: optionalId(trustedOrValue(defaults, 'source_turn_id', value.source_turn_id)),
    tool_call_id: optionalId(trustedOrValue(defaults, 'tool_call_id', value.tool_call_id)),
    caption: clip(value.caption, 1000),
    created_at: now,
    updated_at: now,
  };
}

export async function createAlbumItem(db, value = {}, defaults = {}) {
  await ensureDailySchema(db);
  if (value.id) {
    const existingById = await first(db, 'SELECT * FROM daily_album_items WHERE id = ?', [cleanId(value.id, 'album')]);
    if (existingById) return albumFromRow(existingById);
  }
  const item = normalizeAlbumItem(value, defaults);
  if (item.tool_call_id) {
    const existing = await first(db, 'SELECT id FROM daily_album_items WHERE tool_call_id = ?', [item.tool_call_id]);
    if (existing) return albumFromRow(await first(db, 'SELECT * FROM daily_album_items WHERE id = ?', [existing.id]));
  }
  try {
    await run(db, `INSERT INTO daily_album_items (
      id, date, category, author, source, image_ref, conversation_id, source_turn_id,
      tool_call_id, caption, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      item.id,
      item.date,
      item.category,
      item.author,
      item.source,
      item.image_ref,
      item.conversation_id,
      item.source_turn_id,
      item.tool_call_id,
      item.caption || null,
      item.created_at,
      item.updated_at,
    ]);
  } catch (error) {
    if (!item.tool_call_id) throw error;
    const existing = await first(db, 'SELECT id FROM daily_album_items WHERE tool_call_id = ?', [item.tool_call_id]);
    if (!existing) throw error;
    return albumFromRow(await first(db, 'SELECT * FROM daily_album_items WHERE id = ?', [existing.id]));
  }
  return albumFromRow(await first(db, 'SELECT * FROM daily_album_items WHERE id = ?', [item.id]));
}

function summaryFromRow(row) {
  return {
    id: row.id,
    range: { from: iso(row.range_start), to: iso(row.range_end) },
    summary: {
      text: row.summary_text || '',
      anchors: parseList(row.anchors_json),
      unresolved: parseList(row.unresolved_json),
    },
    diary_id: row.diary_id || null,
    moment_ids: parseList(row.moment_ids_json),
    album_item_ids: parseList(row.album_item_ids_json),
    model_id: row.model_id || null,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  };
}

export async function listSummaries(db, { limit = 100 } = {}) {
  await ensureDailySchema(db);
  const rows = await all(db, `SELECT * FROM daily_summaries
    ORDER BY range_end DESC, created_at DESC
    LIMIT ?`, [Math.min(200, Math.max(1, Number(limit || 100)))]);
  return rows.map(summaryFromRow);
}

export async function latestSummary(db) {
  await ensureDailySchema(db);
  const row = await first(db, `SELECT * FROM daily_summaries
    ORDER BY range_end DESC, created_at DESC
    LIMIT 1`);
  return row ? summaryFromRow(row) : null;
}

export async function earliestDailyRecordTimestamp(db) {
  await ensureDailySchema(db);
  const row = await first(db, `SELECT MIN(created_at) AS created_at FROM (
    SELECT created_at FROM daily_moments
    UNION ALL
    SELECT created_at FROM daily_diaries
    UNION ALL
    SELECT created_at FROM daily_album_items
  )`);
  const value = Number(row?.created_at);
  return Number.isFinite(value) && value > 0 ? value : null;
}

async function committedSummaryResult(db, row) {
  const summary = summaryFromRow(row);
  const diaryRow = summary.diary_id
    ? await first(db, 'SELECT * FROM daily_diaries WHERE id = ?', [summary.diary_id])
    : null;
  const diary = diaryRow ? diaryFromRow(diaryRow) : null;
  const moments = [];
  for (const id of summary.moment_ids) moments.push(await getMoment(db, id));
  const albums = [];
  for (const id of summary.album_item_ids) {
    const album = await first(db, 'SELECT * FROM daily_album_items WHERE id = ?', [id]);
    if (album) albums.push(albumFromRow(album));
  }
  return { summary, diary, moments, albums };
}

export async function dailyRecordsInRange(db, range) {
  await ensureDailySchema(db);
  const params = [range.from, range.to, range.from, range.to];
  const moments = await all(db, `SELECT * FROM daily_moments
    WHERE (created_at BETWEEN ? AND ?) OR (updated_at BETWEEN ? AND ?)
    ORDER BY created_at ASC`, params);
  const diaries = await all(db, `SELECT * FROM daily_diaries
    WHERE (created_at BETWEEN ? AND ?) OR (updated_at BETWEEN ? AND ?)
    ORDER BY created_at ASC`, params);
  const albums = await all(db, `SELECT * FROM daily_album_items
    WHERE (created_at BETWEEN ? AND ?) OR (updated_at BETWEEN ? AND ?)
    ORDER BY created_at ASC`, params);
  return {
    moments: await hydrateMoments(db, moments),
    diaries: diaries.map(diaryFromRow),
    albums: albums.map(albumFromRow),
  };
}

function stringList(value, max = 20, itemMax = 400) {
  return (Array.isArray(value) ? value : [])
    .map((item) => clip(item, itemMax))
    .filter(Boolean)
    .slice(0, max);
}

export async function commitSummary(db, value = {}) {
  await ensureDailySchema(db);
  const requestedId = value.id ? cleanId(value.id, 'summary') : '';
  if (requestedId) {
    const existing = await first(db, 'SELECT * FROM daily_summaries WHERE id = ?', [requestedId]);
    if (existing) return committedSummaryResult(db, existing);
  }
  const range = value.range || {};
  const rangeStart = timestamp(range.from, '总结起点');
  const rangeEnd = timestamp(range.to, '总结终点');
  if (rangeStart >= rangeEnd) throw new DailyStoreError('invalid_daily_range', '总结起点必须早于终点。', 400);
  const summaryValue = value.summary || {};
  const summaryText = clip(summaryValue.text);
  if (!summaryText) throw new DailyStoreError('empty_summary', '一日总结正文不能为空。', 400);

  const now = Date.now();
  const summaryId = requestedId || cleanId('', 'summary');
  const statements = [];
  let diaryId = null;
  const momentIds = [];
  const albumItemIds = [];

  if (value.diary && value.diary.enabled !== false) {
    const diary = normalizeDiary(value.diary, {
      author: 'api',
      source: 'daily_summary',
      summary_id: summaryId,
      range_start: rangeStart,
      range_end: rangeEnd,
    });
    const existing = await matchingDiaries(db, diary.date, diary.author);
    const mode = String(value.diary.conflict_mode || '').trim();
    if (existing.length && !['append', 'replace'].includes(mode)) {
      throw new DailyStoreError('diary_conflict', '同日同作者已有日记，请在确认页选择追加或替换。', 409, {
        existing_ids: existing.map((row) => row.id),
      });
    }
    if (mode === 'replace' && existing.length) {
      const target = existing.find((row) => row.id === value.diary.replace_id) || existing[0];
      diaryId = target.id;
      statements.push(db.prepare(`UPDATE daily_diaries SET
        source = ?, weather = ?, mood = ?, text = ?, image_refs_json = ?,
        summary_id = ?, range_start = ?, range_end = ?, updated_at = ?
        WHERE id = ?`).bind(
        diary.source,
        diary.weather,
        diary.mood,
        diary.text,
        diary.image_refs_json,
        summaryId,
        rangeStart,
        rangeEnd,
        now,
        target.id,
      ));
    } else {
      diaryId = diary.id;
      statements.push(db.prepare(`INSERT INTO daily_diaries (
        id, date, author, source, weather, mood, text, image_refs_json, summary_id,
        range_start, range_end, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        diary.id,
        diary.date,
        diary.author,
        diary.source,
        diary.weather,
        diary.mood,
        diary.text,
        diary.image_refs_json,
        summaryId,
        rangeStart,
        rangeEnd,
        now,
        now,
      ));
    }
  }

  for (const candidate of (Array.isArray(value.moment_candidates) ? value.moment_candidates : []).slice(0, 12)) {
    if (candidate?.selected === false) continue;
    const moment = normalizeMoment(candidate, {
      author: 'api',
      source: 'daily_summary',
      conversation_id: null,
      source_turn_id: null,
      tool_call_id: null,
    });
    momentIds.push(moment.id);
    statements.push(db.prepare(`INSERT INTO daily_moments (
      id, date, author, source, status, text, image_refs_json, conversation_id,
      source_turn_id, tool_call_id, reason, published_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      moment.id,
      moment.date,
      moment.author,
      moment.source,
      moment.status,
      moment.text,
      moment.image_refs_json,
      moment.conversation_id,
      moment.source_turn_id,
      null,
      moment.reason || null,
      moment.status === 'published' ? now : null,
      now,
      now,
    ));
  }

  for (const candidate of (Array.isArray(value.album_candidates) ? value.album_candidates : []).slice(0, 12)) {
    if (candidate?.selected === false || !candidate?.image_ref) continue;
    const album = normalizeAlbumItem(candidate, {
      author: 'api',
      source: 'daily_summary',
      conversation_id: null,
      source_turn_id: null,
      tool_call_id: null,
    });
    albumItemIds.push(album.id);
    statements.push(db.prepare(`INSERT INTO daily_album_items (
      id, date, category, author, source, image_ref, conversation_id, source_turn_id,
      tool_call_id, caption, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      album.id,
      album.date,
      album.category,
      album.author,
      album.source,
      album.image_ref,
      null,
      null,
      null,
      album.caption || null,
      now,
      now,
    ));
  }

  statements.push(db.prepare(`INSERT INTO daily_summaries (
    id, range_start, range_end, summary_text, anchors_json, unresolved_json,
    diary_id, moment_ids_json, album_item_ids_json, model_id, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    summaryId,
    rangeStart,
    rangeEnd,
    summaryText,
    JSON.stringify(stringList(summaryValue.anchors)),
    JSON.stringify(stringList(summaryValue.unresolved)),
    diaryId,
    JSON.stringify(momentIds),
    JSON.stringify(albumItemIds),
    clip(value.model_id, 180) || null,
    now,
    now,
  ));
  try {
    await db.batch(statements);
  } catch (error) {
    if (!requestedId) throw error;
    const existing = await first(db, 'SELECT * FROM daily_summaries WHERE id = ?', [requestedId]);
    if (!existing) throw error;
    return committedSummaryResult(db, existing);
  }
  return committedSummaryResult(
    db,
    await first(db, 'SELECT * FROM daily_summaries WHERE id = ?', [summaryId]),
  );
}

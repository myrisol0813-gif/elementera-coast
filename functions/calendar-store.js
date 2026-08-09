import { ensureCalendarSchema, seedCalendarRecurringEvents } from './calendar-schema.js';

const PRECISIONS = new Set(['datetime', 'day', 'month_day']);
const EVENT_TYPES = new Set([
  'normal', 'birthday', 'anniversary', 'period', 'travel', 'work',
  'commission', 'health', 'construction', 'custom',
]);
const ACTORS = new Set(['user', 'myri', 'system']);
const SOURCES = new Set(['manual', 'mcp', 'context', 'seed']);
const ACTIONS = new Set(['create', 'update', 'delete', 'comment', 'like']);
const EVENT_TYPE_LABELS = Object.freeze({
  normal: '', birthday: '生日', anniversary: '纪念日', period: '生理期', travel: '出行',
  work: '工作', commission: '委托', health: '健康', construction: '施工', custom: '自定义',
});

export class CalendarStoreError extends Error {
  constructor(type, message, status = 400) {
    super(message);
    this.name = 'CalendarStoreError';
    this.type = type;
    this.status = status;
  }
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

function clip(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

function parseJson(value, fallback = null) {
  try {
    return JSON.parse(value || '') ?? fallback;
  } catch {
    return fallback;
  }
}

function iso(value) {
  const timestamp = Number(value || 0);
  return Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp).toISOString() : null;
}

function bool(value, fallback = false) {
  if (value == null) return fallback;
  return value === true || Number(value) === 1;
}

export function calendarDate(value, name = 'date') {
  const text = clip(value, 10);
  const parsed = new Date(`${text}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)
    || Number.isNaN(parsed.getTime())
    || parsed.toISOString().slice(0, 10) !== text) {
    throw new CalendarStoreError('invalid_calendar_date', `${name} 必须是 YYYY-MM-DD。`);
  }
  return text;
}

function calendarDateTime(value, name, { required = false } = {}) {
  if (value == null || value === '') {
    if (required) throw new CalendarStoreError('calendar_time_required', `${name} 不能为空。`);
    return null;
  }
  const text = clip(value, 80);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return calendarDate(text, name);
  if (!Number.isFinite(Date.parse(text))) {
    throw new CalendarStoreError('invalid_calendar_time', `${name} 不是有效时间。`);
  }
  return text;
}

function choice(value, allowed, fallback, name) {
  const selected = String(value ?? fallback);
  if (!allowed.has(selected)) throw new CalendarStoreError('invalid_calendar_value', `${name} 不是允许的选项。`);
  return selected;
}

function eventFromRow(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    starts_at: row.starts_at,
    ends_at: row.ends_at || null,
    precision: row.precision,
    event_type: row.event_type,
    created_by: row.created_by,
    source: row.source,
    source_message_id: row.source_message_id || null,
    color_key: row.color_key || null,
    is_all_day: Number(row.is_all_day || 0) === 1,
    is_archived: Number(row.is_archived || 0) === 1,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  };
}

function noteFromRow(row) {
  return {
    id: row.id,
    event_id: row.event_id || null,
    date: row.date,
    content: row.content,
    author: row.author,
    x: row.x == null ? null : Number(row.x),
    y: row.y == null ? null : Number(row.y),
    rotation: row.rotation == null ? null : Number(row.rotation),
    color_key: row.color_key || null,
    liked_by_user: Number(row.liked_by_user || 0) === 1,
    liked_by_myri: Number(row.liked_by_myri || 0) === 1,
    is_archived: Number(row.is_archived || 0) === 1,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  };
}

function changeFromRow(row) {
  return {
    id: row.id,
    target_type: row.target_type,
    target_id: row.target_id,
    action: row.action,
    actor: row.actor,
    snapshot: parseJson(row.snapshot_json, {}),
    visible_to: row.visible_to,
    seen_at: iso(row.seen_at),
    created_at: iso(row.created_at),
  };
}

function visibleTo(actor) {
  if (actor === 'user') return 'myri';
  if (actor === 'myri') return 'user';
  return 'both';
}

function changeStatement(db, {
  targetType,
  targetId,
  action,
  actor,
  snapshot,
  visible_to: requestedVisibleTo,
}, timestamp = Date.now()) {
  const normalizedActor = choice(actor, ACTORS, 'user', 'actor');
  const normalizedAction = choice(action, ACTIONS, 'create', 'action');
  const audience = ['user', 'myri', 'both'].includes(requestedVisibleTo)
    ? requestedVisibleTo
    : visibleTo(normalizedActor);
  return db.prepare(`INSERT INTO coast_calendar_changes (
    id, target_type, target_id, action, actor, snapshot_json,
    visible_to, seen_at, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)`).bind(
    crypto.randomUUID(),
    targetType,
    targetId,
    normalizedAction,
    normalizedActor,
    JSON.stringify(snapshot || {}),
    audience,
    timestamp,
  );
}

async function requireEventRow(db, id, { includeArchived = false } = {}) {
  const eventId = clip(id, 180);
  const row = await first(db, `SELECT * FROM coast_calendar_events
    WHERE id = ?${includeArchived ? '' : ' AND is_archived = 0'}`, [eventId]);
  if (!row) throw new CalendarStoreError('calendar_event_not_found', '这条日历事件不存在。', 404);
  return row;
}

async function requireNoteRow(db, id, { includeArchived = false } = {}) {
  const noteId = clip(id, 180);
  const row = await first(db, `SELECT * FROM coast_calendar_notes
    WHERE id = ?${includeArchived ? '' : ' AND is_archived = 0'}`, [noteId]);
  if (!row) throw new CalendarStoreError('calendar_note_not_found', '这张日历便签不存在。', 404);
  return row;
}

function normalizeEvent(value = {}, defaults = {}) {
  const title = clip(value.title ?? defaults.title, 240);
  if (!title) throw new CalendarStoreError('calendar_title_required', '事件标题不能为空。');
  const precision = choice(value.precision, PRECISIONS, defaults.precision || 'datetime', 'precision');
  const startsAt = calendarDateTime(value.starts_at ?? defaults.starts_at, 'starts_at', { required: true });
  const endsAt = calendarDateTime(value.ends_at ?? defaults.ends_at, 'ends_at');
  if (endsAt && Date.parse(endsAt) < Date.parse(startsAt)) {
    throw new CalendarStoreError('calendar_range_invalid', '结束时间不能早于开始时间。');
  }
  return {
    title,
    description: clip(value.description ?? defaults.description, 12000),
    starts_at: startsAt,
    ends_at: endsAt,
    precision,
    event_type: choice(value.event_type, EVENT_TYPES, defaults.event_type || 'normal', 'event_type'),
    created_by: choice(value.created_by, ACTORS, defaults.created_by || 'user', 'created_by'),
    source: choice(value.source, SOURCES, defaults.source || 'manual', 'source'),
    source_message_id: clip(value.source_message_id ?? defaults.source_message_id, 240) || null,
    color_key: clip(value.color_key ?? defaults.color_key, 60) || null,
    is_all_day: bool(value.is_all_day, defaults.is_all_day || precision !== 'datetime'),
  };
}

export async function createCalendarEvent(db, value = {}, context = {}) {
  await ensureCalendarSchema(db);
  const event = normalizeEvent(value, {
    created_by: context.actor || 'user',
    source: context.source || 'manual',
  });
  const id = clip(value.id, 180) || crypto.randomUUID();
  const timestamp = Date.now();
  const snapshot = { id, ...event, is_archived: false };
  await db.batch([
    db.prepare(`INSERT INTO coast_calendar_events (
      id, title, description, starts_at, ends_at, precision, event_type,
      created_by, source, source_message_id, color_key, is_all_day,
      is_archived, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`).bind(
      id, event.title, event.description, event.starts_at, event.ends_at,
      event.precision, event.event_type, event.created_by, event.source,
      event.source_message_id, event.color_key, event.is_all_day ? 1 : 0,
      timestamp, timestamp,
    ),
    changeStatement(db, {
      targetType: 'event', targetId: id, action: 'create',
      actor: context.actor || event.created_by, snapshot,
    }, timestamp),
  ]);
  return eventFromRow(await requireEventRow(db, id));
}

export async function getCalendarEvent(db, id) {
  await ensureCalendarSchema(db);
  return eventFromRow(await requireEventRow(db, id));
}

export async function listCalendarEvents(db, { from, to } = {}) {
  await ensureCalendarSchema(db);
  const start = calendarDate(from || new Date().toISOString().slice(0, 10), 'from');
  const end = calendarDate(to || start, 'to');
  if (start > end) throw new CalendarStoreError('calendar_range_invalid', 'from 不能晚于 to。');
  await seedCalendarRecurringEvents(db, {
    fromYear: Number(start.slice(0, 4)),
    years: Math.min(10, Math.max(0, Number(end.slice(0, 4)) - Number(start.slice(0, 4)))),
  });
  const rows = await all(db, `SELECT * FROM coast_calendar_events
    WHERE is_archived = 0
      AND substr(starts_at, 1, 10) <= ?
      AND substr(COALESCE(ends_at, starts_at), 1, 10) >= ?
    ORDER BY starts_at ASC, created_at ASC`, [end, start]);
  return rows.map(eventFromRow);
}

export async function updateCalendarEvent(db, id, patch = {}, context = {}) {
  await ensureCalendarSchema(db);
  const row = await requireEventRow(db, id);
  if (row.source === 'seed' && !context.allow_seed_edit) {
    throw new CalendarStoreError('calendar_seed_read_only', '年度种子请在循环日期设置中修改。', 409);
  }
  const current = eventFromRow(row);
  const next = normalizeEvent(patch, current);
  const timestamp = Date.now();
  const snapshot = { ...current, ...next, updated_at: new Date(timestamp).toISOString() };
  await db.batch([
    db.prepare(`UPDATE coast_calendar_events SET
      title = ?, description = ?, starts_at = ?, ends_at = ?, precision = ?,
      event_type = ?, source_message_id = ?, color_key = ?, is_all_day = ?, updated_at = ?
      WHERE id = ? AND is_archived = 0`).bind(
      next.title, next.description, next.starts_at, next.ends_at, next.precision,
      next.event_type, next.source_message_id, next.color_key,
      next.is_all_day ? 1 : 0, timestamp, row.id,
    ),
    changeStatement(db, {
      targetType: 'event', targetId: row.id, action: 'update',
      actor: context.actor || 'user', snapshot,
    }, timestamp),
  ]);
  return eventFromRow(await requireEventRow(db, row.id));
}

export async function deleteCalendarEvent(db, id, context = {}) {
  await ensureCalendarSchema(db);
  const row = await requireEventRow(db, id);
  if (row.source === 'seed' && !context.allow_seed_edit) {
    throw new CalendarStoreError('calendar_seed_read_only', '年度种子不会被普通删除。', 409);
  }
  const timestamp = Date.now();
  const snapshot = { ...eventFromRow(row), is_archived: true };
  await db.batch([
    db.prepare(`UPDATE coast_calendar_events SET is_archived = 1, updated_at = ?
      WHERE id = ? AND is_archived = 0`).bind(timestamp, row.id),
    db.prepare(`UPDATE coast_calendar_notes SET is_archived = 1, updated_at = ?
      WHERE event_id = ? AND is_archived = 0`).bind(timestamp, row.id),
    changeStatement(db, {
      targetType: 'event', targetId: row.id, action: 'delete',
      actor: context.actor || 'user', snapshot,
    }, timestamp),
  ]);
  return snapshot;
}

function finiteNumber(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

export async function createCalendarNote(db, value = {}, context = {}) {
  await ensureCalendarSchema(db);
  const date = calendarDate(value.date, 'date');
  const content = clip(value.content ?? value.comment, 8000);
  if (!content) throw new CalendarStoreError('calendar_note_required', '便签内容不能为空。');
  const author = choice(value.author, ACTORS, context.actor || 'user', 'author');
  const eventId = clip(value.event_id, 180) || null;
  if (eventId) await requireEventRow(db, eventId);
  const countRow = await first(db, `SELECT COUNT(*) AS count FROM coast_calendar_notes
    WHERE date = ? AND is_archived = 0`, [date]);
  const index = Number(countRow?.count || 0);
  const id = clip(value.id, 180) || crypto.randomUUID();
  const timestamp = Date.now();
  const note = {
    id,
    event_id: eventId,
    date,
    content,
    author,
    x: finiteNumber(value.x, 8 + (index % 3) * 29, 0, 100),
    y: finiteNumber(value.y, 12 + (index % 4) * 18, 0, 100),
    rotation: finiteNumber(value.rotation, (index % 5) * 1.4 - 2.8, -18, 18),
    color_key: clip(value.color_key, 60) || null,
    liked_by_user: false,
    liked_by_myri: false,
    is_archived: false,
  };
  await db.batch([
    db.prepare(`INSERT INTO coast_calendar_notes (
      id, event_id, date, content, author, x, y, rotation, color_key,
      liked_by_user, liked_by_myri, is_archived, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?)`).bind(
      id, eventId, date, content, author, note.x, note.y, note.rotation,
      note.color_key, timestamp, timestamp,
    ),
    changeStatement(db, {
      targetType: 'note', targetId: id, action: 'comment',
      actor: context.actor || author, snapshot: note,
    }, timestamp),
  ]);
  return noteFromRow(await requireNoteRow(db, id));
}

export async function updateCalendarNote(db, id, patch = {}, context = {}) {
  await ensureCalendarSchema(db);
  const row = await requireNoteRow(db, id);
  const current = noteFromRow(row);
  const content = patch.content == null && patch.comment == null
    ? current.content : clip(patch.content ?? patch.comment, 8000);
  if (!content) throw new CalendarStoreError('calendar_note_required', '便签内容不能为空。');
  const likedByUser = patch.liked_by_user == null && !(context.actor === 'user' && patch.liked != null)
    ? current.liked_by_user : bool(patch.liked_by_user ?? patch.liked);
  const likedByMyri = patch.liked_by_myri == null && !(context.actor === 'myri' && patch.liked != null)
    ? current.liked_by_myri : bool(patch.liked_by_myri ?? patch.liked);
  const timestamp = Date.now();
  const next = {
    ...current,
    content,
    x: finiteNumber(patch.x, current.x, 0, 100),
    y: finiteNumber(patch.y, current.y, 0, 100),
    rotation: finiteNumber(patch.rotation, current.rotation, -18, 18),
    color_key: patch.color_key == null ? current.color_key : clip(patch.color_key, 60) || null,
    liked_by_user: likedByUser,
    liked_by_myri: likedByMyri,
  };
  const action = patch.liked != null || patch.liked_by_user != null || patch.liked_by_myri != null
    ? 'like' : 'update';
  await db.batch([
    db.prepare(`UPDATE coast_calendar_notes SET
      content = ?, x = ?, y = ?, rotation = ?, color_key = ?,
      liked_by_user = ?, liked_by_myri = ?, updated_at = ?
      WHERE id = ? AND is_archived = 0`).bind(
      next.content, next.x, next.y, next.rotation, next.color_key,
      next.liked_by_user ? 1 : 0, next.liked_by_myri ? 1 : 0,
      timestamp, row.id,
    ),
    changeStatement(db, {
      targetType: 'note', targetId: row.id, action,
      actor: context.actor || 'user', snapshot: next,
    }, timestamp),
  ]);
  return noteFromRow(await requireNoteRow(db, row.id));
}

export async function deleteCalendarNote(db, id, context = {}) {
  await ensureCalendarSchema(db);
  const row = await requireNoteRow(db, id);
  const timestamp = Date.now();
  const snapshot = { ...noteFromRow(row), is_archived: true };
  await db.batch([
    db.prepare(`UPDATE coast_calendar_notes SET is_archived = 1, updated_at = ?
      WHERE id = ? AND is_archived = 0`).bind(timestamp, row.id),
    changeStatement(db, {
      targetType: 'note', targetId: row.id, action: 'delete',
      actor: context.actor || 'user', snapshot,
    }, timestamp),
  ]);
  return snapshot;
}

export async function listCalendarDay(db, dateValue) {
  await ensureCalendarSchema(db);
  const date = calendarDate(dateValue, 'date');
  const [events, noteRows] = await Promise.all([
    listCalendarEvents(db, { from: date, to: date }),
    all(db, `SELECT * FROM coast_calendar_notes
      WHERE date = ? AND is_archived = 0
      ORDER BY created_at ASC`, [date]),
  ]);
  return { date, events, notes: noteRows.map(noteFromRow) };
}

function audienceCondition(audience) {
  if (audience === 'user') return "visible_to IN ('user', 'both')";
  if (audience === 'myri') return "visible_to IN ('myri', 'both')";
  throw new CalendarStoreError('invalid_calendar_audience', '日历未读受众无效。');
}

export async function listCalendarUnseenChanges(db, audience, { limit = 100 } = {}) {
  await ensureCalendarSchema(db);
  const rows = await all(db, `SELECT * FROM coast_calendar_changes
    WHERE seen_at IS NULL AND ${audienceCondition(audience)}
    ORDER BY created_at ASC LIMIT ?`, [Math.min(300, Math.max(1, Number(limit) || 100))]);
  return rows.map(changeFromRow);
}

function snapshotDate(change) {
  const snapshot = change.snapshot || {};
  return String(snapshot.date || snapshot.starts_at || '').slice(0, 10);
}

export async function calendarUnseenSummary(db) {
  const changes = await listCalendarUnseenChanges(db, 'user', { limit: 300 });
  return {
    count: changes.length,
    days: [...new Set(changes.map(snapshotDate).filter(Boolean))].sort(),
    change_ids: changes.map((change) => change.id),
  };
}

export async function markCalendarChangesSeen(db, audience, changeIds = []) {
  await ensureCalendarSchema(db);
  const ids = [...new Set((Array.isArray(changeIds) ? changeIds : []).map((id) => clip(id, 180)).filter(Boolean))].slice(0, 300);
  if (!ids.length) return { seen: 0 };
  const timestamp = Date.now();
  const statements = ids.map((id) => db.prepare(`UPDATE coast_calendar_changes
    SET seen_at = ? WHERE id = ? AND seen_at IS NULL AND ${audienceCondition(audience)}`).bind(timestamp, id));
  const results = await db.batch(statements);
  return { seen: results.reduce((sum, result) => sum + Number(result?.meta?.changes || 0), 0) };
}

export async function markCalendarDaySeen(db, dateValue) {
  const date = calendarDate(dateValue, 'date');
  const unseen = await listCalendarUnseenChanges(db, 'user', { limit: 300 });
  return markCalendarChangesSeen(db, 'user', unseen.filter((change) => snapshotDate(change) === date).map((change) => change.id));
}

function timeLabel(event) {
  if (event.precision !== 'datetime' || event.is_all_day) return '全天';
  const match = String(event.starts_at).match(/T(\d{2}:\d{2})/);
  return match?.[1] || '时间未定';
}

function addDays(date, count) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + count);
  return value.toISOString().slice(0, 10);
}

export async function calendarEnvironment(db, {
  date: dateValue = new Date().toISOString().slice(0, 10),
  include_new: includeNew = true,
  include_upcoming: includeUpcoming = true,
} = {}) {
  const date = calendarDate(dateValue, 'date');
  const [day, upcoming, unseen] = await Promise.all([
    listCalendarDay(db, date),
    includeUpcoming ? listCalendarEvents(db, { from: addDays(date, 1), to: addDays(date, 90) }) : Promise.resolve([]),
    includeNew ? listCalendarUnseenChanges(db, 'myri', { limit: 60 }) : Promise.resolve([]),
  ]);
  const newTargetIds = new Set(unseen.map((change) => change.target_id));
  const todayLines = [];
  for (const event of day.events) {
    const typeLabel = EVENT_TYPE_LABELS[event.event_type] || event.event_type;
    todayLines.push(`${newTargetIds.has(event.id) ? '[NEW] ' : ''}${timeLabel(event)} ${typeLabel ? `${typeLabel}：` : ''}${event.title}`);
  }
  for (const note of day.notes) {
    todayLines.push(`${newTargetIds.has(note.id) ? '[NEW] ' : ''}便签：${note.content.slice(0, 180)}`);
  }
  const upcomingAnniversaries = upcoming
    .filter((item) => ['birthday', 'anniversary'].includes(item.event_type))
    .slice(0, 3)
    .map((event) => {
      const days = Math.round((Date.parse(`${event.starts_at.slice(0, 10)}T00:00:00.000Z`) - Date.parse(`${date}T00:00:00.000Z`)) / 86400000);
      return {
        id: event.id,
        title: event.title,
        date: event.starts_at.slice(0, 10),
        month_day: event.starts_at.slice(5, 10),
        days_remaining: days,
        text: `${Number(event.starts_at.slice(5, 7))}/${Number(event.starts_at.slice(8, 10))} ${event.title}还有 ${days} 天`,
      };
    });
  const newOnly = unseen.filter((change) => !newTargetIds.has(change.target_id)
    || ![...day.events, ...day.notes].some((item) => item.id === change.target_id));
  const changeLines = [];
  for (const change of newOnly.slice(0, 4)) {
    const snapshot = change.snapshot || {};
    changeLines.push(`[NEW] 小寒${change.action}了「${String(snapshot.title || snapshot.content || '日历内容').slice(0, 100)}」`);
  }
  const eventCount = day.events.length;
  const noteCount = day.notes.length;
  const anniversaryCount = upcomingAnniversaries.length;
  const calendarEmpty = eventCount === 0 && noteCount === 0 && anniversaryCount === 0;
  const empty = calendarEmpty && changeLines.length === 0;
  const calendarEmptyReason = anniversaryCount > 0
    ? 'upcoming_anniversary'
    : eventCount > 0 || noteCount > 0
      ? 'today_content'
      : changeLines.length
        ? 'new_change_only'
        : 'no_today_or_upcoming';
  const common = {
    date,
    event_count: eventCount,
    note_count: noteCount,
    anniversary_count: anniversaryCount,
    calendar_empty: calendarEmpty,
    calendar_empty_reason: calendarEmptyReason,
    upcoming_anniversaries: upcomingAnniversaries,
    events: day.events,
    notes: day.notes,
    new_changes: unseen,
    change_ids: unseen.map((change) => change.id),
  };
  if (empty) {
    return { ...common, empty: true, text: '' };
  }
  const lines = [
    '【海岸日历】',
    eventCount || noteCount
      ? `今日：${eventCount} 条事件，${noteCount} 张便签。`
      : '今日：无事件，无便签。',
    ...todayLines.map((line) => `- ${line}`),
    ...(upcomingAnniversaries.length
      ? [`近期纪念日：${upcomingAnniversaries.map((item) => item.text).join('；')}。`]
      : []),
    ...(changeLines.length ? ['未读变化：', ...changeLines.map((line) => `- ${line}`)] : []),
  ];
  return {
    ...common,
    empty: false,
    text: lines.join('\n'),
  };
}

export const calendarEnums = Object.freeze({
  precisions: [...PRECISIONS],
  eventTypes: [...EVENT_TYPES],
  actors: [...ACTORS],
  sources: [...SOURCES],
});

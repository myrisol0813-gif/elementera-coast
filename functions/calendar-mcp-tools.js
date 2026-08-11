import {
  calendarEnvironment,
  createCalendarEvent,
  createCalendarNote,
  deleteCalendarEvent,
  getCalendarEvent,
  listCalendarDay,
  listCalendarEvents,
  listCalendarUnseenChanges,
  markCalendarChangesSeen,
  updateCalendarEvent,
} from './calendar-store.js';

const OBJECT = Object.freeze({ type: 'object', additionalProperties: true });

function schema(properties = {}, required = []) {
  return { type: 'object', properties, required, additionalProperties: false };
}

function definition(name, title, description, inputSchema, scopes, { readOnly = false, destructive = false } = {}) {
  return Object.freeze({
    name,
    title,
    description,
    inputSchema,
    outputSchema: OBJECT,
    annotations: {
      readOnlyHint: readOnly,
      destructiveHint: destructive,
      openWorldHint: false,
    },
    scopes,
    invoking: `正在${title}…`,
    invoked: `${title}完成`,
  });
}

const EVENT_FIELDS = Object.freeze({
  id: { type: 'string', maxLength: 180 },
  title: { type: 'string', minLength: 1, maxLength: 240 },
  description: { type: 'string', maxLength: 12000 },
  starts_at: { type: 'string', maxLength: 80 },
  ends_at: { type: 'string', maxLength: 80 },
  precision: { type: 'string', enum: ['datetime', 'day', 'month_day'] },
  event_type: {
    type: 'string',
    enum: ['normal', 'birthday', 'anniversary', 'period', 'travel', 'work', 'commission', 'health', 'construction', 'custom'],
  },
  color_key: { type: 'string', maxLength: 60 },
  is_all_day: { type: 'boolean' },
  source_message_id: { type: 'string', maxLength: 240 },
});

export const CALENDAR_MCP_DEFINITIONS = Object.freeze([
  definition('calendar.today', '读取今日日历', 'Read today’s private Coast calendar, notes, and changes Xiaohan has not yet shown Myri.', schema({ date: { type: 'string', format: 'date' } }), ['read:coast'], { readOnly: true }),
  definition('calendar.list', '读取日历范围', 'List private Coast calendar events in an inclusive date range. New Xiaohan changes are marked.', schema({ from: { type: 'string', format: 'date' }, to: { type: 'string', format: 'date' } }, ['from', 'to']), ['read:coast'], { readOnly: true }),
  definition('calendar.create', '写入日历事件', 'Create an event in Xiaohan and Myri’s private Coast calendar.', schema(EVENT_FIELDS, ['title', 'starts_at']), ['write:lighthouse']),
  definition('calendar.update', '更新日历事件', 'Update one private Coast calendar event and record the change for Xiaohan.', schema(EVENT_FIELDS, ['id']), ['write:lighthouse']),
  definition('calendar.delete', '删除日历事件', 'Soft-delete one private Coast calendar event and record the change for Xiaohan.', schema({ id: EVENT_FIELDS.id }, ['id']), ['write:lighthouse'], { destructive: true }),
  definition('calendar.comment', '贴一张日历便签', 'Attach a Myri note to a date or event in the private Coast calendar.', schema({
    event_id: EVENT_FIELDS.id,
    date: { type: 'string', format: 'date' },
    content: { type: 'string', minLength: 1, maxLength: 8000 },
    color_key: EVENT_FIELDS.color_key,
  }, ['content']), ['write:lighthouse']),
  definition('calendar.env', '读取日历小条', 'Return one compact calendar slip. Empty calendars return empty=true and no shell text.', schema({ date: { type: 'string', format: 'date' } }), ['read:coast'], { readOnly: true }),
  definition('calendar.seen', '熄灭官端日历未读', 'Mark selected Xiaohan-to-Myri calendar change ids as seen after Myri has used them.', schema({ change_ids: { type: 'array', maxItems: 300, items: { type: 'string', maxLength: 180 } } }, ['change_ids']), ['write:lighthouse']),
]);

function dateOnly(value) {
  return String(value || new Date().toISOString()).slice(0, 10);
}

async function decorateNew(db, result) {
  const unseen = await listCalendarUnseenChanges(db, 'myri', { limit: 300 });
  const ids = new Set(unseen.map((change) => change.target_id));
  return {
    ...result,
    events: (result.events || []).map((event) => ({
      ...event,
      is_new_for_myri: ids.has(event.id),
      new_marker: ids.has(event.id) ? '[NEW]' : '',
    })),
    notes: (result.notes || []).map((note) => ({
      ...note,
      is_new_for_myri: ids.has(note.id),
      new_marker: ids.has(note.id) ? '[NEW]' : '',
    })),
    new_changes: unseen,
    change_ids: unseen.map((change) => change.id),
  };
}

export async function executeCalendarMcpTool(db, name, args = {}) {
  const context = { actor: 'myri', source: 'mcp' };
  if (name === 'calendar.today') {
    const day = await listCalendarDay(db, dateOnly(args.date));
    return { result: await decorateNew(db, day), text: `今天有 ${day.events.length} 条事件、${day.notes.length} 张便签。` };
  }
  if (name === 'calendar.list') {
    const events = await listCalendarEvents(db, { from: args.from, to: args.to });
    return { result: await decorateNew(db, { events, notes: [] }), text: `范围内共有 ${events.length} 条日历事件。` };
  }
  if (name === 'calendar.create') {
    const event = await createCalendarEvent(db, { ...args, created_by: 'myri', source: 'mcp' }, context);
    return { result: { event }, text: `已把「${event.title}」写进海岸日历。` };
  }
  if (name === 'calendar.update') {
    const { id, ...patch } = args;
    const event = await updateCalendarEvent(db, id, patch, context);
    return { result: { event }, text: `已更新「${event.title}」。` };
  }
  if (name === 'calendar.delete') {
    const event = await deleteCalendarEvent(db, args.id, context);
    return { result: { event }, text: `已把「${event.title}」从当前日历收起。` };
  }
  if (name === 'calendar.comment') {
    let date = args.date;
    if (!date && args.event_id) date = (await getCalendarEvent(db, args.event_id)).starts_at.slice(0, 10);
    const note = await createCalendarNote(db, { ...args, date, author: 'myri' }, context);
    return { result: { note }, text: 'Myri 的便签已经贴在那一天。' };
  }
  if (name === 'calendar.env') {
    const env = await calendarEnvironment(db, { date: dateOnly(args.date), include_new: true });
    return { result: { env }, text: env.empty ? '这一天没有需要注入的日历内容。' : env.text };
  }
  if (name === 'calendar.seen') {
    const seen = await markCalendarChangesSeen(db, 'myri', args.change_ids);
    return { result: seen, text: `已读过 ${seen.seen} 条来自小寒的日历变化。` };
  }
  return null;
}

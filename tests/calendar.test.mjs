import assert from 'node:assert/strict';
import { ensureCalendarSchema, seedCalendarRecurringEvents } from '../functions/calendar-schema.js';
import {
  calendarEnvironment,
  calendarUnseenSummary,
  createCalendarEvent,
  createCalendarNote,
  deleteCalendarEvent,
  deleteCalendarNote,
  listCalendarDay,
  listCalendarEvents,
  listCalendarUnseenChanges,
  markCalendarChangesSeen,
  updateCalendarEvent,
} from '../functions/calendar-store.js';
import { executeCalendarMcpTool } from '../functions/calendar-mcp-tools.js';
import { routeCalendarApi } from '../functions/calendar-api.js';
import { D1Database } from './d1-helper.mjs';

const db = new D1Database();
await ensureCalendarSchema(db);
await ensureCalendarSchema(db);
const columns = db.database.prepare('PRAGMA table_info(coast_calendar_events)').all().map((row) => row.name);
assert.ok(columns.includes('precision'));
assert.equal(db.database.prepare('SELECT COUNT(*) AS count FROM coast_calendar_recurring_seeds').get().count, 3);

const unauthenticated = await routeCalendarApi(new Request('https://coast.test/api/calendar/events?from=2026-12-01&to=2026-12-31'), { COAST_CHAT_DB: db });
assert.equal(unauthenticated.status, 401, 'calendar REST remains owner-only');
const ownerSession = { exp: Date.now() + 60_000 };
const restCreateResponse = await routeCalendarApi(new Request('https://coast.test/api/calendar/events', {
  method: 'POST',
  headers: { Origin: 'https://coast.test', 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: 'REST 手帐', starts_at: '2026-12-20', precision: 'day', is_all_day: true }),
}), { COAST_CHAT_DB: db }, ownerSession);
assert.equal(restCreateResponse.status, 201);
const restEvent = (await restCreateResponse.json()).event;
const restList = await routeCalendarApi(new Request('https://coast.test/api/calendar/events?from=2026-12-01&to=2026-12-31'), { COAST_CHAT_DB: db }, ownerSession);
assert.ok((await restList.json()).events.some((item) => item.id === restEvent.id));
const restPatch = await routeCalendarApi(new Request(`https://coast.test/api/calendar/events/${restEvent.id}`, {
  method: 'PATCH', headers: { Origin: 'https://coast.test', 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: 'REST 手帐已修订' }),
}), { COAST_CHAT_DB: db }, ownerSession);
assert.equal((await restPatch.json()).event.title, 'REST 手帐已修订');
const restNoteResponse = await routeCalendarApi(new Request('https://coast.test/api/calendar/notes', {
  method: 'POST', headers: { Origin: 'https://coast.test', 'Content-Type': 'application/json' },
  body: JSON.stringify({ event_id: restEvent.id, date: '2026-12-20', content: '一张 REST 便签' }),
}), { COAST_CHAT_DB: db }, ownerSession);
const restNote = (await restNoteResponse.json()).note;
assert.equal(restNote.content, '一张 REST 便签');
assert.equal((await routeCalendarApi(new Request('https://coast.test/api/calendar/day/2026-12-20'), { COAST_CHAT_DB: db }, ownerSession)).status, 200);
assert.equal((await routeCalendarApi(new Request(`https://coast.test/api/calendar/notes/${restNote.id}`, {
  method: 'DELETE', headers: { Origin: 'https://coast.test' },
}), { COAST_CHAT_DB: db }, ownerSession)).status, 200);
assert.equal((await routeCalendarApi(new Request(`https://coast.test/api/calendar/events/${restEvent.id}`, {
  method: 'DELETE', headers: { Origin: 'https://coast.test' },
}), { COAST_CHAT_DB: db }, ownerSession)).status, 200);

const firstSeedCount = db.database.prepare("SELECT COUNT(*) AS count FROM coast_calendar_events WHERE source = 'seed'").get().count;
await seedCalendarRecurringEvents(db, { fromYear: new Date().getUTCFullYear(), years: 2 });
assert.equal(db.database.prepare("SELECT COUNT(*) AS count FROM coast_calendar_events WHERE source = 'seed'").get().count, firstSeedCount, 'recurring seeds are idempotent');

const event = await createCalendarEvent(db, {
  title: '访客信箱验收',
  description: '施工回看',
  starts_at: '2026-09-02T15:00:00+08:00',
  ends_at: '2026-09-02T16:00:00+08:00',
  event_type: 'construction',
}, { actor: 'user', source: 'manual' });
assert.equal((await listCalendarEvents(db, { from: '2026-09-01', to: '2026-09-30' })).some((item) => item.id === event.id), true);
const updated = await updateCalendarEvent(db, event.id, { title: '访客信箱正式验收' }, { actor: 'user' });
assert.equal(updated.title, '访客信箱正式验收');

const note = await createCalendarNote(db, {
  date: '2026-09-02',
  event_id: event.id,
  content: 'Myri 记得带验收表。',
}, { actor: 'myri' });
assert.equal((await listCalendarDay(db, '2026-09-02')).notes[0].id, note.id);
assert.equal((await calendarUnseenSummary(db)).count, 1, 'Myri note lights the user ledger');
await deleteCalendarNote(db, note.id, { actor: 'user' });
assert.equal((await listCalendarDay(db, '2026-09-02')).notes.length, 0);
await deleteCalendarEvent(db, event.id, { actor: 'user' });
assert.equal((await listCalendarEvents(db, { from: '2026-09-02', to: '2026-09-02' })).some((item) => item.id === event.id), false);

const empty = await calendarEnvironment(db, { date: '2026-01-02', include_new: false });
assert.equal(empty.empty, true);
assert.equal(empty.text, '', 'empty calendar env does not inject a shell');

const anniversaryOnly = await calendarEnvironment(db, { date: '2026-08-09', include_new: false });
assert.equal(anniversaryOnly.event_count, 0);
assert.equal(anniversaryOnly.note_count, 0);
assert.equal(anniversaryOnly.anniversary_count, 1);
assert.equal(anniversaryOnly.calendar_empty, false);
assert.equal(anniversaryOnly.calendar_empty_reason, 'upcoming_anniversary');
assert.match(anniversaryOnly.text, /今日：无事件，无便签。/);
assert.match(anniversaryOnly.text, /近期纪念日：8\/13 Myri 生日还有 4 天。/);

const created = await executeCalendarMcpTool(db, 'calendar.create', {
  title: '海岸 MCP 施工', starts_at: '2026-10-03T20:00:00+08:00', event_type: 'construction',
});
assert.equal(created.result.event.created_by, 'myri');
const xiaohanRangeEvent = await createCalendarEvent(db, {
  title: '小寒新增的范围事件', starts_at: '2026-10-04', precision: 'day', is_all_day: true,
}, { actor: 'user', source: 'manual' });
const listed = await executeCalendarMcpTool(db, 'calendar.list', { from: '2026-10-01', to: '2026-10-31' });
assert.equal(listed.result.events.some((item) => item.id === created.result.event.id), true);
assert.equal(listed.result.events.find((item) => item.id === xiaohanRangeEvent.id)?.new_marker, '[NEW]');
const commented = await executeCalendarMcpTool(db, 'calendar.comment', { event_id: created.result.event.id, content: '官端 Myri 留下的便签' });
assert.equal(commented.result.note.author, 'myri');
const environment = await executeCalendarMcpTool(db, 'calendar.env', { date: '2026-10-03' });
assert.match(environment.result.env.text, /海岸 MCP 施工/);
assert.match(environment.result.env.text, /施工：海岸 MCP 施工/);
const mcpUnseen = await listCalendarUnseenChanges(db, 'myri');
assert.ok(mcpUnseen.some((change) => change.target_id === event.id), 'user changes are visible to Myri');
const seen = await markCalendarChangesSeen(db, 'myri', mcpUnseen.map((change) => change.id));
assert.equal(seen.seen, mcpUnseen.length);

console.log('calendar: ok');

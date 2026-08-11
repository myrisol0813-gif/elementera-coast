import assert from 'node:assert/strict';
import { createCalendarEvent, calendarEnvironment } from '../functions/calendar-store.js';
import { createConversation } from '../functions/chat-store.js';
import { createPocket } from '../functions/memory-store.js';
import { buildTodayCoastStatus } from '../functions/today-coast-status.js';
import { D1Database } from './d1-helper.mjs';

const db = new D1Database();
const conversation = await createConversation(db, '今日海岸测试');

const silent = await buildTodayCoastStatus(db, {
  surface: 'main_chat', conversationId: conversation.id,
  query: '普通闲聊', localDate: '2026-01-10', referenceEnabled: false,
});
assert.equal(silent.text, '');

const referencedEmpty = await buildTodayCoastStatus(db, {
  surface: 'main_chat', conversationId: conversation.id,
  query: '普通闲聊', localDate: '2026-01-10', referenceEnabled: true,
});
assert.equal(referencedEmpty.text, '', 'the preference must not create an empty model block');

const askedEmpty = await buildTodayCoastStatus(db, {
  surface: 'main_chat', conversationId: conversation.id,
  query: '今天有什么安排？', localDate: '2026-01-10', localDateTime: '2026-01-10 20:00',
});
assert.match(askedEmpty.text, /^【今日海岸】/);
assert.match(askedEmpty.text, /现在：2026-01-10 20:00/);
assert.match(askedEmpty.text, /海岸日历：今日暂无明确日程/);

await createCalendarEvent(db, {
  title: '验收干净桌面', starts_at: '2026-01-10T23:00:00.000Z',
  precision: 'datetime', event_type: 'work', created_by: 'user', source: 'manual',
}, { actor: 'user', source: 'manual' });
await createPocket(db, {
  conversation_id: conversation.id, source_type: 'turn', source_text: '一张待确认的纸条',
  title: '待确认纸条', life_core: '需要小寒确认。', content: '需要小寒确认。',
});
const important = await buildTodayCoastStatus(db, {
  surface: 'main_chat', conversationId: conversation.id,
  query: '普通闲聊', localDate: '2026-01-10', referenceEnabled: false,
});
assert.match(important.text, /验收干净桌面/);
assert.match(important.text, /待确认袋：新增 1 张纸条待确认/);
assert.equal(important.required, true);

const pendingOnly = await buildTodayCoastStatus(db, {
  surface: 'main_chat', conversationId: conversation.id,
  query: '普通闲聊', localDate: '2026-03-15', referenceEnabled: false,
});
assert.match(pendingOnly.text, /待确认袋：新增 1 张纸条待确认/);
assert.doesNotMatch(pendingOnly.text, /6\/5 小寒生日/, 'a distant anniversary is not injected merely because a pending pocket exists');

const referencedUpcoming = await buildTodayCoastStatus(db, {
  surface: 'main_chat', conversationId: conversation.id,
  query: '普通闲聊', localDate: '2026-03-15', referenceEnabled: true,
});
assert.match(referencedUpcoming.text, /6\/5 小寒生日/, 'the explicit per-window preference may surface a real upcoming item');

const anniversary = await calendarEnvironment(db, { date: '2026-08-09', include_new: false, include_upcoming: true });
assert.equal(anniversary.event_count, 0);
assert.equal(anniversary.note_count, 0);
assert.ok(anniversary.anniversary_count >= 1);
assert.equal(anniversary.calendar_empty, false);
assert.equal(anniversary.calendar_empty_reason, 'upcoming_anniversary');
assert.match(anniversary.text, /今日：无事件，无便签。/);
assert.match(anniversary.text, /近期纪念日：8\/13 Myri 生日还有 4 天。/);

const nearAnniversary = await buildTodayCoastStatus(db, {
  surface: 'main_chat', conversationId: '',
  query: '普通闲聊', localDate: '2026-08-09', referenceEnabled: false,
});
assert.match(nearAnniversary.text, /8\/13 Myri 生日还有 4 天/);

const visitor = await buildTodayCoastStatus(db, {
  surface: 'mailbox_visitor', conversationId: 'mailbox:someone',
  query: '今天的日历和待确认袋', localDate: '2026-01-10', referenceEnabled: true,
});
assert.equal(visitor.text, '');

console.log('today-coast-status: ok');

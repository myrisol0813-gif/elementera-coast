import assert from 'node:assert/strict';
import { createConversation } from '../functions/chat-store.js';
import { buildCrossWindowTouch, getWindowSettings, updateWindowSettings } from '../functions/cross-window-touch.js';
import { createEntry, writeSoil } from '../functions/memory-store.js';
import { windowSettingsMigrationIds } from '../functions/window-settings-schema.js';
import { D1Database } from './d1-helper.mjs';

const db = new D1Database();
const current = await createConversation(db, '当前主窗');
const other = await createConversation(db, '旧主窗');
await writeSoil(db, other.id, {
  current_text: '曾经把潮蓝苹果放在窗边。',
  hand_seeds: [{ name: '窗边果实', life_core: '潮蓝苹果是一枚已整理的手持种。' }],
  do_not_repeat: '',
});
await createEntry(db, {
  entry_type: 'memory', scope: 'conversation', conversation_id: other.id,
  title: '旧窗记忆', life_core: '已确认的潮蓝苹果记忆。', status: 'active',
});
db.database.prepare('UPDATE conversation_states SET state_json = ? WHERE conversation_id = ?')
  .run(JSON.stringify({ turns: [{ user: { variants: [{ content: 'RAW_CHAT_SECRET_NEVER_TOUCH' }] } }] }), other.id);

const defaults = await getWindowSettings(db, current.id);
assert.equal(defaults.cross_window_light_recall_enabled, false);
assert.equal(defaults.today_coast_reference_enabled, false);
assert.equal(
  db.database.prepare('SELECT id FROM schema_migrations WHERE id = ?').get(windowSettingsMigrationIds[0]).id,
  windowSettingsMigrationIds[0],
);

const off = await buildCrossWindowTouch(db, {
  conversationId: current.id, query: '找找其他窗口的潮蓝苹果', enabled: false,
});
assert.deepEqual(off, { entries: [], sources: [] });

const saved = await updateWindowSettings(db, current.id, {
  cross_window_light_recall_enabled: true,
  today_coast_reference_enabled: true,
});
assert.equal(saved.cross_window_light_recall_enabled, true);
assert.equal(saved.today_coast_reference_enabled, true);
const touch = await buildCrossWindowTouch(db, {
  conversationId: current.id,
  query: '请连通一千零一个触角，找回其他窗口的潮蓝苹果。',
  enabled: saved.cross_window_light_recall_enabled,
});
assert.deepEqual(touch.sources, ['旧主窗']);
assert.match(touch.entries[0], /^来源：旧主窗｜更新时间：/);
assert.match(touch.entries[0], /潮蓝苹果/);
assert.doesNotMatch(JSON.stringify(touch), /RAW_CHAT_SECRET_NEVER_TOUCH/);

console.log('cross-window-touch: ok');

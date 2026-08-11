import assert from 'node:assert/strict';
import { createConversation } from '../functions/chat-store.js';
import { apiMyriIdentity, officialMcpIdentity } from '../functions/coast-identity.js';
import { assembleCleanContext } from '../functions/context-assemble-clean.js';
import { registerMailboxVisitor } from '../functions/mailbox-service.js';
import { writeSoil } from '../functions/memory-store.js';
import { writeRoomMemory } from '../functions/room-memory.js';
import { RoomAccessError, roomAccess } from '../functions/surface-access-rules.js';
import { createWorldbookEntry } from '../functions/worldbook.js';
import { D1Database } from './d1-helper.mjs';

const db = new D1Database();
const env = { COAST_CHAT_DB: db, COAST_SESSION_SECRET: 'room-access-secret-'.repeat(5) };
const main = await createConversation(db, 'Owner private');
await writeSoil(db, main.id, { current_text: 'OWNER_MAIN_SOIL_SECRET' });

await writeRoomMemory(db, 'radio', apiMyriIdentity({ model_label: 'Room Test' }), {
  current_text: '无线电波自己的讨论纸条。',
  hand_seeds: [{ name: '电波种', life_core: '只沿着电波房行走。' }],
  do_not_repeat: '', pocket_candidates: [],
});
await writeRoomMemory(db, 'lighthouse', officialMcpIdentity({ model_label: 'Room Test' }), {
  current_text: '灯塔来信自己的低频纸条。',
  hand_seeds: [], do_not_repeat: '', pocket_candidates: [],
});

for (const [surface, expected, forbidden] of [
  ['radio', '无线电波自己', '灯塔来信自己'],
  ['lighthouse', '灯塔来信自己', '无线电波自己'],
]) {
  const lastUser = { role: 'user', content: `继续${expected}的内容。` };
  const assembled = await assembleCleanContext(env, {
    surface, roomId: surface, conversationId: `coast-room:${surface}:test`,
    messages: [lastUser], lastUser, permission: 'owner', preview: true,
  });
  const text = assembled.modelMessages.map((item) => item.content).join('\n');
  assert.match(text, new RegExp(expected));
  assert.doesNotMatch(text, /OWNER_MAIN_SOIL_SECRET/);
  assert.doesNotMatch(text, new RegExp(forbidden));
  assert.doesNotMatch(text, /【上下文目录】|Surface Profile|【海岸环境】/);
}

assert.throws(
  () => roomAccess('main_chat', { permission: 'visitor' }),
  (error) => error instanceof RoomAccessError && error.type === 'surface_forbidden',
);
assert.throws(
  () => roomAccess('mailbox_visitor', { permission: 'visitor' }),
  (error) => error instanceof RoomAccessError && error.type === 'visitor_id_required',
);
assert.throws(
  () => roomAccess('', { permission: 'owner' }),
  (error) => error instanceof RoomAccessError && error.type === 'surface_required',
);

await createWorldbookEntry(db, {
  title: '访客安全词', content: '只是当前访客可用的词典纸条。',
  keywords: ['同一发音'], scope: 'visitor', visitor_safe: true, priority: 300,
});
await createWorldbookEntry(db, {
  title: 'Owner 私密词', content: 'OWNER_WORLDBOOK_SECRET',
  keywords: ['同一发音'], scope: 'owner', visitor_safe: false, priority: 400,
});
const visitorA = await registerMailboxVisitor(db, env, { display_name: '访客甲', passphrase: '甲-独立暗号', allow_memory: true });
const visitorB = await registerMailboxVisitor(db, env, { display_name: '访客乙', passphrase: '乙-独立暗号', allow_memory: true });
const notebookTime = new Date().toISOString();
db.database.prepare(`INSERT INTO visitor_notebook_entries
  (id, visitor_id, title, life_core, content, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
  'visitor-a-relevant', visitorA.id, '同一发音的纸条', 'VISITOR_A_NOTEBOOK_MATCH', '只属于甲的相关记事。', notebookTime, notebookTime,
);
db.database.prepare(`INSERT INTO visitor_notebook_entries
  (id, visitor_id, title, life_core, content, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
  'visitor-a-unrelated', visitorA.id, '完全无关的收藏', 'VISITOR_A_UNRELATED_NOTEBOOK', '不应因为同属一人就每轮全部倾倒。', notebookTime, notebookTime,
);
db.database.prepare(`INSERT INTO visitor_notebook_entries
  (id, visitor_id, title, life_core, content, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
  'visitor-b-secret', visitorB.id, '同一发音的乙纸条', 'VISITOR_B_NOTEBOOK_SECRET', '不得进入甲的上下文。', notebookTime, notebookTime,
);
db.database.prepare('UPDATE mailbox_thought_soils SET current_text = ? WHERE visitor_id = ?')
  .run('VISITOR_A_SOIL_ONLY', visitorA.id);
db.database.prepare('UPDATE mailbox_thought_soils SET current_text = ? WHERE visitor_id = ?')
  .run('VISITOR_B_SOIL_SECRET', visitorB.id);

const visitorInput = { role: 'user', content: '同一发音，继续我自己的信。' };
const visitorContext = await assembleCleanContext(env, {
  surface: 'mailbox_visitor', conversationId: `mailbox:${visitorA.id}`, visitorId: visitorA.id,
  messages: [visitorInput], lastUser: visitorInput, permission: 'visitor', preview: true,
});
const visitorText = visitorContext.modelMessages.map((item) => item.content).join('\n');
assert.match(visitorText, /VISITOR_A_SOIL_ONLY/);
assert.match(visitorText, /访客安全词/);
assert.match(visitorText, /VISITOR_A_NOTEBOOK_MATCH/);
assert.doesNotMatch(visitorText, /VISITOR_A_UNRELATED_NOTEBOOK|VISITOR_B_NOTEBOOK_SECRET|VISITOR_B_SOIL_SECRET|OWNER_MAIN_SOIL_SECRET|OWNER_WORLDBOOK_SECRET/);
assert.deepEqual(visitorContext.tools, []);
assert.equal(Object.hasOwn(visitorContext, 'desk_slip'), false);

console.log('room-access: ok');

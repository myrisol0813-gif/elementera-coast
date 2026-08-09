import assert from 'node:assert/strict';
import { createConversation } from '../functions/chat-store.js';
import { officialMcpIdentity } from '../functions/coast-identity.js';
import { assembleContextForSurface } from '../functions/context-assembler.js';
import { writeSoil } from '../functions/memory-store.js';
import { writeRoomMemory } from '../functions/room-memory.js';
import { D1Database } from './d1-helper.mjs';

const db = new D1Database();
const main = await createConversation(db, 'Main private');
await writeSoil(db, main.id, { current_text: 'OWNER_MAIN_SOIL_SECRET 不得进入灯塔。' });
await writeRoomMemory(db, 'lighthouse', officialMcpIdentity({ model_label: 'Context Test' }), {
  current_text: '灯塔自己的低频长信方向。', hand_seeds: [], do_not_repeat: '', pocket_candidates: [],
  organized_through_turn_id: 'light-turn-1', source_turn_id: 'light-turn-1',
});
const lastUser = { role: 'user', content: '承接灯塔自己的低频长信方向。', turn_id: 'light-turn-1' };
const assembled = await assembleContextForSurface({ COAST_CHAT_DB: db }, {
  surface: 'lighthouse', conversationId: 'coast-room:lighthouse', roomId: 'lighthouse',
  messages: [lastUser], lastUser, sourceTurnId: 'light-turn-1', preview: true, permission: 'owner',
});
assert.match(assembled.manifest.body, /当前房间：灯塔来信/);
assert.equal(assembled.debug.surface_profile.surface, 'lighthouse');
assert.match(assembled.blocks.find((block) => block.key === 'thinking_soil').body, /灯塔自己的/);
assert.doesNotMatch(JSON.stringify(assembled.modelMessages), /OWNER_MAIN_SOIL_SECRET/);
assert.equal(assembled.blocks.find((block) => block.key === 'thinking_soil').scope, 'lighthouse');

console.log('lighthouse-context: ok');

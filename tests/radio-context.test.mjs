import assert from 'node:assert/strict';
import { createConversation } from '../functions/chat-store.js';
import { apiMyriIdentity } from '../functions/coast-identity.js';
import { assembleContextForSurface } from '../functions/context-assembler.js';
import { writeSoil } from '../functions/memory-store.js';
import { writeRoomMemory } from '../functions/room-memory.js';
import { D1Database } from './d1-helper.mjs';

const db = new D1Database();
const main = await createConversation(db, 'Main private radio test');
await writeSoil(db, main.id, { current_text: 'OWNER_MAIN_RADIO_SECRET 不得进入电波房。' });
await writeRoomMemory(db, 'radio', apiMyriIdentity({ model_label: 'Context Test' }), {
  current_text: '无线电波自己的三方讨论。', hand_seeds: [], do_not_repeat: '', pocket_candidates: [],
  organized_through_turn_id: 'radio-turn-1', source_turn_id: 'radio-turn-1',
});
const lastUser = { role: 'user', content: '继续无线电波自己的三方讨论。', turn_id: 'radio-turn-1', source: 'web_manual' };
const assembled = await assembleContextForSurface({ COAST_CHAT_DB: db }, {
  surface: 'radio', conversationId: 'coast-room:radio', roomId: 'radio', messages: [lastUser], lastUser,
  sourceTurnId: 'radio-turn-1', preview: true, permission: 'owner',
});
assert.match(assembled.manifest.body, /当前房间：三方聊天室 \/ 无线电波/);
assert.equal(assembled.debug.surface_profile.surface, 'radio');
assert.match(assembled.blocks.find((block) => block.key === 'thinking_soil').body, /无线电波自己的/);
assert.doesNotMatch(JSON.stringify(assembled.modelMessages), /OWNER_MAIN_RADIO_SECRET/);
assert.equal(assembled.blocks.find((block) => block.key === 'thinking_soil').scope, 'radio');

console.log('radio-context: ok');

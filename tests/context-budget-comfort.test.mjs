import assert from 'node:assert/strict';
import { createConversation } from '../functions/chat-store.js';
import { assembleContextForSurface } from '../functions/context-assembler.js';
import { writeSoil } from '../functions/memory-store.js';
import { D1Database } from './d1-helper.mjs';

const db = new D1Database();
const conversation = await createConversation(db, 'Budget Comfort');
const messages = Array.from({ length: 8 }, (_, index) => ({
  role: index % 2 ? 'assistant' : 'user',
  content: `${index % 2 ? 'Myri 回应' : '小寒输入'} ${index + 1}：${'海岸日常。'.repeat(25)}`,
  turn_id: `turn-${index + 1}`,
}));
messages.push({ role: 'user', content: '当前用户输入必须永远保留，今天聊海岸日常。', turn_id: 'turn-9' });
await writeSoil(db, conversation.id, {
  current_text: `承接海岸日常。${'这是一段很长但可压缩的思维壤。'.repeat(520)}`,
  hand_seeds: Array.from({ length: 7 }, (_, index) => ({ name: `手持种 ${index}`, life_core: '自然牵引当前日常。' })),
  do_not_repeat: '不要说明书式重复。'.repeat(100),
  organized_through_turn_id: 'turn-9',
});
const assembled = await assembleContextForSurface({ COAST_CHAT_DB: db }, {
  surface: 'main_chat', conversationId: conversation.id, sourceTurnId: 'turn-9',
  messages, lastUser: messages.at(-1), preview: true, permission: 'owner',
  settings: { contextBudget: 3000, recentTurns: 8, soilBudget: 1000, calendarInjection: 'off' },
});
assert.equal(assembled.modelMessages.at(-1).content, messages.at(-1).content);
assert.equal(assembled.budget.current_user_preserved, true);
assert.equal(assembled.budget.over_budget, false);
assert.equal(assembled.budget.compression_applied, true);
assert.ok(assembled.budget.soil_original_length > assembled.budget.soil_model_length);
assert.ok(assembled.budget.recent_messages_kept >= 4, 'normal chat keeps at least the latest two rounds');
assert.equal(assembled.debug.full_soil.includes('很长但可压缩'), true);
assert.ok(assembled.debug.model_soil_brief.length <= 1000);

console.log('context-budget-comfort: ok');

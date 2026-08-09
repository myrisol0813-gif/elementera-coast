import assert from 'node:assert/strict';
import { createConversation } from '../functions/chat-store.js';
import { buildAmbientContext } from '../functions/context-ambient.js';
import { assembleContextForSurface, budgetContextMessages } from '../functions/context-assembler.js';
import { buildContextDebug } from '../functions/context-inspector.js';
import { buildContextManifest, contextBlock } from '../functions/context-manifest.js';
import { getContextState, setCurrentMode, updateModeCard } from '../functions/context-modes.js';
import { buildMemoryFacets } from '../functions/context-memory-facets.js';
import { buildMemoryContext } from '../functions/memory-recall.js';
import { createEntry, listRecallPool } from '../functions/memory-store.js';
import { D1Database } from './d1-helper.mjs';

const manifest = buildContextManifest({
  surface: 'main_chat',
  roomLabel: '主聊天',
  mode: { mode_key: 'construction_review', title: '施工审查' },
  lastUser: '请升级上下文系统。',
  blocks: [contextBlock({ key: 'thinking_soil', title: '思维壤', body: '当前施工', source: 'd1', scope: 'current_conversation', priority: 'medium', freshness: 'live', confidence: 'user_confirmed', use_hint: '承接方向', avoid_hint: '不要复述' })],
});
assert.match(manifest.body, /当前房间：主聊天/);
assert.match(manifest.body, /当前情境：施工审查/);
assert.match(manifest.body, /priority=medium/);
assert.match(manifest.body, /不要创建多个 Myri/);
assert.match(manifest.body, /当前用户输入/);

const db = new D1Database();
const conversation = await createConversation(db, 'Context Test');
const initial = await getContextState(db, { conversation_id: conversation.id });
assert.equal(initial.mode.mode_key, 'normal_chat');
assert.equal(initial.settings.context_budget, 6000);
assert.equal(initial.settings.recent_message_turns, 8);
assert.equal(initial.settings.soil_budget, 1000);
const switched = await setCurrentMode(db, 'construction_review', { conversation_id: conversation.id });
assert.equal(switched.mode.mode_key, 'construction_review');

const ambient = await buildAmbientContext({ COAST_CHAT_DB: db }, {
  localDate: '2026-08-09', localDateTime: '2026-08-09 15:36', surface: 'main_chat',
  conversationId: conversation.id, model: 'openai/gpt-5', mode: switched.mode,
  settings: { ambient: { time: false, calendar: false, tools: true, room: false, model: false }, calendar_injection: 'off' },
  tools: [{ tool_key: 'memory.search' }], permission: 'owner',
});
assert.doesNotMatch(ambient.block.body, /本地时间/);
assert.doesNotMatch(ambient.block.body, /当前房间/);
assert.match(ambient.block.body, /1 项（记忆）/);
const todayOnly = await buildAmbientContext({ COAST_CHAT_DB: db }, {
  localDate: '2026-08-09', localDateTime: '2026-08-09 15:36', surface: 'main_chat',
  conversationId: conversation.id, mode: switched.mode,
  settings: { ambient: { time: false, calendar: true, tools: false, room: false, model: false }, calendar_injection: 'today_only' },
  permission: 'owner',
});
assert.equal(todayOnly.calendar.empty, true, 'today_only ignores a future recurring seed');
assert.doesNotMatch(todayOnly.block.body, /Myri 生日/);

const baseMemory = {
  id: 'memory-orb', entry_type: 'memory', scope: 'global', life_core: '记忆球强调情境面。',
  source_type: 'manual', source_confidence: 'user_confirmed', updated_at: new Date().toISOString(),
  facet_policy: {
    construction_review: { use_hint: '作为架构参考', summary_override: '提取记忆球字段与召回路径。' },
    quiet_comfort: { use_hint: '只作温柔底色，不展开技术细节' },
  },
};
const result = { global_memories: [baseMemory] };
const construction = buildMemoryFacets(result, 'construction_review');
const quiet = buildMemoryFacets(result, 'quiet_comfort');
assert.equal(construction[0].use_hint, '作为架构参考');
assert.equal(quiet[0].use_hint, '只作温柔底色，不展开技术细节');
const contradicted = buildMemoryFacets({ global_memories: [{ ...baseMemory, contradiction_note: '旧字段已变更' }] }, 'construction_review');
assert.match(contradicted[0].avoid_hint, /不可压过当前输入/);

const old = await createEntry(db, { entry_type: 'memory', scope: 'global', title: '旧架构', life_core: '旧版字段。' });
await createEntry(db, { entry_type: 'memory', scope: 'global', title: '新架构', life_core: '新版字段。', supersedes_entry_id: old.id });
const recallPool = await listRecallPool(db, { entry_type: 'memory', scope: 'global' });
assert.equal(recallPool.some((entry) => entry.id === old.id), false, 'superseded memories do not auto-recall');
const historicalRecall = await buildMemoryContext({ COAST_CHAT_DB: db }, 'owner', conversation.id, '请找记忆里的历史版本：旧架构', {
  mode: 'chat', conversation_turns: 8,
});
assert.equal(historicalRecall.global_memories.some((entry) => entry.id === old.id), true, 'an explicit history request may recall a superseded entry');
await createEntry(db, {
  entry_type: 'memory', scope: 'global', title: '冲突潮汐', life_core: '这是旧版的潮汐判断。',
  contradiction_note: '小寒后来已经更正过',
});
const contradictionWithoutFacets = await assembleContextForSurface({ COAST_CHAT_DB: db }, {
  conversationId: conversation.id,
  messages: [{ role: 'user', content: '冲突潮汐' }],
  lastUser: { role: 'user', content: '冲突潮汐' },
  settings: { memoryFacetsEnabled: false, contextBudget: 12000 },
  localDate: '2026-08-09', modeKey: 'construction_review', surface: 'main_chat', preview: true,
});
assert.equal(contradictionWithoutFacets.blocks.some((block) => block.key === 'memory_facets'), false);
assert.match(contradictionWithoutFacets.manifest.body, /冲突提示：1 条记忆/);
assert.match(contradictionWithoutFacets.modelMessages[0].content, /可能冲突.*不可压过当前输入/s);

const tightBudget = await assembleContextForSurface({ COAST_CHAT_DB: db }, {
  conversationId: conversation.id,
  messages: [
    { role: 'assistant', content: '旧回复'.repeat(1200) },
    { role: 'user', content: '当前输入必须留下' },
  ],
  lastUser: { role: 'user', content: '当前输入必须留下' },
  settings: { contextBudget: 1000 },
  localDate: '2026-08-09', modeKey: 'construction_review', surface: 'main_chat', preview: true,
});
assert.match(tightBudget.modelMessages[0].content, /【上下文目录】/);
assert.equal(tightBudget.modelMessages.at(-1).content, '当前输入必须留下');
assert.equal(tightBudget.trace.current_user_preserved, true);
assert.equal(tightBudget.trace.over_budget, false);

const budgeted = budgetContextMessages([
  { role: 'user', content: '旧输入'.repeat(200) },
  { role: 'assistant', content: '旧回复'.repeat(800) },
  { role: 'user', content: '当前用户输入' },
], '低优先上下文'.repeat(100), { contextBudget: 256, recentTurns: 8 });
assert.equal(budgeted.messages.at(-1).content, '当前用户输入');
assert.equal(budgeted.trace.current_user_preserved, true);

await updateModeCard(db, 'construction_review', {
  default_context_settings: { calendar_injection: 'off' },
});

const assembled = await assembleContextForSurface({ COAST_CHAT_DB: db }, {
  conversationId: conversation.id,
  messages: [{ role: 'user', content: '请检查 Context Manifest 和记忆球。' }],
  lastUser: { role: 'user', content: '请检查 Context Manifest 和记忆球。' },
  settings: { contextBudget: 12000 },
  localDate: '2026-08-09', localDateTime: '2026-08-09 15:36',
  modeKey: 'construction_review', surface: 'main_chat', model: 'openai/gpt-5', preview: true,
});
assert.equal(assembled.modelMessages[0].role, 'system');
assert.match(assembled.modelMessages[0].content, /【上下文目录】/);
assert.match(assembled.modelMessages[0].content, /【海岸环境】/);
assert.equal(assembled.modelMessages.at(-1).content, '请检查 Context Manifest 和记忆球。');
assert.equal(assembled.settings.calendar_injection, 'off', 'mode defaults participate in context assembly');
assert.equal(assembled.tool_registry.length, assembled.tools.length, 'manifest tools exactly match provider-exposed tools');
assert.deepEqual(assembled.tool_registry.map((tool) => tool.model_name), assembled.tools.map((tool) => tool.function.name));
assert.equal(assembled.modelMessages.some((message) => message.content.includes('generated_at')), false, 'inspector debug is not injected into model messages');
const debug = buildContextDebug({ manifest: assembled.manifest, blocks: assembled.blocks, trace: assembled.trace });
assert.ok(debug.generated_at);

console.log('context-manifest: ok');

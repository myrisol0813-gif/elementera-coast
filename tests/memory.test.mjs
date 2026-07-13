import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createConversation } from '../functions/chat-store.js';
import { routeChatApi } from '../functions/chat-router.js';
import {
  deleteEntryVector,
  detectEmbeddingDimensions,
  embeddingText,
  syncEntryVector,
  vectorStatus,
} from '../functions/embedding.js';
import { buildMemoryContext, formatMemoryContext, searchMemory } from '../functions/memory-recall.js';
import {
  createPocket,
  createEntry,
  deletePocket,
  deleteEntry,
  listEntries,
  listPockets,
  patchEntry,
  patchPocket,
  readSoil,
  resolvePocket,
  writeSoil,
} from '../functions/memory-store.js';

class D1Statement {
  constructor(database, sql, params = []) { this.database = database; this.sql = sql; this.params = params; }
  bind(...params) { return new D1Statement(this.database, this.sql, params); }
  async run() {
    const result = this.database.prepare(this.sql).run(...this.params);
    return { success: true, meta: { changes: Number(result.changes || 0) } };
  }
  async first() { return this.database.prepare(this.sql).get(...this.params) || null; }
  async all() { return { results: this.database.prepare(this.sql).all(...this.params) }; }
}

class D1Database {
  constructor() { this.database = new DatabaseSync(':memory:'); }
  prepare(sql) { return new D1Statement(this.database, sql); }
  async batch(statements) {
    this.database.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.database.exec('COMMIT');
      return results;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }
}

const db = new D1Database();
const conversationA = await createConversation(db, 'A');
const conversationB = await createConversation(db, 'B');

const originalA = await readSoil(db, conversationA.id);
const originalB = await readSoil(db, conversationB.id);
assert.equal(originalA.current_text, '');
assert.equal(originalB.current_text, '');

const seeds = Array.from({ length: 10 }, (_, index) => ({
  name: `种子 ${index}`,
  life_core: `生命核 ${index}`,
  usage_hint: '需要时使用',
  avoid_hint: '不要复读',
}));
const writtenA = await writeSoil(db, conversationA.id, {
  current_text: '只属于窗口 A',
  hand_seeds: seeds,
  do_not_repeat: '已经确认',
  pocket_candidates: ['候选一'],
});
assert.equal(writtenA.hand_seeds.length, 7, 'thought soil must cap hand seeds at seven');
assert.equal(writtenA.manual_locked, true);
assert.equal((await readSoil(db, conversationB.id)).current_text, '', 'conversation soils must not cross windows');
await assert.rejects(
  () => writeSoil(db, conversationA.id, { current_text: 'automatic overwrite' }, { automatic: true }),
  (error) => error.type === 'soil_locked' && error.status === 409,
);

const pendingA = await createPocket(db, {
  conversation_id: conversationA.id,
  source_type: 'message',
  source_ref: { conversation_id: conversationA.id, turn_id: 'turn-1', role: 'assistant', assistant_variant: 1 },
  source_text: '只落袋当前 active assistant variant',
});
await createPocket(db, {
  conversation_id: conversationB.id,
  source_type: 'turn',
  source_ref: { conversation_id: conversationB.id, turn_id: 'turn-2', role: 'turn' },
  source_text: '窗口 B 的一轮',
});
assert.equal((await listPockets(db, { conversation_id: conversationA.id, status: 'pending' })).length, 1);
assert.equal((await listPockets(db, { conversation_id: conversationB.id, status: 'pending' })).length, 1);
assert.equal(pendingA.source_ref.assistant_variant, 1);

const stone = await patchPocket(db, pendingA.id, {
  suggested_title: '石头前的标题',
  suggested_life_core: '暂时不进入正式记忆',
  status: 'stone',
});
assert.equal(stone.status, 'stone');
assert.equal((await listPockets(db, { conversation_id: conversationA.id, status: 'pending' })).length, 0);
assert.equal((await listPockets(db, { conversation_id: conversationA.id, status: 'stone' })).length, 1);
await deletePocket(db, pendingA.id);
assert.equal((await listPockets(db, { conversation_id: conversationA.id, status: 'stone' })).length, 0, 'pocket deletion must be soft but hidden');

const destinations = [
  ['conversation_seed', 'seed', 'conversation'],
  ['global_seed', 'seed', 'global'],
  ['conversation_memory', 'memory', 'conversation'],
  ['global_memory', 'memory', 'global'],
];
const resolved = [];
for (const [action, entryType, scope] of destinations) {
  const pocket = await createPocket(db, {
    conversation_id: conversationA.id,
    source_type: 'message',
    source_ref: { conversation_id: conversationA.id, turn_id: action, role: 'user' },
    source_text: `${action} 的原文`,
  });
  const result = await resolvePocket(db, pocket.id, {
    action,
    title: `${action} 标题`,
    life_core: `${action} 生命核`,
  });
  assert.equal(result.pocket.status, 'confirmed');
  assert.equal(result.entry.entry_type, entryType);
  assert.equal(result.entry.scope, scope);
  assert.equal(result.entry.conversation_id, scope === 'conversation' ? conversationA.id : null);
  assert.equal(result.entry.embedding_status, 'pending');
  resolved.push(result.entry);
}
assert.equal((await listPockets(db, { conversation_id: conversationA.id, status: 'pending' })).length, 0);

const currentSeedsA = await listEntries(db, { conversation_id: conversationA.id, scope: 'conversation', entry_type: 'seed' });
const currentSeedsB = await listEntries(db, { conversation_id: conversationB.id, scope: 'conversation', entry_type: 'seed' });
assert.equal(currentSeedsA.entries.length, 1);
assert.equal(currentSeedsB.entries.length, 0, 'conversation entries must not cross windows');
const globalSeeds = await listEntries(db, { conversation_id: conversationA.id, scope: 'global', entry_type: 'seed' });
assert.equal(globalSeeds.entries.length, 1, 'global entries must be available independently of a conversation');

const manual = await createEntry(db, {
  entry_type: 'memory',
  scope: 'conversation',
  conversation_id: conversationA.id,
  title: '手动家具',
  life_core: '只有用户可以标记为 core',
  memory_level: 'core',
});
assert.equal(manual.memory_level, 'core');
const promoted = await patchEntry(db, manual.id, { scope: 'global' });
assert.equal(promoted.entry.scope, 'global');
assert.equal(promoted.entry.conversation_id, null);
const copied = await patchEntry(db, promoted.entry.id, { scope: 'conversation', conversation_id: conversationB.id });
assert.equal(copied.copied, true);
assert.equal(copied.entry.conversation_id, conversationB.id);
assert.equal(copied.entry.promoted_from_id, promoted.entry.id);
assert.equal((await listEntries(db, { conversation_id: conversationA.id, scope: 'global', q: '手动家具' })).entries.length, 1);
await deleteEntry(db, copied.entry.id);
assert.equal((await listEntries(db, { conversation_id: conversationB.id, scope: 'conversation', q: '手动家具' })).entries.length, 0, 'entry deletion must be soft but hidden');

for (let index = 0; index < 3; index += 1) {
  await createEntry(db, {
    entry_type: 'seed',
    scope: 'conversation',
    conversation_id: conversationA.id,
    title: `潮汐钥匙 · 近岸 ${index}`,
    life_core: '潮汐钥匙只在当前窗口发热',
  });
  await createEntry(db, {
    entry_type: 'seed',
    scope: 'global',
    title: `潮汐钥匙 · 远岸 ${index}`,
    life_core: '潮汐钥匙跨窗口沉睡',
  });
}
const pendingOnly = await createPocket(db, {
  conversation_id: conversationA.id,
  source_type: 'message',
  source_ref: { conversation_id: conversationA.id, turn_id: 'pending-only', role: 'user' },
  source_text: '绝密待定词不能参加召回',
});
const noVectorEnv = { COAST_CHAT_DB: db };
const pendingRecall = await buildMemoryContext(noVectorEnv, 'owner', conversationA.id, '绝密待定词', {
  mode: 'chat',
  conversation_turns: 8,
});
assert.equal(pendingRecall.trace.selected.length, 0, 'pending pockets must never participate in recall');
assert.equal((await listPockets(db, { conversation_id: conversationA.id, status: 'pending' })).some((pocket) => pocket.id === pendingOnly.id), true);

const firstRecall = await buildMemoryContext(noVectorEnv, 'owner', conversationA.id, '潮汐钥匙', {
  mode: 'chat',
  conversation_turns: 8,
});
assert.equal(firstRecall.conversation_seeds.length, 3);
assert.equal(firstRecall.global_seeds.length, 1);
assert.ok(firstRecall.conversation_seeds.length > firstRecall.global_seeds.length, 'conversation seeds must be easier to recall than global seeds');
const secondRecall = await buildMemoryContext(noVectorEnv, 'owner', conversationA.id, '潮汐钥匙', {
  mode: 'chat',
  conversation_turns: 8,
  recent_entry_ids: firstRecall.trace.selected,
});
assert.equal(secondRecall.conversation_seeds.some((entry) => firstRecall.trace.selected.includes(entry.id)), false, 'a seed cannot be recalled on consecutive turns');
assert.match(formatMemoryContext(firstRecall), /当前用户输入优先/);

for (const status of ['archived', 'stone', 'discarded']) {
  await createEntry(db, {
    entry_type: 'memory',
    scope: 'conversation',
    conversation_id: conversationA.id,
    title: `不应召回-${status}`,
    life_core: '封存石头丢弃测试词',
    status,
  });
}
const excludedRecall = await buildMemoryContext(noVectorEnv, 'owner', conversationA.id, '封存石头丢弃测试词', {
  mode: 'chat',
  conversation_turns: 8,
});
assert.equal(excludedRecall.trace.selected.length, 0, 'archived, stone, and discarded entries must not enter chat recall');
const isolatedSearch = await searchMemory(noVectorEnv, 'owner', {
  conversation_id: conversationB.id,
  scope: 'conversation',
  query: '潮汐钥匙',
});
assert.equal(isolatedSearch.entries.length, 0, 'search must not mix another conversation\'s local entries');

const vectorCalls = { upserts: [], deletes: [], queries: [] };
const fakeAi = {
  async run(model, input) {
    assert.equal(model, '@cf/baai/bge-m3');
    return { data: input.text.map(() => [0.1, 0.2, 0.3, 0.4, 0.5]) };
  },
};
const fakeVector = {
  async upsert(vectors) { vectorCalls.upserts.push(...vectors); },
  async deleteByIds(ids) { vectorCalls.deletes.push(...ids); },
  async query(_values, options) { vectorCalls.queries.push(options); return { matches: [] }; },
};
const vectorEnv = { COAST_CHAT_DB: db, AI: fakeAi, COAST_MEMORY_VECTOR: fakeVector };
assert.equal(await detectEmbeddingDimensions(vectorEnv), 5, 'embedding dimensions must come from the actual response shape');
const confirmed = await createEntry(db, {
  entry_type: 'memory',
  scope: 'conversation',
  conversation_id: conversationA.id,
  title: '向量家具',
  life_core: '只有已确认条目才建立索引',
  content: '更新后需要重新 upsert',
  source_ref: { private_chat_text: '不能拼进 embedding' },
});
const pocketBeforeIndex = await createPocket(db, {
  conversation_id: conversationA.id,
  source_type: 'message',
  source_ref: { conversation_id: conversationA.id, turn_id: 'no-vector', role: 'user' },
  source_text: 'pending pocket 不 embedding',
});
assert.equal(vectorCalls.upserts.length, 0);
assert.ok(pocketBeforeIndex);
assert.equal(embeddingText(confirmed).includes('private_chat_text'), false, 'source references cannot enter embedding text');
const indexed = await syncEntryVector(vectorEnv, db, confirmed);
assert.equal(indexed.entry.embedding_status, 'ready');
assert.equal(indexed.dimensions, 5);
assert.equal(vectorCalls.upserts.length, 1);
const changed = await patchEntry(db, confirmed.id, { life_core: '更新后的生命核会重新索引' });
assert.equal(changed.entry.embedding_status, 'pending');
await syncEntryVector(vectorEnv, db, changed.entry);
assert.equal(vectorCalls.upserts.length, 2, 'updated entries must be upserted again');
const deletedConfirmed = await deleteEntry(db, confirmed.id);
await deleteEntryVector(vectorEnv, deletedConfirmed);
assert.deepEqual(vectorCalls.deletes, [confirmed.id], 'soft deletion must remove the derived vector');
const unbound = await createEntry(db, {
  entry_type: 'memory',
  scope: 'conversation',
  conversation_id: conversationA.id,
  title: '无向量仍可保存',
  life_core: 'D1 CRUD 不依赖 Vectorize',
});
const unboundResult = await syncEntryVector(noVectorEnv, db, unbound);
assert.equal(unboundResult.entry.embedding_status, 'pending');
assert.equal((await listEntries(db, { conversation_id: conversationA.id, scope: 'conversation', q: '无向量仍可保存' })).entries.length, 1);
const status = await vectorStatus(vectorEnv);
assert.equal(status.detected_dimensions, 5);
assert.equal(status.index_ready, true);

const originalFetch = globalThis.fetch;
let providerPayload = null;
globalThis.fetch = async (input, options = {}) => {
  const url = String(input);
  if (url.includes('/api/v1/models')) {
    return new Response(JSON.stringify({ data: [{
      id: 'openai/gpt-4.1-nano',
      name: 'GPT-4.1 Nano',
      architecture: { output_modalities: ['text'] },
      supported_parameters: ['temperature'],
      pricing: { prompt: '0.1', completion: '0.2' },
    }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (url.includes('/api/v1/chat/completions')) {
    providerPayload = JSON.parse(options.body);
    return new Response(JSON.stringify({
      model: 'openai/gpt-4.1-nano',
      choices: [{ message: { content: '带着轻量上下文回答。' }, finish_reason: 'stop' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  throw new Error(`unexpected fetch: ${url}`);
};
const chatResponse = await routeChatApi(new Request('https://coast.test/api/chat', {
  method: 'POST',
  headers: { Origin: 'https://coast.test', 'Content-Type': 'application/json' },
  body: JSON.stringify({
    conversation_id: conversationA.id,
    model: 'openai/gpt-4.1-nano',
    messages: [{ role: 'user', content: '潮汐钥匙' }],
    settings: { conversationSeedLimit: 3, globalSeedLimit: 1, max_tokens: 80, temperature: 0.2 },
  }),
}), { COAST_CHAT_DB: db, OPENROUTER_API_KEY: 'test-key' });
const chatData = await chatResponse.json();
globalThis.fetch = originalFetch;
assert.equal(chatResponse.status, 200);
assert.equal(providerPayload.messages[0].role, 'system');
assert.match(providerPayload.messages[0].content, /思维壤/);
assert.match(providerPayload.messages[0].content, /当前窗口种子/);
assert.match(providerPayload.messages[0].content, /当前用户输入优先/);
assert.deepEqual(providerPayload.messages.at(-1), { role: 'user', content: '潮汐钥匙' });
assert.ok(chatData.memory.selected_entry_ids.length > 0);

console.log('memory: ok');

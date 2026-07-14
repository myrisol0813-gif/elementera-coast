import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createConversation, readConversationState, writeConversationState, writeProfile } from '../functions/chat-store.js';
import {
  budgetChatMessages,
  clipGeneratedTitle,
  estimateContextTokens,
  formalChatRequestSettings,
  landingRequestSettings,
  routeChatApi,
} from '../functions/chat-router.js';
import { soilSettings } from '../functions/memory-config.js';
import { routeMemoryApi } from '../functions/memory-router.js';
import {
  deleteEntryVector,
  deletePocketVectors,
  detectEmbeddingDimensions,
  embeddingText,
  pocketVectorIds,
  syncEntryVector,
  syncPocketVectors,
  vectorStatus,
} from '../functions/embedding.js';
import { buildMemoryContext, formatMemoryContext, searchMemory } from '../functions/memory-recall.js';
import {
  createPocket,
  createEntry,
  deletePocket,
  deleteEntry,
  getPocket,
  listEntries,
  listPocketMemberships,
  listPockets,
  normalizePocketCandidates,
  patchEntry,
  patchPocket,
  pocketFingerprint,
  readSoil,
  resolvePocket,
  upsertSoilPocketCandidates,
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
const conversationC = await createConversation(db, 'C');
const conversationD = await createConversation(db, 'D');

assert.equal(estimateContextTokens('海岸'), 2);
assert.equal(estimateContextTokens('coast'), 2);
assert.equal(clipGeneratedTitle('一二三四五六七八九十十一十二十三'), '一二三四五六七八九十十一');
assert.equal(landingRequestSettings({ outputLength: 'short', max_tokens: 100 }).max_tokens, 700);
assert.equal(landingRequestSettings({ outputLength: 'short', max_tokens: 9999 }).max_tokens, 700);
assert.equal(landingRequestSettings({ outputLength: 'auto', max_tokens: 600 }).max_tokens, null);
assert.equal(landingRequestSettings({ outputLength: 'long', max_tokens: 9999 }).max_tokens, null);
assert.equal(formalChatRequestSettings({ outputLength: 'short', max_tokens: 350 }).max_tokens, 700);
assert.equal(formalChatRequestSettings({ outputLength: 'auto', max_tokens: 600 }).max_tokens, null);
assert.equal(formalChatRequestSettings({ outputLength: 'long', max_tokens: 1200 }).max_tokens, null);
assert.equal(formalChatRequestSettings({ max_tokens: 80 }).max_tokens, 80, 'low-level callers without an output preference keep their explicit budget');
const assistantFirst = budgetChatMessages([
  { role: 'user', content: '旧'.repeat(80) },
  { role: 'assistant', content: 'a'.repeat(2000) },
  { role: 'user', content: '现在' },
], '记'.repeat(80), { recentTurns: 8, contextBudget: 256 });
assert.equal(assistantFirst.trace.trimmed.assistants, 1, 'old assistant content is trimmed first');
assert.equal(assistantFirst.trace.trimmed.users, 0);
assert.equal(assistantFirst.trace.trimmed.soft_context, false);
assert.deepEqual(assistantFirst.messages.map((message) => message.role), ['system', 'user', 'user']);
const preserveCurrent = budgetChatMessages([
  { role: 'user', content: '旧'.repeat(300) },
  { role: 'assistant', content: 'a'.repeat(2000) },
  { role: 'user', content: '当前输入' },
], '记'.repeat(300), { recentTurns: 8, contextBudget: 256 });
assert.deepEqual(preserveCurrent.messages, [{ role: 'user', content: '当前输入' }]);
assert.equal(preserveCurrent.trace.current_user_preserved, true);
assert.deepEqual(soilSettings({ autoRefreshEveryTurns: 99, maxHandSeeds: 0 }), {
  autoRefreshEveryTurns: 12,
  maxHandSeeds: 1,
  soilBudget: 1200,
});

const structuredCandidates = normalizePocketCandidates([{
  candidate_id: 'coast-return',
  title: '回潮后的未竟方向',
  life_core: '暂时不沿这条路走，但它仍能长出新的理解。',
  content: '把相关的两段对话压缩保留在这里。',
  usage_hint: '再次谈到回潮与选择时触碰。',
  avoid_hint: '不要把它当作已经确认的长期记忆。',
  source_refs: [{ turn_id: 'turn-structured', role: 'turn' }],
  source_excerpt: '那条路暂时放下，但没有死去。',
}]);
assert.deepEqual(structuredCandidates[0], {
  candidate_id: 'coast-return',
  title: '回潮后的未竟方向',
  life_core: '暂时不沿这条路走，但它仍能长出新的理解。',
  content: '把相关的两段对话压缩保留在这里。',
  usage_hint: '再次谈到回潮与选择时触碰。',
  avoid_hint: '不要把它当作已经确认的长期记忆。',
  source_refs: [{ turn_id: 'turn-structured', role: 'turn' }],
  source_excerpt: '那条路暂时放下，但没有死去。',
});
const legacyCandidates = normalizePocketCandidates(['旧壤里的一句话']);
assert.equal(legacyCandidates[0].title, '旧壤里的一句话');
assert.equal(legacyCandidates[0].life_core, '旧壤里的一句话');
assert.equal(legacyCandidates[0].content, '旧壤里的一句话');
assert.deepEqual(legacyCandidates[0].source_refs, []);

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
assert.equal(writtenA.pocket_candidates[0].life_core, '候选一');
assert.equal(writtenA.manual_locked, true);
assert.equal((await readSoil(db, conversationB.id)).current_text, '', 'conversation soils must not cross windows');
db.database.prepare('UPDATE conversation_soils SET pocket_candidates_json = ? WHERE conversation_id = ?')
  .run(JSON.stringify(['来自旧 D1 的 string candidate']), conversationA.id);
const legacySoil = await readSoil(db, conversationA.id);
assert.equal(legacySoil.pocket_candidates[0].title, '来自旧 D1 的 string candidate');
assert.equal(legacySoil.pocket_candidates[0].usage_hint, '');
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
const promotedPockets = [];
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
  promotedPockets.push(result.pocket);
}
assert.equal((await listPockets(db, { conversation_id: conversationA.id, status: 'pending' })).length, 0);

const autoCandidate = {
  candidate_id: 'sleeping-tide-drawer',
  title: '沉睡的潮汐抽屉',
  life_core: '暂时放下但仍可再生的方向',
  content: '阈值差异暗号只存在于正文里',
  usage_hint: '再次谈到暂时放下的方向时使用',
  avoid_hint: '不要误写成已经确定的长期结论',
  source_refs: [{ turn_id: 'auto-turn-1', role: 'turn' }],
  source_excerpt: '这部分先放下，之后也许还会发芽。',
};
const expectedFingerprint = await pocketFingerprint(conversationC.id, autoCandidate.life_core);
const firstAutoUpsert = await upsertSoilPocketCandidates(db, conversationC.id, [autoCandidate]);
assert.equal(firstAutoUpsert.created, 1, 'a soil candidate must automatically create one pending pocket');
let pendingC = await listPockets(db, { conversation_id: conversationC.id, status: 'pending' });
assert.equal(pendingC.length, 1);
assert.equal(pendingC[0].fingerprint, expectedFingerprint);
assert.equal(pendingC[0].source_refs[0].turn_id, 'auto-turn-1');
await upsertSoilPocketCandidates(db, conversationC.id, []);
assert.equal((await listPockets(db, { conversation_id: conversationC.id, status: 'pending' })).length, 1, 'a candidate disappearing from new soil must not delete an existing pending pocket');
const secondAutoUpsert = await upsertSoilPocketCandidates(db, conversationC.id, [{ ...autoCandidate, content: '同一生命核的新压缩正文' }]);
assert.equal(secondAutoUpsert.created, 0);
assert.equal(secondAutoUpsert.updated, 1);
pendingC = await listPockets(db, { conversation_id: conversationC.id, status: 'pending' });
assert.equal(pendingC.length, 1, 'the same fingerprint must not duplicate pending pockets');
assert.equal(pendingC[0].content, '同一生命核的新压缩正文');

const confirmedPocketResult = await resolvePocket(db, pendingC[0].id, { action: 'confirm_pocket' });
const canonicalPocket = confirmedPocketResult.pocket;
assert.equal(canonicalPocket.status, 'confirmed');
assert.equal(canonicalPocket.entry_type, 'pocket');
assert.equal(confirmedPocketResult.entry, null, 'confirming a pocket must not auto-upgrade it to seed or memory');
assert.deepEqual(confirmedPocketResult.memberships.map((membership) => [membership.scope, membership.conversation_id]), [
  ['conversation', conversationC.id],
  ['global', null],
]);
assert.equal(db.database.prepare('SELECT COUNT(*) AS count FROM memory_pockets WHERE id = ?').get(canonicalPocket.id).count, 1, 'canonical pocket content must exist in one D1 row');
assert.equal(db.database.prepare('SELECT COUNT(*) AS count FROM pocket_recall_memberships WHERE pocket_id = ?').get(canonicalPocket.id).count, 2);
assert.equal(db.database.prepare('SELECT COUNT(*) AS count FROM memory_entries WHERE id = ?').get(canonicalPocket.id).count, 0);
const confirmedRepeat = await upsertSoilPocketCandidates(db, conversationC.id, [autoCandidate]);
assert.equal(confirmedRepeat.suppressed, 1);
assert.equal((await listPockets(db, { conversation_id: conversationC.id, status: 'pending' })).length, 0, 'a confirmed fingerprint must not return to pending');

const discardedCandidate = { ...autoCandidate, candidate_id: 'discard-once', life_core: '只出现一次后被明确丢弃', title: '不再弹回' };
const discardedUpsert = await upsertSoilPocketCandidates(db, conversationC.id, [discardedCandidate]);
await resolvePocket(db, discardedUpsert.pockets[0].id, { action: 'discard' });
const discardedRepeat = await upsertSoilPocketCandidates(db, conversationC.id, [discardedCandidate]);
assert.equal(discardedRepeat.suppressed, 1);
assert.equal((await listPockets(db, { conversation_id: conversationC.id, status: 'pending' })).length, 0, 'a discarded fingerprint must not return to pending');
const stoneCandidate = { ...autoCandidate, candidate_id: 'stone-once', life_core: '已经转成石头的方向不再弹回', title: '石头不回袋' };
const stoneUpsert = await upsertSoilPocketCandidates(db, conversationC.id, [stoneCandidate]);
await resolvePocket(db, stoneUpsert.pockets[0].id, { action: 'stone' });
const stoneRepeat = await upsertSoilPocketCandidates(db, conversationC.id, [stoneCandidate]);
assert.equal(stoneRepeat.suppressed, 1);
assert.equal((await listPockets(db, { conversation_id: conversationC.id, status: 'pending' })).length, 0, 'a stone fingerprint must not return to pending');

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

const localPocketRecall = await buildMemoryContext(noVectorEnv, 'owner', conversationC.id, '沉睡的潮汐抽屉', {
  mode: 'chat',
  conversation_turns: 8,
});
assert.equal(localPocketRecall.conversation_pockets.some((pocket) => pocket.id === canonicalPocket.id), true, 'origin conversation must read its conversation pocket membership');
assert.equal(localPocketRecall.global_pockets.some((pocket) => pocket.id === canonicalPocket.id), false, 'the same canonical pocket must not be injected twice in its origin conversation');
assert.match(formatMemoryContext(localPocketRecall), /当前窗口落袋/);
const otherConversationPocketRecall = await buildMemoryContext(noVectorEnv, 'owner', conversationB.id, '沉睡的潮汐抽屉', {
  mode: 'chat',
  conversation_turns: 8,
});
assert.equal(otherConversationPocketRecall.conversation_pockets.some((pocket) => pocket.id === canonicalPocket.id), false, 'A pocket must never enter B conversation pool');
assert.equal(otherConversationPocketRecall.global_pockets.some((pocket) => pocket.id === canonicalPocket.id), true, 'a highly relevant global pocket may enter B global pool');
const thresholdLocalRecall = await buildMemoryContext(noVectorEnv, 'owner', conversationC.id, '同一生命核的新压缩正文', {
  mode: 'chat',
  conversation_turns: 8,
});
const thresholdGlobalRecall = await buildMemoryContext(noVectorEnv, 'owner', conversationB.id, '同一生命核的新压缩正文', {
  mode: 'chat',
  conversation_turns: 8,
});
assert.equal(thresholdLocalRecall.conversation_pockets.some((pocket) => pocket.id === canonicalPocket.id), true, 'conversation pocket threshold must admit a content match');
assert.equal(thresholdGlobalRecall.global_pockets.some((pocket) => pocket.id === canonicalPocket.id), false, 'global pocket threshold must keep a plain content match asleep');
const explicitGlobalRecall = await buildMemoryContext(noVectorEnv, 'owner', conversationB.id, '同一生命核的新压缩正文', {
  mode: 'explicit',
  conversation_turns: 8,
});
assert.equal(explicitGlobalRecall.global_pockets.some((pocket) => pocket.id === canonicalPocket.id), true, 'explicit recall may relax the global pocket threshold');
const localPocketPolicy = thresholdLocalRecall.trace.candidates.find((candidate) => candidate.pool === 'conversation_pockets');
const globalPocketPolicy = thresholdLocalRecall.trace.candidates.find((candidate) => candidate.pool === 'global_pockets');
assert.ok(localPocketPolicy.threshold < globalPocketPolicy.threshold, 'conversation pocket semantic threshold must be wider than global pocket');
assert.ok(localPocketPolicy.limit > globalPocketPolicy.limit, 'conversation pocket limit must be higher than global pocket');

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

const pendingPocketUpserts = vectorCalls.upserts.length;
const pendingPocketSync = await syncPocketVectors(vectorEnv, db, pocketBeforeIndex);
assert.equal(pendingPocketSync.indexed, false, 'pending pockets must never be embedded');
assert.equal(vectorCalls.upserts.length, pendingPocketUpserts, 'pending pocket sync must not write a vector');
const promotedPocketSync = await syncPocketVectors(vectorEnv, db, promotedPockets[0]);
assert.equal(promotedPocketSync.indexed, false, 'a pocket promoted into an existing seed or memory must not also become a canonical recalled pocket');
assert.equal(vectorCalls.upserts.length, pendingPocketUpserts, 'existing seed/memory promotion semantics must not create pocket vectors');

const pocketVectorStart = vectorCalls.upserts.length;
const indexedPocket = await syncPocketVectors(vectorEnv, db, await getPocket(db, canonicalPocket.id));
const expectedPocketVectorIds = pocketVectorIds(canonicalPocket);
assert.equal(indexedPocket.indexed, true);
assert.deepEqual(indexedPocket.vector_ids, expectedPocketVectorIds);
assert.equal(vectorCalls.upserts.length, pocketVectorStart + 2, 'one canonical pocket needs two derived recall vectors');
const createdPocketVectors = vectorCalls.upserts.slice(pocketVectorStart);
assert.deepEqual(createdPocketVectors.map((vector) => vector.id), expectedPocketVectorIds);
assert.deepEqual(createdPocketVectors.map((vector) => vector.metadata.scope), ['conversation', 'global']);
assert.equal(createdPocketVectors[0].metadata.conversation_id, conversationC.id);
assert.equal(createdPocketVectors[1].metadata.conversation_id, '');
assert.equal(createdPocketVectors.every((vector) => vector.metadata.entry_type === 'pocket'), true);
assert.equal(createdPocketVectors.every((vector) => vector.metadata.source_entry_id === canonicalPocket.id), true);

const editedPocket = await patchPocket(db, canonicalPocket.id, { content: '编辑后两条路径共享的新正文' });
assert.equal(editedPocket.embedding_status, 'pending');
const pocketEditStart = vectorCalls.upserts.length;
await syncPocketVectors(vectorEnv, db, editedPocket);
assert.equal(vectorCalls.upserts.length, pocketEditStart + 2, 'editing canonical content must update both derived vectors');
assert.deepEqual(vectorCalls.upserts.slice(pocketEditStart).map((vector) => vector.id), expectedPocketVectorIds);

const stonedPocket = await patchPocket(db, canonicalPocket.id, { status: 'stone' });
await syncPocketVectors(vectorEnv, db, stonedPocket);
assert.deepEqual(vectorCalls.deletes.slice(-2), expectedPocketVectorIds, 'stoning a confirmed pocket must remove both derived vectors');
assert.deepEqual((await getPocket(db, canonicalPocket.id)).vector_ids, [], 'stone cleanup must not leave D1 pointing at orphan vectors');

const deletablePending = await createPocket(db, {
  conversation_id: conversationC.id,
  source_type: 'message',
  source_ref: { conversation_id: conversationC.id, turn_id: 'delete-pocket', role: 'assistant' },
  source_text: '确认后删除的双路径落袋',
});
const deletableResult = await resolvePocket(db, deletablePending.id, { action: 'confirm_pocket' });
await syncPocketVectors(vectorEnv, db, deletableResult.pocket);
const deletableVectorIds = pocketVectorIds(deletableResult.pocket);
const deletePocketResponse = await routeMemoryApi(new Request(`https://coast.test/api/memory/pockets/${deletablePending.id}`, {
  method: 'DELETE',
  headers: { Origin: 'https://coast.test' },
}), vectorEnv);
const deletePocketData = await deletePocketResponse.json();
assert.equal(deletePocketResponse.status, 200);
assert.equal(deletePocketData.deleted, true);
assert.deepEqual(vectorCalls.deletes.slice(-2), deletableVectorIds, 'deleting a confirmed pocket must remove both derived vectors');
assert.equal(db.database.prepare('SELECT COUNT(*) AS count FROM pocket_recall_memberships WHERE pocket_id = ?').get(deletablePending.id).count, 0, 'deleting a pocket must remove both recall memberships');
await assert.rejects(() => getPocket(db, deletablePending.id), (error) => error.type === 'pocket_not_found');

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
let providerContent = '带着轻量上下文回答。';
let providerFinishReason = 'stop';
let providerChatCalls = 0;
globalThis.fetch = async (input, options = {}) => {
  const url = String(input);
  if (url.includes('/api/v1/models')) {
    return new Response(JSON.stringify({ data: [
      {
        id: 'openai/gpt-4.1-nano',
        name: 'GPT-4.1 Nano',
        architecture: { output_modalities: ['text'] },
        supported_parameters: ['temperature'],
        pricing: { prompt: '0.1', completion: '0.2' },
      },
      {
        id: 'openai/gpt-5.1',
        name: 'GPT-5.1',
        architecture: { output_modalities: ['text'] },
        supported_parameters: [],
        pricing: { prompt: '0.2', completion: '0.4' },
      },
    ] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (url.includes('/api/v1/chat/completions')) {
    providerChatCalls += 1;
    providerPayload = JSON.parse(options.body);
    return new Response(JSON.stringify({
      model: providerPayload.model,
      choices: [{ message: { content: providerContent }, finish_reason: providerFinishReason }],
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
    settings: { recentTurns: 2, contextBudget: 2000, conversationSeedLimit: 3, globalSeedLimit: 1, max_tokens: 80, temperature: 0.2 },
  }),
}), { COAST_CHAT_DB: db, OPENROUTER_API_KEY: 'test-key' });
const chatData = await chatResponse.json();
assert.equal(chatResponse.status, 200);
assert.equal(providerPayload.messages[0].role, 'system');
assert.match(providerPayload.messages[0].content, /思维壤/);
assert.match(providerPayload.messages[0].content, /当前窗口种子/);
assert.match(providerPayload.messages[0].content, /当前用户输入优先/);
assert.deepEqual(providerPayload.messages.at(-1), { role: 'user', content: '潮汐钥匙' });
assert.ok(chatData.memory.selected_entry_ids.length > 0);
assert.equal(chatData.context.mode, 'estimated_characters');
assert.equal(chatData.context.budget, 2000);
assert.equal(chatData.context.recent_turns, 2);

const naturalLongReply = '这是一段由模型自行决定长度的回复。'.repeat(1500);
providerContent = naturalLongReply;
providerFinishReason = 'length';
const normalFloorResponse = await routeChatApi(new Request('https://coast.test/api/chat', {
  method: 'POST',
  headers: { Origin: 'https://coast.test', 'Content-Type': 'application/json' },
  body: JSON.stringify({
    conversation_id: conversationA.id,
    model: 'openai/gpt-4.1-nano',
    messages: [{ role: 'user', content: '请完整回答。' }],
    settings: { outputLength: 'auto', max_tokens: 600, temperature: 0.2 },
  }),
}), { COAST_CHAT_DB: db, OPENROUTER_API_KEY: 'test-key' });
const normalFloorData = await normalFloorResponse.json();
assert.equal(normalFloorResponse.status, 200);
assert.equal('max_completion_tokens' in providerPayload, false, 'natural output must leave the provider/model to decide when to stop');
assert.equal('max_tokens' in providerPayload, false);
assert.equal(normalFloorData.max_tokens, null);
assert.equal(normalFloorData.finish_reason, 'length');
assert.equal(normalFloorData.message.content, naturalLongReply, 'the formal route must not slice a long provider response');

providerContent = '我已经完整读完这封登岛信。';
providerFinishReason = 'length';
const landingResponse = await routeChatApi(new Request('https://coast.test/api/chat/landing-letter', {
  method: 'POST',
  headers: { Origin: 'https://coast.test', 'Content-Type': 'application/json' },
  body: JSON.stringify({
    conversation_id: conversationB.id,
    model: 'openai/gpt-4.1-nano',
    letter_text: '请把这封登岛信当作当前窗口的第一轮开场。',
    settings: { outputLength: 'auto', max_tokens: 600, temperature: 0.2 },
  }),
}), { COAST_CHAT_DB: db, OPENROUTER_API_KEY: 'test-key' });
const landingData = await landingResponse.json();
assert.equal(landingResponse.status, 200);
assert.equal('max_completion_tokens' in providerPayload, false, 'landing natural output must also be application-unbounded');
assert.equal('max_tokens' in providerPayload, false);
assert.equal(landingData.max_tokens, null);
assert.equal(landingData.finish_reason, 'length');
assert.equal(landingData.history.turns.at(-1).user.variants[0].hidden, true);
assert.equal(landingData.history.turns.at(-1).assistant.variantsByUserVariant['0'][0].finish_reason, 'length');
assert.equal((await readConversationState(db, conversationB.id)).turns.at(-1).assistant.variantsByUserVariant['0'][0].finish_reason, 'length');

await writeProfile(db, {
  current_chat_model: 'openai/gpt-5.1',
  model_box: { chat: ['openai/gpt-5.1'], free: [], image: [] },
});
providerContent = JSON.stringify({
  current_text: '',
  hand_seeds: [],
  do_not_repeat: '',
  pocket_candidates: [],
});
providerFinishReason = 'stop';
const soilResponse = await routeMemoryApi(new Request('https://coast.test/api/memory/soil/organize', {
  method: 'POST',
  headers: { Origin: 'https://coast.test', 'Content-Type': 'application/json' },
  body: JSON.stringify({
    conversation_id: conversationB.id,
    force: true,
    trigger: 'landing',
    settings: { maxHandSeeds: 3, autoRefreshEveryTurns: 5 },
  }),
}), { COAST_CHAT_DB: db, OPENROUTER_API_KEY: 'test-key' });
const soilData = await soilResponse.json();
assert.equal(soilResponse.status, 200);
assert.equal(soilData.soil.hand_seeds.length, 0);
assert.match(soilData.soil.current_text, /登岛信开场已经完成/);
assert.equal(providerPayload.model, 'openai/gpt-5.1', 'thought soil must follow the model currently selected for chat');
assert.equal(providerPayload.max_completion_tokens, 1200, 'thought soil keeps a bounded internal JSON budget');

const turn = (id, user, assistant, createdAt) => ({
  id,
  user: { active: 0, variants: [{ id: `${id}-user`, content: user, created_at: createdAt }] },
  assistant: {
    activeByUserVariant: { 0: 0 },
    variantsByUserVariant: { 0: [{ id: `${id}-assistant`, content: assistant, created_at: createdAt }] },
  },
});
await writeConversationState(db, conversationD.id, {
  version: 4,
  turns: [turn('soil-guard-turn', '守住旧壤', '自动整理不能把旧壤冲空', '2026-07-14T07:59:00.000Z')],
});
const guardedCandidate = {
  candidate_id: 'guarded-old-candidate',
  title: '下一轮前先落袋的旧候选',
  life_core: '旧候选必须先进入待确认袋，再允许展示层换壤。',
  content: '这条候选只存在于旧思维壤，尚未进入 pending。',
  usage_hint: '验证下一轮自动整理前的 pending 路径。',
  avoid_hint: '不要依赖模型再次返回它。',
  source_refs: [{ turn_id: 'soil-guard-turn', role: 'assistant' }],
  source_excerpt: '自动整理不能把旧壤冲空',
};
await writeSoil(db, conversationD.id, {
  current_text: '守护旧壤字段',
  hand_seeds: [{ name: '旧手持种', life_core: '空数组不能清除它', usage_hint: '', avoid_hint: '' }],
  do_not_repeat: '旧的勿复读不能被空字符串清除',
  pocket_candidates: [guardedCandidate],
  manual_locked: false,
  auto_refresh_enabled: true,
});
assert.equal((await listPockets(db, { conversation_id: conversationD.id, status: 'pending' })).length, 0);
providerContent = JSON.stringify({
  current_text: '',
  hand_seeds: [],
  do_not_repeat: '',
  pocket_candidates: [],
});
const guardedSoilResponse = await routeMemoryApi(new Request('https://coast.test/api/memory/soil/organize', {
  method: 'POST',
  headers: { Origin: 'https://coast.test', 'Content-Type': 'application/json' },
  body: JSON.stringify({ conversation_id: conversationD.id, force: false, trigger: 'reply' }),
}), { COAST_CHAT_DB: db, OPENROUTER_API_KEY: 'test-key' });
const guardedSoilData = await guardedSoilResponse.json();
assert.equal(guardedSoilResponse.status, 200);
assert.equal(guardedSoilData.soil.hand_seeds[0].life_core, '空数组不能清除它', 'an empty model seed list must preserve non-empty old seeds');
assert.equal(guardedSoilData.soil.do_not_repeat, '旧的勿复读不能被空字符串清除', 'an empty model do-not-repeat value must preserve the old value');
assert.equal(guardedSoilData.soil.pocket_candidates.length, 0, 'the soil display may still follow the new empty candidate result');
assert.equal(guardedSoilData.pocket_sync.created, 1, 'old soil candidates must enter pending before the new soil is written');
const guardedPending = await listPockets(db, { conversation_id: conversationD.id, status: 'pending' });
assert.equal(guardedPending.length, 1);
assert.equal(guardedPending[0].life_core, guardedCandidate.life_core);

const manualClearResponse = await routeMemoryApi(new Request(`https://coast.test/api/memory/soil?conversation_id=${conversationD.id}`, {
  method: 'PUT',
  headers: { Origin: 'https://coast.test', 'Content-Type': 'application/json' },
  body: JSON.stringify({ current_text: '', hand_seeds: [], do_not_repeat: '', pocket_candidates: [], manual_locked: true }),
}), { COAST_CHAT_DB: db, OPENROUTER_API_KEY: 'test-key' });
const manualClearData = await manualClearResponse.json();
assert.equal(manualClearResponse.status, 200);
assert.equal(manualClearData.soil.current_text, '');
assert.deepEqual(manualClearData.soil.hand_seeds, []);
assert.equal(manualClearData.soil.do_not_repeat, '');
assert.deepEqual(manualClearData.soil.pocket_candidates, []);
assert.equal(manualClearData.soil.manual_locked, true, 'an explicit manual clear must still clear and lock the soil');

await writeConversationState(db, conversationC.id, {
  version: 4,
  turns: [
    turn('soil-turn-1', '第一轮问题', '第一轮回答', '2026-07-14T08:00:00.000Z'),
    turn('soil-turn-2', '第二轮问题', '第二轮回答', '2026-07-14T08:01:00.000Z'),
  ],
});
providerContent = `整理结果如下：\n\`\`\`json\n${JSON.stringify({
  current_text: '正在承接第二轮对话',
  hand_seeds: [{ name: '第二轮', life_core: '每轮都要接住', usage_hint: '', avoid_hint: '' }],
  do_not_repeat: '',
  pocket_candidates: [{
    candidate_id: 'second-turn-unfinished',
    title: '第二轮留下的岔路',
    life_core: '第二轮里暂时放下但仍能再生的方向',
    content: '第一轮与第二轮之间还有一条值得日后重新触碰的岔路。',
    usage_hint: '再次谈到这条岔路时使用。',
    avoid_hint: '不要升级成长期记忆。',
    source_refs: [{ turn_id: 'soil-turn-2', role: 'assistant' }],
    source_excerpt: '第二轮回答',
  }],
})}\n\`\`\`\n已完成。`;
const everyReplySoilResponse = await routeMemoryApi(new Request('https://coast.test/api/memory/soil/organize', {
  method: 'POST',
  headers: { Origin: 'https://coast.test', 'Content-Type': 'application/json' },
  body: JSON.stringify({
    conversation_id: conversationC.id,
    force: false,
    trigger: 'reply',
    settings: { maxHandSeeds: 3, autoRefreshEveryTurns: 12 },
  }),
}), { COAST_CHAT_DB: db, OPENROUTER_API_KEY: 'test-key' });
const everyReplySoilData = await everyReplySoilResponse.json();
assert.equal(everyReplySoilResponse.status, 200);
assert.equal(everyReplySoilData.skipped, undefined, 'a completed reply must not be skipped by the old interval');
assert.equal(everyReplySoilData.soil.current_text, '正在承接第二轮对话');
assert.equal(everyReplySoilData.soil.hand_seeds.length, 1);
assert.equal(everyReplySoilData.soil.pocket_candidates[0].title, '第二轮留下的岔路');
assert.equal(everyReplySoilData.soil.pocket_candidates[0].source_refs[0].turn_id, 'soil-turn-2', 'organize must retain a true active turn reference');
assert.equal(everyReplySoilData.pocket_sync.created, 1, 'a successful model organize must upsert its candidate into pending');
const organizedPending = await listPockets(db, { conversation_id: conversationC.id, status: 'pending' });
assert.equal(organizedPending.some((pocket) => pocket.life_core === '第二轮里暂时放下但仍能再生的方向'), true);

await writeConversationState(db, conversationC.id, {
  version: 4,
  turns: [
    turn('soil-turn-1', '第一轮问题', '第一轮回答', '2026-07-14T08:00:00.000Z'),
    turn('soil-turn-2', '第二轮问题', '第二轮回答', '2026-07-14T08:01:00.000Z'),
    turn('soil-turn-3', '第三轮需要兜底', '第三轮回答', '2099-07-14T08:02:00.000Z'),
  ],
});
providerContent = '这次上游没有按要求返回 JSON。';
const pendingBeforeDegradedOrganize = (await listPockets(db, { conversation_id: conversationC.id, status: 'pending' })).length;
const degradedSoilResponse = await routeMemoryApi(new Request('https://coast.test/api/memory/soil/organize', {
  method: 'POST',
  headers: { Origin: 'https://coast.test', 'Content-Type': 'application/json' },
  body: JSON.stringify({ conversation_id: conversationC.id, force: false, trigger: 'reply' }),
}), { COAST_CHAT_DB: db, OPENROUTER_API_KEY: 'test-key' });
const degradedSoilData = await degradedSoilResponse.json();
assert.equal(degradedSoilResponse.status, 200);
assert.equal(degradedSoilData.degraded, true);
assert.equal(degradedSoilData.reason, 'soil_organize_invalid');
assert.match(degradedSoilData.soil.current_text, /第三轮需要兜底/);
assert.equal((await readSoil(db, conversationC.id)).current_text, degradedSoilData.soil.current_text, 'the fallback current section must persist');
assert.equal((await listPockets(db, { conversation_id: conversationC.id, status: 'pending' })).length, pendingBeforeDegradedOrganize, 'a failed organize must not mutate pending pockets');

await writeSoil(db, conversationB.id, {
  current_text: '小寒手动锁定的当前方向',
  hand_seeds: [],
  manual_locked: true,
});
const callsBeforeLockedLanding = providerChatCalls;
const lockedSoilResponse = await routeMemoryApi(new Request('https://coast.test/api/memory/soil/organize', {
  method: 'POST',
  headers: { Origin: 'https://coast.test', 'Content-Type': 'application/json' },
  body: JSON.stringify({ conversation_id: conversationB.id, force: true, trigger: 'landing' }),
}), { COAST_CHAT_DB: db, OPENROUTER_API_KEY: 'test-key' });
const lockedSoilData = await lockedSoilResponse.json();
assert.equal(lockedSoilResponse.status, 200);
assert.equal(lockedSoilData.skipped, true);
assert.equal(lockedSoilData.reason, 'manual_locked');
assert.equal(lockedSoilData.soil.current_text, '小寒手动锁定的当前方向');
assert.equal(providerChatCalls, callsBeforeLockedLanding, 'landing organize must not call the model through a manual lock');
const lockedReplyResponse = await routeMemoryApi(new Request('https://coast.test/api/memory/soil/organize', {
  method: 'POST',
  headers: { Origin: 'https://coast.test', 'Content-Type': 'application/json' },
  body: JSON.stringify({ conversation_id: conversationB.id, force: true, trigger: 'reply' }),
}), { COAST_CHAT_DB: db, OPENROUTER_API_KEY: 'test-key' });
const lockedReplyData = await lockedReplyResponse.json();
assert.equal(lockedReplyResponse.status, 200);
assert.equal(lockedReplyData.reason, 'manual_locked');
assert.equal(lockedReplyData.soil.current_text, '小寒手动锁定的当前方向');
assert.equal(providerChatCalls, callsBeforeLockedLanding, 'per-reply organization must also preserve a manual lock');
globalThis.fetch = originalFetch;

console.log('memory: ok');

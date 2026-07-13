import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createConversation } from '../functions/chat-store.js';
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

console.log('memory: ok');

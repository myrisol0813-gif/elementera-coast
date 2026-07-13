import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createConversation } from '../functions/chat-store.js';
import {
  createPocket,
  deletePocket,
  listPockets,
  patchPocket,
  readSoil,
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

console.log('memory: ok');

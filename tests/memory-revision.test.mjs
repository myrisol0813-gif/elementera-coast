import assert from 'node:assert/strict';
import { createConversation } from '../functions/chat-store.js';
import {
  createEntry,
  createPocket,
  getEntry,
  memoryRevisionMigrationIds,
  resolvePocket,
} from '../functions/memory-store.js';
import { D1Database } from './d1-helper.mjs';

const db = new D1Database();
const conversation = await createConversation(db, '记忆修订测试');

for (const action of ['supplement', 'replace', 'new_version', 'downgrade']) {
  const original = await createEntry(db, {
    entry_type: 'memory', scope: 'conversation', conversation_id: conversation.id,
    title: `原记忆 ${action}`, life_core: `旧理解 ${action}`, content: '保留的旧版正文。', status: 'active',
  });
  const pocket = await createPocket(db, {
    conversation_id: conversation.id,
    source_type: 'memory_revision',
    source_text: `新诠释 ${action}`,
    title: `新理解 ${action}`,
    life_core: `更准确的生命核 ${action}`,
    content: `新诠释 ${action}`,
    original_entry_id: original.id,
    suggested_action: action,
    source_ref: { source_window: conversation.id, source_turn_id: `turn-${action}`, date: '2026-08-09T22:08:00.000Z' },
  });
  assert.equal(pocket.revision.original_entry_id, original.id);
  assert.equal(pocket.revision.original_copy.life_core, original.life_core);
  assert.equal(pocket.revision.new_interpretation, `新诠释 ${action}`);
  assert.equal(pocket.revision.suggested_action, action);
  const resolved = await resolvePocket(db, pocket.id, { action: `revision_${action}` });
  const oldAfter = await getEntry(db, original.id);
  if (action === 'downgrade') {
    assert.equal(oldAfter.status, 'dormant');
    assert.equal(resolved.entry.id, original.id);
  } else {
    assert.equal(oldAfter.status, 'archived');
    assert.notEqual(resolved.entry.id, original.id);
    assert.equal(resolved.entry.status, 'active');
    assert.equal(resolved.entry.supersedes_entry_id, original.id);
    assert.equal(resolved.entry.revision_action, action);
  }
  await assert.rejects(
    () => resolvePocket(db, pocket.id, { action: `revision_${action}` }),
    (error) => error.type === 'pocket_already_resolved',
  );
}

const longOriginal = await createEntry(db, {
  entry_type: 'memory', scope: 'conversation', conversation_id: conversation.id,
  title: '长旧记忆', life_core: '旧生命核'.repeat(500), content: '旧正文'.repeat(1800), status: 'active',
});
const longRevision = await createPocket(db, {
  conversation_id: conversation.id,
  source_type: 'memory_revision',
  source_text: '对很长旧记忆的新理解。',
  title: '长记忆新理解',
  life_core: '新生命核',
  content: '新诠释',
  original_entry_id: longOriginal.id,
  suggested_action: 'new_version',
});
assert.ok(longRevision.revision.original_copy.content.length <= 1800, '原记忆复制件应有界，不应让长记忆卡死待确认袋');

const entryColumns = db.database.prepare('PRAGMA table_info(memory_entries)').all().map((row) => row.name);
for (const retiredColumn of ['facet_policy_json', 'source_confidence', 'contradiction_note']) {
  assert.equal(entryColumns.includes(retiredColumn), false);
}
assert.equal(
  db.database.prepare('SELECT id FROM schema_migrations WHERE id = ?').get(memoryRevisionMigrationIds[0]).id,
  memoryRevisionMigrationIds[0],
);

console.log('memory-revision: ok');

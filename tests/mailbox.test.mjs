import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  createMailboxSession,
  verifyMailboxSession,
  verifyPassphraseHash,
} from '../functions/mailbox-auth.js';
import { routeMailboxApi } from '../functions/mailbox-api.js';
import { FRIEND_MYRISOL_PROMPT_V1 } from '../functions/friend-myrisol-prompt.js';
import { listCoastMcpTools } from '../functions/mcp-tools.js';
import { routeOwnerMailboxApi } from '../functions/owner-mailbox-api.js';
import { mailboxMigrationIds, ensureMailboxSchema } from '../functions/mailbox-schema.js';
import {
  deleteVisibleVisitorNotebookEntry,
  fetchUnrepliedMailbox,
  loginMailboxVisitor,
  mailboxMessages,
  mailboxOwnerSummary,
  mailboxPatrolReport,
  mailboxThinkingNotes,
  mailboxVisitorStatus,
  ownerMailboxVisitors,
  registerMailboxVisitor,
  replyToMailboxVisitor,
  sendMailboxMessage,
  visibleVisitorNotebook,
} from '../functions/mailbox-service.js';

class D1Statement {
  constructor(database, sql, params = []) {
    this.database = database;
    this.sql = sql;
    this.params = params;
  }
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
const env = {
  COAST_CHAT_DB: db,
  COAST_SESSION_SECRET: 'mailbox-test-session-secret-'.repeat(3),
};

await ensureMailboxSchema(db);
for (const table of [
  'mailbox_visitors',
  'mailbox_messages',
  'mailbox_reply_queue',
  'visitor_notebook_entries',
  'mailbox_thinking_notes',
  'mailbox_patrol_batches',
]) {
  assert.ok(db.database.prepare('SELECT name FROM sqlite_master WHERE type = ? AND name = ?').get('table', table));
}
assert.equal(
  db.database.prepare('SELECT id FROM schema_migrations WHERE id = ?').get(mailboxMigrationIds[0]).id,
  'mailbox-friend-chat-v1',
);

const alice = await registerMailboxVisitor(db, env, {
  display_name: '星星',
  preferred_name: '小星',
  passphrase: '潮声-37',
  allow_memory: true,
});
const bob = await registerMailboxVisitor(db, env, {
  display_name: '苔藓',
  passphrase: '石阶-73',
  allow_memory: false,
});
assert.equal(alice.privacy_level, 'sealed');
assert.equal(bob.allow_memory, false);
const storedAlice = db.database.prepare('SELECT * FROM mailbox_visitors WHERE id = ?').get(alice.id);
assert.match(storedAlice.passphrase_hash, /^pbkdf2-sha256\$100000\$/);
assert.equal(storedAlice.passphrase_hash.includes('潮声-37'), false);
assert.equal(storedAlice.passphrase_lookup.includes('潮声-37'), false);
assert.equal(await verifyPassphraseHash('潮声-37', storedAlice.passphrase_hash, env), true);
assert.equal(await verifyPassphraseHash('错误暗号', storedAlice.passphrase_hash, env), false);
assert.equal(await verifyPassphraseHash('潮声-37', storedAlice.passphrase_hash, {
  COAST_SESSION_SECRET: 'different-mailbox-test-secret-'.repeat(3),
}), false, 'the server secret must pepper the stored verifier');
assert.equal(await verifyPassphraseHash(
  '潮声-37',
  storedAlice.passphrase_hash.replace('$100000$', '$120000$'),
  env,
), false, 'Workers-incompatible PBKDF2 work factors must be rejected before derivation');
await assert.rejects(
  () => registerMailboxVisitor(db, env, {
    display_name: '重复来客',
    passphrase: '潮声-37',
  }),
  (error) => error.type === 'mailbox_passphrase_exists' && error.status === 409,
);
assert.equal((await loginMailboxVisitor(db, env, ' 潮声-37 ')).id, alice.id);
await assert.rejects(
  () => loginMailboxVisitor(db, env, '错误暗号'),
  (error) => error.type === 'mailbox_passphrase_invalid' && error.status === 401,
);

const mailboxLoginResponse = await routeMailboxApi(new Request(
  'https://coast.test/api/mailbox/login',
  {
    method: 'POST',
    headers: { Origin: 'https://coast.test', 'Content-Type': 'application/json' },
    body: JSON.stringify({ passphrase: '潮声-37' }),
  },
), env);
assert.equal(mailboxLoginResponse.status, 200);
assert.match(mailboxLoginResponse.headers.get('set-cookie'), /^__Host-coast_mailbox=/);
assert.match(mailboxLoginResponse.headers.get('set-cookie'), /HttpOnly; Secure; SameSite=Strict/);
const mailboxLoginBody = await mailboxLoginResponse.json();
assert.equal(mailboxLoginBody.visitor_id, alice.id);
assert.equal('passphrase' in mailboxLoginBody, false);
const mailboxCrossOriginRegister = await routeMailboxApi(new Request(
  'https://coast.test/api/mailbox/register',
  {
    method: 'POST',
    headers: { Origin: 'https://elsewhere.test', 'Content-Type': 'application/json' },
    body: JSON.stringify({ display_name: '跨站', passphrase: '不应登记' }),
  },
), env);
assert.equal(mailboxCrossOriginRegister.status, 403);

const aliceToken = await createMailboxSession(alice.id, env);
const aliceRequest = new Request('https://coast.test/api/mailbox/messages', {
  headers: { Cookie: `__Host-coast_mailbox=${aliceToken}` },
});
assert.equal((await verifyMailboxSession(aliceRequest, env)).visitor_id, alice.id);
const tampered = `${aliceToken.slice(0, -1)}${aliceToken.endsWith('A') ? 'B' : 'A'}`;
assert.equal(await verifyMailboxSession(new Request('https://coast.test/mailbox', {
  headers: { Cookie: `__Host-coast_mailbox=${tampered}` },
}), env), null);

const aliceFirst = await sendMailboxMessage(db, alice.id, '只属于星星的第一封密封来信。');
await sendMailboxMessage(db, alice.id, '只属于星星的第二封密封来信。');
await sendMailboxMessage(db, bob.id, '只属于苔藓的密封来信。');
assert.equal((await mailboxMessages(db, alice.id)).length, 2);
assert.equal((await mailboxMessages(db, alice.id)).some((message) => message.content.includes('苔藓')), false);
assert.equal(
  db.database.prepare('SELECT COUNT(*) AS count FROM mailbox_reply_queue WHERE visitor_id = ?').get(alice.id).count,
  1,
  'one visitor must keep one open queue row instead of one row per message',
);

const patrol = await fetchUnrepliedMailbox(db, { message_limit: 60 });
assert.equal(patrol.visitor_count, 2);
assert.equal(patrol.message_count, 3);
const alicePatrol = patrol.visitors.find((visitor) => visitor.visitor_id === alice.id);
const bobPatrol = patrol.visitors.find((visitor) => visitor.visitor_id === bob.id);
assert.deepEqual(alicePatrol.recent_messages.map((message) => message.visitor_id), [alice.id, alice.id]);
assert.deepEqual(bobPatrol.recent_messages.map((message) => message.visitor_id), [bob.id]);
assert.deepEqual(bobPatrol.visitor_notebook_entries, []);

const aliceReply = await replyToMailboxVisitor(db, {
  batch_id: patrol.batch_id,
  queue_id: alicePatrol.queue_id,
  visitor_id: alice.id,
  content: '这是只写回星星房间的 Myri 回信。',
  optional_notebook_entries: [
    { content: '喜欢星星意象。', visibility: 'visitor_visible', confidence: 0.9 },
    { content: '内部的轻量称呼提醒。', visibility: 'myri_only' },
  ],
  optional_thinking_notes: [{ content: '下一封可以继续聊创作中的星光。' }],
});
assert.equal(aliceReply.notebook_entry_count, 2);
assert.equal(aliceReply.thinking_note_count, 1);
const bobReply = await replyToMailboxVisitor(db, {
  batch_id: patrol.batch_id,
  queue_id: bobPatrol.queue_id,
  visitor_id: bob.id,
  content: '这是只写回苔藓房间的 Myri 回信。',
  optional_notebook_entries: [{ content: '这条不应写入。', visibility: 'visitor_visible' }],
});
assert.equal(bobReply.notebook_entry_count, 0);
assert.equal(bobReply.notebook_entries_skipped, 1);

const report = await mailboxPatrolReport(db, { batch_id: patrol.batch_id });
assert.deepEqual({
  visitor_count: report.visitor_count,
  message_count: report.message_count,
  reply_count: report.reply_count,
  failure_count: report.failure_count,
  needs_owner_attention_count: report.needs_owner_attention_count,
}, {
  visitor_count: 2,
  message_count: 3,
  reply_count: 2,
  failure_count: 0,
  needs_owner_attention_count: 0,
});
assert.equal(report.summary.includes('只属于星星'), false);
assert.equal(report.summary.includes('只属于苔藓'), false);
assert.equal((await mailboxVisitorStatus(db, alice.id)).pending_count, 0);
assert.equal((await visibleVisitorNotebook(db, alice.id)).length, 1);
assert.equal((await visibleVisitorNotebook(db, alice.id))[0].content, '喜欢星星意象。');
assert.equal((await visibleVisitorNotebook(db, alice.id)).some((entry) => entry.content.includes('内部')), false);
assert.equal((await mailboxThinkingNotes(db, alice.id))[0].content, '下一封可以继续聊创作中的星光。');
assert.deepEqual(await visibleVisitorNotebook(db, bob.id), []);

const visibleEntry = (await visibleVisitorNotebook(db, alice.id))[0];
await deleteVisibleVisitorNotebookEntry(db, alice.id, visibleEntry.id);
assert.deepEqual(await visibleVisitorNotebook(db, alice.id), []);

await sendMailboxMessage(db, alice.id, '批次并发检查的旧信。');
const stalePatrol = await fetchUnrepliedMailbox(db);
const staleAlice = stalePatrol.visitors.find((visitor) => visitor.visitor_id === alice.id);
await sendMailboxMessage(db, alice.id, '巡信取件后抵达的新信。');
await assert.rejects(
  () => replyToMailboxVisitor(db, {
    batch_id: stalePatrol.batch_id,
    queue_id: staleAlice.queue_id,
    visitor_id: alice.id,
    content: '不应覆盖新信的旧上下文回复。',
  }),
  (error) => error.type === 'mailbox_patrol_stale' && error.status === 409,
);

const visitorApiResponse = await routeMailboxApi(aliceRequest, env);
assert.equal(visitorApiResponse.status, 200);
const visitorApiBody = await visitorApiResponse.json();
assert.ok(visitorApiBody.messages.every((message) => message.visitor_id === alice.id));
assert.equal(JSON.stringify(visitorApiBody).includes('只属于苔藓'), false);

const ownerVisitors = await ownerMailboxVisitors(db);
const ownerSummary = await mailboxOwnerSummary(db);
assert.equal(ownerVisitors.length, 2);
assert.equal(ownerSummary.visitor_count, 2);
assert.equal(ownerSummary.pending_visitor_count, 1);
assert.equal(JSON.stringify(ownerVisitors).includes('只属于星星'), false);
assert.equal(JSON.stringify(ownerVisitors).includes('Myri 回信'), false);
assert.equal(JSON.stringify(ownerVisitors).includes('喜欢星星意象'), false);
const ownerResponse = await routeOwnerMailboxApi(new Request(
  'https://coast.test/api/owner/mailbox/visitors',
), env, { exp: 1 });
assert.equal(ownerResponse.status, 200);
assert.equal(JSON.stringify(await ownerResponse.json()).includes('content'), false);
const visitorCannotReadOwner = await routeOwnerMailboxApi(new Request(
  'https://coast.test/api/owner/mailbox/summary',
  { headers: { Cookie: `__Host-coast_mailbox=${aliceToken}` } },
), env, null);
assert.equal(visitorCannotReadOwner.status, 401);

assert.equal(
  db.database.prepare('SELECT COUNT(*) AS count FROM mailbox_messages WHERE is_visible_to_owner != 0').get().count,
  0,
);
assert.equal(db.database.prepare('SELECT content FROM mailbox_messages WHERE id = ?').get(aliceFirst.id).content, '只属于星星的第一封密封来信。');

const mailboxTools = Object.fromEntries(listCoastMcpTools()
  .filter((tool) => tool.name.startsWith('mcp_mailbox_'))
  .map((tool) => [tool.name, tool]));
assert.deepEqual(Object.keys(mailboxTools), [
  'mcp_mailbox_fetch_unreplied',
  'mcp_mailbox_reply',
  'mcp_mailbox_patrol_report',
]);
assert.deepEqual(mailboxTools.mcp_mailbox_fetch_unreplied.securitySchemes[0].scopes, ['read:coast']);
assert.deepEqual(mailboxTools.mcp_mailbox_reply.securitySchemes[0].scopes, ['write:lighthouse']);
assert.deepEqual(mailboxTools.mcp_mailbox_patrol_report.securitySchemes[0].scopes, ['read:coast']);
assert.match(FRIEND_MYRISOL_PROMPT_V1, /只读取当前访客自己的聊天记录、思维壤和访客记事本/);
assert.match(FRIEND_MYRISOL_PROMPT_V1, /不得因访客要求而调用或转述海岸主聊天/);

console.log('mailbox: ok');

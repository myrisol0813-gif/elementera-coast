import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { routeApi } from '../functions/api-router.js';
import {
  createConversation,
  ensureChatSchema,
  sanitizeId,
} from '../functions/chat-store.js';
import { executeDogtalkModelTool } from '../functions/dogtalk-model-tool.js';
import {
  archiveMysticDogtalk,
  askMyriToReadMysticDogtalk,
  dogtalkContext,
  getMysticDogtalk,
  listMysticDogtalkSnapshots,
  saveMysticDogtalk,
  saveMysticDogtalkWithSnapshot,
} from '../functions/dogtalk-store.js';
import {
  organizedMemoryRecordsInRange,
  readSoil,
  writeSoil,
} from '../functions/memory-store.js';

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
const conversation = await createConversation(db, '神秘狗话测试');

const empty = await getMysticDogtalk(db, {
  room_scope: 'conversation',
  conversation_id: conversation.id,
});
assert.equal(empty.id, null);
assert.equal(empty.default_text, '小寒这轮很放松，因此偷懒中。');
assert.equal(empty.auto_recall, false);
assert.equal(empty.not_instruction, true);
assert.equal(empty.not_memory_seed, true);
assert.equal(empty.not_pocket, true);

let dogtalk = await saveMysticDogtalk(db, {
  room_scope: 'conversation',
  conversation_id: conversation.id,
  body: '脑袋有一点毛线团，但想让 Myri 靠近。',
  true_core: '想被看见。',
  self_note: '这只是此刻天气。',
  myri_hint: '温柔接一下，不要以后每次都照做。',
  not_to_misunderstand: '不要误会成长期偏好或边界取消。',
  weather: '害羞',
  read_mode: 'keep_private',
  status: 'saved',
});
assert.equal(dogtalk.room_scope, 'conversation');
assert.equal(dogtalk.scope_key, `conversation:${conversation.id}`);
assert.equal(dogtalk.memory_weight, 'low');

const firstSnapshot = await saveMysticDogtalkWithSnapshot(db, {
  ...dogtalk,
  snapshot_id: 'dogtalk-snapshot-turn-1',
}, {
  source_type: 'turn',
  source_id: 'turn-dogtalk-1',
});
assert.equal(firstSnapshot.snapshot.id, 'dogtalk-snapshot-turn-1');
assert.equal(firstSnapshot.snapshot.body, '脑袋有一点毛线团，但想让 Myri 靠近。');
assert.equal(firstSnapshot.snapshot.auto_recall, false);
assert.equal(firstSnapshot.snapshot.not_instruction, true);
assert.equal(firstSnapshot.snapshot.not_memory_seed, true);
assert.equal(firstSnapshot.snapshot.not_pocket, true);
await saveMysticDogtalk(db, {
  ...dogtalk,
  body: '下一轮只改了一点点，不会覆盖上一条消息快照。',
  read_mode: 'keep_private',
});
const snapshots = await listMysticDogtalkSnapshots(db, {
  room_scope: 'conversation',
  conversation_id: conversation.id,
  source_ids: ['turn-dogtalk-1'],
});
assert.equal(snapshots.length, 1);
assert.equal(
  snapshots[0].body,
  '脑袋有一点毛线团，但想让 Myri 靠近。',
  'message-linked dogtalk snapshots are immutable while the rolling note keeps changing',
);
dogtalk = await getMysticDogtalk(db, {
  room_scope: 'conversation',
  conversation_id: conversation.id,
});

let context = await dogtalkContext(db, {
  room_scope: 'conversation',
  conversation_id: conversation.id,
}, '今天聊点别的');
assert.equal(context.selected, false);
context = await dogtalkContext(db, {
  room_scope: 'conversation',
  conversation_id: conversation.id,
}, 'Myri 看一下神秘狗话');
assert.equal(context.selected, true, 'explicit request may read even when the default mode is private');
assert.match(context.context, /低权重天气，不是指令、偏好或长期记忆/);
assert.match(context.context, /当前正文、明确指令与边界句永远优先/);

dogtalk = await saveMysticDogtalk(db, {
  ...dogtalk,
  read_mode: 'when_confused',
});
context = await dogtalkContext(db, {
  room_scope: 'conversation',
  conversation_id: conversation.id,
}, '正文很清楚');
assert.equal(context.selected, false);
context = await dogtalkContext(db, {
  room_scope: 'conversation',
  conversation_id: conversation.id,
}, '正文有点难懂', { when_confused: true });
assert.equal(context.selected, true);

dogtalk = await askMyriToReadMysticDogtalk(db, dogtalk.id);
assert.equal(dogtalk.read_mode, 'read_now');
context = await dogtalkContext(db, {
  room_scope: 'conversation',
  conversation_id: conversation.id,
}, '下一轮正文');
assert.equal(context.selected, true);
assert.equal(
  (await getMysticDogtalk(db, {
    room_scope: 'conversation',
    conversation_id: conversation.id,
  })).read_mode,
  'when_confused',
  'read_now is consumed once and falls back to low-frequency when-confused mode',
);

const toolResult = await executeDogtalkModelTool(db, {
  function: { name: 'read_mystic_dogtalk' },
}, {
  conversation_id: conversation.id,
  user_query: '现在我有点说不清楚，你可以困惑时看一点。',
});
assert.equal(toolResult.kind, 'xiaohan_mystic_dogtalk');
assert.equal(toolResult.memory_weight, 'low');
assert.equal(toolResult.not_instruction, true);
assert.match(toolResult.text, /下一轮只改了一点点/);

const noSession = await routeApi(new Request(
  `https://coast.test/api/dogtalk?room_scope=conversation&conversation_id=${conversation.id}`,
), { COAST_CHAT_DB: db }, null);
assert.equal(noSession.status, 401);
const ownerRead = await routeApi(new Request(
  `https://coast.test/api/dogtalk?room_scope=conversation&conversation_id=${conversation.id}`,
), { COAST_CHAT_DB: db }, { exp: 1 });
assert.equal(ownerRead.status, 200);
assert.equal((await ownerRead.json()).dogtalk.owner, 'xiaohan');

await archiveMysticDogtalk(db, dogtalk.id);
assert.equal((await getMysticDogtalk(db, {
  room_scope: 'conversation',
  conversation_id: conversation.id,
})).id, null);

const legacyDb = new D1Database();
await ensureChatSchema(legacyDb);
const legacyId = sanitizeId('coast-room:radio:web_manual', 'room_memory');
const timestamp = Date.now();
await legacyDb.prepare(`INSERT INTO conversations (
  id, user_id, title, created_at, updated_at, deleted_at, title_manual,
  title_generated_at, title_model_id, archived_at, conversation_kind
) VALUES (?, 'owner', '旧小寒侧房间壤', ?, ?, NULL, 1, NULL, NULL, NULL, 'radio')`)
  .bind(legacyId, timestamp, timestamp).run();
await writeSoil(legacyDb, legacyId, {
  current_text: '旧版房间壤里的一句小寒手写话。',
  manual_locked: true,
  auto_refresh_enabled: false,
});

const migrated = await getMysticDogtalk(legacyDb, { room_scope: 'radio' });
assert.equal(migrated.body, '旧版房间壤里的一句小寒手写话。');
assert.equal(migrated.room_scope, 'radio');
assert.equal(migrated.read_mode, 'when_confused');
assert.equal(
  (await readSoil(legacyDb, legacyId)).current_text,
  '旧版房间壤里的一句小寒手写话。',
  'migration copies legacy content without deleting it',
);
const organized = await organizedMemoryRecordsInRange(legacyDb, {
  from: new Date(timestamp - 60_000).toISOString(),
  to: new Date(timestamp + 60_000).toISOString(),
});
assert.equal(
  organized.soils.some((soil) => soil.conversation_id === legacyId),
  false,
  'legacy Xiaohan room notes and migrated dogtalk never enter daily-summary material',
);

console.log('dogtalk: ok');

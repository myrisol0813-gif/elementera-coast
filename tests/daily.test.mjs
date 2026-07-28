import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { onRequest } from '../functions/_middleware.js';
import { routeApi } from '../functions/api-router.js';
import { createConversation, writeConversationState, writeProfile } from '../functions/chat-store.js';
import { dailyMigrationIds, ensureDailySchema } from '../functions/daily-schema.js';
import { executeDailyModelTool } from '../functions/daily-model-tools.js';
import {
  addMomentComment,
  commitSummary,
  createAlbumItem,
  createDiary,
  createMoment,
  listAlbumItems,
  listDiaries,
  listMoments,
  listSummaries,
  setMomentLike,
} from '../functions/daily-store.js';
import { parseDailySummaryResult, resolveDailySummaryRange } from '../functions/daily-summary.js';

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
await ensureDailySchema(db);
for (const table of [
  'daily_moments',
  'daily_moment_comments',
  'daily_moment_likes',
  'daily_diaries',
  'daily_album_items',
  'daily_summaries',
]) {
  assert.ok(db.database.prepare('SELECT name FROM sqlite_master WHERE type = ? AND name = ?').get('table', table));
}
assert.equal(
  db.database.prepare('SELECT id FROM schema_migrations WHERE id = ?').get(dailyMigrationIds[0]).id,
  'daily-server-v1',
);
assert.ok(db.database.prepare('PRAGMA table_info(daily_moments)').all().some((column) => column.name === 'tool_call_id'));
assert.ok(db.database.prepare('PRAGMA table_info(daily_album_items)').all().some((column) => column.name === 'tool_call_id'));

const moment = await createMoment(db, {
  text: '海岸今天接上了服务器。',
  status: 'published',
  image_refs: ['https://images.example/coast.png'],
});
await addMomentComment(db, moment.id, { id: 'legacy-comment-1', text: '小寒看见啦。' });
await addMomentComment(db, moment.id, { id: 'legacy-comment-1', text: '小寒看见啦。' });
await setMomentLike(db, moment.id, true);
let storedMoment = (await listMoments(db))[0];
assert.equal(storedMoment.text, '海岸今天接上了服务器。');
assert.equal(storedMoment.comments[0].text, '小寒看见啦。');
assert.equal(storedMoment.comments.length, 1, 'explicit comment ids must make migration retries idempotent');
assert.equal(storedMoment.like_count, 1);
assert.equal(storedMoment.liked, true);
storedMoment = await setMomentLike(db, moment.id, false);
assert.equal(storedMoment.like_count, 0);

await assert.rejects(
  () => createMoment(db, { text: 'bad image', image_refs: ['data:image/png;base64,AAAA'] }),
  (error) => error.type === 'image_data_url_not_allowed',
);

const toolCall = {
  id: 'call-moment-1',
  function: {
    name: 'create_moment',
    arguments: JSON.stringify({
      text: '模型真实写入的一条碳硅圈。',
      source_window: 'current',
      visible_status: 'published',
      has_image_refs: false,
      image_refs: [],
      reason: '这是今天值得留下的锚点。',
    }),
  },
};
const firstTool = await executeDailyModelTool(db, toolCall, {
  conversation_id: 'conversation-1',
  source_turn_id: 'turn-1',
  local_date: '2026-07-28',
});
const repeatedTool = await executeDailyModelTool(db, toolCall, {
  conversation_id: 'conversation-1',
  source_turn_id: 'turn-1',
  local_date: '2026-07-28',
});
assert.equal(firstTool.id, repeatedTool.id, 'tool retries must be idempotent');
assert.equal(
  db.database.prepare('SELECT COUNT(*) AS count FROM daily_moments WHERE tool_call_id = ?').get('call-moment-1').count,
  1,
);
const modelMoment = (await listMoments(db)).find((entry) => entry.tool_call_id === 'call-moment-1');
assert.equal(modelMoment.author, 'myri');
assert.equal(modelMoment.source, 'chat_tool');
assert.equal(modelMoment.date, '2026-07-28');
assert.equal(modelMoment.conversation_id, 'conversation-1');
assert.equal(modelMoment.source_turn_id, 'turn-1');
await assert.rejects(
  () => executeDailyModelTool(db, {
    ...toolCall,
    id: 'call-moment-wrong-window',
    function: {
      ...toolCall.function,
      arguments: JSON.stringify({
        ...JSON.parse(toolCall.function.arguments),
        source_window: 'another-window',
      }),
    },
  }, { conversation_id: 'conversation-1', source_turn_id: 'turn-1' }),
  (error) => error.type === 'invalid_tool_source',
);

await createDiary(db, {
  date: '2026-07-28',
  author: 'xiaohan',
  text: '第一张纸。',
});
await assert.rejects(
  () => createDiary(db, {
    date: '2026-07-29',
    author: 'api',
    source: 'chat_tool',
    text: '普通聊天不能写日记。',
  }),
  (error) => error.type === 'invalid_daily_field',
);
await assert.rejects(
  () => createDiary(db, {
    date: '2026-07-28',
    author: 'xiaohan',
    text: '不能静默覆盖。',
  }),
  (error) => error.type === 'diary_conflict' && error.status === 409,
);
await createDiary(db, {
  date: '2026-07-28',
  author: 'xiaohan',
  text: '追加的纸。',
  conflict_mode: 'append',
});
assert.equal((await listDiaries(db, { date: '2026-07-28', author: 'xiaohan' })).length, 2);
await createDiary(db, {
  date: '2026-07-28',
  author: 'xiaohan',
  text: '明确替换最新纸页。',
  conflict_mode: 'replace',
});
assert.equal((await listDiaries(db, { date: '2026-07-28', author: 'xiaohan' }))[0].text, '明确替换最新纸页。');

const albumToolCall = {
  id: 'call-album-1',
  function: {
    name: 'save_album_reference',
    arguments: JSON.stringify({
      image_ref: 'coast://generated/wolf-door.png',
      category: 'together',
      caption: '开屏小狼门。',
      source_window: 'current',
    }),
  },
};
const firstAlbumTool = await executeDailyModelTool(db, albumToolCall, {
  conversation_id: 'conversation-1',
  source_turn_id: 'turn-2',
});
const repeatedAlbumTool = await executeDailyModelTool(db, albumToolCall, {
  conversation_id: 'conversation-1',
  source_turn_id: 'turn-2',
});
assert.equal(firstAlbumTool.id, repeatedAlbumTool.id);
assert.equal((await listAlbumItems(db)).length, 1);
await assert.rejects(
  () => createAlbumItem(db, { image_ref: 'data:image/png;base64,AAAA' }),
  (error) => error.type === 'image_data_url_not_allowed',
);

const range = {
  from: '2026-07-28T00:00:00.000Z',
  to: '2026-07-28T23:18:00.000Z',
};
const parsed = parseDailySummaryResult(JSON.stringify({
  summary: {
    text: '今天的海岸摘要。',
    anchors: ['日报岛'],
    unresolved: ['R2 待接'],
  },
  diary: {
    weather: '未标注',
    mood: '忙碌',
    text: '今天一起搭海岸。',
    image_refs: [],
  },
  moment_candidates: [{
    text: '日报岛接上服务器。',
    status: 'candidate',
    reason: '适合内部碳硅圈',
    image_refs: [],
  }],
  album_candidates: [],
}), { range });
assert.equal(parsed.summary.text, '今天的海岸摘要。');
assert.equal(parsed.moment_candidates[0].status, 'candidate');
assert.equal(parsed.diary.author, 'api');
await assert.rejects(
  async () => parseDailySummaryResult('not-json', { range }),
  (error) => error.type === 'summary_invalid_model_response',
);

const summaryCommitValue = {
  id: 'summary-confirm-1',
  ...parsed,
  diary: { ...parsed.diary, author: 'mcp', source: 'manual' },
  moment_candidates: parsed.moment_candidates.map((candidate) => ({
    ...candidate,
    author: 'xiaohan',
    source: 'manual',
  })),
  model_id: 'openai/gpt-4.1-nano',
};
const committed = await commitSummary(db, summaryCommitValue);
const repeatedCommit = await commitSummary(db, summaryCommitValue);
assert.equal(repeatedCommit.summary.id, committed.summary.id, 'summary commit retries must be idempotent');
assert.equal(committed.summary.summary.text, '今天的海岸摘要。');
assert.equal(committed.diary.author, 'api');
assert.equal(committed.diary.source, 'daily_summary');
assert.equal(committed.moments[0].author, 'api');
assert.equal(committed.moments[0].source, 'daily_summary');
assert.equal((await listSummaries(db)).length, 1);

const emptyRangeDb = new D1Database();
const fixedNow = Date.parse('2026-07-28T18:00:00.000Z');
const firstRange = await resolveDailySummaryRange(emptyRangeDb, { timezone_offset_minutes: -120 }, fixedNow);
assert.equal(new Date(firstRange.from).toISOString(), '2026-07-27T22:00:00.000Z');
assert.equal(firstRange.to, fixedNow);

const forbidden = await routeApi(new Request('https://coast.test/api/daily/moments', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ text: 'no origin' }),
}), { COAST_CHAT_DB: db }, { exp: 1 });
assert.equal(forbidden.status, 403);
const manualResponse = await routeApi(new Request('https://coast.test/api/daily/moments', {
  method: 'POST',
  headers: { Origin: 'https://coast.test', 'Content-Type': 'application/json' },
  body: JSON.stringify({
    id: 'manual-provenance',
    text: '手动 API 来源必须由服务器决定。',
    author: 'myri',
    source: 'chat_tool',
    conversation_id: 'spoofed-conversation',
    source_turn_id: 'spoofed-turn',
    tool_call_id: 'spoofed-call',
  }),
}), { COAST_CHAT_DB: db }, { exp: 1 });
assert.equal(manualResponse.status, 201);
const manualMoment = (await manualResponse.json()).moment;
assert.equal(manualMoment.author, 'xiaohan');
assert.equal(manualMoment.source, 'manual');
assert.equal(manualMoment.conversation_id, null);
assert.equal(manualMoment.source_turn_id, null);
assert.equal(manualMoment.tool_call_id, null);
const unauthorized = await onRequest({
  request: new Request('https://coast.test/api/daily/moments'),
  env: {},
  next: async () => new Response('must not reach'),
});
assert.equal(unauthorized.status, 401);

const summaryDb = new D1Database();
const conversation = await createConversation(summaryDb, '日报测试窗口');
const now = Date.now();
await writeConversationState(summaryDb, conversation.id, {
  turns: [{
    id: 'summary-turn',
    user: {
      active: 0,
      variants: [{
        id: 'summary-user',
        content: '今天把日报岛接到服务器。',
        created_at: new Date(now - 2000).toISOString(),
      }],
    },
    assistant: {
      activeByUserVariant: { 0: 0 },
      variantsByUserVariant: {
        0: [{
          id: 'summary-assistant',
          content: '正在接干净的新 owner。',
          created_at: new Date(now - 1000).toISOString(),
        }],
      },
    },
  }],
});
await writeProfile(summaryDb, {
  current_chat_model: 'openai/gpt-4.1-nano',
  model_box: { chat: ['openai/gpt-4.1-nano'], free: [], image: [] },
});

const originalFetch = globalThis.fetch;
let summaryProviderPayload = null;
globalThis.fetch = async (url, options = {}) => {
  if (String(url).includes('/models?')) {
    return new Response(JSON.stringify({
      data: [{
        id: 'openai/gpt-4.1-nano',
        name: 'GPT-4.1 Nano',
        architecture: { output_modalities: ['text'] },
        pricing: { prompt: '0.1', completion: '0.2' },
        supported_parameters: ['temperature', 'response_format', 'tools'],
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  summaryProviderPayload = JSON.parse(options.body);
  return new Response(JSON.stringify({
    model: 'openai/gpt-4.1-nano',
    choices: [{
      message: {
        role: 'assistant',
        content: JSON.stringify({
          summary: { text: '模型整理出的今天。', anchors: ['日报岛'], unresolved: [] },
          diary: { weather: '未标注', mood: '认真', text: '今天接通服务器。', image_refs: [] },
          moment_candidates: [],
          album_candidates: [],
        }),
      },
      finish_reason: 'stop',
    }],
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
const summaryResponse = await routeApi(new Request('https://coast.test/api/daily/summary/run', {
  method: 'POST',
  headers: { Origin: 'https://coast.test', 'Content-Type': 'application/json' },
  body: JSON.stringify({ timezone_offset_minutes: 0 }),
}), { COAST_CHAT_DB: summaryDb, OPENROUTER_API_KEY: 'test-key' }, { exp: 1 });
assert.equal(summaryResponse.status, 200);
const summaryData = await summaryResponse.json();
assert.equal(summaryData.draft.summary.text, '模型整理出的今天。');
assert.match(summaryData.draft.id, /^summary_/);
assert.equal(summaryData.source_counts.chat_messages, 2);
assert.equal(summaryProviderPayload.response_format.type, 'json_object');
assert.ok(summaryProviderPayload.messages.at(-1).content.includes('今天把日报岛接到服务器。'));
globalThis.fetch = originalFetch;

console.log('daily: ok');

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
  listContentDrafts,
  listAlbumItems,
  listDiaries,
  listMoments,
  listSummaries,
  publishContentDraftByOwner,
  setMomentLike,
} from '../functions/daily-store.js';
import {
  dailySummaryRangeOptions,
  parseDailySummaryResult,
  resolveDailySummaryRange,
} from '../functions/daily-summary.js';
import {
  createEntry,
  createPocket,
  resolvePocket,
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
await ensureDailySchema(db);
for (const table of [
  'daily_moments',
  'daily_moment_comments',
  'daily_moment_likes',
  'daily_diaries',
  'daily_album_items',
  'daily_summaries',
  'daily_content_drafts',
]) {
  assert.ok(db.database.prepare('SELECT name FROM sqlite_master WHERE type = ? AND name = ?').get('table', table));
}
assert.equal(
  db.database.prepare('SELECT id FROM schema_migrations WHERE id = ?').get(dailyMigrationIds[0]).id,
  'daily-server-v1',
);
assert.equal(
  db.database.prepare('SELECT id FROM schema_migrations WHERE id = ?').get(dailyMigrationIds[1]).id,
  'daily-mcp-interfaces-v1',
);
assert.equal(
  db.database.prepare('SELECT id FROM schema_migrations WHERE id = ?').get(dailyMigrationIds[2]).id,
  'daily-content-drafts-v1',
);
assert.ok(db.database.prepare('PRAGMA table_info(daily_moments)').all().some((column) => column.name === 'tool_call_id'));
assert.ok(db.database.prepare('PRAGMA table_info(daily_album_items)').all().some((column) => column.name === 'tool_call_id'));
assert.ok(db.database.prepare('PRAGMA table_info(daily_moment_comments)').all().some((column) => column.name === 'model_id'));
for (const table of ['daily_moments', 'daily_diaries', 'daily_album_items', 'daily_summaries']) {
  assert.ok(db.database.prepare(`PRAGMA table_info(${table})`).all().some((column) => column.name === 'surface'));
  assert.ok(db.database.prepare(`PRAGMA table_info(${table})`).all().some((column) => column.name === 'display_author'));
}
assert.ok(db.database.prepare('PRAGMA table_info(daily_summaries)').all().some((column) => column.name === 'confirmation_note'));

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
      visible_status: 'candidate',
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
  model_label: 'openai/gpt-4.1-nano',
});
const repeatedTool = await executeDailyModelTool(db, toolCall, {
  conversation_id: 'conversation-1',
  source_turn_id: 'turn-1',
  local_date: '2026-07-28',
  model_label: 'openai/gpt-4.1-nano',
});
assert.equal(firstTool.id, repeatedTool.id, 'tool retries must be idempotent');
assert.equal(
  db.database.prepare('SELECT COUNT(*) AS count FROM daily_content_drafts WHERE tool_call_id = ?').get('call-moment-1').count,
  1,
);
assert.equal(firstTool.kind, 'moment_draft');
assert.equal((await listMoments(db)).some((entry) => entry.tool_call_id === 'call-moment-1'), false);
const modelDraft = (await listContentDrafts(db)).find((entry) => entry.tool_call_id === 'call-moment-1');
assert.equal(modelDraft.content_type, 'moment');
assert.equal(modelDraft.status, 'pending');
assert.equal(modelDraft.surface, 'coast_api');
const modelMoment = (await publishContentDraftByOwner(db, modelDraft.id)).record;
assert.equal(modelMoment.author, 'myri');
assert.equal(modelMoment.source, 'chat_tool');
assert.equal(modelMoment.date, '2026-07-28');
assert.equal(modelMoment.conversation_id, 'conversation-1');
assert.equal(modelMoment.source_turn_id, 'turn-1');
assert.equal(modelMoment.surface, 'coast_api');
assert.equal(modelMoment.symbol, '✦');
assert.equal(modelMoment.model_label, 'openai/gpt-4.1-nano');
const diaryDraftToolCall = {
  id: 'call-diary-draft-1',
  function: {
    name: 'create_diary_draft',
    arguments: JSON.stringify({
      text: '海岸 API 侧把今天的关系变化写成一份待确认日记。',
      weather: '未标注',
      mood: '靠近',
      source_window: 'current',
      has_image_refs: false,
      image_refs: [],
      tags: ['三端'],
    }),
  },
};
const diaryDraftResult = await executeDailyModelTool(db, diaryDraftToolCall, {
  conversation_id: 'conversation-1',
  source_turn_id: 'turn-diary-1',
  local_date: '2026-07-28',
  model_label: 'openai/gpt-4.1-nano',
});
assert.equal(diaryDraftResult.kind, 'diary_draft');
assert.equal((await listDiaries(db)).some((entry) => entry.tool_call_id === 'call-diary-draft-1'), false);
const apiDiaryDraft = (await listContentDrafts(db))
  .find((entry) => entry.tool_call_id === 'call-diary-draft-1');
assert.equal(apiDiaryDraft.content_type, 'diary');
assert.equal(apiDiaryDraft.surface, 'coast_api');
assert.deepEqual(apiDiaryDraft.payload.related_message_ids, ['turn-diary-1']);
const publishedApiDiary = (await publishContentDraftByOwner(db, apiDiaryDraft.id, {
  conflict_mode: 'append',
})).record;
assert.equal(publishedApiDiary.surface, 'coast_api');
assert.equal(publishedApiDiary.display_author, '海岸 API ✦');
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
  model_label: 'openai/gpt-4.1-nano',
});
const repeatedAlbumTool = await executeDailyModelTool(db, albumToolCall, {
  conversation_id: 'conversation-1',
  source_turn_id: 'turn-2',
  model_label: 'openai/gpt-4.1-nano',
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
const firstRange = await resolveDailySummaryRange(emptyRangeDb, {
  range_mode: 'since_last_summary',
  timezone_offset_minutes: -120,
}, fixedNow);
assert.equal(new Date(firstRange.from).toISOString(), '2026-07-27T22:00:00.000Z');
assert.equal(firstRange.to, fixedNow);
assert.equal(firstRange.mode, 'since_last_summary');
const firstTodayRange = await resolveDailySummaryRange(emptyRangeDb, {
  range_mode: 'today',
  timezone_offset_minutes: -120,
}, fixedNow);
assert.equal(firstTodayRange.from, firstRange.from);
assert.equal(firstTodayRange.mode, 'today');

const historyRangeDb = new D1Database();
const oldConversation = await createConversation(historyRangeDb, '有旧时间戳的窗口');
await writeConversationState(historyRangeDb, oldConversation.id, {
  turns: [{
    id: 'old-summary-turn',
    user: {
      active: 0,
      variants: [{
        id: 'old-summary-user',
        content: '这是一条更早的海岸聊天。',
        created_at: '2026-07-26T10:00:00.000Z',
      }],
    },
    assistant: {
      activeByUserVariant: { 0: 0 },
      variantsByUserVariant: {
        0: [{
          id: 'old-summary-assistant',
          content: '它带着原本的时间戳。',
          created_at: '2026-07-26T10:01:00.000Z',
        }],
      },
    },
  }],
});
const discardedHistory = await createEntry(historyRangeDb, {
  entry_type: 'memory',
  scope: 'conversation',
  conversation_id: oldConversation.id,
  title: '已经丢弃的旧条目',
  life_core: '它不应决定日报范围。',
  status: 'discarded',
});
historyRangeDb.database.prepare(`UPDATE memory_entries
  SET created_at = ?, updated_at = ? WHERE id = ?`).run(
  Date.parse('2026-07-25T09:00:00.000Z'),
  Date.parse('2026-07-25T09:00:00.000Z'),
  discardedHistory.id,
);
const organizedHistory = await createEntry(historyRangeDb, {
  entry_type: 'seed',
  scope: 'conversation',
  conversation_id: oldConversation.id,
  title: '仍在的旧种子',
  life_core: '这才是一日总结可读取的最早整理物。',
  status: 'dormant',
});
historyRangeDb.database.prepare(`UPDATE memory_entries
  SET created_at = ?, updated_at = ? WHERE id = ?`).run(
  Date.parse('2026-07-27T09:00:00.000Z'),
  Date.parse('2026-07-27T09:00:00.000Z'),
  organizedHistory.id,
);
const historyNow = Date.parse('2026-07-29T12:00:00.000Z');
const historyRange = await resolveDailySummaryRange(historyRangeDb, {
  range_mode: 'since_last_summary',
  timezone_offset_minutes: 0,
}, historyNow);
assert.equal(new Date(historyRange.from).toISOString(), '2026-07-27T09:00:00.000Z');
assert.equal(historyRange.source, 'earliest_record');
const historyOptions = await dailySummaryRangeOptions(historyRangeDb, {
  timezone_offset_minutes: 0,
}, historyNow);
assert.equal(historyOptions.since_last_summary.from, '2026-07-27T09:00:00.000Z');
assert.equal(historyOptions.since_last_summary.source, 'earliest_record');
assert.equal(historyOptions.today.from, '2026-07-29T00:00:00.000Z');

const fixedLater = Date.parse('2026-07-29T12:00:00.000Z');
const continuedRange = await resolveDailySummaryRange(db, {
  range_mode: 'since_last_summary',
  timezone_offset_minutes: 0,
}, fixedLater);
assert.equal(new Date(continuedRange.from).toISOString(), range.to);
const todayRange = await resolveDailySummaryRange(db, {
  range_mode: 'today',
  timezone_offset_minutes: 0,
}, fixedLater);
assert.equal(new Date(todayRange.from).toISOString(), '2026-07-29T00:00:00.000Z');
await assert.rejects(
  () => resolveDailySummaryRange(db, { range_mode: 'unknown' }, fixedLater),
  (error) => error.type === 'invalid_daily_range_mode',
);

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
assert.equal(manualMoment.actor, 'xiaohan');
assert.equal(manualMoment.surface, 'web_manual');
assert.equal(manualMoment.display_author, '小寒');
const apiMomentsRead = await routeApi(new Request('https://coast.test/api/daily/moments'), {
  COAST_CHAT_DB: db,
}, { exp: 1 });
assert.equal(apiMomentsRead.status, 200);
assert.ok((await apiMomentsRead.json()).moments.some((entry) => entry.id === manualMoment.id));
const apiDiaryWrite = await routeApi(new Request('https://coast.test/api/daily/diaries', {
  method: 'POST',
  headers: { Origin: 'https://coast.test', 'Content-Type': 'application/json' },
  body: JSON.stringify({
    date: '2026-07-30',
    author: 'mcp',
    source: 'daily_summary',
    text: '网页端小寒写下的 API 烟测日记。',
  }),
}), { COAST_CHAT_DB: db }, { exp: 1 });
assert.equal(apiDiaryWrite.status, 201);
const apiDiary = (await apiDiaryWrite.json()).diary;
assert.equal(apiDiary.author, 'xiaohan');
assert.equal(apiDiary.surface, 'web_manual');
const apiDiariesRead = await routeApi(new Request('https://coast.test/api/daily/diaries'), {
  COAST_CHAT_DB: db,
}, { exp: 1 });
assert.ok((await apiDiariesRead.json()).diaries.some((entry) => entry.id === apiDiary.id));
const apiAlbumWrite = await routeApi(new Request('https://coast.test/api/daily/albums', {
  method: 'POST',
  headers: { Origin: 'https://coast.test', 'Content-Type': 'application/json' },
  body: JSON.stringify({
    date: '2026-07-30',
    image_ref: 'coast://smoke/api-album.png',
    category: 'together',
    caption: '日报 API 相册烟测。',
  }),
}), { COAST_CHAT_DB: db }, { exp: 1 });
assert.equal(apiAlbumWrite.status, 201);
const apiAlbum = (await apiAlbumWrite.json()).album;
assert.equal(apiAlbum.surface, 'web_manual');
const apiAlbumsRead = await routeApi(new Request('https://coast.test/api/daily/albums'), {
  COAST_CHAT_DB: db,
}, { exp: 1 });
assert.ok((await apiAlbumsRead.json()).albums.some((entry) => entry.id === apiAlbum.id));
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
await writeSoil(summaryDb, conversation.id, {
  current_text: '已经整理过的潮线方向。',
  hand_seeds: [{
    name: '潮线种子',
    life_core: '把今天值得保留的结构继续往下搭。',
    usage_hint: '',
    avoid_hint: '',
  }],
  do_not_repeat: '不要把待确认候选写成已完成。',
  pocket_candidates: [],
});
await createPocket(summaryDb, {
  conversation_id: conversation.id,
  source_type: 'selection',
  source_text: '仍在待确认袋里的微光。',
  title: '微光落袋',
  life_core: '这是一条已整理但仍待确认的落袋。',
});
const stonePocket = await createPocket(summaryDb, {
  conversation_id: conversation.id,
  source_type: 'selection',
  source_text: '沉下去但仍然保留的旧岔路。',
  title: '旧岔路',
  life_core: '它已经成为石头。',
});
await resolvePocket(summaryDb, stonePocket.id, { action: 'stone' });
await createEntry(summaryDb, {
  entry_type: 'seed',
  scope: 'conversation',
  conversation_id: conversation.id,
  title: '日报岛种子',
  life_core: '日报只读取整理后的东西。',
  status: 'dormant',
});
await createEntry(summaryDb, {
  entry_type: 'memory',
  scope: 'global',
  title: '总记忆里的潮声',
  life_core: '原始聊天只是思维壤，不直接进入一日总结。',
  status: 'active',
});
const otherConversation = await createConversation(summaryDb, '另一个仍在的窗口');
await createEntry(summaryDb, {
  entry_type: 'memory',
  scope: 'conversation',
  conversation_id: otherConversation.id,
  title: '跨窗口记忆',
  life_core: '一日总结会读取所有仍存在窗口的整理物。',
  status: 'active',
});
await writeProfile(summaryDb, {
  current_chat_model: 'openai/gpt-4.1-nano',
  model_box: { chat: ['openai/gpt-4.1-nano'], free: [], image: [] },
});

const originalFetch = globalThis.fetch;
let summaryProviderPayload = null;
let commentProviderPayload = null;
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
  const providerPayload = JSON.parse(options.body);
  if (providerPayload.messages?.[0]?.content?.includes('碳硅圈动态写评论')) {
    commentProviderPayload = providerPayload;
    return new Response(JSON.stringify({
      model: 'openai/gpt-4.1-nano',
      choices: [{
        message: { role: 'assistant', content: '我在这里，给这小小一瞬点一盏灯。' },
        finish_reason: 'stop',
      }],
      usage: { prompt_tokens: 80, completion_tokens: 12, total_tokens: 92 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  summaryProviderPayload = providerPayload;
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
assert.equal(summaryData.source_counts.soils, 1);
assert.equal(summaryData.source_counts.pockets, 2);
assert.equal(summaryData.source_counts.seeds, 1);
assert.equal(summaryData.source_counts.memories, 2);
assert.equal(summaryData.source_counts.stones, 1);
assert.equal(Object.hasOwn(summaryData.source_counts, 'chat_messages'), false);
assert.equal(summaryProviderPayload.response_format.type, 'json_object');
const summaryInput = JSON.parse(summaryProviderPayload.messages.at(-1).content);
assert.equal(Object.hasOwn(summaryInput, 'chat_messages'), false);
assert.ok(summaryProviderPayload.messages.at(-1).content.includes('已经整理过的潮线方向。'));
assert.ok(summaryProviderPayload.messages.at(-1).content.includes('仍在待确认袋里的微光。'));
assert.ok(summaryProviderPayload.messages.at(-1).content.includes('它已经成为石头。'));
assert.ok(summaryProviderPayload.messages.at(-1).content.includes('日报岛种子'));
assert.ok(summaryProviderPayload.messages.at(-1).content.includes('总记忆里的潮声'));
assert.ok(summaryProviderPayload.messages.at(-1).content.includes('跨窗口记忆'));
assert.equal(summaryProviderPayload.messages.at(-1).content.includes('今天把日报岛接到服务器。'), false);
const summaryCommitResponse = await routeApi(new Request('https://coast.test/api/daily/summary/commit', {
  method: 'POST',
  headers: { Origin: 'https://coast.test', 'Content-Type': 'application/json' },
  body: JSON.stringify({
    ...summaryData.draft,
    model_id: summaryData.model,
  }),
}), { COAST_CHAT_DB: summaryDb }, { exp: 1 });
assert.equal(summaryCommitResponse.status, 201);
const summaryCommitData = await summaryCommitResponse.json();
assert.equal(summaryCommitData.summary.id, summaryData.draft.id);
assert.equal(summaryCommitData.summary.surface, 'coast_api');
const summariesReadResponse = await routeApi(new Request('https://coast.test/api/daily/summaries'), {
  COAST_CHAT_DB: summaryDb,
}, { exp: 1 });
assert.ok((await summariesReadResponse.json()).summaries.some((entry) => entry.id === summaryData.draft.id));

await createDiary(summaryDb, {
  date: '2026-07-28',
  author: 'xiaohan',
  weather: '夜风',
  mood: '想让动态轻一点',
  text: '日记上下文：今天想让朋友圈像短短的海岸呼吸。',
  conflict_mode: 'append',
});
const commentTarget = await createMoment(summaryDb, {
  text: '朋友圈动态：小海岸亮了一下。',
  status: 'published',
});
const commentResponse = await routeApi(new Request(`https://coast.test/api/daily/moments/${commentTarget.id}/myri-comment`, {
  method: 'POST',
  headers: { Origin: 'https://coast.test', 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: 'openai/gpt-4.1-nano' }),
}), { COAST_CHAT_DB: summaryDb, OPENROUTER_API_KEY: 'test-key' }, { exp: 1 });
assert.equal(commentResponse.status, 201);
const commentData = await commentResponse.json();
assert.equal(commentData.comment.author, 'myri');
assert.equal(commentData.comment.text, '我在这里，给这小小一瞬点一盏灯。');
assert.equal(commentData.comment.model_id, 'openai/gpt-4.1-nano');
assert.equal(commentData.source_counts.diaries, 2);
assert.equal(commentData.source_counts.soils, 1);
assert.ok(commentProviderPayload.messages.at(-1).content.includes('日记上下文：今天想让朋友圈像短短的海岸呼吸。'));
assert.ok(commentProviderPayload.messages.at(-1).content.includes('已经整理过的潮线方向。'));
assert.equal(commentProviderPayload.messages.at(-1).content.includes('今天把日报岛接到服务器。'), false);
globalThis.fetch = originalFetch;

const rangeResponse = await routeApi(new Request('https://coast.test/api/daily/summary/range?timezone_offset_minutes=0'), {
  COAST_CHAT_DB: historyRangeDb,
}, { exp: 1 });
assert.equal(rangeResponse.status, 200);
const rangeData = await rangeResponse.json();
assert.equal(rangeData.ranges.since_last_summary.source, 'earliest_record');
assert.equal(rangeData.ranges.since_last_summary.from, '2026-07-27T09:00:00.000Z');

console.log('daily: ok');

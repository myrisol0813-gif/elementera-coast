// retrigger 1
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();

async function read(path) {
  return readFile(resolve(root, path), 'utf8');
}

async function write(path, content) {
  return writeFile(resolve(root, path), content);
}

function replace(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`missing patch target: ${label}`);
  return source.replace(before, after);
}

function replaceRegex(source, pattern, after, label) {
  if (!pattern.test(source)) throw new Error(`missing regex target: ${label}`);
  return source.replace(pattern, after);
}

let store = await read('functions/memory-store.js');
store = replace(
  store,
  `    auto_refresh_enabled INTEGER NOT NULL DEFAULT 1,
    revision INTEGER NOT NULL DEFAULT 1,`,
  `    auto_refresh_enabled INTEGER NOT NULL DEFAULT 1,
    organized_through_turn_id TEXT NOT NULL DEFAULT '',
    revision INTEGER NOT NULL DEFAULT 1,`,
  'conversation_soils organized_through_turn_id schema',
);
store = replace(
  store,
  `  await run(db, \`CREATE TABLE IF NOT EXISTS memory_pockets (`,
  `  await ensureColumn(db, 'conversation_soils', 'organized_through_turn_id', "TEXT NOT NULL DEFAULT ''");
  await run(db, \`CREATE TABLE IF NOT EXISTS memory_pockets (`,
  'conversation_soils organized_through_turn_id ensureColumn',
);
store = replace(
  store,
  `    auto_refresh_enabled: Number(row.auto_refresh_enabled ?? 1) === 1,
    revision: Math.max(1, Number(row.revision || 1)),`,
  `    auto_refresh_enabled: Number(row.auto_refresh_enabled ?? 1) === 1,
    organized_through_turn_id: row.organized_through_turn_id || '',
    revision: Math.max(1, Number(row.revision || 1)),`,
  'soilFromRow organized_through_turn_id',
);
store = replace(
  store,
  `    pocket_candidates: has('pocket_candidates') ? normalizePocketCandidates(value.pocket_candidates) : current.pocket_candidates,
    manual_locked: has('manual_locked') ? bool(value.manual_locked) : !automatic,`,
  `    pocket_candidates: has('pocket_candidates') ? normalizePocketCandidates(value.pocket_candidates) : current.pocket_candidates,
    organized_through_turn_id: has('organized_through_turn_id') ? clip(value.organized_through_turn_id, 180) : current.organized_through_turn_id,
    manual_locked: has('manual_locked') ? bool(value.manual_locked) : !automatic,`,
  'writeSoil next organized_through_turn_id',
);
store = replace(
  store,
  `    current_text = ?, hand_seeds_json = ?, do_not_repeat = ?, pocket_candidates_json = ?,
    manual_locked = ?, auto_refresh_enabled = ?, revision = revision + 1, updated_at = ?`,
  `    current_text = ?, hand_seeds_json = ?, do_not_repeat = ?, pocket_candidates_json = ?,
    manual_locked = ?, auto_refresh_enabled = ?, organized_through_turn_id = ?, revision = revision + 1, updated_at = ?`,
  'writeSoil update organized_through_turn_id column',
);
store = replace(
  store,
  `    next.auto_refresh_enabled ? 1 : 0,
    timestamp,`,
  `    next.auto_refresh_enabled ? 1 : 0,
    next.organized_through_turn_id,
    timestamp,`,
  'writeSoil update organized_through_turn_id param',
);
await write('functions/memory-store.js', store);

let router = await read('functions/memory-router.js');
router = replace(
  router,
  `const SOIL_RECENT_TURNS = 12;
const SOIL_FULL_RECENT_TURNS = 3;
const SOIL_FIELD_CHARS = 6000;
const SOIL_PROMPT_TOTAL_CHARS = 64 * 1024;
const SOIL_ORGANIZE_MAX_TOKENS = 3200;`,
  `const SOIL_LANDING_FIELD_CHARS = 24000;
const SOIL_REPLY_FIELD_CHARS = 6000;
const SOIL_PREVIOUS_FIELD_CHARS = 1000;
const SOIL_BACKFILL_TURNS = 3;
const SOIL_PROMPT_TOTAL_CHARS = 28 * 1024;
const SOIL_ORGANIZE_MAX_TOKENS = 3200;`,
  'soil constants incremental input structure',
);
router = replace(
  router,
  `function completedTurns(state) {
  return (Array.isArray(state?.turns) ? state.turns : [])
    .map(activeBranch)
    .filter((branch) => branch.user?.content
      && branch.assistant?.content
      && branch.assistant.content !== '正在连接当前模型……');
}

function parseStrictJson(value) {`,
  `function completedTurns(state) {
  return (Array.isArray(state?.turns) ? state.turns : [])
    .map(activeBranch)
    .filter((branch) => branch.user?.content
      && branch.assistant?.content
      && branch.assistant.content !== '正在连接当前模型……');
}

function isLandingBranch(branch = {}) {
  return branch.user?.hidden === true || branch.user?.input_type === 'landing_letter';
}

function visibleCompletedTurns(state) {
  return completedTurns(state).filter((branch) => !isLandingBranch(branch));
}

function parseStrictJson(value) {`,
  'visible completed turns helper',
);
router = replaceRegex(
  router,
  /function clipSoilContent[\s\S]*?function soilPrompt\(turns, oldSoil, maxHandSeeds\) \{[\s\S]*?最近完成的对话轮：\n\$\{JSON\.stringify\(recent\)\}`;\n\}/,
  `function clipSoilContent(value, max = SOIL_REPLY_FIELD_CHARS) {
  return Array.from(String(value || '')).slice(0, Math.max(0, max)).join('');
}

function soilTurnDigest(branch, maxChars) {
  if (!branch) return null;
  return {
    turn_id: branch.turn_id,
    user: {
      message_id: String(branch.user?.id || ''),
      content: clipSoilContent(branch.user?.content, maxChars),
    },
    assistant: {
      message_id: String(branch.assistant?.id || ''),
      content: clipSoilContent(branch.assistant?.content, maxChars),
    },
  };
}

function landingSoilContext(turns) {
  const landingTurns = turns.filter(isLandingBranch);
  const source = (landingTurns.length ? landingTurns : turns).slice(-1);
  return {
    mode: 'landing_bootstrap',
    landing_turns: source.map((branch) => soilTurnDigest(branch, SOIL_LANDING_FIELD_CHARS)).filter(Boolean),
  };
}

function turnsAfterCursor(turns, cursor) {
  if (!cursor) return turns.slice(-SOIL_BACKFILL_TURNS);
  const index = turns.findIndex((turn) => turn.turn_id === cursor);
  if (index < 0) return turns.slice(-SOIL_BACKFILL_TURNS);
  return turns.slice(index + 1);
}

function replySoilContext(turns, oldSoil) {
  const latest = turns.at(-1) || null;
  const previous = turns.length > 1 ? turns.at(-2) : null;
  const cursor = String(oldSoil.organized_through_turn_id || '');
  const missed = turnsAfterCursor(turns, cursor)
    .filter((branch) => branch?.turn_id
      && branch.turn_id !== latest?.turn_id
      && branch.turn_id !== previous?.turn_id)
    .slice(-SOIL_BACKFILL_TURNS)
    .map((branch) => soilTurnDigest(branch, SOIL_PREVIOUS_FIELD_CHARS))
    .filter(Boolean);
  return {
    mode: 'reply_incremental',
    old_current_text: oldSoil.current_text || '',
    organized_through_turn_id: cursor,
    latest_turn: soilTurnDigest(latest, SOIL_REPLY_FIELD_CHARS),
    previous_turn_excerpt: previous ? soilTurnDigest(previous, SOIL_PREVIOUS_FIELD_CHARS) : null,
    missed_since_success: missed,
    old_hand_seeds: oldSoil.hand_seeds,
    old_do_not_repeat: oldSoil.do_not_repeat,
    old_pocket_candidates: oldSoil.pocket_candidates,
  };
}

function boundedSoilContext(context) {
  let value = context;
  if (JSON.stringify(value).length <= SOIL_PROMPT_TOTAL_CHARS) return value;
  value = {
    ...context,
    previous_turn_excerpt: context.previous_turn_excerpt ? soilTurnDigest({
      turn_id: context.previous_turn_excerpt.turn_id,
      user: context.previous_turn_excerpt.user,
      assistant: context.previous_turn_excerpt.assistant,
    }, 400) : null,
    missed_since_success: (context.missed_since_success || []).slice(-1),
  };
  if (JSON.stringify(value).length <= SOIL_PROMPT_TOTAL_CHARS) return value;
  return {
    ...value,
    old_hand_seeds: (value.old_hand_seeds || []).slice(0, 3),
    old_do_not_repeat: clipSoilContent(value.old_do_not_repeat, 1200),
    old_pocket_candidates: (value.old_pocket_candidates || []).slice(0, 3),
  };
}

function soilPrompt(turns, oldSoil, maxHandSeeds, options = {}) {
  const context = options.landing
    ? landingSoilContext(turns)
    : boundedSoilContext(replySoilContext(turns, oldSoil));
  return \`你只负责整理当前对话的一小捧“思维壤”。它是当前窗口的工作台小纸条，不是永久档案馆，不是长期记忆，也不是思考过程。
请只返回一个 JSON 对象，不要 Markdown，不要解释：
{
  "current_text": "当前窗口此刻的滚动承接便签，通常 600–1800 中文字符，不要流水账",
  "hand_seeds_mode": "replace|keep|clear 三选一",
  "hand_seeds": [{"name":"名称","life_core":"生命核","usage_hint":"何时可用","avoid_hint":"如何避免复读"}],
  "do_not_repeat_mode": "replace|keep|clear 三选一",
  "do_not_repeat": "已经确认、不应重复铺陈的内容",
  "pocket_candidates_mode": "replace|keep|clear 三选一",
  "pocket_candidates": [{
    "candidate_id": "简短稳定标识",
    "title": "不是原句截取的简短名称",
    "life_core": "真正有再生力的核心",
    "content": "保留足够上下文后的压缩内容",
    "usage_hint": "什么情况下值得重新碰到",
    "avoid_hint": "如何避免机械复读或误用",
    "source_refs": [{"turn_id":"从本轮上下文中原样选择","role":"user|assistant|turn"}],
    "source_excerpt": "帮助辨认来源的短摘录"
  }]
}

mode 含义：
- replace：使用你本轮返回的新纸条。旧纸条可以退出、被改写、合并或替换；新内容比旧内容少也没关系。
- keep：这一栏原样保留旧思维壤。
- clear：你明确判断这一栏已经过时、重复、已经落袋或不再适合当前窗口，因此清空这一栏。
不要把空数组或空字符串当作失败占位。如果你确实要清空，请使用 clear mode；如果你没有要改这一栏，请使用 keep mode。

current_text 是“滚动承接便签”，不是最近十二轮聊天摘要。普通回复整理时，约 60–70% 注意力放在 latest_turn，约 20–30% 保留 old_current_text 中仍直接连接当前话题的未完成线索，极少量使用 previous_turn_excerpt 与 missed_since_success 防止断层。允许改写、压缩、删除已经结束的话题，用最新一轮重新解释上一段。不要累加“先聊 A、再聊 B、然后 C”的流水账；不要每轮继续背着登岛信；不要把远古精华长期塞在 current_text。

hand_seeds 不是永久收藏夹，而是“此刻最值得手持”的最多 \${maxHandSeeds} 粒。每轮都可以保留仍有用的旧种、删除过时旧种、替换旧种、合并重复旧种、改写旧种或加入新种。满 \${maxHandSeeds} 粒时主动做取舍。不要因为旧思维壤里已经有旧种就机械保留，也不要害怕让旧纸条退出手持。
do_not_repeat 也只是当前窗口的工作提醒。已经不再需要防复读的提醒可以改写、合并或 clear。
pocket_candidates 只放“现在不用、但仍有再生力”的内容，并使用上方真实 turn_id。旧候选会由系统先 upsert 到 pending；已经进入 pending、已经落袋或已经不适合当前窗口的候选可以从思维壤展示层退出，不要为了保留展示而反复挂在手上。当前确实没有候选时使用 pocket_candidates_mode=clear。

你只能整理 current_text、hand_seeds、do_not_repeat、pocket_candidates 这四块临时工作台内容。不要创建或删除长期记忆，不要删除聊天记录、pending pocket、confirmed pocket、seed、memory 或向量索引中的已确认内容；不要判断 core，不要把候选升级为 seed 或 memory，不要替用户做决定，不要复述整段聊天。

整理输入结构：
\${JSON.stringify(context)}\`;
}`,
  'incremental soil prompt functions',
);
router = replace(
  router,
  `  const state = await readConversationState(env.COAST_CHAT_DB, conversationId);
  const turns = completedTurns(state);
  if (!turns.length) return json({ ok: true, skipped: true, reason: 'no_completed_turns', soil: oldSoil });`,
  `  const state = await readConversationState(env.COAST_CHAT_DB, conversationId);
  const turns = landing ? completedTurns(state) : visibleCompletedTurns(state);
  if (!turns.length) return json({ ok: true, skipped: true, reason: 'no_completed_turns', soil: oldSoil });`,
  'organize uses visible completed turns for reply',
);
router = replace(
  router,
  `    const basePrompt = soilPrompt(turns, oldSoil, settings.maxHandSeeds);`,
  `    const basePrompt = soilPrompt(turns, oldSoil, settings.maxHandSeeds, { landing });`,
  'soilPrompt call passes landing flag',
);
router = replace(
  router,
  `      pocket_candidates: oldSoil.pocket_candidates,
      manual_locked: oldSoil.manual_locked,`,
  `      pocket_candidates: oldSoil.pocket_candidates,
      organized_through_turn_id: oldSoil.organized_through_turn_id,
      manual_locked: oldSoil.manual_locked,`,
  'degraded keeps success cursor',
);
router = replace(
  router,
  `    pocket_candidates: pocketCandidatesMode === 'replace'
      ? organizedPocketCandidates
      : pocketCandidatesMode === 'keep'
        ? oldSoil.pocket_candidates
        : pocketCandidatesMode === 'clear'
          ? []
          : organizedPocketCandidates.length ? organizedPocketCandidates : oldSoil.pocket_candidates,
    manual_locked: oldSoil.manual_locked,`,
  `    pocket_candidates: pocketCandidatesMode === 'replace'
      ? organizedPocketCandidates
      : pocketCandidatesMode === 'keep'
        ? oldSoil.pocket_candidates
        : pocketCandidatesMode === 'clear'
          ? []
          : organizedPocketCandidates.length ? organizedPocketCandidates : oldSoil.pocket_candidates,
    organized_through_turn_id: latestTurn?.turn_id || oldSoil.organized_through_turn_id,
    manual_locked: oldSoil.manual_locked,`,
  'successful organize advances success cursor',
);
await write('functions/memory-router.js', router);

const incrementalTest = `import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createConversation, writeConversationState } from '../functions/chat-store.js';
import { routeMemoryApi } from '../functions/memory-router.js';
import { createEntry, readSoil, writeSoil } from '../functions/memory-store.js';
import { buildMemoryContext } from '../functions/memory-recall.js';

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

const turn = (id, user, assistant, createdAt, userExtra = {}) => ({
  id,
  user: { active: 0, variants: [{ id: \`${id}-user\`, content: user, created_at: createdAt, ...userExtra }] },
  assistant: {
    activeByUserVariant: { 0: 0 },
    variantsByUserVariant: { 0: [{ id: \`${id}-assistant\`, content: assistant, created_at: createdAt }] },
  },
});

const db = new D1Database();
const originalFetch = globalThis.fetch;
let providerPayloads = [];
let providerContent = JSON.stringify({
  current_text: '默认整理成功',
  hand_seeds_mode: 'keep',
  hand_seeds: [],
  do_not_repeat_mode: 'keep',
  do_not_repeat: '',
  pocket_candidates_mode: 'keep',
  pocket_candidates: [],
});
let providerFinishReason = 'stop';
let providerStatus = 200;

globalThis.fetch = async (input, options = {}) => {
  const url = String(input);
  if (url.includes('/api/v1/chat/completions')) {
    const payload = JSON.parse(options.body);
    providerPayloads.push(payload);
    if (providerStatus !== 200) {
      return new Response(JSON.stringify({ error: { message: 'provider unavailable' } }), { status: providerStatus, headers: { 'Content-Type': 'application/json' } });
    }
    const content = Array.isArray(providerContent) ? providerContent.shift() : providerContent;
    const finishReason = Array.isArray(providerFinishReason) ? providerFinishReason.shift() : providerFinishReason;
    return new Response(JSON.stringify({
      model: payload.model,
      choices: [{ message: { content }, finish_reason: finishReason }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (url.includes('/embeddings')) {
    return new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  throw new Error(\`unexpected fetch: \${url}\`);
};

async function organize(conversationId, trigger = 'reply') {
  const response = await routeMemoryApi(new Request('https://coast.test/api/memory/soil/organize', {
    method: 'POST',
    headers: { Origin: 'https://coast.test', 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversation_id: conversationId, force: true, trigger, settings: { maxHandSeeds: 7 } }),
  }), { COAST_CHAT_DB: db, OPENROUTER_API_KEY: 'test-key' });
  const data = await response.json();
  assert.equal(response.status, 200);
  return data;
}

const landingConversation = await createConversation(db, 'landing incremental');
await writeConversationState(db, landingConversation.id, {
  version: 4,
  turns: [turn(
    'landing-turn',
    '登岛信完整输入标记：黑金夜海与同轨燕鸥',
    '读信回复标记：已经替这封信点灯',
    '2026-07-15T01:00:00.000Z',
    { hidden: true, input_type: 'landing_letter' },
  )],
});
providerPayloads = [];
providerContent = JSON.stringify({
  current_text: '登岛信开场已经完成',
  hand_seeds_mode: 'clear',
  hand_seeds: [],
  do_not_repeat_mode: 'clear',
  do_not_repeat: '',
  pocket_candidates_mode: 'clear',
  pocket_candidates: [],
});
const landingData = await organize(landingConversation.id, 'landing');
assert.equal(landingData.soil.current_text, '登岛信开场已经完成');
assert.match(providerPayloads.at(-1).messages[0].content, /登岛信完整输入标记/);
assert.match(providerPayloads.at(-1).messages[0].content, /读信回复标记/);

const conversation = await createConversation(db, 'incremental long window');
const turns = [turn(
  'hidden-landing',
  '不应进入普通 reply 的登岛信标记',
  '不应进入普通 reply 的读信回复标记',
  '2026-07-15T01:00:00.000Z',
  { hidden: true, input_type: 'landing_letter' },
)];
for (let index = 0; index < 100; index += 1) {
  turns.push(turn(
    \`visible-\${index}\`,
    \`第\${index}轮用户 \${index === 98 ? 'previous-visible-marker ' : ''}\${index === 99 ? 'latest-visible-user-marker ' : ''}\${'甲'.repeat(1800)}\`,
    \`第\${index}轮助手 \${index === 98 ? 'previous-visible-assistant-marker ' : ''}\${index === 99 ? 'latest-visible-assistant-marker ' : ''}\${'乙'.repeat(1800)}\`,
    \`2026-07-15T02:\${String(index).padStart(2, '0')}:00.000Z\`,
  ));
}
await writeConversationState(db, conversation.id, { version: 4, turns });
await writeSoil(db, conversation.id, {
  current_text: '上一版 current_text 里仍悬着的线索：老英国人假胡子与保底纸条。',
  hand_seeds: [{ name: '旧手持', life_core: '旧手持种应该进入增量整理输入', usage_hint: '', avoid_hint: '' }],
  do_not_repeat: '旧勿复读应该进入增量整理输入',
  pocket_candidates: [{
    candidate_id: 'old-candidate',
    title: '旧候选',
    life_core: '旧候选只作为工作台纸条输入',
    content: '候选内容',
    usage_hint: '',
    avoid_hint: '',
    source_refs: [{ turn_id: 'visible-98', role: 'turn' }],
    source_excerpt: 'previous-visible-marker',
  }],
  manual_locked: false,
  auto_refresh_enabled: true,
});
providerPayloads = [];
providerContent = JSON.stringify({
  current_text: '滚动承接最新一轮',
  hand_seeds_mode: 'keep',
  hand_seeds: [],
  do_not_repeat_mode: 'keep',
  do_not_repeat: '',
  pocket_candidates_mode: 'clear',
  pocket_candidates: [],
});
const replyData = await organize(conversation.id, 'reply');
const replyPrompt = providerPayloads.at(-1).messages[0].content;
assert.equal(replyData.soil.current_text, '滚动承接最新一轮');
assert.equal((await readSoil(db, conversation.id)).organized_through_turn_id, 'visible-99');
assert.match(replyPrompt, /reply_incremental/);
assert.match(replyPrompt, /上一版 current_text 里仍悬着的线索/);
assert.match(replyPrompt, /latest-visible-user-marker/);
assert.match(replyPrompt, /latest-visible-assistant-marker/);
assert.match(replyPrompt, /previous-visible-marker/);
assert.doesNotMatch(replyPrompt, /不应进入普通 reply 的登岛信标记/);
assert.doesNotMatch(replyPrompt, /第0轮用户/);
assert.ok(replyPrompt.length < 30000, 'the 100th-turn soil prompt must remain bounded instead of growing with deep history');
assert.equal(providerPayloads.at(-1).max_completion_tokens, 3200);

const successCursor = (await readSoil(db, conversation.id)).organized_through_turn_id;
turns.push(turn('visible-100', 'degraded-missed-user-marker', 'degraded-missed-assistant-marker', '2026-07-15T03:40:00.000Z'));
await writeConversationState(db, conversation.id, { version: 4, turns });
providerPayloads = [];
providerContent = '这次不是 JSON';
const degradedData = await organize(conversation.id, 'reply');
assert.equal(degradedData.degraded, true);
const degradedSoil = await readSoil(db, conversation.id);
assert.equal(degradedSoil.organized_through_turn_id, successCursor, 'degraded fallback must not advance the successful cursor');
assert.match(degradedSoil.current_text, /degraded-missed-user-marker/);

turns.push(turn('visible-101', 'latest-after-degraded-user-marker', 'latest-after-degraded-assistant-marker', '2026-07-15T03:41:00.000Z'));
await writeConversationState(db, conversation.id, { version: 4, turns });
providerPayloads = [];
providerContent = JSON.stringify({
  current_text: '补读失败轮后继续承接',
  hand_seeds_mode: 'keep',
  hand_seeds: [],
  do_not_repeat_mode: 'keep',
  do_not_repeat: '',
  pocket_candidates_mode: 'clear',
  pocket_candidates: [],
});
const afterDegradedData = await organize(conversation.id, 'reply');
const afterDegradedPrompt = providerPayloads.at(-1).messages[0].content;
assert.equal(afterDegradedData.soil.current_text, '补读失败轮后继续承接');
assert.equal((await readSoil(db, conversation.id)).organized_through_turn_id, 'visible-101');
assert.match(afterDegradedPrompt, /degraded-missed-user-marker/, 'the next successful organize should see the missed visible turn after the old cursor');
assert.match(afterDegradedPrompt, /latest-after-degraded-user-marker/);

providerPayloads = [];
providerContent = [
  '第一次不是合法 JSON',
  JSON.stringify({
    current_text: '重试仍正常',
    hand_seeds_mode: 'keep',
    hand_seeds: [],
    do_not_repeat_mode: 'keep',
    do_not_repeat: '',
    pocket_candidates_mode: 'clear',
    pocket_candidates: [],
  }),
];
const retryData = await organize(conversation.id, 'reply');
assert.equal(Boolean(retryData.degraded), false);
assert.equal(providerPayloads.length, 2, 'invalid JSON should retry exactly once');
assert.match(providerPayloads[1].messages[0].content, /上一次输出不是合法 JSON/);

const seedConversation = await createConversation(db, 'seed recall regression');
await createEntry(db, {
  entry_type: 'seed',
  scope: 'conversation',
  conversation_id: seedConversation.id,
  title: '同轨燕鸥召回种',
  life_core: '同轨燕鸥围绕海岸飞行，而不是把深历史塞回 current_text。',
  content: '窗口种子应继续由语义召回系统负责。',
  usage_hint: '再次谈到同轨与海岸时召回。',
  avoid_hint: '',
});
const memoryContext = await buildMemoryContext(db, seedConversation.id, '同轨燕鸥和海岸怎么重新回来？', { limit: 3 });
assert.ok(memoryContext.entries.some((entry) => entry.life_core.includes('同轨燕鸥')), 'conversation seed semantic recall must still work');

globalThis.fetch = originalFetch;
console.log('soil-incremental: ok');
`;
await write('tests/soil-incremental.test.mjs', incrementalTest);

let pkg = await read('package.json');
pkg = replace(
  pkg,
  'node tests/memory.test.mjs && node tests/provenance.test.mjs',
  'node tests/memory.test.mjs && node tests/soil-incremental.test.mjs && node tests/provenance.test.mjs',
  'package test includes soil incremental test',
);
await write('package.json', pkg);

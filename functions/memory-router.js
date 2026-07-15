import { ChatStoreError, readConversationState, readProfile, sanitizeId } from './chat-store.js';
import {
  deleteEntryVector,
  deletePocketVectors,
  syncEntryVector,
  syncPocketVectors,
  vectorStatus,
} from './embedding.js';
import { apiError, json, readJson } from './http.js';
import { buildMemoryContext, searchMemory } from './memory-recall.js';
import { soilSettings } from './memory-config.js';
import {
  MEMORY_OWNER_ID,
  MemoryStoreError,
  createEntry,
  createPocket,
  deleteEntry,
  deletePocket,
  getEntry,
  getPocket,
  hasMemoryDatabase,
  listEntries,
  listPockets,
  normalizeHandSeeds,
  normalizePocketCandidates,
  patchEntry,
  patchPocket,
  readSoil,
  resolvePocket,
  upsertSoilPocketCandidates,
  writeSoil,
} from './memory-store.js';
import { ModelRequestError, performFormalChat } from './models.js';
import {
  decoratePocketProvenance,
  decoratePocketsProvenance,
  decorateSoilProvenance,
  saveGenerationProvenance,
} from './provenance-store.js';

const MEMORY_PATH = '/api/memory';
const BODY_LIMIT = 48 * 1024;
const SOIL_RECENT_TURNS = 12;
const SOIL_FULL_RECENT_TURNS = 3;
const SOIL_FIELD_CHARS = 6000;
const SOIL_PROMPT_TOTAL_CHARS = 64 * 1024;
const SOIL_ORGANIZE_MAX_TOKENS = 3200;

const SOIL_RESPONSE_FORMAT = Object.freeze({
  type: 'json_schema',
  json_schema: Object.freeze({
    name: 'thought_soil',
    strict: true,
    schema: Object.freeze({
      type: 'object',
      additionalProperties: false,
      properties: Object.freeze({
        current_text: Object.freeze({ type: 'string' }),
        hand_seeds_mode: Object.freeze({ type: 'string', enum: ['replace', 'keep', 'clear'] }),
        hand_seeds: Object.freeze({
          type: 'array',
          items: Object.freeze({
            type: 'object',
            additionalProperties: false,
            properties: Object.freeze({
              name: Object.freeze({ type: 'string' }),
              life_core: Object.freeze({ type: 'string' }),
              usage_hint: Object.freeze({ type: 'string' }),
              avoid_hint: Object.freeze({ type: 'string' }),
            }),
            required: ['name', 'life_core', 'usage_hint', 'avoid_hint'],
          }),
        }),
        do_not_repeat_mode: Object.freeze({ type: 'string', enum: ['replace', 'keep', 'clear'] }),
        do_not_repeat: Object.freeze({ type: 'string' }),
        pocket_candidates_mode: Object.freeze({ type: 'string', enum: ['replace', 'keep', 'clear'] }),
        pocket_candidates: Object.freeze({
          type: 'array',
          items: Object.freeze({
            type: 'object',
            additionalProperties: false,
            properties: Object.freeze({
              candidate_id: Object.freeze({ type: 'string' }),
              title: Object.freeze({ type: 'string' }),
              life_core: Object.freeze({ type: 'string' }),
              content: Object.freeze({ type: 'string' }),
              usage_hint: Object.freeze({ type: 'string' }),
              avoid_hint: Object.freeze({ type: 'string' }),
              source_refs: Object.freeze({
                type: 'array',
                items: Object.freeze({
                  type: 'object',
                  additionalProperties: false,
                  properties: Object.freeze({
                    turn_id: Object.freeze({ type: 'string' }),
                    role: Object.freeze({ type: 'string', enum: ['user', 'assistant', 'turn'] }),
                  }),
                  required: ['turn_id', 'role'],
                }),
              }),
              source_excerpt: Object.freeze({ type: 'string' }),
            }),
            required: ['candidate_id', 'title', 'life_core', 'content', 'usage_hint', 'avoid_hint', 'source_refs', 'source_excerpt'],
          }),
        }),
      }),
      required: [
        'current_text',
        'hand_seeds_mode',
        'hand_seeds',
        'do_not_repeat_mode',
        'do_not_repeat',
        'pocket_candidates_mode',
        'pocket_candidates',
      ],
    }),
  }),
});

function methodNotAllowed(allow) {
  return apiError('method_not_allowed', 'Method not allowed.', 405, { allow });
}

async function body(request) {
  try {
    return await readJson(request, BODY_LIMIT);
  } catch (error) {
    if (error.message === 'body_too_large') throw new MemoryStoreError('body_too_large', '请求体过大。', 413);
    throw new MemoryStoreError('invalid_request', '请求体不是有效的 JSON。', 400);
  }
}

function conversationIdFrom(url, value = {}) {
  return sanitizeId(value.conversation_id || url.searchParams.get('conversation_id') || '', 'conversation');
}

function activeBranch(turn = {}) {
  const userVariants = Array.isArray(turn?.user?.variants) ? turn.user.variants : [];
  const userIndex = Math.min(Math.max(0, Number(turn?.user?.active || 0)), Math.max(0, userVariants.length - 1));
  const assistants = turn?.assistant?.variantsByUserVariant?.[String(userIndex)] || [];
  const assistantIndex = Math.min(
    Math.max(0, Number(turn?.assistant?.activeByUserVariant?.[String(userIndex)] || 0)),
    Math.max(0, assistants.length - 1),
  );
  return {
    turn_id: String(turn.id || ''),
    user: userVariants[userIndex] || null,
    assistant: assistants[assistantIndex] || null,
  };
}

function completedTurns(state) {
  return (Array.isArray(state?.turns) ? state.turns : [])
    .map(activeBranch)
    .filter((branch) => branch.user?.content
      && branch.assistant?.content
      && branch.assistant.content !== '正在连接当前模型……');
}

function parseStrictJson(value) {
  const text = String(value || '').trim();
  const candidates = [text];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1]?.trim();
  if (fenced && fenced !== text) candidates.unshift(fenced);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {
      // Some providers wrap an otherwise valid JSON object in a short preface.
    }
  }

  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== '{') continue;
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const character = text[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === '"') quoted = false;
        continue;
      }
      if (character === '"') quoted = true;
      else if (character === '{') depth += 1;
      else if (character === '}') {
        depth -= 1;
        if (depth !== 0) continue;
        try {
          const parsed = JSON.parse(text.slice(start, index + 1));
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
        } catch {
          break;
        }
      }
    }
  }
  throw new MemoryStoreError('soil_organize_invalid', '思维壤整理结果格式无效。', 502);
}

function normalizeSoilMode(value) {
  const mode = String(value || '').trim().toLowerCase();
  return ['replace', 'keep', 'clear'].includes(mode) ? mode : '';
}

function fallbackCurrentText(turns, landing) {
  const latest = turns.at(-1);
  if (landing || latest?.user?.hidden || latest?.user?.input_type === 'landing_letter') {
    return '登岛信开场已经完成，正在承接这封信与刚刚的读信回复。';
  }
  const source = String(latest?.user?.content || '').replace(/\s+/g, ' ').trim();
  const preview = Array.from(source).slice(0, 72).join('');
  return preview
    ? `刚刚完成了一轮对话，当前正在承接：${preview}${Array.from(source).length > 72 ? '…' : ''}`
    : '刚刚完成了一轮对话，正在承接当前主题与下一步。';
}

function clipSoilContent(value, max = SOIL_FIELD_CHARS) {
  return Array.from(String(value || '')).slice(0, Math.max(0, max)).join('');
}

function soilPromptTurns(turns) {
  const recent = turns.slice(-SOIL_RECENT_TURNS).map((branch, index) => ({
    turn: index + 1,
    turn_id: branch.turn_id,
    user: {
      message_id: String(branch.user.id || ''),
      content: clipSoilContent(branch.user.content),
    },
    assistant: {
      message_id: String(branch.assistant.id || ''),
      content: clipSoilContent(branch.assistant.content),
    },
  }));

  if (JSON.stringify(recent).length <= SOIL_PROMPT_TOTAL_CHARS) return recent;

  const protectedStart = Math.max(0, recent.length - SOIL_FULL_RECENT_TURNS);
  const protectedLength = JSON.stringify(recent.slice(protectedStart)).length;
  const olderFields = Math.max(1, protectedStart * 2);
  const olderLimit = Math.max(800, Math.floor((SOIL_PROMPT_TOTAL_CHARS - protectedLength - 2048) / olderFields));
  for (let index = 0; index < protectedStart; index += 1) {
    recent[index].user.content = clipSoilContent(recent[index].user.content, olderLimit);
    recent[index].assistant.content = clipSoilContent(recent[index].assistant.content, olderLimit);
  }
  if (JSON.stringify(recent).length <= SOIL_PROMPT_TOTAL_CHARS) return recent;

  for (let index = 0; index < protectedStart; index += 1) {
    recent[index].user.content = clipSoilContent(recent[index].user.content, 400);
    recent[index].assistant.content = clipSoilContent(recent[index].assistant.content, 400);
  }
  return recent;
}

function soilPrompt(turns, oldSoil, maxHandSeeds) {
  const recent = soilPromptTurns(turns);
  return `你只负责整理当前对话的一小捧“思维壤”。它是当前窗口的工作台小纸条，不是永久档案馆，不是长期记忆，也不是思考过程。
请只返回一个 JSON 对象，不要 Markdown，不要解释：
{
  "current_text": "现在正在聊什么，简短",
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
    "source_refs": [{"turn_id":"从最近完成轮中原样选择","role":"user|assistant|turn"}],
    "source_excerpt": "帮助辨认来源的短摘录"
  }]
}

mode 含义：
- replace：使用你本轮返回的新纸条。旧纸条可以退出、被改写、合并或替换；新内容比旧内容少也没关系。
- keep：这一栏原样保留旧思维壤。
- clear：你明确判断这一栏已经过时、重复、已经落袋或不再适合当前窗口，因此清空这一栏。
不要把空数组或空字符串当作失败占位。如果你确实要清空，请使用 clear mode；如果你没有要改这一栏，请使用 keep mode。

hand_seeds 不是永久收藏夹，而是“此刻最值得手持”的最多 ${maxHandSeeds} 粒。每轮都可以保留仍有用的旧种、删除过时旧种、替换旧种、合并重复旧种、改写旧种或加入新种。满 ${maxHandSeeds} 粒时主动做取舍。不要因为旧思维壤里已经有旧种就机械保留，也不要害怕让旧纸条退出手持。
do_not_repeat 也只是当前窗口的工作提醒。已经不再需要防复读的提醒可以改写、合并或 clear。
pocket_candidates 只放“现在不用、但仍有再生力”的内容，并使用上方真实 turn_id。旧候选会由系统先 upsert 到 pending；已经进入 pending、已经落袋或已经不适合当前窗口的候选可以从思维壤展示层退出，不要为了保留展示而反复挂在手上。当前确实没有候选时使用 pocket_candidates_mode=clear。

你只能整理 current_text、hand_seeds、do_not_repeat、pocket_candidates 这四块临时工作台内容。不要创建或删除长期记忆，不要删除聊天记录、pending pocket、confirmed pocket、seed、memory 或向量索引中的已确认内容；不要判断 core，不要把候选升级为 seed 或 memory，不要替用户做决定，不要复述整段聊天。

旧思维壤：
${JSON.stringify({
    current_text: oldSoil.current_text,
    hand_seeds: oldSoil.hand_seeds,
    do_not_repeat: oldSoil.do_not_repeat,
    pocket_candidates: oldSoil.pocket_candidates,
  })}

最近完成的对话轮：
${JSON.stringify(recent)}`;
}

async function soil(request, env, url) {
  const conversationId = conversationIdFrom(url);
  if (request.method === 'GET') {
    const value = await readSoil(env.COAST_CHAT_DB, conversationId);
    return json({ ok: true, soil: await decorateSoilProvenance(env.COAST_CHAT_DB, value) });
  }
  if (request.method === 'PUT') {
    const value = await body(request);
    const written = await writeSoil(env.COAST_CHAT_DB, conversationId, value);
    return json({ ok: true, soil: await decorateSoilProvenance(env.COAST_CHAT_DB, written) });
  }
  return methodNotAllowed('GET, PUT');
}

async function organizeSoil(request, env) {
  if (request.method !== 'POST') return methodNotAllowed('POST');
  const value = await body(request);
  const conversationId = conversationIdFrom(new URL(request.url), value);
  const landing = value.trigger === 'landing';
  const reply = value.trigger === 'reply';
  const force = value.force === true || reply;
  const requestedModel = String(value.model || '').trim().slice(0, 180);
  const settings = soilSettings(value.settings || {});
  const oldSoil = await decorateSoilProvenance(
    env.COAST_CHAT_DB,
    await readSoil(env.COAST_CHAT_DB, conversationId),
  );
  if (oldSoil.manual_locked) {
    return json({ ok: true, skipped: true, reason: 'manual_locked', soil: oldSoil });
  }
  if ((landing || reply) && !oldSoil.auto_refresh_enabled) {
    return json({ ok: true, skipped: true, reason: 'auto_refresh_disabled', soil: oldSoil });
  }
  if (!force && !oldSoil.auto_refresh_enabled) {
    return json({ ok: true, skipped: true, reason: 'auto_refresh_disabled', soil: oldSoil });
  }

  const state = await readConversationState(env.COAST_CHAT_DB, conversationId);
  const turns = completedTurns(state);
  if (!turns.length) return json({ ok: true, skipped: true, reason: 'no_completed_turns', soil: oldSoil });
  const scheduledTurn = landing
    || reply
    || turns.length === 1
    || (turns.length - 1) % settings.autoRefreshEveryTurns === 0;
  const latestAssistantAt = Date.parse(turns.at(-1)?.assistant?.created_at || '');
  const soilUpdatedAt = Date.parse(oldSoil.updated_at || '');
  if (!force && (!scheduledTurn || (oldSoil.revision > 1 && Number.isFinite(latestAssistantAt) && soilUpdatedAt >= latestAssistantAt))) {
    return json({ ok: true, skipped: true, reason: 'not_due', soil: oldSoil });
  }

  const fallback = fallbackCurrentText(turns, landing);
  let organized;
  let organizedBy = null;
  let degradedReason = '';
  try {
    const profile = await readProfile(env.COAST_CHAT_DB);
    const modelId = requestedModel || profile.current_chat_model || 'openai/gpt-4.1-nano';
    const basePrompt = soilPrompt(turns, oldSoil, settings.maxHandSeeds);
    let lastJsonError = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const result = await performFormalChat(env, {
          model: modelId,
          messages: [{
            role: 'user',
            content: attempt === 0
              ? basePrompt
              : basePrompt + '\n\n上一次输出不是合法 JSON。请只返回一个完整 JSON 对象，不要 Markdown，不要解释，不要省略字段。',
          }],
          settings: { max_tokens: SOIL_ORGANIZE_MAX_TOKENS, temperature: 0.2 },
          response_format: SOIL_RESPONSE_FORMAT,
          reasoning: { effort: 'minimal', exclude: true },
        });
        if (result?.finish_reason === 'length') {
          throw new MemoryStoreError('soil_organize_truncated', '思维壤整理结果被模型长度上限截断。', 502);
        }
        organized = parseStrictJson(result?.message?.content);
        organizedBy = {
          model_id: result?.model || modelId,
          usage: result?.usage || null,
          generation_source: 'soil',
          generated_at: Date.now(),
        };
        lastJsonError = null;
        break;
      } catch (error) {
        if (!(error instanceof MemoryStoreError && String(error.type || '').startsWith('soil_organize_'))) throw error;
        lastJsonError = error;
        if (attempt === 1) throw error;
      }
    }
    if (!organized && lastJsonError) throw lastJsonError;
  } catch (error) {
    if (!(error instanceof ModelRequestError)
      && !(error instanceof MemoryStoreError && String(error.type || '').startsWith('soil_organize_'))) throw error;
    console.error('[memory:soil-organize]', error);
    degradedReason = error.type || 'soil_organize_failed';
    const degradedSoil = await writeSoil(env.COAST_CHAT_DB, conversationId, {
      current_text: fallback,
      hand_seeds: oldSoil.hand_seeds,
      do_not_repeat: oldSoil.do_not_repeat,
      pocket_candidates: oldSoil.pocket_candidates,
      manual_locked: oldSoil.manual_locked,
      auto_refresh_enabled: oldSoil.auto_refresh_enabled,
    }, { automatic: true });
    return json({
      ok: true,
      degraded: true,
      reason: degradedReason,
      soil: await decorateSoilProvenance(env.COAST_CHAT_DB, degradedSoil),
      pocket_sync: null,
    });
  }
  const latestTurn = turns.at(-1);
  const allowedTurnIds = new Set(turns.map((turn) => turn.turn_id).filter(Boolean));
  const fallbackExcerpt = [latestTurn?.user?.content, latestTurn?.assistant?.content]
    .map((part) => String(part || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean).join(' / ').slice(0, 360);
  const handSeedsMode = normalizeSoilMode(organized.hand_seeds_mode);
  const doNotRepeatMode = normalizeSoilMode(organized.do_not_repeat_mode);
  const pocketCandidatesMode = normalizeSoilMode(organized.pocket_candidates_mode);
  const organizedHandSeeds = normalizeHandSeeds(organized.hand_seeds).slice(0, settings.maxHandSeeds);
  const organizedDoNotRepeat = String(organized.do_not_repeat || '').trim();
  const organizedPocketCandidates = normalizePocketCandidates(organized.pocket_candidates, {
    allowedTurnIds,
    fallbackSourceRef: latestTurn?.turn_id ? { turn_id: latestTurn.turn_id, role: 'turn' } : null,
    fallbackExcerpt,
  });
  const soilValue = {
    current_text: String(organized.current_text || '').trim()
      || fallback,
    hand_seeds: handSeedsMode === 'replace'
      ? organizedHandSeeds
      : handSeedsMode === 'keep'
        ? oldSoil.hand_seeds
        : handSeedsMode === 'clear'
          ? []
          : organizedHandSeeds.length ? organizedHandSeeds : oldSoil.hand_seeds,
    do_not_repeat: doNotRepeatMode === 'replace'
      ? organizedDoNotRepeat
      : doNotRepeatMode === 'keep'
        ? oldSoil.do_not_repeat
        : doNotRepeatMode === 'clear'
          ? ''
          : organizedDoNotRepeat || oldSoil.do_not_repeat,
    pocket_candidates: pocketCandidatesMode === 'replace'
      ? organizedPocketCandidates
      : pocketCandidatesMode === 'keep'
        ? oldSoil.pocket_candidates
        : pocketCandidatesMode === 'clear'
          ? []
          : organizedPocketCandidates.length ? organizedPocketCandidates : oldSoil.pocket_candidates,
    manual_locked: oldSoil.manual_locked,
    auto_refresh_enabled: oldSoil.auto_refresh_enabled,
  };
  const previousPocketSync = degradedReason
    ? null
    : await upsertSoilPocketCandidates(env.COAST_CHAT_DB, conversationId, oldSoil.pocket_candidates);
  let writtenSoil = await writeSoil(env.COAST_CHAT_DB, conversationId, soilValue, { automatic: true });
  if (organizedBy) {
    await saveGenerationProvenance(env.COAST_CHAT_DB, 'soil', conversationId, organizedBy);
    writtenSoil = await decorateSoilProvenance(env.COAST_CHAT_DB, writtenSoil);
  }
  const currentPocketSync = degradedReason
    ? null
    : await upsertSoilPocketCandidates(env.COAST_CHAT_DB, conversationId, writtenSoil.pocket_candidates);
  if (organizedBy && currentPocketSync) {
    await Promise.all((currentPocketSync.pockets || [])
      .filter((pocket) => pocket?.id && pocket?.source_type === 'soil' && pocket?.status === 'pending')
      .map((pocket) => saveGenerationProvenance(env.COAST_CHAT_DB, 'pocket', pocket.id, organizedBy)));
    currentPocketSync.pockets = await decoratePocketsProvenance(env.COAST_CHAT_DB, currentPocketSync.pockets);
  }
  const syncedPockets = new Map();
  for (const pocket of [...(previousPocketSync?.pockets || []), ...(currentPocketSync?.pockets || [])]) {
    if (pocket?.id) syncedPockets.set(pocket.id, pocket);
  }
  const pocketSync = previousPocketSync && currentPocketSync ? {
    created: previousPocketSync.created + currentPocketSync.created,
    updated: previousPocketSync.updated + currentPocketSync.updated,
    suppressed: previousPocketSync.suppressed + currentPocketSync.suppressed,
    pockets: [...syncedPockets.values()],
  } : null;
  return json({
    ok: true,
    degraded: Boolean(degradedReason),
    reason: degradedReason,
    soil: writtenSoil,
    ...(pocketSync ? { pocket_sync: pocketSync } : {}),
  });
}

async function pockets(request, env, url) {
  const suffix = decodeURIComponent(url.pathname.slice(`${MEMORY_PATH}/pockets`.length).replace(/^\//, ''));
  if (!suffix) {
    if (request.method === 'GET') {
      const conversationId = conversationIdFrom(url);
      const values = await listPockets(env.COAST_CHAT_DB, {
        conversation_id: conversationId,
        status: url.searchParams.get('status') || 'pending',
      });
      return json({ ok: true, pockets: await decoratePocketsProvenance(env.COAST_CHAT_DB, values) });
    }
    if (request.method === 'POST') return json({ ok: true, pocket: await createPocket(env.COAST_CHAT_DB, await body(request)) }, 201);
    return methodNotAllowed('GET, POST');
  }
  const parts = suffix.split('/');
  const pocketId = sanitizeId(parts[0], 'pocket');
  if (parts[1] === 'resolve') {
    if (request.method !== 'POST') return methodNotAllowed('POST');
    const result = await resolvePocket(env.COAST_CHAT_DB, pocketId, await body(request));
    if (result.entry) result.entry = (await syncEntryVector(env, env.COAST_CHAT_DB, result.entry)).entry;
    if (result.pocket?.status === 'confirmed' && !result.entry) {
      result.pocket = (await syncPocketVectors(env, env.COAST_CHAT_DB, result.pocket)).pocket;
    }
    result.pocket = await decoratePocketProvenance(env.COAST_CHAT_DB, result.pocket);
    return json({ ok: true, ...result });
  }
  if (request.method === 'PATCH') {
    let pocket = await patchPocket(env.COAST_CHAT_DB, pocketId, await body(request));
    if (pocket.status !== 'pending') pocket = (await syncPocketVectors(env, env.COAST_CHAT_DB, pocket)).pocket;
    return json({ ok: true, pocket: await decoratePocketProvenance(env.COAST_CHAT_DB, pocket) });
  }
  if (request.method === 'DELETE') {
    const current = await getPocket(env.COAST_CHAT_DB, pocketId);
    const vector = await deletePocketVectors(env, current);
    return json({ ok: true, pocket: await deletePocket(env.COAST_CHAT_DB, pocketId), vector, deleted: true });
  }
  return methodNotAllowed('PATCH, DELETE');
}

async function entries(request, env, url) {
  const suffix = decodeURIComponent(url.pathname.slice(`${MEMORY_PATH}/entries`.length).replace(/^\//, ''));
  if (!suffix) {
    if (request.method === 'GET') {
      const result = await listEntries(env.COAST_CHAT_DB, {
        conversation_id: url.searchParams.get('conversation_id') || '',
        entry_type: url.searchParams.get('entry_type') || '',
        scope: url.searchParams.get('scope') || '',
        status: url.searchParams.get('status') || '',
        q: url.searchParams.get('q') || '',
        limit: url.searchParams.get('limit') || '',
        cursor: url.searchParams.get('cursor') || '',
      });
      return json({ ok: true, ...result });
    }
    if (request.method === 'POST') {
      const entry = await createEntry(env.COAST_CHAT_DB, await body(request));
      return json({ ok: true, entry: (await syncEntryVector(env, env.COAST_CHAT_DB, entry)).entry }, 201);
    }
    return methodNotAllowed('GET, POST');
  }
  const entryId = sanitizeId(suffix.split('/')[0], 'memory');
  if (request.method === 'GET') return json({ ok: true, entry: await getEntry(env.COAST_CHAT_DB, entryId) });
  if (request.method === 'PATCH') {
    const result = await patchEntry(env.COAST_CHAT_DB, entryId, await body(request));
    result.entry = (await syncEntryVector(env, env.COAST_CHAT_DB, result.entry)).entry;
    return json({ ok: true, ...result });
  }
  if (request.method === 'DELETE') {
    const entry = await deleteEntry(env.COAST_CHAT_DB, entryId);
    const vector = await deleteEntryVector(env, entry);
    return json({ ok: true, entry, vector, deleted: true });
  }
  return methodNotAllowed('GET, PATCH, DELETE');
}

async function search(request, env) {
  if (request.method !== 'POST') return methodNotAllowed('POST');
  return json({ ok: true, ...await searchMemory(env, MEMORY_OWNER_ID, await body(request)) });
}

async function recall(request, env) {
  if (request.method !== 'POST') return methodNotAllowed('POST');
  const value = await body(request);
  const conversationId = sanitizeId(value.conversation_id || '', 'conversation');
  const result = await buildMemoryContext(env, MEMORY_OWNER_ID, conversationId, value.query || '', {
    recent_entry_ids: value.recent_entry_ids,
    mode: value.mode || 'chat',
    settings: value.settings,
    conversation_turns: value.conversation_turns,
  });
  return json({
    ok: true,
    conversation_seeds: result.conversation_seeds,
    global_seeds: result.global_seeds,
    conversation_memories: result.conversation_memories,
    global_memories: result.global_memories,
    conversation_pockets: result.conversation_pockets,
    global_pockets: result.global_pockets,
    trace: result.trace,
  });
}

export function isMemoryApiPath(pathname) {
  return pathname === `${MEMORY_PATH}/soil`
    || pathname === `${MEMORY_PATH}/soil/organize`
    || pathname === `${MEMORY_PATH}/pockets`
    || pathname.startsWith(`${MEMORY_PATH}/pockets/`)
    || pathname === `${MEMORY_PATH}/entries`
    || pathname.startsWith(`${MEMORY_PATH}/entries/`)
    || pathname === `${MEMORY_PATH}/search`
    || pathname === `${MEMORY_PATH}/recall`
    || pathname === `${MEMORY_PATH}/vector-status`;
}

export async function routeMemoryApi(request, env) {
  if (!hasMemoryDatabase(env)) return apiError('memory_db_not_configured', '记忆 D1 存储未配置。', 503);
  const url = new URL(request.url);
  try {
    if (url.pathname === `${MEMORY_PATH}/soil`) return await soil(request, env, url);
    if (url.pathname === `${MEMORY_PATH}/soil/organize`) return await organizeSoil(request, env);
    if (url.pathname === `${MEMORY_PATH}/search`) return await search(request, env);
    if (url.pathname === `${MEMORY_PATH}/recall`) return await recall(request, env);
    if (url.pathname === `${MEMORY_PATH}/vector-status`) {
      if (request.method !== 'GET') return methodNotAllowed('GET');
      return json({ ok: true, ...await vectorStatus(env) });
    }
    if (url.pathname === `${MEMORY_PATH}/pockets` || url.pathname.startsWith(`${MEMORY_PATH}/pockets/`)) {
      return await pockets(request, env, url);
    }
    return await entries(request, env, url);
  } catch (error) {
    if (error instanceof MemoryStoreError || error instanceof ChatStoreError || error instanceof ModelRequestError) {
      return apiError(error.type, error.message, error.status, error.details || {});
    }
    const reference = crypto.randomUUID().slice(0, 8);
    console.error(`[memory-api:${reference}]`, error);
    return apiError('memory_store_failed', `记忆操作失败（${reference}）。`, 500);
  }
}

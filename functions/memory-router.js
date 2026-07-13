import { ChatStoreError, readConversationState, readProfile, sanitizeId } from './chat-store.js';
import { apiError, json, readJson } from './http.js';
import {
  MemoryStoreError,
  createEntry,
  createPocket,
  deleteEntry,
  deletePocket,
  getEntry,
  hasMemoryDatabase,
  listEntries,
  listPockets,
  normalizeHandSeeds,
  patchEntry,
  patchPocket,
  readSoil,
  resolvePocket,
  writeSoil,
} from './memory-store.js';
import { ModelRequestError, performFormalChat } from './models.js';

const MEMORY_PATH = '/api/memory';
const BODY_LIMIT = 48 * 1024;

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
  return { user: userVariants[userIndex] || null, assistant: assistants[assistantIndex] || null };
}

function completedTurns(state) {
  return (Array.isArray(state?.turns) ? state.turns : [])
    .map(activeBranch)
    .filter((branch) => branch.user?.content && branch.assistant?.content);
}

function parseStrictJson(value) {
  const text = String(value || '').trim();
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1] || text;
  try {
    const parsed = JSON.parse(fenced);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not_object');
    return parsed;
  } catch {
    throw new MemoryStoreError('soil_organize_invalid', '思维壤整理结果格式无效，原内容未改动。', 502);
  }
}

function soilPrompt(turns, oldSoil) {
  const recent = turns.slice(-8).map((branch, index) => ({
    turn: index + 1,
    user: String(branch.user.content || '').slice(0, 3000),
    assistant: String(branch.assistant.content || '').slice(0, 3000),
  }));
  return `你只负责整理当前对话的一小捧“思维壤”，不是总结长期记忆，也不是输出思考过程。
请只返回一个 JSON 对象，不要 Markdown，不要解释：
{
  "current_text": "现在正在聊什么，简短",
  "hand_seeds": [{"name":"名称","life_core":"生命核","usage_hint":"何时可用","avoid_hint":"如何避免复读"}],
  "do_not_repeat": "已经确认、不应重复铺陈的内容",
  "pocket_candidates": ["暂时不用但还有再生力的小东西"]
}
hand_seeds 最多 7 粒。不要创建长期记忆，不要替用户做决定，不要复述整段聊天。

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
  if (request.method === 'GET') return json({ ok: true, soil: await readSoil(env.COAST_CHAT_DB, conversationId) });
  if (request.method === 'PUT') {
    const value = await body(request);
    return json({ ok: true, soil: await writeSoil(env.COAST_CHAT_DB, conversationId, value) });
  }
  return methodNotAllowed('GET, PUT');
}

async function organizeSoil(request, env) {
  if (request.method !== 'POST') return methodNotAllowed('POST');
  const value = await body(request);
  const conversationId = conversationIdFrom(new URL(request.url), value);
  const force = value.force === true;
  const oldSoil = await readSoil(env.COAST_CHAT_DB, conversationId);
  if (!force && oldSoil.manual_locked) throw new MemoryStoreError('soil_locked', '思维壤已由小寒手动锁定。', 409);
  if (!force && !oldSoil.auto_refresh_enabled) {
    return json({ ok: true, skipped: true, reason: 'auto_refresh_disabled', soil: oldSoil });
  }

  const state = await readConversationState(env.COAST_CHAT_DB, conversationId);
  const turns = completedTurns(state);
  if (!turns.length) return json({ ok: true, skipped: true, reason: 'no_completed_turns', soil: oldSoil });
  const scheduledTurn = turns.length === 1 || (turns.length - 1) % 4 === 0;
  const latestAssistantAt = Date.parse(turns.at(-1)?.assistant?.created_at || '');
  const soilUpdatedAt = Date.parse(oldSoil.updated_at || '');
  if (!force && (!scheduledTurn || (oldSoil.revision > 1 && Number.isFinite(latestAssistantAt) && soilUpdatedAt >= latestAssistantAt))) {
    return json({ ok: true, skipped: true, reason: 'not_due', soil: oldSoil });
  }

  const profile = await readProfile(env.COAST_CHAT_DB);
  const result = await performFormalChat(env, {
    model: profile.current_chat_model || 'openai/gpt-4.1-nano',
    messages: [{ role: 'user', content: soilPrompt(turns, oldSoil) }],
    settings: { max_tokens: 900, temperature: 0.2 },
  });
  const organized = parseStrictJson(result?.message?.content);
  const soilValue = {
    current_text: organized.current_text,
    hand_seeds: normalizeHandSeeds(organized.hand_seeds),
    do_not_repeat: organized.do_not_repeat,
    pocket_candidates: organized.pocket_candidates,
    manual_locked: oldSoil.manual_locked,
    auto_refresh_enabled: oldSoil.auto_refresh_enabled,
  };
  return json({ ok: true, soil: await writeSoil(env.COAST_CHAT_DB, conversationId, soilValue) });
}

async function pockets(request, env, url) {
  const suffix = decodeURIComponent(url.pathname.slice(`${MEMORY_PATH}/pockets`.length).replace(/^\//, ''));
  if (!suffix) {
    if (request.method === 'GET') {
      const conversationId = conversationIdFrom(url);
      return json({ ok: true, pockets: await listPockets(env.COAST_CHAT_DB, {
        conversation_id: conversationId,
        status: url.searchParams.get('status') || 'pending',
      }) });
    }
    if (request.method === 'POST') return json({ ok: true, pocket: await createPocket(env.COAST_CHAT_DB, await body(request)) }, 201);
    return methodNotAllowed('GET, POST');
  }
  const parts = suffix.split('/');
  const pocketId = sanitizeId(parts[0], 'pocket');
  if (parts[1] === 'resolve') {
    if (request.method !== 'POST') return methodNotAllowed('POST');
    return json({ ok: true, ...await resolvePocket(env.COAST_CHAT_DB, pocketId, await body(request)) });
  }
  if (request.method === 'PATCH') return json({ ok: true, pocket: await patchPocket(env.COAST_CHAT_DB, pocketId, await body(request)) });
  if (request.method === 'DELETE') return json({ ok: true, pocket: await deletePocket(env.COAST_CHAT_DB, pocketId), deleted: true });
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
    if (request.method === 'POST') return json({ ok: true, entry: await createEntry(env.COAST_CHAT_DB, await body(request)) }, 201);
    return methodNotAllowed('GET, POST');
  }
  const entryId = sanitizeId(suffix.split('/')[0], 'memory');
  if (request.method === 'GET') return json({ ok: true, entry: await getEntry(env.COAST_CHAT_DB, entryId) });
  if (request.method === 'PATCH') return json({ ok: true, ...await patchEntry(env.COAST_CHAT_DB, entryId, await body(request)) });
  if (request.method === 'DELETE') return json({ ok: true, entry: await deleteEntry(env.COAST_CHAT_DB, entryId), deleted: true });
  return methodNotAllowed('GET, PATCH, DELETE');
}

export function isMemoryApiPath(pathname) {
  return pathname === `${MEMORY_PATH}/soil`
    || pathname === `${MEMORY_PATH}/soil/organize`
    || pathname === `${MEMORY_PATH}/pockets`
    || pathname.startsWith(`${MEMORY_PATH}/pockets/`)
    || pathname === `${MEMORY_PATH}/entries`
    || pathname.startsWith(`${MEMORY_PATH}/entries/`);
}

export async function routeMemoryApi(request, env) {
  if (!hasMemoryDatabase(env)) return apiError('memory_db_not_configured', '记忆 D1 存储未配置。', 503);
  const url = new URL(request.url);
  try {
    if (url.pathname === `${MEMORY_PATH}/soil`) return await soil(request, env, url);
    if (url.pathname === `${MEMORY_PATH}/soil/organize`) return await organizeSoil(request, env);
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

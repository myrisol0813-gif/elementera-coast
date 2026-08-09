import { assembleContextForChat } from './context-assembler.js';
import {
  ContextModeError,
  createModeCard,
  getContextState,
  listModeCards,
  setCurrentMode,
  updateModeCard,
} from './context-modes.js';
import {
  WorldbookError,
  createWorldbookEntry,
  deleteWorldbookEntry,
  listWorldbookEntries,
  matchWorldbook,
  updateWorldbookEntry,
} from './context-worldbook.js';
import { apiError, json, readJson } from './http.js';
import { OwnerAccessError, requireOwnerSession } from './owner-access.js';
import { listRegisteredTools } from './tool-registry.js';
import { listToolRuns } from './tool-run-log.js';

const ROOT = '/api/context';
const BODY_LIMIT = 128 * 1024;

function methodNotAllowed(allow) {
  return apiError('method_not_allowed', 'Method not allowed.', 405, { allow });
}

async function body(request) {
  try {
    return await readJson(request, BODY_LIMIT);
  } catch (error) {
    const mapped = new ContextModeError(
      error?.message === 'body_too_large' ? 'body_too_large' : 'invalid_json',
      error?.message === 'body_too_large' ? '上下文请求内容过长。' : '上下文请求不是有效 JSON。',
      error?.status || 400,
    );
    throw mapped;
  }
}

function decoded(value) {
  return decodeURIComponent(value);
}

export function isContextApiPath(pathname) {
  return pathname === ROOT || pathname.startsWith(`${ROOT}/`);
}

export async function routeContextApi(request, env, session = null) {
  if (!env?.COAST_CHAT_DB?.prepare) return apiError('coast_db_not_configured', '海岸 D1 存储未配置。', 503);
  const db = env.COAST_CHAT_DB;
  const url = new URL(request.url);
  try {
    requireOwnerSession(session);
    if (url.pathname === `${ROOT}/worldbook`) {
      if (request.method === 'GET') return json({ ok: true, entries: await listWorldbookEntries(db) });
      if (request.method === 'POST') return json({ ok: true, entry: await createWorldbookEntry(db, await body(request)) }, 201);
      return methodNotAllowed('GET, POST');
    }
    if (url.pathname === `${ROOT}/worldbook/test-match`) {
      if (request.method !== 'POST') return methodNotAllowed('POST');
      const value = await body(request);
      const state = await getContextState(db, { conversation_id: value.conversation_id });
      return json({
        ok: true,
        matches: await matchWorldbook(db, {
          input: value.input,
          messages: value.messages,
          surface: value.surface || 'main_chat',
          worldbook_scope: value.worldbook_scope || state.mode.worldbook_scope,
          limit: value.limit || 6,
        }),
      });
    }
    const worldbookMatch = url.pathname.match(/^\/api\/context\/worldbook\/([^/]+)$/);
    if (worldbookMatch) {
      if (request.method === 'PATCH') return json({ ok: true, entry: await updateWorldbookEntry(db, decoded(worldbookMatch[1]), await body(request)) });
      if (request.method === 'DELETE') return json({ ok: true, entry: await deleteWorldbookEntry(db, decoded(worldbookMatch[1])) });
      return methodNotAllowed('PATCH, DELETE');
    }
    if (url.pathname === `${ROOT}/modes`) {
      if (request.method === 'GET') return json({ ok: true, modes: await listModeCards(db) });
      if (request.method === 'POST') return json({ ok: true, mode: await createModeCard(db, await body(request)) }, 201);
      return methodNotAllowed('GET, POST');
    }
    if (url.pathname === `${ROOT}/modes/current`) {
      if (request.method === 'GET') return json({
        ok: true,
        state: await getContextState(db, { conversation_id: url.searchParams.get('conversation_id') || undefined }),
      });
      if (request.method === 'PATCH') {
        const value = await body(request);
        const current = await getContextState(db, { conversation_id: value.conversation_id });
        return json({
          ok: true,
          state: await setCurrentMode(db, value.mode_key || current.mode.mode_key, {
            conversation_id: value.conversation_id,
            settings: value.settings,
          }),
        });
      }
      return methodNotAllowed('GET, PATCH');
    }
    const modeMatch = url.pathname.match(/^\/api\/context\/modes\/([^/]+)$/);
    if (modeMatch) {
      if (request.method !== 'PATCH') return methodNotAllowed('PATCH');
      return json({ ok: true, mode: await updateModeCard(db, decoded(modeMatch[1]), await body(request)) });
    }
    if (url.pathname === `${ROOT}/tools`) {
      if (request.method !== 'GET') return methodNotAllowed('GET');
      const state = await getContextState(db, { conversation_id: url.searchParams.get('conversation_id') || undefined });
      return json({ ok: true, tools: listRegisteredTools({ permission: 'owner', surface: 'main_chat', mode: state.mode }) });
    }
    if (url.pathname === `${ROOT}/tool-runs`) {
      if (request.method !== 'GET') return methodNotAllowed('GET');
      return json({ ok: true, runs: await listToolRuns(db, {
        limit: url.searchParams.get('limit'),
        status: url.searchParams.get('status'),
        tool_key: url.searchParams.get('tool_key'),
      }) });
    }
    if (url.pathname === `${ROOT}/preview`) {
      if (request.method !== 'POST') return methodNotAllowed('POST');
      const value = await body(request);
      const messages = Array.isArray(value.messages) ? value.messages : [];
      const lastUser = [...messages].reverse().find((message) => message?.role === 'user');
      if (!lastUser) throw new ContextModeError('preview_user_required', '预览至少需要一条用户输入。');
      const assembled = await assembleContextForChat(env, {
        conversationId: value.conversation_id,
        sourceTurnId: value.source_turn_id,
        messages,
        lastUser,
        settings: value.settings,
        localDate: value.local_date,
        localDateTime: value.local_datetime,
        modeKey: value.mode_key,
        surface: value.surface || 'main_chat',
        recentEntryIds: value.recent_entry_ids,
        model: value.model,
        permission: 'owner',
        preview: true,
      });
      return json({ ok: true, debug: assembled.debug });
    }
    return apiError('not_found', 'Not found.', 404);
  } catch (error) {
    if (error instanceof ContextModeError || error instanceof WorldbookError || error instanceof OwnerAccessError) {
      return apiError(error.type, error.message, error.status);
    }
    const reference = crypto.randomUUID().slice(0, 8);
    console.error(`[context-api:${reference}]`, error);
    return apiError('context_failed', `上下文装配暂时失败（${reference}）。`, 500);
  }
}

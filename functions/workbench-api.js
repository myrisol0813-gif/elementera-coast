import { getWindowSettings, updateWindowSettings } from './cross-window-touch.js';
import { apiError, json, readJson, sameOrigin } from './http.js';
import { OwnerAccessError, requireOwnerSession } from './owner-access.js';
import { RoomAccessError } from './surface-access-rules.js';
import { listRegisteredTools } from './tool-registry.js';
import { listToolRuns } from './tool-run-log.js';
import {
  WorldbookError,
  createWorldbookEntry,
  deleteWorldbookEntry,
  listWorldbookEntries,
  matchWorldbook,
  updateWorldbookEntry,
} from './worldbook.js';

const BODY_LIMIT = 128 * 1024;

async function body(request) {
  try {
    return await readJson(request, BODY_LIMIT);
  } catch (error) {
    const tooLarge = error?.message === 'body_too_large';
    throw new WorldbookError(
      tooLarge ? 'body_too_large' : 'invalid_json',
      tooLarge ? '请求内容过长。' : '请求不是有效 JSON。',
      tooLarge ? 413 : 400,
    );
  }
}

function methodNotAllowed(allow) {
  return apiError('method_not_allowed', 'Method not allowed.', 405, { allow });
}

function decoded(value) { return decodeURIComponent(value); }

export function isWorkbenchApiPath(pathname) {
  return pathname === '/api/desk' || pathname.startsWith('/api/desk/')
    || pathname === '/api/worldbook' || pathname.startsWith('/api/worldbook/')
    || pathname === '/api/workbench' || pathname.startsWith('/api/workbench/');
}

export async function routeWorkbenchApi(request, env, session = null) {
  if (!env?.COAST_CHAT_DB?.prepare) return apiError('coast_db_not_configured', '海岸 D1 存储未配置。', 503);
  const db = env.COAST_CHAT_DB;
  const url = new URL(request.url);
  try {
    requireOwnerSession(session);
    if (!['GET', 'HEAD'].includes(request.method) && !sameOrigin(request)) {
      throw new WorldbookError('forbidden', 'Forbidden.', 403);
    }
    if (url.pathname === '/api/desk/settings') {
      const value = request.method === 'PATCH' ? await body(request) : null;
      const conversationId = request.method === 'GET'
        ? url.searchParams.get('conversation_id')
        : value?.conversation_id;
      if (!conversationId) return apiError('conversation_id_required', '需要当前聊天窗口。', 400);
      if (request.method === 'GET') return json({ ok: true, settings: await getWindowSettings(db, conversationId) });
      if (request.method === 'PATCH') {
        return json({ ok: true, settings: await updateWindowSettings(db, conversationId, value) });
      }
      return methodNotAllowed('GET, PATCH');
    }
    if (url.pathname === '/api/worldbook') {
      if (request.method === 'GET') return json({ ok: true, entries: await listWorldbookEntries(db) });
      if (request.method === 'POST') return json({ ok: true, entry: await createWorldbookEntry(db, await body(request)) }, 201);
      return methodNotAllowed('GET, POST');
    }
    if (url.pathname === '/api/worldbook/test-match') {
      if (request.method !== 'POST') return methodNotAllowed('POST');
      const value = await body(request);
      return json({
        ok: true,
        matches: await matchWorldbook(db, {
          input: value.input,
          messages: value.messages,
          surface: value.surface || 'main_chat',
          allowedScopes: value.allowed_scopes || ['owner', 'both', 'calendar'],
          limit: value.limit || 6,
        }),
      });
    }
    const worldbookMatch = url.pathname.match(/^\/api\/worldbook\/([^/]+)$/);
    if (worldbookMatch) {
      if (request.method === 'PATCH') return json({ ok: true, entry: await updateWorldbookEntry(db, decoded(worldbookMatch[1]), await body(request)) });
      if (request.method === 'DELETE') return json({ ok: true, entry: await deleteWorldbookEntry(db, decoded(worldbookMatch[1])) });
      return methodNotAllowed('PATCH, DELETE');
    }
    if (url.pathname === '/api/workbench/tools') {
      if (request.method !== 'GET') return methodNotAllowed('GET');
      const surface = url.searchParams.get('surface');
      if (!surface) throw new RoomAccessError('surface_required', '工具目录必须明确指定房间。');
      return json({ ok: true, tools: listRegisteredTools({ permission: 'owner', surface }) });
    }
    if (url.pathname === '/api/workbench/runs') {
      if (request.method !== 'GET') return methodNotAllowed('GET');
      return json({ ok: true, runs: await listToolRuns(db, {
        limit: url.searchParams.get('limit'),
        status: url.searchParams.get('status'),
        tool_key: url.searchParams.get('tool_key'),
      }) });
    }
    return apiError('not_found', 'Not found.', 404);
  } catch (error) {
    if (error instanceof WorldbookError || error instanceof OwnerAccessError || error instanceof RoomAccessError) {
      return apiError(error.type, error.message, error.status);
    }
    const reference = crypto.randomUUID().slice(0, 8);
    console.error(`[workbench-api:${reference}]`, error);
    return apiError('workbench_failed', `工作台暂时不可用（${reference}）。`, 500);
  }
}

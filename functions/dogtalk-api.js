import {
  archiveMysticDogtalk,
  askMyriToReadMysticDogtalk,
  clearMysticDogtalkDraft,
  DogtalkStoreError,
  getMysticDogtalk,
  saveMysticDogtalk,
} from './dogtalk-store.js';
import { apiError, json, readJson } from './http.js';
import { OwnerAccessError, requireOwnerSession } from './owner-access.js';

const DOGTALK_PATH = '/api/dogtalk';

function methodNotAllowed(allow) {
  return apiError('method_not_allowed', 'Method not allowed.', 405, { allow });
}

function scopeFromUrl(url) {
  return {
    room_scope: url.searchParams.get('room_scope') || '',
    conversation_id: url.searchParams.get('conversation_id') || '',
  };
}

export function isDogtalkApiPath(pathname) {
  return pathname === DOGTALK_PATH || pathname.startsWith(`${DOGTALK_PATH}/`);
}

export async function routeDogtalkApi(request, env, session = null) {
  if (!env?.COAST_CHAT_DB?.prepare) {
    return apiError('coast_db_not_configured', '海岸 D1 存储未配置。', 503);
  }
  const url = new URL(request.url);
  try {
    requireOwnerSession(session);
    if (url.pathname === DOGTALK_PATH) {
      if (request.method === 'GET') {
        return json({
          ok: true,
          dogtalk: await getMysticDogtalk(env.COAST_CHAT_DB, scopeFromUrl(url)),
        });
      }
      if (request.method === 'PUT') {
        return json({
          ok: true,
          dogtalk: await saveMysticDogtalk(env.COAST_CHAT_DB, await readJson(request)),
        });
      }
      return methodNotAllowed('GET, PUT');
    }
    const match = url.pathname.match(/^\/api\/dogtalk\/([^/]+)(?:\/(archive|read))?$/);
    if (!match) return apiError('not_found', 'Not found.', 404);
    const id = decodeURIComponent(match[1]);
    if (match[2] === 'archive') {
      if (request.method !== 'POST') return methodNotAllowed('POST');
      return json({
        ok: true,
        dogtalk: await archiveMysticDogtalk(env.COAST_CHAT_DB, id),
      });
    }
    if (match[2] === 'read') {
      if (request.method !== 'POST') return methodNotAllowed('POST');
      return json({
        ok: true,
        dogtalk: await askMyriToReadMysticDogtalk(env.COAST_CHAT_DB, id),
      });
    }
    if (request.method !== 'DELETE') return methodNotAllowed('DELETE');
    return json({
      ok: true,
      dogtalk: await clearMysticDogtalkDraft(env.COAST_CHAT_DB, id),
    });
  } catch (error) {
    if (error instanceof DogtalkStoreError || error instanceof OwnerAccessError) {
      return apiError(error.type, error.message, error.status);
    }
    if (error?.message === 'invalid_json' || error?.message === 'body_too_large') {
      return apiError(
        error.message,
        error.message === 'invalid_json' ? '请求内容不是有效 JSON。' : '请求内容过长。',
        error.status || 400,
      );
    }
    const reference = crypto.randomUUID().slice(0, 8);
    console.error(`[dogtalk-api:${reference}]`, error);
    return apiError('dogtalk_failed', `神秘狗话暂时没有收好（${reference}）。`, 500);
  }
}

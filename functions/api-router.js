import { apiError, json, sameOrigin } from './http.js';
import { isCoastRoomApiPath, routeCoastRoomApi } from './coast-api.js';
import { isDailyApiPath, routeDailyApi } from './daily-api.js';
import { isDogtalkApiPath, routeDogtalkApi } from './dogtalk-api.js';
import { isMemoryApiPath, routeMemoryApi } from './memory-router.js';
import { handleModels, handleSandbox } from './models.js';

export async function routeApi(request, env, session) {
  const url = new URL(request.url);
  if (!['GET', 'HEAD'].includes(request.method) && !sameOrigin(request)) {
    return apiError('forbidden', 'Forbidden.', 403);
  }
  if (url.pathname === '/api/health' && request.method === 'GET') {
    return json({ ok: true, authenticated: true, ts: new Date().toISOString() });
  }
  if (url.pathname === '/api/session' && request.method === 'GET') {
    return json({ ok: true, authenticated: true, expires_at: session.exp });
  }
  if (isDailyApiPath(url.pathname)) return routeDailyApi(request, env, session);
  if (isDogtalkApiPath(url.pathname)) return routeDogtalkApi(request, env, session);
  if (isMemoryApiPath(url.pathname)) return routeMemoryApi(request, env, session);
  if (isCoastRoomApiPath(url.pathname)) return routeCoastRoomApi(request, env, session);
  if (url.pathname === '/api/models') return handleModels(request, env);
  if (url.pathname === '/api/chat-sandbox') return handleSandbox(request, env);
  return apiError('not_found', 'Not found.', 404);
}

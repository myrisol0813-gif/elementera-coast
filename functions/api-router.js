import { apiError, json, sameOrigin } from './http.js';
import { handleFormalChat, handleModels, handleSandbox } from './models.js';

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
  if (url.pathname === '/api/models') return handleModels(request, env);
  if (url.pathname === '/api/chat') return handleFormalChat(request, env);
  if (url.pathname === '/api/chat-sandbox') return handleSandbox(request, env);
  return apiError('not_found', 'Not found.', 404);
}


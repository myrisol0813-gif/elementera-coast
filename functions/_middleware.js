import { handleLogin, handleLogout, unauthorized, verifySession } from './auth.js';
import { routeApi } from './api-router.js';
import { isChatApiPath, routeChatApi } from './chat-router.js';
import { protectedResponse } from './http.js';

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  if (url.pathname === '/login') return handleLogin(request, env);
  if (url.pathname === '/logout') return handleLogout();

  const session = await verifySession(request, env);
  if (!session) return unauthorized(request);

  if (isChatApiPath(url.pathname)) return routeChatApi(request, env);
  if (url.pathname.startsWith('/api/')) return routeApi(request, env, session);
  return protectedResponse(await next());
}


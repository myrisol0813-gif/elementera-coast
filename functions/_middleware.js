import { handleLogin, handleLogout, unauthorized, verifySession } from './auth.js';
import { routeApi } from './api-router.js';
import { isChatApiPath, routeChatApi } from './chat-router.js';
import { protectedResponse } from './http.js';

const PUBLIC_PWA_ASSETS = new Set([
  '/manifest.json',
  '/public/icons/icon-16.png',
  '/public/icons/icon-32.png',
  '/public/icons/apple-touch-icon.png',
  '/public/icons/icon-192.png',
  '/public/icons/icon-512.png',
  '/public/icons/icon-maskable-512.png',
]);

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  if (url.pathname === '/login') return handleLogin(request, env);
  if (url.pathname === '/logout') return handleLogout();
  if (['GET', 'HEAD'].includes(request.method) && PUBLIC_PWA_ASSETS.has(url.pathname)) return next();

  const session = await verifySession(request, env);
  if (!session) return unauthorized(request);

  if (isChatApiPath(url.pathname)) return routeChatApi(request, env);
  if (url.pathname.startsWith('/api/')) return routeApi(request, env, session);
  return protectedResponse(await next());
}

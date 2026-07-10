import {
  ChatStoreError,
  createConversation,
  deleteConversation,
  flatMessagesToState,
  getConversation,
  hasChatDatabase,
  importLegacyConversation,
  isDefaultTitle,
  listConversations,
  normalizeProfile,
  normalizeState,
  readConversationState,
  readProfile,
  renameConversation,
  sanitizeId,
  sanitizeTitle,
  setGeneratedTitle,
  writeConversationState,
  writeProfile,
} from './chat-store.js';

const BODY_LIMIT = 2 * 1024 * 1024;
const OLD_MAIN_KV_KEY = 'chat:main:v1';

const headers = Object.freeze({
  'Cache-Control': 'private, no-store',
  'Content-Type': 'application/json; charset=UTF-8',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
});

function json(value, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...headers, ...extraHeaders },
  });
}

function errorResponse(type, message, status = 400, extraHeaders = {}) {
  return json({ ok: false, error: { type, message } }, status, extraHeaders);
}

function sameSite(request) {
  const requestOrigin = new URL(request.url).origin;
  const origin = request.headers.get('Origin');
  if (origin) return origin === requestOrigin;
  const referer = request.headers.get('Referer');
  if (!referer) return false;
  try {
    return new URL(referer).origin === requestOrigin;
  } catch {
    return false;
  }
}

async function readJsonBody(request) {
  const reader = request.body?.getReader();
  if (!reader) return {};
  const chunks = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > BODY_LIMIT) {
      throw new ChatStoreError('body_too_large', '请求体过大。', 413);
    }
    chunks.push(value);
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(body);
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new ChatStoreError('invalid_request', '请求体不是有效的 JSON。', 400);
  }
}

async function requireSession(context, legacyOnRequest) {
  const url = new URL(context.request.url);
  url.pathname = '/api/session';
  url.search = '';
  const response = await legacyOnRequest({
    ...context,
    request: new Request(url.toString(), {
      method: 'GET',
      headers: context.request.headers,
    }),
  });
  return response.ok ? null : response;
}

function hasKv(env) {
  return Boolean(env?.COAST_CHAT_STORE && typeof env.COAST_CHAT_STORE.get === 'function');
}

async function deleteConversationKv(env, conversationId) {
  if (!hasKv(env) || typeof env.COAST_CHAT_STORE.delete !== 'function') return;
  await env.COAST_CHAT_STORE.delete(`chat:conversation:${conversationId}:v1`).catch(() => undefined);
  if (conversationId === 'main') await env.COAST_CHAT_STORE.delete(OLD_MAIN_KV_KEY).catch(() => undefined);
}

async function migrateLegacyMainIfNeeded(env) {
  if (!hasKv(env)) return;
  const existing = await listConversations(env.COAST_CHAT_DB);
  if (existing.length) return;

  const rawText = await env.COAST_CHAT_STORE.get(OLD_MAIN_KV_KEY);
  if (!rawText) return;
  try {
    const payload = JSON.parse(rawText);
    const raw = payload?.history || payload || {};
    const state = Array.isArray(raw.turns)
      ? normalizeState(raw)
      : flatMessagesToState(raw.messages || payload.messages || []);
    if (!state.turns.length) return;
    await importLegacyConversation(
      env.COAST_CHAT_DB,
      'main',
      '主聊天',
      state,
      raw.profile || payload.profile || null,
    );
  } catch (error) {
    console.warn('[chat-migration] legacy main KV was not imported', error);
  }
}

async function handleConversations(request, env, path) {
  const prefix = '/api/chat/conversations';
  const suffix = decodeURIComponent(path.slice(prefix.length).replace(/^\//, ''));

  if (!suffix) {
    if (request.method === 'GET') {
      await migrateLegacyMainIfNeeded(env);
      return json({ ok: true, conversations: await listConversations(env.COAST_CHAT_DB) });
    }
    if (request.method === 'POST') {
      if (!sameSite(request)) return errorResponse('forbidden', 'Forbidden.', 403);
      const body = await readJsonBody(request);
      const conversation = await createConversation(env.COAST_CHAT_DB, body.title || '新聊天');
      return json({ ok: true, conversation }, 201);
    }
    return errorResponse('method_not_allowed', 'Method not allowed.', 405);
  }

  const conversationId = sanitizeId(suffix.split('/')[0], 'conversation');
  if (request.method === 'PATCH') {
    if (!sameSite(request)) return errorResponse('forbidden', 'Forbidden.', 403);
    const body = await readJsonBody(request);
    const conversation = await renameConversation(env.COAST_CHAT_DB, conversationId, body.title || '新聊天');
    return json({ ok: true, conversation });
  }
  if (request.method === 'DELETE') {
    if (!sameSite(request)) return errorResponse('forbidden', 'Forbidden.', 403);
    const conversation = await deleteConversation(env.COAST_CHAT_DB, conversationId);
    await deleteConversationKv(env, conversationId);
    return json({ ok: true, conversation, deleted: true });
  }
  return errorResponse('method_not_allowed', 'Method not allowed.', 405);
}

async function handleHistory(request, env) {
  const conversationId = sanitizeId(new URL(request.url).searchParams.get('conversation_id') || 'main', 'conversation');
  if (request.method === 'GET') {
    const history = await readConversationState(env.COAST_CHAT_DB, conversationId);
    return json({ ok: true, source: 'd1-json-v3', history: { ...history, conversation_id: conversationId } });
  }
  if (request.method === 'PUT') {
    if (!sameSite(request)) return errorResponse('forbidden', 'Forbidden.', 403);
    const body = await readJsonBody(request);
    const history = await writeConversationState(env.COAST_CHAT_DB, conversationId, body);
    return json({ ok: true, source: 'd1-json-v3', history: { ...history, conversation_id: conversationId } });
  }
  return errorResponse('method_not_allowed', 'Method not allowed.', 405, { Allow: 'GET, PUT' });
}

async function handleProfile(request, env) {
  if (request.method === 'GET') {
    return json({ ok: true, profile: await readProfile(env.COAST_CHAT_DB) });
  }
  if (request.method === 'PUT') {
    if (!sameSite(request)) return errorResponse('forbidden', 'Forbidden.', 403);
    const body = await readJsonBody(request);
    const profile = await writeProfile(env.COAST_CHAT_DB, normalizeProfile(body.profile || body));
    return json({ ok: true, profile });
  }
  return errorResponse('method_not_allowed', 'Method not allowed.', 405);
}

async function generateTitle(context, legacyOnRequest, user, assistant) {
  const url = new URL(context.request.url);
  url.pathname = '/api/chat';
  url.search = '';
  const prompt = `为下面这轮对话生成一个简短中文标题，12字以内，不要引号，不要句号，不要解释。\n用户：${String(user || '').slice(0, 1000)}\n助手：${String(assistant || '').slice(0, 1000)}`;
  const requestHeaders = new Headers(context.request.headers);
  requestHeaders.set('Content-Type', 'application/json');
  const response = await legacyOnRequest({
    ...context,
    request: new Request(url.toString(), {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify({
        model: 'openai/gpt-4.1-nano',
        messages: [{ role: 'user', content: prompt }],
        settings: { max_tokens: 40, temperature: 0.2 },
      }),
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new ChatStoreError('title_generation_failed', '标题生成失败。', 502);
  }
  return sanitizeTitle(data?.message?.content || '', '新聊天').slice(0, 24);
}

async function handleTitle(request, context, legacyOnRequest) {
  if (request.method !== 'POST') return errorResponse('method_not_allowed', 'Method not allowed.', 405);
  if (!sameSite(request)) return errorResponse('forbidden', 'Forbidden.', 403);
  const body = await readJsonBody(request);
  const conversationId = sanitizeId(body.conversation_id || 'main', 'conversation');
  const conversation = await getConversation(context.env.COAST_CHAT_DB, conversationId);
  if (conversation.title_manual || conversation.title_generated_at || !isDefaultTitle(conversation.title)) {
    return json({ ok: true, skipped: true });
  }
  let title;
  try {
    title = await generateTitle(context, legacyOnRequest, body.user, body.assistant);
  } catch {
    return json({ ok: true, skipped: true, reason: 'title_generation_failed' });
  }
  return json({
    ok: true,
    conversation: await setGeneratedTitle(context.env.COAST_CHAT_DB, conversationId, title),
  });
}

function chatPath(pathname) {
  return pathname === '/api/chat/history'
    || pathname === '/api/chat/profile'
    || pathname === '/api/chat/title'
    || pathname === '/api/chat/conversations'
    || pathname.startsWith('/api/chat/conversations/');
}

export async function routeChatRequest(context, legacyOnRequest) {
  const url = new URL(context.request.url);
  if (!chatPath(url.pathname)) return null;

  const authFailure = await requireSession(context, legacyOnRequest);
  if (authFailure) return authFailure;
  if (!hasChatDatabase(context.env)) {
    return errorResponse('chat_db_not_configured', '主聊天 D1 存储未配置。', 503);
  }

  try {
    if (url.pathname === '/api/chat/history') return await handleHistory(context.request, context.env);
    if (url.pathname === '/api/chat/profile') return await handleProfile(context.request, context.env);
    if (url.pathname === '/api/chat/title') return await handleTitle(context.request, context, legacyOnRequest);
    return await handleConversations(context.request, context.env, url.pathname);
  } catch (error) {
    if (error instanceof ChatStoreError) {
      return errorResponse(error.type, error.message, error.status);
    }
    const reference = crypto.randomUUID().slice(0, 8);
    console.error(`[chat-api:${reference}]`, error);
    return errorResponse('chat_store_failed', `主聊天存储操作失败（${reference}）。`, 500);
  }
}

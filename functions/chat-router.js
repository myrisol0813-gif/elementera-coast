import { apiError, json, readJson, sameOrigin } from './http.js';
import { buildMemoryContext, formatMemoryContext } from './memory-recall.js';
import { MEMORY_OWNER_ID } from './memory-store.js';
import { ModelRequestError, modelErrorResponse, performFormalChat } from './models.js';
import {
  ChatStoreError,
  createConversation,
  deleteConversation,
  getConversation,
  hasChatDatabase,
  isDefaultTitle,
  listConversations,
  normalizeProfile,
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
const CONVERSATIONS_PATH = '/api/chat/conversations';
const FORMAL_CHAT_PATH = '/api/chat';

function methodNotAllowed(allow) {
  return apiError('method_not_allowed', 'Method not allowed.', 405, { allow });
}

async function body(request) {
  try {
    return await readJson(request, BODY_LIMIT);
  } catch (error) {
    if (error.message === 'body_too_large') throw new ChatStoreError('body_too_large', '请求体过大。', 413);
    throw new ChatStoreError('invalid_request', '请求体不是有效的 JSON。', 400);
  }
}

function requireSameOrigin(request) {
  if (!sameOrigin(request)) throw new ChatStoreError('forbidden', 'Forbidden.', 403);
}

async function conversations(request, env, pathname) {
  const suffix = decodeURIComponent(pathname.slice(CONVERSATIONS_PATH.length).replace(/^\//, ''));
  if (!suffix) {
    if (request.method === 'GET') return json({ ok: true, conversations: await listConversations(env.COAST_CHAT_DB) });
    if (request.method === 'POST') {
      requireSameOrigin(request);
      const value = await body(request);
      return json({ ok: true, conversation: await createConversation(env.COAST_CHAT_DB, value.title || '新聊天') }, 201);
    }
    return methodNotAllowed('GET, POST');
  }

  const conversationId = sanitizeId(suffix.split('/')[0], 'conversation');
  if (request.method === 'PATCH') {
    requireSameOrigin(request);
    const value = await body(request);
    return json({ ok: true, conversation: await renameConversation(env.COAST_CHAT_DB, conversationId, value.title || '新聊天') });
  }
  if (request.method === 'DELETE') {
    requireSameOrigin(request);
    return json({ ok: true, conversation: await deleteConversation(env.COAST_CHAT_DB, conversationId), deleted: true });
  }
  return methodNotAllowed('PATCH, DELETE');
}

async function history(request, env) {
  const conversationId = sanitizeId(new URL(request.url).searchParams.get('conversation_id') || '', 'conversation');
  if (request.method === 'GET') {
    const value = await readConversationState(env.COAST_CHAT_DB, conversationId);
    return json({ ok: true, source: 'd1-json-v4', history: { ...value, conversation_id: conversationId } });
  }
  if (request.method === 'PUT') {
    requireSameOrigin(request);
    const value = await writeConversationState(env.COAST_CHAT_DB, conversationId, await body(request));
    return json({ ok: true, source: 'd1-json-v4', history: { ...value, conversation_id: conversationId } });
  }
  return methodNotAllowed('GET, PUT');
}

async function profile(request, env) {
  if (request.method === 'GET') return json({ ok: true, profile: await readProfile(env.COAST_CHAT_DB) });
  if (request.method === 'PUT') {
    requireSameOrigin(request);
    const value = await body(request);
    return json({ ok: true, profile: await writeProfile(env.COAST_CHAT_DB, normalizeProfile(value.profile || value)) });
  }
  return methodNotAllowed('GET, PUT');
}

async function generatedTitle(env, user, assistant) {
  const prompt = `为下面这轮对话生成一个简短中文标题，12字以内，不要引号，不要句号，不要解释。\n用户：${String(user || '').slice(0, 1000)}\n助手：${String(assistant || '').slice(0, 1000)}`;
  const result = await performFormalChat(env, {
    model: 'openai/gpt-4.1-nano',
    messages: [{ role: 'user', content: prompt }],
    settings: { max_tokens: 40, temperature: 0.2 },
  });
  return sanitizeTitle(result?.message?.content || '', '新聊天').slice(0, 24);
}

async function title(request, env) {
  if (request.method !== 'POST') return methodNotAllowed('POST');
  requireSameOrigin(request);
  const value = await body(request);
  const conversationId = sanitizeId(value.conversation_id || '', 'conversation');
  const conversation = await getConversation(env.COAST_CHAT_DB, conversationId);
  if (conversation.title_manual || conversation.title_generated_at || !isDefaultTitle(conversation.title)) {
    return json({ ok: true, skipped: true });
  }
  let nextTitle;
  try {
    nextTitle = await generatedTitle(env, value.user, value.assistant);
  } catch {
    return json({ ok: true, skipped: true, reason: 'title_generation_failed' });
  }
  return json({ ok: true, conversation: await setGeneratedTitle(env.COAST_CHAT_DB, conversationId, nextTitle) });
}

async function formalChat(request, env) {
  if (request.method !== 'POST') return methodNotAllowed('POST');
  requireSameOrigin(request);
  const value = await body(request);
  const conversationId = sanitizeId(value.conversation_id || '', 'conversation');
  await getConversation(env.COAST_CHAT_DB, conversationId);
  const messages = Array.isArray(value.messages) ? value.messages : [];
  const lastUser = [...messages].reverse().find((message) => message?.role === 'user' && typeof message.content === 'string');
  if (!lastUser || messages.at(-1)?.role !== 'user') {
    throw new ChatStoreError('invalid_request', '当前用户消息必须位于请求末尾。', 400);
  }

  let memory = null;
  let softContext = '';
  try {
    memory = await buildMemoryContext(env, MEMORY_OWNER_ID, conversationId, lastUser.content, {
      recent_entry_ids: value.recent_entry_ids,
      mode: 'chat',
      settings: value.settings,
      conversation_turns: messages.filter((message) => message?.role === 'user').length,
    });
    softContext = formatMemoryContext(memory, value.settings);
  } catch (error) {
    console.error('[chat-memory:recall]', error);
  }

  const recent = softContext ? messages.slice(-19) : messages;
  const result = await performFormalChat(env, {
    model: value.model,
    messages: softContext ? [{ role: 'system', content: softContext }, ...recent] : recent,
    settings: value.settings,
  }, { allowSystem: Boolean(softContext) });
  return json({
    ...result,
    memory: {
      selected_entry_ids: memory?.trace?.selected || [],
      vector_enabled: Boolean(memory?.trace?.vector_enabled),
    },
  });
}

export function isChatApiPath(pathname) {
  return pathname === FORMAL_CHAT_PATH
    || pathname === '/api/chat/history'
    || pathname === '/api/chat/profile'
    || pathname === '/api/chat/title'
    || pathname === CONVERSATIONS_PATH
    || pathname.startsWith(`${CONVERSATIONS_PATH}/`);
}

export async function routeChatApi(request, env) {
  if (!hasChatDatabase(env)) return apiError('chat_db_not_configured', '主聊天 D1 存储未配置。', 503);
  const pathname = new URL(request.url).pathname;
  try {
    if (pathname === FORMAL_CHAT_PATH) return await formalChat(request, env);
    if (pathname === '/api/chat/history') return await history(request, env);
    if (pathname === '/api/chat/profile') return await profile(request, env);
    if (pathname === '/api/chat/title') return await title(request, env);
    return await conversations(request, env, pathname);
  } catch (error) {
    if (error instanceof ModelRequestError) return modelErrorResponse(error);
    if (error instanceof ChatStoreError) return apiError(error.type, error.message, error.status);
    const reference = crypto.randomUUID().slice(0, 8);
    console.error(`[chat-api:${reference}]`, error);
    return apiError('chat_store_failed', `主聊天存储操作失败（${reference}）。`, 500);
  }
}

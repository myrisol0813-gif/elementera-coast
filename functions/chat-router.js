import { apiError, json, readJson, sameOrigin } from './http.js';
import { buildMemoryContext, formatMemoryContext } from './memory-recall.js';
import { MEMORY_OWNER_ID } from './memory-store.js';
import { MAX_FORMAL_TOKENS, ModelRequestError, modelErrorResponse, performFormalChat } from './models.js';
import {
  ChatStoreError,
  createConversation,
  deleteConversation,
  getConversation,
  hasChatDatabase,
  isDefaultTitle,
  listConversations,
  normalizeProfile,
  readLandingStatus,
  readConversationState,
  readProfile,
  renameConversation,
  sanitizeId,
  sanitizeTitle,
  setGeneratedTitle,
  writeConversationState,
  writeLandingExchange,
  writeProfile,
} from './chat-store.js';

const BODY_LIMIT = 2 * 1024 * 1024;
const CONVERSATIONS_PATH = '/api/chat/conversations';
const FORMAL_CHAT_PATH = '/api/chat';
const LANDING_LETTER_PATH = '/api/chat/landing-letter';

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

export function clipGeneratedTitle(value) {
  return Array.from(sanitizeTitle(value, '新聊天')).slice(0, 12).join('');
}

async function generatedTitle(env, user, assistant) {
  const prompt = `为下面这轮对话生成一个简短中文标题，12字以内，不要引号，不要句号，不要解释。\n用户：${String(user || '').slice(0, 1000)}\n助手：${String(assistant || '').slice(0, 1000)}`;
  const result = await performFormalChat(env, {
    model: 'openai/gpt-4.1-nano',
    messages: [{ role: 'user', content: prompt }],
    settings: { max_tokens: 40, temperature: 0.2 },
  });
  return clipGeneratedTitle(result?.message?.content || '');
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

  const assembled = budgetChatMessages(messages, softContext, value.settings);
  const result = await performFormalChat(env, {
    model: value.model,
    messages: assembled.messages,
    settings: value.settings,
  }, { allowSystem: assembled.messages[0]?.role === 'system' });
  return json({
    ...result,
    context: assembled.trace,
    memory: {
      selected_entry_ids: memory?.trace?.selected || [],
      vector_enabled: Boolean(memory?.trace?.vector_enabled),
    },
  });
}

function integer(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.trunc(number))) : fallback;
}

export function landingRequestSettings(rawSettings = {}) {
  const settings = rawSettings && typeof rawSettings === 'object' ? rawSettings : {};
  const minimum = settings.outputLength === 'short'
    ? 700
    : settings.outputLength === 'long'
      ? 1600
      : 1200;
  const requested = Number(settings.max_tokens);
  const maxTokens = Math.min(
    MAX_FORMAL_TOKENS,
    Math.max(minimum, Number.isFinite(requested) ? Math.trunc(requested) : minimum),
  );
  return { ...settings, max_tokens: maxTokens };
}

export function estimateContextTokens(value) {
  let wide = 0;
  let narrow = 0;
  for (const character of String(value || '')) {
    if (/[㐀-鿿豈-﫿぀-ヿ가-힯]/u.test(character)) wide += 1;
    else narrow += 1;
  }
  return wide + Math.ceil(narrow / 4);
}

function messageTokens(message) {
  return estimateContextTokens(message?.content) + 4;
}

export function budgetChatMessages(messages, softContext = '', rawSettings = {}) {
  const recentTurns = integer(rawSettings.recentTurns, 8, 1, 20);
  const budget = integer(rawSettings.contextBudget, 6000, 256, 12000);
  const hasSoftContext = Boolean(String(softContext || '').trim());
  const historyLimit = Math.min(recentTurns * 2, hasSoftContext ? 19 : 20);
  const source = (Array.isArray(messages) ? messages : [])
    .filter((message) => ['user', 'assistant'].includes(message?.role) && typeof message.content === 'string')
    .slice(-historyLimit);
  const lastUserIndex = source.findLastIndex((message) => message.role === 'user');
  const kept = source.map((message, index) => ({ message, index }));
  let includeSoftContext = hasSoftContext;
  const trimmed = { assistants: 0, users: 0, soft_context: false };
  const total = () => kept.reduce((sum, item) => sum + messageTokens(item.message), 0)
    + (includeSoftContext ? messageTokens({ content: softContext }) : 0);
  const removeOldest = (role) => {
    const position = kept.findIndex((item) => item.message.role === role
      && !(role === 'user' && item.index === lastUserIndex));
    if (position < 0) return false;
    kept.splice(position, 1);
    return true;
  };

  while (total() > budget && removeOldest('assistant')) trimmed.assistants += 1;
  while (total() > budget && removeOldest('user')) trimmed.users += 1;
  if (total() > budget && includeSoftContext) {
    includeSoftContext = false;
    trimmed.soft_context = true;
  }

  const result = kept.map((item) => item.message);
  if (includeSoftContext) result.unshift({ role: 'system', content: softContext });
  const estimatedTokens = total();
  return {
    messages: result,
    trace: {
      mode: 'estimated_characters',
      budget,
      estimated_tokens: estimatedTokens,
      recent_turns: recentTurns,
      current_user_preserved: lastUserIndex >= 0 && kept.some((item) => item.index === lastUserIndex),
      over_budget: estimatedTokens > budget,
      trimmed,
    },
  };
}

function activeStateMessages(state) {
  const messages = [];
  for (const turn of Array.isArray(state?.turns) ? state.turns : []) {
    const users = Array.isArray(turn?.user?.variants) ? turn.user.variants : [];
    const userIndex = Math.min(Math.max(0, Number(turn?.user?.active || 0)), Math.max(0, users.length - 1));
    const user = users[userIndex];
    const assistants = turn?.assistant?.variantsByUserVariant?.[String(userIndex)] || [];
    const assistantIndex = Math.min(
      Math.max(0, Number(turn?.assistant?.activeByUserVariant?.[String(userIndex)] || 0)),
      Math.max(0, assistants.length - 1),
    );
    const assistant = assistants[assistantIndex];
    if (user?.content) messages.push({ role: 'user', content: user.content });
    if (assistant?.content) messages.push({ role: 'assistant', content: assistant.content });
  }
  return messages;
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(String(value || ''));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function landingLetter(request, env) {
  const url = new URL(request.url);
  const conversationId = sanitizeId(url.searchParams.get('conversation_id') || '', 'conversation');
  if (request.method === 'GET') {
    return json({
      ok: true,
      landing: await readLandingStatus(env.COAST_CHAT_DB, conversationId, url.searchParams.get('model') || ''),
    });
  }
  if (request.method !== 'POST') return methodNotAllowed('GET, POST');
  requireSameOrigin(request);
  const value = await body(request);
  const targetConversationId = sanitizeId(value.conversation_id || '', 'conversation');
  const modelId = String(value.model || '').trim().slice(0, 180);
  const letterText = String(value.letter_text || '').slice(0, 12000);
  if (!modelId || !letterText.trim()) {
    throw new ChatStoreError('invalid_request', '请先写好登岛信并选择当前聊天模型。', 400);
  }

  const requestSettings = landingRequestSettings(value.settings);
  const state = await readConversationState(env.COAST_CHAT_DB, targetConversationId);
  const messages = [...activeStateMessages(state), { role: 'user', content: letterText }];
  const lastUser = messages.at(-1);
  let memory = null;
  let softContext = '';
  try {
    memory = await buildMemoryContext(env, MEMORY_OWNER_ID, targetConversationId, lastUser.content, {
      recent_entry_ids: value.recent_entry_ids,
      mode: 'chat',
      settings: requestSettings,
      conversation_turns: messages.filter((message) => message.role === 'user').length,
    });
    softContext = formatMemoryContext(memory, requestSettings);
  } catch (error) {
    console.error('[chat-memory:landing-recall]', error);
  }
  const assembled = budgetChatMessages(messages, softContext, requestSettings);
  const generated = await performFormalChat(env, {
    model: modelId,
    messages: assembled.messages,
    settings: requestSettings,
  }, { allowSystem: assembled.messages[0]?.role === 'system' });
  const assistantText = generated?.message?.content || '';
  if (!assistantText.trim()) throw new ChatStoreError('empty_model_reply', '模型读完了信，但没有返回文字。', 502);

  const saved = await writeLandingExchange(env.COAST_CHAT_DB, targetConversationId, {
    state,
    model_id: modelId,
    letter_text: letterText,
    letter_hash: await sha256(letterText),
    assistant_text: assistantText,
    finish_reason: generated.finish_reason,
  });
  return json({
    ok: true,
    assistant: saved.assistant,
    conversation: await getConversation(env.COAST_CHAT_DB, targetConversationId),
    history: { ...saved.state, conversation_id: targetConversationId },
    landing: saved.landing,
    finish_reason: generated.finish_reason || null,
    max_tokens: requestSettings.max_tokens,
    context: assembled.trace,
    memory: {
      selected_entry_ids: memory?.trace?.selected || [],
      vector_enabled: Boolean(memory?.trace?.vector_enabled),
    },
  });
}

export function isChatApiPath(pathname) {
  return pathname === FORMAL_CHAT_PATH
    || pathname === LANDING_LETTER_PATH
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
    if (pathname === LANDING_LETTER_PATH) return await landingLetter(request, env);
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

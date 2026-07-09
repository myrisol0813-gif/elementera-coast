import { onRequest as legacyOnRequest } from "./_middleware.full.js";

const HISTORY_KEY = "chat:main:v1";
const HISTORY_BODY_LIMIT_BYTES = 2 * 1024 * 1024;
const HISTORY_MAX_MESSAGES = 200;
const HISTORY_MAX_CONTENT_CHARS = 12000;

const historyEncoder = new TextEncoder();
const historyDecoder = new TextDecoder();

function historyHeaders(extra = {}) {
  return {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    ...extra,
  };
}

function historyJson(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: historyHeaders({ "Content-Type": "application/json; charset=UTF-8", ...headers }),
  });
}

function historyError(type, message, status = 400) {
  return historyJson({ ok: false, error: { type, message } }, status);
}

function getOrigin(request) {
  return new URL(request.url).origin;
}

function sameSiteMutation(request) {
  const requestOrigin = getOrigin(request);
  const origin = request.headers.get("Origin");
  if (origin) return origin === requestOrigin;
  const referer = request.headers.get("Referer");
  if (!referer) return false;
  try {
    return new URL(referer).origin === requestOrigin;
  } catch {
    return false;
  }
}

async function readHistoryText(request) {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > HISTORY_BODY_LIMIT_BYTES) {
      const error = new Error("body_too_large");
      error.status = 413;
      throw error;
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return historyDecoder.decode(merged);
}

async function readHistoryJson(request) {
  const text = await readHistoryText(request);
  if (!text.trim()) return {};
  return JSON.parse(text);
}

function chatStoreKey() {
  return HISTORY_KEY;
}

function normalizeHistoryMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((message) => message && (message.role === "user" || message.role === "assistant") && typeof message.content === "string")
    .slice(-HISTORY_MAX_MESSAGES)
    .map((message) => ({
      id: String(message.id || crypto.randomUUID()),
      role: message.role,
      content: message.content.slice(0, HISTORY_MAX_CONTENT_CHARS),
      ...(typeof message.created_at === "string" ? { created_at: message.created_at } : {}),
    }));
}

function configuredStore(env) {
  return env && env.COAST_CHAT_STORE && typeof env.COAST_CHAT_STORE.get === "function" && typeof env.COAST_CHAT_STORE.put === "function";
}

async function handleChatHistory(request, env) {
  if (!configuredStore(env)) {
    return historyError("chat_store_not_configured", "主聊天服务器存储未配置。", 503);
  }

  if (request.method === "GET") {
    const raw = await env.COAST_CHAT_STORE.get(chatStoreKey());
    if (!raw) {
      return historyJson({ ok: true, history: { v: 1, updated_at: null, messages: [] } });
    }
    try {
      const parsed = JSON.parse(raw);
      return historyJson({
        ok: true,
        history: {
          v: 1,
          updated_at: typeof parsed.updated_at === "string" ? parsed.updated_at : null,
          messages: normalizeHistoryMessages(parsed.messages),
        },
      });
    } catch {
      return historyJson({ ok: true, history: { v: 1, updated_at: null, messages: [] } });
    }
  }

  if (request.method === "PUT") {
    if (!sameSiteMutation(request)) return historyError("forbidden", "Forbidden.", 403);
    let body;
    try {
      body = await readHistoryJson(request);
    } catch (error) {
      if (error.status === 413 || error.message === "body_too_large") return historyError("body_too_large", "请求体过大。", 413);
      return historyError("invalid_request", "请求体无效。", 400);
    }
    const messages = normalizeHistoryMessages(body.messages || body.history?.messages || []);
    const history = { v: 1, updated_at: new Date().toISOString(), messages };
    await env.COAST_CHAT_STORE.put(chatStoreKey(), JSON.stringify(history));
    return historyJson({ ok: true, history });
  }

  if (request.method === "DELETE") {
    if (!sameSiteMutation(request)) return historyError("forbidden", "Forbidden.", 403);
    if (typeof env.COAST_CHAT_STORE.delete !== "function") return historyError("chat_store_delete_unavailable", "主聊天服务器存储暂不支持删除。", 503);
    await env.COAST_CHAT_STORE.delete(chatStoreKey());
    return historyJson({ ok: true, deleted: true });
  }

  return historyJson({ ok: false, error: { type: "method_not_allowed", message: "Method not allowed." } }, 405, { Allow: "GET, PUT, DELETE" });
}

async function ensureAuthenticated(context) {
  const url = new URL(context.request.url);
  url.pathname = "/api/session";
  url.search = "";
  const sessionRequest = new Request(url.toString(), {
    method: "GET",
    headers: context.request.headers,
  });
  const response = await legacyOnRequest({ ...context, request: sessionRequest });
  if (!response.ok) return response;
  return null;
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (url.pathname === "/api/chat/history") {
    const unauthorized = await ensureAuthenticated(context);
    if (unauthorized) return unauthorized;
    return handleChatHistory(context.request, context.env);
  }
  return legacyOnRequest(context);
}

import { onRequest as legacyOnRequest } from "./_middleware.full.js";

const HISTORY_KEY = "chat:main:v1";
const HISTORY_BODY_LIMIT_BYTES = 2 * 1024 * 1024;
const HISTORY_MAX_MESSAGES = 200;
const HISTORY_MAX_TURNS = 100;
const HISTORY_MAX_CONTENT_CHARS = 12000;

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

function cleanText(value) {
  return String(value || "").slice(0, HISTORY_MAX_CONTENT_CHARS);
}

function cleanVariant(variant) {
  if (!variant || typeof variant.content !== "string") return null;
  return {
    id: String(variant.id || crypto.randomUUID()),
    content: cleanText(variant.content),
    ...(typeof variant.created_at === "string" ? { created_at: variant.created_at } : { created_at: new Date().toISOString() }),
    ...(typeof variant.errorDetail === "string" && variant.errorDetail ? { errorDetail: cleanText(variant.errorDetail) } : {}),
  };
}

function normalizeHistoryMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((message) => message && (message.role === "user" || message.role === "assistant") && typeof message.content === "string")
    .slice(-HISTORY_MAX_MESSAGES)
    .map((message) => ({
      id: String(message.id || crypto.randomUUID()),
      role: message.role,
      content: cleanText(message.content),
      ...(typeof message.created_at === "string" ? { created_at: message.created_at } : { created_at: new Date().toISOString() }),
      ...(typeof message.errorDetail === "string" && message.errorDetail ? { errorDetail: cleanText(message.errorDetail) } : {}),
    }));
}

function flatMessagesToTurns(messages) {
  const turns = [];
  let current = null;
  for (const message of normalizeHistoryMessages(messages)) {
    if (message.role === "user") {
      current = {
        id: `turn_${message.id || crypto.randomUUID()}`,
        user: { active: 0, variants: [{ id: message.id, content: message.content, created_at: message.created_at }] },
        assistant: { activeByUserVariant: { "0": 0 }, variantsByUserVariant: { "0": [] } },
      };
      turns.push(current);
    } else if (current) {
      current.assistant.variantsByUserVariant["0"].push({ id: message.id, content: message.content, created_at: message.created_at, ...(message.errorDetail ? { errorDetail: message.errorDetail } : {}) });
    } else {
      turns.push({
        id: `turn_${message.id || crypto.randomUUID()}`,
        user: { active: 0, variants: [] },
        assistant: { activeByUserVariant: { "0": 0 }, variantsByUserVariant: { "0": [{ id: message.id, content: message.content, created_at: message.created_at, ...(message.errorDetail ? { errorDetail: message.errorDetail } : {}) }] } },
      });
    }
  }
  return normalizeHistoryTurns(turns);
}

function normalizeHistoryTurns(turns) {
  if (!Array.isArray(turns)) return [];
  return turns.slice(-HISTORY_MAX_TURNS).map((turn) => {
    const userVariants = Array.isArray(turn?.user?.variants) ? turn.user.variants.map(cleanVariant).filter(Boolean).slice(0, 20) : [];
    let userActive = Number(turn?.user?.active || 0);
    if (!Number.isFinite(userActive)) userActive = 0;
    userActive = Math.min(Math.max(0, userActive), Math.max(0, userVariants.length - 1));

    const rawVariants = turn?.assistant?.variantsByUserVariant || {};
    const variantsByUserVariant = {};
    const activeByUserVariant = {};
    const branchCount = Math.max(1, userVariants.length);
    for (let index = 0; index < branchCount; index += 1) {
      const key = String(index);
      const list = Array.isArray(rawVariants[key]) ? rawVariants[key].map(cleanVariant).filter(Boolean).slice(0, 20) : [];
      variantsByUserVariant[key] = list;
      let active = Number(turn?.assistant?.activeByUserVariant?.[key] || 0);
      if (!Number.isFinite(active)) active = 0;
      activeByUserVariant[key] = Math.min(Math.max(0, active), Math.max(0, list.length - 1));
    }

    return {
      id: String(turn?.id || crypto.randomUUID()),
      user: { active: userActive, variants: userVariants },
      assistant: { activeByUserVariant, variantsByUserVariant },
    };
  }).filter((turn) => turn.user.variants.length || Object.values(turn.assistant.variantsByUserVariant).some((list) => list.length));
}

function historyFromBody(body) {
  const turns = normalizeHistoryTurns(body.turns || body.history?.turns || []);
  if (turns.length) return { v: 2, updated_at: new Date().toISOString(), turns };
  const messages = normalizeHistoryMessages(body.messages || body.history?.messages || []);
  return { v: 2, updated_at: new Date().toISOString(), turns: flatMessagesToTurns(messages), messages };
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
    if (!raw) return historyJson({ ok: true, history: { v: 2, updated_at: null, turns: [], messages: [] } });
    try {
      const parsed = JSON.parse(raw);
      const turns = parsed.v === 2 && Array.isArray(parsed.turns) ? normalizeHistoryTurns(parsed.turns) : flatMessagesToTurns(parsed.messages || []);
      return historyJson({
        ok: true,
        history: {
          v: 2,
          updated_at: typeof parsed.updated_at === "string" ? parsed.updated_at : null,
          turns,
          messages: normalizeHistoryMessages(parsed.messages || []),
        },
      });
    } catch {
      return historyJson({ ok: true, history: { v: 2, updated_at: null, turns: [], messages: [] } });
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
    const history = historyFromBody(body);
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

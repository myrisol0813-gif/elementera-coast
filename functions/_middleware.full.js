const COOKIE_NAME = "__Host-coast_session";
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const OPENROUTER_REFERER = "https://app.elementeracoast.com";
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models?output_modalities=text,image";
const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
const MAX_LOGIN_BODY_BYTES = 1024;
const MAX_API_BODY_BYTES = 128 * 1024;
const MAX_TOKENS = 700;
const MAX_FORMAL_TOKENS = 2000;
const MAX_CHAT_MESSAGES = 20;
const MAX_CHAT_CONTENT_CHARS = 12000;
const DEFAULT_MODEL = "openai/gpt-4.1-nano";
const MODEL_ALLOWLIST = new Set([
  "openai/gpt-4.1-nano",
  "openai/gpt-4.1-mini",
  "openai/gpt-4o-mini",
]);
const FREE_TEST_MODEL_IDS = [
  "nvidia/nemotron-3-super-120b-a12b:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
];
const MODEL_CATALOG_TTL_MS = 10 * 60 * 1000;
const SECRET_NAME_PARTS = {
  passwordHash: ["COAST", "PASSWORD", "HASH"],
  sessionSecret: ["COAST", "SESSION", "SECRET"],
  openRouterKey: ["OPENROUTER", "API", "KEY"],
};

let modelCatalogCache = null;
let modelCatalogExpiresAt = 0;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function getSecret(env, key) {
  return env[SECRET_NAME_PARTS[key].join("_")];
}

function getRequestOrigin(request) {
  return new URL(request.url).origin;
}

function securityHeaders(extra = {}) {
  return {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    ...extra,
  };
}

function textResponse(body, status = 200, headers = {}) {
  return new Response(body, {
    status,
    headers: securityHeaders({ "Content-Type": "text/plain; charset=UTF-8", ...headers }),
  });
}

function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: securityHeaders({ "Content-Type": "application/json; charset=UTF-8", ...headers }),
  });
}

function redirect(location, headers = {}) {
  return new Response(null, {
    status: 302,
    headers: securityHeaders({ Location: location, ...headers }),
  });
}

function parseCookies(header) {
  const cookies = new Map();
  if (!header) return cookies;

  for (const part of header.split(";")) {
    const splitAt = part.indexOf("=");
    if (splitAt < 0) continue;
    const name = part.slice(0, splitAt).trim();
    const value = part.slice(splitAt + 1).trim();
    if (name) cookies.set(name, value);
  }

  return cookies;
}

function base64UrlEncodeBytes(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecodeBytes(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function base64UrlEncodeText(value) {
  return base64UrlEncodeBytes(encoder.encode(value));
}

function base64UrlDecodeText(value) {
  return decoder.decode(base64UrlDecodeBytes(value));
}

async function importSessionKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function signPayload(payload, secret) {
  const key = await importSessionKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return base64UrlEncodeBytes(new Uint8Array(signature));
}

async function verifySignature(payload, signature, secret) {
  try {
    const key = await importSessionKey(secret);
    return crypto.subtle.verify("HMAC", key, base64UrlDecodeBytes(signature), encoder.encode(payload));
  } catch {
    return false;
  }
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function normalizePasswordHash(value) {
  return String(value || "").trim().toLowerCase().replace(/^sha256:/, "");
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }

  return diff === 0;
}

function isConfigured(env) {
  const expectedHash = normalizePasswordHash(getSecret(env, "passwordHash"));
  const sessionSecret = getSecret(env, "sessionSecret");
  return /^[a-f0-9]{64}$/.test(expectedHash) && typeof sessionSecret === "string" && sessionSecret.length >= 32;
}

async function passwordMatches(password, env) {
  const expectedHash = normalizePasswordHash(getSecret(env, "passwordHash"));
  const actualHash = await sha256Hex(password);
  return timingSafeEqual(actualHash, expectedHash);
}

function sessionCookie(token, maxAge = SESSION_TTL_SECONDS) {
  return `${COOKIE_NAME}=${token}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

function clearSessionCookie() {
  return `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

async function createSession(env) {
  const now = Math.floor(Date.now() / 1000);
  const payload = base64UrlEncodeText(JSON.stringify({ v: 1, iat: now, exp: now + SESSION_TTL_SECONDS }));
  const signature = await signPayload(payload, getSecret(env, "sessionSecret"));
  return `${payload}.${signature}`;
}

async function verifySession(request, env) {
  if (!isConfigured(env)) return null;

  const token = parseCookies(request.headers.get("Cookie")).get(COOKIE_NAME);
  if (!token) return null;

  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const verified = await verifySignature(payload, signature, getSecret(env, "sessionSecret"));
  if (!verified) return null;

  try {
    const session = JSON.parse(base64UrlDecodeText(payload));
    const now = Math.floor(Date.now() / 1000);
    if (session.v !== 1 || typeof session.exp !== "number" || session.exp <= now) return null;
    return session;
  } catch {
    return null;
  }
}

function sameSitePost(request) {
  const requestOrigin = getRequestOrigin(request);
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

function loginPostAllowed(request) {
  const requestOrigin = getRequestOrigin(request);
  const origin = request.headers.get("Origin");
  if (origin) return origin === requestOrigin;

  const referer = request.headers.get("Referer");
  if (!referer) return true;

  try {
    return new URL(referer).origin === requestOrigin;
  } catch {
    return false;
  }
}

async function readTextWithLimit(request, limit) {
  const reader = request.body?.getReader();
  if (!reader) return "";

  const chunks = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) throw new Error("body_too_large");
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return decoder.decode(merged);
}

async function readJsonWithLimit(request) {
  const text = await readTextWithLimit(request, MAX_API_BODY_BYTES);
  if (!text.trim()) return {};
  return JSON.parse(text);
}

function loginPage(message = "") {
  const notice = message ? `<p class="notice">${escapeHtml(message)}</p>` : "";

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Elementera Coast Gate</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #f7efd8;
      background: radial-gradient(circle at 30% 20%, rgba(47, 92, 130, 0.42), transparent 32%), #07090f;
    }
    main {
      width: min(92vw, 380px);
      padding: 28px;
      border: 1px solid rgba(233, 200, 124, 0.26);
      border-radius: 24px;
      background: rgba(9, 13, 22, 0.82);
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
      backdrop-filter: blur(18px);
    }
    h1 { margin: 0 0 8px; font-size: 22px; letter-spacing: 0.04em; }
    p { margin: 0 0 22px; color: rgba(247, 239, 216, 0.72); line-height: 1.6; }
    label { display: block; margin-bottom: 8px; color: rgba(247, 239, 216, 0.82); }
    input {
      width: 100%;
      height: 46px;
      padding: 0 14px;
      border: 1px solid rgba(233, 200, 124, 0.28);
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.06);
      color: #fff8e7;
      font-size: 16px;
      outline: none;
    }
    input:focus { border-color: rgba(233, 200, 124, 0.76); }
    button {
      width: 100%;
      height: 46px;
      margin-top: 18px;
      border: 0;
      border-radius: 14px;
      background: #e9c87c;
      color: #10131c;
      font-weight: 700;
      cursor: pointer;
    }
    .notice { margin: 0 0 16px; color: #ffd9a3; }
  </style>
</head>
<body>
  <main>
    <h1>Elementera Coast</h1>
    <p>这片海岸现在需要先点亮一盏小灯。</p>
    ${notice}
    <form method="post" action="/login" autocomplete="off">
      <label for="password">Password</label>
      <input id="password" name="password" type="password" required autofocus />
      <button type="submit">Enter</button>
    </form>
  </main>
</body>
</html>`;
}

function htmlResponse(html, status = 200, headers = {}) {
  return new Response(html, {
    status,
    headers: securityHeaders({
      "Content-Type": "text/html; charset=UTF-8",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      ...headers,
    }),
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[char]);
}

function unauthorizedFor(request) {
  const pathname = new URL(request.url).pathname;
  if (pathname.startsWith("/api/")) {
    return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
  }
  if (pathname.startsWith("/public/")) {
    return textResponse("Unauthorized\n", 401);
  }
  return redirect(`/login?next=${encodeURIComponent(pathname)}`);
}

async function handleLogin(request, env) {
  if (!isConfigured(env)) {
    return htmlResponse(loginPage("Gate is not configured yet."), 503);
  }

  if (request.method === "GET") {
    const session = await verifySession(request, env);
    if (session) return redirect("/");
    return htmlResponse(loginPage());
  }

  if (request.method !== "POST") {
    return textResponse("Method not allowed\n", 405, { Allow: "GET, POST" });
  }

  let body;
  try {
    body = await readTextWithLimit(request, MAX_LOGIN_BODY_BYTES);
  } catch {
    return textResponse("Request body too large\n", 413);
  }

  const form = new URLSearchParams(body);
  const password = form.get("password") || "";

  if (!(await passwordMatches(password, env))) {
    return htmlResponse(loginPage("Password is incorrect."), 401);
  }

  const token = await createSession(env);
  return redirect("/", { "Set-Cookie": sessionCookie(token) });
}

function handleLogout() {
  return redirect("/login", { "Set-Cookie": clearSessionCookie() });
}

function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 20) {
    throw new Error("invalid_messages");
  }

  return messages.map((message) => {
    if (!message || !["system", "user", "assistant"].includes(message.role)) {
      throw new Error("invalid_role");
    }
    if (typeof message.content !== "string" || message.content.length > 6000) {
      throw new Error("invalid_content");
    }
    return { role: message.role, content: message.content };
  });
}

function validateFormalMessages(messages) {
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > MAX_CHAT_MESSAGES) {
    throw new Error("invalid_messages");
  }

  return messages.map((message) => {
    if (!message || !["user", "assistant"].includes(message.role)) {
      throw new Error("invalid_role");
    }
    if (typeof message.content !== "string" || !message.content.trim() || message.content.length > MAX_CHAT_CONTENT_CHARS) {
      throw new Error("invalid_content");
    }
    return { role: message.role, content: message.content };
  });
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function outputModalities(model) {
  const value = model?.architecture?.output_modalities;
  if (Array.isArray(value)) return value.map((item) => String(item).toLowerCase());
  if (typeof value === "string") return [value.toLowerCase()];
  return [];
}

function hasOutput(model, modality) {
  return outputModalities(model).includes(modality);
}

function lowerModelText(model) {
  return `${model?.id || ""} ${model?.name || ""}`.toLowerCase();
}

function priceIsZero(value) {
  if (value === 0 || value === "0") return true;
  const number = Number(value);
  return Number.isFinite(number) && number === 0;
}

function isFreeModel(model) {
  const pricing = model?.pricing || {};
  return String(model?.id || "").includes(":free") || (priceIsZero(pricing.prompt) && priceIsZero(pricing.completion));
}

function isOpenAiChatModel(model) {
  const id = String(model?.id || "");
  if (!id.startsWith("openai/")) return false;
  if (!hasOutput(model, "text")) return false;

  const haystack = lowerModelText(model);
  const excluded = ["embedding", "embed", "gpt-image", "dall-e", "tts", "whisper", "transcribe", "audio", "moderation"];
  return !excluded.some((word) => haystack.includes(word));
}

function isOpenAiImageCandidate(model, version) {
  const id = String(model?.id || "");
  if (!id.startsWith("openai/")) return false;
  if (!hasOutput(model, "image")) return false;
  return lowerModelText(model).includes(`gpt-image-${version}`);
}

function isFreeTextModel(model) {
  return hasOutput(model, "text") && isFreeModel(model);
}

function safeModel(model, extra = {}) {
  return {
    id: String(model?.id || extra.id || ""),
    name: String(model?.name || extra.name || model?.id || ""),
    context_length: model?.context_length ?? null,
    pricing: model?.pricing || null,
    supported_parameters: Array.isArray(model?.supported_parameters) ? model.supported_parameters : [],
    architecture: model?.architecture || null,
    top_provider: model?.top_provider || null,
    created: model?.created ?? null,
    is_free: Boolean(extra.is_free ?? isFreeModel(model)),
    available: extra.available ?? true,
  };
}

function sortModels(list) {
  return list.sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id)));
}

function chooseDefaultChat(openaiChat) {
  const preferred = [
    "openai/gpt-4.1-mini",
    "openai/gpt-4.1-nano",
    "openai/gpt-4o-mini",
  ];
  for (const id of preferred) {
    if (openaiChat.some((model) => model.id === id)) return id;
  }
  return openaiChat[0]?.id || "";
}

function buildModelCatalog(raw) {
  const list = Array.isArray(raw?.data) ? raw.data : [];

  const openaiChat = sortModels(list.filter(isOpenAiChatModel).map((model) => safeModel(model, { is_free: isFreeModel(model) })));

  const imageTwo = list.filter((model) => isOpenAiImageCandidate(model, 2)).map((model) => safeModel(model, { is_free: isFreeModel(model) }));
  const imageOne = list.filter((model) => isOpenAiImageCandidate(model, 1)).map((model) => safeModel(model, { is_free: isFreeModel(model) }));
  const openaiImage = sortModels(imageTwo.length ? imageTwo : imageOne);

  const freeMap = new Map();
  for (const model of list.filter(isFreeTextModel)) {
    const safe = safeModel(model, { is_free: true });
    freeMap.set(safe.id, safe);
  }
  for (const id of FREE_TEST_MODEL_IDS) {
    if (!freeMap.has(id)) {
      freeMap.set(id, safeModel(null, { id, name: id, is_free: true, available: false }));
    }
  }
  const freeTest = sortModels([...freeMap.values()]);

  return {
    ok: true,
    groups: {
      openai_chat: openaiChat,
      openai_image: openaiImage,
      free_test: freeTest,
    },
    defaults: {
      chat: chooseDefaultChat(openaiChat),
      image: openaiImage[0]?.id || "",
      free: FREE_TEST_MODEL_IDS[0],
    },
    updated_at: new Date().toISOString(),
  };
}

async function fetchModelCatalog(env, force = false) {
  const now = Date.now();
  if (!force && modelCatalogCache && modelCatalogExpiresAt > now) return modelCatalogCache;

  const headers = { "Accept": "application/json" };
  const openRouterKey = getSecret(env, "openRouterKey");
  if (openRouterKey) headers.Authorization = `Bearer ${openRouterKey}`;

  let upstream;
  try {
    upstream = await fetch(OPENROUTER_MODELS_URL, { headers });
  } catch {
    throw new Error("models_fetch_failed");
  }
  if (!upstream.ok) throw new Error("models_fetch_failed");

  let raw;
  try {
    raw = await upstream.json();
  } catch {
    throw new Error("models_parse_failed");
  }

  const catalog = buildModelCatalog(raw);
  modelCatalogCache = catalog;
  modelCatalogExpiresAt = now + MODEL_CATALOG_TTL_MS;
  return catalog;
}

function isImageModelId(modelId, catalog) {
  return catalog.groups.openai_image.some((model) => model.id === modelId) || /gpt-image-|dall-e|image/i.test(modelId);
}

function isAllowedFormalChatModel(modelId, catalog) {
  if (catalog.groups.openai_chat.some((model) => model.id === modelId)) return true;
  if (catalog.groups.free_test.some((model) => model.id === modelId)) return true;
  return false;
}

function findCatalogModel(modelId, catalog) {
  return [
    ...(catalog?.groups?.openai_chat || []),
    ...(catalog?.groups?.free_test || []),
    ...(catalog?.groups?.openai_image || []),
  ].find((model) => model.id === modelId) || null;
}

function supportsParameter(model, name) {
  return Array.isArray(model?.supported_parameters) && model.supported_parameters.includes(name);
}

function shouldSendTemperature(modelId, model) {
  if (Array.isArray(model?.supported_parameters) && model.supported_parameters.length > 0) {
    return supportsParameter(model, "temperature");
  }

  const id = String(modelId || "").toLowerCase();
  if (id.startsWith("openai/o") || id.startsWith("openai/gpt-5") || id.startsWith("openai/o1") || id.startsWith("openai/o3") || id.startsWith("openai/o4")) {
    return false;
  }

  return true;
}

function buildChatPayload(modelId, messages, maxTokens, temperature, model) {
  const payload = {
    model: modelId,
    messages,
    max_completion_tokens: maxTokens,
  };

  if (!String(modelId).startsWith("openai/")) {
    payload.max_tokens = maxTokens;
  }

  if (shouldSendTemperature(modelId, model)) {
    payload.temperature = temperature;
  }

  return payload;
}

function providerMessageFromValue(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value.message === "string") return value.message;
  if (typeof value.error === "string") return value.error;
  if (value.error && typeof value.error.message === "string") return value.error.message;
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function compactPreview(value, max = 160) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

async function readProviderErrorPreview(response) {
  let text = "";
  try {
    text = await response.text();
  } catch {
    return "";
  }

  try {
    const data = JSON.parse(text);
    return compactPreview(providerMessageFromValue(data));
  } catch {
    return compactPreview(text);
  }
}

function normalizeChatError(status, model, providerMessagePreview = "") {
  const lower = providerMessagePreview.toLowerCase();
  let type = "chat_error";
  let message = "消息生成失败，请稍后重试。";

  if (status === 401) {
    type = "auth_error";
    message = "API key 无效或未配置。";
  } else if (status === 402) {
    type = "insufficient_credits";
    message = "OpenRouter 余额或 credits 不足。";
  } else if (status === 403 && lower.includes("not available in your region")) {
    type = "region_unavailable";
    message = "该模型在当前网络地区不可用。可以切换网络出口，或换用其他模型。";
  } else if (status === 403) {
    type = "forbidden";
    message = "当前 key 或账户没有权限使用该模型。";
  } else if (status === 404) {
    type = "model_not_found";
    message = "模型不存在或已下架。";
  } else if (status === 429) {
    type = "rate_limited";
    message = "请求过快或模型限速，请稍后再试。";
  } else if ([502, 503, 504].includes(status)) {
    type = "provider_unavailable";
    message = "上游模型暂时不可用，或 provider 返回失败。可以稍后重试或换模型。";
  }

  return { type, status, message, model, providerMessagePreview };
}

async function handleModels(request, env) {
  if (request.method !== "GET") {
    return jsonResponse({ ok: false, error: "Method not allowed." }, 405, { Allow: "GET" });
  }

  const force = new URL(request.url).searchParams.get("refresh") === "1";
  try {
    const catalog = await fetchModelCatalog(env, force);
    return jsonResponse(catalog);
  } catch {
    return jsonResponse({ ok: false, error: "Model catalog is unavailable." }, 502);
  }
}

async function handleFormalChat(request, env) {
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed." }, 405, { Allow: "POST" });
  }

  const openRouterKey = getSecret(env, "openRouterKey");
  if (!openRouterKey) {
    return jsonResponse({ ok: false, error: normalizeChatError(401, "") }, 503);
  }

  let body;
  try {
    body = await readJsonWithLimit(request);
  } catch (error) {
    const status = error.message === "body_too_large" ? 413 : 400;
    return jsonResponse({ ok: false, error: { type: "invalid_request", status, message: "请求体无效或过大。", model: "" } }, status);
  }

  let catalog;
  try {
    catalog = await fetchModelCatalog(env);
  } catch {
    return jsonResponse({ ok: false, error: normalizeChatError(503, String(body.model || "")) }, 503);
  }

  const requestedModel = String(body.model || catalog.defaults.chat || DEFAULT_MODEL);
  if (isImageModelId(requestedModel, catalog)) {
    return jsonResponse({ ok: false, error: { type: "image_model_not_supported", status: 400, message: "生图模型不能走聊天接口。请切换到聊天模型。", model: requestedModel } }, 400);
  }
  if (!isAllowedFormalChatModel(requestedModel, catalog)) {
    return jsonResponse({ ok: false, error: { type: "model_not_allowed", status: 400, message: "该模型不在当前正式线允许范围内。请从模型箱选择 OpenAI chat 或 Free Test 模型。", model: requestedModel } }, 400);
  }

  let messages;
  try {
    messages = validateFormalMessages(body.messages);
  } catch {
    return jsonResponse({ ok: false, error: { type: "invalid_messages", status: 400, message: "消息格式无效。当前只允许 user / assistant 最近上下文。", model: requestedModel } }, 400);
  }

  const selectedModel = findCatalogModel(requestedModel, catalog);
  const settings = body.settings || {};
  const maxTokens = clampNumber(settings.max_tokens ?? body.max_tokens, 600, 1, MAX_FORMAL_TOKENS);
  const temperature = clampNumber(settings.temperature ?? body.temperature, 0.7, 0, 2);
  const payload = buildChatPayload(requestedModel, messages, maxTokens, temperature, selectedModel);

  let upstream;
  try {
    upstream = await fetch(OPENROUTER_CHAT_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openRouterKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": OPENROUTER_REFERER,
        "X-Title": "Elementera Coast Formal Chat",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    return jsonResponse({ ok: false, error: normalizeChatError(502, requestedModel) }, 502);
  }

  if (!upstream.ok) {
    const providerMessagePreview = await readProviderErrorPreview(upstream);
    const safeError = normalizeChatError(upstream.status, requestedModel, providerMessagePreview);
    const responseStatus = [401, 402, 403, 404, 429].includes(upstream.status) ? upstream.status : 502;
    return jsonResponse({ ok: false, error: safeError }, responseStatus);
  }

  let upstreamData;
  try {
    upstreamData = await upstream.json();
  } catch {
    return jsonResponse({ ok: false, error: normalizeChatError(502, requestedModel) }, 502);
  }

  const choice = upstreamData?.choices?.[0] || {};
  const answer = choice?.message?.content;
  return jsonResponse({
    ok: true,
    model: upstreamData?.model || requestedModel,
    message: {
      role: "assistant",
      content: typeof answer === "string" ? answer : "",
    },
    usage: upstreamData?.usage || null,
    finish_reason: choice?.finish_reason || null,
  });
}

async function handleApi(request, env, session) {
  const url = new URL(request.url);

  if (request.method === "POST" && !sameSitePost(request)) {
    return jsonResponse({ ok: false, error: "Forbidden" }, 403);
  }

  if (url.pathname === "/api/health" && request.method === "GET") {
    return jsonResponse({ ok: true, authenticated: true, ts: new Date().toISOString() });
  }

  if (url.pathname === "/api/session" && request.method === "GET") {
    return jsonResponse({ ok: true, authenticated: true, expires_at: session.exp });
  }

  if (url.pathname === "/api/models") {
    return handleModels(request, env);
  }

  if (url.pathname === "/api/chat") {
    return handleFormalChat(request, env);
  }

  if (url.pathname === "/api/chat-sandbox" && request.method === "POST") {
    const openRouterKey = getSecret(env, "openRouterKey");
    if (!openRouterKey) {
      return jsonResponse({ ok: false, error: "Chat sandbox is not configured." }, 503);
    }

    let body;
    try {
      body = await readJsonWithLimit(request);
    } catch (error) {
      const status = error.message === "body_too_large" ? 413 : 400;
      return jsonResponse({ ok: false, error: "Invalid request body." }, status);
    }

    const model = String(body.model || DEFAULT_MODEL);
    if (!MODEL_ALLOWLIST.has(model)) {
      return jsonResponse({ ok: false, error: "Model is not allowed." }, 400);
    }

    let messages;
    try {
      messages = validateMessages(body.messages);
    } catch {
      return jsonResponse({ ok: false, error: "Invalid messages." }, 400);
    }

    const maxTokens = clampNumber(body.max_tokens, 512, 1, MAX_TOKENS);
    const temperature = clampNumber(body.temperature, 0.7, 0, 1.2);

    let upstream;
    try {
      upstream = await fetch(OPENROUTER_CHAT_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openRouterKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": OPENROUTER_REFERER,
          "X-Title": "Elementera Coast Sandbox",
        },
        body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature }),
      });
    } catch {
      return jsonResponse({ ok: false, error: "Upstream request failed." }, 502);
    }

    if (!upstream.ok) {
      return jsonResponse({ ok: false, error: "Upstream request failed.", upstream_status: upstream.status }, 502);
    }

    let upstreamData;
    try {
      upstreamData = await upstream.json();
    } catch {
      return jsonResponse({ ok: false, error: "Invalid upstream response." }, 502);
    }

    const answer = upstreamData?.choices?.[0]?.message?.content;
    return jsonResponse({
      ok: true,
      model: upstreamData?.model || model,
      message: {
        role: "assistant",
        content: typeof answer === "string" ? answer : "",
      },
    });
  }

  return jsonResponse({ ok: false, error: "Not found" }, 404);
}

function addProtectedHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Vary", "Cookie");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  if (url.pathname === "/login") {
    return handleLogin(request, env);
  }

  if (url.pathname === "/logout") {
    return handleLogout();
  }

  const session = await verifySession(request, env);
  if (!session) {
    return unauthorizedFor(request);
  }

  if (url.pathname.startsWith("/api/")) {
    return handleApi(request, env, session);
  }

  return addProtectedHeaders(await next());
}

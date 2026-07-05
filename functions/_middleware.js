const COOKIE_NAME = "__Host-coast_session";
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const ALLOWED_ORIGIN = "https://app.elementeracoast.com";
const MAX_LOGIN_BODY_BYTES = 1024;
const MAX_API_BODY_BYTES = 16 * 1024;
const MAX_TOKENS = 700;
const DEFAULT_MODEL = "openai/gpt-4.1-nano";
const MODEL_ALLOWLIST = new Set([
  "openai/gpt-4.1-nano",
  "openai/gpt-4.1-mini",
  "openai/gpt-4o-mini",
]);

const encoder = new TextEncoder();
const decoder = new TextDecoder();

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
  const expectedHash = normalizePasswordHash(env.COAST_PASSWORD_HASH);
  return /^[a-f0-9]{64}$/.test(expectedHash) && typeof env.COAST_SESSION_SECRET === "string" && env.COAST_SESSION_SECRET.length >= 32;
}

async function passwordMatches(password, env) {
  const expectedHash = normalizePasswordHash(env.COAST_PASSWORD_HASH);
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
  const signature = await signPayload(payload, env.COAST_SESSION_SECRET);
  return `${payload}.${signature}`;
}

async function verifySession(request, env) {
  if (!isConfigured(env)) return null;

  const token = parseCookies(request.headers.get("Cookie")).get(COOKIE_NAME);
  if (!token) return null;

  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const verified = await verifySignature(payload, signature, env.COAST_SESSION_SECRET);
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
  const origin = request.headers.get("Origin");
  if (origin) return origin === ALLOWED_ORIGIN;

  const referer = request.headers.get("Referer");
  if (!referer) return false;

  try {
    return new URL(referer).origin === ALLOWED_ORIGIN;
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

  if (!sameSitePost(request)) {
    return textResponse("Forbidden\n", 403);
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

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
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

  if (url.pathname === "/api/chat-sandbox" && request.method === "POST") {
    if (!env.OPENROUTER_API_KEY) {
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
      upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": ALLOWED_ORIGIN,
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

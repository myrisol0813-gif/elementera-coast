import { json, readText, redirect, sameOrigin, securityHeaders, text } from './http.js';

const COOKIE_NAME = '__Host-coast_session';
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const MAX_LOGIN_BODY_BYTES = 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function passwordHash(env) {
  return String(env.COAST_PASSWORD_HASH || '').trim().toLowerCase().replace(/^sha256:/, '');
}

function sessionSecret(env) {
  return env.COAST_SESSION_SECRET;
}

function configured(env) {
  return /^[a-f0-9]{64}$/.test(passwordHash(env))
    && typeof sessionSecret(env) === 'string'
    && sessionSecret(env).length >= 32;
}

function parseCookies(header) {
  const cookies = new Map();
  for (const part of String(header || '').split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    if (name) cookies.set(name, part.slice(separator + 1).trim());
  }
  return cookies;
}

function encodeBytes(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBytes(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function importKey(secret) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function sign(payload, secret) {
  const signature = await crypto.subtle.sign('HMAC', await importKey(secret), encoder.encode(payload));
  return encodeBytes(new Uint8Array(signature));
}

async function verify(payload, signature, secret) {
  try {
    return crypto.subtle.verify('HMAC', await importKey(secret), decodeBytes(signature), encoder.encode(payload));
  } catch {
    return false;
  }
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

async function passwordMatches(password, env) {
  return constantTimeEqual(await sha256(password), passwordHash(env));
}

function cookie(token, maxAge = SESSION_TTL_SECONDS) {
  return `${COOKIE_NAME}=${token}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

async function createSession(env) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = encodeBytes(encoder.encode(JSON.stringify({ v: 1, iat: issuedAt, exp: issuedAt + SESSION_TTL_SECONDS })));
  return `${payload}.${await sign(payload, sessionSecret(env))}`;
}

export async function verifySession(request, env) {
  if (!configured(env)) return null;
  const token = parseCookies(request.headers.get('Cookie')).get(COOKIE_NAME);
  if (!token) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature || !(await verify(payload, signature, sessionSecret(env)))) return null;
  try {
    const session = JSON.parse(decoder.decode(decodeBytes(payload)));
    const now = Math.floor(Date.now() / 1000);
    return session.v === 1 && Number(session.exp) > now ? session : null;
  } catch {
    return null;
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function loginPage(message = '') {
  const notice = message ? `<p class="notice">${escapeHtml(message)}</p>` : '';
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Elementera Coast Gate</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;color:#f7efd8;background:radial-gradient(circle at 30% 20%,rgba(47,92,130,.42),transparent 32%),#07090f}main{width:min(92vw,380px);padding:28px;border:1px solid rgba(233,200,124,.26);border-radius:24px;background:rgba(9,13,22,.82);box-shadow:0 24px 80px rgba(0,0,0,.45);backdrop-filter:blur(18px)}h1{margin:0 0 8px;font-size:22px}p{margin:0 0 22px;color:rgba(247,239,216,.72);line-height:1.6}label{display:block;margin-bottom:8px}input,button{width:100%;height:46px;border-radius:14px;font-size:16px}input{padding:0 14px;border:1px solid rgba(233,200,124,.28);background:rgba(255,255,255,.06);color:#fff8e7;outline:0}input:focus{border-color:rgba(233,200,124,.76)}button{margin-top:18px;border:0;background:#e9c87c;color:#10131c;font-weight:700}.notice{margin:0 0 16px;color:#ffd9a3}</style></head><body><main><h1>Elementera Coast</h1><p>这片海岸现在需要先点亮一盏小灯。</p>${notice}<form method="post" action="/login" autocomplete="off"><label for="password">Password</label><input id="password" name="password" type="password" required autofocus><button type="submit">Enter</button></form></main></body></html>`;
}

function html(value, status = 200) {
  return new Response(value, {
    status,
    headers: securityHeaders({
      'Content-Type': 'text/html; charset=UTF-8',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    }),
  });
}

export function unauthorized(request) {
  const pathname = new URL(request.url).pathname;
  if (pathname.startsWith('/api/')) return json({ ok: false, error: 'Unauthorized' }, 401);
  if (pathname.startsWith('/public/')) return text('Unauthorized\n', 401);
  return redirect(`/login?next=${encodeURIComponent(pathname)}`);
}

export async function handleLogin(request, env) {
  if (!configured(env)) return html(loginPage('Gate is not configured yet.'), 503);
  if (request.method === 'GET') return (await verifySession(request, env)) ? redirect('/') : html(loginPage());
  if (request.method !== 'POST') return text('Method not allowed\n', 405, { Allow: 'GET, POST' });
  if (!sameOrigin(request, { allowMissingReferer: true })) return text('Forbidden\n', 403);
  let body;
  try {
    body = await readText(request, MAX_LOGIN_BODY_BYTES);
  } catch {
    return text('Request body too large\n', 413);
  }
  const password = new URLSearchParams(body).get('password') || '';
  if (!(await passwordMatches(password, env))) return html(loginPage('Password is incorrect.'), 401);
  return redirect('/', { 'Set-Cookie': cookie(await createSession(env)) });
}

export function handleLogout() {
  return redirect('/login', { 'Set-Cookie': cookie('', 0) });
}


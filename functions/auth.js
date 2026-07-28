import { json, readText, redirect, securityHeaders, text } from './http.js';

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

function loginRequestAllowed(request) {
  const requestOrigin = new URL(request.url).origin;
  const origin = request.headers.get('Origin');
  if (origin && origin !== 'null') return origin === requestOrigin;
  const referer = request.headers.get('Referer');
  if (!referer) return true;
  try {
    return new URL(referer).origin === requestOrigin;
  } catch {
    return false;
  }
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
  const notice = message ? `<p class="gate-notice" role="alert">${escapeHtml(message)}</p>` : '';
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#ffffff">
  <title>Elementera Coast</title>
  <style>
    :root {
      color-scheme: light;
      --paper: #ffffff;
      --ink: #24252b;
      --gold: #f2b84b;
      --cream: #fff0d8;
      --muted: #9c8872;
      --quiet: #b8afa6;
    }

    * { box-sizing: border-box; }
    html, body { min-height: 100%; }

    body {
      margin: 0;
      min-height: 100svh;
      overflow: hidden;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--ink);
      background: var(--paper);
      -webkit-font-smoothing: antialiased;
      text-rendering: geometricPrecision;
    }

    button, input { font: inherit; }

    .gate {
      min-height: 100svh;
      display: grid;
      place-items: center;
      padding:
        max(24px, env(safe-area-inset-top))
        max(22px, env(safe-area-inset-right))
        max(28px, env(safe-area-inset-bottom))
        max(22px, env(safe-area-inset-left));
    }

    .gate-inner {
      width: min(100%, 390px);
      min-height: min(640px, calc(100svh - 52px));
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }

    .coast-mark {
      width: min(76vw, 310px);
      height: auto;
      overflow: visible;
      flex: none;
    }

    .loop-under,
    .loop {
      fill: none;
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke-dasharray: 1;
      stroke-dashoffset: 1;
    }

    .loop-under { stroke: var(--paper); stroke-width: 40; }
    .loop { stroke: var(--ink); stroke-width: 29; }
    .loop-a { animation: draw-loop .72s cubic-bezier(.3, .75, .25, 1) .05s forwards; }
    .loop-b { animation: draw-loop .72s cubic-bezier(.3, .75, .25, 1) .16s forwards; }
    .loop-c { animation: draw-loop .72s cubic-bezier(.3, .75, .25, 1) .27s forwards; }

    .horn {
      opacity: 0;
      transform-box: fill-box;
      transform-origin: center bottom;
      animation: horn-in .4s cubic-bezier(.2, .9, .3, 1.25) .62s forwards;
    }

    .wolf {
      opacity: 0;
      transform-box: fill-box;
      transform-origin: center;
      animation: wolf-in .45s cubic-bezier(.2, .85, .25, 1.15) .76s forwards;
    }

    .face-line {
      fill: none;
      stroke: var(--gold);
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .brand,
    .tagline {
      opacity: 0;
      transform-box: fill-box;
      transform-origin: center;
      animation: text-in .4s ease-out forwards;
    }

    .brand { animation-delay: 1.02s; }
    .tagline { animation-delay: 1.14s; }

    .mark {
      transform-origin: 195px 260px;
      animation: settle .5s ease-out .98s both;
    }

    .gate-form {
      width: min(78vw, 306px);
      margin-top: 24px;
      opacity: 0;
      transform: translateY(10px);
      pointer-events: none;
      animation: reveal-gate .4s ease-out 1.38s forwards;
    }

    .password-shell {
      height: 52px;
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 0 8px 0 20px;
      background: #ffffff;
      border: 0;
      border-radius: 18px;
      box-shadow:
        0 12px 34px rgba(36, 37, 43, .08),
        0 2px 9px rgba(36, 37, 43, .045);
      transition: box-shadow .2s ease, transform .2s ease;
    }

    .password-shell:focus-within {
      box-shadow:
        0 0 0 3px rgba(242, 184, 75, .16),
        0 14px 36px rgba(36, 37, 43, .09);
    }

    .password-input {
      min-width: 0;
      flex: 1;
      height: 100%;
      padding: 0;
      border: 0;
      outline: 0;
      color: var(--ink);
      background: transparent;
      font-size: 15px;
      letter-spacing: .04em;
      caret-color: var(--gold);
    }

    .password-input::placeholder { color: var(--quiet); opacity: 1; }

    .password-submit {
      width: 38px;
      height: 38px;
      display: grid;
      place-items: center;
      flex: none;
      padding: 0;
      border: 0;
      border-radius: 13px;
      color: var(--ink);
      background: transparent;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }

    .password-submit:active {
      transform: scale(.94);
      background: #f6f4f0;
    }

    .password-submit svg {
      width: 19px;
      height: 19px;
      fill: none;
      stroke: currentColor;
      stroke-width: 2.2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .gate-notice {
      margin: 12px 4px 0;
      color: #aa7550;
      font-size: 13px;
      line-height: 1.5;
      text-align: center;
    }

    @keyframes draw-loop { to { stroke-dashoffset: 0; } }

    @keyframes horn-in {
      from { opacity: 0; transform: translateY(7px) scale(.72); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    @keyframes wolf-in {
      from { opacity: 0; transform: translateY(6px) scale(.9); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    @keyframes text-in {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes settle {
      0% { transform: scale(1); }
      50% { transform: scale(1.012); }
      100% { transform: scale(1); }
    }

    @keyframes reveal-gate {
      to {
        opacity: 1;
        transform: translateY(0);
        pointer-events: auto;
      }
    }

    @media (max-height: 690px) {
      .gate-inner {
        justify-content: flex-start;
        min-height: 0;
        padding-top: 18px;
      }

      .coast-mark { width: min(68vw, 270px); }
      .gate-form { margin-top: 12px; }
    }

    @media (prefers-reduced-motion: reduce) {
      .loop-under,
      .loop,
      .horn,
      .wolf,
      .brand,
      .tagline,
      .mark,
      .gate-form {
        animation: none;
        opacity: 1;
        stroke-dashoffset: 0;
        transform: none;
        pointer-events: auto;
      }
    }
  </style>
</head>
<body>
  <main class="gate">
    <section class="gate-inner" aria-labelledby="coast-brand">
      <svg
        id="coast-splash"
        class="coast-mark"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 390 520"
        role="img"
        aria-labelledby="coast-mark-title coast-mark-desc"
      >
        <title id="coast-mark-title">Elementera Coast 开屏符号</title>
        <desc id="coast-mark-desc">一对金色小角藏在黑色六瓣回声结后方，中央环抱着一只闭眼的小狼。</desc>

        <g class="mark">
          <g aria-label="金色小角">
            <path class="horn" d="M126 166 C127 146 135 130 149 118 C158 135 160 150 157 168 Z" fill="#f2b84b" />
            <path class="horn" d="M264 166 C263 146 255 130 241 118 C232 135 230 150 233 168 Z" fill="#f2b84b" />
          </g>

          <g aria-hidden="true">
            <ellipse class="loop-under loop-a" cx="195" cy="260" rx="113" ry="65" pathLength="1" />
            <ellipse class="loop-under loop-b" cx="195" cy="260" rx="113" ry="65" pathLength="1" transform="rotate(60 195 260)" />
            <ellipse class="loop-under loop-c" cx="195" cy="260" rx="113" ry="65" pathLength="1" transform="rotate(-60 195 260)" />
          </g>

          <g aria-label="六瓣同轨回声结">
            <ellipse class="loop loop-a" cx="195" cy="260" rx="113" ry="65" pathLength="1" />
            <ellipse class="loop loop-b" cx="195" cy="260" rx="113" ry="65" pathLength="1" transform="rotate(60 195 260)" />
            <ellipse class="loop loop-c" cx="195" cy="260" rx="113" ry="65" pathLength="1" transform="rotate(-60 195 260)" />
          </g>

          <g transform="matrix(1 0 0 .8 0 54)">
            <g class="wolf" aria-label="闭眼的小狼">
              <path
                d="M145 238 L157 207 C160 199 167 198 173 204 L188 219 C193 217 197 217 202 219 L217 204 C223 198 230 200 233 208 L245 238 L245 267 C245 278 240 287 231 293 L219 301 C212 306 204 309 195 309 C186 309 178 306 171 301 L159 293 C150 287 145 278 145 267 Z"
                fill="#fff0d8"
              />
              <path d="M161 214 L166 239 L185 225 L171 209 C167 204 163 207 161 214 Z" fill="#f2b84b" />
              <path d="M229 214 L224 239 L205 225 L219 209 C223 204 227 207 229 214 Z" fill="#f2b84b" />
              <path d="M150 250 L130 261 L145 269 L132 280 L155 284 Z" fill="#fff0d8" />
              <path d="M240 250 L260 261 L245 269 L258 280 L235 284 Z" fill="#fff0d8" />
              <path class="face-line" d="M163 260 Q174 271 185 260" stroke-width="5" />
              <path class="face-line" d="M205 260 Q216 271 227 260" stroke-width="5" />
              <path d="M189 276 Q195 272 201 276 Q199 281 195 282 Q191 281 189 276 Z" fill="#f2b84b" />
              <path class="face-line" d="M195 282 Q195 288 187 288 M195 282 Q195 288 203 288" stroke-width="4" />
            </g>
          </g>
        </g>

        <g text-anchor="middle">
          <text
            id="coast-brand"
            class="brand"
            x="195"
            y="430"
            fill="#24252b"
            font-size="25"
            font-weight="650"
            letter-spacing=".8"
          >Elementera Coast</text>
          <text
            class="tagline"
            x="195"
            y="466"
            fill="#9c8872"
            font-size="14"
            font-weight="450"
            letter-spacing="2.4"
          >沿海岸保存回声</text>
        </g>
      </svg>

      <form class="gate-form" method="post" action="/login" autocomplete="off">
        <div class="password-shell">
          <input
            id="password"
            class="password-input"
            name="password"
            type="password"
            required
            autocomplete="current-password"
            placeholder="输入海岸密码"
            aria-label="输入海岸密码"
          >
          <button class="password-submit" type="submit" aria-label="进入海岸">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 12h13" />
              <path d="m13 6 6 6-6 6" />
            </svg>
          </button>
        </div>
        ${notice}
      </form>
    </section>
  </main>
</body>
</html>`;
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
  if (!loginRequestAllowed(request)) return text('Forbidden\n', 403);
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

export const MAX_API_BODY_BYTES = 128 * 1024;

export function securityHeaders(extra = {}) {
  return {
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...extra,
  };
}

export function text(body, status = 200, headers = {}) {
  return new Response(body, {
    status,
    headers: securityHeaders({ 'Content-Type': 'text/plain; charset=UTF-8', ...headers }),
  });
}

export function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: securityHeaders({ 'Content-Type': 'application/json; charset=UTF-8', ...headers }),
  });
}

export function apiError(type, message, status = 400, details = {}) {
  return json({ ok: false, error: { type, message, ...details } }, status);
}

export function redirect(location, headers = {}) {
  return new Response(null, {
    status: 302,
    headers: securityHeaders({ Location: location, ...headers }),
  });
}

export function sameOrigin(request, { allowMissingReferer = false } = {}) {
  const requestOrigin = new URL(request.url).origin;
  const origin = request.headers.get('Origin');
  if (origin) return origin === requestOrigin;
  const referer = request.headers.get('Referer');
  if (!referer) return allowMissingReferer;
  try {
    return new URL(referer).origin === requestOrigin;
  } catch {
    return false;
  }
}

export async function readText(request, limit = MAX_API_BODY_BYTES) {
  const reader = request.body?.getReader();
  if (!reader) return '';
  const chunks = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > limit) {
      const error = new Error('body_too_large');
      error.status = 413;
      throw error;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

export async function readJson(request, limit = MAX_API_BODY_BYTES) {
  const value = await readText(request, limit);
  if (!value.trim()) return {};
  try {
    return JSON.parse(value);
  } catch {
    const error = new Error('invalid_json');
    error.status = 400;
    throw error;
  }
}

export function protectedResponse(response) {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'private, no-store');
  headers.set('Vary', 'Cookie');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'no-referrer');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}


const OPENROUTER_REFERER = 'https://app.elementeracoast.com';
const FREE_MODEL_ALLOWLIST = new Set([
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'poolside/laguna-m.1:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
]);
const DEFAULT_FREE_MODEL = 'nvidia/nemotron-3-super-120b-a12b:free';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    },
  });
}

function sameOrigin(request) {
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

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed.' }, 405);
  }

  if (!sameOrigin(request)) {
    return json({ ok: false, error: 'Forbidden.' }, 403);
  }

  const openRouterKey = env.OPENROUTER_API_KEY;
  if (!openRouterKey) {
    return json({ ok: false, error: 'OpenRouter key is not configured.' }, 503);
  }

  const body = await readJson(request);
  const selectedModel = String(body.model || DEFAULT_FREE_MODEL);
  if (!FREE_MODEL_ALLOWLIST.has(selectedModel)) {
    return json({ ok: false, error: 'Model is not allowed.' }, 400);
  }

  let upstream;
  try {
    upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': OPENROUTER_REFERER,
        'X-Title': 'Elementera Coast Free Sandbox',
      },
      body: JSON.stringify({
        model: selectedModel,
        max_tokens: 96,
        temperature: 0.2,
        messages: [
          {
            role: 'user',
            content: '请用一句中文回复：海岸 API 免费沙盒已连通。',
          },
        ],
      }),
    });
  } catch {
    return json({ ok: false, error: 'Upstream request failed.' }, 502);
  }

  if (!upstream.ok) {
    return json({ ok: false, error: 'Upstream request failed.', status: upstream.status }, 502);
  }

  let upstreamData;
  try {
    upstreamData = await upstream.json();
  } catch {
    return json({ ok: false, error: 'Upstream request failed.' }, 502);
  }

  const answer = upstreamData?.choices?.[0]?.message?.content;
  return json({
    ok: true,
    model: upstreamData?.model || selectedModel,
    message: {
      role: 'assistant',
      content: typeof answer === 'string' ? answer : '',
    },
  });
}

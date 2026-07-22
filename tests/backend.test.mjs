import assert from 'node:assert/strict';
import { handleLogin, unauthorized, verifySession } from '../functions/auth.js';
import { onRequest } from '../functions/_middleware.js';
import {
  ModelRequestError,
  buildModelCatalog,
  normalizeUsage,
  performFormalChat,
  performFormalChatStream,
} from '../functions/models.js';

const encoder = new TextEncoder();
const digest = await crypto.subtle.digest('SHA-256', encoder.encode('coast-password'));
const passwordHash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
const env = {
  COAST_PASSWORD_HASH: passwordHash,
  COAST_SESSION_SECRET: '0123456789abcdef0123456789abcdef',
};

const login = await handleLogin(new Request('https://coast.test/login', {
  method: 'POST',
  headers: { Origin: 'https://coast.test', 'Content-Type': 'application/x-www-form-urlencoded' },
  body: 'password=coast-password',
}), env);
assert.equal(login.status, 302);
assert.equal(login.headers.get('location'), '/');
const cookie = login.headers.get('set-cookie');
assert.match(cookie, /^__Host-coast_session=/);
assert.match(cookie, /HttpOnly; Secure; SameSite=Strict/);

const token = cookie.split(';')[0];
const session = await verifySession(new Request('https://coast.test/', { headers: { Cookie: token } }), env);
assert.equal(session.v, 1);
assert.ok(session.exp > Math.floor(Date.now() / 1000));

const forbidden = await handleLogin(new Request('https://coast.test/login', {
  method: 'POST',
  headers: { Origin: 'https://evil.test' },
  body: 'password=coast-password',
}), env);
assert.equal(forbidden.status, 403);

const opaqueOriginLogin = await handleLogin(new Request('https://coast.test/login', {
  method: 'POST',
  headers: { Origin: 'null', 'Content-Type': 'application/x-www-form-urlencoded' },
  body: 'password=coast-password',
}), env);
assert.equal(opaqueOriginLogin.status, 302);

const opaqueCrossSite = await handleLogin(new Request('https://coast.test/login', {
  method: 'POST',
  headers: { Origin: 'null', Referer: 'https://evil.test/form' },
  body: 'password=coast-password',
}), env);
assert.equal(opaqueCrossSite.status, 403);
assert.equal(unauthorized(new Request('https://coast.test/api/health')).status, 401);
assert.equal(unauthorized(new Request('https://coast.test/')).status, 302);

for (const pathname of [
  '/manifest.json',
  '/public/icons/icon-16.png',
  '/public/icons/icon-32.png',
  '/public/icons/apple-touch-icon.png',
  '/public/icons/icon-192.png',
  '/public/icons/icon-512.png',
  '/public/icons/icon-maskable-512.png',
]) {
  let reachedStaticAsset = false;
  const response = await onRequest({
    request: new Request(`https://coast.test${pathname}`),
    env,
    next: async () => {
      reachedStaticAsset = true;
      return new Response('asset');
    },
  });
  assert.equal(response.status, 200, `${pathname} must remain available to PWA installers`);
  assert.equal(reachedStaticAsset, true, `${pathname} must bypass only the session gate`);
}
const protectedAppAsset = await onRequest({
  request: new Request('https://coast.test/public/app.js'),
  env,
  next: async () => { throw new Error('protected app asset must not bypass the session gate'); },
});
assert.equal(protectedAppAsset.status, 401);
const protectedMainHouse = await onRequest({
  request: new Request('https://coast.test/'),
  env,
  next: async () => { throw new Error('main house must not bypass the session gate'); },
});
assert.equal(protectedMainHouse.status, 302);

const catalog = buildModelCatalog({
  data: [
    { id: 'openai/gpt-4.1-nano', name: 'GPT-4.1 Nano', architecture: { output_modalities: ['text'] }, pricing: { prompt: '0.1', completion: '0.2' } },
    { id: 'openai/gpt-image-2', name: 'GPT Image 2', architecture: { output_modalities: ['image'] }, pricing: { prompt: '0.1', completion: '0.2' } },
    { id: 'vendor/free:free', name: 'Free text', architecture: { output_modalities: ['text'] }, pricing: { prompt: '0', completion: '0' } },
    { id: 'openai/text-embedding-3-small', name: 'Embedding', architecture: { output_modalities: ['text'] }, pricing: { prompt: '0', completion: '0' } },
  ],
});
assert.deepEqual(catalog.groups.openai_chat.map((model) => model.id), ['openai/gpt-4.1-nano']);
assert.deepEqual(catalog.groups.openai_image.map((model) => model.id), ['openai/gpt-image-2']);
assert.ok(catalog.groups.free_test.some((model) => model.id === 'vendor/free:free'));
assert.ok(catalog.groups.free_test.some((model) => model.id === 'nvidia/nemotron-3-super-120b-a12b:free'));
assert.equal(normalizeUsage({ total_tokens: 99 }), null, 'incomplete provider usage must not be treated as real usage');

const originalFetch = globalThis.fetch;
const modelCatalogPayload = {
  data: [{
    id: 'openai/gpt-4.1-nano',
    name: 'GPT-4.1 Nano',
    architecture: { output_modalities: ['text'] },
    pricing: { prompt: '0.1', completion: '0.2' },
    supported_parameters: ['temperature'],
  }],
};
const modelEnv = { OPENROUTER_API_KEY: 'test-key' };
let nonStreamingPayload = null;
let fetchCount = 0;
globalThis.fetch = async (url, options = {}) => {
  fetchCount += 1;
  if (String(url).includes('/models?')) {
    return new Response(JSON.stringify(modelCatalogPayload), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  nonStreamingPayload = JSON.parse(options.body);
  return new Response(JSON.stringify({
    model: 'openai/gpt-4.1-nano',
    choices: [{ message: { role: 'assistant', content: 'JSON reply' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 11, completion_tokens: 3, total_tokens: 14 },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
const nonStreaming = await performFormalChat(modelEnv, {
  model: 'openai/gpt-4.1-nano',
  messages: [{ role: 'user', content: 'hello' }],
  settings: { max_tokens: 100, temperature: 0.2 },
});
assert.equal(fetchCount, 2);
assert.equal('stream' in nonStreamingPayload, false, 'non-streaming path must keep the JSON provider request');
assert.equal(nonStreaming.message.content, 'JSON reply');
assert.deepEqual(nonStreaming.usage, { prompt_tokens: 11, completion_tokens: 3, total_tokens: 14 });
assert.equal(nonStreaming.finish_reason, 'stop');

await performFormalChat(modelEnv, {
  model: 'openai/gpt-4.1-nano',
  messages: [{ role: 'user', content: 'configured output ceiling' }],
  settings: { max_tokens: null, maxOutputTokens: 1234, temperature: 0.2 },
});
assert.equal(nonStreamingPayload.max_completion_tokens, 1234, 'configured output ceiling must be sent to OpenRouter');

let streamingPayload = null;
const streamBytes = [
  ': keepalive\n\n',
  'data: {"id":"gen-1","model":"openai/gpt-4.1-nano","choices":[{"delta":{"content":"海"}}]}\n\n',
  'data: {"id":"gen-1","model":"openai/gpt-4.1-nano","choices":[{"delta":{"content":"岸"}}],"usa',
  'ge":{"prompt_tokens":21,"completion_tokens":2,"total_tokens":23}}\n\n',
  'data: {"id":"gen-1","model":"openai/gpt-4.1-nano","choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
  'data: [DONE]\n\n',
];
globalThis.fetch = async (_url, options = {}) => {
  streamingPayload = JSON.parse(options.body);
  const source = new ReadableStream({
    start(controller) {
      for (const chunk of streamBytes) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(source, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
};
const streamEvents = [];
for await (const item of performFormalChatStream(modelEnv, {
  model: 'openai/gpt-4.1-nano',
  messages: [{ role: 'user', content: 'stream' }],
  settings: { max_tokens: 100, temperature: 0.2 },
})) streamEvents.push(item);
assert.equal(streamingPayload.stream, true);
assert.equal(streamingPayload.stream_options.include_usage, true);
assert.deepEqual(streamEvents.map((item) => item.event), ['meta', 'delta', 'delta', 'usage', 'done']);
assert.deepEqual(streamEvents[0].data, { model: 'openai/gpt-4.1-nano', generation_id: 'gen-1' });
assert.equal(streamEvents.filter((item) => item.event === 'delta').map((item) => item.data.content).join(''), '海岸');
assert.deepEqual(streamEvents.find((item) => item.event === 'usage').data, { prompt_tokens: 21, completion_tokens: 2, total_tokens: 23 });
assert.equal(streamEvents.at(-1).data.finish_reason, 'stop');

let incompleteError = null;
globalThis.fetch = async () => new Response(new ReadableStream({
  start(controller) {
    controller.enqueue(encoder.encode('data: {"id":"gen-cut","model":"openai/gpt-4.1-nano","choices":[{"delta":{"content":"partial"}}]}\n\n'));
    controller.close();
  },
}), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
try {
  for await (const _item of performFormalChatStream(modelEnv, {
    model: 'openai/gpt-4.1-nano', messages: [{ role: 'user', content: 'cut' }],
  })) { /* consume */ }
} catch (error) {
  incompleteError = error;
}
assert.ok(incompleteError instanceof ModelRequestError);
assert.equal(incompleteError.type, 'stream_incomplete');

let providerStreamError = null;
globalThis.fetch = async () => new Response(new ReadableStream({
  start(controller) {
    controller.enqueue(encoder.encode('data: {"error":{"code":503,"message":"secret upstream diagnostic"}}\n\n'));
    controller.close();
  },
}), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
try {
  for await (const _item of performFormalChatStream(modelEnv, {
    model: 'openai/gpt-4.1-nano', messages: [{ role: 'user', content: 'error' }],
  })) { /* consume */ }
} catch (error) {
  providerStreamError = error;
}
assert.equal(providerStreamError.type, 'provider_unavailable');
assert.doesNotMatch(providerStreamError.message, /secret upstream diagnostic/i, 'provider raw stream diagnostics must not leak');

globalThis.fetch = originalFetch;

console.log('backend: ok');

import assert from 'node:assert/strict';
import { handleLogin, unauthorized, verifySession } from '../functions/auth.js';
import { buildModelCatalog } from '../functions/models.js';

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

console.log('backend: ok');

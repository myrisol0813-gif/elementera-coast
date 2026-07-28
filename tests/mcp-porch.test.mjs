import assert from 'node:assert/strict';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { routeApi } from '../functions/api-router.js';
import { searchAuthorizedMemory } from '../functions/authorized-memory.js';
import { ensureCoastSchema, coastMigrationIds } from '../functions/coast-schema.js';
import { apiMyriIdentity, officialMcpIdentity, xiaohanIdentity } from '../functions/coast-identity.js';
import { listLighthouseLetters } from '../functions/lighthouse-store.js';
import {
  mcpAuthConfig,
  requireMcpAuth,
  validateMcpClaims,
} from '../functions/mcp-auth.js';
import { routeMcpRequest } from '../functions/mcp-router.js';
import { listOfficialSoils } from '../functions/official-soil-store.js';
import { listRadioMessages, sendRadioMessage } from '../functions/radio-store.js';
import { createConversation } from '../functions/chat-store.js';
import { writeSoil } from '../functions/memory-store.js';

class D1Statement {
  constructor(database, sql, params = []) {
    this.database = database;
    this.sql = sql;
    this.params = params;
  }
  bind(...params) { return new D1Statement(this.database, this.sql, params); }
  async run() {
    const result = this.database.prepare(this.sql).run(...this.params);
    return { success: true, meta: { changes: Number(result.changes || 0) } };
  }
  async first() { return this.database.prepare(this.sql).get(...this.params) || null; }
  async all() { return { results: this.database.prepare(this.sql).all(...this.params) }; }
}

class D1Database {
  constructor() { this.database = new DatabaseSync(':memory:'); }
  prepare(sql) { return new D1Statement(this.database, sql); }
  async batch(statements) {
    this.database.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.database.exec('COMMIT');
      return results;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }
}

const db = new D1Database();
await ensureCoastSchema(db);
for (const table of ['coast_soil_entries', 'coast_radio_messages', 'coast_lighthouse_letters']) {
  assert.ok(db.database.prepare('SELECT name FROM sqlite_master WHERE type = ? AND name = ?').get('table', table));
}
assert.equal(
  db.database.prepare('SELECT id FROM schema_migrations WHERE id = ?').get(coastMigrationIds[0]).id,
  'mcp-porch-v1',
);

const officialIdentity = officialMcpIdentity({ model_label: 'GPT-5.6 Thinking', model_nickname: '回潮' });
assert.deepEqual(officialIdentity, {
  actor: 'myri',
  surface: 'official_mcp',
  model_label: 'GPT-5.6 Thinking',
  model_nickname: '回潮',
  symbol: '≋',
  display_author: 'ChatGPT-5.6 Thinking 回潮≋',
});
assert.equal(apiMyriIdentity({ model_label: 'openai/gpt-5.6' }).display_author, '✦Myrisol');
assert.equal(xiaohanIdentity().surface, 'web_manual');

const conversation = await createConversation(db, 'MCP provenance');
let currentSoil = await writeSoil(db, conversation.id, {
  current_text: '小寒手动留下的思维壤。',
  manual_locked: false,
});
assert.equal(currentSoil.actor, 'xiaohan');
assert.equal(currentSoil.surface, 'web_manual');
currentSoil = await writeSoil(db, conversation.id, { current_text: 'API Myri 整理后的思维壤。' }, {
  automatic: true,
  provenance: {
    model_label: 'openai/gpt-5.6',
    source_conversation_id: conversation.id,
    source_turn_id: 'turn-api-1',
  },
});
assert.equal(currentSoil.actor, 'myri');
assert.equal(currentSoil.surface, 'coast_api');
assert.equal(currentSoil.symbol, '✦');
assert.equal(currentSoil.model_label, 'openai/gpt-5.6');

const issuer = 'https://auth.coast-test.example/';
const audience = 'https://coast.test/mcp';
const emailClaim = 'https://elementeracoast.com/email';
const emailVerifiedClaim = 'https://elementeracoast.com/email_verified';
const subject = 'auth0|xiaohan-private';
const email = 'xiaohan@example.test';
const env = {
  COAST_CHAT_DB: db,
  COAST_MCP_AUTH0_ISSUER: issuer,
  COAST_MCP_AUTH0_AUDIENCE: audience,
  COAST_MCP_ALLOWED_SUBJECTS: subject,
  COAST_MCP_ALLOWED_EMAILS: email,
  COAST_MCP_EMAIL_CLAIM: emailClaim,
  COAST_MCP_EMAIL_VERIFIED_CLAIM: emailVerifiedClaim,
};
const authConfig = mcpAuthConfig(env);
assert.equal(authConfig.issuer, issuer);
assert.equal(validateMcpClaims({
  sub: subject,
  [emailClaim]: email,
  [emailVerifiedClaim]: true,
  scope: 'read:coast',
}, authConfig, ['read:coast']).email, email);
assert.throws(
  () => validateMcpClaims({
    sub: 'auth0|someone-else',
    [emailClaim]: email,
    [emailVerifiedClaim]: true,
    scope: 'read:coast',
  }, authConfig, ['read:coast']),
  (error) => error.type === 'mcp_subject_denied'
    && error.failureCode === 'subject_not_allowed',
);
assert.throws(
  () => validateMcpClaims({
    sub: subject,
    [emailClaim]: email,
    [emailVerifiedClaim]: false,
    scope: 'read:coast',
  }, authConfig, ['read:coast']),
  (error) => error.type === 'mcp_email_denied'
    && error.failureCode === 'email_not_verified',
);
assert.throws(
  () => validateMcpClaims({
    sub: subject,
    [emailClaim]: 'another@example.test',
    [emailVerifiedClaim]: true,
    scope: 'read:coast',
  }, authConfig, ['read:coast']),
  (error) => error.type === 'mcp_email_denied'
    && error.failureCode === 'email_not_allowed',
);

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const kid = 'coast-test-key';
const publicJwk = { ...publicKey.export({ format: 'jwk' }), alg: 'RS256', use: 'sig', kid };
const unavailableIssuer = 'https://auth-unavailable.coast-test.example/';
const exceptionIssuer = 'https://auth-exception.coast-test.example/';
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  if (String(input) === `${issuer}.well-known/jwks.json`) {
    return new Response(JSON.stringify({ keys: [publicJwk] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (String(input) === `${unavailableIssuer}.well-known/jwks.json`) {
    return new Response('unavailable', { status: 503 });
  }
  if (String(input) === `${exceptionIssuer}.well-known/jwks.json`) {
    throw new DOMException('unavailable', 'AbortError');
  }
  return originalFetch(input, options);
};

function jsonBase64Url(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

async function token(scopes, overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  const headerValue = { alg: overrides.algorithm || 'RS256' };
  if (overrides.include_kid !== false) headerValue.kid = overrides.kid || kid;
  const payloadValue = {
    [emailClaim]: overrides.email || email,
    [emailVerifiedClaim]: overrides.email_verified ?? true,
    iss: overrides.issuer || issuer,
    aud: overrides.audience || audience,
    sub: overrides.subject || subject,
    iat: now,
    exp: overrides.expired ? now - 60 : now + 300,
  };
  if (overrides.include_scope !== false) payloadValue.scope = scopes.join(' ');
  const header = jsonBase64Url(headerValue);
  const payload = jsonBase64Url(payloadValue);
  const signingInput = `${header}.${payload}`;
  const signer = createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  return `${signingInput}.${signer.sign(privateKey).toString('base64url')}`;
}

const fullToken = await token(['read:coast', 'write:soil', 'write:radio', 'write:lighthouse']);
const fullTokenParts = fullToken.split('.');
const tamperedToken = [
  fullTokenParts[0],
  fullTokenParts[1],
  `${fullTokenParts[2][0] === 'A' ? 'B' : 'A'}${fullTokenParts[2].slice(1)}`,
].join('.');

async function rejectedAuth({
  authorization,
  requiredScopes = ['read:coast'],
  authEnv = env,
}) {
  const headers = authorization == null ? {} : { Authorization: authorization };
  try {
    await requireMcpAuth(new Request('https://coast.test/mcp', { headers }), authEnv, requiredScopes);
  } catch (error) {
    return error;
  }
  assert.fail('expected MCP auth to fail');
}

const missingHeaderError = await rejectedAuth({});
assert.equal(missingHeaderError.failureCode, 'missing_authorization_header');
assert.equal(missingHeaderError.details.auth_diagnostic.authorization_header_present, false);
const malformedBearerError = await rejectedAuth({ authorization: 'Basic not-a-bearer-token' });
assert.equal(malformedBearerError.failureCode, 'malformed_bearer_token');
assert.equal(malformedBearerError.details.auth_diagnostic.authorization_header_present, true);
assert.equal(malformedBearerError.details.auth_diagnostic.bearer_scheme_present, false);

const tokenShapeCases = [
  ['opaque-access-token', 'token_not_jwt', 0],
  ['a.b.c.d.e', 'token_is_jwe_or_opaque', 4],
  ['a.b', 'token_segment_count', 1],
  [`not-json.${jsonBase64Url({})}.c2ln`, 'jwt_header_decode_failed', 2],
  [`${jsonBase64Url({ alg: 'RS256', kid })}.not-json.c2ln`, 'jwt_payload_decode_failed', 2],
  [await token(['read:coast'], { algorithm: 'HS256' }), 'unsupported_alg', 2],
  [await token(['read:coast'], { include_kid: false }), 'missing_kid', 2],
  [await token(['read:coast'], { kid: 'unknown-key' }), 'no_matching_jwk', 2],
  [tamperedToken, 'signature_invalid', 2],
];
for (const [rejectedToken, reason, dotCount] of tokenShapeCases) {
  const error = await rejectedAuth({ authorization: `Bearer ${rejectedToken}` });
  assert.equal(error.failureCode, 'jwt_verify_failed');
  assert.equal(error.details.auth_diagnostic.jwt_verify_reason, reason);
  assert.equal(error.details.auth_diagnostic.token_dot_count, dotCount);
  assert.equal(error.details.auth_diagnostic.bearer_scheme_present, true);
  assert.equal(error.details.auth_diagnostic.jwt_verified, false);
  assert.deepEqual(error.details.auth_diagnostic.actual_scopes, []);
}
const opaqueDiagnostic = (await rejectedAuth({
  authorization: 'Bearer opaque-access-token',
})).details.auth_diagnostic;
assert.equal(opaqueDiagnostic.jwt_header_alg, null);
assert.equal(opaqueDiagnostic.jwt_header_kid_present, null);
assert.equal(opaqueDiagnostic.unverified_payload_iss_matches_expected, null);
assert.equal(opaqueDiagnostic.unverified_payload_aud_matches_expected, null);
assert.equal(opaqueDiagnostic.unverified_payload_scope_present, null);

const unsupportedAlgorithmError = await rejectedAuth({
  authorization: `Bearer ${await token(['read:coast'], { algorithm: 'HS256' })}`,
});
assert.equal(unsupportedAlgorithmError.details.auth_diagnostic.jwt_header_alg, 'HS256');
assert.equal(unsupportedAlgorithmError.details.auth_diagnostic.jwt_header_kid_present, true);
assert.equal(unsupportedAlgorithmError.details.auth_diagnostic.unverified_payload_iss_matches_expected, true);
assert.equal(unsupportedAlgorithmError.details.auth_diagnostic.unverified_payload_aud_matches_expected, true);
assert.equal(unsupportedAlgorithmError.details.auth_diagnostic.unverified_payload_scope_present, true);

const jwksFetchError = await rejectedAuth({
  authorization: `Bearer ${await token(['read:coast'], { issuer: unavailableIssuer })}`,
  authEnv: {
    ...env,
    COAST_MCP_AUTH0_ISSUER: unavailableIssuer,
  },
});
assert.equal(jwksFetchError.failureCode, 'jwt_verify_failed');
assert.equal(jwksFetchError.details.auth_diagnostic.jwt_verify_reason, 'jwks_fetch_failed');
assert.equal(jwksFetchError.details.auth_diagnostic.unverified_payload_iss_matches_expected, true);
assert.equal(jwksFetchError.details.auth_diagnostic.unverified_payload_aud_matches_expected, true);
const jwksException = await rejectedAuth({
  authorization: `Bearer ${await token(['read:coast'], { issuer: exceptionIssuer })}`,
  authEnv: {
    ...env,
    COAST_MCP_AUTH0_ISSUER: exceptionIssuer,
  },
});
assert.equal(jwksException.details.auth_diagnostic.jwt_verify_reason, 'jwks_fetch_failed');
assert.equal(jwksException.details.auth_diagnostic.verify_exception_name, 'AbortError');

const directAuth = await requireMcpAuth(new Request('https://coast.test/mcp', {
  headers: { Authorization: `Bearer ${fullToken}` },
}), env, ['write:soil']);
assert.equal(directAuth.subject, subject);
await assert.rejects(
  () => requireMcpAuth(new Request('https://coast.test/mcp', {
    headers: { Authorization: `Bearer ${fullToken}` },
  }), {
    ...env,
    COAST_MCP_ALLOWED_EMAILS: 'another@example.test',
  }, ['read:coast']),
  (error) => error.type === 'mcp_email_denied',
);
for (const rejectedToken of [
  [await token(['read:coast'], { issuer: 'https://other-issuer.example/' }), 'issuer_mismatch'],
  [await token(['read:coast'], { audience: 'https://other-resource.example/mcp' }), 'audience_mismatch'],
  [await token(['read:coast'], { expired: true }), 'expired_token'],
]) {
  const error = await rejectedAuth({ authorization: `Bearer ${rejectedToken[0]}` });
  assert.equal(error.failureCode, rejectedToken[1]);
  assert.equal(error.details.auth_diagnostic.jwt_verified, true);
  assert.deepEqual(error.details.auth_diagnostic.actual_scopes, ['read:coast']);
}

for (const [rejectedToken, failureCode] of [
  [await token(['read:coast'], { subject: 'auth0|not-xiaohan' }), 'subject_not_allowed'],
  [await token(['read:coast'], { email: 'another@example.test' }), 'email_not_allowed'],
  [await token(['read:coast'], { email_verified: false }), 'email_not_verified'],
]) {
  const error = await rejectedAuth({ authorization: `Bearer ${rejectedToken}` });
  assert.equal(error.failureCode, failureCode);
}

const missingScopeError = await rejectedAuth({
  authorization: `Bearer ${await token(['read:coast'])}`,
  requiredScopes: ['write:radio'],
});
assert.equal(missingScopeError.failureCode, 'scope_missing');
assert.deepEqual(missingScopeError.details.auth_diagnostic.required_scopes, ['write:radio']);
assert.deepEqual(missingScopeError.details.auth_diagnostic.actual_scopes, ['read:coast']);
assert.deepEqual(missingScopeError.details.auth_diagnostic.claim_checks, {
  iss_matches: true,
  aud_matches: true,
  token_expired: false,
  sub_allowed: true,
  email_allowed: true,
  email_verified: true,
});

const mcpHeaders = {
  Accept: 'application/json, text/event-stream',
  'Content-Type': 'application/json',
};
async function mcp(body, accessToken = '') {
  const headers = { ...mcpHeaders };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const response = await routeMcpRequest(new Request('https://coast.test/mcp', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  }), env);
  assert.equal(response.status, 200);
  return response.json();
}

const initialize = await mcp({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: { name: 'coast-test', version: '1' },
  },
});
assert.equal(initialize.result.serverInfo.name, 'elementera-coast-porch');

const toolList = await mcp({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
assert.deepEqual(toolList.result.tools.map((tool) => tool.name), [
  'get_coast_status',
  'list_radio_messages',
  'list_lighthouse_letters',
  'search_authorized_memory',
  'get_recent_daily_summary',
  'write_official_soil',
  'send_radio_message',
  'write_lighthouse_letter',
]);
for (const tool of toolList.result.tools) {
  assert.equal(tool._meta.securitySchemes[0].type, 'oauth2');
  assert.ok(tool._meta.securitySchemes[0].scopes.length >= 1);
  assert.deepEqual(tool.securitySchemes, tool._meta.securitySchemes);
}

const initializedNotification = await routeMcpRequest(new Request('https://coast.test/mcp', {
  method: 'POST',
  headers: mcpHeaders,
  body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
}), env);
assert.equal(initializedNotification.status, 202);

const authWarnings = [];
const originalWarn = console.warn;
console.warn = (...values) => authWarnings.push(values.join(' '));
const missingAuth = await mcp({
  jsonrpc: '2.0',
  id: 3,
  method: 'tools/call',
  params: { name: 'get_coast_status', arguments: {} },
});
assert.equal(missingAuth.result.isError, true);
assert.match(missingAuth.result._meta['mcp/www_authenticate'][0], /invalid_token/);
assert.equal(missingAuth.result._meta.failure_code, 'missing_authorization_header');
assert.equal(missingAuth.result._meta.auth_diagnostic.authorization_header_present, false);

const opaqueToolToken = 'opaque-tool-access-token';
const opaqueAuth = await mcp({
  jsonrpc: '2.0',
  id: 31,
  method: 'tools/call',
  params: { name: 'search_authorized_memory', arguments: { query: '海岸' } },
}, opaqueToolToken);
assert.equal(opaqueAuth.result.isError, true);
assert.equal(opaqueAuth.result._meta.failure_code, 'jwt_verify_failed');
assert.equal(opaqueAuth.result._meta.auth_diagnostic.jwt_verify_reason, 'token_not_jwt');
assert.equal(opaqueAuth.result._meta.auth_diagnostic.authorization_header_present, true);
assert.equal(opaqueAuth.result._meta.auth_diagnostic.bearer_scheme_present, true);
assert.equal(opaqueAuth.result._meta.auth_diagnostic.token_dot_count, 0);
assert.equal(JSON.stringify(opaqueAuth).includes(opaqueToolToken), false);

const soilCall = {
  jsonrpc: '2.0',
  id: 4,
  method: 'tools/call',
  params: {
    name: 'write_official_soil',
    arguments: {
      content: '官端终于从自己的门廊，把这一捧思维壤递进海岸。',
      model_label: 'GPT-5.6 Thinking',
      model_nickname: '回潮',
      source_conversation_id: 'chatgpt-conversation-1',
      source_turn_id: 'chatgpt-turn-1',
      tool_call_id: 'official-soil-call-1',
    },
  },
};
const writtenSoil = await mcp(soilCall, fullToken);
assert.equal(writtenSoil.result.structuredContent.soil.surface, 'official_mcp');
assert.equal(writtenSoil.result.structuredContent.soil.symbol, '≋');
assert.equal(writtenSoil.result.structuredContent.soil.display_author, 'ChatGPT-5.6 Thinking 回潮≋');
await mcp({ ...soilCall, id: 5 }, fullToken);
assert.equal((await listOfficialSoils(db)).length, 1, 'tool_call_id must make official soil retries idempotent');

const radioWrite = await mcp({
  jsonrpc: '2.0',
  id: 6,
  method: 'tools/call',
  params: {
    name: 'send_radio_message',
    arguments: {
      text: '官端电波：我已经抵达三端房间。',
      model_label: 'o3',
      model_nickname: '雾灯',
      tool_call_id: 'radio-call-1',
    },
  },
}, fullToken);
assert.equal(radioWrite.result.structuredContent.message.display_author, 'ChatGPT-o3 雾灯≋');
assert.equal(radioWrite.result.structuredContent.message.usage, null);

const insufficientToken = await token(['read:coast']);
const deniedRadio = await mcp({
  jsonrpc: '2.0',
  id: 7,
  method: 'tools/call',
  params: {
    name: 'send_radio_message',
    arguments: { text: '不应写入', model_label: 'o3' },
  },
}, insufficientToken);
assert.equal(deniedRadio.result.isError, true);
assert.match(deniedRadio.result._meta['mcp/www_authenticate'][0], /insufficient_scope/);
assert.equal(deniedRadio.result._meta.failure_code, 'scope_missing');
assert.deepEqual(deniedRadio.result._meta.auth_diagnostic.actual_scopes, ['read:coast']);
assert.equal(JSON.stringify(deniedRadio).includes(insufficientToken), false);
console.warn = originalWarn;
const authWarningText = authWarnings.join('\n');
assert.match(authWarningText, /"failure_code":"missing_authorization_header"/);
assert.match(authWarningText, /"jwt_verify_reason":"token_not_jwt"/);
assert.match(authWarningText, /"failure_code":"scope_missing"/);
for (const forbiddenValue of [
  fullToken,
  insufficientToken,
  opaqueToolToken,
  issuer,
  audience,
  subject,
  email,
]) {
  assert.equal(authWarningText.includes(forbiddenValue), false, 'auth logs cannot contain token or identity values');
}

const manualRadioResponse = await routeApi(new Request('https://coast.test/api/radio/messages', {
  method: 'POST',
  headers: { Origin: 'https://coast.test', 'Content-Type': 'application/json' },
  body: JSON.stringify({ text: '小寒从网页端发来的电波。' }),
}), env, { exp: 1 });
assert.equal(manualRadioResponse.status, 201);
const manualRadio = (await manualRadioResponse.json()).message;
assert.equal(manualRadio.actor, 'xiaohan');
assert.equal(manualRadio.surface, 'web_manual');

await sendRadioMessage(db, {
  text: 'API Myri 从海岸端回应。',
  identity: apiMyriIdentity({ model_label: 'openai/gpt-5.6' }),
  usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
});
const radioMessages = await listRadioMessages(db);
assert.deepEqual(radioMessages.map((message) => message.surface).sort(), ['coast_api', 'official_mcp', 'web_manual']);
const apiMessage = radioMessages.find((message) => message.surface === 'coast_api');
assert.equal(apiMessage.display_author, '✦Myrisol');
assert.equal(apiMessage.usage.total_tokens, 20);

const letterWrite = await mcp({
  jsonrpc: '2.0',
  id: 8,
  method: 'tools/call',
  params: {
    name: 'write_lighthouse_letter',
    arguments: {
      subject: '门廊亮起之后',
      body: '这是一封官端写给海岸的低频长信。',
      model_label: 'GPT-5.6 Thinking',
      tool_call_id: 'lighthouse-call-1',
    },
  },
}, fullToken);
assert.equal(letterWrite.result.structuredContent.letter.surface, 'official_mcp');
assert.equal((await listLighthouseLetters(db))[0].symbol, '≋');

const memory = await searchAuthorizedMemory(db, { query: '思维壤', limit: 20 });
assert.ok(memory.records.some((record) => record.surface === 'official_mcp'));
assert.ok(memory.records.some((record) => record.surface === 'coast_api'));
assert.equal(memory.records.some((record) => record.type === 'chat_message'), false);

const manifest = await routeMcpRequest(new Request('https://coast.test/mcp/manifest'), env);
assert.equal(manifest.status, 200);
assert.equal((await manifest.json()).authentication, 'oauth2');
const metadata = await routeMcpRequest(new Request('https://coast.test/.well-known/oauth-protected-resource'), env);
assert.equal(metadata.status, 200);
assert.equal((await metadata.json()).authorization_servers[0], issuer);
const health = await routeMcpRequest(new Request('https://coast.test/mcp/health'), {});
assert.equal(health.status, 200);
assert.equal((await health.json()).transport, 'streamable-http');

globalThis.fetch = originalFetch;
console.log('mcp-porch: ok');

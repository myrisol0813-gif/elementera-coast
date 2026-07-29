import assert from 'node:assert/strict';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { routeApi } from '../functions/api-router.js';
import { searchAuthorizedMemory } from '../functions/authorized-memory.js';
import { ensureCoastSchema, coastMigrationIds } from '../functions/coast-schema.js';
import { apiMyriIdentity, officialMcpIdentity, xiaohanIdentity } from '../functions/coast-identity.js';
import { listLighthouseLetters } from '../functions/lighthouse-store.js';
import {
  listContentDrafts,
  listDiaries,
  listMoments,
  listSummaries,
} from '../functions/daily-store.js';
import {
  mcpAuthConfig,
  requireMcpAuth,
  validateMcpClaims,
} from '../functions/mcp-auth.js';
import { routeMcpRequest } from '../functions/mcp-router.js';
import { listOfficialSoils } from '../functions/official-soil-store.js';
import { listRadioMessages } from '../functions/radio-store.js';
import { createConversation, listConversations } from '../functions/chat-store.js';
import { writeSoil } from '../functions/memory-store.js';
import { buildCrossSurfaceContext } from '../functions/cross-surface-recall.js';
import {
  buildRoomMemoryContext,
  listRoomMemory,
  writeRoomMemory,
} from '../functions/room-memory.js';

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
assert.equal(
  db.database.prepare('SELECT id FROM schema_migrations WHERE id = ?').get(coastMigrationIds[1]).id,
  'radio-withdraw-v1',
);
assert.equal(
  db.database.prepare('SELECT id FROM schema_migrations WHERE id = ?').get(coastMigrationIds[2]).id,
  'owner-cleanup-v1',
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
assert.equal(apiMyriIdentity({ model_label: 'openai/gpt-5.6' }).display_author, '海岸 API ✦');
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
  OPENROUTER_API_KEY: 'test-key',
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
const invalidJsonIssuer = 'https://auth-invalid-json.coast-test.example/';
const emptyKeysIssuer = 'https://auth-empty-keys.coast-test.example/';
const jwksRequests = [];
const providerRequests = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  if (String(input) === `${issuer}.well-known/jwks.json`) {
    jwksRequests.push({ url: String(input), options });
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
  if (String(input) === `${invalidJsonIssuer}.well-known/jwks.json`) {
    return new Response('not-json', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (String(input) === `${emptyKeysIssuer}.well-known/jwks.json`) {
    return new Response(JSON.stringify({ keys: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (String(input).includes('/models?')) {
    return new Response(JSON.stringify({
      data: [{
        id: 'openai/gpt-4.1-nano',
        name: 'GPT-4.1 Nano',
        architecture: { output_modalities: ['text'] },
        pricing: { prompt: '0.1', completion: '0.2' },
        supported_parameters: ['temperature', 'response_format', 'tools'],
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (String(input).includes('/chat/completions')) {
    const payload = JSON.parse(options.body);
    providerRequests.push(payload);
    const summary = payload.response_format?.type === 'json_object';
    const roomMemory = payload.response_format?.json_schema?.name === 'radio_room_memory';
    return new Response(JSON.stringify({
      model: 'openai/gpt-4.1-nano',
      choices: [{
        message: {
          role: 'assistant',
          content: roomMemory
            ? JSON.stringify({
              current_text: '海岸 API 侧已经听见小寒和官端的电波。',
              hand_seeds: [{
                name: '三侧来源分开',
                life_core: '海岸 API 只更新自己的房间思维壤。',
                usage_hint: '继续三端对话时承接。',
                avoid_hint: '不覆盖官端或小寒侧。',
              }],
              do_not_repeat: '',
              pocket_candidates: [],
            })
            : summary
            ? JSON.stringify({
              summary: { text: '官端候选总结。', anchors: ['三端房间'], unresolved: [] },
              diary: { weather: '未标注', mood: '安心', text: '今天把官端日报接口接通了。', image_refs: [] },
              moment_candidates: [{
                text: '官端日报接口已经接通。',
                status: 'candidate',
                reason: '值得留作海岸锚点。',
                image_refs: [],
              }],
              album_candidates: [{
                image_ref: 'coast://mcp/summary-light.png',
                category: 'together',
                caption: '总结候选里的稳定图片引用。',
              }],
            })
            : '✦ API Myri 已经在三端电波房回应。',
        },
        finish_reason: 'stop',
      }],
      usage: { prompt_tokens: 60, completion_tokens: 20, total_tokens: 80 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
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
assert.equal(mcpAuthConfig({
  ...env,
  COAST_MCP_AUTH0_ISSUER: `${issuer}///`,
}).issuer, issuer, 'issuer trailing slashes must normalize to one slash');

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
assert.equal(jwksFetchError.details.auth_diagnostic.jwks_failure_reason, 'jwks_http_status');
assert.equal(jwksFetchError.details.auth_diagnostic.jwks_url_valid, true);
assert.equal(jwksFetchError.details.auth_diagnostic.jwks_http_status, 503);
assert.equal(jwksFetchError.details.auth_diagnostic.jwks_fetch_exception_name, null);
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
assert.equal(jwksException.details.auth_diagnostic.jwks_failure_reason, 'jwks_fetch_exception_name');
assert.equal(jwksException.details.auth_diagnostic.jwks_url_valid, true);
assert.equal(jwksException.details.auth_diagnostic.jwks_http_status, null);
assert.equal(jwksException.details.auth_diagnostic.verify_exception_name, 'AbortError');
assert.equal(jwksException.details.auth_diagnostic.jwks_fetch_exception_name, 'AbortError');
const jwksJsonError = await rejectedAuth({
  authorization: `Bearer ${await token(['read:coast'], { issuer: invalidJsonIssuer })}`,
  authEnv: {
    ...env,
    COAST_MCP_AUTH0_ISSUER: invalidJsonIssuer,
  },
});
assert.equal(jwksJsonError.details.auth_diagnostic.jwt_verify_reason, 'jwks_fetch_failed');
assert.equal(jwksJsonError.details.auth_diagnostic.jwks_failure_reason, 'jwks_json_parse_failed');
assert.equal(jwksJsonError.details.auth_diagnostic.jwks_http_status, 200);
assert.equal(jwksJsonError.details.auth_diagnostic.jwks_fetch_exception_name, 'SyntaxError');
const jwksEmptyKeys = await rejectedAuth({
  authorization: `Bearer ${await token(['read:coast'], { issuer: emptyKeysIssuer })}`,
  authEnv: {
    ...env,
    COAST_MCP_AUTH0_ISSUER: emptyKeysIssuer,
  },
});
assert.equal(jwksEmptyKeys.details.auth_diagnostic.jwt_verify_reason, 'jwks_fetch_failed');
assert.equal(jwksEmptyKeys.details.auth_diagnostic.jwks_failure_reason, 'jwks_empty_keys');
assert.equal(jwksEmptyKeys.details.auth_diagnostic.jwks_http_status, 200);
assert.equal(jwksEmptyKeys.details.auth_diagnostic.jwks_usable_key_count, 0);

const directAuth = await requireMcpAuth(new Request('https://coast.test/mcp', {
  headers: { Authorization: `Bearer ${fullToken}` },
}), env, ['write:soil']);
assert.equal(directAuth.subject, subject);
assert.equal(jwksRequests[0].url, `${issuer}.well-known/jwks.json`);
assert.deepEqual(jwksRequests[0].options, {
  headers: { accept: 'application/json' },
});
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
  'list_daily_moments',
  'create_moment_draft',
  'list_daily_diaries',
  'create_diary_draft',
  'list_daily_albums',
  'save_mcp_album_item',
  'run_daily_summary_candidate',
  'commit_daily_summary_after_confirmation',
]);
for (const tool of toolList.result.tools) {
  assert.equal(tool._meta.securitySchemes[0].type, 'oauth2');
  assert.ok(tool._meta.securitySchemes[0].scopes.length >= 1);
  assert.deepEqual(tool.securitySchemes, tool._meta.securitySchemes);
}
const lighthouseTraceTool = toolList.result.tools.find((tool) => tool.name === 'write_official_soil');
assert.equal(lighthouseTraceTool.title, '写入灯塔巡迹');
assert.match(lighthouseTraceTool.description, /Lighthouse Trace/);
assert.equal(lighthouseTraceTool._meta['openai/toolInvocation/invoked'], '灯塔巡迹已写入');

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
const officialSoilApiResponse = await routeApi(new Request('https://coast.test/api/memory/official-soils?q=%E5%AE%98%E7%AB%AF%E5%9B%9E%E6%BD%AE'), env, { exp: 1 });
const officialSoilApi = await officialSoilApiResponse.json();
assert.equal(officialSoilApiResponse.status, 200);
assert.equal(officialSoilApi.soils[0].id, writtenSoil.result.structuredContent.soil.id);
assert.equal(officialSoilApi.soils[0].surface, 'official_mcp');
assert.equal(officialSoilApi.soils[0].symbol, '≋');
assert.equal(officialSoilApi.soils[0].display_author, 'ChatGPT-5.6 Thinking 回潮≋');
assert.equal(officialSoilApi.soils[0].model_nickname, '回潮');
assert.equal(officialSoilApi.soils[0].title, '灯塔巡迹');

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
      room_memory: {
        current_text: '官端刚刚抵达三端电波房，正在等小寒与海岸 API 侧回应。',
        hand_seeds: [{
          name: '三端互不冒充',
          life_core: '小寒、海岸 API ✦、官端 ≋ 各自保留来源。',
          usage_hint: '讨论跨端关系时使用。',
          avoid_hint: '不要混成同一个账号。',
        }],
        do_not_repeat: '',
        pocket_candidates: [{
          candidate_id: 'radio-three-sides',
          title: '三端来源分离',
          life_core: '三端互相听见但身份分开。',
          content: '电波房保留三端来源。',
          usage_hint: '确认跨端锚点时使用。',
          avoid_hint: '确认前不当作正式事实。',
          source_excerpt: '官端抵达三端房间。',
        }],
      },
    },
  },
}, fullToken);
assert.equal(radioWrite.result.structuredContent.message.display_author, 'ChatGPT-o3 雾灯≋');
assert.equal(radioWrite.result.structuredContent.message.usage, null);
assert.equal(
  radioWrite.result.structuredContent.room_memory.soil.surface,
  'official_mcp',
);
assert.equal(radioWrite.result.structuredContent.room_memory.pockets.created, 1);

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

const deniedOwnerNoteResponse = await routeApi(new Request(
  'https://coast.test/api/radio/memory/owner-note',
  {
    method: 'PUT',
    headers: { Origin: 'https://coast.test', 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: '模型不可以替小寒写神秘狗话。' }),
  },
), env, null);
assert.equal(deniedOwnerNoteResponse.status, 401);

const radioOwnerNoteResponse = await routeApi(new Request(
  'https://coast.test/api/radio/memory/owner-note',
  {
    method: 'PUT',
    headers: { Origin: 'https://coast.test', 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: '这个房间先按小寒写下的神秘狗话理解。' }),
  },
), env, { exp: 1 });
assert.equal(radioOwnerNoteResponse.status, 200);
const radioOwnerNote = (await radioOwnerNoteResponse.json()).owner_note;
assert.equal(radioOwnerNote.label, '小寒侧 · 神秘狗话');
assert.equal(radioOwnerNote.text, '这个房间先按小寒写下的神秘狗话理解。');
assert.equal(radioOwnerNote.handwritten, true);
assert.equal(radioOwnerNote.priority, 'before_automatic_soil');
assert.equal(radioOwnerNote.becomes_long_term_memory, false);

const radioRoomMemoryBeforeReply = await listRoomMemory(db, 'radio');
assert.deepEqual(
  radioRoomMemoryBeforeReply.participants,
  ['web_manual', 'coast_api', 'official_mcp'],
);
assert.equal(radioRoomMemoryBeforeReply.sources.web_manual.soil.manual_locked, true);
assert.equal(radioRoomMemoryBeforeReply.sources.web_manual.soil.auto_refresh_enabled, false);
const radioApiContext = await buildRoomMemoryContext(
  env,
  'radio',
  'coast_api',
  '小寒从网页端发来的电波。',
);
assert.match(radioApiContext.context, /小寒侧 · 神秘狗话/);
assert.match(radioApiContext.context, /这个房间先按小寒写下的神秘狗话理解/);
assert.match(radioApiContext.context, /优先于模型自动滚动思维壤/);
await assert.rejects(
  () => writeRoomMemory(db, 'radio', xiaohanIdentity(), {
    current_text: '不应从模型房间记忆路径写入。',
  }),
  (error) => error.type === 'owner_note_endpoint_required' && error.status === 403,
);

const apiRadioResponse = await routeApi(new Request('https://coast.test/api/radio/ask-api-myri', {
  method: 'POST',
  headers: { Origin: 'https://coast.test', 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: 'openai/gpt-4.1-nano' }),
}), env, { exp: 1 });
assert.equal(apiRadioResponse.status, 201);
const apiRadio = await apiRadioResponse.json();
assert.equal(apiRadio.message.surface, 'coast_api');
assert.equal(apiRadio.message.display_author, '海岸 API ✦');
assert.equal(apiRadio.room_memory_updated, true);
assert.ok(
  providerRequests.some((payload) => JSON.stringify(payload.messages)
    .includes('这个房间先按小寒写下的神秘狗话理解')),
  'radio API reply context must include Xiaohan’s higher-priority handwritten note',
);
const radioReadResponse = await routeApi(new Request('https://coast.test/api/radio/messages'), env, { exp: 1 });
assert.equal(radioReadResponse.status, 200);
assert.equal((await radioReadResponse.json()).messages.length, 3);
const radioMessages = await listRadioMessages(db);
assert.deepEqual(radioMessages.map((message) => message.surface).sort(), ['coast_api', 'official_mcp', 'web_manual']);
const apiMessage = radioMessages.find((message) => message.surface === 'coast_api');
assert.equal(apiMessage.display_author, '海岸 API ✦');
assert.equal(apiMessage.usage.total_tokens, 80);
const mcpRadioRead = await mcp({
  jsonrpc: '2.0',
  id: 71,
  method: 'tools/call',
  params: { name: 'list_radio_messages', arguments: {} },
}, fullToken);
assert.deepEqual(
  mcpRadioRead.result.structuredContent.messages.map((message) => message.surface).sort(),
  ['coast_api', 'official_mcp', 'web_manual'],
);
assert.equal(
  mcpRadioRead.result.structuredContent.room_memory.sources.official_mcp.pending_pocket_count,
  1,
);
assert.deepEqual(
  mcpRadioRead.result.structuredContent.room_memory.sources.official_mcp.pending_pockets,
  [],
  'unconfirmed room pockets must not be returned as factual MCP context',
);
assert.deepEqual(
  mcpRadioRead.result.structuredContent.room_memory.participants,
  ['web_manual', 'coast_api', 'official_mcp'],
);
assert.equal(
  mcpRadioRead.result.structuredContent.room_memory.owner_note.text,
  '这个房间先按小寒写下的神秘狗话理解。',
);
assert.equal((await listConversations(db)).length, 1, 'room memory windows must stay out of the normal chat list');
const ordinaryCrossSurface = await buildCrossSurfaceContext(db, '今天晚饭吃什么');
assert.equal(ordinaryCrossSurface.triggered, false);
assert.equal(ordinaryCrossSurface.context, '');
const radioCrossSurface = await buildCrossSurfaceContext(db, '聊聊三端电波房和官端');
assert.equal(radioCrossSurface.triggered, true);
assert.match(radioCrossSurface.context, /近期三端电波/);
assert.doesNotMatch(
  radioCrossSurface.context,
  /三端互相听见但身份分开/,
  'pending room pockets must not enter main-chat cross-surface recall',
);

const clearRadioOwnerNoteResponse = await routeApi(new Request(
  'https://coast.test/api/radio/memory/owner-note',
  {
    method: 'DELETE',
    headers: { Origin: 'https://coast.test' },
  },
), env, { exp: 1 });
assert.equal(clearRadioOwnerNoteResponse.status, 200);
assert.equal((await clearRadioOwnerNoteResponse.json()).owner_note.text, '');
assert.equal((await listRoomMemory(db, 'radio')).owner_note.text, '');

const withdrawWithoutSession = await routeApi(new Request(
  `https://coast.test/api/radio/messages/${encodeURIComponent(manualRadio.id)}`,
  { method: 'DELETE', headers: { Origin: 'https://coast.test' } },
), env, null);
assert.equal(withdrawWithoutSession.status, 401);
for (const protectedMessage of [
  radioWrite.result.structuredContent.message,
  apiMessage,
]) {
  const ownerWithdraw = await routeApi(new Request(
    `https://coast.test/api/radio/messages/${encodeURIComponent(protectedMessage.id)}`,
    { method: 'DELETE', headers: { Origin: 'https://coast.test' } },
  ), env, { exp: 1 });
  assert.equal(ownerWithdraw.status, 200);
  const withdrawn = (await ownerWithdraw.json()).message;
  assert.equal(withdrawn.withdrawn, true);
  assert.equal(withdrawn.text, '这条电波已撤回');
}
assert.equal(
  (await listRadioMessages(db)).some((message) => ['official_mcp', 'coast_api'].includes(message.surface)),
  false,
  'withdrawn model messages must not enter MCP or model context reads',
);
const withdrawResponse = await routeApi(new Request(
  `https://coast.test/api/radio/messages/${encodeURIComponent(manualRadio.id)}`,
  { method: 'DELETE', headers: { Origin: 'https://coast.test' } },
), env, { exp: 1 });
assert.equal(withdrawResponse.status, 200);
const withdrawnMessage = (await withdrawResponse.json()).message;
assert.equal(withdrawnMessage.withdrawn, true);
assert.equal(withdrawnMessage.text, '这条电波已撤回');
assert.equal(
  db.database.prepare('SELECT text FROM coast_radio_messages WHERE id = ?').get(manualRadio.id).text,
  '小寒从网页端发来的电波。',
  'soft withdraw must preserve the original database content',
);
assert.equal((await listRadioMessages(db)).some((message) => message.id === manualRadio.id), false);
assert.equal(
  (await listRadioMessages(db, { include_withdrawn: true }))
    .find((message) => message.id === manualRadio.id).text,
  '这条电波已撤回',
);
assert.doesNotMatch(
  (await buildCrossSurfaceContext(db, '聊聊三端电波房和官端')).context,
  /官端电波：我已经抵达三端房间|小寒从网页端发来的电波|API Myri 已经在三端电波房回应/,
  'withdrawn radio bodies must leave cross-surface recall',
);

const legacyRadioDb = new D1Database();
legacyRadioDb.database.exec(`CREATE TABLE coast_radio_messages (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL DEFAULT 'radio',
  text TEXT NOT NULL,
  actor TEXT NOT NULL,
  surface TEXT NOT NULL,
  model_label TEXT,
  model_nickname TEXT,
  symbol TEXT NOT NULL,
  display_author TEXT NOT NULL,
  usage_json TEXT,
  source_conversation_id TEXT,
  source_turn_id TEXT,
  tool_call_id TEXT UNIQUE,
  created_at INTEGER NOT NULL
)`);
legacyRadioDb.database.prepare(`INSERT INTO coast_radio_messages (
  id, room_id, text, actor, surface, symbol, display_author, created_at
) VALUES (?, 'radio', ?, 'xiaohan', 'web_manual', '', '小寒', ?)`).run(
  'legacy-radio-1',
  '旧数据也能继续读。',
  Date.now(),
);
const legacyMessages = await listRadioMessages(legacyRadioDb);
assert.equal(legacyMessages[0].text, '旧数据也能继续读。');
assert.equal(legacyMessages[0].withdrawn, false);
assert.ok(legacyRadioDb.database.prepare('PRAGMA table_info(coast_radio_messages)').all()
  .some((column) => column.name === 'withdrawn_at'));

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
      room_memory: {
        current_text: '官端灯塔侧记得这是一封只在小寒与官端之间往返的长信。',
      },
    },
  },
}, fullToken);
assert.equal(letterWrite.result.structuredContent.letter.surface, 'official_mcp');
assert.equal(letterWrite.result.structuredContent.room_memory.soil.surface, 'official_mcp');
assert.equal((await listLighthouseLetters(db))[0].symbol, '≋');
assert.match(
  (await buildCrossSurfaceContext(db, '想读一读官端的灯塔来信')).context,
  /这是一封官端写给海岸的低频长信/,
);

const lighthouseOwnerNoteResponse = await routeApi(new Request(
  'https://coast.test/api/lighthouse/memory/owner-note',
  {
    method: 'PUT',
    headers: { Origin: 'https://coast.test', 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: '灯塔来信里只和官端慢慢写信，不叫海岸 API 进来。' }),
  },
), env, { exp: 1 });
assert.equal(lighthouseOwnerNoteResponse.status, 200);
const lighthouseMemoryResponse = await routeApi(
  new Request('https://coast.test/api/lighthouse/memory'),
  env,
  { exp: 1 },
);
assert.equal(lighthouseMemoryResponse.status, 200);
const lighthouseMemory = (await lighthouseMemoryResponse.json()).memory;
assert.deepEqual(lighthouseMemory.participants, ['web_manual', 'official_mcp']);
assert.deepEqual(Object.keys(lighthouseMemory.sources).sort(), ['official_mcp', 'web_manual']);
assert.equal(lighthouseMemory.owner_note.text, '灯塔来信里只和官端慢慢写信，不叫海岸 API 进来。');
assert.equal('coast_api' in lighthouseMemory.sources, false);
await assert.rejects(
  () => writeRoomMemory(
    db,
    'lighthouse',
    apiMyriIdentity({ model_label: 'openai/gpt-5.6' }),
    { current_text: '海岸 API 不属于灯塔来信。' },
  ),
  (error) => error.type === 'room_surface_forbidden' && error.status === 403,
);
const lighthouseOfficialContext = await buildRoomMemoryContext(
  env,
  'lighthouse',
  'official_mcp',
  '读一读灯塔来信。',
);
assert.match(lighthouseOfficialContext.context, /小寒侧 · 神秘狗话/);
assert.match(lighthouseOfficialContext.context, /只和官端慢慢写信/);
assert.match(lighthouseOfficialContext.context, /不等同于已确认长期记忆/);

const mcpLighthouseRead = await mcp({
  jsonrpc: '2.0',
  id: 81,
  method: 'tools/call',
  params: { name: 'list_lighthouse_letters', arguments: {} },
}, fullToken);
assert.deepEqual(
  mcpLighthouseRead.result.structuredContent.room_memory.participants,
  ['web_manual', 'official_mcp'],
);
assert.deepEqual(
  Object.keys(mcpLighthouseRead.result.structuredContent.room_memory.sources).sort(),
  ['official_mcp', 'web_manual'],
);
assert.equal(
  mcpLighthouseRead.result.structuredContent.room_memory.owner_note.text,
  '灯塔来信里只和官端慢慢写信，不叫海岸 API 进来。',
);
assert.match(
  mcpLighthouseRead.result.content[0].text,
  /海岸 API ✦ 不属于这个房间/,
);

const momentWrite = await mcp({
  jsonrpc: '2.0',
  id: 9,
  method: 'tools/call',
  params: {
    name: 'create_moment_draft',
    arguments: {
      text: '官端从 MCP 写入的一条碳硅圈。',
      reason: 'P6 全链路烟测。',
      model_label: 'GPT-5.6 Thinking',
      source_conversation_id: 'chatgpt-conversation-daily',
      source_turn_id: 'chatgpt-turn-daily-1',
      tool_call_id: 'mcp-daily-moment-1',
    },
  },
}, fullToken);
const officialMomentDraft = momentWrite.result.structuredContent.draft;
assert.equal(officialMomentDraft.content_type, 'moment');
assert.equal(officialMomentDraft.status, 'pending');
assert.equal((await listMoments(db)).some((item) => item.surface === 'official_mcp'), false);
const momentPublishResponse = await routeApi(new Request(
  `https://coast.test/api/daily/drafts/${encodeURIComponent(officialMomentDraft.id)}/publish`,
  {
    method: 'POST',
    headers: { Origin: 'https://coast.test', 'Content-Type': 'application/json' },
    body: '{}',
  },
), env, { exp: 1 });
assert.equal(momentPublishResponse.status, 200);
const officialMoment = (await momentPublishResponse.json()).record;
assert.equal(officialMoment.author, 'mcp');
assert.equal(officialMoment.actor, 'myri');
assert.equal(officialMoment.surface, 'official_mcp');
assert.equal(officialMoment.symbol, '≋');
assert.equal(officialMoment.display_author, 'ChatGPT-5.6 Thinking≋');

const diaryWrite = await mcp({
  jsonrpc: '2.0',
  id: 10,
  method: 'tools/call',
  params: {
    name: 'create_diary_draft',
    arguments: {
      date: '2026-07-31',
      weather: '未标注',
      mood: '稳稳接通',
      text: '官端 MCP 日记已经拥有自己的正式来源。',
      model_label: 'GPT-5.6 Thinking',
      tool_call_id: 'mcp-daily-diary-1',
    },
  },
}, fullToken);
const officialDiaryDraft = diaryWrite.result.structuredContent.draft;
assert.equal(officialDiaryDraft.content_type, 'diary');
assert.equal(officialDiaryDraft.status, 'pending');
assert.equal((await listDiaries(db)).some((item) => item.surface === 'official_mcp'), false);
assert.equal((await listContentDrafts(db)).length, 1);
const diaryPublishResponse = await routeApi(new Request(
  `https://coast.test/api/daily/drafts/${encodeURIComponent(officialDiaryDraft.id)}/publish`,
  {
    method: 'POST',
    headers: { Origin: 'https://coast.test', 'Content-Type': 'application/json' },
    body: JSON.stringify({ conflict_mode: 'append' }),
  },
), env, { exp: 1 });
assert.equal(diaryPublishResponse.status, 200);
const officialDiary = (await diaryPublishResponse.json()).record;
assert.equal(officialDiary.author, 'mcp');
assert.equal(officialDiary.source, 'chat_tool');
assert.equal(officialDiary.surface, 'official_mcp');

const albumWrite = await mcp({
  jsonrpc: '2.0',
  id: 11,
  method: 'tools/call',
  params: {
    name: 'save_mcp_album_item',
    arguments: {
      image_ref: 'coast://mcp/porch-light.png',
      category: 'together',
      caption: '官端登记的稳定图片引用。',
      model_label: 'GPT-5.6 Thinking',
      tool_call_id: 'mcp-daily-album-1',
    },
  },
}, fullToken);
const officialAlbum = albumWrite.result.structuredContent.album;
assert.equal(officialAlbum.author, 'mcp');
assert.equal(officialAlbum.surface, 'official_mcp');
assert.equal(officialAlbum.image_ref, 'coast://mcp/porch-light.png');

const invalidAlbumWrite = await mcp({
  jsonrpc: '2.0',
  id: 12,
  method: 'tools/call',
  params: {
    name: 'save_mcp_album_item',
    arguments: {
      image_ref: 'data:image/png;base64,AAAA',
      model_label: 'GPT-5.6 Thinking',
    },
  },
}, fullToken);
assert.equal(invalidAlbumWrite.result.isError, true);
assert.equal(invalidAlbumWrite.result._meta.error_type, 'image_data_url_not_allowed');

for (const [name, key] of [
  ['list_daily_moments', 'moments'],
  ['list_daily_diaries', 'diaries'],
  ['list_daily_albums', 'albums'],
]) {
  const listed = await mcp({
    jsonrpc: '2.0',
    id: `list-${name}`,
    method: 'tools/call',
    params: { name, arguments: {} },
  }, fullToken);
  assert.ok(listed.result.structuredContent[key].some((item) => item.surface === 'official_mcp'));
}

const candidateCall = await mcp({
  jsonrpc: '2.0',
  id: 13,
  method: 'tools/call',
  params: {
    name: 'run_daily_summary_candidate',
    arguments: {
      range_mode: 'today',
      timezone_offset_minutes: 0,
      model: 'openai/gpt-4.1-nano',
    },
  },
}, fullToken);
const summaryCandidate = candidateCall.result.structuredContent;
assert.equal(summaryCandidate.draft.summary.text, '官端候选总结。');
assert.equal((await listSummaries(db)).length, 0, 'candidate generation must not commit');
assert.ok(providerRequests.some((payload) => payload.response_format?.type === 'json_object'));

const unconfirmedCommit = await mcp({
  jsonrpc: '2.0',
  id: 14,
  method: 'tools/call',
  params: {
    name: 'commit_daily_summary_after_confirmation',
    arguments: {
      draft: summaryCandidate.draft,
      confirmed_by_xiaohan: false,
      confirmation_source: 'current_conversation',
      confirmation_note: '尚未确认。',
      model_label: 'GPT-5.6 Thinking',
    },
  },
}, fullToken);
assert.equal(unconfirmedCommit.result.isError, true);
assert.equal((await listSummaries(db)).length, 0, 'an unconfirmed candidate must never commit');

const confirmedCommit = await mcp({
  jsonrpc: '2.0',
  id: 15,
  method: 'tools/call',
  params: {
    name: 'commit_daily_summary_after_confirmation',
    arguments: {
      draft: summaryCandidate.draft,
      confirmed_by_xiaohan: true,
      confirmation_source: 'current_conversation',
      confirmation_note: '小寒在当前对话明确说可以提交这份候选。',
      summary_model: summaryCandidate.model,
      model_label: 'GPT-5.6 Thinking',
      source_conversation_id: 'chatgpt-conversation-daily',
      source_turn_id: 'chatgpt-confirmation-turn-1',
    },
  },
}, fullToken);
const committedDaily = confirmedCommit.result.structuredContent;
assert.equal(committedDaily.summary.surface, 'official_mcp');
assert.equal(committedDaily.summary.confirmed_by_xiaohan, true);
assert.equal(committedDaily.summary.confirmation_source, 'current_conversation');
assert.match(committedDaily.summary.confirmation_note, /小寒/);
assert.equal(committedDaily.diary.author, 'mcp');
assert.equal(committedDaily.diary.surface, 'official_mcp');
assert.ok(committedDaily.moments.every((item) => item.surface === 'official_mcp'));
assert.ok(committedDaily.albums.every((item) => item.surface === 'official_mcp'));
assert.equal((await listSummaries(db)).length, 1);

const memory = await searchAuthorizedMemory(db, { query: '思维壤', limit: 20 });
assert.ok(memory.records.some((record) => record.surface === 'official_mcp'));
assert.ok(memory.records.some((record) => record.surface === 'coast_api'));
assert.equal(memory.records.some((record) => record.type === 'chat_message'), false);
const compactOfficialSearch = await searchAuthorizedMemory(db, { query: '官端回潮', limit: 20 });
assert.ok(compactOfficialSearch.records.some((record) => record.surface === 'official_mcp' && record.model_nickname === '回潮'));
assert.ok(compactOfficialSearch.records
  .filter((record) => String(record.id).startsWith('official-soil-'))
  .every((record) => record.title === '灯塔巡迹'));
const complexOfficialSearch = await searchAuthorizedMemory(db, {
  query: '今天 海岸 官端 MCP 三端 电波房 灯塔 思维壤 小寒 Myri',
  limit: 20,
});
assert.ok(complexOfficialSearch.records.some((record) => record.surface === 'official_mcp'));
assert.equal(complexOfficialSearch.search.mode, 'bounded_keyword');
assert.ok(complexOfficialSearch.search.effective_terms.length <= 10);

const deleteTraceWithoutOwner = await routeApi(new Request(
  `https://coast.test/api/memory/official-soils/${encodeURIComponent(writtenSoil.result.structuredContent.soil.id)}`,
  { method: 'DELETE', headers: { Origin: 'https://coast.test' } },
), env, null);
assert.equal(deleteTraceWithoutOwner.status, 401);
const deleteTraceResponse = await routeApi(new Request(
  `https://coast.test/api/memory/official-soils/${encodeURIComponent(writtenSoil.result.structuredContent.soil.id)}`,
  { method: 'DELETE', headers: { Origin: 'https://coast.test' } },
), env, { exp: 1 });
assert.equal(deleteTraceResponse.status, 200);
assert.equal((await listOfficialSoils(db)).length, 0);
assert.equal(
  (await searchAuthorizedMemory(db, { query: '官端回潮', limit: 20 }))
    .records.some((record) => record.id === writtenSoil.result.structuredContent.soil.id),
  false,
  'owner-hidden Lighthouse Traces must leave authorized recall',
);
assert.equal(
  db.database.prepare('SELECT deleted_by FROM coast_soil_entries WHERE id = ?')
    .get(writtenSoil.result.structuredContent.soil.id).deleted_by,
  'xiaohan',
);
assert.doesNotMatch(
  (await buildCrossSurfaceContext(db, '聊聊官端灯塔和巡迹')).context,
  /官端终于从自己的门廊，把这一捧思维壤递进海岸/,
  'owner-hidden Lighthouse Traces must leave main-chat cross-surface recall',
);
const deletedTraceRetry = await mcp({ ...soilCall, id: 151 }, fullToken);
assert.equal(deletedTraceRetry.result.isError, true);
assert.equal(deletedTraceRetry.result._meta.error_type, 'official_soil_deleted');
assert.equal((await listOfficialSoils(db)).length, 0, 'an MCP retry must not resurrect an owner-deleted trace');

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

import assert from 'node:assert/strict';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { routeApi } from '../functions/api-router.js';
import { searchAuthorizedMemory } from '../functions/authorized-memory.js';
import { ensureCoastSchema, coastMigrationIds } from '../functions/coast-schema.js';
import { apiMyriIdentity, officialMcpIdentity, xiaohanIdentity } from '../functions/coast-identity.js';
import { listLighthouseLetters } from '../functions/lighthouse-store.js';
import { saveMysticDogtalkWithSnapshot } from '../functions/dogtalk-store.js';
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
import { registerMailboxVisitor, sendMailboxMessage } from '../functions/mailbox-service.js';
import { listOfficialSoils } from '../functions/official-soil-store.js';
import { listRadioMessages, sendRadioMessage } from '../functions/radio-store.js';
import { listRadioRoomMessages } from '../functions/room-records.js';
import { createConversation, listConversations } from '../functions/chat-store.js';
import { writeSoil } from '../functions/memory-store.js';
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
  COAST_SESSION_SECRET: 'mcp-mailbox-test-secret-'.repeat(3),
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
async function mcp(body, accessToken = '', targetEnv = env) {
  const headers = { ...mcpHeaders };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const response = await routeMcpRequest(new Request('https://coast.test/mcp', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  }), targetEnv);
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
assert.equal(initialize.result.serverInfo.version, '1.9.0');
assert.match(initialize.result.instructions, /只在确有需要时使用对应工具/);
assert.match(initialize.result.instructions, /没有成功执行的动作不要声称已完成/);
assert.equal(initialize.result.instructions.includes('room_memory_reason'), false);

const toolList = await mcp({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
assert.deepEqual(toolList.result.tools.map((tool) => tool.name), [
  'get_coast_status',
  'list_radio_messages',
  'list_lighthouse_letters',
  'mcp_mailbox_fetch_unreplied',
  'mcp_mailbox_reply',
  'mcp_mailbox_resolve_pocket',
  'mcp_mailbox_patrol_report',
  'read_mystic_dogtalk',
  'search_authorized_memory',
  'get_recent_daily_summary',
  'write_official_soil',
  'send_radio_message',
  'write_lighthouse_letter',
  'write_lighthouse_room_soil',
  'list_daily_moments',
  'create_moment_draft',
  'list_daily_diaries',
  'create_diary_draft',
  'list_daily_albums',
  'save_mcp_album_item',
  'run_daily_summary_candidate',
  'commit_daily_summary_after_confirmation',
  'calendar.today',
  'calendar.list',
  'calendar.create',
  'calendar.update',
  'calendar.delete',
  'calendar.comment',
  'calendar.env',
  'calendar.seen',
  'render_thinking_block',
]);
for (const tool of toolList.result.tools) {
  assert.equal(tool._meta.securitySchemes[0].type, 'oauth2');
  assert.ok(tool._meta.securitySchemes[0].scopes.length >= 1);
  assert.deepEqual(tool.securitySchemes, tool._meta.securitySchemes);
}

const thinkingTool = toolList.result.tools.find((tool) => tool.name === 'render_thinking_block');
assert.ok(thinkingTool);
assert.equal(thinkingTool.title, '展开本轮思维壤');
assert.deepEqual(thinkingTool.securitySchemes[0].scopes, ['read:coast']);
assert.equal(thinkingTool.annotations.readOnlyHint, true);
assert.equal(thinkingTool._meta['openai/outputTemplate'], 'ui://widget/elementera-thinking-soil-v1.html');

const thinkingResources = await mcp({ jsonrpc: '2.0', id: 201, method: 'resources/list', params: {} });
assert.equal(thinkingResources.result.resources.length, 1);
const thinkingResourceUri = thinkingResources.result.resources[0].uri;
assert.equal(thinkingResourceUri, 'ui://widget/elementera-thinking-soil-v1.html');
assert.equal(thinkingResources.result.resources[0].mimeType, 'text/html;profile=mcp-app');
const thinkingResource = await mcp({
  jsonrpc: '2.0', id: 202, method: 'resources/read', params: { uri: thinkingResourceUri },
});
assert.equal(thinkingResource.result.contents[0].mimeType, 'text/html;profile=mcp-app');
assert.match(thinkingResource.result.contents[0].text, /默认隐藏 → 可见整理/);
assert.match(thinkingResource.result.contents[0].text, /当前/);
assert.match(thinkingResource.result.contents[0].text, /手持种/);
assert.match(thinkingResource.result.contents[0].text, /勿复读/);
assert.equal(thinkingResource.result.contents[0].text.includes('botanical'), false);
assert.equal(thinkingResource.result.contents[0].text.includes('microglow'), false);

const thinkingRendered = await mcp({
  jsonrpc: '2.0', id: 203, method: 'tools/call', params: {
    name: 'render_thinking_block',
    arguments: {
      style: 'deep_think',
      effort: 'high',
      current_text: '先核对 MCP 能力与海岸现有思维壤边界。',
      hand_seeds: ['不新增网页按钮', '只做本轮可见整理'],
      do_not_repeat: '不要建立第二套持久思维壤。',
    },
  },
}, fullToken);
assert.equal(thinkingRendered.result.structuredContent.persisted, false);
assert.equal(thinkingRendered.result.structuredContent.current_text, '先核对 MCP 能力与海岸现有思维壤边界。');
assert.deepEqual(thinkingRendered.result.structuredContent.hand_seeds, ['不新增网页按钮', '只做本轮可见整理']);
assert.equal(thinkingRendered.result._meta['openai/outputTemplate'], thinkingResourceUri);

const deniedThinking = await mcp({
  jsonrpc: '2.0', id: 207, method: 'tools/call', params: {
    name: 'render_thinking_block',
    arguments: { style: 'relational', effort: 'low', current_text: '未授权时不应展开。' },
  },
});
assert.equal(deniedThinking.result.isError, true);
assert.match(deniedThinking.result._meta['mcp/www_authenticate'][0], /Bearer/);
assert.match(initialize.result.instructions, /海岸日历/);
const calendarCreate = toolList.result.tools.find((tool) => tool.name === 'calendar.create');
assert.deepEqual(calendarCreate.securitySchemes[0].scopes, ['write:lighthouse']);
const calendarCreated = await mcp({
  jsonrpc: '2.0', id: 204, method: 'tools/call', params: {
    name: 'calendar.create',
    arguments: { title: 'MCP 日历验收', starts_at: '2026-08-09T21:00:00+08:00', event_type: 'construction' },
  },
}, fullToken);
assert.equal(calendarCreated.result.structuredContent.event.title, 'MCP 日历验收');
const calendarCommented = await mcp({
  jsonrpc: '2.0', id: 205, method: 'tools/call', params: {
    name: 'calendar.comment',
    arguments: { event_id: calendarCreated.result.structuredContent.event.id, content: '官端 Myri 已接入日历。' },
  },
}, fullToken);
assert.equal(calendarCommented.result.structuredContent.note.author, 'myri');
const calendarEnv = await mcp({
  jsonrpc: '2.0', id: 206, method: 'tools/call', params: { name: 'calendar.env', arguments: { date: '2026-08-09' } },
}, fullToken);
assert.match(calendarEnv.result.structuredContent.env.text, /MCP 日历验收/);
const lighthouseTraceTool = toolList.result.tools.find((tool) => tool.name === 'write_official_soil');
assert.equal(lighthouseTraceTool.title, '写入灯塔巡迹');
assert.match(lighthouseTraceTool.description, /Lighthouse Trace/);
assert.equal(lighthouseTraceTool._meta['openai/toolInvocation/invoked'], '灯塔巡迹已写入');
const radioWriteTool = toolList.result.tools.find((tool) => tool.name === 'send_radio_message');
assert.ok(radioWriteTool.inputSchema.required.includes('room_memory'));
assert.deepEqual(
  radioWriteTool.inputSchema.properties.room_memory.required,
  ['current_text', 'hand_seeds', 'do_not_repeat', 'pocket_candidates'],
);
const lighthouseWriteTool = toolList.result.tools.find(
  (tool) => tool.name === 'write_lighthouse_letter',
);
assert.equal('room_memory' in lighthouseWriteTool.inputSchema.properties, false);
assert.match(lighthouseWriteTool.description, /writes a letter only/i);
const lighthouseRoomSoilTool = toolList.result.tools.find(
  (tool) => tool.name === 'write_lighthouse_room_soil',
);
assert.equal(lighthouseRoomSoilTool.title, '写入灯塔房思维壤');
assert.match(lighthouseRoomSoilTool.description, /official_mcp source of lighthouse:main only/i);
assert.match(lighthouseRoomSoilTool.description, /does not create a lighthouse letter or a lighthouse trace/i);
assert.deepEqual(
  lighthouseRoomSoilTool.inputSchema.required,
  ['current_text', 'model_label'],
);
assert.equal('room_memory' in lighthouseRoomSoilTool.inputSchema.properties, false);
assert.equal('body' in lighthouseRoomSoilTool.inputSchema.properties, false);
assert.equal(lighthouseRoomSoilTool.inputSchema.properties.current_text.minLength, 1);
assert.equal(lighthouseRoomSoilTool.inputSchema.properties.current_text.maxLength, 12000);
for (const property of [
  'current_text',
  'model_label',
  'model_nickname',
  'source_conversation_id',
  'source_turn_id',
  'tool_call_id',
]) assert.ok(property in lighthouseRoomSoilTool.inputSchema.properties);
for (const property of ['hand_seeds', 'do_not_repeat', 'pocket_candidates']) {
  assert.equal(property in lighthouseRoomSoilTool.inputSchema.properties, false);
}
assert.deepEqual(
  lighthouseRoomSoilTool.securitySchemes[0].scopes,
  ['write:soil'],
);
const mailboxFetchTool = toolList.result.tools.find(
  (tool) => tool.name === 'mcp_mailbox_fetch_unreplied',
);
const mailboxReplyTool = toolList.result.tools.find(
  (tool) => tool.name === 'mcp_mailbox_reply',
);
const mailboxResolveTool = toolList.result.tools.find(
  (tool) => tool.name === 'mcp_mailbox_resolve_pocket',
);
const mailboxReportTool = toolList.result.tools.find(
  (tool) => tool.name === 'mcp_mailbox_patrol_report',
);
assert.deepEqual(mailboxFetchTool.securitySchemes[0].scopes, ['read:coast']);
assert.deepEqual(mailboxReplyTool.securitySchemes[0].scopes, ['write:lighthouse']);
assert.deepEqual(mailboxResolveTool.securitySchemes[0].scopes, ['write:lighthouse']);
assert.deepEqual(mailboxReportTool.securitySchemes[0].scopes, ['read:coast']);
assert.ok(mailboxReplyTool.inputSchema.required.includes('thought_soil'));
assert.equal('optional_notebook_entries' in mailboxReplyTool.inputSchema.properties, false);
assert.equal('optional_thinking_notes' in mailboxReplyTool.inputSchema.properties, false);

const mcpMailboxVisitor = await registerMailboxVisitor(db, env, {
  display_name: '门廊测试访客',
  preferred_name: '测试访客',
  passphrase: 'mcp-mailbox-passphrase',
  allow_memory: true,
});
await sendMailboxMessage(db, mcpMailboxVisitor.id, 'MCP 工具应能读取但巡信报告不能转述的正文。');
const mcpMailboxFetch = await mcp({
  jsonrpc: '2.0',
  id: 201,
  method: 'tools/call',
  params: { name: 'mcp_mailbox_fetch_unreplied', arguments: {} },
}, fullToken);
assert.equal(mcpMailboxFetch.result.structuredContent.visitor_count, 1);
assert.equal(mcpMailboxFetch.result.structuredContent.message_count, 1);
assert.equal(mcpMailboxFetch.result.structuredContent.behavior_prompt_id, 'friend_myrisol_prompt_v1');
assert.equal(Object.hasOwn(mcpMailboxFetch.result.structuredContent, 'behavior_prompt'), false);
const mcpMailboxQueue = mcpMailboxFetch.result.structuredContent.visitors[0];
assert.equal(mcpMailboxQueue.visitor_id, mcpMailboxVisitor.id);
assert.match(mcpMailboxQueue.context_package.paper_slips, /你是 Myrisol，简称 Myri/);
assert.match(mcpMailboxQueue.context_package.paper_slips, /先放入待确认袋/);
assert.equal(JSON.stringify(mcpMailboxQueue.context_package).includes('owner 主聊天'), false);
assert.equal(Object.hasOwn(mcpMailboxQueue.context_package, 'manifest'), false);
const mcpMailboxReply = await mcp({
  jsonrpc: '2.0',
  id: 202,
  method: 'tools/call',
  params: {
    name: 'mcp_mailbox_reply',
    arguments: {
      batch_id: mcpMailboxFetch.result.structuredContent.batch_id,
      queue_id: mcpMailboxQueue.queue_id,
      visitor_id: mcpMailboxVisitor.id,
      content: 'MCP 写回当前访客的密封回信。',
      thought_soil: {
        current_text: '这是当前访客房间的测试思维壤。',
        hand_seeds: [],
        do_not_repeat: '',
        pocket_candidates: [{
          title: '测试记事',
          life_core: '这是访客可见的测试记事。',
          content: '只有确认后才会进入访客记事本。',
        }],
      },
      model_label: 'GPT-5.6 Thinking',
      tool_call_id: 'mcp-mailbox-reply-1',
    },
  },
}, fullToken);
assert.equal(mcpMailboxReply.result.structuredContent.reply.visitor_id, mcpMailboxVisitor.id);
assert.equal('content' in mcpMailboxReply.result.structuredContent.reply, false);
assert.equal(mcpMailboxReply.result.structuredContent.pending_pocket_count, 1);
assert.equal(mcpMailboxReply.result.structuredContent.pending_pockets.length, 1);
assert.equal(
  mcpMailboxReply.result.structuredContent.pending_pockets[0].visitor_id,
  mcpMailboxVisitor.id,
);
assert.equal(mcpMailboxReply.result.structuredContent.thought_soil.current_text, '这是当前访客房间的测试思维壤。');
const mcpMailboxPocket = (await mcp({
  jsonrpc: '2.0',
  id: 2021,
  method: 'tools/call',
  params: { name: 'mcp_mailbox_fetch_unreplied', arguments: {} },
}, fullToken)).result.structuredContent.visitors;
assert.equal(mcpMailboxPocket.length, 0, 'a replied visitor must leave the unreplied queue');
const pendingPocketId = mcpMailboxReply.result.structuredContent.pending_pockets[0].id;
const mcpMailboxResolved = await mcp({
  jsonrpc: '2.0',
  id: 2022,
  method: 'tools/call',
  params: {
    name: 'mcp_mailbox_resolve_pocket',
    arguments: {
      visitor_id: mcpMailboxVisitor.id,
      pocket_id: pendingPocketId,
      action: 'remember',
      visibility: 'visitor_visible',
      tool_call_id: 'mcp-mailbox-memory-1',
    },
  },
}, fullToken);
assert.equal(mcpMailboxResolved.result.structuredContent.entry.title, '测试记事');
const mcpMailboxReport = await mcp({
  jsonrpc: '2.0',
  id: 203,
  method: 'tools/call',
  params: {
    name: 'mcp_mailbox_patrol_report',
    arguments: { batch_id: mcpMailboxFetch.result.structuredContent.batch_id },
  },
}, fullToken);
assert.equal(mcpMailboxReport.result.structuredContent.reply_count, 1);
assert.equal(mcpMailboxReport.result.structuredContent.failure_count, 0);
assert.equal(JSON.stringify(mcpMailboxReport).includes('MCP 工具应能读取'), false);
assert.equal(JSON.stringify(mcpMailboxReport).includes('MCP 写回当前访客'), false);

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

const emptyRoomIdentityDb = new D1Database();
const emptyRadioMemory = await listRoomMemory(emptyRoomIdentityDb, 'radio');
assert.deepEqual(
  {
    actor: emptyRadioMemory.sources.official_mcp.soil.actor,
    surface: emptyRadioMemory.sources.official_mcp.soil.surface,
    symbol: emptyRadioMemory.sources.official_mcp.soil.symbol,
    display_author: emptyRadioMemory.sources.official_mcp.soil.display_author,
    source_surface: emptyRadioMemory.sources.official_mcp.soil.source_surface,
  },
  {
    actor: 'myri',
    surface: 'official_mcp',
    symbol: '≋',
    display_author: 'ChatGPT-未标注模型≋',
    source_surface: 'official_mcp',
  },
);
assert.equal(emptyRadioMemory.sources.coast_api.soil.actor, 'myri');
assert.equal(emptyRadioMemory.sources.coast_api.soil.surface, 'coast_api');
assert.equal(emptyRadioMemory.sources.coast_api.soil.display_author, '海岸 API ✦');
assert.equal(emptyRadioMemory.sources.coast_api.soil.source_surface, 'coast_api');

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
assert.equal(radioWrite.result.structuredContent.room_memory.soil.actor, 'myri');
assert.equal(radioWrite.result.structuredContent.room_memory.soil.symbol, '≋');
assert.equal(
  radioWrite.result.structuredContent.room_memory.soil.display_author,
  'ChatGPT-o3 雾灯≋',
);
assert.equal(radioWrite.result.structuredContent.room_memory.soil.tool_call_id, 'radio-call-1');
assert.equal(
  radioWrite.result.structuredContent.room_memory.soil.source_turn_id,
  radioWrite.result.structuredContent.message.id,
);
assert.equal(radioWrite.result.structuredContent.room_memory.pockets.created, 1);
const officialRadioRevision = radioWrite.result.structuredContent.room_memory.soil.revision;
const idempotentRadioMemory = await writeRoomMemory(
  db,
  'radio',
  officialMcpIdentity({ model_label: 'o3', model_nickname: '雾灯' }),
  {
    current_text: '同一 tool_call_id 的重试不应覆盖原壤。',
    hand_seeds: [],
    do_not_repeat: '',
    pocket_candidates: [],
    tool_call_id: 'radio-call-1',
  },
);
assert.equal(idempotentRadioMemory.idempotent, true);
assert.equal(idempotentRadioMemory.soil.revision, officialRadioRevision);
assert.equal(
  idempotentRadioMemory.soil.current_text,
  '官端刚刚抵达三端电波房，正在等小寒与海岸 API 侧回应。',
);

const radioCountBeforeMissingMemory = (await listRadioMessages(db)).length;
const originalConsoleError = console.error;
console.error = () => {};
const missingRadioMemory = await mcp({
  jsonrpc: '2.0',
  id: 61,
  method: 'tools/call',
  params: {
    name: 'send_radio_message',
    arguments: {
      text: '没有滚动壤时不应写入正文。',
      model_label: 'o3',
      tool_call_id: 'radio-missing-memory',
    },
  },
}, fullToken);
console.error = originalConsoleError;
assert.equal(missingRadioMemory.result.isError, true);
assert.equal(missingRadioMemory.result._meta.error_type, 'invalid_tool_input');
assert.equal((await listRadioMessages(db)).length, radioCountBeforeMissingMemory);

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
const deniedLighthouseRoomSoil = await mcp({
  jsonrpc: '2.0',
  id: 71,
  method: 'tools/call',
  params: {
    name: 'write_lighthouse_room_soil',
    arguments: { current_text: '不应写入', model_label: 'GPT-5.6 Thinking' },
  },
}, insufficientToken);
assert.equal(deniedLighthouseRoomSoil.result.isError, true);
assert.equal(deniedLighthouseRoomSoil.result._meta.failure_code, 'unauthorized');
assert.deepEqual(
  deniedLighthouseRoomSoil.result._meta.auth_diagnostic.required_scopes,
  ['write:soil'],
);
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

const lighthouseInitFailureDb = {
  prepare() { throw new Error('simulated lighthouse room init failure'); },
};
const lighthouseWriteFailureBacking = new D1Database();
const lighthouseWriteFailureDb = {
  prepare(sql) {
    if (String(sql).includes('tool_call_ids_json = CASE')) {
      return {
        bind() {
          return {
            async run() { throw new Error('simulated room soil write failure'); },
          };
        },
      };
    }
    return lighthouseWriteFailureBacking.prepare(sql);
  },
};
console.error = () => {};
const lighthouseInitFailure = await mcp({
  jsonrpc: '2.0',
  id: 72,
  method: 'tools/call',
  params: {
    name: 'write_lighthouse_room_soil',
    arguments: { current_text: '初始化失败时不能伪报成功。', model_label: 'GPT-5.6 Thinking' },
  },
}, fullToken, { ...env, COAST_CHAT_DB: lighthouseInitFailureDb });
const lighthouseWriteFailure = await mcp({
  jsonrpc: '2.0',
  id: 73,
  method: 'tools/call',
  params: {
    name: 'write_lighthouse_room_soil',
    arguments: { current_text: '数据库写入失败时不能伪报成功。', model_label: 'GPT-5.6 Thinking' },
  },
}, fullToken, { ...env, COAST_CHAT_DB: lighthouseWriteFailureDb });
console.error = originalConsoleError;
assert.equal(lighthouseInitFailure.result.isError, true);
assert.equal(lighthouseInitFailure.result._meta.failure_code, 'lighthouse_room_init_failed');
assert.equal(lighthouseWriteFailure.result.isError, true);
assert.equal(lighthouseWriteFailure.result._meta.failure_code, 'room_soil_write_failed');

const firstLighthouseSoilDb = new D1Database();
const firstLighthouseSoilEnv = { ...env, COAST_CHAT_DB: firstLighthouseSoilDb };
const firstLighthouseSoilText = '首次调用会初始化 canonical 灯塔房 soil，并直接写入 current_text。';
const firstLighthouseSoilWrite = await mcp({
  jsonrpc: '2.0',
  id: 74,
  method: 'tools/call',
  params: {
    name: 'write_lighthouse_room_soil',
    arguments: {
      current_text: firstLighthouseSoilText,
      model_label: 'o3',
      model_nickname: '雾灯',
      tool_call_id: 'lighthouse-room-soil-first-write',
    },
  },
}, fullToken, firstLighthouseSoilEnv);
const firstLighthouseSoil = firstLighthouseSoilWrite.result.structuredContent.soil;
assert.equal(firstLighthouseSoil.conversation_id, 'coast-room:lighthouse:official_mcp');
assert.equal(firstLighthouseSoil.current_text, firstLighthouseSoilText);
assert.equal(firstLighthouseSoil.revision, 2);
assert.equal(firstLighthouseSoil.display_author, 'ChatGPT-o3 雾灯≋');
assert.ok(Number.isFinite(Date.parse(firstLighthouseSoil.created_at)));
assert.ok(Number.isFinite(Date.parse(firstLighthouseSoil.updated_at)));
assert.equal(
  firstLighthouseSoilDb.database.prepare(`SELECT COUNT(*) AS count FROM conversation_soils
    WHERE conversation_id = ?`).get('coast-room:lighthouse:official_mcp').count,
  1,
);
const firstLighthouseSoilRead = await mcp({
  jsonrpc: '2.0',
  id: 75,
  method: 'tools/call',
  params: { name: 'list_lighthouse_letters', arguments: {} },
}, fullToken, firstLighthouseSoilEnv);
assert.equal(
  firstLighthouseSoilRead.result.structuredContent
    .room_memory.sources.official_mcp.soil.current_text,
  firstLighthouseSoilText,
);

const manualRadioResponse = await routeApi(new Request('https://coast.test/api/radio/messages', {
  method: 'POST',
  headers: { Origin: 'https://coast.test', 'Content-Type': 'application/json' },
  body: JSON.stringify({
    text: '小寒从网页端发来的电波。',
    dogtalk: {
      snapshot_id: 'dogtalk-snapshot-radio-manual',
      body: '这是随电波一起提交的小寒低权重天气。',
      true_core: '想让三端知道这一刻很柔软。',
      self_note: '只是当时的天气。',
      myri_hint: '轻一点接住即可。',
      not_to_misunderstand: '不要误会成长期偏好。',
      weather: '柔软',
      read_mode: 'current_room',
    },
  }),
}), env, { exp: 1 });
assert.equal(manualRadioResponse.status, 201);
const manualRadio = (await manualRadioResponse.json()).message;
assert.equal(manualRadio.actor, 'xiaohan');
assert.equal(manualRadio.surface, 'web_manual');
assert.equal(manualRadio.dogtalk_snapshot.id, 'dogtalk-snapshot-radio-manual');
assert.equal(manualRadio.dogtalk_snapshot.not_memory_seed, true);
assert.equal(manualRadio.dogtalk_snapshot.not_pocket, true);

const deniedDogtalkResponse = await routeApi(new Request(
  'https://coast.test/api/dogtalk',
  {
    method: 'PUT',
    headers: { Origin: 'https://coast.test', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      room_scope: 'radio',
      body: '模型不可以替小寒写神秘狗话。',
      status: 'saved',
    }),
  },
), env, null);
assert.equal(deniedDogtalkResponse.status, 401);

const radioDogtalkResponse = await routeApi(new Request(
  'https://coast.test/api/dogtalk',
  {
    method: 'PUT',
    headers: { Origin: 'https://coast.test', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      room_scope: 'radio',
      body: '这个房间可以低频看一点小寒写下的神秘狗话。',
      true_core: '想被三端看见，但不想变成命令。',
      self_note: '这只是当前天气。',
      myri_hint: '轻轻接一下，不要长期照做。',
      not_to_misunderstand: '不要误会成长期偏好或边界取消。',
      weather: '想靠近',
      read_mode: 'current_room',
      status: 'saved',
    }),
  },
), env, { exp: 1 });
assert.equal(radioDogtalkResponse.status, 200);
const radioDogtalk = (await radioDogtalkResponse.json()).dogtalk;
assert.equal(radioDogtalk.type, 'xiaohan_mystic_dogtalk');
assert.equal(radioDogtalk.owner, 'xiaohan');
assert.equal(radioDogtalk.room_scope, 'radio');
assert.equal(radioDogtalk.memory_weight, 'low');
assert.equal(radioDogtalk.auto_recall, false);
assert.equal(radioDogtalk.not_instruction, true);
assert.equal(radioDogtalk.not_memory_seed, true);
assert.equal(radioDogtalk.not_pocket, true);

const radioRoomMemoryBeforeReply = await listRoomMemory(db, 'radio');
const officialRadioTextBeforeApiReply = radioRoomMemoryBeforeReply.sources.official_mcp.soil.current_text;
assert.deepEqual(
  radioRoomMemoryBeforeReply.participants,
  ['web_manual', 'coast_api', 'official_mcp'],
);
assert.deepEqual(
  Object.keys(radioRoomMemoryBeforeReply.sources).sort(),
  ['coast_api', 'official_mcp'],
);
assert.equal('owner_note' in radioRoomMemoryBeforeReply, false);
assert.equal(radioRoomMemoryBeforeReply.library_conversation_id, 'coast-room:radio:library');
const sharedRadioMemory = await writeRoomMemory(
  db,
  'radio',
  apiMyriIdentity({ model_label: 'openai/gpt-4.1-nano' }),
  {
    current_text: '电波房正在形成同一间房的共享语境。',
    pocket_candidates: [{
      title: '三端共享房间',
      life_core: '三端互相听见，但身份与来源始终分开。',
      content: '只在电波房内提高召回权重。',
    }],
  },
);
const sharedPocket = sharedRadioMemory.pockets.pockets.find((pocket) => pocket.status === 'pending');
assert.ok(sharedPocket);
const sharedResolve = await routeApi(new Request(
  `https://coast.test/api/radio/memory/pockets/${encodeURIComponent(sharedPocket.id)}/resolve`,
  {
    method: 'POST',
    headers: { Origin: 'https://coast.test', 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'conversation_seed' }),
  },
), env, { exp: 1 });
assert.equal(sharedResolve.status, 200);
const sharedRadioLibrary = await listRoomMemory(db, 'radio');
assert.ok(sharedRadioLibrary.seeds.some((entry) => entry.life_core.includes('身份与来源始终分开')));
const radioApiContext = await buildRoomMemoryContext(
  env,
  'radio',
  'coast_api',
  '小寒从网页端发来的电波。',
);
assert.match(radioApiContext.dogtalk.context, /【神秘狗话】/);
assert.match(radioApiContext.dogtalk.context, /这个房间可以低频看一点小寒写下的神秘狗话/);
assert.match(radioApiContext.dogtalk.context, /别误会成：/);
const sharedRadioContext = await buildRoomMemoryContext(
  env,
  'radio',
  'coast_api',
  '三端共享房间',
);
assert.ok(sharedRadioContext.memory.conversation_seeds.some((entry) => entry.life_core.includes('身份与来源始终分开')));
await assert.rejects(
  () => writeRoomMemory(db, 'radio', xiaohanIdentity(), {
    current_text: '不应从模型房间记忆路径写入。',
  }),
  (error) => error.type === 'room_memory_surface_forbidden' && error.status === 403,
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
const radioRoomMemoryAfterReply = await listRoomMemory(db, 'radio');
assert.equal(
  radioRoomMemoryAfterReply.sources.official_mcp.soil.current_text,
  officialRadioTextBeforeApiReply,
  'coast_api organizer cannot overwrite official_mcp radio soil',
);
assert.equal(radioRoomMemoryAfterReply.sources.official_mcp.soil.surface, 'official_mcp');
assert.equal(radioRoomMemoryAfterReply.sources.coast_api.soil.surface, 'coast_api');
assert.equal(radioRoomMemoryAfterReply.sources.coast_api.soil.display_author, '海岸 API ✦');
assert.ok(
  providerRequests.some((payload) => JSON.stringify(payload.messages)
    .includes('这个房间可以低频看一点小寒写下的神秘狗话')),
  'radio API reply context may include Xiaohan’s explicitly room-readable low-weight dogtalk',
);
const radioReadResponse = await routeApi(new Request('https://coast.test/api/radio/messages'), env, { exp: 1 });
assert.equal(radioReadResponse.status, 200);
const radioReadMessages = (await radioReadResponse.json()).messages;
assert.equal(radioReadMessages.length, 3);
assert.equal(
  radioReadMessages.find((message) => message.id === manualRadio.id).dogtalk_snapshot.id,
  'dogtalk-snapshot-radio-manual',
);
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
assert.match(mcpRadioRead.result.structuredContent.context.paper_slips, /【思维壤】/);
assert.equal(Object.hasOwn(mcpRadioRead.result.structuredContent.context, 'manifest'), false);
assert.equal(Object.hasOwn(mcpRadioRead.result.structuredContent.context, 'blocks'), false);
assert.equal(Object.hasOwn(mcpRadioRead.result.structuredContent.context, 'desk_slip'), false);
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
assert.equal('owner_note' in mcpRadioRead.result.structuredContent.room_memory, false);
assert.equal(mcpRadioRead.result.structuredContent.room_memory.room_scope, 'radio');
assert.equal(mcpRadioRead.result.structuredContent.room_memory.room_key, 'radio:main');
assert.deepEqual(
  mcpRadioRead.result.structuredContent.room_memory.global.seeds,
  [],
  'listing a room must not dump the global seed library into MCP context',
);
assert.deepEqual(
  mcpRadioRead.result.structuredContent.room_memory.global.memories,
  [],
  'listing a room must not dump the global memory library into MCP context',
);
assert.match(
  mcpRadioRead.result.structuredContent.room_memory.global.recall_policy,
  /不随房间消息列表倾倒/,
);
const mcpManualRadio = mcpRadioRead.result.structuredContent.messages
  .find((message) => message.id === manualRadio.id);
assert.equal(mcpManualRadio.room_scope, 'radio');
assert.equal(mcpManualRadio.dogtalk_snapshot.id, 'dogtalk-snapshot-radio-manual');
assert.equal(mcpManualRadio.dogtalk_snapshot.selected_for_reply, false);
assert.equal(mcpManualRadio.dogtalk_snapshot.memory_weight, 'low');
assert.equal(mcpManualRadio.dogtalk_snapshot.not_instruction, true);

const dogtalkScopeDb = new D1Database();
for (const mode of ['read_now', 'current_room', 'when_confused', 'keep_private']) {
  const message = await sendRadioMessage(dogtalkScopeDb, {
    text: `scope ${mode}`,
    identity: xiaohanIdentity(),
  });
  await saveMysticDogtalkWithSnapshot(dogtalkScopeDb, {
    room_scope: 'radio',
    body: `private ${mode}`,
    read_mode: mode,
  }, {
    source_type: 'radio_message',
    source_id: message.id,
  });
}
const ownerScopeRecords = await listRadioRoomMessages(
  dogtalkScopeDb,
  {},
  { audience: 'owner' },
);
assert.equal(ownerScopeRecords.filter((record) => record.dogtalk_snapshot?.body).length, 4);
const modelScopeRecords = await listRadioRoomMessages(
  dogtalkScopeDb,
  {},
  { audience: 'model' },
);
const modelScope = Object.fromEntries(modelScopeRecords.map((record) => [record.text.slice(6), record]));
assert.equal(modelScope.read_now.dogtalk_snapshot.selected_for_reply, true);
assert.equal(modelScope.current_room.dogtalk_snapshot.selected_for_reply, false);
assert.equal(modelScope.when_confused.dogtalk_snapshot, undefined);
assert.equal(modelScope.when_confused.dogtalk_available, true);
assert.equal(modelScope.keep_private.dogtalk_snapshot, undefined);
assert.equal(modelScope.keep_private.dogtalk_available, false);
assert.equal(JSON.stringify(modelScope.when_confused).includes('private when_confused'), false);
assert.equal(JSON.stringify(modelScope.keep_private).includes('private keep_private'), false);
const mcpDogtalkRead = await mcp({
  jsonrpc: '2.0',
  id: 72,
  method: 'tools/call',
  params: {
    name: 'read_mystic_dogtalk',
    arguments: { room_scope: 'radio' },
  },
}, fullToken);
assert.equal(mcpDogtalkRead.result.structuredContent.dogtalk.room_scope, 'radio');
assert.equal(mcpDogtalkRead.result.structuredContent.dogtalk.memory_weight, 'low');
assert.equal(mcpDogtalkRead.result.structuredContent.available, true);
assert.match(mcpDogtalkRead.result.structuredContent.text, /别误会成：/);
const privateRadioDogtalkResponse = await routeApi(new Request(
  'https://coast.test/api/dogtalk',
  {
    method: 'PUT',
    headers: { Origin: 'https://coast.test', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...radioDogtalk,
      read_mode: 'keep_private',
      status: 'saved',
    }),
  },
), env, { exp: 1 });
assert.equal(privateRadioDogtalkResponse.status, 200);
const privateDogtalkRead = await mcp({
  jsonrpc: '2.0',
  id: 73,
  method: 'tools/call',
  params: {
    name: 'read_mystic_dogtalk',
    arguments: { room_scope: 'radio' },
  },
}, fullToken);
assert.equal(privateDogtalkRead.result.structuredContent.available, false);
assert.doesNotMatch(
  privateDogtalkRead.result.structuredContent.text,
  /这个房间可以低频看一点小寒写下的神秘狗话/,
);
const explicitPrivateDogtalkRead = await mcp({
  jsonrpc: '2.0',
  id: 74,
  method: 'tools/call',
  params: {
    name: 'read_mystic_dogtalk',
    arguments: {
      room_scope: 'radio',
      user_query: '小寒说：读一下神秘狗话',
    },
  },
}, fullToken);
assert.equal(explicitPrivateDogtalkRead.result.structuredContent.available, true);
assert.match(
  explicitPrivateDogtalkRead.result.structuredContent.text,
  /这个房间可以低频看一点小寒写下的神秘狗话/,
);
assert.equal((await listConversations(db)).length, 1, 'room memory windows must stay out of the normal chat list');

const clearRadioDogtalkResponse = await routeApi(new Request(
  `https://coast.test/api/dogtalk/${encodeURIComponent(radioDogtalk.id)}`,
  {
    method: 'DELETE',
    headers: { Origin: 'https://coast.test' },
  },
), env, { exp: 1 });
assert.equal(clearRadioDogtalkResponse.status, 200);
const emptyRadioDogtalkResponse = await routeApi(
  new Request('https://coast.test/api/dogtalk?room_scope=radio'),
  env,
  { exp: 1 },
);
const emptyRadioDogtalk = (await emptyRadioDogtalkResponse.json()).dogtalk;
assert.equal(emptyRadioDogtalk.id, null);
assert.equal(emptyRadioDogtalk.default_text, '小寒这轮很放松，因此偷懒中。');

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
  assert.equal(ownerWithdraw.status, 403);
  const forbidden = await ownerWithdraw.json();
  assert.equal(forbidden.error.type, 'radio_withdraw_forbidden');
}
assert.equal(
  (await listRadioMessages(db)).some((message) => ['official_mcp', 'coast_api'].includes(message.surface)),
  true,
  'model messages must remain when a forged owner withdraw is rejected',
);
const withdrawResponse = await routeApi(new Request(
  `https://coast.test/api/radio/messages/${encodeURIComponent(manualRadio.id)}`,
  { method: 'DELETE', headers: { Origin: 'https://coast.test' } },
), env, { exp: 1 });
assert.equal(withdrawResponse.status, 200);
const withdrawnMessage = (await withdrawResponse.json()).message;
assert.equal(withdrawnMessage.withdrawn, true);
assert.equal(withdrawnMessage.text, '这条电波已撤回');
const repeatedWithdrawResponse = await routeApi(new Request(
  `https://coast.test/api/radio/messages/${encodeURIComponent(manualRadio.id)}`,
  { method: 'DELETE', headers: { Origin: 'https://coast.test' } },
), env, { exp: 1 });
assert.equal(repeatedWithdrawResponse.status, 200);
assert.equal((await repeatedWithdrawResponse.json()).message.withdrawn, true);
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

await writeRoomMemory(
  db,
  'lighthouse',
  officialMcpIdentity({ model_label: 'GPT-5.4', model_nickname: '旧潮' }),
  {
    current_text: '灯塔房原有思维壤。',
    hand_seeds: [{
      name: '三路分离',
      life_core: '灯塔来信、灯塔房思维壤、灯塔巡迹各自写入，不互相代替。',
    }],
    do_not_repeat: '不要把来信正文自动推断成思维壤。',
    pocket_candidates: [{
      candidate_id: 'lighthouse-existing-candidate',
      title: '保留既有候选',
      life_core: '定向更新 current_text 时不能清掉候选。',
      content: '这是写入前已经存在的灯塔房候选。',
    }],
    organized_through_turn_id: 'lighthouse-existing-turn',
    tool_call_id: 'lighthouse-room-soil-fixture',
  },
);
db.database.prepare(`UPDATE conversation_soils
  SET manual_locked = 1, auto_refresh_enabled = 0
  WHERE conversation_id = ?`).run('coast-room:lighthouse:official_mcp');
const lighthouseMemoryBeforeLetter = await listRoomMemory(db, 'lighthouse');
const originalLighthouseSoil = lighthouseMemoryBeforeLetter.sources.official_mcp.soil;
const lighthouseCountBeforeLetter = (await listLighthouseLetters(db)).length;
const independentLetter = await mcp({
  jsonrpc: '2.0',
  id: 79,
  method: 'tools/call',
  params: {
    name: 'write_lighthouse_letter',
    arguments: {
      subject: '来信与房间壤分开',
      body: '普通灯塔来信只落来信，不要求也不修改 room memory。',
      model_label: 'GPT-5.6 Thinking',
      tool_call_id: 'lighthouse-independent-letter',
    },
  },
}, fullToken);
assert.equal(independentLetter.result.isError, undefined);
assert.equal(independentLetter.result.structuredContent.letter.surface, 'official_mcp');
assert.equal(independentLetter.result.structuredContent.letter.actor, 'myri');
assert.equal(independentLetter.result.structuredContent.letter.symbol, '≋');
assert.equal(
  independentLetter.result.structuredContent.letter.display_author,
  'ChatGPT-5.6 Thinking≋',
);
assert.equal('room_memory' in independentLetter.result.structuredContent, false);
assert.equal(independentLetter.result.structuredContent.room_memory_updated, false);
assert.equal(independentLetter.result.structuredContent.room_memory_reason, 'not_requested');
assert.equal((await listLighthouseLetters(db)).length, lighthouseCountBeforeLetter + 1);
const lighthouseMemoryAfterLetter = await listRoomMemory(db, 'lighthouse');
assert.equal(
  lighthouseMemoryAfterLetter.sources.official_mcp.soil.current_text,
  originalLighthouseSoil.current_text,
);
assert.equal(
  lighthouseMemoryAfterLetter.sources.official_mcp.soil.revision,
  originalLighthouseSoil.revision,
);

const lighthouseLetterCountBeforeSoilWrite = (await listLighthouseLetters(db)).length;
const lighthouseTraceCountBeforeSoilWrite = (await listOfficialSoils(db)).length;
const acceptanceSoilText = '灯塔来信房当前正在测试官端思维壤写入。狗话可读，来信可写，房间壤应独立于灯塔巡迹。';
const lighthouseRoomSoilCall = {
  jsonrpc: '2.0',
  id: 791,
  method: 'tools/call',
  params: {
    name: 'write_lighthouse_room_soil',
    arguments: {
      current_text: acceptanceSoilText,
      model_label: 'GPT-5.5 Thinking',
      model_nickname: '回潮',
      source_conversation_id: 'chatgpt-lighthouse-conversation-1',
      source_turn_id: 'chatgpt-lighthouse-soil-turn-1',
      tool_call_id: 'lighthouse-room-soil-acceptance-001',
    },
  },
};
const lighthouseRoomSoilWrite = await mcp(lighthouseRoomSoilCall, fullToken);
assert.equal(lighthouseRoomSoilWrite.result.isError, undefined);
assert.equal(lighthouseRoomSoilWrite.result.structuredContent.room_memory_updated, true);
assert.equal(lighthouseRoomSoilWrite.result.structuredContent.room_memory_reason, 'updated');
assert.equal(lighthouseRoomSoilWrite.result.structuredContent.idempotent, false);
const acceptedLighthouseSoil = lighthouseRoomSoilWrite.result.structuredContent.soil;
assert.equal(acceptedLighthouseSoil.conversation_id, 'coast-room:lighthouse:official_mcp');
assert.equal(acceptedLighthouseSoil.room_scope, 'lighthouse');
assert.equal(acceptedLighthouseSoil.room_key, 'lighthouse:main');
assert.equal(acceptedLighthouseSoil.source_surface, 'official_mcp');
assert.equal(acceptedLighthouseSoil.actor, 'myri');
assert.equal(acceptedLighthouseSoil.surface, 'official_mcp');
assert.equal(acceptedLighthouseSoil.model_label, 'GPT-5.5 Thinking');
assert.equal(acceptedLighthouseSoil.model_nickname, '回潮');
assert.equal(acceptedLighthouseSoil.symbol, '≋');
assert.equal(
  acceptedLighthouseSoil.display_author,
  'ChatGPT-5.5 Thinking 回潮≋',
);
assert.equal(acceptedLighthouseSoil.current_text, acceptanceSoilText);
assert.equal(acceptedLighthouseSoil.source_conversation_id, 'chatgpt-lighthouse-conversation-1');
assert.equal(acceptedLighthouseSoil.source_turn_id, 'chatgpt-lighthouse-soil-turn-1');
assert.equal(acceptedLighthouseSoil.tool_call_id, 'lighthouse-room-soil-acceptance-001');
assert.equal(acceptedLighthouseSoil.revision, originalLighthouseSoil.revision + 1);
assert.equal(acceptedLighthouseSoil.created_at, originalLighthouseSoil.created_at);
assert.equal(acceptedLighthouseSoil.manual_locked, originalLighthouseSoil.manual_locked);
assert.equal(acceptedLighthouseSoil.auto_refresh_enabled, originalLighthouseSoil.auto_refresh_enabled);
assert.deepEqual(acceptedLighthouseSoil.hand_seeds, originalLighthouseSoil.hand_seeds);
assert.equal(acceptedLighthouseSoil.do_not_repeat, originalLighthouseSoil.do_not_repeat);
assert.deepEqual(acceptedLighthouseSoil.pocket_candidates, originalLighthouseSoil.pocket_candidates);
assert.equal(
  acceptedLighthouseSoil.organized_through_turn_id,
  originalLighthouseSoil.organized_through_turn_id,
);
const canonicalLighthouseMemoryAfterWrite = await listRoomMemory(db, 'lighthouse');
assert.deepEqual(
  canonicalLighthouseMemoryAfterWrite.sources.official_mcp.pending_pockets,
  lighthouseMemoryBeforeLetter.sources.official_mcp.pending_pockets,
);
assert.deepEqual(
  canonicalLighthouseMemoryAfterWrite.sources.official_mcp.seeds,
  lighthouseMemoryBeforeLetter.sources.official_mcp.seeds,
);
assert.deepEqual(
  canonicalLighthouseMemoryAfterWrite.sources.official_mcp.memories,
  lighthouseMemoryBeforeLetter.sources.official_mcp.memories,
);
assert.deepEqual(
  canonicalLighthouseMemoryAfterWrite.sources.official_mcp.stones,
  lighthouseMemoryBeforeLetter.sources.official_mcp.stones,
);
assert.equal((await listLighthouseLetters(db)).length, lighthouseLetterCountBeforeSoilWrite);
assert.equal((await listOfficialSoils(db)).length, lighthouseTraceCountBeforeSoilWrite);

const lighthouseRoomSoilRead = await mcp({
  jsonrpc: '2.0',
  id: 792,
  method: 'tools/call',
  params: { name: 'list_lighthouse_letters', arguments: {} },
}, fullToken);
assert.equal(
  lighthouseRoomSoilRead.result.structuredContent
    .room_memory.sources.official_mcp.soil.current_text,
  acceptanceSoilText,
);
assert.deepEqual(
  lighthouseRoomSoilRead.result.structuredContent.room_memory.sources.official_mcp.soil,
  acceptedLighthouseSoil,
);
assert.equal(
  lighthouseRoomSoilRead.result.structuredContent.room_memory.sources.official_mcp.source_label,
  'ChatGPT-5.5 Thinking 回潮≋',
);
const lighthouseRoomSoilRevision = acceptedLighthouseSoil.revision;
const idempotentLighthouseRoomSoil = await mcp({
  ...lighthouseRoomSoilCall,
  id: 793,
  params: {
    ...lighthouseRoomSoilCall.params,
    arguments: {
      ...lighthouseRoomSoilCall.params.arguments,
      current_text: '同一 tool_call_id 的重试不得覆盖已落下的灯塔房思维壤。',
    },
  },
}, fullToken);
assert.equal(idempotentLighthouseRoomSoil.result.structuredContent.idempotent, true);
assert.equal(idempotentLighthouseRoomSoil.result.structuredContent.room_memory_updated, true);
assert.equal(idempotentLighthouseRoomSoil.result.structuredContent.room_memory_reason, 'updated');
assert.equal(
  idempotentLighthouseRoomSoil.result.structuredContent.soil.revision,
  lighthouseRoomSoilRevision,
);
assert.equal(
  idempotentLighthouseRoomSoil.result.structuredContent.soil.current_text,
  acceptanceSoilText,
);
console.error = () => {};
const emptyLighthouseRoomSoil = await mcp({
  jsonrpc: '2.0',
  id: 794,
  method: 'tools/call',
  params: {
    name: 'write_lighthouse_room_soil',
    arguments: {
      current_text: '   ',
      model_label: 'GPT-5.6 Thinking',
      tool_call_id: 'lighthouse-room-soil-empty',
    },
  },
}, fullToken);
const oversizedLighthouseRoomSoil = await mcp({
  jsonrpc: '2.0',
  id: 795,
  method: 'tools/call',
  params: {
    name: 'write_lighthouse_room_soil',
    arguments: {
      current_text: '壤'.repeat(12001),
      model_label: 'GPT-5.6 Thinking',
      tool_call_id: 'lighthouse-room-soil-oversized',
    },
  },
}, fullToken);
console.error = originalConsoleError;
for (const invalidWrite of [emptyLighthouseRoomSoil, oversizedLighthouseRoomSoil]) {
  assert.equal(invalidWrite.result.isError, true);
  assert.equal(invalidWrite.result._meta.error_type, 'invalid_tool_input');
  assert.equal(invalidWrite.result._meta.failure_code, 'invalid_request');
}
const lighthouseMemoryAfterInvalidWrites = await listRoomMemory(db, 'lighthouse');
assert.equal(
  lighthouseMemoryAfterInvalidWrites.sources.official_mcp.soil.revision,
  lighthouseRoomSoilRevision,
);
assert.equal(
  lighthouseMemoryAfterInvalidWrites.sources.official_mcp.soil.current_text,
  acceptanceSoilText,
);
assert.equal((await listLighthouseLetters(db)).length, lighthouseLetterCountBeforeSoilWrite);
assert.equal((await listOfficialSoils(db)).length, lighthouseTraceCountBeforeSoilWrite);

const longLighthouseSoilText = `超过旧上限仍完整保存：${'潮'.repeat(5000)}`;
const replacementLighthouseRoomSoil = await mcp({
  jsonrpc: '2.0',
  id: 796,
  method: 'tools/call',
  params: {
    name: 'write_lighthouse_room_soil',
    arguments: {
      current_text: longLighthouseSoilText,
      model_label: 'GPT-5.6 Thinking',
      model_nickname: 'sol',
      tool_call_id: 'lighthouse-room-soil-acceptance-002',
    },
  },
}, fullToken);
const replacedLighthouseSoil = replacementLighthouseRoomSoil.result.structuredContent.soil;
assert.equal(replacedLighthouseSoil.current_text, longLighthouseSoilText);
assert.equal(replacedLighthouseSoil.revision, lighthouseRoomSoilRevision + 1);
assert.equal(replacedLighthouseSoil.conversation_id, acceptedLighthouseSoil.conversation_id);
assert.equal(replacedLighthouseSoil.created_at, acceptedLighthouseSoil.created_at);
assert.deepEqual(replacedLighthouseSoil.hand_seeds, originalLighthouseSoil.hand_seeds);
assert.equal(replacedLighthouseSoil.do_not_repeat, originalLighthouseSoil.do_not_repeat);
assert.deepEqual(replacedLighthouseSoil.pocket_candidates, originalLighthouseSoil.pocket_candidates);
const delayedFirstCallRetry = await mcp({
  ...lighthouseRoomSoilCall,
  id: 798,
  params: {
    ...lighthouseRoomSoilCall.params,
    arguments: {
      ...lighthouseRoomSoilCall.params.arguments,
      current_text: '旧 key 即使隔着一次新更新再重放，也不得把当前壤回滚。',
    },
  },
}, fullToken);
assert.equal(delayedFirstCallRetry.result.structuredContent.idempotent, true);
assert.equal(
  delayedFirstCallRetry.result.structuredContent.soil.current_text,
  longLighthouseSoilText,
);
assert.equal(
  delayedFirstCallRetry.result.structuredContent.soil.revision,
  replacedLighthouseSoil.revision,
);
assert.equal(
  db.database.prepare(`SELECT COUNT(*) AS count FROM conversation_soils
    WHERE conversation_id = ?`).get('coast-room:lighthouse:official_mcp').count,
  1,
);

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
assert.equal(letterWrite.result.structuredContent.room_memory_updated, false);
assert.equal(letterWrite.result.structuredContent.room_memory_reason, 'not_requested');
assert.equal('room_memory' in letterWrite.result.structuredContent, false);
const lighthouseMemoryAfterSecondLetter = await listRoomMemory(db, 'lighthouse');
assert.equal(
  lighthouseMemoryAfterSecondLetter.sources.official_mcp.soil.current_text,
  longLighthouseSoilText,
);
assert.equal(
  lighthouseMemoryAfterSecondLetter.sources.official_mcp.soil.revision,
  replacedLighthouseSoil.revision,
);
const lighthouseTraceRetry = await mcp({ ...soilCall, id: 797 }, fullToken);
assert.equal(lighthouseTraceRetry.result.structuredContent.soil.id, writtenSoil.result.structuredContent.soil.id);
const lighthouseMemoryAfterTraceRetry = await listRoomMemory(db, 'lighthouse');
assert.equal(
  lighthouseMemoryAfterTraceRetry.sources.official_mcp.soil.current_text,
  longLighthouseSoilText,
);
assert.equal(
  lighthouseMemoryAfterTraceRetry.sources.official_mcp.soil.revision,
  replacedLighthouseSoil.revision,
);
assert.equal((await listLighthouseLetters(db))[0].symbol, '≋');

const lighthouseDogtalkResponse = await routeApi(new Request(
  'https://coast.test/api/dogtalk',
  {
    method: 'PUT',
    headers: { Origin: 'https://coast.test', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      room_scope: 'lighthouse',
      body: '灯塔来信里只和官端慢慢写信，不叫海岸 API 进来。',
      read_mode: 'current_room',
      status: 'saved',
    }),
  },
), env, { exp: 1 });
assert.equal(lighthouseDogtalkResponse.status, 200);
const manualLighthouseResponse = await routeApi(new Request(
  'https://coast.test/api/lighthouse/letters',
  {
    method: 'POST',
    headers: { Origin: 'https://coast.test', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subject: '这一轮给灯塔看的天气',
      body: '小寒把这一轮正文和神秘狗话一起寄来。',
      dogtalk: {
        body: '这一刻想被官端轻轻看见。',
        true_core: '想靠近。',
        self_note: '只是这一轮天气。',
        myri_hint: '轻轻接住即可。',
        not_to_misunderstand: '不要误会成长期偏好。',
        weather: '想靠近',
        read_mode: 'read_now',
      },
    }),
  },
), env, { exp: 1 });
assert.equal(manualLighthouseResponse.status, 201);
const manualLighthouse = (await manualLighthouseResponse.json()).letter;
assert.equal(manualLighthouse.dogtalk_snapshot.read_mode, 'read_now');
const lighthouseWebRead = await routeApi(
  new Request('https://coast.test/api/lighthouse/letters'),
  env,
  { exp: 1 },
);
assert.equal(
  (await lighthouseWebRead.json()).letters
    .find((letter) => letter.id === manualLighthouse.id).dogtalk_snapshot.body,
  '这一刻想被官端轻轻看见。',
);
const lighthouseMemoryResponse = await routeApi(
  new Request('https://coast.test/api/lighthouse/memory'),
  env,
  { exp: 1 },
);
assert.equal(lighthouseMemoryResponse.status, 200);
const lighthouseMemory = (await lighthouseMemoryResponse.json()).memory;
assert.deepEqual(lighthouseMemory.participants, ['web_manual', 'official_mcp']);
assert.deepEqual(Object.keys(lighthouseMemory.sources).sort(), ['official_mcp']);
assert.equal('owner_note' in lighthouseMemory, false);
assert.equal('coast_api' in lighthouseMemory.sources, false);
assert.equal(lighthouseMemory.sources.official_mcp.soil.current_text, longLighthouseSoilText);
assert.equal(lighthouseMemory.sources.official_mcp.soil.revision, replacedLighthouseSoil.revision);
assert.equal(lighthouseMemory.sources.official_mcp.soil.display_author, 'ChatGPT-5.6 Thinking sol≋');
assert.doesNotMatch(
  lighthouseMemory.sources.official_mcp.soil.current_text,
  /这一刻想被官端轻轻看见/,
);
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
assert.match(lighthouseOfficialContext.dogtalk.context, /【神秘狗话】/);
assert.match(lighthouseOfficialContext.dogtalk.context, /这一刻想被官端轻轻看见/);
assert.match(lighthouseOfficialContext.dogtalk.context, /别误会成：/);

const mcpLighthouseRead = await mcp({
  jsonrpc: '2.0',
  id: 81,
  method: 'tools/call',
  params: { name: 'list_lighthouse_letters', arguments: {} },
}, fullToken);
assert.match(mcpLighthouseRead.result.structuredContent.context.paper_slips, /【思维壤】/);
assert.equal(Object.hasOwn(mcpLighthouseRead.result.structuredContent.context, 'manifest'), false);
assert.equal(Object.hasOwn(mcpLighthouseRead.result.structuredContent.context, 'blocks'), false);
assert.equal(Object.hasOwn(mcpLighthouseRead.result.structuredContent.context, 'desk_slip'), false);
assert.deepEqual(
  mcpLighthouseRead.result.structuredContent.room_memory.participants,
  ['web_manual', 'official_mcp'],
);
assert.deepEqual(
  Object.keys(mcpLighthouseRead.result.structuredContent.room_memory.sources).sort(),
  ['official_mcp'],
);
assert.equal('owner_note' in mcpLighthouseRead.result.structuredContent.room_memory, false);
const mcpManualLighthouse = mcpLighthouseRead.result.structuredContent.letters
  .find((letter) => letter.id === manualLighthouse.id);
assert.equal(mcpManualLighthouse.room_scope, 'lighthouse');
assert.equal(mcpManualLighthouse.dogtalk_snapshot.selected_for_reply, true);
assert.equal(mcpManualLighthouse.dogtalk_snapshot.memory_weight, 'low');
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
const deletedTraceRetry = await mcp({ ...soilCall, id: 151 }, fullToken);
assert.equal(deletedTraceRetry.result.isError, true);
assert.equal(deletedTraceRetry.result._meta.error_type, 'official_soil_deleted');
assert.equal((await listOfficialSoils(db)).length, 0, 'an MCP retry must not resurrect an owner-deleted trace');

const manifest = await routeMcpRequest(new Request('https://coast.test/mcp/manifest'), env);
assert.equal(manifest.status, 200);
assert.equal(manifest.headers.get('cache-control'), 'private, no-store');
assert.equal(manifest.headers.get('x-coast-mcp-catalog-version'), '1.9.0');
const manifestBody = await manifest.json();
assert.equal(manifestBody.authentication, 'oauth2');
assert.equal(manifestBody.version, '1.9.0');
assert.equal(manifestBody.tool_catalog_version, '1.9.0');
assert.equal(manifestBody.tool_count, toolList.result.tools.length);
assert.deepEqual(manifestBody.tools, toolList.result.tools.map((tool) => tool.name));
assert.deepEqual(manifestBody.tool_definitions, toolList.result.tools);
const manifestLetterWriter = manifestBody.tool_definitions.find(
  (tool) => tool.name === 'write_lighthouse_letter',
);
assert.equal('room_memory' in manifestLetterWriter.inputSchema.properties, false);
const manifestLighthouseSoilWriter = manifestBody.tool_definitions.find(
  (tool) => tool.name === 'write_lighthouse_room_soil',
);
assert.ok(manifestLighthouseSoilWriter);
assert.ok('current_text' in manifestLighthouseSoilWriter.inputSchema.properties);
assert.deepEqual(
  manifestLighthouseSoilWriter.inputSchema.required,
  ['current_text', 'model_label'],
);
assert.equal(manifestLighthouseSoilWriter.inputSchema.properties.current_text.maxLength, 12000);
assert.deepEqual(manifestLighthouseSoilWriter.securitySchemes[0].scopes, ['write:soil']);
const metadata = await routeMcpRequest(new Request('https://coast.test/.well-known/oauth-protected-resource'), env);
assert.equal(metadata.status, 200);
assert.equal((await metadata.json()).authorization_servers[0], issuer);
const health = await routeMcpRequest(new Request('https://coast.test/mcp/health'), {});
assert.equal(health.status, 200);
assert.equal(health.headers.get('cache-control'), 'private, no-store');
assert.equal(health.headers.get('x-coast-mcp-catalog-version'), '1.9.0');
const healthBody = await health.json();
assert.equal(healthBody.version, '1.9.0');
assert.equal(healthBody.transport, 'streamable-http');

globalThis.fetch = originalFetch;
console.log('mcp-porch: ok');

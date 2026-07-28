const jwksByIssuer = new Map();
const JWKS_CACHE_MS = 10 * 60_000;
const JWKS_REFRESH_COOLDOWN_MS = 30_000;
const MAX_TOKEN_LENGTH = 24_000;
const EMAIL_CLAIM_DEFAULT = 'https://elementeracoast.com/email';
const EMAIL_VERIFIED_CLAIM_DEFAULT = 'https://elementeracoast.com/email_verified';
export const MCP_SCOPES = Object.freeze([
  'read:coast',
  'write:soil',
  'write:radio',
  'write:lighthouse',
]);

export class McpAuthError extends Error {
  constructor(type, message, status = 401, details = {}) {
    super(message);
    this.name = 'McpAuthError';
    this.type = type;
    this.status = status;
    this.details = details;
    this.failureCode = details.failure_code || null;
  }
}

function createAuthDiagnostic(request, requiredScopes = []) {
  return {
    authorization_header_present: Boolean(request?.headers?.has('Authorization')),
    required_scopes: [...requiredScopes],
    actual_scopes: [],
    jwt_verified: null,
    claim_checks: {
      iss_matches: null,
      aud_matches: null,
      token_expired: null,
      sub_allowed: null,
      email_allowed: null,
      email_verified: null,
    },
  };
}

function diagnosticSnapshot(value) {
  return {
    authorization_header_present: Boolean(value.authorization_header_present),
    required_scopes: [...value.required_scopes],
    actual_scopes: [...value.actual_scopes],
    jwt_verified: value.jwt_verified,
    claim_checks: { ...value.claim_checks },
  };
}

function authFailure(failureCode, message, status, diagnostic, extra = {}) {
  const type = failureCode === 'scope_missing'
    ? 'insufficient_scope'
    : failureCode === 'subject_not_allowed'
      ? 'mcp_subject_denied'
      : ['email_not_allowed', 'email_not_verified'].includes(failureCode)
        ? 'mcp_email_denied'
        : 'invalid_access_token';
  return new McpAuthError(type, message, status, {
    ...extra,
    failure_code: failureCode,
    auth_diagnostic: diagnosticSnapshot(diagnostic),
  });
}

function splitList(value, { lowercase = false } = {}) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => lowercase ? item.toLocaleLowerCase('en-US') : item);
}

function issuerUrl(value) {
  let url;
  try {
    url = new URL(String(value || ''));
  } catch {
    throw new McpAuthError('mcp_auth_not_configured', 'MCP OAuth issuer 未配置。', 503);
  }
  if (url.protocol !== 'https:') throw new McpAuthError('mcp_auth_not_configured', 'MCP OAuth issuer 必须使用 HTTPS。', 503);
  url.hash = '';
  url.search = '';
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url.href;
}

export function mcpAuthConfig(env = {}) {
  const issuer = issuerUrl(env.COAST_MCP_AUTH0_ISSUER);
  const audience = String(env.COAST_MCP_AUTH0_AUDIENCE || '').trim();
  const allowedSubjects = splitList(env.COAST_MCP_ALLOWED_SUBJECTS);
  const allowedEmails = splitList(env.COAST_MCP_ALLOWED_EMAILS, { lowercase: true });
  const emailClaim = String(env.COAST_MCP_EMAIL_CLAIM || EMAIL_CLAIM_DEFAULT).trim();
  const emailVerifiedClaim = String(env.COAST_MCP_EMAIL_VERIFIED_CLAIM || EMAIL_VERIFIED_CLAIM_DEFAULT).trim();
  if (!audience || !allowedSubjects.length || !allowedEmails.length || !emailClaim || !emailVerifiedClaim) {
    throw new McpAuthError(
      'mcp_auth_not_configured',
      'MCP OAuth 的 audience、允许 subject、允许 email 或 email claim 尚未完整配置。',
      503,
    );
  }
  return Object.freeze({
    issuer,
    audience,
    allowedSubjects: new Set(allowedSubjects),
    allowedEmails: new Set(allowedEmails),
    emailClaim,
    emailVerifiedClaim,
  });
}

function bearerToken(request, diagnostic) {
  const authorization = request.headers.get('Authorization');
  if (authorization == null) {
    throw authFailure(
      'missing_authorization_header',
      '需要连接小寒的海岸账号。',
      401,
      diagnostic,
    );
  }
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw authFailure(
      'malformed_bearer_token',
      '海岸连接的 Authorization 格式无效。',
      401,
      diagnostic,
    );
  }
  const token = match[1].trim();
  if (!token || token.length > MAX_TOKEN_LENGTH) {
    throw authFailure(
      'malformed_bearer_token',
      '海岸连接的 Bearer token 格式无效。',
      401,
      diagnostic,
    );
  }
  return token;
}

function scopesFromClaims(payload) {
  return new Set(String(payload.scope || '').split(/\s+/).filter(Boolean));
}

function decodeBase64Url(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  let binary;
  try {
    binary = atob(padded);
  } catch {
    throw new McpAuthError('invalid_access_token', '海岸连接令牌无效或已经过期。', 401);
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeJsonSegment(value) {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new TypeError();
    return parsed;
  } catch (error) {
    if (error instanceof McpAuthError) throw error;
    throw new McpAuthError('invalid_access_token', '海岸连接令牌无效或已经过期。', 401);
  }
}

function populateVerifiedClaimDiagnostic(payload, config, diagnostic) {
  const audience = Array.isArray(payload.aud) ? payload.aud.map(String) : [String(payload.aud || '')];
  const subject = String(payload?.sub || '').trim();
  const email = String(payload?.[config.emailClaim] || payload?.email || '').trim().toLocaleLowerCase('en-US');
  diagnostic.actual_scopes = [...scopesFromClaims(payload)].sort();
  diagnostic.claim_checks.iss_matches = payload.iss === config.issuer;
  diagnostic.claim_checks.aud_matches = audience.includes(config.audience);
  diagnostic.claim_checks.token_expired = Number.isFinite(payload.exp)
    ? payload.exp <= Date.now() / 1000 - 5
    : null;
  diagnostic.claim_checks.sub_allowed = Boolean(subject && config.allowedSubjects.has(subject));
  diagnostic.claim_checks.email_allowed = Boolean(email && config.allowedEmails.has(email));
  diagnostic.claim_checks.email_verified = payload?.[config.emailVerifiedClaim] === true
    || payload?.email_verified === true;
}

function validateRegisteredClaims(payload, config, diagnostic) {
  const now = Date.now() / 1000;
  if (!diagnostic.claim_checks.iss_matches) {
    throw authFailure('issuer_mismatch', '海岸连接令牌的 issuer 不匹配。', 401, diagnostic);
  }
  if (!diagnostic.claim_checks.aud_matches) {
    throw authFailure('audience_mismatch', '海岸连接令牌的 audience 不匹配。', 401, diagnostic);
  }
  if (!Number.isFinite(payload.exp)) {
    throw authFailure('jwt_verify_failed', '海岸连接令牌缺少有效过期时间。', 401, diagnostic);
  }
  if (diagnostic.claim_checks.token_expired) {
    throw authFailure('expired_token', '海岸连接令牌已经过期。', 401, diagnostic);
  }
  if (payload.nbf != null && (!Number.isFinite(payload.nbf) || payload.nbf > now + 5)) {
    throw authFailure('jwt_verify_failed', '海岸连接令牌尚未生效。', 401, diagnostic);
  }
  if (payload.iat != null && (!Number.isFinite(payload.iat) || payload.iat > now + 60)) {
    throw authFailure('jwt_verify_failed', '海岸连接令牌签发时间无效。', 401, diagnostic);
  }
}

export function validateMcpClaims(
  payload,
  config,
  requiredScopes = [],
  diagnostic = createAuthDiagnostic(null, requiredScopes),
) {
  const subject = String(payload?.sub || '').trim();
  const email = String(payload?.[config.emailClaim] || payload?.email || '').trim().toLocaleLowerCase('en-US');
  const emailVerified = payload?.[config.emailVerifiedClaim] === true || payload?.email_verified === true;
  const scopes = scopesFromClaims(payload);
  diagnostic.actual_scopes = [...scopes].sort();
  diagnostic.claim_checks.sub_allowed = Boolean(subject && config.allowedSubjects.has(subject));
  diagnostic.claim_checks.email_allowed = Boolean(email && config.allowedEmails.has(email));
  diagnostic.claim_checks.email_verified = emailVerified;
  if (!diagnostic.claim_checks.sub_allowed) {
    throw authFailure(
      'subject_not_allowed',
      '这个 Auth0 身份不在海岸邀请名单中。',
      403,
      diagnostic,
    );
  }
  if (!diagnostic.claim_checks.email_allowed) {
    throw authFailure(
      'email_not_allowed',
      '这个邮箱身份不在海岸邀请名单中。',
      403,
      diagnostic,
    );
  }
  if (!diagnostic.claim_checks.email_verified) {
    throw authFailure(
      'email_not_verified',
      '这个邮箱身份尚未通过验证。',
      403,
      diagnostic,
    );
  }
  const missing = requiredScopes.filter((scope) => !scopes.has(scope));
  if (missing.length) {
    throw authFailure(
      'scope_missing',
      '当前连接缺少所需海岸权限。',
      403,
      diagnostic,
      { missing_scopes: missing },
    );
  }
  return Object.freeze({
    subject,
    email,
    scopes,
  });
}

async function remoteJwks(issuer, { refresh = false } = {}) {
  const cached = jwksByIssuer.get(issuer);
  if (!refresh && cached && cached.expires_at > Date.now()) return cached;
  if (refresh && cached && cached.refreshed_at + JWKS_REFRESH_COOLDOWN_MS > Date.now()) return cached;
  let response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    response = await fetch(new URL('.well-known/jwks.json', issuer), {
      headers: { Accept: 'application/json' },
      redirect: 'error',
      signal: controller.signal,
    });
  } catch {
    throw new McpAuthError('invalid_access_token', '暂时无法验证海岸连接身份。', 401);
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) throw new McpAuthError('invalid_access_token', '暂时无法验证海岸连接身份。', 401);
  let body;
  try {
    body = await response.json();
  } catch {
    throw new McpAuthError('invalid_access_token', '暂时无法验证海岸连接身份。', 401);
  }
  const keys = Array.isArray(body?.keys)
    ? body.keys.filter((key) => key?.kty === 'RSA' && key?.kid && (!key.use || key.use === 'sig'))
    : [];
  if (!keys.length) throw new McpAuthError('invalid_access_token', '暂时无法验证海岸连接身份。', 401);
  const value = {
    keys,
    imported: new Map(),
    refreshed_at: Date.now(),
    expires_at: Date.now() + JWKS_CACHE_MS,
  };
  jwksByIssuer.set(issuer, value);
  return value;
}

async function verifyMcpToken(token, config, diagnostic) {
  diagnostic.jwt_verified = false;
  const segments = token.split('.');
  if (segments.length !== 3 || segments.some((segment) => !segment)) {
    throw new McpAuthError('invalid_access_token', '海岸连接令牌无效或已经过期。', 401);
  }
  const [encodedHeader, encodedPayload, encodedSignature] = segments;
  const header = decodeJsonSegment(encodedHeader);
  const payload = decodeJsonSegment(encodedPayload);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid) {
    throw new McpAuthError('invalid_access_token', '海岸连接令牌签名算法无效。', 401);
  }
  let jwks = await remoteJwks(config.issuer);
  let jwk = jwks.keys.find((candidate) => candidate.kid === header.kid);
  if (!jwk) {
    jwks = await remoteJwks(config.issuer, { refresh: true });
    jwk = jwks.keys.find((candidate) => candidate.kid === header.kid);
  }
  if (!jwk || (jwk.alg && jwk.alg !== 'RS256')) {
    throw new McpAuthError('invalid_access_token', '海岸连接令牌签名密钥无效。', 401);
  }
  let publicKey = jwks.imported.get(header.kid);
  if (!publicKey) {
    try {
      publicKey = await crypto.subtle.importKey(
        'jwk',
        jwk,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify'],
      );
    } catch {
      throw new McpAuthError('invalid_access_token', '海岸连接令牌签名密钥无效。', 401);
    }
    jwks.imported.set(header.kid, publicKey);
  }
  const verified = await crypto.subtle.verify(
    { name: 'RSASSA-PKCS1-v1_5' },
    publicKey,
    decodeBase64Url(encodedSignature),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  );
  if (!verified) {
    throw authFailure(
      'jwt_verify_failed',
      '海岸连接令牌签名验证失败。',
      401,
      diagnostic,
    );
  }
  diagnostic.jwt_verified = true;
  populateVerifiedClaimDiagnostic(payload, config, diagnostic);
  validateRegisteredClaims(payload, config, diagnostic);
  return payload;
}

export async function requireMcpAuth(request, env, requiredScopes = []) {
  const diagnostic = createAuthDiagnostic(request, requiredScopes);
  try {
    const token = bearerToken(request, diagnostic);
    const config = mcpAuthConfig(env);
    const payload = await verifyMcpToken(token, config, diagnostic);
    return validateMcpClaims(payload, config, requiredScopes, diagnostic);
  } catch (error) {
    if (error instanceof McpAuthError && error.failureCode) throw error;
    throw authFailure(
      'jwt_verify_failed',
      error?.status === 503 ? 'MCP OAuth 验证暂时不可用。' : '海岸连接令牌验证失败。',
      error?.status === 503 ? 503 : 401,
      diagnostic,
    );
  }
}

export function mcpResourceMetadata(request, env) {
  const config = mcpAuthConfig(env);
  const origin = new URL(request.url).origin;
  return {
    resource: `${origin}/mcp`,
    authorization_servers: [config.issuer],
    scopes_supported: MCP_SCOPES,
    bearer_methods_supported: ['header'],
    resource_documentation: `${origin}/mcp/manifest`,
  };
}

export function mcpAuthChallenge(request, error, scopes = []) {
  const origin = new URL(request.url).origin;
  const code = error?.failureCode === 'scope_missing' ? 'insufficient_scope' : 'invalid_token';
  const description = String(error?.message || 'Authorization required').replace(/["\\\r\n]/g, ' ').slice(0, 180);
  const scope = scopes.length ? `, scope="${scopes.join(' ')}"` : '';
  return `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource", error="${code}", error_description="${description}"${scope}`;
}

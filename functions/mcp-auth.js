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
  }
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

function bearerToken(request) {
  const authorization = String(request.headers.get('Authorization') || '');
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new McpAuthError('missing_access_token', '需要连接小寒的海岸账号。', 401);
  const token = match[1].trim();
  if (!token || token.length > MAX_TOKEN_LENGTH) {
    throw new McpAuthError('invalid_access_token', '海岸连接令牌无效或已经过期。', 401);
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

function validateRegisteredClaims(payload, config) {
  const now = Date.now() / 1000;
  const audience = Array.isArray(payload.aud) ? payload.aud.map(String) : [String(payload.aud || '')];
  if (payload.iss !== config.issuer || !audience.includes(config.audience)) {
    throw new McpAuthError('invalid_access_token', '海岸连接令牌无效或已经过期。', 401);
  }
  if (!Number.isFinite(payload.exp) || payload.exp <= now - 5) {
    throw new McpAuthError('invalid_access_token', '海岸连接令牌无效或已经过期。', 401);
  }
  if (payload.nbf != null && (!Number.isFinite(payload.nbf) || payload.nbf > now + 5)) {
    throw new McpAuthError('invalid_access_token', '海岸连接令牌尚未生效。', 401);
  }
  if (payload.iat != null && (!Number.isFinite(payload.iat) || payload.iat > now + 60)) {
    throw new McpAuthError('invalid_access_token', '海岸连接令牌签发时间无效。', 401);
  }
}

export function validateMcpClaims(payload, config, requiredScopes = []) {
  const subject = String(payload?.sub || '').trim();
  const email = String(payload?.[config.emailClaim] || payload?.email || '').trim().toLocaleLowerCase('en-US');
  const emailVerified = payload?.[config.emailVerifiedClaim] === true || payload?.email_verified === true;
  if (!subject || !config.allowedSubjects.has(subject)) {
    throw new McpAuthError('mcp_subject_denied', '这个 Auth0 身份不在海岸邀请名单中。', 403);
  }
  if (!email || !emailVerified || !config.allowedEmails.has(email)) {
    throw new McpAuthError('mcp_email_denied', '这个邮箱身份不在海岸邀请名单中。', 403);
  }
  const scopes = scopesFromClaims(payload);
  const missing = requiredScopes.filter((scope) => !scopes.has(scope));
  if (missing.length) {
    throw new McpAuthError('insufficient_scope', '当前连接缺少所需海岸权限。', 403, { missing_scopes: missing });
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

async function verifyMcpToken(token, config) {
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
  if (!verified) throw new McpAuthError('invalid_access_token', '海岸连接令牌无效或已经过期。', 401);
  validateRegisteredClaims(payload, config);
  return payload;
}

export async function requireMcpAuth(request, env, requiredScopes = []) {
  const config = mcpAuthConfig(env);
  try {
    const payload = await verifyMcpToken(bearerToken(request), config);
    return validateMcpClaims(payload, config, requiredScopes);
  } catch (error) {
    if (error instanceof McpAuthError) throw error;
    throw new McpAuthError('invalid_access_token', '海岸连接令牌无效或已经过期。', 401);
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
  const code = error?.type === 'insufficient_scope' ? 'insufficient_scope' : 'invalid_token';
  const description = String(error?.message || 'Authorization required').replace(/["\\\r\n]/g, ' ').slice(0, 180);
  const scope = scopes.length ? `, scope="${scopes.join(' ')}"` : '';
  return `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource", error="${code}", error_description="${description}"${scope}`;
}

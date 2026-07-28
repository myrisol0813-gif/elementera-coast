import { createRemoteJWKSet, jwtVerify } from 'jose';

const jwksByIssuer = new Map();
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
  return match[1].trim();
}

function scopesFromClaims(payload) {
  return new Set(String(payload.scope || '').split(/\s+/).filter(Boolean));
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

function remoteJwks(issuer) {
  let jwks = jwksByIssuer.get(issuer);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL('.well-known/jwks.json', issuer), {
      cooldownDuration: 30_000,
      cacheMaxAge: 10 * 60_000,
      timeoutDuration: 5_000,
    });
    jwksByIssuer.set(issuer, jwks);
  }
  return jwks;
}

export async function requireMcpAuth(request, env, requiredScopes = [], jwks) {
  const config = mcpAuthConfig(env);
  let payload;
  try {
    ({ payload } = await jwtVerify(bearerToken(request), jwks || remoteJwks(config.issuer), {
      algorithms: ['RS256'],
      issuer: config.issuer,
      audience: config.audience,
      requiredClaims: ['exp', 'sub'],
      clockTolerance: 5,
    }));
  } catch (error) {
    if (error instanceof McpAuthError) throw error;
    throw new McpAuthError('invalid_access_token', '海岸连接令牌无效或已经过期。', 401);
  }
  return validateMcpClaims(payload, config, requiredScopes);
}

export function mcpResourceMetadata(request, env) {
  const config = mcpAuthConfig(env);
  const origin = new URL(request.url).origin;
  return {
    resource: `${origin}/mcp`,
    authorization_servers: [config.issuer.replace(/\/$/, '')],
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

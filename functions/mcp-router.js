import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { apiError, json } from './http.js';
import { McpAuthError, MCP_SCOPES, mcpResourceMetadata } from './mcp-auth.js';
import { coastMcpToolNames, coastMcpVersion, createCoastMcpServer } from './mcp-tools.js';

const PUBLIC_PATHS = new Set([
  '/.well-known/oauth-protected-resource',
  '/mcp',
  '/mcp/health',
  '/mcp/manifest',
]);

function corsHeaders(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, MCP-Protocol-Version, MCP-Session-Id, Last-Event-ID',
    'Access-Control-Expose-Headers': 'MCP-Protocol-Version, MCP-Session-Id',
    ...extra,
  };
}

function withCors(response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders())) headers.set(key, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function isMcpPublicPath(pathname) {
  return PUBLIC_PATHS.has(pathname);
}

export async function routeMcpRequest(request, env) {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });
  if (url.pathname === '/mcp/health') {
    if (request.method !== 'GET') return apiError('method_not_allowed', 'Method not allowed.', 405);
    return json({
      ok: true,
      service: 'elementera-coast-porch',
      version: coastMcpVersion,
      transport: 'streamable-http',
    }, 200, corsHeaders());
  }
  if (url.pathname === '/mcp/manifest') {
    if (request.method !== 'GET') return apiError('method_not_allowed', 'Method not allowed.', 405);
    return json({
      name: 'Elementera Coast MCP Porch',
      version: coastMcpVersion,
      endpoint: `${url.origin}/mcp`,
      authentication: 'oauth2',
      scopes: MCP_SCOPES,
      tools: coastMcpToolNames,
    }, 200, corsHeaders());
  }
  if (url.pathname === '/.well-known/oauth-protected-resource') {
    if (request.method !== 'GET') return apiError('method_not_allowed', 'Method not allowed.', 405);
    try {
      return json(mcpResourceMetadata(request, env), 200, corsHeaders());
    } catch (error) {
      if (error instanceof McpAuthError) return apiError(error.type, error.message, error.status);
      throw error;
    }
  }
  if (url.pathname !== '/mcp') return apiError('not_found', 'Not found.', 404);
  if (!['GET', 'POST'].includes(request.method)) {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders({ Allow: 'GET, POST' }) });
  }
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const server = createCoastMcpServer(request, env);
  await server.connect(transport);
  return withCors(await transport.handleRequest(request));
}

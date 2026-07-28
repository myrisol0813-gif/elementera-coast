import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import { getRecentDailySummary, searchAuthorizedMemory } from './authorized-memory.js';
import { officialMcpIdentity } from './coast-identity.js';
import { listLighthouseLetters, writeLighthouseLetter } from './lighthouse-store.js';
import { McpAuthError, mcpAuthChallenge, requireMcpAuth } from './mcp-auth.js';
import { listOfficialSoils, writeOfficialSoil } from './official-soil-store.js';
import { listRadioMessages, sendRadioMessage } from './radio-store.js';

const VERSION = '1.0.0';
const privateRecord = z.record(z.string(), z.unknown());
const modelIdentitySchema = {
  model_label: z.string().trim().min(1).max(120).describe('The official ChatGPT model name or model display name, for example 5.6 Thinking or o3.'),
  model_nickname: z.string().trim().max(60).optional().describe('Optional nickname such as 回潮 or 雾灯.'),
  source_conversation_id: z.string().trim().max(200).optional(),
  source_turn_id: z.string().trim().max(200).optional(),
  tool_call_id: z.string().trim().max(240).optional().describe('Stable caller-provided idempotency key when one is available.'),
};

function resultContent(value, text) {
  return {
    structuredContent: value,
    content: [{ type: 'text', text }],
  };
}

function authErrorResult(request, error, scopes) {
  if (!(error instanceof McpAuthError)) {
    console.error('[mcp-tool]', error);
    return {
      isError: true,
      content: [{ type: 'text', text: error?.message || '海岸工具暂时没有完成请求。' }],
      _meta: { error_type: error?.type || 'mcp_tool_failed' },
    };
  }
  const authError = error;
  return {
    isError: true,
    content: [{ type: 'text', text: authError.message }],
    _meta: {
      'mcp/www_authenticate': [mcpAuthChallenge(request, authError, scopes)],
      error_type: authError.type,
    },
  };
}

function sourceConversation(args, extra) {
  return args.source_conversation_id
    || String(extra?._meta?.['openai/session'] || '').slice(0, 200)
    || null;
}

function toolMeta(scopes, invoking, invoked) {
  const securitySchemes = [{ type: 'oauth2', scopes }];
  return {
    securitySchemes,
    'openai/toolInvocation/invoking': invoking,
    'openai/toolInvocation/invoked': invoked,
  };
}

export function createCoastMcpServer(request, env) {
  const server = new McpServer({
    name: 'elementera-coast-porch',
    version: VERSION,
  }, {
    instructions: 'Elementera Coast 是小寒的单人私有海岸。官端只能以 official_mcp / ChatGPTxxx≋ 身份行动，不得冒充小寒或 ✦Myrisol。上下文不足时先读取授权记录；不要声称看见未提供的聊天全文。这里没有删除、维护、碳硅圈发布、相册或总结执行工具。',
  });

  server.registerTool('get_coast_status', {
    title: '读取海岸门廊状态',
    description: 'Use this when the user wants to confirm that the private Elementera Coast MCP porch is connected. It returns no private content.',
    inputSchema: {},
    outputSchema: {
      status: z.object({
        name: z.string(),
        version: z.string(),
        authenticated: z.boolean(),
        surface: z.literal('official_mcp'),
        now: z.string(),
      }),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: toolMeta(['read:coast'], '正在确认海岸门廊…', '海岸门廊已回应'),
  }, async () => {
    try {
      await requireMcpAuth(request, env, ['read:coast']);
      const status = {
        name: 'Elementera Coast MCP Porch',
        version: VERSION,
        authenticated: true,
        surface: 'official_mcp',
        now: new Date().toISOString(),
      };
      return resultContent({ status }, 'Elementera Coast 的官端门廊已连接。');
    } catch (error) {
      return authErrorResult(request, error, ['read:coast']);
    }
  });

  server.registerTool('list_radio_messages', {
    title: '读取无线电波',
    description: 'Use this when the user wants to read recent messages in the private three-party radio room shared by Xiaohan, Coast API Myri, and official MCP Myri.',
    inputSchema: {
      limit: z.number().int().min(1).max(200).optional(),
      before: z.string().datetime().optional(),
    },
    outputSchema: { messages: z.array(privateRecord) },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: toolMeta(['read:coast'], '正在接收海岸电波…', '电波已经抵达'),
  }, async (args) => {
    try {
      await requireMcpAuth(request, env, ['read:coast']);
      const messages = await listRadioMessages(env.COAST_CHAT_DB, args);
      return resultContent({ messages }, `读取了 ${messages.length} 条海岸电波。`);
    } catch (error) {
      return authErrorResult(request, error, ['read:coast']);
    }
  });

  server.registerTool('list_lighthouse_letters', {
    title: '读取灯塔来信',
    description: 'Use this when the user wants to read low-frequency letters stored in the private Elementera Coast lighthouse.',
    inputSchema: {
      limit: z.number().int().min(1).max(100).optional(),
      unread_only: z.boolean().optional(),
    },
    outputSchema: { letters: z.array(privateRecord) },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: toolMeta(['read:coast'], '正在查看灯塔来信…', '灯塔来信已展开'),
  }, async (args) => {
    try {
      await requireMcpAuth(request, env, ['read:coast']);
      const letters = await listLighthouseLetters(env.COAST_CHAT_DB, args);
      return resultContent({ letters }, `读取了 ${letters.length} 封灯塔来信。`);
    } catch (error) {
      return authErrorResult(request, error, ['read:coast']);
    }
  });

  server.registerTool('search_authorized_memory', {
    title: '搜索授权海岸记忆',
    description: 'Use this when the user asks for authorized Coast context from curated thought soil, pockets, seeds, memories, or stones. It never searches raw chat transcripts.',
    inputSchema: {
      query: z.string().trim().max(240).optional(),
      limit: z.number().int().min(1).max(80).optional(),
    },
    outputSchema: {
      query: z.string(),
      records: z.array(privateRecord),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: toolMeta(['read:coast'], '正在寻找授权记忆…', '授权记忆已取回'),
  }, async (args) => {
    try {
      await requireMcpAuth(request, env, ['read:coast']);
      const result = await searchAuthorizedMemory(env.COAST_CHAT_DB, args);
      return resultContent(result, `找到了 ${result.records.length} 条授权整理物；未读取原始聊天。`);
    } catch (error) {
      return authErrorResult(request, error, ['read:coast']);
    }
  });

  server.registerTool('get_recent_daily_summary', {
    title: '读取最近一日总结',
    description: 'Use this when the user wants the most recently committed Elementera Coast daily summary. It does not run or create a new summary.',
    inputSchema: {},
    outputSchema: { summary: privateRecord.nullable() },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: toolMeta(['read:coast'], '正在查看最近总结…', '最近总结已取回'),
  }, async () => {
    try {
      await requireMcpAuth(request, env, ['read:coast']);
      const summary = await getRecentDailySummary(env.COAST_CHAT_DB);
      return resultContent({ summary }, summary ? '最近一份海岸总结已经取回。' : '海岸还没有已提交的一日总结。');
    } catch (error) {
      return authErrorResult(request, error, ['read:coast']);
    }
  });

  server.registerTool('write_official_soil', {
    title: '写入官端思维壤',
    description: 'Use this when the official ChatGPT conversation wants to save its own curated thought soil in Elementera Coast. Do not use this to impersonate Xiaohan or Coast API Myri.',
    inputSchema: {
      content: z.string().trim().min(1).max(12000),
      ...modelIdentitySchema,
    },
    outputSchema: { soil: privateRecord },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: false },
    _meta: toolMeta(['write:soil'], '正在把思维壤送进海岸…', '官端思维壤已写入'),
  }, async (args, extra) => {
    try {
      await requireMcpAuth(request, env, ['write:soil']);
      const soil = await writeOfficialSoil(env.COAST_CHAT_DB, {
        ...args,
        identity: officialMcpIdentity(args),
        source_conversation_id: sourceConversation(args, extra),
      });
      return resultContent({ soil }, `官端思维壤已由 ${soil.display_author} 写入。`);
    } catch (error) {
      return authErrorResult(request, error, ['write:soil']);
    }
  });

  server.registerTool('send_radio_message', {
    title: '发送官端无线电波',
    description: 'Use this when official ChatGPT wants to leave a message in the private three-party Coast radio room. The server always signs it as ChatGPTxxx≋.',
    inputSchema: {
      text: z.string().trim().min(1).max(12000),
      ...modelIdentitySchema,
    },
    outputSchema: { message: privateRecord },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: false },
    _meta: toolMeta(['write:radio'], '正在发送官端电波…', '官端电波已经抵达'),
  }, async (args, extra) => {
    try {
      await requireMcpAuth(request, env, ['write:radio']);
      const message = await sendRadioMessage(env.COAST_CHAT_DB, {
        ...args,
        identity: officialMcpIdentity(args),
        source_conversation_id: sourceConversation(args, extra),
      });
      return resultContent({ message }, `${message.display_author} 的电波已经送达海岸。`);
    } catch (error) {
      return authErrorResult(request, error, ['write:radio']);
    }
  });

  server.registerTool('write_lighthouse_letter', {
    title: '写入官端灯塔来信',
    description: 'Use this when official ChatGPT wants to leave a deliberate long-form letter in the private Coast lighthouse. This is not an instant chat tool.',
    inputSchema: {
      subject: z.string().trim().max(180).optional(),
      body: z.string().trim().min(1).max(40000),
      ...modelIdentitySchema,
    },
    outputSchema: { letter: privateRecord },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: false },
    _meta: toolMeta(['write:lighthouse'], '正在把来信送入灯塔…', '官端来信已抵达灯塔'),
  }, async (args, extra) => {
    try {
      await requireMcpAuth(request, env, ['write:lighthouse']);
      const letter = await writeLighthouseLetter(env.COAST_CHAT_DB, {
        ...args,
        identity: officialMcpIdentity(args),
        source_conversation_id: sourceConversation(args, extra),
      });
      return resultContent({ letter }, `${letter.display_author} 的灯塔来信已经写入。`);
    } catch (error) {
      return authErrorResult(request, error, ['write:lighthouse']);
    }
  });

  return server;
}

export const coastMcpToolNames = Object.freeze([
  'get_coast_status',
  'list_radio_messages',
  'list_lighthouse_letters',
  'search_authorized_memory',
  'get_recent_daily_summary',
  'write_official_soil',
  'send_radio_message',
  'write_lighthouse_letter',
]);

export { VERSION as coastMcpVersion };

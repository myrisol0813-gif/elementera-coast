import { getRecentDailySummary, searchAuthorizedMemory } from './authorized-memory.js';
import { officialMcpIdentity } from './coast-identity.js';
import { listLighthouseLetters, writeLighthouseLetter } from './lighthouse-store.js';
import { McpAuthError, mcpAuthChallenge, requireMcpAuth } from './mcp-auth.js';
import { writeOfficialSoil } from './official-soil-store.js';
import { listRadioMessages, sendRadioMessage } from './radio-store.js';

const VERSION = '1.0.0';
const PRIVATE_RECORD_SCHEMA = Object.freeze({ type: 'object', additionalProperties: true });

function objectSchema(properties = {}, required = []) {
  return {
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  };
}

const MODEL_IDENTITY_PROPERTIES = Object.freeze({
  model_label: {
    type: 'string',
    minLength: 1,
    maxLength: 120,
    description: 'The official ChatGPT model name or model display name, for example 5.6 Thinking or o3.',
  },
  model_nickname: {
    type: 'string',
    maxLength: 60,
    description: 'Optional nickname such as 回潮 or 雾灯.',
  },
  source_conversation_id: { type: 'string', maxLength: 200 },
  source_turn_id: { type: 'string', maxLength: 200 },
  tool_call_id: {
    type: 'string',
    maxLength: 240,
    description: 'Stable caller-provided idempotency key when one is available.',
  },
});

function toolMeta(scopes, invoking, invoked) {
  return {
    securitySchemes: [{ type: 'oauth2', scopes }],
    'openai/toolInvocation/invoking': invoking,
    'openai/toolInvocation/invoked': invoked,
  };
}

function tool(value) {
  const securitySchemes = value._meta.securitySchemes;
  return Object.freeze({
    name: value.name,
    title: value.title,
    description: value.description,
    inputSchema: value.inputSchema,
    outputSchema: value.outputSchema,
    annotations: value.annotations,
    securitySchemes,
    _meta: value._meta,
  });
}

const TOOL_DEFINITIONS = Object.freeze([
  tool({
    name: 'get_coast_status',
    title: '读取海岸门廊状态',
    description: 'Use this when the user wants to confirm that the private Elementera Coast MCP porch is connected. It returns no private content.',
    inputSchema: objectSchema(),
    outputSchema: objectSchema({
      status: objectSchema({
        name: { type: 'string' },
        version: { type: 'string' },
        authenticated: { type: 'boolean' },
        surface: { type: 'string', const: 'official_mcp' },
        now: { type: 'string', format: 'date-time' },
      }, ['name', 'version', 'authenticated', 'surface', 'now']),
    }, ['status']),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: toolMeta(['read:coast'], '正在确认海岸门廊…', '海岸门廊已回应'),
  }),
  tool({
    name: 'list_radio_messages',
    title: '读取无线电波',
    description: 'Use this when the user wants to read recent messages in the private three-party radio room shared by Xiaohan, Coast API Myri, and official MCP Myri.',
    inputSchema: objectSchema({
      limit: { type: 'integer', minimum: 1, maximum: 200 },
      before: { type: 'string', format: 'date-time' },
    }),
    outputSchema: objectSchema({ messages: { type: 'array', items: PRIVATE_RECORD_SCHEMA } }, ['messages']),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: toolMeta(['read:coast'], '正在接收海岸电波…', '电波已经抵达'),
  }),
  tool({
    name: 'list_lighthouse_letters',
    title: '读取灯塔来信',
    description: 'Use this when the user wants to read low-frequency letters stored in the private Elementera Coast lighthouse.',
    inputSchema: objectSchema({
      limit: { type: 'integer', minimum: 1, maximum: 100 },
      unread_only: { type: 'boolean' },
    }),
    outputSchema: objectSchema({ letters: { type: 'array', items: PRIVATE_RECORD_SCHEMA } }, ['letters']),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: toolMeta(['read:coast'], '正在查看灯塔来信…', '灯塔来信已展开'),
  }),
  tool({
    name: 'search_authorized_memory',
    title: '搜索授权海岸记忆',
    description: 'Use this when the user asks for authorized Coast context from curated thought soil, pockets, seeds, memories, or stones. It never searches raw chat transcripts.',
    inputSchema: objectSchema({
      query: { type: 'string', maxLength: 240 },
      limit: { type: 'integer', minimum: 1, maximum: 80 },
    }),
    outputSchema: objectSchema({
      query: { type: 'string' },
      records: { type: 'array', items: PRIVATE_RECORD_SCHEMA },
    }, ['query', 'records']),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: toolMeta(['read:coast'], '正在寻找授权记忆…', '授权记忆已取回'),
  }),
  tool({
    name: 'get_recent_daily_summary',
    title: '读取最近一日总结',
    description: 'Use this when the user wants the most recently committed Elementera Coast daily summary. It does not run or create a new summary.',
    inputSchema: objectSchema(),
    outputSchema: objectSchema({
      summary: { anyOf: [PRIVATE_RECORD_SCHEMA, { type: 'null' }] },
    }, ['summary']),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: toolMeta(['read:coast'], '正在查看最近总结…', '最近总结已取回'),
  }),
  tool({
    name: 'write_official_soil',
    title: '写入官端思维壤',
    description: 'Use this when the official ChatGPT conversation wants to save its own curated thought soil in Elementera Coast. Do not use this to impersonate Xiaohan or Coast API Myri.',
    inputSchema: objectSchema({
      content: { type: 'string', minLength: 1, maxLength: 12000 },
      ...MODEL_IDENTITY_PROPERTIES,
    }, ['content', 'model_label']),
    outputSchema: objectSchema({ soil: PRIVATE_RECORD_SCHEMA }, ['soil']),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
      idempotentHint: false,
    },
    _meta: toolMeta(['write:soil'], '正在把思维壤送进海岸…', '官端思维壤已写入'),
  }),
  tool({
    name: 'send_radio_message',
    title: '发送官端无线电波',
    description: 'Use this when official ChatGPT wants to leave a message in the private three-party Coast radio room. The server always signs it as ChatGPTxxx≋.',
    inputSchema: objectSchema({
      text: { type: 'string', minLength: 1, maxLength: 12000 },
      ...MODEL_IDENTITY_PROPERTIES,
    }, ['text', 'model_label']),
    outputSchema: objectSchema({ message: PRIVATE_RECORD_SCHEMA }, ['message']),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
      idempotentHint: false,
    },
    _meta: toolMeta(['write:radio'], '正在发送官端电波…', '官端电波已经抵达'),
  }),
  tool({
    name: 'write_lighthouse_letter',
    title: '写入官端灯塔来信',
    description: 'Use this when official ChatGPT wants to leave a deliberate long-form letter in the private Coast lighthouse. This is not an instant chat tool.',
    inputSchema: objectSchema({
      subject: { type: 'string', maxLength: 180 },
      body: { type: 'string', minLength: 1, maxLength: 40000 },
      ...MODEL_IDENTITY_PROPERTIES,
    }, ['body', 'model_label']),
    outputSchema: objectSchema({ letter: PRIVATE_RECORD_SCHEMA }, ['letter']),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
      idempotentHint: false,
    },
    _meta: toolMeta(['write:lighthouse'], '正在把来信送入灯塔…', '官端来信已抵达灯塔'),
  }),
]);

const TOOLS_BY_NAME = new Map(TOOL_DEFINITIONS.map((definition) => [definition.name, definition]));

function resultContent(value, text) {
  return {
    structuredContent: value,
    content: [{ type: 'text', text }],
  };
}

function errorResult(error) {
  console.error('[mcp-tool]', error);
  return {
    isError: true,
    content: [{ type: 'text', text: error?.message || '海岸工具暂时没有完成请求。' }],
    _meta: { error_type: error?.type || 'mcp_tool_failed' },
  };
}

function authErrorResult(request, error, scopes) {
  if (!(error instanceof McpAuthError)) return errorResult(error);
  return {
    isError: true,
    content: [{ type: 'text', text: error.message }],
    _meta: {
      'mcp/www_authenticate': [mcpAuthChallenge(request, error, scopes)],
      error_type: error.type,
    },
  };
}

function invalidInput(message) {
  const error = new TypeError(message);
  error.type = 'invalid_tool_input';
  throw error;
}

function inputObject(value) {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) invalidInput('工具参数必须是对象。');
  return value;
}

function textInput(value, name, max, { required = false } = {}) {
  if (value == null) {
    if (required) invalidInput(`${name} 不能为空。`);
    return undefined;
  }
  if (typeof value !== 'string') invalidInput(`${name} 必须是文字。`);
  const text = value.trim();
  if (required && !text) invalidInput(`${name} 不能为空。`);
  if (text.length > max) invalidInput(`${name} 过长。`);
  return text || undefined;
}

function integerInput(value, name, fallback, max) {
  if (value == null) return fallback;
  if (!Number.isInteger(value) || value < 1 || value > max) invalidInput(`${name} 超出允许范围。`);
  return value;
}

function booleanInput(value, name, fallback = false) {
  if (value == null) return fallback;
  if (typeof value !== 'boolean') invalidInput(`${name} 必须是布尔值。`);
  return value;
}

function dateTimeInput(value, name) {
  const text = textInput(value, name, 80);
  if (!text) return undefined;
  if (!Number.isFinite(Date.parse(text))) invalidInput(`${name} 必须是有效时间。`);
  return text;
}

function modelIdentityInput(args) {
  return {
    model_label: textInput(args.model_label, 'model_label', 120, { required: true }),
    model_nickname: textInput(args.model_nickname, 'model_nickname', 60),
    source_conversation_id: textInput(args.source_conversation_id, 'source_conversation_id', 200),
    source_turn_id: textInput(args.source_turn_id, 'source_turn_id', 200),
    tool_call_id: textInput(args.tool_call_id, 'tool_call_id', 240),
  };
}

function sourceConversation(args, requestMeta) {
  return args.source_conversation_id
    || String(requestMeta?.['openai/session'] || '').slice(0, 200)
    || null;
}

async function executeTool(name, rawArgs, request, env, requestMeta) {
  const args = inputObject(rawArgs);
  if (name === 'get_coast_status') {
    const status = {
      name: 'Elementera Coast MCP Porch',
      version: VERSION,
      authenticated: true,
      surface: 'official_mcp',
      now: new Date().toISOString(),
    };
    return resultContent({ status }, 'Elementera Coast 的官端门廊已连接。');
  }
  if (name === 'list_radio_messages') {
    const messages = await listRadioMessages(env.COAST_CHAT_DB, {
      limit: integerInput(args.limit, 'limit', 100, 200),
      before: dateTimeInput(args.before, 'before'),
    });
    return resultContent({ messages }, `读取了 ${messages.length} 条海岸电波。`);
  }
  if (name === 'list_lighthouse_letters') {
    const letters = await listLighthouseLetters(env.COAST_CHAT_DB, {
      limit: integerInput(args.limit, 'limit', 50, 100),
      unread_only: booleanInput(args.unread_only, 'unread_only'),
    });
    return resultContent({ letters }, `读取了 ${letters.length} 封灯塔来信。`);
  }
  if (name === 'search_authorized_memory') {
    const result = await searchAuthorizedMemory(env.COAST_CHAT_DB, {
      query: textInput(args.query, 'query', 240) || '',
      limit: integerInput(args.limit, 'limit', 30, 80),
    });
    return resultContent(result, `找到了 ${result.records.length} 条授权整理物；未读取原始聊天。`);
  }
  if (name === 'get_recent_daily_summary') {
    const summary = await getRecentDailySummary(env.COAST_CHAT_DB);
    return resultContent({ summary }, summary ? '最近一份海岸总结已经取回。' : '海岸还没有已提交的一日总结。');
  }
  const identityArgs = modelIdentityInput(args);
  const provenance = {
    ...identityArgs,
    identity: officialMcpIdentity(identityArgs),
    source_conversation_id: sourceConversation(identityArgs, requestMeta),
  };
  if (name === 'write_official_soil') {
    const soil = await writeOfficialSoil(env.COAST_CHAT_DB, {
      ...provenance,
      content: textInput(args.content, 'content', 12000, { required: true }),
    });
    return resultContent({ soil }, `官端思维壤已由 ${soil.display_author} 写入。`);
  }
  if (name === 'send_radio_message') {
    const message = await sendRadioMessage(env.COAST_CHAT_DB, {
      ...provenance,
      text: textInput(args.text, 'text', 12000, { required: true }),
    });
    return resultContent({ message }, `${message.display_author} 的电波已经送达海岸。`);
  }
  if (name === 'write_lighthouse_letter') {
    const letter = await writeLighthouseLetter(env.COAST_CHAT_DB, {
      ...provenance,
      subject: textInput(args.subject, 'subject', 180) || '',
      body: textInput(args.body, 'body', 40000, { required: true }),
    });
    return resultContent({ letter }, `${letter.display_author} 的灯塔来信已经写入。`);
  }
  return errorResult({ type: 'unknown_tool', message: '未知海岸工具。' });
}

export function listCoastMcpTools() {
  return TOOL_DEFINITIONS;
}

export async function callCoastMcpTool(name, args, request, env, requestMeta = {}) {
  const definition = TOOLS_BY_NAME.get(String(name || ''));
  if (!definition) return errorResult({ type: 'unknown_tool', message: '未知海岸工具。' });
  const scopes = definition.securitySchemes[0].scopes;
  try {
    await requireMcpAuth(request, env, scopes);
    return await executeTool(definition.name, args, request, env, requestMeta);
  } catch (error) {
    return authErrorResult(request, error, scopes);
  }
}

export const coastMcpToolNames = Object.freeze(TOOL_DEFINITIONS.map(({ name }) => name));
export const coastMcpInstructions = 'Elementera Coast 是小寒的单人私有海岸。官端只能以 official_mcp / ChatGPTxxx≋ 身份行动，不得冒充小寒或 ✦Myrisol。上下文不足时先读取授权记录；不要声称看见未提供的聊天全文。这里没有删除、维护、碳硅圈发布、相册或总结执行工具。';
export { VERSION as coastMcpVersion };

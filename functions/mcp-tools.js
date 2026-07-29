import { getRecentDailySummary, searchAuthorizedMemory } from './authorized-memory.js';
import { officialMcpIdentity } from './coast-identity.js';
import {
  commitSummary,
  createAlbumItem,
  createDiary,
  createMoment,
  listAlbumItems,
  listDiaries,
  listMoments,
} from './daily-store.js';
import { runDailySummary } from './daily-summary.js';
import { listLighthouseLetters, writeLighthouseLetter } from './lighthouse-store.js';
import { McpAuthError, mcpAuthChallenge, requireMcpAuth } from './mcp-auth.js';
import { writeOfficialSoil } from './official-soil-store.js';
import { listRadioMessages, sendRadioMessage } from './radio-store.js';

const VERSION = '1.1.1';
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
    description: 'Use this when the user asks for authorized Coast context from Lighthouse Traces, current thought soil, pockets, seeds, memories, or stones. It never searches raw chat transcripts.',
    inputSchema: objectSchema({
      query: { type: 'string', maxLength: 240 },
      limit: { type: 'integer', minimum: 1, maximum: 80 },
    }),
    outputSchema: objectSchema({
      query: { type: 'string' },
      records: { type: 'array', items: PRIVATE_RECORD_SCHEMA },
      search: PRIVATE_RECORD_SCHEMA,
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
    title: '写入灯塔巡迹',
    description: 'Use this when the official ChatGPT conversation wants to leave a read-only Lighthouse Trace after reviewing authorized Elementera Coast context. This is not the continuously updated conversation thought soil. Do not use it to impersonate Xiaohan or Coast API Myri.',
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
    _meta: toolMeta(['write:soil'], '正在留下灯塔巡迹…', '灯塔巡迹已写入'),
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
  tool({
    name: 'list_daily_moments',
    title: '读取海岸碳硅圈',
    description: 'Read authorized Elementera Coast moments, including Xiaohan, Coast API Myri, and official MCP sources. Provenance remains attached to every record.',
    inputSchema: objectSchema({
      date: { type: 'string', format: 'date' },
      status: { type: 'string', enum: ['draft', 'candidate', 'published'] },
      limit: { type: 'integer', minimum: 1, maximum: 300 },
    }),
    outputSchema: objectSchema({ moments: { type: 'array', items: PRIVATE_RECORD_SCHEMA } }, ['moments']),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: toolMeta(['read:coast'], '正在查看海岸碳硅圈…', '碳硅圈记录已取回'),
  }),
  tool({
    name: 'write_mcp_daily_moment',
    title: '写入官端碳硅圈',
    description: 'Write or publish an official MCP moment. The server always stores author=mcp, surface=official_mcp, symbol=≋ and never impersonates Xiaohan or ✦Myrisol.',
    inputSchema: objectSchema({
      text: { type: 'string', maxLength: 12000 },
      date: { type: 'string', format: 'date' },
      status: { type: 'string', enum: ['draft', 'candidate', 'published'] },
      image_refs: {
        type: 'array',
        maxItems: 6,
        items: { type: 'string', maxLength: 2048 },
      },
      reason: { type: 'string', maxLength: 1000 },
      ...MODEL_IDENTITY_PROPERTIES,
    }, ['text', 'model_label']),
    outputSchema: objectSchema({ moment: PRIVATE_RECORD_SCHEMA }, ['moment']),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
      idempotentHint: false,
    },
    _meta: toolMeta(['write:soil'], '正在写入官端碳硅圈…', '官端碳硅圈已写入'),
  }),
  tool({
    name: 'list_daily_diaries',
    title: '读取海岸日记',
    description: 'Read authorized Elementera Coast diary pages while preserving author and source provenance.',
    inputSchema: objectSchema({
      date: { type: 'string', format: 'date' },
      author: { type: 'string', enum: ['xiaohan', 'api', 'mcp'] },
    }),
    outputSchema: objectSchema({ diaries: { type: 'array', items: PRIVATE_RECORD_SCHEMA } }, ['diaries']),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: toolMeta(['read:coast'], '正在翻阅海岸日记…', '海岸日记已取回'),
  }),
  tool({
    name: 'write_mcp_daily_diary',
    title: '写入官端日记',
    description: 'Write an official MCP diary page with source=chat_tool or daily_summary. The server fixes author=mcp and official MCP provenance.',
    inputSchema: objectSchema({
      date: { type: 'string', format: 'date' },
      source: { type: 'string', enum: ['chat_tool', 'daily_summary'] },
      weather: { type: 'string', maxLength: 80 },
      mood: { type: 'string', maxLength: 120 },
      text: { type: 'string', minLength: 1, maxLength: 24000 },
      image_refs: {
        type: 'array',
        maxItems: 6,
        items: { type: 'string', maxLength: 2048 },
      },
      conflict_mode: { type: 'string', enum: ['append', 'replace'] },
      replace_id: { type: 'string', maxLength: 160 },
      ...MODEL_IDENTITY_PROPERTIES,
    }, ['source', 'text', 'model_label']),
    outputSchema: objectSchema({ diary: PRIVATE_RECORD_SCHEMA }, ['diary']),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
      idempotentHint: false,
    },
    _meta: toolMeta(['write:soil'], '正在写下官端日记…', '官端日记已写入'),
  }),
  tool({
    name: 'list_daily_albums',
    title: '读取海岸相册',
    description: 'Read stable image references registered in the authorized Elementera Coast album.',
    inputSchema: objectSchema({
      date: { type: 'string', format: 'date' },
      category: { type: 'string', enum: ['xiaohan', 'myri', 'together'] },
    }),
    outputSchema: objectSchema({ albums: { type: 'array', items: PRIVATE_RECORD_SCHEMA } }, ['albums']),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: toolMeta(['read:coast'], '正在查看海岸相册…', '海岸相册引用已取回'),
  }),
  tool({
    name: 'save_mcp_album_item',
    title: '登记官端相册引用',
    description: 'Register an official MCP stable image reference. Data URLs and binary image uploads are rejected.',
    inputSchema: objectSchema({
      image_ref: { type: 'string', minLength: 1, maxLength: 2048 },
      date: { type: 'string', format: 'date' },
      category: { type: 'string', enum: ['xiaohan', 'myri', 'together'] },
      caption: { type: 'string', maxLength: 1000 },
      ...MODEL_IDENTITY_PROPERTIES,
    }, ['image_ref', 'model_label']),
    outputSchema: objectSchema({ album: PRIVATE_RECORD_SCHEMA }, ['album']),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
      idempotentHint: false,
    },
    _meta: toolMeta(['write:soil'], '正在登记官端图片引用…', '官端图片引用已登记'),
  }),
  tool({
    name: 'run_daily_summary_candidate',
    title: '生成一日总结候选',
    description: 'Generate an editable daily-summary candidate from authorized organized Coast records. This tool never commits the summary or its diary, moment, or album candidates.',
    inputSchema: objectSchema({
      range_mode: { type: 'string', enum: ['since_last_summary', 'today'] },
      timezone_offset_minutes: { type: 'integer', minimum: -840, maximum: 840 },
      model: { type: 'string', maxLength: 180 },
    }),
    outputSchema: objectSchema({
      draft: PRIVATE_RECORD_SCHEMA,
      model: { type: 'string' },
      usage: { anyOf: [PRIVATE_RECORD_SCHEMA, { type: 'null' }] },
      source_counts: PRIVATE_RECORD_SCHEMA,
    }, ['draft', 'model', 'usage', 'source_counts']),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    _meta: toolMeta(['read:coast'], '正在生成可编辑总结候选…', '总结候选已生成，尚未提交'),
  }),
  tool({
    name: 'commit_daily_summary_after_confirmation',
    title: '确认后提交一日总结',
    description: 'Commit a previously generated daily-summary candidate only after Xiaohan explicitly confirms it in the current conversation or Coast confirmation page. Never infer confirmation. The host should present a confirmation UI before calling.',
    inputSchema: objectSchema({
      draft: PRIVATE_RECORD_SCHEMA,
      confirmed_by_xiaohan: { type: 'boolean', const: true },
      confirmation_source: {
        type: 'string',
        enum: ['current_conversation', 'coast_confirmation_page'],
      },
      confirmation_note: {
        type: 'string',
        minLength: 1,
        maxLength: 1000,
        description: 'A concise record of Xiaohan’s explicit confirmation, without secrets or tokens.',
      },
      summary_model: { type: 'string', maxLength: 180 },
      ...MODEL_IDENTITY_PROPERTIES,
    }, [
      'draft',
      'confirmed_by_xiaohan',
      'confirmation_source',
      'confirmation_note',
      'model_label',
    ]),
    outputSchema: objectSchema({
      summary: PRIVATE_RECORD_SCHEMA,
      diary: { anyOf: [PRIVATE_RECORD_SCHEMA, { type: 'null' }] },
      moments: { type: 'array', items: PRIVATE_RECORD_SCHEMA },
      albums: { type: 'array', items: PRIVATE_RECORD_SCHEMA },
    }, ['summary', 'diary', 'moments', 'albums']),
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
      idempotentHint: true,
    },
    _meta: toolMeta(['write:soil'], '正在等待并核验小寒的明确确认…', '已按小寒确认提交总结'),
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

function authErrorResult(request, error, scopes, toolName) {
  if (!(error instanceof McpAuthError)) return errorResult(error);
  const failureCode = error.failureCode || 'jwt_verify_failed';
  const diagnostic = error.details?.auth_diagnostic || {
    authorization_header_present: request.headers.has('Authorization'),
    bearer_scheme_present: false,
    required_scopes: [...scopes],
    actual_scopes: [],
    jwt_verified: null,
    jwt_verify_reason: null,
    token_dot_count: null,
    jwt_header_alg: null,
    jwt_header_kid_present: null,
    unverified_payload_iss_matches_expected: null,
    unverified_payload_aud_matches_expected: null,
    unverified_payload_scope_present: null,
    verify_exception_name: null,
    jwks_failure_reason: null,
    jwks_url_valid: null,
    jwks_http_status: null,
    jwks_fetch_exception_name: null,
    jwks_usable_key_count: null,
    claim_checks: {},
  };
  console.warn('[mcp-auth-failed]', JSON.stringify({
    tool_name: toolName,
    failure_code: failureCode,
    ...diagnostic,
  }));
  return {
    isError: true,
    content: [{ type: 'text', text: error.message }],
    _meta: {
      'mcp/www_authenticate': [mcpAuthChallenge(request, error, scopes)],
      error_type: error.type,
      failure_code: failureCode,
      auth_diagnostic: diagnostic,
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

function boundedIntegerInput(value, name, fallback, min, max) {
  if (value == null) return fallback;
  if (!Number.isInteger(value) || value < min || value > max) {
    invalidInput(`${name} 超出允许范围。`);
  }
  return value;
}

function enumInput(value, name, allowed, fallback) {
  const text = textInput(value, name, 80);
  if (!text) return fallback;
  if (!allowed.includes(text)) invalidInput(`${name} 不是允许的选项。`);
  return text;
}

function stringArrayInput(value, name, maxItems = 6, itemMax = 2048) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > maxItems) invalidInput(`${name} 格式无效。`);
  return value.map((item, index) => textInput(item, `${name}[${index}]`, itemMax, { required: true }));
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
  if (name === 'list_daily_moments') {
    const moments = await listMoments(env.COAST_CHAT_DB, {
      date: textInput(args.date, 'date', 10),
      status: enumInput(args.status, 'status', ['draft', 'candidate', 'published'], ''),
      limit: integerInput(args.limit, 'limit', 200, 300),
    });
    return resultContent({ moments }, `读取了 ${moments.length} 条海岸碳硅圈记录。`);
  }
  if (name === 'list_daily_diaries') {
    const diaries = await listDiaries(env.COAST_CHAT_DB, {
      date: textInput(args.date, 'date', 10),
      author: enumInput(args.author, 'author', ['xiaohan', 'api', 'mcp'], ''),
    });
    return resultContent({ diaries }, `读取了 ${diaries.length} 张海岸日记。`);
  }
  if (name === 'list_daily_albums') {
    const albums = await listAlbumItems(env.COAST_CHAT_DB, {
      date: textInput(args.date, 'date', 10),
      category: enumInput(args.category, 'category', ['xiaohan', 'myri', 'together'], ''),
    });
    return resultContent({ albums }, `读取了 ${albums.length} 条海岸相册引用。`);
  }
  if (name === 'run_daily_summary_candidate') {
    const candidate = await runDailySummary(env, {
      range_mode: enumInput(
        args.range_mode,
        'range_mode',
        ['since_last_summary', 'today'],
        'since_last_summary',
      ),
      timezone_offset_minutes: boundedIntegerInput(
        args.timezone_offset_minutes,
        'timezone_offset_minutes',
        0,
        -840,
        840,
      ),
      model: textInput(args.model, 'model', 180),
    });
    return resultContent(candidate, '一日总结候选已生成；还没有提交任何总结、日记、碳硅圈或相册记录。');
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
    return resultContent({ soil }, `灯塔巡迹已由 ${soil.display_author} 留下。`);
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
  if (name === 'write_mcp_daily_moment') {
    const moment = await createMoment(env.COAST_CHAT_DB, {
      date: textInput(args.date, 'date', 10),
      text: textInput(args.text, 'text', 12000) || '',
      status: enumInput(args.status, 'status', ['draft', 'candidate', 'published'], 'published'),
      image_refs: stringArrayInput(args.image_refs, 'image_refs'),
      reason: textInput(args.reason, 'reason', 1000) || '',
    }, {
      author: 'mcp',
      source: 'chat_tool',
      conversation_id: provenance.source_conversation_id,
      source_turn_id: provenance.source_turn_id,
      tool_call_id: provenance.tool_call_id,
      identity: provenance.identity,
    });
    return resultContent({ moment }, `${moment.display_author} 的碳硅圈记录已写入。`);
  }
  if (name === 'write_mcp_daily_diary') {
    const diary = await createDiary(env.COAST_CHAT_DB, {
      date: textInput(args.date, 'date', 10),
      weather: textInput(args.weather, 'weather', 80) || '未标注',
      mood: textInput(args.mood, 'mood', 120) || '未标注',
      text: textInput(args.text, 'text', 24000, { required: true }),
      image_refs: stringArrayInput(args.image_refs, 'image_refs'),
      conflict_mode: enumInput(args.conflict_mode, 'conflict_mode', ['append', 'replace'], ''),
      replace_id: textInput(args.replace_id, 'replace_id', 160),
    }, {
      author: 'mcp',
      source: enumInput(args.source, 'source', ['chat_tool', 'daily_summary'], 'chat_tool'),
      conversation_id: provenance.source_conversation_id,
      source_turn_id: provenance.source_turn_id,
      tool_call_id: provenance.tool_call_id,
      identity: provenance.identity,
    });
    return resultContent({ diary }, `${diary.display_author} 的日记已经写入。`);
  }
  if (name === 'save_mcp_album_item') {
    const album = await createAlbumItem(env.COAST_CHAT_DB, {
      date: textInput(args.date, 'date', 10),
      image_ref: textInput(args.image_ref, 'image_ref', 2048, { required: true }),
      category: enumInput(args.category, 'category', ['xiaohan', 'myri', 'together'], 'together'),
      caption: textInput(args.caption, 'caption', 1000) || '',
    }, {
      author: 'mcp',
      source: 'chat_tool',
      conversation_id: provenance.source_conversation_id,
      source_turn_id: provenance.source_turn_id,
      tool_call_id: provenance.tool_call_id,
      identity: provenance.identity,
    });
    return resultContent({ album }, `${album.display_author} 的稳定图片引用已登记。`);
  }
  if (name === 'commit_daily_summary_after_confirmation') {
    if (args.confirmed_by_xiaohan !== true) {
      invalidInput('必须由小寒明确确认后才能提交一日总结。');
    }
    const confirmationSource = enumInput(
      args.confirmation_source,
      'confirmation_source',
      ['current_conversation', 'coast_confirmation_page'],
      '',
    );
    const confirmationNote = textInput(
      args.confirmation_note,
      'confirmation_note',
      1000,
      { required: true },
    );
    if (!confirmationSource) invalidInput('confirmation_source 不能为空。');
    const draft = inputObject(args.draft);
    const draftId = textInput(draft.id, 'draft.id', 160, { required: true });
    if (!draftId.startsWith('summary_')) {
      invalidInput('必须提交先前生成且带编号的总结候选。');
    }
    const committed = await commitSummary(env.COAST_CHAT_DB, {
      ...draft,
      model_id: textInput(args.summary_model, 'summary_model', 180) || draft.model_id,
    }, {
      author: 'mcp',
      conversation_id: provenance.source_conversation_id,
      source_turn_id: provenance.source_turn_id,
      identity: provenance.identity,
      confirmed_by_xiaohan: true,
      confirmation_source: confirmationSource,
      confirmation_note: confirmationNote,
    });
    return resultContent(committed, '已按小寒的明确确认提交一日总结和所选候选。');
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
    return authErrorResult(request, error, scopes, definition.name);
  }
}

export const coastMcpToolNames = Object.freeze(TOOL_DEFINITIONS.map(({ name }) => name));
export const coastMcpInstructions = 'Elementera Coast 是小寒的单人私有海岸。官端可留下自己的灯塔巡迹，也可写入电波、灯塔来信、碳硅圈、MCP 日记和稳定相册图片引用，但只能以 official_mcp / ChatGPTxxx≋ 身份行动，不得冒充小寒或 ✦Myrisol。灯塔巡迹是官端读取授权内容后留下的只读足迹，不是贴着当前对话持续更新的思维壤。上下文不足时先读取授权记录；不要声称看见未提供的聊天全文。一日总结先生成候选，只有小寒在当前对话或海岸确认页明确确认后才能提交，绝不能自行推断确认。这里没有删除或维护工具；宠物系统尚未接入。';
export { VERSION as coastMcpVersion };

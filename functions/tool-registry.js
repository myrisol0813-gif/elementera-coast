import { CALENDAR_MCP_DEFINITIONS, executeCalendarMcpTool } from './calendar-mcp-tools.js';
import { DAILY_MODEL_TOOLS, executeDailyModelTool } from './daily-model-tools.js';
import { createAlbumItem, createDiaryDraft, createMomentDraft } from './daily-store.js';
import { DOGTALK_MODEL_TOOL, executeDogtalkModelTool } from './dogtalk-model-tool.js';
import { saveMysticDogtalkWithSnapshot } from './dogtalk-store.js';
import { createPocket } from './memory-store.js';
import { searchMemory } from './memory-recall.js';
import { matchWorldbook } from './context-worldbook.js';
import {
  fetchUnrepliedMailbox,
  mailboxPatrolReport,
  replyToMailboxVisitor,
  resolveMailboxPocket,
} from './mailbox-service.js';
import { finishToolRun, startToolRun } from './tool-run-log.js';

export class ToolRegistryError extends Error {
  constructor(type, message, status = 400) {
    super(message);
    this.name = 'ToolRegistryError';
    this.type = type;
    this.status = status;
  }
}

function modelTool(name, description, parameters = {}) {
  return Object.freeze({
    type: 'function',
    function: {
      name,
      description,
      parameters: { type: 'object', additionalProperties: false, properties: parameters.properties || {}, required: parameters.required || [] },
    },
  });
}

const DAILY_BY_NAME = new Map(DAILY_MODEL_TOOLS.map((tool) => [tool.function.name, tool]));
const CALENDAR_BY_KEY = new Map(CALENDAR_MCP_DEFINITIONS.map((item) => [item.name, item]));

const CALENDAR_MODEL_NAMES = Object.freeze({
  'calendar.today': 'calendar_today',
  'calendar.list': 'calendar_list',
  'calendar.create': 'calendar_create',
  'calendar.update': 'calendar_update',
  'calendar.delete': 'calendar_delete',
  'calendar.comment': 'calendar_comment',
  'calendar.env': 'calendar_env',
  'calendar.seen': 'calendar_seen',
});

function calendarModelTool(toolKey) {
  const source = CALENDAR_BY_KEY.get(toolKey);
  return Object.freeze({
    type: 'function',
    function: {
      name: CALENDAR_MODEL_NAMES[toolKey],
      description: source.description,
      parameters: source.inputSchema,
    },
  });
}

function entry(value) {
  return Object.freeze({
    scope: 'owner',
    owner_only: true,
    visitor_allowed: false,
    model_exposed: false,
    requires_confirmation: false,
    privacy_level: 'private',
    summary_policy: 'compact',
    ...value,
  });
}

function dailyHandler(kind) {
  return (db, input, context) => {
    if (context.surface !== 'official_mcp') return executeDailyModelTool(db, input, context);
    const trusted = {
      author: 'mcp',
      source: 'chat_tool',
      conversation_id: context.conversation_id || null,
      source_turn_id: context.source_turn_id || null,
      tool_call_id: context.tool_call_id || null,
      identity: context.identity,
    };
    if (kind === 'moment') return createMomentDraft(db, input, trusted);
    if (kind === 'diary') return createDiaryDraft(db, input, trusted);
    return createAlbumItem(db, input, trusted);
  };
}

const REGISTRY = Object.freeze([
  entry({ tool_key: 'daily.create_moment', display_name: '写碳硅圈候选', description: '创建待确认动态。', model_exposed: true, model_tool: DAILY_BY_NAME.get('create_moment'), handler: dailyHandler('moment') }),
  entry({ tool_key: 'daily.create_diary_draft', display_name: '写日记草稿', description: '创建待确认日记。', model_exposed: true, model_tool: DAILY_BY_NAME.get('create_diary_draft'), handler: dailyHandler('diary') }),
  entry({ tool_key: 'daily.create_album_reference', display_name: '登记相册引用', description: '登记稳定图片引用。', model_exposed: true, model_tool: DAILY_BY_NAME.get('save_album_reference'), handler: dailyHandler('album') }),
  entry({ tool_key: 'dogtalk.read', display_name: '读神秘狗话', description: '低频读取当前窗口神秘狗话。', model_exposed: true, model_tool: DOGTALK_MODEL_TOOL, handler: (db, call, context) => executeDogtalkModelTool(db, call, context) }),
  entry({
    tool_key: 'dogtalk.save',
    display_name: '保存神秘狗话',
    description: '前端用户写入；不向模型暴露。',
    summary_policy: 'content_redacted',
    handler: (db, input, context) => saveMysticDogtalkWithSnapshot(db, {
      ...input,
      room_scope: 'conversation',
      conversation_id: context.conversation_id,
    }, {
      source_type: 'turn',
      source_id: context.source_turn_id,
    }),
  }),
  ...Object.keys(CALENDAR_MODEL_NAMES).map((toolKey) => entry({
    tool_key: toolKey,
    display_name: CALENDAR_BY_KEY.get(toolKey).title,
    description: CALENDAR_BY_KEY.get(toolKey).description,
    model_exposed: toolKey !== 'calendar.seen',
    requires_confirmation: toolKey === 'calendar.delete',
    model_tool: calendarModelTool(toolKey),
    handler: async (db, input) => {
      const result = await executeCalendarMcpTool(db, toolKey, input);
      if (!result) throw new ToolRegistryError('unknown_tool', '日历工具不存在。', 404);
      return result.result;
    },
  })),
  entry({ tool_key: 'memory.search', display_name: '检索已确认记忆', description: '按当前作用域检索记忆。', model_exposed: true, model_tool: modelTool('memory_search', '仅在当前问题确实需要已确认记忆时检索，不读取原始聊天。', {
    properties: { query: { type: 'string' }, scope: { type: 'string', enum: ['conversation', 'global'] }, limit: { type: 'integer', minimum: 1, maximum: 20 } },
    required: ['query', 'scope'],
  }), handler: (db, input, context) => searchMemory(context.env, 'owner', { ...input, conversation_id: context.conversation_id }) }),
  entry({ tool_key: 'memory.write_candidate', display_name: '写入待确认袋', description: '只创建待确认记忆候选。', model_exposed: true, model_tool: modelTool('memory_write_candidate', '把值得保留但尚未经小寒确认的内容放入当前窗口待确认袋；不能直接成为记忆。', {
    properties: { title: { type: 'string' }, life_core: { type: 'string' }, content: { type: 'string' }, usage_hint: { type: 'string' }, avoid_hint: { type: 'string' } },
    required: ['title', 'life_core', 'content'],
  }), handler: (db, input, context) => createPocket(db, {
    ...input,
    conversation_id: context.conversation_id,
    source_type: 'turn',
    source_ref: { turn_id: context.source_turn_id, role: 'turn' },
    source_text: input.content || input.life_core,
    source_confidence: 'model_inferred',
  }) }),
  entry({ tool_key: 'worldbook.test_match', display_name: '测试词典命中', description: '测试文本会命中哪些海岸词典词条。', model_exposed: true, model_tool: modelTool('worldbook_test_match', '测试当前短语会命中哪些海岸词典词条。', {
    properties: { input: { type: 'string' } }, required: ['input'],
  }), handler: (db, input, context) => matchWorldbook(db, { input: input.input, surface: context.surface, worldbook_scope: context.worldbook_scope }) }),
  entry({ tool_key: 'mailbox.fetch_unreplied', display_name: '巡读待回信', description: '官端人工巡信。', model_exposed: false, handler: (db, input) => fetchUnrepliedMailbox(db, input) }),
  entry({ tool_key: 'mailbox.reply', display_name: '回复访客', description: '回复单一隔离访客。', model_exposed: false, summary_policy: 'mailbox_content_redacted', handler: (db, input) => replyToMailboxVisitor(db, input) }),
  entry({ tool_key: 'mailbox.resolve_pocket', display_name: '处理访客记事候选', description: '只处理当前访客的一条待确认候选。', model_exposed: false, summary_policy: 'mailbox_content_redacted', handler: (db, input) => resolveMailboxPocket(db, input) }),
  entry({ tool_key: 'mailbox.patrol_report', display_name: '巡信报告', description: '只返回巡信计数。', model_exposed: false, handler: (db, input) => mailboxPatrolReport(db, input) }),
]);

const BY_KEY = new Map(REGISTRY.map((item) => [item.tool_key, item]));
const BY_MODEL_NAME = new Map(REGISTRY.filter((item) => item.model_tool).map((item) => [item.model_tool.function.name, item]));

function parseArguments(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const result = JSON.parse(String(value || '{}'));
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('not_object');
    return result;
  } catch {
    throw new ToolRegistryError('invalid_tool_arguments', '工具参数不是有效 JSON 对象。');
  }
}

function allowed(definition, { permission = 'owner', surface = 'main_chat', mode } = {}) {
  const visitor = permission === 'visitor' || surface === 'visitor' || surface === 'mailbox_visitor';
  if (visitor && !definition.visitor_allowed) return false;
  if (!visitor && definition.owner_only === false && definition.scope === 'visitor') return false;
  if (mode?.tool_allowlist?.length && !mode.tool_allowlist.includes(definition.tool_key)) return false;
  return true;
}

export function listRegisteredTools(context = {}) {
  return REGISTRY.filter((definition) => allowed(definition, context)).map((definition) => ({
    tool_key: definition.tool_key,
    display_name: definition.display_name,
    description: definition.description,
    scope: definition.scope,
    owner_only: definition.owner_only,
    visitor_allowed: definition.visitor_allowed,
    model_exposed: definition.model_exposed,
    requires_confirmation: definition.requires_confirmation,
    privacy_level: definition.privacy_level,
    summary_policy: definition.summary_policy,
    model_name: definition.model_tool?.function?.name || null,
  }));
}

export function modelToolsForContext(context = {}) {
  const tools = REGISTRY
    .filter((definition) => definition.model_exposed && definition.model_tool && allowed(definition, context))
    .filter((definition) => !definition.requires_confirmation);
  if (context.mode?.tool_allowlist?.length) {
    const order = new Map(context.mode.tool_allowlist.map((key, index) => [key, index]));
    tools.sort((left, right) => (order.get(left.tool_key) ?? 999) - (order.get(right.tool_key) ?? 999));
  }
  return tools.slice(0, 8).map((definition) => definition.model_tool);
}

export async function executeRegisteredTool(db, toolKey, input, context = {}) {
  const definition = BY_KEY.get(String(toolKey || ''));
  if (!definition || typeof definition.handler !== 'function') {
    throw new ToolRegistryError('unknown_tool', '这个海岸工具不存在或不可执行。', 404);
  }
  if (!allowed(definition, context)) {
    throw new ToolRegistryError('tool_forbidden', '当前房间或情境无权使用这个工具。', 403);
  }
  if (definition.requires_confirmation && context.confirmed_by_xiaohan !== true && context.surface !== 'official_mcp') {
    throw new ToolRegistryError('tool_confirmation_required', '这个操作需要小寒明确确认。', 409);
  }
  const runId = await startToolRun(db, definition, input, context);
  try {
    const output = await definition.handler(db, input, context);
    await finishToolRun(db, runId, { status: 'success', output });
    return output;
  } catch (error) {
    await finishToolRun(db, runId, { status: 'error', error });
    throw error;
  }
}

export async function executeModelTool(db, toolCall, context = {}) {
  const name = String(toolCall?.function?.name || toolCall?.name || '');
  const definition = BY_MODEL_NAME.get(name);
  if (!definition) throw new ToolRegistryError('unknown_model_tool', '模型调用了未注册工具。', 400);
  const input = parseArguments(toolCall?.function?.arguments ?? toolCall?.arguments);
  const call = {
    id: String(toolCall?.id || '').slice(0, 160),
    type: 'function',
    function: { name, arguments: JSON.stringify(input) },
  };
  return executeRegisteredTool(db, definition.tool_key, definition.tool_key.startsWith('daily.') || definition.tool_key === 'dogtalk.read' ? call : input, context);
}

export const registeredToolKeys = Object.freeze(REGISTRY.map((item) => item.tool_key));

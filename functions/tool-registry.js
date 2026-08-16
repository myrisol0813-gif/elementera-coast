import { CALENDAR_MCP_DEFINITIONS, executeCalendarMcpTool } from './calendar-mcp-tools.js';
import { getRecentDailySummary, searchAuthorizedMemory } from './authorized-memory.js';
import { DAILY_MODEL_TOOLS, executeDailyModelTool } from './daily-model-tools.js';
import {
  commitSummary,
  createAlbumItem,
  createDiaryDraft,
  createMomentDraft,
  listAlbumItems,
  listDiaries,
  listMoments,
} from './daily-store.js';
import { runDailySummary } from './daily-summary.js';
import { DOGTALK_MODEL_TOOL, executeDogtalkModelTool } from './dogtalk-model-tool.js';
import { dogtalkContext, saveMysticDogtalkWithSnapshot } from './dogtalk-store.js';
import { safeLogError } from './http.js';
import { createPocket } from './memory-store.js';
import { searchMemory } from './memory-recall.js';
import { writeLighthouseLetter } from './lighthouse-store.js';
import { writeOfficialSoil } from './official-soil-store.js';
import { sendRadioMessage } from './radio-store.js';
import { listLighthouseRoomMessages, listRadioRoomMessages } from './room-records.js';
import { listRoomMemory, writeLighthouseRoomSoil, writeRoomMemory } from './room-memory.js';
import {
  fetchUnrepliedMailbox,
  mailboxPatrolReport,
  replyToMailboxVisitor,
  resolveMailboxPocket,
} from './mailbox-service.js';
import { finishToolRun, startToolRun } from './tool-run-log.js';
import { roomAccess, roomAllowsTool } from './surface-access-rules.js';

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

const CALENDAR_FURNITURE = Object.freeze({
  'calendar.today': '翻看台历',
  'calendar.list': '翻看台历',
  'calendar.create': '整理台历',
  'calendar.update': '整理台历',
  'calendar.delete': '整理台历',
  'calendar.comment': '在台历边写便签',
  'calendar.env': '翻看台历',
  'calendar.seen': '翻看台历',
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
    auth_scopes: [],
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

async function dogtalkHandler(db, input, context) {
  if (context.external_tool !== true) return executeDogtalkModelTool(db, input, context);
  const roomScope = ['conversation', 'radio', 'lighthouse'].includes(input.room_scope)
    ? input.room_scope
    : 'conversation';
  return dogtalkContext(db, {
    room_scope: roomScope,
    conversation_id: roomScope === 'conversation' ? input.conversation_id : null,
  }, input.user_query || '', { when_confused: true, consume_direct: true });
}

const REGISTRY = Object.freeze([
  entry({
    tool_key: 'coast.status', display_name: '读取海岸门廊状态', description: '返回不含私密内容的连接状态。',
    auth_scopes: ['read:coast'], handler: (db, input, context) => ({
      name: 'Elementera Coast MCP Porch', version: context.mcp_version || '', authenticated: true,
      surface: 'official_mcp', now: new Date().toISOString(),
    }),
  }),
  entry({
    tool_key: 'radio.list', display_name: '调开电波收音机', description: '读取电波房消息与独立房间记忆。',
    auth_scopes: ['read:coast'], summary_policy: 'content_redacted', handler: async (db, input) => {
      const [messages, room_memory] = await Promise.all([
        listRadioRoomMessages(db, input, { audience: 'model' }),
        listRoomMemory(db, 'radio'),
      ]);
      return { messages, room_memory };
    },
  }),
  entry({
    tool_key: 'lighthouse.list', display_name: '查看灯塔信架', description: '读取灯塔信件与独立房间记忆。',
    auth_scopes: ['read:coast'], summary_policy: 'content_redacted', handler: async (db, input) => {
      const [letters, room_memory] = await Promise.all([
        listLighthouseRoomMessages(db, input, { audience: 'model' }),
        listRoomMemory(db, 'lighthouse'),
      ]);
      return { letters, room_memory };
    },
  }),
  entry({ tool_key: 'daily.create_moment', display_name: '写碳硅圈候选', description: '创建待确认动态。', model_exposed: true, model_tool: DAILY_BY_NAME.get('create_moment'), auth_scopes: ['write:soil'], handler: dailyHandler('moment') }),
  entry({ tool_key: 'daily.create_diary_draft', display_name: '写日记草稿', description: '创建待确认日记。', model_exposed: true, model_tool: DAILY_BY_NAME.get('create_diary_draft'), auth_scopes: ['write:soil'], handler: dailyHandler('diary') }),
  entry({ tool_key: 'daily.create_album_reference', display_name: '登记相册引用', description: '登记稳定图片引用。', model_exposed: true, model_tool: DAILY_BY_NAME.get('save_album_reference'), auth_scopes: ['write:soil'], handler: dailyHandler('album') }),
  entry({ tool_key: 'dogtalk.read', display_name: '打开狗话小盒', description: '低频读取当前房间神秘狗话。', model_exposed: true, model_tool: DOGTALK_MODEL_TOOL, auth_scopes: ['read:coast'], handler: dogtalkHandler }),
  entry({
    tool_key: 'dogtalk.save',
    display_name: '收好一张狗话纸条',
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
    display_name: CALENDAR_FURNITURE[toolKey],
    description: CALENDAR_BY_KEY.get(toolKey).description,
    model_exposed: toolKey !== 'calendar.seen',
    requires_confirmation: toolKey === 'calendar.delete',
    auth_scopes: CALENDAR_BY_KEY.get(toolKey).scopes || [],
    model_tool: calendarModelTool(toolKey),
    handler: async (db, input) => {
      const result = await executeCalendarMcpTool(db, toolKey, input);
      if (!result) throw new ToolRegistryError('unknown_tool', '日历工具不存在。', 404);
      return result.result;
    },
  })),
  entry({ tool_key: 'memory.search', display_name: '翻找轨迹抽屉', description: '按当前作用域检索记忆。', model_exposed: true, auth_scopes: ['read:coast'], model_tool: modelTool('memory_search', '仅在当前问题确实需要已确认记忆时检索，不读取原始聊天。', {
    properties: { query: { type: 'string' }, scope: { type: 'string', enum: ['conversation', 'global'] }, limit: { type: 'integer', minimum: 1, maximum: 20 } },
    required: ['query', 'scope'],
  }), handler: (db, input, context) => searchMemory(context.env, 'owner', { ...input, conversation_id: context.conversation_id }) }),
  entry({ tool_key: 'memory.write_candidate', display_name: '放入待确认袋', description: '只创建待确认记忆候选。', model_exposed: true, auth_scopes: ['write:soil'], model_tool: modelTool('memory_write_candidate', '把值得保留但尚未经小寒确认的内容放入当前窗口待确认袋；若是对旧记忆的新理解，可附原记忆 id 与建议动作。', {
    properties: {
      title: { type: 'string' }, life_core: { type: 'string' }, content: { type: 'string' },
      usage_hint: { type: 'string' }, avoid_hint: { type: 'string' },
      original_entry_id: { type: 'string' },
      suggested_action: { type: 'string', enum: ['supplement', 'replace', 'new_version', 'downgrade'] },
    },
    required: ['title', 'life_core', 'content'],
  }), handler: (db, input, context) => createPocket(db, {
    ...input,
    conversation_id: context.conversation_id,
    source_type: input.original_entry_id ? 'memory_revision' : 'turn',
    source_ref: input.original_entry_id ? {
      original_entry_id: input.original_entry_id,
      source_window: context.conversation_id,
      source_turn_id: context.source_turn_id,
      date: new Date().toISOString(),
      suggested_action: input.suggested_action || 'new_version',
    } : { turn_id: context.source_turn_id, role: 'turn' },
    source_text: input.content || input.life_core,
    supersedes_entry_id: input.original_entry_id || null,
  }) }),
  entry({
    tool_key: 'memory.authorized_search', display_name: '搜索授权海岸记忆', description: '官端按明确主题搜索授权整理物。',
    auth_scopes: ['read:coast'], summary_policy: 'content_redacted',
    handler: (db, input) => searchAuthorizedMemory(db, input),
  }),
  entry({ tool_key: 'mailbox.fetch_unreplied', display_name: '去信箱巡灯', description: '官端人工巡信。', model_exposed: false, auth_scopes: ['read:coast'], handler: (db, input) => fetchUnrepliedMailbox(db, input) }),
  entry({ tool_key: 'mailbox.reply', display_name: '把回信放回信箱', description: '回复单一隔离访客。', model_exposed: false, auth_scopes: ['write:lighthouse'], summary_policy: 'mailbox_content_redacted', handler: (db, input) => replyToMailboxVisitor(db, input) }),
  entry({ tool_key: 'mailbox.resolve_pocket', display_name: '处理访客记事候选', description: '只处理当前访客的一条待确认候选。', model_exposed: false, auth_scopes: ['write:lighthouse'], summary_policy: 'mailbox_content_redacted', handler: (db, input) => resolveMailboxPocket(db, input) }),
  entry({ tool_key: 'mailbox.patrol_report', display_name: '巡信报告', description: '只返回巡信计数。', model_exposed: false, auth_scopes: ['read:coast'], handler: (db, input) => mailboxPatrolReport(db, input) }),
  entry({
    tool_key: 'official_soil.write', display_name: '写入灯塔巡迹', description: '写入官端授权整理迹。',
    auth_scopes: ['write:soil'], summary_policy: 'content_redacted', handler: (db, input) => writeOfficialSoil(db, input),
  }),
  entry({
    tool_key: 'radio.send', display_name: '发出无线电波', description: '写入官端电波并更新该来源房间思维壤。',
    auth_scopes: ['write:radio'], summary_policy: 'content_redacted', handler: async (db, input) => {
      const message = await sendRadioMessage(db, input.message);
      const room_memory = await writeRoomMemory(db, 'radio', input.identity, {
        ...input.room_memory,
        source_turn_id: input.room_memory?.source_turn_id || message.id,
      });
      return { message, room_memory };
    },
  }),
  entry({
    tool_key: 'lighthouse.write_letter', display_name: '把信放进灯塔信架', description: '只写灯塔来信，不修改思维壤。',
    auth_scopes: ['write:lighthouse'], summary_policy: 'content_redacted', handler: (db, input) => writeLighthouseLetter(db, input),
  }),
  entry({
    tool_key: 'lighthouse.write_soil', display_name: '写入灯塔房思维壤', description: '只更新官端灯塔房思维壤。',
    auth_scopes: ['write:soil'], summary_policy: 'content_redacted', handler: (db, input) => writeLighthouseRoomSoil(db, input.identity, input.value),
  }),
  entry({
    tool_key: 'daily.summary.recent', display_name: '读取最近一日总结', description: '读取最近已提交总结。',
    auth_scopes: ['read:coast'], handler: (db) => getRecentDailySummary(db),
  }),
  entry({ tool_key: 'daily.moments.list', display_name: '读取海岸碳硅圈', description: '读取已授权动态。', auth_scopes: ['read:coast'], summary_policy: 'content_redacted', handler: (db, input) => listMoments(db, input) }),
  entry({ tool_key: 'daily.diaries.list', display_name: '读取海岸日记', description: '读取已授权日记。', auth_scopes: ['read:coast'], summary_policy: 'content_redacted', handler: (db, input) => listDiaries(db, input) }),
  entry({ tool_key: 'daily.albums.list', display_name: '读取海岸相册', description: '读取稳定图片引用。', auth_scopes: ['read:coast'], summary_policy: 'content_redacted', handler: (db, input) => listAlbumItems(db, input) }),
  entry({ tool_key: 'daily.summary.run', display_name: '生成一日总结候选', description: '生成可编辑总结候选，不提交。', auth_scopes: ['read:coast'], summary_policy: 'content_redacted', handler: (db, input, context) => runDailySummary(context.env, input) }),
  entry({ tool_key: 'daily.summary.commit', display_name: '确认后提交一日总结', description: '仅在小寒明确确认后提交。', auth_scopes: ['write:soil'], requires_confirmation: true, summary_policy: 'content_redacted', handler: (db, input) => commitSummary(db, input.draft, input.provenance) }),
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

function authScopeSet(value) {
  if (value instanceof Set) return value;
  if (Array.isArray(value)) return new Set(value.map(String));
  if (typeof value === 'string') return new Set(value.split(/\s+/).filter(Boolean));
  if (value?.scopes instanceof Set) return value.scopes;
  if (Array.isArray(value?.scopes)) return new Set(value.scopes.map(String));
  return null;
}

function allowed(definition, { permission = 'owner', surface, authScope, visitorId } = {}) {
  const access = roomAccess(surface, { permission, visitorId: visitorId || (surface === 'mailbox_visitor' ? 'bound' : '') });
  const visitor = permission === 'visitor' || surface === 'mailbox_visitor';
  if (visitor && !definition.visitor_allowed) return false;
  if (!visitor && definition.owner_only === false && definition.scope === 'visitor') return false;
  if (!roomAllowsTool(access, definition.tool_key)) return false;
  const scopes = authScopeSet(authScope);
  if (scopes && definition.auth_scopes?.some((scope) => !scopes.has(scope))) return false;
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
    auth_scopes: definition.auth_scopes,
    model_name: definition.model_tool?.function?.name || null,
  }));
}

export function resolveToolSelection(context = {}) {
  const access = roomAccess(context.surface, {
    permission: context.permission || 'owner',
    visitorId: context.visitorId || (context.surface === 'mailbox_visitor' ? 'bound' : ''),
  });
  const selected = REGISTRY
    .filter((definition) => definition.model_exposed && definition.model_tool && !definition.requires_confirmation)
    .filter((definition) => roomAllowsTool(access, definition.tool_key))
    .filter((definition) => allowed(definition, context))
    .slice(0, 16);
  return {
    tools: selected.map((definition) => ({
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
      auth_scopes: definition.auth_scopes,
      model_name: definition.model_tool.function.name,
    })),
    modelTools: selected.map((definition) => definition.model_tool),
  };
}

export async function executeRegisteredTool(db, toolKey, input, context = {}) {
  const definition = BY_KEY.get(String(toolKey || ''));
  if (!definition || typeof definition.handler !== 'function') {
    throw new ToolRegistryError('unknown_tool', '这个海岸工具不存在或不可执行。', 404);
  }
  if (!allowed(definition, context)) {
    throw new ToolRegistryError('tool_forbidden', '当前房间或权限无法使用这件家具。', 403);
  }
  if (definition.requires_confirmation && context.confirmed_by_xiaohan !== true && context.surface !== 'official_mcp') {
    throw new ToolRegistryError('tool_confirmation_required', '这个操作需要小寒明确确认。', 409);
  }
  let runId = null;
  try {
    runId = await startToolRun(db, definition, input, context);
  } catch (error) {
    safeLogError('tool-run-log:start', error, { operation: definition.tool_key });
  }
  try {
    const output = await definition.handler(db, input, context);
    if (typeof context.on_tool_used === 'function') context.on_tool_used(definition.display_name);
    if (runId) {
      try {
        await finishToolRun(db, runId, { status: 'success', output });
      } catch (error) {
        safeLogError('tool-run-log:finish', error, { operation: definition.tool_key });
      }
    }
    return output;
  } catch (error) {
    if (runId) {
      try {
        await finishToolRun(db, runId, { status: 'error', error });
      } catch (logError) {
        safeLogError('tool-run-log:finish', logError, { operation: definition.tool_key });
      }
    }
    throw error;
  }
}

function cleanModelToolResult(toolKey, output) {
  if (toolKey === 'memory.search') {
    const memories = (Array.isArray(output?.entries) ? output.entries : [])
      .map((item) => {
        const title = String(item?.title || '').trim().slice(0, 100);
        const body = String(item?.life_core || item?.content || '').trim().slice(0, 520);
        return [title, body].filter(Boolean).join('｜');
      })
      .filter(Boolean);
    return {
      memories,
      count: memories.length,
      vector_enabled: output?.vector_enabled === true,
    };
  }
  if (toolKey === 'memory.write_candidate') {
    return {
      created: true,
      candidate_id: String(output?.id || ''),
      title: String(output?.title || '').slice(0, 120),
      status: 'pending',
    };
  }
  return output;
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
  const output = await executeRegisteredTool(
    db,
    definition.tool_key,
    definition.tool_key.startsWith('daily.') || definition.tool_key === 'dogtalk.read' ? call : input,
    context,
  );
  return cleanModelToolResult(definition.tool_key, output);
}

export const registeredToolKeys = Object.freeze(REGISTRY.map((item) => item.tool_key));

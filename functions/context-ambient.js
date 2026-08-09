import { calendarEnvironment } from './calendar-store.js';
import { contextBlock } from './context-manifest.js';

function localTime(value, localDate) {
  const supplied = String(value || '').trim().slice(0, 32);
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(supplied)) return supplied.replace('T', ' ').slice(0, 16);
  const date = String(localDate || new Date().toISOString().slice(0, 10));
  return `${date} ${new Date().toISOString().slice(11, 16)} UTC`;
}

function roomName(surface) {
  return {
    main_chat: '主聊天',
    landing: '登岛信',
    calendar: '海岸日历',
    mailbox: '海岸信箱巡灯',
    official_mcp: '官端 MCP',
    visitor: '访客信箱',
    mailbox_visitor: '访客信箱',
  }[surface] || String(surface || '主聊天');
}

export async function buildAmbientContext(env, {
  localDate,
  localDateTime,
  surface = 'main_chat',
  conversationId,
  model,
  mode,
  settings = {},
  tools = [],
  permission = 'owner',
} = {}) {
  const flags = settings.ambient || {};
  const calendarMode = settings.calendar_injection || 'only_when_events';
  let calendar = null;
  if (flags.calendar !== false && !['off', 'manual'].includes(calendarMode) && permission === 'owner') {
    calendar = await calendarEnvironment(env.COAST_CHAT_DB, {
      date: localDate,
      include_new: surface === 'official_mcp',
      include_upcoming: calendarMode !== 'today_only',
    });
  }
  const lines = ['【海岸环境】'];
  if (flags.time !== false) lines.push(`本地时间：${localTime(localDateTime, localDate)}`);
  if (flags.room !== false) {
    lines.push(`当前房间：${roomName(surface)}`);
    if (conversationId) lines.push(`conversation_id：${String(conversationId).slice(0, 200)}`);
  }
  lines.push(`当前情境：${mode?.title || '普通聊天'}`);
  if (flags.model !== false && model) lines.push(`当前模型：${String(model).slice(0, 180)}`);
  if (calendar && !calendar.empty) lines.push(`今日日历：${calendar.events.length} 条事件，${calendar.notes.length} 张便签`, calendar.text);
  if (flags.tools !== false && tools.length) lines.push(`可用工具：${tools.map((tool) => tool.tool_key || tool).join(', ')}`);
  lines.push(`权限：${permission === 'visitor' ? 'visitor' : 'owner'}${surface === 'official_mcp' ? ' / official_mcp' : ''}`);
  if (lines.length === 1) return { block: null, calendar };
  return {
    block: contextBlock({
      key: 'ambient_context',
      title: 'Coast Ambient Context',
      body: lines.join('\n'),
      source: 'current_runtime',
      scope: 'current_runtime',
      priority: 'high',
      freshness: 'live',
      confidence: 'system_confirmed',
      use_hint: '理解当前时间、房间、日历、模型和可用工具。',
      avoid_hint: '环境包不是长期记忆，不要把它写成用户偏好。',
      trace: { calendar_empty: calendar?.empty ?? null, calendar_change_ids: calendar?.change_ids || [] },
    }),
    calendar,
  };
}

export function modeContextBlock(mode) {
  if (!mode?.prompt) return null;
  return contextBlock({
    key: 'mode_card',
    title: `情境卡｜${mode.title}`,
    body: ['【当前情境卡】', `名称：${mode.title}`, mode.description ? `用途：${mode.description}` : '', `本轮姿态：${mode.prompt}`].filter(Boolean).join('\n'),
    source: `mode_card:${mode.mode_key}`,
    scope: 'current_runtime',
    priority: 'high',
    freshness: 'live',
    confidence: 'user_confirmed',
    use_hint: '调整本轮任务姿态、工具与上下文偏好。',
    avoid_hint: '情境卡不是人格，也不代表另一个 Myri。',
    trace: { mode_key: mode.mode_key, tool_allowlist: mode.tool_allowlist || [] },
  });
}

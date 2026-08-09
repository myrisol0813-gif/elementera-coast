import { calendarEnvironment } from './calendar-store.js';
import { contextBlock } from './context-manifest.js';
import { getSurfaceProfile } from './context-surfaces.js';

function localTime(value, localDate) {
  const supplied = String(value || '').trim().slice(0, 32);
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(supplied)) return supplied.replace('T', ' ').slice(0, 16);
  const date = String(localDate || new Date().toISOString().slice(0, 10));
  return `${date} ${new Date().toISOString().slice(11, 16)} UTC`;
}

function toolGroups(tools) {
  const groups = new Set();
  for (const tool of tools) {
    const key = String(tool.tool_key || tool);
    if (key.startsWith('calendar.')) groups.add('日历');
    else if (key.startsWith('memory.')) groups.add('记忆');
    else if (key.startsWith('daily.')) groups.add('日报');
    else if (key.startsWith('dogtalk.')) groups.add('神秘狗话');
    else if (key.startsWith('mailbox.')) groups.add('信箱');
    else if (key.startsWith('radio.')) groups.add('无线电波');
    else if (key.startsWith('lighthouse.')) groups.add('灯塔来信');
  }
  return [...groups];
}

export async function buildAmbientContext(env, {
  localDate,
  localDateTime,
  surface,
  profile: profileValue,
  conversationId,
  model,
  mode,
  settings = {},
  tools = [],
  permission = 'owner',
} = {}) {
  const profile = profileValue || getSurfaceProfile(surface);
  const flags = settings.ambient || {};
  const requestedCalendarMode = settings.calendar_injection || 'only_when_events';
  const calendarMode = profile.calendarPolicy === 'always'
    ? 'only_when_events'
    : profile.calendarPolicy === 'settings'
      ? requestedCalendarMode
      : profile.calendarPolicy;
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
    lines.push(`当前房间：${profile.title}`);
    if (conversationId) lines.push(`conversation_id：${String(conversationId).slice(0, 200)}`);
  }
  lines.push(`当前情境：${mode?.title || '普通聊天'}`);
  if (flags.model !== false && model) lines.push(`当前模型：${String(model).slice(0, 180)}`);
  if (calendar && !calendar.empty) lines.push(calendar.text);
  if (flags.tools !== false && tools.length) {
    const groups = toolGroups(tools);
    lines.push(`可用工具：${tools.length} 项${groups.length ? `（${groups.join('、')}）` : ''}`);
  }
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
      trace: {
        surface,
        event_count: calendar?.event_count ?? null,
        note_count: calendar?.note_count ?? null,
        anniversary_count: calendar?.anniversary_count ?? null,
        calendar_empty: calendar?.calendar_empty ?? calendar?.empty ?? null,
        calendar_empty_reason: calendar?.calendar_empty_reason || null,
        upcoming_anniversaries: calendar?.upcoming_anniversaries || [],
        calendar_change_ids: calendar?.change_ids || [],
      },
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

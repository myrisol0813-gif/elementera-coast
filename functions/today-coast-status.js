import { calendarEnvironment } from './calendar-store.js';
import { listAlbumItems, listDiaries, listMoments } from './daily-store.js';
import { listPockets } from './memory-store.js';

function clip(value, max = 240) { return String(value ?? '').trim().slice(0, max); }

function requestedStatus(query) {
  return /(今天|今日|明天|现在几点|时间|日程|计划|提醒|日历|台历|海岸日报|碳硅圈|朋友圈|日记|相册|宠物|待确认袋|落袋)/u.test(String(query || ''));
}

function requestedDaily(query) {
  return /(海岸日报|碳硅圈|朋友圈|日记|相册)/u.test(String(query || ''));
}

function calendarLines(environment, { includeDistantAnniversaries = false } = {}) {
  if (!environment || environment.empty) return [];
  const source = String(environment.text || '')
    .split('\n')
    .filter((line) => line && line !== '【海岸日历】')
    .filter((line) => {
      if (!line.startsWith('近期纪念日：') || includeDistantAnniversaries) return true;
      return (environment.upcoming_anniversaries || []).some((item) => Number(item.days_remaining) <= 14);
    })
    .map((line) => {
      if (!line.startsWith('近期纪念日：') || includeDistantAnniversaries) return line;
      const near = (environment.upcoming_anniversaries || [])
        .filter((item) => Number(item.days_remaining) <= 14)
        .map((item) => item.text);
      return near.length ? `近期纪念日：${near.join('；')}。` : '';
    })
    .filter(Boolean);
  return source.map((line, index) => index === 0 ? `海岸日历：${line.replace(/^今日：/, '')}` : line);
}

export async function buildTodayCoastStatus(db, {
  surface = 'main_chat',
  conversationId = '',
  query = '',
  localDate = new Date().toISOString().slice(0, 10),
  localDateTime = '',
  referenceEnabled = false,
} = {}) {
  if (surface === 'mailbox_visitor' || surface === 'mailbox_owner') {
    return { text: '', required: false, pendingCount: 0 };
  }
  const explicitlyRequested = requestedStatus(query);
  const allowCalendar = ['main_chat', 'landing', 'calendar', 'daily', 'official_mcp'].includes(surface);
  const allowPending = ['main_chat', 'landing'].includes(surface) && conversationId;
  const [calendar, pending] = await Promise.all([
    allowCalendar
      ? calendarEnvironment(db, { date: localDate, include_new: true, include_upcoming: true })
      : Promise.resolve(null),
    allowPending
      ? listPockets(db, { conversation_id: conversationId, status: 'pending' })
      : Promise.resolve([]),
  ]);
  const upcoming = Array.isArray(calendar?.upcoming_anniversaries)
    ? calendar.upcoming_anniversaries
    : [];
  const calendarImportant = Boolean(calendar && (
    Number(calendar.event_count || 0) > 0
    || Number(calendar.note_count || 0) > 0
    || (Array.isArray(calendar.new_changes) && calendar.new_changes.length > 0)
    || upcoming.some((item) => Number(item.days_remaining) <= 14)
  ));
  const important = calendarImportant || pending.length > 0;
  const referencedCalendar = referenceEnabled && Boolean(calendar && !calendar.empty);
  if (!explicitlyRequested && !important && !referencedCalendar) {
    return { text: '', required: false, pendingCount: 0 };
  }

  const lines = ['【今日海岸】'];
  const now = clip(localDateTime, 40);
  if (explicitlyRequested && now) lines.push(`现在：${now}`);
  const showCalendar = explicitlyRequested || calendarImportant || referencedCalendar;
  const calendarStatus = showCalendar
    ? calendarLines(calendar, { includeDistantAnniversaries: explicitlyRequested || referencedCalendar })
    : [];
  if (calendarStatus.length) lines.push(...calendarStatus);
  else if (explicitlyRequested && allowCalendar) lines.push('海岸日历：今日暂无明确日程。');
  if (pending.length) lines.push(`待确认袋：新增 ${pending.length} 张纸条待确认。`);

  if (requestedDaily(query) && ['main_chat', 'landing', 'daily', 'official_mcp'].includes(surface)) {
    const [moments, diaries, albums] = await Promise.all([
      listMoments(db, { date: localDate, limit: 30 }),
      listDiaries(db, { date: localDate }),
      listAlbumItems(db, { date: localDate }),
    ]);
    if (moments.length) lines.push(`碳硅圈：今日 ${moments.length} 条。`);
    if (diaries.length) lines.push(`日记：今日 ${diaries.length} 篇。`);
    if (albums.length) lines.push(`相册：今日 ${albums.length} 张引用。`);
  }
  return {
    text: lines.length > 1 ? lines.join('\n') : '',
    required: explicitlyRequested || important,
    pendingCount: pending.length,
  };
}

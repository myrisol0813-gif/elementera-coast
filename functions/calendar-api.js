import { apiError, json, readJson } from './http.js';
import { OwnerAccessError, requireOwnerSession } from './owner-access.js';
import {
  CalendarStoreError,
  calendarEnvironment,
  calendarUnseenSummary,
  createCalendarEvent,
  createCalendarNote,
  deleteCalendarEvent,
  deleteCalendarNote,
  listCalendarDay,
  listCalendarEvents,
  markCalendarChangesSeen,
  markCalendarDaySeen,
  updateCalendarEvent,
  updateCalendarNote,
} from './calendar-store.js';

const ROOT = '/api/calendar';
const BODY_LIMIT = 48 * 1024;

function methodNotAllowed(allow) {
  return apiError('method_not_allowed', 'Method not allowed.', 405, { allow });
}

async function body(request) {
  try {
    return await readJson(request, BODY_LIMIT);
  } catch (error) {
    if (error?.message === 'body_too_large') {
      throw new CalendarStoreError('body_too_large', '日历请求内容过长。', 413);
    }
    throw new CalendarStoreError('invalid_json', '日历请求不是有效 JSON。', 400);
  }
}

function itemId(match) {
  return decodeURIComponent(match[1]);
}

export function isCalendarApiPath(pathname) {
  return pathname === ROOT || pathname.startsWith(`${ROOT}/`);
}

export async function routeCalendarApi(request, env, session = null) {
  if (!env?.COAST_CHAT_DB?.prepare) {
    return apiError('coast_db_not_configured', '海岸 D1 存储未配置。', 503);
  }
  const url = new URL(request.url);
  const db = env.COAST_CHAT_DB;
  try {
    requireOwnerSession(session);
    if (url.pathname === `${ROOT}/events`) {
      if (request.method === 'GET') {
        return json({
          ok: true,
          events: await listCalendarEvents(db, {
            from: url.searchParams.get('from') || undefined,
            to: url.searchParams.get('to') || undefined,
          }),
        });
      }
      if (request.method === 'POST') {
        return json({
          ok: true,
          event: await createCalendarEvent(db, await body(request), { actor: 'user', source: 'manual' }),
        }, 201);
      }
      return methodNotAllowed('GET, POST');
    }
    const eventMatch = url.pathname.match(/^\/api\/calendar\/events\/([^/]+)$/);
    if (eventMatch) {
      if (request.method === 'PATCH') {
        return json({
          ok: true,
          event: await updateCalendarEvent(db, itemId(eventMatch), await body(request), { actor: 'user' }),
        });
      }
      if (request.method === 'DELETE') {
        return json({ ok: true, event: await deleteCalendarEvent(db, itemId(eventMatch), { actor: 'user' }) });
      }
      return methodNotAllowed('PATCH, DELETE');
    }
    const dayMatch = url.pathname.match(/^\/api\/calendar\/day\/(\d{4}-\d{2}-\d{2})$/);
    if (dayMatch) {
      if (request.method !== 'GET') return methodNotAllowed('GET');
      return json({ ok: true, ...await listCalendarDay(db, dayMatch[1]) });
    }
    if (url.pathname === `${ROOT}/notes`) {
      if (request.method !== 'POST') return methodNotAllowed('POST');
      return json({
        ok: true,
        note: await createCalendarNote(db, await body(request), { actor: 'user' }),
      }, 201);
    }
    const noteMatch = url.pathname.match(/^\/api\/calendar\/notes\/([^/]+)$/);
    if (noteMatch) {
      if (request.method === 'PATCH') {
        return json({
          ok: true,
          note: await updateCalendarNote(db, itemId(noteMatch), await body(request), { actor: 'user' }),
        });
      }
      if (request.method === 'DELETE') {
        return json({ ok: true, note: await deleteCalendarNote(db, itemId(noteMatch), { actor: 'user' }) });
      }
      return methodNotAllowed('PATCH, DELETE');
    }
    if (url.pathname === `${ROOT}/env`) {
      if (request.method === 'GET') {
        return json({
          ok: true,
          env: await calendarEnvironment(db, {
            date: url.searchParams.get('date') || undefined,
            include_new: url.searchParams.get('include_new') !== '0',
          }),
        });
      }
      return methodNotAllowed('GET');
    }
    if (url.pathname === `${ROOT}/env/seen`) {
      if (request.method !== 'POST') return methodNotAllowed('POST');
      return json({ ok: true, ...await markCalendarDaySeen(db, (await body(request)).date) });
    }
    if (url.pathname === `${ROOT}/unseen`) {
      if (request.method !== 'GET') return methodNotAllowed('GET');
      return json({ ok: true, ...await calendarUnseenSummary(db) });
    }
    if (url.pathname === `${ROOT}/unseen/seen`) {
      if (request.method !== 'POST') return methodNotAllowed('POST');
      const value = await body(request);
      return json({ ok: true, ...await markCalendarChangesSeen(db, 'user', value.change_ids) });
    }
    return apiError('not_found', 'Not found.', 404);
  } catch (error) {
    if (error instanceof CalendarStoreError || error instanceof OwnerAccessError) {
      return apiError(error.type, error.message, error.status);
    }
    const reference = crypto.randomUUID().slice(0, 8);
    console.error(`[calendar-api:${reference}]`, error);
    return apiError('calendar_failed', `海岸日历暂时没有翻到那一页（${reference}）。`, 500);
  }
}

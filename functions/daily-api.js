import { ChatStoreError } from './chat-store.js';
import {
  DailyStoreError,
  addMomentComment,
  commitSummary,
  createAlbumItem,
  createDiary,
  createMoment,
  hasDailyDatabase,
  listAlbumItems,
  listDiaries,
  listMoments,
  listSummaries,
  patchDiary,
  patchMoment,
  setMomentLike,
} from './daily-store.js';
import { dailySummaryRangeOptions, runDailySummary } from './daily-summary.js';
import { apiError, json, readJson } from './http.js';
import { ModelRequestError } from './models.js';

const DAILY_PATH = '/api/daily';
const BODY_LIMIT = 256 * 1024;

function methodNotAllowed(allow) {
  return apiError('method_not_allowed', 'Method not allowed.', 405, { allow });
}

async function body(request) {
  try {
    return await readJson(request, BODY_LIMIT);
  } catch (error) {
    if (error.message === 'body_too_large') throw new DailyStoreError('body_too_large', '日报请求体过大。', 413);
    throw new DailyStoreError('invalid_request', '日报请求体不是有效的 JSON。', 400);
  }
}

function suffix(pathname, base) {
  return decodeURIComponent(pathname.slice(base.length).replace(/^\//, ''));
}

async function moments(request, env, url) {
  const base = `${DAILY_PATH}/moments`;
  const rest = suffix(url.pathname, base);
  if (!rest) {
    if (request.method === 'GET') {
      return json({
        ok: true,
        moments: await listMoments(env.COAST_CHAT_DB, {
          status: url.searchParams.get('status') || '',
          date: url.searchParams.get('date') || '',
        }),
      });
    }
    if (request.method === 'POST') {
      return json({
        ok: true,
        moment: await createMoment(env.COAST_CHAT_DB, await body(request), {
          author: 'xiaohan',
          source: 'manual',
          conversation_id: null,
          source_turn_id: null,
          tool_call_id: null,
        }),
      }, 201);
    }
    return methodNotAllowed('GET, POST');
  }

  const parts = rest.split('/');
  const id = parts[0];
  if (parts.length === 2 && parts[1] === 'comments') {
    if (request.method !== 'POST') return methodNotAllowed('POST');
    const value = await body(request);
    return json({
      ok: true,
      moment: await addMomentComment(env.COAST_CHAT_DB, id, {
        id: value.id,
        author: 'xiaohan',
        text: value.text,
      }),
    }, 201);
  }
  if (parts.length === 2 && parts[1] === 'like') {
    if (!['PUT', 'DELETE'].includes(request.method)) return methodNotAllowed('PUT, DELETE');
    return json({
      ok: true,
      moment: await setMomentLike(env.COAST_CHAT_DB, id, request.method === 'PUT', 'xiaohan'),
    });
  }
  if (parts.length !== 1 || request.method !== 'PATCH') return methodNotAllowed('PATCH');
  return json({ ok: true, moment: await patchMoment(env.COAST_CHAT_DB, id, await body(request)) });
}

async function diaries(request, env, url) {
  const base = `${DAILY_PATH}/diaries`;
  const rest = suffix(url.pathname, base);
  if (!rest) {
    if (request.method === 'GET') {
      return json({
        ok: true,
        diaries: await listDiaries(env.COAST_CHAT_DB, {
          date: url.searchParams.get('date') || '',
          author: url.searchParams.get('author') || '',
        }),
      });
    }
    if (request.method === 'POST') {
      return json({
        ok: true,
        diary: await createDiary(env.COAST_CHAT_DB, await body(request), {
          source: 'manual',
        }),
      }, 201);
    }
    return methodNotAllowed('GET, POST');
  }
  if (rest.includes('/') || request.method !== 'PATCH') return methodNotAllowed('PATCH');
  return json({ ok: true, diary: await patchDiary(env.COAST_CHAT_DB, rest, await body(request)) });
}

async function albums(request, env, url) {
  if (url.pathname !== `${DAILY_PATH}/albums`) return apiError('not_found', 'Not found.', 404);
  if (request.method === 'GET') {
    return json({
      ok: true,
      albums: await listAlbumItems(env.COAST_CHAT_DB, {
        date: url.searchParams.get('date') || '',
        category: url.searchParams.get('category') || '',
      }),
    });
  }
  if (request.method === 'POST') {
    return json({
      ok: true,
      album: await createAlbumItem(env.COAST_CHAT_DB, await body(request), {
        author: 'xiaohan',
        source: 'manual',
        conversation_id: null,
        source_turn_id: null,
        tool_call_id: null,
      }),
    }, 201);
  }
  return methodNotAllowed('GET, POST');
}

async function summaries(request, env, url) {
  if (url.pathname === `${DAILY_PATH}/summary/range`) {
    if (request.method !== 'GET') return methodNotAllowed('GET');
    return json({
      ok: true,
      ranges: await dailySummaryRangeOptions(env.COAST_CHAT_DB, {
        timezone_offset_minutes: url.searchParams.get('timezone_offset_minutes'),
      }),
    });
  }
  if (url.pathname === `${DAILY_PATH}/summaries`) {
    if (request.method !== 'GET') return methodNotAllowed('GET');
    return json({ ok: true, summaries: await listSummaries(env.COAST_CHAT_DB) });
  }
  if (url.pathname === `${DAILY_PATH}/summary/run`) {
    if (request.method !== 'POST') return methodNotAllowed('POST');
    return json({ ok: true, ...await runDailySummary(env, await body(request)) });
  }
  if (url.pathname === `${DAILY_PATH}/summary/commit`) {
    if (request.method !== 'POST') return methodNotAllowed('POST');
    return json({ ok: true, ...(await commitSummary(env.COAST_CHAT_DB, await body(request))) }, 201);
  }
  return apiError('not_found', 'Not found.', 404);
}

export function isDailyApiPath(pathname) {
  return pathname === `${DAILY_PATH}/moments`
    || pathname.startsWith(`${DAILY_PATH}/moments/`)
    || pathname === `${DAILY_PATH}/diaries`
    || pathname.startsWith(`${DAILY_PATH}/diaries/`)
    || pathname === `${DAILY_PATH}/albums`
    || pathname === `${DAILY_PATH}/summaries`
    || pathname === `${DAILY_PATH}/summary/range`
    || pathname === `${DAILY_PATH}/summary/run`
    || pathname === `${DAILY_PATH}/summary/commit`;
}

export async function routeDailyApi(request, env) {
  if (!hasDailyDatabase(env)) return apiError('daily_db_not_configured', '海岸日报 D1 存储未配置。', 503);
  const url = new URL(request.url);
  try {
    if (url.pathname === `${DAILY_PATH}/moments` || url.pathname.startsWith(`${DAILY_PATH}/moments/`)) {
      return await moments(request, env, url);
    }
    if (url.pathname === `${DAILY_PATH}/diaries` || url.pathname.startsWith(`${DAILY_PATH}/diaries/`)) {
      return await diaries(request, env, url);
    }
    if (url.pathname === `${DAILY_PATH}/albums`) return await albums(request, env, url);
    return await summaries(request, env, url);
  } catch (error) {
    if (error instanceof DailyStoreError || error instanceof ChatStoreError || error instanceof ModelRequestError) {
      return apiError(error.type, error.message, error.status, error.details || {});
    }
    const reference = crypto.randomUUID().slice(0, 8);
    console.error(`[daily-api:${reference}]`, error);
    return apiError('daily_store_failed', `海岸日报操作失败（${reference}）。`, 500);
  }
}

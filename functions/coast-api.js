import { apiError, json, readJson } from './http.js';
import { xiaohanIdentity } from './coast-identity.js';
import { CoastStoreError } from './coast-records.js';
import {
  listLighthouseLetters,
  markLighthouseLetterRead,
  writeLighthouseLetter,
} from './lighthouse-store.js';
import { ModelRequestError } from './models.js';
import { askApiMyriInRadio } from './radio-myri.js';
import { listRadioMessages, sendRadioMessage, withdrawRadioMessage } from './radio-store.js';

const RADIO_MESSAGES = '/api/radio/messages';
const RADIO_ASK = '/api/radio/ask-api-myri';
const LIGHTHOUSE = '/api/lighthouse/letters';

function methodNotAllowed(allow) {
  return apiError('method_not_allowed', 'Method not allowed.', 405, { allow });
}

export function isCoastRoomApiPath(pathname) {
  return pathname === RADIO_MESSAGES
    || pathname.startsWith(`${RADIO_MESSAGES}/`)
    || pathname === RADIO_ASK
    || pathname === LIGHTHOUSE
    || pathname.startsWith(`${LIGHTHOUSE}/`);
}

export async function routeCoastRoomApi(request, env, session = null) {
  if (!env?.COAST_CHAT_DB?.prepare) return apiError('coast_db_not_configured', '海岸 D1 存储未配置。', 503);
  const url = new URL(request.url);
  try {
    if (url.pathname === RADIO_MESSAGES) {
      if (request.method === 'GET') {
        const messages = await listRadioMessages(env.COAST_CHAT_DB, {
          limit: url.searchParams.get('limit'),
          before: url.searchParams.get('before'),
        });
        return json({ ok: true, room_id: 'radio', messages });
      }
      if (request.method === 'POST') {
        const value = await readJson(request);
        const message = await sendRadioMessage(env.COAST_CHAT_DB, {
          text: value.text,
          identity: xiaohanIdentity(),
          source_conversation_id: value.source_conversation_id,
          source_turn_id: value.source_turn_id,
          tool_call_id: value.tool_call_id,
        });
        return json({ ok: true, message }, 201);
      }
      return methodNotAllowed('GET, POST');
    }
    const radioMessageMatch = url.pathname.match(/^\/api\/radio\/messages\/([^/]+)$/);
    if (radioMessageMatch) {
      if (request.method !== 'DELETE') return methodNotAllowed('DELETE');
      if (!session) return apiError('unauthorized', '请先从海岸网页登录。', 401);
      const message = await withdrawRadioMessage(
        env.COAST_CHAT_DB,
        decodeURIComponent(radioMessageMatch[1]),
      );
      return json({ ok: true, message });
    }
    if (url.pathname === RADIO_ASK) {
      if (request.method !== 'POST') return methodNotAllowed('POST');
      return json({ ok: true, ...await askApiMyriInRadio(env, await readJson(request)) }, 201);
    }
    if (url.pathname === LIGHTHOUSE) {
      if (request.method === 'GET') {
        const letters = await listLighthouseLetters(env.COAST_CHAT_DB, {
          limit: url.searchParams.get('limit'),
          unread_only: url.searchParams.get('unread_only') === '1',
        });
        return json({ ok: true, letters });
      }
      if (request.method === 'POST') {
        const value = await readJson(request);
        const letter = await writeLighthouseLetter(env.COAST_CHAT_DB, {
          subject: value.subject,
          body: value.body,
          identity: xiaohanIdentity(),
          source_conversation_id: value.source_conversation_id,
          source_turn_id: value.source_turn_id,
          tool_call_id: value.tool_call_id,
        });
        return json({ ok: true, letter }, 201);
      }
      return methodNotAllowed('GET, POST');
    }
    const match = url.pathname.match(/^\/api\/lighthouse\/letters\/([^/]+)\/read$/);
    if (match) {
      if (request.method !== 'PATCH') return methodNotAllowed('PATCH');
      const value = await readJson(request);
      const letter = await markLighthouseLetterRead(
        env.COAST_CHAT_DB,
        decodeURIComponent(match[1]),
        value.read !== false,
      );
      if (!letter) return apiError('lighthouse_letter_not_found', '这封灯塔来信不存在。', 404);
      return json({ ok: true, letter });
    }
    return apiError('not_found', 'Not found.', 404);
  } catch (error) {
    if (error instanceof CoastStoreError || error instanceof ModelRequestError) {
      return apiError(error.type, error.message, error.status, error.details || {});
    }
    if (error?.message === 'invalid_json' || error?.message === 'body_too_large') {
      return apiError(error.message, error.message === 'invalid_json' ? '请求内容不是有效 JSON。' : '请求内容过长。', error.status || 400);
    }
    const reference = crypto.randomUUID().slice(0, 8);
    console.error(`[coast-room-api:${reference}]`, error);
    return apiError('coast_room_failed', `海岸房间操作失败（${reference}）。`, 500);
  }
}

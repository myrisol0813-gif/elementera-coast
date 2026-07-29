import { apiError, json, readJson } from './http.js';
import { xiaohanIdentity } from './coast-identity.js';
import { CoastStoreError } from './coast-records.js';
import {
  DogtalkStoreError,
  listMysticDogtalkSnapshots,
  saveMysticDogtalk,
  snapshotMysticDogtalk,
} from './dogtalk-store.js';
import {
  listLighthouseLetters,
  markLighthouseLetterRead,
  writeLighthouseLetter,
} from './lighthouse-store.js';
import { ModelRequestError } from './models.js';
import { MemoryStoreError } from './memory-store.js';
import { askApiMyriInRadio } from './radio-myri.js';
import { requireOwnerSession, OwnerAccessError } from './owner-access.js';
import { listRadioMessages, sendRadioMessage, withdrawRadioMessageByOwner } from './radio-store.js';
import {
  listRoomMemory,
  resolveRoomPocketByOwner,
} from './room-memory.js';

const RADIO_MESSAGES = '/api/radio/messages';
const RADIO_ASK = '/api/radio/ask-api-myri';
const LIGHTHOUSE = '/api/lighthouse/letters';
const RADIO_MEMORY = '/api/radio/memory';
const LIGHTHOUSE_MEMORY = '/api/lighthouse/memory';

function methodNotAllowed(allow) {
  return apiError('method_not_allowed', 'Method not allowed.', 405, { allow });
}

export function isCoastRoomApiPath(pathname) {
  return pathname === RADIO_MESSAGES
    || pathname.startsWith(`${RADIO_MESSAGES}/`)
    || pathname === RADIO_ASK
    || pathname === RADIO_MEMORY
    || pathname.startsWith(`${RADIO_MEMORY}/`)
    || pathname === LIGHTHOUSE
    || pathname === LIGHTHOUSE_MEMORY
    || pathname.startsWith(`${LIGHTHOUSE_MEMORY}/`)
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
          include_withdrawn: true,
        });
        const snapshots = await listMysticDogtalkSnapshots(env.COAST_CHAT_DB, {
          room_scope: 'radio',
          source_ids: messages.map((message) => message.id),
        });
        const bySource = new Map(snapshots.map((snapshot) => [snapshot.source_id, snapshot]));
        return json({
          ok: true,
          room_id: 'radio',
          messages: messages.map((message) => ({
            ...message,
            ...(bySource.has(message.id) ? { dogtalk_snapshot: bySource.get(message.id) } : {}),
          })),
        });
      }
      if (request.method === 'POST') {
        const value = await readJson(request);
        const dogtalk = value.dogtalk && typeof value.dogtalk === 'object'
          ? await saveMysticDogtalk(env.COAST_CHAT_DB, {
            ...value.dogtalk,
            room_scope: 'radio',
            conversation_id: null,
            status: 'saved',
          })
          : null;
        const message = await sendRadioMessage(env.COAST_CHAT_DB, {
          text: value.text,
          identity: xiaohanIdentity(),
          source_conversation_id: value.source_conversation_id,
          source_turn_id: value.source_turn_id,
          tool_call_id: value.tool_call_id,
        });
        const dogtalkSubmission = dogtalk
          ? await snapshotMysticDogtalk(
            env.COAST_CHAT_DB,
            dogtalk,
            { source_type: 'radio_message', source_id: message.id },
            { snapshot_id: value.dogtalk?.snapshot_id },
          )
          : null;
        return json({
          ok: true,
          message: {
            ...message,
            ...(dogtalkSubmission ? { dogtalk_snapshot: dogtalkSubmission.snapshot } : {}),
          },
        }, 201);
      }
      return methodNotAllowed('GET, POST');
    }
    const radioMessageMatch = url.pathname.match(/^\/api\/radio\/messages\/([^/]+)$/);
    if (radioMessageMatch) {
      if (request.method !== 'DELETE') return methodNotAllowed('DELETE');
      requireOwnerSession(session);
      const message = await withdrawRadioMessageByOwner(
        env.COAST_CHAT_DB,
        decodeURIComponent(radioMessageMatch[1]),
      );
      return json({ ok: true, message });
    }
    if (url.pathname === RADIO_ASK) {
      if (request.method !== 'POST') return methodNotAllowed('POST');
      return json({ ok: true, ...await askApiMyriInRadio(env, await readJson(request)) }, 201);
    }
    if (url.pathname === RADIO_MEMORY || url.pathname === LIGHTHOUSE_MEMORY) {
      if (request.method !== 'GET') return methodNotAllowed('GET');
      requireOwnerSession(session);
      return json({
        ok: true,
        memory: await listRoomMemory(
          env.COAST_CHAT_DB,
          url.pathname === RADIO_MEMORY ? 'radio' : 'lighthouse',
        ),
      });
    }
    const roomPocketMatch = url.pathname.match(/^\/api\/(radio|lighthouse)\/memory\/pockets\/([^/]+)\/resolve$/);
    if (roomPocketMatch) {
      if (request.method !== 'POST') return methodNotAllowed('POST');
      requireOwnerSession(session);
      const value = await readJson(request);
      return json({
        ok: true,
        ...(await resolveRoomPocketByOwner(
          env.COAST_CHAT_DB,
          roomPocketMatch[1],
          decodeURIComponent(roomPocketMatch[2]),
          value,
        )),
      });
    }
    if (url.pathname === LIGHTHOUSE) {
      if (request.method === 'GET') {
        const letters = await listLighthouseLetters(env.COAST_CHAT_DB, {
          limit: url.searchParams.get('limit'),
          unread_only: url.searchParams.get('unread_only') === '1',
        });
        const snapshots = await listMysticDogtalkSnapshots(env.COAST_CHAT_DB, {
          room_scope: 'lighthouse',
          source_ids: letters.map((letter) => letter.id),
        });
        const bySource = new Map(snapshots.map((snapshot) => [snapshot.source_id, snapshot]));
        return json({
          ok: true,
          letters: letters.map((letter) => ({
            ...letter,
            ...(bySource.has(letter.id) ? { dogtalk_snapshot: bySource.get(letter.id) } : {}),
          })),
        });
      }
      if (request.method === 'POST') {
        const value = await readJson(request);
        const dogtalk = value.dogtalk && typeof value.dogtalk === 'object'
          ? await saveMysticDogtalk(env.COAST_CHAT_DB, {
            ...value.dogtalk,
            room_scope: 'lighthouse',
            conversation_id: null,
            status: 'saved',
          })
          : null;
        const letter = await writeLighthouseLetter(env.COAST_CHAT_DB, {
          subject: value.subject,
          body: value.body,
          identity: xiaohanIdentity(),
          source_conversation_id: value.source_conversation_id,
          source_turn_id: value.source_turn_id,
          tool_call_id: value.tool_call_id,
        });
        const dogtalkSubmission = dogtalk
          ? await snapshotMysticDogtalk(
            env.COAST_CHAT_DB,
            dogtalk,
            { source_type: 'lighthouse_letter', source_id: letter.id },
            { snapshot_id: value.dogtalk?.snapshot_id },
          )
          : null;
        return json({
          ok: true,
          letter: {
            ...letter,
            ...(dogtalkSubmission ? { dogtalk_snapshot: dogtalkSubmission.snapshot } : {}),
          },
        }, 201);
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
    if (error instanceof CoastStoreError
      || error instanceof DogtalkStoreError
      || error instanceof ModelRequestError
      || error instanceof MemoryStoreError
      || error instanceof OwnerAccessError) {
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

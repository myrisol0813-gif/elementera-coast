import { ensureChatSchema, sanitizeId } from './chat-store.js';
import { validateCoastIdentity } from './coast-identity.js';
import { buildMemoryContext, formatMemoryContext } from './memory-recall.js';
import {
  MEMORY_OWNER_ID,
  MemoryStoreError,
  getPocket,
  listEntries,
  listPockets,
  readSoil,
  resolvePocket,
  upsertSoilPocketCandidates,
  writeSoil,
} from './memory-store.js';

const ROOMS = new Set(['radio', 'lighthouse']);
const SURFACES = new Set(['web_manual', 'coast_api', 'official_mcp']);

function room(value) {
  const clean = String(value || '');
  if (!ROOMS.has(clean)) throw new TypeError('invalid room memory room');
  return clean;
}

function surface(value) {
  const clean = String(value || '');
  if (!SURFACES.has(clean)) throw new TypeError('invalid room memory surface');
  return clean;
}

export function roomMemoryConversationId(roomValue, surfaceValue) {
  return sanitizeId(`coast-room:${room(roomValue)}:${surface(surfaceValue)}`, 'room_memory');
}

function title(roomValue, surfaceValue) {
  const roomName = roomValue === 'radio' ? '三端电波房' : '灯塔来信';
  const surfaceName = {
    web_manual: '小寒侧',
    coast_api: '海岸 API 侧',
    official_mcp: '官端灯塔侧',
  }[surfaceValue];
  return `${roomName} · ${surfaceName}`;
}

async function ensureRoomConversation(db, roomValue, surfaceValue) {
  await ensureChatSchema(db);
  const id = roomMemoryConversationId(roomValue, surfaceValue);
  const timestamp = Date.now();
  await db.prepare(`INSERT OR IGNORE INTO conversations (
    id, user_id, title, created_at, updated_at, deleted_at, title_manual,
    title_generated_at, title_model_id, archived_at, conversation_kind
  ) VALUES (?, 'owner', ?, ?, ?, NULL, 1, NULL, NULL, NULL, ?)`)
    .bind(id, title(roomValue, surfaceValue), timestamp, timestamp, roomValue).run();
  await db.prepare(`INSERT OR IGNORE INTO conversation_states
    (conversation_id, state_json, updated_at) VALUES (?, ?, ?)`)
    .bind(id, JSON.stringify({ version: 4, updated_at: new Date(timestamp).toISOString(), turns: [] }), timestamp)
    .run();
  return id;
}

export async function ensureRoomMemory(db, roomValue) {
  const roomId = room(roomValue);
  const ids = {};
  for (const source of SURFACES) ids[source] = await ensureRoomConversation(db, roomId, source);
  return ids;
}

export async function listRoomMemory(db, roomValue) {
  const roomId = room(roomValue);
  const ids = await ensureRoomMemory(db, roomId);
  const sources = {};
  for (const source of SURFACES) {
    const conversationId = ids[source];
    const [soil, pockets, seeds, memories] = await Promise.all([
      readSoil(db, conversationId),
      listPockets(db, { conversation_id: conversationId, status: 'pending' }),
      listEntries(db, {
        conversation_id: conversationId,
        scope: 'conversation',
        entry_type: 'seed',
        limit: 80,
      }),
      listEntries(db, {
        conversation_id: conversationId,
        scope: 'conversation',
        entry_type: 'memory',
        limit: 80,
      }),
    ]);
    sources[source] = {
      conversation_id: conversationId,
      soil,
      pending_pockets: pockets,
      seeds: seeds.entries,
      memories: memories.entries,
    };
  }
  return { room_id: roomId, sources };
}

export async function writeRoomMemory(db, roomValue, identityValue, value = {}) {
  const roomId = room(roomValue);
  const identity = validateCoastIdentity(identityValue);
  const conversationId = await ensureRoomConversation(db, roomId, identity.surface);
  const soil = await writeSoil(db, conversationId, {
    current_text: value.current_text,
    hand_seeds: value.hand_seeds,
    do_not_repeat: value.do_not_repeat,
    pocket_candidates: value.pocket_candidates,
    organized_through_turn_id: value.organized_through_turn_id,
    manual_locked: false,
    auto_refresh_enabled: true,
  }, {
    automatic: identity.surface !== 'web_manual',
    provenance: {
      identity,
      model_label: identity.model_label,
      model_nickname: identity.model_nickname,
      source_conversation_id: value.source_conversation_id || conversationId,
      source_turn_id: value.source_turn_id,
      tool_call_id: value.tool_call_id,
    },
  });
  const pockets = await upsertSoilPocketCandidates(
    db,
    conversationId,
    value.pocket_candidates || [],
  );
  return { conversation_id: conversationId, soil, pockets };
}

export async function buildRoomMemoryContext(env, roomValue, surfaceValue, query, options = {}) {
  const roomId = room(roomValue);
  const source = surface(surfaceValue);
  const ids = await ensureRoomMemory(env.COAST_CHAT_DB, roomId);
  const memory = await buildMemoryContext(
    env,
    MEMORY_OWNER_ID,
    ids[source],
    query,
    { ...options, mode: options.mode || 'chat' },
  );
  const soils = {};
  for (const [sourceName, conversationId] of Object.entries(ids)) {
    soils[sourceName] = await readSoil(env.COAST_CHAT_DB, conversationId);
  }
  return {
    memory,
    context: formatMemoryContext(memory, options.settings || {}),
    source_soils: soils,
  };
}

export async function resolveRoomPocketByOwner(db, roomValue, pocketId, value = {}) {
  const ids = await ensureRoomMemory(db, roomValue);
  const pocket = await getPocket(db, pocketId);
  if (!Object.values(ids).includes(pocket.conversation_id)) {
    throw new MemoryStoreError('room_pocket_not_found', '这条待确认内容不属于当前房间。', 404);
  }
  return resolvePocket(db, pocket.id, value);
}

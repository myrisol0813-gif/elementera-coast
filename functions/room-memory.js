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
const ROOM_SURFACES = Object.freeze({
  radio: Object.freeze(['web_manual', 'coast_api', 'official_mcp']),
  lighthouse: Object.freeze(['web_manual', 'official_mcp']),
});

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

function roomSurfaces(roomValue) {
  return ROOM_SURFACES[room(roomValue)];
}

function participantSurface(roomValue, surfaceValue) {
  const roomId = room(roomValue);
  const source = surface(surfaceValue);
  if (!ROOM_SURFACES[roomId].includes(source)) {
    throw new MemoryStoreError(
      'room_surface_forbidden',
      roomId === 'lighthouse'
        ? '灯塔来信只属于小寒与官端灯塔侧。'
        : '这个来源不属于当前房间。',
      403,
    );
  }
  return source;
}

export function roomMemoryConversationId(roomValue, surfaceValue) {
  const roomId = room(roomValue);
  return sanitizeId(
    `coast-room:${roomId}:${participantSurface(roomId, surfaceValue)}`,
    'room_memory',
  );
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
  participantSurface(roomValue, surfaceValue);
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
  for (const source of roomSurfaces(roomId)) {
    ids[source] = await ensureRoomConversation(db, roomId, source);
  }
  return ids;
}

function ownerNoteFromSoil(soil) {
  return {
    label: '小寒侧 · 神秘狗话',
    text: String(soil?.current_text || ''),
    handwritten: true,
    priority: 'before_automatic_soil',
    becomes_long_term_memory: false,
    updated_at: soil?.updated_at || null,
  };
}

export async function listRoomMemory(db, roomValue) {
  const roomId = room(roomValue);
  const ids = await ensureRoomMemory(db, roomId);
  const sources = {};
  for (const source of roomSurfaces(roomId)) {
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
  return {
    room_id: roomId,
    participants: roomSurfaces(roomId),
    owner_note: ownerNoteFromSoil(sources.web_manual.soil),
    sources,
  };
}

export async function writeRoomMemory(db, roomValue, identityValue, value = {}) {
  const roomId = room(roomValue);
  const identity = validateCoastIdentity(identityValue);
  if (identity.surface === 'web_manual') {
    throw new MemoryStoreError(
      'owner_note_endpoint_required',
      '小寒侧 · 神秘狗话只能由屋主网页入口写入。',
      403,
    );
  }
  participantSurface(roomId, identity.surface);
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

export async function writeOwnerRoomNote(db, roomValue, value = {}) {
  const roomId = room(roomValue);
  const text = String(value.text || '').trim();
  if (text.length > 4000) {
    throw new MemoryStoreError(
      'owner_room_note_too_long',
      '神秘狗话最多可以写 4000 个字符。',
      413,
    );
  }
  const ids = await ensureRoomMemory(db, roomId);
  const soil = await writeSoil(db, ids.web_manual, {
    current_text: text,
    hand_seeds: [],
    do_not_repeat: '',
    pocket_candidates: [],
    organized_through_turn_id: '',
    manual_locked: true,
    auto_refresh_enabled: false,
  }, {
    automatic: false,
    provenance: {
      source_conversation_id: ids.web_manual,
    },
  });
  return ownerNoteFromSoil(soil);
}

export async function deleteOwnerRoomNote(db, roomValue) {
  return writeOwnerRoomNote(db, roomValue, { text: '' });
}

export async function buildRoomMemoryContext(env, roomValue, surfaceValue, query, options = {}) {
  const roomId = room(roomValue);
  const source = participantSurface(roomId, surfaceValue);
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
  const ownerNote = ownerNoteFromSoil(soils.web_manual);
  const ownerContext = ownerNote.text
    ? `【小寒侧 · 神秘狗话｜优先于模型自动滚动思维壤】\n${ownerNote.text}\n说明：这是小寒亲手写给本房间的当前理解与召回提示，不等同于已确认长期记忆。`
    : '';
  return {
    memory,
    context: [
      ownerContext,
      formatMemoryContext(memory, options.settings || {}),
    ].filter(Boolean).join('\n\n'),
    owner_note: ownerNote,
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

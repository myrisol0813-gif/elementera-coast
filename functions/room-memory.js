import { ensureChatSchema, sanitizeId } from './chat-store.js';
import {
  apiMyriIdentity,
  officialMcpIdentity,
  validateCoastIdentity,
} from './coast-identity.js';
import { dogtalkContext } from './dogtalk-store.js';
import { buildMemoryContext } from './memory-recall.js';
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
  writeSoilCurrentText,
} from './memory-store.js';

const ROOMS = new Set(['radio', 'lighthouse']);
const SURFACES = new Set(['web_manual', 'coast_api', 'official_mcp']);
const ROOM_PARTICIPANTS = Object.freeze({
  radio: Object.freeze(['web_manual', 'coast_api', 'official_mcp']),
  lighthouse: Object.freeze(['web_manual', 'official_mcp']),
});
const ROOM_MEMORY_SURFACES = Object.freeze({
  radio: Object.freeze(['coast_api', 'official_mcp']),
  lighthouse: Object.freeze(['official_mcp']),
});
const ROOM_META = Object.freeze({
  radio: Object.freeze({
    room_key: 'radio:main',
    title: '无线电波房',
    soil_label: '电波房思维壤',
    local_label: '电波房',
  }),
  lighthouse: Object.freeze({
    room_key: 'lighthouse:main',
    title: '灯塔来信房',
    soil_label: '灯塔来信思维壤',
    local_label: '灯塔来信',
  }),
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

function participants(roomValue) {
  return ROOM_PARTICIPANTS[room(roomValue)];
}

function memorySurfaces(roomValue) {
  return ROOM_MEMORY_SURFACES[room(roomValue)];
}

function participantSurface(roomValue, surfaceValue) {
  const roomId = room(roomValue);
  const source = surface(surfaceValue);
  if (!ROOM_PARTICIPANTS[roomId].includes(source)) {
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

function modelMemorySurface(roomValue, surfaceValue) {
  const roomId = room(roomValue);
  const source = participantSurface(roomId, surfaceValue);
  if (!ROOM_MEMORY_SURFACES[roomId].includes(source)) {
    throw new MemoryStoreError(
      'room_memory_surface_forbidden',
      '小寒的神秘狗话与模型房间思维壤彼此独立。',
      403,
    );
  }
  return source;
}

export function roomMemoryConversationId(roomValue, surfaceValue) {
  const roomId = room(roomValue);
  return sanitizeId(
    `coast-room:${roomId}:${modelMemorySurface(roomId, surfaceValue)}`,
    'room_memory',
  );
}

export function roomMemoryLibraryConversationId(roomValue) {
  const roomId = room(roomValue);
  return sanitizeId(`coast-room:${roomId}:library`, 'room_memory');
}

function sourceLabel(source) {
  return {
    coast_api: '海岸 API ✦',
    official_mcp: '官端灯塔侧 ≋',
  }[source] || source;
}

function sourceIdentity(record, source) {
  const model = {
    model_label: record?.model_label || '未标注模型',
    model_nickname: record?.model_nickname || null,
  };
  return source === 'official_mcp'
    ? officialMcpIdentity(model)
    : apiMyriIdentity(model);
}

function title(roomValue, surfaceValue) {
  return `${ROOM_META[roomValue].title} · ${sourceLabel(surfaceValue)}`;
}

async function ensureRoomConversation(db, roomValue, surfaceValue) {
  const roomId = room(roomValue);
  const source = modelMemorySurface(roomId, surfaceValue);
  await ensureChatSchema(db);
  const id = roomMemoryConversationId(roomId, source);
  const timestamp = Date.now();
  await db.prepare(`INSERT OR IGNORE INTO conversations (
    id, user_id, title, created_at, updated_at, deleted_at, title_manual,
    title_generated_at, title_model_id, archived_at, conversation_kind
  ) VALUES (?, 'owner', ?, ?, ?, NULL, 1, NULL, NULL, NULL, ?)`)
    .bind(id, title(roomId, source), timestamp, timestamp, roomId).run();
  await db.prepare(`INSERT OR IGNORE INTO conversation_states
    (conversation_id, state_json, updated_at) VALUES (?, ?, ?)`)
    .bind(id, JSON.stringify({ version: 4, updated_at: new Date(timestamp).toISOString(), turns: [] }), timestamp)
    .run();
  return id;
}

async function ensureRoomLibraryConversation(db, roomValue) {
  const roomId = room(roomValue);
  await ensureChatSchema(db);
  const id = roomMemoryLibraryConversationId(roomId);
  const timestamp = Date.now();
  await db.prepare(`INSERT OR IGNORE INTO conversations (
    id, user_id, title, created_at, updated_at, deleted_at, title_manual,
    title_generated_at, title_model_id, archived_at, conversation_kind
  ) VALUES (?, 'owner', ?, ?, ?, NULL, 1, NULL, NULL, NULL, ?)`)
    .bind(id, `${ROOM_META[roomId].title} · 共同库`, timestamp, timestamp, roomId).run();
  await db.prepare(`INSERT OR IGNORE INTO conversation_states
    (conversation_id, state_json, updated_at) VALUES (?, ?, ?)`)
    .bind(id, JSON.stringify({ version: 4, updated_at: new Date(timestamp).toISOString(), turns: [] }), timestamp)
    .run();
  return id;
}

export async function ensureRoomMemory(db, roomValue) {
  const roomId = room(roomValue);
  const ids = {};
  for (const source of memorySurfaces(roomId)) {
    ids[source] = await ensureRoomConversation(db, roomId, source);
  }
  await ensureRoomLibraryConversation(db, roomId);
  return ids;
}

function scopedRecord(record, roomId, source) {
  const identity = ROOM_MEMORY_SURFACES[roomId]?.includes(source)
    ? sourceIdentity(record, source)
    : null;
  return {
    ...record,
    ...(identity || {}),
    room_scope: roomId,
    room_key: ROOM_META[roomId].room_key,
    ...(record?.source_surface && record.source_surface !== source
      ? { origin_source_surface: record.source_surface }
      : {}),
    source_surface: source,
  };
}

export async function listRoomMemory(db, roomValue) {
  const roomId = room(roomValue);
  const ids = await ensureRoomMemory(db, roomId);
  const libraryConversationId = await ensureRoomLibraryConversation(db, roomId);
  const sources = {};
  for (const source of memorySurfaces(roomId)) {
    const conversationId = ids[source];
    const [soil, pendingPockets, stonePockets, archivedPockets, entries] = await Promise.all([
      readSoil(db, conversationId),
      listPockets(db, { conversation_id: conversationId, status: 'pending' }),
      listPockets(db, { conversation_id: conversationId, status: 'stone' }),
      listPockets(db, { conversation_id: conversationId, status: 'archived' }),
      listEntries(db, { conversation_id: conversationId, scope: 'conversation', limit: 100 }),
    ]);
    const projectedSoil = scopedRecord(soil, roomId, source);
    const activeEntries = entries.entries.filter((item) => !['stone', 'archived', 'discarded'].includes(item.status));
    const sealedEntries = entries.entries.filter((item) => ['stone', 'archived'].includes(item.status));
    sources[source] = {
      room_scope: roomId,
      room_key: ROOM_META[roomId].room_key,
      source_surface: source,
      source_label: projectedSoil.display_author,
      conversation_id: conversationId,
      soil: projectedSoil,
      pending_pockets: pendingPockets.map((item) => scopedRecord(item, roomId, source)),
      seeds: activeEntries.filter((item) => item.entry_type === 'seed')
        .map((item) => scopedRecord(item, roomId, source)),
      memories: activeEntries.filter((item) => item.entry_type === 'memory')
        .map((item) => scopedRecord(item, roomId, source)),
      stones: [
        ...sealedEntries,
        ...stonePockets,
        ...archivedPockets,
      ].map((item) => scopedRecord(item, roomId, source)),
    };
  }
  const [libraryEntries, globalEntries] = await Promise.all([
    listEntries(db, { scope: 'conversation', conversation_id: libraryConversationId, limit: 100 }),
    listEntries(db, { scope: 'global', limit: 100 }),
  ]);
  const sourceEntries = Object.values(sources).flatMap((value) => [...value.seeds, ...value.memories]);
  const sourceStones = Object.values(sources).flatMap((value) => value.stones);
  const activeLibraryEntries = libraryEntries.entries
    .filter((item) => !['stone', 'archived', 'discarded'].includes(item.status));
  const sealedLibraryEntries = libraryEntries.entries
    .filter((item) => ['stone', 'archived'].includes(item.status));
  const globalActive = globalEntries.entries
    .filter((item) => !['stone', 'archived', 'discarded'].includes(item.status));
  const globalSealed = globalEntries.entries
    .filter((item) => ['stone', 'archived'].includes(item.status));
  return {
    room_id: roomId,
    room_scope: roomId,
    room_key: ROOM_META[roomId].room_key,
    title: ROOM_META[roomId].title,
    soil_label: ROOM_META[roomId].soil_label,
    local_label: ROOM_META[roomId].local_label,
    participants: participants(roomId),
    library_conversation_id: libraryConversationId,
    sources,
    pending_pockets: Object.values(sources).flatMap((value) => value.pending_pockets),
    seeds: [
      ...activeLibraryEntries.filter((item) => item.entry_type === 'seed')
        .map((item) => scopedRecord(item, roomId, 'room_shared')),
      ...sourceEntries.filter((item) => item.entry_type === 'seed'),
    ],
    memories: [
      ...activeLibraryEntries.filter((item) => item.entry_type === 'memory')
        .map((item) => scopedRecord(item, roomId, 'room_shared')),
      ...sourceEntries.filter((item) => item.entry_type === 'memory'),
    ],
    stones: [
      ...sealedLibraryEntries.map((item) => scopedRecord(item, roomId, 'room_shared')),
      ...sourceStones,
    ],
    global: {
      seeds: globalActive.filter((item) => item.entry_type === 'seed'),
      memories: globalActive.filter((item) => item.entry_type === 'memory'),
      stones: globalSealed,
    },
  };
}

export async function writeRoomMemory(db, roomValue, identityValue, value = {}) {
  const roomId = room(roomValue);
  const identity = validateCoastIdentity(identityValue);
  const source = modelMemorySurface(roomId, identity.surface);
  const conversationId = await ensureRoomConversation(db, roomId, source);
  const current = await readSoil(db, conversationId);
  if (value.tool_call_id && current.tool_call_id === value.tool_call_id) {
    return {
      room_scope: roomId,
      room_key: ROOM_META[roomId].room_key,
      source_surface: source,
      conversation_id: conversationId,
      soil: scopedRecord(current, roomId, source),
      pockets: { created: 0, updated: 0, suppressed: 0, pockets: [] },
      idempotent: true,
    };
  }
  const soil = await writeSoil(db, conversationId, {
    current_text: value.current_text,
    hand_seeds: value.hand_seeds,
    do_not_repeat: value.do_not_repeat,
    pocket_candidates: value.pocket_candidates,
    organized_through_turn_id: value.organized_through_turn_id,
    manual_locked: false,
    auto_refresh_enabled: true,
  }, {
    automatic: true,
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
  return {
    room_scope: roomId,
    room_key: ROOM_META[roomId].room_key,
    source_surface: source,
    conversation_id: conversationId,
    soil: scopedRecord(soil, roomId, source),
    pockets,
  };
}

export async function writeLighthouseRoomSoil(db, identityValue, value = {}) {
  const roomId = 'lighthouse';
  const identity = validateCoastIdentity(identityValue);
  const source = modelMemorySurface(roomId, identity.surface);
  let conversationId;
  try {
    conversationId = await ensureRoomConversation(db, roomId, source);
    await readSoil(db, conversationId);
  } catch (error) {
    throw new MemoryStoreError(
      'lighthouse_room_init_failed',
      '灯塔来信房思维壤初始化失败。',
      500,
    );
  }
  try {
    const { soil, idempotent } = await writeSoilCurrentText(
      db,
      conversationId,
      { current_text: value.current_text },
      {
        provenance: {
          identity,
          source_conversation_id: value.source_conversation_id || conversationId,
          source_turn_id: value.source_turn_id,
          tool_call_id: value.tool_call_id,
        },
      },
    );
    return {
      room_scope: roomId,
      room_key: ROOM_META[roomId].room_key,
      source_surface: source,
      conversation_id: conversationId,
      soil: scopedRecord(soil, roomId, source),
      idempotent,
    };
  } catch (error) {
    if (error instanceof MemoryStoreError && error.type === 'invalid_request') throw error;
    if (error instanceof MemoryStoreError && error.type === 'room_soil_write_failed') throw error;
    throw new MemoryStoreError(
      'room_soil_write_failed',
      '灯塔来信房思维壤写入失败。',
      500,
    );
  }
}

function uniqueEntries(groups, key) {
  const seen = new Set();
  return groups.flatMap((group) => group[key] || []).filter((entry) => {
    if (seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  });
}

export async function buildRoomMemoryContext(env, roomValue, surfaceValue, query, options = {}) {
  const roomId = room(roomValue);
  const source = modelMemorySurface(roomId, surfaceValue);
  const ids = await ensureRoomMemory(env.COAST_CHAT_DB, roomId);
  const libraryConversationId = await ensureRoomLibraryConversation(env.COAST_CHAT_DB, roomId);
  const orderedSources = [
    source,
    ...memorySurfaces(roomId).filter((item) => item !== source),
  ];
  const sharedMemory = await buildMemoryContext(
    env,
    MEMORY_OWNER_ID,
    libraryConversationId,
    query,
    {
      ...options,
      include_global: true,
    },
  );
  const sourceMemories = [];
  for (const sourceName of orderedSources) {
    sourceMemories.push(await buildMemoryContext(
      env,
      MEMORY_OWNER_ID,
      ids[sourceName],
      query,
      {
        ...options,
        include_global: false,
      },
    ));
  }
  const memories = [sharedMemory, ...sourceMemories];
  const soils = {};
  for (const [sourceName, conversationId] of Object.entries(ids)) {
    soils[sourceName] = scopedRecord(
      await readSoil(env.COAST_CHAT_DB, conversationId),
      roomId,
      sourceName,
    );
  }
  const memory = {
    conversation_seeds: uniqueEntries(memories, 'conversation_seeds'),
    conversation_memories: uniqueEntries(memories, 'conversation_memories'),
    conversation_pockets: uniqueEntries(memories, 'conversation_pockets'),
    global_seeds: sharedMemory.global_seeds || [],
    global_memories: sharedMemory.global_memories || [],
    global_pockets: sharedMemory.global_pockets || [],
    selected_ids: [...new Set(memories.flatMap((item) => item.selected_ids || []))],
    vector_enabled: memories.some((item) => item.vector_enabled),
  };
  let dogtalk = { context: '', selected: false };
  try {
    dogtalk = await dogtalkContext(
      env.COAST_CHAT_DB,
      { room_scope: roomId },
      query,
      { consume_direct: options.consume_dogtalk !== false },
    );
  } catch (error) {
    console.warn('[room-dogtalk:recall]', String(error?.message || error).slice(0, 160));
  }
  return {
    room_scope: roomId,
    room_key: ROOM_META[roomId].room_key,
    memory,
    dogtalk_selected: dogtalk.selected,
    dogtalk,
    source_soils: soils,
  };
}

export async function resolveRoomPocketByOwner(db, roomValue, pocketId, value = {}) {
  const roomId = room(roomValue);
  const ids = await ensureRoomMemory(db, roomId);
  const pocket = await getPocket(db, pocketId);
  const source = Object.entries(ids).find(([, id]) => id === pocket.conversation_id)?.[0];
  if (!source) {
    throw new MemoryStoreError('room_pocket_not_found', '这条待确认内容不属于当前房间。', 404);
  }
  const action = String(value.action || '');
  const roomDestination = action.match(/^(radio|lighthouse)_(seed|memory)$/);
  const currentDestination = action.match(/^current_(seed|memory)$/);
  let resolvedValue = { ...value };
  if (roomDestination) {
    const targetRoom = roomDestination[1];
    resolvedValue = {
      ...value,
      action: `conversation_${roomDestination[2]}`,
      target_conversation_id: await ensureRoomLibraryConversation(db, targetRoom),
    };
  } else if (currentDestination) {
    resolvedValue = {
      ...value,
      action: `conversation_${currentDestination[1]}`,
      target_conversation_id: sanitizeId(value.current_conversation_id || '', 'conversation'),
    };
  } else if (['conversation_seed', 'conversation_memory'].includes(action)) {
    resolvedValue = {
      ...value,
      target_conversation_id: await ensureRoomLibraryConversation(db, roomId),
    };
  }
  const result = await resolvePocket(db, pocket.id, resolvedValue);
  return {
    ...result,
    room_scope: roomId,
    room_key: ROOM_META[roomId].room_key,
    source_surface: source,
  };
}

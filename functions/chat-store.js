import { ensureChatSchema as ensureSchema } from './chat-schema.js';

const USER_ID = 'owner';
const MAX_CONTENT = 12000;
const MAX_AVATAR = 500 * 1024;
const DEFAULT_TITLES = new Set(['', '新聊天', '未命名海岸', '主聊天']);

export class ChatStoreError extends Error {
  constructor(type, message, status = 400) {
    super(message);
    this.name = 'ChatStoreError';
    this.type = type;
    this.status = status;
  }
}

export function hasChatDatabase(env) {
  return Boolean(env?.COAST_CHAT_DB && typeof env.COAST_CHAT_DB.prepare === 'function');
}

export function sanitizeId(value, fallback = 'id') {
  const clean = String(value || '').replace(/[^\w:.-]/g, '_').slice(0, 160);
  return clean || `${fallback}_${crypto.randomUUID()}`;
}

export function sanitizeTitle(value, fallback = '新聊天') {
  const clean = String(value || '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/["“”'。.!！?？]+$/g, '')
    .trim()
    .slice(0, 40);
  return clean || fallback;
}

export function isDefaultTitle(value) {
  return DEFAULT_TITLES.has(String(value || '').trim());
}

function nowMs() {
  return Date.now();
}

function iso(value) {
  const timestamp = Number(value || 0);
  return Number.isFinite(timestamp) && timestamp > 0
    ? new Date(timestamp).toISOString()
    : new Date().toISOString();
}

function clip(value, max = MAX_CONTENT) {
  return String(value ?? '').slice(0, max);
}

function clamp(value, length) {
  return length < 1 ? 0 : Math.min(Math.max(0, Number(value) || 0), length - 1);
}

async function run(db, sql, params = []) {
  return db.prepare(sql).bind(...params).run();
}

async function first(db, sql, params = []) {
  return db.prepare(sql).bind(...params).first();
}

async function all(db, sql, params = []) {
  const result = await db.prepare(sql).bind(...params).all();
  return result?.results || [];
}

export async function ensureChatSchema(db) {
  return ensureSchema(db, normalizeState);
}

function conversationFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title || '新聊天',
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
    deleted_at: row.deleted_at ? iso(row.deleted_at) : null,
    title_manual: Number(row.title_manual || 0) === 1,
    title_generated_at: row.title_generated_at ? iso(row.title_generated_at) : null,
  };
}

function normalizeVariant(value = {}, prefix = 'variant') {
  if (typeof value?.content !== 'string') return null;
  const errorDetail = String(value.errorDetail || '')
    .split('\n')
    .filter((line) => !/^history sync:/i.test(line.trim()))
    .join('\n')
    .trim()
    .slice(0, MAX_CONTENT);
  return {
    id: sanitizeId(value.id || crypto.randomUUID(), prefix),
    content: clip(value.content),
    created_at: typeof value.created_at === 'string' ? value.created_at : new Date().toISOString(),
    liked: Boolean(value.liked),
    favorite: Boolean(value.favorite),
    ...(errorDetail ? { errorDetail } : {}),
  };
}

function normalizeTurn(value = {}) {
  const userVariants = (Array.isArray(value?.user?.variants) ? value.user.variants : [])
    .map((variant) => normalizeVariant(variant, 'user_variant'))
    .filter(Boolean)
    .slice(0, 20);
  const branchCount = Math.max(1, userVariants.length);
  const variantsByUserVariant = {};
  const activeByUserVariant = {};

  for (let index = 0; index < branchCount; index += 1) {
    const key = String(index);
    const assistants = Array.isArray(value?.assistant?.variantsByUserVariant?.[key])
      ? value.assistant.variantsByUserVariant[key]
      : [];
    variantsByUserVariant[key] = assistants
      .map((variant) => normalizeVariant(variant, 'assistant_variant'))
      .filter(Boolean)
      .slice(0, 20);
    activeByUserVariant[key] = clamp(
      value?.assistant?.activeByUserVariant?.[key],
      variantsByUserVariant[key].length || 1,
    );
  }

  return {
    id: sanitizeId(value.id || crypto.randomUUID(), 'turn'),
    user: {
      active: clamp(value?.user?.active, userVariants.length || 1),
      variants: userVariants,
    },
    assistant: { activeByUserVariant, variantsByUserVariant },
  };
}

export function normalizeState(value = {}) {
  const raw = value?.history || value || {};
  const turns = (Array.isArray(raw.turns) ? raw.turns : [])
    .map(normalizeTurn)
    .filter((turn) => turn.user.variants.length || Object.values(turn.assistant.variantsByUserVariant).some((list) => list.length))
    .slice(-100);
  return {
    version: 4,
    updated_at: typeof raw.updated_at === 'string' ? raw.updated_at : new Date().toISOString(),
    turns,
  };
}

export function flatMessagesToState(messages = []) {
  const turns = [];
  let current = null;
  for (const message of Array.isArray(messages) ? messages.slice(-200) : []) {
    if (!message || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string') continue;
    const variant = normalizeVariant(message, `${message.role}_variant`);
    if (message.role === 'user') {
      current = {
        id: sanitizeId(`turn_${variant.id}`, 'turn'),
        user: { active: 0, variants: [variant] },
        assistant: { activeByUserVariant: { 0: 0 }, variantsByUserVariant: { 0: [] } },
      };
      turns.push(current);
    } else if (current) {
      current.assistant.variantsByUserVariant['0'].push(variant);
    }
  }
  return normalizeState({ turns });
}

function normalizeStringList(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === 'string').map((item) => item.slice(0, 180)).slice(0, 60)
    : [];
}

export function normalizeProfile(value = {}) {
  const avatar = clip(value.assistant_avatar_dataurl ?? value.assistantAvatarDataUrl ?? '', MAX_AVATAR + 1);
  if (avatar.length > MAX_AVATAR) {
    throw new ChatStoreError('profile_avatar_too_large', '头像数据过大，未写入服务器。', 413);
  }
  const modelBox = value.model_box || value.modelBox || {};
  return {
    assistant_avatar_dataurl: avatar,
    current_chat_model: clip(value.current_chat_model ?? value.currentChatModel ?? '', 180),
    current_image_model: clip(value.current_image_model ?? value.currentImageModel ?? '', 180),
    model_box: {
      chat: normalizeStringList(modelBox.chat),
      free: normalizeStringList(modelBox.free),
      image: normalizeStringList(modelBox.image),
    },
  };
}

function emptyProfile() {
  return {
    assistant_avatar_dataurl: '',
    current_chat_model: '',
    current_image_model: '',
    model_box: { chat: [], free: [], image: [] },
  };
}

export async function readProfile(db) {
  await ensureChatSchema(db);
  const row = await first(db, `SELECT assistant_avatar_dataurl, current_chat_model, current_image_model, model_box_json
    FROM chat_profiles WHERE user_id = ?`, [USER_ID]);
  if (!row) return emptyProfile();
  let modelBox = {};
  try {
    modelBox = JSON.parse(row.model_box_json || '{}');
  } catch {
    modelBox = {};
  }
  return normalizeProfile({
    assistant_avatar_dataurl: row.assistant_avatar_dataurl || '',
    current_chat_model: row.current_chat_model || '',
    current_image_model: row.current_image_model || '',
    model_box: modelBox,
  });
}

export async function writeProfile(db, value) {
  await ensureChatSchema(db);
  const profile = normalizeProfile(value || {});
  const timestamp = nowMs();
  await run(db, `INSERT INTO chat_profiles (
      user_id, assistant_avatar_dataurl, current_chat_model, current_image_model, model_box_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      assistant_avatar_dataurl = excluded.assistant_avatar_dataurl,
      current_chat_model = excluded.current_chat_model,
      current_image_model = excluded.current_image_model,
      model_box_json = excluded.model_box_json,
      updated_at = excluded.updated_at`, [
    USER_ID,
    profile.assistant_avatar_dataurl || null,
    profile.current_chat_model || null,
    profile.current_image_model || null,
    JSON.stringify(profile.model_box),
    timestamp,
  ]);
  return profile;
}

async function conversationRow(db, conversationId) {
  return first(db, `SELECT id, title, created_at, updated_at, deleted_at, title_manual, title_generated_at
    FROM conversations WHERE id = ? AND user_id = ?`, [conversationId, USER_ID]);
}

async function requireActiveConversation(db, conversationId) {
  const row = await conversationRow(db, conversationId);
  if (!row) throw new ChatStoreError('conversation_not_found', '聊天窗口不存在。', 404);
  if (row.deleted_at) throw new ChatStoreError('conversation_deleted', '这个聊天窗口已经删除。', 410);
  return row;
}

export async function getConversation(db, id) {
  await ensureChatSchema(db);
  return conversationFromRow(await requireActiveConversation(db, sanitizeId(id, 'conversation')));
}

export async function listConversations(db) {
  await ensureChatSchema(db);
  const rows = await all(db, `SELECT id, title, created_at, updated_at, deleted_at, title_manual, title_generated_at
    FROM conversations
    WHERE user_id = ? AND deleted_at IS NULL
    ORDER BY updated_at DESC, created_at DESC`, [USER_ID]);
  return rows.map(conversationFromRow);
}

export async function createConversation(db, title = '新聊天') {
  await ensureChatSchema(db);
  const timestamp = nowMs();
  const id = sanitizeId(crypto.randomUUID(), 'conversation');
  const cleanTitle = sanitizeTitle(title);
  await run(db, `INSERT INTO conversations (
    id, user_id, title, created_at, updated_at, deleted_at, title_manual, title_generated_at
  ) VALUES (?, ?, ?, ?, ?, NULL, 0, NULL)`, [id, USER_ID, cleanTitle, timestamp, timestamp]);
  await writeStateRow(db, id, normalizeState(), timestamp);
  return conversationFromRow({
    id,
    title: cleanTitle,
    created_at: timestamp,
    updated_at: timestamp,
    deleted_at: null,
    title_manual: 0,
    title_generated_at: null,
  });
}

export async function renameConversation(db, id, title) {
  await ensureChatSchema(db);
  const conversationId = sanitizeId(id, 'conversation');
  await requireActiveConversation(db, conversationId);
  const timestamp = nowMs();
  await run(db, `UPDATE conversations
    SET title = ?, title_manual = 1, updated_at = ?
    WHERE id = ? AND user_id = ? AND deleted_at IS NULL`, [
    sanitizeTitle(title), timestamp, conversationId, USER_ID,
  ]);
  return conversationFromRow(await requireActiveConversation(db, conversationId));
}

export async function setGeneratedTitle(db, id, title) {
  await ensureChatSchema(db);
  const conversationId = sanitizeId(id, 'conversation');
  await requireActiveConversation(db, conversationId);
  const timestamp = nowMs();
  await run(db, `UPDATE conversations
    SET title = ?, title_generated_at = ?, updated_at = ?
    WHERE id = ? AND user_id = ? AND deleted_at IS NULL
      AND (title_manual IS NULL OR title_manual != 1)
      AND title_generated_at IS NULL`, [
    sanitizeTitle(title), timestamp, timestamp, conversationId, USER_ID,
  ]);
  return conversationFromRow(await requireActiveConversation(db, conversationId));
}

export async function deleteConversation(db, id) {
  await ensureChatSchema(db);
  const conversationId = sanitizeId(id, 'conversation');
  const row = await conversationRow(db, conversationId);
  if (!row) throw new ChatStoreError('conversation_not_found', '聊天窗口不存在。', 404);
  if (row.deleted_at) return conversationFromRow(row);
  const timestamp = nowMs();
  await run(db, `UPDATE conversations SET deleted_at = ?, updated_at = ?
    WHERE id = ? AND user_id = ? AND deleted_at IS NULL`, [timestamp, timestamp, conversationId, USER_ID]);
  return conversationFromRow(await conversationRow(db, conversationId));
}

async function writeStateRow(db, conversationId, state, timestamp = nowMs()) {
  await run(db, `INSERT INTO conversation_states (conversation_id, state_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(conversation_id) DO UPDATE SET
      state_json = excluded.state_json,
      updated_at = excluded.updated_at`, [conversationId, JSON.stringify(normalizeState(state)), timestamp]);
}

export async function readConversationState(db, id) {
  await ensureChatSchema(db);
  const conversationId = sanitizeId(id, 'conversation');
  await requireActiveConversation(db, conversationId);
  const row = await first(db, 'SELECT state_json, updated_at FROM conversation_states WHERE conversation_id = ?', [conversationId]);
  if (!row?.state_json) {
    throw new ChatStoreError('conversation_state_missing', '聊天记录不存在，未创建替代数据。', 500);
  }
  try {
    return normalizeState(JSON.parse(row.state_json));
  } catch {
    throw new ChatStoreError('conversation_state_corrupt', '聊天记录格式损坏，未覆盖原数据。', 500);
  }
}

export async function writeConversationState(db, id, value) {
  await ensureChatSchema(db);
  const conversationId = sanitizeId(id, 'conversation');
  await requireActiveConversation(db, conversationId);
  const state = normalizeState(value);
  const timestamp = nowMs();
  await writeStateRow(db, conversationId, state, timestamp);
  await run(db, `UPDATE conversations SET updated_at = ?
    WHERE id = ? AND user_id = ? AND deleted_at IS NULL`, [timestamp, conversationId, USER_ID]);
  state.updated_at = iso(timestamp);
  return state;
}

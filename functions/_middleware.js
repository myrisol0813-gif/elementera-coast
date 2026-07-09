import { onRequest as legacyOnRequest } from "./_middleware.full.js";

const USER_ID = "owner";
const DEFAULT_CONVERSATION_ID = "main";
const OLD_HISTORY_KEY = "chat:main:v1";
const HISTORY_BODY_LIMIT_BYTES = 2 * 1024 * 1024;
const HISTORY_MAX_MESSAGES = 200;
const HISTORY_MAX_TURNS = 100;
const HISTORY_MAX_CONTENT_CHARS = 12000;
const HISTORY_MAX_BRANCH_VARIANTS = 20;
const HISTORY_MAX_AVATAR_CHARS = 500 * 1024;
const DEFAULT_TITLES = new Set(["", "新聊天", "未命名海岸", "主聊天"]);

const historyDecoder = new TextDecoder();

function historyHeaders(extra = {}) {
  return {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    ...extra,
  };
}
function historyJson(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: historyHeaders({ "Content-Type": "application/json; charset=UTF-8", ...headers }),
  });
}
function historyError(type, message, status = 400) {
  return historyJson({ ok: false, error: { type, message } }, status);
}
function getOrigin(request) {
  return new URL(request.url).origin;
}
function sameSiteMutation(request) {
  const requestOrigin = getOrigin(request);
  const origin = request.headers.get("Origin");
  if (origin) return origin === requestOrigin;
  const referer = request.headers.get("Referer");
  if (!referer) return false;
  try { return new URL(referer).origin === requestOrigin; }
  catch { return false; }
}
async function readHistoryText(request) {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > HISTORY_BODY_LIMIT_BYTES) {
      const error = new Error("body_too_large");
      error.status = 413;
      throw error;
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return historyDecoder.decode(merged);
}
async function readHistoryJson(request) {
  const text = await readHistoryText(request);
  if (!text.trim()) return {};
  return JSON.parse(text);
}
function nowMs() { return Date.now(); }
function isoFromMs(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0 ? new Date(n).toISOString() : new Date().toISOString();
}
function cleanText(value) { return String(value || "").slice(0, HISTORY_MAX_CONTENT_CHARS); }
function cleanId(value, prefix = "id") {
  const raw = String(value || "");
  const safe = raw.replace(/[^\w:.-]/g, "_").slice(0, 160);
  return safe || `${prefix}_${crypto.randomUUID()}`;
}
function conversationIdFromUrl(url) {
  return cleanId(url.searchParams.get("conversation_id") || DEFAULT_CONVERSATION_ID, "conversation");
}
function chatStoreKey(conversationId) {
  return `chat:conversation:${cleanId(conversationId, "conversation")}:v1`;
}
function cleanTitle(value, fallback = "新聊天") {
  const title = String(value || "").replace(/[\r\n\t]+/g, " ").replace(/["“”'。.!！?？]+$/g, "").trim().slice(0, 40);
  return title || fallback;
}\nfunction defaultTitle(value) { return DEFAULT_TITLES.has(String(value || "").trim()); }
function cleanVariant(variant, prefix = "variant") {
  if (!variant || typeof variant.content !== "string") return null;
  return {
    id: cleanId(variant.id || crypto.randomUUID(), prefix),
    content: cleanText(variant.content),
    ...(typeof variant.created_at === "string" ? { created_at: variant.created_at } : { created_at: new Date().toISOString() }),
    ...(typeof variant.errorDetail === "string" && variant.errorDetail ? { errorDetail: cleanText(variant.errorDetail) } : {}),
  };
}
function normalizeHistoryMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((message) => message && (message.role === "user" || message.role === "assistant") && typeof message.content === "string")
    .slice(-HISTORY_MAX_MESSAGES)
    .map((message) => ({
      id: cleanId(message.id || crypto.randomUUID(), "message"),
      role: message.role,
      content: cleanText(message.content),
      ...(typeof message.created_at === "string" ? { created_at: message.created_at } : { created_at: new Date().toISOString() }),
      ...(typeof message.errorDetail === "string" && message.errorDetail ? { errorDetail: cleanText(message.errorDetail) } : {}),
    }));
}
function flatMessagesToTurns(messages) {
  const turns = [];
  let current = null;
  for (const message of normalizeHistoryMessages(messages)) {
    if (message.role === "user") {
      current = {
        id: cleanId(`turn_${message.id || crypto.randomUUID()}`, "turn"),
        user: { active: 0, variants: [{ id: message.id, content: message.content, created_at: message.created_at }] },
        assistant: { activeByUserVariant: { "0": 0 }, variantsByUserVariant: { "0": [] } },
      };
      turns.push(current);
    } else if (current) {
      current.assistant.variantsByUserVariant["0"].push({ id: message.id, content: message.content, created_at: message.created_at, ...(message.errorDetail ? { errorDetail: message.errorDetail } : {}) });
    } else {
      turns.push({
        id: cleanId(`turn_${message.id || crypto.randomUUID()}`, "turn"),
        user: { active: 0, variants: [] },
        assistant: { activeByUserVariant: { "0": 0 }, variantsByUserVariant: { "0": [{ id: message.id, content: message.content, created_at: message.created_at, ...(message.errorDetail ? { errorDetail: message.errorDetail } : {}) }] } },
      });
    }
  }
  return normalizeHistoryTurns(turns);
}
function C(n, len) {
  n = +n || 0;
  return len < 1 ? 0 : Math.min(Math.max(0, n), len - 1);
}
function normalizeHistoryTurns(turns) {
  if (!Array.isArray(turns)) return [];
  return turns.slice(-HISTORY_MAX_TURNS).map((turn) => {
    const userVariants = Array.isArray(turn?.user?.variants) ? turn.user.variants.map((variant) => cleanVariant(variant, "user_variant")).filter(Boolean).slice(0, HISTORY_MAX_BRANCH_VARIANTS) : [];
    let userActive = Number(turn?.user?.active || 0);
    if (!Number.isFinite(userActive)) userActive = 0;
    userActive = Math.min(Math.max(0, userActive), Math.max(0, userVariants.length - 1));
    const rawVariants = turn?.assistant?.variantsByUserVariant || {};
    const variantsByUserVariant = {};
    const activeByUserVariant = {};
    const branchCount = Math.max(1, userVariants.length);
    for (let index = 0; index < branchCount; index += 1) {
      const key = String(index);
      const list = Array.isArray(rawVariants[key]) ? rawVariants[key].map((variant) => cleanVariant(variant, "assistant_variant")).filter(Boolean).slice(0, HISTORY_MAX_BRANCH_VARIANTS) : [];
      variantsByUserVariant[key] = list;
      let active = Number(turn?.assistant?.activeByUserVariant?.[key] || 0);
      if (!Number.isFinite(active)) active = 0;
      activeByUserVariant[key] = Math.min(Math.max(0, active), Math.max(0, list.length - 1));
    }
    return {
      id: cleanId(turn?.id || crypto.randomUUID(), "turn"),
      user: { active: userActive, variants: userVariants },
      assistant: { activeByUserVariant, variantsByUserVariant },
    };
  }).filter((turn) => turn.user.variants.length || Object.values(turn.assistant.variantsByUserVariant).some((list) => list.length));
}
function cleanString(value, max = 12000) { return typeof value === "string" ? value.slice(0, max) : ""; }
function cleanModelIdList(value) { return Array.isArray(value) ? value.filter((item) => typeof item === "string").map((item) => item.slice(0, 180)).slice(0, 60) : []; }
function normalizeProfile(profile = {}) {
  const avatar = cleanString(profile.assistant_avatar_dataurl ?? profile.assistantAvatarDataUrl ?? "", HISTORY_MAX_AVATAR_CHARS + 1);
  if (avatar.length > HISTORY_MAX_AVATAR_CHARS) {
    const error = new Error("profile_avatar_too_large");
    error.status = 413;
    throw error;
  }
  const modelBox = profile.model_box || profile.modelBox || {};
  const cleanBox = modelBox && typeof modelBox === "object" ? {
    chat: cleanModelIdList(modelBox.chat),
    free: cleanModelIdList(modelBox.free),
    image: cleanModelIdList(modelBox.image),
  } : { chat: [], free: [], image: [] };
  return {
    assistant_avatar_dataurl: avatar,
    current_chat_model: cleanString(profile.current_chat_model ?? profile.currentChatModel ?? "", 180),
    current_image_model: cleanString(profile.current_image_model ?? profile.currentImageModel ?? "", 180),
    model_box: cleanBox,
  };
}
function emptyProfile() {
  return { assistant_avatar_dataurl: "", current_chat_model: "", current_image_model: "", model_box: { chat: [], free: [], image: [] } };
}
function historyFromBody(body) {
  let profile = emptyProfile();
  try { profile = normalizeProfile(body.profile || body.history?.profile || {}); }
  catch (error) { throw error; }
  const turns = normalizeHistoryTurns(body.turns || body.history?.turns || []);
  if (turns.length) return { v: 2, updated_at: new Date().toISOString(), turns, profile };
  const messages = normalizeHistoryMessages(body.messages || body.history?.messages || []);
  return { v: 2, updated_at: new Date().toISOString(), turns: flatMessagesToTurns(messages), messages, profile };
}
function configuredStore(env) { return env && env.COAST_CHAT_STORE && typeof env.COAST_CHAT_STORE.get === "function" && typeof env.COAST_CHAT_STORE.put === "function"; }
function configuredDb(env) { return env && env.COAST_CHAT_DB && typeof env.COAST_CHAT_DB.prepare === "function"; }
async function run(db, sql, params = []) { return db.prepare(sql).bind(...params).run(); }
async function all(db, sql, params = []) { const result = await db.prepare(sql).bind(...params).all(); return result?.results || []; }
async function first(db, sql, params = []) { return db.prepare(sql).bind(...params).first(); }
async function tryRun(db, sql) { try { await db.prepare(sql).run(); } catch {} }
async function ensureD1Schema(db) {
  await tryRun(db, `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`);
  await tryRun(db, `CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT DEFAULT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER DEFAULT NULL, title_manual INTEGER DEFAULT 0, title_generated_at INTEGER DEFAULT NULL, archived_at INTEGER DEFAULT NULL, FOREIGN KEY (user_id) REFERENCES users(id))`);
  await tryRun(db, `CREATE TABLE IF NOT EXISTS turns (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, position INTEGER NOT NULL, active_user_variant_id TEXT DEFAULT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER DEFAULT NULL, FOREIGN KEY (conversation_id) REFERENCES conversations(id))`);
  await tryRun(db, `CREATE TABLE IF NOT EXISTS user_variants (id TEXT PRIMARY KEY, turn_id TEXT NOT NULL, position INTEGER NOT NULL, content TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER DEFAULT NULL, FOREIGN KEY (turn_id) REFERENCES turns(id))`);
  await tryRun(db, `CREATE TABLE IF NOT EXISTS assistant_variants (id TEXT PRIMARY KEY, turn_id TEXT NOT NULL, user_variant_id TEXT DEFAULT NULL, user_variant_position INTEGER NOT NULL, position INTEGER NOT NULL, content TEXT NOT NULL, error_detail TEXT DEFAULT NULL, is_active INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER DEFAULT NULL, FOREIGN KEY (turn_id) REFERENCES turns(id), FOREIGN KEY (user_variant_id) REFERENCES user_variants(id))`);
  await tryRun(db, `CREATE TABLE IF NOT EXISTS chat_profiles (user_id TEXT PRIMARY KEY, assistant_avatar_dataurl TEXT DEFAULT NULL, current_chat_model TEXT DEFAULT NULL, current_image_model TEXT DEFAULT NULL, model_box_json TEXT DEFAULT NULL, updated_at INTEGER NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id))`);
  const migrations = [
    `ALTER TABLE users ADD COLUMN created_at INTEGER`, `ALTER TABLE users ADD COLUMN updated_at INTEGER`,
    `ALTER TABLE conversations ADD COLUMN user_id TEXT`, `ALTER TABLE conversations ADD COLUMN title TEXT`, `ALTER TABLE conversations ADD COLUMN created_at INTEGER`, `ALTER TABLE conversations ADD COLUMN updated_at INTEGER`, `ALTER TABLE conversations ADD COLUMN deleted_at INTEGER`, `ALTER TABLE conversations ADD COLUMN title_manual INTEGER DEFAULT 0`, `ALTER TABLE conversations ADD COLUMN title_generated_at INTEGER DEFAULT NULL`, `ALTER TABLE conversations ADD COLUMN archived_at INTEGER DEFAULT NULL`,
    `ALTER TABLE turns ADD COLUMN conversation_id TEXT`, `ALTER TABLE turns ADD COLUMN position INTEGER`, `ALTER TABLE turns ADD COLUMN active_user_variant_id TEXT`, `ALTER TABLE turns ADD COLUMN created_at INTEGER`, `ALTER TABLE turns ADD COLUMN updated_at INTEGER`, `ALTER TABLE turns ADD COLUMN deleted_at INTEGER`,
    `ALTER TABLE user_variants ADD COLUMN turn_id TEXT`, `ALTER TABLE user_variants ADD COLUMN position INTEGER`, `ALTER TABLE user_variants ADD COLUMN content TEXT`, `ALTER TABLE user_variants ADD COLUMN created_at INTEGER`, `ALTER TABLE user_variants ADD COLUMN updated_at INTEGER`, `ALTER TABLE user_variants ADD COLUMN deleted_at INTEGER`,
    `ALTER TABLE assistant_variants ADD COLUMN turn_id TEXT`, `ALTER TABLE assistant_variants ADD COLUMN user_variant_id TEXT`, `ALTER TABLE assistant_variants ADD COLUMN user_variant_position INTEGER`, `ALTER TABLE assistant_variants ADD COLUMN position INTEGER`, `ALTER TABLE assistant_variants ADD COLUMN content TEXT`, `ALTER TABLE assistant_variants ADD COLUMN error_detail TEXT`, `ALTER TABLE assistant_variants ADD COLUMN is_active INTEGER NOT NULL DEFAULT 0`, `ALTER TABLE assistant_variants ADD COLUMN created_at INTEGER`, `ALTER TABLE assistant_variants ADD COLUMN updated_at INTEGER`, `ALTER TABLE assistant_variants ADD COLUMN deleted_at INTEGER`,
  ];
  for (const sql of migrations) await tryRun(db, sql);
  await tryRun(db, `CREATE INDEX IF NOT EXISTS idx_conversations_owner_updated ON conversations(user_id, deleted_at, updated_at)`);
  await tryRun(db, `CREATE INDEX IF NOT EXISTS idx_turns_conversation_position ON turns(conversation_id, position)`);
  await tryRun(db, `CREATE INDEX IF NOT EXISTS idx_user_variants_turn_position ON user_variants(turn_id, position)`);
  await tryRun(db, `CREATE INDEX IF NOT EXISTS idx_assistant_variants_turn_branch_position ON assistant_variants(turn_id, user_variant_position, position)`);
}
async function ensureOwner(db, timestamp = nowMs()) {
  await run(db, `INSERT OR IGNORE INTO users (id, created_at, updated_at) VALUES (?, ?, ?)`, [USER_ID, timestamp, timestamp]);
  await run(db, `UPDATE users SET updated_at = ? WHERE id = ?`, [timestamp, USER_ID]);
}
function conversationFromRow(row) {
  return {
    id: row.id,
    title: row.title || "新聊天",
    created_at: isoFromMs(row.created_at),
    updated_at: isoFromMs(row.updated_at),
    deleted_at: row.deleted_at ? isoFromMs(row.deleted_at) : null,
    title_manual: Number(row.title_manual || 0) === 1,
    title_generated_at: row.title_generated_at ? isoFromMs(row.title_generated_at) : null,
  };
}
async function listD1Conversations(db) {
  await ensureD1Schema(db); await ensureOwner(db);
  const rows = await all(db, `SELECT id, title, created_at, updated_at, deleted_at, title_manual, title_generated_at FROM conversations WHERE user_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC, created_at DESC`, [USER_ID]);
  return rows.map(conversationFromRow);
}
async function createD1Conversation(db, title = "新聊天") {
  await ensureD1Schema(db);
  const timestamp = nowMs();
  await ensureOwner(db, timestamp);
  const id = cleanId(crypto.randomUUID(), "conversation");
  const clean = cleanTitle(title, "新聊天");
  await run(db, `INSERT INTO conversations (id, user_id, title, created_at, updated_at, deleted_at, title_manual, title_generated_at) VALUES (?, ?, ?, ?, ?, NULL, 0, NULL)`, [id, USER_ID, clean, timestamp, timestamp]);
  return { id, title: clean, created_at: isoFromMs(timestamp), updated_at: isoFromMs(timestamp), deleted_at: null, title_manual: false, title_generated_at: null };
}
async function ensureConversation(db, conversationId, title = "新聊天") {
  await ensureD1Schema(db); await ensureOwner(db);
  const timestamp = nowMs();
  await run(db, `INSERT INTO conversations (id, user_id, title, created_at, updated_at, deleted_at, title_manual, title_generated_at)
    VALUES (?, ?, ?, ?, ?, NULL, 0, NULL)
    ON CONFLICT(id) DO UPDATE SET user_id = excluded.user_id, updated_at = conversations.updated_at, deleted_at = NULL`, [conversationId, USER_ID, cleanTitle(title, "新聊天"), timestamp, timestamp]);
}
async function patchD1Conversation(db, conversationId, title) {
  await ensureD1Schema(db); await ensureOwner(db);
  const timestamp = nowMs();
  const clean = cleanTitle(title, "新聊天");
  await ensureConversation(db, conversationId, clean);
  await run(db, `UPDATE conversations SET title = ?, title_manual = 1, updated_at = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL`, [clean, timestamp, conversationId, USER_ID]);
  const row = await first(db, `SELECT id, title, created_at, updated_at, deleted_at, title_manual, title_generated_at FROM conversations WHERE id = ? AND user_id = ?`, [conversationId, USER_ID]);
  return conversationFromRow(row);
}
async function deleteD1Conversation(db, conversationId) {
  await ensureD1Schema(db); await ensureOwner(db);
  const timestamp = nowMs();
  await run(db, `UPDATE conversations SET deleted_at = ?, updated_at = ? WHERE id = ? AND user_id = ?`, [timestamp, timestamp, conversationId, USER_ID]);
  return { id: conversationId, deleted_at: isoFromMs(timestamp) };
}
async function readD1Profile(db) {
  const row = await first(db, `SELECT assistant_avatar_dataurl, current_chat_model, current_image_model, model_box_json FROM chat_profiles WHERE user_id = ?`, [USER_ID]);
  if (!row) return emptyProfile();
  let modelBox = { chat: [], free: [], image: [] };
  try { modelBox = JSON.parse(row.model_box_json || "{}"); } catch {}
  return normalizeProfile({ assistant_avatar_dataurl: row.assistant_avatar_dataurl || "", current_chat_model: row.current_chat_model || "", current_image_model: row.current_image_model || "", model_box: modelBox });
}
async function writeD1Profile(db, profile, timestamp = nowMs()) {
  const clean = normalizeProfile(profile || {});
  await run(db, `INSERT INTO chat_profiles (user_id, assistant_avatar_dataurl, current_chat_model, current_image_model, model_box_json, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET assistant_avatar_dataurl = excluded.assistant_avatar_dataurl, current_chat_model = excluded.current_chat_model, current_image_model = excluded.current_image_model, model_box_json = excluded.model_box_json, updated_at = excluded.updated_at`, [USER_ID, clean.assistant_avatar_dataurl || null, clean.current_chat_model || null, clean.current_image_model || null, JSON.stringify(clean.model_box || { chat: [], free: [], image: [] }), timestamp]);
  return clean;
}
async function readD1History(db, conversationId) {
  await ensureD1Schema(db); await ensureOwner(db);
  const profile = await readD1Profile(db);
  const conversation = await first(db, `SELECT id, updated_at FROM conversations WHERE id = ? AND user_id = ? AND deleted_at IS NULL`, [conversationId, USER_ID]);
  if (!conversation) return { v: 2, source: "d1", conversation_id: conversationId, updated_at: null, turns: [], messages: [], profile };
  const turnRows = await all(db, `SELECT id, position, active_user_variant_id, updated_at FROM turns WHERE conversation_id = ? AND deleted_at IS NULL ORDER BY position ASC, created_at ASC`, [conversationId]);
  if (!turnRows.length) return { v: 2, source: "d1", conversation_id: conversationId, updated_at: isoFromMs(conversation.updated_at), turns: [], messages: [], profile };
  const turnIds = turnRows.map((row) => row.id);
  const placeholders = turnIds.map(() => "?").join(",");
  const userRows = await all(db, `SELECT id, turn_id, position, content, created_at FROM user_variants WHERE deleted_at IS NULL AND turn_id IN (${placeholders}) ORDER BY turn_id ASC, position ASC`, turnIds);
  const assistantRows = await all(db, `SELECT id, turn_id, user_variant_id, user_variant_position, position, content, error_detail, is_active, created_at FROM assistant_variants WHERE deleted_at IS NULL AND turn_id IN (${placeholders}) ORDER BY turn_id ASC, user_variant_position ASC, position ASC`, turnIds);
  const usersByTurn = new Map();
  const userIndexById = new Map();
  for (const row of userRows) {
    const list = usersByTurn.get(row.turn_id) || [];
    const variant = { id: row.id, content: row.content || "", created_at: isoFromMs(row.created_at) };
    list.push(variant);
    usersByTurn.set(row.turn_id, list);
  }
  for (const [turnId, list] of usersByTurn.entries()) list.forEach((variant, index) => userIndexById.set(`${turnId}:${variant.id}`, index));
  const assistantsByTurnBranch = new Map();
  const activeByTurnBranch = new Map();
  for (const row of assistantRows) {
    const resolvedIndex = row.user_variant_id ? userIndexById.get(`${row.turn_id}:${row.user_variant_id}`) : null;
    const branch = resolvedIndex == null ? Number(row.user_variant_position || 0) : resolvedIndex;
    const branchKey = `${row.turn_id}:${branch}`;
    const list = assistantsByTurnBranch.get(branchKey) || [];
    list.push({ id: row.id, content: row.content || "", created_at: isoFromMs(row.created_at), ...(row.error_detail ? { errorDetail: row.error_detail } : {}) });
    if (Number(row.is_active || 0) === 1) activeByTurnBranch.set(branchKey, Math.max(0, list.length - 1));
    assistantsByTurnBranch.set(branchKey, list);
  }
  const turns = turnRows.map((turnRow) => {
    const userVariants = usersByTurn.get(turnRow.id) || [];
    const activeUser = userVariants.findIndex((variant) => variant.id === turnRow.active_user_variant_id);
    const branchCount = Math.max(1, userVariants.length);
    const variantsByUserVariant = {};
    const activeByUserVariant = {};
    for (let index = 0; index < branchCount; index += 1) {
      const branchKey = `${turnRow.id}:${index}`;
      const list = assistantsByTurnBranch.get(branchKey) || [];
      variantsByUserVariant[String(index)] = list;
      activeByUserVariant[String(index)] = C(activeByTurnBranch.get(branchKey), list.length || 1);
    }
    return { id: turnRow.id, user: { active: activeUser >= 0 ? activeUser : 0, variants: userVariants }, assistant: { activeByUserVariant, variantsByUserVariant } };
  });
  return { v: 2, source: "d1", conversation_id: conversationId, updated_at: isoFromMs(conversation.updated_at), turns: normalizeHistoryTurns(turns), messages: [], profile };
}
function activeUserVariantId(turn) {
  const active = Math.min(Math.max(0, Number(turn.user.active || 0)), Math.max(0, turn.user.variants.length - 1));
  return turn.user.variants[active]?.id || null;
}
async function markMissingRowsDeleted(db, table, idColumn, ids, whereSql, whereParams, timestamp) {
  const incoming = ids.filter(Boolean);
  if (incoming.length) {
    const placeholders = incoming.map(() => "?").join(",");
    await run(db, `UPDATE ${table} SET deleted_at = ? ${whereSql} AND ${idColumn} NOT IN (${placeholders})`, [timestamp, ...whereParams, ...incoming]);
  } else {
    await run(db, `UPDATE ${table} SET deleted_at = ? ${whereSql}`, [timestamp, ...whereParams]);
  }
}
async function writeD1History(db, conversationId, input) {
  await ensureD1Schema(db);
  const timestamp = nowMs();
  await ensureOwner(db, timestamp);
  const history = { ...input, turns: normalizeHistoryTurns(input.turns || []), conversation_id: conversationId };
  history.profile = await writeD1Profile(db, input.profile || {}, timestamp);
  await run(db, `INSERT INTO conversations (id, user_id, title, created_at, updated_at, deleted_at, title_manual, title_generated_at)
    VALUES (?, ?, ?, ?, ?, NULL, 0, NULL)
    ON CONFLICT(id) DO UPDATE SET user_id = excluded.user_id, updated_at = excluded.updated_at, deleted_at = NULL`, [conversationId, USER_ID, "新聊天", timestamp, timestamp]);
  const turnIds = [];
  const userVariantIds = [];
  const assistantVariantIds = [];
  for (let turnIndex = 0; turnIndex < history.turns.length; turnIndex += 1) {
    const turn = history.turns[turnIndex];
    const turnId = cleanId(turn.id, "turn");
    turnIds.push(turnId);
    const activeVariantId = activeUserVariantId(turn);
    await run(db, `INSERT INTO turns (id, conversation_id, position, active_user_variant_id, created_at, updated_at, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?, NULL)
      ON CONFLICT(id) DO UPDATE SET conversation_id = excluded.conversation_id, position = excluded.position, active_user_variant_id = excluded.active_user_variant_id, updated_at = excluded.updated_at, deleted_at = NULL`, [turnId, conversationId, turnIndex, activeVariantId, timestamp, timestamp]);
    for (let userIndex = 0; userIndex < turn.user.variants.length; userIndex += 1) {
      const variant = turn.user.variants[userIndex];
      const variantId = cleanId(variant.id, "user_variant");
      userVariantIds.push(variantId);
      await run(db, `INSERT INTO user_variants (id, turn_id, position, content, created_at, updated_at, deleted_at)
        VALUES (?, ?, ?, ?, ?, ?, NULL)
        ON CONFLICT(id) DO UPDATE SET turn_id = excluded.turn_id, position = excluded.position, content = excluded.content, updated_at = excluded.updated_at, deleted_at = NULL`, [variantId, turnId, userIndex, variant.content, Date.parse(variant.created_at || "") || timestamp, timestamp]);
      const assistantList = turn.assistant.variantsByUserVariant[String(userIndex)] || [];
      const activeAssistantIndex = C(turn.assistant.activeByUserVariant[String(userIndex)], assistantList.length || 1);
      for (let assistantIndex = 0; assistantIndex < assistantList.length; assistantIndex += 1) {
        const assistant = assistantList[assistantIndex];
        const assistantId = cleanId(assistant.id, "assistant_variant");
        assistantVariantIds.push(assistantId);
        await run(db, `INSERT INTO assistant_variants (id, turn_id, user_variant_id, user_variant_position, position, content, error_detail, is_active, created_at, updated_at, deleted_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
          ON CONFLICT(id) DO UPDATE SET turn_id = excluded.turn_id, user_variant_id = excluded.user_variant_id, user_variant_position = excluded.user_variant_position, position = excluded.position, content = excluded.content, error_detail = excluded.error_detail, is_active = excluded.is_active, updated_at = excluded.updated_at, deleted_at = NULL`, [assistantId, turnId, variantId, userIndex, assistantIndex, assistant.content, assistant.errorDetail || null, assistantIndex === activeAssistantIndex ? 1 : 0, Date.parse(assistant.created_at || "") || timestamp, timestamp]);
      }
    }
  }
  await markMissingRowsDeleted(db, "turns", "id", turnIds, "WHERE conversation_id = ?", [conversationId], timestamp);
  await markMissingRowsDeleted(db, "user_variants", "id", userVariantIds, "WHERE turn_id IN (SELECT id FROM turns WHERE conversation_id = ?)", [conversationId], timestamp);
  await markMissingRowsDeleted(db, "assistant_variants", "id", assistantVariantIds, "WHERE turn_id IN (SELECT id FROM turns WHERE conversation_id = ?)", [conversationId], timestamp);
  history.updated_at = new Date(timestamp).toISOString();
  return history;
}
async function clearD1History(db, conversationId) {
  await ensureD1Schema(db);
  const timestamp = nowMs();
  await ensureOwner(db, timestamp);
  await ensureConversation(db, conversationId, "新聊天");
  await run(db, `UPDATE conversations SET updated_at = ? WHERE id = ? AND user_id = ?`, [timestamp, conversationId, USER_ID]);
  await run(db, `UPDATE turns SET deleted_at = ?, updated_at = ? WHERE conversation_id = ?`, [timestamp, timestamp, conversationId]);
  await run(db, `UPDATE user_variants SET deleted_at = ?, updated_at = ? WHERE turn_id IN (SELECT id FROM turns WHERE conversation_id = ?)`, [timestamp, timestamp, conversationId]);
  await run(db, `UPDATE assistant_variants SET deleted_at = ?, updated_at = ? WHERE turn_id IN (SELECT id FROM turns WHERE conversation_id = ?)`, [timestamp, timestamp, conversationId]);
}
function normalizeKvHistory(parsed) {
  const raw = parsed?.history || parsed || {};
  const profile = normalizeProfile(raw.profile || parsed?.profile || {});
  const turns = Array.isArray(raw.turns) ? normalizeHistoryTurns(raw.turns) : flatMessagesToTurns(raw.messages || parsed?.messages || []);
  return { v: 2, source: parsed?.source || "kv", updated_at: raw.updated_at || parsed?.updated_at || null, turns, messages: normalizeHistoryMessages(raw.messages || parsed?.messages || []), profile };
}
async function readKvByKey(env, key) {
  if (!configuredStore(env)) return null;
  const raw = await env.COAST_CHAT_STORE.get(key);
  if (!raw) return null;
  try { return normalizeKvHistory(JSON.parse(raw)); } catch { return null; }
}
async function readKvHistory(env, conversationId) {
  const current = await readKvByKey(env, chatStoreKey(conversationId));
  if (current) return current;
  if (conversationId === DEFAULT_CONVERSATION_ID) return readKvByKey(env, OLD_HISTORY_KEY);
  return null;
}
async function writeKvSnapshot(env, conversationId, history) {
  if (!configuredStore(env)) return;
  await env.COAST_CHAT_STORE.put(chatStoreKey(conversationId), JSON.stringify({
    v: 2,
    source: "d1-cache",
    updated_at: history.updated_at || new Date().toISOString(),
    history: { conversation_id: conversationId, turns: normalizeHistoryTurns(history.turns || []), profile: normalizeProfile(history.profile || {}) },
  }));
}
async function deleteKvSnapshot(env, conversationId) {
  if (!configuredStore(env) || typeof env.COAST_CHAT_STORE.delete !== "function") return;
  await env.COAST_CHAT_STORE.delete(chatStoreKey(conversationId));
}
async function handleChatHistory(request, env) {
  const url = new URL(request.url);
  const conversationId = conversationIdFromUrl(url);
  if (request.method === "GET") {
    if (configuredDb(env)) {
      try {
        const d1History = await readD1History(env.COAST_CHAT_DB, conversationId);
        if (!d1History.turns.length) {
          const kvHistory = await readKvHistory(env, conversationId);
          if (kvHistory?.turns?.length) {
            const migrated = await writeD1History(env.COAST_CHAT_DB, conversationId, { ...kvHistory, profile: { ...d1History.profile, ...kvHistory.profile } });
            await writeKvSnapshot(env, conversationId, migrated);
            return historyJson({ ok: true, source: conversationId === DEFAULT_CONVERSATION_ID ? "d1-migrated-from-kv" : "d1-migrated-from-conversation-kv", history: migrated });
          }
        }
        await writeKvSnapshot(env, conversationId, d1History);
        return historyJson({ ok: true, source: "d1", history: d1History });
      } catch {
        const kvHistory = await readKvHistory(env, conversationId);
        if (kvHistory) return historyJson({ ok: true, source: "kv-fallback", warning: "d1_read_failed", history: { ...kvHistory, conversation_id: conversationId } });
        return historyError("chat_db_unavailable", "主聊天 D1 存储暂不可用。", 503);
      }
    }
    const kvHistory = await readKvHistory(env, conversationId);
    if (kvHistory) return historyJson({ ok: true, source: "kv-fallback", warning: "chat_db_not_configured", history: { ...kvHistory, conversation_id: conversationId } });
    return historyError("chat_db_not_configured", "主聊天 D1 存储未配置。", 503);
  }
  if (request.method === "PUT") {
    if (!sameSiteMutation(request)) return historyError("forbidden", "Forbidden.", 403);
    if (!configuredDb(env)) return historyError("chat_db_not_configured", "主聊天 D1 存储未配置。", 503);
    let body;
    try { body = await readHistoryJson(request); }
    catch (error) {
      if (error.status === 413 || error.message === "body_too_large") return historyError("body_too_large", "请求体过大。", 413);
      return historyError("invalid_request", "请求体无效。", 400);
    }
    let history;
    try { history = historyFromBody(body); }
    catch (error) {
      if (error.status === 413 || error.message === "profile_avatar_too_large") return historyError("profile_avatar_too_large", "头像数据过大，未写入服务器。", 413);
      return historyError("invalid_request", "请求体无效。", 400);
    }
    try {
      const saved = await writeD1History(env.COAST_CHAT_DB, conversationId, history);
      await writeKvSnapshot(env, conversationId, saved);
      return historyJson({ ok: true, source: "d1", history: saved });
    } catch {
      return historyError("chat_db_write_failed", "主聊天 D1 写入失败。", 500);
    }
  }
  if (request.method === "DELETE") {
    if (!sameSiteMutation(request)) return historyError("forbidden", "Forbidden.", 403);
    if (configuredDb(env)) await clearD1History(env.COAST_CHAT_DB, conversationId);
    await deleteKvSnapshot(env, conversationId);
    return historyJson({ ok: true, source: configuredDb(env) ? "d1" : "kv", conversation_id: conversationId, deleted: true });
  }
  return historyJson({ ok: false, error: { type: "method_not_allowed", message: "Method not allowed." } }, 405, { Allow: "GET, PUT, DELETE" });
}
async function handleConversations(request, env) {
  if (!configuredDb(env)) return historyError("chat_db_not_configured", "主聊天 D1 存储未配置。", 503);
  const url = new URL(request.url);
  const prefix = "/api/chat/conversations";
  const rest = decodeURIComponent(url.pathname.slice(prefix.length).replace(/^\//, ""));
  if (!rest) {
    if (request.method === "GET") return historyJson({ ok: true, conversations: await listD1Conversations(env.COAST_CHAT_DB) });
    if (request.method === "POST") {
      if (!sameSiteMutation(request)) return historyError("forbidden", "Forbidden.", 403);
      const body = await readHistoryJson(request).catch(() => ({}));
      const conversation = await createD1Conversation(env.COAST_CHAT_DB, body.title || "新聊天");
      return historyJson({ ok: true, conversation }, 201);
    }
    return historyError("method_not_allowed", "Method not allowed.", 405);
  }
  const conversationId = cleanId(rest.split("/")[0], "conversation");
  if (request.method === "PATCH") {
    if (!sameSiteMutation(request)) return historyError("forbidden", "Forbidden.", 403);
    const body = await readHistoryJson(request).catch(() => ({}));
    const conversation = await patchD1Conversation(env.COAST_CHAT_DB, conversationId, body.title || "新聊天");
    return historyJson({ ok: true, conversation });
  }
  if (request.method === "DELETE") {
    if (!sameSiteMutation(request)) return historyError("forbidden", "Forbidden.", 403);
    const conversation = await deleteD1Conversation(env.COAST_CHAT_DB, conversationId);
    await deleteKvSnapshot(env, conversationId);
    return historyJson({ ok: true, conversation, deleted: true });
  }
  return historyError("method_not_allowed", "Method not allowed.", 405);
}
async function generateTitleWithChat(context, user, assistant) {
  const url = new URL(context.request.url);
  url.pathname = "/api/chat";
  url.search = "";
  const prompt = `为下面这轮对话生成一个简短中文标题，12字以内，不要引号，不要句号，不要解释。\n用户：${String(user || "").slice(0, 1000)}\n助手：${String(assistant || "").slice(0, 1000)}`;
  const request = new Request(url.toString(), {
    method: "POST",
    headers: new Headers({ "Content-Type": "application/json", Cookie: context.request.headers.get("Cookie") || "" }),
    body: JSON.stringify({ model: "openai/gpt-4.1-nano", messages: [{ role: "user", content: prompt }], settings: { max_tokens: 40, temperature: 0.2 } }),
  });
  const response = await legacyOnRequest({ ...context, request });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error("title_generation_failed");
  return cleanTitle(data?.message?.content || "", "新聊天").slice(0, 24);
}
async function handleTitle(request, context) {
  const env = context.env;
  if (!configuredDb(env)) return historyError("chat_db_not_configured", "主聊天 D1 存储未配置。", 503);
  if (request.method !== "POST") return historyError("method_not_allowed", "Method not allowed.", 405);
  if (!sameSiteMutation(request)) return historyError("forbidden", "Forbidden.", 403);
  const body = await readHistoryJson(request).catch(() => ({}));
  const conversationId = cleanId(body.conversation_id || DEFAULT_CONVERSATION_ID, "conversation");
  await ensureD1Schema(env.COAST_CHAT_DB); await ensureOwner(env.COAST_CHAT_DB);
  const row = await first(env.COAST_CHAT_DB, `SELECT id, title, title_manual, title_generated_at, deleted_at FROM conversations WHERE id = ? AND user_id = ?`, [conversationId, USER_ID]);
  if (!row || row.deleted_at) return historyError("conversation_not_found", "会话不存在。", 404);
  if (Number(row.title_manual || 0) === 1 || row.title_generated_at || !defaultTitle(row.title)) {
    return historyJson({ ok: true, skipped: true, conversation: conversationFromRow({ ...row, created_at: nowMs(), updated_at: nowMs() }) });
  }
  let title;
  try { title = await generateTitleWithChat(context, body.user || "", body.assistant || ""); }
  catch { return historyJson({ ok: true, skipped: true, reason: "title_generation_failed" }); }
  const timestamp = nowMs();
  await run(env.COAST_CHAT_DB, `UPDATE conversations SET title = ?, title_generated_at = ?, updated_at = ? WHERE id = ? AND user_id = ? AND (title_manual IS NULL OR title_manual != 1) AND deleted_at IS NULL`, [title, timestamp, timestamp, conversationId, USER_ID]);
  const updated = await first(env.COAST_CHAT_DB, `SELECT id, title, created_at, updated_at, deleted_at, title_manual, title_generated_at FROM conversations WHERE id = ? AND user_id = ?`, [conversationId, USER_ID]);
  return historyJson({ ok: true, conversation: conversationFromRow(updated) });
}
async function ensureAuthenticated(context) {
  const url = new URL(context.request.url);
  url.pathname = "/api/session";
  url.search = "";
  const sessionRequest = new Request(url.toString(), { method: "GET", headers: context.request.headers });
  const response = await legacyOnRequest({ ...context, request: sessionRequest });
  if (!response.ok) return response;
  return null;
}
export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (url.pathname === "/api/chat/history") {
    const unauthorized = await ensureAuthenticated(context);
    if (unauthorized) return unauthorized;
    return handleChatHistory(context.request, context.env);
  }
  if (url.pathname === "/api/chat/conversations" || url.pathname.startsWith("/api/chat/conversations/")) {
    const unauthorized = await ensureAuthenticated(context);
    if (unauthorized) return unauthorized;
    return handleConversations(context.request, context.env);
  }
  if (url.pathname === "/api/chat/title") {
    const unauthorized = await ensureAuthenticated(context);
    if (unauthorized) return unauthorized;
    return handleTitle(context.request, context);
  }
  return legacyOnRequest(context);
}

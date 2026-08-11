import { listConversations } from './chat-store.js';
import { listEntries, listPockets, readSoil } from './memory-store.js';
import { ensureWindowSettingsSchema } from './window-settings-schema.js';

function clip(value, max) { return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max); }
function enabled(value) { return value === true || Number(value) === 1; }

export async function getWindowSettings(db, conversationId) {
  await ensureWindowSettingsSchema(db);
  const id = clip(conversationId, 160);
  const row = id
    ? await db.prepare('SELECT * FROM coast_window_settings WHERE conversation_id = ?').bind(id).first()
    : null;
  return {
    conversation_id: id,
    cross_window_light_recall_enabled: enabled(row?.cross_window_light_recall_enabled),
    today_coast_reference_enabled: enabled(row?.today_coast_reference_enabled),
  };
}

export async function updateWindowSettings(db, conversationId, value = {}) {
  await ensureWindowSettingsSchema(db);
  const id = clip(conversationId, 160);
  if (!id) throw new Error('conversation_id_required');
  const current = await getWindowSettings(db, id);
  const next = {
    cross_window_light_recall_enabled: value.cross_window_light_recall_enabled == null
      ? current.cross_window_light_recall_enabled
      : enabled(value.cross_window_light_recall_enabled),
    today_coast_reference_enabled: value.today_coast_reference_enabled == null
      ? current.today_coast_reference_enabled
      : enabled(value.today_coast_reference_enabled),
  };
  const timestamp = Date.now();
  await db.prepare(`INSERT INTO coast_window_settings (
    conversation_id, cross_window_light_recall_enabled,
    today_coast_reference_enabled, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(conversation_id) DO UPDATE SET
    cross_window_light_recall_enabled = excluded.cross_window_light_recall_enabled,
    today_coast_reference_enabled = excluded.today_coast_reference_enabled,
    updated_at = excluded.updated_at`).bind(
    id,
    next.cross_window_light_recall_enabled ? 1 : 0,
    next.today_coast_reference_enabled ? 1 : 0,
    timestamp,
    timestamp,
  ).run();
  return { conversation_id: id, ...next };
}

function terms(query) {
  return [...new Set(String(query || '').toLocaleLowerCase('zh-CN')
    .split(/[\s,，。！？!?、:：;；()（）「」“”]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2))].slice(0, 16);
}

function relevance(queryTerms, text) {
  const haystack = String(text || '').toLocaleLowerCase('zh-CN');
  return queryTerms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
}

function itemText(item) {
  return clip(item?.life_core || item?.content || item?.title, 260);
}

export async function buildCrossWindowTouch(db, {
  conversationId,
  query = '',
  enabled: settingEnabled = false,
  limit = 3,
} = {}) {
  if (!settingEnabled || !conversationId) return { entries: [], sources: [] };
  const conversations = (await listConversations(db)).filter((item) => item.id !== conversationId);
  const queryTerms = terms(query);
  const explicit = /(其他窗口|旧窗口|跨窗口|一千零一个触角|触角轻讯|共同走过|以前聊过)/u.test(String(query || ''));
  const candidates = [];
  for (const conversation of conversations.slice(0, 30)) {
    const [soil, entryResult, pockets] = await Promise.all([
      readSoil(db, conversation.id),
      listEntries(db, { conversation_id: conversation.id, scope: 'conversation', limit: 16 }),
      listPockets(db, { conversation_id: conversation.id, status: 'confirmed' }),
    ]);
    const entries = entryResult.entries.filter((item) => item.status === 'active' && item.user_confirmed !== false);
    const handSeeds = (soil.hand_seeds || []).slice(0, 2).map((item) => clip(item.life_core || item.name, 220)).filter(Boolean);
    const confirmed = [...entries, ...pockets].map(itemText).filter(Boolean).slice(0, 4);
    const current = clip(soil.current_text, 280);
    const text = [conversation.title, current, ...handSeeds, ...confirmed].join(' ');
    const score = relevance(queryTerms, text);
    if (!explicit && score < 1) continue;
    const pieces = [current, ...handSeeds, ...confirmed]
      .filter(Boolean)
      .filter((item, index, values) => values.indexOf(item) === index)
      .slice(0, 3);
    if (!pieces.length) continue;
    candidates.push({
      title: conversation.title,
      updated_at: conversation.updated_at,
      score,
      lines: pieces,
    });
  }
  const selected = candidates
    .sort((left, right) => right.score - left.score || Date.parse(right.updated_at) - Date.parse(left.updated_at))
    .slice(0, Math.max(1, Math.min(4, Number(limit) || 3)));
  return {
    entries: selected.map((item) => [
      `来源：${item.title}｜更新时间：${item.updated_at}`,
      ...item.lines.map((line) => `- ${line}`),
    ].join('\n')),
    sources: selected.map((item) => item.title),
  };
}

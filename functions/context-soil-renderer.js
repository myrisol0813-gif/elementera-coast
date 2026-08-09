const CONTINUATION = /(继续刚刚|接着写|回到刚才那个场景|别切走|继续上面|沿着这个)/u;

const MODE_LIMITS = Object.freeze({
  normal_chat: [600, 1000],
  quiet_comfort: [400, 800],
  construction_review: [1000, 1800],
  code_helper: [900, 1600],
  creative_companion: [1000, 1800],
  deep_talk: [1000, 1600],
  mailbox_visitor: [400, 800],
});

function clip(value, max) {
  return String(value || '').trim().slice(0, Math.max(0, max));
}

function soilItems(value, surface) {
  if (Array.isArray(value)) return value.filter((item) => item?.soil);
  if (value?.sources && typeof value.sources === 'object') {
    return Object.entries(value.sources).map(([label, soil]) => ({ label, soil, contextSurface: surface }));
  }
  if (value?.soil && typeof value.soil === 'object') return [{ label: value.label || '', soil: value.soil, contextSurface: value.contextSurface || surface }];
  if (value && typeof value === 'object') return [{ label: '', soil: value, contextSurface: surface }];
  return [];
}

function fullItem(item) {
  const soil = item.soil || {};
  const lines = [];
  if (item.label) lines.push(`来源：${item.label}`);
  lines.push(`当前：${soil.current_text || '未整理'}`);
  if (soil.hand_seeds?.length) {
    lines.push('手持种：', ...soil.hand_seeds.map((seed) => `- ${seed.name || seed.life_core}｜${seed.life_core || ''}${seed.usage_hint ? `｜使用：${seed.usage_hint}` : ''}${seed.avoid_hint ? `｜避免：${seed.avoid_hint}` : ''}`));
  }
  if (soil.do_not_repeat) lines.push(`勿复读：${soil.do_not_repeat}`);
  if (soil.pocket_candidates?.length) {
    lines.push('待确认候选（不是记忆）：', ...soil.pocket_candidates.map((itemValue) => `- ${itemValue.title || itemValue.life_core}｜${itemValue.life_core || ''}`));
  }
  lines.push(`revision：${Number(soil.revision || 1)}`);
  if (soil.organized_through_turn_id) lines.push(`organized_through_turn_id：${soil.organized_through_turn_id}`);
  if (soil.source_turn_id) lines.push(`source_turn_id：${soil.source_turn_id}`);
  if (soil.updated_at) lines.push(`updated_at：${soil.updated_at}`);
  return lines.join('\n');
}

function topicTokens(value) {
  const text = String(value || '').replace(/[\s\p{P}\p{S}]+/gu, '');
  const tokens = new Set();
  for (let index = 0; index < text.length - 1; index += 1) tokens.add(text.slice(index, index + 2));
  return tokens;
}

function topicOverlap(left, right) {
  const a = topicTokens(left);
  const b = topicTokens(right);
  if (!a.size || !b.size) return 0;
  let matched = 0;
  for (const token of a) if (b.has(token)) matched += 1;
  return matched / Math.min(a.size, b.size);
}

function turnTrace(soil, recentMessages, latestTurnId) {
  const ids = [...new Set((Array.isArray(recentMessages) ? recentMessages : [])
    .map((message) => String(message?.turn_id || ''))
    .filter(Boolean))];
  const latest = String(latestTurnId || ids.at(-1) || '');
  const organized = String(soil?.organized_through_turn_id || soil?.source_turn_id || '');
  const index = organized ? ids.lastIndexOf(organized) : -1;
  const turnGap = organized && latest && organized === latest
    ? 0
    : index >= 0
      ? Math.max(0, ids.length - 1 - index)
      : organized && latest
        ? Math.max(3, ids.length)
        : null;
  return { organized, latest, turnGap };
}

export function soilFreshness(soilValue, {
  surface,
  contextSurface = surface,
  lastUser = '',
  recentMessages = [],
  latestTurnId = '',
} = {}) {
  const soil = soilValue || {};
  const turn = turnTrace(soil, recentMessages, latestTurnId);
  const surfaceMatch = !contextSurface || contextSurface === surface;
  const updatedAt = Date.parse(String(soil.updated_at || ''));
  const ageDays = Number.isFinite(updatedAt) ? Math.max(0, (Date.now() - updatedAt) / 86400000) : null;
  const overlap = topicOverlap(soil.current_text, typeof lastUser === 'object' ? lastUser?.content : lastUser);
  let freshness = 'recent';
  let reason = '近期整理，可作轻量参考。';
  if (!surfaceMatch) {
    freshness = 'archived';
    reason = 'surface 不匹配，只供 Inspector 查看。';
  } else if (!String(soil.current_text || '').trim() && !soil.hand_seeds?.length) {
    freshness = 'archived';
    reason = '思维壤尚无可注入内容。';
  } else if (turn.turnGap === 0 || (turn.turnGap == null && ageDays != null && ageDays <= 1 && overlap >= 0.04)) {
    freshness = 'live';
    reason = '整理已覆盖当前轮次或与当前主题明显连续。';
  } else if ((turn.turnGap != null && turn.turnGap >= 8) || (ageDays != null && ageDays > 45)) {
    freshness = overlap >= 0.04 ? 'old_but_relevant' : 'stale';
    reason = overlap >= 0.04
      ? '整理轮次较旧，但与当前主题仍有关联。'
      : '整理明显落后且与当前主题距离较大。';
  } else if ((turn.turnGap != null && turn.turnGap >= 3) || overlap < 0.02) {
    freshness = overlap >= 0.04 ? 'old_but_relevant' : 'recent';
    reason = overlap >= 0.04
      ? '旧整理与当前主题有关，只作方向参考。'
      : '整理未覆盖最新若干轮，已降为近期参考。';
  }
  return {
    freshness,
    freshness_reason: reason,
    organized_through_turn_id: turn.organized || null,
    latest_turn_id: turn.latest || null,
    turn_gap: turn.turnGap,
    surface_match: surfaceMatch,
    topic_overlap: Number(overlap.toFixed(3)),
    age_days: ageDays == null ? null : Number(ageDays.toFixed(2)),
  };
}

export function isExplicitContinuation(value) {
  return CONTINUATION.test(String(typeof value === 'object' ? value?.content : value || ''));
}

export function renderSoilForInspector(soilValue, { surface = 'main_chat' } = {}) {
  const items = soilItems(soilValue, surface);
  if (!items.length) return '';
  return ['【思维壤｜完整 Inspector 版】', ...items.map(fullItem)].join('\n\n');
}

export function renderSoilForModel(soilValue, {
  surface = 'main_chat',
  modeKey = 'normal_chat',
  explicitContinuation = false,
  explicitFullContext = false,
  budget,
  lastUser = '',
  recentMessages = [],
  latestTurnId = '',
} = {}) {
  const items = soilItems(soilValue, surface);
  const fullText = renderSoilForInspector(items, { surface });
  const [modeMin, modeMax] = MODE_LIMITS[modeKey] || (surface === 'mailbox_visitor' ? MODE_LIMITS.mailbox_visitor : MODE_LIMITS.normal_chat);
  const requested = Number(budget);
  const normalLimit = Number.isFinite(requested) ? Math.min(modeMax, Math.max(200, requested)) : modeMax;
  const limit = explicitFullContext
    ? Math.max(normalLimit, 2400)
    : explicitContinuation
      ? Math.max(normalLimit, Math.min(1800, modeMax + 600))
      : Math.max(Math.min(modeMin, normalLimit), normalLimit);
  const traces = items.map((item) => soilFreshness(item.soil, {
    surface,
    contextSurface: item.contextSurface || surface,
    lastUser,
    recentMessages,
    latestTurnId,
  }));
  const usable = items.filter((item, index) => !['archived', 'stale'].includes(traces[index].freshness));
  const lines = ['【思维壤｜压缩版】'];
  for (const item of usable) {
    const soil = item.soil || {};
    if (item.label) lines.push(`${item.label}：`);
    if (soil.current_text) lines.push(`当前：${clip(soil.current_text, Math.max(220, Math.floor(limit * 0.62)))}`);
    if (soil.hand_seeds?.length) {
      lines.push('手持种：', ...soil.hand_seeds.slice(0, 3).map((seed) => `- ${clip(seed.name || seed.life_core, 80)}：${clip(seed.life_core, 220)}`));
    }
    if (soil.do_not_repeat) lines.push(`勿复读：${clip(soil.do_not_repeat, modeKey === 'quiet_comfort' ? 180 : 320)}`);
  }
  if (lines.length === 1) return {
    text: '', compact_text: '', full_text: fullText, original_length: fullText.length,
    model_length: 0, compression_ratio: 0, traces, stale: traces.some((trace) => trace.freshness === 'stale'),
  };
  lines.push('当前输入优先；不要逐条复述思维壤。');
  const text = lines.join('\n').slice(0, limit);
  const compactText = `${lines.slice(0, 2).join('\n').slice(0, Math.min(420, limit))}\n当前输入优先；不要逐条复述。`;
  return {
    text,
    compact_text: compactText,
    full_text: fullText,
    original_length: fullText.length,
    model_length: text.length,
    compression_ratio: fullText.length ? Number((text.length / fullText.length).toFixed(3)) : 0,
    traces,
    stale: traces.some((trace) => trace.freshness === 'stale'),
  };
}

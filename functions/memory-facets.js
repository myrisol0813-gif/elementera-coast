const POOL_KEYS = Object.freeze([
  'conversation_seeds',
  'conversation_memories',
  'conversation_pockets',
  'global_seeds',
  'global_memories',
  'global_pockets',
]);

const MODE_HINTS = Object.freeze({
  normal_chat: '只在自然承接当前对话时轻量使用',
  construction_review: '作为架构、字段与召回路径的参考',
  code_helper: '只用于理解现有约束与实现意图',
  mailbox_patrol: '仅可使用当前访客作用域内允许的内容',
  calendar_writer: '用于理解日期、安排与纪念意义，不替代日历事实',
  creative_companion: '可作为设定、画面或意象的连续底色',
  quiet_comfort: '只作温柔底色，不展开工程细节',
  deep_talk: '可用于理解关系连续性，但不能替用户定义此刻',
});

function clipped(value, max) {
  return String(value || '').trim().slice(0, max);
}

function freshness(entry) {
  const timestamp = Date.parse(entry.last_confirmed_at || entry.updated_at || entry.created_at || '');
  if (!Number.isFinite(timestamp)) return 'old_but_relevant';
  const days = Math.max(0, (Date.now() - timestamp) / 86400000);
  if (days <= 1) return 'today';
  if (days <= 90) return 'recent';
  return 'old_but_relevant';
}

function priority(entry) {
  if (entry.memory_level === 'core') return 'high';
  if (entry.entry_type === 'seed') return 'medium';
  return entry.source_confidence === 'low' ? 'low' : 'medium';
}

function policyFor(entry, mode) {
  const policies = entry.facet_policy && typeof entry.facet_policy === 'object' ? entry.facet_policy : {};
  const policy = policies[mode] && typeof policies[mode] === 'object' ? policies[mode] : {};
  return {
    use_hint: clipped(policy.use_hint || entry.usage_hint || MODE_HINTS[mode] || MODE_HINTS.normal_chat, 800),
    avoid_hint: clipped([
      policy.avoid_hint || entry.avoid_hint,
      entry.contradiction_note ? `可能冲突：${entry.contradiction_note}；不可压过当前输入` : '',
    ].filter(Boolean).join('；'), 1000),
    rendered_text: clipped(policy.summary_override || entry.life_core || entry.content || entry.title, 1200),
  };
}

export function buildMemoryFacets(result, mode = 'normal_chat', manifest = null) {
  const seen = new Set();
  const facets = [];
  for (const pool of POOL_KEYS) {
    for (const entry of Array.isArray(result?.[pool]) ? result[pool] : []) {
      if (!entry?.id || seen.has(entry.id) || entry.superseded === true) continue;
      seen.add(entry.id);
      const policy = policyFor(entry, mode);
      facets.push({
        entry_id: entry.id,
        mode,
        source: entry.source_type || (pool.includes('pocket') ? 'confirmed_pocket' : 'memory_library'),
        scope: entry.scope || (pool.startsWith('global') ? 'global' : 'current_conversation'),
        priority: priority(entry),
        freshness: freshness(entry),
        confidence: entry.source_confidence || (entry.user_confirmed ? 'user_confirmed' : 'model_inferred'),
        use_hint: policy.use_hint,
        avoid_hint: policy.avoid_hint,
        rendered_text: policy.rendered_text,
        contradiction: Boolean(entry.contradiction_note),
        trace: { pool, memory_tags: entry.memory_tags || [], manifest_key: manifest?.key || null },
      });
    }
  }
  return facets;
}

export function formatMemoryFacetContext(facets = []) {
  if (!facets.length) return '';
  return [
    '【记忆球｜当前情境面】',
    ...facets.map((facet) => [
      `- ${facet.rendered_text}`,
      `  使用：${facet.use_hint}`,
      facet.avoid_hint ? `  避免：${facet.avoid_hint}` : '',
      `  来源：${facet.source}｜置信度：${facet.confidence}｜新旧：${facet.freshness}`,
    ].filter(Boolean).join('\n')),
    '这些是情境化参考面；当前用户输入始终优先。',
  ].join('\n');
}

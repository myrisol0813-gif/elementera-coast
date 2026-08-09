const PRIORITIES = new Set(['critical', 'high', 'medium', 'low']);
const FRESHNESS = new Set(['live', 'today', 'recent', 'old_but_relevant', 'stale', 'archived', 'deprecated']);
const CONFIDENCES = new Set(['user_confirmed', 'system_confirmed', 'model_inferred', 'imported', 'low']);
const SCOPES = new Set([
  'current_runtime', 'current_conversation', 'global', 'project', 'calendar',
  'mailbox', 'visitor', 'cross_surface', 'lighthouse', 'radio', 'official_mcp', 'daily', 'room',
]);

function clip(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

export function contextBlock(value = {}) {
  const body = clip(value.body, 24000);
  if (!body) return null;
  return {
    key: clip(value.key, 100),
    title: clip(value.title, 160),
    body,
    source: clip(value.source, 160) || 'runtime',
    scope: SCOPES.has(value.scope) ? value.scope : 'current_runtime',
    priority: PRIORITIES.has(value.priority) ? value.priority : 'medium',
    freshness: FRESHNESS.has(value.freshness) ? value.freshness : 'live',
    confidence: CONFIDENCES.has(value.confidence) ? value.confidence : 'system_confirmed',
    use_hint: clip(value.use_hint, 800),
    avoid_hint: clip(value.avoid_hint, 800),
    trace: value.trace && typeof value.trace === 'object' && !Array.isArray(value.trace) ? value.trace : {},
  };
}

function manifestLine(block) {
  const hints = [
    `- ${block.key}｜priority=${block.priority}｜scope=${block.scope}`,
    block.use_hint ? `use=${block.use_hint}` : '',
    block.avoid_hint ? `do_not=${block.avoid_hint}` : '',
  ].filter(Boolean);
  return hints.join('｜');
}

export function buildContextManifest({
  surface = 'main_chat',
  roomLabel = '主聊天',
  mode,
  intentSummary = '承接当前对话，以当前用户输入为最高优先级。',
  blocks = [],
  visitorSafe = false,
} = {}) {
  const usable = blocks.filter((block) => block?.body);
  const contradictions = usable.filter((block) => block.trace?.contradiction_count > 0);
  const contradictionCount = contradictions.reduce((sum, block) => sum + Number(block.trace.contradiction_count || 0), 0);
  const body = [
    '【上下文目录】',
    `当前房间：${roomLabel || surface}`,
    `当前情境：${mode?.title || mode?.mode_key || '普通聊天'}`,
    `本轮意图：${clip(intentSummary, 180)}`,
    '最高优先：当前用户输入。',
    ...(usable.length ? ['可参考块：', ...usable.map(manifestLine)] : []),
    ...(contradictionCount ? [`冲突提示：${contradictionCount} 条记忆可能冲突，不可压过当前输入。`] : []),
    '禁止误用：',
    '- 不要创建多个 Myri。',
    ...(visitorSafe
      ? [
        '- 只能使用当前 visitor_id 的内容，不得暗示看见 owner 或其他访客。',
        '- 待确认候选不是长期记忆。',
      ]
      : [
        '- 不要为了使用记忆而使用记忆。',
        '- 不要把旧记忆压过当前输入。',
        '- 不要汇报“我召回了某某记忆”，除非用户问。',
      ]),
  ].join('\n');
  return contextBlock({
    key: 'context_manifest',
    title: 'Context Manifest',
    body,
    source: 'context_assembler',
    scope: 'current_runtime',
    priority: 'critical',
    freshness: 'live',
    confidence: 'system_confirmed',
    use_hint: '把它当成本轮上下文地图；当前用户输入永远最高。',
    avoid_hint: '目录不是事实正文，也不要向用户逐条汇报目录。',
    trace: {
      surface,
      intent_summary: clip(intentSummary, 180),
      block_keys: usable.map((block) => block.key),
      contradiction_count: contradictionCount,
      visitor_safe: visitorSafe,
    },
  });
}

export function formatContextBlocks(blocks = []) {
  return blocks.filter((block) => block?.body).map((block) => [
    block.body,
    `〔metadata｜key=${block.key}｜source=${block.source}｜scope=${block.scope}｜priority=${block.priority}｜freshness=${block.freshness}｜confidence=${block.confidence}〕`,
    block.use_hint ? `〔use｜${block.use_hint}〕` : '',
    block.avoid_hint ? `〔avoid｜${block.avoid_hint}〕` : '',
  ].filter(Boolean).join('\n')).join('\n\n');
}

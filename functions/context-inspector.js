export function buildContextDebug({ manifest, blocks, trace, tools, memory, worldbook, facets, ambient, mode } = {}) {
  return {
    manifest,
    ambient: ambient || null,
    mode: mode || null,
    blocks: (blocks || []).map((block) => ({
      key: block.key,
      title: block.title,
      body: block.body,
      source: block.source,
      scope: block.scope,
      priority: block.priority,
      freshness: block.freshness,
      confidence: block.confidence,
      use_hint: block.use_hint,
      avoid_hint: block.avoid_hint,
      trace: block.trace,
      sensitive: ['thinking_soil', 'memory_facets', 'memory_recall', 'cross_surface'].includes(block.key),
    })),
    worldbook_matches: (worldbook || []).map((entry) => ({ id: entry.id, title: entry.title, matched_keywords: entry.matched_keywords, priority: entry.priority })),
    memory_facets: facets || [],
    tools: tools || [],
    budget: trace || {},
    selected_memory_ids: memory?.trace?.selected || [],
    vector_enabled: Boolean(memory?.trace?.vector_enabled),
    generated_at: new Date().toISOString(),
  };
}

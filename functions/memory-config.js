export const MEMORY_CONFIG = Object.freeze({
  owner: 'owner',
  soil: Object.freeze({
    enabled: true,
    autoRefreshEveryTurns: 4,
    maxHandSeeds: 7,
    contextBudget: 1200,
  }),
  recall: Object.freeze({
    conversationSeedLimit: 3,
    conversationSeedStallLimit: 4,
    globalSeedLimit: 1,
    conversationMemoryLimit: 2,
    globalMemoryLimit: 1,
    seedCooldownTurns: 2,
    maxInjectedEntries: 8,
  }),
  vector: Object.freeze({
    model: '@cf/baai/bge-m3',
    version: 'workers-ai-bge-m3-v1',
    metric: 'cosine',
    index: 'elementera-coast-memory-v1',
    binding: 'COAST_MEMORY_VECTOR',
    retryAfterMs: 15 * 60 * 1000,
  }),
});

function integer(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.trunc(number))) : fallback;
}

export function recallSettings(value = {}) {
  const defaults = MEMORY_CONFIG.recall;
  return {
    conversationSeedLimit: integer(value.conversationSeedLimit, defaults.conversationSeedLimit, 0, 6),
    conversationSeedStallLimit: integer(value.conversationSeedStallLimit, defaults.conversationSeedStallLimit, 0, 6),
    globalSeedLimit: integer(value.globalSeedLimit, defaults.globalSeedLimit, 0, 6),
    conversationMemoryLimit: integer(value.conversationMemoryLimit, defaults.conversationMemoryLimit, 0, 6),
    globalMemoryLimit: integer(value.globalMemoryLimit, defaults.globalMemoryLimit, 0, 6),
    seedCooldownTurns: integer(value.seedCooldownTurns, defaults.seedCooldownTurns, 0, 8),
    maxInjectedEntries: defaults.maxInjectedEntries,
    soilBudget: integer(value.soilBudget, MEMORY_CONFIG.soil.contextBudget, 200, 2400),
  };
}

export function soilSettings(value = {}) {
  const defaults = MEMORY_CONFIG.soil;
  return {
    autoRefreshEveryTurns: integer(value.autoRefreshEveryTurns, defaults.autoRefreshEveryTurns, 1, 12),
    maxHandSeeds: integer(value.maxHandSeeds, defaults.maxHandSeeds, 1, 7),
    soilBudget: integer(value.soilBudget, defaults.contextBudget, 200, 2400),
  };
}

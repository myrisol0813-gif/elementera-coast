import { embedText, hasAiBinding, hasVectorBinding, queryVector, syncPendingEntries } from './embedding.js';
import { MEMORY_CONFIG, recallSettings, soilSettings } from './memory-config.js';
import {
  entriesByIds,
  listEntries,
  listRecallPool,
  markEntriesRecalled,
  readSoil,
} from './memory-store.js';

const POOLS = Object.freeze([
  { key: 'conversation_seeds', scope: 'conversation', entryType: 'seed', threshold: 0.46 },
  { key: 'conversation_memories', scope: 'conversation', entryType: 'memory', threshold: 0.54 },
  { key: 'global_seeds', scope: 'global', entryType: 'seed', threshold: 0.72 },
  { key: 'global_memories', scope: 'global', entryType: 'memory', threshold: 0.76 },
]);

function lower(value) {
  return String(value || '').toLocaleLowerCase('zh-CN').trim();
}

function keywordScore(entry, query) {
  const needle = lower(query);
  if (!needle) return 0;
  const title = lower(entry.title);
  const lifeCore = lower(entry.life_core);
  const content = lower(entry.content);
  const usage = lower(entry.usage_hint);
  if (title === needle) return 1;
  if (title.includes(needle)) return 0.96;
  if (lifeCore.includes(needle)) return 0.92;
  if (content.includes(needle)) return 0.8;
  if (usage.includes(needle)) return 0.72;
  const tokens = [...new Set(needle.split(/[\s,，。！？!?、:：;；]+/).filter((token) => token.length >= 2))].slice(0, 10);
  if (!tokens.length) return 0;
  const haystack = `${title} ${lifeCore} ${content} ${usage}`;
  const matched = tokens.filter((token) => haystack.includes(token)).length;
  return matched ? 0.48 + (matched / tokens.length) * 0.36 : 0;
}

function isStallQuery(query) {
  return /^(继续|还有吗|还有呢|聊什么|说什么|没东西说了|不知道聊什么|继续吧)[。.!！?？\s]*$/u.test(String(query || '').trim());
}

function isExplicitRecall(query) {
  return /(你还记得|还记得吗|回想|找一下.*记忆|搜索.*记忆|记忆里|种子库|总记忆)/u.test(String(query || ''));
}

function poolLimit(pool, settings, { stall, explicit }) {
  if (pool.key === 'conversation_seeds') return stall
    ? settings.conversationSeedStallLimit
    : settings.conversationSeedLimit;
  if (pool.key === 'global_seeds') return explicit ? Math.max(3, settings.globalSeedLimit) : settings.globalSeedLimit;
  if (pool.key === 'conversation_memories') return settings.conversationMemoryLimit;
  if (pool.key === 'global_memories') return explicit ? Math.max(5, settings.globalMemoryLimit) : settings.globalMemoryLimit;
  return 0;
}

function vectorFilter(pool, conversationId) {
  return {
    user_id: MEMORY_CONFIG.owner,
    entry_type: pool.entryType,
    scope: pool.scope,
    ...(pool.scope === 'conversation' ? { conversation_id: conversationId } : { conversation_id: '' }),
  };
}

async function retrievePool(env, db, pool, conversationId, query, queryValues, recentIds, options) {
  const entries = await listRecallPool(db, {
    conversation_id: conversationId,
    entry_type: pool.entryType,
    scope: pool.scope,
  });
  let semantic = [];
  let vectorError = null;
  if (queryValues) {
    try {
      semantic = await queryVector(env, query, {
        values: queryValues,
        topK: 30,
        filter: vectorFilter(pool, conversationId),
      });
    } catch (error) {
      vectorError = String(error?.message || 'vector_query_failed').slice(0, 100);
    }
  }
  const semanticScores = new Map(semantic.map((match) => [match.id, match.score]));
  const explicit = options.explicit;
  const threshold = options.stall && pool.key === 'conversation_seeds'
    ? 0.32
    : explicit ? Math.max(0.42, pool.threshold - 0.18) : pool.threshold;
  const ranked = entries.map((entry) => {
    const keyword = keywordScore(entry, query);
    const semanticScore = entry.embedding_status === 'ready' ? semanticScores.get(entry.id) || 0 : 0;
    const score = Math.max(keyword, semanticScore) + Math.min(keyword, semanticScore) * 0.12;
    return {
      entry,
      score,
      reason: keyword >= semanticScore && keyword > 0 ? 'keyword' : semanticScore > 0 ? 'semantic' : 'none',
    };
  }).filter((candidate) => {
    if (candidate.score < threshold) return false;
    if (!recentIds.has(candidate.entry.id)) return true;
    if (explicit) return true;
    return pool.scope === 'conversation' && pool.entryType === 'memory';
  }).sort((left, right) => right.score - left.score || Date.parse(right.entry.updated_at || 0) - Date.parse(left.entry.updated_at || 0));
  const limit = poolLimit(pool, options.settings, options);
  return {
    entries: ranked.slice(0, limit).map((candidate) => candidate.entry),
    trace: {
      pool: pool.key,
      d1_candidates: entries.length,
      vector_candidates: semantic.length,
      selected: ranked.slice(0, limit).map((candidate) => ({ id: candidate.entry.id, score: candidate.score, reason: candidate.reason })),
      ...(vectorError ? { vector_error: vectorError } : {}),
    },
  };
}

export async function buildMemoryContext(env, owner, conversationId, query, options = {}) {
  if (owner !== MEMORY_CONFIG.owner) throw new Error('memory_owner_invalid');
  const db = env.COAST_CHAT_DB;
  const settings = recallSettings(options.settings || {});
  const recentIds = new Set((Array.isArray(options.recent_entry_ids) ? options.recent_entry_ids : []).map(String));
  const explicit = options.mode === 'explicit' || isExplicitRecall(query);
  const stall = isStallQuery(query) || Number(options.conversation_turns || 0) <= 2;
  const vectorEnabled = hasAiBinding(env) && hasVectorBinding(env);
  let queryValues = null;
  let vectorError = null;
  if (vectorEnabled && String(query || '').trim()) {
    try {
      await syncPendingEntries(env, db, 4);
      queryValues = await embedText(env, query);
    } catch (error) {
      vectorError = String(error?.message || 'embedding_failed').slice(0, 100);
    }
  }

  const results = {};
  const traces = [];
  for (const pool of POOLS) {
    const result = await retrievePool(env, db, pool, conversationId, query, queryValues, recentIds, {
      explicit,
      stall,
      settings,
    });
    results[pool.key] = result.entries;
    traces.push(result.trace);
  }

  if (options.mode !== 'explicit') {
    let remaining = settings.maxInjectedEntries;
    for (const pool of POOLS) {
      results[pool.key] = results[pool.key].slice(0, remaining);
      remaining -= results[pool.key].length;
    }
  }
  const selectedIds = POOLS.flatMap((pool) => results[pool.key].map((entry) => entry.id));
  if (options.mode !== 'explicit') await markEntriesRecalled(db, selectedIds);
  return {
    ...results,
    soil: await readSoil(db, conversationId),
    trace: {
      vector_enabled: vectorEnabled,
      candidates: traces,
      selected: selectedIds,
      reasons: {
        explicit,
        stall,
        cooldown_entry_ids: [...recentIds],
        ...(vectorError ? { vector_error: vectorError } : {}),
      },
    },
  };
}

function clipped(value, max) {
  return String(value || '').trim().slice(0, max);
}

function seedLine(entry) {
  return `- ${clipped(entry.title, 100)}｜${clipped(entry.life_core, 480)}${entry.usage_hint ? `｜使用：${clipped(entry.usage_hint, 240)}` : ''}${entry.avoid_hint ? `｜避免：${clipped(entry.avoid_hint, 240)}` : ''}`;
}

function memoryLine(entry) {
  return `- ${clipped(entry.title, 100)}｜${clipped(entry.life_core, 520)}${entry.avoid_hint ? `｜避免：${clipped(entry.avoid_hint, 240)}` : ''}`;
}

export function formatMemoryContext(result, rawSettings = {}) {
  const settings = recallSettings(rawSettings);
  const soilControl = soilSettings(rawSettings);
  const soil = result?.soil || {};
  const blocks = [];
  const soilLines = [
    '【思维壤｜当前窗口的轻量便签，不是规则】',
    `当前：${clipped(soil.current_text, settings.soilBudget) || '未整理'}`,
  ];
  if (soil.hand_seeds?.length) {
    soilLines.push('手持种：', ...soil.hand_seeds.slice(0, soilControl.maxHandSeeds).map((seed) => `- ${clipped(seed.name, 80)}｜${clipped(seed.life_core, 320)}`));
  }
  if (soil.do_not_repeat) soilLines.push(`勿复读：${clipped(soil.do_not_repeat, 600)}`);
  const soilPriority = '请只作为当前对话方向参考；当前用户输入优先。';
  const soilBody = soilLines.join('\n').slice(0, Math.max(0, settings.soilBudget - soilPriority.length - 1));
  blocks.push(`${soilBody}\n${soilPriority}`);

  const optional = ['【可选上下文｜不要求逐条复述】'];
  if (result.conversation_seeds?.length) optional.push('当前窗口种子：', ...result.conversation_seeds.map(seedLine));
  if (result.conversation_memories?.length) optional.push('当前窗口记忆：', ...result.conversation_memories.map(memoryLine));
  const global = [
    ...(result.global_seeds || []).map(seedLine),
    ...(result.global_memories || []).map(memoryLine),
  ];
  if (global.length) optional.push('跨窗口可用：', ...global);
  if (optional.length > 1) {
    optional.push(
      '约束：当前用户输入优先。不要为了使用记忆而使用记忆，也不要汇报“召回了记忆”。',
      '若内容与当前输入冲突，以当前输入与最新修订为准；必须尊重避免提示。',
    );
    blocks.push(optional.join('\n'));
  }
  return blocks.filter(Boolean).join('\n\n');
}

export async function searchMemory(env, owner, value = {}) {
  if (owner !== MEMORY_CONFIG.owner) throw new Error('memory_owner_invalid');
  const db = env.COAST_CHAT_DB;
  const scope = value.scope === 'global' ? 'global' : 'conversation';
  const query = String(value.query || value.q || '').trim().slice(0, 240);
  const limit = Math.min(100, Math.max(1, Number(value.limit) || 40));
  const keyword = await listEntries(db, {
    conversation_id: value.conversation_id,
    scope,
    entry_type: value.entry_type || '',
    status: value.status || '',
    q: query,
    limit,
  });
  const vectorEnabled = Boolean(query) && hasAiBinding(env) && hasVectorBinding(env)
    && (!value.status || ['active', 'dormant'].includes(value.status));
  let matches = [];
  let vectorError = null;
  if (vectorEnabled) {
    try {
      const filter = {
        user_id: MEMORY_CONFIG.owner,
        scope,
        conversation_id: scope === 'conversation' ? value.conversation_id : '',
        ...(value.entry_type ? { entry_type: value.entry_type } : {}),
      };
      matches = await queryVector(env, query, { topK: Math.min(40, limit), filter });
    } catch (error) {
      vectorError = String(error?.message || 'vector_query_failed').slice(0, 100);
    }
  }
  const semanticEntries = await entriesByIds(db, matches.map((match) => match.id));
  const validSemantic = semanticEntries.filter((entry) => entry.embedding_status === 'ready'
    && entry.scope === scope
    && (scope !== 'conversation' || entry.conversation_id === value.conversation_id)
    && (!value.entry_type || entry.entry_type === value.entry_type)
    && (!value.status || entry.status === value.status));
  const merged = new Map();
  for (const entry of validSemantic) merged.set(entry.id, entry);
  for (const entry of keyword.entries) merged.set(entry.id, entry);
  return {
    entries: [...merged.values()].slice(0, limit),
    trace: {
      vector_enabled: vectorEnabled,
      candidates: { vector: matches.length, keyword: keyword.entries.length },
      selected: [...merged.keys()].slice(0, limit),
      reasons: vectorError ? { vector_error: vectorError } : {},
    },
  };
}

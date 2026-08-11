import { embedText, hasAiBinding, hasVectorBinding, queryVector, syncPendingEntries } from './embedding.js';
import { MEMORY_CONFIG, recallSettings } from './memory-config.js';
import {
  entriesByIds,
  listEntries,
  listRecallPocketPool,
  listRecallPool,
  markEntriesRecalled,
  readSoil,
} from './memory-store.js';
import { formatThinkingSoil } from './thinking-soil.js';

const POOLS = Object.freeze([
  { key: 'conversation_seeds', scope: 'conversation', entryType: 'seed', threshold: 0.46 },
  { key: 'conversation_memories', scope: 'conversation', entryType: 'memory', threshold: 0.54 },
  { key: 'conversation_pockets', scope: 'conversation', entryType: 'pocket', threshold: 0.60 },
  { key: 'global_seeds', scope: 'global', entryType: 'seed', threshold: 0.72 },
  { key: 'global_memories', scope: 'global', entryType: 'memory', threshold: 0.76 },
  { key: 'global_pockets', scope: 'global', entryType: 'pocket', threshold: 0.86 },
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
  if (title.length >= 2 && needle.includes(title)) return 0.98;
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
  return /(你还记得|还记得吗|回想|找一下.*记忆|搜索.*记忆|记忆里|种子库|总记忆|落袋|袋里|放下的东西|历史版本|旧版本|被替代的记忆)/u.test(String(query || ''));
}

function ageDays(value) {
  const timestamp = Date.parse(String(value || ''));
  return Number.isFinite(timestamp) ? Math.max(0, (Date.now() - timestamp) / 86400000) : 365;
}

function recencyAdjustment(entry) {
  const referenceAge = ageDays(entry.last_confirmed_at || entry.updated_at);
  const protectedMemory = entry.memory_level === 'core'
    || ageDays(entry.last_confirmed_at) <= 60;
  return referenceAge <= 14
    ? 0.015
    : -Math.min(protectedMemory ? 0.045 : 0.14, Math.log2(1 + referenceAge / 45) * 0.028);
}

function topicKey(entry) {
  const tagged = Array.isArray(entry.memory_tags) ? entry.memory_tags[0] : '';
  return lower(tagged || entry.title).replace(/[\s\p{P}\p{S}]+/gu, '').slice(0, 80);
}

function poolLimit(pool, settings, { stall, explicit }) {
  if (pool.key === 'conversation_seeds') return stall
    ? settings.conversationSeedStallLimit
    : settings.conversationSeedLimit;
  if (pool.key === 'global_seeds') return explicit ? Math.max(3, settings.globalSeedLimit) : settings.globalSeedLimit;
  if (pool.key === 'conversation_memories') return settings.conversationMemoryLimit;
  if (pool.key === 'global_memories') return explicit ? Math.max(5, settings.globalMemoryLimit) : settings.globalMemoryLimit;
  if (pool.key === 'conversation_pockets') return settings.conversationPocketLimit;
  if (pool.key === 'global_pockets') return explicit ? Math.max(2, settings.globalPocketLimit) : settings.globalPocketLimit;
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
  const entries = pool.entryType === 'pocket'
    ? await listRecallPocketPool(db, {
      conversation_id: conversationId,
      scope: pool.scope,
      include_superseded: options.explicit,
    })
    : await listRecallPool(db, {
      conversation_id: conversationId,
      entry_type: pool.entryType,
      scope: pool.scope,
      include_superseded: options.explicit,
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
    const score = Math.max(0, Math.max(keyword, semanticScore) + Math.min(keyword, semanticScore) * 0.12 + recencyAdjustment(entry));
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
    selected: ranked.slice(0, limit).map((candidate) => candidate.entry.id),
    vector_error: vectorError,
  };
}

export async function buildMemoryContext(env, owner, conversationId, query, options = {}) {
  if (owner !== MEMORY_CONFIG.owner) throw new Error('memory_owner_invalid');
  const db = env.COAST_CHAT_DB;
  const settings = recallSettings(options.settings || {});
  const recentIds = new Set((Array.isArray(options.recent_entry_ids) ? options.recent_entry_ids : []).map(String));
  const explicit = options.explicit === true || isExplicitRecall(query);
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

  const pools = POOLS.filter((pool) => pool.scope !== 'global' || options.include_global !== false);
  const results = Object.fromEntries(POOLS.map((pool) => [pool.key, []]));
  const selectedAcrossPools = new Set();
  const selectedTopics = new Set();
  for (const pool of pools) {
    const result = await retrievePool(env, db, pool, conversationId, query, queryValues, recentIds, {
      explicit,
      stall,
      settings,
    });
    results[pool.key] = result.entries.filter((entry) => {
      if (selectedAcrossPools.has(entry.id)) return false;
      const topic = topicKey(entry);
      if (topic && selectedTopics.has(topic)) return false;
      selectedAcrossPools.add(entry.id);
      if (topic) selectedTopics.add(topic);
      return true;
    });
  }

  if (!explicit) {
    let remaining = settings.maxInjectedEntries;
    for (const pool of pools) {
      results[pool.key] = results[pool.key].slice(0, remaining);
      remaining -= results[pool.key].length;
    }
  }
  const selectedIds = pools.flatMap((pool) => results[pool.key].map((entry) => entry.id));
  if (!explicit && options.record_recall !== false) await markEntriesRecalled(db, selectedIds);
  return {
    ...results,
    soil: await readSoil(db, conversationId),
    selected_ids: selectedIds,
    vector_enabled: vectorEnabled,
    ...(vectorError ? { vector_error: vectorError } : {}),
  };
}

function clipped(value, max) {
  return String(value || '').trim().slice(0, max);
}

function cleanMemoryLine(entry) {
  const title = clipped(entry?.title, 100);
  const core = clipped(entry?.life_core || entry?.content, 520);
  return [title, core].filter(Boolean).join('｜');
}

export function formatMemoryContext(result, rawSettings = {}) {
  return [
    formatThinkingSoil(result?.soil, { maxCharacters: recallSettings(rawSettings).soilBudget }),
    formatRecallMemoryContext(result),
  ].filter(Boolean).join('\n\n');
}

export function formatSoilContext(result, rawSettings = {}) {
  return formatThinkingSoil(result?.soil, { maxCharacters: recallSettings(rawSettings).soilBudget });
}

export function recallMemoryItems(result) {
  return [
    ...(result?.conversation_seeds || []),
    ...(result?.conversation_memories || []),
    ...(result?.conversation_pockets || []),
    ...(result?.global_seeds || []),
    ...(result?.global_memories || []),
    ...(result?.global_pockets || []),
    ...(result?.visitor_memories || []),
  ].map(cleanMemoryLine).filter(Boolean);
}

export function formatRecallMemoryContext(result) {
  const items = recallMemoryItems(result);
  return items.length ? ['【相关记忆】', ...items.map((item) => `- ${item}`)].join('\n') : '';
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
    vector_enabled: vectorEnabled,
    ...(vectorError ? { vector_error: vectorError } : {}),
  };
}

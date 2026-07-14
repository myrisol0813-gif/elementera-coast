import { MEMORY_CONFIG } from './memory-config.js';
import {
  embeddingCounts,
  pendingEmbeddingEntries,
  pendingEmbeddingPockets,
  updateEmbeddingState,
  updatePocketEmbeddingState,
} from './memory-store.js';

const dimensionPromises = new WeakMap();

export function hasAiBinding(env) {
  return Boolean(env?.AI && typeof env.AI.run === 'function');
}

export function hasVectorBinding(env) {
  return Boolean(
    env?.COAST_MEMORY_VECTOR
    && typeof env.COAST_MEMORY_VECTOR.query === 'function'
    && typeof env.COAST_MEMORY_VECTOR.upsert === 'function',
  );
}

function normalizedVector(result) {
  const candidates = [
    result?.data,
    result?.result?.data,
    result?.embeddings,
    result?.result?.embeddings,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate?.[0])) {
      const vector = candidate[0].map(Number);
      if (vector.length && vector.every(Number.isFinite)) return vector;
    }
    if (Array.isArray(candidate) && candidate.length && candidate.every((item) => Number.isFinite(Number(item)))) {
      return candidate.map(Number);
    }
  }
  throw new Error('embedding_shape_invalid');
}

export async function embedText(env, text) {
  if (!hasAiBinding(env)) throw new Error('ai_binding_missing');
  const result = await env.AI.run(MEMORY_CONFIG.vector.model, { text: [String(text || '').slice(0, 12000)] });
  return normalizedVector(result);
}

export async function detectEmbeddingDimensions(env) {
  if (!hasAiBinding(env)) return null;
  let ready = dimensionPromises.get(env.AI);
  if (!ready) {
    ready = embedText(env, '维度测试').then((vector) => vector.length);
    dimensionPromises.set(env.AI, ready);
  }
  try {
    return await ready;
  } catch (error) {
    dimensionPromises.delete(env.AI);
    throw error;
  }
}

export function embeddingText(entry) {
  const fields = entry.entry_type === 'seed'
    ? [entry.title, entry.life_core, entry.usage_hint, entry.avoid_hint]
    : [entry.title, entry.life_core, entry.content, entry.usage_hint, entry.avoid_hint];
  return fields.map((field) => String(field || '').trim()).filter(Boolean).join('\n').slice(0, 12000);
}

function metadata(entry) {
  return {
    user_id: MEMORY_CONFIG.owner,
    entry_id: entry.id,
    entry_type: entry.entry_type,
    scope: entry.scope,
    conversation_id: entry.conversation_id || '',
    status: entry.status,
    memory_level: entry.memory_level,
  };
}

export function pocketVectorIds(pocket) {
  return [`${pocket.id}:conversation`, `${pocket.id}:global`];
}

function isCanonicalPocket(pocket) {
  return pocket?.status === 'confirmed' && !pocket.resolved_entry_id;
}

function pocketMetadata(pocket, scope) {
  return {
    user_id: MEMORY_CONFIG.owner,
    entry_id: pocket.id,
    source_entry_id: pocket.id,
    entry_type: 'pocket',
    scope,
    conversation_id: scope === 'conversation' ? pocket.conversation_id : '',
    status: pocket.status,
  };
}

export async function deleteEntryVector(env, entry) {
  if (!entry?.vector_id || !hasVectorBinding(env) || typeof env.COAST_MEMORY_VECTOR.deleteByIds !== 'function') {
    return { deleted: false, reason: 'vector_not_connected' };
  }
  try {
    await env.COAST_MEMORY_VECTOR.deleteByIds([entry.vector_id]);
    return { deleted: true };
  } catch (error) {
    console.error('[memory-vector:delete]', error);
    return { deleted: false, reason: 'vector_delete_failed' };
  }
}

export async function deletePocketVectors(env, pocket) {
  const storedIds = Array.isArray(pocket?.vector_ids) ? pocket.vector_ids : [];
  const ids = [...new Set((storedIds.length ? storedIds : isCanonicalPocket(pocket) ? pocketVectorIds(pocket) : []).filter(Boolean))];
  if (!ids.length || !hasVectorBinding(env) || typeof env.COAST_MEMORY_VECTOR.deleteByIds !== 'function') {
    return { deleted: false, ids, reason: 'vector_not_connected' };
  }
  try {
    await env.COAST_MEMORY_VECTOR.deleteByIds(ids);
    return { deleted: true, ids };
  } catch (error) {
    console.error('[pocket-vector:delete]', error);
    return { deleted: false, ids, reason: 'vector_delete_failed' };
  }
}

export async function syncEntryVector(env, db, entry) {
  if (!entry?.user_confirmed || entry.deleted_at) return { entry, indexed: false, reason: 'not_confirmed' };
  if (!['active', 'dormant'].includes(entry.status)) {
    const removal = await deleteEntryVector(env, entry);
    const updated = await updateEmbeddingState(db, entry.id, {
      vector_id: removal.deleted ? null : entry.vector_id,
      embedding_status: removal.deleted ? 'pending' : entry.embedding_status,
      embedded_at: removal.deleted ? null : undefined,
    });
    return { entry: updated, indexed: false, reason: 'status_not_recallable' };
  }
  if (!hasAiBinding(env) || !hasVectorBinding(env)) return { entry, indexed: false, reason: 'vector_not_connected' };
  try {
    const values = await embedText(env, embeddingText(entry));
    const vectorId = entry.vector_id || entry.id;
    await env.COAST_MEMORY_VECTOR.upsert([{
      id: vectorId,
      values,
      metadata: metadata(entry),
    }]);
    const updated = await updateEmbeddingState(db, entry.id, {
      vector_id: vectorId,
      embedding_model: MEMORY_CONFIG.vector.model,
      embedding_version: MEMORY_CONFIG.vector.version,
      embedding_status: 'ready',
      embedded_at: Date.now(),
    });
    return { entry: updated, indexed: true, dimensions: values.length };
  } catch (error) {
    console.error('[memory-vector:upsert]', error);
    const updated = await updateEmbeddingState(db, entry.id, {
      embedding_model: MEMORY_CONFIG.vector.model,
      embedding_version: MEMORY_CONFIG.vector.version,
      embedding_status: 'error',
    });
    return { entry: updated, indexed: false, reason: 'vector_upsert_failed' };
  }
}

export async function syncPocketVectors(env, db, pocket) {
  if (!pocket || pocket.deleted_at) return { pocket, indexed: false, reason: 'not_confirmed' };
  if (!isCanonicalPocket(pocket)) {
    const removal = await deletePocketVectors(env, pocket);
    const updated = await updatePocketEmbeddingState(db, pocket.id, {
      vector_ids: removal.deleted ? [] : pocket.vector_ids,
      embedding_status: removal.deleted ? 'pending' : pocket.embedding_status,
      embedded_at: removal.deleted ? null : undefined,
    });
    return { pocket: updated, indexed: false, reason: 'status_not_recallable' };
  }
  if (!hasAiBinding(env) || !hasVectorBinding(env)) return { pocket, indexed: false, reason: 'vector_not_connected' };
  try {
    const values = await embedText(env, embeddingText(pocket));
    const ids = pocketVectorIds(pocket);
    await env.COAST_MEMORY_VECTOR.upsert([
      { id: ids[0], values, metadata: pocketMetadata(pocket, 'conversation') },
      { id: ids[1], values, metadata: pocketMetadata(pocket, 'global') },
    ]);
    const updated = await updatePocketEmbeddingState(db, pocket.id, {
      vector_ids: ids,
      embedding_model: MEMORY_CONFIG.vector.model,
      embedding_version: MEMORY_CONFIG.vector.version,
      embedding_status: 'ready',
      embedded_at: Date.now(),
    });
    return { pocket: updated, indexed: true, dimensions: values.length, vector_ids: ids };
  } catch (error) {
    console.error('[pocket-vector:upsert]', error);
    const updated = await updatePocketEmbeddingState(db, pocket.id, {
      embedding_model: MEMORY_CONFIG.vector.model,
      embedding_version: MEMORY_CONFIG.vector.version,
      embedding_status: 'error',
    });
    return { pocket: updated, indexed: false, reason: 'vector_upsert_failed' };
  }
}

export async function syncPendingEntries(env, db, limit = 4) {
  if (!hasAiBinding(env) || !hasVectorBinding(env)) return [];
  const entries = await pendingEmbeddingEntries(db, limit);
  const pockets = await pendingEmbeddingPockets(db, limit);
  const queue = [
    ...entries.map((entry) => ({ kind: 'entry', value: entry })),
    ...pockets.map((pocket) => ({ kind: 'pocket', value: pocket })),
  ].sort((left, right) => Date.parse(left.value.updated_at || 0) - Date.parse(right.value.updated_at || 0)).slice(0, limit);
  const results = [];
  for (const item of queue) {
    results.push(item.kind === 'pocket'
      ? await syncPocketVectors(env, db, item.value)
      : await syncEntryVector(env, db, item.value));
  }
  return results;
}

export async function queryVector(env, query, { topK = 16, filter, values = null } = {}) {
  if (!hasAiBinding(env) || !hasVectorBinding(env)) return [];
  const vector = values || await embedText(env, query);
  const result = await env.COAST_MEMORY_VECTOR.query(vector, {
    topK: Math.min(40, Math.max(1, Number(topK) || 16)),
    returnMetadata: 'all',
    ...(filter ? { filter } : {}),
  });
  return (Array.isArray(result?.matches) ? result.matches : []).map((match) => ({
    id: String(match.metadata?.source_entry_id || match.metadata?.entry_id || match.id || ''),
    score: Number(match.score || 0),
    metadata: match.metadata || {},
  })).filter((match) => match.id);
}

export async function vectorStatus(env) {
  const aiBinding = hasAiBinding(env);
  const vectorBinding = hasVectorBinding(env);
  const counts = env?.COAST_CHAT_DB ? await embeddingCounts(env.COAST_CHAT_DB) : { pending: 0, ready: 0, error: 0 };
  let detectedDimensions = null;
  let probeError = null;
  if (aiBinding) {
    try {
      detectedDimensions = await detectEmbeddingDimensions(env);
    } catch (error) {
      probeError = String(error?.message || 'embedding_probe_failed').slice(0, 120);
    }
  }
  return {
    ai_binding: aiBinding,
    vector_binding: vectorBinding,
    embedding_model: MEMORY_CONFIG.vector.model,
    detected_dimensions: detectedDimensions,
    index_ready: vectorBinding,
    index_name: MEMORY_CONFIG.vector.index,
    binding_name: MEMORY_CONFIG.vector.binding,
    pending_count: counts.pending,
    error_count: counts.error,
    ready_count: counts.ready,
    ...(probeError ? { probe_error: probeError } : {}),
  };
}

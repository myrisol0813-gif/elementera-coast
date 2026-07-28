import { validateCoastIdentity } from './coast-identity.js';

export class CoastStoreError extends Error {
  constructor(type, message, status = 400) {
    super(message);
    this.name = 'CoastStoreError';
    this.type = type;
    this.status = status;
  }
}

export function clipText(value, max, field = '内容') {
  const text = String(value ?? '').trim().slice(0, max);
  if (!text) throw new CoastStoreError('missing_coast_field', `${field}不能为空。`);
  return text;
}

export function optionalText(value, max) {
  return String(value ?? '').trim().slice(0, max) || null;
}

export function limitValue(value, fallback = 50, max = 200) {
  const number = Math.trunc(Number(value || fallback));
  return Math.max(1, Math.min(Number.isFinite(number) ? number : fallback, max));
}

export function iso(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? new Date(number).toISOString() : null;
}

export function usageJson(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const prompt = Number(value.prompt_tokens);
  const completion = Number(value.completion_tokens);
  const total = Number(value.total_tokens);
  if (![prompt, completion, total].every(Number.isFinite)) return null;
  return JSON.stringify({
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: total,
  });
}

export function parseUsage(value) {
  try {
    const parsed = JSON.parse(value || 'null');
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function recordFields(value = {}) {
  let identity;
  try {
    identity = validateCoastIdentity(value.identity || {});
  } catch {
    throw new CoastStoreError('invalid_coast_identity', '海岸来源身份无效。');
  }
  return {
    ...identity,
    usage_json: usageJson(value.usage),
    source_conversation_id: optionalText(value.source_conversation_id, 200),
    source_turn_id: optionalText(value.source_turn_id, 200),
    tool_call_id: optionalText(value.tool_call_id, 240),
  };
}

export function provenanceFromRow(row) {
  return {
    actor: row.actor,
    surface: row.surface,
    model_label: row.model_label || null,
    model_nickname: row.model_nickname || null,
    symbol: row.symbol || '',
    display_author: row.display_author,
    usage: parseUsage(row.usage_json),
    source_conversation_id: row.source_conversation_id || null,
    source_turn_id: row.source_turn_id || null,
    tool_call_id: row.tool_call_id || null,
  };
}

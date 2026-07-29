import { listSummaries } from './daily-store.js';
import { organizedMemoryRecordsInRange } from './memory-store.js';
import { searchAuthoredSoils } from './official-soil-store.js';
import {
  buildSafeSearchQuery,
  rankSearchRecords,
  searchMetadata,
} from './search-query.js';

const FIRST_REASONABLE_TIMESTAMP = Date.UTC(2020, 0, 1);

function clip(value, max = 1200) {
  return String(value ?? '').trim().slice(0, max);
}

function currentSoilRecord(soil) {
  return {
    id: `conversation-soil:${soil.conversation_id}`,
    type: 'soil',
    title: soil.conversation_title || '窗口思维壤',
    content: clip(soil.current_text, 4000),
    hand_seeds: (soil.hand_seeds || []).slice(0, 7),
    do_not_repeat: clip(soil.do_not_repeat, 1200),
    actor: soil.actor || null,
    surface: soil.surface || null,
    model_label: soil.model_label || null,
    symbol: soil.symbol || '',
    display_author: soil.display_author || null,
    source_conversation_id: soil.source_conversation_id || soil.conversation_id,
    source_turn_id: soil.source_turn_id || null,
    created_at: soil.created_at,
    updated_at: soil.updated_at,
  };
}

function pocketRecord(pocket) {
  return {
    id: pocket.id,
    type: 'pocket',
    title: pocket.title || pocket.suggested_title || '落袋',
    content: clip(pocket.content || pocket.life_core || pocket.source_text, 4000),
    status: pocket.status,
    actor: pocket.source_ref?.actor || null,
    surface: pocket.source_ref?.surface || null,
    model_label: pocket.source_ref?.model_label || null,
    symbol: pocket.source_ref?.symbol || '',
    display_author: pocket.source_ref?.display_author || null,
    source_conversation_id: pocket.conversation_id || null,
    source_turn_id: pocket.source_ref?.turn_id || null,
    created_at: pocket.created_at,
    updated_at: pocket.updated_at,
  };
}

function entryRecord(entry) {
  return {
    id: entry.id,
    type: entry.entry_type,
    title: entry.title,
    content: clip(entry.content || entry.life_core, 4000),
    life_core: clip(entry.life_core, 2000),
    status: entry.status,
    scope: entry.scope,
    actor: entry.source_ref?.actor || null,
    surface: entry.source_ref?.surface || null,
    model_label: entry.source_ref?.model_label || null,
    symbol: entry.source_ref?.symbol || '',
    display_author: entry.source_ref?.display_author || null,
    source_conversation_id: entry.conversation_id || null,
    source_turn_id: entry.source_ref?.turn_id || null,
    created_at: entry.created_at,
    updated_at: entry.updated_at,
  };
}

function officialSoilRecord(soil) {
  return {
    id: soil.id,
    type: 'soil',
    title: '灯塔巡迹',
    content: soil.content,
    actor: soil.actor,
    surface: soil.surface,
    model_label: soil.model_label,
    model_nickname: soil.model_nickname,
    symbol: soil.symbol,
    display_author: soil.display_author,
    source_conversation_id: soil.source_conversation_id,
    source_turn_id: soil.source_turn_id,
    created_at: soil.created_at,
    updated_at: soil.updated_at,
  };
}

export async function searchOfficialSoilMemory(db, value = {}) {
  const search = buildSafeSearchQuery(value.query);
  const limit = Math.min(80, Math.max(1, Math.trunc(Number(value.limit || 30))));
  const records = (await searchAuthoredSoils(db, search.query, limit)).map(officialSoilRecord);
  return {
    query: search.query,
    records,
    search: searchMetadata(search),
  };
}

export async function searchAuthorizedMemory(db, value = {}) {
  const search = buildSafeSearchQuery(value.query);
  const limit = Math.min(80, Math.max(1, Math.trunc(Number(value.limit || 30))));
  const [official, organized] = await Promise.all([
    searchAuthoredSoils(db, search.query, limit),
    organizedMemoryRecordsInRange(db, {
      from: FIRST_REASONABLE_TIMESTAMP,
      to: Date.now() + 60_000,
    }),
  ]);
  const candidates = [
    ...official.map(officialSoilRecord),
    ...(organized.soils || []).map(currentSoilRecord),
    ...(organized.pockets || []).map(pocketRecord),
    ...(organized.entries || []).map(entryRecord),
  ];
  const records = rankSearchRecords(candidates, search)
    .sort((left, right) => Date.parse(right.updated_at || right.created_at || 0)
      - Date.parse(left.updated_at || left.created_at || 0))
    .slice(0, limit);
  return {
    query: search.query,
    records,
    search: searchMetadata(search),
  };
}

export async function getRecentDailySummary(db) {
  const summary = (await listSummaries(db, { limit: 1 }))[0] || null;
  return summary;
}

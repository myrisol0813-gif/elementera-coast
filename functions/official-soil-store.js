import { ensureCoastSchema } from './coast-schema.js';
import {
  CoastStoreError,
  clipText,
  iso,
  limitValue,
  provenanceFromRow,
  recordFields,
} from './coast-records.js';
import { buildSafeSearchQuery, rankSearchRecords } from './search-query.js';

const SEARCH_SCAN_LIMIT = 500;

function fromRow(row) {
  return {
    id: row.id,
    content: row.content,
    ...provenanceFromRow(row),
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  };
}

async function first(db, sql, params = []) {
  return db.prepare(sql).bind(...params).first();
}

async function all(db, sql, params = []) {
  const result = await db.prepare(sql).bind(...params).all();
  return result?.results || [];
}

export async function writeOfficialSoil(db, value = {}) {
  await ensureCoastSchema(db);
  const fields = recordFields(value);
  if (fields.surface !== 'official_mcp') {
    throw new CoastStoreError('official_soil_identity_required', '官端思维壤只能由 official_mcp 写入。', 403);
  }
  if (fields.tool_call_id) {
    const existing = await first(db, 'SELECT * FROM coast_soil_entries WHERE tool_call_id = ?', [fields.tool_call_id]);
    if (existing) return fromRow(existing);
  }
  const timestamp = Date.now();
  const id = `official-soil-${crypto.randomUUID()}`;
  await db.prepare(`INSERT INTO coast_soil_entries (
    id, content, actor, surface, model_label, model_nickname, symbol, display_author,
    usage_json, source_conversation_id, source_turn_id, tool_call_id, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    id,
    clipText(value.content ?? value.text, 12000, '思维壤'),
    fields.actor,
    fields.surface,
    fields.model_label,
    fields.model_nickname,
    fields.symbol,
    fields.display_author,
    null,
    fields.source_conversation_id,
    fields.source_turn_id,
    fields.tool_call_id,
    timestamp,
    timestamp,
  ).run();
  return fromRow(await first(db, 'SELECT * FROM coast_soil_entries WHERE id = ?', [id]));
}

export async function listOfficialSoils(db, { limit = 50 } = {}) {
  await ensureCoastSchema(db);
  const rows = await all(db, `SELECT * FROM coast_soil_entries
    WHERE surface = 'official_mcp'
    ORDER BY created_at DESC LIMIT ?`, [limitValue(limit)]);
  return rows.map(fromRow);
}

export async function searchAuthoredSoils(db, query = '', limit = 30) {
  await ensureCoastSchema(db);
  const resultLimit = limitValue(limit, 30, 100);
  const search = buildSafeSearchQuery(query);
  const rows = await all(db, `SELECT * FROM coast_soil_entries
    WHERE surface = 'official_mcp'
    ORDER BY created_at DESC LIMIT ?`, [search.terms.length ? SEARCH_SCAN_LIMIT : resultLimit]);
  const records = rows.map(fromRow);
  return rankSearchRecords(
    records,
    search,
    (record) => [
      '官端思维壤',
      record.content,
      record.display_author,
      record.model_label,
      record.model_nickname,
      record.surface,
      record.symbol,
    ].filter(Boolean).join(' '),
  ).slice(0, resultLimit);
}

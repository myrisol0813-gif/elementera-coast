import { ensureCoastSchema } from './coast-schema.js';
import {
  clipText,
  iso,
  limitValue,
  optionalText,
  provenanceFromRow,
  recordFields,
} from './coast-records.js';

function fromRow(row) {
  return {
    id: row.id,
    subject: row.subject || '',
    body: row.body,
    ...provenanceFromRow(row),
    read_at: iso(row.read_at),
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  };
}

async function first(db, sql, params = []) {
  return db.prepare(sql).bind(...params).first();
}

export async function writeLighthouseLetter(db, value = {}) {
  await ensureCoastSchema(db);
  const fields = recordFields(value);
  if (fields.tool_call_id) {
    const existing = await first(db, 'SELECT * FROM coast_lighthouse_letters WHERE tool_call_id = ?', [fields.tool_call_id]);
    if (existing) return fromRow(existing);
  }
  const id = `lighthouse-${crypto.randomUUID()}`;
  const timestamp = Date.now();
  await db.prepare(`INSERT INTO coast_lighthouse_letters (
    id, subject, body, actor, surface, model_label, model_nickname, symbol, display_author,
    usage_json, source_conversation_id, source_turn_id, tool_call_id, read_at, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`).bind(
    id,
    optionalText(value.subject, 180) || '',
    clipText(value.body ?? value.text, 40000, '灯塔来信'),
    fields.actor,
    fields.surface,
    fields.model_label,
    fields.model_nickname,
    fields.symbol,
    fields.display_author,
    fields.usage_json,
    fields.source_conversation_id,
    fields.source_turn_id,
    fields.tool_call_id,
    timestamp,
    timestamp,
  ).run();
  return fromRow(await first(db, 'SELECT * FROM coast_lighthouse_letters WHERE id = ?', [id]));
}

export async function listLighthouseLetters(db, { limit = 50, unread_only: unreadOnly = false } = {}) {
  await ensureCoastSchema(db);
  const result = await db.prepare(`SELECT * FROM coast_lighthouse_letters
    ${unreadOnly ? 'WHERE read_at IS NULL' : ''}
    ORDER BY created_at DESC LIMIT ?`).bind(limitValue(limit, 50)).all();
  return (result?.results || []).map(fromRow);
}

export async function markLighthouseLetterRead(db, id, read = true) {
  await ensureCoastSchema(db);
  const letterId = String(id || '').trim().slice(0, 200);
  const current = await first(db, 'SELECT * FROM coast_lighthouse_letters WHERE id = ?', [letterId]);
  if (!current) return null;
  await db.prepare('UPDATE coast_lighthouse_letters SET read_at = ?, updated_at = ? WHERE id = ?')
    .bind(read ? Date.now() : null, Date.now(), letterId).run();
  return fromRow(await first(db, 'SELECT * FROM coast_lighthouse_letters WHERE id = ?', [letterId]));
}

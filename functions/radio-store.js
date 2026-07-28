import { ensureCoastSchema } from './coast-schema.js';
import {
  CoastStoreError,
  clipText,
  iso,
  limitValue,
  provenanceFromRow,
  recordFields,
} from './coast-records.js';

function fromRow(row) {
  return {
    id: row.id,
    room_id: row.room_id,
    text: row.text,
    ...provenanceFromRow(row),
    created_at: iso(row.created_at),
  };
}

async function first(db, sql, params = []) {
  return db.prepare(sql).bind(...params).first();
}

export async function sendRadioMessage(db, value = {}) {
  await ensureCoastSchema(db);
  const fields = recordFields(value);
  if (fields.tool_call_id) {
    const existing = await first(db, 'SELECT * FROM coast_radio_messages WHERE tool_call_id = ?', [fields.tool_call_id]);
    if (existing) return fromRow(existing);
  }
  const id = `radio-${crypto.randomUUID()}`;
  const createdAt = Date.now();
  await db.prepare(`INSERT INTO coast_radio_messages (
    id, room_id, text, actor, surface, model_label, model_nickname, symbol, display_author,
    usage_json, source_conversation_id, source_turn_id, tool_call_id, created_at
  ) VALUES (?, 'radio', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    id,
    clipText(value.text, 12000, '电波消息'),
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
    createdAt,
  ).run();
  return fromRow(await first(db, 'SELECT * FROM coast_radio_messages WHERE id = ?', [id]));
}

export async function listRadioMessages(db, { limit = 100, before = '' } = {}) {
  await ensureCoastSchema(db);
  const beforeTime = before ? Date.parse(String(before)) : NaN;
  const params = ['radio'];
  let where = 'room_id = ?';
  if (Number.isFinite(beforeTime)) {
    where += ' AND created_at < ?';
    params.push(beforeTime);
  }
  params.push(limitValue(limit, 100));
  const result = await db.prepare(`SELECT * FROM coast_radio_messages
    WHERE ${where} ORDER BY created_at DESC LIMIT ?`).bind(...params).all();
  return (result?.results || []).reverse().map(fromRow);
}

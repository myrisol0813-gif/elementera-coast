import { ensureMailboxSchema } from './mailbox-schema.js';

export class MailboxRepositoryError extends Error {
  constructor(type, message, status = 400) {
    super(message);
    this.name = 'MailboxRepositoryError';
    this.type = type;
    this.status = status;
  }
}

function now() {
  return new Date().toISOString();
}

function boolean(value) {
  return Number(value || 0) === 1;
}

function parseJson(value, fallback) {
  try {
    const parsed = JSON.parse(String(value || ''));
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

async function first(db, sql, params = []) {
  return db.prepare(sql).bind(...params).first();
}

async function all(db, sql, params = []) {
  const result = await db.prepare(sql).bind(...params).all();
  return result?.results || [];
}

function visitorFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    display_name: row.display_name,
    preferred_name: row.preferred_name || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_seen_at: row.last_seen_at || null,
    is_active: boolean(row.is_active),
    allow_memory: boolean(row.allow_memory),
    privacy_level: row.privacy_level,
  };
}

function messageFromRow(row) {
  return {
    id: row.id,
    visitor_id: row.visitor_id,
    role: row.role,
    content: row.content,
    created_at: row.created_at,
    updated_at: row.updated_at,
    status: row.status,
    reply_batch_id: row.reply_batch_id || null,
  };
}

function notebookFromRow(row) {
  return {
    id: row.id,
    visitor_id: row.visitor_id,
    entry_type: row.entry_type || 'memory',
    title: row.title || row.life_core || row.content.slice(0, 80),
    life_core: row.life_core || row.content,
    content: row.content,
    usage_hint: row.usage_hint || '',
    avoid_hint: row.avoid_hint || '',
    source_message_id: row.source_message_id || null,
    source_pocket_id: row.source_pocket_id || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    confidence: Number(row.confidence ?? 1),
    visibility: row.visibility,
    status: row.status || (boolean(row.archived) ? 'archived' : 'active'),
    generated_by_model: row.generated_by_model || null,
    model_nickname: row.model_nickname || null,
    generation_source: row.generation_source || 'legacy_mailbox',
    source_conversation_id: row.source_conversation_id || null,
    source_turn_id: row.source_turn_id || null,
  };
}

function emptyThoughtSoil(visitorId) {
  return {
    visitor_id: visitorId,
    current_text: '',
    hand_seeds: [],
    do_not_repeat: '',
    pocket_candidates: [],
    source_message_id: null,
    organized_through_message_id: null,
    manual_locked: false,
    auto_refresh_enabled: true,
    revision: 1,
    model_label: null,
    model_nickname: null,
    source_conversation_id: null,
    source_turn_id: null,
    created_at: null,
    updated_at: null,
  };
}

function thoughtSoilFromRow(row, visitorId = row?.visitor_id || '') {
  if (!row) return emptyThoughtSoil(visitorId);
  return {
    visitor_id: row.visitor_id,
    current_text: row.current_text || '',
    hand_seeds: Array.isArray(parseJson(row.hand_seeds_json, []))
      ? parseJson(row.hand_seeds_json, [])
      : [],
    do_not_repeat: row.do_not_repeat || '',
    pocket_candidates: Array.isArray(parseJson(row.pocket_candidates_json, []))
      ? parseJson(row.pocket_candidates_json, [])
      : [],
    source_message_id: row.source_message_id || null,
    organized_through_message_id: row.organized_through_message_id || null,
    manual_locked: boolean(row.manual_locked),
    auto_refresh_enabled: boolean(row.auto_refresh_enabled),
    revision: Math.max(1, Number(row.revision || 1)),
    model_label: row.model_label || null,
    model_nickname: row.model_nickname || null,
    source_conversation_id: row.source_conversation_id || null,
    source_turn_id: row.source_turn_id || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

function pocketFromRow(row) {
  return {
    id: row.id,
    visitor_id: row.visitor_id,
    title: row.title,
    life_core: row.life_core,
    content: row.content,
    usage_hint: row.usage_hint || '',
    avoid_hint: row.avoid_hint || '',
    source_excerpt: row.source_excerpt || '',
    source_message_id: row.source_message_id || null,
    status: row.status,
    resolved_entry_id: row.resolved_entry_id || null,
    generated_by_model: row.generated_by_model || null,
    model_nickname: row.model_nickname || null,
    generation_source: row.generation_source || 'official_mcp',
    source_conversation_id: row.source_conversation_id || null,
    source_turn_id: row.source_turn_id || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    resolved_at: row.resolved_at || null,
  };
}

async function pocketFingerprint(visitorId, lifeCore) {
  const normalized = String(lifeCore || '')
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN')
    .replace(/\s+/g, ' ')
    .trim();
  const bytes = new TextEncoder().encode(`${visitorId}\u0000${normalized}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return `mailbox-soil:${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

export async function createMailboxVisitor(db, value) {
  await ensureMailboxSchema(db);
  const id = `mailbox-visitor-${crypto.randomUUID()}`;
  const timestamp = now();
  await db.batch([
    db.prepare(`INSERT INTO mailbox_visitors (
      id, display_name, preferred_name, passphrase_hash, passphrase_lookup,
      created_at, updated_at, last_seen_at, is_active, allow_memory, privacy_level, note_for_owner
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'sealed', NULL)`).bind(
      id,
      value.display_name,
      value.preferred_name || null,
      value.passphrase_hash,
      value.passphrase_lookup,
      timestamp,
      timestamp,
      timestamp,
      value.allow_memory ? 1 : 0,
    ),
    db.prepare(`INSERT INTO mailbox_thought_soils (
      visitor_id, current_text, hand_seeds_json, do_not_repeat,
      pocket_candidates_json, source_message_id, organized_through_message_id,
      manual_locked, auto_refresh_enabled, revision, model_label, model_nickname,
      source_conversation_id, source_turn_id, tool_call_id, created_at, updated_at
    ) VALUES (?, '', '[]', '', '[]', NULL, NULL, 0, 1, 1,
      NULL, NULL, NULL, NULL, NULL, ?, ?)`).bind(id, timestamp, timestamp),
  ]);
  return visitorFromRow(await first(db, 'SELECT * FROM mailbox_visitors WHERE id = ?', [id]));
}

export async function findMailboxVisitorByLookup(db, lookup) {
  await ensureMailboxSchema(db);
  const row = await first(db, 'SELECT * FROM mailbox_visitors WHERE passphrase_lookup = ?', [lookup]);
  if (!row) return null;
  return {
    visitor: visitorFromRow(row),
    passphrase_hash: row.passphrase_hash,
  };
}

export async function getMailboxVisitor(db, visitorId) {
  await ensureMailboxSchema(db);
  return visitorFromRow(await first(db, 'SELECT * FROM mailbox_visitors WHERE id = ?', [visitorId]));
}

export async function touchMailboxVisitor(db, visitorId) {
  await ensureMailboxSchema(db);
  const timestamp = now();
  await db.prepare(`UPDATE mailbox_visitors
    SET last_seen_at = ?, updated_at = ?
    WHERE id = ? AND is_active = 1`).bind(timestamp, timestamp, visitorId).run();
  return getMailboxVisitor(db, visitorId);
}

export async function listMailboxMessages(db, visitorId, limit = 500) {
  await ensureMailboxSchema(db);
  const rows = await all(db, `SELECT * FROM mailbox_messages
    WHERE visitor_id = ? AND status != 'hidden'
    ORDER BY created_at ASC, id ASC LIMIT ?`, [visitorId, limit]);
  return rows.map(messageFromRow);
}

export async function writeVisitorMailboxMessage(db, visitorId, content) {
  await ensureMailboxSchema(db);
  const messageId = `mailbox-message-${crypto.randomUUID()}`;
  const queueId = `mailbox-queue-${visitorId}`;
  const timestamp = now();
  await db.batch([
    db.prepare(`INSERT INTO mailbox_messages (
      id, visitor_id, role, content, created_at, updated_at, status,
      reply_batch_id, is_visible_to_owner, safety_flag
    ) VALUES (?, ?, 'visitor', ?, ?, ?, 'waiting_for_myri', NULL, 0, NULL)`).bind(
      messageId,
      visitorId,
      content,
      timestamp,
      timestamp,
    ),
    db.prepare(`INSERT INTO mailbox_reply_queue (
      id, visitor_id, latest_message_id, status, created_at, updated_at,
      processed_at, processed_by, error_note, needs_owner_attention,
      owner_attention_reason, processing_batch_id
    ) VALUES (?, ?, ?, 'pending', ?, ?, NULL, NULL, NULL, 0, NULL, NULL)
    ON CONFLICT(visitor_id) DO UPDATE SET
      latest_message_id = excluded.latest_message_id,
      status = 'pending',
      updated_at = excluded.updated_at,
      processed_at = NULL,
      processed_by = NULL,
      error_note = NULL,
      processing_batch_id = NULL`).bind(
      queueId,
      visitorId,
      messageId,
      timestamp,
      timestamp,
    ),
    db.prepare(`UPDATE mailbox_visitors
      SET last_seen_at = ?, updated_at = ?
      WHERE id = ? AND is_active = 1`).bind(timestamp, timestamp, visitorId),
  ]);
  return messageFromRow(await first(db, 'SELECT * FROM mailbox_messages WHERE id = ?', [messageId]));
}

async function mailboxMessageForVisitor(db, visitorId, messageId) {
  return first(db, `SELECT * FROM mailbox_messages
    WHERE id = ? AND visitor_id = ? AND status != 'hidden'`, [messageId, visitorId]);
}

async function soleReplyForVisitorMessage(db, message) {
  if (message?.role !== 'visitor' || !message.reply_batch_id) return null;
  const sibling = await first(db, `SELECT id FROM mailbox_messages
    WHERE visitor_id = ? AND role = 'visitor' AND reply_batch_id = ?
      AND id != ? AND status != 'hidden' LIMIT 1`, [
    message.visitor_id,
    message.reply_batch_id,
    message.id,
  ]);
  if (sibling) return null;
  return first(db, `SELECT * FROM mailbox_messages
    WHERE visitor_id = ? AND role = 'myri' AND reply_batch_id = ?
      AND status != 'hidden' LIMIT 1`, [message.visitor_id, message.reply_batch_id]);
}

function detachMessageStatements(db, visitorId, messageId) {
  return [
    db.prepare(`UPDATE mailbox_thought_soils SET
      source_message_id = CASE WHEN source_message_id = ? THEN NULL ELSE source_message_id END,
      organized_through_message_id = CASE
        WHEN organized_through_message_id = ? THEN NULL ELSE organized_through_message_id END
      WHERE visitor_id = ?`).bind(messageId, messageId, visitorId),
    db.prepare(`UPDATE mailbox_memory_pockets SET source_message_id = NULL
      WHERE visitor_id = ? AND source_message_id = ?`).bind(visitorId, messageId),
    db.prepare(`UPDATE visitor_notebook_entries SET source_message_id = NULL
      WHERE visitor_id = ? AND source_message_id = ?`).bind(visitorId, messageId),
    db.prepare(`UPDATE mailbox_thinking_notes SET source_message_id = NULL
      WHERE visitor_id = ? AND source_message_id = ?`).bind(visitorId, messageId),
  ];
}

function upsertPendingQueueStatement(db, visitorId, timestamp, excludeMessageId = '') {
  const queueId = `mailbox-queue-${visitorId}`;
  return db.prepare(`INSERT INTO mailbox_reply_queue (
      id, visitor_id, latest_message_id, status, created_at, updated_at,
      processed_at, processed_by, error_note, needs_owner_attention,
      owner_attention_reason, processing_batch_id
    ) SELECT ?, ?, m.id, 'pending', ?, ?, NULL, NULL, NULL, 0, NULL, NULL
      FROM mailbox_messages m
      WHERE m.visitor_id = ? AND m.role = 'visitor'
        AND m.status = 'waiting_for_myri' AND m.id != ?
      ORDER BY m.created_at DESC, m.id DESC LIMIT 1
    ON CONFLICT(visitor_id) DO UPDATE SET
      latest_message_id = excluded.latest_message_id,
      status = 'pending',
      updated_at = excluded.updated_at,
      processed_at = NULL,
      processed_by = NULL,
      error_note = NULL,
      needs_owner_attention = 0,
      owner_attention_reason = NULL,
      processing_batch_id = NULL`).bind(
    queueId,
    visitorId,
    timestamp,
    timestamp,
    visitorId,
    excludeMessageId,
  );
}

export async function editVisitorMailboxMessage(db, visitorId, messageId, content) {
  await ensureMailboxSchema(db);
  const message = await mailboxMessageForVisitor(db, visitorId, messageId);
  if (!message || message.role !== 'visitor') {
    throw new MailboxRepositoryError('mailbox_message_not_editable', '这封来信不存在，或不能由访客编辑。', 404);
  }
  const relatedReply = await soleReplyForVisitorMessage(db, message);
  const timestamp = now();
  const statements = [];
  if (relatedReply) {
    statements.push(
      ...detachMessageStatements(db, visitorId, relatedReply.id),
      db.prepare(`DELETE FROM mailbox_messages
        WHERE id = ? AND visitor_id = ? AND role = 'myri'`).bind(relatedReply.id, visitorId),
    );
  }
  statements.push(
    db.prepare(`UPDATE mailbox_messages SET
      content = ?, updated_at = ?, status = 'waiting_for_myri', reply_batch_id = NULL
      WHERE id = ? AND visitor_id = ? AND role = 'visitor'`).bind(
      content,
      timestamp,
      messageId,
      visitorId,
    ),
    upsertPendingQueueStatement(db, visitorId, timestamp),
    db.prepare(`UPDATE mailbox_visitors SET updated_at = ?, last_seen_at = ?
      WHERE id = ? AND is_active = 1`).bind(timestamp, timestamp, visitorId),
  );
  await db.batch(statements);
  return messageFromRow(await mailboxMessageForVisitor(db, visitorId, messageId));
}

export async function deleteMailboxMessage(db, visitorId, messageId) {
  await ensureMailboxSchema(db);
  const message = await mailboxMessageForVisitor(db, visitorId, messageId);
  if (!message || !['visitor', 'myri'].includes(message.role)) {
    throw new MailboxRepositoryError('mailbox_message_not_found', '这条信箱消息不存在。', 404);
  }
  const relatedReply = await soleReplyForVisitorMessage(db, message);
  const timestamp = now();
  const statements = [];
  if (message.role === 'visitor') {
    statements.push(
      upsertPendingQueueStatement(db, visitorId, timestamp, message.id),
      db.prepare(`DELETE FROM mailbox_reply_queue
        WHERE visitor_id = ?
          AND NOT EXISTS (SELECT 1 FROM mailbox_messages m
            WHERE m.visitor_id = ? AND m.role = 'visitor'
              AND m.status = 'waiting_for_myri' AND m.id != ?)`).bind(
        visitorId,
        visitorId,
        message.id,
      ),
    );
  }
  statements.push(...detachMessageStatements(db, visitorId, message.id));
  if (relatedReply) {
    statements.push(
      ...detachMessageStatements(db, visitorId, relatedReply.id),
      db.prepare(`DELETE FROM mailbox_messages
        WHERE id = ? AND visitor_id = ? AND role = 'myri'`).bind(relatedReply.id, visitorId),
    );
  }
  statements.push(
    db.prepare(`DELETE FROM mailbox_messages
      WHERE id = ? AND visitor_id = ? AND role IN ('visitor', 'myri')`).bind(message.id, visitorId),
    db.prepare(`UPDATE mailbox_visitors SET updated_at = ?, last_seen_at = ?
      WHERE id = ? AND is_active = 1`).bind(timestamp, timestamp, visitorId),
  );
  await db.batch(statements);
  return {
    id: message.id,
    deleted: true,
    related_reply_id: relatedReply?.id || null,
  };
}

export async function deleteMailboxVisitorAccount(db, visitorId) {
  await ensureMailboxSchema(db);
  const visitor = await getMailboxVisitor(db, visitorId);
  if (!visitor?.is_active) {
    throw new MailboxRepositoryError('mailbox_visitor_not_found', '这个访客房间已经不存在。', 404);
  }
  await db.batch([
    db.prepare('DELETE FROM mailbox_thinking_notes WHERE visitor_id = ?').bind(visitorId),
    db.prepare('DELETE FROM mailbox_thought_soils WHERE visitor_id = ?').bind(visitorId),
    db.prepare('DELETE FROM visitor_notebook_entries WHERE visitor_id = ?').bind(visitorId),
    db.prepare('DELETE FROM mailbox_memory_pockets WHERE visitor_id = ?').bind(visitorId),
    db.prepare('DELETE FROM mailbox_reply_queue WHERE visitor_id = ?').bind(visitorId),
    db.prepare('DELETE FROM mailbox_messages WHERE visitor_id = ?').bind(visitorId),
    db.prepare('DELETE FROM mailbox_visitors WHERE id = ?').bind(visitorId),
  ]);
  return { visitor_id: visitorId, deleted: true };
}

export async function mailboxStatusForVisitor(db, visitorId) {
  await ensureMailboxSchema(db);
  const row = await first(db, `SELECT
      (SELECT COUNT(*) FROM mailbox_messages
        WHERE visitor_id = ? AND role = 'visitor' AND status = 'waiting_for_myri') AS pending_count,
      (SELECT MAX(created_at) FROM mailbox_messages
        WHERE visitor_id = ? AND role = 'myri' AND status != 'hidden') AS last_myri_reply_at,
      (SELECT MAX(created_at) FROM mailbox_messages
        WHERE visitor_id = ? AND role = 'visitor' AND status != 'hidden') AS last_visitor_message_at,
      (SELECT status FROM mailbox_reply_queue WHERE visitor_id = ?) AS queue_status`, [
    visitorId,
    visitorId,
    visitorId,
    visitorId,
  ]);
  return {
    pending_count: Number(row?.pending_count || 0),
    last_myri_reply_at: row?.last_myri_reply_at || null,
    last_visitor_message_at: row?.last_visitor_message_at || null,
    queue_status: row?.queue_status || 'idle',
  };
}

export async function listVisitorNotebook(db, visitorId, { visitorVisibleOnly = false } = {}) {
  await ensureMailboxSchema(db);
  const rows = await all(db, `SELECT * FROM visitor_notebook_entries
    WHERE visitor_id = ? AND archived = 0 AND status = 'active'
      ${visitorVisibleOnly ? "AND visibility = 'visitor_visible'" : ''}
    ORDER BY updated_at DESC, id DESC`, [visitorId]);
  return rows.map(notebookFromRow);
}

export async function archiveVisibleNotebookEntry(db, visitorId, entryId) {
  await ensureMailboxSchema(db);
  const timestamp = now();
  const existing = await first(db, `SELECT id FROM visitor_notebook_entries
    WHERE id = ? AND visitor_id = ? AND visibility = 'visitor_visible' AND archived = 0`, [
    entryId,
    visitorId,
  ]);
  if (!existing) return false;
  await db.prepare(`UPDATE visitor_notebook_entries
    SET archived = 1, status = 'archived', updated_at = ?
    WHERE id = ? AND visitor_id = ? AND visibility = 'visitor_visible'`).bind(
    timestamp,
    entryId,
    visitorId,
  ).run();
  return true;
}

export async function readMailboxThoughtSoil(db, visitorId) {
  await ensureMailboxSchema(db);
  return thoughtSoilFromRow(
    await first(db, 'SELECT * FROM mailbox_thought_soils WHERE visitor_id = ?', [visitorId]),
    visitorId,
  );
}

export async function listMailboxMemoryPockets(db, visitorId, { status = 'pending' } = {}) {
  await ensureMailboxSchema(db);
  const rows = await all(db, `SELECT * FROM mailbox_memory_pockets
    WHERE visitor_id = ? AND status = ?
    ORDER BY updated_at DESC, id DESC`, [visitorId, status]);
  return rows.map(pocketFromRow);
}

async function recentMessagesForPatrol(db, visitorId, limit) {
  const rows = await all(db, `SELECT * FROM (
      SELECT * FROM mailbox_messages
      WHERE visitor_id = ? AND status != 'hidden'
      ORDER BY created_at DESC, id DESC LIMIT ?
    ) ORDER BY created_at ASC, id ASC`, [visitorId, limit]);
  return rows.map(messageFromRow);
}

export async function claimMailboxPatrol(db, { messageLimit = 60 } = {}) {
  await ensureMailboxSchema(db);
  const queues = await all(db, `SELECT
      q.id AS queue_id,
      q.visitor_id,
      q.latest_message_id,
      q.updated_at AS queue_updated_at,
      v.display_name,
      v.preferred_name,
      v.allow_memory,
      v.privacy_level
    FROM mailbox_reply_queue q
    JOIN mailbox_visitors v ON v.id = q.visitor_id
    WHERE q.status IN ('pending', 'processing') AND v.is_active = 1
    ORDER BY q.updated_at ASC, q.id ASC`);
  const pendingCounts = await Promise.all(queues.map(async (queue) => {
    const row = await first(db, `SELECT COUNT(*) AS count FROM mailbox_messages
      WHERE visitor_id = ? AND role = 'visitor' AND status = 'waiting_for_myri'`, [queue.visitor_id]);
    return Number(row?.count || 0);
  }));
  const batchId = `mailbox-patrol-${crypto.randomUUID()}`;
  const timestamp = now();
  const messageCount = pendingCounts.reduce((sum, count) => sum + count, 0);
  await db.batch([
    db.prepare(`INSERT INTO mailbox_patrol_batches (
      id, status, visitor_count, message_count, reply_count, failure_count,
      needs_owner_attention_count, created_at, completed_at
    ) VALUES (?, 'processing', ?, ?, 0, 0, 0, ?, NULL)`).bind(
      batchId,
      queues.length,
      messageCount,
      timestamp,
    ),
    ...queues.map((queue) => db.prepare(`UPDATE mailbox_reply_queue
      SET status = 'processing', updated_at = ?, processed_by = 'official_mcp',
        error_note = NULL, processing_batch_id = ?
      WHERE id = ? AND visitor_id = ?`).bind(
      timestamp,
      batchId,
      queue.queue_id,
      queue.visitor_id,
    )),
  ]);

  const visitors = await Promise.all(queues.map(async (queue, index) => ({
    visitor_id: queue.visitor_id,
    display_name: queue.display_name,
    preferred_name: queue.preferred_name || queue.display_name,
    allow_memory: boolean(queue.allow_memory),
    privacy_level: queue.privacy_level,
    queue_id: queue.queue_id,
    latest_message_id: queue.latest_message_id,
    pending_message_count: pendingCounts[index],
    recent_messages: await recentMessagesForPatrol(db, queue.visitor_id, messageLimit),
    visitor_notebook_entries: boolean(queue.allow_memory)
      ? await listVisitorNotebook(db, queue.visitor_id)
      : [],
    thought_soil: await readMailboxThoughtSoil(db, queue.visitor_id),
    pending_memory_pockets: boolean(queue.allow_memory)
      ? await listMailboxMemoryPockets(db, queue.visitor_id)
      : [],
  })));

  return {
    batch_id: batchId,
    visitor_count: visitors.length,
    message_count: messageCount,
    visitors,
  };
}

export async function writeMailboxReply(db, value) {
  await ensureMailboxSchema(db);
  const existingReply = await first(db, `SELECT * FROM mailbox_messages
    WHERE visitor_id = ? AND reply_batch_id = ? AND role = 'myri'`, [
    value.visitor_id,
    value.batch_id,
  ]);
  if (existingReply) {
    const [queueState, thoughtSoil, pendingPockets] = await Promise.all([
      first(db, `SELECT needs_owner_attention FROM mailbox_reply_queue
        WHERE visitor_id = ? AND processing_batch_id = ?`, [value.visitor_id, value.batch_id]),
      readMailboxThoughtSoil(db, value.visitor_id),
      listMailboxMemoryPockets(db, value.visitor_id),
    ]);
    return {
      reply: messageFromRow(existingReply),
      thought_soil: thoughtSoil,
      pending_pockets: pendingPockets,
      pending_pocket_count: pendingPockets.length,
      memory_candidates_skipped: 0,
      needs_owner_attention: boolean(queueState?.needs_owner_attention),
      idempotent: true,
    };
  }

  const queue = await first(db, `SELECT
      q.*, v.allow_memory, v.is_active,
      (SELECT status FROM mailbox_patrol_batches WHERE id = ?) AS batch_status
    FROM mailbox_reply_queue q
    JOIN mailbox_visitors v ON v.id = q.visitor_id
    WHERE q.id = ? AND q.visitor_id = ?`, [value.batch_id, value.queue_id, value.visitor_id]);
  if (!queue) {
    throw new MailboxRepositoryError('mailbox_queue_not_found', '这条待回信队列不存在。', 404);
  }
  if (!boolean(queue.is_active)) {
    throw new MailboxRepositoryError('mailbox_visitor_inactive', '这位访客当前不可用。', 410);
  }
  if (queue.status !== 'processing'
    || queue.processing_batch_id !== value.batch_id
    || queue.batch_status !== 'processing') {
    throw new MailboxRepositoryError(
      'mailbox_patrol_stale',
      '巡信批次已经变化，请重新读取待回信。',
      409,
    );
  }

  const replyId = `mailbox-message-${crypto.randomUUID()}`;
  const timestamp = now();
  const memoryAllowed = boolean(queue.allow_memory);
  const candidateValues = memoryAllowed
    ? await Promise.all(value.thought_soil.pocket_candidates.map(async (candidate) => ({
      ...candidate,
      id: `mailbox-pocket-${crypto.randomUUID()}`,
      fingerprint: await pocketFingerprint(value.visitor_id, candidate.life_core),
    })))
    : [];
  const memoryCandidatesSkipped = memoryAllowed
    ? 0
    : value.thought_soil.pocket_candidates.length;
  const statements = [
    db.prepare(`INSERT INTO mailbox_messages (
      id, visitor_id, role, content, created_at, updated_at, status,
      reply_batch_id, is_visible_to_owner, safety_flag
    ) SELECT ?, q.visitor_id, 'myri', ?, ?, ?, 'sent', ?, 0, NULL
      FROM mailbox_reply_queue q
      JOIN mailbox_patrol_batches b ON b.id = q.processing_batch_id
      WHERE q.id = ? AND q.visitor_id = ? AND q.status = 'processing'
        AND q.processing_batch_id = ? AND b.status = 'processing'`).bind(
      replyId,
      value.content,
      timestamp,
      timestamp,
      value.batch_id,
      value.queue_id,
      value.visitor_id,
      value.batch_id,
    ),
    db.prepare(`UPDATE mailbox_messages
      SET status = 'replied', reply_batch_id = ?, updated_at = ?
      WHERE visitor_id = ? AND role = 'visitor' AND status = 'waiting_for_myri'
        AND EXISTS (SELECT 1 FROM mailbox_messages WHERE id = ? AND role = 'myri')`).bind(
      value.batch_id,
      timestamp,
      value.visitor_id,
      replyId,
    ),
    db.prepare(`UPDATE mailbox_reply_queue
      SET status = ?, updated_at = ?, processed_at = ?, processed_by = 'official_mcp',
        error_note = NULL, needs_owner_attention = ?, owner_attention_reason = ?
      WHERE id = ? AND visitor_id = ? AND processing_batch_id = ?
        AND EXISTS (SELECT 1 FROM mailbox_messages WHERE id = ? AND role = 'myri')`).bind(
      value.needs_owner_attention ? 'needs_owner_attention' : 'replied',
      timestamp,
      timestamp,
      value.needs_owner_attention ? 1 : 0,
      value.needs_owner_attention ? value.owner_attention_reason : null,
      value.queue_id,
      value.visitor_id,
      value.batch_id,
      replyId,
    ),
    db.prepare(`INSERT INTO mailbox_thought_soils (
      visitor_id, current_text, hand_seeds_json, do_not_repeat,
      pocket_candidates_json, source_message_id, organized_through_message_id,
      manual_locked, auto_refresh_enabled, revision, model_label, model_nickname,
      source_conversation_id, source_turn_id, tool_call_id, created_at, updated_at
    ) SELECT ?, ?, ?, ?, ?, ?, ?, 0, 1, 1, ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM mailbox_messages WHERE id = ? AND role = 'myri')
    ON CONFLICT(visitor_id) DO UPDATE SET
      current_text = excluded.current_text,
      hand_seeds_json = excluded.hand_seeds_json,
      do_not_repeat = excluded.do_not_repeat,
      pocket_candidates_json = excluded.pocket_candidates_json,
      source_message_id = excluded.source_message_id,
      organized_through_message_id = excluded.organized_through_message_id,
      manual_locked = 0,
      auto_refresh_enabled = 1,
      revision = mailbox_thought_soils.revision + 1,
      model_label = excluded.model_label,
      model_nickname = excluded.model_nickname,
      source_conversation_id = excluded.source_conversation_id,
      source_turn_id = excluded.source_turn_id,
      tool_call_id = excluded.tool_call_id,
      updated_at = excluded.updated_at`).bind(
      value.visitor_id,
      value.thought_soil.current_text,
      JSON.stringify(value.thought_soil.hand_seeds),
      value.thought_soil.do_not_repeat,
      JSON.stringify(value.thought_soil.pocket_candidates),
      replyId,
      replyId,
      value.model_label,
      value.model_nickname || null,
      value.source_conversation_id || null,
      value.source_turn_id || replyId,
      value.tool_call_id || null,
      timestamp,
      timestamp,
      replyId,
    ),
    ...candidateValues.map((candidate) => db.prepare(`INSERT INTO mailbox_memory_pockets (
      id, visitor_id, fingerprint, source_message_id, title, life_core,
      content, usage_hint, avoid_hint, source_excerpt, status,
      resolved_entry_id, generated_by_model, model_nickname, generation_source,
      source_conversation_id, source_turn_id, tool_call_id,
      created_at, updated_at, resolved_at
    ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?, ?,
        'official_mcp', ?, ?, ?, ?, ?, NULL
      WHERE EXISTS (SELECT 1 FROM mailbox_messages WHERE id = ? AND role = 'myri')
    ON CONFLICT(visitor_id, fingerprint) DO UPDATE SET
      source_message_id = excluded.source_message_id,
      title = excluded.title,
      life_core = excluded.life_core,
      content = excluded.content,
      usage_hint = excluded.usage_hint,
      avoid_hint = excluded.avoid_hint,
      source_excerpt = excluded.source_excerpt,
      generated_by_model = excluded.generated_by_model,
      model_nickname = excluded.model_nickname,
      source_conversation_id = excluded.source_conversation_id,
      source_turn_id = excluded.source_turn_id,
      tool_call_id = excluded.tool_call_id,
      updated_at = excluded.updated_at
    WHERE mailbox_memory_pockets.status = 'pending'`).bind(
      candidate.id,
      value.visitor_id,
      candidate.fingerprint,
      replyId,
      candidate.title,
      candidate.life_core,
      candidate.content,
      candidate.usage_hint,
      candidate.avoid_hint,
      candidate.source_excerpt,
      value.model_label,
      value.model_nickname || null,
      value.source_conversation_id || null,
      value.source_turn_id || replyId,
      value.tool_call_id || null,
      timestamp,
      timestamp,
      replyId,
    )),
  ];
  try {
    await db.batch(statements);
  } catch (error) {
    if (/UNIQUE constraint failed: mailbox_messages\.visitor_id, mailbox_messages\.reply_batch_id/.test(String(error?.message || ''))) {
      return writeMailboxReply(db, value);
    }
    throw error;
  }
  const writtenReply = await first(db, 'SELECT * FROM mailbox_messages WHERE id = ?', [replyId]);
  if (!writtenReply) {
    throw new MailboxRepositoryError(
      'mailbox_patrol_stale',
      '巡信批次已经变化，请重新读取待回信。',
      409,
    );
  }
  const [thoughtSoil, pendingPockets] = await Promise.all([
    readMailboxThoughtSoil(db, value.visitor_id),
    listMailboxMemoryPockets(db, value.visitor_id),
  ]);
  return {
    reply: messageFromRow(writtenReply),
    thought_soil: thoughtSoil,
    pending_pockets: pendingPockets,
    pending_pocket_count: pendingPockets.length,
    memory_candidates_skipped: memoryCandidatesSkipped,
    needs_owner_attention: value.needs_owner_attention,
    idempotent: false,
  };
}

export async function resolveMailboxMemoryPocket(db, value) {
  await ensureMailboxSchema(db);
  const visitor = await getMailboxVisitor(db, value.visitor_id);
  if (!visitor?.is_active) {
    throw new MailboxRepositoryError('mailbox_visitor_not_found', '这位访客当前不可用。', 410);
  }
  if (!visitor.allow_memory && value.action === 'remember') {
    throw new MailboxRepositoryError(
      'mailbox_memory_not_allowed',
      '这位访客没有允许写入访客记事本。',
      409,
    );
  }
  const pocket = await first(db, `SELECT * FROM mailbox_memory_pockets
    WHERE id = ? AND visitor_id = ?`, [value.pocket_id, value.visitor_id]);
  if (!pocket) {
    throw new MailboxRepositoryError('mailbox_pocket_not_found', '这条待确认内容不存在。', 404);
  }
  if (value.action === 'discard') {
    if (pocket.status === 'discarded') {
      return { pocket: pocketFromRow(pocket), entry: null, idempotent: true };
    }
    if (pocket.status !== 'pending') {
      throw new MailboxRepositoryError('mailbox_pocket_resolved', '这条内容已经离开待确认袋。', 409);
    }
    const timestamp = now();
    await db.prepare(`UPDATE mailbox_memory_pockets SET
      status = 'discarded', resolved_at = ?, updated_at = ?
      WHERE id = ? AND visitor_id = ? AND status = 'pending'`).bind(
      timestamp,
      timestamp,
      value.pocket_id,
      value.visitor_id,
    ).run();
    return {
      pocket: pocketFromRow(await first(db, `SELECT * FROM mailbox_memory_pockets
        WHERE id = ? AND visitor_id = ?`, [value.pocket_id, value.visitor_id])),
      entry: null,
      idempotent: false,
    };
  }
  if (pocket.status === 'confirmed' && pocket.resolved_entry_id) {
    const entry = await first(db, `SELECT * FROM visitor_notebook_entries
      WHERE id = ? AND visitor_id = ?`, [pocket.resolved_entry_id, value.visitor_id]);
    return { pocket: pocketFromRow(pocket), entry: entry ? notebookFromRow(entry) : null, idempotent: true };
  }
  if (pocket.status !== 'pending') {
    throw new MailboxRepositoryError('mailbox_pocket_resolved', '这条内容已经离开待确认袋。', 409);
  }
  const entryId = `visitor-note-${crypto.randomUUID()}`;
  const timestamp = now();
  await db.batch([
    db.prepare(`INSERT INTO visitor_notebook_entries (
      id, visitor_id, entry_type, title, life_core, content, usage_hint,
      avoid_hint, source_message_id, source_pocket_id, created_at, updated_at,
      confidence, visibility, status, generated_by_model, model_nickname,
      generation_source, source_conversation_id, source_turn_id, tool_call_id, archived
    ) SELECT ?, visitor_id, 'memory', ?, ?, ?, ?, ?, source_message_id, id,
        ?, ?, ?, ?, 'active', generated_by_model, model_nickname,
        'official_mcp', ?, ?, ?, 0
      FROM mailbox_memory_pockets
      WHERE id = ? AND visitor_id = ? AND status = 'pending'`).bind(
      entryId,
      value.title || pocket.title,
      value.life_core || pocket.life_core,
      value.content || pocket.content,
      value.usage_hint ?? pocket.usage_hint,
      value.avoid_hint ?? pocket.avoid_hint,
      timestamp,
      timestamp,
      value.confidence,
      value.visibility,
      value.source_conversation_id || pocket.source_conversation_id || null,
      value.source_turn_id || pocket.source_turn_id || null,
      value.tool_call_id || null,
      value.pocket_id,
      value.visitor_id,
    ),
    db.prepare(`UPDATE mailbox_memory_pockets SET
      status = 'confirmed', resolved_entry_id = ?, resolved_at = ?, updated_at = ?
      WHERE id = ? AND visitor_id = ? AND status = 'pending'
        AND EXISTS (SELECT 1 FROM visitor_notebook_entries WHERE id = ?)`).bind(
      entryId,
      timestamp,
      timestamp,
      value.pocket_id,
      value.visitor_id,
      entryId,
    ),
  ]);
  const entry = await first(db, `SELECT * FROM visitor_notebook_entries
    WHERE id = ? AND visitor_id = ?`, [entryId, value.visitor_id]);
  if (!entry) {
    throw new MailboxRepositoryError('mailbox_pocket_resolved', '这条内容已经离开待确认袋。', 409);
  }
  return {
    pocket: pocketFromRow(await first(db, `SELECT * FROM mailbox_memory_pockets
      WHERE id = ? AND visitor_id = ?`, [value.pocket_id, value.visitor_id])),
    entry: notebookFromRow(entry),
    idempotent: false,
  };
}

export async function completeMailboxPatrol(db, batchId) {
  await ensureMailboxSchema(db);
  const batch = await first(db, 'SELECT * FROM mailbox_patrol_batches WHERE id = ?', [batchId]);
  if (!batch) {
    throw new MailboxRepositoryError('mailbox_patrol_not_found', '这次巡信记录不存在。', 404);
  }
  const [replyRow, attentionRow] = await Promise.all([
    first(db, `SELECT COUNT(*) AS count FROM mailbox_messages
      WHERE role = 'myri' AND reply_batch_id = ?`, [batchId]),
    first(db, `SELECT COUNT(*) AS count FROM mailbox_reply_queue
      WHERE processing_batch_id = ? AND needs_owner_attention = 1`, [batchId]),
  ]);
  const replyCount = Number(replyRow?.count || 0);
  const attentionCount = Number(attentionRow?.count || 0);
  const failureCount = Math.max(0, Number(batch.visitor_count || 0) - replyCount);
  const completedAt = batch.completed_at || now();
  await db.prepare(`UPDATE mailbox_patrol_batches
    SET status = 'completed', reply_count = ?, failure_count = ?,
      needs_owner_attention_count = ?, completed_at = ?
    WHERE id = ?`).bind(
    replyCount,
    failureCount,
    attentionCount,
    completedAt,
    batchId,
  ).run();
  return {
    batch_id: batchId,
    visitor_count: Number(batch.visitor_count || 0),
    message_count: Number(batch.message_count || 0),
    reply_count: replyCount,
    failure_count: failureCount,
    needs_owner_attention_count: attentionCount,
    completed_at: completedAt,
  };
}

export async function listOwnerMailboxVisitors(db) {
  await ensureMailboxSchema(db);
  const rows = await all(db, `SELECT
      v.id AS visitor_id,
      v.display_name,
      v.preferred_name,
      v.created_at,
      v.last_seen_at,
      (SELECT COUNT(*) FROM mailbox_messages m
        WHERE m.visitor_id = v.id AND m.role = 'visitor'
          AND m.status = 'waiting_for_myri') AS pending_count,
      (SELECT MAX(created_at) FROM mailbox_messages m
        WHERE m.visitor_id = v.id AND m.role = 'visitor'
          AND m.status != 'hidden') AS last_message_at,
      (SELECT MAX(created_at) FROM mailbox_messages m
        WHERE m.visitor_id = v.id AND m.role = 'myri'
          AND m.status != 'hidden') AS last_reply_at,
      COALESCE(q.needs_owner_attention, 0) AS needs_owner_attention
    FROM mailbox_visitors v
    LEFT JOIN mailbox_reply_queue q ON q.visitor_id = v.id
    WHERE v.is_active = 1
    ORDER BY COALESCE(v.last_seen_at, v.created_at) DESC, v.id ASC`);
  return rows.map((row) => ({
    visitor_id: row.visitor_id,
    display_name: row.display_name,
    preferred_name: row.preferred_name || null,
    created_at: row.created_at,
    last_seen_at: row.last_seen_at || null,
    pending_count: Number(row.pending_count || 0),
    last_message_at: row.last_message_at || null,
    last_reply_at: row.last_reply_at || null,
    needs_owner_attention: boolean(row.needs_owner_attention),
  }));
}

export async function ownerMailboxSummary(db) {
  await ensureMailboxSchema(db);
  const [visitors, pendingVisitors, pendingMessages, attention, patrol] = await Promise.all([
    first(db, 'SELECT COUNT(*) AS count FROM mailbox_visitors WHERE is_active = 1'),
    first(db, `SELECT COUNT(DISTINCT visitor_id) AS count FROM mailbox_messages
      WHERE role = 'visitor' AND status = 'waiting_for_myri'`),
    first(db, `SELECT COUNT(*) AS count FROM mailbox_messages
      WHERE role = 'visitor' AND status = 'waiting_for_myri'`),
    first(db, `SELECT COUNT(*) AS count FROM mailbox_reply_queue
      WHERE needs_owner_attention = 1`),
    first(db, 'SELECT MAX(completed_at) AS last_patrol_at FROM mailbox_patrol_batches'),
  ]);
  return {
    visitor_count: Number(visitors?.count || 0),
    pending_visitor_count: Number(pendingVisitors?.count || 0),
    pending_message_count: Number(pendingMessages?.count || 0),
    needs_owner_attention_count: Number(attention?.count || 0),
    last_patrol_at: patrol?.last_patrol_at || null,
  };
}

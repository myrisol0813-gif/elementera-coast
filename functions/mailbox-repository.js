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
    content: row.content,
    source_message_id: row.source_message_id || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    confidence: Number(row.confidence ?? 1),
    visibility: row.visibility,
  };
}

function thinkingNoteFromRow(row) {
  return {
    id: row.id,
    visitor_id: row.visitor_id,
    content: row.content,
    source_message_id: row.source_message_id || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function createMailboxVisitor(db, value) {
  await ensureMailboxSchema(db);
  const id = `mailbox-visitor-${crypto.randomUUID()}`;
  const timestamp = now();
  await db.prepare(`INSERT INTO mailbox_visitors (
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
  ).run();
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
    WHERE visitor_id = ? AND archived = 0
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
    SET archived = 1, updated_at = ?
    WHERE id = ? AND visitor_id = ? AND visibility = 'visitor_visible'`).bind(
    timestamp,
    entryId,
    visitorId,
  ).run();
  return true;
}

export async function listMailboxThinkingNotes(db, visitorId) {
  await ensureMailboxSchema(db);
  const rows = await all(db, `SELECT * FROM mailbox_thinking_notes
    WHERE visitor_id = ? AND archived = 0
    ORDER BY updated_at DESC, id DESC`, [visitorId]);
  return rows.map(thinkingNoteFromRow);
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
    thinking_notes: await listMailboxThinkingNotes(db, queue.visitor_id),
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
    const [queueState, notebookCount, thinkingCount] = await Promise.all([
      first(db, `SELECT needs_owner_attention FROM mailbox_reply_queue
        WHERE visitor_id = ? AND processing_batch_id = ?`, [value.visitor_id, value.batch_id]),
      first(db, `SELECT COUNT(*) AS count FROM visitor_notebook_entries
        WHERE visitor_id = ? AND source_message_id = ?`, [value.visitor_id, existingReply.id]),
      first(db, `SELECT COUNT(*) AS count FROM mailbox_thinking_notes
        WHERE visitor_id = ? AND source_message_id = ?`, [value.visitor_id, existingReply.id]),
    ]);
    return {
      reply: messageFromRow(existingReply),
      notebook_entry_count: Number(notebookCount?.count || 0),
      notebook_entries_skipped: 0,
      thinking_note_count: Number(thinkingCount?.count || 0),
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
  const notebookEntries = boolean(queue.allow_memory) ? value.notebook_entries : [];
  const notebookEntriesSkipped = boolean(queue.allow_memory) ? 0 : value.notebook_entries.length;
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
    ...notebookEntries.map((entry) => db.prepare(`INSERT INTO visitor_notebook_entries (
      id, visitor_id, content, source_message_id, created_at, updated_at,
      confidence, visibility, archived
    ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, 0
      WHERE EXISTS (SELECT 1 FROM mailbox_messages WHERE id = ? AND role = 'myri')`).bind(
      `visitor-note-${crypto.randomUUID()}`,
      value.visitor_id,
      entry.content,
      replyId,
      timestamp,
      timestamp,
      entry.confidence,
      entry.visibility,
      replyId,
    )),
    ...value.thinking_notes.map((entry) => db.prepare(`INSERT INTO mailbox_thinking_notes (
      id, visitor_id, content, created_at, updated_at, source_message_id, archived
    ) SELECT ?, ?, ?, ?, ?, ?, 0
      WHERE EXISTS (SELECT 1 FROM mailbox_messages WHERE id = ? AND role = 'myri')`).bind(
      `mailbox-thinking-${crypto.randomUUID()}`,
      value.visitor_id,
      entry.content,
      timestamp,
      timestamp,
      replyId,
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
  return {
    reply: messageFromRow(writtenReply),
    notebook_entry_count: notebookEntries.length,
    notebook_entries_skipped: notebookEntriesSkipped,
    thinking_note_count: value.thinking_notes.length,
    needs_owner_attention: value.needs_owner_attention,
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

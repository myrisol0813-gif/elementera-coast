import {
  createPassphraseHash,
  normalizePassphrase,
  passphraseLookup,
  verifyPassphraseHash,
} from './mailbox-auth.js';
import {
  archiveVisibleNotebookEntry,
  claimMailboxPatrol,
  completeMailboxPatrol,
  createMailboxVisitor,
  findMailboxVisitorByLookup,
  getMailboxVisitor,
  listMailboxMessages,
  listMailboxThinkingNotes,
  listOwnerMailboxVisitors,
  listVisitorNotebook,
  mailboxStatusForVisitor,
  MailboxRepositoryError,
  ownerMailboxSummary,
  touchMailboxVisitor,
  writeMailboxReply,
  writeVisitorMailboxMessage,
} from './mailbox-repository.js';

export class MailboxServiceError extends Error {
  constructor(type, message, status = 400) {
    super(message);
    this.name = 'MailboxServiceError';
    this.type = type;
    this.status = status;
  }
}

function invalid(message) {
  throw new MailboxServiceError('invalid_mailbox_input', message, 400);
}

function text(value, name, max, { required = false } = {}) {
  if (value == null) {
    if (required) invalid(`${name}不能为空。`);
    return '';
  }
  if (typeof value !== 'string') invalid(`${name}必须是文字。`);
  const result = value.trim();
  if (required && !result) invalid(`${name}不能为空。`);
  if (result.length > max) invalid(`${name}过长。`);
  return result;
}

function boolean(value, name, fallback) {
  if (value == null) return fallback;
  if (typeof value !== 'boolean') invalid(`${name}必须是布尔值。`);
  return value;
}

function array(value, name, max) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > max) invalid(`${name}格式无效。`);
  return value;
}

function activeVisitor(visitor) {
  if (!visitor?.is_active) {
    throw new MailboxServiceError('mailbox_session_invalid', '访客暗号已失效，请重新进入。', 401);
  }
  return visitor;
}

export async function registerMailboxVisitor(db, env, input = {}) {
  const displayName = text(input.display_name, '称呼', 80, { required: true });
  const preferredName = text(input.preferred_name, '希望 Myri 使用的称呼', 80);
  const passphrase = normalizePassphrase(input.passphrase);
  if (!passphrase) invalid('暗号不能为空。');
  if (passphrase.length > 160) invalid('暗号过长。');
  const allowMemory = boolean(input.allow_memory, 'allow_memory', true);
  const lookup = await passphraseLookup(passphrase, env);
  if (await findMailboxVisitorByLookup(db, lookup)) {
    throw new MailboxServiceError(
      'mailbox_passphrase_exists',
      '这个暗号已经被登记过。',
      409,
    );
  }
  try {
    return await createMailboxVisitor(db, {
      display_name: displayName,
      preferred_name: preferredName || null,
      passphrase_hash: await createPassphraseHash(passphrase),
      passphrase_lookup: lookup,
      allow_memory: allowMemory,
    });
  } catch (error) {
    if (/UNIQUE constraint failed: mailbox_visitors\.(?:passphrase_lookup|passphrase_hash)/.test(String(error?.message || ''))) {
      throw new MailboxServiceError(
        'mailbox_passphrase_exists',
        '这个暗号已经被登记过。',
        409,
      );
    }
    throw error;
  }
}

export async function loginMailboxVisitor(db, env, passphraseValue) {
  const passphrase = normalizePassphrase(passphraseValue);
  if (!passphrase) invalid('暗号不能为空。');
  if (passphrase.length > 160) invalid('暗号过长。');
  const record = await findMailboxVisitorByLookup(db, await passphraseLookup(passphrase, env));
  if (!record
    || !record.visitor.is_active
    || !(await verifyPassphraseHash(passphrase, record.passphrase_hash))) {
    throw new MailboxServiceError(
      'mailbox_passphrase_invalid',
      '暗号没有登记，或输入得不对。',
      401,
    );
  }
  return activeVisitor(await touchMailboxVisitor(db, record.visitor.id));
}

export async function currentMailboxVisitor(db, visitorId, { touch = false } = {}) {
  const visitor = touch
    ? await touchMailboxVisitor(db, visitorId)
    : await getMailboxVisitor(db, visitorId);
  return activeVisitor(visitor);
}

export async function mailboxMessages(db, visitorId) {
  await currentMailboxVisitor(db, visitorId);
  return listMailboxMessages(db, visitorId);
}

export async function sendMailboxMessage(db, visitorId, value) {
  await currentMailboxVisitor(db, visitorId);
  const content = text(value, '来信正文', 40000, { required: true });
  return writeVisitorMailboxMessage(db, visitorId, content);
}

export async function mailboxVisitorStatus(db, visitorId) {
  await currentMailboxVisitor(db, visitorId);
  return mailboxStatusForVisitor(db, visitorId);
}

export async function visibleVisitorNotebook(db, visitorId) {
  const visitor = await currentMailboxVisitor(db, visitorId);
  if (!visitor.allow_memory) return [];
  return listVisitorNotebook(db, visitorId, { visitorVisibleOnly: true });
}

export async function deleteVisibleVisitorNotebookEntry(db, visitorId, entryIdValue) {
  await currentMailboxVisitor(db, visitorId);
  const entryId = text(entryIdValue, '记事编号', 200, { required: true });
  if (!(await archiveVisibleNotebookEntry(db, visitorId, entryId))) {
    throw new MailboxServiceError('visitor_notebook_not_found', '这张访客记事不存在。', 404);
  }
}

export async function mailboxThinkingNotes(db, visitorId) {
  await currentMailboxVisitor(db, visitorId);
  return listMailboxThinkingNotes(db, visitorId);
}

function notebookEntries(value) {
  return array(value, 'optional_notebook_entries', 12).map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      invalid(`optional_notebook_entries[${index}] 格式无效。`);
    }
    const confidence = raw.confidence == null ? 1 : Number(raw.confidence);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      invalid(`optional_notebook_entries[${index}].confidence 超出范围。`);
    }
    const visibility = raw.visibility == null ? 'myri_only' : String(raw.visibility);
    if (!['myri_only', 'visitor_visible'].includes(visibility)) {
      invalid(`optional_notebook_entries[${index}].visibility 不是允许的选项。`);
    }
    return {
      content: text(raw.content, `optional_notebook_entries[${index}].content`, 2000, { required: true }),
      confidence,
      visibility,
    };
  });
}

function thinkingNotes(value) {
  return array(value, 'optional_thinking_notes', 12).map((raw, index) => {
    const content = typeof raw === 'string' ? raw : raw?.content;
    return {
      content: text(content, `optional_thinking_notes[${index}].content`, 4000, { required: true }),
    };
  });
}

export async function fetchUnrepliedMailbox(db, input = {}) {
  const requestedLimit = input.message_limit == null ? 60 : Number(input.message_limit);
  if (!Number.isInteger(requestedLimit) || requestedLimit < 10 || requestedLimit > 100) {
    invalid('message_limit 超出允许范围。');
  }
  return claimMailboxPatrol(db, { messageLimit: requestedLimit });
}

export async function replyToMailboxVisitor(db, input = {}) {
  const needsOwnerAttention = boolean(
    input.needs_owner_attention,
    'needs_owner_attention',
    false,
  );
  const ownerAttentionReason = needsOwnerAttention
    ? text(input.owner_attention_reason, 'owner_attention_reason', 500, { required: true })
    : '';
  try {
    return await writeMailboxReply(db, {
      batch_id: text(input.batch_id, 'batch_id', 200, { required: true }),
      queue_id: text(input.queue_id, 'queue_id', 240, { required: true }),
      visitor_id: text(input.visitor_id, 'visitor_id', 240, { required: true }),
      content: text(input.content, '回信正文', 40000, { required: true }),
      notebook_entries: notebookEntries(input.optional_notebook_entries),
      thinking_notes: thinkingNotes(input.optional_thinking_notes),
      needs_owner_attention: needsOwnerAttention,
      owner_attention_reason: ownerAttentionReason || null,
    });
  } catch (error) {
    if (error instanceof MailboxRepositoryError) {
      throw new MailboxServiceError(error.type, error.message, error.status);
    }
    throw error;
  }
}

export async function mailboxPatrolReport(db, input = {}) {
  try {
    const report = await completeMailboxPatrol(
      db,
      text(input.batch_id, 'batch_id', 200, { required: true }),
    );
    return {
      ...report,
      summary: `本次巡灯处理 ${report.visitor_count} 位访客，回信 ${report.reply_count} 封。${report.failure_count} 封未完成，${report.needs_owner_attention_count} 封需要小寒处理。`,
    };
  } catch (error) {
    if (error instanceof MailboxRepositoryError) {
      throw new MailboxServiceError(error.type, error.message, error.status);
    }
    throw error;
  }
}

export async function ownerMailboxVisitors(db) {
  return listOwnerMailboxVisitors(db);
}

export async function mailboxOwnerSummary(db) {
  return ownerMailboxSummary(db);
}

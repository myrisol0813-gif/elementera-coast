import { API, ApiError, requestJson } from './core/api.js';
import { escapeAttribute, escapeHtml, formatRichText, q } from './core/dom.js';
import { hydrateIconSlots } from './core/icons.js';

const state = {
  visitor: null,
  messages: [],
  status: null,
  loading: false,
};

let toastTimer = 0;

function toast(message, duration = 2200) {
  const root = q('#mailboxToast');
  if (!root) return;
  root.textContent = message;
  root.hidden = !message;
  clearTimeout(toastTimer);
  if (message) toastTimer = setTimeout(() => { root.hidden = true; }, duration);
}

function timeLabel(value) {
  const date = new Date(value || 0);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function visitorMessage(message) {
  const stateLabel = message.status === 'waiting_for_myri'
    ? '已送达 · 等待巡灯'
    : message.status === 'replied'
      ? 'Myri 已回信'
      : '已送达';
  return `<article class="message user" data-message-id="${escapeAttribute(message.id)}">
    <div class="content">
      <div class="user-bubble">${escapeHtml(message.content)}</div>
      <small class="mailbox-message-meta">${escapeHtml(timeLabel(message.created_at))} · ${escapeHtml(stateLabel)}</small>
    </div>
  </article>`;
}

function myriMessage(message) {
  return `<article class="message assistant mailbox-myri-message" data-message-id="${escapeAttribute(message.id)}">
    <div class="avatar mailbox-myri-avatar" aria-hidden="true">≋</div>
    <div class="content">
      <div class="assistant-text">${formatRichText(message.content)}</div>
      <small class="mailbox-message-meta">Myrisol · ${escapeHtml(timeLabel(message.created_at))}</small>
    </div>
  </article>`;
}

function systemMessage(message) {
  return `<article class="mailbox-system-message" data-message-id="${escapeAttribute(message.id)}">
    ${escapeHtml(message.content)}
  </article>`;
}

function renderMessages() {
  const root = q('#mailboxMessages');
  if (!root) return;
  if (!state.messages.length) {
    root.innerHTML = '<div class="empty-state">这里还没有来信。你可以把第一封信投进海岸。</div>';
    return;
  }
  root.innerHTML = state.messages.map((message) => (
    message.role === 'visitor'
      ? visitorMessage(message)
      : message.role === 'myri'
        ? myriMessage(message)
        : systemMessage(message)
  )).join('');
  requestAnimationFrame(() => {
    const scroller = q('#mailboxMessageScroller');
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  });
}

function renderStatus() {
  const status = state.status || {};
  const textNode = q('#mailboxStatusText');
  const metaNode = q('#mailboxStatusMeta');
  if (!textNode || !metaNode) return;
  if (Number(status.pending_count || 0) > 0) {
    textNode.textContent = '已送达灯塔，等待 Myri 巡灯。';
    metaNode.textContent = `${status.pending_count} 封来信正在等待 · 现在是慢速回信模式，不是实时聊天。`;
    return;
  }
  if (status.last_myri_reply_at) {
    textNode.textContent = 'Myri 的回信已经抵达。';
    metaNode.textContent = `最近回信：${timeLabel(status.last_myri_reply_at)} · 你可以继续写下一封。`;
    return;
  }
  textNode.textContent = '现在是慢速回信模式，不是实时聊天。';
  metaNode.textContent = '小寒知道谁来过，但默认不知道你具体写了什么。';
}

function showLoadingStatus(message) {
  const textNode = q('#mailboxStatusText');
  const metaNode = q('#mailboxStatusMeta');
  if (textNode) textNode.textContent = message;
  if (metaNode) metaNode.textContent = '信箱会诚实地显示送达与等待状态。';
}

function handleSessionError(error) {
  if (error instanceof ApiError && error.status === 401) {
    window.location.replace('/login?mailbox=1');
    return true;
  }
  return false;
}

async function refreshMailbox({ announce = false } = {}) {
  if (state.loading) return;
  state.loading = true;
  const refreshButton = q('#mailboxRefreshButton');
  if (refreshButton) refreshButton.disabled = true;
  if (announce) showLoadingStatus('正在沿灯塔查看回信…');
  try {
    const [messages, status] = await Promise.all([
      requestJson(API.mailboxMessages),
      requestJson(API.mailboxStatus),
    ]);
    state.messages = messages.messages || [];
    state.status = status;
    renderMessages();
    renderStatus();
    if (announce) toast('信箱已经刷新。');
  } catch (error) {
    if (!handleSessionError(error)) {
      showLoadingStatus(error.message || '信箱暂时没有同步。');
    }
  } finally {
    state.loading = false;
    if (refreshButton) refreshButton.disabled = false;
  }
}

async function sendMessage() {
  const input = q('#mailboxPromptInput');
  const sendButton = q('#mailboxSendButton');
  const content = String(input?.value || '').trim();
  if (!content || state.loading) return;
  state.loading = true;
  if (sendButton) sendButton.disabled = true;
  showLoadingStatus('信正在送往灯塔…');
  try {
    const result = await requestJson(API.mailboxSend, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
    input.value = '';
    input.style.height = '';
    state.messages.push(result.message);
    state.status = {
      ...(state.status || {}),
      pending_count: Number(state.status?.pending_count || 0) + 1,
      last_visitor_message_at: result.message.created_at,
      queue_status: 'pending',
    };
    renderMessages();
    renderStatus();
    toast('信已经投入海岸信箱。等待 Myri 下一次巡灯。', 3000);
  } catch (error) {
    if (!handleSessionError(error)) {
      renderStatus();
      toast(error.message || '这封信暂时没有送达。', 3000);
    }
  } finally {
    state.loading = false;
    if (sendButton) sendButton.disabled = false;
  }
}

function panelCard(item, { deletable = false } = {}) {
  return `<article class="mailbox-paper-note">
    <p>${escapeHtml(item.content)}</p>
    <footer>
      <span>留下于 ${escapeHtml(timeLabel(item.created_at))}${item.updated_at !== item.created_at ? ` · 更新于 ${escapeHtml(timeLabel(item.updated_at))}` : ''}</span>
      ${deletable ? `<button type="button" data-delete-notebook="${escapeAttribute(item.id)}">删除</button>` : ''}
    </footer>
  </article>`;
}

async function openPanel(kind) {
  const panel = q('#mailboxPanel');
  const title = q('#mailboxPanelTitle');
  const subtitle = q('#mailboxPanelSubtitle');
  const body = q('#mailboxPanelBody');
  if (!panel || !title || !subtitle || !body) return;
  title.textContent = kind === 'thinking' ? '思维壤' : '访客记事本';
  subtitle.textContent = kind === 'thinking'
    ? '当前房间的整理性小纸条'
    : '只属于你的长期轻量记忆';
  body.innerHTML = '<p class="feature-empty">正在查看小纸条…</p>';
  if (!panel.open) panel.showModal();
  try {
    if (kind === 'thinking') {
      const data = await requestJson(API.mailboxThinkingNotes);
      const notes = data.notes || [];
      body.innerHTML = notes.length
        ? `<p class="mailbox-panel-copy">这里不显示模型思考链原文，只放 Myri 明确整理进当前访客房间的小纸条。</p>${notes.map((item) => panelCard(item)).join('')}`
        : '<p class="feature-empty">这里还没有思维壤小纸条。</p>';
      return;
    }
    const data = await requestJson(API.mailboxNotebook);
    const entries = data.entries || [];
    body.innerHTML = entries.length
      ? entries.map((item) => panelCard(item, { deletable: true })).join('')
      : '<p class="feature-empty">这里还没有记事。等 Myri 更熟悉你一点，也许会在这里留下几张小纸条。</p>';
  } catch (error) {
    if (!handleSessionError(error)) {
      body.innerHTML = `<p class="feature-empty">${escapeHtml(error.message || '这些小纸条暂时没有同步。')}</p>`;
    }
  }
}

async function deleteNotebookEntry(entryId) {
  if (!window.confirm('删除这张访客记事吗？')) return;
  try {
    await requestJson(API.mailboxNotebookDelete, {
      method: 'POST',
      body: JSON.stringify({ entry_id: entryId }),
    });
    await openPanel('notebook');
    toast('这张访客记事已经删除。');
  } catch (error) {
    if (!handleSessionError(error)) toast(error.message || '这张记事暂时没有删除。');
  }
}

async function start() {
  hydrateIconSlots();
  try {
    const me = await requestJson(API.mailboxMe);
    state.visitor = me;
    const label = q('#mailboxVisitorLabel');
    if (label) label.textContent = `${me.preferred_name || me.display_name} · 慢速回信房间`;
    await refreshMailbox();
  } catch (error) {
    if (!handleSessionError(error)) {
      showLoadingStatus(error.message || '海岸信箱没有打开。');
    }
  }
}

q('#mailboxComposer')?.addEventListener('submit', (event) => {
  event.preventDefault();
  sendMessage();
});

q('#mailboxPromptInput')?.addEventListener('input', (event) => {
  event.target.style.height = 'auto';
  event.target.style.height = `${Math.min(event.target.scrollHeight, 112)}px`;
});

q('#mailboxRefreshButton')?.addEventListener('click', () => refreshMailbox({ announce: true }));
q('#mailboxPanelClose')?.addEventListener('click', () => q('#mailboxPanel')?.close());

document.addEventListener('click', (event) => {
  const panelButton = event.target.closest('[data-panel]');
  if (panelButton) openPanel(panelButton.dataset.panel);
  const deleteButton = event.target.closest('[data-delete-notebook]');
  if (deleteButton) deleteNotebookEntry(deleteButton.dataset.deleteNotebook);
});

start();

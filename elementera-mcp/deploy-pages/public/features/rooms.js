import { API, requestJson } from '../core/api.js';
import { escapeAttribute, escapeHtml, q } from '../core/dom.js';

const ROOM_COPY = Object.freeze({
  radio: {
    title: '无线电波的两端',
    sidebar: '【同步·】无线电波',
    subtitle: '小寒 · ✦Myrisol · 官端 ChatGPT≋',
    empty: '电波房已经接通，暂时还没有消息。',
  },
  lighthouse: {
    title: '灯塔来信',
    sidebar: '【同步·】灯塔来信',
    subtitle: '低频长信 · 服务器同步',
    empty: '灯塔已经亮起，暂时还没有来信。',
  },
});

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

function visibleModelLabel(value) {
  const raw = String(value || '').split('/').at(-1)?.replace(/:free$/i, '') || '';
  return raw.split(/[-_]+/).filter(Boolean).map((part) => (
    part.toLocaleLowerCase('en-US') === 'gpt' ? 'GPT' : part
  )).join('-');
}

function authorMeta(record) {
  const parts = [record.display_author || '未知来源'];
  if (record.model_label && !String(record.display_author || '').includes(record.model_label)) {
    parts.push(visibleModelLabel(record.model_label));
  }
  if (record.usage?.total_tokens != null) parts.push(`${record.usage.total_tokens} tokens`);
  const time = timeLabel(record.created_at);
  if (time) parts.push(time);
  return parts.join(' · ');
}

export function createRooms({ chat, router, toast }) {
  const state = {
    radio: { status: 'idle', items: [], error: '' },
    lighthouse: { status: 'idle', items: [], error: '' },
    asking: false,
  };

  function renderWindowList() {
    const list = q('#localRoomWindowList');
    if (!list) return;
    list.innerHTML = ['radio', 'lighthouse'].map((kind) => (
      `<button class="history-item" type="button" data-action="rooms:open" data-kind="${kind}">${escapeHtml(ROOM_COPY[kind].sidebar)}</button>`
    )).join('');
  }

  async function load(kind) {
    const room = state[kind];
    room.status = 'loading';
    room.error = '';
    try {
      const data = kind === 'radio'
        ? await requestJson(`${API.radioMessages}?limit=120`)
        : await requestJson(`${API.lighthouseLetters}?limit=80`);
      room.items = kind === 'radio' ? data.messages || [] : data.letters || [];
      room.status = 'ready';
    } catch (error) {
      room.status = 'failed';
      room.error = error.message || '读取失败';
    }
  }

  function radioBody() {
    const room = state.radio;
    if (room.status === 'loading') return '<p class="local-room-state">正在接收三端电波…</p>';
    if (room.status === 'failed') {
      return `<div class="local-room-state is-failed"><p>${escapeHtml(room.error)}</p><button type="button" data-action="rooms:retry" data-kind="radio">重新接收</button></div>`;
    }
    if (!room.items.length) return `<p class="feature-empty">${escapeHtml(ROOM_COPY.radio.empty)}</p>`;
    return room.items.map((message) => {
      const sourceClass = message.surface === 'official_mcp'
        ? 'is-official'
        : message.surface === 'coast_api'
          ? 'is-api'
          : '';
      const canWithdraw = message.actor === 'xiaohan'
        && message.surface === 'web_manual'
        && !message.withdrawn;
      return `<article class="local-message ${message.actor === 'xiaohan' ? 'is-user' : 'is-other'} ${sourceClass} ${message.withdrawn ? 'is-withdrawn' : ''}">
        <div>${escapeHtml(message.text)}</div>
        <small>${escapeHtml(authorMeta(message))}</small>
        ${canWithdraw
          ? `<button class="local-message-withdraw" type="button" data-action="rooms:withdraw-radio" data-id="${escapeAttribute(message.id)}">撤回</button>`
          : ''}
      </article>`;
    }).join('');
  }

  function lighthouseBody() {
    const room = state.lighthouse;
    if (room.status === 'loading') return '<p class="local-room-state">正在查看灯塔来信…</p>';
    if (room.status === 'failed') {
      return `<div class="local-room-state is-failed"><p>${escapeHtml(room.error)}</p><button type="button" data-action="rooms:retry" data-kind="lighthouse">重新查看</button></div>`;
    }
    if (!room.items.length) return `<p class="feature-empty">${escapeHtml(ROOM_COPY.lighthouse.empty)}</p>`;
    return room.items.map((letter) => `<article class="lighthouse-letter ${letter.read_at ? '' : 'is-unread'}">
      <header><strong>${escapeHtml(letter.subject || '无题来信')}</strong><small>${escapeHtml(authorMeta(letter))}</small></header>
      <div>${escapeHtml(letter.body)}</div>
      ${letter.read_at
        ? '<span class="letter-read-state">已读</span>'
        : `<button type="button" data-action="rooms:mark-read" data-id="${escapeAttribute(letter.id)}">标为已读</button>`}
    </article>`).join('');
  }

  function roomView({ kind }) {
    const copy = ROOM_COPY[kind] || ROOM_COPY.radio;
    const radio = kind === 'radio';
    return {
      title: copy.title,
      subtitle: copy.subtitle,
      className: `local-room server-room ${radio ? 'radio-room' : 'lighthouse-room'}`,
      headerAction: radio
        ? `<button class="feature-head-action" type="button" data-action="rooms:ask-api" ${state.asking ? 'disabled' : ''}>${state.asking ? '✦回应中…' : '让 ✦Myri 回应'}</button>`
        : '',
      body: `<div class="${radio ? 'local-message-list' : 'lighthouse-letter-list'}">${radio ? radioBody() : lighthouseBody()}</div>`,
      footer: radio
        ? '<form class="local-room-composer" data-submit="rooms:send-radio"><textarea id="localRoomInput" rows="1" placeholder="向三端房间发送一条电波"></textarea><button type="submit">发送</button></form>'
        : '<form class="local-room-composer lighthouse-composer" data-submit="rooms:send-letter"><input id="lighthouseSubject" maxlength="180" placeholder="来信标题（可选）"><textarea id="localRoomInput" rows="3" placeholder="写一封低频长信"></textarea><button type="submit">寄出</button></form>',
      afterRender(root) {
        const scroller = q('.feature-body', root);
        if (scroller && radio) scroller.scrollTop = scroller.scrollHeight;
      },
    };
  }

  router.register('server-room', roomView);

  async function open(kind) {
    if (!ROOM_COPY[kind]) return;
    state[kind].status = 'loading';
    await router.open('server-room', { kind });
    await load(kind);
    await router.refresh();
  }

  async function retry(kind) {
    if (!ROOM_COPY[kind]) return;
    state[kind].status = 'loading';
    await router.refresh();
    await load(kind);
    await router.refresh();
  }

  async function sendRadio(text) {
    const content = String(text || '').trim();
    if (!content) return;
    await requestJson(API.radioMessages, {
      method: 'POST',
      body: JSON.stringify({ text: content }),
    });
    await load('radio');
    await router.refresh();
  }

  async function sendLetter(subject, body) {
    const content = String(body || '').trim();
    if (!content) return;
    await requestJson(API.lighthouseLetters, {
      method: 'POST',
      body: JSON.stringify({ subject: String(subject || '').trim(), body: content }),
    });
    await load('lighthouse');
    await router.refresh();
    toast('来信已经放进灯塔。');
  }

  async function askApiMyri() {
    if (state.asking) return;
    state.asking = true;
    await router.refresh();
    try {
      await requestJson(API.radioAskApiMyri, {
        method: 'POST',
        body: JSON.stringify({ model: chat.getProfile().current_chat_model || '' }),
      });
      await load('radio');
    } finally {
      state.asking = false;
      await router.refresh();
    }
  }

  async function markRead(letterId) {
    await requestJson(`${API.lighthouseLetters}/${encodeURIComponent(letterId)}/read`, {
      method: 'PATCH',
      body: JSON.stringify({ read: true }),
    });
    await load('lighthouse');
    await router.refresh({ preserveScroll: true });
  }

  async function withdrawRadio(messageId) {
    if (!globalThis.confirm('撤回这条电波吗？撤回后房间里将不再显示正文。')) return;
    await requestJson(`${API.radioMessages}/${encodeURIComponent(messageId)}`, {
      method: 'DELETE',
    });
    await load('radio');
    await router.refresh({ preserveScroll: true });
    toast('这条电波已撤回。');
  }

  function handleAction(name, target) {
    if (name === 'open') return open(target.dataset.kind);
    if (name === 'retry') return retry(target.dataset.kind);
    if (name === 'ask-api') return askApiMyri();
    if (name === 'mark-read') return markRead(target.dataset.id);
    if (name === 'withdraw-radio') return withdrawRadio(target.dataset.id);
  }

  function handleSubmit(name, form) {
    const input = q('#localRoomInput', form);
    if (name === 'send-radio') return sendRadio(input?.value || '');
    if (name === 'send-letter') return sendLetter(q('#lighthouseSubject', form)?.value || '', input?.value || '');
  }

  function start() {
    renderWindowList();
  }

  return Object.freeze({ start, handleAction, handleSubmit, renderWindowList });
}

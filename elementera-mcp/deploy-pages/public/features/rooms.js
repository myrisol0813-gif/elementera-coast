import { API, requestJson } from '../core/api.js';
import { escapeAttribute, escapeHtml, q } from '../core/dom.js';

const ROOM_COPY = Object.freeze({
  radio: {
    title: '无线电波的两端',
    sidebar: '【同步·】无线电波',
    subtitle: '小寒 · 海岸 API ✦ · 官端 ChatGPT≋',
    empty: '电波房已经接通，暂时还没有消息。',
  },
  lighthouse: {
    title: '灯塔来信',
    sidebar: '【同步·】灯塔来信',
    subtitle: '小寒 ↔ 官端灯塔侧 ≋',
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
    radio: { status: 'idle', items: [], error: '', memory: null },
    lighthouse: { status: 'idle', items: [], error: '', memory: null },
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
      const [data, memoryData] = await Promise.all([
        kind === 'radio'
          ? requestJson(`${API.radioMessages}?limit=120`)
          : requestJson(`${API.lighthouseLetters}?limit=80`),
        requestJson(kind === 'radio' ? API.radioMemory : API.lighthouseMemory)
          .catch((error) => {
            console.warn('[room-memory:load]', error);
            return { memory: null };
          }),
      ]);
      room.items = kind === 'radio' ? data.messages || [] : data.letters || [];
      room.memory = memoryData.memory || null;
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
      const canWithdraw = !message.withdrawn;
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

  function roomMemoryBody(kind) {
    const memory = state[kind].memory;
    const drawerTitle = kind === 'radio'
      ? '房间记忆 · 三侧分开'
      : '房间记忆 · 两侧分开';
    if (!memory?.sources) {
      return `<section class="room-memory-drawer"><details class="room-memory-summary">
        <summary>${escapeHtml(drawerTitle)}</summary>
        <div class="room-memory-content"><p class="feature-note">房间记忆暂未同步，消息与来信仍可正常读取。</p></div>
      </details></section>`;
    }
    const sources = kind === 'radio'
      ? [
        ['web_manual', '小寒侧 · 神秘狗话'],
        ['coast_api', '海岸 API ✦ · 自动滚动壤'],
        ['official_mcp', '官端灯塔侧 ≋ · 自动滚动壤'],
      ]
      : [
        ['web_manual', '小寒侧 · 神秘狗话'],
        ['official_mcp', '官端灯塔侧 ≋ · 自动滚动壤'],
      ];
    const ownerNote = String(memory.owner_note?.text
      ?? memory.sources.web_manual?.soil?.current_text
      ?? '').trim();
    const soils = sources.map(([source, label]) => {
      const soil = memory.sources[source]?.soil || {};
      const text = String(soil.current_text || '').trim();
      if (source === 'web_manual') {
        return `<section class="room-memory-source is-owner-note">
          <label for="roomOwnerNote-${kind}"><strong>${escapeHtml(label)}</strong><small>小寒亲手写给本房间的理解与召回提示，优先于自动滚动壤，但不会自动变成长久记忆。</small></label>
          <textarea id="roomOwnerNote-${kind}" maxlength="4000" rows="4" placeholder="在这里写一点神秘狗话……">${escapeHtml(ownerNote)}</textarea>
          <div class="button-row">
            ${ownerNote ? `<button type="button" data-action="rooms:delete-owner-note" data-kind="${kind}">清除</button>` : ''}
            <button class="primary" type="button" data-action="rooms:save-owner-note" data-kind="${kind}">保存神秘狗话</button>
          </div>
        </section>`;
      }
      return `<div class="feature-row static room-memory-source"><span><strong>${escapeHtml(label)}</strong><small>${escapeHtml(text || '暂无')}</small></span></div>`;
    }).join('');
    const pockets = sources.flatMap(([source, label]) => (
      (memory.sources[source]?.pending_pockets || []).map((pocket) => ({ pocket, label }))
    ));
    const pending = pockets.length
      ? `<div class="room-memory-pockets"><h3>待确认袋 · ${pockets.length}</h3>${pockets.map(({ pocket, label }) => `<article class="summary-candidate">
          <small>${escapeHtml(label)}</small>
          <strong>${escapeHtml(pocket.title || pocket.suggested_title || '待确认内容')}</strong>
          <p>${escapeHtml(pocket.life_core || pocket.suggested_life_core || pocket.source_text || '')}</p>
          <div class="button-row">
            <button type="button" data-action="rooms:resolve-pocket" data-kind="${kind}" data-id="${escapeAttribute(pocket.id)}" data-destination="discard">丢弃</button>
            <button type="button" data-action="rooms:resolve-pocket" data-kind="${kind}" data-id="${escapeAttribute(pocket.id)}" data-destination="conversation_seed">房间种子</button>
            <button type="button" data-action="rooms:resolve-pocket" data-kind="${kind}" data-id="${escapeAttribute(pocket.id)}" data-destination="conversation_memory">房间记忆</button>
            <button type="button" data-action="rooms:resolve-pocket" data-kind="${kind}" data-id="${escapeAttribute(pocket.id)}" data-destination="confirm_pocket">确认落袋</button>
          </div>
        </article>`).join('')}</div>`
      : '<p class="feature-note room-memory-empty">待确认袋：暂无。候选在确认前不参与事实召回。</p>';
    return `<section class="room-memory-drawer"><details class="room-memory-summary">
      <summary>${escapeHtml(drawerTitle)}</summary>
      <div class="room-memory-content">
        ${soils}${pending}
      </div>
    </details></section>`;
  }

  function roomView({ kind }) {
    const copy = ROOM_COPY[kind] || ROOM_COPY.radio;
    const radio = kind === 'radio';
    return {
      title: copy.title,
      subtitle: copy.subtitle,
      className: `local-room server-room ${radio ? 'radio-room' : 'lighthouse-room'}`,
      headerAction: radio
        ? `<button class="feature-head-action" type="button" data-action="rooms:ask-api" ${state.asking ? 'disabled' : ''}>${state.asking ? '✦回应中…' : '让海岸 API ✦ 回应'}</button>`
        : '',
      body: `${roomMemoryBody(kind)}<div class="${radio ? 'local-message-list' : 'lighthouse-letter-list'}">${radio ? radioBody() : lighthouseBody()}</div>`,
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
    await requestJson(`${API.radioMessages}/${encodeURIComponent(messageId)}`, {
      method: 'DELETE',
    });
    await load('radio');
    await router.refresh({ preserveScroll: true });
    toast('这条电波已撤回。');
  }

  async function resolvePocket(kind, pocketId, action) {
    const base = kind === 'lighthouse' ? API.lighthouseMemory : API.radioMemory;
    await requestJson(`${base}/pockets/${encodeURIComponent(pocketId)}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    });
    await load(kind);
    await router.refresh({ preserveScroll: true });
    toast(action === 'discard' ? '候选已经丢弃。' : '已经放进对应的房间记忆分区。');
  }

  async function saveOwnerNote(kind) {
    const text = q(`#roomOwnerNote-${kind}`)?.value || '';
    const base = kind === 'lighthouse' ? API.lighthouseMemory : API.radioMemory;
    await requestJson(`${base}/owner-note`, {
      method: 'PUT',
      body: JSON.stringify({ text }),
    });
    await load(kind);
    await router.refresh({ preserveScroll: true });
    toast('神秘狗话已经写进这个房间。');
  }

  async function deleteOwnerNote(kind) {
    const base = kind === 'lighthouse' ? API.lighthouseMemory : API.radioMemory;
    await requestJson(`${base}/owner-note`, { method: 'DELETE' });
    await load(kind);
    await router.refresh({ preserveScroll: true });
    toast('这段神秘狗话已经清除。');
  }

  function handleAction(name, target) {
    if (name === 'open') return open(target.dataset.kind);
    if (name === 'retry') return retry(target.dataset.kind);
    if (name === 'ask-api') return askApiMyri();
    if (name === 'mark-read') return markRead(target.dataset.id);
    if (name === 'withdraw-radio') return withdrawRadio(target.dataset.id);
    if (name === 'save-owner-note') return saveOwnerNote(target.dataset.kind);
    if (name === 'delete-owner-note') return deleteOwnerNote(target.dataset.kind);
    if (name === 'resolve-pocket') {
      return resolvePocket(target.dataset.kind, target.dataset.id, target.dataset.destination);
    }
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

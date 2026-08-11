import { API, requestJson } from '../core/api.js';
import { escapeAttribute, escapeHtml, q } from '../core/dom.js';

const ROOM_COPY = Object.freeze({
  radio: Object.freeze({
    title: '无线电波的两端',
    subtitle: '小寒 · 海岸 API ✦ · 官端 ChatGPT≋',
    placeholder: '向三端房间发送一条电波',
    empty: '电波房已经接通，暂时还没有消息。',
    soil: '电波房思维壤',
  }),
  lighthouse: Object.freeze({
    title: '灯塔来信',
    subtitle: '小寒 ↔ 官端 ChatGPT≋',
    placeholder: '写一封低频长信',
    empty: '灯塔已经亮起，暂时还没有来信。',
    soil: '灯塔来信思维壤',
  }),
});

const SOURCE_LABELS = Object.freeze({
  coast_api: '海岸 API ✦',
  official_mcp: '官端灯塔侧 ≋',
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

function authorMeta(record) {
  return [record.display_author || '未知来源', timeLabel(record.created_at)]
    .filter(Boolean)
    .join(' · ');
}

function dogtalkMark(record) {
  const snapshot = record.dogtalk_snapshot;
  if (!snapshot?.body) return '';
  const weather = snapshot.weather ? ` · ${snapshot.weather}` : '';
  return `<span class="message-dogtalk-mark" title="这条消息携带了小寒当时的低权重神秘狗话">神秘狗话${escapeHtml(weather)}</span>`;
}

function soilSourceLabel(item, source, soil) {
  if (item.surface === 'coast_api') return '海岸 API ✦';
  const soilModel = String(soil.model_label || '').trim();
  const soilHasKnownModel = soilModel && soilModel !== '未标注模型';
  if (soilHasKnownModel && soil.display_author) return soil.display_author;
  return item.display_author
    || soil.display_author
    || source?.source_label
    || SOURCE_LABELS[item.surface]
    || '模型侧';
}

export function createRooms({ router, toast, dogtalk }) {
  const state = {
    active: 'conversation',
    asking: false,
    radio: { items: [], memory: null, status: 'idle', error: '' },
    lighthouse: { items: [], memory: null, status: 'idle', error: '' },
  };
  const ui = {};

  function bindUi() {
    ui.chatWindow = q('#chatWindow');
    ui.roomWindow = q('#roomWindow');
    ui.modelButton = q('#modelButton');
    ui.roomHeading = q('#roomHeading');
    ui.roomTitle = q('#roomTitle');
    ui.roomSubtitle = q('#roomSubtitle');
    ui.chatActions = q('#chatTopbarActions');
    ui.roomActions = q('#roomTopbarActions');
    ui.messages = q('#roomMessages');
    ui.scroller = q('#roomMessageScroller');
    ui.status = q('#roomStatus');
    ui.form = q('#roomComposer');
    ui.input = q('#roomPromptInput');
    ui.subjectWrap = q('#roomSubjectWrap');
    ui.subject = q('#roomSubject');
    ui.dogtalk = q('#roomDogtalkComposer');
  }

  function setStatus(message = '', kind = 'error') {
    if (!ui.status) return;
    ui.status.textContent = message;
    ui.status.dataset.kind = kind;
    ui.status.hidden = !message;
  }

  function activateMain() {
    state.active = 'conversation';
    if (!ui.chatWindow) bindUi();
    if (ui.chatWindow) ui.chatWindow.hidden = false;
    if (ui.roomWindow) {
      ui.roomWindow.hidden = true;
      ui.roomWindow.dataset.windowScope = '';
    }
    if (ui.modelButton) ui.modelButton.hidden = false;
    if (ui.roomHeading) ui.roomHeading.hidden = true;
    if (ui.chatActions) ui.chatActions.hidden = false;
    if (ui.roomActions) ui.roomActions.hidden = true;
  }

  function roomTopbar(kind) {
    const radio = kind === 'radio';
    ui.roomTitle.textContent = ROOM_COPY[kind].title;
    ui.roomSubtitle.textContent = ROOM_COPY[kind].subtitle;
    ui.roomActions.innerHTML = `${radio
      ? `<button class="room-top-action" type="button" data-action="rooms:ask-api" ${state.asking ? 'disabled' : ''}>${state.asking ? '✦ 回应中…' : '让海岸 API ✦ 回应'}</button>`
      : ''}`;
    ui.roomActions.hidden = false;
  }

  function activateRoom(kind) {
    state.active = kind;
    if (!ui.chatWindow) bindUi();
    ui.chatWindow.hidden = true;
    ui.roomWindow.hidden = false;
    ui.roomWindow.dataset.windowScope = kind;
    ui.modelButton.hidden = true;
    ui.roomHeading.hidden = false;
    ui.chatActions.hidden = true;
    roomTopbar(kind);
    ui.subjectWrap.hidden = kind !== 'lighthouse';
    ui.input.placeholder = ROOM_COPY[kind].placeholder;
  }

  function latestModelIds(kind) {
    const result = {};
    for (const item of state[kind].items) {
      if (!['coast_api', 'official_mcp'].includes(item.surface)) continue;
      const current = result[item.surface];
      if (!current || Date.parse(item.created_at || 0) >= current.createdAt) {
        result[item.surface] = {
          id: item.id,
          createdAt: Date.parse(item.created_at || 0),
        };
      }
    }
    return Object.fromEntries(Object.entries(result).map(([source, value]) => [source, value.id]));
  }

  function soilTip(kind, item, latest) {
    if (latest[item.surface] !== item.id) return '';
    if (kind === 'lighthouse' && item.surface !== 'official_mcp') return '';
    const source = state[kind].memory?.sources?.[item.surface];
    const soil = source?.soil || {};
    const count = Array.isArray(soil.hand_seeds) ? soil.hand_seeds.length : 0;
    const label = soilSourceLabel(item, source, soil);
    return `<div class="thought-soil-row room-soil-tip">
      <button class="thought-soil-entry" type="button" data-action="memory:soil-open" data-scope="${kind}" data-source-surface="${escapeAttribute(item.surface)}">
        ${escapeHtml(ROOM_COPY[kind].soil)} · ${escapeHtml(label)} · ${count} 粒手持种 <span aria-hidden="true">›</span>
      </button>
    </div>`;
  }

  function radioMessage(message, latest) {
    const sourceClass = message.surface === 'official_mcp'
      ? 'is-official'
      : message.surface === 'coast_api'
        ? 'is-api'
        : '';
    const user = message.actor === 'xiaohan';
    const canWithdraw = message.actor === 'xiaohan'
      && message.surface === 'web_manual'
      && !message.withdrawn;
    return `${soilTip('radio', message, latest)}
      <article class="local-message ${user ? 'is-user' : 'is-other'} ${sourceClass} ${message.withdrawn ? 'is-withdrawn' : ''}" data-room-message-id="${escapeAttribute(message.id)}">
        <div>${escapeHtml(message.text)}</div>
        <small>${escapeHtml(authorMeta(message))}${dogtalkMark(message)}</small>
        ${canWithdraw
          ? `<button class="local-message-withdraw" type="button" data-action="rooms:withdraw-radio" data-id="${escapeAttribute(message.id)}">撤回</button>`
          : ''}
      </article>`;
  }

  function lighthouseLetter(letter, latest) {
    const user = letter.actor === 'xiaohan';
    return `${soilTip('lighthouse', letter, latest)}
      <article class="lighthouse-letter ${user ? 'is-user' : 'is-other'} ${letter.read_at ? '' : 'is-unread'}" data-room-message-id="${escapeAttribute(letter.id)}">
        <header><strong>${escapeHtml(letter.subject || '无题来信')}</strong><small>${escapeHtml(authorMeta(letter))}${dogtalkMark(letter)}</small></header>
        <div>${escapeHtml(letter.body)}</div>
        ${letter.read_at
          ? '<span class="letter-read-state">已读</span>'
          : `<button type="button" data-action="rooms:mark-read" data-id="${escapeAttribute(letter.id)}">标为已读</button>`}
      </article>`;
  }

  function renderRoom() {
    const kind = state.active;
    if (!ROOM_COPY[kind] || !ui.messages) return;
    const room = state[kind];
    if (room.status === 'loading') {
      ui.messages.innerHTML = `<p class="local-room-state">${kind === 'radio' ? '正在接收三端电波…' : '正在查看灯塔来信…'}</p>`;
      return;
    }
    if (room.status === 'failed') {
      ui.messages.innerHTML = `<div class="local-room-state is-failed"><p>${escapeHtml(room.error)}</p><button type="button" data-action="rooms:retry" data-kind="${kind}">重新接收</button></div>`;
      return;
    }
    if (!room.items.length) {
      ui.messages.innerHTML = `<p class="feature-empty">${escapeHtml(ROOM_COPY[kind].empty)}</p>`;
      return;
    }
    const latest = latestModelIds(kind);
    const items = kind === 'lighthouse' ? [...room.items].reverse() : room.items;
    ui.messages.innerHTML = items.map((item) => (
      kind === 'radio' ? radioMessage(item, latest) : lighthouseLetter(item, latest)
    )).join('');
    requestAnimationFrame(() => {
      if (ui.scroller) ui.scroller.scrollTop = ui.scroller.scrollHeight;
    });
  }

  async function load(kind) {
    const room = state[kind];
    room.status = 'loading';
    room.error = '';
    renderRoom();
    try {
      const [data, memoryData] = await Promise.all([
        requestJson(kind === 'radio' ? `${API.radioMessages}?limit=120` : `${API.lighthouseLetters}?limit=80`),
        requestJson(kind === 'radio' ? API.radioMemory : API.lighthouseMemory),
      ]);
      room.items = kind === 'radio' ? data.messages || [] : data.letters || [];
      room.memory = memoryData.memory || null;
      room.status = 'ready';
      renderRoom();
    } catch (error) {
      room.status = 'failed';
      room.error = error.message || '房间暂时没有同步';
      renderRoom();
    }
  }

  async function open(kind) {
    if (!ROOM_COPY[kind]) return;
    await router.close();
    activateRoom(kind);
    dogtalk.mount(ui.dogtalk, { room_scope: kind });
    return load(kind);
  }

  async function send() {
    const kind = state.active;
    if (!ROOM_COPY[kind]) return;
    const text = String(ui.input?.value || '').trim();
    if (!text) return;
    const dogtalkSubmission = dogtalk.submission({ room_scope: kind }, ui.dogtalk);
    setStatus(kind === 'radio' ? '正在发送电波…' : '正在寄出灯塔来信…', 'loading');
    if (kind === 'radio') {
      await requestJson(API.radioMessages, {
        method: 'POST',
        body: JSON.stringify({
          text,
          ...(dogtalkSubmission ? { dogtalk: dogtalkSubmission } : {}),
        }),
      });
    } else {
      await requestJson(API.lighthouseLetters, {
        method: 'POST',
        body: JSON.stringify({
          subject: String(ui.subject?.value || '').trim(),
          body: text,
          ...(dogtalkSubmission ? { dogtalk: dogtalkSubmission } : {}),
        }),
      });
    }
    ui.input.value = '';
    if (ui.subject) ui.subject.value = '';
    setStatus('');
    await Promise.all([load(kind), dogtalk.mount(ui.dogtalk, { room_scope: kind })]);
    if (kind === 'lighthouse') toast('来信已经放进灯塔。');
  }

  async function askApi() {
    if (state.active !== 'radio' || state.asking) return;
    state.asking = true;
    roomTopbar('radio');
    try {
      await requestJson(API.radioAskApiMyri, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      await load('radio');
    } finally {
      state.asking = false;
      roomTopbar('radio');
    }
  }

  async function withdrawRadio(id) {
    await requestJson(`${API.radioMessages}/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await load('radio');
    toast('这条电波已撤回。');
  }

  async function markRead(id) {
    await requestJson(`${API.lighthouseLetters}/${encodeURIComponent(id)}/read`, {
      method: 'PATCH',
      body: JSON.stringify({ read: true }),
    });
    await load('lighthouse');
  }

  function handleAction(name, target) {
    if (name === 'open') return open(target.dataset.kind);
    if (name === 'retry') return load(target.dataset.kind);
    if (name === 'ask-api') return askApi();
    if (name === 'withdraw-radio') return withdrawRadio(target.dataset.id);
    if (name === 'mark-read') return markRead(target.dataset.id);
  }

  function handleSubmit(name) {
    if (name === 'send') return send();
  }

  function start() {
    bindUi();
    activateMain();
  }

  return Object.freeze({
    start,
    open,
    activateMain,
    getActiveScope: () => state.active,
    getRoomMemory: (kind) => state[kind]?.memory || null,
    reloadMemory: async (kind) => {
      const data = await requestJson(kind === 'radio' ? API.radioMemory : API.lighthouseMemory);
      state[kind].memory = data.memory || null;
      if (state.active === kind) renderRoom();
      return state[kind].memory;
    },
    handleAction,
    handleSubmit,
  });
}

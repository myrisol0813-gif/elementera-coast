import { escapeAttribute, escapeHtml, id, q } from '../core/dom.js';

const ROOM_COPY = Object.freeze({
  radio: {
    title: '无线电波的两端',
    prefix: '【电波·】',
    windowTitle: '电波窗口',
    subtitle: '电波入口 · 暂未接入',
    empty: '无线电波暂未接入。',
  },
  lighthouse: {
    title: '灯塔来信',
    prefix: '【灯塔·】',
    windowTitle: '来信窗口',
    subtitle: '来信入口 · 暂未接入',
    empty: '暂时还没有来信。',
  },
});

export function createRooms({ storage, router, toast }) {
  function roomState(kind) {
    return storage.read().rooms[kind];
  }

  function activeRoom(kind, roomId = '') {
    const state = roomState(kind);
    return state.rooms.find((room) => room.id === (roomId || state.active)) || state.rooms[0];
  }

  function renderWindowList() {
    const list = q('#localRoomWindowList');
    if (!list) return;
    const buttons = [];
    for (const kind of ['radio', 'lighthouse']) {
      const copy = ROOM_COPY[kind];
      for (const room of roomState(kind).rooms) {
        buttons.push(`<button class="history-item" type="button" data-action="rooms:window" data-kind="${kind}" data-id="${escapeAttribute(room.id)}">${escapeHtml(copy.prefix)}${escapeHtml(room.title)}</button>`);
      }
    }
    list.innerHTML = buttons.join('') || '<p class="sidebar-empty">还没有本地房间</p>';
  }

  function roomView({ kind, id: roomId }) {
    const copy = ROOM_COPY[kind] || ROOM_COPY.radio;
    const room = activeRoom(kind, roomId);
    const messages = room.messages.length
      ? room.messages.map((message) => `<div class="local-message ${message.from === '小寒' ? 'is-user' : 'is-other'}"><div>${escapeHtml(message.text)}</div><small>${escapeHtml(message.from || '小寒')}</small></div>`).join('')
      : `<p class="feature-empty">${escapeHtml(copy.empty)}</p>`;
    return {
      title: copy.title,
      subtitle: `${copy.prefix}${room.title} · ${copy.subtitle}`,
      className: 'local-room',
      headerAction: `<button class="feature-head-action" type="button" data-action="rooms:new" data-kind="${kind}">新建窗口</button>`,
      body: `<div class="local-message-list">${messages}</div>`,
      footer: `<form class="local-room-composer" data-submit="rooms:send" data-kind="${kind}" data-id="${escapeAttribute(room.id)}"><textarea id="localRoomInput" rows="1" placeholder="写一条本地消息"></textarea><button type="submit">发送</button></form>`,
      afterRender(root) {
        const scroller = q('.feature-body', root);
        if (scroller) scroller.scrollTop = scroller.scrollHeight;
      },
    };
  }

  router.register('local-room', roomView);
  async function open(kind, roomId = '') {
    if (!ROOM_COPY[kind]) return;
    const room = activeRoom(kind, roomId);
    storage.update((state) => { state.rooms[kind].active = room.id; });
    renderWindowList();
    await router.open('local-room', { kind, id: room.id });
  }

  async function newRoom(kind) {
    if (!ROOM_COPY[kind]) return;
    let room;
    storage.update((state) => {
      const rooms = state.rooms[kind].rooms;
      room = {
        id: id(kind === 'lighthouse' ? 'letter' : 'radio'),
        title: `${ROOM_COPY[kind].windowTitle} ${rooms.length + 1}`,
        messages: [],
        updatedAt: Date.now(),
      };
      rooms.push(room);
      state.rooms[kind].active = room.id;
    });
    renderWindowList();
    await router.open('local-room', { kind, id: room.id }, { replace: true });
  }

  async function send(kind, roomId, text) {
    const content = String(text || '').trim();
    if (!content) return;
    storage.update((state) => {
      const room = state.rooms[kind].rooms.find((item) => item.id === roomId);
      if (!room) return;
      room.messages.push({ from: '小寒', text: content, at: Date.now() });
      room.messages = room.messages.slice(-200);
      room.updatedAt = Date.now();
      state.rooms[kind].active = room.id;
    });
    renderWindowList();
    await router.refresh();
  }

  function handleAction(name, target) {
    if (name === 'open' || name === 'window') return open(target.dataset.kind, target.dataset.id || '');
    if (name === 'new') return newRoom(target.dataset.kind);
  }

  function handleSubmit(name, form) {
    if (name !== 'send') return;
    const input = q('#localRoomInput', form);
    return send(form.dataset.kind, form.dataset.id, input?.value || '').catch((error) => toast(`本地消息保存失败：${error.message}`));
  }

  function start() {
    renderWindowList();
  }

  return Object.freeze({ start, handleAction, handleSubmit, renderWindowList });
}

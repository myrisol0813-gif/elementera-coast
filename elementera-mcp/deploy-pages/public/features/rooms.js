import { API, requestJson } from '../core/api.js';
import { escapeAttribute, escapeHtml, q } from '../core/dom.js';

const ROOM_COPY = Object.freeze({
  radio: {
    title: '无线电波的两端',
    sidebar: '【同步·】无线电波',
    subtitle: '小寒 · 海岸 API ✦ · 官端 ChatGPT≋',
    empty: '电波房已经接通，暂时还没有消息。',
    memoryTitle: '电波房轨迹',
    soilLabel: '电波房思维壤',
    localLabel: '电波房',
  },
  lighthouse: {
    title: '灯塔来信',
    sidebar: '【同步·】灯塔来信',
    subtitle: '小寒 ↔ 官端灯塔侧 ≋',
    empty: '灯塔已经亮起，暂时还没有来信。',
    memoryTitle: '灯塔来信轨迹',
    soilLabel: '灯塔来信思维壤',
    localLabel: '灯塔来信',
  },
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

function roomSourceLabel(record) {
  return record.source_label
    || SOURCE_LABELS[record.source_surface]
    || SOURCE_LABELS[record.surface]
    || '房间记录';
}

function recordText(record) {
  return record.life_core || record.content || record.source_text || '';
}

export function createRooms({ chat, router, toast, dogtalk }) {
  const state = {
    radio: {
      status: 'idle',
      items: [],
      error: '',
      memoryStatus: 'idle',
      memoryError: '',
      memory: null,
      memoryTab: 'local',
    },
    lighthouse: {
      status: 'idle',
      items: [],
      error: '',
      memoryStatus: 'idle',
      memoryError: '',
      memory: null,
      memoryTab: 'local',
    },
    asking: false,
  };

  function renderWindowList() {
    const list = q('#localRoomWindowList');
    if (!list) return;
    list.innerHTML = ['radio', 'lighthouse'].map((kind) => (
      `<button class="history-item" type="button" data-action="rooms:open" data-kind="${kind}">${escapeHtml(ROOM_COPY[kind].sidebar)}</button>`
    )).join('');
  }

  async function loadRoom(kind) {
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

  async function loadMemory(kind) {
    const room = state[kind];
    room.memoryStatus = 'loading';
    room.memoryError = '';
    try {
      const data = await requestJson(kind === 'radio' ? API.radioMemory : API.lighthouseMemory);
      room.memory = data.memory || null;
      room.memoryStatus = 'ready';
      try {
        await dogtalk.fetchScope({ room_scope: kind });
      } catch (error) {
        console.warn('[room-dogtalk:load]', String(error?.message || error).slice(0, 160));
      }
    } catch (error) {
      room.memoryStatus = 'failed';
      room.memoryError = error.message || '房间轨迹暂时没有同步';
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

  function roomView({ kind }) {
    const copy = ROOM_COPY[kind] || ROOM_COPY.radio;
    const radio = kind === 'radio';
    return {
      title: copy.title,
      subtitle: copy.subtitle,
      className: `local-room server-room ${radio ? 'radio-room' : 'lighthouse-room'}`,
      headerAction: `<div class="feature-head-actions">
        <button class="feature-head-action room-trace-link" type="button" data-action="rooms:open-memory" data-kind="${kind}">轨迹 / 思维壤</button>
        ${radio
          ? `<button class="feature-head-action" type="button" data-action="rooms:ask-api" ${state.asking ? 'disabled' : ''}>${state.asking ? '✦回应中…' : '让海岸 API ✦ 回应'}</button>`
          : ''}
      </div>`,
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

  function memoryRecordCard(record) {
    return `<article class="feature-card feature-prose room-track-card">
      <small>${escapeHtml(roomSourceLabel(record))}</small>
      <h2>${escapeHtml(record.title || '未命名记录')}</h2>
      <p>${escapeHtml(recordText(record) || '还没有展开文字。')}</p>
      ${record.created_at ? `<footer>${escapeHtml(timeLabel(record.created_at))}</footer>` : ''}
    </article>`;
  }

  function recordGroup(title, records, empty) {
    return `<section class="feature-group"><h2>${escapeHtml(title)}</h2>${records.length
      ? `<div class="room-track-list">${records.map(memoryRecordCard).join('')}</div>`
      : `<div class="feature-card"><p class="feature-empty">${escapeHtml(empty)}</p></div>`}</section>`;
  }

  function pendingCard(kind, pocket) {
    const copy = ROOM_COPY[kind];
    const id = escapeAttribute(pocket.id);
    return `<article class="summary-candidate room-pocket-card">
      <small>${escapeHtml(roomSourceLabel(pocket))}</small>
      <strong>${escapeHtml(pocket.title || pocket.suggested_title || '待确认内容')}</strong>
      <p>${escapeHtml(recordText(pocket) || '')}</p>
      <p class="feature-note">确认前不参与事实召回。</p>
      <div class="button-row">
        <button type="button" data-action="rooms:resolve-pocket" data-kind="${kind}" data-id="${id}" data-destination="conversation_seed">${copy.localLabel}种子</button>
        <button type="button" data-action="rooms:resolve-pocket" data-kind="${kind}" data-id="${id}" data-destination="conversation_memory">${copy.localLabel}记忆</button>
        <button type="button" data-action="rooms:resolve-pocket" data-kind="${kind}" data-id="${id}" data-destination="global_seed">总种子</button>
        <button type="button" data-action="rooms:resolve-pocket" data-kind="${kind}" data-id="${id}" data-destination="global_memory">总记忆</button>
        <button type="button" data-action="rooms:resolve-pocket" data-kind="${kind}" data-id="${id}" data-destination="stone">转石头</button>
        <button type="button" data-action="rooms:resolve-pocket" data-kind="${kind}" data-id="${id}" data-destination="discard">丢弃</button>
      </div>
    </article>`;
  }

  function localMemoryBody(kind, memory) {
    const copy = ROOM_COPY[kind];
    const handSeeds = Object.values(memory.sources || {}).reduce(
      (count, source) => count + (source.soil?.hand_seeds?.length || 0),
      0,
    );
    const pockets = memory.pending_pockets || [];
    return `<section class="feature-group"><div class="feature-card">
      <button class="feature-row" type="button" data-action="rooms:open-soil" data-kind="${kind}">
        <span><strong>${escapeHtml(copy.soilLabel)} · ${handSeeds} 粒手持种</strong><small>当前、手持种、勿复读与可落袋，按模型来源留痕。</small></span><span>›</span>
      </button>
      <div class="feature-row static"><span><strong>待确认袋 · ${pockets.length}</strong><small>只属于${escapeHtml(copy.localLabel)}；确认前不参与召回。</small></span></div>
      ${dogtalk.entryButton({ room_scope: kind })}
    </div></section>
    ${pockets.length
      ? `<section class="feature-group"><h2>${escapeHtml(copy.localLabel)}待确认袋</h2><div class="room-track-list">${pockets.map((pocket) => pendingCard(kind, pocket)).join('')}</div></section>`
      : `<section class="feature-group"><h2>${escapeHtml(copy.localLabel)}待确认袋</h2><div class="feature-card"><p class="feature-empty">暂无。候选在确认前不参与事实召回。</p></div></section>`}
    ${recordGroup(`${copy.localLabel}种子`, memory.seeds || [], '这个房间还没有种子。')}
    ${recordGroup(`${copy.localLabel}记忆`, memory.memories || [], '这个房间还没有稳定记忆。')}`;
  }

  function globalMemoryBody(memory) {
    return `<p class="feature-note room-global-note">总库是远岸苗圃与公共家具，只在高度相关时低频召回，不会每轮倾倒进房间。</p>
      ${recordGroup('总种子库', memory.global?.seeds || [], '总库还没有种子。')}
      ${recordGroup('总记忆库', memory.global?.memories || [], '总库还没有记忆。')}`;
  }

  function roomMemoryView({ kind }) {
    const copy = ROOM_COPY[kind] || ROOM_COPY.radio;
    const room = state[kind];
    if (room.memoryStatus === 'loading') {
      return {
        title: copy.memoryTitle,
        subtitle: `${copy.localLabel} · 独立作用域`,
        className: 'room-trace',
        body: '<p class="local-room-state">正在轻轻翻开房间轨迹…</p>',
      };
    }
    if (room.memoryStatus === 'failed' || !room.memory) {
      return {
        title: copy.memoryTitle,
        subtitle: `${copy.localLabel} · 独立作用域`,
        className: 'room-trace',
        body: `<div class="local-room-state is-failed"><p>${escapeHtml(room.memoryError || '房间轨迹暂时没有同步。')}</p><button type="button" data-action="rooms:memory-retry" data-kind="${kind}">重新同步</button></div>`,
      };
    }
    const local = room.memoryTab !== 'global';
    return {
      title: copy.memoryTitle,
      subtitle: local ? `${copy.localLabel} · 近岸苗圃与本房间家具` : '总库 · 远岸苗圃与公共家具',
      className: 'room-trace',
      body: `<div class="memory-tabs" role="tablist" aria-label="房间记忆范围">
        <button class="${local ? 'is-active' : ''}" type="button" data-action="rooms:memory-tab" data-kind="${kind}" data-scope="local">${escapeHtml(copy.localLabel)}</button>
        <button class="${local ? '' : 'is-active'}" type="button" data-action="rooms:memory-tab" data-kind="${kind}" data-scope="global">总库</button>
      </div>
      ${local ? localMemoryBody(kind, room.memory) : globalMemoryBody(room.memory)}`,
    };
  }

  function soilSection(source) {
    const soil = source.soil || {};
    const seeds = soil.hand_seeds?.length
      ? soil.hand_seeds.map((seed) => `<li><strong>${escapeHtml(seed.name || seed.life_core || '未命名种子')}</strong><span>${escapeHtml(seed.life_core || '')}</span></li>`).join('')
      : '<li class="is-empty">暂无</li>';
    const candidates = soil.pocket_candidates?.length
      ? soil.pocket_candidates.map((item) => `<li>${escapeHtml(item.life_core || item.title || item.content || String(item))}</li>`).join('')
      : '<li class="is-empty">暂无</li>';
    return `<section class="feature-card room-soil-source">
      <header><strong>${escapeHtml(source.source_label || roomSourceLabel(source))}</strong><small>${escapeHtml(source.source_surface || '')}</small></header>
      <div><h2>当前</h2><p>${escapeHtml(soil.current_text || '暂无')}</p></div>
      <div><h2>手持种</h2><ul>${seeds}</ul></div>
      <div><h2>勿复读</h2><p>${escapeHtml(soil.do_not_repeat || '暂无')}</p></div>
      <div><h2>可落袋</h2><ul>${candidates}</ul></div>
    </section>`;
  }

  function roomSoilView({ kind }) {
    const copy = ROOM_COPY[kind] || ROOM_COPY.radio;
    const sources = Object.values(state[kind].memory?.sources || {});
    return {
      title: copy.soilLabel,
      subtitle: '同一房间 · 按模型来源分开生长',
      className: 'room-soil',
      body: sources.length
        ? `<div class="room-soil-list">${sources.map(soilSection).join('')}</div><p class="feature-note">它们属于同一房间，但不同来源不会互相冒充或覆盖。</p>`
        : '<p class="feature-empty">这个房间还没有整理出思维壤。</p>',
    };
  }

  router.register('server-room', roomView);
  router.register('room-memory', roomMemoryView);
  router.register('room-soil', roomSoilView);

  async function open(kind) {
    if (!ROOM_COPY[kind]) return;
    state[kind].status = 'loading';
    await router.open('server-room', { kind });
    await loadRoom(kind);
    await router.refresh();
  }

  async function retry(kind) {
    if (!ROOM_COPY[kind]) return;
    state[kind].status = 'loading';
    await router.refresh();
    await loadRoom(kind);
    await router.refresh();
  }

  async function openMemory(kind) {
    if (!ROOM_COPY[kind]) return;
    state[kind].memoryTab = 'local';
    state[kind].memoryStatus = 'loading';
    await router.open('room-memory', { kind });
    await loadMemory(kind);
    return router.refresh({ preserveScroll: false });
  }

  async function retryMemory(kind) {
    state[kind].memoryStatus = 'loading';
    await router.refresh({ preserveScroll: false });
    await loadMemory(kind);
    return router.refresh({ preserveScroll: false });
  }

  async function sendRadio(text) {
    const content = String(text || '').trim();
    if (!content) return;
    await requestJson(API.radioMessages, {
      method: 'POST',
      body: JSON.stringify({ text: content }),
    });
    await loadRoom('radio');
    await router.refresh();
  }

  async function sendLetter(subject, body) {
    const content = String(body || '').trim();
    if (!content) return;
    await requestJson(API.lighthouseLetters, {
      method: 'POST',
      body: JSON.stringify({ subject: String(subject || '').trim(), body: content }),
    });
    await loadRoom('lighthouse');
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
      await loadRoom('radio');
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
    await loadRoom('lighthouse');
    await router.refresh({ preserveScroll: true });
  }

  async function withdrawRadio(messageId) {
    await requestJson(`${API.radioMessages}/${encodeURIComponent(messageId)}`, {
      method: 'DELETE',
    });
    await loadRoom('radio');
    await router.refresh({ preserveScroll: true });
    toast('这条电波已撤回。');
  }

  async function resolvePocket(kind, pocketId, action) {
    const base = kind === 'lighthouse' ? API.lighthouseMemory : API.radioMemory;
    await requestJson(`${base}/pockets/${encodeURIComponent(pocketId)}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    });
    await loadMemory(kind);
    await router.refresh({ preserveScroll: true });
    toast(action === 'discard'
      ? '候选已经丢弃。'
      : action === 'stone'
        ? '候选已经转成石头。'
        : '已经放进对应的房间或总库分区。');
  }

  function handleAction(name, target) {
    if (name === 'open') return open(target.dataset.kind);
    if (name === 'retry') return retry(target.dataset.kind);
    if (name === 'open-memory') return openMemory(target.dataset.kind);
    if (name === 'memory-retry') return retryMemory(target.dataset.kind);
    if (name === 'memory-tab') {
      state[target.dataset.kind].memoryTab = target.dataset.scope === 'global' ? 'global' : 'local';
      return router.refresh({ preserveScroll: false });
    }
    if (name === 'open-soil') return router.open('room-soil', { kind: target.dataset.kind });
    if (name === 'ask-api') return askApiMyri();
    if (name === 'mark-read') return markRead(target.dataset.id);
    if (name === 'withdraw-radio') return withdrawRadio(target.dataset.id);
    if (name === 'resolve-pocket') {
      return resolvePocket(target.dataset.kind, target.dataset.id, target.dataset.destination);
    }
  }

  function handleSubmit(name, form) {
    const input = q('#localRoomInput', form);
    if (name === 'send-radio') return sendRadio(input?.value || '');
    if (name === 'send-letter') {
      return sendLetter(q('#lighthouseSubject', form)?.value || '', input?.value || '');
    }
  }

  function start() {
    renderWindowList();
  }

  return Object.freeze({ start, handleAction, handleSubmit, renderWindowList });
}

'use strict';

(function attachDailyShell(root) {
  const modules = (root.ElementeraDailyModules = root.ElementeraDailyModules || {});
  const PANEL_ID = 'freshDailyPanelV101';
  const DAILY_ROOM_NAMES = Object.freeze({
    moments: '硅碳圈',
    diary: '日记',
    album: '相册',
    widgets: '小组件',
    pet: '宠物系统',
  });
  const DAILY_ENTRY_STATUS = '本地前端岛';
  const DAILY_HALL_COPY = Object.freeze({
    title: '海岸日报',
    subtitle: 'Daily shell · canonical module',
    description: '这里承接日报、硅碳圈、日记、相册和小组件入口。',
  });
  const DAILY_CHILD_EMPTY_COPY = Object.freeze({
    subtitle: '暂未接入 canonical module',
    status: '这个入口还没有独立模块。',
    description: 'daily shell 已接管门牌；这里显示清晰诊断，等待后续 R 修。',
    backLabel: '返回海岸日报',
  });

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
  ));

  function hideSide() {
    root.document?.body?.classList.remove('sidebar-open');
    const scrim = root.document?.querySelector('#scrim');
    if (scrim) scrim.hidden = true;
  }

  function showSide() {
    root.document?.body?.classList.add('sidebar-open');
    const scrim = root.document?.querySelector('#scrim');
    if (scrim) scrim.hidden = false;
  }

  function hideLegacyPanels() {
    ['#coastRoomPanelV095', '#coastRoomPanelV096', '#coastRoomPanelV097', '#coastChatRoomV096'].forEach((selector) => {
      const panel = root.document?.querySelector(selector);
      if (panel) panel.hidden = true;
    });
  }

  function panel(title, subtitle, body, state = 'daily') {
    hideLegacyPanels();
    let node = root.document?.querySelector('#' + PANEL_ID);
    if (!node) {
      node = root.document.createElement('section');
      node.id = PANEL_ID;
      node.className = 'coast-room-panel-v095 fresh-daily-panel-v101';
      root.document.body.appendChild(node);
    }
    node.hidden = false;
    node.dataset.state = state || 'daily';
    hideSide();
    node.innerHTML =
      '<div class="coast-room-shell"><header class="coast-room-head"><button type="button" class="coast-room-back" data-fresh-daily-action="top-back">←</button><div><h1>' +
      esc(title) +
      '</h1><p>' +
      esc(subtitle) +
      '</p></div></header><main class="coast-room-body">' +
      body +
      '</main></div>';
    return node;
  }

  function closeDaily() {
    const node = root.document?.querySelector('#' + PANEL_ID);
    if (node) node.hidden = true;
    showSide();
    return true;
  }

  function getDailyRoomName(kind) {
    return DAILY_ROOM_NAMES[kind] || DAILY_HALL_COPY.title;
  }

  function getDailyEntries() {
    return Object.entries(DAILY_ROOM_NAMES).map(([kind, title]) => ({
      kind,
      title,
      status: kind === 'moments' || kind === 'diary' || kind === 'album' ? 'canonical module' : DAILY_ENTRY_STATUS,
    }));
  }

  function renderDailyHome() {
    const entries = getDailyEntries().map((entry) =>
      '<button type="button" data-fresh-daily-room="' +
      esc(entry.kind) +
      '">' +
      esc(entry.title) +
      '<small>' +
      esc(entry.status) +
      '</small></button>',
    ).join('');
    return (
      '<section class="coast-room-card"><h2>' +
      esc(DAILY_HALL_COPY.title) +
      '</h2><p>' +
      esc(DAILY_HALL_COPY.description) +
      '</p></section><h2 class="coast-entry-title-v097">入口</h2><div class="daily-entry-grid-v097">' +
      entries +
      '</div>'
    );
  }

  function renderChildDiagnostic(kind, reason = '') {
    const title = getDailyRoomName(kind);
    return (
      '<section class="coast-room-card"><h2>' +
      esc(title) +
      '</h2><p>' +
      esc(reason || DAILY_CHILD_EMPTY_COPY.status) +
      '</p><p>' +
      esc(DAILY_CHILD_EMPTY_COPY.description) +
      '</p><button type="button" data-fresh-daily-action="back-daily">' +
      esc(DAILY_CHILD_EMPTY_COPY.backLabel) +
      '</button></section>'
    );
  }

  function openDaily() {
    panel(DAILY_HALL_COPY.title, DAILY_HALL_COPY.subtitle, renderDailyHome(), 'daily');
    return true;
  }

  function openChild(env = {}, kind = 'daily', reason = '') {
    panel(getDailyRoomName(kind), DAILY_CHILD_EMPTY_COPY.subtitle, renderChildDiagnostic(kind, reason), 'child');
    return true;
  }

  modules.dailyShell = Object.freeze({
    moduleName: 'dailyShell',
    panelId: PANEL_ID,
    isRuntimeWired: true,
    DAILY_ROOM_NAMES,
    DAILY_ENTRY_STATUS,
    DAILY_HALL_COPY,
    DAILY_CHILD_EMPTY_COPY,
    getDailyRoomName,
    getDailyEntries,
    renderDailyHome,
    renderChildDiagnostic,
    panel,
    closeDaily,
    openDaily,
    openChild,
  });
})(globalThis);

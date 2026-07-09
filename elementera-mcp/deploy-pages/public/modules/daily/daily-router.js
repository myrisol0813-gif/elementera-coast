'use strict';

(function attachDailyRouter(root) {
  const modules = (root.ElementeraDailyModules = root.ElementeraDailyModules || {});
  const VERSION = 'P3-STRUCT-13';
  const MODULE_SRC = Object.freeze({
    dailyShell: '/public/modules/daily/daily-shell.js?v=p3-struct-13',
    moments: '/public/modules/daily/moments.js?v=p3-struct-13',
    diary: '/public/modules/daily/diary.js?v=p3-struct-13',
    album: '/public/modules/daily/album.js?v=p3-struct-13',
  });
  const ROUTER_SELECTORS = Object.freeze([
    '[data-room="daily"]',
    '[data-room-v095="daily"]',
    '[data-fresh-daily-room]',
    '[data-fresh-daily-action]',
    '[data-sc-like]',
    '[data-sc-comment]',
    '[data-sc-send-comment]',
    '[data-diary-date]',
    '[data-album-download]',
  ]);
  const DAILY_CAPTURE_EVENTS = Object.freeze([
    'pointerdown',
    'pointerup',
    'pointercancel',
    'touchstart',
    'touchend',
    'touchcancel',
    'click',
  ]);
  const DAILY_ACTIONS = Object.freeze({
    topBack: 'top-back',
    backDaily: 'back-daily',
    momentsCompose: 'moments-compose',
    publishMoment: 'publish-placeholder',
    avatarUpload: 'avatar-upload',
    coverUpload: 'cover-upload',
    diaryCompose: 'diary-compose',
    diaryFinish: 'diary-finish',
    albumCompose: 'album-compose',
    albumFinish: 'album-finish',
    locationPlaceholder: 'location-placeholder',
  });

  const q = (selector, scope = root.document) => scope?.querySelector?.(selector) || null;
  const loadPromises = Object.create(null);
  let moments = [];
  let diaries = [];
  let diaryDate = '';
  let albumItems = [];
  let momentLikes = {};
  let momentComments = {};
  let momentCommentTarget = '';
  let momentCover = '';
  let momentAvatar = '';

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
  ));

  function moduleKeysForDebug() {
    try {
      const keys = Object.keys(root.ElementeraDailyModules || {});
      return keys.length ? keys.join(',') : 'NO_MODULE_KEYS';
    } catch (error) {
      return 'MODULE_KEYS_ERROR:' + (error?.message || String(error));
    }
  }

  function getModule(name) {
    return (root.ElementeraDailyModules || {})[name] || null;
  }

  function ensureDailyModule(name) {
    const loaded = getModule(name);
    if (loaded && Object.keys(loaded).length) return Promise.resolve(loaded);
    if (loadPromises[name]) return loadPromises[name];
    const src = MODULE_SRC[name];
    if (!src) return Promise.reject(new Error('DAILY_MODULE_SRC_MISSING:' + name));
    loadPromises[name] = new Promise((resolve, reject) => {
      const script = root.document.createElement('script');
      script.src = src;
      script.async = false;
      script.onload = () => {
        const next = getModule(name);
        if (next && Object.keys(next).length) resolve(next);
        else reject(new Error('DAILY_SCRIPT_LOADED_BUT_MODULE_MISSING:' + name));
      };
      script.onerror = () => reject(new Error('DAILY_SCRIPT_LOAD_ERROR:' + src));
      root.document.head.appendChild(script);
    });
    return loadPromises[name];
  }

  function hideSide() {
    root.document.body.classList.remove('sidebar-open');
    const scrim = q('#scrim');
    if (scrim) scrim.hidden = true;
  }

  function showSide() {
    root.document.body.classList.add('sidebar-open');
    const scrim = q('#scrim');
    if (scrim) scrim.hidden = false;
  }

  function fallbackPanel(title, subtitle, body, state = 'daily') {
    ['#coastRoomPanelV095', '#coastRoomPanelV096', '#coastRoomPanelV097', '#coastChatRoomV096'].forEach((selector) => {
      const node = q(selector);
      if (node) node.hidden = true;
    });
    let panel = q('#freshDailyPanelV101');
    if (!panel) {
      panel = root.document.createElement('section');
      panel.id = 'freshDailyPanelV101';
      panel.className = 'coast-room-panel-v095 fresh-daily-panel-v101';
      root.document.body.appendChild(panel);
    }
    panel.hidden = false;
    panel.dataset.state = state;
    hideSide();
    panel.innerHTML =
      '<div class="coast-room-shell"><header class="coast-room-head"><button type="button" class="coast-room-back" data-fresh-daily-action="top-back">←</button><div><h1>' +
      esc(title) +
      '</h1><p>' +
      esc(subtitle) +
      '</p></div></header><main class="coast-room-body">' +
      body +
      '</main></div>';
    return panel;
  }

  function panel(title, subtitle, body, state) {
    const shell = getModule('dailyShell');
    if (shell && typeof shell.panel === 'function') return shell.panel(title, subtitle, body, state);
    return fallbackPanel(title, subtitle, body, state);
  }

  function diagnostic(title, reason) {
    return (
      '<section class="diary-empty"><h2>' +
      esc(title) +
      '</h2><p>[' +
      VERSION +
      '] ' +
      esc(reason || 'UNKNOWN') +
      '</p><p>module keys: ' +
      esc(moduleKeysForDebug()) +
      '</p></section>'
    );
  }

  function toast(message) {
    let node = q('#dailyToastP3Struct13');
    if (!node) {
      node = root.document.createElement('div');
      node.id = 'dailyToastP3Struct13';
      node.className = 'island-toast-v118';
      root.document.body.appendChild(node);
    }
    node.textContent = message;
    node.hidden = false;
    clearTimeout(node._timer);
    node._timer = setTimeout(() => {
      node.hidden = true;
    }, 1600);
  }

  function avatar(label = '寒', account = 'xiaohan') {
    const src = account === 'xiaohan' ? momentAvatar : '';
    return (
      '<div class="sc-avatar sc-avatar-' +
      esc(account) +
      '" aria-label="avatar" ' +
      (src
        ? 'style="background-image:url(' + src + ') !important;background-size:cover !important;background-position:center !important;color:transparent !important"'
        : '') +
      '>' +
      esc(label) +
      '</div>'
    );
  }

  function dailyEnv() {
    return {
      version: VERSION,
      panel,
      q,
      toast,
      avatar,
      FileReader: root.FileReader,
      getMoments: () => moments,
      setMoments: (next) => { moments = Array.isArray(next) ? next : moments; },
      openMoments,
      getMomentLikes: () => momentLikes,
      setMomentLikes: (next) => { momentLikes = next && typeof next === 'object' ? next : momentLikes; },
      getMomentComments: () => momentComments,
      setMomentComments: (next) => { momentComments = next && typeof next === 'object' ? next : momentComments; },
      getMomentCommentTarget: () => momentCommentTarget,
      setMomentCommentTarget: (next) => { momentCommentTarget = next || ''; },
      getMomentCover: () => momentCover,
      setMomentCover: (next) => { momentCover = next || ''; },
      getMomentAvatar: () => momentAvatar,
      setMomentAvatar: (next) => { momentAvatar = next || ''; },
      getDiaries: () => diaries,
      setDiaries: (next) => { diaries = Array.isArray(next) ? next : diaries; },
      getDiaryDate: () => diaryDate,
      setDiaryDate: (next) => { diaryDate = next || ''; },
      openDiary,
      getAlbumItems: () => albumItems,
      addAlbumItem: (item) => { if (item) albumItems.unshift(item); },
      openAlbum,
    };
  }

  async function runModuleAction(moduleName, action, ...args) {
    const mod = await ensureDailyModule(moduleName);
    if (!mod || typeof mod[action] !== 'function') throw new Error(moduleName + '.' + action + ' missing');
    const ok = mod[action](dailyEnv(), ...args);
    if (!ok) throw new Error(moduleName + '.' + action + ' returned false');
    return true;
  }

  async function openDaily() {
    try {
      await runModuleAction('dailyShell', 'openDaily');
    } catch (error) {
      panel('海岸日报', 'Daily shell diagnostic', diagnostic('海岸日报暂不可用', error?.message || String(error)), 'daily');
    }
  }

  async function openChild(kind, reason = '') {
    try {
      await runModuleAction('dailyShell', 'openChild', kind, reason);
    } catch (error) {
      panel(kind || '海岸日报', 'Daily child diagnostic', diagnostic('入口暂不可用', error?.message || String(error)), 'child');
    }
  }

  async function openMoments() {
    try {
      await runModuleAction('moments', 'openMoments');
    } catch (error) {
      panel('硅碳圈', 'Moments diagnostic', diagnostic('硅碳圈暂不可用', error?.message || String(error)), 'moments');
    }
  }

  async function openMomentsCompose() {
    try {
      await runModuleAction('moments', 'openMomentsCompose');
    } catch (error) {
      panel('发表硅碳圈', 'Moments compose diagnostic', diagnostic('发表入口暂不可用', error?.message || String(error)), 'compose');
    }
  }

  async function finishMoment() {
    try {
      await runModuleAction('moments', 'finishMoment');
    } catch (error) {
      panel('硅碳圈', 'Moments publish diagnostic', diagnostic('发布暂不可用', error?.message || String(error)), 'moments');
    }
  }

  async function openDiary() {
    try {
      await runModuleAction('diary', 'openDiary');
    } catch (error) {
      panel('日记', 'Diary diagnostic', diagnostic('日记暂不可用', error?.message || String(error)), 'diary');
    }
  }

  async function openDiaryCompose() {
    try {
      await runModuleAction('diary', 'openDiaryCompose');
    } catch (error) {
      panel('写日记', 'Diary compose diagnostic', diagnostic('写日记暂不可用', error?.message || String(error)), 'diary-compose');
    }
  }

  async function finishDiary() {
    try {
      await runModuleAction('diary', 'finishDiary');
    } catch (error) {
      panel('日记', 'Diary finish diagnostic', diagnostic('保存日记暂不可用', error?.message || String(error)), 'diary');
    }
  }

  async function openAlbum() {
    try {
      await runModuleAction('album', 'openAlbum');
    } catch (error) {
      panel('相册', 'Album diagnostic', diagnostic('相册暂不可用', error?.message || String(error)), 'album');
    }
  }

  async function openAlbumCompose() {
    try {
      await runModuleAction('album', 'openAlbumCompose');
    } catch (error) {
      panel('上传相册', 'Album compose diagnostic', diagnostic('上传相册暂不可用', error?.message || String(error)), 'album-compose');
    }
  }

  async function finishAlbum() {
    try {
      await runModuleAction('album', 'finishAlbum');
    } catch (error) {
      panel('相册', 'Album finish diagnostic', diagnostic('保存相册暂不可用', error?.message || String(error)), 'album');
    }
  }

  function downloadAlbum(id) {
    const item = albumItems.find((entry) => entry.id === id);
    if (!item || !item.image) return;
    const anchor = root.document.createElement('a');
    const ext = (item.image.match(/^data:image\/([^;]+)/) || [])[1] || 'png';
    anchor.href = item.image;
    anchor.download = 'coast-doodle-' + (item.cat || 'xiaohan') + '-' + id + '.' + ext.replace('jpeg', 'jpg');
    root.document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  async function routeRoom(kind) {
    if (kind === 'moments') return openMoments();
    if (kind === 'diary') return openDiary();
    if (kind === 'album') return openAlbum();
    return openChild(kind, 'NO_CANONICAL_MODULE_YET');
  }

  async function topBack() {
    const state = q('#freshDailyPanelV101')?.dataset.state || 'daily';
    if (state === 'compose') return openMoments();
    if (state === 'diary-compose') return openDiary();
    if (state === 'album-compose') return openAlbum();
    if (state === 'moments' || state === 'diary' || state === 'album' || state === 'child') return openDaily();
    const shell = getModule('dailyShell');
    if (shell && typeof shell.closeDaily === 'function') return shell.closeDaily();
    const panelNode = q('#freshDailyPanelV101');
    if (panelNode) panelNode.hidden = true;
    showSide();
  }

  function targetOf(event) {
    const target = event.target;
    if (!target || !target.closest || target.matches?.('input[type="file"]')) return null;
    return target.closest(ROUTER_SELECTORS.join(','));
  }

  function press(node, enabled) {
    if (node) node.classList.toggle('is-pressing', !!enabled);
  }

  function block(event) {
    event.preventDefault();
    event.stopPropagation();
    if (event.stopImmediatePropagation) event.stopImmediatePropagation();
  }

  async function activate(hit) {
    const open = hit.closest('[data-room="daily"],[data-room-v095="daily"]');
    const room = hit.closest('[data-fresh-daily-room]');
    const action = hit.dataset.freshDailyAction;
    const like = hit.dataset.scLike;
    const comment = hit.dataset.scComment;
    const sendComment = hit.dataset.scSendComment;
    const diaryDay = hit.dataset.diaryDate;
    const albumDownload = hit.dataset.albumDownload;

    if (open) return openDaily();
    if (room) return routeRoom(room.dataset.freshDailyRoom);
    if (diaryDay) {
      diaryDate = diaryDay;
      return openDiary();
    }
    if (albumDownload) return downloadAlbum(albumDownload);
    if (like) return runModuleAction('moments', 'toggleLike', like).catch((error) => toast(error?.message || String(error)));
    if (comment) return runModuleAction('moments', 'toggleComment', comment).catch((error) => toast(error?.message || String(error)));
    if (sendComment) return runModuleAction('moments', 'sendComment', sendComment).catch((error) => toast(error?.message || String(error)));
    if (action === DAILY_ACTIONS.backDaily) return openDaily();
    if (action === DAILY_ACTIONS.momentsCompose) return openMomentsCompose();
    if (action === DAILY_ACTIONS.publishMoment) return finishMoment();
    if (action === DAILY_ACTIONS.diaryCompose) return openDiaryCompose();
    if (action === DAILY_ACTIONS.diaryFinish) return finishDiary();
    if (action === DAILY_ACTIONS.albumCompose) return openAlbumCompose();
    if (action === DAILY_ACTIONS.albumFinish) return finishAlbum();
    if (action === DAILY_ACTIONS.topBack) return topBack();
    if (action === DAILY_ACTIONS.avatarUpload) {
      const input = q('#scAvatarInput');
      if (!input) return false;
      input.onchange = () => runModuleAction('moments', 'uploadAvatar').catch((error) => toast(error?.message || String(error)));
      input.click();
      return true;
    }
    if (action === DAILY_ACTIONS.coverUpload) {
      const input = q('#scCoverInput');
      if (!input) return false;
      input.onchange = () => runModuleAction('moments', 'uploadCover').catch((error) => toast(error?.message || String(error)));
      input.click();
      return true;
    }
    if (action === DAILY_ACTIONS.locationPlaceholder) return true;
    return false;
  }

  function handle(event) {
    const hit = targetOf(event);
    if (!hit) return;
    if (event.type === 'pointerdown' || event.type === 'touchstart') {
      press(hit, true);
      block(event);
      return;
    }
    if (event.type === 'pointerup' || event.type === 'pointercancel' || event.type === 'touchend' || event.type === 'touchcancel') {
      press(hit, false);
      block(event);
      return;
    }
    if (event.type !== 'click') return;
    press(hit, false);
    block(event);
    activate(hit);
  }

  DAILY_CAPTURE_EVENTS.forEach((eventName) => root.document.addEventListener(eventName, handle, true));

  modules.dailyRouter = Object.freeze({
    moduleName: 'dailyRouter',
    isRuntimeWired: true,
    VERSION,
    ROUTER_SELECTORS,
    DAILY_CAPTURE_EVENTS,
    DAILY_ACTIONS,
    ensureDailyModule,
    openDaily,
    openMoments,
    openDiary,
    openAlbum,
    routeRoom,
    topBack,
  });
  root.ElementeraDailyRouterP3Struct13 = modules.dailyRouter;
})(globalThis);

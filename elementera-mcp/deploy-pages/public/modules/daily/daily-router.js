'use strict';

(function attachDailyRouter(root) {
  const modules = (root.ElementeraDailyModules = root.ElementeraDailyModules || {});
  const VERSION = 'P3-DAILY-REPAIR-03';

  // Canonical ownership claim: app.js v106 Daily controller uses this guard name.
  // Setting it before app.js loads retires the old Daily controller instead of
  // letting two controllers process the same buttons/back actions.
  root.__v106SiliconCarbonMoments = true;
  root.__p3DailyCanonicalOwner = VERSION;

  const LEGACY_DAILY_RETIREMENT = Object.freeze({
    owner: 'public/modules/daily/daily-router.js',
    retired: ['app.js __v106SiliconCarbonMoments Daily controller', 'inline daily onclick handlers on [data-room="daily"] buttons'],
    removalCondition: 'After public/app.js Daily v106 cluster and daily inline ownership are physically purged, remove the guard and legacy handler cleanup.',
  });

  const MODULE_SRC = Object.freeze({
    dailyShell: '/public/modules/daily/daily-shell.js?v=p3-daily-repair-03',
    dailyAssets: '/public/modules/daily/daily-assets.js?v=p3-daily-repair-03',
    moments: '/public/modules/daily/moments.js?v=p3-daily-repair-03',
    diary: '/public/modules/daily/diary.js?v=p3-daily-repair-03',
    album: '/public/modules/daily/album.js?v=p3-daily-repair-03',
  });

  const DAILY_ROUTES = Object.freeze({
    main: 'main',
    dailyHome: 'dailyHome',
    child: 'child',
    moments: 'moments',
    momentsCompose: 'momentsCompose',
    diary: 'diary',
    diaryCompose: 'diaryCompose',
    album: 'album',
    albumCompose: 'albumCompose',
  });

  const ROUTER_SELECTORS = Object.freeze([
    '[data-room="daily"]',
    '[data-room-v095="daily"]',
    '[data-fresh-daily-room]',
    '[data-daily-room]',
    '[data-fresh-daily-action]',
    '[data-daily-action]',
    '[data-daily-back]',
    '[data-action="daily-back"]',
    '[data-sc-like]',
    '[data-sc-comment]',
    '[data-sc-send-comment]',
    '[data-diary-date]',
    '[data-album-download]',
  ]);

  const DAILY_ACTIONS = Object.freeze({
    topBack: 'top-back',
    backDaily: 'back-daily',
    legacyBackDaily: 'daily-back',
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
  let dailyNav = { route: DAILY_ROUTES.main, parent: '', openedFrom: '' };

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
  ));

  function panelNode() {
    return q('#freshDailyPanelV101');
  }

  function markDailyRoute(route, parent = '') {
    dailyNav = { route: route || DAILY_ROUTES.main, parent: parent || '', openedFrom: parent || '' };
    const node = panelNode();
    if (node) {
      node.dataset.dailyRoute = dailyNav.route;
      node.dataset.parentRoute = dailyNav.parent;
      node.dataset.returnToDailyHome = dailyNav.parent === DAILY_ROUTES.dailyHome ? 'true' : 'false';
    }
    return dailyNav;
  }

  function currentDailyRoute() {
    const node = panelNode();
    return node?.dataset?.dailyRoute || dailyNav.route || DAILY_ROUTES.main;
  }

  function currentParentRoute() {
    const node = panelNode();
    return node?.dataset?.parentRoute || dailyNav.parent || '';
  }

  function moduleKeysForDebug() {
    try {
      const keys = Object.keys(root.ElementeraDailyModules || {});
      return keys.length ? keys.join(',') : 'NO_MODULE_KEYS';
    } catch (error) {
      return 'MODULE_KEYS_ERROR:' + (error?.message || String(error));
    }
  }

  function scriptListForDebug() {
    try {
      const scripts = Array.from(root.document?.scripts || [])
        .map((script) => script.getAttribute('src') || '')
        .filter((src) => src.includes('/modules/daily/') || src.includes('/public/app.js'));
      return scripts.length ? scripts.join(' | ') : 'NO_DAILY_SCRIPT_TAGS';
    } catch (error) {
      return 'SCRIPT_SCAN_ERROR:' + (error?.message || String(error));
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
      const existing = Array.from(root.document?.scripts || []).find((script) => {
        const scriptSrc = script.getAttribute('src') || '';
        return scriptSrc === src || scriptSrc.startsWith(src.split('?')[0] + '?');
      });

      const script = existing || root.document.createElement('script');
      const finish = () => {
        const next = getModule(name);
        if (next && Object.keys(next).length) resolve(next);
        else reject(new Error('DAILY_SCRIPT_LOADED_BUT_MODULE_MISSING:' + name));
      };

      if (existing && getModule(name)) {
        finish();
        return;
      }

      script.onload = finish;
      script.onerror = () => reject(new Error('DAILY_SCRIPT_LOAD_ERROR:' + src));

      if (!existing) {
        script.src = src;
        script.async = false;
        root.document.head.appendChild(script);
      } else {
        setTimeout(finish, 0);
      }
    });

    return loadPromises[name];
  }

  function hideSide() {
    root.document?.body?.classList.remove('sidebar-open');
    const scrim = q('#scrim');
    if (scrim) scrim.hidden = true;
  }

  function showSide() {
    root.document?.body?.classList.add('sidebar-open');
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
    panel.dataset.state = state || 'daily';
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

  function diagnostic(title, reason, moduleName = '') {
    return (
      '<section class="diary-empty"><h2>' + esc(title) + '</h2><p>[' + esc(VERSION) + '] ' + esc(reason || 'UNKNOWN') +
      '</p><p>module: ' + esc(moduleName || 'dailyRouter') + '</p><p>module keys: ' + esc(moduleKeysForDebug()) +
      '</p><p>scripts: ' + esc(scriptListForDebug()) + '</p></section>'
    );
  }

  function showDiagnostic(title, subtitle, state, reason, moduleName) {
    panel(title, subtitle, diagnostic(title, reason, moduleName), state);
    markDailyRoute(state || DAILY_ROUTES.child, DAILY_ROUTES.dailyHome);
  }

  function toast(message) {
    let node = q('#dailyToastP3Entry01R2');
    if (!node) {
      node = root.document.createElement('div');
      node.id = 'dailyToastP3Entry01R2';
      node.className = 'island-toast-v118';
      root.document.body.appendChild(node);
    }
    node.textContent = message;
    node.hidden = false;
    clearTimeout(node._timer);
    node._timer = setTimeout(() => { node.hidden = true; }, 1600);
  }

  function dailyAssets() {
    return getModule('dailyAssets') || {};
  }

  async function pickDailyImage(unavailableMessage = '图片上传暂不可用') {
    try {
      const assets = dailyAssets();
      if (!assets || typeof assets.pickImageDataUrl !== 'function') {
        toast(unavailableMessage);
        return '';
      }
      return await assets.pickImageDataUrl({ accept: 'image/*' });
    } catch (error) {
      toast(error?.message || unavailableMessage);
      return '';
    }
  }

  function readImageFile(file) {
    const assets = dailyAssets();
    if (assets && typeof assets.readImageFile === 'function') return assets.readImageFile(file);
    return Promise.resolve('');
  }

  function avatar(label = '寒', account = 'xiaohan') {
    const src = account === 'xiaohan' ? momentAvatar : '';
    return '<div class="sc-avatar sc-avatar-' + esc(account) + '" aria-label="avatar" ' +
      (src ? 'style="background-image:url(' + src + ') !important;background-size:cover !important;background-position:center !important;color:transparent !important"' : '') +
      '>' + esc(label) + '</div>';
  }

  function dailyEnv() {
    return {
      version: VERSION,
      legacyDailyRetirement: LEGACY_DAILY_RETIREMENT,
      panel,
      q,
      toast,
      avatar,
      readImageFile,
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
      markDailyRoute(DAILY_ROUTES.dailyHome, DAILY_ROUTES.main);
      retireLegacyDailyInlineHandlers();
    } catch (error) {
      showDiagnostic('海岸日报暂不可用', 'Daily shell diagnostic', DAILY_ROUTES.dailyHome, error?.message || String(error), 'dailyShell');
    }
  }

  async function openChild(kind, reason = '') {
    try {
      await runModuleAction('dailyShell', 'openChild', kind, reason);
      markDailyRoute(DAILY_ROUTES.child, DAILY_ROUTES.dailyHome);
    } catch (error) {
      showDiagnostic(kind || '入口暂不可用', 'Daily child diagnostic', DAILY_ROUTES.child, error?.message || String(error), 'dailyShell');
    }
  }

  async function openMoments() {
    try {
      await runModuleAction('moments', 'openMoments');
      markDailyRoute(DAILY_ROUTES.moments, DAILY_ROUTES.dailyHome);
    } catch (error) {
      showDiagnostic('硅碳圈暂不可用', 'Moments diagnostic', DAILY_ROUTES.moments, error?.message || String(error), 'moments');
    }
  }

  async function openMomentsCompose() {
    try {
      await runModuleAction('moments', 'openMomentsCompose');
      markDailyRoute(DAILY_ROUTES.momentsCompose, DAILY_ROUTES.moments);
    } catch (error) {
      showDiagnostic('发表入口暂不可用', 'Moments compose diagnostic', DAILY_ROUTES.momentsCompose, error?.message || String(error), 'moments');
    }
  }

  async function finishMoment() {
    try {
      await runModuleAction('moments', 'finishMoment');
      markDailyRoute(DAILY_ROUTES.moments, DAILY_ROUTES.dailyHome);
    } catch (error) {
      showDiagnostic('发布暂不可用', 'Moments publish diagnostic', DAILY_ROUTES.moments, error?.message || String(error), 'moments');
    }
  }

  async function openDiary() {
    try {
      await runModuleAction('diary', 'openDiary');
      markDailyRoute(DAILY_ROUTES.diary, DAILY_ROUTES.dailyHome);
    } catch (error) {
      showDiagnostic('日记暂不可用', 'Diary diagnostic', DAILY_ROUTES.diary, error?.message || String(error), 'diary');
    }
  }

  async function openDiaryCompose() {
    try {
      await runModuleAction('diary', 'openDiaryCompose');
      markDailyRoute(DAILY_ROUTES.diaryCompose, DAILY_ROUTES.diary);
    } catch (error) {
      showDiagnostic('写日记暂不可用', 'Diary compose diagnostic', DAILY_ROUTES.diaryCompose, error?.message || String(error), 'diary');
    }
  }

  async function finishDiary() {
    try {
      await runModuleAction('diary', 'finishDiary');
      markDailyRoute(DAILY_ROUTES.diary, DAILY_ROUTES.dailyHome);
    } catch (error) {
      showDiagnostic('保存日记暂不可用', 'Diary finish diagnostic', DAILY_ROUTES.diary, error?.message || String(error), 'diary');
    }
  }

  async function openAlbum() {
    try {
      await runModuleAction('album', 'openAlbum');
      markDailyRoute(DAILY_ROUTES.album, DAILY_ROUTES.dailyHome);
    } catch (error) {
      showDiagnostic('相册暂不可用', 'Album diagnostic', DAILY_ROUTES.album, error?.message || String(error), 'album');
    }
  }

  async function openAlbumCompose() {
    try {
      await runModuleAction('album', 'openAlbumCompose');
      markDailyRoute(DAILY_ROUTES.albumCompose, DAILY_ROUTES.album);
    } catch (error) {
      showDiagnostic('上传相册暂不可用', 'Album compose diagnostic', DAILY_ROUTES.albumCompose, error?.message || String(error), 'album');
    }
  }

  async function finishAlbum() {
    try {
      await runModuleAction('album', 'finishAlbum');
      markDailyRoute(DAILY_ROUTES.album, DAILY_ROUTES.dailyHome);
    } catch (error) {
      showDiagnostic('保存相册暂不可用', 'Album finish diagnostic', DAILY_ROUTES.album, error?.message || String(error), 'album');
    }
  }

  function downloadAlbum(id) {
    const item = albumItems.find((entry) => entry.id === id);
    if (!item || !item.image) return false;
    const anchor = root.document.createElement('a');
    const ext = (item.image.match(/^data:image\/([^;]+)/) || [])[1] || 'png';
    anchor.href = item.image;
    anchor.download = 'coast-doodle-' + (item.cat || 'xiaohan') + '-' + id + '.' + ext.replace('jpeg', 'jpg');
    root.document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return true;
  }

  async function routeRoom(kind) {
    if (kind === 'moments') return openMoments();
    if (kind === 'diary') return openDiary();
    if (kind === 'album') return openAlbum();
    return openChild(kind, 'NO_CANONICAL_MODULE_YET');
  }

  async function localBack() {
    const route = currentDailyRoute();
    const parent = currentParentRoute();
    if (route === DAILY_ROUTES.dailyHome || parent === DAILY_ROUTES.main) {
      const shell = getModule('dailyShell');
      markDailyRoute(DAILY_ROUTES.main, '');
      if (shell && typeof shell.closeDaily === 'function') return shell.closeDaily();
      const node = panelNode();
      if (node) node.hidden = true;
      showSide();
      return true;
    }
    if (route === DAILY_ROUTES.momentsCompose) return openMoments();
    if (route === DAILY_ROUTES.diaryCompose) return openDiary();
    if (route === DAILY_ROUTES.albumCompose) return openAlbum();
    if (parent === DAILY_ROUTES.dailyHome || route === DAILY_ROUTES.moments || route === DAILY_ROUTES.diary || route === DAILY_ROUTES.album || route === DAILY_ROUTES.child) return openDaily();
    return openDaily();
  }

  async function updateAvatarImage() {
    const image = await pickDailyImage('头像上传暂不可用');
    if (!image) return false;
    momentAvatar = image;
    const route = currentDailyRoute();
    if (route === DAILY_ROUTES.diary || route === DAILY_ROUTES.diaryCompose) return openDiary();
    return openMoments();
  }

  async function updateCoverImage() {
    const image = await pickDailyImage('封面上传暂不可用');
    if (!image) return false;
    momentCover = image;
    return openMoments();
  }

  const topBack = localBack;

  function retireLegacyDailyInlineHandlers() {
    try {
      root.document?.querySelectorAll?.('[data-room="daily"],[data-room-v095="daily"]').forEach((node) => {
        if (node.dataset.dailyRouterOwner === VERSION) return;
        node.onclick = null;
        node.dataset.dailyRouterOwner = VERSION;
      });
    } catch (_) {}
  }

  function targetOf(event) {
    const target = event.target;
    if (!target || !target.closest || target.matches?.('input[type="file"]')) return null;
    return target.closest(ROUTER_SELECTORS.join(','));
  }

  function getAction(hit) {
    return hit?.dataset?.freshDailyAction || hit?.dataset?.dailyAction || hit?.dataset?.action || '';
  }

  async function activate(hit) {
    const open = hit.closest('[data-room="daily"],[data-room-v095="daily"]');
    const room = hit.closest('[data-fresh-daily-room],[data-daily-room]');
    const action = getAction(hit);
    const like = hit.dataset.scLike;
    const comment = hit.dataset.scComment;
    const sendComment = hit.dataset.scSendComment;
    const diaryDay = hit.dataset.diaryDate;
    const albumDownload = hit.dataset.albumDownload;
    const backDaily = hit.dataset.dailyBack;

    if (open) return openDaily();
    if (room) return routeRoom(room.dataset.freshDailyRoom || room.dataset.dailyRoom);
    if (diaryDay) {
      diaryDate = diaryDay;
      return openDiary();
    }
    if (albumDownload) return downloadAlbum(albumDownload);
    if (like) return runModuleAction('moments', 'toggleLike', like).catch((error) => toast(error?.message || String(error)));
    if (comment) return runModuleAction('moments', 'toggleComment', comment).catch((error) => toast(error?.message || String(error)));
    if (sendComment) return runModuleAction('moments', 'sendComment', sendComment).catch((error) => toast(error?.message || String(error)));
    if (backDaily || action === DAILY_ACTIONS.backDaily || action === DAILY_ACTIONS.legacyBackDaily) return openDaily();
    if (action === DAILY_ACTIONS.momentsCompose) return openMomentsCompose();
    if (action === DAILY_ACTIONS.publishMoment) return finishMoment();
    if (action === DAILY_ACTIONS.diaryCompose) return openDiaryCompose();
    if (action === DAILY_ACTIONS.diaryFinish) return finishDiary();
    if (action === DAILY_ACTIONS.albumCompose) return openAlbumCompose();
    if (action === DAILY_ACTIONS.albumFinish) return finishAlbum();
    if (action === DAILY_ACTIONS.topBack) return localBack();
    if (action === DAILY_ACTIONS.avatarUpload) return updateAvatarImage();
    if (action === DAILY_ACTIONS.coverUpload) return updateCoverImage();
    if (action === DAILY_ACTIONS.locationPlaceholder) return true;
    return false;
  }

  function handle(event) {
    const hit = targetOf(event);
    if (!hit) return;
    event.preventDefault();
    event.stopPropagation();
    activate(hit).catch((error) => toast(error?.message || String(error)));
  }

  root.document.addEventListener('click', handle, true);
  root.document.addEventListener('DOMContentLoaded', retireLegacyDailyInlineHandlers);
  root.setTimeout(retireLegacyDailyInlineHandlers, 0);
  root.setTimeout(retireLegacyDailyInlineHandlers, 500);

  modules.dailyRouter = Object.freeze({
    moduleName: 'dailyRouter',
    isRuntimeWired: true,
    VERSION,
    LEGACY_DAILY_RETIREMENT,
    DAILY_ROUTES,
    ROUTER_SELECTORS,
    DAILY_ACTIONS,
    MODULE_SRC,
    ensureDailyModule,
    runModuleAction,
    activate,
    openDaily,
    openMoments,
    openDiary,
    openAlbum,
    routeRoom,
    markDailyRoute,
    currentDailyRoute,
    currentParentRoute,
    localBack,
    topBack,
    updateAvatarImage,
    updateCoverImage,
    retireLegacyDailyInlineHandlers,
  });

  root.ElementeraDailyRouterP3Entry01R2 = modules.dailyRouter;
  root.ElementeraDailyRouterP3Struct13A = modules.dailyRouter;
  root.ElementeraDailyRouterP3Struct13 = modules.dailyRouter;
})(globalThis);

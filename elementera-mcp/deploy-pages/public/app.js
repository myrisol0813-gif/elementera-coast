(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const TK = 'gpt_like_shell_theme_clean_v1';
  const MK = 'wolf_model_v092';
  const themeNames = { light: '浅色', dark: '深色', gold: '黑金' };

  const messages = $('#messages');
  const scroller = $('#messageScroller');
  const form = $('#composer');
  const input = $('#promptInput');
  const pill = $('.input-pill');
  const callButton = $('#callButton');
  const micButton = $('#micButton');
  const scrim = $('#scrim');
  const themeLabel = $('#theme-label');

  function renderEmptyThread() {
    if (!messages) return;
    if (messages.dataset.legacyHostRendered === 'true') return;
    messages.dataset.legacyHostRendered = 'true';
    messages.innerHTML = '<div class="empty-state" role="status" style="padding:32px 16px;text-align:center;color:var(--muted);">这里还没有消息。</div><div class="thread-spacer"></div>';
    requestAnimationFrame(() => {
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
    });
  }

  function syncComposer() {
    if (!input || !pill) return;
    input.style.height = '22px';
    const inputHeight = Math.min(Math.max(input.scrollHeight, 22), 88);
    const pillHeight = Math.max(42, inputHeight + 18);
    input.style.height = inputHeight + 'px';
    document.documentElement.style.setProperty('--input-h', inputHeight + 'px');
    document.documentElement.style.setProperty('--pill-h', pillHeight + 'px');
    document.documentElement.style.setProperty('--composer-h', pillHeight + 14 + 'px');
    pill.classList.toggle('is-multiline', inputHeight > 26 || input.value.includes('\n'));
    const hasText = !!input.value.trim();
    if (!callButton) return;
    callButton.dataset.icon = hasText ? 'send' : 'call';
    callButton.setAttribute('aria-label', hasText ? '发送' : '通话');
    if (micButton) micButton.hidden = hasText;
  }

  function localNotice(message) {
    if (!messages) return;
    let notice = $('#mainChatNoticeP3DailyRetire04');
    if (!notice) {
      notice = document.createElement('div');
      notice.id = 'mainChatNoticeP3DailyRetire04';
      notice.setAttribute('role', 'status');
      notice.style.cssText = 'margin:12px auto 0;padding:10px 14px;max-width:min(86vw,560px);border-radius:16px;background:var(--panel);color:var(--muted);font-size:14px;line-height:1.5;text-align:center;';
      messages.appendChild(notice);
    }
    notice.textContent = message;
    clearTimeout(notice._timer);
    notice._timer = setTimeout(() => notice.remove(), 2200);
  }

  function applyPrefs() {
    const theme = localStorage.getItem(TK) || 'light';
    document.documentElement.dataset.theme = theme;
    if (themeLabel) themeLabel.textContent = themeNames[theme] || theme;
    const model = localStorage.getItem(MK);
    if (model && $('.model-name')) $('.model-name').textContent = model;
  }

  function openSide() {
    document.body.classList.add('sidebar-open');
    if (scrim) scrim.hidden = false;
    ensureSidebarRows();
  }

  function closeSide() {
    document.body.classList.remove('sidebar-open');
    if (scrim) scrim.hidden = true;
  }

  function dailyRouter() {
    return window.ElementeraDailyModules?.dailyRouter || window.ElementeraDailyRouterP3Struct13A || window.ElementeraDailyRouterP3Struct13 || null;
  }

  function openDailyCanonical() {
    closeSide();
    const router = dailyRouter();
    if (router && typeof router.openDaily === 'function') {
      router.openDaily();
      return true;
    }
    localNotice('海岸日报模块仍在加载，请稍后再试。');
    return false;
  }

  function ensureSidebarRows() {
    const list = $('.history-list section');
    if (list && !$('#dailyRoomRowP3Retire04')) {
      const row = document.createElement('button');
      row.type = 'button';
      row.id = 'dailyRoomRowP3Retire04';
      row.className = 'history-item';
      row.dataset.room = 'daily';
      row.textContent = '海岸日报';
      list.appendChild(row);
    }

    const footer = $('.sidebar-footer');
    if (!footer) return;

    const rows = $$('.account-row', footer);
    const help = rows.find((row) => row.textContent.includes('帮助') || row.textContent.includes('Wolf Den'));
    if (help) {
      help.id = 'wolfRowV093';
      help.innerHTML = '<span class="account-avatar wolfden-icon">🐺</span><span><strong>Wolf Den</strong><small>小狼窝入口</small></span>';
    }

    if (!$('#serpentDeskRowV093')) {
      const desk = document.createElement('button');
      desk.type = 'button';
      desk.className = 'account-row';
      desk.id = 'serpentDeskRowV093';
      desk.innerHTML = '<span class="account-avatar serpent-file-icon"></span><span><strong>Serpent Desk</strong><small>小蛇书桌</small></span>';
      footer.appendChild(desk);
    }
  }

  function closePanels() {
    ['cleanWolfV093', 'cleanDeskV093', 'cleanDetailV093', 'modelPickerV093'].forEach((id) => {
      const panel = document.getElementById(id);
      if (panel) panel.hidden = true;
    });
    document.body.classList.remove('wolf-open');
  }

  function panel(id, title, subtitle, body) {
    closeSide();
    closePanels();
    let node = document.getElementById(id);
    if (!node) {
      node = document.createElement('section');
      node.id = id;
      document.body.appendChild(node);
    }
    node.className = 'clean-panel';
    node.hidden = false;
    node.innerHTML = '<header class="clean-head"><button class="clean-back" data-panel-close>←</button><div><h1>' + title + '</h1><p>' + subtitle + '</p></div></header><main class="clean-body"><section class="clean-group"><div class="clean-card">' + body + '</div></section></main>';
    document.body.classList.add('wolf-open');
  }

  function openWolf() {
    panel('cleanWolfV093', 'Wolf Den / 小狼窝', 'Local settings · Account · Chat records', '<div class="clean-row"><span><strong>用户画像</strong><small>之后接模块</small></span></div><div class="clean-row"><span><strong>外观</strong><small>主题仍由主壳负责</small></span></div>');
  }

  function openDesk() {
    panel('cleanDeskV093', 'Serpent Desk / 小蛇书桌', 'Myri workspace · local writable notes', '<div class="clean-row"><span><strong>施工状态</strong><small>Daily legacy entry 已退役</small></span></div><div class="clean-row"><span><strong>本地诊断</strong><small>serviceWorker / scripts / storage</small></span></div>');
  }

  function modelPicker() {
    let picker = $('#modelPickerV093');
    if (!picker) {
      picker = document.createElement('div');
      picker.id = 'modelPickerV093';
      picker.className = 'model-popover';
      picker.innerHTML = '<div class="model-pop-card"><strong>选择模型</strong><button data-mpick="5.5 Thinking ›">ChatGPT 5.5 Thinking</button><button data-mpick="4o ›">ChatGPT 4o</button><button data-mpick="Classic Shell Local ›">Classic Shell Local</button><hr><button data-mpick="manage">管理模型 · 账户</button></div>';
      document.body.appendChild(picker);
    }
    picker.hidden = !picker.hidden;
  }

  function setModel(value) {
    const label = $('.model-name');
    if (label) label.textContent = value;
    localStorage.setItem(MK, value);
  }

  applyPrefs();
  ensureSidebarRows();
  renderEmptyThread();
  syncComposer();

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = (input?.value || '').trim();
    if (!text) return;
    localNotice('当前主聊天发送由模型箱接管；legacy host 不生成本地回复。');
  });

  input?.addEventListener('input', syncComposer);
  input?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      form?.requestSubmit();
    }
  });

  callButton?.addEventListener('click', (event) => {
    event.preventDefault();
    if ((input?.value || '').trim()) form?.requestSubmit();
  });

  document.addEventListener('click', (event) => {
    if (event.target.closest('#menuButton')) return openSide();
    if (event.target.closest('#sidebarClose,#scrim')) return closeSide();
    if (event.target.closest('#testWindowButton')) return closeSide();
    if (event.target.closest('[data-room="daily"],[data-room-v095="daily"],#dailyRoomRowP3Retire04')) return openDailyCanonical();
    if (event.target.closest('#themeToggle')) {
      const list = ['light', 'dark', 'gold'];
      const current = document.documentElement.dataset.theme || 'light';
      const next = list[(list.indexOf(current) + 1) % list.length];
      document.documentElement.dataset.theme = next;
      localStorage.setItem(TK, next);
      if (themeLabel) themeLabel.textContent = themeNames[next];
      return;
    }
    if (event.target.closest('#wolfRowV093')) return openWolf();
    if (event.target.closest('#serpentDeskRowV093')) return openDesk();
    if (event.target.closest('#modelButton')) return modelPicker();
    if (event.target.closest('[data-panel-close]')) return closePanels();
    const model = event.target.closest('[data-mpick]')?.dataset.mpick;
    if (model) {
      if (model === 'manage') return openWolf();
      setModel(model);
      const picker = $('#modelPickerV093');
      if (picker) picker.hidden = true;
    }
  }, false);

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js', { scope: '/' }).catch(() => undefined);
    });
  }
})();

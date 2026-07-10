(() => {
  'use strict';

  if (window.ElementeraShell) return;

  const STORAGE = Object.freeze({
    theme: 'gpt_like_shell_theme_clean_v1',
    avatar: 'gpt_like_assistant_avatar_dataurl_v1',
    userBubble: 'wolf_user_bubble_v092',
    accent: 'wolf_accent_v092',
  });

  const themeNames = { light: '浅色', dark: '深色', gold: '黑金' };
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const escapeHtml = (value) => String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );

  let avatarPicker = null;

  function applyPreferences() {
    const theme = localStorage.getItem(STORAGE.theme) || 'light';
    document.documentElement.dataset.theme = theme;
    const label = $('#theme-label');
    if (label) label.textContent = themeNames[theme] || theme;

    const bubble = localStorage.getItem(STORAGE.userBubble);
    if (bubble) document.documentElement.style.setProperty('--user', bubble);
    const accent = localStorage.getItem(STORAGE.accent);
    if (accent) document.documentElement.style.setProperty('--call', accent);
  }

  function openSidebar() {
    document.body.classList.add('sidebar-open');
    const scrim = $('#scrim');
    if (scrim) scrim.hidden = false;
    mountFooter();
  }

  function closeSidebar() {
    document.body.classList.remove('sidebar-open');
    const scrim = $('#scrim');
    if (scrim) scrim.hidden = true;
  }

  function mountFooter() {
    const footer = $('.sidebar-footer');
    if (!footer) return;
    const help = $$('.account-row', footer).find((row) => row.textContent.includes('帮助') || row.textContent.includes('Wolf Den'));
    if (help) {
      help.id = 'wolfRowV093';
      help.innerHTML = '<span class="account-avatar wolfden-icon">🐺</span><span><strong>Wolf Den</strong><small>小狼窝入口</small></span>';
    }

    let desk = $('#serpentDeskRowV093');
    if (!desk) {
      desk = document.createElement('button');
      desk.type = 'button';
      desk.className = 'account-row';
      desk.id = 'serpentDeskRowV093';
      footer.appendChild(desk);
    }
    desk.innerHTML = '<span class="account-avatar serpent-file-icon"></span><span><strong>Serpent Desk</strong><small>小蛇书桌</small></span>';
  }

  function closePanels() {
    ['cleanWolfV093', 'cleanDeskV093', 'cleanDetailV093'].forEach((id) => {
      const panel = $(`#${id}`);
      if (panel) panel.hidden = true;
    });
    document.body.classList.remove('wolf-open');
  }

  function row(title, subtitle, action) {
    return `<button type="button" class="clean-row" data-ca="${escapeHtml(action)}"><span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(subtitle)}</small></span></button>`;
  }

  function line(title, subtitle) {
    return `<div class="clean-row"><span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(subtitle)}</small></span></div>`;
  }

  function group(title, body) {
    return `<section class="clean-group"><h2>${escapeHtml(title)}</h2><div class="clean-card">${body}</div></section>`;
  }

  function card(body) {
    return `<div class="clean-card">${body}</div>`;
  }

  function openPanel(id, title, subtitle, body) {
    closeSidebar();
    ['cleanWolfV093', 'cleanDeskV093', 'cleanDetailV093'].forEach((panelId) => {
      const panel = $(`#${panelId}`);
      if (panel) panel.hidden = true;
    });
    let panel = $(`#${id}`);
    if (!panel) {
      panel = document.createElement('section');
      panel.id = id;
      document.body.appendChild(panel);
    }
    panel.className = 'clean-panel';
    panel.hidden = false;
    panel.innerHTML = `<header class="clean-head"><button class="clean-back" type="button" data-panel-close>←</button><div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p></div></header><main class="clean-body">${body}</main>`;
    document.body.classList.add('wolf-open');
    return panel;
  }

  function openDetail(title, subtitle, body, back) {
    const panel = openPanel('cleanDetailV093', title, subtitle, body);
    panel.dataset.back = back;
  }

  function openWolfDen() {
    openPanel(
      'cleanWolfV093',
      'Wolf Den / 小狼窝',
      'Local settings · Account · Chat records',
      group('我的 ChatGPT', row('用户画像', '称呼、头像、偏好备注', 'w-profile') + row('应用', '连接入口说明', 'w-apps'))
        + group('外观', row('主题', '浅色 / 深色 / 黑金', 'w-theme') + row('对话框颜色', '小寒用户气泡颜色', 'w-bubble') + row('重点色', '橙色 / 金色 / 蓝色 / 粉色', 'w-accent'))
        + group('聊天记录', row('导出 JSON', '保存当前聊天记录', 'w-json') + row('导出 HTML', '离线打开查看', 'w-html') + row('导入 JSON', '恢复到当前窗口', 'w-import'))
        + group('账户', row('余额', '账户余额与可用状态，占位', 'w-balance') + row('模型管理', '打开模型箱', 'w-models') + row('当前模型', '打开模型箱', 'w-current')),
    );
  }

  function openSerpentDesk() {
    openPanel(
      'cleanDeskV093',
      'Serpent Desk / 小蛇书桌',
      'Myri workspace · local writable notes',
      group('Myri', row('Myri 画像', '头像、描述、偏好', 's-portrait') + row('Myri 气泡', '记录视觉偏好', 's-bubble') + row('桌面便签', '小蛇书桌本地便签', 's-note'))
        + group('施工', row('施工状态', '版本、存储与 owner', 's-work') + row('本地诊断', '聊天与浏览器状态', 's-diag') + row('System Prompt 草稿', '本地草稿，不发送不生效', 's-system')),
    );
  }

  function currentMessages() {
    return window.ElementeraChat?.getActiveMessages?.() || [];
  }

  function openAction(action) {
    if (action === 'w-profile') {
      openDetail('用户画像', '只保存在本机并同步轻量设置', `<div class="clean-form"><label>本地昵称<input id="cwName" value="${escapeHtml(localStorage.getItem('cw_name') || '小寒')}"></label><label>偏好备注<textarea id="cwNote" rows="7">${escapeHtml(localStorage.getItem('cw_note') || '')}</textarea></label>${card(row('保存用户画像', 'localStorage + profile sync', 'cw-save'))}</div>`, 'wolf');
    }
    if (action === 'w-apps') {
      openDetail('应用', '连接入口说明', card(line('Notion', '可通过连接器使用') + line('Gmail / Calendar', '以后作为连接入口') + line('MCP', '施工工具不放进小狼窝')), 'wolf');
    }
    if (action === 'w-theme') {
      openDetail('主题', '选择本地主题', card(row('浅色', 'Light', 'theme-light') + row('深色', 'Dark', 'theme-dark') + row('黑金', 'Gold', 'theme-gold')), 'wolf');
    }
    if (action === 'w-bubble') {
      openDetail('对话框颜色', '小寒用户气泡颜色', card(row('默认', '跟随主题', 'bubble-default') + row('冷蓝灰', '#eaf0f7', 'bubble-cool') + row('浅粉灰', '#f5e8ee', 'bubble-pink') + row('淡金灰', '#f1ead8', 'bubble-gold')), 'wolf');
    }
    if (action === 'w-accent') {
      openDetail('重点色', '按钮与强调色', card(row('橙色', '#ff6a21', 'accent-orange') + row('金色', '#f28b2e', 'accent-gold') + row('蓝色', '#3b82f6', 'accent-blue') + row('粉色', '#ec4899', 'accent-pink')), 'wolf');
    }
    if (action === 'w-json') exportJson();
    if (action === 'w-html') exportHtml();
    if (action === 'w-import') importJson();
    if (action === 'w-balance') {
      openDetail('余额', '给小寒看的账户状态', card(line('余额', '等待后端安全接口') + line('状态', '主聊天由 D1 持久化') + line('密钥', '不会显示 API Key')), 'wolf');
    }
    if (action === 's-portrait') {
      openDetail('Myri 画像', '小蛇自己的本地档案', `<div class="clean-form"><label>称呼<input id="csName" value="${escapeHtml(localStorage.getItem('cs_name') || 'Myri')}"></label><label>自我描述<textarea id="csPortrait" rows="7">${escapeHtml(localStorage.getItem('cs_portrait') || 'Myrisol / Myri · 海岸小蛇 · 小蛇书桌主人。')}</textarea></label>${card(row('保存画像', 'localStorage only', 'cs-save'))}</div>`, 'desk');
    }
    if (action === 's-bubble') {
      openDetail('Myri 气泡', '记录视觉偏好', card(row('默认', '跟随主题', 's-bubble-default') + row('海岸金', '之后接入助手气泡', 's-bubble-gold') + row('冷蓝', '之后接入助手气泡', 's-bubble-blue')), 'desk');
    }
    if (action === 's-note') {
      openDetail('桌面便签', '小蛇书桌本地便签', `<div class="clean-form"><label>便签<textarea id="csNote" rows="8">${escapeHtml(localStorage.getItem('cs_note') || '')}</textarea></label>${card(row('保存便签', 'localStorage only', 'cn-save'))}</div>`, 'desk');
    }
    if (action === 's-work') {
      openDetail('施工状态', '主聊天 clean core', card(line('聊天 owner', 'conversation-controller.js') + line('服务器存储', 'D1 conversation_states JSON') + line('旧窗口脚本', '已退出加载链')), 'desk');
    }
    if (action === 's-diag') {
      openDetail('本地诊断', '不发额外网络请求', card(line('当前消息', `${currentMessages().length} 条`) + line('当前窗口', window.ElementeraChat?.getCurrentConversationId?.() || '未载入') + line('serviceWorker', 'serviceWorker' in navigator ? 'available' : 'unavailable')), 'desk');
    }
    if (action === 's-system') {
      openDetail('System Prompt 草稿', '本地草稿，不发送不生效', `<div class="clean-form"><label>草稿<textarea id="csSystem" rows="9">${escapeHtml(localStorage.getItem('cs_system') || '')}</textarea></label>${card(row('保存草稿', 'localStorage only', 'cy-save'))}</div>`, 'desk');
    }
  }

  function handleSetting(action) {
    if (['theme-light', 'theme-dark', 'theme-gold'].includes(action)) {
      const theme = action.split('-')[1];
      localStorage.setItem(STORAGE.theme, theme);
      applyPreferences();
    }

    const bubbleColors = {
      'bubble-cool': '#eaf0f7',
      'bubble-pink': '#f5e8ee',
      'bubble-gold': '#f1ead8',
    };
    if (action === 'bubble-default') {
      localStorage.removeItem(STORAGE.userBubble);
      document.documentElement.style.removeProperty('--user');
    } else if (bubbleColors[action]) {
      localStorage.setItem(STORAGE.userBubble, bubbleColors[action]);
      document.documentElement.style.setProperty('--user', bubbleColors[action]);
    }

    const accentColors = {
      'accent-orange': '#ff6a21',
      'accent-gold': '#f28b2e',
      'accent-blue': '#3b82f6',
      'accent-pink': '#ec4899',
    };
    if (accentColors[action]) {
      localStorage.setItem(STORAGE.accent, accentColors[action]);
      document.documentElement.style.setProperty('--call', accentColors[action]);
    }

    if (action === 'cw-save') {
      localStorage.setItem('cw_name', $('#cwName')?.value || '');
      localStorage.setItem('cw_note', $('#cwNote')?.value || '');
      window.dispatchEvent(new Event('elementera:profile-changed'));
      alert('用户画像已保存');
    }
    if (action === 'cs-save') {
      localStorage.setItem('cs_name', $('#csName')?.value || '');
      localStorage.setItem('cs_portrait', $('#csPortrait')?.value || '');
      alert('Myri 画像已保存到本机');
    }
    if (action === 'cn-save') {
      localStorage.setItem('cs_note', $('#csNote')?.value || '');
      alert('便签已保存到本机');
    }
    if (action === 'cy-save') {
      localStorage.setItem('cs_system', $('#csSystem')?.value || '');
      alert('草稿已保存到本机，未生效');
    }
  }

  function stamp() {
    const date = new Date();
    const two = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}${two(date.getMonth() + 1)}${two(date.getDate())}-${two(date.getHours())}${two(date.getMinutes())}${two(date.getSeconds())}`;
  }

  function download(body, name, type) {
    const url = URL.createObjectURL(new Blob([body], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  function exportJson() {
    const data = {
      format: 'elementera-chat-export',
      version: '3',
      exported_at: new Date().toISOString(),
      messages: currentMessages(),
    };
    download(JSON.stringify(data, null, 2), `elementera-chat-export-${stamp()}.json`, 'application/json');
  }

  function exportHtml() {
    const rows = currentMessages().map((message) => `<article class="m ${message.role}"><b>${message.role === 'user' ? '小寒' : 'ChatGPT'}</b><div>${escapeHtml(message.content).replace(/\n/g, '<br>')}</div></article>`).join('');
    const documentHtml = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Elementera Chat Export</title><style>body{font-family:system-ui,sans-serif;line-height:1.65}.w{max-width:820px;margin:auto;padding:22px 14px}.m{margin:0 0 18px}.m b{color:#777}.m div{display:inline-block;max-width:88%;padding:10px 14px;border:1px solid #ddd;border-radius:18px}.user{text-align:right}.user div{background:#f1f1f1}</style><div class="w"><h1>Elementera Chat Export</h1>${rows}</div>`;
    download(documentHtml, `elementera-chat-export-${stamp()}.html`, 'text/html');
  }

  function importJson() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const raw = JSON.parse(String(reader.result || ''));
          const messages = Array.isArray(raw) ? raw : raw.messages;
          if (!Array.isArray(messages)) throw new Error('messages not found');
          await window.ElementeraChat?.importFlatMessages?.(messages);
          closePanels();
        } catch (error) {
          alert(`导入失败：${error.message || error}`);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  function ensureAvatarPicker() {
    if (avatarPicker) return avatarPicker;
    avatarPicker = document.createElement('input');
    avatarPicker.type = 'file';
    avatarPicker.accept = 'image/*';
    avatarPicker.hidden = true;
    document.body.appendChild(avatarPicker);
    avatarPicker.onchange = () => {
      const file = avatarPicker.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          localStorage.setItem(STORAGE.avatar, String(reader.result || ''));
          window.dispatchEvent(new Event('elementera:profile-changed'));
        } catch {
          alert('头像过大，无法保存到本机。');
        }
      };
      reader.readAsDataURL(file);
      avatarPicker.value = '';
    };
    return avatarPicker;
  }

  document.addEventListener('click', (event) => {
    if (event.target.closest('#menuButton')) return openSidebar();
    if (event.target.closest('#sidebarClose,#scrim')) return closeSidebar();
    if (event.target.closest('#themeToggle')) {
      const themes = ['light', 'dark', 'gold'];
      const current = document.documentElement.dataset.theme || 'light';
      localStorage.setItem(STORAGE.theme, themes[(themes.indexOf(current) + 1) % themes.length]);
      applyPreferences();
      return;
    }
    if (event.target.closest('#wolfRowV093')) return openWolfDen();
    if (event.target.closest('#serpentDeskRowV093')) return openSerpentDesk();
    if (event.target.closest('.avatar')) return ensureAvatarPicker().click();

    const action = event.target.closest('[data-ca]')?.dataset.ca;
    if (action) {
      openAction(action);
      handleSetting(action);
      return;
    }
    if (event.target.closest('[data-panel-close]')) {
      if (event.target.closest('#cleanDetailV093')) {
        const back = $('#cleanDetailV093')?.dataset.back;
        back === 'desk' ? openSerpentDesk() : openWolfDen();
      } else closePanels();
    }
  });

  function start() {
    applyPreferences();
    mountFooter();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service-worker.js', { scope: '/' }).catch(() => undefined);
    }
  }

  window.ElementeraShell = Object.freeze({ openSidebar, closeSidebar, applyPreferences });
  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', start, { once: true })
    : start();
})();

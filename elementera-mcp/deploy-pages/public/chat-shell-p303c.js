(() => {
  if (window.__elementeraChatShellP303C) return;
  window.__elementeraChatShellP303C = true;

  const CHAT_KEY = 'gpt_like_test_window_messages_clean_v1';
  const AVATAR_KEY = 'gpt_like_assistant_avatar_dataurl_v1';
  const EMPTY_FLAG = 'ec.chatShell.empty.v1';
  const DEFAULT_EXAMPLES = new Set([
    '这是唯一保留的 GPT-like 测试窗口。\n\n这个窗口会把对话保存在本机浏览器里；刷新页面、从侧边栏点回来，内容都会继续在这里。',
    '我们先把这个壳调到像移动端 ChatGPT。',
    '好。接下来主要检查输入栏高度、按钮位置、消息是否保存，以及主题是否舒服。',
  ]);

  const q = (selector, root = document) => root.querySelector(selector);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const makeId = () => `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const html = (text) => esc(text).split(/\n{2,}/).map((part) => `<p>${part.replace(/\n/g, '<br>')}</p>`).join('');

  function installCss() {
    if (q('#chatShellP303CStyle')) return;
    const style = document.createElement('style');
    style.id = 'chatShellP303CStyle';
    style.textContent = `.chat-empty-p303c{min-height:calc(100dvh - var(--composer-h,120px) - 92px);display:grid;place-items:center;padding:24px 22px;color:var(--muted);text-align:center}.chat-empty-p303c strong{display:block;margin-bottom:8px;color:var(--text);font-size:20px;letter-spacing:-.035em}.chat-empty-p303c p{margin:0;font-size:14px;line-height:1.65}.chat-shell-menu-p303c{position:fixed;z-index:80;right:12px;top:calc(54px + env(safe-area-inset-top,0px));width:min(86vw,310px);padding:8px;border:1px solid var(--line);border-radius:22px;background:var(--panel);box-shadow:0 20px 60px rgba(0,0,0,.18)}.chat-shell-menu-p303c[hidden]{display:none}.chat-shell-menu-p303c button{display:block;width:100%;min-height:48px;padding:10px 13px;border:0;border-bottom:1px solid var(--line);background:transparent;color:var(--text);text-align:left}.chat-shell-menu-p303c button:last-child{border-bottom:0}.chat-shell-menu-p303c strong{display:block;font-size:15px}.chat-shell-menu-p303c small{display:block;margin-top:3px;color:var(--muted);font-size:12px;line-height:1.35}.chat-shell-menu-p303c .danger strong{color:#d66a53}.chat-toast-p303c{position:fixed;left:50%;bottom:calc(var(--composer-h,92px) + 14px + env(safe-area-inset-bottom,0px));z-index:90;display:flex;gap:10px;align-items:center;max-width:min(92vw,520px);padding:10px 12px;border:1px solid var(--line);border-radius:16px;background:var(--panel);box-shadow:0 14px 46px rgba(0,0,0,.16);color:var(--text);transform:translateX(-50%);font-size:13px}.chat-toast-p303c[hidden]{display:none}.chat-toast-p303c button{border:0;background:transparent;color:var(--muted);font-size:16px}.message .assistant-actions,.message .user-actions{gap:5px;opacity:.62}.message .assistant-actions .action-button,.message .user-actions .action-button{width:30px;height:30px}.call-button:disabled{opacity:.44}@media(max-width:720px){.topbar{grid-template-columns:auto minmax(0,1fr) auto;gap:8px}.topbar .model-button{justify-self:stretch;text-align:left;max-width:100%!important}.topbar .model-title{font-size:15px}.topbar .model-name{font-size:12px}.topbar-actions{gap:2px}.message.assistant{grid-template-columns:28px minmax(0,1fr);gap:9px}.message.assistant .avatar{width:28px;height:28px}.message .content{min-width:0}.assistant-text,.user-bubble{line-height:1.68}.composer-wrap{position:sticky;bottom:0;padding-bottom:calc(8px + env(safe-area-inset-bottom,0px));background:var(--bg)}}`;
    document.head.appendChild(style);
  }

  function readMessages() {
    let raw = [];
    try {
      raw = JSON.parse(localStorage.getItem(CHAT_KEY) || '[]');
    } catch {
      raw = [];
    }
    if (!Array.isArray(raw)) raw = [];
    let changed = false;
    const items = raw.filter((item) => item && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string').map((item) => {
      if (!item.id) changed = true;
      return { ...item, id: item.id || makeId() };
    });
    if (changed) writeMessages(items);
    return items;
  }

  function writeMessages(items) {
    localStorage.setItem(CHAT_KEY, JSON.stringify(items));
  }

  function avatar() {
    const url = localStorage.getItem(AVATAR_KEY) || '';
    return `<div class="avatar ${url ? 'has-custom-avatar' : ''}" role="button" tabindex="0" ${url ? `style="background-image:url(${url})"` : ''}>${url ? '' : '⌁'}</div>`;
  }

  function actionButton(name, title, extra = '') {
    return `<button class="action-button" type="button" data-action="${esc(name)}" ${extra} title="${esc(title)}"></button>`;
  }

  function renderEmpty() {
    const box = q('#messages');
    const title = q('.model-title');
    if (title) title.textContent = '新聊天';
    if (!box) return;
    box.innerHTML = `<div class="chat-empty-p303c"><div><strong>这里还没有消息。</strong><p>选择模型后，可以开始和海岸聊天。</p></div></div><div class="thread-spacer"></div>`;
  }

  function renderMessages(items = readMessages()) {
    const box = q('#messages');
    const scroller = q('#messageScroller');
    const title = q('.model-title');
    if (title) title.textContent = items.length ? 'ChatGPT' : '新聊天';
    if (!box) return;
    if (!items.length) {
      renderEmpty();
      return;
    }
    box.innerHTML = items.map((message) => {
      if (message.role === 'user') {
        return `<article class="message user" data-id="${esc(message.id)}"><div class="content"><div class="user-bubble">${esc(message.content)}</div><div class="user-actions" data-user-actions-for="${esc(message.id)}">${actionButton('edit', '编辑', 'data-user-act="edit"')}${actionButton('delete', '删除', 'data-user-act="remove"')}</div></div></article>`;
      }
      return `<article class="message assistant" data-id="${esc(message.id)}">${avatar()}<div class="content"><div class="assistant-text">${html(message.content)}${message.errorDetail ? `<span class="chat-error-detail">${esc(message.errorDetail)}</span>` : ''}</div><div class="assistant-actions" data-actions-for="${esc(message.id)}">${actionButton('copy', '复制')}${actionButton('refresh', '重新生成')}${actionButton('delete', '删除')}</div></div></article>`;
    }).join('') + '<div class="thread-spacer"></div>';
    requestAnimationFrame(() => { if (scroller) scroller.scrollTop = scroller.scrollHeight; });
  }

  function showToast(message, timeout = 2800) {
    let toast = q('#chatToastP303C');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'chatToastP303C';
      toast.className = 'chat-toast-p303c';
      toast.innerHTML = '<span></span><button type="button" data-chat-toast-close>×</button>';
      document.body.appendChild(toast);
    }
    q('span', toast).textContent = message;
    toast.hidden = false;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => { toast.hidden = true; }, timeout);
  }

  function closeToast() {
    const toast = q('#chatToastP303C');
    if (toast) toast.hidden = true;
  }

  function createMenu() {
    let menu = q('#chatShellMenuP303C');
    if (menu) return menu;
    menu = document.createElement('div');
    menu.id = 'chatShellMenuP303C';
    menu.className = 'chat-shell-menu-p303c';
    menu.hidden = true;
    menu.innerHTML = `<button type="button" data-chat-shell-action="new"><strong>新聊天</strong><small>清空当前窗口，进入空白聊天。</small></button><button type="button" data-chat-shell-action="clear"><strong>清空当前聊天</strong><small>不影响模型箱、当前模型或运行控制层。</small></button><button type="button" data-chat-shell-action="clean-default"><strong>清理默认示例消息</strong><small>只移除旧版固定示例文案。</small></button><button type="button" class="danger" data-chat-shell-action="close"><strong>关闭</strong><small>返回当前页面。</small></button>`;
    document.body.appendChild(menu);
    return menu;
  }

  function toggleMenu(force) {
    const menu = createMenu();
    menu.hidden = typeof force === 'boolean' ? !force : !menu.hidden;
  }

  function emptyChat(message = '已进入空白聊天。') {
    localStorage.setItem(EMPTY_FLAG, '1');
    writeMessages([]);
    renderEmpty();
    showToast(message);
  }

  function newChat() {
    const items = readMessages();
    if (items.length && !confirm('新聊天会清空当前窗口消息，但不会影响模型箱、当前模型或运行控制层。继续吗？')) return;
    emptyChat('已创建空白新聊天。');
  }

  function clearChat() {
    if (!confirm('确定清空当前聊天吗？这不会影响模型箱、当前模型或运行控制层。')) return;
    emptyChat('当前聊天已清空。');
  }

  function cleanDefaultExamples() {
    if (!confirm('只会清理旧版默认示例消息，不会删除你的真实聊天。')) return;
    const before = readMessages();
    const after = before.filter((item) => !DEFAULT_EXAMPLES.has(item.content));
    writeMessages(after);
    if (!after.length) localStorage.setItem(EMPTY_FLAG, '1');
    renderMessages(after);
    showToast(`已清理 ${before.length - after.length} 条默认示例消息。`);
  }

  function deleteMessage(messageId) {
    const items = readMessages();
    const target = items.find((item) => item.id === messageId);
    if (!target) return;
    if (!confirm('删除这一条消息吗？只会删除当前这一条。')) return;
    const next = items.filter((item) => item.id !== messageId);
    writeMessages(next);
    if (!next.length) localStorage.setItem(EMPTY_FLAG, '1');
    renderMessages(next);
    showToast('已删除这一条消息。');
  }

  function syncSendButton() {
    const input = q('#promptInput');
    const button = q('#callButton');
    if (!input || !button) return;
    const busy = button.dataset.busy === 'true' || button.dataset.icon === 'stop';
    const hasText = !!input.value.trim();
    button.disabled = !busy && !hasText;
  }

  function maybeRestoreEmptyState() {
    if (localStorage.getItem(EMPTY_FLAG) === '1') {
      writeMessages([]);
      renderEmpty();
    } else {
      const items = readMessages();
      if (items.length) renderMessages(items);
    }
    syncSendButton();
  }

  window.addEventListener('click', (event) => {
    if (event.target.closest('[data-chat-toast-close]')) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      closeToast();
      return;
    }

    if (event.target.closest('#moreButton')) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      toggleMenu();
      return;
    }

    if (event.target.closest('#newChatButton')) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      toggleMenu(false);
      newChat();
      return;
    }

    const menuAction = event.target.closest('[data-chat-shell-action]')?.dataset.chatShellAction;
    if (menuAction) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      toggleMenu(false);
      if (menuAction === 'new') newChat();
      if (menuAction === 'clear') clearChat();
      if (menuAction === 'clean-default') cleanDefaultExamples();
      return;
    }

    const userDelete = event.target.closest('[data-user-act="remove"]');
    if (userDelete) {
      const messageId = userDelete.closest('.user-actions')?.dataset.userActionsFor;
      if (messageId) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        deleteMessage(messageId);
      }
      return;
    }

    const assistantDelete = event.target.closest('.assistant-actions .action-button[data-action="delete"]');
    if (assistantDelete) {
      const messageId = assistantDelete.closest('.assistant-actions')?.dataset.actionsFor;
      if (messageId) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        deleteMessage(messageId);
      }
    }
  }, true);

  document.addEventListener('input', (event) => {
    if (event.target?.id === 'promptInput') syncSendButton();
  }, true);

  document.addEventListener('submit', (event) => {
    if (event.target?.id === 'composer') {
      localStorage.removeItem(EMPTY_FLAG);
      setTimeout(syncSendButton, 0);
    }
  }, true);

  const start = () => {
    installCss();
    createMenu();
    maybeRestoreEmptyState();
    new MutationObserver(() => {
      syncSendButton();
      const title = q('.model-title');
      if (title && !readMessages().length) title.textContent = '新聊天';
    }).observe(document.body, { childList: true, subtree: true });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();

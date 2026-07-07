import { getCurrentWindow, loadChatState } from './state/chat-store.js';
import { migrateLegacyMessagesIfNeeded } from './storage/migrations.js';

const mount = document.querySelector('#app');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function renderMessage(message) {
  return `
    <article class="ec-v2-message ec-v2-message-${escapeHtml(message.role)}">
      <div class="ec-v2-message-role">${message.role === 'assistant' ? 'assistant' : 'user'}</div>
      <div class="ec-v2-message-content">${escapeHtml(message.content).replace(/\n/g, '<br>')}</div>
    </article>
  `;
}

function renderMessages(window) {
  if (!window.messages.length) {
    return `
      <section class="ec-v2-empty-state">
        <h1>这里还没有消息。</h1>
        <p>v2 已经拥有独立聊天窗口结构；本轮暂不发送消息。</p>
      </section>
    `;
  }

  return `
    <section class="ec-v2-message-list" aria-label="v2 当前窗口消息列表">
      ${window.messages.map(renderMessage).join('')}
    </section>
  `;
}

function renderAppV2() {
  if (!mount) return;

  migrateLegacyMessagesIfNeeded();
  const state = loadChatState();
  const currentWindow = getCurrentWindow(state);
  const subtitle = currentWindow.messages.length
    ? `${currentWindow.messages.length} 条消息 · P3-REF-02`
    : '独立数据层 · P3-REF-02';

  mount.innerHTML = `
    <div class="ec-v2-shell">
      <header class="ec-v2-topbar">
        <button class="ec-v2-icon-button" type="button" aria-label="侧边栏占位" disabled>☰</button>
        <div class="ec-v2-title-block">
          <strong>Elementera Coast v2</strong>
          <span>${escapeHtml(currentWindow.title)}</span>
        </div>
        <button class="ec-v2-icon-button" type="button" aria-label="更多占位" disabled>⋯</button>
      </header>

      <main class="ec-v2-main" aria-label="app-v2 消息区">
        <div class="ec-v2-window-meta">
          <strong>${escapeHtml(currentWindow.title)}</strong>
          <span>${escapeHtml(subtitle)}</span>
        </div>
        ${renderMessages(currentWindow)}
      </main>

      <form class="ec-v2-composer" aria-label="app-v2 输入栏占位">
        <button class="ec-v2-add-button" type="button" aria-label="附件占位" disabled>+</button>
        <textarea
          rows="1"
          placeholder="v2 壳测试中，暂不发送"
          aria-label="v2 壳测试中，暂不发送"
          disabled
        ></textarea>
        <button class="ec-v2-send-button" type="button" aria-label="发送占位" disabled>↑</button>
      </form>
    </div>
  `;
}

renderAppV2();

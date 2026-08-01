import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

function installWindow(window) {
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.FormData = window.FormData;
  globalThis.Event = window.Event;
  globalThis.MouseEvent = window.MouseEvent;
  globalThis.requestAnimationFrame = (callback) => callback();
}

const entryWindow = new Window({ url: 'https://coast.test/login' });
installWindow(entryWindow);
entryWindow.document.body.innerHTML = `
  <button id="mailboxEntryButton" type="button">海岸信箱</button>
  <dialog id="mailboxEntryModal">
    <button id="mailboxEntryClose" type="button">关闭</button>
    <section id="mailboxEntryChoices">
      <button type="button" data-mailbox-choice="login">输入暗号</button>
      <button type="button" data-mailbox-choice="register">填记名册</button>
    </section>
    <form id="mailboxLoginForm" hidden>
      <input name="passphrase"><p data-mailbox-error></p>
      <button type="button" data-mailbox-back>返回</button><button type="submit">进入</button>
    </form>
    <form id="mailboxRegisterForm" hidden>
      <input name="display_name"><input name="passphrase"><input name="preferred_name">
      <input name="allow_memory" type="checkbox" checked><p data-mailbox-error></p>
      <button type="button" data-mailbox-back>返回</button><button type="submit">登记</button>
    </form>
  </dialog>`;
globalThis.fetch = async () => new Response(JSON.stringify({ ok: true }), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
});
await import(`../elementera-mcp/deploy-pages/public/mailbox-entry.js?dom=${Date.now()}`);
entryWindow.document.querySelector('#mailboxEntryButton').click();
assert.equal(entryWindow.document.querySelector('#mailboxEntryModal').open, true);
entryWindow.document.querySelector('[data-mailbox-choice="login"]').click();
assert.equal(entryWindow.document.querySelector('#mailboxEntryChoices').hidden, true);
assert.equal(entryWindow.document.querySelector('#mailboxLoginForm').hidden, false);
entryWindow.document.querySelector('[data-mailbox-back]').click();
assert.equal(entryWindow.document.querySelector('#mailboxEntryChoices').hidden, false);

const mailboxWindow = new Window({ url: 'https://coast.test/mailbox' });
installWindow(mailboxWindow);
mailboxWindow.confirm = () => true;
mailboxWindow.document.body.innerHTML = `
  <div id="mailboxApp">
    <a data-icon="back"></a>
    <span id="mailboxVisitorLabel"></span>
    <button data-panel="thinking">思维壤</button>
    <button data-panel="notebook">访客记事本</button>
    <div id="mailboxMessageScroller"><div id="mailboxMessages"></div></div>
    <section id="mailboxStatusBar"><strong id="mailboxStatusText"></strong><small id="mailboxStatusMeta"></small></section>
    <button id="mailboxRefreshButton"></button>
    <form id="mailboxComposer"><textarea id="mailboxPromptInput"></textarea><button id="mailboxSendButton" data-icon="send"></button></form>
    <dialog id="mailboxPanel"><strong id="mailboxPanelTitle"></strong><small id="mailboxPanelSubtitle"></small><button id="mailboxPanelClose" data-icon="close"></button><div id="mailboxPanelBody"></div></dialog>
    <div id="mailboxToast" hidden></div>
  </div>`;

const requestedPaths = [];
globalThis.fetch = async (input, options = {}) => {
  const path = String(input);
  requestedPaths.push([path, options.method || 'GET']);
  let value;
  if (path === '/api/mailbox/me') {
    value = { ok: true, visitor_id: 'visitor-a', display_name: '星星', preferred_name: '小星', allow_memory: true };
  } else if (path === '/api/mailbox/messages') {
    value = {
      ok: true,
      messages: [
        { id: 'v-1', visitor_id: 'visitor-a', role: 'visitor', content: '第一封信', status: 'waiting_for_myri', created_at: '2026-08-01T10:00:00.000Z', updated_at: '2026-08-01T10:00:00.000Z' },
        { id: 'm-1', visitor_id: 'visitor-a', role: 'myri', content: '第一封回信', status: 'sent', created_at: '2026-08-01T11:00:00.000Z', updated_at: '2026-08-01T11:00:00.000Z' },
      ],
    };
  } else if (path === '/api/mailbox/status') {
    value = { ok: true, pending_count: 1, last_myri_reply_at: '2026-08-01T11:00:00.000Z', queue_status: 'pending' };
  } else if (path === '/api/mailbox/thinking-notes') {
    value = { ok: true, notes: [{ id: 'soil-1', content: '一张整理性小纸条。', created_at: '2026-08-01T11:00:00.000Z', updated_at: '2026-08-01T11:00:00.000Z' }] };
  } else if (path === '/api/mailbox/notebook') {
    value = { ok: true, entries: [] };
  } else if (path === '/api/mailbox/send') {
    value = { ok: true, message: { id: 'v-2', visitor_id: 'visitor-a', role: 'visitor', content: '第二封信', status: 'waiting_for_myri', created_at: '2026-08-01T12:00:00.000Z', updated_at: '2026-08-01T12:00:00.000Z' } };
  } else {
    value = { ok: true };
  }
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

await import(`../elementera-mcp/deploy-pages/public/mailbox.js?dom=${Date.now()}`);
await new Promise((resolve) => setTimeout(resolve, 10));
assert.match(mailboxWindow.document.querySelector('#mailboxVisitorLabel').textContent, /小星/);
assert.match(mailboxWindow.document.querySelector('#mailboxMessages').textContent, /第一封信/);
assert.match(mailboxWindow.document.querySelector('#mailboxMessages').textContent, /第一封回信/);
assert.equal(mailboxWindow.document.querySelector('#mailboxStatusText').textContent, '已送达灯塔，等待 Myri 巡灯。');

mailboxWindow.document.querySelector('[data-panel="thinking"]').click();
await new Promise((resolve) => setTimeout(resolve, 5));
assert.equal(mailboxWindow.document.querySelector('#mailboxPanel').open, true);
assert.match(mailboxWindow.document.querySelector('#mailboxPanelBody').textContent, /一张整理性小纸条/);

const input = mailboxWindow.document.querySelector('#mailboxPromptInput');
input.value = '第二封信';
mailboxWindow.document.querySelector('#mailboxComposer').dispatchEvent(new mailboxWindow.Event('submit', {
  bubbles: true,
  cancelable: true,
}));
await new Promise((resolve) => setTimeout(resolve, 5));
assert.ok(requestedPaths.some(([path, method]) => path === '/api/mailbox/send' && method === 'POST'));
assert.match(mailboxWindow.document.querySelector('#mailboxMessages').textContent, /第二封信/);
assert.equal(mailboxWindow.document.querySelector('#mailboxMessages').textContent.includes('模型选择'), false);

console.log('mailbox-dom: ok');

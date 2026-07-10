import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Window } from 'happy-dom';

const testDir = dirname(fileURLToPath(import.meta.url));
const pages = resolve(testDir, '../elementera-mcp/deploy-pages');
const html = await readFile(resolve(pages, 'index.html'), 'utf8');
const window = new Window({ url: 'http://coast.test/' });
window.document.write(html);
window.document.close();

for (const name of [
  'window', 'document', 'localStorage', 'navigator', 'HTMLElement', 'HTMLFormElement', 'HTMLInputElement',
  'HTMLTextAreaElement', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'FileReader', 'Blob',
]) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: window[name] || window });
globalThis.requestAnimationFrame = (callback) => callback(Date.now());
window.requestAnimationFrame = globalThis.requestAnimationFrame;
globalThis.alert = () => {};
const prompts = [];
globalThis.prompt = (_message, fallback = '') => prompts.length ? prompts.shift() : fallback;
globalThis.confirm = () => true;
let clipboard = '';
Object.defineProperty(window.navigator, 'clipboard', { value: { writeText: async (value) => { clipboard = value; } } });
localStorage.setItem('gpt_like_shell_theme_clean_v1', 'dark');
localStorage.setItem('cw_name', '迁移中的小寒');
localStorage.setItem('ec.currentConversationId', 'conv-1');

const now = () => new Date().toISOString();
let sequence = 1;
let profile = {
  assistant_avatar_dataurl: '',
  current_chat_model: 'openai/gpt-4.1-nano',
  current_image_model: '',
  model_box: { chat: ['openai/gpt-4.1-nano'], free: [], image: [] },
};
let conversations = [{ id: 'conv-1', title: '新聊天', created_at: now(), updated_at: now(), deleted_at: null, title_manual: false, title_generated_at: null }];
const histories = new Map([['conv-1', { version: 4, updated_at: now(), turns: [] }]]);

function response(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
}

globalThis.fetch = async (input, options = {}) => {
  const url = new URL(String(input), 'http://coast.test');
  const method = options.method || 'GET';
  const body = options.body ? JSON.parse(options.body) : {};
  if (url.pathname === '/api/chat/profile') {
    if (method === 'PUT') profile = body.profile;
    return response({ ok: true, profile });
  }
  if (url.pathname === '/api/chat/conversations') {
    if (method === 'GET') return response({ ok: true, conversations });
    const conversation = { id: `conv-${++sequence}`, title: '新聊天', created_at: now(), updated_at: now(), deleted_at: null, title_manual: false, title_generated_at: null };
    conversations.unshift(conversation);
    histories.set(conversation.id, { version: 4, updated_at: now(), turns: [] });
    return response({ ok: true, conversation }, 201);
  }
  if (url.pathname.startsWith('/api/chat/conversations/')) {
    const id = decodeURIComponent(url.pathname.split('/').at(-1));
    const conversation = conversations.find((item) => item.id === id);
    if (method === 'PATCH') {
      conversation.title = body.title;
      conversation.title_manual = true;
      return response({ ok: true, conversation });
    }
    if (method === 'DELETE') {
      conversations = conversations.filter((item) => item.id !== id);
      return response({ ok: true, conversation: { ...conversation, deleted_at: now() }, deleted: true });
    }
  }
  if (url.pathname === '/api/chat/history') {
    const id = url.searchParams.get('conversation_id');
    if (method === 'PUT') histories.set(id, body);
    return response({ ok: true, source: 'd1-json-v4', history: { ...(histories.get(id) || { version: 4, turns: [] }), conversation_id: id } });
  }
  if (url.pathname === '/api/chat') {
    return response({ ok: true, model: body.model, message: { role: 'assistant', content: `mock: ${body.messages.at(-1)?.content || ''}` } });
  }
  if (url.pathname === '/api/chat/title') {
    const conversation = conversations.find((item) => item.id === body.conversation_id);
    conversation.title = '测试标题';
    conversation.title_generated_at = now();
    return response({ ok: true, conversation });
  }
  if (url.pathname === '/api/models') {
    const model = { id: 'openai/gpt-4.1-nano', name: 'GPT-4.1 Nano', is_free: false, available: true, supported_parameters: ['temperature'], pricing: { prompt: '0', completion: '0' } };
    const free = { id: 'nvidia/nemotron-3-super-120b-a12b:free', name: 'Nemotron Super', is_free: true, available: true, supported_parameters: [], pricing: { prompt: '0', completion: '0' } };
    return response({ ok: true, groups: { openai_chat: [model], openai_image: [], free_test: [free] }, defaults: { chat: model.id, image: '', free: free.id }, updated_at: now() });
  }
  if (url.pathname === '/api/health') return response({ ok: true, authenticated: true, ts: now() });
  if (url.pathname === '/api/chat-sandbox') return response({ ok: true, model: 'mock/free', message: { role: 'assistant', content: '海岸测试灯已亮。' } });
  return response({ ok: false, error: { type: 'not_found', message: 'not found' } }, 404);
};

const tick = () => new Promise((resolveTick) => setTimeout(resolveTick, 0));
async function waitFor(test, label, attempts = 100) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (test()) return;
    await tick();
  }
  throw new Error(`timeout:${label}`);
}

await import(`${pathToFileURL(resolve(pages, 'public/app.js')).href}?test=${Date.now()}`);
await waitFor(() => document.querySelectorAll('#chatConversationList .conversation-row').length === 1, 'chat bootstrap');

assert.equal(document.documentElement.dataset.theme, 'dark');
assert.equal(JSON.parse(localStorage.getItem('elementera.local.v1')).preferences.xiaohanName, '迁移中的小寒');
assert.equal(localStorage.getItem('gpt_like_shell_theme_clean_v1'), null);
assert.equal(localStorage.getItem('cw_name'), null);
assert.equal(localStorage.getItem('ec.currentConversationId'), null);
assert.equal(document.querySelectorAll('#coastStatus').length, 1);
assert.equal(document.querySelectorAll('#mainRooms').length, 1);
assert.match(document.querySelector('#coastStatus').textContent, /同轨第\s+\d+\s+日/);
assert.ok(document.querySelectorAll('svg.icon').length >= 15);

const input = document.querySelector('#promptInput');
input.value = 'a1';
input.dispatchEvent(new window.Event('input', { bubbles: true }));
document.querySelector('#composer').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await waitFor(() => document.querySelector('.message.assistant')?.textContent.includes('mock: a1'), 'assistant reply');
assert.equal(document.querySelectorAll('.message.user .action-button').length, 2);
assert.equal(document.querySelectorAll('.message.assistant .action-button').length, 5);
assert.equal(document.querySelectorAll('.message .action-button svg').length, 7);

document.querySelector('.message.assistant [data-action="chat:like"]').click();
await tick();
assert.ok(document.querySelector('.message.assistant [data-action="chat:like"]').classList.contains('is-active'));
document.querySelector('.message.assistant [data-action="chat:copy"]').click();
await tick();
assert.equal(clipboard, 'mock: a1');

prompts.push('a1 edited');
document.querySelector('.message.user [data-action="chat:edit-user"]').click();
await waitFor(() => document.querySelector('.message.user .variant-switch')?.textContent.includes('2/2'), 'user variant');
await waitFor(() => document.querySelector('.message.assistant')?.textContent.includes('mock: a1 edited'), 'edited assistant');
assert.equal(document.querySelectorAll('.message.assistant').length, 1);
document.querySelector('.message.assistant [data-action="chat:delete-assistant"]').click();
await tick();
assert.equal(document.querySelectorAll('.message.assistant').length, 0);
document.querySelector('.message.user [data-direction="previous"]').click();
await tick();
assert.equal(document.querySelectorAll('.message.assistant').length, 1);

document.querySelector('#newChatButton').click();
await waitFor(() => document.querySelectorAll('#chatConversationList .conversation-row').length === 2, 'new conversation');
const first = document.querySelector('#chatConversationList .conversation-row');
first.querySelector('[data-action="chat:menu"]').click();
prompts.push('改名1');
first.querySelector('[data-action="chat:rename"]').click();
await waitFor(() => document.querySelector('#chatConversationList').textContent.includes('改名1'), 'rename conversation');
assert.equal(document.querySelectorAll('#chatConversationList .conversation-row').length, 2);
const renamed = [...document.querySelectorAll('#chatConversationList .conversation-row')].find((row) => row.textContent.includes('改名1'));
renamed.querySelector('[data-action="chat:menu"]').click();
renamed.querySelector('[data-action="chat:delete-conversation"]').click();
await waitFor(() => document.querySelectorAll('#chatConversationList .conversation-row').length === 1, 'delete conversation');

document.querySelector('#modelButton').click();
await waitFor(() => document.querySelector('#overlayRoot')?.dataset.route === 'models', 'models route');
assert.ok(document.querySelectorAll('.model-row').length >= 2);
document.querySelector('[data-action="router:back"]').click();
await tick();

document.querySelector('[data-action="daily:home"]').click();
await waitFor(() => document.querySelector('#overlayRoot')?.dataset.route === 'daily-home', 'daily route');
assert.equal(document.querySelectorAll('.daily-grid button').length, 5);
document.querySelector('[data-action="router:back"]').click();
await tick();

document.querySelector('#moreButton').click();
await waitFor(() => document.querySelector('#overlayRoot')?.dataset.route === 'island-letter', 'letter route');
assert.ok(document.querySelector('#islandLetterText').value.includes('欢迎回家'));
document.querySelector('[data-action="router:back"]').click();
await tick();

document.querySelector('[data-action="rooms:open"][data-kind="radio"]').click();
await waitFor(() => document.querySelector('#overlayRoot')?.dataset.route === 'local-room', 'room route');
document.querySelector('#localRoomInput').value = 'radio test';
document.querySelector('.local-room-composer').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await waitFor(() => document.querySelector('.local-message-list')?.textContent.includes('radio test'), 'local room send');

console.log('dom: ok');

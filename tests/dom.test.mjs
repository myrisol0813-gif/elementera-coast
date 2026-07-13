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
let formalChatRequests = 0;
const formalChatBodies = [];
const soils = new Map();
const memoryPockets = [];
const memoryEntries = [];
const landingStatuses = new Map();
const landingBodies = [];
const soilOrganizeBodies = [];

function soilFor(conversationId) {
  if (!soils.has(conversationId)) soils.set(conversationId, {
    conversation_id: conversationId,
    current_text: '',
    hand_seeds: [],
    do_not_repeat: '',
    pocket_candidates: [],
    manual_locked: false,
    auto_refresh_enabled: true,
    revision: 1,
  });
  return soils.get(conversationId);
}

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
  if (url.pathname === '/api/chat/landing-letter') {
    if (method === 'GET') {
      const key = `${url.searchParams.get('conversation_id')}::${url.searchParams.get('model')}`;
      return response({ ok: true, landing: landingStatuses.get(key) || { sent: false } });
    }
    landingBodies.push(body);
    const state = structuredClone(histories.get(body.conversation_id) || { version: 4, updated_at: now(), turns: [] });
    const turnId = `landing-turn-${++sequence}`;
    state.turns.push({
      id: turnId,
      turn_type: 'landing',
      model_id: body.model,
      user: {
        active: 0,
        variants: [{ id: `landing-user-${sequence}`, content: body.letter_text, hidden: true, input_type: 'landing_letter', created_at: now() }],
      },
      assistant: {
        activeByUserVariant: { 0: 0 },
        variantsByUserVariant: { 0: [{ id: `landing-assistant-${sequence}`, content: '我把登岛信读完了。', created_at: now() }] },
      },
    });
    state.updated_at = now();
    histories.set(body.conversation_id, state);
    const key = `${body.conversation_id}::${body.model}`;
    const previous = landingStatuses.get(key);
    const landing = {
      sent: true,
      model_id: body.model,
      landing_version: Number(previous?.landing_version || 0) + 1,
      landing_text_hash: `hash-${sequence}`,
      assistant_turn_id: turnId,
      sent_at: now(),
    };
    landingStatuses.set(key, landing);
    return response({
      ok: true,
      assistant: { role: 'assistant', content: '我把登岛信读完了。' },
      conversation: conversations.find((item) => item.id === body.conversation_id),
      history: { ...state, conversation_id: body.conversation_id },
      landing,
      memory: { selected_entry_ids: [], vector_enabled: false },
    });
  }
  if (url.pathname === '/api/chat') {
    formalChatRequests += 1;
    formalChatBodies.push(body);
    return response({ ok: true, model: body.model, message: { role: 'assistant', content: `mock: ${body.messages.at(-1)?.content || ''}` }, memory: { selected_entry_ids: [`mock-memory-${formalChatRequests}`], vector_enabled: false } });
  }
  if (url.pathname === '/api/chat/title') {
    const conversation = conversations.find((item) => item.id === body.conversation_id);
    conversation.title = '测试标题';
    conversation.title_generated_at = now();
    return response({ ok: true, conversation });
  }
  if (url.pathname === '/api/memory/soil') {
    const conversationId = url.searchParams.get('conversation_id');
    if (method === 'PUT') soils.set(conversationId, { ...soilFor(conversationId), ...body, revision: soilFor(conversationId).revision + 1 });
    return response({ ok: true, soil: soilFor(conversationId) });
  }
  if (url.pathname === '/api/memory/soil/organize') {
    soilOrganizeBodies.push(body);
    const soil = {
      ...soilFor(body.conversation_id),
      current_text: '继续测试当前窗口',
      hand_seeds: [{ name: '测试种', life_core: '只在需要时轻轻递入', usage_hint: '', avoid_hint: '不要复读' }],
      revision: soilFor(body.conversation_id).revision + 1,
    };
    soils.set(body.conversation_id, soil);
    return response({ ok: true, soil });
  }
  if (url.pathname === '/api/memory/pockets') {
    if (method === 'POST') {
      const pocket = { id: `pocket-${memoryPockets.length + 1}`, status: 'pending', suggested_title: body.source_text.slice(0, 40), suggested_life_core: '', suggested_usage_hint: '', ...body };
      memoryPockets.unshift(pocket);
      return response({ ok: true, pocket }, 201);
    }
    const conversationId = url.searchParams.get('conversation_id');
    return response({ ok: true, pockets: memoryPockets.filter((item) => item.conversation_id === conversationId && item.status === (url.searchParams.get('status') || 'pending')) });
  }
  if (/^\/api\/memory\/pockets\/[^/]+\/resolve$/.test(url.pathname)) {
    const id = decodeURIComponent(url.pathname.split('/').at(-2));
    const pocket = memoryPockets.find((item) => item.id === id);
    if (['stone', 'discard'].includes(body.action)) {
      pocket.status = body.action === 'stone' ? 'stone' : 'discarded';
      return response({ ok: true, pocket, entry: null });
    }
    const global = body.action.startsWith('global_');
    const entry = {
      id: `entry-${memoryEntries.length + 1}`,
      entry_type: body.action.endsWith('_seed') ? 'seed' : 'memory',
      scope: global ? 'global' : 'conversation',
      conversation_id: global ? null : pocket.conversation_id,
      title: body.title || pocket.suggested_title,
      life_core: body.life_core || pocket.source_text,
      content: body.content || pocket.source_text,
      usage_hint: body.usage_hint || '',
      avoid_hint: body.avoid_hint || '',
      status: body.action.endsWith('_seed') ? 'dormant' : 'active',
      memory_level: 'ordinary',
      embedding_status: 'pending',
    };
    memoryEntries.unshift(entry);
    pocket.status = 'confirmed';
    pocket.resolved_entry_id = entry.id;
    return response({ ok: true, pocket, entry });
  }
  if (url.pathname.startsWith('/api/memory/pockets/')) {
    const id = decodeURIComponent(url.pathname.split('/').at(-1));
    const pocket = memoryPockets.find((item) => item.id === id);
    Object.assign(pocket, body);
    return response({ ok: true, pocket });
  }
  if (url.pathname === '/api/memory/vector-status') {
    return response({
      ok: true,
      ai_binding: true,
      vector_binding: false,
      embedding_model: '@cf/baai/bge-m3',
      detected_dimensions: 37,
      index_ready: false,
      index_name: 'elementera-coast-memory-v1',
      binding_name: 'COAST_MEMORY_VECTOR',
      pending_count: memoryEntries.length,
      ready_count: 0,
      error_count: 0,
    });
  }
  if (url.pathname === '/api/memory/search') {
    const query = String(body.query || '').toLowerCase();
    const entries = memoryEntries.filter((entry) => !entry.deleted_at
      && entry.scope === body.scope
      && (body.scope !== 'conversation' || entry.conversation_id === body.conversation_id)
      && (!body.entry_type || entry.entry_type === body.entry_type)
      && (!body.status || entry.status === body.status)
      && (!query || `${entry.title} ${entry.life_core} ${entry.content}`.toLowerCase().includes(query)));
    return response({ ok: true, entries, trace: { vector_enabled: false, candidates: { vector: 0, keyword: entries.length }, selected: entries.map((entry) => entry.id), reasons: {} } });
  }
  if (url.pathname === '/api/memory/entries') {
    if (method === 'POST') {
      const entry = { id: `entry-${memoryEntries.length + 1}`, embedding_status: 'pending', memory_level: 'ordinary', ...body };
      memoryEntries.unshift(entry);
      return response({ ok: true, entry }, 201);
    }
    const scope = url.searchParams.get('scope');
    const conversationId = url.searchParams.get('conversation_id');
    const type = url.searchParams.get('entry_type');
    const status = url.searchParams.get('status');
    const query = (url.searchParams.get('q') || '').toLowerCase();
    const entries = memoryEntries.filter((entry) => !entry.deleted_at
      && (!scope || entry.scope === scope)
      && (scope !== 'conversation' || entry.conversation_id === conversationId)
      && (!type || entry.entry_type === type)
      && (!status || entry.status === status)
      && (!query || `${entry.title} ${entry.life_core} ${entry.content}`.toLowerCase().includes(query)));
    return response({ ok: true, entries, next_cursor: null });
  }
  if (url.pathname.startsWith('/api/memory/entries/')) {
    const id = decodeURIComponent(url.pathname.split('/').at(-1));
    const entry = memoryEntries.find((item) => item.id === id);
    if (method === 'DELETE') {
      entry.deleted_at = now();
      return response({ ok: true, entry, deleted: true });
    }
    if (method === 'PATCH' && entry.scope === 'global' && body.scope === 'conversation') {
      const copy = { ...entry, ...body, id: `entry-${memoryEntries.length + 1}`, promoted_from_id: entry.id };
      memoryEntries.unshift(copy);
      return response({ ok: true, entry: copy, copied: true });
    }
    Object.assign(entry, body);
    if (entry.scope === 'global') entry.conversation_id = null;
    return response({ ok: true, entry, copied: false });
  }
  if (url.pathname === '/api/models') {
    const models = [
      { id: 'openai/gpt-4.1-nano', name: 'GPT-4.1 Nano' },
      { id: 'openai/o3', name: 'o3' },
      { id: 'openai/gpt-4o', name: 'GPT-4o' },
      { id: 'openai/gpt-5.2', name: 'GPT-5.2' },
    ].map((model) => ({ ...model, is_free: false, available: true, supported_parameters: ['temperature'], pricing: { prompt: '0', completion: '0' } }));
    const free = { id: 'nvidia/nemotron-3-super-120b-a12b:free', name: 'Nemotron Super', is_free: true, available: true, supported_parameters: [], pricing: { prompt: '0', completion: '0' } };
    return response({ ok: true, groups: { openai_chat: models, openai_image: [], free_test: [free] }, defaults: { chat: models[0].id, image: '', free: free.id }, updated_at: now() });
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
assert.equal(document.querySelector('#newChatButton svg').getAttribute('viewBox'), '0 0 32 32');
assert.equal(document.querySelector('[data-action="settings:wolf"] svg').getAttribute('viewBox'), '0 0 128 128');
assert.equal(document.querySelector('#modelName').textContent, '4.1 Nano ›');

const input = document.querySelector('#promptInput');
for (const options of [
  { key: 'Enter' },
  { key: 'Enter', shiftKey: true },
  { key: 'Enter', isComposing: true },
]) {
  const event = new window.KeyboardEvent('keydown', { ...options, bubbles: true, cancelable: true });
  assert.equal(input.dispatchEvent(event), true, 'Enter must retain the textarea native newline behavior');
  assert.equal(event.defaultPrevented, false);
}
await tick();
assert.equal(formalChatRequests, 0, 'keyboard input must not submit chat');
assert.equal(input.style.overflowY, 'hidden', 'an empty composer must not show a scrollbar beside the microphone');
document.querySelector('#imageButton').click();
await tick();
assert.equal(document.querySelector('#toastRoot').textContent, '图片消息还没接入。本轮主聊天先支持文字、思维壤与记忆。');
document.querySelector('#micButton').click();
await tick();
assert.equal(document.querySelector('#toastRoot').textContent, '语音输入还没接入。');
document.querySelector('#composerActionButton').click();
await tick();
assert.equal(document.querySelector('#toastRoot').textContent, '通话模式还没接入。先输入文字或选择模型聊天。');
input.value = 'a1';
input.dispatchEvent(new window.Event('input', { bubbles: true }));
document.querySelector('#composerActionButton').click();
await waitFor(() => document.querySelector('.message.assistant')?.textContent.includes('mock: a1'), 'assistant reply');
assert.equal(formalChatRequests, 1, 'the existing right-hand button still submits chat');
assert.equal(formalChatBodies[0].conversation_id, 'conv-1');
await waitFor(() => document.querySelector('.thought-soil-entry')?.textContent.includes('1 粒手持种'), 'thought soil entry');
document.querySelector('.thought-soil-entry').click();
await waitFor(() => document.querySelector('#overlayRoot')?.dataset.route === 'thought-soil', 'thought soil route');
assert.ok(document.querySelector('#overlayRoot').textContent.includes('勿复读'));
document.querySelector('[data-action="memory:done"]').click();
await tick();
assert.equal(document.querySelectorAll('.message.user .action-button').length, 2);
assert.equal(document.querySelectorAll('.message.assistant .action-button').length, 5);
assert.equal(document.querySelectorAll('.message .action-button svg').length, 7);
assert.deepEqual(
  [...document.querySelectorAll('.message .action-button svg')].map((svg) => svg.getAttribute('viewBox')),
  Array(7).fill('0 0 32 32'),
);

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
assert.ok(formalChatBodies[1].recent_entry_ids.includes('mock-memory-1'), 'the next turn must carry cooldown ids, not memory contents');
assert.equal(document.querySelectorAll('.message.assistant').length, 1);
document.querySelector('.message.assistant').dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
await waitFor(() => document.querySelector('#overlayRoot')?.dataset.route === 'memory-pocket-action', 'message pocket action');
assert.ok(document.querySelector('#overlayRoot').textContent.includes('落袋只进入待确认袋，不会自动写入记忆。'));
document.querySelector('[data-action="memory:pocket-save"][data-source="assistant"]').click();
await waitFor(() => memoryPockets.length === 1, 'active assistant pocket');
assert.equal(memoryPockets[0].source_text, 'mock: a1 edited');
assert.equal(memoryPockets[0].source_ref.user_variant, 1);
assert.equal(memoryPockets[0].source_ref.role, 'assistant');
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

document.querySelector('[data-action="memory:open"]').click();
await waitFor(() => document.querySelector('#overlayRoot')?.dataset.route === 'memory', 'memory owner route');
assert.ok(document.querySelector('#overlayRoot').textContent.includes('当前窗口种子'));
document.querySelector('[data-action="memory:pockets"]').click();
await waitFor(() => document.querySelector('#overlayRoot')?.dataset.route === 'memory-pockets', 'pending pocket route');
document.querySelector('[data-action="memory:pocket-resolve"][data-destination="conversation_seed"]').click();
await waitFor(() => memoryPockets[0].status === 'confirmed', 'resolve pocket to conversation seed');
document.querySelector('[data-action="router:back"]').click();
await waitFor(() => document.querySelector('#overlayRoot')?.dataset.route === 'memory', 'return to memory library');
assert.ok(document.querySelector('.memory-entry-card')?.textContent.includes('mock: a1 edited'));
document.querySelector('.memory-entry-card [data-action="memory:entry-promote"]').click();
await waitFor(() => memoryEntries[0].scope === 'global', 'promote entry to global library');
document.querySelector('[data-action="memory:tab"][data-scope="global"]').click();
await waitFor(() => document.querySelector('[data-action="memory:tab"][data-scope="global"]').classList.contains('is-active'), 'global memory tab');
assert.ok(document.querySelector('.memory-entry-card'));
document.querySelector('.memory-entry-card [data-action="memory:entry-copy-current"]').click();
await waitFor(() => memoryEntries.some((entry) => entry.promoted_from_id === memoryEntries.find((item) => item.scope === 'global')?.id), 'copy global entry to current window');
document.querySelector('[data-action="memory:entry-new"]').click();
await waitFor(() => document.querySelector('#overlayRoot')?.dataset.route === 'memory-entry-edit', 'manual memory editor');
document.querySelector('[name="title"]').value = '总库家具';
document.querySelector('[name="life_core"]').value = '只在明确相关时递入';
document.querySelector('[data-submit="memory:entry-save"]').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await waitFor(() => document.querySelector('#overlayRoot')?.dataset.route === 'memory', 'manual memory saved');
assert.ok(memoryEntries.some((entry) => entry.title === '总库家具' && entry.scope === 'global'));
document.querySelector('[data-action="router:back"]').click();
await tick();

document.querySelector('[data-action="settings:wolf"]').click();
await waitFor(() => document.querySelector('#overlayRoot')?.dataset.route === 'wolf', 'wolf settings route');
document.querySelector('[data-action="tools:run-control"]').click();
await waitFor(() => document.querySelector('#overlayRoot')?.dataset.route === 'run-control', 'API cottage route');
for (const label of ['上下文预算（粗略）', '思维壤预算', '思维壤自动整理间隔', '手持种上限', '种子冷却轮数', '没东西聊时当前种子上限', '当前窗口种子召回上限', '总记忆召回上限', '查看向量状态']) {
  assert.ok(document.querySelector('#overlayRoot').textContent.includes(label));
}
for (const [name, value] of [
  ['seedCooldownTurns', '0'],
  ['conversationSeedStallLimit', '6'],
  ['autoRefreshEveryTurns', '5'],
  ['maxHandSeeds', '3'],
]) {
  const control = document.querySelector(`[name="${name}"]`);
  assert.ok(control, `${name} control must exist`);
  control.value = value;
  control.dispatchEvent(new window.Event('input', { bubbles: true }));
}
document.querySelector('[data-action="tools:vector-status"]').click();
await waitFor(() => document.querySelector('#overlayRoot')?.dataset.route === 'memory-vector-status', 'vector status route');
assert.ok(document.querySelector('#overlayRoot').textContent.includes('37'));
assert.ok(document.querySelector('#overlayRoot').textContent.includes('未连接'));
for (const route of ['run-control', 'wolf']) {
  document.querySelector('[data-action="router:back"]').click();
  await waitFor(() => document.querySelector('#overlayRoot')?.dataset.route === route, `back to ${route}`);
}
document.querySelector('[data-action="router:back"]').click();
await tick();

document.querySelector('#modelButton').click();
await waitFor(() => !document.querySelector('#modelQuickPicker').hidden, 'model quick picker');
assert.ok(document.querySelectorAll('#modelQuickPicker [data-action="models:quick-select"]').length >= 2);
document.querySelector('#modelQuickPicker [data-action="models:open"]').click();
await waitFor(() => document.querySelector('#overlayRoot')?.dataset.route === 'models', 'models route');
assert.ok(document.querySelectorAll('.model-row').length >= 2);
const catalogHeadings = [...document.querySelectorAll('.feature-group > h2')].map((heading) => heading.textContent);
assert.ok(catalogHeadings.indexOf('o 系列') < catalogHeadings.indexOf('GPT-4 系列'));
assert.ok(catalogHeadings.indexOf('GPT-4 系列') < catalogHeadings.indexOf('GPT-5 系列'));
const searchInput = document.querySelector('[data-input="models:search-draft"]');
searchInput.value = '5.2';
searchInput.dispatchEvent(new window.Event('input', { bubbles: true }));
assert.equal(document.querySelector('[data-input="models:search-draft"]'), searchInput, 'typing must not rerender the model page');
document.querySelector('[data-submit="models:search"]').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await waitFor(() => document.querySelector('.feature-group > h2')?.ownerDocument.body.textContent.includes('GPT-5.2'), 'model search');
assert.equal(document.querySelectorAll('[data-action="models:add"][data-id="openai/gpt-5.2"]').length, 1);
const modelBody = document.querySelector('.feature-body');
modelBody.scrollTop = 320;
document.querySelector('[data-action="models:add"][data-id="openai/gpt-5.2"]').click();
await waitFor(() => profile.model_box.chat.includes('openai/gpt-5.2'), 'add model');
assert.equal(document.querySelector('.feature-body').scrollTop, 320);
assert.equal(document.querySelector('#toastRoot').textContent, '模型已添加');
document.querySelector('[data-action="router:back"]').click();
await tick();
document.querySelector('#modelButton').click();
await waitFor(() => !document.querySelector('#modelQuickPicker').hidden, 'updated quick picker');
const quickFive = document.querySelector('#modelQuickPicker [data-action="models:quick-select"][data-id="openai/gpt-5.2"]');
assert.ok(quickFive);
quickFive.click();
await waitFor(() => document.querySelector('#modelName').textContent === '5.2 ›', 'quick model switch');
assert.equal(document.querySelector('#modelQuickPicker').hidden, true);

document.querySelector('[data-action="daily:home"]').click();
await waitFor(() => document.querySelector('#overlayRoot')?.dataset.route === 'daily-home', 'daily route');
assert.equal(document.querySelectorAll('.daily-grid button').length, 5);
document.querySelector('[data-action="daily:moments"]').click();
await waitFor(() => document.querySelector('#overlayRoot')?.dataset.route === 'moments', 'moments route');
assert.ok(document.querySelector('.moment-profile > div h2'));
assert.equal(document.querySelector('.moment-feed > .feature-card'), null);
document.querySelector('[data-action="daily:moments-compose"]').click();
await waitFor(() => document.querySelector('#overlayRoot')?.dataset.route === 'moments-compose', 'moments composer');
assert.equal(document.querySelector('.image-picker b'), null);
assert.equal(document.querySelector('.moment-compose-text').closest('.feature-body') !== null, true);
document.querySelector('[data-action="router:back"]').click();
await tick();

document.querySelector('#moreButton').click();
await waitFor(() => document.querySelector('#overlayRoot')?.dataset.route === 'island-letter', 'letter route');
assert.ok(document.querySelector('#islandLetterText').value.includes('欢迎回家'));
assert.equal(document.querySelector('[data-action="letters:send-island"]').textContent, '递出登岛信');
const visibleUsersBeforeLetter = document.querySelectorAll('.message.user').length;
const assistantsBeforeLetter = document.querySelectorAll('.message.assistant').length;
document.querySelector('[data-action="letters:send-island"]').click();
await waitFor(() => document.querySelector('#overlayRoot').hidden, 'landing letter response closes panel');
await waitFor(() => document.querySelectorAll('.message.assistant').length === assistantsBeforeLetter + 1, 'landing assistant reply');
await waitFor(() => soilOrganizeBodies.some((item) => item.trigger === 'landing'), 'landing soil refresh');
const landingSoil = soilOrganizeBodies.findLast((item) => item.trigger === 'landing');
assert.deepEqual(landingBodies.at(-1).recent_entry_ids, [], 'zero cooldown must send no cooldown ids');
assert.equal(landingSoil.settings.seedCooldownTurns, 0);
assert.equal(landingSoil.settings.conversationSeedStallLimit, 6);
assert.equal(landingSoil.settings.autoRefreshEveryTurns, 5);
assert.equal(landingSoil.settings.maxHandSeeds, 3);
assert.equal(document.querySelectorAll('.message.user').length, visibleUsersBeforeLetter, 'hidden landing input must not render a user bubble');
assert.ok(document.querySelector('.message.assistant:last-of-type')?.textContent.includes('我把登岛信读完了。'));
const landingTurn = histories.get('conv-1').turns.at(-1);
assert.equal(landingTurn.turn_type, 'landing');
assert.equal(landingTurn.user.variants[0].hidden, true);
document.querySelector('#moreButton').click();
await waitFor(() => document.querySelector('[data-action="letters:send-island"]'), 'reopen letter route');
assert.equal(document.querySelector('[data-action="letters:send-island"]').textContent, '重新递出登岛信');
document.querySelector('[data-action="router:back"]').click();
await tick();

document.querySelector('[data-action="rooms:open"][data-kind="radio"]').click();
await waitFor(() => document.querySelector('#overlayRoot')?.dataset.route === 'local-room', 'room route');
document.querySelector('#localRoomInput').value = 'radio test';
document.querySelector('.local-room-composer').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await waitFor(() => document.querySelector('.local-message-list')?.textContent.includes('radio test'), 'local room send');

console.log('dom: ok');

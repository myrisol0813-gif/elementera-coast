(() => {
  if (window.__elementeraModelBoxP303A) return;
  window.__elementeraModelBoxP303A = true;

  const CHAT_KEY = 'gpt_like_test_window_messages_clean_v1';
  const AVATAR_KEY = 'gpt_like_assistant_avatar_dataurl_v1';
  const OLD_MODEL_LABEL_KEY = 'wolf_model_v092';
  const CATALOG_KEY = 'ec.modelCatalog.cache';
  const MODEL_BOX_KEY = 'ec.modelBox.v1';
  const CURRENT_CHAT_KEY = 'ec.currentChatModel';
  const CURRENT_IMAGE_KEY = 'ec.currentImageModel';
  const DEFAULT_FREE = [
    'nvidia/nemotron-3-super-120b-a12b:free',
    'nvidia/nemotron-3-ultra-550b-a55b:free',
  ];

  const q = (selector, root = document) => root.querySelector(selector);
  const qa = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const id = () => crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
  const html = (text) => esc(text).split(/\n{2,}/).map((part) => `<p>${part.replace(/\n/g, '<br>')}</p>`).join('');

  let catalogState = null;
  let chatAbort = null;
  let loadingId = null;

  function installCss() {
    if (q('#modelBoxP303AStyle')) return;
    const style = document.createElement('style');
    style.id = 'modelBoxP303AStyle';
    style.textContent = `.model-box-p303a .mb-note{margin:0 0 16px;color:var(--muted);font-size:13px;line-height:1.6}.model-box-p303a .mb-toolbar{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;margin-bottom:14px}.model-box-p303a .mb-toolbar input{min-height:44px;border:1px solid var(--line);border-radius:16px;background:var(--bg);color:var(--text);padding:10px 13px;font-size:15px;outline:0}.model-box-p303a button{color:var(--text)}.model-box-p303a .mb-refresh,.model-box-p303a .mb-chip{min-height:42px;border:1px solid var(--line);border-radius:999px;background:transparent;padding:8px 13px}.model-box-p303a .mb-list{display:grid}.model-box-p303a .mb-model{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;padding:14px 16px;border-bottom:1px solid var(--line)}.model-box-p303a .mb-model:last-child{border-bottom:0}.model-box-p303a .mb-model strong{display:block;font-size:15px;color:var(--text);letter-spacing:-.02em}.model-box-p303a .mb-model code{display:block;margin-top:4px;color:var(--muted);font-size:12px;white-space:normal;word-break:break-word;overflow-wrap:anywhere}.model-box-p303a .mb-model small{display:block;margin-top:6px;color:var(--muted);font-size:12px;line-height:1.45}.model-box-p303a .mb-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:7px}.model-box-p303a .mb-actions button{min-height:34px;border:1px solid var(--line);border-radius:999px;background:transparent;padding:6px 10px;font-size:12px}.model-box-p303a .mb-actions button.is-current{border-color:var(--call);box-shadow:0 0 0 1px color-mix(in srgb,var(--call) 30%,transparent)}.model-box-p303a .mb-status{margin:0 0 12px;color:var(--muted);font-size:12px;line-height:1.5}.model-box-p303a .mb-empty{padding:16px;color:var(--muted);font-size:13px;line-height:1.6}.model-box-entry-p303a small{line-height:1.35}`;
    document.head.appendChild(style);
  }

  function loadJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value ?? fallback;
    } catch {
      return fallback;
    }
  }

  function saveJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function loadMessages() {
    const fallback = [];
    return loadJson(CHAT_KEY, fallback).filter((item) => item && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string').map((item) => ({ id: item.id || id(), role: item.role, content: item.content }));
  }

  function saveMessages(items) {
    saveJson(CHAT_KEY, items);
  }

  function loadBox() {
    const box = loadJson(MODEL_BOX_KEY, null);
    return box && Array.isArray(box.chat) ? box : { chat: [], free: [...DEFAULT_FREE], image: [] };
  }

  function saveBox(box) {
    saveJson(MODEL_BOX_KEY, box);
  }

  function modelById(modelId, catalog = catalogState) {
    const groups = catalog?.groups || {};
    return [...(groups.openai_chat || []), ...(groups.openai_image || []), ...(groups.free_test || [])].find((model) => model.id === modelId) || null;
  }

  function modelName(modelId, catalog = catalogState) {
    const model = modelById(modelId, catalog);
    return model?.name || modelId || '未选择模型';
  }

  function priceText(model) {
    const pricing = model?.pricing || {};
    const prompt = pricing.prompt ?? '?';
    const completion = pricing.completion ?? '?';
    return `prompt ${prompt} / completion ${completion}`;
  }

  function tagText(model) {
    const tags = Array.isArray(model?.supported_parameters) ? model.supported_parameters.slice(0, 5) : [];
    if (model?.is_free) tags.unshift('free');
    if (!model?.available) tags.unshift('unavailable');
    return tags.length ? tags.join(' · ') : 'no tags';
  }

  function normalizeBox(catalog) {
    const box = loadBox();
    const chat = new Set(box.chat || []);
    const free = new Set(box.free || []);
    const image = new Set(box.image || []);
    if (catalog?.defaults?.chat) chat.add(catalog.defaults.chat);
    DEFAULT_FREE.forEach((model) => free.add(model));
    if (catalog?.defaults?.image) image.add(catalog.defaults.image);
    const next = { chat: [...chat], free: [...free], image: [...image] };
    if (!localStorage.getItem(CURRENT_CHAT_KEY)) {
      localStorage.setItem(CURRENT_CHAT_KEY, next.chat[0] || DEFAULT_FREE[0]);
    }
    if (!localStorage.getItem(CURRENT_IMAGE_KEY) && next.image[0]) {
      localStorage.setItem(CURRENT_IMAGE_KEY, next.image[0]);
    }
    saveBox(next);
    return next;
  }

  async function fetchCatalog(force = false) {
    if (!force) {
      const cached = loadJson(CATALOG_KEY, null);
      if (cached?.ok && cached?.updated_at) {
        const age = Date.now() - Date.parse(cached.updated_at);
        if (Number.isFinite(age) && age < 10 * 60 * 1000) {
          catalogState = cached;
          normalizeBox(cached);
          return cached;
        }
      }
    }
    const res = await fetch(`/api/models${force ? '?refresh=1' : ''}`, { credentials: 'same-origin', cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw new Error(data.error || `models ${res.status}`);
    catalogState = data;
    saveJson(CATALOG_KEY, data);
    normalizeBox(data);
    updateTopModelLabel();
    return data;
  }

  function updateTopModelLabel() {
    const current = localStorage.getItem(CURRENT_CHAT_KEY) || '';
    const label = current ? `${modelName(current)} ›` : '模型箱 ›';
    localStorage.setItem(OLD_MODEL_LABEL_KEY, label);
    const node = q('.model-name');
    if (node) node.textContent = label;
  }

  function group(title, body) {
    return `<section class="clean-group"><h2>${esc(title)}</h2><div class="clean-card">${body}</div></section>`;
  }

  function modelRow(modelId, where, actionMode = 'box') {
    const model = modelById(modelId) || { id: modelId, name: modelId, is_free: modelId.includes(':free'), available: true, supported_parameters: [], pricing: null };
    const current = localStorage.getItem(CURRENT_CHAT_KEY) === modelId;
    const canSet = where !== 'image';
    const actions = [];
    if (actionMode === 'catalog') actions.push(`<button type="button" data-mb-add="${esc(modelId)}" data-mb-kind="${esc(where)}">加入</button>`);
    if (actionMode === 'box' && canSet) actions.push(`<button type="button" class="${current ? 'is-current' : ''}" data-mb-current="${esc(modelId)}">${current ? '当前' : '设为当前'}</button>`);
    if (actionMode === 'box') actions.push(`<button type="button" data-mb-remove="${esc(modelId)}" data-mb-kind="${esc(where)}">移除</button>`);
    return `<article class="mb-model"><span><strong>${esc(model.name || modelId)}</strong><code>${esc(modelId)}</code><small>${esc([`ctx ${model.context_length ?? '?'}`, priceText(model), tagText(model)].join(' · '))}</small></span><span class="mb-actions">${actions.join('')}</span></article>`;
  }

  function currentBoxHtml() {
    const box = loadBox();
    const chatRows = (box.chat || []).map((id) => modelRow(id, 'chat', 'box')).join('') || '<p class="mb-empty">还没有常驻 OpenAI chat 模型。刷新目录后会自动加入推荐默认项。</p>';
    const freeRows = (box.free || []).map((id) => modelRow(id, 'free', 'box')).join('') || '<p class="mb-empty">还没有免费测试模型。</p>';
    const imageRows = (box.image || []).map((id) => modelRow(id, 'image', 'box')).join('') || '<p class="mb-empty">当前目录没有 GPT Image 2 / GPT Image 1。</p>';
    return group('当前聊天模型', `<div class="mb-list">${modelRow(localStorage.getItem(CURRENT_CHAT_KEY) || '', 'chat', 'box')}</div>`) + group('常驻 OpenAI Chat', `<div class="mb-list">${chatRows}</div>`) + group('免费测试模型', `<div class="mb-list">${freeRows}</div>`) + group('生图模型 · 仅保存', `<div class="mb-list">${imageRows}</div>`);
  }

  function catalogHtml(search = '') {
    const text = search.trim().toLowerCase();
    const openai = (catalogState?.groups?.openai_chat || []).filter((model) => !text || `${model.name} ${model.id}`.toLowerCase().includes(text)).slice(0, 60);
    const free = (catalogState?.groups?.free_test || []).filter((model) => !text || `${model.name} ${model.id}`.toLowerCase().includes(text)).slice(0, 30);
    const openaiRows = openai.map((model) => modelRow(model.id, 'chat', 'catalog')).join('') || '<p class="mb-empty">没有匹配的 OpenAI chat 模型。</p>';
    const freeRows = free.map((model) => modelRow(model.id, 'free', 'catalog')).join('') || '<p class="mb-empty">没有匹配的免费模型。</p>';
    return group('OpenAI Chat 目录', `<div class="mb-list">${openaiRows}</div>`) + group('免费测试目录', `<div class="mb-list">${freeRows}</div>`);
  }

  function panelHtml(search = '') {
    const updated = catalogState?.updated_at || '未刷新';
    return `<header class="clean-head"><button class="clean-back" type="button" data-mb-back>←</button><div><h1>模型箱</h1><p>OpenAI chat · Free test · GPT Image</p></div></header><main class="clean-body"><p class="mb-note">模型目录来自 Cloudflare /api/models。常驻模型箱只保存模型 id 和轻量目录缓存；不会保存 API key。</p><p class="mb-status">updated_at: ${esc(updated)} · 当前 chat: ${esc(localStorage.getItem(CURRENT_CHAT_KEY) || '未选择')}</p><div class="mb-toolbar"><input id="modelBoxSearchP303A" type="search" placeholder="搜索 OpenAI chat 模型" value="${esc(search)}"><button class="mb-refresh" type="button" data-mb-refresh>刷新目录</button></div>${currentBoxHtml()}${catalogHtml(search)}</main>`;
  }

  function openModelBox(search = '') {
    installCss();
    let panel = q('#modelBoxPanelP303A');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'modelBoxPanelP303A';
      panel.className = 'clean-panel model-box-p303a';
      document.body.appendChild(panel);
    }
    panel.hidden = false;
    panel.innerHTML = panelHtml(search);
    q('#cleanWolfV093')?.setAttribute('hidden', '');
    q('#cleanDeskV093')?.setAttribute('hidden', '');
    q('#modelPickerV093')?.setAttribute('hidden', '');
    document.body.classList.add('wolf-open');
    if (!catalogState) {
      fetchCatalog(false).then(() => openModelBox(search)).catch((error) => {
        const body = q('.clean-body', panel);
        if (body) body.insertAdjacentHTML('afterbegin', `<p class="mb-note">模型目录读取失败：${esc(error.message || error)}</p>`);
      });
    }
  }

  function closeModelBox() {
    const panel = q('#modelBoxPanelP303A');
    if (panel) panel.hidden = true;
    q('#cleanWolfV093')?.removeAttribute('hidden');
  }

  function addEntry(panelId, groupName, title, sub, source) {
    const panel = q(panelId);
    if (!panel || q(`[data-mb-entry="${source}"]`, panel)) return;
    const section = qa('.clean-group', panel).find((item) => (q('h2', item)?.textContent || '').includes(groupName));
    const card = section && q('.clean-card', section);
    if (!card) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'clean-row model-box-entry-p303a';
    button.dataset.mbEntry = source;
    button.innerHTML = `<span><strong>${esc(title)}</strong><small>${esc(sub)}</small></span>`;
    card.appendChild(button);
  }

  function ensureEntries() {
    installCss();
    addEntry('#cleanWolfV093', '账户', '模型箱', 'OpenAI chat / free test / GPT Image', 'wolf');
    addEntry('#cleanDeskV093', '施工', '模型箱', '正式线模型目录与当前模型', 'desk');
  }

  function setCurrentModel(modelId) {
    if (!modelId) return;
    localStorage.setItem(CURRENT_CHAT_KEY, modelId);
    updateTopModelLabel();
    openModelBox(q('#modelBoxSearchP303A')?.value || '');
  }

  function addToBox(modelId, kind) {
    const box = loadBox();
    const key = kind === 'free' ? 'free' : kind === 'image' ? 'image' : 'chat';
    box[key] = Array.from(new Set([...(box[key] || []), modelId]));
    saveBox(box);
    if (key === 'chat' && !localStorage.getItem(CURRENT_CHAT_KEY)) setCurrentModel(modelId);
    else openModelBox(q('#modelBoxSearchP303A')?.value || '');
  }

  function removeFromBox(modelId, kind) {
    const box = loadBox();
    const key = kind === 'free' ? 'free' : kind === 'image' ? 'image' : 'chat';
    if (key === 'chat' && (box.chat || []).length <= 1) {
      alert('至少保留一个聊天模型。');
      return;
    }
    box[key] = (box[key] || []).filter((item) => item !== modelId);
    if (localStorage.getItem(CURRENT_CHAT_KEY) === modelId) localStorage.setItem(CURRENT_CHAT_KEY, box.chat[0] || DEFAULT_FREE[0]);
    saveBox(box);
    updateTopModelLabel();
    openModelBox(q('#modelBoxSearchP303A')?.value || '');
  }

  function avatar() {
    const url = localStorage.getItem(AVATAR_KEY) || '';
    return `<div class="avatar ${url ? 'has-custom-avatar' : ''}" role="button" tabindex="0" ${url ? `style="background-image:url(${url})"` : ''}>${url ? '' : '⌁'}</div>`;
  }

  function actionButton(name, title, extra = '') {
    return `<button class="action-button" type="button" data-action="${esc(name)}" ${extra} title="${esc(title)}"></button>`;
  }

  function renderChat(items) {
    const box = q('#messages');
    const scroller = q('#messageScroller');
    if (!box) return;
    box.innerHTML = items.map((message) => {
      if (message.role === 'user') {
        return `<article class="message user" data-id="${esc(message.id)}"><div class="content"><div class="user-bubble">${esc(message.content)}</div><div class="user-actions" data-user-actions-for="${esc(message.id)}">${actionButton('edit','编辑','data-user-act="edit"')}${actionButton('delete','删除','data-user-act="remove"')}</div></div></article>`;
      }
      return `<article class="message assistant" data-id="${esc(message.id)}">${avatar()}<div class="content"><div class="assistant-text">${html(message.content)}${message.id === loadingId ? '<span class="typing-cursor"></span>' : ''}</div><div class="assistant-actions" data-actions-for="${esc(message.id)}">${actionButton('copy','复制')}${actionButton('like','点赞')}${actionButton('refresh','重新生成')}${actionButton('favorite','收藏')}${actionButton('delete','删除')}</div></div></article>`;
    }).join('') + '<div class="thread-spacer"></div>';
    requestAnimationFrame(() => { if (scroller) scroller.scrollTop = scroller.scrollHeight; });
    saveMessages(items);
  }

  function setBusy(isBusy) {
    const call = q('#callButton');
    const mic = q('#micButton');
    if (!call) return;
    if (isBusy) {
      call.dataset.icon = 'stop';
      call.setAttribute('aria-label', '停止生成');
      if (mic) mic.hidden = true;
    } else {
      call.dataset.icon = 'call';
      call.setAttribute('aria-label', '通话');
      if (mic && !(q('#promptInput')?.value || '').trim()) mic.hidden = false;
    }
  }

  function chatSettings() {
    const settings = window.elementeraRunControl?.getSettings?.() || {};
    const maxTokens = settings.outputLength === 'short' ? 350 : settings.outputLength === 'long' ? 1200 : 600;
    const temperature = settings.creativity === 'stable' ? 0.3 : settings.creativity === 'expansive' ? 1.0 : 0.7;
    const recentTurns = Number(settings.recentTurns || 8);
    return { max_tokens: maxTokens, temperature, recentTurns };
  }

  function recentMessages(items, recentTurns) {
    const limit = Math.min(20, Math.max(2, Number(recentTurns || 8) * 2));
    return items.filter((item) => ['user', 'assistant'].includes(item.role) && item.content.trim()).slice(-limit).map((item) => ({ role: item.role, content: item.content }));
  }

  async function ensureCurrentModel() {
    const current = localStorage.getItem(CURRENT_CHAT_KEY);
    if (current) return current;
    try {
      const catalog = await fetchCatalog(false);
      return catalog.defaults?.chat || DEFAULT_FREE[0];
    } catch {
      localStorage.setItem(CURRENT_CHAT_KEY, DEFAULT_FREE[0]);
      return DEFAULT_FREE[0];
    }
  }

  async function sendChat(prompt) {
    const input = q('#promptInput');
    const items = loadMessages();
    items.push({ id: id(), role: 'user', content: prompt });
    const assistant = { id: id(), role: 'assistant', content: '正在通过海岸 API 连接当前模型……' };
    items.push(assistant);
    loadingId = assistant.id;
    if (input) {
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    setBusy(true);
    renderChat(items);

    const settings = chatSettings();
    const model = await ensureCurrentModel();
    chatAbort = new AbortController();
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        signal: chatAbort.signal,
        body: JSON.stringify({
          model,
          messages: recentMessages(items.filter((item) => item.id !== assistant.id), settings.recentTurns),
          settings: { max_tokens: settings.max_tokens, temperature: settings.temperature },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        assistant.content = `请求失败：${data.error || res.status}`;
      } else {
        assistant.content = data?.message?.content || '模型没有返回文本。';
      }
    } catch (error) {
      assistant.content = error?.name === 'AbortError' ? '已停止生成。' : `请求失败：${error?.message || error}`;
    } finally {
      chatAbort = null;
      loadingId = null;
      setBusy(false);
      renderChat(items);
    }
  }

  function stopChat() {
    if (chatAbort) chatAbort.abort();
  }

  function installChatAdapter() {
    const form = q('#composer');
    const input = q('#promptInput');
    const call = q('#callButton');
    if (!form || !input || form.dataset.p303aChatAdapter) return;
    form.dataset.p303aChatAdapter = '1';
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const text = (input.value || '').trim();
      if (chatAbort) return stopChat();
      if (!text) return;
      sendChat(text);
    }, true);
    call?.addEventListener('click', (event) => {
      if (chatAbort) {
        event.preventDefault();
        event.stopImmediatePropagation();
        stopChat();
      }
    }, true);
  }

  document.addEventListener('click', async (event) => {
    if (event.target.closest('#modelButton') || event.target.closest('[data-mb-entry]')) {
      event.preventDefault();
      event.stopPropagation();
      openModelBox();
      return;
    }
    const ca = event.target.closest('[data-ca]')?.dataset.ca;
    if (ca === 'w-models' || ca === 'w-current') {
      event.preventDefault();
      event.stopPropagation();
      openModelBox();
      return;
    }
    if (event.target.closest('[data-mb-back]')) {
      event.preventDefault();
      event.stopPropagation();
      closeModelBox();
      return;
    }
    if (event.target.closest('[data-mb-refresh]')) {
      event.preventDefault();
      event.stopPropagation();
      const panel = q('#modelBoxPanelP303A .clean-body');
      if (panel) panel.insertAdjacentHTML('afterbegin', '<p class="mb-note">正在刷新模型目录……</p>');
      try { await fetchCatalog(true); openModelBox(q('#modelBoxSearchP303A')?.value || ''); }
      catch (error) { alert(`刷新失败：${error.message || error}`); }
      return;
    }
    const add = event.target.closest('[data-mb-add]');
    if (add) {
      event.preventDefault();
      event.stopPropagation();
      addToBox(add.dataset.mbAdd, add.dataset.mbKind || 'chat');
      return;
    }
    const current = event.target.closest('[data-mb-current]');
    if (current) {
      event.preventDefault();
      event.stopPropagation();
      setCurrentModel(current.dataset.mbCurrent);
      return;
    }
    const remove = event.target.closest('[data-mb-remove]');
    if (remove) {
      event.preventDefault();
      event.stopPropagation();
      removeFromBox(remove.dataset.mbRemove, remove.dataset.mbKind || 'chat');
      return;
    }
    const userAct = event.target.closest('[data-user-act]');
    if (userAct) {
      const messageId = userAct.closest('.user-actions')?.dataset.userActionsFor;
      let items = loadMessages();
      const message = items.find((item) => item.id === messageId);
      if (!message) return;
      event.preventDefault();
      event.stopPropagation();
      if (userAct.dataset.userAct === 'edit') {
        const next = prompt('编辑消息', message.content);
        if (next != null) message.content = next;
      } else {
        items = items.filter((item) => item.id !== messageId);
      }
      renderChat(items);
      return;
    }
    const assistantAction = event.target.closest('.assistant-actions .action-button');
    if (assistantAction) {
      const messageId = assistantAction.closest('.assistant-actions')?.dataset.actionsFor;
      let items = loadMessages();
      const message = items.find((item) => item.id === messageId);
      if (!message) return;
      const action = assistantAction.dataset.action;
      event.preventDefault();
      event.stopPropagation();
      if (action === 'copy') { await navigator.clipboard?.writeText(message.content); return; }
      if (action === 'like' || action === 'favorite') { assistantAction.classList.toggle('is-active'); return; }
      if (action === 'delete') { items = items.filter((item) => item.id !== messageId); renderChat(items); return; }
      if (action === 'refresh') { message.content = '重新生成将在下一轮接入；当前先保留正式 API 单次发送。'; renderChat(items); }
    }
  }, true);

  document.addEventListener('input', (event) => {
    if (event.target?.id === 'modelBoxSearchP303A') openModelBox(event.target.value || '');
  }, true);

  const start = () => {
    installCss();
    installChatAdapter();
    ensureEntries();
    updateTopModelLabel();
    new MutationObserver(() => { ensureEntries(); installChatAdapter(); }).observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();

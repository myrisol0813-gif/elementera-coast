(() => {
  if (window.__elementeraModelBoxP303A) return;
  window.__elementeraModelBoxP303A = true;

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

  let catalogState = null;

  function installCss() {
    if (q('#modelBoxP303AStyle')) return;
    const style = document.createElement('style');
    style.id = 'modelBoxP303AStyle';
    style.textContent = `.topbar .model-button{min-width:0;max-width:min(52vw,290px);overflow:hidden}.topbar .model-button .model-title,.topbar .model-button .model-name{display:block;min-width:0;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.topbar .topbar-actions{flex-shrink:0}.model-box-p303a .mb-note{margin:0 0 16px;color:var(--muted);font-size:13px;line-height:1.6}.model-box-p303a .mb-version{margin:-7px 0 15px;color:var(--muted);font-size:11px;opacity:.72}.model-box-p303a .mb-toolbar{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;margin-bottom:14px}.model-box-p303a .mb-toolbar input{min-width:0;min-height:44px;border:1px solid var(--line);border-radius:16px;background:var(--bg);color:var(--text);padding:10px 13px;font-size:15px;outline:0}.model-box-p303a button{color:var(--text)}.model-box-p303a .mb-refresh,.model-box-p303a .mb-chip{min-height:42px;border:1px solid var(--line);border-radius:999px;background:transparent;padding:8px 13px}.model-box-p303a .mb-list{display:grid}.model-box-p303a .mb-model{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:14px 16px;border-bottom:1px solid var(--line)}.model-box-p303a .mb-model:last-child{border-bottom:0}.model-box-p303a .mb-model strong{display:block;font-size:15px;color:var(--text);letter-spacing:-.02em}.model-box-p303a .mb-model code{display:block;margin-top:4px;color:var(--muted);font-size:12px;white-space:normal;word-break:break-word;overflow-wrap:anywhere}.model-box-p303a .mb-model small{display:block;margin-top:6px;color:var(--muted);font-size:12px;line-height:1.45}.model-box-p303a .mb-badge{display:inline-flex;margin:0 6px 0 0;padding:2px 7px;border:1px solid var(--line);border-radius:999px;color:var(--muted);font-size:11px;vertical-align:1px}.model-box-p303a .mb-badge.is-free{border-color:color-mix(in srgb,var(--call) 42%,var(--line));color:var(--text)}.model-box-p303a .mb-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:7px}.model-box-p303a .mb-actions button{min-height:34px;border:1px solid var(--line);border-radius:999px;background:transparent;padding:6px 10px;font-size:12px}.model-box-p303a .mb-actions button.is-current{border-color:var(--call);box-shadow:0 0 0 1px color-mix(in srgb,var(--call) 30%,transparent)}.model-box-p303a .mb-status{margin:0 0 12px;color:var(--muted);font-size:12px;line-height:1.5;word-break:break-word;overflow-wrap:anywhere}.model-box-p303a .mb-empty{padding:16px;color:var(--muted);font-size:13px;line-height:1.6}.model-box-entry-p303a small{line-height:1.35}@media(max-width:720px){.topbar .model-button{max-width:min(50vw,230px)}.model-box-p303a .mb-model{grid-template-columns:1fr;gap:11px;padding:15px 16px}.model-box-p303a .mb-actions{justify-content:flex-start}.model-box-p303a .mb-toolbar{grid-template-columns:1fr}.model-box-p303a .mb-refresh{border-radius:15px}.composer-wrap{padding-bottom:calc(8px + env(safe-area-inset-bottom,0px))}}`;
    document.head.appendChild(style);
  }
  function loadJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
    catch { return fallback; }
  }
  function saveJson(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  function loadBox() {
    const box = loadJson(MODEL_BOX_KEY, null);
    return box && Array.isArray(box.chat) ? box : { chat: [], free: [...DEFAULT_FREE], image: [] };
  }
  function saveBox(box) { saveJson(MODEL_BOX_KEY, box); }
  function allModels(catalog = catalogState) {
    const groups = catalog?.groups || {};
    return [...(groups.openai_chat || []), ...(groups.openai_image || []), ...(groups.free_test || [])];
  }
  function modelById(modelId, catalog = catalogState) { return allModels(catalog).find((model) => model.id === modelId) || null; }
  function modelName(modelId, catalog = catalogState) { return modelById(modelId, catalog)?.name || modelId || '未选择模型'; }
  function modelKind(modelId, model) {
    if (model?.is_free || String(modelId).includes(':free')) return 'Free';
    if (String(modelId).includes('gpt-image')) return 'Image';
    if (String(modelId).startsWith('openai/')) return 'OpenAI';
    return 'Model';
  }
  function shortModelLabel(modelId) {
    const name = modelName(modelId);
    const kind = modelKind(modelId, modelById(modelId));
    if (!modelId) return '模型箱 ›';
    if (kind === 'OpenAI') return `OpenAI: ${name} ›`;
    if (kind === 'Free') return `Free: ${name.replace(/NVIDIA\s*/i, '').replace(/ · free$/i, '')} ›`;
    return `${name} ›`;
  }
  function priceText(model) {
    const pricing = model?.pricing || {};
    return `prompt ${pricing.prompt ?? '?'} / completion ${pricing.completion ?? '?'}`;
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
    if (!localStorage.getItem(CURRENT_CHAT_KEY)) localStorage.setItem(CURRENT_CHAT_KEY, next.chat[0] || DEFAULT_FREE[0]);
    if (!localStorage.getItem(CURRENT_IMAGE_KEY) && next.image[0]) localStorage.setItem(CURRENT_IMAGE_KEY, next.image[0]);
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
          updateTopModelLabel();
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
    const label = shortModelLabel(current);
    localStorage.setItem(OLD_MODEL_LABEL_KEY, label);
    const node = q('.model-name');
    if (node) { node.textContent = label; node.title = current; }
  }
  function group(title, body) {
    return `<section class="clean-group"><h2>${esc(title)}</h2><div class="clean-card">${body}</div></section>`;
  }
  function modelRow(modelId, where, actionMode = 'box') {
    const model = modelById(modelId) || { id: modelId, name: modelId, is_free: modelId.includes(':free'), available: true, supported_parameters: [], pricing: null };
    const current = localStorage.getItem(CURRENT_CHAT_KEY) === modelId;
    const canSet = where !== 'image';
    const actions = [];
    const kind = modelKind(modelId, model);
    const badgeClass = kind === 'Free' ? ' is-free' : '';
    if (actionMode === 'catalog') actions.push(`<button type="button" data-mb-add="${esc(modelId)}" data-mb-kind="${esc(where)}">加入</button>`);
    if (actionMode === 'box' && canSet) actions.push(`<button type="button" class="${current ? 'is-current' : ''}" data-mb-current="${esc(modelId)}">${current ? '当前' : '设为当前'}</button>`);
    if (actionMode === 'box') actions.push(`<button type="button" data-mb-remove="${esc(modelId)}" data-mb-kind="${esc(where)}">移除</button>`);
    return `<article class="mb-model"><span><strong><span class="mb-badge${badgeClass}">${esc(kind)}</span>${esc(model.name || modelId)}</strong><code>${esc(modelId)}</code><small>${esc([`ctx ${model.context_length ?? '?'}`, priceText(model), tagText(model)].join(' · '))}</small></span><span class="mb-actions">${actions.join('')}</span></article>`;
  }
  function currentBoxHtml() {
    const box = loadBox();
    const current = localStorage.getItem(CURRENT_CHAT_KEY) || box.chat?.[0] || DEFAULT_FREE[0];
    const chatRows = (box.chat || []).map((id) => modelRow(id, 'chat', 'box')).join('') || '<p class="mb-empty">还没有常驻 OpenAI chat 模型。刷新目录后会自动加入推荐默认项。</p>';
    const freeRows = (box.free || []).map((id) => modelRow(id, 'free', 'box')).join('') || '<p class="mb-empty">还没有免费测试模型。</p>';
    const imageRows = (box.image || []).map((id) => modelRow(id, 'image', 'box')).join('') || '<p class="mb-empty">当前目录没有 GPT Image 2 / GPT Image 1。</p>';
    return group('当前聊天模型', `<div class="mb-list">${modelRow(current, 'chat', 'box')}</div>`) + group('常驻 OpenAI Chat', `<div class="mb-list">${chatRows}</div>`) + group('Free Test', `<div class="mb-list">${freeRows}</div>`) + group('Image model slot · 仅保存', `<div class="mb-list">${imageRows}</div>`);
  }
  function catalogHtml(search = '') {
    const text = search.trim().toLowerCase();
    const openai = (catalogState?.groups?.openai_chat || []).filter((model) => !text || `${model.name} ${model.id}`.toLowerCase().includes(text)).slice(0, 60);
    const free = (catalogState?.groups?.free_test || []).filter((model) => !text || `${model.name} ${model.id}`.toLowerCase().includes(text)).slice(0, 30);
    const openaiRows = openai.map((model) => modelRow(model.id, 'chat', 'catalog')).join('') || '<p class="mb-empty">没有匹配的 OpenAI chat 模型。</p>';
    const freeRows = free.map((model) => modelRow(model.id, 'free', 'catalog')).join('') || '<p class="mb-empty">没有匹配的免费模型。</p>';
    return group('OpenAI Chat 目录', `<div class="mb-list">${openaiRows}</div>`) + group('Free Test 目录', `<div class="mb-list">${freeRows}</div>`);
  }
  function panelHtml(search = '') {
    const updated = catalogState?.updated_at || '未刷新';
    return `<header class="clean-head"><button class="clean-back" type="button" data-mb-back>←</button><div><h1>模型箱</h1><p>OpenAI chat · Free test · GPT Image</p></div></header><main class="clean-body"><p class="mb-note">模型目录来自 Cloudflare /api/models。常驻模型箱只保存模型 id 和轻量目录缓存；不会保存 API key。</p><p class="mb-version">Panel version: p3-modelbox-restore-03</p><p class="mb-status">updated_at: ${esc(updated)} · 当前 chat: ${esc(localStorage.getItem(CURRENT_CHAT_KEY) || '未选择')}</p><div class="mb-toolbar"><input id="modelBoxSearchP303A" type="search" placeholder="搜索 OpenAI chat 模型" value="${esc(search)}"><button class="mb-refresh" type="button" data-mb-refresh>刷新目录</button></div>${currentBoxHtml()}${catalogHtml(search)}</main>`;
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
    q('#cleanDeskV093')?.removeAttribute('hidden');
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
    if (key === 'chat' && (box.chat || []).length <= 1) { alert('至少保留一个聊天模型。'); return; }
    box[key] = (box[key] || []).filter((item) => item !== modelId);
    if (localStorage.getItem(CURRENT_CHAT_KEY) === modelId) localStorage.setItem(CURRENT_CHAT_KEY, box.chat[0] || DEFAULT_FREE[0]);
    saveBox(box);
    updateTopModelLabel();
    openModelBox(q('#modelBoxSearchP303A')?.value || '');
  }

  document.addEventListener('click', async (event) => {
    if (window.__ecChatCanon02 && (event.target.closest('[data-user-act]') || event.target.closest('.assistant-actions .action-button'))) return;
    if (event.target.closest('#modelButton') || event.target.closest('[data-mb-entry]')) {
      event.preventDefault(); event.stopPropagation(); openModelBox(); return;
    }
    const ca = event.target.closest('[data-ca]')?.dataset.ca;
    if (ca === 'w-models' || ca === 'w-current') { event.preventDefault(); event.stopPropagation(); openModelBox(); return; }
    if (event.target.closest('[data-mb-back]')) { event.preventDefault(); event.stopPropagation(); closeModelBox(); return; }
    if (event.target.closest('[data-mb-refresh]')) {
      event.preventDefault(); event.stopPropagation();
      const panel = q('#modelBoxPanelP303A .clean-body');
      if (panel) panel.insertAdjacentHTML('afterbegin', '<p class="mb-note">正在刷新模型目录……</p>');
      try { await fetchCatalog(true); openModelBox(q('#modelBoxSearchP303A')?.value || ''); }
      catch (error) { alert(`刷新失败：${error.message || error}`); }
      return;
    }
    const add = event.target.closest('[data-mb-add]');
    if (add) { event.preventDefault(); event.stopPropagation(); addToBox(add.dataset.mbAdd, add.dataset.mbKind || 'chat'); return; }
    const current = event.target.closest('[data-mb-current]');
    if (current) { event.preventDefault(); event.stopPropagation(); setCurrentModel(current.dataset.mbCurrent); return; }
    const remove = event.target.closest('[data-mb-remove]');
    if (remove) { event.preventDefault(); event.stopPropagation(); removeFromBox(remove.dataset.mbRemove, remove.dataset.mbKind || 'chat'); }
  }, true);
  document.addEventListener('input', (event) => {
    if (event.target?.id === 'modelBoxSearchP303A') openModelBox(event.target.value || '');
  }, true);
  const start = () => {
    installCss();
    ensureEntries();
    fetchCatalog(false).catch(() => undefined).finally(updateTopModelLabel);
    new MutationObserver(() => ensureEntries()).observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();

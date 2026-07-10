(() => {
  if (window.__ecChatCanon02) return;
  window.__ecChatCanon02 = true;

  const CK = 'gpt_like_test_window_messages_clean_v1';
  const TK = 'ec.mainChat.turns.v2';
  const CIDK = 'ec.currentConversationId';
  const CLK = 'ec.conversationList.cache';
  const API = '/api/chat/history';
  const CONV_API = '/api/chat/conversations';
  const TITLE_API = '/api/chat/title';
  const AK = 'gpt_like_assistant_avatar_dataurl_v1';
  const MK = 'ec.currentChatModel';
  const IK = 'ec.currentImageModel';
  const BK = 'ec.modelBox.v1';
  const ML = 'wolf_model_v092';
  const DM = 'openai/gpt-4.1-nano';
  const MAX = 12000;
  const PROFILE_KEYS = new Set([AK, MK, IK, BK]);
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const E = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ID = () => crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
  const NO = () => new Date().toISOString();
  const HT = (t) => E(t).split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');

  let chatAbort = null;
  let loading = null;
  let longTimer = null;
  let conversationLongTimer = null;
  let suppressConversationClick = false;
  let openConversationMenuId = null;
  const deletedConversationIds = new Set();
  let applyingProfile = false;
  let profileHydrated = false;
  const syncTimers = new Map();

  function J(k, d) { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; } catch { return d; } }
  function W(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
  function V(content, x = {}) { return { id: String(x.id || ID()), content: String(content ?? '').slice(0, MAX), created_at: x.created_at || NO(), ...(x.errorDetail ? { errorDetail: String(x.errorDetail).slice(0, MAX) } : {}) }; }
  function C(n, len) { n = +n || 0; return len < 1 ? 0 : Math.min(Math.max(0, n), len - 1); }
  function FM(a) { return (Array.isArray(a) ? a : []).filter((x) => x && /^(user|assistant)$/.test(x.role) && typeof x.content === 'string').map((x) => ({ id: String(x.id || ID()), role: x.role, content: String(x.content).slice(0, MAX), ...(x.created_at ? { created_at: x.created_at } : {}), ...(x.errorDetail ? { errorDetail: String(x.errorDetail).slice(0, MAX) } : {}) })); }
  function NT(r) {
    const userVariants = (Array.isArray(r?.user?.variants) ? r.user.variants : []).filter((x) => typeof x?.content === 'string').map((x) => V(x.content, x)).slice(0, 20);
    const count = Math.max(1, userVariants.length);
    const variantsByUserVariant = {};
    const activeByUserVariant = {};
    for (let i = 0; i < count; i += 1) {
      const key = String(i);
      const list = (Array.isArray(r?.assistant?.variantsByUserVariant?.[key]) ? r.assistant.variantsByUserVariant[key] : []).filter((x) => typeof x?.content === 'string').map((x) => V(x.content, x)).slice(0, 20);
      variantsByUserVariant[key] = list;
      activeByUserVariant[key] = C(r?.assistant?.activeByUserVariant?.[key], list.length || 1);
    }
    return { id: String(r?.id || ID()), user: { active: C(r?.user?.active, userVariants.length || 1), variants: userVariants }, assistant: { activeByUserVariant, variantsByUserVariant } };
  }
  function FT(a) {
    const turns = [];
    let cur = null;
    for (const m of FM(a)) {
      if (m.role === 'user') {
        cur = { id: `turn_${m.id}`, user: { active: 0, variants: [V(m.content, m)] }, assistant: { activeByUserVariant: { 0: 0 }, variantsByUserVariant: { 0: [] } } };
        turns.push(cur);
      } else if (cur) cur.assistant.variantsByUserVariant[0].push(V(m.content, m));
      else turns.push({ id: `turn_${m.id}`, user: { active: 0, variants: [] }, assistant: { activeByUserVariant: { 0: 0 }, variantsByUserVariant: { 0: [V(m.content, m)] } } });
    }
    return NS({ v: 2, turns });
  }
  function NS(r) {
    if (Array.isArray(r)) return FT(r);
    const turns = (Array.isArray(r?.turns) ? r.turns : []).map(NT).filter((t) => t.user.variants.length || Object.values(t.assistant.variantsByUserVariant).some((list) => list.length)).slice(-100);
    return { v: 2, updated_at: r?.updated_at || NO(), turns };
  }
  function cleanId(value) { return String(value || 'main').replace(/[^\w:.-]/g, '_').slice(0, 160) || 'main'; }
  function currentConversationId() { return cleanId(localStorage.getItem(CIDK) || 'main'); }
  function setCurrentConversationId(id) { const clean = cleanId(id || 'main'); localStorage.setItem(CIDK, clean); return clean; }
  function turnKey(id = currentConversationId()) { return `${TK}.${cleanId(id)}`; }
  function LS(id = currentConversationId()) {
    const convId = cleanId(id);
    const keyed = J(turnKey(convId), null);
    if (keyed?.v === 2) return NS(keyed);
    if (convId === 'main') {
      const old = J(TK, null);
      if (old?.v === 2) return NS(old);
      return FT(J(CK, []));
    }
    return { v: 2, updated_at: NO(), turns: [] };
  }
  function AM(s) {
    const out = [];
    for (const t of NS(s).turns) {
      const ui = C(t.user.active, t.user.variants.length || 1);
      const u = t.user.variants[ui];
      if (u?.content) out.push({ id: u.id, role: 'user', content: u.content, created_at: u.created_at });
      const list = t.assistant.variantsByUserVariant[ui] || [];
      const a = list[C(t.assistant.activeByUserVariant[ui], list.length || 1)];
      if (a?.content) out.push({ id: a.id, role: 'assistant', content: a.content, created_at: a.created_at, ...(a.errorDetail ? { errorDetail: a.errorDetail } : {}) });
    }
    return out;
  }
  function cleanList(value) { return Array.isArray(value) ? value.filter((item) => typeof item === 'string').slice(0, 60) : []; }
  function cleanModelBox(box) { return box && typeof box === 'object' ? { chat: cleanList(box.chat), free: cleanList(box.free), image: cleanList(box.image) } : { chat: [], free: [], image: [] }; }
  function localProfile() { return { assistant_avatar_dataurl: localStorage.getItem(AK) || '', current_chat_model: localStorage.getItem(MK) || '', current_image_model: localStorage.getItem(IK) || '', model_box: cleanModelBox(J(BK, { chat: [], free: [], image: [] })) }; }
  function refreshModelLabel() {
    const model = localStorage.getItem(MK) || DM;
    localStorage.setItem(MK, model);
    localStorage.setItem(ML, `${model} ›`);
    const label = $('.model-name');
    if (label) { label.textContent = `${model} ›`; label.title = model; }
  }
  function applyProfile(profile = {}) {
    if (!profile || typeof profile !== 'object') { profileHydrated = true; return; }
    applyingProfile = true;
    try {
      if (typeof profile.assistant_avatar_dataurl === 'string' && profile.assistant_avatar_dataurl) localStorage.setItem(AK, profile.assistant_avatar_dataurl);
      if (typeof profile.current_chat_model === 'string' && profile.current_chat_model) localStorage.setItem(MK, profile.current_chat_model);
      if (typeof profile.current_image_model === 'string' && profile.current_image_model) localStorage.setItem(IK, profile.current_image_model);
      if (profile.model_box && typeof profile.model_box === 'object') W(BK, cleanModelBox(profile.model_box));
    } finally { applyingProfile = false; profileHydrated = true; }
    refreshModelLabel();
  }
  function SS(s, sync = true, id = currentConversationId()) {
    const convId = cleanId(id);
    const next = NS({ ...s, updated_at: NO() });
    W(turnKey(convId), next);
    if (convId === currentConversationId()) {
      W(TK, next);
      W(CK, AM(next));
    }
    if (sync) SY(next, convId);
    return next;
  }
  async function apiJson(url, options = {}) {
    const res = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw Error(data?.error?.message || `${url} ${res.status}`);
    return data;
  }
  function sectionTitle(section) { return (section?.querySelector('h2')?.textContent || '').trim(); }
  function isConversationSection(section) {
    if (!section) return false;
    return section.id === 'conversationSectionP3' || section.dataset.owner === 'chat-conversations' || sectionTitle(section) === '主聊天窗口' || !!section.querySelector('#conversationListP3,[data-conversation-id]');
  }
  function normalizeConversationSection() {
    const nav = $('.history-list');
    if (!nav) return null;
    const sections = $$('.history-list > section', nav);
    const candidates = sections.filter(isConversationSection);
    let canonical = candidates.find((section) => section.id === 'conversationSectionP3') || candidates.find((section) => section.dataset.owner === 'chat-conversations') || candidates[0];
    if (!canonical) canonical = document.createElement('section');
    canonical.id = 'conversationSectionP3';
    canonical.dataset.owner = 'chat-conversations';
    for (const section of candidates) if (section !== canonical) section.remove();
    if (!canonical.isConnected) nav.appendChild(canonical);
    let heading = canonical.querySelector('h2');
    if (!heading) { heading = document.createElement('h2'); canonical.prepend(heading); }
    heading.textContent = '主聊天窗口';
    let list = $('#conversationListP3', canonical);
    if (!list) {
      list = document.createElement('div');
      list.id = 'conversationListP3';
      canonical.appendChild(list);
    }
    $$('[data-conversation-id]', canonical).forEach((button) => { if (!list.contains(button)) list.appendChild(button); });
    $$('[data-conversation-id]', nav).forEach((button) => { if (!list.contains(button)) button.remove(); });
    const liveSections = $$('.history-list > section', nav).filter((section) => section !== canonical);
    const roomWindow = liveSections.find((section) => /房间窗口/.test(sectionTitle(section)));
    const mainRoom = liveSections.find((section) => /主房间/.test(sectionTitle(section)));
    if (roomWindow) nav.insertBefore(canonical, roomWindow);
    else if (mainRoom && mainRoom.nextSibling !== canonical) nav.insertBefore(canonical, mainRoom.nextSibling);
    return canonical;
  }
  function renderConversations(list = J(CLK, [])) {
    const section = normalizeConversationSection();
    const node = section && $('#conversationListP3', section);
    if (!node) return;
    const current = currentConversationId();
    openConversationMenuId = null;
    node.innerHTML = (Array.isArray(list) ? list : []).map((item) => {
      const active = item.id === current;
      const id = E(item.id);
      return `<div class="history-conversation-row ${active ? 'is-active' : ''}" data-conversation-row="${id}"><button class="history-item history-conversation-title ${active ? 'is-active' : ''}" type="button" data-conversation-id="${id}">${E(item.title || '新聊天')}</button><button class="history-conversation-more" type="button" data-conversation-menu="${id}" aria-label="窗口操作" aria-expanded="false">⋯</button><div class="history-conversation-popover" data-conversation-popover="${id}" hidden><button type="button" data-conversation-action="rename" data-conversation-target="${id}">改名</button><button class="is-danger" type="button" data-conversation-action="delete" data-conversation-target="${id}">删除</button></div></div>`;
    }).join('') || '<p class="history-empty">还没有聊天窗口</p>';
  }
  function closeConversationMenus() {
    openConversationMenuId = null;
    $$('.history-conversation-popover').forEach((menu) => { menu.hidden = true; });
    $$('[data-conversation-menu]').forEach((button) => { button.setAttribute('aria-expanded', 'false'); });
  }
  function toggleConversationMenu(id) {
    const convId = cleanId(id);
    const row = $$('.history-conversation-row').find((item) => item.dataset.conversationRow === convId);
    if (!row) return;
    const menu = row.querySelector('.history-conversation-popover');
    const button = row.querySelector('[data-conversation-menu]');
    const shouldOpen = openConversationMenuId !== convId || menu.hidden;
    closeConversationMenus();
    if (!shouldOpen) return;
    openConversationMenuId = convId;
    menu.hidden = false;
    button?.setAttribute('aria-expanded', 'true');
  }
  async function fetchConversations() {
    const data = await apiJson(CONV_API);
    let list = Array.isArray(data.conversations) ? data.conversations : [];
    if (!list.some((item) => item.id === 'main')) {
      try {
        const mainState = await GH('main', { skipProfile: true });
        if (mainState.turns.length) list = [{ id: 'main', title: '主聊天', created_at: NO(), updated_at: NO(), deleted_at: null }, ...list];
      } catch {}
    }
    W(CLK, list);
    renderConversations(list);
    return list;
  }
  async function createConversation(title = '新聊天') {
    const data = await apiJson(CONV_API, { method: 'POST', body: JSON.stringify({ title }) });
    const conversation = data.conversation;
    const list = [conversation, ...J(CLK, []).filter((item) => item.id !== conversation.id)];
    W(CLK, list);
    renderConversations(list);
    return conversation;
  }
  function defaultTitle(title) { return ['', '新聊天', '未命名海岸', '主聊天'].includes(String(title || '').trim()); }
  function currentConversation(list = J(CLK, [])) { return list.find((item) => item.id === currentConversationId()); }
  async function GH(id = currentConversationId(), options = {}) {
    const convId = cleanId(id);
    const data = await apiJson(`${API}?conversation_id=${encodeURIComponent(convId)}`);
    const history = data.history || data;
    if (!options.skipProfile) applyProfile(history.profile || {});
    return NS(history);
  }
  async function PH(s, id = currentConversationId()) {
    const convId = cleanId(id);
    if (deletedConversationIds.has(convId)) return;
    const body = { ...NS(s), conversation_id: convId, ...(profileHydrated ? { profile: localProfile() } : {}) };
    await apiJson(`${API}?conversation_id=${encodeURIComponent(convId)}`, { method: 'PUT', body: JSON.stringify(body) });
  }
  function SY(s, id = currentConversationId()) {
    const convId = cleanId(id);
    if (deletedConversationIds.has(convId)) return;
    const state = NS(s);
    clearTimeout(syncTimers.get(convId));
    syncTimers.set(convId, setTimeout(() => PH(state, convId).catch((error) => console.warn('[P3-CHAT-CONV-MENU-04]', error)), 800));
  }
  function syncProfileSoon() { if (profileHydrated) SY(LS(), currentConversationId()); }
  async function loadConversation(id) {
    const convId = cleanId(id);
    if (deletedConversationIds.has(convId)) return;
    const previousId = currentConversationId();
    if (previousId && previousId !== convId && !deletedConversationIds.has(previousId)) {
      SS(LS(previousId), false, previousId);
      SY(LS(previousId), previousId);
    }
    setCurrentConversationId(convId);
    closeConversationMenus();
    renderConversations();
    const local = LS(convId);
    try {
      const server = await GH(convId);
      if (server.turns.length) { SS(server, false, convId); R(server, convId); }
      else { SS(local, false, convId); R(local, convId); if (local.turns.length) SY(local, convId); }
    } catch (error) {
      console.warn('[P3-CHAT-CONV-MENU-04] history fetch failed', error);
      R(local, convId);
    }
  }
  async function readableState(id) { try { return await GH(id, { skipProfile: true }); } catch { return null; } }
  async function BO() {
    let list = J(CLK, []);
    normalizeConversationSection();
    renderConversations(list);
    try { list = await fetchConversations(); } catch (error) { console.warn('[P3-CHAT-CONV-MENU-04] conversations fetch failed', error); }
    let target = null;
    const localId = localStorage.getItem(CIDK);
    if (localId && list.some((item) => item.id === localId)) {
      const state = await readableState(localId);
      if (state?.turns?.length || list.length === 1) target = list.find((item) => item.id === localId);
    }
    if (!target) {
      for (const item of list) {
        const state = await readableState(item.id);
        if (state?.turns?.length) { target = item; break; }
      }
    }
    if (!target) {
      const mainState = await readableState('main');
      if (mainState?.turns?.length) target = list.find((item) => item.id === 'main') || { id: 'main', title: '主聊天' };
    }
    if (!target) target = list[0];
    if (!target) {
      try { target = await createConversation('新聊天'); }
      catch (error) { console.warn('[P3-CHAT-CONV-MENU-04] conversation create failed', error); target = { id: 'main', title: '主聊天' }; }
    }
    await loadConversation(target.id);
  }
  async function newConversation() {
    const previousId = currentConversationId();
    if (previousId && !deletedConversationIds.has(previousId)) {
      SS(LS(previousId), false, previousId);
      SY(LS(previousId), previousId);
    }
    const conversation = await createConversation('新聊天');
    setCurrentConversationId(conversation.id);
    const empty = { v: 2, updated_at: NO(), turns: [] };
    SS(empty, false, conversation.id);
    R(empty, conversation.id);
    renderConversations();
    if (profileHydrated) SY(empty, conversation.id);
  }
  async function renameConversation(id) {
    const list = J(CLK, []);
    const old = list.find((item) => item.id === id)?.title || '新聊天';
    const title = prompt('给这个窗口改名', old);
    if (title == null || !title.trim()) return;
    const data = await apiJson(`${CONV_API}/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ title: title.trim(), title_manual: true }) });
    const next = list.map((item) => item.id === id ? data.conversation : item);
    W(CLK, next);
    renderConversations(next);
  }
  async function deleteConversation(id) {
    const convId = cleanId(id);
    if (!confirm('删除这个窗口？聊天记录会软删除，不会影响其他窗口。')) return;
    deletedConversationIds.add(convId);
    clearTimeout(syncTimers.get(convId));
    syncTimers.delete(convId);
    closeConversationMenus();
    if (currentConversationId() === convId && chatAbort) chatAbort.abort();
    try {
      await apiJson(`${CONV_API}/${encodeURIComponent(convId)}`, { method: 'DELETE' });
    } catch (error) {
      deletedConversationIds.delete(convId);
      throw error;
    }
    localStorage.removeItem(turnKey(convId));
    let list = await fetchConversations().catch(() => J(CLK, []).filter((item) => item.id !== convId));
    list = (Array.isArray(list) ? list : []).filter((item) => item.id !== convId);
    W(CLK, list);
    if (currentConversationId() === convId) {
      if (!list.length) list = [await createConversation('新聊天')];
      await loadConversation(list[0].id);
    } else renderConversations(list);
  }
  async function conversationAction(id) {
    suppressConversationClick = true;
    setTimeout(() => { suppressConversationClick = false; }, 800);
    const action = prompt('窗口操作：输入 1 改名，输入 2 删除', '1');
    if (action === '1') await renameConversation(id).catch((error) => alert(`改名失败：${error.message || error}`));
    if (action === '2') await deleteConversation(id).catch((error) => alert(`删除失败：${error.message || error}`));
  }
  async function autoTitleIfNeeded(state, turn, id = currentConversationId()) {
    const list = J(CLK, []);
    const conv = list.find((item) => item.id === cleanId(id));
    if (!conv || conv.title_manual || conv.title_generated_at || !defaultTitle(conv.title) || NS(state).turns.length !== 1) return;
    const ui = C(turn.user.active, turn.user.variants.length || 1);
    const user = turn.user.variants[ui]?.content || '';
    const assistants = turn.assistant.variantsByUserVariant[ui] || [];
    const assistant = assistants[C(turn.assistant.activeByUserVariant[ui], assistants.length || 1)]?.content || '';
    if (!user.trim() || !assistant.trim() || assistant.startsWith('正在通过海岸 API')) return;
    try {
      const data = await apiJson(TITLE_API, { method: 'POST', body: JSON.stringify({ conversation_id: cleanId(id), user, assistant }) });
      if (data.conversation) {
        const next = J(CLK, []).map((item) => item.id === data.conversation.id ? data.conversation : item);
        W(CLK, next);
        renderConversations(next);
      }
    } catch (error) { console.warn('[P3-CHAT-CONV-MENU-04] title skipped', error); }
  }
  function AV() {
    const url = localStorage.getItem(AK) || '';
    return `<div class="avatar ${url ? 'has-custom-avatar' : ''}" ${url ? `style="background-image:url(${url})"` : ''}>${url ? '' : '⌁'}</div>`;
  }
  function BT(name, title, extra = '') { return `<button class="action-button" type="button" data-action="${name}" ${extra} title="${E(title)}"></button>`; }
  function SW(kind, turn, active, count) { return count > 1 ? `<span class="variant-switch-p303a" data-k="${kind}" data-t="${E(turn.id)}"><button type="button" data-d="p">‹</button><span>${active + 1}/${count}</span><button type="button" data-d="n">›</button></span>` : ''; }
  function CSS() {
    if ($('#canon02css')) return;
    const style = document.createElement('style');
    style.id = 'canon02css';
    style.textContent = '.variant-switch-p303a{display:inline-flex;gap:6px;margin-left:6px;color:var(--muted);font-size:12px}.variant-switch-p303a button{width:26px;height:24px;border:1px solid var(--line);border-radius:999px;background:transparent;color:var(--text)}.assistant-text .chat-error-detail{display:block;margin-top:8px;color:var(--muted);font-size:12px;line-height:1.55}.message[data-turn]{touch-action:pan-y}.history-empty{padding:10px 14px;color:var(--muted);font-size:13px}#conversationListP3{display:grid;gap:2px}.history-conversation-row{position:relative;display:grid;grid-template-columns:minmax(0,1fr) 34px;align-items:center;gap:2px}.history-conversation-title{min-width:0;width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.history-conversation-more{display:grid;place-items:center;width:32px;height:32px;border:0;border-radius:9px;background:transparent;color:var(--muted);font-size:20px;line-height:1;cursor:pointer}.history-conversation-more:hover,.history-conversation-more[aria-expanded="true"]{background:color-mix(in srgb,var(--text) 8%,transparent);color:var(--text)}.history-conversation-popover{position:absolute;z-index:60;right:2px;top:calc(100% + 3px);display:grid;min-width:112px;padding:6px;border:1px solid var(--line);border-radius:12px;background:var(--bg,#fff);box-shadow:0 12px 34px rgba(0,0,0,.18)}.history-conversation-popover[hidden]{display:none}.history-conversation-popover button{border:0;border-radius:8px;background:transparent;color:var(--text);padding:9px 11px;text-align:left;font:inherit;cursor:pointer}.history-conversation-popover button:hover{background:color-mix(in srgb,var(--text) 8%,transparent)}.history-conversation-popover .is-danger{color:#d04444}';
    document.head.appendChild(style);
  }
  function R(s = LS(), id = currentConversationId()) {
    const convId = cleanId(id);
    const state = SS(NS(s), false, convId);
    if (convId !== currentConversationId()) return;
    const box = $('#messages');
    const scroller = $('#messageScroller');
    if (!box) return;
    box.innerHTML = state.turns.map((turn) => {
      const ui = C(turn.user.active, turn.user.variants.length || 1);
      const user = turn.user.variants[ui];
      const list = turn.assistant.variantsByUserVariant[ui] || [];
      const ai = C(turn.assistant.activeByUserVariant[ui], list.length || 1);
      const assistant = list[ai];
      const isLoading = loading && loading.turn === turn.id && loading.user === ui && loading.assistant === ai && loading.conversation === convId;
      const userHtml = user ? `<article class="message user" data-turn="${E(turn.id)}" data-role="user"><div class="content"><div class="user-bubble">${E(user.content)}</div><div class="user-actions" data-ut="${E(turn.id)}">${BT('edit', '编辑', 'data-ua="edit"')}${BT('delete', '删除', 'data-ua="delete"')}${SW('user', turn, ui, turn.user.variants.length)}</div></div></article>` : '';
      const assistantHtml = assistant ? `<article class="message assistant" data-turn="${E(turn.id)}" data-role="assistant">${AV()}<div class="content"><div class="assistant-text">${HT(assistant.content)}${assistant.errorDetail ? `<span class="chat-error-detail">${E(assistant.errorDetail)}</span>` : ''}${isLoading ? '<span class="typing-cursor"></span>' : ''}</div><div class="assistant-actions" data-at="${E(turn.id)}">${BT('copy', '复制')}${BT('like', '点赞')}${BT('refresh', '重新生成')}${BT('favorite', '收藏')}${BT('delete', '删除')}${SW('assistant', turn, ai, list.length)}</div></div></article>` : '';
      return userHtml + assistantHtml;
    }).join('') + '<div class="thread-spacer"></div>';
    requestAnimationFrame(() => { if (scroller) scroller.scrollTop = scroller.scrollHeight; });
  }
  function currentModel() { const model = localStorage.getItem(MK) || DM; localStorage.setItem(MK, model); refreshModelLabel(); return model; }
  function setBusy(on) {
    const call = $('#callButton');
    const mic = $('#micButton');
    const input = $('#promptInput');
    if (!call) return;
    if (on) { call.dataset.icon = 'stop'; call.dataset.busy = 'true'; if (mic) mic.hidden = true; }
    else { call.removeAttribute('data-busy'); call.dataset.icon = (input?.value || '').trim() ? 'send' : 'call'; if (mic && !(input?.value || '').trim()) mic.hidden = false; }
  }
  function contextMessages(s, turnId) {
    const out = [];
    for (const turn of NS(s).turns) {
      const ui = C(turn.user.active, turn.user.variants.length || 1);
      const user = turn.user.variants[ui];
      if (user?.content) out.push({ role: 'user', content: user.content });
      if (turn.id === turnId) break;
      const list = turn.assistant.variantsByUserVariant[ui] || [];
      const assistant = list[C(turn.assistant.activeByUserVariant[ui], list.length || 1)];
      if (assistant?.content && !assistant.content.startsWith('正在通过海岸 API')) out.push({ role: 'assistant', content: assistant.content });
    }
    return out.filter((item) => item.content.trim()).slice(-20);
  }
  async function generateAssistant(s, turnId, id = currentConversationId()) {
    const convId = cleanId(id);
    const state = NS(s);
    const turn = state.turns.find((item) => item.id === turnId);
    if (!turn) return;
    const ui = C(turn.user.active, turn.user.variants.length || 1);
    const key = String(ui);
    turn.assistant.variantsByUserVariant[key] ||= [];
    const assistant = V('正在通过海岸 API 连接当前模型……');
    turn.assistant.variantsByUserVariant[key].push(assistant);
    const ai = turn.assistant.variantsByUserVariant[key].length - 1;
    turn.assistant.activeByUserVariant[key] = ai;
    loading = { conversation: convId, turn: turnId, user: ui, assistant: ai };
    setBusy(true); R(state, convId); SY(state, convId);
    const model = currentModel();
    const settings = window.elementeraRunControl?.getSettings?.() || {};
    const maxTokens = settings.outputLength === 'long' ? 1200 : settings.outputLength === 'short' ? 350 : 600;
    const temperature = settings.creativity === 'stable' ? 0.3 : settings.creativity === 'expansive' ? 1 : 0.7;
    let ok = false;
    chatAbort = new AbortController();
    try {
      const res = await fetch('/api/chat', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, signal: chatAbort.signal, body: JSON.stringify({ model, messages: contextMessages(state, turnId), settings: { max_tokens: maxTokens, temperature } }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        const err = data.error || {};
        assistant.content = err.message || '消息生成失败，请稍后重试。';
        assistant.errorDetail = [`status: ${err.status || res.status || '?'}`, err.type ? `type: ${err.type}` : '', err.providerMessagePreview ? `provider: ${err.providerMessagePreview}` : ''].filter(Boolean).join('\n');
      } else { assistant.content = data?.message?.content || '模型没有返回文本。'; assistant.errorDetail = ''; ok = true; }
    } catch (error) { assistant.content = error?.name === 'AbortError' ? '已停止生成。' : `请求失败：${error?.message || error}`; assistant.errorDetail = `model: ${model}`; }
    finally {
      chatAbort = null;
      loading = null;
      setBusy(false);
      SS(state, false, convId);
      try { await PH(state, convId); }
      catch (error) { assistant.errorDetail = [assistant.errorDetail, `history sync: ${error.message || error}`].filter(Boolean).join('\n'); SY(state, convId); }
      R(state, convId);
      if (ok) autoTitleIfNeeded(state, turn, convId);
    }
  }
  function send(text) {
    const input = $('#promptInput');
    const convId = currentConversationId();
    const state = LS(convId);
    const turn = { id: ID(), user: { active: 0, variants: [V(text)] }, assistant: { activeByUserVariant: { 0: 0 }, variantsByUserVariant: { 0: [] } } };
    state.turns.push(turn);
    if (input) { input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); }
    generateAssistant(state, turn.id, convId);
  }
  function editUser(turnId) {
    const convId = currentConversationId();
    const state = LS(convId); const turn = state.turns.find((item) => item.id === turnId); if (!turn) return;
    const ui = C(turn.user.active, turn.user.variants.length || 1);
    const next = prompt('编辑消息', turn.user.variants[ui]?.content || '');
    if (next == null || next === turn.user.variants[ui]?.content) return;
    turn.user.variants.push(V(next));
    const ni = turn.user.variants.length - 1;
    turn.user.active = ni;
    turn.assistant.variantsByUserVariant[String(ni)] = [];
    turn.assistant.activeByUserVariant[String(ni)] = 0;
    generateAssistant(state, turn.id, convId);
  }
  function deleteUser(turnId) {
    const convId = currentConversationId();
    const state = LS(convId); const index = state.turns.findIndex((item) => item.id === turnId); const turn = state.turns[index]; if (!turn) return;
    const ui = C(turn.user.active, turn.user.variants.length || 1);
    turn.user.variants.splice(ui, 1);
    if (!turn.user.variants.length) state.turns.splice(index, 1);
    else {
      const variantsByUserVariant = {}; const activeByUserVariant = {};
      for (let i = 0; i < turn.user.variants.length; i += 1) {
        const oldKey = String(i >= ui ? i + 1 : i); const key = String(i);
        variantsByUserVariant[key] = turn.assistant.variantsByUserVariant?.[oldKey] || [];
        activeByUserVariant[key] = C(turn.assistant.activeByUserVariant?.[oldKey], variantsByUserVariant[key].length || 1);
      }
      turn.user.active = Math.min(ui, turn.user.variants.length - 1);
      turn.assistant.variantsByUserVariant = variantsByUserVariant;
      turn.assistant.activeByUserVariant = activeByUserVariant;
    }
    R(state, convId); SY(state, convId);
  }
  function deleteAssistant(turnId) {
    const convId = currentConversationId();
    const state = LS(convId); const turn = state.turns.find((item) => item.id === turnId); if (!turn) return;
    const ui = C(turn.user.active, turn.user.variants.length || 1); const key = String(ui); const list = turn.assistant.variantsByUserVariant[key] || [];
    if (!list.length) return;
    const ai = C(turn.assistant.activeByUserVariant[key], list.length);
    list.splice(ai, 1);
    turn.assistant.variantsByUserVariant[key] = list;
    turn.assistant.activeByUserVariant[key] = Math.min(ai, Math.max(0, list.length - 1));
    R(state, convId); SY(state, convId);
  }
  function switchVariant(turnId, kind, direction) {
    const convId = currentConversationId();
    const state = LS(convId); const turn = state.turns.find((item) => item.id === turnId); if (!turn) return;
    if (kind === 'user') {
      const count = turn.user.variants.length;
      turn.user.active = (C(turn.user.active, count) + (direction === 'n' ? 1 : -1) + count) % count;
    } else {
      const ui = C(turn.user.active, turn.user.variants.length || 1); const key = String(ui); const list = turn.assistant.variantsByUserVariant[key] || []; const count = list.length;
      if (count > 1) turn.assistant.activeByUserVariant[key] = (C(turn.assistant.activeByUserVariant[key], count) + (direction === 'n' ? 1 : -1) + count) % count;
    }
    R(state, convId); SY(state, convId);
  }
  function installProfileWatch() {
    if (window.__ecChatProfileWatchD100) return;
    window.__ecChatProfileWatchD100 = true;
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function patchedSetItem(key, value) {
      const result = originalSetItem.apply(this, arguments);
      if (this === localStorage && PROFILE_KEYS.has(String(key)) && !applyingProfile) { if (String(key) === AK) R(LS()); syncProfileSoon(); }
      return result;
    };
  }
  function installCanonicalOwner() {
    CSS(); installProfileWatch(); refreshModelLabel(); normalizeConversationSection(); renderConversations(); R(LS()); BO();
    const input = $('#promptInput'); const form = $('#composer'); const call = $('#callButton');
    if (input && !input.dataset.cc2) { input.dataset.cc2 = '1'; input.addEventListener('keydown', (event) => { if (event.key === 'Enter') event.stopImmediatePropagation(); }, true); }
    if (form && !form.dataset.cc2) { form.dataset.cc2 = '1'; form.addEventListener('submit', (event) => { event.preventDefault(); event.stopImmediatePropagation(); const text = (input?.value || '').trim(); if (chatAbort) return chatAbort.abort(); if (text) send(text); }, true); }
    if (call && !call.dataset.cc2) { call.dataset.cc2 = '1'; call.addEventListener('click', (event) => { event.preventDefault(); event.stopImmediatePropagation(); if (chatAbort) return chatAbort.abort(); const text = (input?.value || '').trim(); if (text) send(text); }, true); }
  }
  document.addEventListener('click', async (event) => {
    const newButton = event.target.closest('#newChatButton');
    if (newButton) { event.preventDefault(); event.stopImmediatePropagation(); closeConversationMenus(); newConversation().catch((error) => alert(`新建窗口失败：${error.message || error}`)); return; }
    const menuButton = event.target.closest('#conversationListP3 [data-conversation-menu]');
    if (menuButton) { event.preventDefault(); event.stopImmediatePropagation(); toggleConversationMenu(menuButton.dataset.conversationMenu); return; }
    const menuAction = event.target.closest('#conversationListP3 [data-conversation-action]');
    if (menuAction) {
      event.preventDefault(); event.stopImmediatePropagation();
      const id = menuAction.dataset.conversationTarget;
      const action = menuAction.dataset.conversationAction;
      closeConversationMenus();
      if (action === 'rename') await renameConversation(id).catch((error) => alert(`改名失败：${error.message || error}`));
      if (action === 'delete') await deleteConversation(id).catch((error) => alert(`删除失败：${error.message || error}`));
      return;
    }
    if (!event.target.closest('.history-conversation-row')) closeConversationMenus();
    const conversationButton = event.target.closest('#conversationListP3 [data-conversation-id]');
    if (conversationButton) { event.preventDefault(); event.stopImmediatePropagation(); closeConversationMenus(); if (suppressConversationClick) return; loadConversation(conversationButton.dataset.conversationId).catch((error) => alert(`切换窗口失败：${error.message || error}`)); return; }
    const switcher = event.target.closest('[data-d]');
    if (switcher) { event.preventDefault(); event.stopImmediatePropagation(); const wrap = switcher.closest('[data-k]'); switchVariant(wrap.dataset.t, wrap.dataset.k, switcher.dataset.d); return; }
    const userAction = event.target.closest('[data-ua]');
    if (userAction) { event.preventDefault(); event.stopImmediatePropagation(); const turnId = userAction.closest('[data-ut]')?.dataset.ut; userAction.dataset.ua === 'edit' ? editUser(turnId) : deleteUser(turnId); return; }
    const assistantAction = event.target.closest('.assistant-actions .action-button');
    if (assistantAction) {
      event.preventDefault(); event.stopImmediatePropagation();
      const turnId = assistantAction.closest('.assistant-actions')?.dataset.at; const action = assistantAction.dataset.action; const state = LS(); const turn = state.turns.find((item) => item.id === turnId);
      if (!turn) return;
      const ui = C(turn.user.active, turn.user.variants.length || 1); const list = turn.assistant.variantsByUserVariant[String(ui)] || []; const assistant = list[C(turn.assistant.activeByUserVariant[String(ui)], list.length || 1)];
      if (action === 'copy') { await navigator.clipboard?.writeText(assistant?.content || ''); return; }
      if (action === 'like' || action === 'favorite') { assistantAction.classList.toggle('is-active'); return; }
      if (action === 'delete') { deleteAssistant(turnId); return; }
      if (action === 'refresh') { generateAssistant(state, turnId, currentConversationId()); return; }
    }
  }, true);
  document.addEventListener('pointerdown', (event) => {
    const conversationButton = event.target.closest('#conversationListP3 [data-conversation-id]');
    if (conversationButton) {
      clearTimeout(conversationLongTimer);
      conversationLongTimer = setTimeout(() => conversationAction(conversationButton.dataset.conversationId), 700);
      return;
    }
    const message = event.target.closest('.user-bubble,.assistant-text')?.closest('.message[data-turn]');
    if (!message) return;
    clearTimeout(longTimer);
    longTimer = setTimeout(() => { if (confirm(message.dataset.role === 'user' ? '删除当前这一版消息和对应回复？' : '删除当前这一版回复？')) message.dataset.role === 'user' ? deleteUser(message.dataset.turn) : deleteAssistant(message.dataset.turn); }, 700);
  }, true);
  ['pointerup', 'pointercancel', 'pointermove', 'scroll'].forEach((name) => document.addEventListener(name, () => { clearTimeout(longTimer); clearTimeout(conversationLongTimer); }, true));
  window.addEventListener('storage', (event) => { if (PROFILE_KEYS.has(event.key)) { if (event.key === AK) R(LS()); syncProfileSoon(); } });
  const start = () => installCanonicalOwner();
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', start) : start();
  window.elementeraChatHistorySyncP301 = { fetchServerHistory: GH, putServerHistory: PH, syncHistorySoon: SY, syncProfileSoon, bootstrapChatHistory: BO, loadState: LS, saveState: SS, renderChat: R, readProfile: localProfile, fetchConversations, loadConversation, newConversation };
})();

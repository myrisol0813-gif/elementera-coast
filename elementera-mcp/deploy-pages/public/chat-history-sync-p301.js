(() => {
  if (window.__ecChatCanon02) return;
  window.__ecChatCanon02 = true;

  const CK = 'gpt_like_test_window_messages_clean_v1';
  const TK = 'ec.mainChat.turns.v2';
  const API = '/api/chat/history';
  const AK = 'gpt_like_assistant_avatar_dataurl_v1';
  const MK = 'ec.currentChatModel';
  const ML = 'wolf_model_v092';
  const DM = 'openai/gpt-4.1-nano';
  const MAX = 12000;
  const $ = (s, r = document) => r.querySelector(s);
  const E = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ID = () => crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
  const NO = () => new Date().toISOString();
  const HT = (t) => E(t).split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');

  let syncTimer = null;
  let chatAbort = null;
  let loading = null;
  let longTimer = null;

  function J(k, d) {
    try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; }
    catch { return d; }
  }
  function W(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
  function V(content, x = {}) {
    return { id: String(x.id || ID()), content: String(content ?? '').slice(0, MAX), created_at: x.created_at || NO(), ...(x.errorDetail ? { errorDetail: String(x.errorDetail).slice(0, MAX) } : {}) };
  }
  function C(n, len) { n = +n || 0; return len < 1 ? 0 : Math.min(Math.max(0, n), len - 1); }
  function FM(a) {
    return (Array.isArray(a) ? a : []).filter((x) => x && /^(user|assistant)$/.test(x.role) && typeof x.content === 'string').map((x) => ({ id: String(x.id || ID()), role: x.role, content: String(x.content).slice(0, MAX), ...(x.created_at ? { created_at: x.created_at } : {}), ...(x.errorDetail ? { errorDetail: String(x.errorDetail).slice(0, MAX) } : {}) }));
  }
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
  function LS() {
    const state = J(TK, null);
    return state?.v === 2 ? NS(state) : FT(J(CK, []));
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
  function SS(s, sync = true) {
    const next = NS({ ...s, updated_at: NO() });
    W(TK, next);
    W(CK, AM(next));
    if (sync) SY(next);
    return next;
  }
  async function GH() {
    const res = await fetch(API, { credentials: 'same-origin', cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw Error(data?.error?.message || `history ${res.status}`);
    return NS(data.history || data);
  }
  async function PH(s) {
    const res = await fetch(API, { method: 'PUT', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(NS(s)) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw Error(data?.error?.message || `put ${res.status}`);
  }
  function SY(s) {
    const state = NS(s);
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => PH(state).catch((error) => console.warn('[P3-MODELBOX-RESTORE-03]', error)), 800);
  }
  async function BO() {
    const local = LS();
    try {
      const server = await GH();
      if (server.turns.length) { SS(server, false); R(server); }
      else { R(local); if (local.turns.length) SY(local); }
    } catch (error) {
      console.warn('[P3-MODELBOX-RESTORE-03] history fetch failed', error);
      R(local);
    }
  }
  function AV() {
    const url = localStorage.getItem(AK) || '';
    return `<div class="avatar ${url ? 'has-custom-avatar' : ''}" ${url ? `style="background-image:url(${url})"` : ''}>${url ? '' : '⌁'}</div>`;
  }
  function BT(name, title, extra = '') {
    return `<button class="action-button" type="button" data-action="${name}" ${extra} title="${E(title)}"></button>`;
  }
  function SW(kind, turn, active, count) {
    return count > 1 ? `<span class="variant-switch-p303a" data-k="${kind}" data-t="${E(turn.id)}"><button type="button" data-d="p">‹</button><span>${active + 1}/${count}</span><button type="button" data-d="n">›</button></span>` : '';
  }
  function CSS() {
    if ($('#canon02css')) return;
    const style = document.createElement('style');
    style.id = 'canon02css';
    style.textContent = '.variant-switch-p303a{display:inline-flex;gap:6px;margin-left:6px;color:var(--muted);font-size:12px}.variant-switch-p303a button{width:26px;height:24px;border:1px solid var(--line);border-radius:999px;background:transparent;color:var(--text)}.assistant-text .chat-error-detail{display:block;margin-top:8px;color:var(--muted);font-size:12px;line-height:1.55}.message[data-turn]{touch-action:pan-y}';
    document.head.appendChild(style);
  }
  function R(s = LS()) {
    const state = NS(s);
    const box = $('#messages');
    const scroller = $('#messageScroller');
    if (!box) return;
    box.innerHTML = state.turns.map((turn) => {
      const ui = C(turn.user.active, turn.user.variants.length || 1);
      const user = turn.user.variants[ui];
      const list = turn.assistant.variantsByUserVariant[ui] || [];
      const ai = C(turn.assistant.activeByUserVariant[ui], list.length || 1);
      const assistant = list[ai];
      const isLoading = loading && loading.turn === turn.id && loading.user === ui && loading.assistant === ai;
      const userHtml = user ? `<article class="message user" data-turn="${E(turn.id)}" data-role="user"><div class="content"><div class="user-bubble">${E(user.content)}</div><div class="user-actions" data-ut="${E(turn.id)}">${BT('edit', '编辑', 'data-ua="edit"')}${BT('delete', '删除', 'data-ua="delete"')}${SW('user', turn, ui, turn.user.variants.length)}</div></div></article>` : '';
      const assistantHtml = assistant ? `<article class="message assistant" data-turn="${E(turn.id)}" data-role="assistant">${AV()}<div class="content"><div class="assistant-text">${HT(assistant.content)}${assistant.errorDetail ? `<span class="chat-error-detail">${E(assistant.errorDetail)}</span>` : ''}${isLoading ? '<span class="typing-cursor"></span>' : ''}</div><div class="assistant-actions" data-at="${E(turn.id)}">${BT('copy', '复制')}${BT('like', '点赞')}${BT('refresh', '重新生成')}${BT('favorite', '收藏')}${BT('delete', '删除')}${SW('assistant', turn, ai, list.length)}</div></div></article>` : '';
      return userHtml + assistantHtml;
    }).join('') + '<div class="thread-spacer"></div>';
    requestAnimationFrame(() => { if (scroller) scroller.scrollTop = scroller.scrollHeight; });
    SS(state, false);
  }
  function currentModel() {
    const model = localStorage.getItem(MK) || DM;
    localStorage.setItem(MK, model);
    localStorage.setItem(ML, `${model} ›`);
    const label = $('.model-name');
    if (label) { label.textContent = `${model} ›`; label.title = model; }
    return model;
  }
  function setBusy(on) {
    const call = $('#callButton');
    const mic = $('#micButton');
    const input = $('#promptInput');
    if (!call) return;
    if (on) {
      call.dataset.icon = 'stop';
      call.dataset.busy = 'true';
      if (mic) mic.hidden = true;
    } else {
      call.removeAttribute('data-busy');
      call.dataset.icon = (input?.value || '').trim() ? 'send' : 'call';
      if (mic && !(input?.value || '').trim()) mic.hidden = false;
    }
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
  async function generateAssistant(s, turnId) {
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
    loading = { turn: turnId, user: ui, assistant: ai };
    setBusy(true); R(state); SY(state);
    const model = currentModel();
    const settings = window.elementeraRunControl?.getSettings?.() || {};
    const maxTokens = settings.outputLength === 'long' ? 1200 : settings.outputLength === 'short' ? 350 : 600;
    const temperature = settings.creativity === 'stable' ? 0.3 : settings.creativity === 'expansive' ? 1 : 0.7;
    chatAbort = new AbortController();
    try {
      const res = await fetch('/api/chat', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, signal: chatAbort.signal, body: JSON.stringify({ model, messages: contextMessages(state, turnId), settings: { max_tokens: maxTokens, temperature } }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        const err = data.error || {};
        assistant.content = err.message || '消息生成失败，请稍后重试。';
        assistant.errorDetail = [`status: ${err.status || res.status || '?'}`, err.type ? `type: ${err.type}` : '', err.providerMessagePreview ? `provider: ${err.providerMessagePreview}` : ''].filter(Boolean).join('\n');
      } else {
        assistant.content = data?.message?.content || '模型没有返回文本。';
        assistant.errorDetail = '';
      }
    } catch (error) {
      assistant.content = error?.name === 'AbortError' ? '已停止生成。' : `请求失败：${error?.message || error}`;
      assistant.errorDetail = `model: ${model}`;
    } finally {
      chatAbort = null;
      loading = null;
      setBusy(false);
      R(state); SY(state);
    }
  }
  function send(text) {
    const input = $('#promptInput');
    const state = LS();
    const turn = { id: ID(), user: { active: 0, variants: [V(text)] }, assistant: { activeByUserVariant: { 0: 0 }, variantsByUserVariant: { 0: [] } } };
    state.turns.push(turn);
    if (input) { input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); }
    generateAssistant(state, turn.id);
  }
  function editUser(turnId) {
    const state = LS();
    const turn = state.turns.find((item) => item.id === turnId);
    if (!turn) return;
    const ui = C(turn.user.active, turn.user.variants.length || 1);
    const next = prompt('编辑消息', turn.user.variants[ui]?.content || '');
    if (next == null || next === turn.user.variants[ui]?.content) return;
    turn.user.variants.push(V(next));
    const ni = turn.user.variants.length - 1;
    turn.user.active = ni;
    turn.assistant.variantsByUserVariant[ni] = [];
    turn.assistant.activeByUserVariant[ni] = 0;
    generateAssistant(state, turn.id);
  }
  function deleteUser(turnId) {
    const state = LS();
    const index = state.turns.findIndex((item) => item.id === turnId);
    const turn = state.turns[index];
    if (!turn) return;
    const ui = C(turn.user.active, turn.user.variants.length || 1);
    if (turn.user.variants.length <= 1) state.turns.splice(index, 1);
    else {
      turn.user.variants.splice(ui, 1);
      const variantsByUserVariant = {};
      const activeByUserVariant = {};
      for (let i = 0; i < turn.user.variants.length; i += 1) {
        const oldKey = String(i >= ui ? i + 1 : i);
        const key = String(i);
        variantsByUserVariant[key] = turn.assistant.variantsByUserVariant[oldKey] || [];
        activeByUserVariant[key] = C(turn.assistant.activeByUserVariant[oldKey], variantsByUserVariant[key].length || 1);
      }
      turn.user.active = Math.min(ui, turn.user.variants.length - 1);
      turn.assistant.variantsByUserVariant = variantsByUserVariant;
      turn.assistant.activeByUserVariant = activeByUserVariant;
    }
    R(state); SY(state);
  }
  function deleteAssistant(turnId) {
    const state = LS();
    const turn = state.turns.find((item) => item.id === turnId);
    if (!turn) return;
    const ui = C(turn.user.active, turn.user.variants.length || 1);
    const list = turn.assistant.variantsByUserVariant[ui] || [];
    if (!list.length) return;
    const ai = C(turn.assistant.activeByUserVariant[ui], list.length);
    list.splice(ai, 1);
    turn.assistant.activeByUserVariant[ui] = Math.min(ai, Math.max(0, list.length - 1));
    R(state); SY(state);
  }
  function switchVariant(turnId, kind, direction) {
    const state = LS();
    const turn = state.turns.find((item) => item.id === turnId);
    if (!turn) return;
    if (kind === 'user') {
      const count = turn.user.variants.length;
      turn.user.active = (C(turn.user.active, count) + (direction === 'n' ? 1 : -1) + count) % count;
    } else {
      const ui = C(turn.user.active, turn.user.variants.length || 1);
      const list = turn.assistant.variantsByUserVariant[ui] || [];
      const count = list.length;
      if (count > 1) turn.assistant.activeByUserVariant[ui] = (C(turn.assistant.activeByUserVariant[ui], count) + (direction === 'n' ? 1 : -1) + count) % count;
    }
    R(state); SY(state);
  }
  function installCanonicalOwner() {
    CSS(); currentModel(); R(LS()); BO();
    const input = $('#promptInput');
    const form = $('#composer');
    const call = $('#callButton');
    if (input && !input.dataset.cc2) {
      input.dataset.cc2 = '1';
      input.addEventListener('keydown', (event) => { if (event.key === 'Enter') event.stopImmediatePropagation(); }, true);
    }
    if (form && !form.dataset.cc2) {
      form.dataset.cc2 = '1';
      form.addEventListener('submit', (event) => {
        event.preventDefault(); event.stopImmediatePropagation();
        const text = (input?.value || '').trim();
        if (chatAbort) return chatAbort.abort();
        if (text) send(text);
      }, true);
    }
    if (call && !call.dataset.cc2) {
      call.dataset.cc2 = '1';
      call.addEventListener('click', (event) => {
        event.preventDefault(); event.stopImmediatePropagation();
        if (chatAbort) return chatAbort.abort();
        const text = (input?.value || '').trim();
        if (text) send(text);
      }, true);
    }
  }
  document.addEventListener('click', async (event) => {
    const switcher = event.target.closest('[data-d]');
    if (switcher) { event.preventDefault(); event.stopImmediatePropagation(); const wrap = switcher.closest('[data-k]'); switchVariant(wrap.dataset.t, wrap.dataset.k, switcher.dataset.d); return; }
    const userAction = event.target.closest('[data-ua]');
    if (userAction) { event.preventDefault(); event.stopImmediatePropagation(); const turnId = userAction.closest('[data-ut]')?.dataset.ut; userAction.dataset.ua === 'edit' ? editUser(turnId) : deleteUser(turnId); return; }
    const assistantAction = event.target.closest('.assistant-actions .action-button');
    if (assistantAction) {
      event.preventDefault(); event.stopImmediatePropagation();
      const turnId = assistantAction.closest('.assistant-actions')?.dataset.at;
      const action = assistantAction.dataset.action;
      const state = LS();
      const turn = state.turns.find((item) => item.id === turnId);
      if (!turn) return;
      const ui = C(turn.user.active, turn.user.variants.length || 1);
      const list = turn.assistant.variantsByUserVariant[ui] || [];
      const assistant = list[C(turn.assistant.activeByUserVariant[ui], list.length || 1)];
      if (action === 'copy') { await navigator.clipboard?.writeText(assistant?.content || ''); return; }
      if (action === 'like' || action === 'favorite') { assistantAction.classList.toggle('is-active'); return; }
      if (action === 'delete') { deleteAssistant(turnId); return; }
      if (action === 'refresh') { generateAssistant(state, turnId); return; }
    }
  }, true);
  document.addEventListener('pointerdown', (event) => {
    const message = event.target.closest('.user-bubble,.assistant-text')?.closest('.message[data-turn]');
    if (!message) return;
    clearTimeout(longTimer);
    longTimer = setTimeout(() => {
      if (confirm(message.dataset.role === 'user' ? '删除当前这一版消息和对应回复？' : '删除当前这一版回复？')) message.dataset.role === 'user' ? deleteUser(message.dataset.turn) : deleteAssistant(message.dataset.turn);
    }, 700);
  }, true);
  ['pointerup', 'pointercancel', 'pointermove', 'scroll'].forEach((name) => document.addEventListener(name, () => clearTimeout(longTimer), true));
  window.addEventListener('storage', (event) => { if (event.key === AK) R(LS()); });
  const start = () => installCanonicalOwner();
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', start) : start();
  window.elementeraChatHistorySyncP301 = { fetchServerHistory: GH, putServerHistory: PH, syncHistorySoon: SY, bootstrapChatHistory: BO, loadState: LS, saveState: SS, renderChat: R };
})();

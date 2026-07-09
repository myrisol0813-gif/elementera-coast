(() => {
  if (window.__ecChatCanon02) return;
  window.__ecChatCanon02 = true;
  window.__elementeraModelBoxP303A = true;

  const CK = 'gpt_like_test_window_messages_clean_v1';
  const TK = 'ec.mainChat.turns.v2';
  const API = '/api/chat/history';
  const AK = 'gpt_like_assistant_avatar_dataurl_v1';
  const MK = 'ec.currentChatModel';
  const ML = 'wolf_model_v092';
  const DM = 'openai/gpt-4.1-nano';
  const MAX = 12000;
  const $ = (s, r = document) => r.querySelector(s);
  const A = (s, r = document) => Array.from(r.querySelectorAll(s));
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
    let u = (Array.isArray(r?.user?.variants) ? r.user.variants : []).filter((x) => typeof x?.content === 'string').map((x) => V(x.content, x)).slice(0, 20);
    let n = Math.max(1, u.length), vb = {}, ab = {};
    for (let i = 0; i < n; i++) {
      let k = '' + i;
      let l = (Array.isArray(r?.assistant?.variantsByUserVariant?.[k]) ? r.assistant.variantsByUserVariant[k] : []).filter((x) => typeof x?.content === 'string').map((x) => V(x.content, x)).slice(0, 20);
      vb[k] = l;
      ab[k] = C(r?.assistant?.activeByUserVariant?.[k], l.length || 1);
    }
    return { id: String(r?.id || ID()), user: { active: C(r?.user?.active, u.length || 1), variants: u }, assistant: { activeByUserVariant: ab, variantsByUserVariant: vb } };
  }
  function FT(a) {
    let turns = [], cur = null;
    for (let m of FM(a)) {
      if (m.role === 'user') {
        cur = { id: 'turn_' + m.id, user: { active: 0, variants: [V(m.content, m)] }, assistant: { activeByUserVariant: { 0: 0 }, variantsByUserVariant: { 0: [] } } };
        turns.push(cur);
      } else if (cur) cur.assistant.variantsByUserVariant[0].push(V(m.content, m));
      else turns.push({ id: 'turn_' + m.id, user: { active: 0, variants: [] }, assistant: { activeByUserVariant: { 0: 0 }, variantsByUserVariant: { 0: [V(m.content, m)] } } });
    }
    return NS({ v: 2, turns });
  }
  function NS(r) {
    if (Array.isArray(r)) return FT(r);
    let ts = (Array.isArray(r?.turns) ? r.turns : []).map(NT).filter((t) => t.user.variants.length || Object.values(t.assistant.variantsByUserVariant).some((l) => l.length)).slice(-100);
    return { v: 2, updated_at: r?.updated_at || NO(), turns: ts };
  }
  function LS() {
    let s = J(TK, null);
    return s?.v === 2 ? NS(s) : FT(J(CK, []));
  }
  function AM(s) {
    let out = [];
    for (let t of NS(s).turns) {
      let ui = C(t.user.active, t.user.variants.length || 1), u = t.user.variants[ui];
      if (u?.content) out.push({ id: u.id, role: 'user', content: u.content, created_at: u.created_at });
      let l = t.assistant.variantsByUserVariant[ui] || [], a = l[C(t.assistant.activeByUserVariant[ui], l.length || 1)];
      if (a?.content) out.push({ id: a.id, role: 'assistant', content: a.content, created_at: a.created_at, ...(a.errorDetail ? { errorDetail: a.errorDetail } : {}) });
    }
    return out;
  }
  function SS(s, sy = true) {
    s = NS({ ...s, updated_at: NO() });
    W(TK, s);
    W(CK, AM(s));
    if (sy) SY(s);
    return s;
  }
  async function GH() {
    let r = await fetch(API, { credentials: 'same-origin', cache: 'no-store' }), d = await r.json().catch(() => ({}));
    if (!r.ok || d.ok === false) throw Error(d?.error?.message || 'history ' + r.status);
    return NS(d.history || d);
  }
  async function PH(s) {
    let r = await fetch(API, { method: 'PUT', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(NS(s)) }), d = await r.json().catch(() => ({}));
    if (!r.ok || d.ok === false) throw Error(d?.error?.message || 'put ' + r.status);
  }
  function SY(s) {
    s = NS(s);
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => PH(s).catch((e) => console.warn('[P3-CHAT-CANON-02]', e)), 800);
  }
  async function BO() {
    let local = LS();
    try {
      let server = await GH();
      if (server.turns.length) { SS(server, false); R(server); }
      else { R(local); if (local.turns.length) SY(local); }
    } catch (e) { console.warn('[P3-CHAT-CANON-02] fetch', e); R(local); }
  }
  function AV() {
    let u = localStorage.getItem(AK) || '';
    return `<div class="avatar ${u ? 'has-custom-avatar' : ''}" ${u ? `style="background-image:url(${u})"` : ''}>${u ? '' : '⌁'}</div>`;
  }
  function BT(n, t, x = '') { return `<button class="action-button" type="button" data-action="${n}" ${x} title="${E(t)}"></button>`; }
  function SW(k, t, a, n) {
    return n > 1 ? `<span class="variant-switch-p303a" data-k="${k}" data-t="${E(t.id)}"><button type="button" data-d="p">‹</button><span>${a + 1}/${n}</span><button type="button" data-d="n">›</button></span>` : '';
  }
  function CSS() {
    if ($('#canon02css')) return;
    let s = document.createElement('style');
    s.id = 'canon02css';
    s.textContent = '.variant-switch-p303a{display:inline-flex;gap:6px;margin-left:6px;color:var(--muted);font-size:12px}.variant-switch-p303a button{width:26px;height:24px;border:1px solid var(--line);border-radius:999px;background:transparent;color:var(--text)}.assistant-text .chat-error-detail{display:block;margin-top:8px;color:var(--muted);font-size:12px;line-height:1.55}.message[data-turn]{touch-action:pan-y}.model-box-p303a .mb-note{margin:0 0 16px;color:var(--muted);font-size:13px;line-height:1.6}';
    document.head.appendChild(s);
  }
  function R(s = LS()) {
    s = NS(s);
    let b = $('#messages'), sc = $('#messageScroller');
    if (!b) return;
    b.innerHTML = s.turns.map((t) => {
      let ui = C(t.user.active, t.user.variants.length || 1), u = t.user.variants[ui], l = t.assistant.variantsByUserVariant[ui] || [], ai = C(t.assistant.activeByUserVariant[ui], l.length || 1), a = l[ai], lh = loading && loading.t === t.id && loading.u === ui && loading.a === ai;
      let uh = u ? `<article class="message user" data-turn="${E(t.id)}" data-role="user"><div class="content"><div class="user-bubble">${E(u.content)}</div><div class="user-actions" data-ut="${E(t.id)}">${BT('edit', '编辑', 'data-ua="e"')}${BT('delete', '删除', 'data-ua="d"')}${SW('u', t, ui, t.user.variants.length)}</div></div></article>` : '';
      let ah = a ? `<article class="message assistant" data-turn="${E(t.id)}" data-role="assistant">${AV()}<div class="content"><div class="assistant-text">${HT(a.content)}${a.errorDetail ? `<span class="chat-error-detail">${E(a.errorDetail)}</span>` : ''}${lh ? '<span class="typing-cursor"></span>' : ''}</div><div class="assistant-actions" data-at="${E(t.id)}">${BT('copy', '复制')}${BT('like', '点赞')}${BT('refresh', '重新生成')}${BT('favorite', '收藏')}${BT('delete', '删除')}${SW('a', t, ai, l.length)}</div></div></article>` : '';
      return uh + ah;
    }).join('') + '<div class="thread-spacer"></div>';
    requestAnimationFrame(() => { if (sc) sc.scrollTop = sc.scrollHeight; });
    SS(s, false);
  }
  function M() {
    let m = localStorage.getItem(MK) || DM;
    localStorage.setItem(MK, m);
    localStorage.setItem(ML, m + ' ›');
    let n = $('.model-name');
    if (n) { n.textContent = m + ' ›'; n.title = m; }
    return m;
  }
  function ST(on) {
    let c = $('#callButton'), mic = $('#micButton'), i = $('#promptInput');
    if (!c) return;
    if (on) { c.dataset.icon = 'stop'; c.dataset.busy = 'true'; if (mic) mic.hidden = true; }
    else { c.removeAttribute('data-busy'); c.dataset.icon = (i?.value || '').trim() ? 'send' : 'call'; if (mic && !(i?.value || '').trim()) mic.hidden = false; }
  }
  function CT(s, id) {
    let out = [];
    for (let t of NS(s).turns) {
      let ui = C(t.user.active, t.user.variants.length || 1), u = t.user.variants[ui];
      if (u?.content) out.push({ role: 'user', content: u.content });
      if (t.id === id) break;
      let l = t.assistant.variantsByUserVariant[ui] || [], a = l[C(t.assistant.activeByUserVariant[ui], l.length || 1)];
      if (a?.content && !a.content.startsWith('正在通过海岸 API')) out.push({ role: 'assistant', content: a.content });
    }
    return out.filter((x) => x.content.trim()).slice(-20);
  }
  async function GEN(s, id) {
    let t = s.turns.find((x) => x.id === id);
    if (!t) return;
    let ui = C(t.user.active, t.user.variants.length || 1), k = '' + ui;
    t.assistant.variantsByUserVariant[k] ||= [];
    let a = V('正在通过海岸 API 连接当前模型……');
    t.assistant.variantsByUserVariant[k].push(a);
    let ai = t.assistant.variantsByUserVariant[k].length - 1;
    t.assistant.activeByUserVariant[k] = ai;
    loading = { t: id, u: ui, a: ai };
    ST(true); R(s); SY(s);
    let model = M(), set = window.elementeraRunControl?.getSettings?.() || {}, ma = set.outputLength === 'long' ? 1200 : set.outputLength === 'short' ? 350 : 600, temp = set.creativity === 'stable' ? 0.3 : set.creativity === 'expansive' ? 1 : .7;
    chatAbort = new AbortController();
    try {
      let r = await fetch('/api/chat', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, signal: chatAbort.signal, body: JSON.stringify({ model, messages: CT(s, id), settings: { max_tokens: ma, temperature: temp } }) }), d = await r.json().catch(() => ({}));
      if (!r.ok || d.ok === false) {
        let e = d.error || {};
        a.content = e.message || '消息生成失败，请稍后重试。';
        a.errorDetail = [`status: ${e.status || r.status || '?'}`, e.type ? `type: ${e.type}` : '', e.providerMessagePreview ? `provider: ${e.providerMessagePreview}` : ''].filter(Boolean).join('\n');
      } else { a.content = d?.message?.content || '模型没有返回文本。'; a.errorDetail = ''; }
    } catch (e) { a.content = e?.name === 'AbortError' ? '已停止生成。' : `请求失败：${e?.message || e}`; a.errorDetail = 'model: ' + model; }
    finally { chatAbort = null; loading = null; ST(false); R(s); SY(s); }
  }
  function SEND(x) {
    let i = $('#promptInput'), s = LS(), t = { id: ID(), user: { active: 0, variants: [V(x)] }, assistant: { activeByUserVariant: { 0: 0 }, variantsByUserVariant: { 0: [] } } };
    s.turns.push(t);
    if (i) { i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); }
    GEN(s, t.id);
  }
  function EU(id) {
    let s = LS(), t = s.turns.find((x) => x.id === id);
    if (!t) return;
    let ui = C(t.user.active, t.user.variants.length || 1), n = prompt('编辑消息', t.user.variants[ui]?.content || '');
    if (n == null || n === t.user.variants[ui]?.content) return;
    t.user.variants.push(V(n));
    let ni = t.user.variants.length - 1;
    t.user.active = ni;
    t.assistant.variantsByUserVariant[ni] = [];
    t.assistant.activeByUserVariant[ni] = 0;
    GEN(s, t.id);
  }
  function DU(id) {
    let s = LS(), ti = s.turns.findIndex((x) => x.id === id), t = s.turns[ti];
    if (!t) return;
    let ui = C(t.user.active, t.user.variants.length || 1);
    if (t.user.variants.length <= 1) s.turns.splice(ti, 1);
    else {
      t.user.variants.splice(ui, 1);
      let nv = {}, na = {};
      for (let i = 0; i < t.user.variants.length; i++) {
        let old = '' + (i >= ui ? i + 1 : i), k = '' + i;
        nv[k] = t.assistant.variantsByUserVariant[old] || [];
        na[k] = C(t.assistant.activeByUserVariant[old], nv[k].length || 1);
      }
      t.user.active = Math.min(ui, t.user.variants.length - 1);
      t.assistant.variantsByUserVariant = nv;
      t.assistant.activeByUserVariant = na;
    }
    R(s); SY(s);
  }
  function DA(id) {
    let s = LS(), t = s.turns.find((x) => x.id === id);
    if (!t) return;
    let ui = C(t.user.active, t.user.variants.length || 1), l = t.assistant.variantsByUserVariant[ui] || [];
    if (!l.length) return;
    let ai = C(t.assistant.activeByUserVariant[ui], l.length);
    l.splice(ai, 1);
    t.assistant.activeByUserVariant[ui] = Math.min(ai, Math.max(0, l.length - 1));
    R(s); SY(s);
  }
  function SV(id, k, d) {
    let s = LS(), t = s.turns.find((x) => x.id === id);
    if (!t) return;
    if (k === 'u') {
      let n = t.user.variants.length;
      t.user.active = (C(t.user.active, n) + (d === 'n' ? 1 : -1) + n) % n;
    } else {
      let ui = C(t.user.active, t.user.variants.length || 1), l = t.assistant.variantsByUserVariant[ui] || [], n = l.length;
      if (n > 1) t.assistant.activeByUserVariant[ui] = (C(t.assistant.activeByUserVariant[ui], n) + (d === 'n' ? 1 : -1) + n) % n;
    }
    R(s); SY(s);
  }
  function BOX() {
    let p = $('#modelBoxPanelP303A');
    if (!p) { p = document.createElement('section'); p.id = 'modelBoxPanelP303A'; p.className = 'clean-panel model-box-p303a'; document.body.appendChild(p); }
    p.hidden = false;
    p.innerHTML = `<header class="clean-head"><button class="clean-back" type="button" data-mb-back>←</button><div><h1>模型箱</h1><p>当前主聊天模型</p></div></header><main class="clean-body"><p class="mb-note">当前 chat: ${E(M())}</p><p class="mb-note">主聊天已归一为 turns / variants。</p></main>`;
    document.body.classList.add('wolf-open');
  }
  function EN() {
    let add = (pid, g, src) => {
      let p = $(pid);
      if (!p || $(`[data-mb-entry="${src}"]`, p)) return;
      let sec = A('.clean-group', p).find((x) => ($('h2', x)?.textContent || '').includes(g)), card = sec && $('.clean-card', sec);
      if (!card) return;
      let b = document.createElement('button'); b.type = 'button'; b.className = 'clean-row model-box-entry-p303a'; b.dataset.mbEntry = src; b.innerHTML = '<span><strong>模型箱</strong><small>正式线模型与主聊天状态</small></span>'; card.appendChild(b);
    };
    add('#cleanWolfV093', '账户', 'wolf'); add('#cleanDeskV093', '施工', 'desk');
  }
  function INS() {
    CSS(); M(); R(LS()); BO();
    let i = $('#promptInput'), f = $('#composer'), c = $('#callButton');
    $('#modelBoxPanelP303A')?.setAttribute('hidden', '');
    if (i && !i.dataset.cc2) { i.dataset.cc2 = 1; i.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.stopImmediatePropagation(); }, true); }
    if (f && !f.dataset.cc2) { f.dataset.cc2 = 1; f.addEventListener('submit', (e) => { e.preventDefault(); e.stopImmediatePropagation(); let x = (i?.value || '').trim(); if (chatAbort) return chatAbort.abort(); if (x) SEND(x); }, true); }
    if (c && !c.dataset.cc2) { c.dataset.cc2 = 1; c.addEventListener('click', (e) => { e.preventDefault(); e.stopImmediatePropagation(); if (chatAbort) return chatAbort.abort(); let x = (i?.value || '').trim(); if (x) SEND(x); }, true); }
    EN(); BO();
  }
  document.addEventListener('click', async (e) => {
    if (e.target.closest('#modelButton') || e.target.closest('[data-mb-entry]')) { e.preventDefault(); e.stopPropagation(); BOX(); return; }
    if (e.target.closest('[data-mb-back]')) { e.preventDefault(); e.stopPropagation(); let p = $('#modelBoxPanelP303A'); if (p) p.hidden = true; return; }
    let sw = e.target.closest('[data-d]');
    if (sw) { e.preventDefault(); e.stopPropagation(); let w = sw.closest('[data-k]'); SV(w.dataset.t, w.dataset.k, sw.dataset.d); return; }
    let ua = e.target.closest('[data-ua]');
    if (ua) { e.preventDefault(); e.stopPropagation(); let id = ua.closest('[data-ut]')?.dataset.ut; ua.dataset.ua === 'e' ? EU(id) : DU(id); return; }
    let aa = e.target.closest('.assistant-actions .action-button');
    if (aa) {
      e.preventDefault(); e.stopPropagation();
      let id = aa.closest('.assistant-actions')?.dataset.at, ac = aa.dataset.action, s = LS(), t = s.turns.find((x) => x.id === id);
      if (!t) return;
      let ui = C(t.user.active, t.user.variants.length || 1), l = t.assistant.variantsByUserVariant[ui] || [], a = l[C(t.assistant.activeByUserVariant[ui], l.length || 1)];
      if (ac === 'copy') { await navigator.clipboard?.writeText(a?.content || ''); return; }
      if (ac === 'like' || ac === 'favorite') { aa.classList.toggle('is-active'); return; }
      if (ac === 'delete') return DA(id);
      if (ac === 'refresh') return GEN(s, id);
    }
  }, true);
  document.addEventListener('pointerdown', (e) => {
    let m = e.target.closest('.user-bubble,.assistant-text')?.closest('.message[data-turn]');
    if (!m) return;
    clearTimeout(longTimer);
    longTimer = setTimeout(() => { if (confirm(m.dataset.role === 'user' ? '删除当前这一版消息和对应回复？' : '删除当前这一版回复？')) m.dataset.role === 'user' ? DU(m.dataset.turn) : DA(m.dataset.turn); }, 700);
  }, true);
  ['pointerup', 'pointercancel', 'pointermove', 'scroll'].forEach((n) => document.addEventListener(n, () => clearTimeout(longTimer), true));
  window.addEventListener('storage', (e) => { if (e.key === AK) R(LS()); });
  let start = () => { INS(); new MutationObserver(() => EN()).observe(document.body, { childList: true, subtree: true }); };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', start) : start();
  window.elementeraChatHistorySyncP301 = { fetchServerHistory: GH, putServerHistory: PH, syncHistorySoon: SY, bootstrapChatHistory: BO, loadState: LS, saveState: SS, renderChat: R };
})();

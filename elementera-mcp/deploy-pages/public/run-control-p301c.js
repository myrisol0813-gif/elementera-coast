(() => {
  if (window.__elementeraRunControlP301C) return;
  window.__elementeraRunControlP301C = true;

  const storageKey = 'elementera.runControlSettings';
  const apiTempKeys = [
    'elementera.api.tempContext',
    'elementera.api.currentScratchpad',
    'elementera.api.recentContextDraft'
  ];
  const defaultRunControlSettings = {
    modelPreset: 'daily_chat',
    contextMode: 'balanced',
    recentTurns: 8,
    contextBudget: 6000,
    outputLength: 'auto',
    creativity: 'natural',
    memoryRecall: 'low',
    seedRecallLimit: 3,
    scratchpadBudget: 800
  };

  // 后续真正发给模型时，拼装优先级：1 极短屋规/登岛信核心；2 当前小纸条；3 最近原文上下文；4 低频种子；5 当前用户输入。
  // 预算不够时：先裁最旧原文上下文，再裁种子召回，再压缩小纸条；不得裁当前用户输入。

  const q = (s, r = document) => r.querySelector(s);
  const qa = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (v) => String(v ?? '').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  const visible = {
    recentTurns: [[2,'2'],[4,'4'],[8,'8'],[12,'12']],
    contextBudget: [[2000,'低 · 2000'],[6000,'中 · 6000'],[12000,'高 · 12000']],
    outputLength: [['auto','自动'],['short','偏短'],['long','长信']]
  };
  const allowed = {
    modelPreset: ['cheap_test','daily_chat','deep_work'],
    contextMode: ['short','balanced','deep'],
    recentTurns: [2,4,8,12],
    contextBudget: [2000,6000,12000],
    outputLength: ['auto','short','long'],
    creativity: ['stable','natural','expansive'],
    memoryRecall: ['off','low','medium']
  };
  const nums = new Set(['recentTurns','contextBudget','seedRecallLimit','scratchpadBudget']);

  function clamp(v, min, max, fb) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fb;
  }
  function normalize(input) {
    const next = {...defaultRunControlSettings, ...(input || {})};
    if (next.outputLength === 'normal') next.outputLength = 'auto';
    Object.entries(allowed).forEach(([name, list]) => {
      if (nums.has(name)) next[name] = Number(next[name]);
      if (!list.includes(next[name])) next[name] = defaultRunControlSettings[name];
    });
    next.seedRecallLimit = clamp(next.seedRecallLimit, 0, 6, 3);
    next.scratchpadBudget = clamp(next.scratchpadBudget, 0, 2400, 800);
    return next;
  }
  function getSettings() {
    try { return normalize(JSON.parse(localStorage.getItem(storageKey) || 'null')); }
    catch (_) { return {...defaultRunControlSettings}; }
  }
  function saveSettings(next) {
    const clean = normalize(next);
    localStorage.setItem(storageKey, JSON.stringify(clean));
    return clean;
  }
  function setSettings(partial) {
    const clean = saveSettings({...getSettings(), ...(partial || {})});
    const panel = q('#runControlPanelP301C');
    if (panel && !panel.hidden) renderPanel(panel.dataset.source || 'wolf');
    return clean;
  }
  window.elementeraRunControl = { getSettings, setSettings, defaultRunControlSettings, storageKey };

  function installCss() {
    if (q('#runControlStyleP301C')) return;
    const style = document.createElement('style');
    style.id = 'runControlStyleP301C';
    style.textContent = `.run-control-p301c .clean-body{padding-bottom:calc(42px + env(safe-area-inset-bottom,0px))}.run-control-p301c .rc-status{margin:0 0 18px;color:var(--muted);font-size:13px;line-height:1.55}.run-control-p301c .rc-card{display:grid}.run-control-p301c .rc-item{display:grid;gap:10px;padding:17px 18px;border-bottom:1px solid var(--line)}.run-control-p301c .rc-item:last-child{border-bottom:0}.run-control-p301c h3{margin:0;color:var(--text);font-size:19px;font-weight:560;letter-spacing:-.035em}.run-control-p301c .rc-note{margin:0;color:var(--muted);font-size:13px;line-height:1.55}.run-control-p301c .rc-options{display:flex;flex-wrap:wrap;gap:9px;max-width:100%}.run-control-p301c .rc-choice input{position:absolute;opacity:0;pointer-events:none}.run-control-p301c .rc-choice span{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:8px 14px;border:1px solid var(--line);border-radius:999px;background:var(--bg);color:var(--muted);font-size:15px;line-height:1}.run-control-p301c .rc-choice input:checked+span{border-color:var(--call);color:var(--text);box-shadow:0 0 0 1px color-mix(in srgb,var(--call) 34%,transparent)}.run-control-p301c .rc-number input{width:100%;min-height:52px;border:1px solid var(--line);border-radius:18px;background:var(--bg);color:var(--text);padding:13px 16px;outline:0;font-size:18px}.run-control-p301c .rc-info{padding:16px 18px;background:color-mix(in srgb,var(--panel) 82%,var(--bg));border-bottom:1px solid var(--line)}.run-control-p301c .rc-info strong{display:block;margin-bottom:6px;color:var(--text);font-size:17px}.run-control-p301c .rc-clear button{min-height:72px;padding:16px 18px;border-bottom:1px solid var(--line);text-align:left;color:var(--text);background:transparent}.run-control-p301c .rc-clear button:last-child{border-bottom:0}.run-control-p301c .rc-clear strong{display:block;font-size:18px;letter-spacing:-.03em}.run-control-p301c .rc-clear small{display:block;margin-top:5px;color:var(--muted);font-size:13px;line-height:1.45}.run-control-p301c .rc-clear button:disabled{opacity:.56;cursor:not-allowed}.run-control-p301c .rc-danger strong{color:#d66a53!important}@media(max-width:720px){.run-control-p301c .rc-options{gap:8px}.run-control-p301c .rc-choice span{border-radius:14px}.run-control-p301c .rc-item,.run-control-p301c .rc-info{padding:16px}.run-control-p301c .rc-clear button{min-height:76px}}`;
    document.head.appendChild(style);
  }

  function choices(name, title, note = '') {
    const s = getSettings();
    const buttons = visible[name].map(([value, label]) => `<label class="rc-choice"><input type="radio" name="${name}" value="${esc(value)}" ${s[name] === value ? 'checked' : ''}><span>${esc(label)}</span></label>`).join('');
    return `<div class="rc-item"><h3>${esc(title)}</h3><div class="rc-options">${buttons}</div>${note ? `<p class="rc-note">${esc(note)}</p>` : ''}</div>`;
  }
  function number(name, title, min, max, step, note) {
    const s = getSettings();
    return `<label class="rc-item rc-number"><h3>${esc(title)}</h3><input type="number" name="${name}" min="${min}" max="${max}" step="${step}" inputmode="numeric" value="${esc(s[name])}"><p class="rc-note">${esc(note)}</p></label>`;
  }
  function info(title, note) {
    return `<div class="rc-info"><strong>${esc(title)}</strong><p class="rc-note">${esc(note)}</p></div>`;
  }
  function group(title, body) {
    return `<section class="clean-group"><h2>${esc(title)}</h2><div class="clean-card rc-card">${body}</div></section>`;
  }
  function html() {
    return `<header class="clean-head"><button class="clean-back" type="button" data-rc-back>←</button><div><h1>API 小屋运行控制层</h1><p>Local settings · Context · Token budget</p></div></header><main class="clean-body"><p class="rc-status">已保存到 localStorage：${storageKey}</p>${group('上下文预算', choices('recentTurns','最近上下文轮数') + choices('contextBudget','上下文 token 预算','预算值，当前不做精确 tokenizer 计算。'))}${group('输出偏好', choices('outputLength','回答长度','默认由模型按话题判断长度；这里只作为临时偏好。'))}${group('小纸条与种子 · 预留', number('scratchpadBudget','小纸条预算 · 预留',0,2400,100,'当前只保存预算，不生成小纸条。') + number('seedRecallLimit','种子召回上限 · 预留',0,6,1,'未来最多允许带入几粒种子；模型可自行选择 0 到上限。当前不召回真实种子。') + info('记忆召回：暂未接入','未来默认自动低频，由模型按相关性判断。'))}<section class="clean-group"><h2>应急清理</h2><div class="clean-card rc-clear"><button type="button" class="rc-danger" data-rc-clear><strong>清空 API 临时上下文</strong><small>以后接 API 后，用于重置请求前临时拼装；不会删除聊天记录。</small></button><button type="button" disabled><strong>清空当前小纸条 · 暂未接入</strong><small>以后当小纸条误抓重点、造成复读时使用。</small></button><button type="button" disabled><strong>清空待确认袋 · 暂未接入</strong><small>以后当落袋候选堆乱、不想处理时使用。</small></button></div></section></main>`;
  }

  function renderPanel(source) {
    installCss();
    let panel = q('#runControlPanelP301C');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'runControlPanelP301C';
      panel.className = 'clean-panel run-control-p301c';
      document.body.appendChild(panel);
    }
    panel.dataset.source = source || panel.dataset.source || 'wolf';
    panel.hidden = false;
    panel.innerHTML = html();
    q('#cleanWolfV093')?.setAttribute('hidden','');
    q('#cleanDeskV093')?.setAttribute('hidden','');
    document.body.classList.add('wolf-open');
  }
  function closePanel() {
    const panel = q('#runControlPanelP301C');
    const source = panel?.dataset.source || 'wolf';
    if (panel) panel.hidden = true;
    const parent = source === 'desk' ? q('#cleanDeskV093') : q('#cleanWolfV093');
    if (parent) parent.hidden = false;
  }
  function addEntry(panelId, groupName, title, sub, source) {
    const panel = q(panelId);
    if (!panel || q(`[data-rc-source="${source}"]`, panel)) return;
    const group = qa('.clean-group', panel).find(x => (q('h2', x)?.textContent || '').includes(groupName));
    const card = group && q('.clean-card', group);
    if (!card) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'clean-row run-control-entry-p301c';
    btn.dataset.rcSource = source;
    btn.innerHTML = `<span><strong>${esc(title)}</strong><small>${esc(sub)}</small></span>`;
    card.appendChild(btn);
  }
  function ensureEntries() {
    installCss();
    addEntry('#cleanWolfV093','账户','API 小屋设置','模型、上下文、token、输出','wolf');
    addEntry('#cleanDeskV093','施工','运行水闸','请求预算、召回预留、清理','desk');
  }
  function saveFrom(panel) {
    const next = {...getSettings()};
    qa('input[name]', panel).forEach(input => {
      if (input.type === 'radio' && !input.checked) return;
      next[input.name] = nums.has(input.name) ? Number(input.value) : input.value;
    });
    saveSettings(next);
  }
  function clearTemp() {
    if (!confirm('确定清空 API 临时上下文吗？这不会清空现有聊天记录。')) return;
    apiTempKeys.forEach(k => localStorage.removeItem(k));
    window.dispatchEvent(new CustomEvent('elementera:api-temp-context-cleared'));
  }

  document.addEventListener('click', event => {
    const entry = event.target.closest('[data-rc-source]');
    if (entry) { event.preventDefault(); event.stopPropagation(); renderPanel(entry.dataset.rcSource || 'wolf'); return; }
    if (event.target.closest('[data-rc-back]')) { event.preventDefault(); event.stopPropagation(); closePanel(); return; }
    if (event.target.closest('[data-rc-clear]')) { event.preventDefault(); event.stopPropagation(); clearTemp(); }
  }, true);
  document.addEventListener('change', event => { const panel = event.target.closest('#runControlPanelP301C'); if (panel) saveFrom(panel); }, true);
  document.addEventListener('input', event => { const panel = event.target.closest('#runControlPanelP301C'); if (panel && event.target.type === 'number') saveFrom(panel); }, true);

  const start = () => { installCss(); ensureEntries(); new MutationObserver(ensureEntries).observe(document.body, {childList:true, subtree:true}); saveSettings(getSettings()); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();

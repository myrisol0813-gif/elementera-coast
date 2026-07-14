import { API, requestJson } from '../core/api.js';
import { escapeAttribute, escapeHtml, q } from '../core/dom.js';

function shortModelName(modelId) {
  const bare = String(modelId || '').split('/').at(-1)?.replace(/:free$/i, '') || '';
  if (!bare) return '';
  if (/^gpt-/i.test(bare)) return bare.replace(/^gpt-/i, 'GPT-').replace(/-(nano|mini|micro)$/i, ' $1');
  return bare;
}

function tokenSuffix(usage) {
  return Number.isFinite(usage?.total_tokens)
    ? ` · ${usage.total_tokens.toLocaleString('en-US')} tok`
    : '';
}

function emptySoil(conversationId) {
  return {
    conversation_id: conversationId,
    current_text: '',
    hand_seeds: [],
    do_not_repeat: '',
    pocket_candidates: [],
    manual_locked: false,
    auto_refresh_enabled: true,
    revision: 1,
  };
}

function textBlock(value, empty = '还没有内容。') {
  const text = String(value || '').trim();
  return `<p>${escapeHtml(text || empty).replace(/\n/g, '<br>')}</p>`;
}

function section(title, body) {
  return `<section class="feature-group"><h2>${escapeHtml(title)}</h2><div class="feature-card feature-prose">${body}</div></section>`;
}

function seedLines(seeds) {
  return (Array.isArray(seeds) ? seeds : []).map((seed) => [
    seed.name || '',
    seed.life_core || '',
    seed.usage_hint || '',
    seed.avoid_hint || '',
  ].join('｜')).join('\n');
}

function parseSeedLines(value, limit) {
  return String(value || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, limit).map((line) => {
    const [name = '', lifeCore = '', usageHint = '', avoidHint = ''] = line.split(/[｜|]/).map((part) => part.trim());
    return {
      name: name || lifeCore,
      life_core: lifeCore || name,
      usage_hint: usageHint,
      avoid_hint: avoidHint,
    };
  });
}

function pocketCandidate(value) {
  if (typeof value === 'string') {
    return { title: value, life_core: value, content: value, usage_hint: '', avoid_hint: '', source_refs: [], source_excerpt: '' };
  }
  return {
    title: value?.title || value?.life_core || value?.content || '',
    life_core: value?.life_core || value?.title || '',
    content: value?.content || value?.life_core || '',
    usage_hint: value?.usage_hint || '',
    avoid_hint: value?.avoid_hint || '',
    source_refs: Array.isArray(value?.source_refs) ? value.source_refs : [],
    source_excerpt: value?.source_excerpt || '',
  };
}

function pocketCandidateLines(candidates) {
  return (Array.isArray(candidates) ? candidates : [])
    .map((item) => pocketCandidate(item).life_core || pocketCandidate(item).title)
    .filter(Boolean)
    .join('\n');
}

function parsePocketCandidateLines(value, existing) {
  const available = (Array.isArray(existing) ? existing : []).map((item) => ({ item, candidate: pocketCandidate(item), used: false }));
  return String(value || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const match = available.find((entry) => !entry.used && (entry.candidate.life_core === line || entry.candidate.title === line));
    if (!match) return line;
    match.used = true;
    return match.item;
  });
}

export function createMemory({ chat, router, toast, storage }) {
  const runtime = {
    soils: new Map(),
    pockets: new Map(),
    entries: { conversation: [], global: [] },
    libraryTab: 'conversation',
    filters: { entryType: '', status: '', query: '' },
    vectorStatus: null,
    soilChains: new Map(),
  };

  function currentId() {
    return chat.getCurrentConversationId();
  }

  function settings() {
    return storage.read().runControl;
  }

  function maxHandSeeds() {
    const value = Number(settings().maxHandSeeds);
    return Number.isFinite(value) ? Math.min(7, Math.max(1, Math.trunc(value))) : 7;
  }

  function currentSoil() {
    const conversationId = currentId();
    return runtime.soils.get(conversationId) || emptySoil(conversationId);
  }

  function currentPockets() {
    return runtime.pockets.get(currentId()) || [];
  }

  async function fetchSoil(conversationId) {
    const data = await requestJson(`${API.memorySoil}?conversation_id=${encodeURIComponent(conversationId)}`);
    const soil = data.soil || emptySoil(conversationId);
    runtime.soils.set(conversationId, soil);
    return soil;
  }

  async function fetchPockets(conversationId) {
    const data = await requestJson(`${API.memoryPockets}?conversation_id=${encodeURIComponent(conversationId)}&status=pending`);
    const pockets = Array.isArray(data.pockets) ? data.pockets : [];
    runtime.pockets.set(conversationId, pockets);
    return pockets;
  }

  async function fetchEntries(scope = runtime.libraryTab) {
    let data;
    if (runtime.filters.query) {
      data = await requestJson(API.memorySearch, {
        method: 'POST',
        body: JSON.stringify({
          conversation_id: currentId(),
          scope,
          entry_type: runtime.filters.entryType,
          status: runtime.filters.status,
          query: runtime.filters.query,
          limit: 100,
        }),
      });
    } else {
      const params = new URLSearchParams({ scope, limit: '100' });
      if (scope === 'conversation') params.set('conversation_id', currentId());
      if (runtime.filters.entryType) params.set('entry_type', runtime.filters.entryType);
      if (runtime.filters.status) params.set('status', runtime.filters.status);
      data = await requestJson(`${API.memoryEntries}?${params}`);
    }
    runtime.entries[scope] = Array.isArray(data.entries) ? data.entries : [];
    return runtime.entries[scope];
  }

  async function fetchVectorStatus() {
    runtime.vectorStatus = await requestJson(API.memoryVectorStatus);
    return runtime.vectorStatus;
  }

  async function onConversationChanged(conversationId) {
    if (!conversationId) return;
    try {
      await Promise.all([fetchSoil(conversationId), fetchPockets(conversationId)]);
      if (currentId() === conversationId) chat.renderMessages();
    } catch (error) {
      console.warn('[memory:load]', error);
    }
  }

  function renderSoilEntry(conversationId) {
    const soil = runtime.soils.get(conversationId) || emptySoil(conversationId);
    const locked = soil.manual_locked ? ' · 已锁定' : '';
    return `<div class="thought-soil-row"><button class="thought-soil-entry" type="button" data-action="memory:soil">思维壤 · ${Math.min(soil.hand_seeds.length, maxHandSeeds())} 粒手持种${locked} <span aria-hidden="true">›</span></button></div>`;
  }

  function soilBody(soil) {
    const limit = maxHandSeeds();
    const activeSeeds = soil.hand_seeds.slice(0, limit);
    const seeds = activeSeeds.length
      ? activeSeeds.map((seed) => `<div class="feature-row static"><span><strong>${escapeHtml(seed.name || seed.life_core)}</strong><small>${escapeHtml(seed.life_core || '')}${seed.usage_hint ? `<br>使用：${escapeHtml(seed.usage_hint)}` : ''}${seed.avoid_hint ? `<br>避免：${escapeHtml(seed.avoid_hint)}` : ''}</small></span></div>`).join('')
      : '<p>还没有手持种。</p>';
    const candidates = soil.pocket_candidates.length
      ? `${soil.pocket_candidates.map((item) => {
        const candidate = pocketCandidate(item);
        return `<div class="feature-row static"><span><strong>${escapeHtml(candidate.title || '可落袋内容')}</strong><small>${escapeHtml(candidate.life_core)}${candidate.source_excerpt ? `<br>来源：${escapeHtml(candidate.source_excerpt)}` : ''}</small></span></div>`;
      }).join('')}<p class="feature-note">这些内容已先放进待确认袋。确认前不会参与召回。</p>`
      : '<p>还没有可落袋内容。</p>';
    const provenance = soil.organized_by_model
      ? `<p class="feature-note generation-provenance">整理 · ${escapeHtml(shortModelName(soil.organized_by_model))}${escapeHtml(tokenSuffix(soil.organize_usage))}</p>`
      : '';
    return `${section('当前', textBlock(soil.current_text, '还没有整理当前方向。'))}
      ${section(`手持种 · ${activeSeeds.length}/${limit}`, seeds)}
      ${section('勿复读', textBlock(soil.do_not_repeat))}
      ${section('可落袋', candidates)}
      <section class="feature-group"><div class="feature-card">
        <button class="feature-row" type="button" data-action="memory:pockets"><span><strong>待确认袋 · ${currentPockets().length}</strong><small>候选会自动停在这里；确认前不会参与召回。</small></span><span>›</span></button>
      </div></section>
      ${provenance}
      <div class="button-row">
        <button type="button" data-action="memory:soil-edit">编辑</button>
        <button type="button" data-action="memory:soil-clear">清空</button>
        ${soil.manual_locked ? '<button type="button" data-action="memory:soil-auto">恢复自动整理</button>' : ''}
      </div>`;
  }

  function soilView() {
    const soil = currentSoil();
    return {
      title: '思维壤',
      subtitle: soil.manual_locked ? '手动内容已锁定' : '当前窗口的轻量便签',
      className: 'memory-soil',
      headerAction: '<button class="feature-head-action" type="button" data-action="memory:done">完成</button>',
      body: soilBody(soil),
    };
  }

  function soilEditView() {
    const soil = currentSoil();
    return {
      title: '编辑思维壤',
      subtitle: '保存后停止自动覆盖',
      className: 'memory-soil-edit',
      body: `<form class="form-stack" data-submit="memory:soil-save">
        <label>当前<textarea name="current_text" rows="4">${escapeHtml(soil.current_text)}</textarea></label>
        <label>手持种<textarea name="hand_seeds" rows="8" placeholder="每行：名称｜生命核｜使用提示｜避免提示">${escapeHtml(seedLines(soil.hand_seeds))}</textarea></label>
        <label>勿复读<textarea name="do_not_repeat" rows="4">${escapeHtml(soil.do_not_repeat)}</textarea></label>
        <label>可落袋<textarea name="pocket_candidates" rows="5" placeholder="每行一项">${escapeHtml(pocketCandidateLines(soil.pocket_candidates))}</textarea></label>
        <button class="primary-wide" type="submit">保存</button>
      </form>`,
    };
  }

  function pocketCard(pocket) {
    const title = pocket.title || pocket.suggested_title || '待确认内容';
    const lifeCore = pocket.life_core || pocket.suggested_life_core || pocket.source_text || '';
    const content = pocket.content || pocket.source_text || '';
    const usageHint = pocket.usage_hint || pocket.suggested_usage_hint || '';
    const avoidHint = pocket.avoid_hint || pocket.suggested_avoid_hint || '';
    const provenance = pocket.generated_by_model
      ? `<p class="feature-note generation-provenance">提炼 · ${escapeHtml(shortModelName(pocket.generated_by_model))}</p>`
      : '';
    return `<article class="feature-card feature-prose" data-pocket-id="${escapeAttribute(pocket.id)}">
      <h2>${escapeHtml(title)}</h2>
      <p><strong>生命核：</strong>${escapeHtml(lifeCore)}</p>
      ${textBlock(content)}
      ${pocket.source_excerpt ? `<p><strong>来源：</strong>${escapeHtml(pocket.source_excerpt)}</p>` : ''}
      ${usageHint ? `<p><strong>使用：</strong>${escapeHtml(usageHint)}</p>` : ''}
      ${avoidHint ? `<p><strong>避免：</strong>${escapeHtml(avoidHint)}</p>` : ''}
      <p class="feature-note">确认后会同时进入当前窗口落袋与总落袋。当前窗口更容易召回；总落袋默认低频沉睡。</p>
      ${provenance}
      <div class="button-row">
        <button class="primary-wide" type="button" data-action="memory:pocket-resolve" data-id="${escapeAttribute(pocket.id)}" data-destination="confirm_pocket">确认落袋</button>
        <button type="button" data-action="memory:pocket-resolve" data-id="${escapeAttribute(pocket.id)}" data-destination="conversation_seed">当前窗口种子</button>
        <button type="button" data-action="memory:pocket-resolve" data-id="${escapeAttribute(pocket.id)}" data-destination="global_seed">总种子</button>
        <button type="button" data-action="memory:pocket-resolve" data-id="${escapeAttribute(pocket.id)}" data-destination="conversation_memory">当前窗口记忆</button>
        <button type="button" data-action="memory:pocket-resolve" data-id="${escapeAttribute(pocket.id)}" data-destination="global_memory">总记忆</button>
        <button type="button" data-action="memory:pocket-edit" data-id="${escapeAttribute(pocket.id)}">编辑</button>
        <button type="button" data-action="memory:pocket-stone" data-id="${escapeAttribute(pocket.id)}">转石头</button>
        <button type="button" data-action="memory:pocket-discard" data-id="${escapeAttribute(pocket.id)}">丢弃</button>
      </div>
    </article>`;
  }

  function pocketsView() {
    const pockets = currentPockets();
    return {
      title: '待确认袋',
      subtitle: '只属于当前窗口的缓冲层',
      className: 'memory-pockets',
      body: pockets.length
        ? `<div class="memory-pocket-list">${pockets.map(pocketCard).join('')}</div>`
        : '<p class="feature-empty">待确认袋是空的。</p>',
    };
  }

  function pocketActionView({ turnId, role }) {
    const messageSource = chat.getPocketSource(turnId, role === 'user' ? 'user' : 'assistant');
    const turnSource = chat.getPocketSource(turnId, 'turn');
    const options = [];
    if (messageSource) options.push(`<button class="feature-row" type="button" data-action="memory:pocket-save" data-turn="${escapeAttribute(turnId)}" data-source="${escapeAttribute(role)}"><span><strong>落袋这条${role === 'user' ? '用户' : '助手'}消息</strong><small>只保存当前 active variant。</small></span><span>›</span></button>`);
    if (turnSource) options.push(`<button class="feature-row" type="button" data-action="memory:pocket-save" data-turn="${escapeAttribute(turnId)}" data-source="turn"><span><strong>落袋这一轮</strong><small>保存当前用户与助手分支。</small></span><span>›</span></button>`);
    return {
      title: '落袋',
      subtitle: '先减负，之后再决定去哪里',
      className: 'memory-pocket-action',
      body: `<p class="feature-note">长按消息会打开这里。落袋只进入待确认袋，不会自动写入记忆。</p>${section('当前内容', textBlock(messageSource?.source_text || turnSource?.source_text || ''))}<section class="feature-group"><div class="feature-card">${options.join('')}</div></section>`,
    };
  }

  function entryCard(entry) {
    const scopeAction = entry.scope === 'conversation'
      ? `<button type="button" data-action="memory:entry-promote" data-id="${escapeAttribute(entry.id)}">提升到总库</button>`
      : `<button type="button" data-action="memory:entry-copy-current" data-id="${escapeAttribute(entry.id)}">复制到当前窗口</button>`;
    const coreAction = entry.entry_type === 'memory'
      ? `<button type="button" data-action="memory:entry-core" data-id="${escapeAttribute(entry.id)}" data-core="${entry.memory_level === 'core' ? '0' : '1'}">${entry.memory_level === 'core' ? '取消 core' : '标记 core'}</button>`
      : '';
    return `<article class="feature-card feature-prose memory-entry-card" data-entry-id="${escapeAttribute(entry.id)}">
      <div class="memory-entry-meta"><span>${entry.entry_type === 'seed' ? '种子' : '记忆'}</span><span>${escapeHtml(entry.status)}</span>${entry.memory_level === 'core' ? '<span>core</span>' : ''}</div>
      <h2>${escapeHtml(entry.title)}</h2>
      <p><strong>生命核：</strong>${escapeHtml(entry.life_core)}</p>
      ${entry.content ? textBlock(entry.content) : ''}
      ${entry.usage_hint ? `<p><strong>使用：</strong>${escapeHtml(entry.usage_hint)}</p>` : ''}
      ${entry.avoid_hint ? `<p><strong>避免：</strong>${escapeHtml(entry.avoid_hint)}</p>` : ''}
      <div class="button-row">
        <button type="button" data-action="memory:entry-edit" data-id="${escapeAttribute(entry.id)}">编辑</button>
        <button type="button" data-action="memory:entry-search" data-id="${escapeAttribute(entry.id)}">搜索</button>
        <button type="button" data-action="memory:entry-archive" data-id="${escapeAttribute(entry.id)}">封存</button>
        <button type="button" data-action="memory:entry-stone" data-id="${escapeAttribute(entry.id)}">转石头</button>
        ${scopeAction}${coreAction}
        <button type="button" data-action="memory:entry-delete" data-id="${escapeAttribute(entry.id)}">删除</button>
      </div>
    </article>`;
  }

  function entryGroup(title, entries, empty) {
    return `<section class="feature-group"><h2>${escapeHtml(title)}</h2>${entries.length
      ? `<div class="memory-entry-list">${entries.map(entryCard).join('')}</div>`
      : `<div class="feature-card"><p class="feature-empty">${escapeHtml(empty)}</p></div>`}</section>`;
  }

  function libraryControls() {
    const { entryType, status, query } = runtime.filters;
    return `<div class="memory-tabs" role="tablist" aria-label="记忆范围">
      <button class="${runtime.libraryTab === 'conversation' ? 'is-active' : ''}" type="button" data-action="memory:tab" data-scope="conversation">当前窗口</button>
      <button class="${runtime.libraryTab === 'global' ? 'is-active' : ''}" type="button" data-action="memory:tab" data-scope="global">总库</button>
    </div>
    <form class="form-stack memory-search-form" data-submit="memory:search">
      <label>搜索<input name="query" type="search" value="${escapeAttribute(query)}" placeholder="搜索标题、生命核或内容"></label>
      <div class="form-grid">
        <label>类型<select name="entry_type"><option value="" ${!entryType ? 'selected' : ''}>种子与记忆</option><option value="seed" ${entryType === 'seed' ? 'selected' : ''}>种子</option><option value="memory" ${entryType === 'memory' ? 'selected' : ''}>记忆</option></select></label>
        <label>状态<select name="status"><option value="" ${!status ? 'selected' : ''}>全部状态</option><option value="active" ${status === 'active' ? 'selected' : ''}>active</option><option value="dormant" ${status === 'dormant' ? 'selected' : ''}>dormant</option><option value="archived" ${status === 'archived' ? 'selected' : ''}>archived</option><option value="stone" ${status === 'stone' ? 'selected' : ''}>stone</option></select></label>
        <button type="submit">搜索</button>
      </div>
    </form>
    <p class="feature-note memory-search-status">${runtime.vectorStatus?.index_ready && runtime.vectorStatus?.ai_binding
      ? '语义检索已连接'
      : '语义检索未连接 · 当前使用文字搜索'}</p>`;
  }

  function memoryView() {
    const entries = runtime.entries[runtime.libraryTab] || [];
    const seeds = entries.filter((entry) => entry.entry_type === 'seed');
    const memories = entries.filter((entry) => entry.entry_type === 'memory');
    const current = runtime.libraryTab === 'conversation';
    const local = current ? `<section class="feature-group"><div class="feature-card">
      <button class="feature-row" type="button" data-action="memory:soil"><span><strong>思维壤 · ${currentSoil().hand_seeds.length} 粒手持种</strong><small>${escapeHtml(currentSoil().current_text || '当前窗口还没有整理方向。')}</small></span><span>›</span></button>
      <button class="feature-row" type="button" data-action="memory:pockets"><span><strong>待确认袋 · ${currentPockets().length}</strong><small>只有确认后才会进入正式库。</small></span><span>›</span></button>
    </div></section>` : '';
    return {
      title: '轨迹记忆',
      subtitle: current ? '当前窗口 · 近岸苗圃与本窗家具' : '总库 · 远岸苗圃与公共家具',
      className: 'memory-library',
      headerAction: '<button class="feature-head-action" type="button" data-action="memory:entry-new">新增</button>',
      body: `${libraryControls()}${local}
        ${entryGroup(current ? '当前窗口种子' : '总种子库', seeds, '这里还没有种子。')}
        ${entryGroup(current ? '当前窗口记忆' : '总记忆库', memories, '这里还没有记忆。')}`,
    };
  }

  function findEntry(id) {
    return [...runtime.entries.conversation, ...runtime.entries.global].find((entry) => entry.id === id) || null;
  }

  function entryEditView({ id = '', scope = runtime.libraryTab } = {}) {
    const entry = id ? findEntry(id) : null;
    const entryType = entry?.entry_type || 'memory';
    return {
      title: entry ? '编辑种子 / 记忆' : '新增种子 / 记忆',
      subtitle: scope === 'global' ? '总库' : '当前窗口',
      className: 'memory-entry-edit',
      body: `<form class="form-stack" data-submit="memory:entry-save" data-id="${escapeAttribute(entry?.id || '')}" data-scope="${escapeAttribute(entry?.scope || scope)}">
        <label>类型<select name="entry_type" ${entry ? 'disabled' : ''}><option value="seed" ${entryType === 'seed' ? 'selected' : ''}>种子</option><option value="memory" ${entryType === 'memory' ? 'selected' : ''}>记忆</option></select></label>
        <label>标题<input name="title" maxlength="120" value="${escapeAttribute(entry?.title || '')}" required></label>
        <label>生命核<textarea name="life_core" rows="5" required>${escapeHtml(entry?.life_core || '')}</textarea></label>
        <label>正文<textarea name="content" rows="8">${escapeHtml(entry?.content || '')}</textarea></label>
        <label>使用提示<textarea name="usage_hint" rows="4">${escapeHtml(entry?.usage_hint || '')}</textarea></label>
        <label>避免提示<textarea name="avoid_hint" rows="4">${escapeHtml(entry?.avoid_hint || '')}</textarea></label>
        <label>状态<select name="status"><option value="active" ${entry?.status === 'active' || (!entry && entryType === 'memory') ? 'selected' : ''}>active</option><option value="dormant" ${entry?.status === 'dormant' || (!entry && entryType === 'seed') ? 'selected' : ''}>dormant</option><option value="archived" ${entry?.status === 'archived' ? 'selected' : ''}>archived</option><option value="stone" ${entry?.status === 'stone' ? 'selected' : ''}>stone</option></select></label>
        <label>记忆级别<select name="memory_level"><option value="ordinary" ${entry?.memory_level !== 'core' ? 'selected' : ''}>ordinary</option><option value="core" ${entry?.memory_level === 'core' ? 'selected' : ''}>core（只对记忆生效）</option></select></label>
        <button class="primary-wide" type="submit">保存</button>
      </form>`,
    };
  }

  function vectorStatusView() {
    const status = runtime.vectorStatus || {};
    const dimensions = status.detected_dimensions == null ? '尚未探测成功' : String(status.detected_dimensions);
    return {
      title: '向量状态',
      subtitle: status.index_ready ? '语义检索已连接' : 'D1 正常 · 语义检索未连接',
      className: 'memory-vector-status',
      body: `<section class="feature-group"><div class="feature-card">
        <div class="feature-row static"><span><strong>Workers AI</strong><small>${status.ai_binding ? '已绑定' : '未绑定'}</small></span></div>
        <div class="feature-row static"><span><strong>Embedding 模型</strong><small>${escapeHtml(status.embedding_model || '@cf/baai/bge-m3')}</small></span></div>
        <div class="feature-row static"><span><strong>实际 dimensions</strong><small>${escapeHtml(dimensions)}</small></span></div>
        <div class="feature-row static"><span><strong>Vectorize</strong><small>${status.index_ready ? 'ready' : '未连接'}</small></span></div>
        <div class="feature-row static"><span><strong>索引 / binding</strong><small>${escapeHtml(status.index_name || 'elementera-coast-memory-v1')} · ${escapeHtml(status.binding_name || 'COAST_MEMORY_VECTOR')}</small></span></div>
        <div class="feature-row static"><span><strong>索引队列</strong><small>pending ${Number(status.pending_count || 0)} · ready ${Number(status.ready_count || 0)} · error ${Number(status.error_count || 0)}</small></span></div>
      </div></section>
      ${status.probe_error ? `<p class="feature-note">维度探测失败：${escapeHtml(status.probe_error)}</p>` : ''}
      <div class="button-row"><button type="button" data-action="memory:vector-refresh">重新检查</button></div>`,
    };
  }

  router.register('thought-soil', soilView);
  router.register('thought-soil-edit', soilEditView);
  router.register('memory-pockets', pocketsView);
  router.register('memory-pocket-action', pocketActionView);
  router.register('memory', memoryView);
  router.register('memory-entry-edit', entryEditView);
  router.register('memory-vector-status', vectorStatusView);

  async function openSoil() {
    const conversationId = currentId();
    if (!conversationId) return;
    if (!runtime.soils.has(conversationId)) await onConversationChanged(conversationId);
    return router.open('thought-soil');
  }

  async function openPockets() {
    await fetchPockets(currentId());
    return router.open('memory-pockets');
  }

  async function openLibrary(scope = runtime.libraryTab) {
    runtime.libraryTab = scope === 'global' ? 'global' : 'conversation';
    if (runtime.libraryTab === 'conversation') {
      await Promise.all([fetchSoil(currentId()), fetchPockets(currentId()), fetchEntries('conversation'), fetchVectorStatus()]);
    } else await Promise.all([fetchEntries('global'), fetchVectorStatus()]);
    return router.open('memory');
  }

  async function showVectorStatus() {
    await fetchVectorStatus();
    return router.open('memory-vector-status');
  }

  async function clearSoil({ ask = true } = {}) {
    if (ask && !confirm('清空当前思维壤？种子库、记忆库和聊天记录不会被删除。')) return false;
    const data = await requestJson(`${API.memorySoil}?conversation_id=${encodeURIComponent(currentId())}`, {
      method: 'PUT',
      body: JSON.stringify({ current_text: '', hand_seeds: [], do_not_repeat: '', pocket_candidates: [], manual_locked: true }),
    });
    runtime.soils.set(currentId(), data.soil);
    chat.renderMessages();
    return true;
  }

  function openPocketAction({ turnId, role }) {
    if (!turnId || !['user', 'assistant'].includes(role)) return;
    return router.open('memory-pocket-action', { turnId, role });
  }

  async function savePocket(turnId, source) {
    const payload = chat.getPocketSource(turnId, source);
    if (!payload) throw new Error('当前版本没有可以落袋的内容。');
    const data = await requestJson(API.memoryPockets, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const pockets = currentPockets();
    runtime.pockets.set(currentId(), [data.pocket, ...pockets.filter((item) => item.id !== data.pocket.id)]);
    await router.back();
    toast('已经先放进待确认袋。');
  }

  async function patchCurrentPocket(id, patch) {
    const data = await requestJson(`${API.memoryPockets}/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    runtime.pockets.set(currentId(), currentPockets().map((item) => item.id === id ? data.pocket : item));
    await router.refresh();
    return data.pocket;
  }

  async function resolveCurrentPocket(id, action) {
    const pocket = currentPockets().find((item) => item.id === id);
    if (!pocket) return;
    await requestJson(`${API.memoryPockets}/${encodeURIComponent(id)}/resolve`, {
      method: 'POST',
      body: JSON.stringify({
        action,
        title: pocket.title || pocket.suggested_title,
        life_core: pocket.life_core || pocket.suggested_life_core || pocket.source_text,
        content: pocket.content || pocket.source_text,
        usage_hint: pocket.usage_hint || pocket.suggested_usage_hint,
        avoid_hint: pocket.avoid_hint || pocket.suggested_avoid_hint,
        source_refs: pocket.source_refs,
        source_excerpt: pocket.source_excerpt,
      }),
    });
    runtime.pockets.set(currentId(), currentPockets().filter((item) => item.id !== id));
    if (['conversation_seed', 'conversation_memory'].includes(action)) await fetchEntries('conversation');
    if (['global_seed', 'global_memory'].includes(action)) await fetchEntries('global');
    await router.refresh();
    toast(action === 'stone'
      ? '已经转成石头。'
      : action === 'discard'
        ? '已经丢弃。'
        : action === 'confirm_pocket'
          ? '已经确认落袋，两条召回路径都准备好了。'
          : '已经放进正式库。');
  }

  async function updateEntry(id, patch) {
    const data = await requestJson(`${API.memoryEntries}/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    await fetchEntries(runtime.libraryTab);
    return data;
  }

  async function handleAction(name, target) {
    if (name === 'open') return openLibrary('conversation');
    if (name === 'soil') return openSoil();
    if (name === 'done') return router.back();
    if (name === 'soil-edit') return router.open('thought-soil-edit');
    if (name === 'pockets') return openPockets();
    if (name === 'soil-clear') {
      if (!await clearSoil()) return;
      return router.refresh();
    }
    if (name === 'soil-auto') {
      const data = await requestJson(`${API.memorySoil}?conversation_id=${encodeURIComponent(currentId())}`, {
        method: 'PUT',
        body: JSON.stringify({ manual_locked: false, auto_refresh_enabled: true }),
      });
      runtime.soils.set(currentId(), data.soil);
      chat.renderMessages();
      return router.refresh();
    }
    if (name === 'pocket-save') return savePocket(target.dataset.turn, target.dataset.source);
    if (name === 'pocket-resolve') return resolveCurrentPocket(target.dataset.id, target.dataset.destination);
    if (name === 'pocket-edit') {
      const pocket = currentPockets().find((item) => item.id === target.dataset.id);
      if (!pocket) return;
      const title = prompt('待确认标题', pocket.title || pocket.suggested_title || '');
      if (title == null) return;
      const lifeCore = prompt('生命核', pocket.life_core || pocket.suggested_life_core || pocket.source_text || '');
      if (lifeCore == null) return;
      const content = prompt('正文 / 内容', pocket.content || pocket.source_text || '');
      if (content == null) return;
      const sourceExcerpt = prompt('来源短摘录', pocket.source_excerpt || '');
      if (sourceExcerpt == null) return;
      const usageHint = prompt('使用提示', pocket.usage_hint || pocket.suggested_usage_hint || '');
      if (usageHint == null) return;
      const avoidHint = prompt('避免提示', pocket.avoid_hint || pocket.suggested_avoid_hint || '');
      if (avoidHint == null) return;
      return patchCurrentPocket(pocket.id, {
        title,
        life_core: lifeCore,
        content,
        source_excerpt: sourceExcerpt,
        usage_hint: usageHint,
        avoid_hint: avoidHint,
      });
    }
    if (name === 'pocket-stone' || name === 'pocket-discard') {
      return resolveCurrentPocket(target.dataset.id, name === 'pocket-stone' ? 'stone' : 'discard');
    }
    if (name === 'tab') {
      runtime.libraryTab = target.dataset.scope === 'global' ? 'global' : 'conversation';
      await fetchEntries(runtime.libraryTab);
      return router.refresh({ preserveScroll: false });
    }
    if (name === 'entry-new') return router.open('memory-entry-edit', { scope: runtime.libraryTab });
    if (name === 'vector-status') return showVectorStatus();
    if (name === 'vector-refresh') {
      await fetchVectorStatus();
      return router.refresh();
    }
    if (name === 'entry-edit') return router.open('memory-entry-edit', { id: target.dataset.id, scope: runtime.libraryTab });
    const entry = findEntry(target.dataset.id);
    if (name === 'entry-search' && entry) {
      runtime.filters.query = entry.title || entry.life_core;
      await fetchEntries(runtime.libraryTab);
      return router.refresh({ preserveScroll: false });
    }
    if (name === 'entry-archive') {
      await updateEntry(target.dataset.id, { status: 'archived' });
      return router.refresh();
    }
    if (name === 'entry-stone') {
      await updateEntry(target.dataset.id, { status: 'stone' });
      return router.refresh();
    }
    if (name === 'entry-promote') {
      await updateEntry(target.dataset.id, { scope: 'global' });
      toast('已经提升到总库。');
      return router.refresh();
    }
    if (name === 'entry-copy-current') {
      await updateEntry(target.dataset.id, { scope: 'conversation', conversation_id: currentId() });
      toast('已经复制到当前窗口。');
      return router.refresh();
    }
    if (name === 'entry-core') {
      await updateEntry(target.dataset.id, { memory_level: target.dataset.core === '1' ? 'core' : 'ordinary' });
      return router.refresh();
    }
    if (name === 'entry-delete') {
      if (!confirm('删除这条种子或记忆？这是软删除，不会物理清空 D1。')) return;
      await requestJson(`${API.memoryEntries}/${encodeURIComponent(target.dataset.id)}`, { method: 'DELETE' });
      await fetchEntries(runtime.libraryTab);
      return router.refresh();
    }
  }

  async function handleSubmit(name, form) {
    const field = (fieldName) => q(`[name="${fieldName}"]`, form)?.value || '';
    if (name === 'search') {
      runtime.filters = {
        query: field('query').trim(),
        entryType: field('entry_type'),
        status: field('status'),
      };
      await fetchEntries(runtime.libraryTab);
      return router.refresh({ preserveScroll: false });
    }
    if (name === 'entry-save') {
      const id = form.dataset.id;
      const entryType = field('entry_type') || findEntry(id)?.entry_type || 'memory';
      const payload = {
        entry_type: entryType,
        scope: form.dataset.scope,
        conversation_id: form.dataset.scope === 'conversation' ? currentId() : null,
        title: field('title'),
        life_core: field('life_core'),
        content: field('content'),
        usage_hint: field('usage_hint'),
        avoid_hint: field('avoid_hint'),
        status: field('status') || (entryType === 'seed' ? 'dormant' : 'active'),
        memory_level: field('memory_level') || 'ordinary',
      };
      await requestJson(id ? `${API.memoryEntries}/${encodeURIComponent(id)}` : API.memoryEntries, {
        method: id ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      });
      await fetchEntries(runtime.libraryTab);
      await router.back();
      toast('种子 / 记忆已保存。');
      return;
    }
    if (name !== 'soil-save') return;
    const data = await requestJson(`${API.memorySoil}?conversation_id=${encodeURIComponent(currentId())}`, {
      method: 'PUT',
      body: JSON.stringify({
        current_text: field('current_text'),
        hand_seeds: parseSeedLines(field('hand_seeds'), maxHandSeeds()),
        do_not_repeat: field('do_not_repeat'),
        pocket_candidates: parsePocketCandidateLines(field('pocket_candidates'), currentSoil().pocket_candidates),
        manual_locked: true,
      }),
    });
    runtime.soils.set(currentId(), data.soil);
    chat.renderMessages();
    await router.back();
    toast('思维壤已保存。');
  }

  async function organizeAfterReply(conversationId, trigger, modelId) {
    const landing = trigger === 'landing';
    try {
      const data = await requestJson(API.memorySoilOrganize, {
        method: 'POST',
        body: JSON.stringify({ conversation_id: conversationId, model: modelId, force: true, trigger, settings: settings() }),
      });
      if (data.soil) runtime.soils.set(conversationId, data.soil);
      await Promise.all([fetchSoil(conversationId), fetchPockets(conversationId)]);
      if (currentId() === conversationId) chat.renderMessages();
      return {
        ok: !data.degraded,
        degraded: Boolean(data.degraded),
        skipped: Boolean(data.skipped),
        reason: data.reason || '',
        soil: runtime.soils.get(conversationId) || data.soil || emptySoil(conversationId),
      };
    } catch (error) {
      if (!['soil_locked'].includes(error?.type)) console.warn('[memory:soil-auto]', error);
      try {
        await Promise.all([fetchSoil(conversationId), fetchPockets(conversationId)]);
        if (currentId() === conversationId) chat.renderMessages();
      } catch (fetchError) {
        console.warn(landing ? '[memory:landing-readback]' : '[memory:reply-readback]', fetchError);
      }
      const locked = error?.type === 'soil_locked';
      return {
        ok: locked,
        skipped: locked,
        reason: locked ? 'manual_locked' : (error?.type || 'soil_organize_failed'),
        soil: runtime.soils.get(conversationId) || emptySoil(conversationId),
      };
    }
  }

  function onReplyCompleted(conversationId, { trigger = 'reply', modelId = '' } = {}) {
    const previous = runtime.soilChains.get(conversationId) || Promise.resolve();
    const next = previous.catch(() => undefined).then(() => organizeAfterReply(conversationId, trigger, modelId));
    runtime.soilChains.set(conversationId, next);
    const cleanup = () => {
      if (runtime.soilChains.get(conversationId) === next) runtime.soilChains.delete(conversationId);
    };
    next.then(cleanup, cleanup);
    return next;
  }

  return Object.freeze({
    clearSoil,
    handleAction,
    handleSubmit,
    onConversationChanged,
    onReplyCompleted,
    openPocketAction,
    openPockets,
    showVectorStatus,
    renderSoilEntry,
  });
}

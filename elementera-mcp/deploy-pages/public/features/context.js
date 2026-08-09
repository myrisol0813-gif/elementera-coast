import { API, requestJson } from '../core/api.js';
import { escapeAttribute, escapeHtml, q } from '../core/dom.js';

function countFor(debug, key) {
  return (debug?.blocks || [])
    .filter((item) => item.key === key || item.key.startsWith(`${key}_`))
    .reduce((sum, block) => sum + Number(block?.trace?.match_count || block?.trace?.entry_ids?.length || block?.trace?.selected_entry_ids?.length || 0), 0);
}

function metadata(block) {
  return `${block.source} · ${block.scope} · ${block.priority} · ${block.freshness} · ${block.confidence}`;
}

function blockDetails(block) {
  return `<details class="context-block ${block.sensitive ? 'is-sensitive' : ''}">
    <summary><span><strong>${escapeHtml(block.title)}</strong><small>${escapeHtml(metadata(block))}</small></span><span>›</span></summary>
    <div class="context-block-body"><pre>${escapeHtml(block.body)}</pre>${block.use_hint ? `<p><b>怎么用：</b>${escapeHtml(block.use_hint)}</p>` : ''}${block.avoid_hint ? `<p><b>不要：</b>${escapeHtml(block.avoid_hint)}</p>` : ''}</div>
  </details>`;
}

function localDateTime(date = new Date()) {
  const parts = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')];
  return `${parts.join('-')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function createContext({ chat, router, toast }) {
  const state = {
    conversationId: '',
    current: null,
    modes: [],
    lastDebug: null,
    currentSurface: 'main_chat',
    worldbook: [],
  };

  function renderStatus() {
    const root = q('#contextStatus');
    if (!root) return;
    const mode = state.current?.mode;
    if (!mode) {
      root.hidden = true;
      return;
    }
    const debug = state.lastDebug;
    const memories = debug?.selected_memory_ids?.length || 0;
    const words = countFor(debug, 'worldbook');
    const tools = debug?.tools?.length || state.current?.mode?.tool_allowlist?.length || 0;
    const local = chat.getRunSettings?.() || {};
    const timeOn = local.ambientTime ?? state.current.settings?.ambient?.time;
    const calendarOn = local.ambientCalendar ?? state.current.settings?.ambient?.calendar;
    const toolsOn = local.ambientTools ?? state.current.settings?.ambient?.tools;
    root.innerHTML = `<button type="button" data-action="context:inspector"><span>情境：${escapeHtml(mode.title)}</span><span>环境：${timeOn ? '时间' : '已精简'}${calendarOn ? ' · 日历' : ''}${toolsOn ? ' · 工具' : ''}</span><span>上下文：${memories} 记忆 · ${words} 词典 · ${tools} 工具</span><b>›</b></button>`;
    root.hidden = false;
  }

  async function loadCurrent(conversationId = chat.getCurrentConversationId()) {
    if (!conversationId) return null;
    state.conversationId = conversationId;
    const [current, modes] = await Promise.all([
      requestJson(`${API.contextModeCurrent}?conversation_id=${encodeURIComponent(conversationId)}`),
      state.modes.length ? Promise.resolve({ modes: state.modes }) : requestJson(API.contextModes),
    ]);
    state.current = current.state;
    state.modes = modes.modes || [];
    renderStatus();
    return state.current;
  }

  async function preview() {
    const messages = chat.getActiveMessages();
    const now = new Date();
    const source = messages.some((message) => message.role === 'user')
      ? messages
      : [{ role: 'user', content: '查看当前海岸上下文。' }];
    const data = await requestJson(API.contextPreview, {
      method: 'POST',
      body: JSON.stringify({
        conversation_id: chat.getCurrentConversationId(),
        messages: source,
        local_date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
        local_datetime: localDateTime(now),
        model: chat.getProfile().current_chat_model,
        settings: chat.getRunSettings?.() || {},
        surface: 'main_chat',
      }),
    });
    state.lastDebug = data.debug;
    state.currentSurface = 'main_chat';
    renderStatus();
    return data.debug;
  }

  async function previewSurface(surface, records = []) {
    if (!['radio', 'lighthouse'].includes(surface)) throw new Error('这个房间没有开放 Context Inspector。');
    const messages = records.map((record) => ({
      role: record.actor === 'xiaohan' ? 'user' : 'assistant',
      content: surface === 'radio' ? record.text : record.body,
      turn_id: record.id,
      source: record.surface,
    })).filter((message) => message.content);
    if (!messages.some((message) => message.role === 'user')) {
      messages.push({ role: 'user', content: surface === 'radio' ? '查看当前无线电波房上下文。' : '查看当前灯塔来信房上下文。' });
    }
    const now = new Date();
    const data = await requestJson(API.contextPreview, {
      method: 'POST',
      body: JSON.stringify({
        surface,
        room_id: surface,
        conversation_id: `coast-room:${surface}:owner`,
        messages,
        local_date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
        local_datetime: localDateTime(now),
        model: chat.getProfile().current_chat_model,
        settings: chat.getRunSettings?.() || {},
      }),
    });
    state.lastDebug = data.debug;
    state.currentSurface = surface;
    return data.debug;
  }

  async function inspectorView() {
    const debug = state.lastDebug || await preview();
    const budget = debug.budget || {};
    return {
      title: 'Context Inspector',
      subtitle: '本轮递给 Myri 的同一份装配结果',
      className: 'context-inspector-panel',
      headerAction: '<button class="feature-head-action" type="button" data-action="context:copy-debug">复制 JSON</button>',
      body: `<section class="context-overview">
        <div><small>Surface</small><strong>${escapeHtml(debug.surface_profile?.title || state.currentSurface)}</strong></div>
        <div><small>情境</small><strong>${escapeHtml(debug.mode?.title || '普通聊天')}</strong></div>
        <div><small>估算 token</small><strong>${Number(budget.estimated_tokens || 0).toLocaleString()}</strong></div>
        <div><small>工具</small><strong>${debug.tools?.length || 0}</strong></div>
      </section>
      <section class="context-budget-trace"><strong>预算 ${Number(budget.budget || 0).toLocaleString()}</strong><span>${budget.current_user_preserved ? '当前输入已保留' : '⚠ 当前输入未保留'} · ${budget.compression_applied ? '思维壤已压缩' : '无需额外压缩'}${debug.has_stale_block ? ' · 有旧块' : ''}</span><small>思维壤 ${Number(budget.soil_original_length || 0).toLocaleString()} → ${Number(budget.soil_model_length || 0).toLocaleString()} 字 · 最近消息保留 ${budget.recent_messages_kept || 0} · 裁剪：情境面 ${budget.trimmed?.memory_facets || 0} / 词典 ${budget.trimmed?.worldbook || 0} / 助手 ${budget.trimmed?.assistant_messages || 0} / 用户 ${budget.trimmed?.user_messages || 0}</small></section>
      <details class="context-block"><summary><span><strong>Intent Sanitizer</strong><small>原文节选与本轮摘要</small></span><span>›</span></summary><div class="context-block-body"><p><b>原文节选：</b>${escapeHtml(debug.intent_raw_excerpt || '—')}</p><p><b>意图摘要：</b>${escapeHtml(debug.intent_summary || '—')}</p></div></details>
      <details class="context-block is-sensitive"><summary><span><strong>Thinking Soil 双出口</strong><small>完整 ${Number(debug.full_soil?.length || 0).toLocaleString()} 字 · 模型 ${Number(debug.model_soil_brief?.length || 0).toLocaleString()} 字 · 比例 ${Math.round(Number(debug.soil_compression_ratio || 0) * 100)}%</small></span><span>›</span></summary><div class="context-block-body"><h3>Inspector 完整版</h3><pre>${escapeHtml(debug.full_soil || '（空）')}</pre><h3>模型压缩版</h3><pre>${escapeHtml(debug.model_soil_brief || '（空）')}</pre><h3>Freshness trace</h3><pre>${escapeHtml(JSON.stringify(debug.soil_freshness || [], null, 2))}</pre></div></details>
      <section class="context-block-list">${debug.manifest ? blockDetails(debug.manifest) : ''}${(debug.blocks || []).map(blockDetails).join('')}</section>
      <details class="context-block"><summary><span><strong>召回与工具 trace</strong><small>默认折叠 · 不会注入模型</small></span><span>›</span></summary><div class="context-block-body"><pre>${escapeHtml(JSON.stringify({
        surface_profile: debug.surface_profile,
        selected_memory_ids: debug.selected_memory_ids,
        vector_enabled: debug.vector_enabled,
        worldbook_matches: debug.worldbook_matches,
        tools: debug.tools,
        tool_intersection: debug.tool_intersection,
        budget: debug.budget,
      }, null, 2))}</pre></div></details>`,
    };
  }

  async function modesView() {
    await loadCurrent();
    return {
      title: '当前情境',
      subtitle: '是任务姿态，不是多个 Myri',
      className: 'context-modes-panel',
      body: `<p class="feature-note">切换只会改变本轮提示、工具白名单、词典作用域与记忆使用面；Myri 始终是同一个 Myri。</p><div class="mode-card-list">${state.modes.filter((mode) => mode.enabled).map((mode) => `<button class="mode-card ${state.current?.mode?.mode_key === mode.mode_key ? 'is-active' : ''}" type="button" data-action="context:select-mode" data-key="${escapeAttribute(mode.mode_key)}"><span><strong>${escapeHtml(mode.title)}</strong><small>${escapeHtml(mode.description)}</small></span><i>${state.current?.mode?.mode_key === mode.mode_key ? '当前' : '切换'}</i></button>`).join('')}</div>`,
    };
  }

  async function loadWorldbook() {
    const data = await requestJson(API.contextWorldbook);
    state.worldbook = data.entries || [];
    return state.worldbook;
  }

  async function worldbookView() {
    await loadWorldbook();
    return {
      title: '海岸词典',
      subtitle: '触发式项目概念 · 不和记忆库混放',
      className: 'worldbook-panel',
      headerAction: '<button class="feature-head-action" type="button" data-action="context:new-worldbook">＋ 词条</button>',
      body: `<section class="worldbook-test"><label>试一句<input id="worldbookTestInput" placeholder="例如：思维壤和记忆球有什么区别"></label><button type="button" data-action="context:test-worldbook">测试命中</button><div id="worldbookTestResult"></div></section><div class="worldbook-list">${state.worldbook.map((entry) => `<article class="worldbook-entry ${entry.enabled ? '' : 'is-disabled'}"><button type="button" data-action="context:edit-worldbook" data-id="${escapeAttribute(entry.id)}"><span><strong>${escapeHtml(entry.title)}</strong><small>${escapeHtml(entry.keywords.join(' · ') || '常量词条')}</small></span><i>${entry.scope} · P${entry.priority}</i></button><p>${escapeHtml(entry.content)}</p></article>`).join('')}</div>`,
    };
  }

  function worldbookEditor({ id } = {}) {
    const entry = state.worldbook.find((item) => item.id === id) || {};
    return {
      title: entry.id ? '编辑词典词条' : '新增词典词条',
      subtitle: '按关键词或可选正则触发',
      className: 'worldbook-editor-panel',
      body: `<form class="form-stack" data-submit="context:save-worldbook" data-id="${escapeAttribute(entry.id || '')}"><label>标题<input name="title" required maxlength="160" value="${escapeAttribute(entry.title || '')}"></label><label>内容<textarea name="content" rows="7" required maxlength="12000">${escapeHtml(entry.content || '')}</textarea></label><label>关键词（每行一个）<textarea name="keywords" rows="5">${escapeHtml((entry.keywords || []).join('\n'))}</textarea></label><label>作用域<select name="scope">${['owner', 'visitor', 'both', 'construction', 'mailbox', 'calendar', 'lighthouse', 'radio', 'official_mcp', 'daily'].map((scope) => `<option value="${scope}" ${entry.scope === scope ? 'selected' : ''}>${scope}</option>`).join('')}</select></label><label>优先级<input type="number" name="priority" min="-1000" max="1000" value="${Number(entry.priority || 0)}"></label><label class="calendar-check"><input type="checkbox" name="enabled" ${entry.enabled !== false ? 'checked' : ''}><span>启用</span></label><label class="calendar-check"><input type="checkbox" name="use_regex" ${entry.use_regex ? 'checked' : ''}><span>关键词按正则处理</span></label><label class="calendar-check"><input type="checkbox" name="visitor_safe" ${entry.visitor_safe ? 'checked' : ''}><span>内容可安全用于访客房间</span></label><button class="primary-wide" type="submit">保存词条</button>${entry.id ? '<button class="danger-row context-delete-word" type="button" data-action="context:delete-worldbook">停用并删除入口</button>' : ''}</form>`,
    };
  }

  router.register('context-inspector', inspectorView);
  router.register('context-modes', modesView);
  router.register('context-worldbook', worldbookView);
  router.register('context-worldbook-editor', worldbookEditor);

  async function selectMode(key) {
    const data = await requestJson(API.contextModeCurrent, {
      method: 'PATCH',
      body: JSON.stringify({ conversation_id: chat.getCurrentConversationId(), mode_key: key }),
    });
    state.current = data.state;
    state.lastDebug = null;
    renderStatus();
    toast(`当前情境：${data.state.mode.title}`);
    return router.refresh({ preserveScroll: false });
  }

  async function saveWorldbook(form) {
    const data = new FormData(form);
    const id = form.dataset.id;
    await requestJson(id ? `${API.contextWorldbook}/${encodeURIComponent(id)}` : API.contextWorldbook, {
      method: id ? 'PATCH' : 'POST',
      body: JSON.stringify({
        title: data.get('title'), content: data.get('content'),
        keywords: String(data.get('keywords') || '').split(/\n+/).map((item) => item.trim()).filter(Boolean),
        scope: data.get('scope'), priority: Number(data.get('priority') || 0),
        enabled: data.get('enabled') === 'on', use_regex: data.get('use_regex') === 'on',
        visitor_safe: data.get('visitor_safe') === 'on',
      }),
    });
    toast('海岸词典已经更新。');
    await loadWorldbook();
    return router.open('context-worldbook', {}, { replace: true });
  }

  async function handleAction(name, target) {
    if (name === 'inspector') return router.open('context-inspector');
    if (name === 'modes') return router.open('context-modes');
    if (name === 'worldbook') return router.open('context-worldbook');
    if (name === 'select-mode') return selectMode(target.dataset.key);
    if (name === 'copy-debug') {
      await navigator.clipboard.writeText(JSON.stringify(state.lastDebug || await preview(), null, 2));
      return toast('Context debug JSON 已复制。');
    }
    if (name === 'new-worldbook') return router.open('context-worldbook-editor');
    if (name === 'edit-worldbook') return router.open('context-worldbook-editor', { id: target.dataset.id });
    if (name === 'test-worldbook') {
      const input = q('#worldbookTestInput')?.value || '';
      const data = await requestJson(API.contextWorldbookTest, { method: 'POST', body: JSON.stringify({ input, conversation_id: chat.getCurrentConversationId(), surface: 'main_chat' }) });
      const result = q('#worldbookTestResult');
      if (result) result.innerHTML = data.matches.length ? data.matches.map((entry) => `<span>${escapeHtml(entry.title)}</span>`).join('') : '<small>没有命中词条。</small>';
      return;
    }
    if (name === 'delete-worldbook') {
      const id = target.closest('form')?.dataset.id;
      if (!id || !confirm('要停用这条海岸词典词条吗？')) return;
      await requestJson(`${API.contextWorldbook}/${encodeURIComponent(id)}`, { method: 'DELETE' });
      toast('词条已经停用。');
      await loadWorldbook();
      return router.open('context-worldbook', {}, { replace: true });
    }
  }

  function handleSubmit(name, form) {
    if (name === 'save-worldbook') return saveWorldbook(form);
  }

  function captureDebug(debug) {
    if (!debug) return;
    state.lastDebug = debug;
    state.currentSurface = debug.surface_profile?.surface || 'main_chat';
    renderStatus();
  }

  async function onConversationChanged(conversationId) {
    state.lastDebug = null;
    await loadCurrent(conversationId).catch((error) => console.warn('[context:conversation]', error));
  }

  function useMainSurface() {
    if (state.currentSurface === 'main_chat') return;
    state.currentSurface = 'main_chat';
    state.lastDebug = null;
    renderStatus();
  }

  async function start() {
    await loadCurrent().catch((error) => console.warn('[context:start]', error));
  }

  return Object.freeze({
    start, handleAction, handleSubmit, captureDebug, onConversationChanged, renderStatus,
    previewSurface,
    useMainSurface,
    openInspector: () => router.open('context-inspector'),
  });
}

import { API, requestJson } from '../core/api.js';
import { escapeAttribute, escapeHtml, q } from '../core/dom.js';

function switchRow(name, title, description, checked) {
  return `<button class="feature-row" type="button" data-action="desk:toggle-setting" data-name="${escapeAttribute(name)}" aria-pressed="${checked}"><span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(description)}</small></span><i>${checked ? '已开启' : '已关闭'}</i></button>`;
}

export function createDesk({ chat, router, toast }) {
  const state = {
    conversationId: '',
    settings: null,
    slip: null,
    worldbook: [],
  };

  function renderStatus() {
    const root = q('#deskStatus');
    if (!root) return;
    if (!state.slip) {
      root.hidden = true;
      root.textContent = '';
      return;
    }
    root.innerHTML = `<button type="button" data-action="desk:open"><span>${escapeHtml(state.slip.summary || '本轮桌面')}</span><small>${escapeHtml(state.slip.comfort || '')}</small><b>›</b></button>`;
    root.hidden = false;
  }

  async function loadSettings(conversationId = chat.getCurrentConversationId()) {
    if (!conversationId) return null;
    state.conversationId = conversationId;
    const data = await requestJson(`${API.deskSettings}?conversation_id=${encodeURIComponent(conversationId)}`);
    state.settings = data.settings;
    return state.settings;
  }

  function deskView() {
    const slip = state.slip;
    const settings = state.settings || {};
    return {
      title: '本轮桌面',
      subtitle: slip?.comfort || '只看这一轮实际摆出的纸条',
      className: 'desk-slip-panel',
      body: `<section class="desk-slip-list">
        <article><strong>思维壤</strong><span>${slip?.soil ? '已递给 Myri' : '本轮未摆出'}</span></article>
        <article><strong>相关记忆</strong><span>${Number(slip?.memory_count || 0)} 条</span></article>
        <article><strong>触角轻讯</strong><span>${Number(slip?.touch_count || 0)} 条${slip?.touch_sources?.length ? `，来自 ${escapeHtml(slip.touch_sources.join('、'))}` : ''}</span></article>
        <article><strong>海岸词典</strong><span>${slip?.worldbook_titles?.length ? `命中：${escapeHtml(slip.worldbook_titles.join('、'))}` : '本轮未命中'}</span></article>
        <article><strong>今日海岸</strong><span>${slip?.today_coast ? '已递给 Myri' : '本轮未摆出'}</span></article>
        <article><strong>工作台</strong><span>${slip?.furniture?.length ? escapeHtml(slip.furniture.join('、')) : '本轮没有动用家具'}</span></article>
      </section>
      <section class="feature-group"><h2>窗口小开关</h2>
        ${switchRow('cross_window_light_recall_enabled', '连通一千零一个触角', '只读取其他主聊天窗口少量已整理纸条，不读取原始聊天。', settings.cross_window_light_recall_enabled)}
        ${switchRow('today_coast_reference_enabled', '让 Myri 参考今日海岸', '普通聊天中也可在确有今日状态时递一张实时小条。', settings.today_coast_reference_enabled)}
      </section>`,
    };
  }

  async function loadWorldbook() {
    const data = await requestJson(API.worldbook);
    state.worldbook = data.entries || [];
    return state.worldbook;
  }

  async function worldbookView() {
    await loadWorldbook();
    return {
      title: '海岸词典',
      subtitle: '专有名词按关键词出现，不和记忆库混放',
      className: 'worldbook-panel',
      headerAction: '<button class="feature-head-action" type="button" data-action="desk:new-worldbook">＋ 词条</button>',
      body: `<section class="worldbook-test"><label>试一句<input id="worldbookTestInput" placeholder="例如：连通一千零一个触角是什么"></label><button type="button" data-action="desk:test-worldbook">测试命中</button><div id="worldbookTestResult"></div></section><div class="worldbook-list">${state.worldbook.map((entry) => `<article class="worldbook-entry ${entry.enabled ? '' : 'is-disabled'}"><button type="button" data-action="desk:edit-worldbook" data-id="${escapeAttribute(entry.id)}"><span><strong>${escapeHtml(entry.title)}</strong><small>${escapeHtml(entry.keywords.join(' · ') || '常驻词条')}</small></span><i>${escapeHtml(entry.scope)}</i></button><p>${escapeHtml(entry.content)}</p></article>`).join('')}</div>`,
    };
  }

  function worldbookEditor({ id } = {}) {
    const entry = state.worldbook.find((item) => item.id === id) || {};
    const scopes = ['owner', 'visitor', 'both', 'mailbox', 'calendar', 'lighthouse', 'radio', 'official_mcp', 'daily'];
    return {
      title: entry.id ? '编辑词典词条' : '新增词典词条',
      subtitle: '内容只会在关键词命中时成为一张干净纸条',
      className: 'worldbook-editor-panel',
      body: `<form class="form-stack" data-submit="desk:save-worldbook" data-id="${escapeAttribute(entry.id || '')}"><label>标题<input name="title" required maxlength="160" value="${escapeAttribute(entry.title || '')}"></label><label>内容<textarea name="content" rows="7" required maxlength="12000">${escapeHtml(entry.content || '')}</textarea></label><label>关键词（每行一个）<textarea name="keywords" rows="5">${escapeHtml((entry.keywords || []).join('\n'))}</textarea></label><label>房间范围<select name="scope">${scopes.map((scope) => `<option value="${scope}" ${entry.scope === scope ? 'selected' : ''}>${scope}</option>`).join('')}</select></label><label>匹配顺序<input type="number" name="priority" min="-1000" max="1000" value="${Number(entry.priority || 0)}"></label><label class="calendar-check"><input type="checkbox" name="enabled" ${entry.enabled !== false ? 'checked' : ''}><span>启用</span></label><label class="calendar-check"><input type="checkbox" name="use_regex" ${entry.use_regex ? 'checked' : ''}><span>关键词按正则处理</span></label><label class="calendar-check"><input type="checkbox" name="visitor_safe" ${entry.visitor_safe ? 'checked' : ''}><span>可安全用于访客房间</span></label><button class="primary-wide" type="submit">保存词条</button>${entry.id ? '<button class="danger-row desk-delete-word" type="button" data-action="desk:delete-worldbook">停用词条</button>' : ''}</form>`,
    };
  }

  router.register('desk-slip', deskView);
  router.register('desk-worldbook', worldbookView);
  router.register('desk-worldbook-editor', worldbookEditor);

  async function saveWorldbook(form) {
    const data = new FormData(form);
    const id = form.dataset.id;
    await requestJson(id ? `${API.worldbook}/${encodeURIComponent(id)}` : API.worldbook, {
      method: id ? 'PATCH' : 'POST',
      body: JSON.stringify({
        title: data.get('title'),
        content: data.get('content'),
        keywords: String(data.get('keywords') || '').split(/\n+/).map((item) => item.trim()).filter(Boolean),
        scope: data.get('scope'),
        priority: Number(data.get('priority') || 0),
        enabled: data.get('enabled') === 'on',
        use_regex: data.get('use_regex') === 'on',
        visitor_safe: data.get('visitor_safe') === 'on',
      }),
    });
    toast('海岸词典已经更新。');
    await loadWorldbook();
    return router.open('desk-worldbook', {}, { replace: true });
  }

  async function handleAction(name, target) {
    if (name === 'open') {
      await loadSettings().catch(() => null);
      return router.open('desk-slip');
    }
    if (name === 'worldbook') return router.open('desk-worldbook');
    if (name === 'new-worldbook') return router.open('desk-worldbook-editor');
    if (name === 'edit-worldbook') return router.open('desk-worldbook-editor', { id: target.dataset.id });
    if (name === 'toggle-setting') {
      const key = target.dataset.name;
      const next = !Boolean(state.settings?.[key]);
      const data = await requestJson(API.deskSettings, {
        method: 'PATCH',
        body: JSON.stringify({ conversation_id: chat.getCurrentConversationId(), [key]: next }),
      });
      state.settings = data.settings;
      toast(next ? '这枚小开关已经打开。' : '这枚小开关已经关上。');
      return router.refresh({ preserveScroll: true });
    }
    if (name === 'test-worldbook') {
      const input = q('#worldbookTestInput')?.value || '';
      const data = await requestJson(API.worldbookTest, { method: 'POST', body: JSON.stringify({ input, surface: 'main_chat' }) });
      const result = q('#worldbookTestResult');
      if (result) result.innerHTML = data.matches.length ? data.matches.map((entry) => `<span>${escapeHtml(entry.title)}</span>`).join('') : '<small>没有命中词条。</small>';
      return;
    }
    if (name === 'delete-worldbook') {
      const id = target.closest('form')?.dataset.id;
      if (!id) return;
      await requestJson(`${API.worldbook}/${encodeURIComponent(id)}`, { method: 'DELETE' });
      toast('词条已经停用。');
      await loadWorldbook();
      return router.open('desk-worldbook', {}, { replace: true });
    }
  }

  function handleSubmit(name, form) {
    if (name === 'save-worldbook') return saveWorldbook(form);
  }

  function captureSlip(slip) {
    if (!slip) return;
    state.slip = slip;
    renderStatus();
  }

  async function onConversationChanged(conversationId) {
    state.slip = null;
    renderStatus();
    await loadSettings(conversationId);
  }

  async function start() {
    await loadSettings().catch((error) => console.warn('[desk:start]', error));
    renderStatus();
  }

  return Object.freeze({
    start,
    handleAction,
    handleSubmit,
    captureSlip,
    onConversationChanged,
    renderStatus,
    open: () => router.open('desk-slip'),
  });
}

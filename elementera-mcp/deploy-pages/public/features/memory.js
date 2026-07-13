import { API, requestJson } from '../core/api.js';
import { escapeAttribute, escapeHtml, q } from '../core/dom.js';

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

function parseSeedLines(value) {
  return String(value || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 7).map((line) => {
    const [name = '', lifeCore = '', usageHint = '', avoidHint = ''] = line.split(/[｜|]/).map((part) => part.trim());
    return {
      name: name || lifeCore,
      life_core: lifeCore || name,
      usage_hint: usageHint,
      avoid_hint: avoidHint,
    };
  });
}

export function createMemory({ chat, router, toast }) {
  const runtime = {
    soils: new Map(),
    pockets: new Map(),
  };

  function currentId() {
    return chat.getCurrentConversationId();
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
    return `<div class="thought-soil-row"><button class="thought-soil-entry" type="button" data-action="memory:soil">思维壤 · ${soil.hand_seeds.length} 粒手持种 <span aria-hidden="true">›</span></button></div>`;
  }

  function soilBody(soil) {
    const seeds = soil.hand_seeds.length
      ? soil.hand_seeds.map((seed) => `<div class="feature-row static"><span><strong>${escapeHtml(seed.name || seed.life_core)}</strong><small>${escapeHtml(seed.life_core || '')}${seed.usage_hint ? `<br>使用：${escapeHtml(seed.usage_hint)}` : ''}${seed.avoid_hint ? `<br>避免：${escapeHtml(seed.avoid_hint)}` : ''}</small></span></div>`).join('')
      : '<p>还没有手持种。</p>';
    const candidates = soil.pocket_candidates.length
      ? `<ul>${soil.pocket_candidates.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
      : '<p>还没有可落袋内容。</p>';
    return `${section('当前', textBlock(soil.current_text, '还没有整理当前方向。'))}
      ${section(`手持种 · ${soil.hand_seeds.length}/7`, seeds)}
      ${section('勿复读', textBlock(soil.do_not_repeat))}
      ${section('可落袋', candidates)}
      <section class="feature-group"><div class="feature-card">
        <button class="feature-row" type="button" data-action="memory:pockets"><span><strong>待确认袋 · ${currentPockets().length}</strong><small>落袋内容先停在这里，不会自动进入种子或记忆。</small></span><span>›</span></button>
      </div></section>
      <div class="button-row">
        <button type="button" data-action="memory:soil-edit">编辑</button>
        <button type="button" data-action="memory:soil-organize">整理思维壤</button>
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
        <label>可落袋<textarea name="pocket_candidates" rows="5" placeholder="每行一项">${escapeHtml(soil.pocket_candidates.join('\n'))}</textarea></label>
        <button class="primary-wide" type="submit">保存</button>
      </form>`,
    };
  }

  function pocketCard(pocket) {
    return `<article class="feature-card feature-prose" data-pocket-id="${escapeAttribute(pocket.id)}">
      <h2>${escapeHtml(pocket.suggested_title || '待确认内容')}</h2>
      ${textBlock(pocket.source_text)}
      ${pocket.suggested_life_core ? `<p><strong>生命核：</strong>${escapeHtml(pocket.suggested_life_core)}</p>` : ''}
      <div class="button-row">
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
      body: `${section('当前内容', textBlock(messageSource?.source_text || turnSource?.source_text || ''))}<section class="feature-group"><div class="feature-card">${options.join('')}</div></section>`,
    };
  }

  router.register('thought-soil', soilView);
  router.register('thought-soil-edit', soilEditView);
  router.register('memory-pockets', pocketsView);
  router.register('memory-pocket-action', pocketActionView);

  async function openSoil() {
    const conversationId = currentId();
    if (!conversationId) return;
    if (!runtime.soils.has(conversationId)) await onConversationChanged(conversationId);
    return router.open('thought-soil');
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

  async function handleAction(name, target) {
    if (name === 'soil') return openSoil();
    if (name === 'done') return router.back();
    if (name === 'soil-edit') return router.open('thought-soil-edit');
    if (name === 'pockets') {
      await fetchPockets(currentId());
      return router.open('memory-pockets');
    }
    if (name === 'soil-clear') {
      if (!confirm('清空当前思维壤？种子库、记忆库和聊天记录不会被删除。')) return;
      const data = await requestJson(`${API.memorySoil}?conversation_id=${encodeURIComponent(currentId())}`, {
        method: 'PUT',
        body: JSON.stringify({ current_text: '', hand_seeds: [], do_not_repeat: '', pocket_candidates: [], manual_locked: true }),
      });
      runtime.soils.set(currentId(), data.soil);
      chat.renderMessages();
      return router.refresh();
    }
    if (name === 'soil-organize') {
      const data = await requestJson(API.memorySoilOrganize, {
        method: 'POST',
        body: JSON.stringify({ conversation_id: currentId(), force: true }),
      });
      runtime.soils.set(currentId(), data.soil);
      chat.renderMessages();
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
    if (name === 'pocket-edit') {
      const pocket = currentPockets().find((item) => item.id === target.dataset.id);
      if (!pocket) return;
      const title = prompt('待确认标题', pocket.suggested_title || '');
      if (title == null) return;
      const lifeCore = prompt('生命核', pocket.suggested_life_core || pocket.source_text || '');
      if (lifeCore == null) return;
      const usageHint = prompt('使用提示', pocket.suggested_usage_hint || '');
      if (usageHint == null) return;
      return patchCurrentPocket(pocket.id, { suggested_title: title, suggested_life_core: lifeCore, suggested_usage_hint: usageHint });
    }
    if (name === 'pocket-stone' || name === 'pocket-discard') {
      const status = name === 'pocket-stone' ? 'stone' : 'discarded';
      await patchCurrentPocket(target.dataset.id, { status });
      runtime.pockets.set(currentId(), currentPockets().filter((item) => item.id !== target.dataset.id));
      return router.refresh();
    }
  }

  async function handleSubmit(name, form) {
    if (name !== 'soil-save') return;
    const field = (fieldName) => q(`[name="${fieldName}"]`, form)?.value || '';
    const data = await requestJson(`${API.memorySoil}?conversation_id=${encodeURIComponent(currentId())}`, {
      method: 'PUT',
      body: JSON.stringify({
        current_text: field('current_text'),
        hand_seeds: parseSeedLines(field('hand_seeds')),
        do_not_repeat: field('do_not_repeat'),
        pocket_candidates: field('pocket_candidates').split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
        manual_locked: true,
      }),
    });
    runtime.soils.set(currentId(), data.soil);
    chat.renderMessages();
    await router.back();
    toast('思维壤已保存。');
  }

  async function onReplyCompleted(conversationId) {
    try {
      const data = await requestJson(API.memorySoilOrganize, {
        method: 'POST',
        body: JSON.stringify({ conversation_id: conversationId, force: false }),
      });
      if (data.soil) runtime.soils.set(conversationId, data.soil);
      if (currentId() === conversationId) chat.renderMessages();
    } catch (error) {
      if (!['soil_locked'].includes(error?.type)) console.warn('[memory:soil-auto]', error);
    }
  }

  return Object.freeze({
    handleAction,
    handleSubmit,
    onConversationChanged,
    onReplyCompleted,
    openPocketAction,
    renderSoilEntry,
  });
}

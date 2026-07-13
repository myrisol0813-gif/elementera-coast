import { API, requestJson } from '../core/api.js';
import { escapeAttribute, escapeHtml, q } from '../core/dom.js';

const DEFAULT_FREE = Object.freeze([
  'nvidia/nemotron-3-super-120b-a12b:free',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
]);

const SERIES = Object.freeze([
  { key: 'o', title: 'o 系列' },
  { key: '4', title: 'GPT-4 系列' },
  { key: '5', title: 'GPT-5 系列' },
  { key: 'other', title: '其他 OpenAI Chat' },
]);

const natural = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });

export function createModels({ chat, router, toast }) {
  let catalog = null;
  let search = '';
  let searchDraft = '';

  function allModels() {
    const groups = catalog?.groups || {};
    return [...(groups.openai_chat || []), ...(groups.openai_image || []), ...(groups.free_test || [])];
  }

  function modelById(modelId) {
    return allModels().find((model) => model.id === modelId) || null;
  }

  function inferredModelName(modelId) {
    const raw = String(modelId || '').split('/').at(-1)?.replace(/:free$/i, '') || '';
    return raw.split(/[-_]+/).filter(Boolean).map((part) => {
      if (part.toLowerCase() === 'gpt') return 'GPT';
      if (/^[a-z]\d+[a-z]?$/i.test(part) || /^\d+[a-z]+$/i.test(part)) return part.toUpperCase();
      if (/^\d/.test(part)) return part;
      return `${part.charAt(0).toUpperCase()}${part.slice(1)}`;
    }).join(' ');
  }

  function modelName(modelId) {
    return modelById(modelId)?.name || inferredModelName(modelId) || '未选择模型';
  }

  function modelKind(modelId, model = modelById(modelId)) {
    if (model?.is_free || String(modelId).includes(':free')) return 'Free';
    if (String(modelId).includes('gpt-image')) return 'Image';
    if (String(modelId).startsWith('openai/')) return 'OpenAI';
    return 'Model';
  }

  function updateTopLabel(profile = chat.getProfile()) {
    const modelId = profile.current_chat_model || '';
    const kind = modelKind(modelId);
    const name = modelName(modelId);
    const label = kind === 'OpenAI'
      ? `${name.replace(/^GPT(?:[-:\s]+)?/i, '') || name} ›`
      : kind === 'Free'
        ? `Free: ${name.replace(/NVIDIA\s*/i, '').replace(/ · free$/i, '')} ›`
        : `${name} ›`;
    const node = q('#modelName');
    if (node) {
      node.textContent = label;
      node.title = modelId;
    }
  }

  function seriesKey(model) {
    const value = `${model?.id || ''} ${model?.name || ''}`.toLocaleLowerCase('en-US');
    if (/(?:^|[\s/_-])o\d(?:[.\s/_-]|$)/.test(value)) return 'o';
    if (/(?:^|[\s/_-])gpt[\s_-]*4/.test(value)) return '4';
    if (/(?:^|[\s/_-])gpt[\s_-]*5/.test(value)) return '5';
    return 'other';
  }

  function sortedModels(models) {
    return [...models].sort((left, right) => natural.compare(
      `${left.name || ''} ${left.id || ''}`,
      `${right.name || ''} ${right.id || ''}`,
    ));
  }

  async function fetchCatalog(force = false) {
    catalog = await requestJson(`${API.models}${force ? '?refresh=1' : ''}`);
    await ensureSelections();
    updateTopLabel();
    renderQuickPicker();
    return catalog;
  }

  async function ensureSelections() {
    if (!catalog) return;
    const profile = chat.getProfile();
    const box = profile.model_box || { chat: [], free: [], image: [] };
    const next = {
      chat: [...new Set([...(box.chat || []), catalog.defaults?.chat].filter(Boolean))],
      free: [...new Set([...(box.free || []), ...DEFAULT_FREE].filter(Boolean))],
      image: [...new Set([...(box.image || []), catalog.defaults?.image].filter(Boolean))],
    };
    const currentChat = profile.current_chat_model || next.chat[0] || next.free[0] || '';
    const currentImage = profile.current_image_model || next.image[0] || '';
    if (JSON.stringify(box) !== JSON.stringify(next)
      || currentChat !== profile.current_chat_model
      || currentImage !== profile.current_image_model) {
      await chat.updateProfile({
        model_box: next,
        current_chat_model: currentChat,
        current_image_model: currentImage,
      });
    }
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

  function row(modelId, groupName, mode = 'box') {
    const model = modelById(modelId) || {
      id: modelId,
      name: modelId,
      is_free: String(modelId).includes(':free'),
      available: true,
      supported_parameters: [],
      pricing: null,
    };
    const profile = chat.getProfile();
    const groupIds = profile.model_box?.[groupName] || [];
    const current = profile.current_chat_model === modelId
      || (groupName === 'image' && profile.current_image_model === modelId);
    const inBox = groupIds.includes(modelId);
    const action = mode === 'current'
      ? ''
      : mode === 'box'
        ? `<button type="button" data-action="models:remove" data-id="${escapeAttribute(modelId)}" data-group="${groupName}">移除</button>`
        : `<button type="button" data-action="models:add" data-id="${escapeAttribute(modelId)}" data-group="${groupName}" ${inBox ? 'disabled' : ''}>${inBox ? '已加入' : '加入'}</button>`;
    const select = groupName === 'image'
      ? `<button class="${current ? 'is-current' : ''}" type="button" data-action="models:select-image" data-id="${escapeAttribute(modelId)}">${current ? '当前' : '设为当前'}</button>`
      : `<button class="${current ? 'is-current' : ''}" type="button" data-action="models:select-chat" data-id="${escapeAttribute(modelId)}">${current ? '当前' : '设为当前'}</button>`;
    return `<article class="model-row">
      <div><strong>${escapeHtml(model.name || model.id)}</strong><code>${escapeHtml(model.id)}</code><small><span class="model-badge ${model.is_free ? 'is-free' : ''}">${escapeHtml(modelKind(model.id, model))}</span>${escapeHtml(priceText(model))}<br>${escapeHtml(tagText(model))}</small></div>
      <div class="model-actions">${select}${action}</div>
    </article>`;
  }

  function group(title, body) {
    return `<section class="feature-group"><h2>${escapeHtml(title)}</h2><div class="feature-card model-list">${body || '<p class="feature-empty">暂无模型。</p>'}</div></section>`;
  }

  function filtered(models) {
    const needle = search.toLocaleLowerCase('zh-CN');
    if (!needle) return models;
    return models.filter((model) => `${model.id} ${model.name}`.toLocaleLowerCase('zh-CN').includes(needle));
  }

  function catalogGroups(models) {
    const grouped = new Map(SERIES.map(({ key }) => [key, []]));
    sortedModels(filtered(models)).forEach((model) => grouped.get(seriesKey(model)).push(model));
    const sections = SERIES
      .filter(({ key }) => grouped.get(key).length)
      .map(({ key, title }) => group(title, grouped.get(key).map((model) => row(model.id, 'chat', 'catalog')).join('')))
      .join('');
    return sections || group(search ? `没有找到“${search}”` : 'OpenAI Chat 目录', '');
  }

  function view() {
    const profile = chat.getProfile();
    const box = profile.model_box || { chat: [], free: [], image: [] };
    const groups = catalog?.groups || { openai_chat: [], openai_image: [], free_test: [] };
    return {
      title: '模型箱',
      subtitle: '选择、搜索与管理模型',
      className: 'model-box',
      body: `<form class="model-toolbar" data-submit="models:search">
          <input type="search" data-input="models:search-draft" placeholder="搜索 OpenAI Chat 模型" value="${escapeAttribute(searchDraft)}" autocomplete="off" enterkeyhint="search">
          <button type="submit">搜索</button>
          <button type="button" data-action="models:refresh">刷新</button>
        </form>
        <p class="feature-meta">目录更新：${escapeHtml(catalog?.updated_at || '未刷新')} · 当前模型：${escapeHtml(profile.current_chat_model || '未选择')}</p>
        ${group('当前聊天模型', profile.current_chat_model ? row(profile.current_chat_model, 'chat', 'current') : '')}
        ${group('我的 Chat 模型', (box.chat || []).map((id) => row(id, 'chat')).join(''))}
        ${catalogGroups(groups.openai_chat || [])}
        ${group('Free Test', (box.free || []).map((id) => row(id, 'free')).join(''))}
        ${group('Free Test 目录', filtered(groups.free_test || []).map((model) => row(model.id, 'free', 'catalog')).join(''))}
        ${group('图片模型', (box.image || []).map((id) => row(id, 'image')).join(''))}
        ${group('图片模型目录', filtered(groups.openai_image || []).map((model) => row(model.id, 'image', 'catalog')).join(''))}`,
    };
  }

  function quickModelIds(profile = chat.getProfile()) {
    const box = profile.model_box || {};
    return [...new Set([profile.current_chat_model, ...(box.chat || []), ...(box.free || [])].filter(Boolean))]
      .sort((left, right) => natural.compare(modelName(left), modelName(right)));
  }

  function renderQuickPicker(profile = chat.getProfile()) {
    const root = q('#modelQuickPicker');
    if (!root) return;
    const ids = quickModelIds(profile);
    root.innerHTML = `<div class="model-quick-card" role="dialog" aria-label="快捷选择模型">
      <strong>选择模型</strong>
      <div class="model-quick-list">${ids.map((modelId) => {
        const current = modelId === profile.current_chat_model;
        return `<button class="${current ? 'is-current' : ''}" type="button" data-action="models:quick-select" data-id="${escapeAttribute(modelId)}" aria-pressed="${current}"><span>${escapeHtml(modelName(modelId))}</span><small>${escapeHtml(modelKind(modelId))}</small></button>`;
      }).join('') || '<p>模型箱里还没有聊天模型。</p>'}</div>
      <button class="model-quick-manage" type="button" data-action="models:open">管理模型箱 ›</button>
    </div>`;
  }

  function closeQuickPicker() {
    const root = q('#modelQuickPicker');
    const button = q('#modelButton');
    if (root) root.hidden = true;
    if (button) button.setAttribute('aria-expanded', 'false');
  }

  async function toggleQuickPicker() {
    const root = q('#modelQuickPicker');
    const button = q('#modelButton');
    if (!root || !button) return;
    if (!root.hidden) {
      closeQuickPicker();
      return;
    }
    if (!catalog) {
      try {
        await fetchCatalog();
      } catch (error) {
        toast(`模型目录读取失败：${error.message}`);
      }
    }
    renderQuickPicker();
    root.hidden = false;
    button.setAttribute('aria-expanded', 'true');
  }

  router.register('models', async () => {
    closeQuickPicker();
    if (!catalog) {
      try {
        await fetchCatalog();
      } catch (error) {
        toast(`模型目录读取失败：${error.message}`);
      }
    }
    return view();
  });

  async function changeBox(modelId, groupName, add) {
    const profile = chat.getProfile();
    const box = {
      chat: [...(profile.model_box?.chat || [])],
      free: [...(profile.model_box?.free || [])],
      image: [...(profile.model_box?.image || [])],
    };
    const groupNameSafe = ['chat', 'free', 'image'].includes(groupName) ? groupName : 'chat';
    if (add) box[groupNameSafe] = [...new Set([...box[groupNameSafe], modelId])];
    else {
      if (groupNameSafe === 'chat' && box.chat.length <= 1) {
        toast('至少保留一个聊天模型。');
        return;
      }
      box[groupNameSafe] = box[groupNameSafe].filter((id) => id !== modelId);
    }
    const patch = { model_box: box };
    if (!add && profile.current_chat_model === modelId) patch.current_chat_model = box.chat[0] || box.free[0] || '';
    if (!add && profile.current_image_model === modelId) patch.current_image_model = box.image[0] || '';
    await chat.updateProfile(patch);
    toast(add ? '模型已添加' : '模型已移除', 2000);
    await router.refresh();
  }

  async function selectChat(modelId, { closePicker = false } = {}) {
    await chat.updateProfile({ current_chat_model: modelId });
    updateTopLabel();
    renderQuickPicker();
    toast('模型已切换', 2000);
    if (closePicker) closeQuickPicker();
  }

  async function handleAction(name, target) {
    if (name === 'quick') return toggleQuickPicker();
    if (name === 'open') {
      closeQuickPicker();
      return router.open('models');
    }
    if (name === 'quick-select') return selectChat(target.dataset.id, { closePicker: true });
    if (name === 'refresh') {
      try {
        await fetchCatalog(true);
        toast('模型目录已刷新');
        await router.refresh();
      } catch (error) {
        toast(`刷新失败：${error.message}`);
      }
      return;
    }
    if (name === 'add') return changeBox(target.dataset.id, target.dataset.group, true);
    if (name === 'remove') return changeBox(target.dataset.id, target.dataset.group, false);
    if (name === 'select-chat') {
      await selectChat(target.dataset.id);
      return router.refresh();
    }
    if (name === 'select-image') {
      await chat.updateProfile({ current_image_model: target.dataset.id });
      toast('图片模型已切换', 2000);
      return router.refresh();
    }
  }

  function handleInput(name, target) {
    if (name === 'search-draft') searchDraft = target.value;
  }

  async function handleSubmit(name) {
    if (name !== 'search') return;
    search = searchDraft.trim();
    await router.refresh({ preserveScroll: false });
  }

  function handleDocumentClick(target) {
    if (!target?.closest?.('#modelButton, #modelQuickPicker')) closeQuickPicker();
  }

  function start() {
    chat.onProfile((profile) => {
      updateTopLabel(profile);
      renderQuickPicker(profile);
    });
    updateTopLabel();
    renderQuickPicker();
  }

  return Object.freeze({
    start,
    handleAction,
    handleInput,
    handleSubmit,
    handleDocumentClick,
    closeQuickPicker,
    fetchCatalog,
    modelName,
    modelById,
    getCatalog: () => catalog,
  });
}

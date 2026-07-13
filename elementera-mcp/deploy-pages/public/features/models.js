import { API, requestJson } from '../core/api.js';
import { escapeAttribute, escapeHtml, q } from '../core/dom.js';

const DEFAULT_FREE = Object.freeze([
  'nvidia/nemotron-3-super-120b-a12b:free',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
]);

export function createModels({ chat, router, toast }) {
  let catalog = null;
  let search = '';

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

  async function fetchCatalog(force = false) {
    const data = await requestJson(`${API.models}${force ? '?refresh=1' : ''}`);
    catalog = data;
    await ensureSelections();
    updateTopLabel();
    return data;
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

  function row(modelId, group, mode = 'box') {
    const model = modelById(modelId) || {
      id: modelId,
      name: modelId,
      is_free: String(modelId).includes(':free'),
      available: true,
      supported_parameters: [],
      pricing: null,
    };
    const profile = chat.getProfile();
    const current = profile.current_chat_model === modelId || (group === 'image' && profile.current_image_model === modelId);
    const action = mode === 'current'
      ? ''
      : mode === 'box'
        ? `<button type="button" data-action="models:remove" data-id="${escapeAttribute(modelId)}" data-group="${group}">移除</button>`
        : `<button type="button" data-action="models:add" data-id="${escapeAttribute(modelId)}" data-group="${group}">加入</button>`;
    const select = group === 'image'
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

  function filtered(list) {
    const needle = search.trim().toLocaleLowerCase('zh-CN');
    if (!needle) return list;
    return list.filter((model) => `${model.id} ${model.name}`.toLocaleLowerCase('zh-CN').includes(needle));
  }

  function view() {
    const profile = chat.getProfile();
    const box = profile.model_box || { chat: [], free: [], image: [] };
    const groups = catalog?.groups || { openai_chat: [], openai_image: [], free_test: [] };
    return {
      title: '模型箱',
      subtitle: 'OpenAI chat · Free test · GPT Image',
      className: 'model-box',
      body: `<p class="feature-note">模型目录来自 Cloudflare /api/models。常驻模型箱只保存模型 ID；不会保存 API key。</p>
        <p class="feature-meta">updated_at: ${escapeHtml(catalog?.updated_at || '未刷新')} · 当前 chat: ${escapeHtml(profile.current_chat_model || '未选择')}</p>
        <div class="model-toolbar"><input type="search" data-input="models:search" placeholder="搜索 OpenAI chat 模型" value="${escapeAttribute(search)}"><button type="button" data-action="models:refresh">刷新目录</button></div>
        ${group('当前聊天模型', profile.current_chat_model ? row(profile.current_chat_model, 'chat', 'current') : '')}
        ${group('常驻 OpenAI Chat', (box.chat || []).map((id) => row(id, 'chat')).join(''))}
        ${group('Free Test', (box.free || []).map((id) => row(id, 'free')).join(''))}
        ${group('Image model slot · 仅保存', (box.image || []).map((id) => row(id, 'image')).join(''))}
        ${group('OpenAI Chat 目录', filtered(groups.openai_chat || []).map((model) => row(model.id, 'chat', 'catalog')).join(''))}
        ${group('Free Test 目录', filtered(groups.free_test || []).map((model) => row(model.id, 'free', 'catalog')).join(''))}
        ${group('GPT Image 目录', filtered(groups.openai_image || []).map((model) => row(model.id, 'image', 'catalog')).join(''))}`,
    };
  }

  router.register('models', async () => {
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
    const group = ['chat', 'free', 'image'].includes(groupName) ? groupName : 'chat';
    if (add) box[group] = [...new Set([...box[group], modelId])];
    else {
      if (group === 'chat' && box.chat.length <= 1) {
        toast('至少保留一个聊天模型。');
        return;
      }
      box[group] = box[group].filter((id) => id !== modelId);
    }
    const patch = { model_box: box };
    if (!add && profile.current_chat_model === modelId) patch.current_chat_model = box.chat[0] || box.free[0] || '';
    if (!add && profile.current_image_model === modelId) patch.current_image_model = box.image[0] || '';
    await chat.updateProfile(patch);
    await router.refresh();
  }

  async function handleAction(name, target) {
    if (name === 'open') return router.open('models');
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
      await chat.updateProfile({ current_chat_model: target.dataset.id });
      updateTopLabel();
      return router.refresh();
    }
    if (name === 'select-image') {
      await chat.updateProfile({ current_image_model: target.dataset.id });
      return router.refresh();
    }
  }

  function handleInput(name, target) {
    if (name !== 'search') return;
    search = target.value;
    router.refresh();
  }

  function start() {
    chat.onProfile(updateTopLabel);
    updateTopLabel();
  }

  return Object.freeze({ start, handleAction, handleInput, fetchCatalog, modelName, modelById, getCatalog: () => catalog });
}

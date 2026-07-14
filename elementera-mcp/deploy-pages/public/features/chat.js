import { API, requestJson } from '../core/api.js';
import { escapeAttribute, escapeHtml, formatRichText, q, qa, sanitizeId } from '../core/dom.js';
import { icon } from '../core/icons.js';
import {
  activeBranch,
  activeMessages,
  appendAssistantVariant,
  appendTurn,
  createState,
  deleteActiveAssistantVariant,
  deleteActiveUserVariant,
  editUserVariant,
  flatMessagesToState,
  normalizeState,
  switchVariant,
  toggleAssistantReaction,
  updateAssistantVariant,
} from './chat-state.js';

const DEFAULT_MODEL = 'openai/gpt-4.1-nano';
const CONNECTING_TEXT = '正在连接当前模型……';

export function shortModelName(modelId) {
  const bare = String(modelId || '').split('/').at(-1)?.replace(/:free$/i, '') || '';
  if (!bare) return '';
  if (/^gpt-/i.test(bare)) {
    return bare.replace(/^gpt-/i, 'GPT-').replace(/-(nano|mini|micro)$/i, ' $1');
  }
  return bare;
}

function generationDetail(variant = {}) {
  const usage = variant.usage || {};
  return [
    `model_id: ${variant.model_id || '—'}`,
    `prompt_tokens: ${Number.isFinite(usage.prompt_tokens) ? usage.prompt_tokens : '—'}`,
    `completion_tokens: ${Number.isFinite(usage.completion_tokens) ? usage.completion_tokens : '—'}`,
    `total_tokens: ${Number.isFinite(usage.total_tokens) ? usage.total_tokens : '—'}`,
    `finish_reason: ${variant.finish_reason || '—'}`,
    `generation_source: ${variant.generation_source || '—'}`,
  ].join('\n');
}

function generationFootprint(variant, turnId) {
  if (!variant?.model_id) return '';
  const model = shortModelName(variant.model_id);
  const total = Number.isFinite(variant?.usage?.total_tokens)
    ? ` · ${variant.usage.total_tokens.toLocaleString('en-US')} tok`
    : '';
  const detail = generationDetail(variant);
  return `<button class="generation-footprint" type="button" data-action="chat:generation-detail" data-turn="${escapeAttribute(turnId)}" title="${escapeAttribute(detail)}" aria-label="查看生成详情">${escapeHtml(`${model}${total}`)}</button>`;
}

function parseSseBlock(block) {
  let event = 'message';
  const data = [];
  for (const line of String(block || '').split(/\r?\n/)) {
    if (!line || line.startsWith(':')) continue;
    const separator = line.indexOf(':');
    const field = separator < 0 ? line : line.slice(0, separator);
    let value = separator < 0 ? '' : line.slice(separator + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') event = value || 'message';
    if (field === 'data') data.push(value);
  }
  if (!data.length) return null;
  let parsed;
  try {
    parsed = JSON.parse(data.join('\n'));
  } catch {
    const error = new Error('Coast 流式响应格式无效。');
    error.type = 'invalid_stream_event';
    throw error;
  }
  return { event, data: parsed };
}

export function createCoastSseParser(onEvent) {
  let buffer = '';
  function drain() {
    while (true) {
      const match = buffer.match(/\r?\n\r?\n/);
      if (!match || match.index == null) return;
      const block = buffer.slice(0, match.index);
      buffer = buffer.slice(match.index + match[0].length);
      const parsed = parseSseBlock(block);
      if (parsed) onEvent(parsed);
    }
  }
  return Object.freeze({
    push(chunk) {
      buffer += String(chunk || '');
      drain();
    },
    finish() {
      drain();
      buffer = '';
    },
  });
}

async function requestChatStream(payload, { signal, onEvent }) {
  const response = await fetch(API.chat, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    signal,
    headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, stream: true }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const upstream = data?.error;
    const error = new Error(typeof upstream === 'string' ? upstream : upstream?.message || `请求失败（${response.status}）`);
    error.type = upstream?.type || 'request_failed';
    throw error;
  }
  if (!response.body) {
    const error = new Error('浏览器没有收到可读取的流。');
    error.type = 'stream_unavailable';
    throw error;
  }
  let selected = [];
  try {
    const header = JSON.parse(response.headers.get('X-Coast-Memory-Selected') || '[]');
    if (Array.isArray(header)) selected = header.map(String);
  } catch {
    selected = [];
  }
  const parser = createCoastSseParser(onEvent);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      parser.push(decoder.decode(value, { stream: true }));
    }
    parser.push(decoder.decode());
    parser.finish();
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  return selected;
}

function emptyProfile() {
  return {
    assistant_avatar_dataurl: '',
    current_chat_model: DEFAULT_MODEL,
    current_image_model: '',
    model_box: { chat: [], free: [], image: [] },
  };
}

function cleanProfile(value = {}) {
  const modelBox = value.model_box || value.modelBox || {};
  const strings = (list) => Array.isArray(list) ? list.filter((item) => typeof item === 'string').slice(0, 60) : [];
  return {
    assistant_avatar_dataurl: typeof value.assistant_avatar_dataurl === 'string' ? value.assistant_avatar_dataurl : '',
    current_chat_model: String(value.current_chat_model || DEFAULT_MODEL),
    current_image_model: String(value.current_image_model || ''),
    model_box: {
      chat: strings(modelBox.chat),
      free: strings(modelBox.free),
      image: strings(modelBox.image),
    },
  };
}

function mergeMigrationProfile(server, migrated) {
  const current = cleanProfile(server);
  if (!migrated) return current;
  const old = cleanProfile(migrated);
  return cleanProfile({
    assistant_avatar_dataurl: current.assistant_avatar_dataurl || old.assistant_avatar_dataurl,
    current_chat_model: current.current_chat_model && current.current_chat_model !== DEFAULT_MODEL
      ? current.current_chat_model
      : old.current_chat_model || current.current_chat_model,
    current_image_model: current.current_image_model || old.current_image_model,
    model_box: {
      chat: current.model_box.chat.length ? current.model_box.chat : old.model_box.chat,
      free: current.model_box.free.length ? current.model_box.free : old.model_box.free,
      image: current.model_box.image.length ? current.model_box.image : old.model_box.image,
    },
  });
}

function isImageModel(modelId, imageModels = []) {
  const id = String(modelId || '');
  return imageModels.includes(id) || /(?:gpt-image-|dall-e)/i.test(id);
}

function replyTokenBudget(outputLength) {
  if (outputLength === 'short') return 700;
  return null;
}

function soilIsBlank(soil = {}) {
  return !String(soil.current_text || '').trim()
    && !(Array.isArray(soil.hand_seeds) && soil.hand_seeds.length)
    && !String(soil.do_not_repeat || '').trim()
    && !(Array.isArray(soil.pocket_candidates) && soil.pocket_candidates.length);
}

export function createChat({ storage, toast }) {
  const runtime = {
    conversations: [],
    histories: new Map(),
    currentId: '',
    openMenuId: '',
    deletedIds: new Set(),
    saveChains: new Map(),
    recallHistory: new Map(),
    profileChain: Promise.resolve(),
    profile: emptyProfile(),
    generation: null,
    memory: null,
    profileListeners: new Set(),
    runSettings: () => storage.read().runControl,
  };

  const ui = {};

  function bindUi() {
    ui.list = q('#chatConversationList');
    ui.messages = q('#messages');
    ui.scroller = q('#messageScroller');
    ui.form = q('#composer');
    ui.input = q('#promptInput');
    ui.primary = q('#composerActionButton');
    ui.mic = q('#micButton');
    ui.status = q('#chatStatus');
    ui.modelName = q('#modelName');
  }

  function setStatus(message = '', kind = 'error') {
    if (!ui.status) return;
    ui.status.textContent = message;
    ui.status.dataset.kind = kind;
    ui.status.hidden = !message;
  }

  function notifyProfile() {
    refreshModelLabel();
    runtime.profileListeners.forEach((listener) => listener(runtime.profile));
  }

  function refreshModelLabel() {
    const model = runtime.profile.current_chat_model || DEFAULT_MODEL;
    if (ui.modelName) {
      ui.modelName.textContent = `${model} ›`;
      ui.modelName.title = model;
    }
  }

  function closeMenu() {
    runtime.openMenuId = '';
    qa('[data-conversation-menu]', ui.list).forEach((menu) => { menu.hidden = true; });
    qa('[data-action="chat:menu"]', ui.list).forEach((button) => button.setAttribute('aria-expanded', 'false'));
  }

  function toggleMenu(conversationId) {
    const id = sanitizeId(conversationId, 'conversation');
    const row = qa('[data-conversation-id]', ui.list).find((item) => item.dataset.conversationId === id);
    if (!row) return;
    const menu = q('[data-conversation-menu]', row);
    const button = q('[data-action="chat:menu"]', row);
    const open = runtime.openMenuId !== id || menu.hidden;
    closeMenu();
    if (!open) return;
    runtime.openMenuId = id;
    menu.hidden = false;
    button.setAttribute('aria-expanded', 'true');
  }

  function renderConversationList() {
    if (!ui.list) return;
    closeMenu();
    if (!runtime.conversations.length) {
      ui.list.innerHTML = '<p class="sidebar-empty">还没有聊天窗口</p>';
      return;
    }
    ui.list.innerHTML = runtime.conversations.map((conversation) => {
      const active = conversation.id === runtime.currentId;
      return `<div class="conversation-row" data-conversation-id="${escapeAttribute(conversation.id)}">
        <button class="history-item conversation-title ${active ? 'is-active' : ''}" type="button" data-action="chat:open" data-id="${escapeAttribute(conversation.id)}">${escapeHtml(conversation.title || '新聊天')}</button>
        <button class="conversation-more" type="button" data-action="chat:menu" data-id="${escapeAttribute(conversation.id)}" aria-label="窗口操作" aria-expanded="false">${icon('more')}</button>
        <div class="conversation-menu" data-conversation-menu hidden>
          <button type="button" data-action="chat:rename" data-id="${escapeAttribute(conversation.id)}">改名</button>
          <button class="danger" type="button" data-action="chat:delete-conversation" data-id="${escapeAttribute(conversation.id)}">删除</button>
        </div>
      </div>`;
    }).join('');
  }

  function variantControl(kind, turnId, active, total) {
    if (total <= 1) return '';
    return `<span class="variant-switch">
      <button type="button" data-action="chat:switch-variant" data-turn="${escapeAttribute(turnId)}" data-kind="${kind}" data-direction="previous" aria-label="上一个版本">${icon('back')}</button>
      <span>${active + 1}/${total}</span>
      <button class="is-next" type="button" data-action="chat:switch-variant" data-turn="${escapeAttribute(turnId)}" data-kind="${kind}" data-direction="next" aria-label="下一个版本">${icon('back')}</button>
    </span>`;
  }

  function actionButton(action, title, { active = false, reaction = '' } = {}) {
    const iconName = {
      copy: 'copy',
      'edit-user': 'edit',
      'delete-user': 'trash',
      regenerate: 'refresh',
      like: 'like',
      favorite: 'heart',
      'delete-assistant': 'trash',
    }[action];
    return `<button class="action-button ${active ? 'is-active' : ''}" type="button" data-action="chat:${action}" ${reaction ? `data-reaction="${reaction}"` : ''} title="${escapeAttribute(title)}" aria-label="${escapeAttribute(title)}">${icon(iconName)}</button>`;
  }

  function renderMessages(conversationId = runtime.currentId) {
    if (!ui.messages || conversationId !== runtime.currentId) return;
    const state = runtime.histories.get(conversationId) || createState();
    const latestAssistantTurnId = [...state.turns].reverse().find((turn) => activeBranch(turn).assistant)?.id || '';
    const html = state.turns.map((turn) => {
      const branch = activeBranch(turn);
      const loading = runtime.generation
        && runtime.generation.conversationId === conversationId
        && runtime.generation.turnId === turn.id
        && runtime.generation.userIndex === branch.userIndex
        && runtime.generation.assistantIndex === branch.assistantIndex;
      const user = branch.user && !branch.user.hidden ? `<article class="message user" data-turn="${escapeAttribute(turn.id)}">
        <div class="content">
          <div class="user-bubble">${escapeHtml(branch.user.content)}</div>
          <div class="message-actions">
            ${actionButton('edit-user', '编辑')}${actionButton('delete-user', '删除')}
            ${variantControl('user', turn.id, branch.userIndex, turn.user.variants.length)}
          </div>
        </div>
      </article>` : '';
      const assistant = branch.assistant ? `<article class="message assistant" data-turn="${escapeAttribute(turn.id)}">
        <button class="avatar" type="button" data-action="settings:avatar" aria-label="更换助手头像">${runtime.profile.assistant_avatar_dataurl ? '' : '⌁'}</button>
        <div class="content">
          <div class="assistant-text">${formatRichText(branch.assistant.content)}${branch.assistant.errorDetail ? `<span class="message-error">${escapeHtml(branch.assistant.errorDetail)}</span>` : ''}${loading ? '<span class="typing-cursor"></span>' : ''}</div>
          <div class="message-actions">
            ${actionButton('copy', '复制')}
            ${actionButton('like', '点赞', { active: branch.assistant.liked, reaction: 'liked' })}
            ${actionButton('regenerate', '重新生成')}
            ${actionButton('favorite', '收藏', { active: branch.assistant.favorite, reaction: 'favorite' })}
            ${actionButton('delete-assistant', '删除')}
            ${variantControl('assistant', turn.id, branch.assistantIndex, branch.assistants.length)}
            ${generationFootprint(branch.assistant, turn.id)}
          </div>
        </div>
      </article>` : '';
      const soil = branch.assistant && turn.id === latestAssistantTurnId
        ? runtime.memory?.renderSoilEntry(conversationId) || ''
        : '';
      return user + soil + assistant;
    }).join('');
    ui.messages.innerHTML = html || '<div class="empty-state">这里还没有消息。</div>';
    const avatarUrl = runtime.profile.assistant_avatar_dataurl;
    if (avatarUrl) {
      qa('.avatar', ui.messages).forEach((avatar) => {
        avatar.style.backgroundImage = `url(${JSON.stringify(avatarUrl)})`;
      });
    }
    requestAnimationFrame(() => {
      if (ui.scroller) ui.scroller.scrollTop = ui.scroller.scrollHeight;
    });
  }

  function currentHistory() {
    return runtime.histories.get(runtime.currentId) || createState();
  }

  function setHistory(conversationId, value) {
    const state = normalizeState(value);
    runtime.histories.set(conversationId, state);
    return state;
  }

  function composerState() {
    if (!ui.input || !ui.primary) return;
    ui.input.style.height = '22px';
    ui.input.style.height = `${Math.min(Math.max(ui.input.scrollHeight, 22), 112)}px`;
    ui.input.style.overflowY = ui.input.scrollHeight > 112 ? 'auto' : 'hidden';
    const generating = Boolean(runtime.generation);
    const hasText = Boolean(ui.input.value.trim());
    const name = generating ? 'stop' : hasText ? 'send' : 'call';
    ui.primary.innerHTML = icon(name);
    ui.primary.setAttribute('aria-label', generating ? '停止生成' : hasText ? '发送' : '通话');
    if (ui.mic) ui.mic.hidden = generating || hasText;
  }

  async function fetchConversations() {
    const data = await requestJson(API.conversations);
    const seen = new Set();
    runtime.conversations = (Array.isArray(data.conversations) ? data.conversations : [])
      .filter((conversation) => conversation?.id && !seen.has(conversation.id) && seen.add(conversation.id));
  }

  async function migrateLocalConversations() {
    const local = Array.isArray(storage.migrationConversations) ? storage.migrationConversations : [];
    if (!storage.migrationPending || !local.length) return new Map();

    const serverStates = new Map();
    for (const conversation of runtime.conversations) {
      const data = await requestJson(`${API.history}?conversation_id=${encodeURIComponent(conversation.id)}`);
      serverStates.set(conversation.id, normalizeState(data.history || {}));
    }

    const mappedIds = new Map();
    const claimedServerIds = new Set();
    const signature = (state) => JSON.stringify(activeMessages(state).map(({ role, content }) => ({ role, content })));
    for (const item of local) {
      const localState = item.state?.turns
        ? normalizeState(item.state)
        : flatMessagesToState(item.messages || []);
      let conversation = runtime.conversations.find((entry) => entry.id === item.id);
      if (!conversation) {
        const sameTitle = runtime.conversations.filter((entry) => entry.title === item.title && !claimedServerIds.has(entry.id));
        conversation = sameTitle.find((entry) => signature(serverStates.get(entry.id)) === signature(localState))
          || sameTitle.find((entry) => !(serverStates.get(entry.id)?.turns.length))
          || await createConversation(item.title || '新聊天');
        if (!serverStates.has(conversation.id)) serverStates.set(conversation.id, createState());
      }
      claimedServerIds.add(conversation.id);
      mappedIds.set(item.id, conversation.id);

      const serverState = serverStates.get(conversation.id) || createState();
      if (localState.turns.length && !serverState.turns.length) {
        await requestJson(`${API.history}?conversation_id=${encodeURIComponent(conversation.id)}`, {
          method: 'PUT',
          body: JSON.stringify(localState),
        });
        serverStates.set(conversation.id, localState);
      }
    }
    return mappedIds;
  }

  async function createConversation(title = '新聊天') {
    const data = await requestJson(API.conversations, { method: 'POST', body: JSON.stringify({ title }) });
    const conversation = data.conversation;
    runtime.conversations = [conversation, ...runtime.conversations.filter((item) => item.id !== conversation.id)];
    runtime.histories.set(conversation.id, createState());
    return conversation;
  }

  async function loadConversation(value) {
    const conversationId = sanitizeId(value, 'conversation');
    if (runtime.deletedIds.has(conversationId)) return false;
    runtime.currentId = conversationId;
    storage.setCurrentConversation(conversationId);
    renderConversationList();
    setStatus('正在载入聊天记录…', 'loading');
    if (runtime.histories.has(conversationId)) renderMessages(conversationId);
    else {
      runtime.histories.set(conversationId, createState());
      renderMessages(conversationId);
    }
    try {
      const data = await requestJson(`${API.history}?conversation_id=${encodeURIComponent(conversationId)}`);
      setHistory(conversationId, data.history || {});
      setStatus('');
      renderMessages(conversationId);
      runtime.memory?.onConversationChanged(conversationId)?.catch((error) => console.warn('[memory:conversation]', error));
      return true;
    } catch (error) {
      setStatus(`聊天记录载入失败：${error.message}`, 'error');
      return false;
    }
  }

  function saveHistory(conversationId, value) {
    if (runtime.deletedIds.has(conversationId)) return Promise.resolve();
    const snapshot = normalizeState(value);
    runtime.histories.set(conversationId, snapshot);
    const previous = runtime.saveChains.get(conversationId) || Promise.resolve();
    const next = previous.catch(() => undefined).then(async () => {
      if (runtime.deletedIds.has(conversationId)) return;
      await requestJson(`${API.history}?conversation_id=${encodeURIComponent(conversationId)}`, {
        method: 'PUT',
        body: JSON.stringify(snapshot),
      });
      if (runtime.currentId === conversationId) setStatus('');
    }).catch((error) => {
      if (runtime.currentId === conversationId && !runtime.deletedIds.has(conversationId)) {
        setStatus(`聊天记录写入失败：${error.message}`, 'error');
      }
      throw error;
    });
    runtime.saveChains.set(conversationId, next);
    next.finally(() => {
      if (runtime.saveChains.get(conversationId) === next) runtime.saveChains.delete(conversationId);
    }).catch(() => undefined);
    return next;
  }

  async function persistProfile(profile) {
    const data = await requestJson(API.profile, {
      method: 'PUT',
      body: JSON.stringify({ profile }),
    });
    runtime.profile = cleanProfile(data.profile || profile);
    notifyProfile();
    renderMessages();
    return runtime.profile;
  }

  function updateProfile(patch) {
    runtime.profileChain = runtime.profileChain.catch(() => undefined).then(() => {
      const next = cleanProfile({
        ...runtime.profile,
        ...patch,
        model_box: patch.model_box || runtime.profile.model_box,
      });
      return persistProfile(next);
    }).catch((error) => {
      setStatus(`个人设置写入失败：${error.message}`, 'error');
      throw error;
    });
    return runtime.profileChain;
  }

  function contextMessages(history, turnId) {
    const settings = runtime.runSettings() || {};
    const messages = [];
    for (const turn of normalizeState(history).turns) {
      const branch = activeBranch(turn);
      if (branch.user?.content) messages.push({ role: 'user', content: branch.user.content });
      if (turn.id === turnId) break;
      if (branch.assistant?.content) messages.push({ role: 'assistant', content: branch.assistant.content });
    }
    const count = Math.min(20, Math.max(2, Number(settings.recentTurns || 8) * 2));
    return messages.slice(-count);
  }

  function chatRequestContext(conversationId) {
    const current = runtime.runSettings() || {};
    const maxTokens = replyTokenBudget(current.outputLength);
    const temperature = current.creativity === 'stable' ? 0.3 : current.creativity === 'expansive' ? 1 : 0.7;
    const cooldown = Math.min(8, Math.max(0, Number(current.seedCooldownTurns ?? 2)));
    return {
      settings: { ...current, max_tokens: maxTokens, temperature },
      recentEntryIds: cooldown
        ? (runtime.recallHistory.get(conversationId) || []).slice(-cooldown).flat()
        : [],
    };
  }

  function patchGeneratedVariant(conversationId, turnId, appended, patch, { render = true } = {}) {
    let latest = runtime.histories.get(conversationId) || appended.state;
    latest = updateAssistantVariant(latest, turnId, appended.userIndex, appended.assistantIndex, patch);
    setHistory(conversationId, latest);
    if (render) renderMessages(conversationId);
    return latest;
  }

  async function generate(conversationId, turnId) {
    if (runtime.generation || runtime.deletedIds.has(conversationId)) return;
    const original = runtime.histories.get(conversationId);
    const appended = appendAssistantVariant(original, turnId, { content: CONNECTING_TEXT });
    if (!appended.turn) return;
    setHistory(conversationId, appended.state);
    const controller = new AbortController();
    runtime.generation = {
      conversationId,
      turnId,
      userIndex: appended.userIndex,
      assistantIndex: appended.assistantIndex,
      controller,
    };
    renderMessages(conversationId);
    composerState();

    const requestContext = chatRequestContext(conversationId);
    const streamingEnabled = requestContext.settings.streamingEnabled === true;
    if (!streamingEnabled) saveHistory(conversationId, appended.state).catch(() => undefined);
    const modelId = runtime.profile.current_chat_model || DEFAULT_MODEL;
    const payload = {
      conversation_id: conversationId,
      model: modelId,
      messages: contextMessages(appended.state, turnId),
      recent_entry_ids: requestContext.recentEntryIds,
      settings: requestContext.settings,
    };
    let patch;
    let generated = false;
    let finishReason = '';
    let partialContent = '';
    let streamModelId = '';
    let streamUsage = null;
    try {
      if (streamingEnabled) {
        let done = false;
        const selected = await requestChatStream(payload, {
          signal: controller.signal,
          onEvent(item) {
            if (item.event === 'meta') {
              streamModelId = String(item.data?.model || '').slice(0, 180);
              patchGeneratedVariant(conversationId, turnId, appended, {
                model_id: streamModelId,
                generation_source: 'chat',
              });
              return;
            }
            if (item.event === 'delta') {
              partialContent += typeof item.data?.content === 'string' ? item.data.content : '';
              patchGeneratedVariant(conversationId, turnId, appended, {
                content: partialContent,
                model_id: streamModelId || modelId,
                generation_source: 'chat',
                errorDetail: '',
              });
              return;
            }
            if (item.event === 'usage') {
              streamUsage = item.data;
              patchGeneratedVariant(conversationId, turnId, appended, { usage: streamUsage });
              return;
            }
            if (item.event === 'done') {
              finishReason = String(item.data?.finish_reason || '');
              done = true;
              return;
            }
            if (item.event === 'error') {
              const error = new Error(item.data?.message || '流式生成失败。');
              error.type = item.data?.type || 'stream_error';
              throw error;
            }
          },
        });
        const history = runtime.recallHistory.get(conversationId) || [];
        runtime.recallHistory.set(conversationId, [...history, selected].slice(-8));
        if (!done) {
          const error = new Error('流式响应在完成事件前中断。');
          error.type = 'stream_incomplete';
          throw error;
        }
        patch = {
          content: partialContent || '模型没有返回文本。',
          errorDetail: '',
          model_id: streamModelId || modelId,
          ...(streamUsage ? { usage: streamUsage } : {}),
          finish_reason: finishReason,
          generation_source: 'chat',
        };
        generated = true;
      } else {
        const data = await requestJson(API.chat, {
          method: 'POST',
          signal: controller.signal,
          body: JSON.stringify(payload),
        });
        finishReason = String(data?.finish_reason || '');
        patch = {
          content: data?.message?.content || '模型没有返回文本。',
          errorDetail: '',
          model_id: data?.model || modelId,
          ...(data?.usage ? { usage: data.usage } : {}),
          finish_reason: finishReason,
          generation_source: 'chat',
        };
        const selected = Array.isArray(data?.memory?.selected_entry_ids) ? data.memory.selected_entry_ids.map(String) : [];
        const history = runtime.recallHistory.get(conversationId) || [];
        runtime.recallHistory.set(conversationId, [...history, selected].slice(-8));
        generated = true;
      }
    } catch (error) {
      const cancelled = error.name === 'AbortError';
      patch = {
        content: streamingEnabled ? partialContent : (cancelled ? '已停止生成。' : '消息生成失败，请稍后重试。'),
        errorDetail: cancelled ? '' : `${error.type || 'request_failed'}: ${error.message}`,
        model_id: streamModelId || modelId,
        ...(streamUsage ? { usage: streamUsage } : {}),
        finish_reason: cancelled ? 'cancelled' : 'error',
        generation_source: 'chat',
      };
      finishReason = patch.finish_reason;
    }

    if (runtime.deletedIds.has(conversationId)) {
      if (runtime.generation?.controller === controller) runtime.generation = null;
      composerState();
      return;
    }

    const latest = patchGeneratedVariant(conversationId, turnId, appended, patch, { render: false });
    if (runtime.generation?.controller === controller) runtime.generation = null;
    renderMessages(conversationId);
    composerState();
    await saveHistory(conversationId, latest).catch(() => undefined);
    if (generated) autoTitle(conversationId, latest, turnId).catch(() => undefined);
    if (generated) {
      let soilRefresh = null;
      try {
        soilRefresh = await (runtime.memory?.onReplyCompleted(conversationId, { modelId: patch.model_id || modelId }) || Promise.resolve(null));
      } catch (error) {
        console.warn('[memory:reply]', error);
        soilRefresh = { ok: false, reason: error?.type || 'soil_organize_failed' };
      }
      const soilFailed = soilRefresh?.ok === false;
      const lockedBlank = soilRefresh?.reason === 'manual_locked' && soilIsBlank(soilRefresh.soil);
      if (finishReason === 'length' && soilFailed) {
        toast('模型或供应商达到自身长度上限，且思维壤整理失败；回复已保存，旧壤已保留，下一轮会自动重试。', 3600);
      } else if (finishReason === 'length') {
        toast('模型或供应商达到自身长度上限；可以点“重新生成”再生成一个版本。', 3200);
      } else if (soilFailed) {
        toast('回复已保存，但思维壤整理失败；旧壤已保留，下一轮会自动重试。', 3200);
      } else if (lockedBlank) {
        toast('思维壤目前为空且已手动锁定；恢复自动整理后会继续更新。', 3200);
      }
    }
  }

  async function sendLandingLetter({ conversationId, modelId, letterText }) {
    if (runtime.generation) throw new Error('请先停止或等待当前回复完成。');
    if (runtime.deletedIds.has(conversationId)) throw new Error('这个聊天窗口已经删除。');
    const pendingSave = runtime.saveChains.get(conversationId);
    if (pendingSave) await pendingSave;

    const requestContext = chatRequestContext(conversationId);
    const controller = new AbortController();
    runtime.generation = { conversationId, turnId: '', userIndex: -1, assistantIndex: -1, controller };
    composerState();
    try {
      const data = await requestJson(API.landingLetter, {
        method: 'POST',
        signal: controller.signal,
        body: JSON.stringify({
          conversation_id: conversationId,
          model: modelId,
          letter_text: letterText,
          recent_entry_ids: requestContext.recentEntryIds,
          settings: requestContext.settings,
        }),
      });
      setHistory(conversationId, data.history || {});
      if (data.conversation) {
        runtime.conversations = runtime.conversations.map((item) => item.id === conversationId ? data.conversation : item);
        renderConversationList();
      }
      const selected = Array.isArray(data?.memory?.selected_entry_ids) ? data.memory.selected_entry_ids.map(String) : [];
      const recalled = runtime.recallHistory.get(conversationId) || [];
      runtime.recallHistory.set(conversationId, [...recalled, selected].slice(-8));
      renderMessages(conversationId);
      autoTitleFromLanding(conversationId, letterText, data?.assistant?.content || '')
        .catch((error) => console.warn('[chat:landing-title]', error));
      const soilRefresh = await (runtime.memory?.onReplyCompleted(conversationId, { trigger: 'landing', modelId: data?.assistant?.model_id || data?.model || modelId })
        || Promise.resolve({ ok: false, reason: 'memory_unavailable' }));
      data.soil_refresh = soilRefresh;
      return data;
    } finally {
      if (runtime.generation?.controller === controller) runtime.generation = null;
      composerState();
    }
  }

  async function autoTitle(conversationId, history, turnId) {
    if (normalizeState(history).turns.length !== 1) return;
    const conversation = runtime.conversations.find((item) => item.id === conversationId);
    if (!conversation || conversation.title_manual || conversation.title_generated_at) return;
    const turn = history.turns.find((item) => item.id === turnId);
    const branch = turn ? activeBranch(turn) : null;
    if (branch?.user?.hidden) return;
    const data = await requestJson(API.title, {
      method: 'POST',
      body: JSON.stringify({
        conversation_id: conversationId,
        user: branch?.user?.content || '',
        assistant: branch?.assistant?.content || '',
      }),
    });
    if (data.conversation) {
      runtime.conversations = runtime.conversations.map((item) => item.id === conversationId ? data.conversation : item);
      renderConversationList();
    }
  }

  async function autoTitleFromLanding(conversationId, letterText, assistantText) {
    const conversation = runtime.conversations.find((item) => item.id === conversationId);
    if (!conversation || conversation.title_manual || conversation.title_generated_at) return;
    const excerpt = String(letterText || '').replace(/\s+/g, ' ').trim().slice(0, 1000);
    const data = await requestJson(API.title, {
      method: 'POST',
      body: JSON.stringify({
        conversation_id: conversationId,
        user: `登岛信：${excerpt}`,
        assistant: String(assistantText || '').slice(0, 1000),
      }),
    });
    if (data.conversation) {
      runtime.conversations = runtime.conversations.map((item) => item.id === conversationId ? data.conversation : item);
      renderConversationList();
    }
  }

  function send(text) {
    const content = String(text || '').trim();
    if (!content || !runtime.currentId || runtime.generation) return;
    if (isImageModel(runtime.profile.current_chat_model, runtime.profile.model_box.image)) {
      toast('当前是生图模型，不能用于文字聊天。请切换聊天模型。');
      return;
    }
    const appended = appendTurn(currentHistory(), content);
    setHistory(runtime.currentId, appended.state);
    ui.input.value = '';
    composerState();
    renderMessages();
    generate(runtime.currentId, appended.turn.id);
  }

  async function newConversation() {
    try {
      const conversation = await createConversation('新聊天');
      await loadConversation(conversation.id);
    } catch (error) {
      toast(`新建窗口失败：${error.message}`);
    }
  }

  async function renameConversation(conversationId) {
    const current = runtime.conversations.find((item) => item.id === conversationId);
    const title = prompt('给这个窗口改名', current?.title || '新聊天');
    if (title == null || !title.trim()) return;
    const data = await requestJson(`${API.conversations}/${encodeURIComponent(conversationId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: title.trim() }),
    });
    runtime.conversations = runtime.conversations.map((item) => item.id === conversationId ? data.conversation : item);
    renderConversationList();
  }

  async function deleteConversation(conversationId) {
    runtime.deletedIds.add(conversationId);
    closeMenu();
    if (runtime.generation?.conversationId === conversationId) runtime.generation.controller.abort();
    try {
      await requestJson(`${API.conversations}/${encodeURIComponent(conversationId)}`, { method: 'DELETE' });
    } catch (error) {
      runtime.deletedIds.delete(conversationId);
      throw error;
    }
    runtime.conversations = runtime.conversations.filter((item) => item.id !== conversationId);
    runtime.histories.delete(conversationId);
    runtime.recallHistory.delete(conversationId);
    if (!runtime.conversations.length) runtime.conversations = [await createConversation('新聊天')];
    if (runtime.currentId === conversationId) await loadConversation(runtime.conversations[0].id);
    else renderConversationList();
  }

  function turnIdFrom(target) {
    return target.dataset.turn || target.closest('[data-turn]')?.dataset.turn || '';
  }

  function getPocketSource(turnId, source) {
    const turn = currentHistory().turns.find((item) => item.id === turnId);
    if (!turn) return null;
    const branch = activeBranch(turn);
    const role = source === 'turn' ? 'turn' : source === 'user' ? 'user' : 'assistant';
    const content = role === 'turn'
      ? [branch.user?.content ? `用户：${branch.user.content}` : '', branch.assistant?.content ? `助手：${branch.assistant.content}` : ''].filter(Boolean).join('\n\n')
      : role === 'user' ? branch.user?.content || '' : branch.assistant?.content || '';
    if (!content) return null;
    return {
      conversation_id: runtime.currentId,
      source_type: role === 'turn' ? 'turn' : 'message',
      source_ref: {
        conversation_id: runtime.currentId,
        turn_id: turn.id,
        role,
        user_variant_id: branch.user?.id || null,
        assistant_variant_id: branch.assistant?.id || null,
        user_variant: branch.userIndex,
        assistant_variant: branch.assistantIndex,
      },
      source_text: content,
    };
  }

  function bindPocketGesture() {
    let timer = 0;
    let start = null;
    let openedAt = 0;
    const targetMessage = (target) => target.closest?.('.message[data-turn]');
    const open = (message) => {
      if (!message || runtime.generation) return;
      const role = message.classList.contains('user') ? 'user' : 'assistant';
      openedAt = Date.now();
      runtime.memory?.openPocketAction({ turnId: message.dataset.turn, role })?.catch((error) => toast(error?.message || '落袋入口打开失败。'));
    };
    const clear = () => {
      clearTimeout(timer);
      timer = 0;
      start = null;
    };
    ui.messages.addEventListener('contextmenu', (event) => {
      const message = targetMessage(event.target);
      if (!message || event.target.closest('button') || Date.now() - openedAt < 800) return;
      event.preventDefault();
      open(message);
    });
    ui.messages.addEventListener('touchstart', (event) => {
      const message = targetMessage(event.target);
      const touch = event.touches?.[0];
      if (!message || !touch || event.target.closest('button')) return;
      clear();
      start = { x: touch.clientX, y: touch.clientY };
      timer = setTimeout(() => open(message), 620);
    }, { passive: true });
    ui.messages.addEventListener('touchmove', (event) => {
      const touch = event.touches?.[0];
      if (!touch || !start) return;
      if (Math.abs(touch.clientX - start.x) > 8 || Math.abs(touch.clientY - start.y) > 8) clear();
    }, { passive: true });
    ui.messages.addEventListener('touchend', clear, { passive: true });
    ui.messages.addEventListener('touchcancel', clear, { passive: true });
  }

  async function handleAction(name, target) {
    const conversationId = target.dataset.id;
    if (name === 'new') return newConversation();
    if (name === 'menu') return toggleMenu(conversationId);
    if (name === 'open') return loadConversation(conversationId);
    if (name === 'rename') return renameConversation(conversationId).catch((error) => toast(`改名失败：${error.message}`));
    if (name === 'delete-conversation') return deleteConversation(conversationId).catch((error) => toast(`删除失败：${error.message}`));
    if (name === 'image') return toast('图片消息还没接入。本轮主聊天先支持文字、思维壤与记忆。');
    if (name === 'mic') return toast('语音输入还没接入。');

    const turnId = turnIdFrom(target);
    if (name === 'generation-detail') {
      const turn = currentHistory().turns.find((item) => item.id === turnId);
      const variant = turn ? activeBranch(turn).assistant : null;
      if (variant?.model_id) return toast(generationDetail(variant), 5200);
      return;
    }
    if (runtime.generation && runtime.generation.conversationId === runtime.currentId
      && ['switch-variant', 'edit-user', 'delete-user', 'delete-assistant', 'regenerate'].includes(name)) {
      return toast('请先停止或等待当前回复完成。');
    }
    if (name === 'switch-variant') {
      const state = switchVariant(currentHistory(), turnId, target.dataset.kind, target.dataset.direction);
      setHistory(runtime.currentId, state);
      renderMessages();
      return saveHistory(runtime.currentId, state).catch(() => undefined);
    }
    if (name === 'edit-user') {
      const turn = currentHistory().turns.find((item) => item.id === turnId);
      const branch = turn ? activeBranch(turn) : null;
      const content = prompt('编辑消息', branch?.user?.content || '');
      if (content == null || content === branch?.user?.content) return;
      const edited = editUserVariant(currentHistory(), turnId, content);
      setHistory(runtime.currentId, edited.state);
      renderMessages();
      return generate(runtime.currentId, turnId);
    }
    if (name === 'delete-user') {
      const state = deleteActiveUserVariant(currentHistory(), turnId);
      setHistory(runtime.currentId, state);
      renderMessages();
      return saveHistory(runtime.currentId, state).catch(() => undefined);
    }
    if (name === 'delete-assistant') {
      const state = deleteActiveAssistantVariant(currentHistory(), turnId);
      setHistory(runtime.currentId, state);
      renderMessages();
      return saveHistory(runtime.currentId, state).catch(() => undefined);
    }
    if (name === 'regenerate') return generate(runtime.currentId, turnId);
    if (name === 'copy') {
      const turn = currentHistory().turns.find((item) => item.id === turnId);
      const text = turn ? activeBranch(turn).assistant?.content || '' : '';
      await navigator.clipboard.writeText(text);
      return toast('已复制');
    }
    if (name === 'like' || name === 'favorite') {
      const reaction = name === 'like' ? 'liked' : 'favorite';
      const state = toggleAssistantReaction(currentHistory(), turnId, reaction);
      setHistory(runtime.currentId, state);
      renderMessages();
      return saveHistory(runtime.currentId, state).catch(() => undefined);
    }
  }

  async function bootstrap() {
    bindUi();
    setStatus('正在载入聊天窗口…', 'loading');
    ui.list.innerHTML = '<p class="sidebar-empty">正在载入…</p>';
    try {
      const [profileData] = await Promise.all([
        requestJson(API.profile),
        fetchConversations(),
      ]);
      const merged = mergeMigrationProfile(profileData.profile, storage.migrationProfile);
      runtime.profile = merged;
      if (storage.migrationPending && JSON.stringify(merged) !== JSON.stringify(cleanProfile(profileData.profile))) {
        await persistProfile(merged);
      } else notifyProfile();
      const migratedIds = await migrateLocalConversations();
      if (!runtime.conversations.length) runtime.conversations = [await createConversation('新聊天')];
      const remembered = storage.getCurrentConversation();
      const migratedRemembered = migratedIds.get(remembered) || remembered;
      if (migratedRemembered !== remembered) storage.setCurrentConversation(migratedRemembered);
      const target = runtime.conversations.find((item) => item.id === migratedRemembered) || runtime.conversations[0];
      const loaded = await loadConversation(target.id);
      if (loaded) storage.completeMigration();
    } catch (error) {
      setStatus(`聊天窗口载入失败：${error.message}`, 'error');
      ui.list.innerHTML = '<p class="sidebar-empty">无法载入聊天窗口</p>';
    }
  }

  function bindComposer() {
    ui.form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (runtime.generation) runtime.generation.controller.abort();
      else if (ui.input.value.trim()) send(ui.input.value);
      else toast('通话模式还没接入。先输入文字或选择模型聊天。');
    });
    ui.input.addEventListener('input', composerState);
    composerState();
  }

  async function start() {
    bindUi();
    bindComposer();
    bindPocketGesture();
    await bootstrap();
  }

  return Object.freeze({
    start,
    handleAction,
    closeMenu,
    renderConversationList,
    renderMessages,
    getActiveMessages: () => activeMessages(currentHistory()),
    getPocketSource,
    getCurrentConversationId: () => runtime.currentId,
    getCurrentConversation: () => runtime.conversations.find((item) => item.id === runtime.currentId) || null,
    getProfile: () => runtime.profile,
    sendLandingLetter,
    updateProfile,
    importFlatMessages: async (messages) => {
      if (!runtime.currentId) throw new Error('当前没有聊天窗口');
      const state = flatMessagesToState(messages);
      setHistory(runtime.currentId, state);
      renderMessages();
      await saveHistory(runtime.currentId, state);
    },
    onProfile(listener) {
      runtime.profileListeners.add(listener);
      return () => runtime.profileListeners.delete(listener);
    },
    setRunSettingsProvider(provider) {
      runtime.runSettings = provider;
    },
    setMemoryController(controller) {
      runtime.memory = controller;
    },
  });
}

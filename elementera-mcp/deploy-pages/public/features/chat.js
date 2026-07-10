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

export function createChat({ storage, toast }) {
  const runtime = {
    conversations: [],
    histories: new Map(),
    currentId: '',
    openMenuId: '',
    deletedIds: new Set(),
    saveChains: new Map(),
    profileChain: Promise.resolve(),
    profile: emptyProfile(),
    generation: null,
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
    const html = state.turns.map((turn) => {
      const branch = activeBranch(turn);
      const loading = runtime.generation
        && runtime.generation.conversationId === conversationId
        && runtime.generation.turnId === turn.id
        && runtime.generation.userIndex === branch.userIndex
        && runtime.generation.assistantIndex === branch.assistantIndex;
      const user = branch.user ? `<article class="message user" data-turn="${escapeAttribute(turn.id)}">
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
          </div>
        </div>
      </article>` : '';
      return user + assistant;
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

  async function generate(conversationId, turnId) {
    if (runtime.generation || runtime.deletedIds.has(conversationId)) return;
    const original = runtime.histories.get(conversationId);
    const appended = appendAssistantVariant(original, turnId, { content: '正在连接当前模型……' });
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
    saveHistory(conversationId, appended.state).catch(() => undefined);

    const settings = runtime.runSettings() || {};
    const maxTokens = settings.outputLength === 'long' ? 1200 : settings.outputLength === 'short' ? 350 : 600;
    const temperature = settings.creativity === 'stable' ? 0.3 : settings.creativity === 'expansive' ? 1 : 0.7;
    let patch;
    let generated = false;
    try {
      const data = await requestJson(API.chat, {
        method: 'POST',
        signal: controller.signal,
        body: JSON.stringify({
          model: runtime.profile.current_chat_model || DEFAULT_MODEL,
          messages: contextMessages(appended.state, turnId),
          settings: { max_tokens: maxTokens, temperature },
        }),
      });
      patch = { content: data?.message?.content || '模型没有返回文本。', errorDetail: '' };
      generated = true;
    } catch (error) {
      patch = error.name === 'AbortError'
        ? { content: '已停止生成。', errorDetail: '' }
        : { content: '消息生成失败，请稍后重试。', errorDetail: `${error.type || 'request_failed'}: ${error.message}` };
    }

    if (runtime.deletedIds.has(conversationId)) {
      if (runtime.generation?.controller === controller) runtime.generation = null;
      composerState();
      return;
    }

    let latest = runtime.histories.get(conversationId) || appended.state;
    latest = updateAssistantVariant(latest, turnId, appended.userIndex, appended.assistantIndex, patch);
    setHistory(conversationId, latest);
    if (runtime.generation?.controller === controller) runtime.generation = null;
    renderMessages(conversationId);
    composerState();
    await saveHistory(conversationId, latest).catch(() => undefined);
    if (generated) autoTitle(conversationId, latest, turnId).catch(() => undefined);
  }

  async function autoTitle(conversationId, history, turnId) {
    if (normalizeState(history).turns.length !== 1) return;
    const conversation = runtime.conversations.find((item) => item.id === conversationId);
    if (!conversation || conversation.title_manual || conversation.title_generated_at) return;
    const turn = history.turns.find((item) => item.id === turnId);
    const branch = turn ? activeBranch(turn) : null;
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

  function send(text) {
    const content = String(text || '').trim();
    if (!content || !runtime.currentId || runtime.generation) return;
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
    if (!confirm('删除这个窗口？其他窗口不会受到影响。')) return;
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
    if (!runtime.conversations.length) runtime.conversations = [await createConversation('新聊天')];
    if (runtime.currentId === conversationId) await loadConversation(runtime.conversations[0].id);
    else renderConversationList();
  }

  function turnIdFrom(target) {
    return target.dataset.turn || target.closest('[data-turn]')?.dataset.turn || '';
  }

  async function handleAction(name, target) {
    const conversationId = target.dataset.id;
    if (name === 'new') return newConversation();
    if (name === 'menu') return toggleMenu(conversationId);
    if (name === 'open') return loadConversation(conversationId);
    if (name === 'rename') return renameConversation(conversationId).catch((error) => toast(`改名失败：${error.message}`));
    if (name === 'delete-conversation') return deleteConversation(conversationId).catch((error) => toast(`删除失败：${error.message}`));
    if (name === 'image') return toast('图片消息尚未接入正式模型接口。');
    if (name === 'mic') return toast('语音输入尚未接入。');

    const turnId = turnIdFrom(target);
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
      if (!runtime.conversations.length) runtime.conversations = [await createConversation('新聊天')];
      const remembered = storage.getCurrentConversation();
      const target = runtime.conversations.find((item) => item.id === remembered) || runtime.conversations[0];
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
      else toast('通话尚未接入。');
    });
    ui.input.addEventListener('input', composerState);
    ui.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        ui.form.requestSubmit();
      }
    });
    composerState();
  }

  async function start() {
    bindUi();
    bindComposer();
    await bootstrap();
  }

  return Object.freeze({
    start,
    handleAction,
    closeMenu,
    renderConversationList,
    renderMessages,
    getActiveMessages: () => activeMessages(currentHistory()),
    getCurrentConversationId: () => runtime.currentId,
    getCurrentConversation: () => runtime.conversations.find((item) => item.id === runtime.currentId) || null,
    getProfile: () => runtime.profile,
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
  });
}

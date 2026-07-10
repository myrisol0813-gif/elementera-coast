(() => {
  'use strict';

  if (window.ElementeraChat) return;

  const API = Object.freeze({
    chat: '/api/chat',
    conversations: '/api/chat/conversations',
    history: '/api/chat/history',
    profile: '/api/chat/profile',
    title: '/api/chat/title',
  });

  const STORAGE = Object.freeze({
    currentConversation: 'ec.currentConversationId',
    statePrefix: 'ec.chat.state.v3.',
    legacyStatePrefix: 'ec.mainChat.turns.v2.',
    legacyMainState: 'ec.mainChat.turns.v2',
    legacyFlatMessages: 'gpt_like_test_window_messages_clean_v1',
    avatar: 'gpt_like_assistant_avatar_dataurl_v1',
    chatModel: 'ec.currentChatModel',
    imageModel: 'ec.currentImageModel',
    modelBox: 'ec.modelBox.v1',
    oldModelLabel: 'wolf_model_v092',
  });

  const DEFAULT_MODEL = 'openai/gpt-4.1-nano';
  const MAX_CONTENT = 12000;

  const ui = {
    list: document.querySelector('#chatConversationList'),
    messages: document.querySelector('#messages'),
    scroller: document.querySelector('#messageScroller'),
    form: document.querySelector('#composer'),
    input: document.querySelector('#promptInput'),
    action: document.querySelector('#callButton'),
    mic: document.querySelector('#micButton'),
    status: document.querySelector('#chatSyncStatus'),
  };

  const runtime = {
    conversations: [],
    histories: new Map(),
    currentId: '',
    openMenuId: '',
    deletedIds: new Set(),
    saveChains: new Map(),
    generation: null,
    profileLoaded: false,
  };

  const escapeHtml = (value) => String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );

  const newId = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  const now = () => new Date().toISOString();
  const cleanId = (value) => String(value || 'main').replace(/[^\w:.-]/g, '_').slice(0, 160) || 'main';
  const clamp = (value, length) => length < 1 ? 0 : Math.min(Math.max(0, Number(value) || 0), length - 1);

  function readJson(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function normalizeVariant(value = {}) {
    const errorDetail = String(value.errorDetail || '')
      .split('\n')
      .filter((line) => !/^history sync:/i.test(line.trim()))
      .join('\n')
      .trim()
      .slice(0, MAX_CONTENT);
    return {
      id: cleanId(value.id || newId()),
      content: String(value.content ?? '').slice(0, MAX_CONTENT),
      created_at: typeof value.created_at === 'string' ? value.created_at : now(),
      ...(errorDetail ? { errorDetail } : {}),
    };
  }

  function normalizeTurn(value = {}) {
    const userVariants = (Array.isArray(value?.user?.variants) ? value.user.variants : [])
      .filter((item) => typeof item?.content === 'string')
      .map(normalizeVariant)
      .slice(0, 20);
    const branchCount = Math.max(1, userVariants.length);
    const variantsByUserVariant = {};
    const activeByUserVariant = {};

    for (let index = 0; index < branchCount; index += 1) {
      const key = String(index);
      const assistants = Array.isArray(value?.assistant?.variantsByUserVariant?.[key])
        ? value.assistant.variantsByUserVariant[key]
        : [];
      variantsByUserVariant[key] = assistants
        .filter((item) => typeof item?.content === 'string')
        .map(normalizeVariant)
        .slice(0, 20);
      activeByUserVariant[key] = clamp(
        value?.assistant?.activeByUserVariant?.[key],
        variantsByUserVariant[key].length || 1,
      );
    }

    return {
      id: cleanId(value.id || newId()),
      user: {
        active: clamp(value?.user?.active, userVariants.length || 1),
        variants: userVariants,
      },
      assistant: { activeByUserVariant, variantsByUserVariant },
    };
  }

  function normalizeState(value = {}) {
    const turns = (Array.isArray(value?.turns) ? value.turns : [])
      .map(normalizeTurn)
      .filter((turn) => turn.user.variants.length || Object.values(turn.assistant.variantsByUserVariant).some((list) => list.length))
      .slice(-100);
    return { version: 3, updated_at: value.updated_at || now(), turns };
  }

  function flatMessagesToState(messages = []) {
    const turns = [];
    let current = null;
    for (const message of Array.isArray(messages) ? messages : []) {
      if (!message || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string') continue;
      if (message.role === 'user') {
        current = {
          id: cleanId(`turn-${message.id || newId()}`),
          user: { active: 0, variants: [normalizeVariant(message)] },
          assistant: { activeByUserVariant: { 0: 0 }, variantsByUserVariant: { 0: [] } },
        };
        turns.push(current);
      } else if (current) {
        current.assistant.variantsByUserVariant['0'].push(normalizeVariant(message));
      }
    }
    return normalizeState({ turns });
  }

  function activeMessages(history = currentHistory()) {
    const messages = [];
    for (const turn of normalizeState(history).turns) {
      const userIndex = clamp(turn.user.active, turn.user.variants.length || 1);
      const user = turn.user.variants[userIndex];
      if (user?.content) messages.push({ id: user.id, role: 'user', content: user.content, created_at: user.created_at });
      const key = String(userIndex);
      const assistants = turn.assistant.variantsByUserVariant[key] || [];
      const assistant = assistants[clamp(turn.assistant.activeByUserVariant[key], assistants.length || 1)];
      if (assistant?.content) messages.push({
        id: assistant.id,
        role: 'assistant',
        content: assistant.content,
        created_at: assistant.created_at,
        ...(assistant.errorDetail ? { errorDetail: assistant.errorDetail } : {}),
      });
    }
    return messages;
  }

  function stateStorageKey(id) {
    return `${STORAGE.statePrefix}${cleanId(id)}`;
  }

  function readLocalState(id) {
    const conversationId = cleanId(id);
    const current = readJson(stateStorageKey(conversationId), null);
    if (current?.turns) return normalizeState(current);

    const keyedLegacy = readJson(`${STORAGE.legacyStatePrefix}${conversationId}`, null);
    if (keyedLegacy?.turns) return normalizeState(keyedLegacy);

    if (conversationId === 'main') {
      const legacyMain = readJson(STORAGE.legacyMainState, null);
      if (legacyMain?.turns) return normalizeState(legacyMain);
      const flat = readJson(STORAGE.legacyFlatMessages, []);
      if (Array.isArray(flat) && flat.length) return flatMessagesToState(flat);
    }
    return normalizeState();
  }

  function writeLocalState(id, history) {
    writeJson(stateStorageKey(id), normalizeState(history));
  }

  function removeLocalState(id) {
    localStorage.removeItem(stateStorageKey(id));
    localStorage.removeItem(`${STORAGE.legacyStatePrefix}${cleanId(id)}`);
  }

  function currentHistory() {
    return runtime.histories.get(runtime.currentId) || normalizeState();
  }

  function setHistory(id, history) {
    const conversationId = cleanId(id);
    const normalized = normalizeState(history);
    runtime.histories.set(conversationId, normalized);
    writeLocalState(conversationId, normalized);
    return normalized;
  }

  function profileFromLocalStorage() {
    const box = readJson(STORAGE.modelBox, { chat: [], free: [], image: [] });
    const cleanList = (value) => Array.isArray(value) ? value.filter((item) => typeof item === 'string').slice(0, 60) : [];
    return {
      assistant_avatar_dataurl: localStorage.getItem(STORAGE.avatar) || '',
      current_chat_model: localStorage.getItem(STORAGE.chatModel) || '',
      current_image_model: localStorage.getItem(STORAGE.imageModel) || '',
      model_box: {
        chat: cleanList(box?.chat),
        free: cleanList(box?.free),
        image: cleanList(box?.image),
      },
    };
  }

  function applyProfile(profile = {}) {
    if (typeof profile.assistant_avatar_dataurl === 'string' && profile.assistant_avatar_dataurl) {
      localStorage.setItem(STORAGE.avatar, profile.assistant_avatar_dataurl);
    }
    if (typeof profile.current_chat_model === 'string' && profile.current_chat_model) {
      localStorage.setItem(STORAGE.chatModel, profile.current_chat_model);
    }
    if (typeof profile.current_image_model === 'string' && profile.current_image_model) {
      localStorage.setItem(STORAGE.imageModel, profile.current_image_model);
    }
    if (profile.model_box && typeof profile.model_box === 'object') writeJson(STORAGE.modelBox, profile.model_box);
    runtime.profileLoaded = true;
    refreshModelLabel();
  }

  function refreshModelLabel() {
    const model = localStorage.getItem(STORAGE.chatModel) || DEFAULT_MODEL;
    localStorage.setItem(STORAGE.chatModel, model);
    localStorage.setItem(STORAGE.oldModelLabel, `${model} ›`);
    const label = document.querySelector('.model-name');
    if (label) {
      label.textContent = `${model} ›`;
      label.title = model;
    }
  }

  async function requestJson(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      const error = new Error(data?.error?.message || `请求失败（${response.status}）`);
      error.code = data?.error?.type || 'request_failed';
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function setSyncStatus(message = '', kind = 'error') {
    if (!ui.status) return;
    ui.status.textContent = message;
    ui.status.dataset.kind = kind;
    ui.status.hidden = !message;
  }

  function closeSidebar() {
    document.body.classList.remove('sidebar-open');
    const scrim = document.querySelector('#scrim');
    if (scrim) scrim.hidden = true;
  }

  function closeConversationMenu() {
    runtime.openMenuId = '';
    ui.list?.querySelectorAll('[data-chat-conversation-menu]').forEach((menu) => { menu.hidden = true; });
    ui.list?.querySelectorAll('[data-chat-conversation-more]').forEach((button) => button.setAttribute('aria-expanded', 'false'));
  }

  function toggleConversationMenu(id) {
    const conversationId = cleanId(id);
    const row = Array.from(ui.list?.querySelectorAll('[data-chat-conversation-row]') || [])
      .find((item) => item.dataset.chatConversationRow === conversationId);
    if (!row) return;
    const menu = row.querySelector('[data-chat-conversation-menu]');
    const button = row.querySelector('[data-chat-conversation-more]');
    const shouldOpen = runtime.openMenuId !== conversationId || menu.hidden;
    closeConversationMenu();
    if (!shouldOpen) return;
    runtime.openMenuId = conversationId;
    menu.hidden = false;
    button?.setAttribute('aria-expanded', 'true');
  }

  function renderConversationList() {
    if (!ui.list) return;
    closeConversationMenu();
    if (!runtime.conversations.length) {
      ui.list.innerHTML = '<p class="chat-conversation-empty">还没有聊天窗口</p>';
      return;
    }
    ui.list.innerHTML = runtime.conversations.map((conversation) => {
      const active = conversation.id === runtime.currentId;
      const id = escapeHtml(conversation.id);
      return `<div class="chat-conversation-row ${active ? 'is-active' : ''}" data-chat-conversation-row="${id}">
        <button class="history-item chat-conversation-title ${active ? 'is-active' : ''}" type="button" data-chat-conversation-open="${id}">${escapeHtml(conversation.title || '新聊天')}</button>
        <button class="chat-conversation-more" type="button" data-chat-conversation-more="${id}" aria-label="窗口操作" aria-expanded="false">⋯</button>
        <div class="chat-conversation-menu" data-chat-conversation-menu="${id}" hidden>
          <button type="button" data-chat-conversation-action="rename" data-chat-conversation-target="${id}">改名</button>
          <button class="is-danger" type="button" data-chat-conversation-action="delete" data-chat-conversation-target="${id}">删除</button>
        </div>
      </div>`;
    }).join('');
  }

  function assistantAvatar() {
    const url = localStorage.getItem(STORAGE.avatar) || '';
    return `<div class="avatar ${url ? 'has-custom-avatar' : ''}" role="button" tabindex="0" ${url ? `style="background-image:url(${url})"` : ''}>${url ? '' : '⌁'}</div>`;
  }

  function formatText(text) {
    return escapeHtml(text).split(/\n{2,}/).map((paragraph) => `<p>${paragraph.replace(/\n/g, '<br>')}</p>`).join('');
  }

  function variantSwitch(kind, turn, active, count) {
    if (count <= 1) return '';
    return `<span class="chat-variant-switch" data-chat-variant-kind="${kind}" data-chat-turn="${escapeHtml(turn.id)}"><button type="button" data-chat-variant-direction="previous">‹</button><span>${active + 1}/${count}</span><button type="button" data-chat-variant-direction="next">›</button></span>`;
  }

  function actionButton(action, title) {
    return `<button class="action-button" type="button" data-chat-message-action="${action}" title="${escapeHtml(title)}"></button>`;
  }

  function renderMessages(id = runtime.currentId) {
    if (!ui.messages || id !== runtime.currentId) return;
    const history = runtime.histories.get(id) || normalizeState();
    const html = history.turns.map((turn) => {
      const userIndex = clamp(turn.user.active, turn.user.variants.length || 1);
      const user = turn.user.variants[userIndex];
      const branchKey = String(userIndex);
      const assistants = turn.assistant.variantsByUserVariant[branchKey] || [];
      const assistantIndex = clamp(turn.assistant.activeByUserVariant[branchKey], assistants.length || 1);
      const assistant = assistants[assistantIndex];
      const loading = runtime.generation
        && runtime.generation.conversationId === id
        && runtime.generation.turnId === turn.id
        && runtime.generation.userIndex === userIndex
        && runtime.generation.assistantIndex === assistantIndex;
      const userHtml = user ? `<article class="message user" data-chat-turn="${escapeHtml(turn.id)}" data-chat-role="user"><div class="content"><div class="user-bubble">${escapeHtml(user.content)}</div><div class="user-actions" data-chat-user-actions="${escapeHtml(turn.id)}">${actionButton('edit-user', '编辑')}${actionButton('delete-user', '删除')}${variantSwitch('user', turn, userIndex, turn.user.variants.length)}</div></div></article>` : '';
      const assistantHtml = assistant ? `<article class="message assistant" data-chat-turn="${escapeHtml(turn.id)}" data-chat-role="assistant">${assistantAvatar()}<div class="content"><div class="assistant-text">${formatText(assistant.content)}${assistant.errorDetail ? `<span class="chat-error-detail">${escapeHtml(assistant.errorDetail)}</span>` : ''}${loading ? '<span class="typing-cursor"></span>' : ''}</div><div class="assistant-actions" data-chat-assistant-actions="${escapeHtml(turn.id)}">${actionButton('copy', '复制')}${actionButton('like', '点赞')}${actionButton('regenerate', '重新生成')}${actionButton('favorite', '收藏')}${actionButton('delete-assistant', '删除')}${variantSwitch('assistant', turn, assistantIndex, assistants.length)}</div></div></article>` : '';
      return userHtml + assistantHtml;
    }).join('');
    ui.messages.innerHTML = (html || '<div class="empty-state" role="status">这里还没有消息。</div>') + '<div class="thread-spacer"></div>';
    requestAnimationFrame(() => {
      if (ui.scroller) ui.scroller.scrollTop = ui.scroller.scrollHeight;
    });
  }

  function syncComposer() {
    if (!ui.input) return;
    ui.input.style.height = '22px';
    const height = Math.min(Math.max(ui.input.scrollHeight, 22), 88);
    const pillHeight = Math.max(42, height + 18);
    ui.input.style.height = `${height}px`;
    document.documentElement.style.setProperty('--input-h', `${height}px`);
    document.documentElement.style.setProperty('--pill-h', `${pillHeight}px`);
    document.documentElement.style.setProperty('--composer-h', `${pillHeight + 14}px`);
    document.querySelector('.input-pill')?.classList.toggle('is-multiline', height > 26 || ui.input.value.includes('\n'));

    const generating = Boolean(runtime.generation);
    const hasText = Boolean(ui.input.value.trim());
    if (ui.action) {
      ui.action.dataset.icon = generating ? 'stop' : hasText ? 'send' : 'call';
      ui.action.setAttribute('aria-label', generating ? '停止生成' : hasText ? '发送' : '通话');
    }
    if (ui.mic) ui.mic.hidden = generating || hasText;
  }

  async function fetchConversations() {
    const data = await requestJson(API.conversations);
    const seen = new Set();
    runtime.conversations = (Array.isArray(data.conversations) ? data.conversations : [])
      .filter((conversation) => conversation?.id && !seen.has(conversation.id) && seen.add(conversation.id));
    return runtime.conversations;
  }

  async function createConversation(title = '新聊天') {
    const data = await requestJson(API.conversations, {
      method: 'POST',
      body: JSON.stringify({ title }),
    });
    const conversation = data.conversation;
    runtime.conversations = [conversation, ...runtime.conversations.filter((item) => item.id !== conversation.id)];
    runtime.histories.set(conversation.id, normalizeState());
    return conversation;
  }

  async function loadConversation(id) {
    const conversationId = cleanId(id);
    if (runtime.deletedIds.has(conversationId)) return;
    runtime.currentId = conversationId;
    localStorage.setItem(STORAGE.currentConversation, conversationId);
    renderConversationList();
    setSyncStatus('');

    const local = readLocalState(conversationId);
    try {
      const data = await requestJson(`${API.history}?conversation_id=${encodeURIComponent(conversationId)}`);
      let history = normalizeState(data.history || {});
      if (!history.turns.length && local.turns.length) {
        history = setHistory(conversationId, local);
        await saveHistory(conversationId, history);
      } else {
        setHistory(conversationId, history);
      }
    } catch (error) {
      setHistory(conversationId, local);
      setSyncStatus(`聊天记录暂时无法从服务器载入；已显示本机副本。${error.message}`, 'error');
    }
    renderMessages(conversationId);
  }

  function saveHistory(id, history) {
    const conversationId = cleanId(id);
    const normalized = setHistory(conversationId, history);
    const previous = runtime.saveChains.get(conversationId) || Promise.resolve();
    const next = previous.catch(() => undefined).then(async () => {
      if (runtime.deletedIds.has(conversationId)) return;
      try {
        await requestJson(`${API.history}?conversation_id=${encodeURIComponent(conversationId)}`, {
          method: 'PUT',
          body: JSON.stringify(normalized),
        });
        if (runtime.currentId === conversationId) setSyncStatus('');
      } catch (error) {
        if (runtime.currentId === conversationId && !runtime.deletedIds.has(conversationId)) {
          setSyncStatus(`聊天记录同步失败，内容仍保存在本机。${error.message}`, 'error');
        }
        throw error;
      }
    });
    runtime.saveChains.set(conversationId, next);
    next.finally(() => {
      if (runtime.saveChains.get(conversationId) === next) runtime.saveChains.delete(conversationId);
    }).catch(() => undefined);
    return next;
  }

  async function renameConversation(id) {
    const conversationId = cleanId(id);
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

  async function deleteConversation(id) {
    const conversationId = cleanId(id);
    if (!confirm('删除这个窗口？其他窗口不会受到影响。')) return;
    runtime.deletedIds.add(conversationId);
    closeConversationMenu();
    if (runtime.generation?.conversationId === conversationId) runtime.generation.controller.abort();
    try {
      await requestJson(`${API.conversations}/${encodeURIComponent(conversationId)}`, { method: 'DELETE' });
    } catch (error) {
      runtime.deletedIds.delete(conversationId);
      throw error;
    }

    runtime.conversations = runtime.conversations.filter((item) => item.id !== conversationId);
    runtime.histories.delete(conversationId);
    removeLocalState(conversationId);

    if (!runtime.conversations.length) runtime.conversations = [await createConversation('新聊天')];
    if (runtime.currentId === conversationId) await loadConversation(runtime.conversations[0].id);
    else renderConversationList();
  }

  async function syncProfile() {
    if (!runtime.profileLoaded) return;
    try {
      await requestJson(API.profile, {
        method: 'PUT',
        body: JSON.stringify({ profile: profileFromLocalStorage() }),
      });
      refreshModelLabel();
      renderMessages();
    } catch (error) {
      setSyncStatus(`个人设置同步失败；设置仍保存在本机。${error.message}`, 'error');
    }
  }

  function contextMessages(history, turnId) {
    const result = [];
    for (const turn of normalizeState(history).turns) {
      const userIndex = clamp(turn.user.active, turn.user.variants.length || 1);
      const user = turn.user.variants[userIndex];
      if (user?.content) result.push({ role: 'user', content: user.content });
      if (turn.id === turnId) break;
      const key = String(userIndex);
      const assistants = turn.assistant.variantsByUserVariant[key] || [];
      const assistant = assistants[clamp(turn.assistant.activeByUserVariant[key], assistants.length || 1)];
      if (assistant?.content) result.push({ role: 'assistant', content: assistant.content });
    }
    return result.slice(-20);
  }

  async function generateAssistant(id, turnId) {
    const conversationId = cleanId(id);
    const history = runtime.histories.get(conversationId);
    const turn = history?.turns.find((item) => item.id === turnId);
    if (!turn || runtime.deletedIds.has(conversationId)) return;

    const userIndex = clamp(turn.user.active, turn.user.variants.length || 1);
    const key = String(userIndex);
    turn.assistant.variantsByUserVariant[key] ||= [];
    const assistant = normalizeVariant({ content: '正在连接当前模型……' });
    turn.assistant.variantsByUserVariant[key].push(assistant);
    const assistantIndex = turn.assistant.variantsByUserVariant[key].length - 1;
    turn.assistant.activeByUserVariant[key] = assistantIndex;

    const controller = new AbortController();
    runtime.generation = { conversationId, turnId, userIndex, assistantIndex, controller };
    setHistory(conversationId, history);
    renderMessages(conversationId);
    syncComposer();
    saveHistory(conversationId, history).catch(() => undefined);

    const model = localStorage.getItem(STORAGE.chatModel) || DEFAULT_MODEL;
    const settings = window.elementeraRunControl?.getSettings?.() || {};
    const maxTokens = settings.outputLength === 'long' ? 1200 : settings.outputLength === 'short' ? 350 : 600;
    const temperature = settings.creativity === 'stable' ? 0.3 : settings.creativity === 'expansive' ? 1 : 0.7;
    let generated = false;

    try {
      const data = await requestJson(API.chat, {
        method: 'POST',
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages: contextMessages(history, turnId),
          settings: { max_tokens: maxTokens, temperature },
        }),
      });
      assistant.content = data?.message?.content || '模型没有返回文本。';
      delete assistant.errorDetail;
      generated = true;
    } catch (error) {
      assistant.content = error.name === 'AbortError' ? '已停止生成。' : '消息生成失败，请稍后重试。';
      assistant.errorDetail = error.name === 'AbortError' ? '' : `${error.code || 'request_failed'}: ${error.message}`;
    } finally {
      if (runtime.generation?.controller === controller) runtime.generation = null;
      setHistory(conversationId, history);
      renderMessages(conversationId);
      syncComposer();
      await saveHistory(conversationId, history).catch(() => undefined);
      if (generated) autoTitle(conversationId, history, turn).catch(() => undefined);
    }
  }

  function sendMessage(text) {
    const content = String(text || '').trim();
    if (!content || !runtime.currentId || runtime.generation) return;
    const history = currentHistory();
    const turn = {
      id: cleanId(newId()),
      user: { active: 0, variants: [normalizeVariant({ content })] },
      assistant: { activeByUserVariant: { 0: 0 }, variantsByUserVariant: { 0: [] } },
    };
    history.turns.push(turn);
    setHistory(runtime.currentId, history);
    if (ui.input) ui.input.value = '';
    syncComposer();
    renderMessages();
    generateAssistant(runtime.currentId, turn.id);
  }

  async function autoTitle(id, history, turn) {
    if (normalizeState(history).turns.length !== 1) return;
    const conversation = runtime.conversations.find((item) => item.id === id);
    if (!conversation || conversation.title_manual || conversation.title_generated_at) return;
    const userIndex = clamp(turn.user.active, turn.user.variants.length || 1);
    const key = String(userIndex);
    const assistants = turn.assistant.variantsByUserVariant[key] || [];
    const assistant = assistants[clamp(turn.assistant.activeByUserVariant[key], assistants.length || 1)];
    const data = await requestJson(API.title, {
      method: 'POST',
      body: JSON.stringify({ conversation_id: id, user: turn.user.variants[userIndex]?.content || '', assistant: assistant?.content || '' }),
    });
    if (data.conversation) {
      runtime.conversations = runtime.conversations.map((item) => item.id === id ? data.conversation : item);
      renderConversationList();
    }
  }

  function editUser(turnId) {
    const history = currentHistory();
    const turn = history.turns.find((item) => item.id === turnId);
    if (!turn) return;
    const index = clamp(turn.user.active, turn.user.variants.length || 1);
    const content = prompt('编辑消息', turn.user.variants[index]?.content || '');
    if (content == null || content === turn.user.variants[index]?.content) return;
    turn.user.variants.push(normalizeVariant({ content }));
    const nextIndex = turn.user.variants.length - 1;
    turn.user.active = nextIndex;
    turn.assistant.variantsByUserVariant[String(nextIndex)] = [];
    turn.assistant.activeByUserVariant[String(nextIndex)] = 0;
    setHistory(runtime.currentId, history);
    generateAssistant(runtime.currentId, turnId);
  }

  function deleteUser(turnId) {
    const history = currentHistory();
    const turnIndex = history.turns.findIndex((item) => item.id === turnId);
    const turn = history.turns[turnIndex];
    if (!turn) return;
    const userIndex = clamp(turn.user.active, turn.user.variants.length || 1);
    turn.user.variants.splice(userIndex, 1);
    if (!turn.user.variants.length) history.turns.splice(turnIndex, 1);
    else {
      const variants = {};
      const active = {};
      for (let index = 0; index < turn.user.variants.length; index += 1) {
        const previousKey = String(index >= userIndex ? index + 1 : index);
        const key = String(index);
        variants[key] = turn.assistant.variantsByUserVariant[previousKey] || [];
        active[key] = clamp(turn.assistant.activeByUserVariant[previousKey], variants[key].length || 1);
      }
      turn.user.active = Math.min(userIndex, turn.user.variants.length - 1);
      turn.assistant.variantsByUserVariant = variants;
      turn.assistant.activeByUserVariant = active;
    }
    setHistory(runtime.currentId, history);
    renderMessages();
    saveHistory(runtime.currentId, history).catch(() => undefined);
  }

  function deleteAssistant(turnId) {
    const history = currentHistory();
    const turn = history.turns.find((item) => item.id === turnId);
    if (!turn) return;
    const userIndex = clamp(turn.user.active, turn.user.variants.length || 1);
    const key = String(userIndex);
    const assistants = turn.assistant.variantsByUserVariant[key] || [];
    if (!assistants.length) return;
    const assistantIndex = clamp(turn.assistant.activeByUserVariant[key], assistants.length);
    assistants.splice(assistantIndex, 1);
    turn.assistant.activeByUserVariant[key] = Math.min(assistantIndex, Math.max(0, assistants.length - 1));
    setHistory(runtime.currentId, history);
    renderMessages();
    saveHistory(runtime.currentId, history).catch(() => undefined);
  }

  function switchVariant(turnId, kind, direction) {
    const history = currentHistory();
    const turn = history.turns.find((item) => item.id === turnId);
    if (!turn) return;
    const delta = direction === 'next' ? 1 : -1;
    if (kind === 'user') {
      const count = turn.user.variants.length;
      turn.user.active = (clamp(turn.user.active, count) + delta + count) % count;
    } else {
      const userIndex = clamp(turn.user.active, turn.user.variants.length || 1);
      const key = String(userIndex);
      const assistants = turn.assistant.variantsByUserVariant[key] || [];
      if (assistants.length > 1) {
        turn.assistant.activeByUserVariant[key] = (clamp(turn.assistant.activeByUserVariant[key], assistants.length) + delta + assistants.length) % assistants.length;
      }
    }
    setHistory(runtime.currentId, history);
    renderMessages();
    saveHistory(runtime.currentId, history).catch(() => undefined);
  }

  function regenerate(turnId) {
    if (runtime.generation) return;
    generateAssistant(runtime.currentId, turnId);
  }

  function currentAssistant(turnId) {
    const turn = currentHistory().turns.find((item) => item.id === turnId);
    if (!turn) return null;
    const userIndex = clamp(turn.user.active, turn.user.variants.length || 1);
    const key = String(userIndex);
    const assistants = turn.assistant.variantsByUserVariant[key] || [];
    return assistants[clamp(turn.assistant.activeByUserVariant[key], assistants.length || 1)] || null;
  }

  async function importFlatMessages(messages) {
    if (!runtime.currentId) throw new Error('当前没有聊天窗口');
    const history = flatMessagesToState(messages);
    setHistory(runtime.currentId, history);
    renderMessages();
    await saveHistory(runtime.currentId, history);
  }

  async function bootstrap() {
    refreshModelLabel();
    setSyncStatus('正在载入聊天窗口…', 'loading');
    if (ui.list) ui.list.innerHTML = '<p class="chat-conversation-empty">正在载入…</p>';

    try {
      const [profileData] = await Promise.all([
        requestJson(API.profile).catch(() => ({ profile: {} })),
        fetchConversations(),
      ]);
      applyProfile(profileData.profile || {});
      if (!runtime.conversations.length) runtime.conversations = [await createConversation('新聊天')];
      const remembered = cleanId(localStorage.getItem(STORAGE.currentConversation) || '');
      const target = runtime.conversations.find((item) => item.id === remembered) || runtime.conversations[0];
      await loadConversation(target.id);
      setSyncStatus('');
    } catch (error) {
      runtime.profileLoaded = true;
      setSyncStatus(`聊天窗口载入失败：${error.message}`, 'error');
      if (ui.list) ui.list.innerHTML = '<p class="chat-conversation-empty is-error">无法载入聊天窗口</p>';
    }
  }

  ui.form?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (runtime.generation) {
      runtime.generation.controller.abort();
      return;
    }
    sendMessage(ui.input?.value || '');
  });

  ui.input?.addEventListener('input', syncComposer);
  ui.input?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      ui.form?.requestSubmit();
    }
  });

  ui.action?.addEventListener('click', (event) => {
    event.preventDefault();
    if (runtime.generation) runtime.generation.controller.abort();
    else if (ui.input?.value.trim()) ui.form?.requestSubmit();
  });

  document.addEventListener('click', async (event) => {
    const newChat = event.target.closest('#newChatButton');
    if (newChat) {
      event.preventDefault();
      const conversation = await createConversation('新聊天').catch((error) => {
        alert(`新建窗口失败：${error.message}`);
        return null;
      });
      if (conversation) await loadConversation(conversation.id);
      return;
    }

    const more = event.target.closest('[data-chat-conversation-more]');
    if (more) {
      event.preventDefault();
      toggleConversationMenu(more.dataset.chatConversationMore);
      return;
    }

    const conversationAction = event.target.closest('[data-chat-conversation-action]');
    if (conversationAction) {
      event.preventDefault();
      const id = conversationAction.dataset.chatConversationTarget;
      try {
        if (conversationAction.dataset.chatConversationAction === 'rename') await renameConversation(id);
        else await deleteConversation(id);
      } catch (error) {
        alert(`${conversationAction.dataset.chatConversationAction === 'rename' ? '改名' : '删除'}失败：${error.message}`);
      }
      return;
    }

    const open = event.target.closest('[data-chat-conversation-open]');
    if (open) {
      event.preventDefault();
      closeConversationMenu();
      await loadConversation(open.dataset.chatConversationOpen);
      closeSidebar();
      return;
    }

    if (!event.target.closest('[data-chat-conversation-row]')) closeConversationMenu();

    const variantButton = event.target.closest('[data-chat-variant-direction]');
    if (variantButton) {
      event.preventDefault();
      const wrapper = variantButton.closest('[data-chat-variant-kind]');
      switchVariant(wrapper.dataset.chatTurn, wrapper.dataset.chatVariantKind, variantButton.dataset.chatVariantDirection);
      return;
    }

    const action = event.target.closest('[data-chat-message-action]');
    if (!action) return;
    event.preventDefault();
    const article = action.closest('[data-chat-turn]');
    const turnId = article?.dataset.chatTurn;
    switch (action.dataset.chatMessageAction) {
      case 'edit-user': editUser(turnId); break;
      case 'delete-user': deleteUser(turnId); break;
      case 'delete-assistant': deleteAssistant(turnId); break;
      case 'regenerate': regenerate(turnId); break;
      case 'copy': await navigator.clipboard?.writeText(currentAssistant(turnId)?.content || ''); break;
      case 'like':
      case 'favorite': action.classList.toggle('is-active'); break;
      default: break;
    }
  });

  window.addEventListener('elementera:profile-changed', () => syncProfile());

  window.ElementeraChat = Object.freeze({
    bootstrap,
    syncProfile,
    getActiveMessages: () => activeMessages(),
    importFlatMessages,
    getCurrentConversationId: () => runtime.currentId,
  });

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', bootstrap, { once: true })
    : bootstrap();
})();

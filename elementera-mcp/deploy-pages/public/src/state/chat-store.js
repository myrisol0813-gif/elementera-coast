export const CHAT_WINDOWS_KEY = 'ec.chatWindows.v1';
export const CURRENT_WINDOW_KEY = 'ec.currentChatWindowId.v1';

export function now() {
  return Date.now();
}

export function createId(prefix) {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now()}_${random}`;
}

export function normalizeTitle(title, fallback = '新聊天') {
  const value = String(title || '').trim().slice(0, 40);
  return value || fallback;
}

export function createMessage(input = {}) {
  const role = input.role === 'assistant' ? 'assistant' : 'user';
  return {
    id: input.id || createId('msg'),
    role,
    content: typeof input.content === 'string' ? input.content : '',
    createdAt: Number.isFinite(input.createdAt) ? input.createdAt : now(),
    model: input.model ?? null,
  };
}

export function createWindowRecord(title = '新聊天', messages = []) {
  const timestamp = now();
  return {
    id: createId('win'),
    title: normalizeTitle(title),
    createdAt: timestamp,
    updatedAt: timestamp,
    messages: Array.isArray(messages) ? messages.map(createMessage).filter((message) => message.content.trim()) : [],
  };
}

export function emptyState() {
  const window = createWindowRecord('新聊天', []);
  return {
    windows: [window],
    currentWindowId: window.id,
  };
}

function safeParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function normalizeState(raw) {
  const windowsInput = Array.isArray(raw?.windows) ? raw.windows : [];
  const windows = windowsInput.map((item) => {
    const createdAt = Number.isFinite(item?.createdAt) ? item.createdAt : now();
    const updatedAt = Number.isFinite(item?.updatedAt) ? item.updatedAt : createdAt;
    return {
      id: typeof item?.id === 'string' && item.id ? item.id : createId('win'),
      title: normalizeTitle(item?.title),
      createdAt,
      updatedAt,
      messages: Array.isArray(item?.messages) ? item.messages.map(createMessage).filter((message) => message.content.trim()) : [],
    };
  });

  if (!windows.length) return emptyState();

  const currentWindowId = windows.some((window) => window.id === raw?.currentWindowId)
    ? raw.currentWindowId
    : windows[0].id;

  return { windows, currentWindowId };
}

export function loadChatState() {
  const stored = safeParse(localStorage.getItem(CHAT_WINDOWS_KEY));
  if (!stored) return emptyState();

  const currentWindowId = localStorage.getItem(CURRENT_WINDOW_KEY) || stored.currentWindowId;
  return normalizeState({ ...stored, currentWindowId });
}

export function saveChatState(state) {
  const normalized = normalizeState(state);
  localStorage.setItem(CHAT_WINDOWS_KEY, JSON.stringify(normalized));
  localStorage.setItem(CURRENT_WINDOW_KEY, normalized.currentWindowId);
  return normalized;
}

export function getCurrentWindow(state) {
  const normalized = normalizeState(state);
  return normalized.windows.find((window) => window.id === normalized.currentWindowId) || normalized.windows[0];
}

export function createWindow(title = '新聊天') {
  const state = loadChatState();
  const window = createWindowRecord(title, []);
  return saveChatState({
    windows: [window, ...state.windows],
    currentWindowId: window.id,
  });
}

export function renameWindow(windowId, title) {
  const state = loadChatState();
  const windows = state.windows.map((window) => window.id === windowId
    ? { ...window, title: normalizeTitle(title, window.title), updatedAt: now() }
    : window);
  return saveChatState({ ...state, windows });
}

export function deleteWindow(windowId) {
  const state = loadChatState();
  const remaining = state.windows.filter((window) => window.id !== windowId);
  if (!remaining.length) return saveChatState(emptyState());

  const currentWindowId = state.currentWindowId === windowId ? remaining[0].id : state.currentWindowId;
  return saveChatState({ windows: remaining, currentWindowId });
}

export function appendMessage(windowId, message) {
  const state = loadChatState();
  const windows = state.windows.map((window) => window.id === windowId
    ? { ...window, messages: [...window.messages, createMessage(message)], updatedAt: now() }
    : window);
  return saveChatState({ ...state, windows });
}

export function deleteMessageById(windowId, messageId) {
  const state = loadChatState();
  const windows = state.windows.map((window) => window.id === windowId
    ? { ...window, messages: window.messages.filter((message) => message.id !== messageId), updatedAt: now() }
    : window);
  return saveChatState({ ...state, windows });
}

export function clearWindow(windowId) {
  const state = loadChatState();
  const windows = state.windows.map((window) => window.id === windowId
    ? { ...window, messages: [], updatedAt: now() }
    : window);
  return saveChatState({ ...state, windows });
}

import {
  CHAT_WINDOWS_KEY,
  CURRENT_WINDOW_KEY,
  createMessage,
  createWindowRecord,
  saveChatState,
} from '../state/chat-store.js';

export const LEGACY_MESSAGES_KEY = 'gpt_like_test_window_messages_clean_v1';

const LEGACY_DEMO_MESSAGES = new Set([
  '这是唯一保留的 GPT-like 测试窗口。\n\n这个窗口会把对话保存在本机浏览器里；刷新页面、从侧边栏点回来，内容都会继续在这里。',
  '我们先把这个壳调到像移动端 ChatGPT。',
  '好。接下来主要检查输入栏高度、按钮位置、消息是否保存，以及主题是否舒服。',
]);

function safeParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isLegacyDemoMessage(message) {
  return LEGACY_DEMO_MESSAGES.has(String(message?.content || ''));
}

function normalizeLegacyMessages(raw) {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((message) => message && ['user', 'assistant'].includes(message.role))
    .filter((message) => typeof message.content === 'string' && message.content.trim())
    .filter((message) => !isLegacyDemoMessage(message))
    .map((message) => createMessage({
      id: typeof message.id === 'string' && message.id ? message.id : undefined,
      role: message.role,
      content: message.content,
      createdAt: Number.isFinite(message.createdAt) ? message.createdAt : undefined,
      model: message.model ?? null,
    }));
}

export function migrateLegacyMessagesIfNeeded() {
  if (localStorage.getItem(CHAT_WINDOWS_KEY)) {
    return { migrated: false, reason: 'v2 state already exists' };
  }

  const legacyRaw = safeParse(localStorage.getItem(LEGACY_MESSAGES_KEY));
  const migratedMessages = normalizeLegacyMessages(legacyRaw);
  const title = migratedMessages.length ? '旧窗口导入' : '新聊天';
  const window = createWindowRecord(title, migratedMessages);
  const state = {
    windows: [window],
    currentWindowId: window.id,
  };

  saveChatState(state);
  localStorage.setItem(CURRENT_WINDOW_KEY, window.id);

  return {
    migrated: migratedMessages.length > 0,
    reason: migratedMessages.length ? 'legacy messages copied' : 'empty v2 window created',
    copiedCount: migratedMessages.length,
  };
}

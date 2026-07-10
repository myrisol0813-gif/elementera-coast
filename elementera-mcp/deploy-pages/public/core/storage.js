const STATE_KEY = 'elementera.local.v1';
const CURRENT_CONVERSATION_KEY = 'elementera.currentConversation';

const OLD_KEYS = Object.freeze({
  theme: 'gpt_like_shell_theme_clean_v1',
  avatar: 'gpt_like_assistant_avatar_dataurl_v1',
  userBubble: 'wolf_user_bubble_v092',
  accent: 'wolf_accent_v092',
  xiaohanAvatar: 'coast_avatar_xiaohan_v099',
  xiaohanName: 'cw_name',
  xiaohanNote: 'cw_note',
  myriName: 'cs_name',
  myriPortrait: 'cs_portrait',
  myriNote: 'cs_note',
  systemDraft: 'cs_system',
  radio: 'coast_radio_rooms_v095',
  lighthouse: 'coast_lighthouse_rooms_v096',
  runControl: 'elementera.runControlSettings',
  currentConversation: 'ec.currentConversationId',
  olderConversation: 'coast_main_active_v097',
  modelBox: 'ec.modelBox.v1',
  currentChatModel: 'ec.currentChatModel',
  currentImageModel: 'ec.currentImageModel',
  oldModelLabel: 'wolf_model_v092',
  modelCatalog: 'ec.modelCatalog.cache',
});

function defaultRoom(kind) {
  const letter = kind === 'lighthouse';
  return {
    active: letter ? 'letter-default' : 'radio-default',
    rooms: [{
      id: letter ? 'letter-default' : 'radio-default',
      title: letter ? '灯塔来信' : '无线电波',
      messages: [],
      updatedAt: Date.now(),
    }],
  };
}

function defaults() {
  return {
    version: 1,
    preferences: {
      theme: 'light',
      userBubble: '',
      accent: '',
      xiaohanAvatar: '',
      xiaohanName: '小寒',
      xiaohanNote: '',
      myriName: 'Myri',
      myriPortrait: 'Myrisol / Myri · 海岸小蛇 · 小蛇书桌主人。',
      myriNote: '',
      systemDraft: '',
      assistantBubble: '',
    },
    rooms: {
      radio: defaultRoom('radio'),
      lighthouse: defaultRoom('lighthouse'),
    },
    runControl: {
      recentTurns: 8,
      contextBudget: 6000,
      outputLength: 'auto',
      creativity: 'balanced',
      scratchpadBudget: 0,
      seedRecallLimit: 0,
    },
    letters: {},
    migration: { pending: false, profile: null },
  };
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value || '') ?? fallback;
  } catch {
    return fallback;
  }
}

function normalizeRoom(value, kind) {
  const fallback = defaultRoom(kind);
  const rooms = Array.isArray(value?.rooms)
    ? value.rooms.filter((room) => room && typeof room.id === 'string').map((room) => ({
      id: room.id.slice(0, 160),
      title: String(room.title || (kind === 'lighthouse' ? '灯塔来信' : '无线电波')).slice(0, 80),
      messages: Array.isArray(room.messages) ? room.messages.filter((message) => message && typeof message.text === 'string').slice(-200) : [],
      updatedAt: Number(room.updatedAt || Date.now()),
    })) : [];
  if (!rooms.length) return fallback;
  const active = rooms.some((room) => room.id === value?.active) ? value.active : rooms[0].id;
  return { rooms, active };
}

function normalize(value) {
  const base = defaults();
  return {
    version: 1,
    preferences: { ...base.preferences, ...(value?.preferences || {}) },
    rooms: {
      radio: normalizeRoom(value?.rooms?.radio, 'radio'),
      lighthouse: normalizeRoom(value?.rooms?.lighthouse, 'lighthouse'),
    },
    runControl: { ...base.runControl, ...(value?.runControl || {}) },
    letters: value?.letters && typeof value.letters === 'object' ? value.letters : {},
    migration: {
      pending: Boolean(value?.migration?.pending),
      profile: value?.migration?.profile && typeof value.migration.profile === 'object' ? value.migration.profile : null,
    },
  };
}

function oldValue(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function extractOldLetters(target) {
  const grouped = new Map();
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index) || '';
    if (!key.startsWith('coast_lovebook_v119::') && !key.startsWith('coast_island_letter_v118::')) continue;
    const parts = key.split('::');
    if (parts[0] === 'coast_island_letter_v118' && parts.length >= 3) {
      const windowId = parts[1];
      const model = parts.slice(2).join('::').replace(/^ChatGPT\s+/, '').replace(/\s*›\s*$/, '');
      const compound = `${windowId}::${model}`;
      const item = grouped.get(compound) || {};
      item.islandText = oldValue(key) || '';
      grouped.set(compound, item);
    }
    if (parts[0] === 'coast_lovebook_v119' && parts.length >= 4) {
      const windowId = parts[1];
      const name = parts.at(-1);
      const model = parts.slice(2, -1).join('::').replace(/^ChatGPT\s+/, '').replace(/\s*›\s*$/, '');
      const compound = `${windowId}::${model}`;
      const item = grouped.get(compound) || {};
      item[name] = oldValue(key) || '';
      grouped.set(compound, item);
    }
  }
  for (const [key, value] of grouped) target[key] = value;
}

function buildMigration() {
  const state = defaults();
  const stored = oldValue(STATE_KEY);
  if (stored) {
    const restored = normalize(parseJson(stored, state));
    return { state: restored, profile: restored.migration.profile, pending: restored.migration.pending };
  }

  state.preferences.theme = oldValue(OLD_KEYS.theme) || state.preferences.theme;
  state.preferences.userBubble = oldValue(OLD_KEYS.userBubble) || '';
  state.preferences.accent = oldValue(OLD_KEYS.accent) || '';
  state.preferences.xiaohanAvatar = oldValue(OLD_KEYS.xiaohanAvatar) || '';
  state.preferences.xiaohanName = oldValue(OLD_KEYS.xiaohanName) || state.preferences.xiaohanName;
  state.preferences.xiaohanNote = oldValue(OLD_KEYS.xiaohanNote) || '';
  state.preferences.myriName = oldValue(OLD_KEYS.myriName) || state.preferences.myriName;
  state.preferences.myriPortrait = oldValue(OLD_KEYS.myriPortrait) || state.preferences.myriPortrait;
  state.preferences.myriNote = oldValue(OLD_KEYS.myriNote) || '';
  state.preferences.systemDraft = oldValue(OLD_KEYS.systemDraft) || '';
  state.rooms.radio = normalizeRoom(parseJson(oldValue(OLD_KEYS.radio), null), 'radio');
  state.rooms.lighthouse = normalizeRoom(parseJson(oldValue(OLD_KEYS.lighthouse), null), 'lighthouse');
  state.runControl = { ...state.runControl, ...parseJson(oldValue(OLD_KEYS.runControl), {}) };
  extractOldLetters(state.letters);

  const modelBox = parseJson(oldValue(OLD_KEYS.modelBox), { chat: [], free: [], image: [] });
  const profile = {
    assistant_avatar_dataurl: oldValue(OLD_KEYS.avatar) || '',
    current_chat_model: oldValue(OLD_KEYS.currentChatModel) || '',
    current_image_model: oldValue(OLD_KEYS.currentImageModel) || '',
    model_box: modelBox,
  };
  state.migration = { pending: true, profile };
  return { state: normalize(state), profile, pending: true };
}

function retiredKeys() {
  const keys = new Set(Object.values(OLD_KEYS));
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index) || '';
    if (/^(coast_lovebook_v119::|coast_island_letter_v118::|ec\.chat\.state\.v3\.|ec\.mainChat\.turns\.v2|gpt_like_test_window_messages_clean_v1)/.test(key)) keys.add(key);
  }
  return [...keys];
}

export function createStorage() {
  const migration = buildMigration();
  let state = migration.state;
  localStorage.setItem(STATE_KEY, JSON.stringify(state));

  function save() {
    state = normalize(state);
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
    return state;
  }

  return Object.freeze({
    read: () => state,
    update(mutator) {
      mutator(state);
      return save();
    },
    migrationProfile: migration.profile,
    migrationPending: migration.pending,
    completeMigration() {
      if (!migration.pending) return;
      state.migration = { pending: false, profile: null };
      save();
      for (const key of retiredKeys()) localStorage.removeItem(key);
      migration.pending = false;
      migration.profile = null;
    },
    getCurrentConversation() {
      return oldValue(CURRENT_CONVERSATION_KEY)
        || oldValue(OLD_KEYS.currentConversation)
        || oldValue(OLD_KEYS.olderConversation)
        || '';
    },
    setCurrentConversation(value) {
      localStorage.setItem(CURRENT_CONVERSATION_KEY, String(value || ''));
    },
  });
}

export const storageKeys = Object.freeze({ STATE_KEY, CURRENT_CONVERSATION_KEY });

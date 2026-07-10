import { q, qa } from '../core/dom.js';

const THEMES = Object.freeze(['light', 'dark', 'gold']);
const THEME_LABELS = Object.freeze({ light: '浅色', dark: '深色', gold: '黑金' });

function startOfToday() {
  const date = new Date();
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysSince(year, month, day) {
  const start = new Date(year, month - 1, day);
  return Math.max(1, Math.floor((startOfToday() - start) / 86400000) + 1);
}

function daysUntil(month, day) {
  const today = startOfToday();
  let target = new Date(today.getFullYear(), month - 1, day);
  if (target < today) target = new Date(today.getFullYear() + 1, month - 1, day);
  return Math.ceil((target - today) / 86400000);
}

export function createShell({ storage }) {
  function applyPreferences() {
    const preferences = storage.read().preferences;
    const theme = THEMES.includes(preferences.theme) ? preferences.theme : 'light';
    document.documentElement.dataset.theme = theme;
    if (preferences.userBubble) document.documentElement.style.setProperty('--user', preferences.userBubble);
    else document.documentElement.style.removeProperty('--user');
    if (preferences.accent) document.documentElement.style.setProperty('--accent', preferences.accent);
    else document.documentElement.style.removeProperty('--accent');
    const label = q('#themeLabel');
    if (label) label.textContent = THEME_LABELS[theme];
    const themeMeta = q('meta[name="theme-color"]');
    if (themeMeta) themeMeta.content = theme === 'light' ? '#ffffff' : theme === 'gold' ? '#0b0b0c' : '#171717';
  }

  function updateStatus() {
    const orbit = q('#orbitDays');
    const august12 = q('#august12Days');
    const august13 = q('#august13Days');
    if (orbit) orbit.textContent = String(daysSince(2025, 8, 13));
    if (august12) august12.textContent = String(daysUntil(8, 12));
    if (august13) august13.textContent = String(daysUntil(8, 13));
  }

  function openSidebar() {
    document.body.classList.add('sidebar-open');
    const scrim = q('#scrim');
    if (scrim) scrim.hidden = false;
  }

  function closeSidebar() {
    document.body.classList.remove('sidebar-open');
    const scrim = q('#scrim');
    if (scrim) scrim.hidden = true;
  }

  function cycleTheme() {
    storage.update((state) => {
      const index = THEMES.indexOf(state.preferences.theme);
      state.preferences.theme = THEMES[(index + 1) % THEMES.length];
    });
    applyPreferences();
  }

  function setTheme(theme) {
    if (!THEMES.includes(theme)) return;
    storage.update((state) => { state.preferences.theme = theme; });
    applyPreferences();
  }

  function filterSidebar(value) {
    const needle = String(value || '').trim().toLocaleLowerCase('zh-CN');
    qa('#localRoomWindowList .history-item, #chatConversationList .conversation-row').forEach((item) => {
      item.hidden = Boolean(needle) && !item.textContent.toLocaleLowerCase('zh-CN').includes(needle);
    });
  }

  function start() {
    applyPreferences();
    updateStatus();
  }

  return Object.freeze({
    start,
    applyPreferences,
    openSidebar,
    closeSidebar,
    cycleTheme,
    setTheme,
    filterSidebar,
    themeLabels: THEME_LABELS,
  });
}

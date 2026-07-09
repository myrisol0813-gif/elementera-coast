export const SHADOW_APP_VERSION = "P3-STRUCT-14";

export const STORAGE_KEYS = Object.freeze({
  mainMessages: "gpt_like_test_window_messages_clean_v1",
  theme: "gpt_like_shell_theme_clean_v1",
  assistantAvatar: "gpt_like_assistant_avatar_dataurl_v1",
  modelName: "wolf_model_v092",
  userBubble: "wolf_user_bubble_v092",
  accent: "wolf_accent_v092",
  radioRooms: "coast_radio_rooms_v095",
  lighthouseRooms: "coast_lighthouse_rooms_v096",
  lighthouseDraft: "coast_lighthouse_draft_v095",
  dailyStatus: "coast_daily_status_v095",
  mainWindows: "coast_main_windows_v097",
  mainActive: "coast_main_active_v097",
  xiaohanAvatar: "coast_avatar_xiaohan_v099",
});

export const THEME_NAMES = Object.freeze({
  light: "浅色",
  dark: "深色",
  gold: "黑金",
});

export const $ = (selector, scope = document) => scope?.querySelector?.(selector) || null;
export const $$ = (selector, scope = document) => Array.from(scope?.querySelectorAll?.(selector) || []);

export function esc(value) {
  return String(value ?? "").replace(/[&<>]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
  })[char]);
}

export function escAttr(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

export function textToParagraphs(text) {
  return esc(text)
    .split(/\n{2,}/)
    .map((part) => "<p>" + part.replace(/\n/g, "<br>") + "</p>")
    .join("");
}

export function createId() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
}

export function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const value = JSON.parse(raw);
    return value || fallback;
  } catch {
    return fallback;
  }
}

export function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function todayMidnight() {
  const date = new Date();
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function daysUntil(month, day) {
  const now = todayMidnight();
  let next = new Date(now.getFullYear(), month - 1, day);
  if (next < now) next = new Date(now.getFullYear() + 1, month - 1, day);
  return Math.ceil((next - now) / 86400000);
}

export function coastDay() {
  return Math.max(1, Math.floor((todayMidnight() - new Date(2025, 7, 13)) / 86400000) + 1);
}

export function showSidebar() {
  document.body.classList.add("sidebar-open");
  const scrim = $("#scrim");
  if (scrim) scrim.hidden = false;
}

export function hideSidebar() {
  document.body.classList.remove("sidebar-open");
  const scrim = $("#scrim");
  if (scrim) scrim.hidden = true;
}

export function ensureServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js", { scope: "/" }).catch(() => undefined);
  });
}

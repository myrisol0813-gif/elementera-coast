const RUN_CONTROL_STORAGE_KEY = 'elementera.runControlSettings';
const TEMP_CONTEXT_STORAGE_KEYS = [
  'elementera.tempContext',
  'elementera.currentTempContext',
  'elementera.recentContextDraft'
];

const defaultRunControlSettings = {
  modelPreset: 'daily_chat',
  contextMode: 'balanced',
  recentTurns: 8,
  contextBudget: 6000,
  outputLength: 'normal',
  creativity: 'natural',
  memoryRecall: 'low',
  seedRecallLimit: 3,
  scratchpadBudget: 800
};

const numberFields = ['recentTurns', 'contextBudget', 'seedRecallLimit', 'scratchpadBudget'];

function asNumber(name, value) {
  if (!numberFields.includes(name)) return value;
  return Number(value);
}

function readSettings() {
  try {
    const stored = localStorage.getItem(RUN_CONTROL_STORAGE_KEY);
    if (!stored) return { ...defaultRunControlSettings };
    return { ...defaultRunControlSettings, ...JSON.parse(stored) };
  } catch (error) {
    console.warn('Run control settings reset to defaults.', error);
    return { ...defaultRunControlSettings };
  }
}

function normalizeSettings(settings) {
  const next = { ...defaultRunControlSettings, ...settings };
  numberFields.forEach((name) => {
    next[name] = Number(next[name]);
  });
  return next;
}

function saveSettings(settings) {
  const next = normalizeSettings(settings);
  localStorage.setItem(RUN_CONTROL_STORAGE_KEY, JSON.stringify(next));
  return next;
}

function applySettings(form, settings) {
  Object.entries(settings).forEach(([name, value]) => {
    const field = form.elements[name];
    if (!field) return;
    field.value = String(value);
  });
}

function readForm(form) {
  const data = new FormData(form);
  const next = { ...defaultRunControlSettings };
  data.forEach((value, name) => {
    next[name] = asNumber(name, value);
  });
  return normalizeSettings(next);
}

function setStatus(text) {
  const node = document.querySelector('[data-save-state]');
  if (node) node.textContent = text;
}

function clearTemporaryContext() {
  const ok = confirm('确定清空当前临时上下文吗？此操作只清理本地暂存，不会影响运行控制设置。');
  if (!ok) return;
  TEMP_CONTEXT_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
  window.dispatchEvent(new CustomEvent('elementera:temp-context-cleared'));
  setStatus('临时上下文已清空');
}

function initRunControlPanel() {
  const form = document.querySelector('[data-run-control-form]');
  const clearButton = document.querySelector('[data-clear-temp-context]');
  if (!form) return;

  let settings = saveSettings(readSettings());
  applySettings(form, settings);
  setStatus('已保存到本地');

  form.addEventListener('change', () => {
    settings = saveSettings(readForm(form));
    setStatus('已保存到本地');
  });

  form.addEventListener('input', (event) => {
    if (event.target && event.target.type === 'number') {
      settings = saveSettings(readForm(form));
      setStatus('已保存到本地');
    }
  });

  if (clearButton) clearButton.addEventListener('click', clearTemporaryContext);

  window.elementeraRunControl = {
    getSettings: readSettings,
    setSettings: (nextSettings) => {
      settings = saveSettings({ ...settings, ...nextSettings });
      applySettings(form, settings);
      setStatus('已保存到本地');
      return settings;
    },
    defaultRunControlSettings,
    storageKey: RUN_CONTROL_STORAGE_KEY
  };
}

document.addEventListener('DOMContentLoaded', initRunControlPanel);

import { q } from './core/dom.js';
import { hydrateIconSlots } from './core/icons.js';
import { createRouter } from './core/router.js';
import { createStorage } from './core/storage.js';
import { createChat } from './features/chat.js';
import { createDaily } from './features/daily.js';
import { createLetters } from './features/letters.js';
import { createMemory } from './features/memory.js';
import { createModels } from './features/models.js';
import { createRooms } from './features/rooms.js';
import { createSettings } from './features/settings.js';
import { createShell } from './features/shell.js';
import { createTools } from './features/tools.js';

const storage = createStorage();
let toastTimer = 0;

function toast(message, duration = 1800) {
  const root = q('#toastRoot');
  if (!root) return;
  root.textContent = String(message || '');
  root.hidden = !message;
  clearTimeout(toastTimer);
  if (message) toastTimer = setTimeout(() => { root.hidden = true; }, duration);
}

const shell = createShell({ storage });
const router = createRouter(q('#overlayRoot'), {
  onOpen: () => shell.closeSidebar(),
});
const chat = createChat({ storage, toast });
const memory = createMemory({ chat, router, toast });
const models = createModels({ chat, router, toast });
const tools = createTools({ storage, router, toast, memory });
const settings = createSettings({ storage, shell, chat, router, toast });
const rooms = createRooms({ storage, router, toast });
const daily = createDaily({ storage, router, toast });
const letters = createLetters({ storage, chat, models, router, toast });

chat.setRunSettingsProvider(tools.getSettings);
chat.setMemoryController(memory);

const controllers = Object.freeze({ chat, memory, models, tools, settings, rooms, daily, letters });

document.addEventListener('click', async (event) => {
  if (!event.target.closest('[data-conversation-id]')) chat.closeMenu();
  models.handleDocumentClick(event.target);
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const [namespace, name] = String(target.dataset.action || '').split(':');
  if (!namespace || !name) return;
  event.preventDefault();

  try {
    if (namespace === 'router' && name === 'back') {
      await router.back();
      return;
    }
    if (namespace === 'shell') {
      if (name === 'open-sidebar') shell.openSidebar();
      if (name === 'close-sidebar') shell.closeSidebar();
      if (name === 'cycle-theme') shell.cycleTheme();
      return;
    }
    const controller = controllers[namespace];
    if (!controller?.handleAction) return;
    await controller.handleAction(name, target, event);
    if ((namespace === 'chat' || namespace === 'memory') && name === 'open') shell.closeSidebar();
  } catch (error) {
    console.error(`[${namespace}:${name}]`, error);
    toast(error?.message || '操作失败，请稍后重试。');
  }
});

document.addEventListener('input', (event) => {
  if (event.target === q('#sidebarSearch')) {
    shell.filterSidebar(event.target.value);
    return;
  }
  const target = event.target.closest('[data-input]');
  if (!target) return;
  const [namespace, name] = String(target.dataset.input || '').split(':');
  controllers[namespace]?.handleInput?.(name, target, event);
});

document.addEventListener('submit', async (event) => {
  const form = event.target.closest('[data-submit]');
  if (!form) return;
  event.preventDefault();
  const [namespace, name] = String(form.dataset.submit || '').split(':');
  try {
    await controllers[namespace]?.handleSubmit?.(name, form, event);
  } catch (error) {
    console.error(`[${namespace}:${name}]`, error);
    toast(error?.message || '操作失败，请稍后重试。');
  }
});

async function start() {
  hydrateIconSlots();
  shell.start();
  rooms.start();
  models.start();
  await chat.start();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js', { scope: '/' }).catch((error) => {
      console.warn('[service-worker]', error);
    });
  }
}

start().catch((error) => {
  console.error('[bootstrap]', error);
  toast('海岸载入失败，请刷新重试。');
});

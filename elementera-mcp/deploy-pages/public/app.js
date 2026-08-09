import { q } from './core/dom.js';
import { confirmDanger, dangerConfirmationFor } from './core/danger.js';
import { hydrateIconSlots } from './core/icons.js';
import { createRouter } from './core/router.js';
import { createStorage } from './core/storage.js';
import { createChat } from './features/chat.js';
import { createDaily } from './features/daily.js';
import { createDogtalk } from './features/dogtalk.js';
import { createLetters } from './features/letters.js';
import { createMemory } from './features/memory.js';
import { createModels } from './features/models.js';
import { createRooms } from './features/rooms.js';
import { createSettings } from './features/settings.js';
import { createShell } from './features/shell.js';
import { createTools } from './features/tools.js';
import { createCalendar } from './features/calendar.js';
import { createContext } from './features/context.js';
import { createToolroom } from './features/toolroom.js';

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
const dogtalk = createDogtalk({ toast });
const chat = createChat({ storage, toast, dogtalk });
const rooms = createRooms({ chat, router, toast, dogtalk });
const memory = createMemory({ chat, router, toast, storage, rooms });
const models = createModels({ chat, router, toast });
const tools = createTools({ storage, router, toast, memory });
const settings = createSettings({ storage, shell, chat, router, toast });
const daily = createDaily({ storage, router, toast, chat });
const letters = createLetters({ storage, chat, models, router, toast });
const calendar = createCalendar({ router, toast });
const context = createContext({ chat, router, toast });
const toolroom = createToolroom({ chat, router });

chat.setRunSettingsProvider(tools.getSettings);
chat.setMemoryController(memory);
chat.setRoomController(rooms);
chat.setContextController(context);
rooms.setContextController(context);

const controllers = Object.freeze({
  chat,
  dogtalk,
  memory,
  models,
  tools,
  settings,
  rooms,
  daily,
  letters,
  calendar,
  context,
  toolroom,
});

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
    const danger = dangerConfirmationFor(`${namespace}:${name}`);
    if (danger && !await confirmDanger(danger)) return;
    await controller.handleAction(name, target, event);
    if ((namespace === 'chat' || namespace === 'memory' || namespace === 'rooms' || namespace === 'calendar') && name === 'open') {
      shell.closeSidebar();
    }
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
  await Promise.all([calendar.start(), context.start()]);
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

const CACHE_NAME = 'elementera-coast-app-29';
const CORE = Object.freeze([
  '/',
  '/index.html',
  '/manifest.json',
  '/public/styles/tokens.css?v=coast-app-29',
  '/public/styles/shell.css?v=coast-app-29',
  '/public/styles/chat.css?v=coast-app-29',
  '/public/styles/features.css?v=coast-app-29',
  '/public/styles/calendar.css?v=coast-app-29',
  '/public/styles/desk.css?v=coast-app-29',
  '/public/app.js?v=coast-app-29',
  '/public/core/api.js',
  '/public/core/dom.js',
  '/public/core/icons.js',
  '/public/core/router.js',
  '/public/core/storage.js',
  '/public/content/letters.js',
  '/public/features/chat-state.js',
  '/public/features/chat.js',
  '/public/features/daily-client.js',
  '/public/features/daily.js',
  '/public/features/dogtalk.js',
  '/public/features/letters.js',
  '/public/features/memory.js',
  '/public/features/models.js',
  '/public/features/rooms.js',
  '/public/features/settings.js',
  '/public/features/shell.js',
  '/public/features/tools.js',
  '/public/features/calendar.js',
  '/public/features/desk.js',
  '/public/features/toolroom.js',
  '/public/features/updates.js',
  '/updates/index.html',
  '/public/updates-page.js',
  '/public/styles/updates.css',
  '/public/icons/icon-16.png',
  '/public/icons/icon-32.png',
  '/public/icons/apple-touch-icon.png',
  '/public/icons/icon-192.png',
  '/public/icons/icon-512.png',
  '/public/icons/icon-maskable-512.png',
  '/public/icons/gptlike-icon.svg',
  '/public/media/myri-default-avatar.jpg',
]);

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
  )));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')
    || url.pathname.startsWith('/mcp')
    || url.pathname.startsWith('/.well-known/')
    || url.pathname === '/public/app-update.json'
    || ['/login', '/logout', '/mailbox'].includes(url.pathname)) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => (
      await caches.match(request) || caches.match('/index.html')
    )));
    return;
  }

  event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
    }
    return response;
  })));
});

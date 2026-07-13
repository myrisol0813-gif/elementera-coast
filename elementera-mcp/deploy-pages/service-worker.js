const CACHE_NAME = 'elementera-coast-app-02';
const CORE = Object.freeze([
  '/',
  '/index.html',
  '/manifest.json',
  '/public/styles/tokens.css?v=coast-app-02',
  '/public/styles/shell.css?v=coast-app-02',
  '/public/styles/chat.css?v=coast-app-02',
  '/public/styles/features.css?v=coast-app-02',
  '/public/app.js?v=coast-app-02',
  '/public/core/api.js',
  '/public/core/dom.js',
  '/public/core/icons.js',
  '/public/core/router.js',
  '/public/core/storage.js',
  '/public/content/letters.js',
  '/public/features/chat-state.js',
  '/public/features/chat.js',
  '/public/features/daily.js',
  '/public/features/letters.js',
  '/public/features/models.js',
  '/public/features/rooms.js',
  '/public/features/settings.js',
  '/public/features/shell.js',
  '/public/features/tools.js',
  '/public/icons/gptlike-icon.svg',
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
  if (url.pathname.startsWith('/api/') || ['/login', '/logout'].includes(url.pathname)) return;

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

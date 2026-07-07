const CACHE_NAME = "elementera-coast-pages-v5";
const CORE = [
  "/",
  "/index.html",
  "/app.html",
  "/gptlike",
  "/manifest.json",
  "/service-worker.js",
  "/public/app.js",
  "/public/styles.css",
  "/public/run-control-p301c.js",
  "/public/api-sandbox-p302c.js",
  "/public/model-box-p303a.js",
  "/public/chat-shell-p303c.js",
  "/public/icons/action-copy.svg",
  "/public/icons/action-edit.svg",
  "/public/icons/action-heart.svg",
  "/public/icons/action-like.svg",
  "/public/icons/action-refresh.svg",
  "/public/icons/action-trash.svg",
  "/public/icons/gptlike-icon.svg",
  "/public/icons/new-chat-icon.svg",
  "/public/icons/orbit-icon.svg",
  "/public/icons/serpent-desk-icon.svg",
  "/public/icons/wolf-den-icon.svg"
];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => Promise.all(CORE.map(url => cache.add(url).catch(() => undefined)))));
  self.skipWaiting();
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  event.respondWith(
    fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(req, copy)).catch(() => undefined);
      return res;
    }).catch(() => caches.match(req).then(cached => cached || caches.match("/index.html")))
  );
});

const CACHE_NAME = "elementera-coast-pages-p3-chat-conv-stabilize-02";
const CORE = [
  "/",
  "/index.html",
  "/app.html",
  "/gptlike",
  "/manifest.json",
  "/service-worker.js",
  "/public/modules/daily/daily-shell.js?v=p3-chat-conv-stabilize-02",
  "/public/modules/daily/daily-draft-state.js?v=p3-chat-conv-stabilize-02",
  "/public/modules/daily/daily-assets.js?v=p3-chat-conv-stabilize-02",
  "/public/modules/daily/moments.js?v=p3-chat-conv-stabilize-02",
  "/public/modules/daily/diary.js?v=p3-chat-conv-stabilize-02",
  "/public/modules/daily/album.js?v=p3-chat-conv-stabilize-02",
  "/public/modules/daily/daily-router.js?v=p3-chat-conv-stabilize-02",
  "/public/modules/legacy/appjs-flat/00-main-shell.js?v=p3-chat-conv-stabilize-02",
  "/public/modules/legacy/appjs-flat/01-v094-back-patch.js?v=p3-chat-conv-stabilize-02",
  "/public/modules/legacy/appjs-flat/02-v094-wolf-apps-back-fix.js?v=p3-chat-conv-stabilize-02",
  "/public/modules/legacy/appjs-flat/03-v106-daily-legacy.js?v=p3-chat-conv-stabilize-02",
  "/public/modules/legacy/appjs-flat/04-v094-safe-text-setter.js?v=p3-chat-conv-stabilize-02",
  "/public/modules/legacy/appjs-flat/05-v095-sidebar-rooms.js?v=p3-chat-conv-stabilize-02",
  "/public/modules/legacy/appjs-flat/06-v096-sidebar-room-details.js?v=p3-chat-conv-stabilize-02",
  "/public/modules/legacy/appjs-flat/07-v097-sidebar-polish.js?v=p3-chat-conv-stabilize-02",
  "/public/modules/legacy/appjs-flat/08-v098-final-sidebar-order.js?v=p3-chat-conv-stabilize-02",
  "/public/modules/legacy/appjs-flat/09-v098-final-sidebar-order-base.js?v=p3-chat-conv-stabilize-02",
  "/public/modules/legacy/appjs-flat/10-v099-v119-island-letter-lovebook.js?v=p3-chat-conv-stabilize-02",
  "/public/styles.css",
  "/public/run-control-p301c.js?v=p3-chat-conv-stabilize-02",
  "/public/api-sandbox-p302c.js?v=p3-chat-conv-stabilize-02",
  "/public/chat-history-sync-p301.js?v=p3-chat-conv-stabilize-02",
  "/public/model-box-p303a.js?v=p3-chat-conv-stabilize-02",
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
const CLEANROOM_PATHS = new Set([
  "/cleanroom.html",
  "/cleanroom",
  "/cleanroom/",
  "/public/cleanroom",
  "/public/cleanroom/",
  "/public/cleanroom/index.html"
]);
function isCleanroomRequest(url) {
  return CLEANROOM_PATHS.has(url.pathname);
}
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
  if (isCleanroomRequest(url)) {
    event.respondWith(
      fetch(req, { cache: "no-store" }).then(res => {
        if (res.ok && res.headers.get("content-type")?.includes("text/html")) return res;
        return fetch("/public/cleanroom/index.html", { cache: "no-store" });
      }).catch(() => caches.match("/public/cleanroom/index.html"))
    );
    return;
  }
  event.respondWith(
    fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(req, copy)).catch(() => undefined);
      return res;
    }).catch(() => caches.match(req).then(cached => cached || caches.match("/index.html")))
  );
});

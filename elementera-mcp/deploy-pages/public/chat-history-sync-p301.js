(() => {
  if (window.__elementeraChatHistorySyncP301) return;
  window.__elementeraChatHistorySyncP301 = true;

  const CHAT_KEY = "gpt_like_test_window_messages_clean_v1";
  const HISTORY_API = "/api/chat/history";
  const RELOAD_KEY = "ec.chatHistory.restored.p3";
  const MAX_MESSAGES = 200;
  const MAX_CONTENT = 12000;

  let syncTimer = null;
  let suppressSync = false;
  const originalSetItem = Storage.prototype.setItem;

  function id() {
    return crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
  }

  function normalizeMessages(items) {
    if (!Array.isArray(items)) return [];
    return items
      .filter((item) => item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string")
      .slice(-MAX_MESSAGES)
      .map((item) => ({
        id: String(item.id || id()),
        role: item.role,
        content: item.content.slice(0, MAX_CONTENT),
        ...(typeof item.created_at === "string" ? { created_at: item.created_at } : { created_at: new Date().toISOString() }),
      }));
  }

  function readLocal() {
    try {
      return normalizeMessages(JSON.parse(localStorage.getItem(CHAT_KEY) || "[]"));
    } catch {
      return [];
    }
  }

  function writeLocal(items) {
    suppressSync = true;
    try {
      originalSetItem.call(localStorage, CHAT_KEY, JSON.stringify(normalizeMessages(items)));
    } finally {
      suppressSync = false;
    }
  }

  function sameMessages(a, b) {
    return JSON.stringify(normalizeMessages(a)) === JSON.stringify(normalizeMessages(b));
  }

  async function fetchServerHistory() {
    const res = await fetch(HISTORY_API, { credentials: "same-origin", cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw new Error(data?.error?.message || data?.error || `history ${res.status}`);
    return normalizeMessages(data?.history?.messages || data?.messages || []);
  }

  async function putServerHistory(items) {
    const messages = normalizeMessages(items);
    const res = await fetch(HISTORY_API, {
      method: "PUT",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error?.message || `history put ${res.status}`);
    }
  }

  function syncHistorySoon(items) {
    const messages = normalizeMessages(items);
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      putServerHistory(messages).catch((error) => console.warn("[P3-CHAT-SYNC-01] history sync failed", error));
    }, 800);
  }

  Storage.prototype.setItem = function patchedSetItem(key, value) {
    const result = originalSetItem.apply(this, arguments);
    if (this === localStorage && key === CHAT_KEY && !suppressSync) {
      try {
        syncHistorySoon(JSON.parse(String(value || "[]")));
      } catch (error) {
        console.warn("[P3-CHAT-SYNC-01] local history parse failed", error);
      }
    }
    return result;
  };

  async function bootstrapChatHistory() {
    const local = readLocal();
    let server = [];
    try {
      server = await fetchServerHistory();
    } catch (error) {
      console.warn("[P3-CHAT-SYNC-01] history fetch failed", error);
      if (local.length) syncHistorySoon(local);
      return;
    }

    if (server.length) {
      sessionStorage.removeItem(RELOAD_KEY);
      if (!sameMessages(server, local)) {
        writeLocal(server);
        if (document.readyState !== "loading" && !sessionStorage.getItem(RELOAD_KEY)) {
          sessionStorage.setItem(RELOAD_KEY, "1");
          location.reload();
        }
      }
      return;
    }

    sessionStorage.removeItem(RELOAD_KEY);
    if (local.length) syncHistorySoon(local);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrapChatHistory, { once: true });
  } else {
    bootstrapChatHistory();
  }

  window.elementeraChatHistorySyncP301 = {
    fetchServerHistory,
    putServerHistory,
    syncHistorySoon,
    bootstrapChatHistory,
  };
})();

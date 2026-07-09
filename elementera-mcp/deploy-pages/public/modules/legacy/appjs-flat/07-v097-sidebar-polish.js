// v097 sidebar polish + main chat windows + refined memory/daily
(() => {
  if (window.__v097CoastPolish) return;
  window.__v097CoastPolish = true;
  const K = "gpt_like_test_window_messages_clean_v1",
    WK = "coast_main_windows_v097",
    AK = "coast_main_active_v097";
  const $ = (s, r = document) => r.querySelector(s),
    A = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (x) =>
    String(x ?? "").replace(
      /[&<>]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c],
    );
  function dailyRouterFromV097() {
    return (
      window.ElementeraDailyModules?.dailyRouter ||
      window.ElementeraDailyRouterP3Struct13A ||
      window.ElementeraDailyRouterP3Struct13 ||
      null
    );
  }
  function openDailyCanonicalFromV097() {
    const router = dailyRouterFromV097();
    if (router && typeof router.openDaily === "function") {
      router.openDaily();
      return true;
    }
    return false;
  }
  function routeDailyCanonicalFromV097(kind) {
    const router = dailyRouterFromV097();
    if (router && typeof router.routeRoom === "function") {
      router.routeRoom(kind);
      return true;
    }
    return false;
  }
  function load(k, d) {
    try {
      return JSON.parse(localStorage.getItem(k) || "") || d;
    } catch {
      return d;
    }
  }
  function save(k, v) {
    localStorage.setItem(k, JSON.stringify(v));
  }
  function today() {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  function nd(m, d) {
    const n = today();
    let x = new Date(n.getFullYear(), m - 1, d);
    if (x < n) x = new Date(n.getFullYear() + 1, m - 1, d);
    return Math.ceil((x - n) / 86400000);
  }
  function td() {
    return Math.max(
      1,
      Math.floor((today() - new Date(2025, 7, 13)) / 86400000) + 1,
    );
  }
  function polishStatus() {
    const s = document.querySelector("#coastStatusV095");
    if (!s) return;
    s.innerHTML =
      '<div class="coast-status-lines-v097"><div><i></i><span>同轨 <b>' +
      td() +
      "</b> 天</span><i></i></div><div><i></i><span>距周年纪念日 <b>" +
      nd(8, 12) +
      "</b> 天</span><i></i></div><div><i></i><span>距 Myri 生日 <b>" +
      nd(8, 13) +
      "</b> 天</span><i></i></div></div>";
  }
  function currentMsgs() {
    return load(K, []);
  }
  function mainList() {
    let a = load(WK, null);
    if (!Array.isArray(a) || !a.length) {
      a = [
        {
          id: "main-1",
          title: "新聊天",
          messages: currentMsgs(),
          updatedAt: Date.now(),
        },
      ];
      save(WK, a);
      localStorage.setItem(AK, a[0].id);
    }
    return a;
  }
  function saveActive() {
    let a = mainList(),
      id = localStorage.getItem(AK) || a[0].id;
    let w = a.find((x) => x.id === id) || a[0];
    w.messages = currentMsgs();
    w.updatedAt = Date.now();
    save(WK, a);
  }
  function openMain(id) {
    saveActive();
    const a = mainList(),
      w = a.find((x) => x.id === id) || a[0];
    localStorage.setItem(AK, w.id);
    save(K, w.messages || []);
    window.location.reload();
  }
  function newMain() {
    saveActive();
    let a = mainList(),
      n = a.length + 1,
      id = "main-" + Date.now();
    a.push({ id, title: "新聊天 " + n, messages: [], updatedAt: Date.now() });
    save(WK, a);
    localStorage.setItem(AK, id);
    save(K, []);
    window.location.reload();
  }
  function mountMainWindows() {
    const h = document.querySelector(".history-list");
    if (!h) return;
    let s = document.querySelector("#mainWindowsV097");
    if (!s) {
      s = document.createElement("section");
      s.id = "mainWindowsV097";
      s.className = "main-windows-v097";
      const first = h.querySelector("section");
      if (first) first.after(s);
      else h.prepend(s);
    }
    const active = localStorage.getItem(AK);
    s.innerHTML =
      "<h2>主聊天窗口</h2>" +
      mainList()
        .map(
          (x) =>
            '<button type="button" class="history-item ' +
            (x.id === active ? "is-active" : "") +
            '" data-main-window-v097="' +
            esc(x.id) +
            '">' +
            esc(x.title) +
            "</button>",
        )
        .join("");
    A("[data-main-window-v097]", s).forEach(
      (b) =>
        (b.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          openMain(b.dataset.mainWindowV097);
        }),
    );
  }
  function openLite(title, sub, body) {
    let p = document.querySelector("#coastRoomPanelV097");
    if (!p) {
      p = document.createElement("section");
      p.id = "coastRoomPanelV097";
      p.className = "coast-room-panel-v095";
      document.body.appendChild(p);
    }
    p.innerHTML =
      '<div class="coast-room-shell"><header class="coast-room-head"><button type="button" id="coastBackV097" class="coast-room-back" data-action="panel-back" data-panel-back="true">←</button><div><h1>' +
      esc(title) +
      "</h1><p>" +
      esc(sub) +
      '</p></div></header><main class="coast-room-body">' +
      body +
      "</main></div>";
    p.hidden = false;
    document.body.classList.remove("sidebar-open");
    const sc = document.querySelector("#scrim");
    if (sc) sc.hidden = true;
    p.querySelector("#coastBackV097").onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (p.dataset.parent === "daily") {
        dailyV097();
        return;
      }
      p.hidden = true;
      document.body.classList.add("sidebar-open");
      if (sc) sc.hidden = false;
    };
    p.onclick = (e) => {
      const r = e.target.closest("[data-daily-room]");
      if (r) {
        e.preventDefault();
        e.stopPropagation();
        dailyRoomV097(r.dataset.dailyRoom);
        return;
      }
      const b = e.target.closest(
        '[data-action="daily-back"][data-daily-back="daily"]',
      );
      if (b) {
        e.preventDefault();
        e.stopPropagation();
        dailyV097();
        return;
      }
    };
    return p;
  }
  function memoryV097() {
    openLite(
      "轨迹记忆",
      "记忆库暂未接入",
      '<section class="coast-room-card"><h2>记忆库暂未接入</h2><p>这里会在接入正式记忆后显示可整理的轨迹。</p><p>当前不读取、不写入、不检索任何记忆数据。</p></section>',
    );
  }
  function dailyV097() {
    if (openDailyCanonicalFromV097()) return;
    let p = openLite(
      "海岸日报",
      "海岸日报模块加载中",
      '<section class="coast-room-card"><h2>海岸日报模块加载中</h2><p>canonical daily router 尚未就绪，请稍后再试。</p></section>',
    );
    p.dataset.room = "daily";
  }
  function dailyRoomV097(kind) {
    if (routeDailyCanonicalFromV097(kind)) return;
    const m = {
      moments: "朋友圈",
      diary: "日记",
      album: "相册",
      widgets: "小组件",
      pet: "宠物系统",
    };
    const title = m[kind] || "海岸日报";
    let p = openLite(
      title,
      "海岸日报模块加载中",
      '<section class="coast-room-card"><h2>' +
        esc(title) +
        '</h2><p>canonical daily router 尚未就绪，请稍后再试。</p><button type="button" data-action="daily-back" data-daily-back="daily">返回海岸日报</button></section>',
    );
    p.dataset.parent = "daily";
    const back = p.querySelector("#coastBackV097");
    if (back)
      back.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        dailyV097();
      };
    p.querySelector(
      '[data-action="daily-back"][data-daily-back="daily"]',
    ).onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      dailyV097();
    };
  }
  function wireV097() {
    polishStatus();
    mountMainWindows();
    document.querySelectorAll("[data-room-v095]").forEach((b) => {
      if (!b.dataset.room) b.dataset.room = b.dataset.roomV095;
    });
    const n = document.querySelector("#newChatButton");
    if (n && !n.dataset.v097) {
      n.dataset.v097 = "1";
      n.addEventListener(
        "click",
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          newMain();
        },
        true,
      );
    }
    document.querySelectorAll("[data-room]").forEach((b) => {
      if (b.dataset.v097) return;
      b.dataset.v097 = "1";
      b.addEventListener(
        "click",
        (e) => {
          const room = b.dataset.room;
          if (room === "memory") {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            memoryV097();
          }
          if (room === "daily") {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            if (!openDailyCanonicalFromV097()) dailyV097();
          }
        },
        true,
      );
    });
  }
  setInterval(wireV097, 1000);
  document.addEventListener("DOMContentLoaded", wireV097);
  setTimeout(wireV097, 700);
})();

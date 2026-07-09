// v096 room windows tune: chat-like local rooms, no API
(() => {
  if (window.__v096RoomsTune) return;
  window.__v096RoomsTune = true;
  const $ = (s, r = document) => r.querySelector(s);
  const A = (s, r = document) => Array.from(r.querySelectorAll(s));
  const KR = "coast_radio_rooms_v095",
    KL = "coast_lighthouse_rooms_v096";
  function esc(x) {
    return String(x ?? "").replace(
      /[&<>]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c],
    );
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
  function rdata() {
    let d = load(KR, {
      rooms: [
        {
          id: "radio-default",
          title: "无线电波",
          messages: [],
          updatedAt: Date.now(),
        },
      ],
      active: "radio-default",
    });
    if (!d.rooms) d.rooms = [];
    if (!d.rooms.length) {
      d.rooms = [
        {
          id: "radio-default",
          title: "无线电波",
          messages: [],
          updatedAt: Date.now(),
        },
      ];
      d.active = "radio-default";
    }
    if (!d.active && d.rooms[0]) d.active = d.rooms[0].id;
    return d;
  }
  function ldata() {
    let d = load(KL, {
      rooms: [
        {
          id: "letter-default",
          title: "灯塔来信",
          messages: [],
          updatedAt: Date.now(),
        },
      ],
      active: "letter-default",
    });
    if (!d.rooms) d.rooms = [];
    if (!d.rooms.length) {
      d.rooms = [
        {
          id: "letter-default",
          title: "灯塔来信",
          messages: [],
          updatedAt: Date.now(),
        },
      ];
      d.active = "letter-default";
    }
    if (!d.active && d.rooms[0]) d.active = d.rooms[0].id;
    return d;
  }
  function ensureWindowList() {
    const h = $(".history-list");
    if (!h) return;
    let s = $("#coastRoomWindowsV096");
    if (!s) {
      s = document.createElement("section");
      s.id = "coastRoomWindowsV096";
      s.className = "coast-room-windows-v096";
      const after = $("#coastRoomsV095");
      if (after) after.after(s);
      else h.prepend(s);
    }
    const rd = rdata(),
      ld = ldata();
    s.innerHTML =
      "<h2>房间窗口</h2>" +
      rd.rooms
        .map(
          (x) =>
            '<button type="button" class="history-item" data-v096-kind="radio" data-v096-id="' +
            esc(x.id) +
            '">【电波·】' +
            esc(x.title) +
            "</button>",
        )
        .join("") +
      ld.rooms
        .map(
          (x) =>
            '<button type="button" class="history-item" data-v096-kind="letter" data-v096-id="' +
            esc(x.id) +
            '">【灯塔·】' +
            esc(x.title) +
            "</button>",
        )
        .join("");
    A("[data-v096-kind]", s).forEach(
      (b) =>
        (b.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          openChat(b.dataset.v096Kind, b.dataset.v096Id);
        }),
    );
  }
  function wireMainRooms() {
    const box = $("#coastRoomsV095");
    if (!box) return;
    A("[data-room]", box).forEach((b) => {
      b.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        openV096(b.dataset.room);
      };
    });
    ensureWindowList();
  }
  function hideSide() {
    document.body.classList.remove("sidebar-open");
    const s = document.querySelector("#scrim");
    if (s) s.hidden = true;
  }
  function showSide() {
    document.body.classList.add("sidebar-open");
    const s = document.querySelector("#scrim");
    if (s) s.hidden = false;
    ensureWindowList();
  }
  function shell(title, sub, msgs, kind, id) {
    let p = document.querySelector("#coastChatRoomV096");
    if (!p) {
      p = document.createElement("section");
      p.id = "coastChatRoomV096";
      p.className = "coast-chat-room-v096";
      document.body.appendChild(p);
    }
    p.hidden = false;
    hideSide();
    p.innerHTML = "";
    return p;
  }
  function drawShell(title, sub, msgs, kind, id) {
    const p = shell(title, sub, msgs, kind, id);
    p.insertAdjacentHTML(
      "beforeend",
      '<header class="coast-chat-head"><button type="button" id="coastChatBackV096" class="coast-chat-back">←</button><div><h1>' +
        esc(title) +
        "</h1><p>" +
        esc(sub) +
        '</p></div><button type="button" id="coastChatNewV096" class="coast-chat-new">新建窗口</button></header>',
    );
    p.insertAdjacentHTML(
      "beforeend",
      '<main class="coast-chat-scroll"><div class="coast-chat-msgs">' +
        msgs +
        "</div></main>",
    );
    p.insertAdjacentHTML(
      "beforeend",
      '<div class="coast-chat-form"><textarea id="coastChatTextV096" rows="1" placeholder="写一条本地消息"></textarea><button type="button" id="coastChatSendV096">发送</button></div>',
    );
    document.querySelector("#coastChatBackV096").onclick = () => {
      p.hidden = true;
      showSide();
    };
    document.querySelector("#coastChatNewV096").onclick = () => newRoom(kind);
    setTimeout(() => {
      const sc = p.querySelector(".coast-chat-scroll");
      if (sc) sc.scrollTop = sc.scrollHeight;
    }, 0);
    return p;
  }
  function pack(kind) {
    return kind === "letter"
      ? {
          k: KL,
          d: ldata(),
          prefix: "【灯塔·】",
          who: "小寒",
          title: "灯塔来信",
          sub: "来信入口 · 暂未接入",
        }
      : {
          k: KR,
          d: rdata(),
          prefix: "【电波·】",
          who: "小寒",
          title: "无线电波的两端",
          sub: "电波入口 · 暂未接入",
        };
  }
  function openChat(kind, id) {
    const c = pack(kind),
      d = c.d;
    if (id) d.active = id;
    let r = d.rooms.find((x) => x.id === d.active) || d.rooms[0];
    if (!r) {
      r = {
        id: kind === "letter" ? "letter-default" : "radio-default",
        title: kind === "letter" ? "灯塔来信" : "无线电波",
        messages: [],
        updatedAt: Date.now(),
      };
      d.rooms = [r];
      d.active = r.id;
    }
    save(c.k, d);
    ensureWindowList();

    const msgs = Array.isArray(r.messages)
      ? r.messages
          .map(
            (m) =>
              '<div class="coast-chat-msg ' +
              (m.from === "小寒" ? "is-user" : "is-other") +
              '"><div>' +
              esc(m.text) +
              "</div><small>" +
              esc(m.from) +
              "</small></div>",
          )
          .join("")
      : "";

    const empty =
      kind === "letter"
        ? '<p class="coast-empty-v096">暂时还没有来信。</p>'
        : '<p class="coast-empty-v096">无线电波暂未接入。</p>';

    const p = drawShell(
      c.title,
      c.prefix + (r.title || c.title) + " · " + c.sub,
      msgs || empty,
      kind,
      r.id,
    );

    p.querySelector("#coastChatSendV096").onclick = () => {
      const t = p.querySelector("#coastChatTextV096").value.trim();
      if (!t) return;
      r.messages.push({ from: c.who, text: t, at: Date.now() });
      r.updatedAt = Date.now();
      save(c.k, d);
      openChat(kind, r.id);
    };
  }
  function newRoom(kind) {
    const c = pack(kind),
      d = c.d,
      n = d.rooms.length + 1,
      id = kind + "-" + Date.now();
    d.rooms.push({
      id,
      title: (kind === "letter" ? "来信窗口 " : "电波窗口 ") + n,
      messages: [],
      updatedAt: Date.now(),
    });
    d.active = id;
    save(c.k, d);
    ensureWindowList();
    openChat(kind, id);
  }
  function simplePanel(title, sub, body) {
    let p = document.querySelector("#coastRoomPanelV096");
    if (!p) {
      p = document.createElement("section");
      p.id = "coastRoomPanelV096";
      p.className = "coast-room-panel-v095";
      document.body.appendChild(p);
    }
    p.innerHTML =
      '<div class="coast-room-shell"><header class="coast-room-head"><button type="button" id="coastSimpleBackV096" class="coast-room-back">←</button><div><h1>' +
      esc(title) +
      "</h1><p>" +
      esc(sub) +
      '</p></div></header><main class="coast-room-body">' +
      body +
      "</main></div>";
    p.hidden = false;
    hideSide();
    p.querySelector("#coastSimpleBackV096").onclick = () => {
      p.hidden = true;
      showSide();
    };
    return p;
  }
  function memV096() {
    simplePanel(
      "轨迹记忆",
      "记忆库暂未接入",
      '<section class="coast-room-card"><h2>记忆库暂未接入</h2><p>这里会在接入正式记忆后显示可整理的轨迹。</p><p>当前不读取、不写入、不检索任何记忆数据。</p></section>',
    );
  }
  function dailyV096() {
    let p = simplePanel(
      "海岸日报",
      "海岸日报暂未接入",
      '<section class="coast-room-card"><h2>海岸日报暂未接入</h2><p>之后这里会承接日报、相册、日记和小组件。</p><p>当前只保留入口，不生成测试内容。</p></section>',
    );
    p.dataset.room = "daily";
  }
  function dailyRoomV096(kind) {
    const m = {
      moments: "朋友圈",
      diary: "日记",
      album: "相册",
      widgets: "小组件",
      pet: "宠物系统",
    };
    const title = m[kind] || "海岸日报";
    let p = simplePanel(
      title,
      "海岸日报暂未接入",
      '<section class="coast-room-card"><h2>' +
        esc(title) +
        '</h2><p>这个入口暂未接入正式内容。</p><button type="button" data-action="daily-back" data-daily-back="daily">返回海岸日报</button></section>',
    );
    p.dataset.parent = "daily";
    p.querySelector(
      '[data-action="daily-back"][data-daily-back="daily"]',
    ).onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      dailyV096();
    };
  }
  function openV096(kind) {
    if (kind === "radio") openChat("radio");
    else if (kind === "letters") openChat("letter");
    else if (kind === "memory") memV096();
    else if (kind === "daily") dailyV096();
  }
  setTimeout(() => {
    wireMainRooms();
    ensureWindowList();
  }, 600);
  document.querySelector("#menuButton")?.addEventListener("click", () =>
    setTimeout(() => {
      wireMainRooms();
      ensureWindowList();
    }, 60),
  );
})();


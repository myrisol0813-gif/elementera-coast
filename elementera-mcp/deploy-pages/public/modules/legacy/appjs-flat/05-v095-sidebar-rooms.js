// v095 sidebar rooms base
(() => {
  if (window.__v095SidebarRooms) return;
  window.__v095SidebarRooms = true;
  const $ = (s, r = document) => r.querySelector(s);
  const LS = {
    radio: "coast_radio_rooms_v095",
    letter: "coast_lighthouse_draft_v095",
    daily: "coast_daily_status_v095",
  };
  function esc(x) {
    return String(x ?? "").replace(
      /[&<>]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c],
    );
  }
  function save(k, v) {
    localStorage.setItem(k, JSON.stringify(v));
  }
  function load(k, d) {
    try {
      const v = JSON.parse(localStorage.getItem(k) || "");
      return v || d;
    } catch {
      return d;
    }
  }
  function today() {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  function nextDate(m, d) {
    const n = today();
    let x = new Date(n.getFullYear(), m - 1, d);
    if (x < n) x = new Date(n.getFullYear() + 1, m - 1, d);
    return Math.ceil((x - n) / 86400000);
  }
  function days() {
    const start = new Date(2025, 7, 13),
      n = today();
    return Math.max(1, Math.floor((n - start) / 86400000) + 1);
  }
  function sideBack() {
    document.body.classList.add("sidebar-open");
    const s = document.querySelector("#scrim");
    if (s) s.hidden = false;
  }
  function panel(title, sub, body) {
    let p = document.querySelector("#coastRoomPanelV095");
    if (!p) {
      p = document.createElement("section");
      p.id = "coastRoomPanelV095";
      p.className = "coast-room-panel-v095";
      document.body.appendChild(p);
    }
    p.innerHTML =
      '<div class="coast-room-shell"><header class="coast-room-head"><button type="button" class="coast-room-back" id="coastRoomBackV095">←</button><div><h1>' +
      title +
      "</h1><p>" +
      sub +
      '</p></div></header><main class="coast-room-body">' +
      body +
      "</main></div>";
    p.hidden = false;
    document.body.classList.remove("sidebar-open");
    const s = document.querySelector("#scrim");
    if (s) s.hidden = true;
    document.querySelector("#coastRoomBackV095").onclick = () => {
      p.hidden = true;
      sideBack();
    };
    return p;
  }
  function mountRooms() {
    const h = document.querySelector(".history-list");
    if (!h || document.querySelector("#coastStatusV095")) return;
    const wrap = document.createElement("section");
    wrap.id = "coastStatusV095";
    wrap.className = "coast-status-v095";
    wrap.innerHTML =
      '<div class="coast-status-grid"><span>同轨第 <b>' +
      days() +
      "</b> 日</span><span>距 8.12 <b>" +
      nextDate(8, 12) +
      "</b> 天</span><span>距 8.13 <b>" +
      nextDate(8, 13) +
      "</b> 天</span></div>";
    const rooms = document.createElement("section");
    rooms.id = "coastRoomsV095";
    rooms.className = "coast-rooms-v095";
    rooms.innerHTML =
      '<h2>主房间</h2><button type="button" class="history-item coast-room-button" data-room="radio" data-room-v095="radio">无线电波的两端</button><button type="button" class="history-item coast-room-button" data-room="letters" data-room-v095="letters">灯塔来信</button><button type="button" class="history-item coast-room-button" data-room="memory" data-room-v095="memory">轨迹 / 记忆</button><button type="button" class="history-item coast-room-button" data-room="daily" data-room-v095="daily">海岸日报</button>';
    h.insertBefore(rooms, h.firstChild);
    h.insertBefore(wrap, rooms);
    rooms.querySelectorAll("[data-room]").forEach(
      (b) =>
        (b.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          openRoom(b.dataset.room);
        }),
    );
  }
  function radio() {
    let data = load(LS.radio, {
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
    if (!Array.isArray(data.rooms) || !data.rooms.length) {
      data.rooms = [
        {
          id: "radio-default",
          title: "无线电波",
          messages: [],
          updatedAt: Date.now(),
        },
      ];
      data.active = "radio-default";
    }
    let r = data.rooms.find((x) => x.id === data.active) || data.rooms[0];
    let msgs = Array.isArray(r.messages)
      ? r.messages
          .map((m) => "<p><b>" + esc(m.from) + ":</b> " + esc(m.text) + "</p>")
          .join("")
      : "";
    if (!msgs) msgs = '<p class="coast-empty-v096">无线电波暂未接入。</p>';

    let p = panel(
      "无线电波的两端",
      "电波入口 · 暂未接入",
      '<section class="coast-room-card"><h2>会话列表</h2><button type="button" id="radioNewV095">新建窗口</button><p>' +
        data.rooms.map((x) => esc(x.title || "无线电波")).join(" / ") +
        '</p></section><section class="coast-room-card"><h2>当前窗口</h2><div class="coast-room-log">' +
        msgs +
        '</div><textarea id="radioTextV095" rows="4" placeholder="写一条消息草稿"></textarea><button type="button" id="radioSendV095">保存到当前窗口</button></section><section class="coast-room-card"><h2>状态说明</h2><p>无线电波入口已保留，正式通道待接入。</p></section>',
    );

    p.querySelector("#radioSendV095").onclick = () => {
      const t = p.querySelector("#radioTextV095").value.trim();
      if (!t) return;
      r.messages.push({ from: "小寒", text: t, at: Date.now() });
      r.updatedAt = Date.now();
      save(LS.radio, data);
      radio();
    };

    p.querySelector("#radioNewV095").onclick = () => {
      const n = data.rooms.length + 1;
      const id = "radio-" + Date.now();
      data.rooms.push({
        id,
        title: "电波窗口 " + n,
        messages: [],
        updatedAt: Date.now(),
      });
      data.active = id;
      save(LS.radio, data);
      radio();
    };
  }
  function letters() {
    const draft = load(LS.letter, { text: "" });
    let p = panel(
      "灯塔来信",
      "来信入口 · 暂未接入",
      '<section class="coast-room-card"><h2>来信箱</h2><p>暂时还没有来信。</p></section><section class="coast-room-card"><h2>通道状态</h2><p>正式来信通道待接入。</p></section><section class="coast-room-card"><h2>来信草稿</h2><textarea id="letterDraftV095" rows="7" placeholder="写一段草稿">' +
        esc(draft.text) +
        '</textarea><button type="button" id="letterSaveV095">保存草稿</button></section><section class="coast-room-card"><h2>未来说明</h2><p>未来可接入正式来信，也可转入无线电波的两端。</p></section>',
    );
    p.querySelector("#letterSaveV095").onclick = () => {
      save(LS.letter, { text: p.querySelector("#letterDraftV095").value });
      alert("草稿已保存");
    };
  }
  function memory() {
    panel(
      "轨迹记忆",
      "记忆库暂未接入",
      '<section class="coast-room-card"><h2>记忆库暂未接入</h2><p>这里会在接入正式记忆后显示可整理的轨迹。</p><p>当前不读取、不写入、不检索任何记忆数据。</p></section>',
    );
  }
  function daily() {
    let p = panel(
      "海岸日报",
      "海岸日报暂未接入",
      '<section class="coast-room-card"><h2>海岸日报暂未接入</h2><p>之后这里会承接日报、相册、日记和小组件。</p><p>当前只保留入口，不生成测试内容。</p></section>',
    );
    p.dataset.room = "daily";
  }
  function dailyRoom(kind) {
    const m = {
      moments: "朋友圈",
      diary: "日记",
      album: "相册",
      widgets: "小组件",
      pet: "宠物系统",
    };
    const title = m[kind] || "海岸日报";
    let p = panel(
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
      daily();
    };
  }
  function openRoom(kind) {
    if (kind === "radio") radio();
    if (kind === "letters") letters();
    if (kind === "memory") memory();
    if (kind === "daily") daily();
  }
  document.addEventListener("DOMContentLoaded", mountRooms);
  setTimeout(mountRooms, 400);
  document
    .querySelector("#menuButton")
    ?.addEventListener("click", () => setTimeout(mountRooms, 40));
})();


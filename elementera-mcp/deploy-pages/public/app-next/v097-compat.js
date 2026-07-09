import { $, $$, STORAGE_KEYS, esc, loadJson, saveJson, daysUntil, coastDay, hideSidebar, showSidebar } from "./app-env.js";
import { openPanel } from "./app-panel.js";
import { onceFlag, stopHard } from "./app-events.js";

export function mountV097Compat(root = globalThis) {
  mountBackPatch(root);
  mountWolfAppsBackFix(root);
  mountSafeTextSetter(root);
  mountSidebarRooms(root);
  mountRoomWindows(root);
  mountCoastPolish(root);
  mountFinalOrder(root);
}

function mountBackPatch(root) {
  if (!onceFlag(root, "__v094BackPatch")) return;

  function byId(ids) {
    for (const id of ids) {
      const node = document.getElementById(id);
      if (node) return node;
    }
    return null;
  }

  function hideDetails() {
    ["wolfDetailV092", "wolfAccountDetailV092", "acctDetailV092", "serpentDetailV092", "serpentStableDetailV092", "cleanDetailV093"].forEach((id) => {
      const node = document.getElementById(id);
      if (node) node.hidden = true;
    });
  }

  function showParent(kind) {
    hideDetails();
    const ids =
      kind === "desk"
        ? ["serpentStableV092", "serpentDeskV092", "serpentDeskPanelV092", "deskStableV092", "cleanDeskV093"]
        : ["wolfDenPanelV092", "wolfStableV092", "cleanWolfV093"];
    const panel = byId(ids);
    if (panel) {
      panel.hidden = false;
      document.body.classList.add("wolf-open");
    } else {
      document.body.classList.remove("wolf-open");
    }
  }

  function infer(section, button) {
    const id = section?.id || "";
    const text = (section?.textContent || "") + " " + (button?.dataset?.back || "");
    if (id.toLowerCase().includes("serpent") || id.toLowerCase().includes("desk")) return "desk";
    if (text.includes("Myri") || text.includes("小蛇") || text.includes("施工") || text.includes("本地诊断") || text.includes("System Prompt") || text.includes("便签")) return "desk";
    return "wolf";
  }

  window.addEventListener(
    "click",
    (event) => {
      const button = event.target.closest(".wolf-back,.clean-back,[data-cd-back],[data-clean-close]");
      if (!button) return;
      const section = button.closest("section");
      if (!section) return;
      const id = section.id || "";
      const isDetail = /Detail|acctDetail/i.test(id) || section.querySelector(".wolf-detail-page,.clean-detail-page") || id === "cleanDetailV093";
      if (!isDetail) return;
      stopHard(event);
      showParent(infer(section, button));
    },
    true,
  );
}

function mountWolfAppsBackFix(root) {
  if (!onceFlag(root, "__v094WolfAppsBackFix")) return;

  function fix() {
    document.querySelectorAll("section").forEach((section) => {
      const h1 = section.querySelector("h1");
      if (!h1 || h1.textContent.trim() !== "应用") return;
      section.querySelectorAll("*").forEach((node) => {
        if (node.childNodes.length === 1 && node.childNodes[0].nodeType === 3) {
          node.textContent = node.textContent.replace(/施工工具/g, "工程工具");
        }
      });
    });
  }

  new MutationObserver(fix).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("click", () => setTimeout(fix, 0), true);
  fix();
}

function mountSafeTextSetter(root) {
  if (!onceFlag(root, "__v094SafeTextSetter")) return;
  const descriptor = Object.getOwnPropertyDescriptor(Node.prototype, "textContent");
  if (!descriptor?.set || !descriptor?.get) return;
  Object.defineProperty(Node.prototype, "textContent", {
    get() {
      return descriptor.get.call(this);
    },
    set(value) {
      const next = String(value ?? "");
      if (descriptor.get.call(this) === next) return;
      return descriptor.set.call(this, next);
    },
    configurable: true,
  });
}

function sidePanel(title, subtitle, body, id = "coastRoomPanelV095") {
  return openPanel({
    id,
    className: "coast-room-panel-v095",
    title,
    subtitle,
    body,
    backId: id === "coastRoomPanelV096" ? "coastSimpleBackV096" : "coastRoomBackV095",
  });
}

function mountSidebarRooms(root) {
  if (!onceFlag(root, "__v095SidebarRooms")) return;

  function mountRooms() {
    const history = $(".history-list");
    if (!history || $("#coastStatusV095")) return;
    const status = document.createElement("section");
    status.id = "coastStatusV095";
    status.className = "coast-status-v095";
    status.innerHTML =
      '<div class="coast-status-grid"><span>同轨第 <b>' +
      coastDay() +
      "</b> 日</span><span>距 8.12 <b>" +
      daysUntil(8, 12) +
      "</b> 天</span><span>距 8.13 <b>" +
      daysUntil(8, 13) +
      "</b> 天</span></div>";

    const rooms = document.createElement("section");
    rooms.id = "coastRoomsV095";
    rooms.className = "coast-rooms-v095";
    rooms.innerHTML =
      '<h2>主房间</h2><button type="button" class="history-item coast-room-button" data-room="radio" data-room-v095="radio">无线电波的两端</button><button type="button" class="history-item coast-room-button" data-room="letters" data-room-v095="letters">灯塔来信</button><button type="button" class="history-item coast-room-button" data-room="memory" data-room-v095="memory">轨迹 / 记忆</button><button type="button" class="history-item coast-room-button" data-room="daily" data-room-v095="daily">海岸日报</button>';

    history.insertBefore(rooms, history.firstChild);
    history.insertBefore(status, rooms);
    $$("[data-room]", rooms).forEach((button) => {
      button.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        openRoom(button.dataset.room);
      };
    });
  }

  function load(key, fallback) {
    return loadJson(key, fallback);
  }

  function save(key, value) {
    saveJson(key, value);
  }

  function radio() {
    const data = load(STORAGE_KEYS.radioRooms, { rooms: [{ id: "radio-default", title: "无线电波", messages: [], updatedAt: Date.now() }], active: "radio-default" });
    if (!Array.isArray(data.rooms) || !data.rooms.length) {
      data.rooms = [{ id: "radio-default", title: "无线电波", messages: [], updatedAt: Date.now() }];
      data.active = "radio-default";
    }
    const activeRoom = data.rooms.find((room) => room.id === data.active) || data.rooms[0];
    const messages = Array.isArray(activeRoom.messages)
      ? activeRoom.messages.map((message) => "<p><b>" + esc(message.from) + ":</b> " + esc(message.text) + "</p>").join("")
      : "";
    const panel = sidePanel(
      "无线电波的两端",
      "电波入口 · 暂未接入",
      '<section class="coast-room-card"><h2>会话列表</h2><button type="button" id="radioNewV095">新建窗口</button><p>' +
        data.rooms.map((room) => esc(room.title || "无线电波")).join(" / ") +
        '</p></section><section class="coast-room-card"><h2>当前窗口</h2><div class="coast-room-log">' +
        (messages || '<p class="coast-empty-v096">无线电波暂未接入。</p>') +
        '</div><textarea id="radioTextV095" rows="4" placeholder="写一条消息草稿"></textarea><button type="button" id="radioSendV095">保存到当前窗口</button></section><section class="coast-room-card"><h2>状态说明</h2><p>无线电波入口已保留，正式通道待接入。</p></section>',
    );

    panel.querySelector("#radioSendV095").onclick = () => {
      const text = panel.querySelector("#radioTextV095").value.trim();
      if (!text) return;
      activeRoom.messages.push({ from: "小寒", text, at: Date.now() });
      activeRoom.updatedAt = Date.now();
      save(STORAGE_KEYS.radioRooms, data);
      radio();
    };
    panel.querySelector("#radioNewV095").onclick = () => {
      const id = "radio-" + Date.now();
      data.rooms.push({ id, title: "电波窗口 " + (data.rooms.length + 1), messages: [], updatedAt: Date.now() });
      data.active = id;
      save(STORAGE_KEYS.radioRooms, data);
      radio();
    };
  }

  function letters() {
    const draft = load(STORAGE_KEYS.lighthouseDraft, { text: "" });
    const panel = sidePanel(
      "灯塔来信",
      "来信入口 · 暂未接入",
      '<section class="coast-room-card"><h2>来信箱</h2><p>暂时还没有来信。</p></section><section class="coast-room-card"><h2>通道状态</h2><p>正式来信通道待接入。</p></section><section class="coast-room-card"><h2>来信草稿</h2><textarea id="letterDraftV095" rows="7" placeholder="写一段草稿">' +
        esc(draft.text) +
        '</textarea><button type="button" id="letterSaveV095">保存草稿</button></section><section class="coast-room-card"><h2>未来说明</h2><p>未来可接入正式来信，也可转入无线电波的两端。</p></section>',
    );
    panel.querySelector("#letterSaveV095").onclick = () => {
      save(STORAGE_KEYS.lighthouseDraft, { text: panel.querySelector("#letterDraftV095").value });
      alert("草稿已保存");
    };
  }

  function memory() {
    sidePanel("轨迹记忆", "记忆库暂未接入", '<section class="coast-room-card"><h2>记忆库暂未接入</h2><p>这里会在接入正式记忆后显示可整理的轨迹。</p><p>当前不读取、不写入、不检索任何记忆数据。</p></section>');
  }

  function daily() {
    const panel = sidePanel("海岸日报", "海岸日报暂未接入", '<section class="coast-room-card"><h2>海岸日报暂未接入</h2><p>之后这里会承接日报、相册、日记和小组件。</p><p>当前只保留入口，不生成测试内容。</p></section>');
    panel.dataset.room = "daily";
  }

  function openRoom(kind) {
    if (kind === "radio") radio();
    if (kind === "letters") letters();
    if (kind === "memory") memory();
    if (kind === "daily") daily();
  }

  document.addEventListener("DOMContentLoaded", mountRooms);
  setTimeout(mountRooms, 400);
  $("#menuButton")?.addEventListener("click", () => setTimeout(mountRooms, 40));
}

function mountRoomWindows(root) {
  if (!onceFlag(root, "__v096RoomsTune")) return;

  function roomData(key, fallbackId, fallbackTitle) {
    const data = loadJson(key, { rooms: [{ id: fallbackId, title: fallbackTitle, messages: [], updatedAt: Date.now() }], active: fallbackId });
    if (!Array.isArray(data.rooms)) data.rooms = [];
    if (!data.rooms.length) {
      data.rooms = [{ id: fallbackId, title: fallbackTitle, messages: [], updatedAt: Date.now() }];
      data.active = fallbackId;
    }
    if (!data.active && data.rooms[0]) data.active = data.rooms[0].id;
    return data;
  }

  const rdata = () => roomData(STORAGE_KEYS.radioRooms, "radio-default", "无线电波");
  const ldata = () => roomData(STORAGE_KEYS.lighthouseRooms, "letter-default", "灯塔来信");

  function ensureWindowList() {
    const history = $(".history-list");
    if (!history) return;
    let section = $("#coastRoomWindowsV096");
    if (!section) {
      section = document.createElement("section");
      section.id = "coastRoomWindowsV096";
      section.className = "coast-room-windows-v096";
      const after = $("#coastRoomsV095");
      if (after) after.after(section);
      else history.prepend(section);
    }
    const radio = rdata();
    const letter = ldata();
    section.innerHTML =
      "<h2>房间窗口</h2>" +
      radio.rooms.map((room) => '<button type="button" class="history-item" data-v096-kind="radio" data-v096-id="' + esc(room.id) + '">【电波·】' + esc(room.title) + "</button>").join("") +
      letter.rooms.map((room) => '<button type="button" class="history-item" data-v096-kind="letter" data-v096-id="' + esc(room.id) + '">【灯塔·】' + esc(room.title) + "</button>").join("");
    $$('[data-v096-kind]', section).forEach((button) => {
      button.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        openChat(button.dataset.v096Kind, button.dataset.v096Id);
      };
    });
  }

  function wireMainRooms() {
    const box = $("#coastRoomsV095");
    if (!box) return;
    $$('[data-room]', box).forEach((button) => {
      button.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        openV096(button.dataset.room);
      };
    });
    ensureWindowList();
  }

  function pack(kind) {
    return kind === "letter"
      ? { key: STORAGE_KEYS.lighthouseRooms, data: ldata(), prefix: "【灯塔·】", who: "小寒", title: "灯塔来信", subtitle: "来信入口 · 暂未接入" }
      : { key: STORAGE_KEYS.radioRooms, data: rdata(), prefix: "【电波·】", who: "小寒", title: "无线电波的两端", subtitle: "电波入口 · 暂未接入" };
  }

  function drawShell(title, subtitle, messages, kind) {
    let panel = $("#coastChatRoomV096");
    if (!panel) {
      panel = document.createElement("section");
      panel.id = "coastChatRoomV096";
      panel.className = "coast-chat-room-v096";
      document.body.appendChild(panel);
    }
    panel.hidden = false;
    hideSidebar();
    panel.innerHTML =
      '<header class="coast-chat-head"><button type="button" id="coastChatBackV096" class="coast-chat-back">←</button><div><h1>' +
      esc(title) +
      "</h1><p>" +
      esc(subtitle) +
      '</p></div><button type="button" id="coastChatNewV096" class="coast-chat-new">新建窗口</button></header><main class="coast-chat-scroll"><div class="coast-chat-msgs">' +
      messages +
      '</div></main><div class="coast-chat-form"><textarea id="coastChatTextV096" rows="1" placeholder="写一条本地消息"></textarea><button type="button" id="coastChatSendV096">发送</button></div>';
    panel.querySelector("#coastChatBackV096").onclick = () => {
      panel.hidden = true;
      showSidebar();
      ensureWindowList();
    };
    panel.querySelector("#coastChatNewV096").onclick = () => newRoom(kind);
    setTimeout(() => {
      const scroll = panel.querySelector(".coast-chat-scroll");
      if (scroll) scroll.scrollTop = scroll.scrollHeight;
    }, 0);
    return panel;
  }

  function openChat(kind, id) {
    const config = pack(kind);
    const data = config.data;
    if (id) data.active = id;
    let room = data.rooms.find((item) => item.id === data.active) || data.rooms[0];
    if (!room) {
      room = { id: kind === "letter" ? "letter-default" : "radio-default", title: kind === "letter" ? "灯塔来信" : "无线电波", messages: [], updatedAt: Date.now() };
      data.rooms = [room];
      data.active = room.id;
    }
    saveJson(config.key, data);
    ensureWindowList();

    const messages = Array.isArray(room.messages)
      ? room.messages.map((message) => '<div class="coast-chat-msg ' + (message.from === "小寒" ? "is-user" : "is-other") + '"><div>' + esc(message.text) + "</div><small>" + esc(message.from) + "</small></div>").join("")
      : "";
    const empty = kind === "letter" ? '<p class="coast-empty-v096">暂时还没有来信。</p>' : '<p class="coast-empty-v096">无线电波暂未接入。</p>';
    const panel = drawShell(config.title, config.prefix + (room.title || config.title) + " · " + config.subtitle, messages || empty, kind);
    panel.querySelector("#coastChatSendV096").onclick = () => {
      const text = panel.querySelector("#coastChatTextV096").value.trim();
      if (!text) return;
      room.messages.push({ from: config.who, text, at: Date.now() });
      room.updatedAt = Date.now();
      saveJson(config.key, data);
      openChat(kind, room.id);
    };
  }

  function newRoom(kind) {
    const config = pack(kind);
    const data = config.data;
    const id = kind + "-" + Date.now();
    data.rooms.push({ id, title: (kind === "letter" ? "来信窗口 " : "电波窗口 ") + (data.rooms.length + 1), messages: [], updatedAt: Date.now() });
    data.active = id;
    saveJson(config.key, data);
    ensureWindowList();
    openChat(kind, id);
  }

  function simplePanel(title, subtitle, body) {
    return openPanel({ id: "coastRoomPanelV096", className: "coast-room-panel-v095", title, subtitle, body, backId: "coastSimpleBackV096" });
  }

  function memV096() {
    simplePanel("轨迹记忆", "记忆库暂未接入", '<section class="coast-room-card"><h2>记忆库暂未接入</h2><p>这里会在接入正式记忆后显示可整理的轨迹。</p><p>当前不读取、不写入、不检索任何记忆数据。</p></section>');
  }

  function dailyV096() {
    const panel = simplePanel("海岸日报", "海岸日报暂未接入", '<section class="coast-room-card"><h2>海岸日报暂未接入</h2><p>之后这里会承接日报、相册、日记和小组件。</p><p>当前只保留入口，不生成测试内容。</p></section>');
    panel.dataset.room = "daily";
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
  $("#menuButton")?.addEventListener("click", () =>
    setTimeout(() => {
      wireMainRooms();
      ensureWindowList();
    }, 60),
  );
}

function mountCoastPolish(root) {
  if (!onceFlag(root, "__v097CoastPolish")) return;

  function polishStatus() {
    const status = $("#coastStatusV095");
    if (!status) return;
    status.innerHTML =
      '<div class="coast-status-lines-v097"><div><i></i><span>同轨 <b>' +
      coastDay() +
      "</b> 天</span><i></i></div><div><i></i><span>距周年纪念日 <b>" +
      daysUntil(8, 12) +
      "</b> 天</span><i></i></div><div><i></i><span>距 Myri 生日 <b>" +
      daysUntil(8, 13) +
      "</b> 天</span><i></i></div></div>";
  }

  function currentMsgs() {
    return loadJson(STORAGE_KEYS.mainMessages, []);
  }

  function mainList() {
    let list = loadJson(STORAGE_KEYS.mainWindows, null);
    if (!Array.isArray(list) || !list.length) {
      list = [{ id: "main-1", title: "新聊天", messages: currentMsgs(), updatedAt: Date.now() }];
      saveJson(STORAGE_KEYS.mainWindows, list);
      localStorage.setItem(STORAGE_KEYS.mainActive, list[0].id);
    }
    return list;
  }

  function saveActive() {
    const list = mainList();
    const id = localStorage.getItem(STORAGE_KEYS.mainActive) || list[0].id;
    const active = list.find((item) => item.id === id) || list[0];
    active.messages = currentMsgs();
    active.updatedAt = Date.now();
    saveJson(STORAGE_KEYS.mainWindows, list);
  }

  function openMain(id) {
    saveActive();
    const list = mainList();
    const next = list.find((item) => item.id === id) || list[0];
    localStorage.setItem(STORAGE_KEYS.mainActive, next.id);
    saveJson(STORAGE_KEYS.mainMessages, next.messages || []);
    window.location.reload();
  }

  function newMain() {
    saveActive();
    const list = mainList();
    const id = "main-" + Date.now();
    list.push({ id, title: "新聊天 " + (list.length + 1), messages: [], updatedAt: Date.now() });
    saveJson(STORAGE_KEYS.mainWindows, list);
    localStorage.setItem(STORAGE_KEYS.mainActive, id);
    saveJson(STORAGE_KEYS.mainMessages, []);
    window.location.reload();
  }

  function mountMainWindows() {
    const history = $(".history-list");
    if (!history) return;
    let section = $("#mainWindowsV097");
    if (!section) {
      section = document.createElement("section");
      section.id = "mainWindowsV097";
      section.className = "main-windows-v097";
      const first = history.querySelector("section");
      if (first) first.after(section);
      else history.prepend(section);
    }
    const active = localStorage.getItem(STORAGE_KEYS.mainActive);
    section.innerHTML =
      "<h2>主聊天窗口</h2>" +
      mainList().map((item) => '<button type="button" class="history-item ' + (item.id === active ? "is-active" : "") + '" data-main-window-v097="' + esc(item.id) + '">' + esc(item.title) + "</button>").join("");
    $$('[data-main-window-v097]', section).forEach((button) => {
      button.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        openMain(button.dataset.mainWindowV097);
      };
    });
  }

  function openLite(title, subtitle, body) {
    const panel = openPanel({ id: "coastRoomPanelV097", className: "coast-room-panel-v095", title, subtitle, body, backId: "coastBackV097" });
    panel.querySelector("#coastBackV097").onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (panel.dataset.parent === "daily") {
        dailyV097();
        return;
      }
      panel.hidden = true;
      showSidebar();
    };
    panel.onclick = (event) => {
      const dailyRoom = event.target.closest("[data-daily-room]");
      if (dailyRoom) {
        event.preventDefault();
        event.stopPropagation();
        dailyRoomV097(dailyRoom.dataset.dailyRoom);
      }
      const back = event.target.closest('[data-action="daily-back"][data-daily-back="daily"]');
      if (back) {
        event.preventDefault();
        event.stopPropagation();
        dailyV097();
      }
    };
    return panel;
  }

  function memoryV097() {
    openLite("轨迹记忆", "记忆库暂未接入", '<section class="coast-room-card"><h2>记忆库暂未接入</h2><p>这里会在接入正式记忆后显示可整理的轨迹。</p><p>当前不读取、不写入、不检索任何记忆数据。</p></section>');
  }

  function dailyV097() {
    const panel = openLite("海岸日报", "海岸日报暂未接入", '<section class="coast-room-card"><h2>海岸日报暂未接入</h2><p>之后这里会承接日报、相册、日记和小组件。</p><p>当前只保留入口，不生成测试内容。</p></section>');
    panel.dataset.room = "daily";
  }

  function dailyRoomV097(kind) {
    const titles = { moments: "朋友圈", diary: "日记", album: "相册", widgets: "小组件", pet: "宠物系统" };
    const title = titles[kind] || "海岸日报";
    const panel = openLite(title, "海岸日报暂未接入", '<section class="coast-room-card"><h2>' + esc(title) + '</h2><p>这个入口暂未接入正式内容。</p><button type="button" data-action="daily-back" data-daily-back="daily">返回海岸日报</button></section>');
    panel.dataset.parent = "daily";
  }

  function wireV097() {
    polishStatus();
    mountMainWindows();
    document.querySelectorAll("[data-room-v095]").forEach((button) => {
      if (!button.dataset.room) button.dataset.room = button.dataset.roomV095;
    });
    const newChat = $("#newChatButton");
    if (newChat && !newChat.dataset.v097) {
      newChat.dataset.v097 = "1";
      newChat.addEventListener("click", (event) => {
        stopHard(event);
        newMain();
      }, true);
    }
    document.querySelectorAll("[data-room]").forEach((button) => {
      if (button.dataset.v097) return;
      button.dataset.v097 = "1";
      button.addEventListener("click", (event) => {
        const room = button.dataset.room;
        if (room === "memory") {
          stopHard(event);
          memoryV097();
        }
        if (room === "daily") {
          stopHard(event);
          dailyV097();
        }
      }, true);
    });
  }

  setInterval(wireV097, 1000);
  document.addEventListener("DOMContentLoaded", wireV097);
  setTimeout(wireV097, 700);
}

function mountFinalOrder(root) {
  if (!onceFlag(root, "__v098FinalSidebarPolish")) return;

  function hideSaved() {
    const button = $("#testWindowButton");
    const section = button && button.closest("section");
    if (section) section.style.display = "none";
  }

  function orderMainWindows() {
    const rooms = $("#coastRoomsV095");
    const main = $("#mainWindowsV097");
    const roomWindows = $("#coastRoomWindowsV096");
    if (rooms && main && main.previousElementSibling !== rooms) rooms.after(main);
    if (main && roomWindows && roomWindows.previousElementSibling !== main) main.after(roomWindows);
    const heading = $("#mainWindowsV097 h2");
    if (heading) heading.textContent = "主聊天窗口";
  }

  function hideLegacySaved() {
    const history = $(".history-list");
    if (!history) return;
    $$("h2,h3,.history-section-title,.section-title", history).forEach((title) => {
      if ((title.textContent || "").trim() === "已保存") {
        const parent = title.closest("section,div");
        if (parent && parent.id !== "mainWindowsV097") parent.classList.add("legacy-saved-hidden-v098");
        else title.classList.add("legacy-saved-hidden-v098");
      }
    });
  }

  function polish() {
    hideSaved();
    hideLegacySaved();
    orderMainWindows();
  }

  document.addEventListener("DOMContentLoaded", polish);
  document.addEventListener("click", () => setTimeout(polish, 50), true);
  setTimeout(polish, 300);
  setInterval(polish, 1200);
}

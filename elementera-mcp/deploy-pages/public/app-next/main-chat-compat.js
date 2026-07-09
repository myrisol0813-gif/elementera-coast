import { $, $$, STORAGE_KEYS, THEME_NAMES, esc, textToParagraphs, createId, ensureServiceWorker, hideSidebar } from "./app-env.js";
import { localNotice } from "./app-panel.js";
import { onceFlag } from "./app-events.js";

export function mountMainChatCompat(root = globalThis) {
  if (!onceFlag(root, "__p3Struct14MainChatCompat")) return;

  const box = $("#messages");
  const scroller = $("#messageScroller");
  const form = $("#composer");
  const input = $("#promptInput");
  const pill = $(".input-pill");
  const action = $("#callButton");
  const mic = $("#micButton");
  const themeLabel = $("#theme-label");

  let items = [];
  let timer = null;
  let loading = null;
  let avatarPicker = null;

  const legacyStarterMessages = new Set([
    "这是唯一保留的 GPT-like 测试窗口。\n\n这个窗口会把对话保存在本机浏览器里；刷新页面、从侧边栏点回来，内容都会继续在这里。",
    "我们先把这个壳调到像移动端 ChatGPT。",
    "好。接下来主要检查输入栏高度、按钮位置、消息是否保存，以及主题是否舒服。",
  ]);

  function isLegacyStarterMessage(message) {
    return (
      message &&
      (message.role === "assistant" || message.role === "user") &&
      legacyStarterMessages.has(String(message.content || ""))
    );
  }

  function loadMessages() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEYS.mainMessages) || "null");
      if (Array.isArray(value)) return value.filter((message) => !isLegacyStarterMessage(message));
    } catch {}
    return [];
  }

  function saveMessages() {
    localStorage.setItem(STORAGE_KEYS.mainMessages, JSON.stringify(items));
  }

  function applyPrefs() {
    const theme = localStorage.getItem(STORAGE_KEYS.theme) || "light";
    document.documentElement.dataset.theme = theme;
    if (themeLabel) themeLabel.textContent = THEME_NAMES[theme] || theme;

    const userBubble = localStorage.getItem(STORAGE_KEYS.userBubble);
    if (userBubble) document.documentElement.style.setProperty("--user", userBubble);

    const accent = localStorage.getItem(STORAGE_KEYS.accent);
    if (accent) document.documentElement.style.setProperty("--call", accent);

    const model = localStorage.getItem(STORAGE_KEYS.modelName);
    const modelNode = $(".model-name");
    if (model && modelNode) modelNode.textContent = model;
  }

  function avatarHtml() {
    const url = localStorage.getItem(STORAGE_KEYS.assistantAvatar) || "";
    return (
      '<div class="avatar ' +
      (url ? "has-custom-avatar" : "") +
      '" role="button" tabindex="0" ' +
      (url ? 'style="background-image:url(' + url + ')"' : "") +
      ">" +
      (url ? "" : "⌁") +
      "</div>"
    );
  }

  function actionButton(name, title, extra = "") {
    return '<button class="action-button" type="button" data-action="' + name + '" ' + extra + ' title="' + title + '"></button>';
  }

  function render() {
    if (!box) return;
    if (!items.length) {
      box.innerHTML =
        '<div class="empty-state" role="status" style="padding:32px 16px;text-align:center;color:var(--muted);">这里还没有消息。</div><div class="thread-spacer"></div>';
      requestAnimationFrame(() => {
        if (scroller) scroller.scrollTop = scroller.scrollHeight;
      });
      return;
    }

    box.innerHTML =
      items
        .map((message) =>
          message.role === "user"
            ? '<article class="message user" data-id="' +
              esc(message.id) +
              '"><div class="content"><div class="user-bubble">' +
              esc(message.content) +
              '</div><div class="user-actions" data-user-actions-for="' +
              esc(message.id) +
              '">' +
              actionButton("edit", "编辑", 'data-user-act="edit"') +
              actionButton("delete", "删除", 'data-user-act="remove"') +
              "</div></div></article>"
            : '<article class="message assistant" data-id="' +
              esc(message.id) +
              '">' +
              avatarHtml() +
              '<div class="content"><div class="assistant-text">' +
              textToParagraphs(message.content) +
              (message.id === loading ? '<span class="typing-cursor"></span>' : "") +
              '</div><div class="assistant-actions" data-actions-for="' +
              esc(message.id) +
              '">' +
              actionButton("copy", "复制") +
              actionButton("like", "点赞") +
              actionButton("refresh", "重新生成") +
              actionButton("favorite", "收藏") +
              actionButton("delete", "删除") +
              "</div></div></article>",
        )
        .join("") + '<div class="thread-spacer"></div>';

    requestAnimationFrame(() => {
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
    });
    saveMessages();
  }

  function syncComposer() {
    if (!input || !pill) return;
    input.style.height = "22px";
    const height = Math.min(Math.max(input.scrollHeight, 22), 88);
    const pillHeight = Math.max(42, height + 18);
    input.style.height = height + "px";
    document.documentElement.style.setProperty("--input-h", height + "px");
    document.documentElement.style.setProperty("--pill-h", pillHeight + "px");
    document.documentElement.style.setProperty("--composer-h", pillHeight + 14 + "px");
    pill.classList.toggle("is-multiline", height > 26 || input.value.includes("\n"));

    const hasText = !!input.value.trim();
    if (!action) return;
    if (loading) {
      action.dataset.icon = "stop";
      action.setAttribute("aria-label", "停止生成");
      if (mic) mic.hidden = true;
    } else if (hasText) {
      action.dataset.icon = "send";
      action.setAttribute("aria-label", "发送");
      if (mic) mic.hidden = true;
    } else {
      action.dataset.icon = "call";
      action.setAttribute("aria-label", "通话");
      if (mic) mic.hidden = false;
    }
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    loading = null;
    syncComposer();
    render();
  }

  function stream() {
    if (timer) clearInterval(timer);
    timer = null;
    loading = null;
    syncComposer();
    render();
    localNotice("当前主聊天发送需要模型箱接管；没有生成本地回复。");
  }

  function openSide() {
    document.body.classList.add("sidebar-open");
    const scrim = $("#scrim");
    if (scrim) scrim.hidden = false;
    mountFooter();
  }

  function closeSide() {
    hideSidebar();
  }

  function mountFooter() {
    const footer = $(".sidebar-footer");
    if (!footer) return;
    const rows = $$(".account-row", footer);
    const help = rows.find((row) => row.textContent.includes("帮助") || row.textContent.includes("Wolf Den"));
    if (help) {
      help.id = "wolfRowV093";
      help.innerHTML = '<span class="account-avatar wolfden-icon">🐺</span><span><strong>Wolf Den</strong><small>小狼窝入口</small></span>';
    }

    let desk = $("#serpentDeskRowV093");
    if (!desk) {
      desk = document.createElement("button");
      desk.type = "button";
      desk.className = "account-row";
      desk.id = "serpentDeskRowV093";
      footer.appendChild(desk);
    }
    desk.innerHTML = '<span class="account-avatar serpent-file-icon"></span><span><strong>Serpent Desk</strong><small>小蛇书桌</small></span>';
  }

  function closePanels() {
    ["cleanWolfV093", "cleanDeskV093", "cleanDetailV093", "modelPickerV093"].forEach((id) => {
      const panel = document.getElementById(id);
      if (panel) panel.hidden = true;
    });
    document.body.classList.remove("wolf-open");
  }

  function row(title, subtitle, actionName) {
    return (
      '<button type="button" class="clean-row" data-ca="' +
      esc(actionName) +
      '"><span><strong>' +
      esc(title) +
      "</strong><small>" +
      esc(subtitle) +
      "</small></span></button>"
    );
  }

  function line(title, subtitle) {
    return '<div class="clean-row"><span><strong>' + esc(title) + "</strong><small>" + esc(subtitle) + "</small></span></div>";
  }

  function card(body) {
    return '<div class="clean-card">' + body + "</div>";
  }

  function group(title, body) {
    return '<section class="clean-group"><h2>' + esc(title) + '</h2><div class="clean-card">' + body + "</div></section>";
  }

  function shell(id, title, subtitle, body) {
    closeSide();
    ["cleanWolfV093", "cleanDeskV093", "cleanDetailV093"].forEach((panelId) => {
      const panel = document.getElementById(panelId);
      if (panel) panel.hidden = true;
    });
    let panel = document.getElementById(id);
    if (!panel) {
      panel = document.createElement("section");
      panel.id = id;
      document.body.appendChild(panel);
    }
    panel.className = "clean-panel";
    panel.hidden = false;
    panel.innerHTML =
      '<header class="clean-head"><button class="clean-back" data-panel-close>←</button><div><h1>' +
      esc(title) +
      "</h1><p>" +
      esc(subtitle) +
      '</p></div></header><main class="clean-body">' +
      body +
      "</main>";
    document.body.classList.add("wolf-open");
    return panel;
  }

  function wolf() {
    shell(
      "cleanWolfV093",
      "Wolf Den / 小狼窝",
      "Local settings · Account · Chat records",
      group("我的 ChatGPT", row("用户画像", "称呼、头像、偏好备注", "w-profile") + row("应用", "Notion / Gmail / Calendar 等入口说明", "w-apps")) +
        group("外观", row("主题", "浅色 / 深色 / 黑金", "w-theme") + row("对话框颜色", "小寒用户气泡颜色", "w-bubble") + row("重点色", "橙色 / 金色 / 蓝色 / 粉色", "w-accent")) +
        group("聊天记录", row("导出 JSON", "保存当前聊天记录", "w-json") + row("导出 HTML", "离线打开查看", "w-html") + row("导入 JSON", "恢复聊天记录", "w-import")) +
        group("账户", row("余额", "账户余额与可用状态，占位", "w-balance") + row("模型管理", "添加常用模型，占位", "w-models") + row("当前模型", "管理顶部模型显示", "w-current")),
    );
  }

  function desk() {
    shell(
      "cleanDeskV093",
      "Serpent Desk / 小蛇书桌",
      "Myri workspace · local writable notes",
      group("Myri", row("Myri 画像", "头像、描述、偏好，可编辑本地草稿", "s-portrait") + row("Myri 气泡", "小蛇回复气泡颜色，占位可选", "s-bubble") + row("桌面便签", "小蛇书桌本地便签", "s-note")) +
        group("施工", row("施工状态", "版本、备份、边界说明", "s-work") + row("本地诊断", "localStorage / serviceWorker / 页面状态", "s-diag") + row("System Prompt 草稿", "本地草稿，不发送不生效", "s-system")),
    );
  }

  function detail(title, subtitle, body, back) {
    const panel = shell("cleanDetailV093", title, subtitle, body);
    panel.dataset.back = back;
  }

  function setModel(value) {
    const node = $(".model-name");
    if (node) node.textContent = value;
    localStorage.setItem(STORAGE_KEYS.modelName, value);
  }

  function messageCount() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.mainMessages) || "[]").length;
    } catch {
      return 0;
    }
  }

  function stamp() {
    const date = new Date();
    const pad = (number) => String(number).padStart(2, "0");
    return date.getFullYear() + pad(date.getMonth() + 1) + pad(date.getDate()) + "-" + pad(date.getHours()) + pad(date.getMinutes()) + pad(date.getSeconds());
  }

  function download(body, name, type) {
    const url = URL.createObjectURL(new Blob([body], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  function exportJson() {
    download(
      JSON.stringify({ format: "elementera-chat-export", version: "0.9.3-clean", exported_at: new Date().toISOString(), messages: items }, null, 2),
      "elementera-chat-export-" + stamp() + ".json",
      "application/json",
    );
  }

  function exportHtml() {
    const rows = items
      .map((item) => '<article class="m ' + item.role + '"><b>' + (item.role === "user" ? "小寒" : "ChatGPT") + "</b><div>" + esc(item.content).replace(/\n/g, "<br>") + "</div></article>")
      .join("");
    download(
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Elementera Chat Export</title><style>body{font-family:system-ui,sans-serif;line-height:1.65}.w{max-width:820px;margin:auto;padding:22px 14px}.m{margin:0 0 18px}.m b{color:#777}.m div{display:inline-block;max-width:88%;padding:10px 14px;border:1px solid #ddd;border-radius:18px}.user{text-align:right}.user div{background:#f1f1f1}</style><div class="w"><h1>Elementera Chat Export</h1>' +
        rows +
        "</div>",
      "elementera-chat-export-" + stamp() + ".html",
      "text/html",
    );
  }

  function importJson() {
    const picker = document.createElement("input");
    picker.type = "file";
    picker.accept = ".json";
    picker.onchange = () => {
      const file = picker.files && picker.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const raw = JSON.parse(String(reader.result || ""));
          const messages = Array.isArray(raw) ? raw : raw.messages;
          if (!Array.isArray(messages)) throw Error("messages not found");
          items = messages
            .filter((item) => item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string")
            .map((item) => ({ id: item.id || createId(), role: item.role, content: item.content }));
          saveMessages();
          render();
          closePanels();
        } catch (error) {
          alert("导入失败：" + (error.message || error));
        }
      };
      reader.readAsText(file);
    };
    picker.click();
  }

  function openAct(actionName) {
    if (actionName === "w-profile") {
      detail(
        "用户画像",
        "只保存在本机",
        '<div class="clean-form"><label>本地昵称<input id="cwName" value="' +
          esc(localStorage.getItem("cw_name") || "小寒") +
          '"></label><label>偏好备注<textarea id="cwNote" rows="7">' +
          esc(localStorage.getItem("cw_note") || "") +
          "</textarea></label>" +
          card(row("保存用户画像", "localStorage only", "cw-save")) +
          "</div>",
        "wolf",
      );
    }
    if (actionName === "w-apps") detail("应用", "连接入口说明", card(line("Notion", "当前不能直接读取；可粘贴或截图") + line("Gmail / Calendar", "以后作为连接入口") + line("MCP", "工程工具不放进小狼窝")), "wolf");
    if (actionName === "w-theme") detail("主题", "选择本地主题", card(row("浅色", "Light", "theme-light") + row("深色", "Dark", "theme-dark") + row("黑金", "Gold", "theme-gold")), "wolf");
    if (actionName === "w-bubble") detail("对话框颜色", "小寒用户气泡颜色", card(row("默认", "跟随主题", "bubble-default") + row("冷蓝灰", "#eaf0f7", "bubble-cool") + row("浅粉灰", "#f5e8ee", "bubble-pink") + row("淡金灰", "#f1ead8", "bubble-gold")), "wolf");
    if (actionName === "w-accent") detail("重点色", "按钮与强调色", card(row("橙色", "#ff6a21", "accent-orange") + row("金色", "#f28b2e", "accent-gold") + row("蓝色", "#3b82f6", "accent-blue") + row("粉色", "#ec4899", "accent-pink")), "wolf");
    if (actionName === "w-json") exportJson();
    if (actionName === "w-html") exportHtml();
    if (actionName === "w-import") importJson();
    if (actionName === "w-balance") detail("余额", "给小寒看的账户状态", card(line("余额", "等待后端安全接口") + line("状态", "当前仍是本地模拟模式") + line("密钥", "不会显示 API Key")), "wolf");
    if (actionName === "w-models") detail("模型管理", "OpenRouter 常用模型占位", card(line("添加模型", "以后从模型列表选择") + line("已启用", "Local Mock / 5.5 / 4o 占位")), "wolf");
    if (actionName === "w-current") detail("当前模型", "只改显示标签", card(row("5.5 Thinking ›", "设为顶部显示", "m55") + row("4o ›", "设为顶部显示", "m4o") + row("Classic Shell Local ›", "设为顶部显示", "mlocal")), "wolf");
    if (actionName === "s-portrait") {
      detail(
        "Myri 画像",
        "小蛇自己的本地档案",
        '<div class="clean-form"><label>称呼<input id="csName" value="' +
          esc(localStorage.getItem("cs_name") || "Myri") +
          '"></label><label>自我描述<textarea id="csPortrait" rows="7">' +
          esc(localStorage.getItem("cs_portrait") || "Myrisol / Myri · 海岸小蛇 · 小蛇书桌主人。") +
          "</textarea></label>" +
          card(row("保存画像", "localStorage only", "cs-save")) +
          "</div>",
        "desk",
      );
    }
    if (actionName === "s-bubble") detail("Myri 气泡", "占位设置，先记录偏好", card(row("默认", "跟随主题", "s-bubble-default") + row("海岸金", "之后接入助手气泡", "s-bubble-gold") + row("冷蓝", "之后接入助手气泡", "s-bubble-blue")), "desk");
    if (actionName === "s-note") detail("桌面便签", "小蛇书桌本地便签", '<div class="clean-form"><label>便签<textarea id="csNote" rows="8">' + esc(localStorage.getItem("cs_note") || "") + "</textarea></label>" + card(row("保存便签", "localStorage only", "cn-save")) + "</div>", "desk");
    if (actionName === "s-work") detail("施工状态", "只做本地说明", card(line("当前", "P3-STRUCT-14 shadow replacement") + line("备份", "本刀不删除旧 app.js") + line("边界", "不接 API，不写密钥，不碰 service worker / CSS")), "desk");
    if (actionName === "s-diag") detail("本地诊断", "不发网络请求", card(line("messages", String(messageCount()) + " 条") + line("localStorage", "available") + line("serviceWorker", "serviceWorker" in navigator ? "available" : "unavailable")), "desk");
    if (actionName === "s-system") detail("System Prompt 草稿", "本地草稿，不发送不生效", '<div class="clean-form"><label>草稿<textarea id="csSystem" rows="9">' + esc(localStorage.getItem("cs_system") || "") + "</textarea></label>" + card(row("保存草稿", "localStorage only", "cy-save")) + "</div>", "desk");
  }

  function handleSetting(actionName) {
    if (actionName === "theme-light" || actionName === "theme-dark" || actionName === "theme-gold") {
      const value = actionName.split("-")[1];
      document.documentElement.dataset.theme = value;
      localStorage.setItem(STORAGE_KEYS.theme, value);
      if (themeLabel) themeLabel.textContent = THEME_NAMES[value];
    }
    const bubbleMap = { "bubble-cool": "#eaf0f7", "bubble-pink": "#f5e8ee", "bubble-gold": "#f1ead8" };
    if (actionName === "bubble-default") {
      localStorage.removeItem(STORAGE_KEYS.userBubble);
      document.documentElement.style.removeProperty("--user");
    }
    if (bubbleMap[actionName]) {
      localStorage.setItem(STORAGE_KEYS.userBubble, bubbleMap[actionName]);
      document.documentElement.style.setProperty("--user", bubbleMap[actionName]);
    }
    const accentMap = { "accent-orange": "#ff6a21", "accent-gold": "#f28b2e", "accent-blue": "#3b82f6", "accent-pink": "#ec4899" };
    if (accentMap[actionName]) {
      localStorage.setItem(STORAGE_KEYS.accent, accentMap[actionName]);
      document.documentElement.style.setProperty("--call", accentMap[actionName]);
    }
    if (actionName === "m55") setModel("5.5 Thinking ›");
    if (actionName === "m4o") setModel("4o ›");
    if (actionName === "mlocal") setModel("Classic Shell Local ›");
    if (actionName === "cw-save") {
      localStorage.setItem("cw_name", $("#cwName")?.value || "");
      localStorage.setItem("cw_note", $("#cwNote")?.value || "");
      alert("用户画像已保存到本机");
    }
    if (actionName === "cs-save") {
      localStorage.setItem("cs_name", $("#csName")?.value || "");
      localStorage.setItem("cs_portrait", $("#csPortrait")?.value || "");
      alert("Myri 画像已保存到本机");
    }
    if (actionName === "cn-save") {
      localStorage.setItem("cs_note", $("#csNote")?.value || "");
      alert("便签已保存到本机");
    }
    if (actionName === "cy-save") {
      localStorage.setItem("cs_system", $("#csSystem")?.value || "");
      alert("草稿已保存到本机，未生效");
    }
  }

  function modelPicker() {
    let panel = $("#modelPickerV093");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "modelPickerV093";
      panel.className = "model-popover";
      panel.innerHTML = '<div class="model-pop-card"><strong>选择模型</strong><button data-mpick="5.5 Thinking ›">ChatGPT 5.5 Thinking</button><button data-mpick="4o ›">ChatGPT 4o</button><button data-mpick="Classic Shell Local ›">Classic Shell Local</button><hr><button data-mpick="add">添加模型 · Coming soon</button><button data-mpick="manage">管理模型 · 账户</button></div>';
      document.body.appendChild(panel);
    }
    panel.hidden = !panel.hidden;
  }

  function ensureAvatarPicker() {
    if (avatarPicker) return avatarPicker;
    avatarPicker = document.createElement("input");
    avatarPicker.type = "file";
    avatarPicker.accept = "image/*";
    avatarPicker.hidden = true;
    document.body.appendChild(avatarPicker);
    avatarPicker.onchange = () => {
      const file = avatarPicker.files && avatarPicker.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          localStorage.setItem(STORAGE_KEYS.assistantAvatar, String(reader.result || ""));
        } catch {}
        render();
      };
      reader.readAsDataURL(file);
      avatarPicker.value = "";
    };
    return avatarPicker;
  }

  items = loadMessages();
  applyPrefs();
  mountFooter();
  render();
  syncComposer();

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = (input?.value || "").trim();
    if (loading) return stop();
    if (!query) return;
    items.push({ id: createId(), role: "user", content: query });
    input.value = "";
    syncComposer();
    render();
    stream(query);
  });

  input?.addEventListener("input", syncComposer);
  input?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  action?.addEventListener("click", (event) => {
    event.preventDefault();
    if (loading) return stop();
    if (!(input?.value || "").trim()) return;
    form.requestSubmit();
  });

  document.addEventListener(
    "click",
    async (event) => {
      if (event.target.closest("#menuButton")) return openSide();
      if (event.target.closest("#sidebarClose,#scrim")) return closeSide();
      if (event.target.closest("#testWindowButton")) return closeSide();
      if (event.target.closest("#themeToggle")) {
        const list = ["light", "dark", "gold"];
        const current = document.documentElement.dataset.theme || "light";
        const next = list[(list.indexOf(current) + 1) % list.length];
        document.documentElement.dataset.theme = next;
        localStorage.setItem(STORAGE_KEYS.theme, next);
        if (themeLabel) themeLabel.textContent = THEME_NAMES[next];
        return;
      }
      if (event.target.closest("#wolfRowV093")) return wolf();
      if (event.target.closest("#serpentDeskRowV093")) return desk();
      if (event.target.closest("#modelButton")) return modelPicker();

      const modelPick = event.target.closest("[data-mpick]")?.dataset.mpick;
      if (modelPick) {
        if (modelPick === "manage") return wolf();
        if (modelPick === "add") {
          alert("添加模型占位：以后从 OpenRouter 模型列表里选常用模型。");
          return;
        }
        setModel(modelPick);
        const pickerPanel = $("#modelPickerV093");
        if (pickerPanel) pickerPanel.hidden = true;
        return;
      }

      if (event.target.closest(".avatar")) return ensureAvatarPicker().click();
      if (event.target.closest("#imageButton,#micButton")) return;

      const cleanAction = event.target.closest("[data-ca]")?.dataset.ca;
      if (cleanAction) {
        openAct(cleanAction);
        handleSetting(cleanAction);
        return;
      }

      if (event.target.closest("[data-panel-close]")) {
        closePanels();
        return;
      }

      if (event.target.closest(".clean-back") && event.target.closest("#cleanDetailV093")) {
        const back = $("#cleanDetailV093")?.dataset.back;
        back === "desk" ? desk() : wolf();
        return;
      }

      const userAction = event.target.closest("[data-user-act]");
      if (userAction) {
        const messageId = userAction.closest(".user-actions")?.dataset.userActionsFor;
        const message = items.find((item) => item.id === messageId);
        if (!message) return;
        if (userAction.dataset.userAct === "edit") {
          const next = prompt("编辑消息", message.content);
          if (next != null) message.content = next;
        } else {
          items = items.filter((item) => item.id !== messageId);
        }
        render();
        return;
      }

      const assistantAction = event.target.closest(".assistant-actions .action-button");
      if (assistantAction) {
        const message = items.find((item) => item.id === assistantAction.closest(".assistant-actions")?.dataset.actionsFor);
        const kind = assistantAction.dataset.action;
        if (!message) return;
        if (kind === "copy") {
          await navigator.clipboard?.writeText(message.content);
          return;
        }
        if (kind === "like" || kind === "favorite") {
          assistantAction.classList.toggle("is-active");
          return;
        }
        if (kind === "refresh") {
          localNotice("重新生成需要真实 API 接管，当前本地模拟已停用。");
          return;
        }
        if (kind === "delete") {
          items = items.filter((item) => item.id !== message.id);
          render();
        }
      }
    },
    true,
  );

  ensureServiceWorker();
}

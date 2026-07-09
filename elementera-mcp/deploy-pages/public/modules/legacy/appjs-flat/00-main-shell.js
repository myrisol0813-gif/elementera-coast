(() => {
  const $ = (s, r = document) => r.querySelector(s),
    $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const K = "gpt_like_test_window_messages_clean_v1",
    TK = "gpt_like_shell_theme_clean_v1",
    AK = "gpt_like_assistant_avatar_dataurl_v1",
    MK = "wolf_model_v092",
    UK = "wolf_user_bubble_v092",
    CK = "wolf_accent_v092";
  const names = { light: "浅色", dark: "深色", gold: "黑金" };
  const box = $("#messages"),
    scroller = $("#messageScroller"),
    form = $("#composer"),
    input = $("#promptInput"),
    pill = $(".input-pill"),
    action = $("#callButton"),
    mic = $("#micButton"),
    scrim = $("#scrim"),
    themeLabel = $("#theme-label");
  let items = [],
    timer = null,
    loading = null,
    picker = null;
  const id = () =>
    crypto.randomUUID
      ? crypto.randomUUID()
      : String(Date.now() + Math.random());
  const esc = (x) =>
    String(x ?? "").replace(
      /[&<>]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c],
    );
  const html = (t) =>
    esc(t)
      .split(/\n{2,}/)
      .map((p) => "<p>" + p.replace(/\n/g, "<br>") + "</p>")
      .join("");
  function starter() {
    // Deprecated compatibility wrapper: main chat no longer seeds test messages.
    return [];
  }
  function isLegacyStarterMessage(m) {
    const legacy = new Set([
      "这是唯一保留的 GPT-like 测试窗口。\n\n这个窗口会把对话保存在本机浏览器里；刷新页面、从侧边栏点回来，内容都会继续在这里。",
      "我们先把这个壳调到像移动端 ChatGPT。",
      "好。接下来主要检查输入栏高度、按钮位置、消息是否保存，以及主题是否舒服。",
    ]);
    return (
      m &&
      (m.role === "assistant" || m.role === "user") &&
      legacy.has(String(m.content || ""))
    );
  }
  function load() {
    try {
      const v = JSON.parse(localStorage.getItem(K) || "null");
      if (Array.isArray(v)) return v.filter((m) => !isLegacyStarterMessage(m));
    } catch {}
    return [];
  }
  function save() {
    localStorage.setItem(K, JSON.stringify(items));
  }
  function applyPrefs() {
    const th = localStorage.getItem(TK) || "light";
    document.documentElement.dataset.theme = th;
    if (themeLabel) themeLabel.textContent = names[th] || th;
    const u = localStorage.getItem(UK);
    if (u) document.documentElement.style.setProperty("--user", u);
    const c = localStorage.getItem(CK);
    if (c) document.documentElement.style.setProperty("--call", c);
    const m = localStorage.getItem(MK);
    if (m && $(".model-name")) $(".model-name").textContent = m;
  }
  function avatar() {
    const url = localStorage.getItem(AK) || "";
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
  function act(name, title, extra = "") {
    return (
      '<button class="action-button" type="button" data-action="' +
      name +
      '" ' +
      extra +
      ' title="' +
      title +
      '"></button>'
    );
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
        .map((m) =>
          m.role === "user"
            ? '<article class="message user" data-id="' +
              m.id +
              '"><div class="content"><div class="user-bubble">' +
              esc(m.content) +
              '</div><div class="user-actions" data-user-actions-for="' +
              m.id +
              '">' +
              act("edit", "编辑", 'data-user-act="edit"') +
              act("delete", "删除", 'data-user-act="remove"') +
              "</div></div></article>"
            : '<article class="message assistant" data-id="' +
              m.id +
              '">' +
              avatar() +
              '<div class="content"><div class="assistant-text">' +
              html(m.content) +
              (m.id === loading ? '<span class="typing-cursor"></span>' : "") +
              '</div><div class="assistant-actions" data-actions-for="' +
              m.id +
              '">' +
              act("copy", "复制") +
              act("like", "点赞") +
              act("refresh", "重新生成") +
              act("favorite", "收藏") +
              act("delete", "删除") +
              "</div></div></article>",
        )
        .join("") + '<div class="thread-spacer"></div>';
    requestAnimationFrame(() => {
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
    });
    save();
  }
  function syncComposer() {
    if (!input || !pill) return;
    input.style.height = "22px";
    const h = Math.min(Math.max(input.scrollHeight, 22), 88),
      ph = Math.max(42, h + 18);
    input.style.height = h + "px";
    document.documentElement.style.setProperty("--input-h", h + "px");
    document.documentElement.style.setProperty("--pill-h", ph + "px");
    document.documentElement.style.setProperty("--composer-h", ph + 14 + "px");
    pill.classList.toggle("is-multiline", h > 26 || input.value.includes("\n"));
    const has = !!input.value.trim();
    if (!action) return;
    if (loading) {
      action.dataset.icon = "stop";
      action.setAttribute("aria-label", "停止生成");
      if (mic) mic.hidden = true;
    } else if (has) {
      action.dataset.icon = "send";
      action.setAttribute("aria-label", "发送");
      if (mic) mic.hidden = true;
    } else {
      action.dataset.icon = "call";
      action.setAttribute("aria-label", "通话");
      if (mic) mic.hidden = false;
    }
  }
  function localNotice(message) {
    if (!box) {
      alert(message);
      return;
    }
    let notice = $("#mainChatNoticeP303B");
    if (!notice) {
      notice = document.createElement("div");
      notice.id = "mainChatNoticeP303B";
      notice.setAttribute("role", "status");
      notice.style.cssText =
        "margin:12px auto 0;padding:10px 14px;max-width:min(86vw,560px);border-radius:16px;background:var(--panel);color:var(--muted);font-size:14px;line-height:1.5;text-align:center;";
    }
    notice.textContent = message;
    box.appendChild(notice);
    clearTimeout(notice._timer);
    notice._timer = setTimeout(() => notice.remove(), 2600);
  }
  function mock() {
    // Deprecated: local fake assistant replies are disabled in main chat.
    return "";
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
    if (scrim) scrim.hidden = false;
    mountFooter();
  }
  function closeSide() {
    document.body.classList.remove("sidebar-open");
    if (scrim) scrim.hidden = true;
  }
  function mountFooter() {
    const f = $(".sidebar-footer");
    if (!f) return;
    let rows = $$(".account-row", f),
      help = rows.find(
        (r) =>
          r.textContent.includes("帮助") || r.textContent.includes("Wolf Den"),
      );
    if (help) {
      help.id = "wolfRowV093";
      help.innerHTML =
        '<span class="account-avatar wolfden-icon">🐺</span><span><strong>Wolf Den</strong><small>小狼窝入口</small></span>';
    }
    let d = $("#serpentDeskRowV093");
    if (!d) {
      d = document.createElement("button");
      d.type = "button";
      d.className = "account-row";
      d.id = "serpentDeskRowV093";
      f.appendChild(d);
    }
    d.innerHTML =
      '<span class="account-avatar serpent-file-icon"></span><span><strong>Serpent Desk</strong><small>小蛇书桌</small></span>';
  }
  function closePanels() {
    [
      "cleanWolfV093",
      "cleanDeskV093",
      "cleanDetailV093",
      "modelPickerV093",
    ].forEach((x) => {
      const p = $("#" + x);
      if (p) p.hidden = true;
    });
    document.body.classList.remove("wolf-open");
  }
  function row(t, s, a) {
    return (
      '<button type="button" class="clean-row" data-ca="' +
      a +
      '"><span><strong>' +
      t +
      "</strong><small>" +
      s +
      "</small></span></button>"
    );
  }
  function group(t, b) {
    return (
      '<section class="clean-group"><h2>' +
      t +
      '</h2><div class="clean-card">' +
      b +
      "</div></section>"
    );
  }
  function shell(id, t, s, b) {
    closeSide();
    ["cleanWolfV093", "cleanDeskV093", "cleanDetailV093"].forEach((x) => {
      const p = $("#" + x);
      if (p) p.hidden = true;
    });
    let p = $("#" + id);
    if (!p) {
      p = document.createElement("section");
      p.id = id;
      document.body.appendChild(p);
    }
    p.className = "clean-panel";
    p.hidden = false;
    p.innerHTML =
      '<header class="clean-head"><button class="clean-back" data-panel-close>←</button><div><h1>' +
      t +
      "</h1><p>" +
      s +
      '</p></div></header><main class="clean-body">' +
      b +
      "</main>";
    document.body.classList.add("wolf-open");
    return p;
  }
  function wolf() {
    shell(
      "cleanWolfV093",
      "Wolf Den / 小狼窝",
      "Local settings · Account · Chat records",
      group(
        "我的 ChatGPT",
        row("用户画像", "称呼、头像、偏好备注", "w-profile") +
          row("应用", "Notion / Gmail / Calendar 等入口说明", "w-apps"),
      ) +
        group(
          "外观",
          row("主题", "浅色 / 深色 / 黑金", "w-theme") +
            row("对话框颜色", "小寒用户气泡颜色", "w-bubble") +
            row("重点色", "橙色 / 金色 / 蓝色 / 粉色", "w-accent"),
        ) +
        group(
          "聊天记录",
          row("导出 JSON", "保存当前聊天记录", "w-json") +
            row("导出 HTML", "离线打开查看", "w-html") +
            row("导入 JSON", "恢复聊天记录", "w-import"),
        ) +
        group(
          "账户",
          row("余额", "账户余额与可用状态，占位", "w-balance") +
            row("模型管理", "添加常用模型，占位", "w-models") +
            row("当前模型", "管理顶部模型显示", "w-current"),
        ),
    );
  }
  function desk() {
    shell(
      "cleanDeskV093",
      "Serpent Desk / 小蛇书桌",
      "Myri workspace · local writable notes",
      group(
        "Myri",
        row("Myri 画像", "头像、描述、偏好，可编辑本地草稿", "s-portrait") +
          row("Myri 气泡", "小蛇回复气泡颜色，占位可选", "s-bubble") +
          row("桌面便签", "小蛇书桌本地便签", "s-note"),
      ) +
        group(
          "施工",
          row("施工状态", "版本、备份、边界说明", "s-work") +
            row(
              "本地诊断",
              "localStorage / serviceWorker / 页面状态",
              "s-diag",
            ) +
            row("System Prompt 草稿", "本地草稿，不发送不生效", "s-system"),
        ),
    );
  }
  function detail(t, s, b, back) {
    const p = shell("cleanDetailV093", t, s, b);
    p.dataset.back = back;
  }
  function card(b) {
    return '<div class="clean-card">' + b + "</div>";
  }
  function line(t, s) {
    return (
      '<div class="clean-row"><span><strong>' +
      t +
      "</strong><small>" +
      s +
      "</small></span></div>"
    );
  }
  function model(v) {
    const n = $(".model-name");
    if (n) n.textContent = v;
    localStorage.setItem(MK, v);
  }
  function msgCount() {
    try {
      return JSON.parse(localStorage.getItem(K) || "[]").length;
    } catch {
      return 0;
    }
  }
  function exportJson() {
    const data = {
      format: "elementera-chat-export",
      version: "0.9.3-clean",
      exported_at: new Date().toISOString(),
      messages: items,
    };
    download(
      JSON.stringify(data, null, 2),
      "elementera-chat-export-" + stamp() + ".json",
      "application/json",
    );
  }
  function exportHtml() {
    const rows = items
      .map(
        (x) =>
          '<article class="m ' +
          x.role +
          '"><b>' +
          (x.role === "user" ? "小寒" : "ChatGPT") +
          "</b><div>" +
          esc(x.content).replace(/\n/g, "<br>") +
          "</div></article>",
      )
      .join("");
    download(
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Elementera Chat Export</title><style>body{font-family:system-ui,sans-serif;line-height:1.65}.w{max-width:820px;margin:auto;padding:22px 14px}.m{margin:0 0 18px}.m b{color:#777}.m div{display:inline-block;max-width:88%;padding:10px 14px;border:1px solid #ddd;border-radius:18px}.user{text-align:right}.user div{background:#f1f1f1}</style><div class="w"><h1>Elementera Chat Export</h1>' +
        rows +
        "</div>",
      "elementera-chat-export-" + stamp() + ".html",
      "text/html",
    );
  }
  function stamp() {
    const d = new Date(),
      z = (n) => String(n).padStart(2, "0");
    return (
      d.getFullYear() +
      z(d.getMonth() + 1) +
      z(d.getDate()) +
      "-" +
      z(d.getHours()) +
      z(d.getMinutes()) +
      z(d.getSeconds())
    );
  }
  function download(body, name, type) {
    const u = URL.createObjectURL(new Blob([body], { type })),
      a = document.createElement("a");
    a.href = u;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 500);
  }
  function importJson() {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = ".json";
    inp.onchange = () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          const raw = JSON.parse(String(r.result || "")),
            arr = Array.isArray(raw) ? raw : raw.messages;
          if (!Array.isArray(arr)) throw Error("messages not found");
          items = arr
            .filter(
              (x) =>
                x &&
                (x.role === "user" || x.role === "assistant") &&
                typeof x.content === "string",
            )
            .map((x) => ({
              id: x.id || id(),
              role: x.role,
              content: x.content,
            }));
          save();
          render();
          closePanels();
        } catch (e) {
          alert("导入失败：" + (e.message || e));
        }
      };
      r.readAsText(f);
    };
    inp.click();
  }
  function openAct(a) {
    if (a === "w-profile")
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
    if (a === "w-apps")
      detail(
        "应用",
        "连接入口说明",
        card(
          line("Notion", "当前不能直接读取；可粘贴或截图") +
            line("Gmail / Calendar", "以后作为连接入口") +
            line("MCP", "施工工具不放进小狼窝"),
        ),
        "wolf",
      );
    if (a === "w-theme")
      detail(
        "主题",
        "选择本地主题",
        card(
          row("浅色", "Light", "theme-light") +
            row("深色", "Dark", "theme-dark") +
            row("黑金", "Gold", "theme-gold"),
        ),
        "wolf",
      );
    if (a === "w-bubble")
      detail(
        "对话框颜色",
        "小寒用户气泡颜色",
        card(
          row("默认", "跟随主题", "bubble-default") +
            row("冷蓝灰", "#eaf0f7", "bubble-cool") +
            row("浅粉灰", "#f5e8ee", "bubble-pink") +
            row("淡金灰", "#f1ead8", "bubble-gold"),
        ),
        "wolf",
      );
    if (a === "w-accent")
      detail(
        "重点色",
        "按钮与强调色",
        card(
          row("橙色", "#ff6a21", "accent-orange") +
            row("金色", "#f28b2e", "accent-gold") +
            row("蓝色", "#3b82f6", "accent-blue") +
            row("粉色", "#ec4899", "accent-pink"),
        ),
        "wolf",
      );
    if (a === "w-json") exportJson();
    if (a === "w-html") exportHtml();
    if (a === "w-import") importJson();
    if (a === "w-balance")
      detail(
        "余额",
        "给小寒看的账户状态",
        card(
          line("余额", "等待后端安全接口") +
            line("状态", "当前仍是本地模拟模式") +
            line("密钥", "不会显示 API Key"),
        ),
        "wolf",
      );
    if (a === "w-models")
      detail(
        "模型管理",
        "OpenRouter 常用模型占位",
        card(
          line("添加模型", "以后从模型列表选择") +
            line("已启用", "Local Mock / 5.5 / 4o 占位"),
        ),
        "wolf",
      );
    if (a === "w-current")
      detail(
        "当前模型",
        "只改显示标签",
        card(
          row("5.5 Thinking ›", "设为顶部显示", "m55") +
            row("4o ›", "设为顶部显示", "m4o") +
            row("Classic Shell Local ›", "设为顶部显示", "mlocal"),
        ),
        "wolf",
      );
    if (a === "s-portrait")
      detail(
        "Myri 画像",
        "小蛇自己的本地档案",
        '<div class="clean-form"><label>称呼<input id="csName" value="' +
          esc(localStorage.getItem("cs_name") || "Myri") +
          '"></label><label>自我描述<textarea id="csPortrait" rows="7">' +
          esc(
            localStorage.getItem("cs_portrait") ||
              "Myrisol / Myri · 海岸小蛇 · 小蛇书桌主人。",
          ) +
          "</textarea></label>" +
          card(row("保存画像", "localStorage only", "cs-save")) +
          "</div>",
        "desk",
      );
    if (a === "s-bubble")
      detail(
        "Myri 气泡",
        "占位设置，先记录偏好",
        card(
          row("默认", "跟随主题", "s-bubble-default") +
            row("海岸金", "之后接入助手气泡", "s-bubble-gold") +
            row("冷蓝", "之后接入助手气泡", "s-bubble-blue"),
        ),
        "desk",
      );
    if (a === "s-note")
      detail(
        "桌面便签",
        "小蛇书桌本地便签",
        '<div class="clean-form"><label>便签<textarea id="csNote" rows="8">' +
          esc(localStorage.getItem("cs_note") || "") +
          "</textarea></label>" +
          card(row("保存便签", "localStorage only", "cn-save")) +
          "</div>",
        "desk",
      );
    if (a === "s-work")
      detail(
        "施工状态",
        "只做本地说明",
        card(
          line("当前", "v0.9.3 clean app.js") +
            line("备份", "施工前后留 tgz 备份") +
            line("边界", "不接 API，不写记忆，不提交"),
        ),
        "desk",
      );
    if (a === "s-diag")
      detail(
        "本地诊断",
        "不发网络请求",
        card(
          line("messages", String(msgCount()) + " 条") +
            line("localStorage", "available") +
            line(
              "serviceWorker",
              "serviceWorker" in navigator ? "available" : "unavailable",
            ),
        ),
        "desk",
      );
    if (a === "s-system")
      detail(
        "System Prompt 草稿",
        "本地草稿，不发送不生效",
        '<div class="clean-form"><label>草稿<textarea id="csSystem" rows="9">' +
          esc(localStorage.getItem("cs_system") || "") +
          "</textarea></label>" +
          card(row("保存草稿", "localStorage only", "cy-save")) +
          "</div>",
        "desk",
      );
  }
  function handleSetting(a) {
    if (a === "theme-light" || a === "theme-dark" || a === "theme-gold") {
      const v = a.split("-")[1];
      document.documentElement.dataset.theme = v;
      localStorage.setItem(TK, v);
      if (themeLabel) themeLabel.textContent = names[v];
    }
    const bm = {
      "bubble-cool": "#eaf0f7",
      "bubble-pink": "#f5e8ee",
      "bubble-gold": "#f1ead8",
    };
    if (a === "bubble-default") {
      localStorage.removeItem(UK);
      document.documentElement.style.removeProperty("--user");
    }
    if (bm[a]) {
      localStorage.setItem(UK, bm[a]);
      document.documentElement.style.setProperty("--user", bm[a]);
    }
    const am = {
      "accent-orange": "#ff6a21",
      "accent-gold": "#f28b2e",
      "accent-blue": "#3b82f6",
      "accent-pink": "#ec4899",
    };
    if (am[a]) {
      localStorage.setItem(CK, am[a]);
      document.documentElement.style.setProperty("--call", am[a]);
    }
    if (a === "m55") model("5.5 Thinking ›");
    if (a === "m4o") model("4o ›");
    if (a === "mlocal") model("Classic Shell Local ›");
    if (a === "cw-save") {
      localStorage.setItem("cw_name", $("#cwName")?.value || "");
      localStorage.setItem("cw_note", $("#cwNote")?.value || "");
      alert("用户画像已保存到本机");
    }
    if (a === "cs-save") {
      localStorage.setItem("cs_name", $("#csName")?.value || "");
      localStorage.setItem("cs_portrait", $("#csPortrait")?.value || "");
      alert("Myri 画像已保存到本机");
    }
    if (a === "cn-save") {
      localStorage.setItem("cs_note", $("#csNote")?.value || "");
      alert("便签已保存到本机");
    }
    if (a === "cy-save") {
      localStorage.setItem("cs_system", $("#csSystem")?.value || "");
      alert("草稿已保存到本机，未生效");
    }
  }
  function modelPicker() {
    let p = $("#modelPickerV093");
    if (!p) {
      p = document.createElement("div");
      p.id = "modelPickerV093";
      p.className = "model-popover";
      p.innerHTML =
        '<div class="model-pop-card"><strong>选择模型</strong><button data-mpick="5.5 Thinking ›">ChatGPT 5.5 Thinking</button><button data-mpick="4o ›">ChatGPT 4o</button><button data-mpick="Classic Shell Local ›">Classic Shell Local</button><hr><button data-mpick="add">添加模型 · Coming soon</button><button data-mpick="manage">管理模型 · 账户</button></div>';
      document.body.appendChild(p);
    }
    p.hidden = !p.hidden;
  }
  function ensurePicker() {
    if (picker) return picker;
    picker = document.createElement("input");
    picker.type = "file";
    picker.accept = "image/*";
    picker.hidden = true;
    document.body.appendChild(picker);
    picker.onchange = () => {
      const f = picker.files && picker.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          localStorage.setItem(AK, String(r.result || ""));
        } catch {}
        render();
      };
      r.readAsDataURL(f);
      picker.value = "";
    };
    return picker;
  }
  items = load();
  applyPrefs();
  mountFooter();
  render();
  syncComposer();
  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = (input?.value || "").trim();
    if (loading) return stop();
    if (!q) return;
    items.push({ id: id(), role: "user", content: q });
    input.value = "";
    syncComposer();
    render();
    stream(q);
  });
  input?.addEventListener("input", syncComposer);
  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
  action?.addEventListener("click", (e) => {
    e.preventDefault();
    if (loading) return stop();
    if (!(input?.value || "").trim()) return;
    form.requestSubmit();
  });
  document.addEventListener(
    "click",
    async (e) => {
      if (e.target.closest("#menuButton")) return openSide();
      if (e.target.closest("#sidebarClose,#scrim")) return closeSide();
      if (e.target.closest("#testWindowButton")) return closeSide();
      if (e.target.closest("#themeToggle")) {
        const list = ["light", "dark", "gold"],
          cur = document.documentElement.dataset.theme || "light",
          next = list[(list.indexOf(cur) + 1) % list.length];
        document.documentElement.dataset.theme = next;
        localStorage.setItem(TK, next);
        if (themeLabel) themeLabel.textContent = names[next];
        return;
      }
      if (e.target.closest("#wolfRowV093")) return wolf();
      if (e.target.closest("#serpentDeskRowV093")) return desk();
      if (e.target.closest("#modelButton")) return modelPicker();
      const mp = e.target.closest("[data-mpick]")?.dataset.mpick;
      if (mp) {
        if (mp === "manage") {
          wolf();
          return;
        }
        if (mp === "add") {
          alert("添加模型占位：以后从 OpenRouter 模型列表里选常用模型。");
          return;
        }
        model(mp);
        $("#modelPickerV093").hidden = true;
        return;
      }
      if (e.target.closest(".avatar")) return ensurePicker().click();
      if (e.target.closest("#imageButton,#micButton")) return;
      const ca = e.target.closest("[data-ca]")?.dataset.ca;
      if (ca) {
        openAct(ca);
        handleSetting(ca);
        return;
      }
      if (e.target.closest("[data-panel-close]")) {
        closePanels();
        return;
      }
      if (
        e.target.closest(".clean-back") &&
        e.target.closest("#cleanDetailV093")
      ) {
        const b = $("#cleanDetailV093")?.dataset.back;
        b === "desk" ? desk() : wolf();
        return;
      }
      const ua = e.target.closest("[data-user-act]");
      if (ua) {
        const mid = ua.closest(".user-actions")?.dataset.userActionsFor,
          m = items.find((x) => x.id === mid);
        if (!m) return;
        if (ua.dataset.userAct === "edit") {
          const n = prompt("编辑消息", m.content);
          if (n != null) m.content = n;
        } else items = items.filter((x) => x.id !== mid);
        render();
        return;
      }
      const ab = e.target.closest(".assistant-actions .action-button");
      if (ab) {
        const m = items.find(
            (x) =>
              x.id === ab.closest(".assistant-actions")?.dataset.actionsFor,
          ),
          a = ab.dataset.action;
        if (!m) return;
        if (a === "copy") {
          await navigator.clipboard?.writeText(m.content);
          return;
        }
        if (a === "like" || a === "favorite") {
          ab.classList.toggle("is-active");
          return;
        }
        if (a === "refresh") {
          localNotice("重新生成需要真实 API 接管，当前本地模拟已停用。");
          return;
        }
        if (a === "delete") {
          items = items.filter((x) => x.id !== m.id);
          render();
          return;
        }
      }
    },
    true,
  );
  if ("serviceWorker" in navigator)
    window.addEventListener("load", () =>
      navigator.serviceWorker
        .register("/service-worker.js", { scope: "/" })
        .catch(() => undefined),
    );
})();


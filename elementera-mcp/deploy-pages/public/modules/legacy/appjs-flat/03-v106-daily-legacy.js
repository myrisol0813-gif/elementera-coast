// v106 P2-A silicon-carbon moments polish 2: cover upload, local likes/comments
(() => {
  if (window.__v106SiliconCarbonMoments) return;
  window.__v106SiliconCarbonMoments = true;
  const q = (s) => document.querySelector(s);
  const names = {
    moments: "硅碳圈",
    diary: "日记",
    album: "相册",
    widgets: "小组件",
    pet: "宠物系统",
  };
  const SC_XIAOHAN_AVATAR_KEY = "coast_avatar_xiaohan_v099";
  let scPosts = [],
    scAvatars = {
      xiaohan: localStorage.getItem(SC_XIAOHAN_AVATAR_KEY) || "",
      api: "",
      mcp: "",
    },
    scCoverData = "",
    scLikes = {},
    scComments = {},
    scCommentTarget = "",
    diaries = [],
    diaryDate = "",
    albumItems = [];
  const esc = (x) =>
    String(x ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  function hideSide() {
    document.body.classList.remove("sidebar-open");
    const s = q("#scrim");
    if (s) s.hidden = true;
  }
  function showSide() {
    document.body.classList.add("sidebar-open");
    const s = q("#scrim");
    if (s) s.hidden = false;
  }
  function closeOld() {
    [
      "#coastRoomPanelV095",
      "#coastRoomPanelV096",
      "#coastRoomPanelV097",
      "#coastChatRoomV096",
    ].forEach((sel) => {
      const el = q(sel);
      if (el) el.hidden = true;
    });
  }
  function panel(title, sub, body, state) {
    closeOld();
    let p = q("#freshDailyPanelV101");
    if (!p) {
      p = document.createElement("section");
      p.id = "freshDailyPanelV101";
      p.className = "coast-room-panel-v095 fresh-daily-panel-v101";
      document.body.appendChild(p);
    }
    p.hidden = false;
    p.dataset.state = state || "daily";
    hideSide();
    p.innerHTML =
      '<div class="coast-room-shell"><header class="coast-room-head"><button type="button" class="coast-room-back" data-fresh-daily-action="top-back">←</button><div><h1>' +
      esc(title) +
      "</h1><p>" +
      esc(sub) +
      '</p></div></header><main class="coast-room-body">' +
      body +
      "</main></div>";
    return p;
  }
  function openDaily() {
    panel(
      "海岸日报",
      "海岸日报",
      '<section class="coast-room-card"><h2>海岸日报</h2><p>这里会承接日报、动态、日记、相册和小组件。</p></section><h2 class="coast-entry-title-v097">入口</h2><div class="daily-entry-grid-v097"><button type="button" data-fresh-daily-room="moments">硅碳圈<small>暂未接入</small></button><button type="button" data-fresh-daily-room="diary">日记<small>暂未接入</small></button><button type="button" data-fresh-daily-room="album">相册<small>暂未接入</small></button><button type="button" data-fresh-daily-room="widgets">小组件<small>暂未接入</small></button><button type="button" data-fresh-daily-room="pet">宠物系统<small>暂未接入</small></button></div>',
      "daily",
    );
  }
  function openChild(kind) {
    const title = names[kind] || "海岸日报";
    panel(
      title,
      "暂未接入",
      '<section class="coast-room-card"><h2>' +
        esc(title) +
        '</h2><p>暂未接入。</p><p>这个入口会在正式接入后显示内容。</p><button type="button" data-fresh-daily-action="back-daily">返回海岸日报</button></section>',
      "child",
    );
  }
  function avatar(label = "寒", account = "xiaohan") {
    const src = scAvatars[account] || "";
    return (
      '<div class="sc-avatar sc-avatar-' +
      account +
      '" aria-label="avatar" ' +
      (src
        ? 'style="background-image:url(' +
          src +
          ') !important;background-size:cover !important;background-position:center !important;color:transparent !important"'
        : "") +
      ">" +
      esc(label) +
      "</div>"
    );
  }
  function commentsHtml(id, base) {
    const list = [...(base || []), ...(scComments[id] || [])];
    let box = list.length
      ? '<div class="sc-comments">' +
        list
          .map((c) => "<p><b>" + esc(c.who) + ":</b> " + esc(c.text) + "</p>")
          .join("") +
        "</div>"
      : "";
    if (scCommentTarget === id)
      box +=
        '<div class="sc-comment-editor"><input id="scCommentInput" placeholder="写评论"><button type="button" data-sc-send-comment="' +
        esc(id) +
        '">发送</button></div>';
    return box;
  }
  function post(
    id,
    author,
    meta,
    text,
    extra = "",
    baseComments = [],
    baseLikes = 0,
  ) {
    const liked = !!scLikes[id],
      count = baseLikes + (liked ? 1 : 0);
    const acct = author.startsWith("✦")
      ? "api"
      : author.startsWith("≋")
        ? "mcp"
        : "xiaohan";
    return (
      '<article class="sc-post sc-post-' +
      acct +
      '"><div class="sc-post-avatar">' +
      (acct === "api"
        ? avatar("✦", "api")
        : acct === "mcp"
          ? avatar("≋", "mcp")
          : avatar("寒", "xiaohan")) +
      '</div><div class="sc-post-main"><h3>' +
      esc(author) +
      "</h3><p>" +
      esc(text) +
      "</p>" +
      extra +
      '<div class="sc-post-actions"><span>' +
      esc(meta) +
      '</span><button type="button" class="' +
      (liked ? "is-liked" : "") +
      '" data-sc-like="' +
      esc(id) +
      '">♡ ' +
      count +
      '</button><button type="button" data-sc-comment="' +
      esc(id) +
      '">评论</button></div>' +
      commentsHtml(id, baseComments) +
      "</div></article>"
    );
  }
  function coverStyle() {
    return scCoverData
      ? ' style="background-image:linear-gradient(rgba(0,0,0,.12),rgba(0,0,0,.12)),url(' +
          scCoverData +
          ') !important;background-size:cover !important;background-position:center !important"'
      : "";
  }
  function openMoments() {
    const cover =
      '<button type="button" class="sc-cover sc-cover-static" data-fresh-daily-action="cover-upload"' +
      coverStyle() +
      '><span>上传封面</span><input id="scCoverInput" type="file" accept="image/*" hidden></button>';
    const profile =
      '<section class="sc-profile"><button type="button" class="sc-profile-avatar" data-fresh-daily-action="avatar-upload">' +
      avatar("寒", "xiaohan") +
      '<input id="scAvatarInput" type="file" accept="image/*" hidden></button><h2>小寒</h2><p>本地草稿原型，暂未同步服务器。</p></section>';
    const local = scPosts
      .map((x) =>
        post(
          x.id,
          "小寒",
          "本地草稿原型 · 暂未同步服务器",
          x.text || "（无正文）",
          x.image
            ? '<img class="sc-post-image" src="' +
                x.image +
                '" alt="硅碳圈配图">'
            : "",
          [],
          0,
        ),
      )
      .join("");
    const empty =
      '<section class="coast-room-card"><h2>暂无动态。</h2><p>这里是本地草稿原型，暂未同步服务器。刷新后可能消失。</p></section>';
    const posts = '<section class="sc-feed">' + (local || empty) + "</section>";
    panel(
      "硅碳圈",
      "本地草稿原型，暂未同步服务器",
      '<button type="button" class="sc-plus" data-fresh-daily-action="moments-compose">＋</button>' +
        cover +
        profile +
        posts,
      "moments",
    );
    const av = q("#scAvatarInput");
    if (av)
      av.onchange = () => {
        const f = av.files && av.files[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = () => {
          scAvatars.xiaohan = r.result;
          try {
            localStorage.setItem(SC_XIAOHAN_AVATAR_KEY, r.result);
          } catch (_) {}
          openMoments();
        };
        r.readAsDataURL(f);
      };
    const cv = q("#scCoverInput");
    if (cv)
      cv.onchange = () => {
        const f = cv.files && cv.files[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = () => {
          scCoverData = r.result;
          openMoments();
        };
        r.readAsDataURL(f);
      };
  }
  function refreshMomentsKeepScroll() {
    const body = q("#freshDailyPanelV101 .coast-room-body");
    const y = body ? body.scrollTop : 0;
    openMoments();
    requestAnimationFrame(() => {
      const b = q("#freshDailyPanelV101 .coast-room-body");
      if (b) b.scrollTop = y;
    });
  }
  function openCompose() {
    const body =
      '<section class="sc-compose"><p class="coast-room-card">本地草稿原型，暂未同步服务器。刷新后可能消失。</p><textarea id="scComposeText" placeholder="这一刻的想法..." rows="5"></textarea><div class="sc-compose-images"><label><input id="scComposeInput" type="file" accept="image/*" hidden><span class="sc-upload-box">＋</span></label><div class="sc-compose-preview" id="scComposePreview"></div></div><button type="button" class="sc-location" data-fresh-daily-action="location-placeholder"><b>所在位置</b><span>暂未接入</span></button><button type="button" class="sc-publish-note" data-fresh-daily-action="publish-placeholder">保存本地草稿预览</button></section>';
    panel("发表硅碳圈", "本地草稿原型，暂未同步服务器", body, "compose");
    const inp = q("#scComposeInput"),
      prev = q("#scComposePreview");
    if (inp && prev)
      inp.onchange = () => {
        const f = inp.files && inp.files[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = () => {
          prev.dataset.image = r.result;
          prev.innerHTML = '<img src="' + r.result + '" alt="preview">';
        };
        r.readAsDataURL(f);
      };
  }

  const dailyModules = globalThis.ElementeraDailyModules || {};
  function getDiaryModule() {
    try {
      return (globalThis.ElementeraDailyModules || {}).diary || {};
    } catch (_) {}
    return {};
  }
  function diaryModuleKeysForDebug() {
    try {
      const modules = globalThis.ElementeraDailyModules || {};
      const keys = Object.keys(modules);
      return keys.length ? keys.join(",") : "NO_MODULE_KEYS";
    } catch (error) {
      return "MODULE_KEYS_ERROR:" + (error && (error.message || String(error)));
    }
  }
  const DIARY_MODULE_SRC = "/public/modules/daily/diary.js?v=p3-struct-12r6";
  let diaryModuleLoadPromise = null;
  function diaryScriptsForDebug() {
    try {
      const scripts = Array.from(document.scripts || [])
        .map((script) => script.getAttribute("src") || "")
        .filter((src) => src.includes("diary.js"));
      return scripts.length ? scripts.join(" | ") : "NO_DIARY_SCRIPT_TAG";
    } catch (error) {
      return "SCRIPT_SCAN_ERROR:" + (error && (error.message || String(error)));
    }
  }
  function loadDiaryModule() {
    const current = getDiaryModule();
    if (current && Object.keys(current).length) return Promise.resolve(current);
    if (diaryModuleLoadPromise) return diaryModuleLoadPromise;
    diaryModuleLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = DIARY_MODULE_SRC;
      script.async = false;
      script.onload = () => {
        const loaded = getDiaryModule();
        if (loaded && Object.keys(loaded).length) resolve(loaded);
        else reject(new Error("DIARY_SCRIPT_LOADED_BUT_MODULE_MISSING"));
      };
      script.onerror = () => reject(new Error("DIARY_SCRIPT_LOAD_ERROR:" + script.src));
      document.head.appendChild(script);
    });
    return diaryModuleLoadPromise;
  }
  function diaryDiagnosticHtml(title, reason) {
    return '<section class="diary-empty"><h2>' +
      esc(title) +
      '</h2><p>[P3-STRUCT-12R6] ' +
      esc(reason || "UNKNOWN") +
      '</p><p>module keys: ' +
      esc(diaryModuleKeysForDebug()) +
      '</p><p>diary scripts: ' +
      esc(diaryScriptsForDebug()) +
      '</p></section>';
  }
  function diaryEnv() {
    return {
      panel,
      q: (selector) => q(selector),
      avatar,
      getDiaries: () => diaries,
      setDiaries: (next) => {
        diaries = Array.isArray(next) ? next : diaries;
      },
      getDiaryDate: () => diaryDate,
      setDiaryDate: (date) => {
        diaryDate = date;
      },
      openDiary,
      FileReader: globalThis.FileReader,
    };
  }
  function diaryDoor(action, fallbackTitle, fallbackPanel) {
    const diaryModule = getDiaryModule();
    if (!diaryModule || !Object.keys(diaryModule).length) return "DIARY_MODULE_MISSING";
    if (typeof diaryModule[action] !== "function") return action + " missing";
    try {
      const ok = diaryModule[action](diaryEnv());
      if (ok) return "";
      return action + " returned false";
    } catch (error) {
      console.warn("[P3-STRUCT-12R6] diary action failed", action, error);
      return action + " threw: " + (error && (error.message || String(error)));
    }
  }
  function openDiary() {
    const reason = diaryDoor("openDiary", "日记", "diary");
    if (!reason) return;
    if (reason === "DIARY_MODULE_MISSING") {
      panel("日记", "本地草稿原型，暂未同步服务器", diaryDiagnosticHtml("日记模块加载中", reason), "diary");
      loadDiaryModule().then(() => openDiary()).catch((error) => {
        panel("日记", "本地草稿原型，暂未同步服务器", diaryDiagnosticHtml("日记暂不可用", error.message || String(error)), "diary");
      });
      return;
    }
    panel("日记", "本地草稿原型，暂未同步服务器", diaryDiagnosticHtml("日记暂不可用", reason), "diary");
  }
  function openDiaryCompose() {
    const reason = diaryDoor("openDiaryCompose", "写日记", "diary-compose");
    if (!reason) return;
    if (reason === "DIARY_MODULE_MISSING") {
      panel("写日记", "本地草稿原型，暂未同步服务器", diaryDiagnosticHtml("日记模块加载中", reason), "diary-compose");
      loadDiaryModule().then(() => openDiaryCompose()).catch((error) => {
        panel("写日记", "本地草稿原型，暂未同步服务器", diaryDiagnosticHtml("写日记暂不可用", error.message || String(error)), "diary-compose");
      });
      return;
    }
    panel("写日记", "本地草稿原型，暂未同步服务器", diaryDiagnosticHtml("写日记暂不可用", reason), "diary-compose");
  }
  function finishDiary() {
    const reason = diaryDoor("finishDiary", "日记", "diary");
    if (reason) console.warn("[P3-STRUCT-12R6] diary finish fallback", reason);
    if (reason === "DIARY_MODULE_MISSING") {
      loadDiaryModule().then(() => finishDiary()).catch(() => openDiary());
      return;
    }
    if (reason) openDiary();
  }
  const albumModule = dailyModules.album || {};
  function albumModuleCopy(key, fallback) {
    try {
      const copy = albumModule.ALBUM_COPY;
      const value = copy && copy[key];
      if (typeof value === "string" && value) return value;
    } catch (_) {}
    return fallback;
  }
  function albumDownloadLabel(cat) {
    if (typeof albumModule.albumLabel === "function") {
      try {
        return albumModule.albumLabel(cat);
      } catch (_) {}
    }
    return cat === "myri" ? "Myri" : cat === "together" ? "蛇蛇狗合照" : "小寒";
  }
  function albumEnv() {
    return {
      panel,
      q: (selector) => q(selector),
      getAlbumItems: () => albumItems,
      addAlbumItem: (item) => albumItems.unshift(item),
      openAlbum,
      FileReader: globalThis.FileReader,
    };
  }
  function emergencyAlbumCategories() {
    try {
      const categories = albumModule.ALBUM_CATEGORIES;
      if (categories && typeof categories === "object") {
        const keys = Object.keys(categories).filter((key) => typeof categories[key] === "string");
        if (keys.length) return keys;
      }
    } catch (_) {}
    return ["xiaohan", "myri", "together"];
  }
  function emergencyAlbumLabel(cat) {
    return albumDownloadLabel(cat);
  }
  function emergencyAlbumBorderColor(index) {
    if (typeof albumModule.albumBorderColor === "function") {
      try {
        return albumModule.albumBorderColor(index);
      } catch (_) {}
    }
    const colors = ["#d9a441", "#8fb0bd", "#d78fb1", "#88b86a", "#b49bdf", "#ef9c74", "#7fb9a8", "#d0c269"];
    return colors[index % colors.length];
  }
  function emergencyAlbumCard(item, index) {
    return '<figure class="album-card" style="--album-border:' +
      emergencyAlbumBorderColor(index) +
      '"><img src="' +
      item.image +
      '" alt="海岸涂鸦"><figcaption><span>' +
      esc(emergencyAlbumLabel(item.cat)) +
      '</span><button type="button" data-album-download="' +
      esc(item.id) +
      '">下载</button></figcaption></figure>';
  }
  function emergencyAlbumSection(cat) {
    const list = albumItems.filter((item) => item.cat === cat);
    return '<section class="album-section"><h2>' +
      esc(emergencyAlbumLabel(cat)) +
      '</h2><div class="album-grid">' +
      (list.length
        ? list.map(emergencyAlbumCard).join("")
        : '<div class="album-empty">' +
          esc(albumModuleCopy("emptyText", "暂无图片。这里是本地草稿原型，暂未同步服务器。")) +
          "</div>") +
      "</div></section>";
  }
  function emergencyAlbumHome() {
    return '<button type="button" class="album-plus" data-fresh-daily-action="album-compose">＋</button><p class="coast-room-card">' +
      albumModuleCopy("composeNotice", "本地草稿原型，暂未同步服务器。刷新后可能消失。") +
      '</p><section class="album-wall">' +
      emergencyAlbumCategories().map(emergencyAlbumSection).join("") +
      "</section>";
  }
  function emergencyAlbumCompose() {
    return '<section class="album-compose"><p class="coast-room-card">' +
      albumModuleCopy("composeNotice", "本地草稿原型，暂未同步服务器。刷新后可能消失。") +
      '</p><label class="album-upload"><input id="albumImageInput" type="file" accept="image/*" hidden><span>＋</span><b>选择一张图片</b></label><div class="album-preview" id="albumPreview"></div><label class="album-select-label">归类<select id="albumCategory"><option value="xiaohan">小寒</option><option value="myri">Myri</option><option value="together">蛇蛇狗合照</option></select></label><button type="button" class="album-finish" data-fresh-daily-action="album-finish">' +
      albumModuleCopy("composeButton", "保存本地相册预览") +
      "</button></section>";
  }
  function bindEmergencyAlbumPreview() {
    const inp = q("#albumImageInput"),
      prev = q("#albumPreview");
    if (inp && prev)
      inp.onchange = () => {
        const f = inp.files && inp.files[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = () => {
          prev.dataset.image = r.result;
          prev.innerHTML = '<img src="' + r.result + '" alt="album preview">';
        };
        r.readAsDataURL(f);
      };
  }
  function openAlbum() {
    if (typeof albumModule.openAlbum === "function") {
      try {
        if (albumModule.openAlbum(albumEnv())) return;
      } catch (_) {}
    }
    panel(albumModuleCopy("title", "相册"), albumModuleCopy("subtitle", "本地草稿原型，暂未同步服务器"), emergencyAlbumHome(), "album");
  }
  function openAlbumCompose() {
    if (typeof albumModule.openAlbumCompose === "function") {
      try {
        if (albumModule.openAlbumCompose(albumEnv())) return;
      } catch (_) {}
    }
    panel(albumModuleCopy("composeTitle", "上传相册"), albumModuleCopy("subtitle", "本地草稿原型，暂未同步服务器"), emergencyAlbumCompose(), "album-compose");
    bindEmergencyAlbumPreview();
  }
  function finishAlbum() {
    if (typeof albumModule.finishAlbum === "function") {
      try {
        if (albumModule.finishAlbum(albumEnv())) return;
      } catch (_) {}
    }
    const image = q("#albumPreview")?.dataset.image || "";
    if (image) {
      albumItems.unshift({
        id: "album-" + Date.now(),
        image,
        cat: q("#albumCategory")?.value || "xiaohan",
      });
    }
    openAlbum();
  }
  function downloadAlbum(id) {
    const item = albumItems.find((x) => x.id === id);
    if (!item || !item.image) return;
    const a = document.createElement("a");
    const ext = (item.image.match(/^data:image\/([^;]+)/) || [])[1] || "png";
    a.href = item.image;
    a.download =
      "coast-doodle-" +
      albumDownloadLabel(item.cat) +
      "-" +
      id +
      "." +
      ext.replace("jpeg", "jpg");
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function closeFresh() {
    const p = q("#freshDailyPanelV101");
    if (p) p.hidden = true;
    showSide();
  }
  function targetOf(e) {
    const t = e.target;
    if (!t || !t.closest) return null;
    return t.closest(
      '[data-room="daily"],[data-room-v095="daily"],[data-fresh-daily-room],[data-fresh-daily-action],[data-sc-like],[data-sc-comment],[data-sc-send-comment],[data-diary-date],[data-album-download]',
    );
  }
  function press(el, on) {
    if (!el) return;
    el.classList.toggle("is-pressing", !!on);
  }
  function handle(e) {
    if (e.target && e.target.matches && e.target.matches('input[type="file"]'))
      return;
    const hit = targetOf(e);
    if (!hit) return;
    if (e.type === "pointerdown" || e.type === "touchstart") {
      press(hit, true);
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      return;
    }
    if (
      e.type === "pointerup" ||
      e.type === "touchend" ||
      e.type === "pointercancel" ||
      e.type === "touchcancel"
    ) {
      press(hit, false);
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      return;
    }
    if (e.type !== "click") return;
    press(hit, false);
    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    const open = hit.closest('[data-room="daily"],[data-room-v095="daily"]');
    const room = hit.closest("[data-fresh-daily-room]");
    const action = hit.dataset.freshDailyAction;
    const like = hit.dataset.scLike,
      comment = hit.dataset.scComment,
      send = hit.dataset.scSendComment,
      dd = hit.dataset.diaryDate,
      albumDl = hit.dataset.albumDownload;
    if (open) {
      openDaily();
      return;
    }
    if (room) {
      const r = room.dataset.freshDailyRoom;
      if (r === "moments") openMoments();
      else if (r === "diary") openDiary();
      else if (r === "album") openAlbum();
      else openChild(r);
      return;
    }
    if (dd) {
      diaryDate = dd;
      openDiary();
      return;
    }
    if (albumDl) {
      downloadAlbum(albumDl);
      return;
    }
    if (like) {
      scLikes[like] = !scLikes[like];
      refreshMomentsKeepScroll();
      return;
    }
    if (comment) {
      scCommentTarget = scCommentTarget === comment ? "" : comment;
      refreshMomentsKeepScroll();
      return;
    }
    if (send) {
      const val = (q("#scCommentInput")?.value || "").trim();
      if (val) {
        (scComments[send] || (scComments[send] = [])).push({
          who: "小寒",
          text: val,
        });
      }
      scCommentTarget = "";
      refreshMomentsKeepScroll();
      return;
    }
    if (action === "back-daily") {
      openDaily();
      return;
    }
    if (action === "moments-compose") {
      openCompose();
      return;
    }
    if (action === "avatar-upload") {
      let inp = q("#scAvatarInput");
      if (!inp) {
        inp = document.createElement("input");
        inp.type = "file";
        inp.accept = "image/*";
        inp.hidden = true;
        inp.id = "scAvatarInput";
        (q("#freshDailyPanelV101") || document.body).appendChild(inp);
      }
      inp.onchange = () => {
        const f = inp.files && inp.files[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = () => {
          scAvatars.xiaohan = r.result;
          try {
            localStorage.setItem(SC_XIAOHAN_AVATAR_KEY, r.result);
          } catch (_) {}
          const p = q("#freshDailyPanelV101");
          if (p?.dataset.state === "diary") openDiary();
          else openMoments();
        };
        r.readAsDataURL(f);
      };
      inp.click();
      return;
    }
    if (action === "cover-upload") {
      const inp = q("#scCoverInput");
      if (inp) inp.click();
      return;
    }
    if (action === "publish-placeholder") {
      const text = (q("#scComposeText")?.value || "").trim();
      const image = q("#scComposePreview")?.dataset.image || "";
      if (!text && !image) {
        openMoments();
        return;
      }
      scPosts.unshift({
        id: "local-" + Date.now(),
        text,
        image,
        location: "",
      });
      openMoments();
      return;
    }
    if (action === "diary-compose") {
      openDiaryCompose();
      return;
    }
    if (action === "diary-finish") {
      finishDiary();
      return;
    }
    if (action === "album-compose") {
      openAlbumCompose();
      return;
    }
    if (action === "album-finish") {
      finishAlbum();
      return;
    }
    if (action === "location-placeholder") {
      return;
    }
    if (action === "top-back") {
      const p = q("#freshDailyPanelV101");
      if (p?.dataset.state === "compose") openMoments();
      else if (p?.dataset.state === "diary-compose") openDiary();
      else if (p?.dataset.state === "album-compose") openAlbum();
      else if (
        p?.dataset.state === "moments" ||
        p?.dataset.state === "child" ||
        p?.dataset.state === "diary" ||
        p?.dataset.state === "album"
      )
        openDaily();
      else closeFresh();
      return;
    }
  }
  [
    "pointerdown",
    "pointerup",
    "pointercancel",
    "touchstart",
    "touchend",
    "touchcancel",
    "click",
  ].forEach((ev) => document.addEventListener(ev, handle, true));
})();


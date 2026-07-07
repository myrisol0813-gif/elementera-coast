# P3-STRUCT-00｜原壳结构地图与模块边界记录

记录时间：2026-07-08
基准：`main`，`app.js` 约 2900 行，最近结构提交为 `cfc223e refactor: restore v106 interaction ui shell`。

本文件只记录结构边界，不改变功能、不删除功能、不触碰正文与 key。P3 大清洗第一轮已经结束；后续目标是把原壳从“补丁层叠加”逐步收束成有边界的结构。

## 总览

当前前端入口为 `elementera-mcp/deploy-pages/app.html`，加载顺序是：`/public/app.js`、`/public/run-control-p301c.js`、`/public/api-sandbox-p302c.js?v=p302d2`、`/public/model-box-p303a.js?v=p303a-fix1`。`app.js` 是原壳主体，外接脚本承接运行控制、API sandbox、模型箱等功能。

`app.js` 目前不是单一模块，而是一串 IIFE 层：主聊天原壳、v094 修补层、v106 海岸日报接管层、v095/v096/v097 房间层、v098 侧栏排序层、v119 予爱机书/登岛信层，以及若干事件接管和 mutation polish。短期目标不是继续删除，而是先把边界写清楚。

## 1. 主聊天 main chat 与 v093 本地设置壳

大致范围：`app.js` 1–856 行。

职责：
- 主聊天消息渲染、输入框状态、侧栏开关、主题切换、模型按钮显示、头像、本地聊天导入导出。
- Wolf Den / Serpent Desk 本地设置面板。
- 主聊天本地假回复已经停用，`stream()` 只提示需要模型箱接管。

主要入口函数：
- `starter()`：旧 starter 兼容壳，当前返回空数组。
- `load()` / `save()`：读写主聊天消息。
- `render()`：渲染主聊天消息。
- `syncComposer()`：同步输入栏高度与按钮状态。
- `stream()` / `stop()`：当前主聊天发送控制；真实模型发送由外接脚本接管。
- `openSide()` / `closeSide()` / `mountFooter()`：侧栏与底部入口。
- `wolf()` / `desk()` / `detail()` / `openAct()` / `handleSetting()`：Wolf Den、Serpent Desk 与本地设置。
- `modelPicker()`：顶部模型选择浮层。

localStorage key：
- `gpt_like_test_window_messages_clean_v1`：主聊天当前消息数组。
- `gpt_like_shell_theme_clean_v1`：主题。
- `gpt_like_assistant_avatar_dataurl_v1`：主聊天头像。
- `wolf_model_v092`：顶部模型显示标签。
- `wolf_user_bubble_v092`：用户气泡颜色。
- `wolf_accent_v092`：强调色。
- 另有本地设置草稿：`cw_name`、`cw_note`、`cs_name`、`cs_portrait`、`cs_note`、`cs_system` 等。

事件接管方式：
- 一个主 `document.addEventListener('click', ..., true)` 捕获阶段事件处理器，统一处理菜单、主题、模型浮层、Wolf/Desk、消息操作、导入导出等。
- `form` / 输入框相关监听在同一主壳内。

边界判断：
- 可先模块化：纯工具函数、Wolf/Desk 设置面板、modelPicker 展示层、导入导出工具。
- 暂不宜先动：`K` 消息存储、`render()`、`stream()`、`form` 提交链路，因为它们与外接 API/模型箱接管相关，容易误伤主聊天真实链路。

## 2. v094 修补层

大致范围：约 860–974 行，以及后续局部 v094 注释区。

职责：
- 处理三级页面返回父面板。
- 修正 Wolf Apps 文案回退识别。
- `__v094SafeTextSetter` 防止 text replacement 引起重复 mutation 循环。

主要入口/标记：
- `window.__v094BackPatch`
- `window.__v094WolfAppsBackFix`
- `window.__v094SafeTextSetter`
- `showParent()` / `infer()` / `hideDetails()`

localStorage key：
- 无新增业务 key。

事件接管方式：
- `window.addEventListener('click', ..., true)` 捕获返回按钮。
- `MutationObserver` 与 click 后延时修正文字。
- `Node.prototype.textContent` setter 包装。

边界判断：
- 暂时不动。它属于“修补历史兼容”的底座，先在文档里标记，后续等面板体系收束后再决定是否删除或折叠。

## 3. v106 海岸日报 / 硅碳圈 / 日记 / 相册

大致范围：约 976–1710 行。

职责：
- 当前实际接管 `daily / 海岸日报` 的主体层。
- 渲染 `#freshDailyPanelV101`。
- 保留海岸日报大厅、硅碳圈、日记、相册、小组件、宠物系统入口。
- 硅碳圈、日记、相册目前是“本地草稿原型，暂未同步服务器”；不再默认生成假动态、假评论或默认点赞。

主要入口函数：
- `openDaily()`：海岸日报大厅。
- `openChild(kind)`：小组件/宠物等普通子入口空状态。
- `openMoments()`：硅碳圈封面、头像、feed、本地草稿动态。
- `openCompose()`：硅碳圈发帖表单。
- `commentsHtml()` / `post()`：评论与朋友圈卡片结构。
- `openDiary()` / `openDiaryCompose()` / `finishDiary()`：日记展示、编辑、运行时保存。
- `openAlbum()` / `openAlbumCompose()` / `finishAlbum()` / `downloadAlbum()`：相册墙、上传、运行时保存与下载。
- `handle(e)`：v106 总事件接管。

localStorage key：
- `coast_avatar_xiaohan_v099`：小寒头像上传；这是旧逻辑，允许保留。
- `scPosts`、`scLikes`、`scComments`、`diaries`、`albumItems` 当前为运行时内存变量，不新增持久 key。

事件接管方式：
- `document.addEventListener(ev, handle, true)` 对 `pointerdown`、`touchstart`、`touchend`、`touchcancel`、`click` 做捕获阶段接管。
- 使用 `preventDefault()`、`stopPropagation()`、`stopImmediatePropagation()` 覆盖 v095/v096/v097 的 daily 空状态。
- 目标选择器包括 `[data-room="daily"]`、`[data-room-v095="daily"]`、`[data-fresh-daily-room]`、`[data-fresh-daily-action]`、`[data-sc-like]`、`[data-sc-comment]`、`[data-sc-send-comment]`、`[data-diary-date]`、`[data-album-download]`。

边界判断：
- 最适合先模块化的区域之一。
- 建议第一批抽出：`daily-panel` shell、`moments`、`diary`、`album`、`v106 event router`。
- 模块化时必须保留 `handle(e)` 的捕获接管顺序，避免 daily 点击又落回 v095/v096/v097。
- 不要把本地草稿误写成真实服务器数据；不要新增持久 key，除非单独设计存储迁移。

## 4. v095/v096 radio / letters / memory / daily rooms

### v095 sidebar rooms base

大致范围：约 1687–1917 行。

职责：
- 在侧栏插入同轨状态卡和主房间入口。
- 提供早期 radio、letters、memory、daily 面板。
- radio/letters 可保存本地草稿或本地窗口数据；memory/daily 已被清理成正式空状态。

主要入口函数：
- `mountRooms()`：插入 `#coastStatusV095` 和 `#coastRoomsV095`。
- `radio()` / `letters()` / `memory()` / `daily()` / `dailyRoom(kind)` / `openRoom(kind)`。

localStorage key：
- `coast_radio_rooms_v095`
- `coast_lighthouse_draft_v095`
- `coast_daily_status_v095`（当前基本保留，v106 接管后不作为实际 daily 主入口）

事件接管方式：
- DOMContentLoaded / menu click 后挂载。
- 对 `[data-room]` 按钮设置 `onclick`。

### v096 room windows tune

大致范围：约 1918–2280 行。

职责：
- 为 radio/letters 增加窗口列表。
- 覆盖主房间点击，使 radio/letters 打开更像 chat-like local rooms。
- 提供 v096 的 memory/daily 空状态。

主要入口函数：
- `rdata()` / `ldata()` / `ensureWindowList()` / `wireMainRooms()`。
- `openChat(kind,id)` / `newRoom(kind)` / `simplePanel()`。
- `memV096()` / `dailyV096()` / `dailyRoomV096()` / `openV096(kind)`。

localStorage key：
- `coast_radio_rooms_v095`（沿用 v095）
- `coast_lighthouse_rooms_v096`

事件接管方式：
- 给 `#coastRoomsV095 [data-room]` 覆盖 `onclick`。
- 给 `[data-v096-kind]` 房间窗口按钮设置 `onclick`。
- DOMContentLoaded / menu click / setTimeout 挂载。

边界判断：
- 可先文档化，不急着模块化。
- radio/letters 有本地草稿行为，可在后续作为 `rooms/radioLetters` 模块抽出。
- daily/memory 在 v095/v096/v097 中已被 v106 和清理空状态覆盖，不宜继续扩写；后续可以作为兼容 fallback 保留。

## 5. v097 main chat windows 与 refined memory/daily

大致范围：约 2282–2541 行。

职责：
- 侧栏 polish：同轨状态文案、主聊天窗口列表。
- 多主聊天窗口本地存储与切换。
- refined memory/daily 空状态。

主要入口函数：
- `mainList()` / `saveActive()` / `openMain(id)` / `newMain()`。
- `mountMainWindows()`。
- `openLite()` / `memoryV097()` / `dailyV097()` / `dailyRoomV097()`。
- `wireV097()`。

localStorage key：
- `gpt_like_test_window_messages_clean_v1`：当前窗口消息。
- `coast_main_windows_v097`：主聊天窗口数组。
- `coast_main_active_v097`：当前主聊天窗口 id。

事件接管方式：
- 新聊天按钮使用捕获阶段监听并 `stopImmediatePropagation()`。
- 房间按钮使用捕获阶段监听；memory/daily 会被 v097 处理，但 daily 目前被 v106 更强捕获接管覆盖。
- `setInterval(wireV097, 1000)`、DOMContentLoaded、setTimeout。

边界判断：
- 暂时不能先动主聊天窗口存储和切换逻辑，它直接读写主聊天消息 key，并会 reload 页面。
- 可先抽出只读工具：状态 polish、sidebar order。但不要改 `coast_main_windows_v097` 和 `coast_main_active_v097` 的语义。

## 6. v098 sidebar order / legacy saved polish

大致范围：约 2543–2632 行。

职责：
- 调整侧栏顺序：主房间、主聊天窗口、房间窗口。
- 隐藏旧“已保存/测试窗口”区域。
- 对侧栏顺序做定时 polish。

主要入口/标记：
- `window.__v098FinalOrder`
- `window.__v098FinalSidebarPolish`
- `window.__v098HideSaved`
- `order()` / `hideLegacySaved()` / `orderMainWindows()` / `polish()`

localStorage key：
- 无业务 key。

事件接管方式：
- DOMContentLoaded、click 后延时、setInterval。

边界判断：
- 可晚一点和侧栏模块合并；短期不要删除，因为它维持当前侧栏视觉顺序。

## 7. v119 予爱机书 / 登岛信

大致范围：约 2634–文件尾。

职责：
- 予爱机书 / 登岛信入口、状态、正文草稿、按窗口与模型区分的本地存储。
- 将 v118 登岛信 key 迁移/读取到 v119 lovebook 体系。

主要入口函数：
- `modelName()` / `windowId()` / `base()` / `oldIslandKey()` / `k(name)`。
- `defaultIsland()` / `islandText()` / `defaultCore()` 等默认正文生成函数。
- 后续渲染、编辑、复制/使用等 lovebook UI 函数。

localStorage key：
- `coast_lovebook_v119::${windowId}::${modelName}::...`
- `coast_island_letter_v118::${windowId}::${modelName}`
- 依赖 `coast_main_active_v097` 识别当前窗口。

事件接管方式：
- v119 自身 IIFE 挂载入口、面板与交互。
- 与模型名、主聊天窗口 id 绑定。

边界判断：
- 红色/黄红边界。UI 壳可整理；核心正文 `defaultIsland()`、`defaultCore()` 等不可删除或替换，除非小寒单独批准。
- 不建议作为第一批模块化对象。若要动，先只抽 UI wrapper，不碰正文字符串与 key。

## 8. model box / API 接管相关外接脚本接口

入口文件：`app.html`。

加载顺序：
- `/public/app.js`
- `/public/run-control-p301c.js`
- `/public/api-sandbox-p302c.js?v=p302d2`
- `/public/model-box-p303a.js?v=p303a-fix1`

### run-control-p301c.js

职责：
- 运行控制层：模型预设、上下文模式、最近轮数、上下文预算、输出长度、创造性、记忆召回预留、小纸条预算等。
- 向全局暴露 `window.elementeraRunControl = { getSettings, setSettings, defaultRunControlSettings, storageKey }`。

localStorage key：
- `elementera.runControlSettings`
- 临时上下文 key：`elementera.api.tempContext`、`elementera.api.currentScratchpad`、`elementera.api.recentContextDraft`

边界判断：
- 可作为独立模块保留，不要塞回 `app.js`。
- 它是 API 接管层的配置源，P3-STRUCT 初期不改行为。

### api-sandbox-p302c.js / model-box-p303a.js

职责：
- 当前主聊天真实 API 接管与模型箱相关逻辑在外接脚本中。
- P3-STRUCT-00 只记录加载边界；后续需要单独做 `P3-STRUCT-API-MAP` 时再读这两个文件细分。

边界判断：
- 暂时不能动主聊天真实 API 链路。
- 可以先只为它们建立接口文档，不做重构。

## 模块化优先级建议

### 第一批适合模块化

1. `v106` 海岸日报主体
   - 拆为 `dailyShell`、`moments`、`diary`、`album`、`dailyRouter`。
   - 原因：边界较清晰，已经完成假内容清理与 UI 壳恢复。
   - 风险点：必须保留捕获阶段事件接管。

2. `v095/v096` radio/letters rooms
   - 拆为 `roomsStorage`、`radioLettersPanel`、`roomWindowList`。
   - 原因：本地草稿结构清晰，和主聊天 API 无直接关系。
   - 风险点：与 v097/v098 侧栏排序有关，拆时要保留 DOM id。

3. `v098` sidebar order polish
   - 拆为 `sidebarOrder`。
   - 原因：无存储 key，职责单一。
   - 风险点：当前靠 setInterval 维持顺序，抽出时不要改变时序。

### 第二批谨慎模块化

1. v093 Wolf/Serpent 本地设置壳
   - 可拆 UI，但它和主壳同一 IIFE、共享 `$`/`items`/`localStorage` helper。

2. v097 main chat windows
   - 可先抽纯 UI 渲染，但不要改存储 key 和 reload 切换行为。

### 暂时不能动或单独立项

1. 主聊天 `render()` / `stream()` / composer 提交链路
   - 牵涉真实 API 与模型箱接管。

2. v119 予爱机书 / 登岛信核心正文
   - UI 壳可以整理，核心正文删除或替换必须单独问。

3. key/secret/token/.env/.envv/Cloudflare Secret/真实服务器数据/大规模备份导出
   - 红色范围，不纳入普通结构化整理。

## 下一步建议

建议下一刀：`P3-STRUCT-01｜v106 daily shell module extraction plan`。

先做只改文档或低风险代码准备：
- 标注 v106 可拆函数列表。
- 设计目标文件边界，例如 `public/src/original-shell/v106-daily.js` 或类似位置。
- 明确迁移策略：先复制模块并保持 `app.js` 行为不变，之后逐步由 `app.js` 调用模块；每步一个小 commit。

不建议下一刀直接大规模移动主聊天或 v119。当前最稳的结构化切口是 v106，因为它的业务边界最清楚，且最近刚完成清理与恢复。

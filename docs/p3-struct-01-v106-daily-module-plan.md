# P3-STRUCT-01｜v106 daily shell module extraction plan

记录时间：2026-07-08
基准：`main`，建立在 `docs/p3-struct-map.md` 之后。

本文件只制定模块化拆分计划，不改功能代码，不删除功能，不触碰 v119 予爱机书 / 登岛信，不触碰 v097 main chat windows，不触碰主聊天真实 API 链路，也不触碰 key / env / secrets。

## 1. v106 当前职责边界

v106 当前是 `app.js` 内实际接管 `daily / 海岸日报` 的主体层。它位于 `window.__v106SiliconCarbonMoments` IIFE 内，负责创建 `#freshDailyPanelV101`，并通过捕获阶段事件监听覆盖 v095/v096/v097 的 daily 空状态。

当前 v106 包含这些职责：

- 海岸日报大厅：展示“海岸日报”入口与五个视觉入口：硅碳圈、日记、相册、小组件、宠物系统。
- 子入口路由：把 `moments / diary / album / widgets / pet` 分发到对应界面。
- 硅碳圈：封面、头像、发帖入口、运行时动态、点赞、评论、评论编辑器。
- 日记：日期 chips、三张纸页结构、写作表单、运行时日记草稿。
- 相册：分类墙、上传入口、卡片、下载按钮、运行时图片草稿。
- 运行时状态：`scPosts`、`scLikes`、`scComments`、`scCommentTarget`、`diaries`、`diaryDate`、`albumItems`、头像与封面数据。
- 事件接管：捕获阶段监听 pointer/touch/click，拦截 daily 入口与 v106 内部所有交互。

当前明确不属于 v106 的范围：主聊天消息发送、真实 API 请求、模型箱、v097 主聊天窗口切换、v119 予爱机书核心正文。

## 2. 建议拆分模块

### 2.1 `dailyRouter`

未来职责：

- 持有 v106 的事件接管入口。
- 绑定并维护捕获阶段监听。
- 识别 daily 入口点击：`[data-room="daily"]`、`[data-room-v095="daily"]`。
- 识别 v106 内部路由：`[data-fresh-daily-room]`、`[data-fresh-daily-action]`。
- 分发到 `dailyShell.openDaily()`、`moments.openMoments()`、`diary.openDiary()`、`album.openAlbum()` 或普通子入口。
- 处理返回按钮、顶栏 back、评论/点赞/发表/日期切换/相册下载等动作，但具体业务状态交给对应模块。

从 `app.js` 迁入的函数/逻辑：

- `handle(e)` 主体。
- `targetOf(e)`。
- `document.addEventListener(ev, handle, true)` 注册逻辑。
- `openDaily()`、`openMoments()`、`openDiary()`、`openAlbum()` 的调用分发部分。
- `top-back`、`back-daily`、`moments-compose`、`diary-compose`、`album-compose` 等 action 的分发。

注意：第一刀真正拆代码时，`dailyRouter` 必须保持捕获阶段和 `stopImmediatePropagation()` 时序不变。这是 v106 不被 v095/v096/v097 覆盖的核心。

### 2.2 `dailyShell`

未来职责：

- 统一创建和渲染 `#freshDailyPanelV101`。
- 统一 hide side / show side / close legacy panels。
- 提供 `panel(title, sub, body, state)`。
- 提供 `openDaily()` 海岸日报大厅。
- 提供 `openChild(kind)` 小组件、宠物系统等暂未接入入口。
- 统一控制返回海岸日报按钮与普通空状态文案。

从 `app.js` 迁入的函数/逻辑：

- `hideSide()`。
- `showSide()`。
- `closeOld()`。
- `panel(title, sub, body, state)`。
- `openDaily()`。
- `openChild(kind)`。
- `names` 中只用于 daily 子入口名的部分，或改为导入常量。

必须保留的 UI 壳：

- 海岸日报大厅标题。
- 五个入口：硅碳圈、日记、相册、小组件、宠物系统。
- 返回海岸日报按钮。
- `fresh-daily-panel-v101` / `coast-room-panel-v095` 这类现有 class，避免 CSS 失效。

### 2.3 `moments`

未来职责：

- 渲染硅碳圈主界面。
- 渲染封面上传、头像上传、发布按钮、feed 容器。
- 渲染本地草稿动态卡片。
- 渲染点赞、评论、评论编辑器。
- 渲染发朋友圈表单。
- 处理发布、点赞、评论、图片预览等运行时交互。

从 `app.js` 迁入的函数/逻辑：

- `openMoments()`。
- `refreshMomentsKeepScroll()`。
- `openCompose()`。
- `commentsHtml(id, base)`。
- `post(id, author, meta, text, extra, baseComments, baseLikes)`。
- `coverStyle()`。
- 与 `publish-placeholder`、`data-sc-like`、`data-sc-comment`、`data-sc-send-comment` 相关的业务处理。
- 头像上传和封面上传的 `FileReader` 逻辑。

运行时状态归属：

- `scPosts`：归 `moments`。
- `scLikes`：归 `moments`。
- `scComments`：归 `moments`。
- `scCommentTarget`：归 `moments`。
- `scCoverData`：归 `moments` 或 `dailyAssets`，建议由 `dailyAssets` 存储、`moments` 使用。
- `scAvatars.xiaohan`：归 `dailyAssets`，`moments` 使用。

必须保留的 UI 壳：

- `sc-cover` 封面上传。
- `sc-profile` 与 `sc-profile-avatar`。
- `sc-plus` 发帖入口。
- `sc-compose` 发帖表单。
- `sc-feed`。
- `sc-post` 朋友圈卡片。
- `sc-post-actions`。
- `sc-comments`。
- `sc-comment-editor`。

暂时行为标记：

- 发布、评论、点赞、上传均为“本地草稿原型，暂未同步服务器”。
- 刷新后丢失是当前允许行为。
- 不恢复默认假动态、默认假评论、默认点赞数。

### 2.4 `diary`

未来职责：

- 渲染日记入口。
- 渲染日期 chips。
- 渲染纸页结构。
- 渲染写日记表单。
- 处理运行时日记保存。
- 管理当天最多三张纸页的显示规则。

从 `app.js` 迁入的函数/逻辑：

- `dateKey(d)`。
- `dateLabel(k)`。
- `authorName(a)`。
- `diaryPaper(e)`。
- `openDiary()`。
- `openDiaryCompose()`。
- `finishDiary()`。
- 与 `data-diary-date`、`diary-finish` 相关的业务处理。

运行时状态归属：

- `diaries`：归 `diary`。
- `diaryDate`：归 `diary`。
- 日记配图预览为运行时表单状态，不新增持久 key。

必须保留的 UI 壳：

- `diary-plus`。
- `diary-filter`。
- `diary-stack`。
- `diary-entry`。
- `diary-paper`。
- `diary-compose`。
- 作者选择：小寒 / ✦Myrisol / ≋Myrisol。
- 天气、心情、正文、配图上传。

暂时行为标记：

- 写入后仅运行时显示。
- 文案继续明确“本地草稿原型，暂未同步服务器”。
- 不生成默认假日记。

### 2.5 `album`

未来职责：

- 渲染相册入口。
- 渲染相册墙和分类区。
- 渲染相册卡片。
- 渲染上传表单。
- 处理图片预览、运行时保存与下载。

从 `app.js` 迁入的函数/逻辑：

- `albumLabel(cat)`。
- `albumCard(item, i)`。
- `albumSection(cat)`。
- `openAlbum()`。
- `openAlbumCompose()`。
- `finishAlbum()`。
- `downloadAlbum(id)`。
- 与 `album-finish`、`data-album-download` 相关的业务处理。

运行时状态归属：

- `albumItems`：归 `album`。
- 上传预览为运行时表单状态，不新增持久 key。

必须保留的 UI 壳：

- `album-plus`。
- `album-wall`。
- `album-section`。
- `album-grid`。
- `album-card`。
- 下载按钮。
- `album-compose`。
- 分类：小寒 / Myri / 蛇蛇狗合照。

暂时行为标记：

- 上传后仅运行时显示。
- 文案继续明确“本地草稿原型，暂未同步服务器”。
- 不生成默认假图片。

### 2.6 `dailyDraftState`

未来职责：

- 集中管理 v106 的运行时草稿状态。
- 提供可控读写方法，减少散落的全局 `let`。
- 第一阶段仍然保持运行时内存，不新增 localStorage key。

建议归口状态：

- `scPosts`
- `scLikes`
- `scComments`
- `scCommentTarget`
- `diaries`
- `diaryDate`
- `albumItems`

建议 API：

- `getMomentsPosts()` / `addMomentDraft()`。
- `toggleMomentLike(id)` / `setCommentTarget(id)` / `addComment(id, text)`。
- `getDiaryDate()` / `setDiaryDate(date)` / `addDiaryDraft(entry)`。
- `getAlbumItems()` / `addAlbumDraft(item)`。

边界提醒：

- 不要在第一阶段新增持久化。
- 如果未来要持久化，应单独做 migration plan，并明确 key 名、清理策略、隐私边界。

### 2.7 `dailyAssets`

未来职责：

- 管理 v106 的头像、封面、图片预览等资产逻辑。
- 统一 `FileReader` 转 data URL 的 helper。
- 统一头像读取和封面运行时数据。

运行时/持久状态归属：

- `SC_XIAOHAN_AVATAR_KEY = "coast_avatar_xiaohan_v099"`：归 `dailyAssets`。
- `scAvatars`：归 `dailyAssets`。
- `scCoverData`：归 `dailyAssets`，仍为运行时内存。
- compose / diary / album 的图片预览可用 `readImageFile(file)` helper。

边界提醒：

- 保留旧头像 key。
- 不新增封面持久 key。
- 不新增相册/日记图片持久 key。

## 3. 函数迁移清单

| 当前函数/变量 | 未来模块 | 说明 |
| --- | --- | --- |
| `names` | `dailyShell` / constants | 子入口名称映射 |
| `SC_XIAOHAN_AVATAR_KEY` | `dailyAssets` | 保留旧头像 key |
| `scPosts` | `dailyDraftState` / `moments` | 硅碳圈运行时动态 |
| `scAvatars` | `dailyAssets` | 头像数据 |
| `scCoverData` | `dailyAssets` | 封面运行时数据 |
| `scLikes` | `dailyDraftState` / `moments` | 运行时点赞 |
| `scComments` | `dailyDraftState` / `moments` | 运行时评论 |
| `scCommentTarget` | `dailyDraftState` / `moments` | 当前评论编辑目标 |
| `diaries` | `dailyDraftState` / `diary` | 运行时日记 |
| `diaryDate` | `dailyDraftState` / `diary` | 当前日记日期 |
| `albumItems` | `dailyDraftState` / `album` | 运行时相册 |
| `esc()` | shared util | 若 v106 独立模块，保留局部 util 或共用 util |
| `hideSide()` / `showSide()` / `closeOld()` | `dailyShell` | panel 外壳控制 |
| `panel()` | `dailyShell` | 统一面板渲染 |
| `openDaily()` / `openChild()` | `dailyShell` | 大厅和普通子入口 |
| `avatar()` / `coverStyle()` | `dailyAssets` | 头像/封面渲染 helper |
| `commentsHtml()` / `post()` | `moments` | 卡片和评论 UI |
| `openMoments()` / `openCompose()` / `refreshMomentsKeepScroll()` | `moments` | 硅碳圈 UI 与发帖 |
| `dateKey()` / `dateLabel()` / `authorName()` / `diaryPaper()` | `diary` | 日记 helper 与纸页 |
| `openDiary()` / `openDiaryCompose()` / `finishDiary()` | `diary` | 日记主流程 |
| `albumLabel()` / `albumCard()` / `albumSection()` | `album` | 相册 helper 与卡片 |
| `openAlbum()` / `openAlbumCompose()` / `finishAlbum()` / `downloadAlbum()` | `album` | 相册主流程 |
| `targetOf()` / `handle()` / event binding | `dailyRouter` | v106 事件接管 |

## 4. 必须保留的 UI 壳

拆模块时不能丢失这些现有视觉和 DOM 约定：

- `#freshDailyPanelV101`
- `coast-room-panel-v095`
- `fresh-daily-panel-v101`
- `coast-room-shell`
- `coast-room-head`
- `coast-room-body`
- `daily-entry-grid-v097`
- 海岸日报五入口：硅碳圈、日记、相册、小组件、宠物系统
- `sc-cover`、`sc-profile`、`sc-avatar`、`sc-plus`、`sc-feed`、`sc-post`、`sc-comment-editor`
- `diary-filter`、`diary-stack`、`diary-entry`、`diary-paper`、`diary-compose`
- `album-wall`、`album-section`、`album-grid`、`album-card`、`album-compose`
- `data-fresh-daily-room`
- `data-fresh-daily-action`
- `data-sc-like`
- `data-sc-comment`
- `data-sc-send-comment`
- `data-diary-date`
- `data-album-download`

## 5. 暂时仍为本地草稿原型的行为

这些行为可以保留 UI 与运行时预览，但不要伪装成云端保存：

- 硅碳圈发帖：写入 `scPosts`，刷新后可消失。
- 点赞：写入 `scLikes`，刷新后可消失。
- 评论：写入 `scComments`，刷新后可消失。
- 封面上传：写入 `scCoverData`，刷新后可消失。
- 头像上传：沿用旧 key `coast_avatar_xiaohan_v099`。
- 日记写作：写入 `diaries`，刷新后可消失。
- 相册上传：写入 `albumItems`，刷新后可消失。
- 相册下载：仅下载当前运行时 data URL。

文案应继续明确：`本地草稿原型，暂未同步服务器`，或等价表达。

## 6. 第一刀真正拆代码时怎么切

不建议第一刀直接把 v106 全部搬出 `app.js`。更稳的切法是分三步：

### Step A：建立模块文件但不改行为

新增文件，例如：

- `public/src/original-shell/v106/daily-state.js`
- `public/src/original-shell/v106/daily-assets.js`
- `public/src/original-shell/v106/daily-shell.js`
- `public/src/original-shell/v106/moments.js`
- `public/src/original-shell/v106/diary.js`
- `public/src/original-shell/v106/album.js`
- `public/src/original-shell/v106/daily-router.js`

第一步可以只放注释和导出形状，不接入 `app.html`，不改运行时。

### Step B：先抽纯 helper，不改事件接管

优先抽不依赖 DOM 时序的 helper：

- `dateKey()`、`dateLabel()`、`authorName()`。
- `albumLabel()`。
- `readImageFile(file)`。
- 常量 `SC_XIAOHAN_AVATAR_KEY`。

这一阶段不移动 `handle(e)`，不移动 `panel()`，不改事件绑定。

### Step C：抽 `dailyShell`，最后再抽 `dailyRouter`

`panel()`、`openDaily()`、`openChild()` 可以比 `handle(e)` 更早抽出。`handle(e)` 是最敏感部分，应最后迁移，并且要逐项验收：

- 点击侧栏海岸日报仍进入 v106 大厅。
- 点击硅碳圈、日记、相册仍进入对应界面。
- 返回按钮仍回海岸日报。
- v095/v096/v097 daily 空状态不会抢回控制权。
- 主聊天、v097 main windows、v119 不受影响。

### Step D：迁移加载方式

如果未来从 `app.js` 拆到独立文件，需要决定加载方式：

- 继续 `<script defer>` 多文件加载；或
- 用 bundler 合并；或
- 先把模块挂到 `window.ElementeraV106Daily`，由 `app.js` 调用。

短期建议：先不要引入 bundler。沿用 `<script defer>` 或 window namespace 更稳。

## 7. 验收标准

文档阶段验收：

- 只新增 `docs/p3-struct-01-v106-daily-module-plan.md`。
- 不修改 `app.js`。
- 不修改 v119、v097、主聊天、外接 API 脚本。
- 不触碰 key / env / secrets。

未来第一刀代码拆分验收：

- `node --check` 通过。
- 只改 v106 相关模块与必要加载入口。
- 海岸日报大厅仍显示。
- 五个入口仍显示：硅碳圈、日记、相册、小组件、宠物系统。
- 硅碳圈可以打开，发帖表单和卡片 UI 仍在。
- 点赞、评论、评论编辑器仍在。
- 头像/封面上传 UI 仍在。
- 日记结构和写作表单仍在。
- 相册墙、上传、卡片、下载按钮仍在。
- 默认假朋友圈、默认假评论、默认点赞数不回来。
- `Local only / Coming soon / fresh` 不回来。
- 所有本地草稿行为继续标注“本地草稿原型，暂未同步服务器”。
- v119 予爱机书 / 登岛信不变。
- v097 main chat windows 不变。
- 主聊天真实 API 链路不变。

## 8. 下一步建议

建议下一步为：`P3-STRUCT-02｜v106 module skeleton files`。

范围：只新增空模块骨架与注释，不接入运行时，不修改 `app.js`。这样可以先让目录结构出现，再逐步把 helper 搬进去。

如果主脑希望更保守，则下一步可以是：`P3-STRUCT-02A｜v106 helper extraction checklist`，继续只写文档，列出每个 helper 的输入输出与依赖，再进入代码拆分。

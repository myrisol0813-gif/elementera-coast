# CoastGPT Android APP A4

CoastGPT A4 是 Elementera Coast 的混合原生 Android 壳。A4 不再把整座 APP 交给一个全屏网页：APK 负责首页、房间列表、房间骨架、返回、菜单、更新、关于与错误恢复；一个长期复用的 WebView 只承载线上海岸内容岛。聊天、日报数据、Cloudflare、MCP、记忆语义与工具能力仍以现有 canonical runtime 为准。

手机桌面名称为 CoastGPT。Web 内“元素海岸 / Elementera Coast”的世界观名称不变。

## 当前版本

- APP 显示名称：CoastGPT
- packageName：`com.elementeracoast.app`
- releaseName：A4.0
- versionName：`1.0.3-a4`
- versionCode：`4`
- minSdk：26
- targetSdk / compileSdk：36
- 技术栈：Java 17、原生 Android View、单 Activity、单一复用 WebView
- 在线内容岛：`https://app.elementeracoast.com`
- 更新清单：`https://app.elementeracoast.com/public/app-update.json`
- 公开更新页：`https://app.elementeracoast.com/updates/`
- Web 标签：A4 / P6.4+A1+A2+A3
- MCP expectedVersion：1.9.2

工程没有 Compose、AndroidX、Google Play Services 或第三方运行时依赖；Manifest 只声明 `android.permission.INTERNET`。

## A4 混合壳结构

```text
MainActivity
├─ APK 本地首页
│  ├─ CoastGPT 标题与用户提供的深蓝旧金图
│  ├─ 本地房间分组与 16 个入口
│  └─ 单一本地菜单
└─ APK 本地房间容器
   ├─ 即时标题 / 副标题 / loading skeleton
   ├─ 本地更新、关于、错误与断网页
   ├─ 底部安全区内的返回 / 房间状态 / 单一菜单
   └─ 一个复用 WebView：仅承载在线内容岛
```

APP 冷启动时先显示本地首页，同时在后台预热线上海岸。点击房间后原生页面同步切换，不等待网络；若是动态房间，再把既有 Web 控制器动作发给已预热 WebView。普通房间切换不重建 Activity 或 WebView，也不清缓存。

### APK 本地房间目录

以下入口、标题、副标题、图标、加载态、离线态和返回路径都在 APK 内：

- 主聊天
- 海岸日报
- 海岸日历
- 一日总结
- 碳硅圈
- 日记
- 相册
- 宠物区（既有占位房间）
- 未来小组件（既有占位房间）
- 信箱
- 灯塔
- Radio
- Dogtalk
- 记忆
- 更新中心
- 关于 CoastGPT

更新中心与关于页为完整本地页面。其他房间用同一个 WebView 填充真实线上内容；信箱继续打开现有 `/mailbox` 页面。Dogtalk 不是新后端页面，A4 进入主聊天后展开现有 Dogtalk 输入区。

### Web 内容岛桥的边界

User-Agent 后缀为：

```text
ElementeraCoastApp/1.0.3-a4 Android HybridShell
```

Web 侧 `window.CoastNativeShell.openRoom()` 只能调用既有 UI 控制器动作。它不返回记录，不读取 token，不发送聊天，不作为身份或权限依据，不写 localStorage，不进入思维壤、模型上下文或 MCP。Android 未使用 `addJavascriptInterface`。

## 图标与启动视觉

launcher、roundIcon、Android adaptive icon、启动页、本地首页头像和所有加载/错误骨架使用小寒为 A4 提供的同一张 1000×1000 深蓝旧金 CoastGPT 原图。`drawable-nodpi/coast_icon.png` 保留原始像素文件；mipmap 各密度只做 Lanczos 尺寸缩放，不重新生成图形。adaptive icon 使用完整底图，避免 foreground 安全区造成二次缩小。

## 导航、菜单与系统栏

- 首页与房间切换由原生状态管理，点击立即反馈。
- 房间底部导航位于 WebView 外部和系统手势安全区内，不覆盖网页标题、发送按钮或右上角控件。
- 只保留一个原生菜单入口；A3 右上角悬浮按钮已删除。
- 菜单包含：刷新当前房间、回到房间首页、清缓存重载、检查 APP 更新、用系统浏览器打开、关于 CoastGPT。
- Android 返回键与 ColorOS 手势返回先弹出原生房间回到本地首页；首页无房间栈时双击退出。
- Web feature panel 内部的返回按钮仍由 Web 自己处理，不改变原有业务导航。
- root 采用 edge-to-edge，system bar / cutout / IME insets 在原生层消费；Web APP mode 将自己的 safe-area 归零，避免重复上下留白。
- 状态栏可跟随 Web `theme-color`；导航栏固定与深蓝底部导航一致，避免 ColorOS 手势区出现突兀白条。
- 继续使用 `adjustResize`，不添加 SwipeRefresh 或触控拦截父容器。

## 离线与隐私边界

断网仍可见和可操作：

- CoastGPT 本地首页与全部房间入口；
- 每个房间的本地标题、副标题、加载与错误骨架；
- 返回与本地菜单；
- 更新中心和关于页的 APK 基础信息；
- 重试、清缓存重载、系统浏览器入口；
- 上次打开的房间名称提示。

离线不承诺聊天发送、MCP、登录、新日报、新日历、新信箱或其他动态数据。WebView 先使用正常 HTTP / Service Worker cache；主框架失败时只尝试一次 `LOAD_CACHE_ONLY`，随后显示本地错误页。

A4 的原生 SharedPreferences 只保存 `last_room_id` 和打开时间，不缓存聊天、信箱、记忆、日报正文或模型输出。WebView 自己的 Cookie、localStorage、sessionStorage 与 IndexedDB 语义保持原样。

## 构建环境

推荐 Android Studio 稳定版、JDK 17、Android SDK Platform 36 与 Build-Tools 36.x。

1. Android Studio 选择 Open，打开仓库中的 `android-app/`。
2. Gradle JDK 选择 17。
3. 安装 Android SDK Platform 36 与 Build-Tools 36.x。
4. 等待 Gradle Sync 完成。
5. 选择 `app`，在真机或 API 36 模拟器运行。

### Debug APK

```bash
cd android-app
./gradlew clean lintDebug assembleDebug
```

产物：

```text
android-app/app/build/outputs/apk/debug/app-debug.apk
```

debug APK 只用于开发和真机测试，使用当前构建机的 debug key。不同电脑或 CI run 的 debug key 可能不同，不能假设可以互相覆盖。

### Unsigned release APK

未配置 release signing 时：

```bash
cd android-app
./gradlew clean lintRelease assembleRelease
```

产物：

```text
android-app/app/build/outputs/apk/release/app-release-unsigned.apk
```

unsigned release 只是构建检查产物，不能作为正常可安装更新发布。

### Signed release APK

工程从本地环境变量读取签名配置：

```bash
export COAST_KEYSTORE_FILE=/absolute/private/path/elementera-coast-release.jks
export COAST_KEYSTORE_PASSWORD='local-secret'
export COAST_KEY_ALIAS='elementera-coast'
export COAST_KEY_PASSWORD='local-secret'
./gradlew clean lintRelease assembleRelease
```

不要提交 `.jks`、`.keystore`、密码、token、`local.properties` 或私钥。release key 丢失后，Android 无法把后续 APK 识别为同一签名应用。完整步骤见 [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md)。

## 安装、覆盖与 SHA-256

ADB 安装：

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

也可以把 APK 传到 OPPO Reno14，用 ColorOS 文件管理器打开；首次侧载可能需要为该文件来源临时开启“允许安装未知应用”。

覆盖安装必须同时满足：

1. packageName 仍为 `com.elementeracoast.app`；
2. versionCode 高于已安装版本；A4 为 4；
3. 新旧 APK 使用同一签名 key。

A1、A2、A3、A4 的 versionCode 已递增，但各次 CI debug key 可能不同。签名不一致时系统会拒绝覆盖；卸载旧版会清除该 APP 的 WebView Cookie、本地存储和登录态。长期发布必须建立并保管同一份 release keystore。

校验命令：

```bash
sha256sum app/build/outputs/apk/debug/app-debug.apk
sha256sum app/build/outputs/apk/release/app-release-unsigned.apk
```

正式发布时，`app-update.json.android.sha256` 必须对应 `apkUrl` 指向的同一个 signed release APK。`apkUrl` 为空时，清单中的 SHA-256 也应留空，不能拿 debug 或私有 CI artifact 冒充公开包。

## 更新中心

本地更新中心立即显示本机 versionName、versionCode、releaseName、packageName 与签名说明，然后异步读取 production 清单：

- 本机 versionCode 小于 latestVersionCode：提示有新版；
- 等于或高于：提示当前已是最新；
- `apkUrl` 为空：提示暂无公开 APK 下载链接；
- 读取失败：提示“离线，暂未读取线上清单”，本地页面不消失；
- 不自动下载、不自动安装、不强弹窗、不后台轮询。

## 刷新与缓存语义

- “刷新当前房间”：显式重载当前在线内容岛，本地房间先保持可见。
- “回到房间首页”：只切换原生导航，不重建或清除 WebView。
- “清缓存重载”：清 WebView HTTP 资源缓存与当前站点 Cache Storage，再预热首页。
- 清缓存不会调用 `removeAllCookies`，也不会删除 localStorage、sessionStorage 或 IndexedDB。
- 普通房间切换保持 `LOAD_DEFAULT`，不会清缓存。

## 故障排除

### 本地首页出现但房间一直同步

先用系统浏览器访问 `https://app.elementeracoast.com`，确认网络和登录门可用。返回 APP 点“刷新当前房间”。若仍失败，记录房间名、Android System WebView 版本和网络类型。

### 房间显示“离线，暂未同步”

本地壳工作正常，只是线上内容岛没有成功载入。恢复网络后点“重试”。SSL 校验失败不会被绕过。

### 登录态丢失

“清缓存重载”不会删除 Cookie。卸载 APP、清应用数据、签名切换后重装或服务端会话过期会要求重新登录。

### 键盘遮挡输入框

A4 使用 `adjustResize` 与 IME insets。请记录输入法、ColorOS 导航方式和具体房间；不要在 Web 侧添加新的全局 `overflow:hidden` 或 touchmove 拦截。

### app-update.json 读取失败

在浏览器直接打开 `https://app.elementeracoast.com/public/app-update.json`。它应匿名返回 HTTP 200；清单不得包含 token、内部路径或私有 artifact URL。

### APK 无法覆盖安装

核对 packageName、versionCode 和签名证书。最常见原因是 A3 / A4 debug APK 来自不同 ephemeral debug key。只有确认接受 WebView 数据被清除时才卸载旧版。

## OPPO Reno14 / ColorOS 16 / Android 16 真机清单

目标机：PLA110，ColorOS 16.0.7，Android 16。

- [ ] 1. 安装 A4 APK；桌面名称显示 CoastGPT。
- [ ] 2. 核对 APK SHA-256；签名一致时测试覆盖安装。
- [ ] 3. launcher、roundIcon 与开屏使用小寒提供的深蓝旧金原图，主体大小和裁切正确。
- [ ] 4. 冷启动后本地首页与房间列表立即出现，不等待线上网页形成。
- [ ] 5. 首页 16 个入口均可见，分组和滚动正常。
- [ ] 6. 断网冷启动时首页、按钮和菜单仍在。
- [ ] 7. 点击海岸日报，先立即出现本地日报骨架，再同步在线内容。
- [ ] 8. 日历、总结、碳硅圈、日记、相册同样先出现本地房间。
- [ ] 9. Radio、灯塔、记忆、信箱与 Dogtalk 入口行为符合现有功能语义。
- [ ] 10. 更新中心和关于 CoastGPT 在断网时仍完整显示 APK 基础信息。
- [ ] 11. A3 右上角悬浮菜单已消失；底部只保留一个不遮挡内容的原生菜单入口。
- [ ] 12. 菜单深浅色可读，六个项目均能执行。
- [ ] 13. 状态栏、刘海、三键导航或手势条不遮挡网页；底部不出现突兀白条。
- [ ] 14. 主聊天模型栏、新聊天、输入、发送均正常。
- [ ] 15. 键盘弹起时输入框、光标与发送按钮可见；收起后布局恢复。
- [ ] 16. 消息、思维壤、侧边栏、feature panel、modal、日报与长页滚动正常。
- [ ] 17. 房间切换不重建 WebView，不出现大片空白；体感明显优于 A3。
- [ ] 18. Android 返回键与边缘手势先回本地房间首页；首页双击退出。
- [ ] 19. Web feature panel 自己的返回按钮仍可返回上一层。
- [ ] 20. 切后台 30 秒和 5 分钟再回来不白屏，不丢当前输入场景。
- [ ] 21. 断网房间显示“离线，暂未同步”，可返回首页、开菜单、重试或用浏览器打开。
- [ ] 22. 恢复网络后重试可同步对应房间。
- [ ] 23. 清缓存重载后可以重新登录，且未主动删除 Cookie / localStorage / sessionStorage / IndexedDB。
- [ ] 24. APP 检查更新联网时读取 production manifest，断网时提示清楚。
- [ ] 25. APP 固定竖屏；ColorOS light / dark、手势导航与三键导航分别测试一次。

## 明确不包含

- 原生聊天完整重写
- Myrisol Gateway
- LoverConnect、本地 MCP、手机状态上传
- QQ、微信、Telegram、Discord 接入
- 截图、通知监听、无障碍、设备管理员、锁屏或推送
- 应用商店发布或自动 APK 安装
- MCP schema、记忆语义、P6.3 clean-context contract 或 P6.4 滚动系统更改
- Context Manifest / Mode / Ambient / Facets / Inspector 复活

未来入口只是现有占位房间，不代表 A4 接入了任何未来手机能力。

## CI

`.github/workflows/android-shell.yml` 执行：

- Gradle wrapper validation
- 根 `npm test`
- Cloudflare Pages Functions build
- `lintDebug` / `lintRelease`
- `assembleDebug` / `assembleRelease`
- Android 16 emulator 安装、启动与本地首页存活 smoke test
- debug / unsigned release APK 与 SHA-256 artifact 上传

未配置私有 release signing 时，release 产物保持 unsigned，这是预期行为。

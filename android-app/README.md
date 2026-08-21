# Elementera Coast Android APP A2

元素海岸 Android APP A2 是现有线上海岸的稳定原生入口。它整理已有 Web 功能在 Android WebView 中的导航、更新、恢复与发布体验，不重写聊天，也不改变 Cloudflare、MCP、记忆或 P6.3 clean-context contract。

## 当前版本

- APP 名称：元素海岸
- 项目名：Elementera Coast
- packageName：`com.elementeracoast.app`
- releaseName：A2.0
- versionName：`1.0.1-a2`
- versionCode：`2`
- minSdk：26
- targetSdk / compileSdk：36
- 技术栈：Java 17、原生 Android View、单 Activity、WebView
- WebView 地址：`https://app.elementeracoast.com`
- 更新清单：`https://app.elementeracoast.com/public/app-update.json`
- 公开更新页：`https://app.elementeracoast.com/updates`
- Web 标签：A2 / P6.4+A1
- MCP expectedVersion：1.9.2

工程没有 Compose、AndroidX、Google Play Services 或第三方运行时依赖。

## A2 已实现

- JavaScript、DOM storage、数据库存储、第一方 Cookie 与 WebView 缓存已启用。
- 同域导航留在 APP；外部 HTTP(S)、mailto、tel 与下载链接交给系统应用。
- Cookie 在暂停时 flush；普通刷新与资源缓存清理不会主动删除 Cookie 或登录态。
- Android 历史返回优先；无历史时两秒内双击返回退出。
- Android 13+ predictive back 覆盖 ColorOS 手势返回路径。
- `adjustResize` 配合 system bar、cutout 与 IME insets 处理键盘和安全区。
- WebView 没有 SwipeRefresh 或拦截触控的父容器；滚动仍由 PWA 自己管理。
- 原生菜单包含刷新、首页、清缓存重载、检查更新、系统浏览器和关于入口。
- “检查更新”和“关于元素海岸”读取同一份 production update manifest；失败不影响海岸使用。
- User-Agent 后缀为 `ElementeraCoastApp/1.0.1-a2 Android`，只供 Web UI 与更新诊断识别。
- 主框架网络错误、HTTP 5xx 与 SSL 校验失败显示原生错误页，提供重试、清缓存重载和系统浏览器入口。
- 系统文档选择器支持 Web 文件输入，不申请存储、相机或麦克风权限。
- 固定竖屏，与现有 PWA `orientation: portrait` 保持一致。

主聊天、思维壤、记忆、日历、灯塔、信箱、Radio、Dogtalk、Daily、工作台和工具能力仍由线上海岸与 canonical Cloudflare / MCP runtime 提供。

## 明确不包含

- 原生聊天重写
- Myrisol Gateway
- LoverConnect bridge、本地 MCP 或手机状态上传
- QQ、微信、Telegram、Discord 接入
- 截图、通知监听、无障碍、设备管理员、锁屏或后台保活
- 通知推送系统
- 自动下载或自动安装 APK
- Google Play 发布或 Play 服务
- 新的模型上下文包装或旧 Context Manifest / Mode / Ambient / Facets / Inspector

未来可以评估通知、本地状态、手机小纸条和 LoverConnect bridge，但它们均不在 A2 权限与代码路径中。

## 工程结构

```text
android-app/
  app/
    build.gradle.kts
    src/main/
      AndroidManifest.xml
      java/com/elementeracoast/app/
        MainActivity.java
        CoastWebViewClient.java
        CoastUpdateChecker.java
      res/
  gradle/wrapper/
  scripts/launch-smoke.sh
  RELEASE_CHECKLIST.md
  build.gradle.kts
  settings.gradle.kts
  gradlew
  gradlew.bat
  README.md
```

## 构建环境

推荐 Android Studio 稳定版、JDK 17、Android SDK Platform 36 与 Build-Tools 36.x。首次同步需要访问 Google Maven、Maven Central 与 Gradle distribution 服务。

Android Studio：

1. 选择 Open，打开仓库中的 `android-app/`。
2. 确认 Gradle JDK 为 17。
3. 安装 Android SDK Platform 36 与 Build-Tools 36.x。
4. 等待 Gradle Sync 完成。
5. 选择 `app` 配置，在真机或 API 36 模拟器运行。

### Debug APK

```bash
cd android-app
./gradlew clean lintDebug assembleDebug
```

产物：

```text
android-app/app/build/outputs/apk/debug/app-debug.apk
```

debug APK 使用当前构建机的 debug key，只用于开发和真机测试，不应作为长期公开发行包。不同电脑或不同 CI run 产生的 debug key 可能不同，因而不一定能够彼此覆盖安装。

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

unsigned release APK 只是构建检查产物，不能作为正常可安装更新发布。

### Signed release APK

工程从本地环境变量读取签名配置：

```bash
export COAST_KEYSTORE_FILE=/absolute/private/path/elementera-coast-release.jks
export COAST_KEYSTORE_PASSWORD='local-secret'
export COAST_KEY_ALIAS='elementera-coast'
export COAST_KEY_PASSWORD='local-secret'
./gradlew clean lintRelease assembleRelease
```

不要提交 `.jks`、`.keystore`、密码、token、`local.properties` 或任何私钥。release key 一旦丢失，Android 将无法把后续 APK 作为同一签名应用覆盖安装。完整发布步骤见 [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md)。

## SHA-256

Linux / macOS：

```bash
sha256sum app/build/outputs/apk/debug/app-debug.apk
sha256sum app/build/outputs/apk/release/app-release-unsigned.apk
```

Windows PowerShell：

```powershell
Get-FileHash .\app\build\outputs\apk\debug\app-debug.apk -Algorithm SHA256
```

正式发布时，`app-update.json.android.sha256` 必须对应 `apkUrl` 指向的同一个 signed release APK。`apkUrl` 为空时不要填写与公开下载无关的 debug checksum。

## 安装与覆盖安装

ADB 安装 debug APK：

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

也可以把 APK 传到 OPPO Reno14，在 ColorOS 文件管理器中点开。首次侧载时系统可能要求为当前文件来源临时开启“允许安装未知应用”。

覆盖安装必须同时满足：

1. packageName 仍为 `com.elementeracoast.app`；
2. versionCode 高于已安装版本；A2 的 versionCode 为 2；
3. 新旧 APK 使用同一签名 key。

A1 到 A2 的 versionCode 已递增，使用同一签名时可覆盖安装。若 A1 与 A2 debug APK 来自不同签名环境，ColorOS 会拒绝覆盖；需要卸载旧版后安装。卸载会清除 APP 的 WebView Cookie、本地存储与登录态。

## 更新中心

公开只读清单：

```text
https://app.elementeracoast.com/public/app-update.json
```

公开页面：

```text
https://app.elementeracoast.com/updates
```

原生“检查 APP 更新”只在用户点按时读取清单：

- 本机 versionCode 小于 latestVersionCode：提示有新版；
- 本机 versionCode 等于或高于 latestVersionCode：提示当前已是最新；
- `apkUrl` 为空：明确提示暂无公开 APK 下载链接；
- 读取失败：显示可理解的恢复提示，不白屏、不崩溃；
- 不后台轮询、不强弹窗、不自动下载、不自动安装。

“关于元素海岸”显示 APP 名称、versionName、versionCode、releaseName、packageName、WebView 地址，并在能读取清单时显示当前 Web label / commit 与 MCP expectedVersion。

Web 侧“海岸更新 / 关于海岸”只读取公开清单并渲染 UI。APP 模式来自 User-Agent，不写入 localStorage，不进入聊天请求、思维壤、模型上下文或 MCP，也不能作为认证依据。

## 刷新与缓存语义

- “刷新海岸”：普通 `WebView.reload()`。
- “重新打开首页”：载入 `https://app.elementeracoast.com` 后清掉旧 WebView 导航历史。
- “清缓存重载”：清 WebView HTTP 资源缓存和当前站点 Cache Storage，再重载首页。

清缓存重载不会删除 Cookie、localStorage、sessionStorage 或 IndexedDB。若服务端会话已经过期，重新载入仍会回到海岸密码门。

## 权限

Manifest 只声明：

```text
android.permission.INTERNET
```

系统文档选择器和系统浏览器通过外部 Activity 工作，不需要读取外部存储权限。

## 故障排除

### 启动后白屏或停在错误页

先确认 Chrome / Android System WebView 已启用，再打开系统浏览器访问线上海岸。回到 APP 依次尝试“重试”和“清缓存重载”。SSL 错误不会被忽略；若系统时间异常，先修正时间。

### 登录态丢失

“清缓存重载”不会删除 Cookie；卸载 APP、清除应用数据、签名切换后重装会删除 WebView 数据。服务端会话过期也会正常回到密码门。

### 键盘遮挡输入框

确认使用 A2 APK，并记录输入法名称、横竖屏状态和 ColorOS 导航方式。A2 使用 `adjustResize` 与 IME insets；不要在 Web 侧添加全局 `overflow:hidden` 或壳层 CSS 补丁。

### 无法检查更新

在系统浏览器打开 `https://app.elementeracoast.com/public/app-update.json`。若浏览器可读而 APP 不可读，记录网络类型、WebView 版本和系统时间，再重试。海岸正文加载不依赖更新清单。

### APK 无法覆盖安装

核对 packageName、versionCode 和签名。最常见原因是两个 debug APK 来自不同 debug key。只有在确认可以接受清除 APP WebView 数据时才卸载旧版。

### `app-update.json` 返回 401 或格式错误

该清单应匿名返回 HTTP 200。检查 Cloudflare public static whitelist、`_headers` 和 production deployment；不要把它改成认证端点，也不要在清单中放 token、内部路径或 CI 私有 artifact URL。

## OPPO Reno14 / ColorOS 16 / Android 16 真机清单

目标机：PLA110，ColorOS 16.0.7，Android 16。

- [ ] 1. A2 APK 可从文件管理器或 ADB 安装。
- [ ] 2. 同签名 A1 可用 `adb install -r` 或系统安装器覆盖到 A2。
- [ ] 3. 冷启动后深蓝启动页正常消失，不闪退。
- [ ] 4. 线上海岸或密码门成功出现。
- [ ] 5. 登录成功；服务端有效期内退出到桌面再回来仍保持登录态。
- [ ] 6. 主聊天可输入、长文本换行并发送。
- [ ] 7. 键盘弹起时输入框、光标与发送按钮不被遮挡，收起后布局恢复。
- [ ] 8. 主聊天消息区可连续纵向滚动。
- [ ] 9. 思维壤面板可滚动。
- [ ] 10. 侧边栏内容可滚动，底部“海岸更新 / 关于海岸”可见且不挤压主入口。
- [ ] 11. feature panel、modal、overlay 与长页面可滚动。
- [ ] 12. 返回键先走 WebView 历史；无历史时第一次提示、第二次退出。
- [ ] 13. 左右边缘手势返回行为与返回键一致。
- [ ] 14. 原生右上角菜单六项均可点按。
- [ ] 15. “刷新海岸”保留当前路由并正常重载。
- [ ] 16. “清缓存重载”可恢复页面，且不会主动删除 Cookie。
- [ ] 17. “关于元素海岸”显示 A2.0、1.0.1-a2、versionCode 2、packageName、Web、MCP 与入口地址。
- [ ] 18. “检查 APP 更新”能读取 production 清单；当前显示已是最新版，且说明暂无公开 APK 链接。
- [ ] 19. Web 侧“海岸更新”与 `/updates` 页面可打开，版本一致。
- [ ] 20. 站内链接留在 APP；外部链接、下载链接交给默认 Chrome / 系统下载能力。
- [ ] 21. 断网启动或加载失败出现原生错误页；恢复网络后重试可恢复。
- [ ] 22. 切到后台 30 秒与 5 分钟后回来不白屏、不重置当前输入场景。
- [ ] 23. APP 保持竖屏；状态栏、刘海、手势条和三键导航不遮挡内容。
- [ ] 24. 卸载 / 重装前明确会清除 APP Cookie、本地存储与登录态。
- [ ] 25. 安装前将 APK SHA-256 与交付报告或正式更新清单逐字对照。

还应逐项打开主聊天、思维壤、记忆、日历、灯塔、信箱、Radio、Dogtalk、Daily、工作台 / 工具入口，确认内部导航不误跳系统浏览器，页面状态与滚动均可恢复。

## CI

`.github/workflows/android-shell.yml` 在 A2 Android 或更新中心文件变化时执行：

- Gradle wrapper validation
- 根 `npm test`
- Cloudflare Pages Functions build
- `lintDebug` / `lintRelease`
- `assembleDebug` / `assembleRelease`
- Android 16 emulator 安装与 10 秒存活 smoke test
- debug / unsigned release APK 与 SHA-256 artifact 上传

CI 未配置私有 release signing 时，release 产物保持 unsigned，这是预期行为。

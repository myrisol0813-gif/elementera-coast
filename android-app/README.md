# CoastGPT Android APP A3

CoastGPT Android APP A3 是现有线上海岸的本地原生入口。手机桌面与壳层名称为 CoastGPT；Web 内仍保留“元素海岸 / Elementera Coast”的世界观名称。A3 把启动、菜单、关于、更新骨架和断网恢复留在 APK 内，不重写聊天，也不改变 Cloudflare、MCP、记忆或 P6.3 clean-context contract。

## 当前版本

- APP 显示名称：CoastGPT
- 项目名：Elementera Coast
- packageName：`com.elementeracoast.app`
- releaseName：A3.0
- versionName：`1.0.2-a3`
- versionCode：`3`
- minSdk：26
- targetSdk / compileSdk：36
- 技术栈：Java 17、原生 Android View、单 Activity、WebView
- WebView 地址：`https://app.elementeracoast.com`
- 更新清单：`https://app.elementeracoast.com/public/app-update.json`
- 公开更新页：`https://app.elementeracoast.com/updates/`
- Web 标签：A3 / P6.4+A1+A2
- MCP expectedVersion：1.9.2

工程没有 Compose、AndroidX、Google Play Services 或第三方运行时依赖。

## A3 已实现

- JavaScript、DOM storage、数据库存储、第一方 Cookie 与 WebView 缓存已启用。
- 同域导航留在 APP；外部 HTTP(S)、mailto、tel 与下载链接交给系统应用。
- Cookie 在暂停时 flush；普通刷新与资源缓存清理不会主动删除 Cookie 或登录态。
- Android 历史返回优先；无历史时两秒内双击返回退出。
- Android 13+ predictive back 覆盖 ColorOS 手势返回路径。
- `adjustResize` 配合 system bar、cutout 与 IME insets 处理键盘和安全区。
- WebView 没有 SwipeRefresh 或拦截触控的父容器；滚动仍由 PWA 自己管理。
- 固定 46dp 原生顶栏已移除；WebView 占满壳层内容区，仅保留贴边低干扰的本地悬浮菜单按钮。
- 启动骨架只在首屏显示并平滑淡出；普通站内导航不隐藏当前 WebView，也不会重新创建 Activity。
- 原生菜单包含刷新、首页、清缓存重载、检查更新、系统浏览器和关于入口，断网时仍可打开。
- “检查更新”和“关于 CoastGPT”先显示 APK 内基础信息，再异步读取 production update manifest；断网不白屏、不崩溃。
- 原生更新中心与关于页不再通过 `WebView.loadUrl()` 打开线上页面；需要网页版时明确交给系统浏览器。
- User-Agent 后缀为 `ElementeraCoastApp/1.0.2-a3 Android`，只供 Web UI 与更新诊断识别。
- WebView 使用系统 HTTP cache 与 PWA Service Worker 的 CORE 预缓存；主框架网络失败时自动尝试一次 `LOAD_CACHE_ONLY`，再回退到本地错误页。
- 主框架网络错误、HTTP 5xx 与 SSL 校验失败显示本地错误页，提供重试、清缓存重载和系统浏览器入口。
- light/dark 原生颜色来自系统模式；页面成功载入后，状态栏与导航栏可跟随页面 `theme-color`，图标明暗按对比度切换。
- launcher、roundIcon、启动页和本地骨架均使用仓库原有深蓝旧金花结图；adaptive icon 用完整底图，避免 foreground 安全区造成二次缩小。
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

未来可以评估通知、本地状态、手机小纸条和 LoverConnect bridge，但它们均不在 A3 权限与代码路径中。

## APK 内本地内容与离线边界

以下内容不依赖线上海岸即可显示：

- launcher / round icon、Android 12+ splash 与首屏本地 loading skeleton；
- 悬浮菜单及全部菜单文案；
- 关于 CoastGPT 的 APP 版本、packageName、WebView 地址、预期 Web / MCP 基础信息；
- APP 更新中心骨架、空 APK URL 提示、debug / release 签名说明；
- 网络 / SSL 错误页及重试、清缓存重载、系统浏览器按钮。

离线不承诺聊天、MCP、登录、数据写入或最新版本清单。已访问资源由 WebView cache 与现有 PWA Service Worker 尽力恢复；没有可用缓存时显示本地错误页。A3 不打包线上海岸业务代码副本，避免与 canonical Web / Cloudflare runtime 形成两套前端。

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
2. versionCode 高于已安装版本；A3 的 versionCode 为 3；
3. 新旧 APK 使用同一签名 key。

A1、A2、A3 的 versionCode 已递增，只有使用同一签名时才能覆盖安装。此前 A1 与 A2 debug APK 已确认来自不同 debug key；A3 CI debug 也可能使用新的 ephemeral debug key，因此 ColorOS 可能拒绝覆盖。需要卸载旧 debug 版时，卸载会清除 APP 的 WebView Cookie、本地存储与登录态。长期更新必须建立并保管同一个 release keystore。

## 更新中心

公开只读清单：

```text
https://app.elementeracoast.com/public/app-update.json
```

公开页面：

```text
https://app.elementeracoast.com/updates/
```

本地“CoastGPT 更新中心”打开时先显示 APK 内版本与签名说明，再尝试读取清单：

- 本机 versionCode 小于 latestVersionCode：提示有新版；
- 本机 versionCode 等于或高于 latestVersionCode：提示当前已是最新；
- `apkUrl` 为空：明确提示暂无公开 APK 下载链接；
- 读取失败：显示“离线，暂未读取线上清单”，本地内容和按钮继续存在；
- 不后台轮询、不强弹窗、不自动下载、不自动安装。

“关于 CoastGPT”显示 APP 名称、世界观名称、versionName、versionCode、releaseName、packageName、WebView 地址，并在能读取清单时显示当前 Web label / commit 与 MCP expectedVersion。

Web 侧“海岸更新 / 关于海岸”只读取公开清单并渲染 UI。APP 模式来自 User-Agent，不写入 localStorage，不进入聊天请求、思维壤、模型上下文或 MCP，也不能作为认证依据。

## 刷新与缓存语义

- “刷新海岸”：普通 `WebView.reload()`。
- “重新打开首页”：载入 `https://app.elementeracoast.com` 后清掉旧 WebView 导航历史。
- “清缓存重载”：清 WebView HTTP 资源缓存和当前站点 Cache Storage，再重载首页。
- 默认导航：保持 `LOAD_DEFAULT` 缓存策略；网络主框架失败时只自动尝试一次 `LOAD_CACHE_ONLY`。
- PWA Service Worker：现有 CORE 清单继续预缓存首页、主 CSS / JS、updates 页面与 icon 资源；APP 不创建第二个隐藏 WebView 抢登录态或增加首屏负担。

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

确认使用 A3 APK，并记录输入法名称、横竖屏状态和 ColorOS 导航方式。A3 继续使用 `adjustResize` 与 IME insets；不要在 Web 侧添加全局 `overflow:hidden` 或壳层 CSS 补丁。

### 无法检查更新

在系统浏览器打开 `https://app.elementeracoast.com/public/app-update.json`。若浏览器可读而 APP 不可读，记录网络类型、WebView 版本和系统时间，再重试。海岸正文加载不依赖更新清单。

### APK 无法覆盖安装

核对 packageName、versionCode 和签名。最常见原因是两个 debug APK 来自不同 debug key。只有在确认可以接受清除 APP WebView 数据时才卸载旧版。

### `app-update.json` 返回 401 或格式错误

该清单应匿名返回 HTTP 200。检查 Cloudflare public static whitelist、`_headers` 和 production deployment；不要把它改成认证端点，也不要在清单中放 token、内部路径或 CI 私有 artifact URL。

## OPPO Reno14 / ColorOS 16 / Android 16 真机清单

目标机：PLA110，ColorOS 16.0.7，Android 16。

- [ ] 1. A3 APK 可从文件管理器或 ADB 安装；桌面名称显示 CoastGPT。
- [ ] 2. 仅在签名一致时用 `adb install -r` 覆盖；签名不一致时明确卸载会清登录态。
- [ ] 3. 桌面 adaptive / round icon 使用原有深蓝旧金花结图，主体不被二次缩小或异常裁切。
- [ ] 4. 冷启动使用同一图标，随后本地骨架平滑淡出，不闪白、不闪退。
- [ ] 5. 正常海岸页面没有固定顶部 46dp 深蓝原生栏，也没有额外底部深蓝壳区。
- [ ] 6. 线上海岸或密码门成功出现。
- [ ] 7. 登录成功；服务端有效期内退出到桌面再回来仍保持登录态。
- [ ] 8. 主聊天可输入、长文本换行并发送。
- [ ] 9. 键盘弹起时输入框、光标与发送按钮不被遮挡，收起后布局恢复。
- [ ] 10. 主聊天消息区可连续纵向滚动。
- [ ] 11. 思维壤面板可滚动。
- [ ] 12. 侧边栏、feature panel、modal、overlay 与长页面可滚动。
- [ ] 13. 普通站内入口切换保留当前 WebView，不出现明显整页壳层重开。
- [ ] 14. 返回键与边缘手势先走 WebView 历史；无历史时双击退出。
- [ ] 15. 悬浮原生菜单六项均可点按，且不拦截页面纵向滚动。
- [ ] 16. “刷新海岸”保留当前路由并正常重载。
- [ ] 17. “清缓存重载”可恢复页面，且不删除 Cookie、localStorage、sessionStorage 或 IndexedDB。
- [ ] 18. “关于 CoastGPT”离线即可显示 A3.0、1.0.2-a3、versionCode 3、packageName、Web 与 MCP 基础信息。
- [ ] 19. “检查 APP 更新”联网时读取 production 清单，断网时保留本地更新骨架并提示清楚。
- [ ] 20. Web 侧“海岸更新”与 `/updates/` 页面可打开，版本一致。
- [ ] 21. 站内链接留在 APP；外部链接、下载链接交给默认 Chrome / 系统能力。
- [ ] 22. 有可用缓存时断网尽量显示最近海岸；无缓存时显示本地错误页，菜单与三个恢复按钮仍在。
- [ ] 23. 恢复网络后“重试”可进入海岸；SSL 错误不被绕过。
- [ ] 24. 切到后台 30 秒与 5 分钟后回来不白屏、不重置当前输入场景。
- [ ] 25. APP 保持竖屏；light/dark 与页面主题色切换后状态栏、刘海、手势条和三键导航不遮挡内容。
- [ ] 26. 安装前将 APK SHA-256 与交付报告逐字对照。

还应逐项打开主聊天、思维壤、记忆、日历、灯塔、信箱、Radio、Dogtalk、Daily、工作台 / 工具入口，确认内部导航不误跳系统浏览器，页面状态与滚动均可恢复。

## CI

`.github/workflows/android-shell.yml` 在 A3 Android 或更新中心文件变化时执行：

- Gradle wrapper validation
- 根 `npm test`
- Cloudflare Pages Functions build
- `lintDebug` / `lintRelease`
- `assembleDebug` / `assembleRelease`
- Android 16 emulator 安装与 10 秒存活 smoke test
- debug / unsigned release APK 与 SHA-256 artifact 上传

CI 未配置私有 release signing 时，release 产物保持 unsigned，这是预期行为。

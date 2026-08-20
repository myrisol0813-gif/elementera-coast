# Elementera Coast Android shell A1

元素海岸 Android 壳 A1 是现有线上海岸的轻量原生入口。它不重写聊天、思维壤、信箱、灯塔、日历、Radio、Dogtalk、Daily 或 MCP；这些能力仍由 Cloudflare canonical runtime 提供。

## A1 基线

- APP 名称：元素海岸
- 项目名：Elementera Coast
- packageName：`com.elementeracoast.app`
- 发布名：A1.0
- versionName：`1.0.0-a1`
- versionCode：`1`
- minSdk：26
- targetSdk / compileSdk：36
- 技术栈：Java 17、原生 Android View、单 Activity、WebView
- WebView 地址：`https://app.elementeracoast.com`
- Web 基线：P6.4 / `c8cc53b`
- MCP 预期版本：1.9.2
- Gradle：8.13
- Android Gradle Plugin：8.13.2

工程没有 Compose、AndroidX、Google Play Services 或第三方运行时依赖。

## 已实现

- 同域导航始终留在 WebView；外部 HTTP(S)、mailto 与 tel 链接交给系统应用。
- JavaScript、DOM storage、数据库存储、第一方 Cookie 与 WebView 缓存已启用。
- Cookie 会在暂停时 flush，因此 12 小时海岸会话可按服务端规则保持。
- 第三方 Cookie、明文 HTTP、mixed content、文件系统直读、自动弹窗与地理位置已关闭。
- Android 历史返回优先；无历史时采用两秒内双击返回退出。
- Android 13+ 注册 predictive back 回调，覆盖 ColorOS 手势返回路径。
- `adjustResize` 与 Android 11+ 的 system bar、cutout、IME insets 共同处理键盘和安全区。
- WebView 没有 SwipeRefresh 或触摸拦截父容器；页面纵向滚动由 WebView 与 PWA 自己处理。
- 原生窄工具栏提供刷新、首页、清资源缓存、检查更新、系统浏览器和关于入口。
- 主框架网络错误、HTTP 5xx 与 SSL 校验失败会显示可操作错误页，不留下白屏。
- 下载链接交给系统浏览器或下载能力；A1 不在应用内静默下载或安装。
- Web 文件选择器使用系统文档选择器，不申请存储、相机或麦克风权限。
- Android 12+ 使用系统启动页；旧系统使用深蓝旧金静态启动背景。
- 复用现有海岸 PWA 图标作为 A1 图标与启动标记。
- 固定竖屏，与现有 PWA `orientation: portrait` 保持一致。

## A1 明确不包含

- 原生聊天重写
- LoverConnect bridge
- 截图、通知监听、无障碍、设备管理员、锁屏或后台保活
- 手机状态上传、本地 MCP 或 Myrisol Gateway
- QQ、微信、Telegram 等外部入口
- 自动下载、自动安装 APK
- Google Play 发布或 Play 服务
- Web 主聊天 UI 的更新后台

后续可以评估通知、本地状态、小纸条与 LoverConnect bridge，但它们均不在 A1 权限与代码路径中。

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
  build.gradle.kts
  settings.gradle.kts
  gradlew
  gradlew.bat
  README.md
```

## 构建环境

推荐：

- Android Studio Narwhal 或更新稳定版
- JDK 17
- Android SDK Platform 36
- Android SDK Build-Tools 36.x

首次同步需要访问 Google Maven、Maven Central 与 Gradle distribution 服务。

### Android Studio

1. 选择 Open，打开仓库中的 `android-app/`。
2. 确认 Gradle JDK 为 17。
3. 在 SDK Manager 安装 Android SDK Platform 36 与 Build-Tools 36.x。
4. 等待 Gradle Sync 完成。
5. 选择 `app` 配置，在真机或模拟器运行。

### 命令行 debug APK

```bash
cd android-app
./gradlew clean lintDebug assembleDebug
```

产物：

```text
android-app/app/build/outputs/apk/debug/app-debug.apk
```

debug APK 使用 Gradle 自动创建的本机 debug key。它适合 A1 真机测试，不应作为长期发行签名。

### 命令行 release APK

未配置 release signing 时：

```bash
cd android-app
./gradlew clean lintRelease assembleRelease
```

产物是未签名 release APK：

```text
android-app/app/build/outputs/apk/release/app-release-unsigned.apk
```

正式或可覆盖更新的 release APK 应使用长期保存的同一把签名 key。A1 从以下本地环境变量读取签名，不会把密码写进仓库：

```bash
export COAST_KEYSTORE_FILE=/absolute/path/to/elementera-coast-release.jks
export COAST_KEYSTORE_PASSWORD='local-secret'
export COAST_KEY_ALIAS='elementera-coast'
export COAST_KEY_PASSWORD='local-secret'
./gradlew clean lintRelease assembleRelease
```

不要提交 `.jks`、`.keystore`、密码、token 或 `local.properties`。丢失 release key 后，Android 无法把新 APK 作为同一签名应用覆盖安装。

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

## 安装与覆盖安装

通过 ADB：

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

也可以把 APK 传到 OPPO Reno14，在 ColorOS 的文件管理器中点开。首次侧载时系统可能要求为当前文件来源临时开启“允许安装未知应用”。

覆盖安装必须同时满足：

1. packageName 仍为 `com.elementeracoast.app`；
2. 新 APK 的 versionCode 更高或使用允许降级的调试安装方式；
3. 新旧 APK 使用同一签名 key。

debug APK 与正式 release APK 通常不是同一签名。切换签名时需要先卸载旧版，卸载会清除该 APP 的 WebView 本地数据与 Cookie。

## 更新中心

只读清单位于：

```text
https://app.elementeracoast.com/public/app-update.json
```

原生菜单的“检查 APP 更新”仅在用户点按时读取清单。A1 不后台轮询、不强弹窗、不自动下载。若 `apkUrl` 为空，只显示版本与 release notes；未来填入公开 HTTPS 下载页后，按钮会交给系统浏览器。

清单同时标注：

- Android 壳最新 versionCode / versionName
- Web / PWA 标签与基线 commit
- MCP 预期版本
- APK URL、SHA-256、发布时间与更新说明

发布新 APK 时依次更新 versionCode、versionName、releaseName、apkUrl、sha256、publishedAt 和 releaseNotes。versionCode 必须递增。

## 刷新与缓存语义

- “刷新海岸”：普通 `WebView.reload()`。
- “重新打开首页”：回到 `https://app.elementeracoast.com`，载入后清掉旧 WebView 导航历史。
- “清缓存重载”：清 WebView HTTP 资源缓存，并删除当前站点的 Cache Storage 后重载首页。

清缓存重载不会删除 Cookie、localStorage、sessionStorage 或 IndexedDB，因而不会主动清掉登录态与页面本地状态。若服务端 12 小时会话已过期，重新载入仍会回到海岸密码门。

## 权限

A1 Manifest 只声明：

```text
android.permission.INTERNET
```

系统文档选择器和系统浏览器通过外部 Activity 工作，不需要读取外部存储权限。

## OPPO Reno14 / ColorOS 16 / Android 16 手动测试

目标机：PLA110，ColorOS 16.0.7，Android 16。

- [ ] 1. debug 或同签名 release APK 可安装。
- [ ] 2. 冷启动后启动页消失，线上海岸或密码门成功出现。
- [ ] 3. 登录后退出到桌面再回来，登录态仍在服务端有效期内保持。
- [ ] 4. 主聊天 textarea 可聚焦、输入、长文本换行与发送。
- [ ] 5. Gboard / 系统键盘弹起时，输入框、光标与发送按钮不被遮挡。
- [ ] 6. 键盘收起后 message scroller 与底部 composer 恢复原位。
- [ ] 7. 主聊天消息区可连续纵向滚动。
- [ ] 8. 思维壤、侧边栏、feature panel、modal 与长页面均可滚动。
- [ ] 9. 左右手势返回先走 WebView 历史；无历史时第一次提示、第二次退出。
- [ ] 10. 竖屏保持稳定；A1 明确锁定竖屏。
- [ ] 11. 切到后台 30 秒与 5 分钟后回来不白屏、不重置当前页。
- [ ] 12. 菜单“刷新海岸”可用。
- [ ] 13. “清缓存重载”可用，且不会主动清掉 Cookie / 登录态。
- [ ] 14. 断网启动或加载失败时出现原生错误页；恢复网络后“重试”可恢复。
- [ ] 15. 站内链接留在 APP；外部链接交给默认 Chrome。
- [ ] 16. APK 或普通下载链接能交给系统浏览器 / 下载器，不会静默失败。
- [ ] 17. 图片 / 文件选择入口能调起系统文档选择器，无额外权限弹窗。
- [ ] 18. 刘海、状态栏、手势条与三键导航均不压住工具栏或输入区。
- [ ] 19. 原生“检查 APP 更新”能读取清单，A1 显示已是最新版。
- [ ] 20. 使用同签名且更高 versionCode 的 APK 可执行 `adb install -r` 覆盖安装。

ColorOS 若对侧载 APK 显示风险提醒，应核对 packageName、签名与 SHA-256 后再继续；不要关闭系统级安全能力来绕过正常提示。

## CI

仓库的 `.github/workflows/android-shell.yml` 会在 Android 工程或更新清单变化时执行 wrapper 校验、lint、debug/release 构建，并上传 APK 与 SHA-256 清单。CI release 在未提供私有签名配置时是 unsigned，这是预期行为。

# CoastGPT Android release checklist

这份清单用于发布可长期覆盖安装的 signed release APK。debug APK 只供测试，unsigned release APK 不能直接安装。

## 1. 确认版本与边界

- [ ] `applicationId` / packageName 保持 `com.elementeracoast.app`。
- [ ] `versionCode` 高于已发布版本。
- [ ] `versionName` 与 `releaseName` 已统一；A4 基线为 `1.0.3-a4` / `4` / `A4.0`。
- [ ] 本轮没有新增未批准权限、Gateway、LoverConnect、本地 MCP 或模型上下文包装。

## 2. 创建并保管 release keystore

仅在私有本地环境执行一次：

```bash
keytool -genkeypair -v \
  -keystore /absolute/private/path/elementera-coast-release.jks \
  -alias elementera-coast \
  -keyalg RSA -keysize 4096 -validity 10000
```

- [ ] keystore 保存在用户私有、离线且有备份的位置。
- [ ] keystore、密码和恢复材料不在仓库、聊天记录或公开云盘中。
- [ ] `.jks`、`.keystore`、`.p12` 和本地环境文件保持 Git 忽略。
- [ ] 记录证书指纹；丢失 key 将失去同签名覆盖更新能力。

## 3. 配置签名

本地构建可使用：

```bash
export COAST_KEYSTORE_FILE=/absolute/private/path/elementera-coast-release.jks
export COAST_KEYSTORE_PASSWORD='local-secret'
export COAST_KEY_ALIAS='elementera-coast'
export COAST_KEY_PASSWORD='local-secret'
```

若以后在 GitHub Actions 签名：

- [ ] keystore 以加密 secret / base64 secret 方式保存，运行时写入临时路径。
- [ ] 密码和 alias 使用 GitHub Actions Secrets，不写入 workflow 明文。
- [ ] job 结束后不上传 keystore，不在日志打印 secret 或绝对私有路径。
- [ ] 只有受保护的 release workflow 可读取 signing secrets。

## 4. 构建和核验

```bash
cd android-app
./gradlew clean lintDebug lintRelease assembleDebug assembleRelease
```

- [ ] `lintDebug`、`lintRelease`、`assembleDebug`、`assembleRelease` 全部通过。
- [ ] release 输出不是 `app-release-unsigned.apk`，并可通过 `apksigner verify --verbose --print-certs`。
- [ ] 在 Android 16 模拟器与 OPPO Reno14 真机完成冷启动和更新中心 smoke test。
- [ ] 核对桌面名称 CoastGPT、旧图标 adaptive 裁切、无固定原生顶栏、light/dark 系统栏与断网本地壳。
- [ ] 使用已安装正式版执行一次同签名覆盖安装。

## 5. 计算并记录 APK SHA-256

```bash
sha256sum app/build/outputs/apk/release/app-release.apk
```

- [ ] 记录文件名、字节数、SHA-256、versionCode、versionName 与签名证书指纹。
- [ ] 交付前再次从最终上传文件计算 SHA-256，不能只信任本地中间产物。

## 6. 发布下载地址

- [ ] 将 signed release APK 上传到 GitHub Release 或海岸长期下载页。
- [ ] 不使用 14 天过期的 CI artifact 作为公开长期 URL。
- [ ] 下载地址使用 HTTPS，匿名可访问，不泄露仓库 secret 或内部路径。
- [ ] 下载后的 APK SHA-256 与本地最终记录一致。

## 7. 更新公开清单

更新 `elementera-mcp/deploy-pages/public/app-update.json`：

- [ ] `android.latestVersionCode`
- [ ] `android.latestVersionName`
- [ ] `android.releaseName`
- [ ] `android.apkUrl`
- [ ] `android.sha256`
- [ ] `android.publishedAt`
- [ ] `android.releaseNotes`
- [ ] `web.label` / `web.commit`
- [ ] `mcp.expectedVersion`

清单只包含公开发布信息，不包含 token、密码、keystore、内部路径或 CI 私有 artifact URL。

## 8. 测试、部署与生产回归

- [ ] 根 `npm test` 通过。
- [ ] clean-context / architecture tests 通过。
- [ ] Cloudflare Pages Functions build 通过。
- [ ] `git diff --check` 通过。
- [ ] 合并并部署 Cloudflare production。
- [ ] `/public/app-update.json` 匿名返回 HTTP 200、JSON 字段正确。
- [ ] `/updates/` 返回 HTTP 200，下载按钮与 SHA-256 指向同一个 APK。
- [ ] APP 内“检查更新”能识别新 versionCode 并打开下载页。
- [ ] PWA、MCP health / manifest、30 个业务工具 + 1 个 thinking block 与 `calendar.env` 无退化。
- [ ] P6.3 cleanroom、P6.4 滚动护栏与隐私日志 redaction 测试仍通过。

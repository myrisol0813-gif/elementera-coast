import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFile(resolve(root, path), 'utf8');

const updateManifest = JSON.parse(
  await read('elementera-mcp/deploy-pages/public/app-update.json'),
);
assert.equal(updateManifest.appName, '元素海岸');
assert.deepEqual({
  latestVersionCode: updateManifest.android.latestVersionCode,
  latestVersionName: updateManifest.android.latestVersionName,
  releaseName: updateManifest.android.releaseName,
  webLabel: updateManifest.web.label,
  webCommit: updateManifest.web.commit,
  mcpVersion: updateManifest.mcp.expectedVersion,
}, {
  latestVersionCode: 2,
  latestVersionName: '1.0.1-a2',
  releaseName: 'A2.0',
  webLabel: 'A2 / P6.4+A1',
  webCommit: 'f3f3acd',
  mcpVersion: '1.9.2',
});
assert.equal(updateManifest.android.apkUrl, '');
assert.equal(updateManifest.android.sha256, '');
assert.ok(Array.isArray(updateManifest.android.releaseNotes));
assert.ok(updateManifest.android.releaseNotes.length >= 3);

const settings = await read('android-app/settings.gradle.kts');
const rootBuild = await read('android-app/build.gradle.kts');
const appBuild = await read('android-app/app/build.gradle.kts');
assert.match(settings, /rootProject\.name = "ElementeraCoastAndroid"/);
assert.match(rootBuild, /com\.android\.application"\) version "8\.13\.2"/);
for (const expected of [
  'namespace = "com.elementeracoast.app"',
  'applicationId = "com.elementeracoast.app"',
  'compileSdk = 36',
  'minSdk = 26',
  'targetSdk = 36',
  'versionCode = 2',
  'versionName = "1.0.1-a2"',
  'RELEASE_NAME", "\\"A2.0\\"',
  'UPDATE_PAGE_URL',
  'https://app.elementeracoast.com',
]) assert.ok(appBuild.includes(expected), 'Android build contract missing: ' + expected);

const androidManifest = await read('android-app/app/src/main/AndroidManifest.xml');
const permissions = [...androidManifest.matchAll(
  /<uses-permission\s+android:name="([^"]+)"\s*\/>/g,
)].map((match) => match[1]);
assert.deepEqual(permissions, ['android.permission.INTERNET']);
for (const forbiddenPermission of [
  'BIND_ACCESSIBILITY_SERVICE',
  'BIND_NOTIFICATION_LISTENER_SERVICE',
  'BIND_DEVICE_ADMIN',
  'READ_EXTERNAL_STORAGE',
  'WRITE_EXTERNAL_STORAGE',
  'ACCESS_FINE_LOCATION',
  'CAMERA',
  'RECORD_AUDIO',
  'SYSTEM_ALERT_WINDOW',
  'SCHEDULE_EXACT_ALARM',
]) assert.equal(androidManifest.includes(forbiddenPermission), false);
for (const expected of [
  'android:usesCleartextTraffic="false"',
  'android:networkSecurityConfig="@xml/network_security_config"',
  'android:allowBackup="false"',
  'android:screenOrientation="portrait"',
  'android:windowSoftInputMode="adjustResize"',
  'android:enableOnBackInvokedCallback="true"',
]) assert.ok(androidManifest.includes(expected), 'Android manifest missing: ' + expected);

const mainActivity = await read(
  'android-app/app/src/main/java/com/elementeracoast/app/MainActivity.java',
);
for (const expected of [
  'setJavaScriptEnabled(true)',
  'setDomStorageEnabled(true)',
  'setAcceptCookie(true)',
  'setAcceptThirdPartyCookies(webView, false)',
  'MIXED_CONTENT_NEVER_ALLOW',
  'setAllowFileAccess(false)',
  'SOFT_INPUT_ADJUST_RESIZE',
  'WindowInsets.Type.ime()',
  'webView.canGoBack()',
  'DOUBLE_BACK_EXIT_WINDOW_MS',
  'webView.clearCache(true)',
  "caches.keys()",
  'FileChooserParams.parseResult',
  'ElementeraCoastApp/',
  'BuildConfig.UPDATE_PAGE_URL',
  'buildAboutMessage(updateInfo)',
  '更新清单已存在，但暂无公开 APK 下载链接',
]) assert.ok(mainActivity.includes(expected), 'Android shell behavior missing: ' + expected);
assert.equal(mainActivity.includes('addJavascriptInterface'), false);
assert.equal(mainActivity.includes('removeAllCookies'), false);
assert.equal(mainActivity.includes('deleteAllData'), false);

const webViewClient = await read(
  'android-app/app/src/main/java/com/elementeracoast/app/CoastWebViewClient.java',
);
assert.match(webViewClient, /internalHost\.equals/);
assert.match(webViewClient, /delegate\.openExternalUri/);
assert.match(webViewClient, /request\.isForMainFrame\(\)/);
assert.match(webViewClient, /handler\.cancel\(\)/);

const updateChecker = await read(
  'android-app/app/src/main/java/com/elementeracoast/app/CoastUpdateChecker.java',
);
assert.match(updateChecker, /MAX_MANIFEST_BYTES = 64 \* 1024/);
assert.match(updateChecker, /"https"\.equalsIgnoreCase/);
assert.match(updateChecker, /setInstanceFollowRedirects\(false\)/);
assert.match(updateChecker, /ElementeraCoastApp\/" \+ BuildConfig\.VERSION_NAME \+ " Android/);

const middleware = await read('functions/_middleware.js');
assert.match(middleware, /'\/public\/app-update\.json'/);
for (const publicUpdatePath of [
  "'/updates'",
  "'/updates.html'",
  "'/public/updates-page.js'",
  "'/public/styles/updates.css'",
]) assert.ok(middleware.includes(publicUpdatePath), `public updates route missing: ${publicUpdatePath}`);
const headers = await read('elementera-mcp/deploy-pages/_headers');
assert.match(headers, /^\/public\/app-update\.json\n[\s\S]*?Content-Type: application\/json; charset=utf-8[\s\S]*?Access-Control-Allow-Origin: \*$/m);

const updatesHtml = await read('elementera-mcp/deploy-pages/updates.html');
for (const expected of [
  '<title>海岸更新 · Elementera Coast</title>',
  'id="androidVersion"',
  'id="apkSha"',
  'id="releaseNotes"',
  'debug APK 只用于测试',
  '/public/updates-page.js',
]) assert.ok(updatesHtml.includes(expected), `public updates page missing: ${expected}`);

const updatesFeature = await read('elementera-mcp/deploy-pages/public/features/updates.js');
for (const expected of [
  'ElementeraCoastApp\\/([^\\s]+)\\s+Android',
  "credentials: 'omit'",
  "router.register('coast-updates'",
  "router.register('coast-about'",
  'document.documentElement.dataset.coastRuntime',
  '不会写入思维壤、不会进入模型上下文',
]) assert.ok(updatesFeature.includes(expected), `APP updates feature missing: ${expected}`);
assert.equal(updatesFeature.includes('addJavascriptInterface'), false);
assert.equal(updatesFeature.includes('localStorage'), false);

const wrapperProperties = await read('android-app/gradle/wrapper/gradle-wrapper.properties');
assert.match(wrapperProperties, /gradle-8\.13-bin\.zip/);
assert.match(
  wrapperProperties,
  /distributionSha256Sum=20f1b1176237254a6fc204d8434196fa11a4cfb387567519c61556e8710aed78/,
);

const workflow = await read('.github/workflows/android-shell.yml');
for (const expected of [
  'gradle/actions/wrapper-validation@v4',
  './gradlew lintDebug lintRelease assembleDebug assembleRelease',
  'actions/upload-artifact@v4',
  'elementera-coast-android-a2',
]) assert.ok(workflow.includes(expected), 'Android CI missing: ' + expected);

console.log('android shell contract tests passed');

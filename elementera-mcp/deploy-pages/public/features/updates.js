import { escapeAttribute, escapeHtml } from '../core/dom.js';

const MANIFEST_URL = '/public/app-update.json';
const APP_UA_PATTERN = /ElementeraCoastApp\/([^\s]+)\s+Android/i;

function appRuntime() {
  const match = String(navigator.userAgent || '').match(APP_UA_PATTERN);
  return match
    ? { app: true, version: match[1] }
    : { app: false, version: '' };
}

function httpsUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function cleanManifest(value) {
  if (!value || typeof value !== 'object' || !value.android || !value.web || !value.mcp) {
    throw new Error('invalid_update_manifest');
  }
  const versionCode = Number(value.android.latestVersionCode);
  if (!Number.isInteger(versionCode) || versionCode < 1) {
    throw new Error('invalid_update_version');
  }
  return value;
}

function detailRows(manifest, runtime) {
  const android = manifest.android;
  return `<section class="updates-grid">
    <article class="updates-card">
      <h2>当前入口</h2>
      <dl>
        <dt>运行方式</dt><dd>${runtime.app ? `Android APP 壳 · ${escapeHtml(runtime.version)}` : 'PWA / 系统浏览器'}</dd>
        <dt>APP 模式用途</dt><dd>只用于界面与更新诊断，不作为身份或权限依据。</dd>
      </dl>
    </article>
    <article class="updates-card">
      <h2>公开版本</h2>
      <dl>
        <dt>Web</dt><dd>${escapeHtml(manifest.web.label || '未标注')} · ${escapeHtml(manifest.web.commit || '未标注')}</dd>
        <dt>Android</dt><dd>${escapeHtml(android.latestVersionName || '未标注')}（${escapeHtml(android.latestVersionCode)}）· ${escapeHtml(android.releaseName || '未标注')}</dd>
        <dt>MCP 预期</dt><dd>${escapeHtml(manifest.mcp.expectedVersion || '未标注')}</dd>
        <dt>发布时间</dt><dd>${escapeHtml(android.publishedAt || '待发布')}</dd>
        <dt>SHA-256</dt><dd>${escapeHtml(android.sha256 || '待正式 APK 发布')}</dd>
      </dl>
    </article>
    <article class="updates-card">
      <h2>APK 下载</h2>
      ${httpsUrl(android.apkUrl)
        ? `<p class="feature-note">已提供公开 HTTPS 下载地址。安装前请核对版本与 SHA-256。</p><a class="updates-link" href="${escapeAttribute(httpsUrl(android.apkUrl))}">打开 APK 下载页</a>`
        : '<p class="feature-note">APK 下载链接待发布。不会显示假链接，也不会把临时 CI artifact 当作长期下载地址。</p>'}
      <a class="updates-link" href="/updates">打开独立更新页</a>
    </article>
    <article class="updates-card">
      <h2>更新说明</h2>
      <ul>${(Array.isArray(android.releaseNotes) ? android.releaseNotes : [])
        .map((note) => `<li>${escapeHtml(note)}</li>`).join('') || '<li>暂无公开更新说明。</li>'}</ul>
    </article>
    <article class="updates-card">
      <h2>安装与签名</h2>
      <p class="feature-note">debug APK 只用于测试；unsigned release 不能直接安装。覆盖安装要求 packageName 与签名一致，并递增 versionCode。长期 release keystore 必须保存在私有离线位置，不能提交到仓库。</p>
    </article>
  </section>`;
}

export function createUpdates({ router, toast }) {
  let manifestPromise = null;

  async function manifest({ refresh = false } = {}) {
    if (refresh) manifestPromise = null;
    if (!manifestPromise) {
      manifestPromise = fetch(MANIFEST_URL, {
        cache: 'no-store',
        credentials: 'omit',
        headers: { Accept: 'application/json' },
      }).then(async (response) => {
        if (!response.ok) throw new Error('update_manifest_unavailable');
        return cleanManifest(await response.json());
      }).catch((error) => {
        manifestPromise = null;
        throw error;
      });
    }
    return manifestPromise;
  }

  async function updatesView() {
    try {
      const value = await manifest();
      return {
        title: '海岸更新',
        subtitle: 'Web / Android / MCP',
        body: detailRows(value, appRuntime()),
      };
    } catch {
      return {
        title: '海岸更新',
        subtitle: '暂时没有读到公开清单',
        body: `<section class="updates-card">
          <h2>海风暂时没有带回版本信</h2>
          <p class="feature-note">海岸其他功能仍可正常使用。确认网络后可以重试，或打开独立更新页。</p>
          <div class="button-row">
            <button class="primary" type="button" data-action="updates:refresh">重新读取</button>
            <a class="updates-link" href="/updates">打开独立更新页</a>
          </div>
        </section>`,
      };
    }
  }

  async function aboutView() {
    try {
      const value = await manifest();
      const runtime = appRuntime();
      return {
        title: '关于海岸',
        subtitle: value.appName || 'Elementera Coast',
        body: `<section class="updates-grid">
          <article class="updates-card">
            <h2>${escapeHtml(value.appName || '元素海岸')}</h2>
            <p class="feature-note">现有线上海岸的稳定入口。聊天、思维壤、记忆、日历、灯塔、信箱、Radio、Dogtalk、Daily 与工具能力仍由 canonical Web / Cloudflare / MCP runtime 提供。</p>
            <dl>
              <dt>当前入口</dt><dd>${runtime.app ? `Android APP 壳 · ${escapeHtml(runtime.version)}` : 'PWA / 系统浏览器'}</dd>
              <dt>Web</dt><dd>${escapeHtml(value.web.label || '未标注')} · ${escapeHtml(value.web.commit || '未标注')}</dd>
              <dt>公开 APP</dt><dd>${escapeHtml(value.android.latestVersionName || '未标注')} · ${escapeHtml(value.android.releaseName || '未标注')}</dd>
              <dt>MCP 预期</dt><dd>${escapeHtml(value.mcp.expectedVersion || '未标注')}</dd>
            </dl>
          </article>
          <article class="updates-card">
            <h2>APP 模式边界</h2>
            <p class="feature-note">APP 模式来自 WebView User-Agent，只做界面与诊断显示；不会写入思维壤、不会进入模型上下文、不会改变 MCP schema，也不作为认证依据。</p>
          </article>
        </section>`,
      };
    } catch {
      return {
        title: '关于海岸',
        subtitle: 'Elementera Coast',
        body: '<section class="updates-card"><h2>元素海岸</h2><p class="feature-note">暂时没有读到公开版本清单，但这不会影响海岸的正常使用。</p></section>',
      };
    }
  }

  router.register('coast-updates', updatesView);
  router.register('coast-about', aboutView);

  function start() {
    const runtime = appRuntime();
    document.documentElement.dataset.coastRuntime = runtime.app ? 'android-app' : 'web';
    if (runtime.app) document.documentElement.dataset.coastAppVersion = runtime.version;
    else delete document.documentElement.dataset.coastAppVersion;
  }

  async function handleAction(name) {
    if (name === 'open') return router.open('coast-updates');
    if (name === 'about') return router.open('coast-about');
    if (name === 'refresh') {
      const refreshed = await manifest({ refresh: true }).then(() => true).catch(() => false);
      await router.refresh({ preserveScroll: false });
      toast(refreshed ? '海岸版本清单已重新读取。' : '暂时没有读到更新清单，请稍后再试。');
    }
    return undefined;
  }

  return Object.freeze({ start, handleAction });
}

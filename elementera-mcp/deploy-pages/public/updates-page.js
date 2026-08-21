const MANIFEST_URL = '/public/app-update.json';
const q = (selector) => document.querySelector(selector);

function text(selector, value) {
  const element = q(selector);
  if (element) element.textContent = String(value || '—');
}

function httpsUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function renderRuntime() {
  const match = String(navigator.userAgent || '').match(/ElementeraCoastApp\/([^\s]+)\s+Android/i);
  text('#runtimeBadge', match ? `Android APP 壳 · ${match[1]}` : 'PWA / 系统浏览器');
  document.documentElement.dataset.coastRuntime = match ? 'android-app' : 'web';
}

function renderManifest(manifest) {
  const android = manifest.android || {};
  text('#webLabel', manifest.web?.label || '未标注');
  text('#webCommit', manifest.web?.commit || '未标注');
  text('#androidVersion', `${android.latestVersionName || '未标注'}（${android.latestVersionCode || '—'}）`);
  text('#releaseName', android.releaseName || '未标注');
  text('#publishedAt', android.publishedAt || '待发布');
  text('#apkSha', android.sha256 || '待正式 APK 发布');
  text('#mcpVersion', manifest.mcp?.expectedVersion || '未标注');

  const notes = q('#releaseNotes');
  notes.replaceChildren();
  const values = Array.isArray(android.releaseNotes) && android.releaseNotes.length
    ? android.releaseNotes
    : ['暂无公开更新说明。'];
  values.forEach((value) => {
    const item = document.createElement('li');
    item.textContent = String(value || '');
    notes.appendChild(item);
  });

  const apkUrl = httpsUrl(android.apkUrl);
  const link = q('#downloadLink');
  const pending = q('#downloadPending');
  link.hidden = !apkUrl;
  pending.hidden = Boolean(apkUrl);
  if (apkUrl) link.href = apkUrl;
  text('#manifestStatus', `公开清单已读取 · ${manifest.appName || '元素海岸'}`);
}

async function loadManifest() {
  text('#manifestStatus', '正在读取公开更新清单…');
  try {
    const response = await fetch(MANIFEST_URL, {
      cache: 'no-store',
      credentials: 'omit',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error('manifest_unavailable');
    const manifest = await response.json();
    if (!manifest?.android || !manifest?.web || !manifest?.mcp) {
      throw new Error('manifest_invalid');
    }
    renderManifest(manifest);
  } catch {
    text('#manifestStatus', '暂时没有读到更新清单。海岸其他功能不受影响，请稍后重试。');
  }
}

q('#retryManifest')?.addEventListener('click', loadManifest);
renderRuntime();
loadManifest();

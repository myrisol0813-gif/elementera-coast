import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Window } from 'happy-dom';
import { onRequest } from '../functions/_middleware.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const featureFile = resolve(root, 'elementera-mcp/deploy-pages/public/features/updates.js');
const manifest = JSON.parse(await readFile(
  resolve(root, 'elementera-mcp/deploy-pages/public/app-update.json'),
  'utf8',
));

const window = new Window({ url: 'https://app.elementeracoast.com/' });
Object.defineProperty(globalThis, 'document', { configurable: true, value: window.document });
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { userAgent: 'Android WebView ElementeraCoastApp/1.0.2-a3 Android' },
});

let fetchOptions = null;
Object.defineProperty(globalThis, 'fetch', {
  configurable: true,
  writable: true,
  value: async (_url, options) => {
    fetchOptions = options;
    return new Response(JSON.stringify(manifest), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  },
});

const renderers = new Map();
let current = '';
const router = {
  register(name, renderer) { renderers.set(name, renderer); },
  async open(name) { current = name; return renderers.get(name)(); },
  async refresh() { return renderers.get(current)(); },
};
const toasts = [];
const { createUpdates } = await import(`${pathToFileURL(featureFile).href}?test=${Date.now()}`);
const updates = createUpdates({ router, toast: (message) => toasts.push(message) });

updates.start();
assert.equal(document.documentElement.dataset.coastRuntime, 'android-app');
assert.equal(document.documentElement.dataset.coastAppVersion, '1.0.2-a3');

const updateView = await updates.handleAction('open');
assert.equal(updateView.title, '海岸更新');
assert.match(updateView.body, /1\.0\.2-a3/);
assert.match(updateView.body, /APK 下载链接待发布/);
assert.equal(fetchOptions.credentials, 'omit');
assert.equal(fetchOptions.cache, 'no-store');

const aboutView = await updates.handleAction('about');
assert.equal(aboutView.title, '关于海岸');
assert.match(aboutView.body, /不会写入思维壤、不会进入模型上下文/);

for (const path of ['/public/app-update.json', '/updates', '/updates/', '/updates/index.html']) {
  let nextCalled = false;
  const response = await onRequest({
    request: new Request(`https://app.elementeracoast.com${path}`),
    env: {},
    next: async () => {
      nextCalled = true;
      return new Response('public', { status: 200 });
    },
  });
  assert.equal(nextCalled, true, `${path} must bypass the login gate`);
  assert.equal(response.status, 200);
}

console.log('updates: ok');

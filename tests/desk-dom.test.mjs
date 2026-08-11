import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../elementera-mcp/deploy-pages');
const read = (file) => readFile(resolve(root, file), 'utf8');
const [html, app, desk, memory, chat, daily, tools, settings, rooms, serviceWorker] = await Promise.all([
  read('index.html'), read('public/app.js'), read('public/features/desk.js'),
  read('public/features/memory.js'), read('public/features/chat.js'), read('public/features/daily.js'),
  read('public/features/tools.js'), read('public/features/settings.js'), read('public/features/rooms.js'),
  read('service-worker.js'),
]);

const window = new Window({ url: 'https://coast.test/' });
window.document.write(html);
window.document.close();
assert.ok(window.document.querySelector('#deskStatus'));
assert.ok(window.document.querySelector('[data-action="daily:home"]'));
assert.match(html, /今日一瞥/);
assert.match(html, /calendar-sidebar-entry[^>]+data-action="daily:calendar"/);
assert.equal(html.includes('context.css'), false);
assert.match(app, /createDesk/);
assert.equal(app.includes('createContext'), false);

for (const retired of ['Context Manifest', 'Context Inspector', 'Memory Facets', 'Ambient Context', 'Mode Cards', '当前情境']) {
  assert.equal([html, app, desk, memory, chat, daily, tools, settings, rooms, serviceWorker].join('\n').includes(retired), false);
}
assert.match(desk, /本轮桌面/);
assert.match(desk, /连通一千零一个触角/);
assert.match(desk, /让 Myri 参考今日海岸/);
assert.match(desk, /海岸词典/);
assert.equal(desk.includes('copy-debug'), false);

for (const tab of ['当前窗口', '电波库', '灯塔库', '总库', '世界书']) assert.ok(memory.includes(`>${tab}</button>`));
for (const action of ['revision_supplement', 'revision_replace', 'revision_new_version', 'revision_downgrade']) assert.ok(memory.includes(action));
assert.match(memory, /记忆修订候选/);
assert.match(memory, /覆盖”不会无痕删除/);
assert.match(chat, /renderSoilEntry\(conversationId\)/);

for (const dailyEntry of ['海岸日历', '碳硅圈', '日记', '相册', '宠物区', '未来小组件']) assert.ok(daily.includes(dailyEntry));
assert.match(tools, /上下文舒服区间/);
assert.match(settings, /本轮桌面与工作台/);
assert.equal(rooms.includes('context-inspector'), false);
assert.match(serviceWorker, /public\/features\/desk\.js/);
assert.equal(serviceWorker.includes('public/features/context.js'), false);

console.log('desk-dom: ok');

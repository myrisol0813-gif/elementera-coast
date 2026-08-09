import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';

const testDir = dirname(fileURLToPath(import.meta.url));
const pages = resolve(testDir, '../elementera-mcp/deploy-pages');
const html = await readFile(resolve(pages, 'index.html'), 'utf8');
const window = new Window({ url: 'https://coast.test/' });
window.document.write(html);
window.document.close();

assert.ok(window.document.querySelector('[data-action="calendar:open"]'));
assert.ok(window.document.querySelector('#calendarUnread'));
assert.ok(window.document.querySelector('#contextStatus'));
assert.equal(window.document.querySelector('[data-action="calendar:open"]')?.closest('#mainRooms') != null, true);
assert.equal(html.includes('data-action="context:inspector"'), false, 'inspector remains in the owner JS controller rather than a visitor/static surface');

const app = await readFile(resolve(pages, 'public/app.js'), 'utf8');
const calendar = await readFile(resolve(pages, 'public/features/calendar.js'), 'utf8');
const context = await readFile(resolve(pages, 'public/features/context.js'), 'utf8');
assert.match(app, /createCalendar/);
assert.match(app, /createContext/);
assert.equal((calendar.match(/router\.register\('calendar-month'/g) || []).length, 1);
assert.equal((context.match(/router\.register\('context-inspector'/g) || []).length, 1);
assert.match(context, /sensitive/);
assert.match(context, /copy-debug/);
assert.match(context, /debug\.manifest \? blockDetails\(debug\.manifest\)/, 'inspector renders the manifest itself');

console.log('context-dom: ok');

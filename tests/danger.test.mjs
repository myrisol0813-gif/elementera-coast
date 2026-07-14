import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';
import {
  createDangerConfirmer,
  dangerConfirmationFor,
  destructiveActions,
} from '../elementera-mcp/deploy-pages/public/core/danger.js';

const testDir = dirname(fileURLToPath(import.meta.url));
const pages = resolve(testDir, '../elementera-mcp/deploy-pages');

const expected = {
  'chat:delete-user': ['删除这条用户消息？', '如果这是这一轮唯一的用户消息，关联的助手回复也会一起从当前窗口移除。', '删除'],
  'chat:delete-assistant': ['删除这条助手回复？', '这只会删除当前选中的助手回复版本；其他窗口不会受到影响。', '删除'],
  'chat:delete-conversation': ['删除这个聊天窗口？', '这个窗口会从侧边栏移除。其他窗口不会受到影响。', '删除窗口'],
  'memory:soil-clear': ['清空当前窗口的思维壤？', '当前、手持种、勿复读和可落袋候选会被清空。聊天记录、落袋、种子和记忆不会被删除。', '清空思维壤'],
  'memory:pocket-discard': ['丢弃这条待确认内容？', '丢弃后它不会进入落袋，也不会参与召回。', '丢弃'],
  'memory:pocket-stone': ['把它转为石头？', '它会沉入石头状态，不再像普通内容一样参与召回。', '转为石头'],
  'memory:entry-delete': ['删除这条记忆内容？', '删除后它会从对应库中移除，并不再参与召回。', '删除'],
  'memory:entry-stone': ['把它转为石头？', '它会沉入石头状态，不再像普通内容一样参与召回。', '转为石头'],
};

for (const [action, [title, message, confirmText]] of Object.entries(expected)) {
  const copy = dangerConfirmationFor(action);
  assert.ok(copy, `${action} must use the unified danger gate`);
  assert.equal(copy.title, title);
  assert.equal(copy.message, message);
  assert.equal(copy.confirmText, confirmText);
  assert.equal(copy.cancelText, '取消');
}

for (const action of [
  'chat:copy', 'chat:like', 'chat:favorite', 'chat:regenerate', 'chat:switch-variant', 'chat:edit-user',
  'chat:new', 'chat:open', 'memory:soil-auto', 'memory:pocket-resolve', 'tools:setting',
]) assert.equal(dangerConfirmationFor(action), null, `${action} must stay confirmation-free`);

const sourceFiles = [
  'public/features/chat.js',
  'public/features/memory.js',
  'public/features/tools.js',
];
const destructivePattern = /(?:delete|clear|discard|trash|remove|stone|archive)/i;
const guarded = new Set(destructiveActions());
for (const file of sourceFiles) {
  const source = await readFile(resolve(pages, file), 'utf8');
  const actions = [...source.matchAll(/data-action=["']([^"']+)["']/g)].map((match) => match[1]);
  for (const action of actions.filter((value) => destructivePattern.test(value))) {
    assert.ok(guarded.has(action), `${action} in ${file} must be registered with confirmDanger`);
  }
}

const window = new Window({ url: 'http://coast.test/' });
const confirmDanger = createDangerConfirmer({ document: window.document, window, history: window.history });
const nextFrame = () => new Promise((resolveFrame) => setTimeout(resolveFrame, 0));

let pending = confirmDanger(dangerConfirmationFor('chat:delete-user'));
await nextFrame();
let dialog = window.document.querySelector('[data-danger-confirm]');
assert.ok(dialog);
assert.equal(dialog.querySelector('h1').textContent, '删除这条用户消息？');
assert.equal(window.document.activeElement, dialog.querySelector('[data-danger-cancel]'), 'cancel must receive default focus');
dialog.querySelector('[data-danger-cancel]').click();
assert.equal(await pending, false, 'cancel must be the safe outcome');
assert.equal(window.document.querySelector('[data-danger-confirm]'), null);

pending = confirmDanger(dangerConfirmationFor('chat:delete-assistant'));
await nextFrame();
dialog = window.document.querySelector('[data-danger-confirm]');
dialog.querySelector('[data-danger-confirm-action]').click();
assert.equal(await pending, true, 'danger action must require the explicit confirm button');

pending = confirmDanger(dangerConfirmationFor('memory:pocket-discard'));
await nextFrame();
dialog = window.document.querySelector('[data-danger-confirm]');
dialog.dispatchEvent(new window.Event('cancel', { cancelable: true }));
assert.equal(await pending, false, 'Esc/dialog cancel must cancel');

pending = confirmDanger(dangerConfirmationFor('memory:entry-delete'));
await nextFrame();
dialog = window.document.querySelector('[data-danger-confirm]');
dialog.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
assert.equal(await pending, false, 'backdrop click must cancel');

pending = confirmDanger(dangerConfirmationFor('chat:delete-conversation'));
await nextFrame();
window.dispatchEvent(new window.Event('popstate'));
assert.equal(await pending, false, 'mobile/browser back must cancel');

for (const file of sourceFiles) {
  const source = await readFile(resolve(pages, file), 'utf8');
  assert.equal(source.includes('confirm('), false, file + ' must not retain a browser-native confirm path');
}

console.log('danger: ok');

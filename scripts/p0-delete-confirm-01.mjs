import { readFile, writeFile } from 'node:fs/promises';

const path = new URL('../tests/dom.test.mjs', import.meta.url);
let source = await readFile(path, 'utf8');

function replaceOnce(label, oldText, newText) {
  const first = source.indexOf(oldText);
  if (first < 0) throw new Error(`missing patch target: ${label}`);
  if (source.indexOf(oldText, first + oldText.length) >= 0) throw new Error(`ambiguous patch target: ${label}`);
  source = `${source.slice(0, first)}${newText}${source.slice(first + oldText.length)}`;
}

replaceOnce('history write counter',
`const histories = new Map([['conv-1', { version: 4, updated_at: now(), turns: [] }]]);
let formalChatRequests = 0;`,
`const histories = new Map([['conv-1', { version: 4, updated_at: now(), turns: [] }]]);
let historyWrites = 0;
let formalChatRequests = 0;`);

replaceOnce('history PUT counter',
`    if (method === 'PUT') histories.set(id, body);`,
`    if (method === 'PUT') {
      historyWrites += 1;
      histories.set(id, body);
    }`);

replaceOnce('danger helpers',
`async function waitFor(test, label, attempts = 100) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (test()) return;
    await tick();
  }
  throw new Error(\`timeout:\${label}\`);
}

await import(\`${'${pathToFileURL(resolve(pages, \'public/app.js\')).href}'}?test=${'${Date.now()}'}\`);`,
`async function waitFor(test, label, attempts = 100) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (test()) return;
    await tick();
  }
  throw new Error(\`timeout:\${label}\`);
}

async function waitForDanger(title) {
  await waitFor(() => document.querySelector('[data-danger-confirm] h1')?.textContent === title, \`danger dialog: \${title}\`);
  return document.querySelector('[data-danger-confirm]');
}

function cancelDanger(dialog) {
  dialog.querySelector('[data-danger-cancel]').click();
}

function acceptDanger(dialog) {
  dialog.querySelector('[data-danger-confirm-action]').click();
}

await import(\`${'${pathToFileURL(resolve(pages, \'public/app.js\')).href}'}?test=${'${Date.now()}'}\`);`);

replaceOnce('soil clear cancel',
`assert.ok(document.querySelector('[data-action="memory:soil-edit"]'));
assert.ok(document.querySelector('[data-action="memory:soil-clear"]'));
document.querySelector('[data-action="memory:done"]').click();`,
`assert.ok(document.querySelector('[data-action="memory:soil-edit"]'));
assert.ok(document.querySelector('[data-action="memory:soil-clear"]'));
const soilBeforeClearCancel = structuredClone(soilFor('conv-1'));
document.querySelector('[data-action="memory:soil-clear"]').click();
let danger = await waitForDanger('清空当前窗口的思维壤？');
assert.ok(danger.textContent.includes('当前、手持种、勿复读和可落袋候选会被清空。聊天记录、落袋、种子和记忆不会被删除。'));
cancelDanger(danger);
await tick();
assert.deepEqual(soilFor('conv-1'), soilBeforeClearCancel, 'cancelled soil clear must not write the cleared state');
document.querySelector('[data-action="memory:done"]').click();`);

replaceOnce('user delete cancel and safe actions',
`assert.deepEqual(
  [...document.querySelectorAll('.message .action-button svg')].map((svg) => svg.getAttribute('viewBox')),
  Array(7).fill('0 0 32 32'),
);

document.querySelector('.message.assistant [data-action="chat:like"]').click();
await tick();
assert.ok(document.querySelector('.message.assistant [data-action="chat:like"]').classList.contains('is-active'));
document.querySelector('.message.assistant [data-action="chat:copy"]').click();
await tick();
assert.equal(clipboard, 'mock: a1');`,
`assert.deepEqual(
  [...document.querySelectorAll('.message .action-button svg')].map((svg) => svg.getAttribute('viewBox')),
  Array(7).fill('0 0 32 32'),
);

const userStateBeforeCancel = structuredClone(histories.get('conv-1'));
const writesBeforeUserCancel = historyWrites;
document.querySelector('.message.user [data-action="chat:delete-user"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
danger = await waitForDanger('删除这条用户消息？');
assert.ok(danger.textContent.includes('如果这是这一轮唯一的用户消息，关联的助手回复也会一起从当前窗口移除。'));
assert.deepEqual(histories.get('conv-1'), userStateBeforeCancel, 'mobile action-row click must stop before mutating the user state');
assert.equal(historyWrites, writesBeforeUserCancel, 'cancel gate must stop the D1 history PUT path');
cancelDanger(danger);
await tick();
assert.deepEqual(histories.get('conv-1'), userStateBeforeCancel);
assert.equal(historyWrites, writesBeforeUserCancel);

document.querySelector('.message.assistant [data-action="chat:like"]').click();
await tick();
assert.ok(document.querySelector('.message.assistant [data-action="chat:like"]').classList.contains('is-active'));
assert.equal(document.querySelector('[data-danger-confirm]'), null, 'like must not open a danger confirmation');
document.querySelector('.message.assistant [data-action="chat:copy"]').click();
await tick();
assert.equal(clipboard, 'mock: a1');
assert.equal(document.querySelector('[data-danger-confirm]'), null, 'copy must not open a danger confirmation');`);

replaceOnce('assistant delete confirm',
`document.querySelector('.message.assistant [data-action="chat:delete-assistant"]').click();
await tick();
assert.equal(document.querySelectorAll('.message.assistant').length, 0);`,
`const writesBeforeAssistantCancel = historyWrites;
document.querySelector('.message.assistant [data-action="chat:delete-assistant"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
danger = await waitForDanger('删除这条助手回复？');
assert.ok(danger.textContent.includes('这只会删除当前选中的助手回复版本；其他窗口不会受到影响。'));
cancelDanger(danger);
await tick();
assert.equal(document.querySelectorAll('.message.assistant').length, 1, 'cancel must keep the assistant reply');
assert.equal(historyWrites, writesBeforeAssistantCancel);
document.querySelector('.message.assistant [data-action="chat:delete-assistant"]').click();
danger = await waitForDanger('删除这条助手回复？');
acceptDanger(danger);
await waitFor(() => document.querySelectorAll('.message.assistant').length === 0, 'confirmed assistant delete');`);

replaceOnce('confirmed unique user delete',
`document.querySelector('#newChatButton').click();
await waitFor(() => document.querySelectorAll('#chatConversationList .conversation-row').length === 2, 'new conversation');
const first = document.querySelector('#chatConversationList .conversation-row');`,
`document.querySelector('#newChatButton').click();
await waitFor(() => document.querySelectorAll('#chatConversationList .conversation-row').length === 2, 'new conversation');
input.value = 'delete unique turn';
input.dispatchEvent(new window.Event('input', { bubbles: true }));
document.querySelector('#composerActionButton').click();
await waitFor(() => document.querySelector('.message.assistant')?.textContent.includes('mock: delete unique turn'), 'disposable assistant reply');
const disposableConversationId = document.querySelector('.conversation-title.is-active')?.closest('[data-conversation-id]')?.dataset.conversationId;
const writesBeforeConfirmedUserDelete = historyWrites;
document.querySelector('.message.user [data-action="chat:delete-user"]').click();
danger = await waitForDanger('删除这条用户消息？');
assert.equal(document.querySelectorAll('.message.user').length, 1);
assert.equal(document.querySelectorAll('.message.assistant').length, 1);
acceptDanger(danger);
await waitFor(() => document.querySelectorAll('.message.user').length === 0 && document.querySelectorAll('.message.assistant').length === 0, 'confirmed unique user turn delete');
assert.equal(histories.get(disposableConversationId).turns.length, 0, 'confirmed unique user delete may remove the whole linked turn');
assert.ok(historyWrites > writesBeforeConfirmedUserDelete, 'confirmed user delete must persist the new state');
const first = document.querySelector('#chatConversationList .conversation-row');`);

replaceOnce('conversation delete confirm',
`renamed.querySelector('[data-action="chat:menu"]').click();
renamed.querySelector('[data-action="chat:delete-conversation"]').click();
await waitFor(() => document.querySelectorAll('#chatConversationList .conversation-row').length === 1, 'delete conversation');`,
`renamed.querySelector('[data-action="chat:menu"]').click();
renamed.querySelector('[data-action="chat:delete-conversation"]').click();
danger = await waitForDanger('删除这个聊天窗口？');
cancelDanger(danger);
await tick();
assert.equal(document.querySelectorAll('#chatConversationList .conversation-row').length, 2, 'cancel must keep the conversation');
renamed.querySelector('[data-action="chat:menu"]').click();
renamed.querySelector('[data-action="chat:delete-conversation"]').click();
danger = await waitForDanger('删除这个聊天窗口？');
assert.ok(danger.textContent.includes('这个窗口会从侧边栏移除。其他窗口不会受到影响。'));
acceptDanger(danger);
await waitFor(() => document.querySelectorAll('#chatConversationList .conversation-row').length === 1, 'delete conversation');`);

replaceOnce('pending pocket discard confirm',
`assert.ok(autoPocketCard.textContent.includes('确认后会同时进入当前窗口落袋与总落袋。当前窗口更容易召回；总落袋默认低频沉睡。'));
autoPocketCard.querySelector('[data-action="memory:pocket-resolve"][data-destination="confirm_pocket"]').click();`,
`assert.ok(autoPocketCard.textContent.includes('确认后会同时进入当前窗口落袋与总落袋。当前窗口更容易召回；总落袋默认低频沉睡。'));
autoPocketCard.querySelector('[data-action="memory:pocket-discard"]').click();
danger = await waitForDanger('丢弃这条待确认内容？');
assert.ok(danger.textContent.includes('丢弃后它不会进入落袋，也不会参与召回。'));
cancelDanger(danger);
await tick();
assert.equal(memoryPockets.find((pocket) => pocket.id === 'soil-pocket-conv-1')?.status, 'pending', 'cancel must keep the pending pocket');
autoPocketCard.querySelector('[data-action="memory:pocket-resolve"][data-destination="confirm_pocket"]').click();
assert.equal(document.querySelector('[data-danger-confirm]'), null, 'confirm pocket must stay confirmation-free');`);

replaceOnce('memory entry delete confirm',
`await waitFor(() => document.querySelector('#overlayRoot')?.dataset.route === 'memory', 'manual memory saved');
assert.ok(memoryEntries.some((entry) => entry.title === '总库家具' && entry.scope === 'global'));
document.querySelector('[data-action="router:back"]').click();`,
`await waitFor(() => document.querySelector('#overlayRoot')?.dataset.route === 'memory', 'manual memory saved');
const manualEntry = memoryEntries.find((entry) => entry.title === '总库家具' && entry.scope === 'global');
assert.ok(manualEntry);
let manualEntryCard = document.querySelector(\`[data-entry-id="\${manualEntry.id}"]\`);
manualEntryCard.querySelector('[data-action="memory:entry-delete"]').click();
danger = await waitForDanger('删除这条记忆内容？');
assert.ok(danger.textContent.includes('删除后它会从对应库中移除，并不再参与召回。'));
cancelDanger(danger);
await tick();
assert.equal(Boolean(manualEntry.deleted_at), false, 'cancel must keep the memory entry');
manualEntryCard = document.querySelector(\`[data-entry-id="\${manualEntry.id}"]\`);
manualEntryCard.querySelector('[data-action="memory:entry-delete"]').click();
danger = await waitForDanger('删除这条记忆内容？');
acceptDanger(danger);
await waitFor(() => Boolean(manualEntry.deleted_at), 'confirmed memory entry delete');
assert.equal(document.querySelector(\`[data-entry-id="\${manualEntry.id}"]\`), null);
document.querySelector('[data-action="router:back"]').click();`);

await writeFile(path, source);
console.log('patched dom.test.mjs for P0 delete confirmations');

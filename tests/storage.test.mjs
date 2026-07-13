import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Window } from 'happy-dom';

const testDir = dirname(fileURLToPath(import.meta.url));
const storageFile = resolve(testDir, '../elementera-mcp/deploy-pages/public/core/storage.js');
const window = new Window({ url: 'http://coast.test/' });
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: window.localStorage });

localStorage.setItem('coast_main_active_v097', 'old-window');
localStorage.setItem('coast_main_windows_v097', JSON.stringify([
  { id: 'old-window', title: '旧窗口', messages: [{ role: 'user', content: '旧问题' }, { role: 'assistant', content: '旧回答' }] },
]));
localStorage.setItem('ec.chat.state.v3.old-window', JSON.stringify({
  version: 3,
  turns: [{
    id: 'old-turn',
    user: { active: 0, variants: [{ id: 'old-user', content: '结构化旧问题' }] },
    assistant: { activeByUserVariant: { 0: 0 }, variantsByUserVariant: { 0: [{ id: 'old-assistant', content: '结构化旧回答' }] } },
  }],
}));
localStorage.setItem('gpt_like_shell_theme_clean_v1', 'gold');
localStorage.setItem('coast_lighthouse_draft_v095', JSON.stringify({ text: '旧灯塔草稿' }));

const { createStorage } = await import(`${pathToFileURL(storageFile).href}?test=${Date.now()}`);
const storage = createStorage();
assert.equal(storage.read().preferences.theme, 'gold');
assert.equal(storage.migrationPending, true);
assert.equal(storage.migrationConversations.length, 1);
assert.equal(storage.migrationConversations[0].id, 'old-window');
assert.equal(storage.migrationConversations[0].state.turns[0].user.variants[0].content, '结构化旧问题');
assert.equal(storage.read().rooms.lighthouse.rooms[0].messages[0].text, '旧灯塔草稿');
assert.equal(storage.read().runControl.seedCooldownTurns, 2);
assert.equal(storage.read().runControl.conversationSeedStallLimit, 4);
assert.equal(storage.read().runControl.autoRefreshEveryTurns, 4);
assert.equal(storage.read().runControl.maxHandSeeds, 7);

storage.completeMigration();
assert.equal(localStorage.getItem('coast_main_windows_v097'), null);
assert.equal(localStorage.getItem('ec.chat.state.v3.old-window'), null);
assert.equal(localStorage.getItem('gpt_like_shell_theme_clean_v1'), null);
assert.equal(localStorage.getItem('coast_lighthouse_draft_v095'), null);
assert.equal(JSON.parse(localStorage.getItem('elementera.local.v1')).migration.pending, false);

console.log('storage: ok');

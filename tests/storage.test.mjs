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
assert.equal(storage.read().runControl.streamingEnabled, false, 'streaming must default to disabled');
assert.equal(storage.read().runControl.seedCooldownTurns, 2);
assert.equal(storage.read().runControl.conversationSeedStallLimit, 4);
assert.equal(storage.read().runControl.autoRefreshEveryTurns, 1);
assert.equal(storage.read().runControl.maxHandSeeds, 7);
assert.equal(storage.read().version, 2);
assert.deepEqual(storage.read().daily.cache.moments, []);
assert.equal(storage.read().daily.legacyStatus, 'none');

storage.completeMigration();
assert.equal(localStorage.getItem('coast_main_windows_v097'), null);
assert.equal(localStorage.getItem('ec.chat.state.v3.old-window'), null);
assert.equal(localStorage.getItem('gpt_like_shell_theme_clean_v1'), null);
assert.equal(localStorage.getItem('coast_lighthouse_draft_v095'), null);
assert.equal(JSON.parse(localStorage.getItem('elementera.local.v1')).migration.pending, false);

localStorage.clear();
localStorage.setItem('elementera.local.v1', JSON.stringify({
  version: 1,
  preferences: { theme: 'light' },
  daily: {
    momentCover: 'data:image/png;base64,COVER',
    moments: [{
      id: 'old-moment',
      date: '2026-07-28',
      text: '本机碳硅圈草稿',
      image: 'data:image/png;base64,MOMENT',
      createdAt: 100,
    }],
    momentLikes: { 'old-moment': true },
    momentComments: { 'old-moment': [{ who: '小寒', text: '旧评论' }] },
    diaries: [{
      id: 'old-diary',
      date: '2026-07-28',
      author: 'xiaohan',
      weather: '雨',
      mood: '安心',
      text: '旧日记',
      image: '',
      updatedAt: 200,
    }],
    albumItems: [],
    summaries: [{ id: 'old-summary', date: '2026-07-28', text: '旧总结', updatedAt: 300 }],
  },
  migration: { pending: false, profile: null },
}));
const secondModule = await import(`${pathToFileURL(storageFile).href}?daily-migration=${Date.now()}`);
const migrated = secondModule.createStorage();
assert.equal(migrated.read().version, 2);
assert.deepEqual(migrated.read().daily.cache.moments, [], 'legacy content cannot become the server read cache');
assert.equal(migrated.read().daily.legacyStatus, 'pending');
assert.equal(migrated.read().daily.legacyDrafts.moments[0].text, '本机碳硅圈草稿');
assert.equal(migrated.read().daily.legacyDrafts.moments[0].image, 'data:image/png;base64,MOMENT');
assert.equal(migrated.read().daily.legacyDrafts.diaries[0].text, '旧日记');
assert.equal(migrated.read().daily.legacyDrafts.summaries[0].text, '旧总结');
assert.equal(JSON.parse(localStorage.getItem('elementera.local.v1')).daily.legacyStatus, 'pending');

console.log('storage: ok');

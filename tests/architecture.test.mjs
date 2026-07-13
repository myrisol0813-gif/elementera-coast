import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { dirname, join, normalize, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const testDir = dirname(fileURLToPath(import.meta.url));
const repo = resolve(testDir, '..');
const pages = join(repo, 'elementera-mcp/deploy-pages');
const read = (path) => readFile(path, 'utf8');

const index = await read(join(pages, 'index.html'));
const redirects = await read(join(pages, '_redirects'));
assert.equal((index.match(/<script\b/g) || []).length, 1, 'only one script entry is allowed');
assert.match(index, /<script type="module" src="\/public\/app\.js\?v=coast-app-03"><\/script>/);
assert.match(redirects, /^\/gptlike \/index\.html 200$/m);
assert.match(redirects, /^\/app\.html \/index\.html 200$/m);
for (const id of ['coastStatus', 'mainRooms', 'localRoomWindows', 'localRoomWindowList', 'chatConversationSection', 'chatConversationList', 'modelQuickPicker']) {
  assert.equal((index.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, `${id} must have one owner`);
}
for (const label of ['同轨第', '距 8.12', '距 8.13', '无线电波的两端', '灯塔来信', '轨迹 / 记忆', '海岸日报', '主聊天窗口']) {
  assert.ok(index.includes(label), `missing UI contract: ${label}`);
}
assert.equal(/modules\/legacy|p3-chat-core|conversation-controller|shell-controller/.test(index), false);

const worker = await read(join(pages, 'service-worker.js'));
assert.ok(worker.includes("url.pathname.startsWith('/api/')"));
assert.equal(worker.includes("caches.match('/index.html')"), true);
assert.equal(worker.includes('modules/legacy'), false);
const coreBlock = worker.slice(worker.indexOf('const CORE'), worker.indexOf(']);', worker.indexOf('const CORE')) + 2);
const coreUrls = [...coreBlock.matchAll(/'([^']+)'/g)].map((match) => match[1]);
for (const url of coreUrls) {
  const pathname = url.split('?')[0];
  if (pathname === '/') continue;
  await access(join(pages, pathname.replace(/^\//, '')));
}

for (const retiredPath of [
  'app.html',
  'app-next.html',
  'FRONTEND_CLEANUP_AUDIT.md',
  'public/app-next',
]) {
  await assert.rejects(access(join(pages, retiredPath)), undefined, `${retiredPath} must stay deleted`);
}
await assert.rejects(access(join(repo, 'functions/__coast_free_chat.js')), undefined, 'retired sandbox endpoint must stay deleted');

const moduleRoot = join(pages, 'public');
const moduleFiles = [
  'app.js',
  'core/api.js', 'core/dom.js', 'core/icons.js', 'core/router.js', 'core/storage.js',
  'content/letters.js',
  'features/chat-state.js', 'features/chat.js', 'features/daily.js', 'features/letters.js',
  'features/memory.js', 'features/models.js', 'features/rooms.js', 'features/settings.js', 'features/shell.js', 'features/tools.js',
].map((path) => join(moduleRoot, path));

for (const file of moduleFiles) {
  const source = await read(file);
  assert.equal(/MutationObserver|window\.__|setInterval\s*\(|createElement\(['"]script['"]\)/.test(source), false, `forbidden runtime ownership in ${file}`);
  for (const specifier of [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1])) {
    if (!specifier.startsWith('.')) continue;
    await access(normalize(resolve(dirname(file), specifier)));
  }
}

const chatSource = await read(join(moduleRoot, 'features/chat.js'));
for (const name of ['edit', 'trash', 'copy', 'like', 'refresh', 'heart']) {
  assert.ok(chatSource.includes(`'${name}'`), `chat icon ${name} is missing`);
}
assert.equal(chatSource.includes('localStorage'), false, 'main chat cannot use browser history storage');
assert.equal(chatSource.includes('history sync'), false);
assert.ok(chatSource.includes('runtime.deletedIds.add(conversationId)'));

const tokenStyles = await read(join(moduleRoot, 'styles/tokens.css'));
const shellStyles = await read(join(moduleRoot, 'styles/shell.css'));
const iconSource = await read(join(moduleRoot, 'core/icons.js'));
assert.equal((tokenStyles.match(/--topbar-height:/g) || []).length, 1, 'top bar height must have one owner');
assert.match(tokenStyles, /--topbar-height:\s*52px;/);
assert.match(tokenStyles, /--composer-height:\s*62px;/);
assert.match(shellStyles, /\.topbar\s*\{[\s\S]*?align-items:\s*center;/);
const featureStyles = await read(join(moduleRoot, 'styles/features.css'));
assert.match(featureStyles, /\.feature-head\s*\{[\s\S]*?height:\s*calc\(var\(--topbar-height\) \+ var\(--safe-top\)\)/);
assert.match(featureStyles, /\.local-room-composer\s*\{[\s\S]*?min-height:\s*calc\(var\(--composer-height\) \+ var\(--safe-bottom\)\)/);
assert.equal(/action-(copy|edit|heart|like|refresh|trash)\.svg/.test(iconSource + shellStyles), false, 'icons cannot fall back to retired assets');
assert.equal(/stroke=["']#000/i.test(iconSource), false, 'inline icons must inherit the active theme color');
for (const historicalPath of ['M12.2 6.4H25.2', 'M8 24l2-6', 'r="10.7"', 'M9.5 27H6.5', 'M23.8 13.3', 'M10.4 10.8']) {
  assert.ok(iconSource.includes(historicalPath), `missing restored Xiaohan icon path: ${historicalPath}`);
}

const middleware = await read(join(repo, 'functions/_middleware.js'));
const chatRouter = await read(join(repo, 'functions/chat-router.js'));
const storeSource = await read(join(repo, 'functions/chat-store.js'));
const schemaSource = await read(join(repo, 'functions/chat-schema.js'));
assert.equal(/_middleware\.full|legacyOnRequest|COAST_CHAT_STORE/.test(middleware + chatRouter + storeSource + schemaSource), false);
assert.equal(/readLegacy|importLegacy|\bturns\s+WHERE|user_variants|assistant_variants/.test(storeSource), false);
assert.ok(chatRouter.includes("source: 'd1-json-v4'"));
assert.ok(storeSource.includes('conversation_states'));

const store = await import(pathToFileURL(join(repo, 'functions/chat-store.js')));
const normalizedState = store.normalizeState({
  turns: [{
    id: 'turn-1',
    user: { active: 1, variants: [{ id: 'u-1', content: 'first' }, { id: 'u-2', content: 'second' }] },
    assistant: {
      activeByUserVariant: { 0: 0, 1: 1 },
      variantsByUserVariant: {
        0: [{ id: 'a-1', content: 'first answer' }],
        1: [{ id: 'a-2', content: 'second answer 1' }, { id: 'a-3', content: 'second answer 2', liked: true, favorite: true }],
      },
    },
  }],
});
assert.equal(normalizedState.version, 4);
assert.equal(normalizedState.turns[0].assistant.variantsByUserVariant['1'][1].liked, true);
assert.equal(normalizedState.turns[0].assistant.variantsByUserVariant['1'][1].favorite, true);

class D1Statement {
  constructor(database, sql, params = []) { this.database = database; this.sql = sql; this.params = params; }
  bind(...params) { return new D1Statement(this.database, this.sql, params); }
  async run() { const result = this.database.prepare(this.sql).run(...this.params); return { success: true, meta: { changes: Number(result.changes || 0) } }; }
  async first() { return this.database.prepare(this.sql).get(...this.params) || null; }
  async all() { return { results: this.database.prepare(this.sql).all(...this.params) }; }
}

class D1Database {
  constructor() { this.database = new DatabaseSync(':memory:'); }
  prepare(sql) { return new D1Statement(this.database, sql); }
}

const db = new D1Database();
const one = await store.createConversation(db, '新聊天');
const two = await store.createConversation(db, 'second');
const three = await store.createConversation(db, 'third');
assert.equal((await store.listConversations(db)).length, 3);
await store.writeConversationState(db, one.id, normalizedState);
assert.equal((await store.readConversationState(db, one.id)).turns[0].assistant.variantsByUserVariant['1'][1].content, 'second answer 2');
assert.equal((await store.renameConversation(db, one.id, 'one')).title, 'one');
await store.deleteConversation(db, two.id);
assert.equal((await store.listConversations(db)).length, 2);
await assert.rejects(() => store.writeConversationState(db, two.id, normalizedState), (error) => error.type === 'conversation_deleted' && error.status === 410);
await store.deleteConversation(db, three.id);
await store.deleteConversation(db, one.id);
assert.equal((await store.listConversations(db)).length, 0);

const oldDb = new D1Database();
oldDb.database.exec(`
  CREATE TABLE users (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
  CREATE TABLE conversations (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
  );
  CREATE TABLE turns (
    id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, position INTEGER NOT NULL,
    active_user_variant_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
  );
  CREATE TABLE user_variants (
    id TEXT PRIMARY KEY, turn_id TEXT NOT NULL, position INTEGER NOT NULL,
    content TEXT, created_at INTEGER NOT NULL, deleted_at INTEGER
  );
  CREATE TABLE assistant_variants (
    id TEXT PRIMARY KEY, turn_id TEXT NOT NULL, user_variant_id TEXT,
    user_variant_position INTEGER, position INTEGER NOT NULL, content TEXT,
    error_detail TEXT, is_active INTEGER, created_at INTEGER NOT NULL, deleted_at INTEGER
  );
  INSERT INTO conversations VALUES ('old-conversation', 'owner', '旧窗口', 1, 1, NULL);
  INSERT INTO turns VALUES ('old-turn', 'old-conversation', 0, 'old-user', 1, 1, NULL);
  INSERT INTO user_variants VALUES ('old-user', 'old-turn', 0, '旧问题', 1, NULL);
  INSERT INTO assistant_variants VALUES ('old-assistant', 'old-turn', 'old-user', 0, 0, '旧回答', NULL, 1, 1, NULL);
`);
const migrated = await store.readConversationState(oldDb, 'old-conversation');
assert.equal(migrated.version, 4);
assert.equal(migrated.turns[0].user.variants[0].content, '旧问题');
assert.equal(migrated.turns[0].assistant.variantsByUserVariant['0'][0].content, '旧回答');
const migratedColumns = oldDb.database.prepare('PRAGMA table_info(conversations)').all().map((column) => column.name);
assert.ok(migratedColumns.includes('title_manual'));
assert.ok(migratedColumns.includes('title_generated_at'));
assert.ok(migratedColumns.includes('archived_at'));
assert.equal(oldDb.database.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get().count, 1);

const profile = await store.writeProfile(db, {
  assistant_avatar_dataurl: 'data:image/png;base64,AA==',
  current_chat_model: 'openai/gpt-4.1-nano',
  current_image_model: 'openai/gpt-image-1',
  model_box: { chat: ['openai/gpt-4.1-nano'], free: [], image: ['openai/gpt-image-1'] },
});
assert.equal((await store.readProfile(db)).current_chat_model, profile.current_chat_model);

console.log('architecture: ok');

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
const headers = await read(join(pages, '_headers'));
assert.equal((index.match(/<script\b/g) || []).length, 1, 'only one script entry is allowed');
assert.match(index, /<script type="module" src="\/public\/app\.js\?v=coast-app-22"><\/script>/);
assert.match(redirects, /^\/gptlike \/index\.html 200$/m);
assert.match(redirects, /^\/app\.html \/index\.html 200$/m);

const manifest = JSON.parse(await read(join(pages, 'manifest.json')));
assert.deepEqual({
  id: manifest.id,
  name: manifest.name,
  short_name: manifest.short_name,
  description: manifest.description,
  start_url: manifest.start_url,
  scope: manifest.scope,
  display: manifest.display,
  orientation: manifest.orientation,
  background_color: manifest.background_color,
  theme_color: manifest.theme_color,
}, {
  id: '/',
  name: 'Elementera Coast',
  short_name: '海岸',
  description: 'Elementera Coast 主屋',
  start_url: '/?source=pwa',
  scope: '/',
  display: 'standalone',
  orientation: 'portrait',
  background_color: '#16204A',
  theme_color: '#16204A',
});
assert.deepEqual(manifest.icons, [
  { src: '/public/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: '/public/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  { src: '/public/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
]);
for (const expected of [
  '<meta name="theme-color" content="#16204A">',
  '<meta name="mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-title" content="海岸">',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">',
  '<title>Elementera Coast</title>',
  '<link rel="manifest" href="/manifest.json" crossorigin="use-credentials">',
  '<link rel="apple-touch-icon" sizes="180x180" href="/public/icons/apple-touch-icon.png">',
  '<link rel="icon" type="image/png" sizes="32x32" href="/public/icons/icon-32.png">',
  '<link rel="icon" type="image/png" sizes="16x16" href="/public/icons/icon-16.png">',
]) assert.ok(index.includes(expected), `missing PWA head contract: ${expected}`);
assert.match(headers, /^\/manifest\.json\n[\s\S]*?^  Content-Type: application\/manifest\+json; charset=utf-8$/m);

const expectedIconSizes = new Map([
  ['icon-16.png', [16, 16]],
  ['icon-32.png', [32, 32]],
  ['apple-touch-icon.png', [180, 180]],
  ['icon-192.png', [192, 192]],
  ['icon-512.png', [512, 512]],
  ['icon-maskable-512.png', [512, 512]],
]);
for (const [filename, dimensions] of expectedIconSizes) {
  const icon = await readFile(join(pages, 'public/icons', filename));
  assert.deepEqual([...icon.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${filename} must be a PNG`);
  assert.deepEqual([icon.readUInt32BE(16), icon.readUInt32BE(20)], dimensions, `${filename} has the wrong dimensions`);
}
for (const id of ['coastStatus', 'mainRooms', 'chatConversationSection', 'chatConversationList', 'modelQuickPicker', 'chatWindow', 'roomWindow', 'mainDogtalkComposer', 'roomDogtalkComposer']) {
  assert.equal((index.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, `${id} must have one owner`);
}
for (const label of ['同轨第', '距 8.12', '距 8.13', '无线电波的两端', '灯塔来信', '轨迹 / 记忆', '海岸日报', '主聊天窗口']) {
  assert.ok(index.includes(label), `missing UI contract: ${label}`);
}
assert.equal(/modules\/legacy|p3-chat-core|conversation-controller|shell-controller/.test(index), false);
assert.match(index, /data-action="memory:open"[^>]*>[\s\S]*?轨迹 \/ 记忆/);
assert.equal(index.includes('data-action="rooms:memory"'), false, 'memory sidebar action must have one owner');

const worker = await read(join(pages, 'service-worker.js'));
assert.match(worker, /^const CACHE_NAME = 'elementera-coast-app-22';$/m);
assert.ok(worker.includes("url.pathname.startsWith('/api/')"));
assert.ok(worker.includes("url.pathname.startsWith('/mcp')"));
assert.ok(worker.includes("url.pathname.startsWith('/.well-known/')"));
assert.equal(worker.includes("caches.match('/index.html')"), true);
assert.equal(worker.includes('modules/legacy'), false);
const coreBlock = worker.slice(worker.indexOf('const CORE'), worker.indexOf(']);', worker.indexOf('const CORE')) + 2);
const coreUrls = [...coreBlock.matchAll(/'([^']+)'/g)].map((match) => match[1]);
for (const url of coreUrls) {
  const pathname = url.split('?')[0];
  if (pathname === '/') continue;
  await access(join(pages, pathname.replace(/^\//, '')));
}
const appEntry = await read(join(pages, 'public/app.js'));
assert.ok(appEntry.includes("navigator.serviceWorker.register('/service-worker.js', { scope: '/' })"), 'PWA service worker must own the root scope');

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
  'features/chat-state.js', 'features/chat.js', 'features/daily-client.js', 'features/daily.js', 'features/dogtalk.js', 'features/letters.js',
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
const dailyClientSource = await read(join(moduleRoot, 'features/daily-client.js'));
const dailySource = await read(join(moduleRoot, 'features/daily.js'));
const memorySource = await read(join(moduleRoot, 'features/memory.js'));
const roomsSource = await read(join(moduleRoot, 'features/rooms.js'));
const dogtalkSource = await read(join(moduleRoot, 'features/dogtalk.js'));
const featureStyles = await read(join(moduleRoot, 'styles/features.css'));
const modelsBackendSource = await read(join(repo, 'functions/models.js'));
for (const name of ['edit', 'trash', 'copy', 'like', 'refresh', 'heart']) {
  assert.ok(chatSource.includes(`'${name}'`), `chat icon ${name} is missing`);
}
assert.equal(chatSource.includes('localStorage'), false, 'main chat cannot use browser history storage');
assert.equal(chatSource.includes('history sync'), false);
assert.ok(chatSource.includes('runtime.deletedIds.add(conversationId)'));
assert.equal(dailySource.includes('localStorage'), false, 'Daily UI cannot own browser persistence directly');
assert.ok(dailySource.includes("createDailyClient()"), 'Daily UI must use the API client owner');
assert.ok(dailySource.includes('legacyDrafts'), 'old Daily content must have an explicit confirmation area');
for (const endpoint of ['dailyMoments', 'dailyDiaries', 'dailyAlbums', 'dailySummaries', 'dailySummaryRange', 'dailySummaryRun', 'dailySummaryCommit']) {
  assert.ok(dailyClientSource.includes(`API.${endpoint}`), `Daily client is missing ${endpoint}`);
}
for (const copy of [
  '图片消息还没接入。本轮主聊天先支持文字、思维壤与记忆。',
  '语音输入还没接入。',
  '通话模式还没接入。先输入文字或选择模型聊天。',
  '当前是生图模型，不能用于文字聊天。请切换聊天模型。',
]) assert.ok((chatSource + modelsBackendSource).includes(copy), `missing chat state copy: ${copy}`);
assert.equal((memorySource.match(/router\.register\('memory'/g) || []).length, 1, 'memory route must have one owner');
assert.equal(roomsSource.includes("router.register('memory'"), false, 'rooms cannot retain the memory placeholder route');
assert.equal(memorySource.includes('memory:soil-organize'), false, 'manual soil organize action must stay retired');
assert.equal(memorySource.includes('整理思维壤'), false, 'manual soil organize label must stay retired');
for (const action of ['memory:soil-edit', 'memory:soil-clear', 'memory:soil-auto']) {
  assert.ok(memorySource.includes(action), `soil control must remain available: ${action}`);
}
assert.ok(memorySource.includes('memory:soil-open'), 'message-flow soil must have one explicit open action');
for (const retired of ['selectedRoomSource', 'roomSoilCard', 'roomLocal', 'room-library-soil', 'room-library-soils']) {
  const source = retired.startsWith('room-library') ? featureStyles : memorySource;
  assert.equal(source.includes(retired), false, `trajectory-only soil path must be removed: ${retired}`);
}
assert.equal(memorySource.includes('data-action="memory:soil"'), false, 'the old implicit conversation soil action must be removed');
assert.equal(roomsSource.includes('room-memory-drawer'), false, 'room memory cannot sit inside a chat flow');
assert.equal(roomsSource.includes('owner-note'), false, 'retired room owner-note UI must stay removed');
for (const route of ["router.register('server-room'", "router.register('room-memory'", "router.register('room-soil'"]) {
  assert.equal(roomsSource.includes(route), false, `room chat cannot remain an overlay route: ${route}`);
}
for (const scope of ['conversation', 'radio', 'lighthouse', 'global']) {
  assert.ok(memorySource.includes(`data-scope="${scope}"`), `parallel memory tab is missing: ${scope}`);
}
assert.ok(roomsSource.includes('activateRoom(kind)'), 'radio and lighthouse must use the peer chat-window shell');
assert.ok(roomsSource.includes('room-soil-tip'), 'room model messages must expose their rolling soil nearby');
assert.ok(roomsSource.includes('data-action="memory:soil-open"'), 'room soil tips must open the soil detail directly');
assert.equal(roomsSource.includes('soilIsBlank'), false, 'an empty room soil must retain its message-flow entry');
assert.ok(roomsSource.includes("message.actor === 'xiaohan'"));
assert.ok(roomsSource.includes("message.surface === 'web_manual'"));
for (const copy of [
  '小寒 · 神秘狗话',
  '小寒这轮很放松，因此偷懒中。',
  '不写也可以。神秘狗话是助力，不是打卡。',
  '不进入思维壤、落袋、种子、记忆或自动总结',
]) {
  assert.ok(dogtalkSource.includes(copy), `dogtalk UI is missing its boundary copy: ${copy}`);
}

const tokenStyles = await read(join(moduleRoot, 'styles/tokens.css'));
const shellStyles = await read(join(moduleRoot, 'styles/shell.css'));
const iconSource = await read(join(moduleRoot, 'core/icons.js'));
assert.equal((tokenStyles.match(/--topbar-height:/g) || []).length, 1, 'top bar height must have one owner');
assert.match(tokenStyles, /--topbar-height:\s*52px;/);
assert.match(tokenStyles, /--composer-height:\s*62px;/);
assert.match(shellStyles, /\.topbar\s*\{[\s\S]*?align-items:\s*center;/);
assert.match(featureStyles, /\.feature-head\s*\{[\s\S]*?height:\s*calc\(var\(--topbar-height\) \+ var\(--safe-top\)\)/);
const chatStyles = await read(join(moduleRoot, 'styles/chat.css'));
assert.match(chatStyles, /\.composer--chat\s*\{\s*grid-template-columns:\s*42px minmax\(0, 1fr\) 42px;\s*\}/);
assert.match(chatStyles, /\.composer--room\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\) 42px;\s*\}/);
assert.equal((chatStyles.match(/\.composer--chat\s*\{/g) || []).length, 1);
assert.equal((chatStyles.match(/\.composer--room\s*\{/g) || []).length, 1);
assert.equal(chatStyles.includes('.room-composer'), false, 'retired room composer layout cannot remain');
const mobileComposer = chatStyles.match(/@media \(max-width: 560px\) \{([\s\S]*)\}\s*$/)?.[1] || '';
const mobileComposerRule = mobileComposer.match(/\.composer\s*\{([^}]*)\}/)?.[1] || '';
assert.equal(mobileComposerRule.includes('grid-template-columns'), false, 'mobile composer cannot redefine canonical columns');
assert.equal(chatStyles.includes('!important'), false, 'composer layout cannot rely on !important');
assert.match(chatStyles, /\.dogtalk-composer-slot\s*\{[\s\S]*?grid-column:\s*1 \/ -1;/);
assert.match(chatStyles, /\.room-subject-wrap\s*\{[\s\S]*?grid-column:\s*1 \/ -1;/);
assert.match(chatStyles, /\.input-pill\s*\{[\s\S]*?width:\s*100%;[\s\S]*?min-width:\s*0;/);
assert.match(index, /<form id="composer" class="composer composer--chat"[\s\S]*?<div id="mainDogtalkComposer" class="dogtalk-composer-slot"><\/div>/);
assert.match(index, /<form id="roomComposer" class="composer composer--room"[\s\S]*?<div id="roomDogtalkComposer" class="dogtalk-composer-slot"><\/div>/);
for (const viewport of [360, 390, 430, 1280]) {
  const composerWidth = Math.min(780, viewport);
  const horizontalPadding = viewport <= 560 ? 28 : 28;
  const roomTextWidth = composerWidth - horizontalPadding - 42 - 8;
  assert.ok(roomTextWidth >= 282, `${viewport}px room composer input is too narrow`);
}
assert.equal(/action-(copy|edit|heart|like|refresh|trash)\.svg/.test(iconSource + shellStyles), false, 'icons cannot fall back to retired assets');
assert.equal(/stroke=["']#000/i.test(iconSource), false, 'inline icons must inherit the active theme color');
for (const historicalPath of ['M12.2 6.4H25.2', 'M8 24l2-6', 'r="10.7"', 'M9.5 27H6.5', 'M23.8 13.3', 'M10.4 10.8']) {
  assert.ok(iconSource.includes(historicalPath), `missing restored Xiaohan icon path: ${historicalPath}`);
}

const middleware = await read(join(repo, 'functions/_middleware.js'));
const chatRouter = await read(join(repo, 'functions/chat-router.js'));
const storeSource = await read(join(repo, 'functions/chat-store.js'));
const schemaSource = await read(join(repo, 'functions/chat-schema.js'));
const dailyApiSource = await read(join(repo, 'functions/daily-api.js'));
const dailySchemaSource = await read(join(repo, 'functions/daily-schema.js'));
const dailyStoreSource = await read(join(repo, 'functions/daily-store.js'));
const dailySummarySource = await read(join(repo, 'functions/daily-summary.js'));
const dailyMomentCommentSource = await read(join(repo, 'functions/daily-moment-comment.js'));
const dailyToolsSource = await read(join(repo, 'functions/daily-model-tools.js'));
const memoryStoreSource = await read(join(repo, 'functions/memory-store.js'));
const embeddingSource = await read(join(repo, 'functions/embedding.js'));
const memoryRecallSource = await read(join(repo, 'functions/memory-recall.js'));
const memoryRouterSource = await read(join(repo, 'functions/memory-router.js'));
const dogtalkStoreSource = await read(join(repo, 'functions/dogtalk-store.js'));
const dogtalkApiSource = await read(join(repo, 'functions/dogtalk-api.js'));
const toolsSource = await read(join(moduleRoot, 'features/tools.js'));
const mcpOwnerSource = (await Promise.all([
  'mcp-router.js',
  'mcp-tools.js',
  'mcp-auth.js',
  'coast-api.js',
  'radio-myri.js',
  'official-soil-store.js',
  'radio-store.js',
  'lighthouse-store.js',
  'room-records.js',
].map((file) => read(join(repo, 'functions', file))))).join('\n');
const coastApiSource = await read(join(repo, 'functions/coast-api.js'));
const mcpToolsSource = await read(join(repo, 'functions/mcp-tools.js'));
const roomRecordsSource = await read(join(repo, 'functions/room-records.js'));
for (const ownerSource of [coastApiSource, mcpToolsSource]) {
  assert.ok(ownerSource.includes('listRadioRoomMessages'));
  assert.ok(ownerSource.includes('listLighthouseRoomMessages'));
}
assert.ok(roomRecordsSource.includes('attachDogtalkSnapshots'));
assert.equal(coastApiSource.includes('listMysticDogtalkSnapshots'), false);
const packageSource = JSON.parse(await read(join(repo, 'package.json')));
assert.equal(/_middleware\.full|legacyOnRequest|COAST_CHAT_STORE/.test(middleware + chatRouter + storeSource + schemaSource), false);
assert.equal(/readLegacy|importLegacy|\bturns\s+WHERE|user_variants|assistant_variants/.test(storeSource), false);
assert.ok(chatRouter.includes("source: 'd1-json-v4'"));
assert.ok(storeSource.includes('conversation_states'));
for (const table of ['daily_moments', 'daily_moment_comments', 'daily_moment_likes', 'daily_diaries', 'daily_album_items', 'daily_summaries']) {
  assert.ok(dailySchemaSource.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `missing Daily table: ${table}`);
}
assert.ok(dailyApiSource.includes("'/api/daily'"));
assert.ok(dailyApiSource.includes('myri-comment'));
assert.ok(dailySummarySource.includes('organizedMemoryRecordsInRange'));
assert.ok(dailySummarySource.includes('earliestOrganizedMemoryTimestamp'));
assert.equal(dailySummarySource.includes('listActiveMessagesInRange'), false, 'Daily summary must not read raw chat messages');
assert.equal(dailySummarySource.includes('earliestActiveMessageTimestamp'), false, 'raw chat timestamps must not define Daily ranges');
assert.ok(dailyMomentCommentSource.includes('organizedMemoryRecordsInRange'));
assert.ok(dailyMomentCommentSource.includes('momentCommentContext'));
assert.equal(dailyMomentCommentSource.includes('listActiveMessagesInRange'), false, 'Myri moment comments must not read raw chat messages');
assert.ok(dailySummarySource.includes('summary_invalid_model_response'));
assert.ok(dailyToolsSource.includes("name: 'create_moment'"));
assert.ok(dailyToolsSource.includes("name: 'create_diary_draft'"));
assert.ok(dailyToolsSource.includes("name: 'save_album_reference'"));
assert.equal(dailyToolsSource.includes("name: 'create_diary'"), false, 'ordinary chat must use the draft-only diary tool');
assert.ok(chatRouter.includes('DAILY_MODEL_TOOLS'));
assert.ok(chatRouter.includes('executeDailyModelTool'));
assert.ok(chatRouter.includes('DOGTALK_MODEL_TOOL'));
assert.ok(chatRouter.includes('executeDogtalkModelTool'));
for (const contract of [
  "const TYPE = 'xiaohan_mystic_dogtalk'",
  "const OWNER = 'xiaohan'",
  "const DEFAULT_TEXT = '小寒这轮很放松，因此偷懒中。'",
  'auto_recall: false',
  "memory_weight: 'low'",
  'not_instruction: true',
  'not_preference: true',
  'not_memory_seed: true',
  'not_pocket: true',
]) {
  assert.ok(dogtalkStoreSource.includes(contract), `dogtalk store is missing: ${contract}`);
}
assert.ok(dogtalkApiSource.includes('requireOwnerSession'));
assert.equal(dogtalkApiSource.includes('requireMcpAuth'), false, 'models cannot write Xiaohan dogtalk');
assert.ok(modelsBackendSource.includes("role: 'tool'"));
assert.ok(modelsBackendSource.includes('tool_calls'));
assert.ok(dailyStoreSource.includes('image_data_url_not_allowed'));
assert.equal(/hidden[_ -]?marker|reply[_ -]?scanner|scanReply|MutationObserver/.test(
  `${dailySource}\n${dailyClientSource}\n${dailyToolsSource}\n${chatRouter}`,
), false, 'Daily tools cannot be implemented through reply markers or DOM scanning');
assert.equal(
  /hidden[_ -]?marker|reply[_ -]?scanner|scanReply|MutationObserver|createElement\(['"]script['"]\)|\b(?:compat|wrapper|bridge)\b/i.test(mcpOwnerSource),
  false,
  'MCP owners cannot use compatibility bridges, hidden markers, reply scanning, or dynamic scripts',
);
assert.equal(
  /from\s+['"](?:@modelcontextprotocol\/sdk|jose|zod(?:\/v4)?)['"]/.test(mcpOwnerSource),
  false,
  'Pages Functions MCP owners must remain deployable without an npm install build step',
);
assert.equal(packageSource.dependencies, undefined, 'production Functions must not rely on uninstalled npm dependencies');
for (const failureCode of [
  'missing_authorization_header',
  'malformed_bearer_token',
  'jwt_verify_failed',
  'issuer_mismatch',
  'audience_mismatch',
  'expired_token',
  'scope_missing',
  'subject_not_allowed',
  'email_not_allowed',
  'email_not_verified',
]) {
  assert.ok(mcpOwnerSource.includes(`'${failureCode}'`), `missing safe MCP auth diagnostic: ${failureCode}`);
}
for (const jwtVerifyReason of [
  'token_not_jwt',
  'token_is_jwe_or_opaque',
  'token_segment_count',
  'jwt_header_decode_failed',
  'jwt_payload_decode_failed',
  'unsupported_alg',
  'missing_kid',
  'jwks_fetch_failed',
  'no_matching_jwk',
  'signature_invalid',
  'verify_exception',
]) {
  assert.ok(
    mcpOwnerSource.includes(`'${jwtVerifyReason}'`),
    `missing safe JWT verify reason: ${jwtVerifyReason}`,
  );
}
for (const jwksFailureReason of [
  'jwks_url_invalid',
  'jwks_http_status',
  'jwks_json_parse_failed',
  'jwks_empty_keys',
  'jwks_fetch_exception_name',
]) {
  assert.ok(
    mcpOwnerSource.includes(`'${jwksFailureReason}'`),
    `missing safe JWKS failure reason: ${jwksFailureReason}`,
  );
}
for (const deferredTool of [
  'create_moment_from_mcp',
  'save_album_reference_from_mcp',
  'run_daily_summary_from_mcp',
]) {
  assert.equal(mcpOwnerSource.includes(`registerTool('${deferredTool}'`), false, `${deferredTool} must stay out of MCP v1`);
}
for (const table of ['conversation_soils', 'memory_pockets', 'pocket_recall_memberships', 'memory_entries']) {
  assert.ok(memoryStoreSource.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `missing memory table: ${table}`);
}
assert.ok(embeddingSource.includes("AI.run(MEMORY_CONFIG.vector.model, { text: ["));
assert.ok(embeddingSource.includes('vector.length'));
assert.equal(/dimensions\s*[:=]\s*\d+/.test(embeddingSource + memoryRecallSource + memoryRouterSource), false, 'embedding dimensions cannot be assumed');
assert.ok(embeddingSource.includes('COAST_MEMORY_VECTOR.upsert'));
assert.ok(embeddingSource.includes('COAST_MEMORY_VECTOR.deleteByIds'));
for (const pool of ['conversation_seeds', 'conversation_memories', 'conversation_pockets', 'global_seeds', 'global_memories', 'global_pockets']) {
  assert.ok(memoryRecallSource.includes(pool), `missing recall pool: ${pool}`);
}
assert.ok(memoryStoreSource.includes('normalizePocketCandidates'));
assert.ok(memoryStoreSource.includes('pocketFingerprint'));
assert.ok(memoryStoreSource.includes("action === 'confirm_pocket'"));
assert.ok(embeddingSource.includes("`${pocket.id}:conversation`"));
assert.ok(embeddingSource.includes("`${pocket.id}:global`"));
assert.ok(memoryRouterSource.includes('upsertSoilPocketCandidates'));
assert.ok(memorySource.includes('确认落袋'));
assert.ok(chatRouter.includes('buildMemoryContext'));
assert.ok(chatRouter.includes("role: 'system'"));
assert.ok(chatRouter.includes("'/api/chat/landing-letter'"));
assert.ok(schemaSource.includes('conversation_landing_letters'));
assert.ok(chatSource.includes('branch.user && !branch.user.hidden'));
assert.equal(/memory_edges|sleep|dream|梦边|自动核心/.test(memoryStoreSource + memoryRecallSource + memoryRouterSource), false);
for (const label of ['上下文预算（粗略）', '最大输出 token', '思维壤预算', '思维壤整理频率', '每个完成轮次自动整理一次', '手持种上限', '种子冷却轮数', '没东西聊时当前种子上限', '当前窗口种子召回上限', '总种子召回上限', '当前窗口记忆召回上限', '总记忆召回上限', '清空当前思维壤', '打开待确认袋', '查看向量状态']) {
  assert.ok(toolsSource.includes(label), `API cottage is missing: ${label}`);
}
assert.ok(chatRouter.includes('budgetChatMessages'));
assert.ok(memoryRouterSource.includes('settings.autoRefreshEveryTurns'));
assert.ok(memoryRouterSource.includes('settings.maxHandSeeds'));
assert.equal(/小纸条预算 · 预留|种子召回上限 · 预留|记忆召回：暂未接入/.test(toolsSource), false);

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
  async batch(statements) {
    this.database.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.database.exec('COMMIT');
      return results;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }
}

const db = new D1Database();
const one = await store.createConversation(db, '新聊天');
const two = await store.createConversation(db, 'second');
const three = await store.createConversation(db, 'third');
assert.equal((await store.listConversations(db)).length, 3);
await store.writeConversationState(db, one.id, normalizedState);
assert.equal((await store.readConversationState(db, one.id)).turns[0].assistant.variantsByUserVariant['1'][1].content, 'second answer 2');
const longReply = '海岸上的长段回复。'.repeat(3000);
const stateWithLongReply = await store.readConversationState(db, one.id);
stateWithLongReply.turns[0].assistant.variantsByUserVariant['1'][1].content = longReply;
await store.writeConversationState(db, one.id, stateWithLongReply);
assert.equal((await store.readConversationState(db, one.id)).turns[0].assistant.variantsByUserVariant['1'][1].content, longReply, 'D1 state must preserve long model output without slicing it');
const firstLanding = await store.writeLandingExchange(db, one.id, {
  state: await store.readConversationState(db, one.id),
  model_id: 'openai/gpt-4.1-nano',
  letter_text: '登岛信正文',
  letter_hash: 'hash-one',
  assistant_text: '我读完了。',
  finish_reason: 'length',
});
assert.equal(firstLanding.landing.landing_version, 1);
assert.equal(firstLanding.state.turns.at(-1).turn_type, 'landing');
assert.equal(firstLanding.state.turns.at(-1).user.variants[0].hidden, true);
assert.equal(firstLanding.state.turns.at(-1).assistant.variantsByUserVariant['0'][0].finish_reason, 'length');
assert.equal((await store.readLandingStatus(db, one.id, 'openai/gpt-4.1-nano')).landing_text_hash, 'hash-one');
const secondLanding = await store.writeLandingExchange(db, one.id, {
  state: firstLanding.state,
  model_id: 'openai/gpt-4.1-nano',
  letter_text: '第二次递信',
  letter_hash: 'hash-two',
  assistant_text: '我又读了一次。',
});
assert.equal(secondLanding.landing.landing_version, 2);
assert.equal((await store.readConversationState(db, one.id)).turns.at(-1).assistant.variantsByUserVariant['0'][0].content, '我又读了一次。');
assert.deepEqual(await store.readLandingStatus(db, one.id, 'openai/gpt-4.1-mini'), { sent: false });
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

import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pages = resolve(root, 'elementera-mcp/deploy-pages');
const exists = async (path) => {
  try { await access(path, constants.F_OK); return true; } catch { return false; }
};
async function files(dir, extensions = new Set(['.js'])) {
  const output = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) output.push(...await files(path, extensions));
    else if (extensions.has(extname(entry.name))) output.push(path);
  }
  return output;
}

const index = await readFile(resolve(pages, 'index.html'), 'utf8');
const scripts = [...index.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((match) => match[1]);
assert.deepEqual(scripts, ['/public/app.js?v=coast-app-27']);
for (const duplicate of ['app.html', 'gptlike.html', 'index-next.html']) assert.equal(await exists(resolve(pages, duplicate)), false);

const retiredModules = [
  'context-ambient.js', 'context-api.js', 'context-assembler.js', 'context-inspector.js',
  'context-intent.js', 'context-manifest.js', 'context-memory-facets.js', 'context-modes.js',
  'context-schema.js', 'context-soil-renderer.js', 'context-surfaces.js', 'context-worldbook.js',
  'cross-surface-recall.js',
];
for (const file of retiredModules) assert.equal(await exists(resolve(root, 'functions', file)), false, `${file} still exists`);
for (const file of ['public/features/context.js', 'public/styles/context.css']) assert.equal(await exists(resolve(pages, file)), false, `${file} still exists`);

const runtimeFiles = [
  ...await files(resolve(root, 'functions')),
  ...await files(resolve(pages, 'public')),
];
const runtime = (await Promise.all(runtimeFiles
  .filter((file) => !file.endsWith('worldbook-schema.js'))
  .map((file) => readFile(file, 'utf8')))).join('\n');
for (const retiredText of [
  '【上下文目录】', 'Context Manifest', 'Context Inspector', 'Memory Facets',
  'Ambient Context', 'Surface Profile', 'Mode Cards', 'current_mode_key', 'memory_facets_enabled',
  'context_debug', 'facet_policy_json', 'source_confidence', 'contradiction_note',
  '/api/context/modes', '/api/context/preview', 'fallbackOldContext', 'legacyMode',
  'ambientLite', 'modeHintV2', 'tools:clear-context', 'MutationObserver',
]) assert.equal(runtime.includes(retiredText), false, `retired runtime text remains: ${retiredText}`);

const [chat, radio, dailySummary, dailyComment, mcp, api, registry, assembler, accessRules] = await Promise.all([
  readFile(resolve(root, 'functions/chat-router.js'), 'utf8'),
  readFile(resolve(root, 'functions/radio-myri.js'), 'utf8'),
  readFile(resolve(root, 'functions/daily-summary.js'), 'utf8'),
  readFile(resolve(root, 'functions/daily-moment-comment.js'), 'utf8'),
  readFile(resolve(root, 'functions/mcp-tools.js'), 'utf8'),
  readFile(resolve(root, 'functions/api-router.js'), 'utf8'),
  readFile(resolve(root, 'functions/tool-registry.js'), 'utf8'),
  readFile(resolve(root, 'functions/context-assemble-clean.js'), 'utf8'),
  readFile(resolve(root, 'functions/surface-access-rules.js'), 'utf8'),
]);
const calendarMcp = await readFile(resolve(root, 'functions/calendar-mcp-tools.js'), 'utf8');
for (const [name, source] of [['chat', chat], ['radio', radio], ['daily summary', dailySummary], ['daily comment', dailyComment], ['MCP', mcp]]) {
  assert.match(source, /assembleCleanContext/, `${name} bypasses clean assembly`);
}
assert.equal(chat.includes('buildMemoryContext'), false);
assert.equal(chat.includes('resolveToolSelection'), false);
assert.match(api, /routeWorkbenchApi/);
assert.equal(api.includes('routeContextApi'), false);
assert.match(assembler, /trimContextToComfortRange/);
assert.match(assembler, /resolveToolSelection/);
assert.match(assembler, /buildCrossWindowTouch/);
assert.match(assembler, /buildTodayCoastStatus/);
assert.match(accessRules, /mailbox_visitor/);
assert.match(accessRules, /visitorBound: true/);
assert.match(registry, /roomAllowsTool/);
assert.equal(registry.includes('tool_allowlist'), false);
assert.equal(registry.includes('worldbook.test_match'), false);

for (const calendarTool of ['calendar.today', 'calendar.list', 'calendar.create', 'calendar.update', 'calendar.delete', 'calendar.comment', 'calendar.env', 'calendar.seen']) {
  assert.ok(`${mcp}\n${calendarMcp}`.includes(calendarTool), `official MCP misses ${calendarTool}`);
}
assert.match(mcp, /const VERSION = '1\.9\.0'/);
assert.match(mcp, /executeRegisteredTool\(env\.COAST_CHAT_DB, name/);

for (const forbiddenPattern of [/globalThis\.__[A-Za-z_$]/, /window\.__[A-Za-z_$]/, /setInterval\([^)]*querySelector/s, /document\.write\s*\(/]) {
  assert.equal(forbiddenPattern.test(runtime), false, `forbidden ownership pattern: ${forbiddenPattern}`);
}

// P6.3 replaces only the retired context package. Unrelated shell, PWA, storage,
// mailbox, Daily, calendar, memory, and MCP construction contracts stay guarded.
const read = (path) => readFile(path, 'utf8');
const redirects = await read(resolve(pages, '_redirects'));
const headers = await read(resolve(pages, '_headers'));
assert.match(redirects, /^\/gptlike \/index\.html 200$/m);
assert.match(redirects, /^\/app\.html \/index\.html 200$/m);

const manifest = JSON.parse(await read(resolve(pages, 'manifest.json')));
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
  '<title>Elementera Coast</title>',
  '<link rel="manifest" href="/manifest.json" crossorigin="use-credentials">',
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
  const icon = await readFile(resolve(pages, 'public/icons', filename));
  assert.deepEqual([...icon.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${filename} must be a PNG`);
  assert.deepEqual([icon.readUInt32BE(16), icon.readUInt32BE(20)], dimensions, `${filename} has the wrong dimensions`);
}
const mailboxSnake = await readFile(resolve(pages, 'public/media/mailbox-snake.png'));
assert.deepEqual([mailboxSnake.readUInt32BE(16), mailboxSnake.readUInt32BE(20)], [511, 411]);
assert.equal(mailboxSnake[25], 6, 'mailbox illustration must retain an alpha channel');
const defaultMyriAvatar = await readFile(resolve(pages, 'public/media/myri-default-avatar.jpg'));
assert.deepEqual([...defaultMyriAvatar.subarray(0, 3)], [255, 216, 255], 'default Myri avatar must be a JPEG');
for (const id of [
  'coastStatus', 'mainRooms', 'chatConversationSection', 'chatConversationList',
  'modelQuickPicker', 'chatWindow', 'roomWindow', 'mainDogtalkComposer',
  'roomDogtalkComposer', 'calendarUnread', 'deskStatus',
]) assert.equal((index.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, `${id} must have one owner`);
for (const label of ['同轨第', '距 8.12', '距 8.13', '无线电波的两端', '灯塔来信', '轨迹 / 记忆', '海岸日报', '今日一瞥', '主聊天窗口']) {
  assert.ok(index.includes(label), `missing UI contract: ${label}`);
}
assert.equal(/modules\/legacy|p3-chat-core|conversation-controller|shell-controller/.test(index), false);
assert.match(index, /data-action="memory:open"[^>]*>[\s\S]*?轨迹 \/ 记忆/);
assert.equal(index.includes('data-action="rooms:memory"'), false, 'memory sidebar action must have one owner');

const worker = await read(resolve(pages, 'service-worker.js'));
assert.match(worker, /^const CACHE_NAME = 'elementera-coast-app-28';$/m);
for (const excluded of ["url.pathname.startsWith('/api/')", "url.pathname.startsWith('/mcp')", "url.pathname.startsWith('/.well-known/')", "['/login', '/logout', '/mailbox']"]) {
  assert.ok(worker.includes(excluded), `service worker misses network-only route: ${excluded}`);
}
const coreBlock = worker.slice(worker.indexOf('const CORE'), worker.indexOf(']);', worker.indexOf('const CORE')) + 2);
const coreUrls = [...coreBlock.matchAll(/'([^']+)'/g)].map((match) => match[1]);
for (const url of coreUrls) {
  const pathname = url.split('?')[0];
  if (pathname !== '/') await access(resolve(pages, pathname.replace(/^\//, '')));
}
assert.ok(coreUrls.includes('/public/features/desk.js'));
assert.ok(coreUrls.includes('/public/media/myri-default-avatar.jpg'));
assert.match(await read(resolve(pages, 'public/app.js')), /navigator\.serviceWorker\.register\('\/service-worker\.js', \{ scope: '\/' \}\)/);

for (const retiredPath of ['app.html', 'app-next.html', 'FRONTEND_CLEANUP_AUDIT.md', 'public/app-next']) {
  assert.equal(await exists(resolve(pages, retiredPath)), false, `${retiredPath} must stay deleted`);
}
assert.equal(await exists(resolve(root, 'functions/__coast_free_chat.js')), false);

const moduleFiles = [
  'app.js', 'mailbox-entry.js', 'mailbox.js',
  'core/api.js', 'core/dom.js', 'core/icons.js', 'core/router.js', 'core/storage.js',
  'content/letters.js', 'features/chat-state.js', 'features/chat.js',
  'features/daily-client.js', 'features/daily.js', 'features/dogtalk.js',
  'features/letters.js', 'features/memory.js', 'features/models.js', 'features/rooms.js',
  'features/settings.js', 'features/shell.js', 'features/tools.js', 'features/calendar.js',
  'features/desk.js', 'features/toolroom.js',
].map((path) => resolve(pages, 'public', path));
for (const file of moduleFiles) {
  const source = await read(file);
  assert.equal(/MutationObserver|window\.__|setInterval\s*\(|createElement\(['"]script['"]\)/.test(source), false, `forbidden runtime ownership in ${file}`);
  for (const specifier of [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1])) {
    if (specifier.startsWith('.')) await access(resolve(dirname(file), specifier));
  }
}

const frontendChat = await read(resolve(pages, 'public/features/chat.js'));
const frontendDaily = await read(resolve(pages, 'public/features/daily.js'));
const dailyClient = await read(resolve(pages, 'public/features/daily-client.js'));
const frontendMemory = await read(resolve(pages, 'public/features/memory.js'));
const frontendRooms = await read(resolve(pages, 'public/features/rooms.js'));
const frontendDogtalk = await read(resolve(pages, 'public/features/dogtalk.js'));
const frontendTools = await read(resolve(pages, 'public/features/tools.js'));
const chatStyles = await read(resolve(pages, 'public/styles/chat.css'));
const featureStyles = await read(resolve(pages, 'public/styles/features.css'));
for (const name of ['edit', 'trash', 'copy', 'like', 'refresh', 'heart']) assert.ok(frontendChat.includes(`'${name}'`));
assert.equal(frontendChat.includes('localStorage'), false, 'main chat cannot use browser history storage');
assert.equal(frontendDaily.includes('localStorage'), false, 'Daily UI cannot own persistence directly');
assert.ok(frontendDaily.includes('createDailyClient()'));
for (const endpoint of ['dailyMoments', 'dailyDiaries', 'dailyAlbums', 'dailySummaries', 'dailySummaryRange', 'dailySummaryRun', 'dailySummaryCommit']) {
  assert.ok(dailyClient.includes(`API.${endpoint}`), `Daily client misses ${endpoint}`);
}
assert.equal((frontendMemory.match(/router\.register\('memory'/g) || []).length, 1);
assert.equal(frontendRooms.includes("router.register('memory'"), false);
for (const action of ['memory:soil-edit', 'memory:soil-clear', 'memory:soil-auto', 'memory:soil-open']) assert.ok(frontendMemory.includes(action));
assert.equal(frontendRooms.includes('room-memory-drawer'), false);
assert.equal(frontendRooms.includes('owner-note'), false);
assert.ok(frontendRooms.includes('activateRoom(kind)'));
assert.ok(frontendRooms.includes('room-soil-tip'));
for (const copy of ['小寒 · 神秘狗话', '小寒这轮很放松，因此偷懒中。', '不写也可以。神秘狗话是助力，不是打卡。']) {
  assert.ok(frontendDogtalk.includes(copy), `dogtalk UI misses ${copy}`);
}
assert.match(chatStyles, /\.composer--chat\s*\{\s*grid-template-columns:\s*42px minmax\(0, 1fr\) 42px;\s*\}/);
assert.match(chatStyles, /\.composer--room\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\) 42px;\s*\}/);
assert.equal(chatStyles.includes('!important'), false);
assert.match(featureStyles, /\.feature-head\s*\{[\s\S]*?height:\s*calc\(var\(--topbar-height\) \+ var\(--safe-top\)\)/);
assert.match(chatStyles, /\.message-scroller\s*\{[\s\S]*?-webkit-overflow-scrolling:\s*touch;[\s\S]*?touch-action:\s*pan-y;/);
assert.match(featureStyles, /\.feature-body\s*\{[\s\S]*?-webkit-overflow-scrolling:\s*touch;[\s\S]*?touch-action:\s*pan-y;/);

const middleware = await read(resolve(root, 'functions/_middleware.js'));
const auth = await read(resolve(root, 'functions/auth.js'));
const mailboxPage = await read(resolve(root, 'functions/mailbox-page.js'));
const mailboxApi = await read(resolve(root, 'functions/mailbox-api.js'));
const mailboxAuth = await read(resolve(root, 'functions/mailbox-auth.js'));
const mailboxSchema = await read(resolve(root, 'functions/mailbox-schema.js'));
const mailboxRepository = await read(resolve(root, 'functions/mailbox-repository.js'));
const ownerMailbox = await read(resolve(root, 'functions/owner-mailbox-api.js'));
const mailboxFrontend = await read(resolve(pages, 'public/mailbox.js'));
for (const copy of ['海岸信箱', '输入暗号', '填记名册', '之前来访的访客，可凭登记过的暗号重新进入', '第一次来到海岸？先登记称呼与专属暗号']) {
  assert.ok(auth.includes(copy), `mailbox entrance misses ${copy}`);
}
assert.ok(middleware.indexOf('isMailboxApiPath(url.pathname)') < middleware.indexOf('verifySession(request, env)'));
assert.ok(mailboxPage.includes('/public/mailbox.js?v=coast-mailbox-04'));
for (const table of ['mailbox_visitors', 'mailbox_messages', 'mailbox_reply_queue', 'visitor_notebook_entries', 'mailbox_thinking_notes', 'mailbox_thought_soils', 'mailbox_memory_pockets', 'mailbox_patrol_batches']) {
  assert.ok(mailboxSchema.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `missing mailbox table: ${table}`);
}
assert.ok(mailboxSchema.includes('passphrase_hash TEXT NOT NULL UNIQUE'));
assert.ok(mailboxAuth.includes('const PBKDF2_ITERATIONS = 100000'));
assert.ok(mailboxRepository.includes('is_visible_to_owner, safety_flag'));
assert.equal(ownerMailbox.includes('content'), false, 'owner mailbox route cannot return sealed content');
assert.equal(ownerMailbox.includes('visitor_notebook_entries'), false, 'owner mailbox route cannot read notebook text');
assert.ok(mailboxFrontend.includes('确认落袋'));
assert.ok(mailboxFrontend.includes('data-pocket-action="discard"'));
assert.ok(mailboxFrontend.includes('删除整个海岸信箱对话？'));
assert.equal((await read(resolve(pages, 'public/mailbox-entry.js'))).includes('URLSearchParams'), false, 'root login cannot auto-open mailbox');

const chatStore = await read(resolve(root, 'functions/chat-store.js'));
const chatSchema = await read(resolve(root, 'functions/chat-schema.js'));
const dailyApi = await read(resolve(root, 'functions/daily-api.js'));
const dailySchema = await read(resolve(root, 'functions/daily-schema.js'));
const dailyStore = await read(resolve(root, 'functions/daily-store.js'));
const memoryStore = await read(resolve(root, 'functions/memory-store.js'));
const memoryRecall = await read(resolve(root, 'functions/memory-recall.js'));
const memoryRouter = await read(resolve(root, 'functions/memory-router.js'));
const embedding = await read(resolve(root, 'functions/embedding.js'));
const dogtalkStore = await read(resolve(root, 'functions/dogtalk-store.js'));
const dogtalkApi = await read(resolve(root, 'functions/dogtalk-api.js'));
const calendarSchema = await read(resolve(root, 'functions/calendar-schema.js'));
const calendarStore = await read(resolve(root, 'functions/calendar-store.js'));
const calendarApi = await read(resolve(root, 'functions/calendar-api.js'));
const toolRuns = await read(resolve(root, 'functions/tool-run-log.js'));
const coastApi = await read(resolve(root, 'functions/coast-api.js'));
const roomRecords = await read(resolve(root, 'functions/room-records.js'));
const packageSource = JSON.parse(await read(resolve(root, 'package.json')));
assert.equal(/readLegacy|importLegacy|\bturns\s+WHERE|user_variants|assistant_variants/.test(chatStore), false);
assert.ok(chatStore.includes('conversation_states'));
assert.ok(chatSchema.includes('conversation_landing_letters'));
for (const table of ['daily_moments', 'daily_moment_comments', 'daily_moment_likes', 'daily_diaries', 'daily_album_items', 'daily_summaries']) assert.ok(dailySchema.includes(`CREATE TABLE IF NOT EXISTS ${table}`));
assert.ok(dailyApi.includes("'/api/daily'"));
assert.equal(dailySummary.includes('listActiveMessagesInRange'), false, 'Daily summary must not read raw chats');
assert.equal(dailyComment.includes('listActiveMessagesInRange'), false, 'Daily comments must not read raw chats');
for (const table of ['coast_calendar_events', 'coast_calendar_notes', 'coast_calendar_changes', 'coast_calendar_recurring_seeds']) assert.ok(calendarSchema.includes(`CREATE TABLE IF NOT EXISTS ${table}`));
assert.ok(calendarStore.includes('seedCalendarRecurringEvents'));
for (const fragment of ['`${ROOT}/events`', '`${ROOT}/notes`', '`${ROOT}/env`', '`${ROOT}/unseen`']) assert.ok(calendarApi.includes(fragment));
assert.ok(calendarApi.includes('const dayMatch ='));
for (const table of ['conversation_soils', 'memory_pockets', 'pocket_recall_memberships', 'memory_entries']) assert.ok(memoryStore.includes(`CREATE TABLE IF NOT EXISTS ${table}`));
for (const pool of ['conversation_seeds', 'conversation_memories', 'conversation_pockets', 'global_seeds', 'global_memories', 'global_pockets']) assert.ok(memoryRecall.includes(pool));
assert.ok(memoryStore.includes("action === 'confirm_pocket'"));
assert.ok(memoryStore.includes('revision_(supplement|replace|new_version|downgrade)'));
assert.ok(memoryRouter.includes('upsertSoilPocketCandidates'));
assert.ok(embedding.includes('COAST_MEMORY_VECTOR.upsert'));
assert.ok(embedding.includes('COAST_MEMORY_VECTOR.deleteByIds'));
assert.equal(/dimensions\s*[:=]\s*\d+/.test(embedding + memoryRecall + memoryRouter), false, 'embedding dimensions cannot be assumed');
assert.ok(dogtalkApi.includes('requireOwnerSession'));
for (const contract of ["const TYPE = 'xiaohan_mystic_dogtalk'", "const OWNER = 'xiaohan'", 'auto_recall: false', "memory_weight: 'low'"]) assert.ok(dogtalkStore.includes(contract));
assert.ok(toolRuns.includes('mailbox_content_redacted'));
assert.ok(toolRuns.includes('dogtalk_content_redacted'));
assert.ok(coastApi.includes('listRadioRoomMessages'));
assert.ok(coastApi.includes('listLighthouseRoomMessages'));
assert.ok(roomRecords.includes('attachDogtalkSnapshots'));
assert.equal(packageSource.dependencies, undefined, 'production Functions must not require uninstalled dependencies');
assert.equal(/from\s+['"](?:@modelcontextprotocol\/sdk|jose|zod(?:\/v4)?)['"]/.test(mcp), false);

const mcpOwner = (await Promise.all([
  'mcp-router.js', 'mcp-tools.js', 'mcp-auth.js', 'coast-api.js', 'radio-myri.js',
  'official-soil-store.js', 'radio-store.js', 'lighthouse-store.js', 'room-records.js',
  'friend-myrisol-prompt.js', 'mailbox-schema.js', 'mailbox-repository.js', 'mailbox-service.js',
].map((file) => read(resolve(root, 'functions', file))))).join('\n');
for (const failureCode of ['missing_authorization_header', 'malformed_bearer_token', 'jwt_verify_failed', 'issuer_mismatch', 'audience_mismatch', 'expired_token', 'scope_missing', 'subject_not_allowed', 'email_not_allowed', 'email_not_verified']) {
  assert.ok(mcpOwner.includes(`'${failureCode}'`), `missing MCP auth diagnostic: ${failureCode}`);
}
assert.equal(/hidden[_ -]?marker|reply[_ -]?scanner|scanReply|MutationObserver|createElement\(['"]script['"]\)|\b(?:compat|wrapper|bridge)\b/i.test(mcpOwner), false);
for (const label of ['上下文舒服区间', '最大输出 token', '思维壤最多字数', '每个完成轮次自动整理一次', '手持种上限', '清空当前思维壤', '打开待确认袋', '查看向量状态']) assert.ok(frontendTools.includes(label));

console.log('architecture: ok');

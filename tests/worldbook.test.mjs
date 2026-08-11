import assert from 'node:assert/strict';
import { createWorldbookEntry, matchWorldbook } from '../functions/worldbook.js';
import { ensureWorldbookSchema, worldbookMigrationIds } from '../functions/worldbook-schema.js';
import { routeWorkbenchApi } from '../functions/workbench-api.js';
import { D1Database } from './d1-helper.mjs';

const db = new D1Database();
await ensureWorldbookSchema(db);
await ensureWorldbookSchema(db);
const ownerMatches = await matchWorldbook(db, { input: '我们来检查思维壤和连通一千零一个触角', surface: 'main_chat', allowedScopes: ['owner', 'both'] });
assert.ok(ownerMatches.some((entry) => entry.title === '思维壤'));
assert.ok(ownerMatches.some((entry) => entry.title === '连通一千零一个触角'));
assert.equal(db.database.prepare('SELECT COUNT(*) AS count FROM schema_migrations WHERE id = ?').get(worldbookMigrationIds[0]).count, 1);
assert.equal(db.database.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name IN ('coast_mode_cards', 'coast_context_state')").get().count, 0);
assert.equal(db.database.prepare("SELECT COUNT(*) AS count FROM coast_worldbook_entries WHERE id IN ('memory-orb', 'context-manifest', 'kelivo-principle')").get().count, 0);

await createWorldbookEntry(db, {
  title: '访客安全灯', content: '只说明信箱正在工作。', keywords: ['安全灯'],
  scope: 'visitor', visitor_safe: true, priority: 200,
});
await createWorldbookEntry(db, {
  title: 'Owner 私密施工', content: '不可给访客。', keywords: ['秘密施工'],
  scope: 'owner', visitor_safe: false, priority: 300,
});
const visitor = await matchWorldbook(db, { input: '安全灯和秘密施工', surface: 'mailbox_visitor', allowedScopes: ['visitor', 'both'] });
assert.ok(visitor.some((entry) => entry.title === '访客安全灯'));
assert.equal(visitor.some((entry) => entry.title === 'Owner 私密施工'), false);
assert.equal(visitor.every((entry) => entry.visitor_safe), true);

for (let index = 0; index < 3; index += 1) {
  await createWorldbookEntry(db, {
    title: `常驻核心 ${index + 1}`, content: '仅用于测试常驻上限。',
    keywords: [], constant_active: true, scope: 'owner', priority: 1,
  });
}
await assert.rejects(
  () => createWorldbookEntry(db, {
    title: '过多常驻', content: '不应写入。', keywords: [], constant_active: true,
  }),
  (error) => error.type === 'worldbook_constant_limit',
);

const rejectedMutation = await routeWorkbenchApi(new Request('https://coast.test/api/worldbook', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: '跨站伪造', content: '不应写入。', keywords: ['伪造'] }),
}), { COAST_CHAT_DB: db }, { sub: 'owner' });
assert.equal(rejectedMutation.status, 403, '工作台及词典写入必须通过同源校验');
const acceptedMutation = await routeWorkbenchApi(new Request('https://coast.test/api/worldbook', {
  method: 'POST',
  headers: { Origin: 'https://coast.test', 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: '同源词条', content: '只在同源请求中写入。', keywords: ['同源词条'] }),
}), { COAST_CHAT_DB: db }, { sub: 'owner' });
assert.equal(acceptedMutation.status, 201);

console.log('worldbook: ok');

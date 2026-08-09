import assert from 'node:assert/strict';
import { createWorldbookEntry, matchWorldbook } from '../functions/context-worldbook.js';
import { D1Database } from './d1-helper.mjs';

const db = new D1Database();
const ownerMatches = await matchWorldbook(db, { input: '我们来检查思维壤和 Context Manifest', surface: 'main_chat', worldbook_scope: 'construction' });
assert.ok(ownerMatches.some((entry) => entry.title === '思维壤'));
assert.ok(ownerMatches.some((entry) => entry.title === 'Context Manifest'));

await createWorldbookEntry(db, {
  title: '访客安全灯', content: '只说明信箱正在工作。', keywords: ['安全灯'],
  scope: 'visitor', visitor_safe: true, priority: 200,
});
await createWorldbookEntry(db, {
  title: 'Owner 私密施工', content: '不可给访客。', keywords: ['秘密施工'],
  scope: 'owner', visitor_safe: false, priority: 300,
});
const visitor = await matchWorldbook(db, { input: '安全灯和秘密施工', surface: 'mailbox_visitor', worldbook_scope: 'visitor' });
assert.ok(visitor.some((entry) => entry.title === '访客安全灯'));
assert.equal(visitor.some((entry) => entry.title === 'Owner 私密施工'), false);
assert.equal(visitor.every((entry) => entry.visitor_safe), true);

for (let index = 0; index < 4; index += 1) {
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

console.log('worldbook: ok');

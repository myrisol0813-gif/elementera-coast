import assert from 'node:assert/strict';
import { createWorldbookEntry, matchWorldbook } from '../functions/context-worldbook.js';
import { D1Database } from './d1-helper.mjs';

const db = new D1Database();
await createWorldbookEntry(db, {
  title: '自触发禁止', content: '只在用户提到潮汐密钥时触发。', keywords: ['潮汐密钥'],
  scope: 'owner', priority: 400,
});
const fromSystem = await matchWorldbook(db, {
  input: '今天聊别的。', surface: 'main_chat', worldbook_scope: 'owner',
  messages: [{ role: 'system', content: 'Manifest 中写着潮汐密钥。' }],
});
assert.equal(fromSystem.some((entry) => entry.title === '自触发禁止'), false);
const fromRecent = await matchWorldbook(db, {
  input: '继续。', surface: 'main_chat', worldbook_scope: 'owner',
  messages: [{ role: 'user', content: '刚才提到潮汐密钥。' }],
});
assert.equal(fromRecent.find((entry) => entry.title === '自触发禁止')?.matched_source, 'recent_message');

await createWorldbookEntry(db, { title: '访客安全', content: '安全内容', keywords: ['访客灯'], scope: 'visitor', visitor_safe: true, priority: 500 });
await createWorldbookEntry(db, { title: '访客禁区', content: 'owner 私密内容', keywords: ['访客灯'], scope: 'owner', visitor_safe: false, priority: 600 });
const visitor = await matchWorldbook(db, { input: '访客灯', surface: 'mailbox_visitor', worldbook_scope: 'visitor' });
assert.ok(visitor.some((entry) => entry.title === '访客安全'));
assert.equal(visitor.some((entry) => entry.title === '访客禁区'), false);
assert.ok(visitor.every((entry) => entry.visitor_safe && ['visitor', 'both'].includes(entry.scope)));

console.log('context-worldbook-scope: ok');

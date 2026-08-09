import assert from 'node:assert/strict';
import { createConversation } from '../functions/chat-store.js';
import { assembleContextForSurface } from '../functions/context-assembler.js';
import { writeSoil } from '../functions/memory-store.js';
import { registerMailboxVisitor } from '../functions/mailbox-service.js';
import { createWorldbookEntry } from '../functions/context-worldbook.js';
import { D1Database } from './d1-helper.mjs';

const db = new D1Database();
const env = { COAST_CHAT_DB: db, COAST_SESSION_SECRET: 'visitor-context-secret-'.repeat(5) };
const main = await createConversation(db, 'Owner private context');
await writeSoil(db, main.id, { current_text: 'OWNER_PRIVATE_CONTEXT_NEVER_LEAK' });
await createWorldbookEntry(db, { title: 'Owner 机密词典', content: 'OWNER_WORLDBOOK_SECRET', keywords: ['同一触发词'], scope: 'owner', visitor_safe: false, priority: 999 });
await createWorldbookEntry(db, { title: '访客安全词典', content: '只说明当前访客房规则。', keywords: ['同一触发词'], scope: 'visitor', visitor_safe: true, priority: 500 });
const visitor = await registerMailboxVisitor(db, env, { display_name: '访客甲', passphrase: '访客甲-暗号', allow_memory: true });
const lastUser = { role: 'user', content: '同一触发词，继续当前访客的信。', turn_id: 'visitor-turn-1' };
const assembled = await assembleContextForSurface(env, {
  surface: 'mailbox_visitor', conversationId: `mailbox:${visitor.id}`, visitorId: visitor.id,
  messages: [lastUser], lastUser, permission: 'visitor', preview: true,
});
assert.match(assembled.manifest.body, /当前房间：海岸信箱访客房/);
assert.match(assembled.manifest.body, /只能使用当前 visitor_id/);
assert.equal(assembled.debug, null, 'visitor never receives owner inspector debug');
assert.deepEqual(assembled.tools, []);
assert.ok(assembled.worldbook_matches.some((entry) => entry.title === '访客安全词典'));
assert.equal(assembled.worldbook_matches.some((entry) => entry.title === 'Owner 机密词典'), false);
assert.doesNotMatch(JSON.stringify(assembled.modelMessages), /OWNER_PRIVATE_CONTEXT_NEVER_LEAK|OWNER_WORLDBOOK_SECRET/);
assert.ok(assembled.blocks.every((block) => !['global', 'cross_surface', 'project'].includes(block.scope)));

console.log('mailbox-visitor-context: ok');

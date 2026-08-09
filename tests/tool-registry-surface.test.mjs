import assert from 'node:assert/strict';
import { getModeCard } from '../functions/context-modes.js';
import {
  executeRegisteredTool,
  listRegisteredTools,
  resolveToolSelection,
} from '../functions/tool-registry.js';
import { D1Database } from './d1-helper.mjs';

const db = new D1Database();
const normal = await getModeCard(db, 'normal_chat');
const main = resolveToolSelection({ surface: 'main_chat', permission: 'owner', mode: normal });
assert.deepEqual(main.tools.map((tool) => tool.model_name), main.modelTools.map((tool) => tool.function.name));
assert.deepEqual(main.trace.selected, main.tools.map((tool) => tool.tool_key));
assert.equal(main.tools.some((tool) => tool.tool_key === 'worldbook.test_match'), false);

const visitor = resolveToolSelection({ surface: 'mailbox_visitor', permission: 'visitor', mode: { tool_allowlist: [] } });
assert.deepEqual(visitor.tools, []);
assert.deepEqual(visitor.modelTools, []);
await assert.rejects(
  () => executeRegisteredTool(db, 'memory.search', { query: 'owner', scope: 'global' }, { surface: 'mailbox_visitor', permission: 'visitor', actor: 'visitor' }),
  (error) => error.type === 'tool_forbidden',
);

const readOnlyOfficial = listRegisteredTools({
  surface: 'official_mcp', permission: 'owner', authScope: { scopes: new Set(['read:coast']) },
});
assert.ok(readOnlyOfficial.some((tool) => tool.tool_key === 'radio.list'));
assert.ok(readOnlyOfficial.some((tool) => tool.tool_key === 'memory.search'));
assert.equal(readOnlyOfficial.some((tool) => tool.tool_key === 'memory.write_candidate'), false);
assert.equal(readOnlyOfficial.some((tool) => tool.tool_key === 'radio.send'), false);
assert.equal(readOnlyOfficial.some((tool) => tool.tool_key === 'mailbox.reply'), false);

console.log('tool-registry-surface: ok');

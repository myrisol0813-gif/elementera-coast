import assert from 'node:assert/strict';
import { createConversation } from '../functions/chat-store.js';
import { createEntry } from '../functions/memory-store.js';
import { executeModelTool, executeRegisteredTool, listRegisteredTools, resolveToolSelection } from '../functions/tool-registry.js';
import { listToolRuns, summarizeToolValue } from '../functions/tool-run-log.js';
import { D1Database } from './d1-helper.mjs';

const db = new D1Database();
const conversation = await createConversation(db, 'Registry 神秘狗话');
const tools = listRegisteredTools({ permission: 'owner', surface: 'main_chat' });
assert.ok(tools.some((tool) => tool.tool_key === 'calendar.create'));
assert.ok(tools.some((tool) => tool.tool_key === 'memory.search'));
assert.equal(tools.find((tool) => tool.tool_key === 'calendar.today').display_name, '翻看台历');
assert.equal(tools.find((tool) => tool.tool_key === 'memory.write_candidate').display_name, '放入待确认袋');
const selection = resolveToolSelection({ permission: 'owner', surface: 'main_chat' });
const modelTools = selection.modelTools;
assert.ok(modelTools.some((tool) => tool.function.name === 'calendar_create'));
assert.ok(modelTools.some((tool) => tool.function.name === 'memory_search'));
assert.equal(modelTools.some((tool) => tool.function.name === 'calendar_delete'), false, 'destructive model tool waits for explicit confirmation');
assert.deepEqual(selection.tools.map((tool) => tool.model_name), modelTools.map((tool) => tool.function.name));

await createEntry(db, {
  conversation_id: conversation.id,
  scope: 'conversation',
  entry_type: 'memory',
  title: '干净工具结果',
  life_core: '模型只应看见这张简洁记忆纸条。',
  content: '数据库里的完整记忆正文不应带着字段名重新进入模型。',
});
const modelMemoryResult = await executeModelTool(db, {
  id: 'memory-call-1',
  function: {
    name: 'memory_search',
    arguments: JSON.stringify({ query: '干净工具结果', scope: 'conversation', limit: 5 }),
  },
}, {
  env: { COAST_CHAT_DB: db },
  permission: 'owner',
  surface: 'main_chat',
  room_scope: 'conversation',
  actor: 'myri',
  conversation_id: conversation.id,
});
assert.deepEqual(Object.keys(modelMemoryResult).sort(), ['count', 'memories', 'vector_enabled']);
assert.match(modelMemoryResult.memories[0], /干净工具结果｜模型只应看见这张简洁记忆纸条/);
assert.doesNotMatch(JSON.stringify(modelMemoryResult), /conversation_id|scope|source|priority|freshness|confidence|usage_hint|avoid_hint/);
const memorySearchRun = (await listToolRuns(db)).find((run) => run.tool_key === 'memory.search');
assert.match(JSON.stringify(memorySearchRun.input_summary), /content_redacted/);
assert.doesNotMatch(JSON.stringify(memorySearchRun), /模型只应看见这张简洁记忆纸条|数据库里的完整记忆正文/);

const visitorTools = listRegisteredTools({ permission: 'visitor', surface: 'mailbox_visitor', visitorId: 'visitor-a' });
assert.equal(visitorTools.some((tool) => tool.owner_only), false);
await assert.rejects(
  () => executeRegisteredTool(db, 'calendar.today', {}, { permission: 'visitor', surface: 'mailbox_visitor', actor: 'visitor' }),
  (error) => error.type === 'tool_forbidden',
);

const created = await executeRegisteredTool(db, 'calendar.create', {
  title: 'Registry 日历', starts_at: '2026-11-01', precision: 'day', is_all_day: true,
}, { permission: 'owner', surface: 'official_mcp', room_scope: 'calendar', actor: 'official_mcp' });
assert.equal(created.event.title, 'Registry 日历');
const runs = await listToolRuns(db);
assert.equal(runs[0].tool_key, 'calendar.create');
assert.equal(runs[0].status, 'success');

await executeRegisteredTool(db, 'dogtalk.save', {
  body: '这句神秘狗话不能进工具日志。',
  true_core: '只留此刻温度。',
  read_mode: 'current_room',
}, {
  permission: 'owner', surface: 'main_chat', room_scope: 'conversation', actor: 'xiaohan',
  conversation_id: conversation.id, source_turn_id: 'registry-dogtalk-turn',
});
const dogtalkRun = (await listToolRuns(db)).find((run) => run.tool_key === 'dogtalk.save');
assert.match(JSON.stringify(dogtalkRun.input_summary), /dogtalk_content_redacted/);
assert.doesNotMatch(JSON.stringify(dogtalkRun), /这句神秘狗话|只留此刻温度/);

await assert.rejects(
  () => executeRegisteredTool(db, 'calendar.create', { title: '', starts_at: '2026-11-02' }, {
    permission: 'owner', surface: 'official_mcp', room_scope: 'calendar', actor: 'official_mcp',
  }),
  (error) => error.type === 'calendar_title_required',
);
const failedRun = (await listToolRuns(db, { status: 'error' }))[0];
assert.equal(failedRun.tool_key, 'calendar.create');
assert.match(failedRun.error_message, /事件标题不能为空/);

await assert.rejects(() => executeRegisteredTool(db, 'mailbox.reply', {
  content: '这是不得进入日志的访客正文',
}, { permission: 'owner', surface: 'official_mcp', room_scope: 'mailbox', actor: 'official_mcp' }));
const mailboxFailure = (await listToolRuns(db, { status: 'error', tool_key: 'mailbox.reply' }))[0];
assert.doesNotMatch(JSON.stringify(mailboxFailure), /不得进入日志的访客正文/);
assert.match(mailboxFailure.error_message, /^mailbox_tool_failed:/);

const mailboxSummary = summarizeToolValue('mailbox.reply', {
  content: '绝对不能进日志的访客正文', thought_soil: { current_text: '也不能进日志' }, batch_id: 'batch-1', ok: true,
});
assert.doesNotMatch(mailboxSummary, /绝对不能|也不能/);
assert.match(mailboxSummary, /mailbox_content_redacted/);

console.log('tool-registry: ok');

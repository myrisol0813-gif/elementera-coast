// retrigger 7
import { readFile, writeFile } from 'node:fs/promises';

const path = 'scripts/p0-soil-incremental-bridge.mjs';
let text = await readFile(path, 'utf8');
text = text.replace(/id: \\\`\$\{id\}-user\\\`/g, "id: id + '-user'");
text = text.replace(/id: \\\`\$\{id\}-assistant\\\`/g, "id: id + '-assistant'");
text = text.replace(/\\\`unexpected fetch: \\\${url}\\\`/g, "'unexpected fetch: ' + url");
text = text.replace(/\\\`visible-\\\${index}\\\`/g, "'visible-' + index");
text = text.replace(/\\\`第\\\${index}轮用户 \\\${index === 98 \? 'previous-visible-marker ' : ''}\\\${index === 99 \? 'latest-visible-user-marker ' : ''}\\\${'甲'\.repeat\(1800\)}\\\`/g, "'第' + index + '轮用户 ' + (index === 98 ? 'previous-visible-marker ' : '') + (index === 99 ? 'latest-visible-user-marker ' : '') + '甲'.repeat(1800)");
text = text.replace(/\\\`第\\\${index}轮助手 \\\${index === 98 \? 'previous-visible-assistant-marker ' : ''}\\\${index === 99 \? 'latest-visible-assistant-marker ' : ''}\\\${'乙'\.repeat\(1800\)}\\\`/g, "'第' + index + '轮助手 ' + (index === 98 ? 'previous-visible-assistant-marker ' : '') + (index === 99 ? 'latest-visible-assistant-marker ' : '') + '乙'.repeat(1800)");
text = text.replace(/\\\`2026-07-15T02:\\\${String\(index\)\.padStart\(2, '0'\)}:00\.000Z\\\`/g, "'2026-07-15T02:' + String(index).padStart(2, '0') + ':00.000Z'");
text = text.replace(
  "  if (url.includes('/api/v1/chat/completions')) {",
  "  if (url.includes('/api/v1/models')) {\n    return new Response(JSON.stringify({ data: [{ id: 'openai/gpt-4.1-nano', name: 'GPT-4.1 Nano', architecture: { output_modalities: ['text'] }, supported_parameters: ['temperature', 'response_format', 'reasoning'], pricing: { prompt: '0', completion: '0' } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });\n  }\n  if (url.includes('/api/v1/chat/completions')) {",
);
text = text.replace(
  "const memoryContext = await buildMemoryContext(db, seedConversation.id, '同轨燕鸥和海岸怎么重新回来？', { limit: 3 });",
  "const memoryContext = await buildMemoryContext({ COAST_CHAT_DB: db }, 'owner', seedConversation.id, '同轨燕鸥', { limit: 3 });",
);
text = text.replace(
  "assert.ok(memoryContext.entries.some((entry) => entry.life_core.includes('同轨燕鸥')), 'conversation seed semantic recall must still work');",
  "assert.ok(memoryContext.conversation_seeds.some((entry) => entry.life_core.includes('同轨燕鸥')), 'conversation seed semantic recall must still work');",
);
await writeFile(path, text);

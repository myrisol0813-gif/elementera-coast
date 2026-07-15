import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();

async function replace(path, before, after) {
  const full = resolve(root, path);
  const source = await readFile(full, 'utf8');
  if (!source.includes(before)) throw new Error(`missing patch target in ${path}: ${before.slice(0, 120)}`);
  await writeFile(full, source.replace(before, after));
}

async function replaceRegex(path, pattern, after) {
  const full = resolve(root, path);
  const source = await readFile(full, 'utf8');
  if (!pattern.test(source)) throw new Error(`missing regex patch target in ${path}: ${pattern}`);
  await writeFile(full, source.replace(pattern, after));
}

await replace(
  'functions/memory-router.js',
  `const MEMORY_PATH = '/api/memory';\nconst BODY_LIMIT = 48 * 1024;`,
  `const MEMORY_PATH = '/api/memory';\nconst BODY_LIMIT = 48 * 1024;\nconst SOIL_RECENT_TURNS = 12;\nconst SOIL_FULL_RECENT_TURNS = 3;\nconst SOIL_FIELD_CHARS = 6000;\nconst SOIL_PROMPT_TOTAL_CHARS = 64 * 1024;\nconst SOIL_ORGANIZE_MAX_TOKENS = 3200;`,
);

await replace(
  'functions/memory-router.js',
  `function fallbackCurrentText(turns, landing) {\n  const latest = turns.at(-1);\n  if (landing || latest?.user?.hidden || latest?.user?.input_type === 'landing_letter') {\n    return '登岛信开场已经完成，正在承接这封信与刚刚的读信回复。';\n  }\n  const source = String(latest?.user?.content || '').replace(/\\s+/g, ' ').trim();\n  const preview = Array.from(source).slice(0, 72).join('');\n  return preview\n    ? \`刚刚完成了一轮对话，当前正在承接：\${preview}\${Array.from(source).length > 72 ? '…' : ''}\`\n    : '刚刚完成了一轮对话，正在承接当前主题与下一步。';\n}\n\nfunction soilPrompt(turns, oldSoil, maxHandSeeds) {\n  const recent = turns.slice(-8).map((branch, index) => ({\n    turn: index + 1,\n    turn_id: branch.turn_id,\n    user: {\n      message_id: String(branch.user.id || ''),\n      content: String(branch.user.content || '').slice(0, 3000),\n    },\n    assistant: {\n      message_id: String(branch.assistant.id || ''),\n      content: String(branch.assistant.content || '').slice(0, 3000),\n    },\n  }));`,
  `function fallbackCurrentText(turns, landing) {\n  const latest = turns.at(-1);\n  if (landing || latest?.user?.hidden || latest?.user?.input_type === 'landing_letter') {\n    return '登岛信开场已经完成，正在承接这封信与刚刚的读信回复。';\n  }\n  const source = String(latest?.user?.content || '').replace(/\\s+/g, ' ').trim();\n  const preview = Array.from(source).slice(0, 72).join('');\n  return preview\n    ? \`刚刚完成了一轮对话，当前正在承接：\${preview}\${Array.from(source).length > 72 ? '…' : ''}\`\n    : '刚刚完成了一轮对话，正在承接当前主题与下一步。';\n}\n\nfunction clipSoilContent(value, max = SOIL_FIELD_CHARS) {\n  return Array.from(String(value || '')).slice(0, Math.max(0, max)).join('');\n}\n\nfunction soilPromptTurns(turns) {\n  const recent = turns.slice(-SOIL_RECENT_TURNS).map((branch, index) => ({\n    turn: index + 1,\n    turn_id: branch.turn_id,\n    user: {\n      message_id: String(branch.user.id || ''),\n      content: clipSoilContent(branch.user.content),\n    },\n    assistant: {\n      message_id: String(branch.assistant.id || ''),\n      content: clipSoilContent(branch.assistant.content),\n    },\n  }));\n\n  if (JSON.stringify(recent).length <= SOIL_PROMPT_TOTAL_CHARS) return recent;\n\n  const protectedStart = Math.max(0, recent.length - SOIL_FULL_RECENT_TURNS);\n  const protectedLength = JSON.stringify(recent.slice(protectedStart)).length;\n  const olderFields = Math.max(1, protectedStart * 2);\n  const olderLimit = Math.max(800, Math.floor((SOIL_PROMPT_TOTAL_CHARS - protectedLength - 2048) / olderFields));\n  for (let index = 0; index < protectedStart; index += 1) {\n    recent[index].user.content = clipSoilContent(recent[index].user.content, olderLimit);\n    recent[index].assistant.content = clipSoilContent(recent[index].assistant.content, olderLimit);\n  }\n  if (JSON.stringify(recent).length <= SOIL_PROMPT_TOTAL_CHARS) return recent;\n\n  for (let index = 0; index < protectedStart; index += 1) {\n    recent[index].user.content = clipSoilContent(recent[index].user.content, 400);\n    recent[index].assistant.content = clipSoilContent(recent[index].assistant.content, 400);\n  }\n  return recent;\n}\n\nfunction soilPrompt(turns, oldSoil, maxHandSeeds) {\n  const recent = soilPromptTurns(turns);`,
);

await replace(
  'functions/memory-router.js',
  `      messages: [{ role: 'user', content: soilPrompt(turns, oldSoil, settings.maxHandSeeds) }],\n      settings: { max_tokens: 2000, temperature: 0.2 },\n      response_format: SOIL_RESPONSE_FORMAT,\n      reasoning: { effort: 'minimal', exclude: true },\n    });\n    if (result?.finish_reason === 'length') {\n      throw new MemoryStoreError('soil_organize_truncated', '思维壤整理结果被模型长度上限截断。', 502);\n    }\n    organized = parseStrictJson(result?.message?.content);\n    organizedBy = {\n      model_id: result?.model || requestedModel || profile.current_chat_model || 'openai/gpt-4.1-nano',\n      usage: result?.usage || null,\n      generation_source: 'soil',\n      generated_at: Date.now(),\n    };`,
  `      messages: [{ role: 'user', content: soilPrompt(turns, oldSoil, settings.maxHandSeeds) }],\n      settings: { max_tokens: SOIL_ORGANIZE_MAX_TOKENS, temperature: 0.2 },\n      response_format: SOIL_RESPONSE_FORMAT,\n      reasoning: { effort: 'minimal', exclude: true },\n    });\n    if (result?.finish_reason === 'length') {\n      throw new MemoryStoreError('soil_organize_truncated', '思维壤整理结果被模型长度上限截断。', 502);\n    }\n    organized = parseStrictJson(result?.message?.content);\n    organizedBy = {\n      model_id: result?.model || requestedModel || profile.current_chat_model || 'openai/gpt-4.1-nano',\n      usage: result?.usage || null,\n      generation_source: 'soil',\n      generated_at: Date.now(),\n    };`,
);

await replaceRegex(
  'functions/memory-router.js',
  /  try \{\n    const profile = await readProfile\(env\.COAST_CHAT_DB\);\n    const result = await performFormalChat\(env, \{[\s\S]*?    organizedBy = \{\n      model_id: result\?\.model \|\| requestedModel \|\| profile\.current_chat_model \|\| 'openai\/gpt-4\.1-nano',\n      usage: result\?\.usage \|\| null,\n      generation_source: 'soil',\n      generated_at: Date\.now\(\),\n    \};\n  \} catch \(error\) \{\n    if \(!\(error instanceof ModelRequestError\)\n      && !\(error instanceof MemoryStoreError && String\(error\.type \|\| ''\)\.startsWith\('soil_organize_'\)\)\) throw error;\n    console\.error\('\[memory:soil-organize\]', error\);\n    degradedReason = error\.type \|\| 'soil_organize_failed';\n    return json\(\{\n      ok: true,\n      degraded: true,\n      reason: degradedReason,\n      soil: oldSoil,\n    \}\);\n  \}/,
  `  try {\n    const profile = await readProfile(env.COAST_CHAT_DB);\n    const modelId = requestedModel || profile.current_chat_model || 'openai/gpt-4.1-nano';\n    const basePrompt = soilPrompt(turns, oldSoil, settings.maxHandSeeds);\n    let lastJsonError = null;\n    for (let attempt = 0; attempt < 2; attempt += 1) {\n      try {\n        const result = await performFormalChat(env, {\n          model: modelId,\n          messages: [{\n            role: 'user',\n            content: attempt === 0\n              ? basePrompt\n              : \`${basePrompt}\\n\\n上一次输出不是合法 JSON。请只返回一个完整 JSON 对象，不要 Markdown，不要解释，不要省略字段。\`,\n          }],\n          settings: { max_tokens: SOIL_ORGANIZE_MAX_TOKENS, temperature: 0.2 },\n          response_format: SOIL_RESPONSE_FORMAT,\n          reasoning: { effort: 'minimal', exclude: true },\n        });\n        if (result?.finish_reason === 'length') {\n          throw new MemoryStoreError('soil_organize_truncated', '思维壤整理结果被模型长度上限截断。', 502);\n        }\n        organized = parseStrictJson(result?.message?.content);\n        organizedBy = {\n          model_id: result?.model || modelId,\n          usage: result?.usage || null,\n          generation_source: 'soil',\n          generated_at: Date.now(),\n        };\n        lastJsonError = null;\n        break;\n      } catch (error) {\n        if (!(error instanceof MemoryStoreError && String(error.type || '').startsWith('soil_organize_'))) throw error;\n        lastJsonError = error;\n        if (attempt === 1) throw error;\n      }\n    }\n    if (!organized && lastJsonError) throw lastJsonError;\n  } catch (error) {\n    if (!(error instanceof ModelRequestError)\n      && !(error instanceof MemoryStoreError && String(error.type || '').startsWith('soil_organize_'))) throw error;\n    console.error('[memory:soil-organize]', error);\n    degradedReason = error.type || 'soil_organize_failed';\n    const degradedSoil = await writeSoil(env.COAST_CHAT_DB, conversationId, {\n      current_text: fallback,\n      hand_seeds: oldSoil.hand_seeds,\n      do_not_repeat: oldSoil.do_not_repeat,\n      pocket_candidates: oldSoil.pocket_candidates,\n      manual_locked: oldSoil.manual_locked,\n      auto_refresh_enabled: oldSoil.auto_refresh_enabled,\n    }, { automatic: true });\n    return json({\n      ok: true,\n      degraded: true,\n      reason: degradedReason,\n      soil: await decorateSoilProvenance(env.COAST_CHAT_DB, degradedSoil),\n      pocket_sync: null,\n    });\n  }`,
);

await replace(
  'elementera-mcp/deploy-pages/public/features/chat.js',
  `        toast('模型或供应商达到自身长度上限，且思维壤整理失败；回复已保存，旧壤已保留，下一轮会自动重试。', 3600);`,
  `        toast('回复已保存，思维壤已保底整理；下轮会继续自动整理。', 3200);`,
);
await replace(
  'elementera-mcp/deploy-pages/public/features/chat.js',
  `        toast('回复已保存，但思维壤整理失败；旧壤已保留，下一轮会自动重试。', 3200);`,
  `        toast('回复已保存，思维壤已保底整理。', 3000);`,
);

await replace(
  'tests/memory.test.mjs',
  `import assert from 'node:assert/strict';\nimport { DatabaseSync } from 'node:sqlite';`,
  `import assert from 'node:assert/strict';\nimport { readFile } from 'node:fs/promises';\nimport { DatabaseSync } from 'node:sqlite';`,
);

await replace(
  'tests/memory.test.mjs',
  `let providerPayload = null;\nlet providerContent = '带着轻量上下文回答。';\nlet providerFinishReason = 'stop';\nlet providerChatCalls = 0;`,
  `let providerPayload = null;\nlet providerContent = '带着轻量上下文回答。';\nlet providerFinishReason = 'stop';\nlet providerStatus = 200;\nlet providerChatCalls = 0;`,
);

await replace(
  'tests/memory.test.mjs',
  `  if (url.includes('/api/v1/chat/completions')) {\n    providerChatCalls += 1;\n    providerPayload = JSON.parse(options.body);\n    return new Response(JSON.stringify({\n      model: providerPayload.model,\n      choices: [{ message: { content: providerContent }, finish_reason: providerFinishReason }],\n    }), { status: 200, headers: { 'Content-Type': 'application/json' } });\n  }`,
  `  if (url.includes('/api/v1/chat/completions')) {\n    providerChatCalls += 1;\n    providerPayload = JSON.parse(options.body);\n    if (providerStatus !== 200) {\n      return new Response(JSON.stringify({ error: { message: 'provider unavailable' } }), { status: providerStatus, headers: { 'Content-Type': 'application/json' } });\n    }\n    const content = Array.isArray(providerContent) ? providerContent.shift() : providerContent;\n    const finishReason = Array.isArray(providerFinishReason) ? providerFinishReason.shift() : providerFinishReason;\n    return new Response(JSON.stringify({\n      model: providerPayload.model,\n      choices: [{ message: { content }, finish_reason: finishReason }],\n    }), { status: 200, headers: { 'Content-Type': 'application/json' } });\n  }`,
);

await replace(
  'tests/memory.test.mjs',
  `assert.equal(providerPayload.max_completion_tokens, 2000, 'thought soil keeps a larger bounded JSON budget for reasoning-capable models');`,
  `assert.equal(providerPayload.max_completion_tokens, 3200, 'thought soil keeps a wider bounded JSON budget for reasoning-capable models');`,
);

await replace(
  'tests/memory.test.mjs',
  `async function organizeConversationD(output) {\n  providerContent = JSON.stringify(output);\n  const response = await routeMemoryApi(new Request('https://coast.test/api/memory/soil/organize', {\n    method: 'POST',\n    headers: { Origin: 'https://coast.test', 'Content-Type': 'application/json' },\n    body: JSON.stringify({ conversation_id: conversationD.id, force: false, trigger: 'reply' }),\n  }), { COAST_CHAT_DB: db, OPENROUTER_API_KEY: 'test-key' });\n  const data = await response.json();\n  assert.equal(response.status, 200);\n  return data;\n}`, 
  `async function organizeConversationDRequest(extra = {}) {\n  const response = await routeMemoryApi(new Request('https://coast.test/api/memory/soil/organize', {\n    method: 'POST',\n    headers: { Origin: 'https://coast.test', 'Content-Type': 'application/json' },\n    body: JSON.stringify({ conversation_id: conversationD.id, force: false, trigger: 'reply', ...extra }),\n  }), { COAST_CHAT_DB: db, OPENROUTER_API_KEY: 'test-key' });\n  const data = await response.json();\n  assert.equal(response.status, 200);\n  return data;\n}\n\nasync function organizeConversationD(output, extra = {}) {\n  providerContent = JSON.stringify(output);\n  return organizeConversationDRequest(extra);\n}`,
);

await replace(
  'tests/memory.test.mjs',
  `assert.equal(guardedPending[0].life_core, guardedCandidate.life_core);\n\nconst replacedSoilData = await organizeConversationD({`,
  `assert.equal(guardedPending[0].life_core, guardedCandidate.life_core);\n\nproviderContent = [\n  '上一次不是合法 JSON。',\n  JSON.stringify({\n    current_text: '重试成功整理',\n    hand_seeds_mode: 'replace',\n    hand_seeds: [{ name: '重试种', life_core: '第一次 JSON 失败后第二次成功', usage_hint: '', avoid_hint: '' }],\n    do_not_repeat_mode: 'replace',\n    do_not_repeat: '重试后写入的新勿复读',\n    pocket_candidates_mode: 'clear',\n    pocket_candidates: [],\n  }),\n];\nconst retryCallsBefore = providerChatCalls;\nconst retrySoilData = await organizeConversationDRequest();\nassert.equal(providerChatCalls - retryCallsBefore, 2, 'invalid JSON must retry exactly once');\nassert.equal(retrySoilData.degraded, undefined);\nassert.equal(retrySoilData.soil.current_text, '重试成功整理');\nassert.equal(retrySoilData.soil.hand_seeds[0].life_core, '第一次 JSON 失败后第二次成功');\n\nconst replacedSoilData = await organizeConversationD({`,
);

await replace(
  'tests/memory.test.mjs',
  `assert.equal(providerPayload.response_format?.json_schema?.strict, true);\nassert.ok(providerPayload.response_format?.json_schema?.schema?.required?.includes('hand_seeds_mode'));\nassert.deepEqual(providerPayload.reasoning, { effort: 'minimal', exclude: true }, 'soil-only reasoning must leave completion room for the JSON payload');\nassert.match(providerPayload.messages[0].content, /工作台小纸条/, 'soil prompt must frame the soil as a temporary workbench');`,
  `assert.equal(providerPayload.response_format?.json_schema?.strict, true);\nassert.ok(providerPayload.response_format?.json_schema?.schema?.required?.includes('hand_seeds_mode'));\nassert.deepEqual(providerPayload.reasoning, { effort: 'minimal', exclude: true }, 'soil-only reasoning must leave completion room for the JSON payload');\nassert.match(providerPayload.messages[0].content, /工作台小纸条/, 'soil prompt must frame the soil as a temporary workbench');`,
);

await replace(
  'tests/memory.test.mjs',
  `assert.match(providerPayload.messages[0].content, /先 upsert 到 pending/, 'soil prompt must explain that old candidates may leave the display after pending sync');\n\nconst turn = (id, user, assistant, createdAt) => ({`,
  `assert.match(providerPayload.messages[0].content, /先 upsert 到 pending/, 'soil prompt must explain that old candidates may leave the display after pending sync');\n\nconst conversationLong = await createConversation(db, 'long soil prompt');\nconst longTurns = Array.from({ length: 12 }, (_, index) => turn(\n  \`long-soil-\${index}\`,\n  \`第\${index}轮用户 \${'甲'.repeat(7200)}\${index === 11 ? ' 最新用户完整尾标' : ''}\`,\n  \`第\${index}轮助手 \${'乙'.repeat(7200)}\${index === 11 ? ' 最新助手完整尾标' : ''}\`,\n  \`2026-07-14T08:\${String(index).padStart(2, '0')}:00.000Z\`,\n));\nawait writeConversationState(db, conversationLong.id, { version: 4, turns: longTurns });\nproviderContent = JSON.stringify({\n  current_text: '长回复后仍能整理',\n  hand_seeds_mode: 'clear',\n  hand_seeds: [],\n  do_not_repeat_mode: 'clear',\n  do_not_repeat: '',\n  pocket_candidates_mode: 'clear',\n  pocket_candidates: [],\n});\nconst longSoilResponse = await routeMemoryApi(new Request('https://coast.test/api/memory/soil/organize', {\n  method: 'POST',\n  headers: { Origin: 'https://coast.test', 'Content-Type': 'application/json' },\n  body: JSON.stringify({ conversation_id: conversationLong.id, force: true, trigger: 'reply', settings: { maxHandSeeds: 7 } }),\n}), { COAST_CHAT_DB: db, OPENROUTER_API_KEY: 'test-key' });\nconst longSoilData = await longSoilResponse.json();\nassert.equal(longSoilResponse.status, 200);\nassert.equal(longSoilData.soil.current_text, '长回复后仍能整理');\nassert.equal(providerPayload.max_completion_tokens, 3200);\nassert.match(providerPayload.messages[0].content, /最新用户完整尾标/, 'latest long user content should be preserved in the soil prompt');\nassert.match(providerPayload.messages[0].content, /最新助手完整尾标/, 'latest long assistant content should be preserved in the soil prompt');\nassert.ok(providerPayload.messages[0].content.length < 90000, 'soil prompt should keep a bounded total input size');\n\nconst turn = (id, user, assistant, createdAt) => ({`,
);

await replace(
  'tests/memory.test.mjs',
  `assert.equal(degradedSoilData.reason, 'soil_organize_invalid');\nassert.equal(degradedSoilData.soil.current_text, soilBeforeDegradedOrganize.current_text, 'a failed organize must keep the previous current note instead of echoing the latest user message');\nassert.equal((await readSoil(db, conversationC.id)).current_text, soilBeforeDegradedOrganize.current_text, 'a degraded organize must not write a fake fallback current note');\nassert.equal((await readSoil(db, conversationC.id)).revision, soilBeforeDegradedOrganize.revision, 'a degraded organize must not advance the soil revision');\nassert.equal((await listPockets(db, { conversation_id: conversationC.id, status: 'pending' })).length, pendingBeforeDegradedOrganize, 'a failed organize must not mutate pending pockets');`,
  `assert.equal(degradedSoilData.reason, 'soil_organize_invalid');\nassert.match(degradedSoilData.soil.current_text, /第三轮需要兜底/, 'degraded organize should write a soft fallback current note');\nassert.equal(degradedSoilData.soil.hand_seeds.length, soilBeforeDegradedOrganize.hand_seeds.length, 'degraded organize must keep old hand seeds');\nassert.ok((await readSoil(db, conversationC.id)).revision > soilBeforeDegradedOrganize.revision, 'a degraded organize should save the soft fallback state');\nassert.equal((await listPockets(db, { conversation_id: conversationC.id, status: 'pending' })).length, pendingBeforeDegradedOrganize, 'a degraded organize must not mutate pending pockets');`,
);

await replace(
  'tests/memory.test.mjs',
  `assert.equal(truncatedSoilData.degraded, true);\nassert.equal(truncatedSoilData.reason, 'soil_organize_truncated');\nassert.equal(truncatedSoilData.soil.current_text, soilBeforeDegradedOrganize.current_text);\nassert.equal((await readSoil(db, conversationC.id)).revision, soilBeforeDegradedOrganize.revision);\nproviderFinishReason = 'stop';`,
  `assert.equal(truncatedSoilData.degraded, true);\nassert.equal(truncatedSoilData.reason, 'soil_organize_truncated');\nassert.match(truncatedSoilData.soil.current_text, /第三轮需要兜底/);\nproviderFinishReason = 'stop';\n\nproviderStatus = 503;\nconst providerErrorResponse = await routeMemoryApi(new Request('https://coast.test/api/memory/soil/organize', {\n  method: 'POST',\n  headers: { Origin: 'https://coast.test', 'Content-Type': 'application/json' },\n  body: JSON.stringify({ conversation_id: conversationC.id, force: false, trigger: 'reply' }),\n}), { COAST_CHAT_DB: db, OPENROUTER_API_KEY: 'test-key' });\nconst providerErrorData = await providerErrorResponse.json();\nassert.equal(providerErrorResponse.status, 200);\nassert.equal(providerErrorData.degraded, true);\nassert.equal(providerErrorData.reason, 'provider_unavailable');\nassert.match(providerErrorData.soil.current_text, /第三轮需要兜底/);\nproviderStatus = 200;`,
);

await replace(
  'tests/memory.test.mjs',
  `globalThis.fetch = originalFetch;\nconsole.log('memory: ok');`,
  `const chatUiText = await readFile(new URL('../elementera-mcp/deploy-pages/public/features/chat.js', import.meta.url), 'utf8');\nassert.equal(chatUiText.includes('思维壤整理失败'), false, 'degraded toast must not use hard failure wording');\nassert.equal(chatUiText.includes('手动整理'), false, 'degraded toast must not suggest the retired manual organize button');\nassert.match(chatUiText, /思维壤已保底整理/, 'degraded toast should be soft and non-alarming');\n\nglobalThis.fetch = originalFetch;\nconsole.log('memory: ok');`,
);

console.log('P0 soil no-fail relax patch applied.');

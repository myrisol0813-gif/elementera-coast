import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();

async function replace(path, before, after) {
  const full = resolve(root, path);
  const source = await readFile(full, 'utf8');
  if (!source.includes(before)) throw new Error(`missing patch target in ${path}: ${before.slice(0, 100)}`);
  await writeFile(full, source.replace(before, after));
}

await replace(
  'functions/models.js',
  `function chatPayload(modelId, messages, maxTokens, temperature, model) {\n  const payload = { model: modelId, messages };\n  if (maxTokens !== null) {\n    payload.max_completion_tokens = maxTokens;\n    if (!modelId.startsWith('openai/')) payload.max_tokens = maxTokens;\n  }\n  if (supportsTemperature(modelId, model)) payload.temperature = temperature;\n  return payload;\n}`,
  `function supportsReasoningControl(modelId, model) {\n  const parameters = Array.isArray(model?.supported_parameters) ? model.supported_parameters : [];\n  return parameters.includes('reasoning') || /^openai\\/(?:o|gpt-5)/i.test(String(modelId || ''));\n}\n\nfunction supportsResponseFormat(model) {\n  return Array.isArray(model?.supported_parameters) && model.supported_parameters.includes('response_format');\n}\n\nfunction chatPayload(modelId, messages, maxTokens, temperature, model, options = {}) {\n  const payload = { model: modelId, messages };\n  if (maxTokens !== null) {\n    payload.max_completion_tokens = maxTokens;\n    if (!modelId.startsWith('openai/')) payload.max_tokens = maxTokens;\n  }\n  if (supportsTemperature(modelId, model)) payload.temperature = temperature;\n  if (options.responseFormat && supportsResponseFormat(model)) payload.response_format = options.responseFormat;\n  if (options.reasoning && supportsReasoningControl(modelId, model)) payload.reasoning = options.reasoning;\n  return payload;\n}`,
);

await replace(
  'functions/models.js',
  `    payload: chatPayload(modelId, messages, maxTokens, temperature, model),`,
  `    payload: chatPayload(modelId, messages, maxTokens, temperature, model, {\n      responseFormat: input.response_format || null,\n      reasoning: input.reasoning || null,\n    }),`,
);

await replace(
  'functions/memory-router.js',
  `const MEMORY_PATH = '/api/memory';\nconst BODY_LIMIT = 48 * 1024;`,
  `const MEMORY_PATH = '/api/memory';\nconst BODY_LIMIT = 48 * 1024;\n\nconst SOIL_RESPONSE_FORMAT = Object.freeze({\n  type: 'json_schema',\n  json_schema: Object.freeze({\n    name: 'thought_soil',\n    strict: true,\n    schema: Object.freeze({\n      type: 'object',\n      additionalProperties: false,\n      properties: Object.freeze({\n        current_text: Object.freeze({ type: 'string' }),\n        hand_seeds_mode: Object.freeze({ type: 'string', enum: ['replace', 'keep', 'clear'] }),\n        hand_seeds: Object.freeze({\n          type: 'array',\n          items: Object.freeze({\n            type: 'object',\n            additionalProperties: false,\n            properties: Object.freeze({\n              name: Object.freeze({ type: 'string' }),\n              life_core: Object.freeze({ type: 'string' }),\n              usage_hint: Object.freeze({ type: 'string' }),\n              avoid_hint: Object.freeze({ type: 'string' }),\n            }),\n            required: ['name', 'life_core', 'usage_hint', 'avoid_hint'],\n          }),\n        }),\n        do_not_repeat_mode: Object.freeze({ type: 'string', enum: ['replace', 'keep', 'clear'] }),\n        do_not_repeat: Object.freeze({ type: 'string' }),\n        pocket_candidates_mode: Object.freeze({ type: 'string', enum: ['replace', 'keep', 'clear'] }),\n        pocket_candidates: Object.freeze({\n          type: 'array',\n          items: Object.freeze({\n            type: 'object',\n            additionalProperties: false,\n            properties: Object.freeze({\n              candidate_id: Object.freeze({ type: 'string' }),\n              title: Object.freeze({ type: 'string' }),\n              life_core: Object.freeze({ type: 'string' }),\n              content: Object.freeze({ type: 'string' }),\n              usage_hint: Object.freeze({ type: 'string' }),\n              avoid_hint: Object.freeze({ type: 'string' }),\n              source_refs: Object.freeze({\n                type: 'array',\n                items: Object.freeze({\n                  type: 'object',\n                  additionalProperties: false,\n                  properties: Object.freeze({\n                    turn_id: Object.freeze({ type: 'string' }),\n                    role: Object.freeze({ type: 'string', enum: ['user', 'assistant', 'turn'] }),\n                  }),\n                  required: ['turn_id', 'role'],\n                }),\n              }),\n              source_excerpt: Object.freeze({ type: 'string' }),\n            }),\n            required: ['candidate_id', 'title', 'life_core', 'content', 'usage_hint', 'avoid_hint', 'source_refs', 'source_excerpt'],\n          }),\n        }),\n      }),\n      required: [\n        'current_text',\n        'hand_seeds_mode',\n        'hand_seeds',\n        'do_not_repeat_mode',\n        'do_not_repeat',\n        'pocket_candidates_mode',\n        'pocket_candidates',\n      ],\n    }),\n  }),\n});`,
);

await replace(
  'functions/memory-router.js',
  `      messages: [{ role: 'user', content: soilPrompt(turns, oldSoil, settings.maxHandSeeds) }],\n      settings: { max_tokens: 1200, temperature: 0.2 },\n    });\n    organized = parseStrictJson(result?.message?.content);`,
  `      messages: [{ role: 'user', content: soilPrompt(turns, oldSoil, settings.maxHandSeeds) }],\n      settings: { max_tokens: 2000, temperature: 0.2 },\n      response_format: SOIL_RESPONSE_FORMAT,\n      reasoning: { effort: 'minimal', exclude: true },\n    });\n    if (result?.finish_reason === 'length') {\n      throw new MemoryStoreError('soil_organize_truncated', '思维壤整理结果被模型长度上限截断。', 502);\n    }\n    organized = parseStrictJson(result?.message?.content);`,
);

await replace(
  'functions/memory-router.js',
  `  } catch (error) {\n    if (!(error instanceof ModelRequestError)\n      && !(error instanceof MemoryStoreError && error.type === 'soil_organize_invalid')) throw error;\n    console.error('[memory:soil-organize]', error);\n    degradedReason = error.type || 'soil_organize_failed';\n    organized = {\n      current_text: fallback,\n      hand_seeds: oldSoil.hand_seeds,\n      do_not_repeat: oldSoil.do_not_repeat,\n      pocket_candidates: oldSoil.pocket_candidates,\n    };\n  }`,
  `  } catch (error) {\n    if (!(error instanceof ModelRequestError)\n      && !(error instanceof MemoryStoreError && String(error.type || '').startsWith('soil_organize_'))) throw error;\n    console.error('[memory:soil-organize]', error);\n    degradedReason = error.type || 'soil_organize_failed';\n    return json({\n      ok: true,\n      degraded: true,\n      reason: degradedReason,\n      soil: oldSoil,\n    });\n  }`,
);

await replace(
  'elementera-mcp/deploy-pages/public/features/chat.js',
  `        toast('模型或供应商达到自身长度上限，且思维壤整理失败；回复已保存，可以重新生成并稍后整理。', 3600);`,
  `        toast('模型或供应商达到自身长度上限，且思维壤整理失败；回复已保存，旧壤已保留，下一轮会自动重试。', 3600);`,
);

await replace(
  'elementera-mcp/deploy-pages/public/features/chat.js',
  `        toast('回复已保存，但思维壤整理失败，可以稍后手动整理。', 3200);`,
  `        toast('回复已保存，但思维壤整理失败；旧壤已保留，下一轮会自动重试。', 3200);`,
);

await replace(
  'tests/memory.test.mjs',
  `        supported_parameters: [],\n        pricing: { prompt: '0.2', completion: '0.4' },`,
  `        supported_parameters: ['response_format', 'reasoning'],\n        pricing: { prompt: '0.2', completion: '0.4' },`,
);

await replace(
  'tests/memory.test.mjs',
  `assert.equal(providerPayload.max_completion_tokens, 1200, 'thought soil keeps a bounded internal JSON budget');\nassert.match(providerPayload.messages[0].content, /工作台小纸条/, 'soil prompt must frame the soil as a temporary workbench');`,
  `assert.equal(providerPayload.max_completion_tokens, 2000, 'thought soil keeps a larger bounded JSON budget for reasoning-capable models');\nassert.equal(providerPayload.response_format?.type, 'json_schema', 'soil organize must request structured JSON when the selected model supports it');\nassert.equal(providerPayload.response_format?.json_schema?.strict, true);\nassert.ok(providerPayload.response_format?.json_schema?.schema?.required?.includes('hand_seeds_mode'));\nassert.deepEqual(providerPayload.reasoning, { effort: 'minimal', exclude: true }, 'soil-only reasoning must leave completion room for the JSON payload');\nassert.match(providerPayload.messages[0].content, /工作台小纸条/, 'soil prompt must frame the soil as a temporary workbench');`,
);

await replace(
  'tests/memory.test.mjs',
  `providerContent = '这次上游没有按要求返回 JSON。';\nconst pendingBeforeDegradedOrganize = (await listPockets(db, { conversation_id: conversationC.id, status: 'pending' })).length;\nconst degradedSoilResponse = await routeMemoryApi(new Request('https://coast.test/api/memory/soil/organize', {`,
  `const soilBeforeDegradedOrganize = await readSoil(db, conversationC.id);\nproviderContent = '这次上游没有按要求返回 JSON。';\nconst pendingBeforeDegradedOrganize = (await listPockets(db, { conversation_id: conversationC.id, status: 'pending' })).length;\nconst degradedSoilResponse = await routeMemoryApi(new Request('https://coast.test/api/memory/soil/organize', {`,
);

await replace(
  'tests/memory.test.mjs',
  `assert.equal(degradedSoilData.reason, 'soil_organize_invalid');\nassert.match(degradedSoilData.soil.current_text, /第三轮需要兜底/);\nassert.equal((await readSoil(db, conversationC.id)).current_text, degradedSoilData.soil.current_text, 'the fallback current section must persist');\nassert.equal((await listPockets(db, { conversation_id: conversationC.id, status: 'pending' })).length, pendingBeforeDegradedOrganize, 'a failed organize must not mutate pending pockets');`,
  `assert.equal(degradedSoilData.reason, 'soil_organize_invalid');\nassert.equal(degradedSoilData.soil.current_text, soilBeforeDegradedOrganize.current_text, 'a failed organize must keep the previous current note instead of echoing the latest user message');\nassert.equal((await readSoil(db, conversationC.id)).current_text, soilBeforeDegradedOrganize.current_text, 'a degraded organize must not write a fake fallback current note');\nassert.equal((await readSoil(db, conversationC.id)).revision, soilBeforeDegradedOrganize.revision, 'a degraded organize must not advance the soil revision');\nassert.equal((await listPockets(db, { conversation_id: conversationC.id, status: 'pending' })).length, pendingBeforeDegradedOrganize, 'a failed organize must not mutate pending pockets');\n\nproviderFinishReason = 'length';\nproviderContent = JSON.stringify({\n  current_text: '即使 JSON 看起来完整也不能把截断态写进壤',\n  hand_seeds_mode: 'clear',\n  hand_seeds: [],\n  do_not_repeat_mode: 'clear',\n  do_not_repeat: '',\n  pocket_candidates_mode: 'clear',\n  pocket_candidates: [],\n});\nconst truncatedSoilResponse = await routeMemoryApi(new Request('https://coast.test/api/memory/soil/organize', {\n  method: 'POST',\n  headers: { Origin: 'https://coast.test', 'Content-Type': 'application/json' },\n  body: JSON.stringify({ conversation_id: conversationC.id, force: false, trigger: 'reply' }),\n}), { COAST_CHAT_DB: db, OPENROUTER_API_KEY: 'test-key' });\nconst truncatedSoilData = await truncatedSoilResponse.json();\nassert.equal(truncatedSoilData.degraded, true);\nassert.equal(truncatedSoilData.reason, 'soil_organize_truncated');\nassert.equal(truncatedSoilData.soil.current_text, soilBeforeDegradedOrganize.current_text);\nassert.equal((await readSoil(db, conversationC.id)).revision, soilBeforeDegradedOrganize.revision);\nproviderFinishReason = 'stop';`,
);

console.log('P0 soil degraded fallback patch applied.');

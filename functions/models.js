import { apiError, json, readJson } from './http.js';

const OPENROUTER_REFERER = 'https://app.elementeracoast.com';
const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models?output_modalities=text,image';
const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-4.1-nano';
const MAX_CHAT_MESSAGES = 20;
const MAX_CHAT_CONTENT_CHARS = 2 * 1024 * 1024;
export const MAX_FORMAL_TOKENS = 65536;
const DEFAULT_FORMAL_TOKENS = 8000;
const MAX_SANDBOX_TOKENS = 700;
const CATALOG_TTL_MS = 10 * 60 * 1000;
const FREE_TEST_MODEL_IDS = Object.freeze([
  'nvidia/nemotron-3-super-120b-a12b:free',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
]);
const SANDBOX_MODELS = new Set([
  ...FREE_TEST_MODEL_IDS,
  'openai/gpt-4.1-nano',
  'openai/gpt-4.1-mini',
  'openai/gpt-4o-mini',
]);

let catalogCache = null;
let catalogExpiresAt = 0;

export class ModelRequestError extends Error {
  constructor(type, message, status = 400, details = {}) {
    super(message);
    this.name = 'ModelRequestError';
    this.type = type;
    this.status = status;
    this.details = details;
  }
}

function openRouterKey(env) {
  return env.OPENROUTER_API_KEY;
}

function clamp(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

export function normalizeUsage(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const fields = ['prompt_tokens', 'completion_tokens', 'total_tokens'];
  const values = fields.map((field) => Number(value[field]));
  if (!values.every((number) => Number.isFinite(number) && number >= 0)) return null;
  return Object.fromEntries(fields.map((field, index) => [field, Math.trunc(values[index])]));
}

function outputModalities(model) {
  const value = model?.architecture?.output_modalities;
  if (Array.isArray(value)) return value.map((item) => String(item).toLowerCase());
  if (typeof value === 'string') return [value.toLowerCase()];
  return [];
}

function hasOutput(model, modality) {
  return outputModalities(model).includes(modality);
}

function priceIsZero(value) {
  if (value === 0 || value === '0') return true;
  const number = Number(value);
  return Number.isFinite(number) && number === 0;
}

function isFreeModel(model) {
  const pricing = model?.pricing || {};
  return String(model?.id || '').includes(':free')
    || (priceIsZero(pricing.prompt) && priceIsZero(pricing.completion));
}

function modelText(model) {
  return `${model?.id || ''} ${model?.name || ''}`.toLowerCase();
}

function isOpenAiChat(model) {
  const id = String(model?.id || '');
  if (!id.startsWith('openai/') || !hasOutput(model, 'text')) return false;
  const excluded = ['embedding', 'embed', 'gpt-image', 'dall-e', 'tts', 'whisper', 'transcribe', 'audio', 'moderation'];
  return !excluded.some((word) => modelText(model).includes(word));
}

function isOpenAiImage(model, version) {
  return String(model?.id || '').startsWith('openai/')
    && hasOutput(model, 'image')
    && modelText(model).includes(`gpt-image-${version}`);
}

function safeModel(model, extra = {}) {
  return {
    id: String(model?.id || extra.id || ''),
    name: String(model?.name || extra.name || model?.id || extra.id || ''),
    context_length: model?.context_length ?? null,
    pricing: model?.pricing || null,
    supported_parameters: Array.isArray(model?.supported_parameters) ? model.supported_parameters : [],
    architecture: model?.architecture || null,
    top_provider: model?.top_provider || null,
    created: model?.created ?? null,
    is_free: Boolean(extra.is_free ?? isFreeModel(model)),
    available: extra.available ?? true,
  };
}

function sortModels(models) {
  return models.sort((left, right) => String(left.name || left.id).localeCompare(String(right.name || right.id)));
}

function chooseDefaultChat(models) {
  for (const id of ['openai/gpt-4.1-mini', 'openai/gpt-4.1-nano', 'openai/gpt-4o-mini']) {
    if (models.some((model) => model.id === id)) return id;
  }
  return models[0]?.id || '';
}

export function buildModelCatalog(raw) {
  const source = Array.isArray(raw?.data) ? raw.data : [];
  const openaiChat = sortModels(source.filter(isOpenAiChat).map((model) => safeModel(model)));
  const imageTwo = source.filter((model) => isOpenAiImage(model, 2)).map((model) => safeModel(model));
  const imageOne = source.filter((model) => isOpenAiImage(model, 1)).map((model) => safeModel(model));
  const openaiImage = sortModels(imageTwo.length ? imageTwo : imageOne);
  const free = new Map();
  for (const model of source.filter((item) => hasOutput(item, 'text') && isFreeModel(item))) {
    const safe = safeModel(model, { is_free: true });
    free.set(safe.id, safe);
  }
  for (const id of FREE_TEST_MODEL_IDS) {
    if (!free.has(id)) free.set(id, safeModel(null, { id, name: id, is_free: true, available: false }));
  }
  return {
    ok: true,
    groups: {
      openai_chat: openaiChat,
      openai_image: openaiImage,
      free_test: sortModels([...free.values()]),
    },
    defaults: {
      chat: chooseDefaultChat(openaiChat),
      image: openaiImage[0]?.id || '',
      free: FREE_TEST_MODEL_IDS[0],
    },
    updated_at: new Date().toISOString(),
  };
}

export async function fetchModelCatalog(env, force = false) {
  const now = Date.now();
  if (!force && catalogCache && catalogExpiresAt > now) return catalogCache;
  const headers = { Accept: 'application/json' };
  if (openRouterKey(env)) headers.Authorization = `Bearer ${openRouterKey(env)}`;
  let response;
  try {
    response = await fetch(OPENROUTER_MODELS_URL, { headers });
  } catch {
    throw new ModelRequestError('models_fetch_failed', 'Model catalog is unavailable.', 502);
  }
  if (!response.ok) throw new ModelRequestError('models_fetch_failed', 'Model catalog is unavailable.', 502);
  let raw;
  try {
    raw = await response.json();
  } catch {
    throw new ModelRequestError('models_parse_failed', 'Model catalog is invalid.', 502);
  }
  catalogCache = buildModelCatalog(raw);
  catalogExpiresAt = now + CATALOG_TTL_MS;
  return catalogCache;
}

function validateMessages(messages, { system = false, maxContent = MAX_CHAT_CONTENT_CHARS } = {}) {
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > MAX_CHAT_MESSAGES) {
    throw new ModelRequestError('invalid_messages', '消息格式无效。', 400);
  }
  const roles = system ? ['system', 'user', 'assistant'] : ['user', 'assistant'];
  return messages.map((message) => {
    if (!message || !roles.includes(message.role)) {
      throw new ModelRequestError('invalid_messages', '消息角色无效。', 400);
    }
    if (typeof message.content !== 'string' || !message.content.trim() || message.content.length > maxContent) {
      throw new ModelRequestError('invalid_messages', '消息内容无效或过长。', 400);
    }
    return { role: message.role, content: message.content };
  });
}

function catalogModel(catalog, modelId) {
  return [
    ...(catalog?.groups?.openai_chat || []),
    ...(catalog?.groups?.free_test || []),
    ...(catalog?.groups?.openai_image || []),
  ].find((model) => model.id === modelId) || null;
}

function supportsTemperature(modelId, model) {
  if (Array.isArray(model?.supported_parameters) && model.supported_parameters.length) {
    return model.supported_parameters.includes('temperature');
  }
  const id = String(modelId || '').toLowerCase();
  return !(id.startsWith('openai/o') || id.startsWith('openai/gpt-5'));
}

function supportsReasoningControl(modelId, model) {
  const parameters = Array.isArray(model?.supported_parameters) ? model.supported_parameters : [];
  return parameters.includes('reasoning') || /^openai\/(?:o|gpt-5)/i.test(String(modelId || ''));
}

function supportsResponseFormat(model) {
  return Array.isArray(model?.supported_parameters) && model.supported_parameters.includes('response_format');
}

function supportsTools(modelId, model) {
  const parameters = Array.isArray(model?.supported_parameters) ? model.supported_parameters : [];
  if (parameters.length) {
    return parameters.includes('tools') || parameters.includes('tool_choice');
  }
  return String(modelId || '').startsWith('openai/');
}

function normalizeTools(value) {
  return (Array.isArray(value) ? value : [])
    .filter((tool) => tool?.type === 'function'
      && /^[a-zA-Z0-9_-]{1,64}$/.test(String(tool?.function?.name || ''))
      && tool?.function?.parameters
      && typeof tool.function.parameters === 'object')
    .slice(0, 16)
    .map((tool) => ({
      type: 'function',
      function: {
        name: String(tool.function.name),
        description: String(tool.function.description || '').slice(0, 2000),
        parameters: tool.function.parameters,
      },
    }));
}

function chatPayload(modelId, messages, maxTokens, temperature, model, options = {}) {
  const payload = { model: modelId, messages };
  if (maxTokens !== null) {
    payload.max_completion_tokens = maxTokens;
    if (!modelId.startsWith('openai/')) payload.max_tokens = maxTokens;
  }
  if (supportsTemperature(modelId, model)) payload.temperature = temperature;
  if (options.responseFormat && supportsResponseFormat(model)) payload.response_format = options.responseFormat;
  if (options.reasoning && supportsReasoningControl(modelId, model)) payload.reasoning = options.reasoning;
  const tools = supportsTools(modelId, model) ? normalizeTools(options.tools) : [];
  if (tools.length) {
    payload.tools = tools;
    payload.tool_choice = options.toolChoice || 'auto';
  }
  return payload;
}

function compact(value, max = 160) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function creditTokenShortfall(preview = '') {
  const match = String(preview).match(/requested up to\s+([\d,]+)\s+tokens?,\s+but can only afford\s+([\d,]+)/i);
  if (!match) return null;
  const requested = Number(match[1].replace(/,/g, ''));
  const affordable = Number(match[2].replace(/,/g, ''));
  if (!Number.isFinite(requested) || !Number.isFinite(affordable)) return null;
  return { requested: Math.trunc(requested), affordable: Math.trunc(affordable), missing: Math.max(0, Math.trunc(requested - affordable)) };
}

async function providerError(response) {
  const raw = await response.text().catch(() => '');
  try {
    const value = JSON.parse(raw);
    return compact(value?.error?.message || value?.message || value?.error || raw);
  } catch {
    return compact(raw);
  }
}

function normalizedProviderError(status, model, preview = '') {
  const lower = preview.toLowerCase();
  if (status === 401) return ['auth_error', 'API key 无效或未配置。'];
  if (status === 402) {
    const credit = creditTokenShortfall(preview);
    if (credit) return ['insufficient_credits', `OpenRouter 额度预检未通过：本次最大输出设为 ${credit.requested} tokens，当前余额最多负担 ${credit.affordable}，还差 ${credit.missing} tokens。请在 API 小屋把“最大输出 token”调到 ${credit.affordable} 或更低。`];
    return ['insufficient_credits', 'OpenRouter 余额或 credits 不足。可以在 API 小屋调低“最大输出 token”。'];
  }
  if (status === 403 && lower.includes('not available in your region')) return ['region_unavailable', '该模型在当前网络地区不可用。可以切换网络出口，或换用其他模型。'];
  if (status === 403) return ['forbidden', '当前 key 或账户没有权限使用该模型。'];
  if (status === 404) return ['model_not_found', '模型不存在或已下架。'];
  if (status === 429) return ['rate_limited', '请求过快或模型限速，请稍后再试。'];
  if ([502, 503, 504].includes(status)) return ['provider_unavailable', '上游模型暂时不可用。可以稍后重试或换模型。'];
  return ['chat_error', '消息生成失败，请稍后重试。'];
}

function providerRequest(env, payload, title, signal) {
  return fetch(OPENROUTER_CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openRouterKey(env)}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': OPENROUTER_REFERER,
      'X-Title': title,
    },
    body: JSON.stringify(payload),
    signal,
  });
}

async function requestOpenRouter(env, payload, title) {
  let response;
  try {
    response = await providerRequest(env, payload, title);
  } catch {
    throw new ModelRequestError('provider_unavailable', '上游模型暂时不可用。', 502, { model: payload.model });
  }
  if (!response.ok) {
    const preview = await providerError(response);
    const [type, message] = normalizedProviderError(response.status, payload.model, preview);
    const status = [401, 402, 403, 404, 429].includes(response.status) ? response.status : 502;
    throw new ModelRequestError(type, message, status, {
      model: payload.model,
      upstream_status: response.status,
      provider_message_preview: preview,
    });
  }
  try {
    return await response.json();
  } catch {
    throw new ModelRequestError('invalid_provider_response', '上游返回了无效响应。', 502, { model: payload.model });
  }
}

async function requestOpenRouterStream(env, payload, title, signal) {
  let response;
  try {
    response = await providerRequest(env, payload, title, signal);
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new ModelRequestError('provider_unavailable', '上游模型暂时不可用。', 502, { model: payload.model });
  }
  if (!response.ok) {
    const preview = await providerError(response);
    const [type, message] = normalizedProviderError(response.status, payload.model, preview);
    const status = [401, 402, 403, 404, 429].includes(response.status) ? response.status : 502;
    throw new ModelRequestError(type, message, status, { model: payload.model, upstream_status: response.status });
  }
  if (!response.body) throw new ModelRequestError('invalid_provider_response', '上游没有返回可读取的流。', 502, { model: payload.model });
  return response;
}

async function prepareFormalChat(env, input, allowSystem) {
  if (!openRouterKey(env)) throw new ModelRequestError('auth_error', 'OpenRouter key 未配置。', 503);
  const catalog = await fetchModelCatalog(env);
  const modelId = String(input.model || catalog.defaults.chat || DEFAULT_MODEL);
  if ((catalog.groups.openai_image || []).some((model) => model.id === modelId) || /gpt-image-|dall-e|image/i.test(modelId)) {
    throw new ModelRequestError('image_model_not_supported', '当前是生图模型，不能用于文字聊天。请切换聊天模型。', 400, { model: modelId });
  }
  const model = catalogModel(catalog, modelId);
  if (!model || ![...(catalog.groups.openai_chat || []), ...(catalog.groups.free_test || [])].some((item) => item.id === modelId)) {
    throw new ModelRequestError('model_not_allowed', '该模型不在当前正式线允许范围内。', 400, { model: modelId });
  }
  const messages = validateMessages(input.messages, { system: allowSystem });
  const settings = input.settings || {};
  const configuredMaxTokens = clamp(settings.maxOutputTokens, DEFAULT_FORMAL_TOKENS, 64, MAX_FORMAL_TOKENS);
  const explicitMaxTokens = Object.prototype.hasOwnProperty.call(settings, 'max_tokens')
    ? settings.max_tokens
    : input.max_tokens;
  const requestedMaxTokens = explicitMaxTokens === null
    ? configuredMaxTokens
    : explicitMaxTokens === undefined
      ? (Number.isFinite(Number(settings.maxOutputTokens)) ? configuredMaxTokens : 600)
      : explicitMaxTokens;
  const maxTokens = clamp(requestedMaxTokens, 600, 1, MAX_FORMAL_TOKENS);
  const temperature = clamp(settings.temperature ?? input.temperature, 0.7, 0, 2);
  return {
    modelId,
    payload: chatPayload(modelId, messages, maxTokens, temperature, model, {
      responseFormat: input.response_format || null,
      reasoning: input.reasoning || null,
      tools: input.tools,
      toolChoice: input.tool_choice,
    }),
  };
}

function sseData(block) {
  const data = [];
  for (const line of String(block || '').split(/\r?\n/)) {
    if (!line || line.startsWith(':')) continue;
    const separator = line.indexOf(':');
    const field = separator < 0 ? line : line.slice(0, separator);
    let value = separator < 0 ? '' : line.slice(separator + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'data') data.push(value);
  }
  return data.length ? data.join('\n') : null;
}

async function* readProviderSse(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const blocks = function* (final = false) {
    while (true) {
      const match = buffer.match(/\r?\n\r?\n/);
      if (!match || match.index == null) break;
      const block = buffer.slice(0, match.index);
      buffer = buffer.slice(match.index + match[0].length);
      yield block;
    }
    if (final && buffer.trim()) {
      const block = buffer;
      buffer = '';
      yield block;
    }
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      for (const block of blocks()) yield block;
    }
    buffer += decoder.decode();
    for (const block of blocks(true)) yield block;
  } finally {
    reader.releaseLock();
  }
}

function streamChunkError(value, modelId) {
  const status = Number(value?.error?.code || value?.error?.status || 502);
  const preview = compact(value?.error?.message || value?.message || '');
  const [type, message] = normalizedProviderError(status, modelId, preview);
  return new ModelRequestError(type, message, 502, { model: modelId });
}

export function normalizeToolCalls(value) {
  const calls = Array.isArray(value) ? value : [];
  return calls.slice(0, 8).map((call) => {
    const id = String(call?.id || '').slice(0, 160);
    const name = String(call?.function?.name || '').slice(0, 64);
    const rawArguments = call?.function?.arguments;
    const args = typeof rawArguments === 'string'
      ? rawArguments
      : JSON.stringify(rawArguments && typeof rawArguments === 'object' ? rawArguments : {});
    if (!id || !/^[a-zA-Z0-9_-]{1,64}$/.test(name)) {
      throw new ModelRequestError('invalid_provider_response', '模型返回了无效的工具调用。', 502);
    }
    return {
      id,
      type: 'function',
      function: {
        name,
        arguments: args.slice(0, 24000),
      },
    };
  });
}

function addUsage(left, right) {
  const current = normalizeUsage(left);
  const next = normalizeUsage(right);
  if (!current) return next;
  if (!next) return current;
  return {
    prompt_tokens: current.prompt_tokens + next.prompt_tokens,
    completion_tokens: current.completion_tokens + next.completion_tokens,
    total_tokens: current.total_tokens + next.total_tokens,
  };
}

function safeToolFailure(error) {
  return {
    ok: false,
    error: {
      type: String(error?.type || 'tool_execution_failed').slice(0, 120),
      message: String(error?.message || '工具执行失败。').slice(0, 500),
    },
  };
}

async function executeToolCalls(calls, executeTool) {
  const results = [];
  const messages = [];
  for (const call of calls) {
    let value;
    try {
      value = await executeTool(call);
    } catch (error) {
      value = safeToolFailure(error);
    }
    const normalized = value && typeof value === 'object' ? value : { ok: true, result: value ?? null };
    results.push({
      id: call.id,
      name: call.function.name,
      result: normalized,
    });
    messages.push({
      role: 'tool',
      tool_call_id: call.id,
      name: call.function.name,
      content: JSON.stringify(normalized).slice(0, 12000),
    });
  }
  return { results, messages };
}

export async function performFormalChat(env, input = {}, { allowSystem = false } = {}) {
  const prepared = await prepareFormalChat(env, input, allowSystem);
  const upstream = await requestOpenRouter(env, prepared.payload, 'Elementera Coast Formal Chat');
  const choice = upstream?.choices?.[0] || {};
  return {
    ok: true,
    model: upstream?.model || prepared.modelId,
    message: { role: 'assistant', content: typeof choice?.message?.content === 'string' ? choice.message.content : '' },
    usage: normalizeUsage(upstream?.usage),
    finish_reason: choice?.finish_reason || null,
  };
}

export async function performFormalChatWithTools(env, input = {}, {
  allowSystem = false,
  executeTool,
} = {}) {
  const prepared = await prepareFormalChat(env, input, allowSystem);
  const upstream = await requestOpenRouter(env, prepared.payload, 'Elementera Coast Formal Chat');
  const choice = upstream?.choices?.[0] || {};
  const calls = normalizeToolCalls(choice?.message?.tool_calls);
  if (!calls.length) {
    return {
      ok: true,
      model: upstream?.model || prepared.modelId,
      message: { role: 'assistant', content: typeof choice?.message?.content === 'string' ? choice.message.content : '' },
      usage: normalizeUsage(upstream?.usage),
      finish_reason: choice?.finish_reason || null,
      tool_results: [],
    };
  }
  if (choice?.finish_reason !== 'tool_calls') {
    throw new ModelRequestError('invalid_provider_response', '模型返回了不完整的工具调用状态。', 502);
  }
  if (typeof executeTool !== 'function') {
    throw new ModelRequestError('tool_executor_missing', '模型请求了工具，但海岸没有可用的执行器。', 502);
  }
  const executed = await executeToolCalls(calls, executeTool);
  const followPayload = {
    ...prepared.payload,
    messages: [
      ...prepared.payload.messages,
      {
        role: 'assistant',
        content: typeof choice?.message?.content === 'string' ? choice.message.content : null,
        tool_calls: calls,
      },
      ...executed.messages,
    ],
    tool_choice: 'none',
  };
  const follow = await requestOpenRouter(env, followPayload, 'Elementera Coast Formal Chat');
  const followChoice = follow?.choices?.[0] || {};
  if (normalizeToolCalls(followChoice?.message?.tool_calls).length) {
    throw new ModelRequestError('invalid_provider_response', '模型返回了无法完成的连续工具调用。', 502);
  }
  return {
    ok: true,
    model: follow?.model || upstream?.model || prepared.modelId,
    message: {
      role: 'assistant',
      content: typeof followChoice?.message?.content === 'string' ? followChoice.message.content : '',
    },
    usage: addUsage(upstream?.usage, follow?.usage),
    finish_reason: followChoice?.finish_reason || null,
    tool_results: executed.results,
  };
}

function appendStreamToolCalls(target, chunks) {
  for (const chunk of Array.isArray(chunks) ? chunks : []) {
    const index = Number.isFinite(Number(chunk?.index)) ? Number(chunk.index) : target.size;
    const current = target.get(index) || {
      id: '',
      type: 'function',
      function: { name: '', arguments: '' },
    };
    if (chunk?.id) current.id = String(chunk.id).slice(0, 160);
    if (chunk?.function?.name) current.function.name += String(chunk.function.name);
    if (chunk?.function?.arguments) current.function.arguments += String(chunk.function.arguments);
    target.set(index, current);
  }
}

export async function* performFormalChatStream(env, input = {}, {
  allowSystem = false,
  signal,
  executeTool,
} = {}) {
  const prepared = await prepareFormalChat(env, input, allowSystem);
  let payload = {
    ...prepared.payload,
    stream: true,
    stream_options: { include_usage: true },
  };
  let metaSent = false;
  let actualModel = prepared.modelId;
  let generationId = crypto.randomUUID();
  let totalUsage = null;
  let toolRound = 0;

  while (true) {
    const response = await requestOpenRouterStream(env, payload, 'Elementera Coast Formal Chat', signal);
    let finishReason = null;
    let providerDone = false;
    let roundContent = '';
    const toolChunks = new Map();

    for await (const block of readProviderSse(response)) {
      const data = sseData(block);
      if (data == null) continue;
      if (data.trim() === '[DONE]') {
        providerDone = true;
        break;
      }
      let value;
      try {
        value = JSON.parse(data);
      } catch {
        throw new ModelRequestError('invalid_provider_response', '上游返回了无效的流式响应。', 502, { model: prepared.modelId });
      }
      if (value?.error) throw streamChunkError(value, prepared.modelId);
      actualModel = String(value?.model || actualModel || prepared.modelId);
      generationId = String(value?.id || generationId);
      if (!metaSent) {
        metaSent = true;
        yield { event: 'meta', data: { model: actualModel, generation_id: generationId } };
      }
      const delta = value?.choices?.[0]?.delta || {};
      const content = delta.content;
      if (typeof content === 'string' && content) {
        roundContent += content;
        yield { event: 'delta', data: { content } };
      }
      appendStreamToolCalls(toolChunks, delta.tool_calls);
      totalUsage = addUsage(totalUsage, value?.usage);
      if (value?.choices?.[0]?.finish_reason != null) finishReason = String(value.choices[0].finish_reason);
    }

    if (!providerDone && finishReason == null) {
      throw new ModelRequestError('stream_incomplete', '上游流式响应提前中断。', 502, { model: prepared.modelId });
    }
    const calls = normalizeToolCalls([...toolChunks.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, call]) => call));
    if (calls.length) {
      if (finishReason !== 'tool_calls' || toolRound > 0 || typeof executeTool !== 'function') {
        throw new ModelRequestError(
          typeof executeTool === 'function' ? 'invalid_provider_response' : 'tool_executor_missing',
          typeof executeTool === 'function'
            ? '模型返回了无法完成的连续工具调用。'
            : '模型请求了工具，但海岸没有可用的执行器。',
          502,
        );
      }
      const executed = await executeToolCalls(calls, executeTool);
      for (const result of executed.results) {
        yield {
          event: 'tool',
          data: {
            id: result.id,
            name: result.name,
            ok: result.result?.ok !== false,
            result: result.result,
          },
        };
      }
      payload = {
        ...prepared.payload,
        messages: [
          ...prepared.payload.messages,
          {
            role: 'assistant',
            content: roundContent || null,
            tool_calls: calls,
          },
          ...executed.messages,
        ],
        tool_choice: 'none',
        stream: true,
        stream_options: { include_usage: true },
      };
      toolRound += 1;
      continue;
    }
    if (!metaSent) yield { event: 'meta', data: { model: actualModel, generation_id: generationId } };
    if (totalUsage) yield { event: 'usage', data: totalUsage };
    yield { event: 'done', data: { finish_reason: finishReason } };
    return;
  }
}

export async function handleModels(request, env) {
  if (request.method !== 'GET') return apiError('method_not_allowed', 'Method not allowed.', 405);
  try {
    return json(await fetchModelCatalog(env, new URL(request.url).searchParams.get('refresh') === '1'));
  } catch (error) {
    return modelErrorResponse(error);
  }
}

export async function handleSandbox(request, env) {
  if (request.method !== 'POST') return apiError('method_not_allowed', 'Method not allowed.', 405);
  if (!openRouterKey(env)) return apiError('sandbox_not_configured', 'Chat sandbox is not configured.', 503);
  try {
    const body = await readJson(request);
    const modelId = String(body.model || FREE_TEST_MODEL_IDS[0]);
    if (!SANDBOX_MODELS.has(modelId)) throw new ModelRequestError('model_not_allowed', 'Model is not allowed.', 400, { model: modelId });
    const messages = validateMessages(body.messages, { system: true, maxContent: 6000 });
    const maxTokens = clamp(body.max_tokens, 80, 1, MAX_SANDBOX_TOKENS);
    const temperature = clamp(body.temperature, 0.2, 0, 1.2);
    const upstream = await requestOpenRouter(env, {
      model: modelId,
      messages,
      max_tokens: maxTokens,
      temperature,
    }, 'Elementera Coast Sandbox');
    return json({
      ok: true,
      model: upstream?.model || modelId,
      message: { role: 'assistant', content: typeof upstream?.choices?.[0]?.message?.content === 'string' ? upstream.choices[0].message.content : '' },
    });
  } catch (error) {
    return modelErrorResponse(error);
  }
}

export function modelErrorResponse(error) {
  if (error instanceof ModelRequestError) {
    return apiError(error.type, error.message, error.status, error.details);
  }
  const status = error?.status === 413 ? 413 : 400;
  return apiError(status === 413 ? 'body_too_large' : 'invalid_request', status === 413 ? '请求体过大。' : '请求体无效。', status);
}

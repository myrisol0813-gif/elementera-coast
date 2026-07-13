import { apiError, json, readJson } from './http.js';

const OPENROUTER_REFERER = 'https://app.elementeracoast.com';
const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models?output_modalities=text,image';
const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-4.1-nano';
const MAX_CHAT_MESSAGES = 20;
const MAX_CHAT_CONTENT_CHARS = 12000;
export const MAX_FORMAL_TOKENS = 2000;
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

function chatPayload(modelId, messages, maxTokens, temperature, model) {
  const payload = { model: modelId, messages, max_completion_tokens: maxTokens };
  if (!modelId.startsWith('openai/')) payload.max_tokens = maxTokens;
  if (supportsTemperature(modelId, model)) payload.temperature = temperature;
  return payload;
}

function compact(value, max = 160) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
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
  if (status === 402) return ['insufficient_credits', 'OpenRouter 余额或 credits 不足。'];
  if (status === 403 && lower.includes('not available in your region')) return ['region_unavailable', '该模型在当前网络地区不可用。可以切换网络出口，或换用其他模型。'];
  if (status === 403) return ['forbidden', '当前 key 或账户没有权限使用该模型。'];
  if (status === 404) return ['model_not_found', '模型不存在或已下架。'];
  if (status === 429) return ['rate_limited', '请求过快或模型限速，请稍后再试。'];
  if ([502, 503, 504].includes(status)) return ['provider_unavailable', '上游模型暂时不可用。可以稍后重试或换模型。'];
  return ['chat_error', '消息生成失败，请稍后重试。'];
}

async function requestOpenRouter(env, payload, title) {
  let response;
  try {
    response = await fetch(OPENROUTER_CHAT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openRouterKey(env)}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': OPENROUTER_REFERER,
        'X-Title': title,
      },
      body: JSON.stringify(payload),
    });
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

export async function performFormalChat(env, input = {}, { allowSystem = false } = {}) {
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
  const maxTokens = clamp(settings.max_tokens ?? input.max_tokens, 600, 1, MAX_FORMAL_TOKENS);
  const temperature = clamp(settings.temperature ?? input.temperature, 0.7, 0, 2);
  const upstream = await requestOpenRouter(env, chatPayload(modelId, messages, maxTokens, temperature, model), 'Elementera Coast Formal Chat');
  const choice = upstream?.choices?.[0] || {};
  return {
    ok: true,
    model: upstream?.model || modelId,
    message: { role: 'assistant', content: typeof choice?.message?.content === 'string' ? choice.message.content : '' },
    usage: upstream?.usage || null,
    finish_reason: choice?.finish_reason || null,
  };
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

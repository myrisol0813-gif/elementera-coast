export const API = Object.freeze({
  health: '/api/health',
  session: '/api/session',
  models: '/api/models',
  chat: '/api/chat',
  landingLetter: '/api/chat/landing-letter',
  sandbox: '/api/chat-sandbox',
  conversations: '/api/chat/conversations',
  history: '/api/chat/history',
  profile: '/api/chat/profile',
  title: '/api/chat/title',
  memorySoil: '/api/memory/soil',
  memorySoilOrganize: '/api/memory/soil/organize',
  memoryPockets: '/api/memory/pockets',
  memoryEntries: '/api/memory/entries',
  memorySearch: '/api/memory/search',
  memoryRecall: '/api/memory/recall',
  memoryVectorStatus: '/api/memory/vector-status',
});

export class ApiError extends Error {
  constructor(message, { type = 'request_failed', status = 0, details = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.type = type;
    this.status = status;
    this.details = details;
  }
}

export async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    const error = data?.error;
    throw new ApiError(
      typeof error === 'string' ? error : error?.message || `请求失败（${response.status}）`,
      {
        type: error?.type || 'request_failed',
        status: response.status,
        details: error || data,
      },
    );
  }
  return data;
}

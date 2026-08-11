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
  memoryOfficialSoils: '/api/memory/official-soils',
  memorySearch: '/api/memory/search',
  memoryRecall: '/api/memory/recall',
  memoryVectorStatus: '/api/memory/vector-status',
  dailyMoments: '/api/daily/moments',
  dailyDiaries: '/api/daily/diaries',
  dailyAlbums: '/api/daily/albums',
  dailyDrafts: '/api/daily/drafts',
  dailySummaries: '/api/daily/summaries',
  dailySummaryRange: '/api/daily/summary/range',
  dailySummaryRun: '/api/daily/summary/run',
  dailySummaryCommit: '/api/daily/summary/commit',
  radioMessages: '/api/radio/messages',
  radioAskApiMyri: '/api/radio/ask-api-myri',
  radioMemory: '/api/radio/memory',
  lighthouseLetters: '/api/lighthouse/letters',
  lighthouseMemory: '/api/lighthouse/memory',
  dogtalk: '/api/dogtalk',
  mailboxMe: '/api/mailbox/me',
  mailboxMessages: '/api/mailbox/messages',
  mailboxSend: '/api/mailbox/send',
  mailboxStatus: '/api/mailbox/status',
  mailboxMemory: '/api/mailbox/memory',
  mailboxAccount: '/api/mailbox/account',
  calendarEvents: '/api/calendar/events',
  calendarDay: '/api/calendar/day',
  calendarNotes: '/api/calendar/notes',
  calendarEnv: '/api/calendar/env',
  calendarEnvSeen: '/api/calendar/env/seen',
  calendarUnseen: '/api/calendar/unseen',
  calendarUnseenSeen: '/api/calendar/unseen/seen',
  deskSettings: '/api/desk/settings',
  worldbook: '/api/worldbook',
  worldbookTest: '/api/worldbook/test-match',
  workbenchTools: '/api/workbench/tools',
  workbenchRuns: '/api/workbench/runs',
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

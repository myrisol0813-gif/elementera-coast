import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Window } from 'happy-dom';

const testDir = dirname(fileURLToPath(import.meta.url));
const pages = resolve(testDir, '../elementera-mcp/deploy-pages');
const html = await readFile(resolve(pages, 'index.html'), 'utf8');
const window = new Window({ url: 'http://coast.test/' });
window.document.write(html);
window.document.close();

for (const name of [
  'window', 'document', 'localStorage', 'navigator', 'HTMLElement', 'HTMLFormElement', 'HTMLInputElement',
  'HTMLTextAreaElement', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'FileReader', 'Blob', 'FormData',
]) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: window[name] || window });
globalThis.requestAnimationFrame = (callback) => callback(Date.now());
window.requestAnimationFrame = globalThis.requestAnimationFrame;
globalThis.alert = () => {};
const prompts = [];
globalThis.prompt = (_message, fallback = '') => prompts.length ? prompts.shift() : fallback;
globalThis.confirm = () => true;
let clipboard = '';
Object.defineProperty(window.navigator, 'clipboard', { value: { writeText: async (value) => { clipboard = value; } } });
localStorage.setItem('gpt_like_shell_theme_clean_v1', 'dark');
localStorage.setItem('cw_name', '迁移中的小寒');
localStorage.setItem('ec.currentConversationId', 'conv-1');

const now = () => new Date().toISOString();
let sequence = 1;
let profile = {
  assistant_avatar_dataurl: '',
  current_chat_model: 'openai/gpt-4.1-nano',
  current_image_model: '',
  model_box: { chat: ['openai/gpt-4.1-nano'], free: [], image: [] },
};
let conversations = [{ id: 'conv-1', title: '新聊天', created_at: now(), updated_at: now(), deleted_at: null, title_manual: false, title_generated_at: null }];
const histories = new Map([['conv-1', { version: 4, updated_at: now(), turns: [] }]]);
let historyWrites = 0;
let formalChatRequests = 0;
const formalChatBodies = [];
const soils = new Map();
const memoryPockets = [];
const memoryEntries = [];
const officialSoils = [{
  id: 'official-soil-e364eddd-1964-4ad8-9285-5299f4add3d4',
  type: 'soil',
  title: '灯塔巡迹',
  content: '官端回潮把一捧整理过的思维壤留在海岸。',
  actor: 'myri',
  surface: 'official_mcp',
  model_label: 'ChatGPT-5.5 Thinking',
  model_nickname: '回潮',
  symbol: '≋',
  display_author: 'ChatGPT-5.5 Thinking 回潮≋',
  created_at: '2026-07-29T04:42:24.975Z',
  updated_at: '2026-07-29T04:42:24.975Z',
}, {
  id: 'official-soil-without-nickname',
  type: 'soil',
  title: '灯塔巡迹',
  content: '另一枚没有绰号的官端水纹。',
  actor: 'myri',
  surface: 'official_mcp',
  model_label: 'o3',
  model_nickname: null,
  symbol: '≋',
  display_author: 'ChatGPT-o3≋',
  created_at: '2026-07-29T05:00:00.000Z',
  updated_at: '2026-07-29T05:00:00.000Z',
}];
const landingStatuses = new Map();
const landingBodies = [];
const titleBodies = [];
const soilOrganizeBodies = [];
let landingFinishReason = 'stop';
let formalFinishReason = 'length';
let failNextSoilOrganize = false;
let dailySequence = 0;
let dailySummaryRuns = 0;
const dailySummaryBodies = [];
const dailyMyriCommentBodies = [];
const dailyMoments = [];
const dailyDiaries = [];
const dailyAlbums = [];
const dailySummaries = [];
const dailyDrafts = [{
  id: 'moment-draft-official-1',
  content_type: 'moment',
  status: 'pending',
  payload: {
    date: '2026-07-28',
    text: '官端送来一条待确认的碳硅圈候选。',
    image_refs: [],
    reason: '前端草稿验收',
  },
  author: 'mcp',
  source: 'chat_tool',
  actor: 'myri',
  surface: 'official_mcp',
  model_label: 'GPT-5.5 Thinking',
  model_nickname: '回潮',
  symbol: '≋',
  display_author: 'ChatGPT-5.5 Thinking 回潮≋',
  created_at: now(),
  updated_at: now(),
}, {
  id: 'diary-draft-api-1',
  content_type: 'diary',
  status: 'pending',
  payload: {
    date: '2026-07-28',
    weather: '微雾',
    mood: '安稳',
    text: '海岸 API 侧送来一张待确认日记。',
    image_refs: [],
  },
  author: 'api',
  source: 'chat_tool',
  actor: 'myri',
  surface: 'coast_api',
  model_label: 'openai/gpt-5.2',
  model_nickname: null,
  symbol: '✦',
  display_author: '海岸 API ✦',
  created_at: now(),
  updated_at: now(),
}];
const radioMessages = [];
const lighthouseLetters = [];
const radioBodies = [];
const lighthouseBodies = [];
const dogtalks = new Map();
let roomSequence = 0;
let dogtalkSequence = 0;
let calendarSequence = 0;
const calendarEvents = [];
const calendarNotes = [];
const deskSettings = new Map([['conv-1', {
  conversation_id: 'conv-1',
  cross_window_light_recall_enabled: false,
  today_coast_reference_enabled: false,
  updated_at: now(),
}]]);
const worldbookEntries = [];

function dogtalkKey(roomScope, conversationId = '') {
  return roomScope === 'conversation'
    ? `conversation:${conversationId}`
    : `${roomScope}:main`;
}

function emptyDogtalk(roomScope, conversationId = '') {
  return {
    id: null,
    type: 'xiaohan_mystic_dogtalk',
    owner: 'xiaohan',
    room_scope: roomScope,
    scope_key: dogtalkKey(roomScope, conversationId),
    conversation_id: conversationId || null,
    body: '',
    true_core: '',
    self_note: '',
    myri_hint: '',
    not_to_misunderstand: '不要误会成长期偏好、边界取消、行为命令，或比当前正文更重要。',
    weather: '放松',
    read_mode: 'keep_private',
    status: 'empty',
    readable_by_myri: true,
    auto_recall: false,
    memory_weight: 'low',
    not_instruction: true,
    not_preference: true,
    not_memory_seed: true,
    not_pocket: true,
    visibility: 'private_to_xiaohan_and_myri',
    default_text: '小寒这轮很放松，因此偷懒中。',
    created_at: null,
    updated_at: null,
  };
}

function mockMoment(value = {}, author = 'xiaohan', source = 'manual') {
  const createdAt = now();
  const status = value.status || value.visible_status || 'published';
  return {
    id: value.id || `daily-moment-${++dailySequence}`,
    date: value.date || '2026-07-28',
    author,
    source,
    status,
    text: value.text || '',
    image_refs: value.image_refs || [],
    conversation_id: value.conversation_id || null,
    source_turn_id: value.source_turn_id || null,
    reason: value.reason || '',
    published_at: status === 'published' ? createdAt : null,
    created_at: createdAt,
    updated_at: createdAt,
    liked: false,
    like_count: 0,
    comments: [],
  };
}

function mockDiary(value = {}, author = 'xiaohan', source = 'manual') {
  const createdAt = now();
  return {
    id: value.id || `daily-diary-${++dailySequence}`,
    date: value.date || '2026-07-28',
    author,
    source,
    weather: value.weather || '未标注',
    mood: value.mood || '未标注',
    text: value.text || '',
    image_refs: value.image_refs || [],
    summary_id: value.summary_id || null,
    range_start: value.range_start || null,
    range_end: value.range_end || null,
    created_at: createdAt,
    updated_at: createdAt,
  };
}

function mockAlbum(value = {}, author = 'xiaohan', source = 'manual') {
  const createdAt = now();
  return {
    id: value.id || `daily-album-${++dailySequence}`,
    date: value.date || '2026-07-28',
    category: value.category || 'xiaohan',
    author,
    source,
    image_ref: value.image_ref,
    caption: value.caption || '',
    created_at: createdAt,
    updated_at: createdAt,
  };
}

function soilFor(conversationId) {
  if (!soils.has(conversationId)) soils.set(conversationId, {
    conversation_id: conversationId,
    current_text: '',
    hand_seeds: [],
    do_not_repeat: '',
    pocket_candidates: [],
    manual_locked: false,
    auto_refresh_enabled: true,
    revision: 1,
  });
  return soils.get(conversationId);
}

function response(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
}

globalThis.fetch = async (input, options = {}) => {
  const url = new URL(String(input), 'http://coast.test');
  const method = options.method || 'GET';
  const body = options.body ? JSON.parse(options.body) : {};
  if (url.pathname === '/api/calendar/unseen') return response({ ok: true, count: 0, days: [], change_ids: [] });
  if (url.pathname === '/api/calendar/unseen/seen' || url.pathname === '/api/calendar/env/seen') return response({ ok: true, seen: 0 });
  if (url.pathname === '/api/calendar/events') {
    if (method === 'GET') {
      const from = url.searchParams.get('from') || '0000-01-01';
      const to = url.searchParams.get('to') || '9999-12-31';
      return response({ ok: true, events: calendarEvents.filter((event) => event.starts_at.slice(0, 10) >= from && event.starts_at.slice(0, 10) <= to) });
    }
    const event = {
      id: `calendar-event-${++calendarSequence}`, created_by: 'user', source: 'manual', is_archived: false,
      created_at: now(), updated_at: now(), ...body,
    };
    calendarEvents.push(event);
    return response({ ok: true, event }, 201);
  }
  const calendarEventMatch = url.pathname.match(/^\/api\/calendar\/events\/([^/]+)$/);
  if (calendarEventMatch) {
    const event = calendarEvents.find((item) => item.id === decodeURIComponent(calendarEventMatch[1]));
    if (method === 'PATCH') Object.assign(event, body, { updated_at: now() });
    if (method === 'DELETE') event.is_archived = true;
    return response({ ok: true, event });
  }
  const calendarDayMatch = url.pathname.match(/^\/api\/calendar\/day\/(\d{4}-\d{2}-\d{2})$/);
  if (calendarDayMatch) {
    const date = calendarDayMatch[1];
    return response({
      ok: true, date,
      events: calendarEvents.filter((event) => !event.is_archived && event.starts_at.slice(0, 10) === date),
      notes: calendarNotes.filter((note) => !note.is_archived && note.date === date),
    });
  }
  if (url.pathname === '/api/calendar/notes') {
    const note = {
      id: `calendar-note-${++calendarSequence}`, author: 'user', is_archived: false,
      rotation: 0, created_at: now(), updated_at: now(), ...body,
    };
    calendarNotes.push(note);
    return response({ ok: true, note }, 201);
  }
  const calendarNoteMatch = url.pathname.match(/^\/api\/calendar\/notes\/([^/]+)$/);
  if (calendarNoteMatch) {
    const note = calendarNotes.find((item) => item.id === decodeURIComponent(calendarNoteMatch[1]));
    if (method === 'PATCH') Object.assign(note, body, { updated_at: now() });
    if (method === 'DELETE') note.is_archived = true;
    return response({ ok: true, note });
  }
  if (url.pathname === '/api/desk/settings') {
    const conversationId = url.searchParams.get('conversation_id') || body.conversation_id;
    const previous = deskSettings.get(conversationId) || {
      conversation_id: conversationId,
      cross_window_light_recall_enabled: false,
      today_coast_reference_enabled: false,
      updated_at: now(),
    };
    if (method === 'PATCH') {
      deskSettings.set(conversationId, { ...previous, ...body, conversation_id: conversationId, updated_at: now() });
    }
    return response({ ok: true, settings: deskSettings.get(conversationId) || previous });
  }
  if (url.pathname === '/api/worldbook') return response({ ok: true, entries: worldbookEntries });
  if (url.pathname === '/api/worldbook/test-match') return response({ ok: true, matches: [] });
  if (url.pathname === '/api/workbench/tools') return response({ ok: true, tools: [{ tool_key: 'calendar.today', display_name: '翻看台历' }] });
  if (url.pathname === '/api/workbench/runs') return response({ ok: true, runs: [] });
  if (url.pathname === '/api/chat/profile') {
    if (method === 'PUT') profile = body.profile;
    return response({ ok: true, profile });
  }
  if (url.pathname === '/api/chat/conversations') {
    if (method === 'GET') return response({ ok: true, conversations });
    const conversation = { id: `conv-${++sequence}`, title: '新聊天', created_at: now(), updated_at: now(), deleted_at: null, title_manual: false, title_generated_at: null };
    conversations.unshift(conversation);
    histories.set(conversation.id, { version: 4, updated_at: now(), turns: [] });
    return response({ ok: true, conversation }, 201);
  }
  if (url.pathname.startsWith('/api/chat/conversations/')) {
    const id = decodeURIComponent(url.pathname.split('/').at(-1));
    const conversation = conversations.find((item) => item.id === id);
    if (method === 'PATCH') {
      conversation.title = body.title;
      conversation.title_manual = true;
      return response({ ok: true, conversation });
    }
    if (method === 'DELETE') {
      conversations = conversations.filter((item) => item.id !== id);
      return response({ ok: true, conversation: { ...conversation, deleted_at: now() }, deleted: true });
    }
  }
  if (url.pathname === '/api/chat/history') {
    const id = url.searchParams.get('conversation_id');
    if (method === 'PUT') {
      historyWrites += 1;
      histories.set(id, body);
    }
    return response({ ok: true, source: 'd1-json-v4', history: { ...(histories.get(id) || { version: 4, turns: [] }), conversation_id: id } });
  }
  if (url.pathname === '/api/chat/landing-letter') {
    if (method === 'GET') {
      const key = `${url.searchParams.get('conversation_id')}::${url.searchParams.get('model')}`;
      return response({ ok: true, landing: landingStatuses.get(key) || { sent: false } });
    }
    landingBodies.push(body);
    const state = structuredClone(histories.get(body.conversation_id) || { version: 4, updated_at: now(), turns: [] });
    const turnId = `landing-turn-${++sequence}`;
    state.turns.push({
      id: turnId,
      turn_type: 'landing',
      model_id: body.model,
      user: {
        active: 0,
        variants: [{ id: `landing-user-${sequence}`, content: body.letter_text, hidden: true, input_type: 'landing_letter', created_at: now() }],
      },
      assistant: {
        activeByUserVariant: { 0: 0 },
        variantsByUserVariant: { 0: [{
          id: `landing-assistant-${sequence}`,
          content: '我把登岛信读完了。',
          created_at: now(),
          finish_reason: landingFinishReason,
        }] },
      },
    });
    state.updated_at = now();
    histories.set(body.conversation_id, state);
    const key = `${body.conversation_id}::${body.model}`;
    const previous = landingStatuses.get(key);
    const landing = {
      sent: true,
      model_id: body.model,
      landing_version: Number(previous?.landing_version || 0) + 1,
      landing_text_hash: `hash-${sequence}`,
      assistant_turn_id: turnId,
      sent_at: now(),
    };
    landingStatuses.set(key, landing);
    return response({
      ok: true,
      assistant: { role: 'assistant', content: '我把登岛信读完了。' },
      conversation: conversations.find((item) => item.id === body.conversation_id),
      history: { ...state, conversation_id: body.conversation_id },
      landing,
      memory: { selected_entry_ids: [], vector_enabled: false },
      desk_slip: {
        summary: '本轮桌面 · 思维壤 1', soil: true, memory_count: 0,
        touch_count: 0, touch_sources: [], worldbook_count: 0, worldbook_titles: [],
        today_coast: false, workbench_count: 0, furniture: [], comfort: '已保持在舒服区间',
      },
      finish_reason: landingFinishReason,
      max_tokens: body.settings.max_tokens,
    });
  }
  if (url.pathname === '/api/chat') {
    formalChatRequests += 1;
    formalChatBodies.push(body);
    if (body.dogtalk) {
      const key = dogtalkKey('conversation', body.conversation_id);
      const previous = dogtalks.get(key);
      dogtalks.set(key, {
        ...emptyDogtalk('conversation', body.conversation_id),
        ...previous,
        ...body.dogtalk,
        id: previous?.id || `dogtalk-${++dogtalkSequence}`,
        scope_key: key,
        conversation_id: body.conversation_id,
        status: 'saved',
        updated_at: now(),
      });
    }
    return response({
      ok: true,
      model: body.model,
      message: { role: 'assistant', content: `mock: ${body.messages.at(-1)?.content || ''}` },
      finish_reason: formalFinishReason,
      memory: { selected_entry_ids: [`mock-memory-${formalChatRequests}`], vector_enabled: false },
      desk_slip: {
        summary: '本轮桌面 · 思维壤 1｜记忆 1', soil: true, memory_count: 1,
        touch_count: 0, touch_sources: [], worldbook_count: 0, worldbook_titles: [],
        today_coast: false, workbench_count: 0, furniture: [], comfort: '已保持在舒服区间',
      },
    });
  }
  if (url.pathname === '/api/daily/moments') {
    if (method === 'GET') return response({ ok: true, moments: dailyMoments });
    const moment = mockMoment(body);
    dailyMoments.unshift(moment);
    return response({ ok: true, moment }, 201);
  }
  const dailyMomentMatch = url.pathname.match(/^\/api\/daily\/moments\/([^/]+)(?:\/(comments|like|myri-comment))?$/);
  if (dailyMomentMatch) {
    const moment = dailyMoments.find((item) => item.id === decodeURIComponent(dailyMomentMatch[1]));
    if (dailyMomentMatch[2] === 'comments') {
      moment.comments.push({
        id: body.id || `daily-comment-${++dailySequence}`,
        moment_id: moment.id,
        author: 'xiaohan',
        text: body.text,
        model_id: null,
        created_at: now(),
      });
    } else if (dailyMomentMatch[2] === 'myri-comment') {
      dailyMyriCommentBodies.push(body);
      const comment = {
        id: `daily-myri-comment-${++dailySequence}`,
        moment_id: moment.id,
        author: 'myri',
        text: '我看见这条小小的亮光了。',
        model_id: body.model,
        created_at: now(),
      };
      moment.comments.push(comment);
      moment.updated_at = now();
    } else if (dailyMomentMatch[2] === 'like') {
      moment.liked = method === 'PUT';
      moment.like_count = moment.liked ? 1 : 0;
    } else {
      Object.assign(moment, body, {
        image_refs: body.image_refs || moment.image_refs,
        updated_at: now(),
      });
    }
    return response({ ok: true, moment }, ['comments', 'myri-comment'].includes(dailyMomentMatch[2]) ? 201 : 200);
  }
  if (url.pathname === '/api/daily/diaries') {
    if (method === 'GET') return response({ ok: true, diaries: dailyDiaries });
    let diary;
    const existing = dailyDiaries.find((item) => item.date === body.date && item.author === (body.author || 'xiaohan'));
    if (existing && body.conflict_mode === 'replace') {
      Object.assign(existing, body, { source: 'manual', updated_at: now() });
      diary = existing;
    } else {
      diary = mockDiary(body, body.author || 'xiaohan');
      dailyDiaries.unshift(diary);
    }
    return response({ ok: true, diary }, 201);
  }
  if (url.pathname === '/api/daily/albums') {
    if (method === 'GET') return response({ ok: true, albums: dailyAlbums });
    const album = mockAlbum(body);
    dailyAlbums.unshift(album);
    return response({ ok: true, album }, 201);
  }
  if (url.pathname === '/api/daily/summaries') {
    return response({ ok: true, summaries: dailySummaries });
  }
  if (url.pathname === '/api/daily/drafts') {
    return response({ ok: true, drafts: dailyDrafts.filter((draft) => draft.status === (url.searchParams.get('status') || 'pending')) });
  }
  const dailyDraftMatch = url.pathname.match(/^\/api\/daily\/drafts\/([^/]+)(?:\/(publish))?$/);
  if (dailyDraftMatch) {
    const draft = dailyDrafts.find((item) => item.id === decodeURIComponent(dailyDraftMatch[1]));
    if (dailyDraftMatch[2] === 'publish') {
      const provenance = {
        actor: draft.actor,
        surface: draft.surface,
        model_label: draft.model_label,
        model_nickname: draft.model_nickname,
        symbol: draft.symbol,
        display_author: draft.display_author,
      };
      const record = draft.content_type === 'moment'
        ? { ...mockMoment(draft.payload, draft.author, draft.source), ...provenance }
        : { ...mockDiary(draft.payload, draft.author, draft.source), ...provenance };
      if (draft.content_type === 'moment') dailyMoments.unshift(record);
      else dailyDiaries.unshift(record);
      draft.status = 'published';
      draft.published_record_id = record.id;
      return response({ ok: true, draft, record });
    }
    draft.status = 'discarded';
    return response({ ok: true, draft });
  }
  if (url.pathname === '/api/radio/messages') {
    if (method === 'GET') return response({ ok: true, room_id: 'radio', messages: radioMessages });
    radioBodies.push(body);
    const message = {
      id: `radio-${++roomSequence}`,
      room_id: 'radio',
      text: body.text,
      actor: 'xiaohan',
      surface: 'web_manual',
      model_label: null,
      model_nickname: null,
      symbol: '',
      display_author: '小寒',
      usage: null,
      created_at: now(),
      ...(body.dogtalk ? { dogtalk_snapshot: { ...body.dogtalk, source_id: `radio-${roomSequence}` } } : {}),
    };
    if (body.dogtalk) {
      const key = dogtalkKey('radio');
      dogtalks.set(key, {
        ...emptyDogtalk('radio'),
        ...dogtalks.get(key),
        ...body.dogtalk,
        id: dogtalks.get(key)?.id || `dogtalk-${++dogtalkSequence}`,
        scope_key: key,
        status: 'saved',
        updated_at: now(),
      });
    }
    radioMessages.push(message);
    return response({ ok: true, message }, 201);
  }
  const radioWithdrawMatch = url.pathname.match(/^\/api\/radio\/messages\/([^/]+)$/);
  if (radioWithdrawMatch && method === 'DELETE') {
    const message = radioMessages.find((item) => item.id === decodeURIComponent(radioWithdrawMatch[1]));
    message.text = '这条电波已撤回';
    message.withdrawn = true;
    message.withdrawn_at = now();
    message.withdrawn_by = 'xiaohan';
    return response({ ok: true, message });
  }
  if (url.pathname === '/api/radio/ask-api-myri') {
    const message = {
      id: `radio-${++roomSequence}`,
      room_id: 'radio',
      text: '海岸 API ✦ 收到了这条电波。',
      actor: 'myri',
      surface: 'coast_api',
      model_label: body.model,
      model_nickname: null,
      symbol: '✦',
      display_author: '海岸 API ✦',
      usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
      created_at: now(),
    };
    radioMessages.push(message);
    return response({ ok: true, message, model: body.model, memory_records: 2 }, 201);
  }
  if (url.pathname === '/api/lighthouse/letters') {
    if (method === 'GET') return response({ ok: true, letters: lighthouseLetters });
    lighthouseBodies.push(body);
    const letter = {
      id: `letter-${++roomSequence}`,
      subject: body.subject || '',
      body: body.body,
      actor: 'xiaohan',
      surface: 'web_manual',
      model_label: null,
      model_nickname: null,
      symbol: '',
      display_author: '小寒',
      usage: null,
      read_at: null,
      created_at: now(),
      updated_at: now(),
      ...(body.dogtalk ? { dogtalk_snapshot: { ...body.dogtalk, source_id: `letter-${roomSequence}` } } : {}),
    };
    if (body.dogtalk) {
      const key = dogtalkKey('lighthouse');
      dogtalks.set(key, {
        ...emptyDogtalk('lighthouse'),
        ...dogtalks.get(key),
        ...body.dogtalk,
        id: dogtalks.get(key)?.id || `dogtalk-${++dogtalkSequence}`,
        scope_key: key,
        status: 'saved',
        updated_at: now(),
      });
    }
    lighthouseLetters.unshift(letter);
    return response({ ok: true, letter }, 201);
  }
  if (url.pathname === '/api/radio/memory' || url.pathname === '/api/lighthouse/memory') {
    const kind = url.pathname.includes('/radio/') ? 'radio' : 'lighthouse';
    const blank = (surface, author, text = '', pocketCandidates = [], pendingPockets = []) => ({
      conversation_id: `${kind}-${surface}`,
      room_scope: kind,
      room_key: `${kind}:main`,
      source_surface: surface,
      source_label: author,
      soil: {
        conversation_id: `${kind}-${surface}`,
        current_text: text,
        hand_seeds: [],
        do_not_repeat: '',
        pocket_candidates: pocketCandidates,
        revision: surface === 'coast_api' ? 7 : 4,
        updated_at: now(),
        actor: 'myri',
        surface,
        source_surface: surface,
        model_label: surface === 'official_mcp' ? 'GPT-5.6 Thinking' : 'openai/gpt-5.2',
        model_nickname: surface === 'official_mcp' ? 'sol' : null,
        symbol: surface === 'official_mcp' ? '≋' : '✦',
        display_author: author,
      },
      pending_pockets: pendingPockets,
      seeds: [],
      memories: [],
    });
    const sources = {
      official_mcp: blank(
        'official_mcp',
        'ChatGPT-5.6 Thinking sol≋',
        kind === 'lighthouse' ? '官端写入的灯塔来信房 current_text。' : '',
      ),
    };
    if (kind === 'radio') {
      const candidate = {
        title: 'API 侧待确认潮纹',
        life_core: '只属于 coast_api 当前来源的候选。',
      };
      const pending = {
        id: 'radio-api-pocket-dom',
        title: candidate.title,
        life_core: candidate.life_core,
        status: 'pending',
        source_surface: 'coast_api',
        source_label: '海岸 API ✦',
      };
      sources.coast_api = blank(
        'coast_api',
        '海岸 API ✦',
        '电波房 API 侧正在整理当前方向。',
        [candidate],
        [pending],
      );
    }
    return response({
      ok: true,
      memory: {
        room_id: kind,
        participants: kind === 'radio'
          ? ['web_manual', 'coast_api', 'official_mcp']
          : ['web_manual', 'official_mcp'],
        room_scope: kind,
        room_key: `${kind}:main`,
        title: kind === 'radio' ? '无线电波房' : '灯塔来信房',
        soil_label: kind === 'radio' ? '电波房思维壤' : '灯塔来信思维壤',
        local_label: kind === 'radio' ? '电波房' : '灯塔来信',
        library_conversation_id: `room-library-${kind}`,
        sources,
        pending_pockets: Object.values(sources).flatMap((source) => source.pending_pockets),
        seeds: [],
        memories: [],
        global: { seeds: [], memories: [] },
      },
    });
  }
  if (url.pathname === '/api/dogtalk') {
    const roomScope = method === 'GET' ? url.searchParams.get('room_scope') : body.room_scope;
    const conversationId = method === 'GET'
      ? url.searchParams.get('conversation_id') || ''
      : body.conversation_id || '';
    const key = dogtalkKey(roomScope, conversationId);
    if (method === 'GET') {
      return response({ ok: true, dogtalk: dogtalks.get(key) || emptyDogtalk(roomScope, conversationId) });
    }
    const previous = dogtalks.get(key);
    const dogtalk = {
      ...emptyDogtalk(roomScope, conversationId),
      ...previous,
      ...body,
      id: previous?.id || `dogtalk-${++dogtalkSequence}`,
      scope_key: key,
      conversation_id: conversationId || null,
      status: body.status || 'saved',
      created_at: previous?.created_at || now(),
      updated_at: now(),
    };
    dogtalks.set(key, dogtalk);
    return response({ ok: true, dogtalk });
  }
  const dogtalkMatch = url.pathname.match(/^\/api\/dogtalk\/([^/]+)(?:\/(archive|read))?$/);
  if (dogtalkMatch) {
    const id = decodeURIComponent(dogtalkMatch[1]);
    const entry = [...dogtalks.entries()].find(([, value]) => value.id === id);
    if (!entry) return response({ ok: false, error: { type: 'dogtalk_not_found', message: 'not found' } }, 404);
    const [key, dogtalk] = entry;
    if (dogtalkMatch[2] === 'read') {
      dogtalk.read_mode = 'read_now';
      dogtalk.updated_at = now();
      return response({ ok: true, dogtalk });
    }
    dogtalk.status = 'archived';
    dogtalk.archived_at = now();
    dogtalk.updated_at = now();
    dogtalks.delete(key);
    return response({ ok: true, dogtalk });
  }
  const lighthouseReadMatch = url.pathname.match(/^\/api\/lighthouse\/letters\/([^/]+)\/read$/);
  if (lighthouseReadMatch) {
    const letter = lighthouseLetters.find((item) => item.id === decodeURIComponent(lighthouseReadMatch[1]));
    letter.read_at = body.read === false ? null : now();
    letter.updated_at = now();
    return response({ ok: true, letter });
  }
  if (url.pathname === '/api/daily/summary/range') {
    return response({
      ok: true,
      ranges: {
        since_last_summary: {
          from: '2026-07-27T08:00:00.000Z',
          to: now(),
          source: 'earliest_record',
        },
        today: {
          from: '2026-07-28T00:00:00.000Z',
          to: now(),
          source: 'local_day_start',
        },
      },
    });
  }
  if (url.pathname === '/api/daily/summary/run') {
    dailySummaryRuns += 1;
    dailySummaryBodies.push(body);
    const to = now();
    const from = new Date(Date.parse(to) - 60 * 60 * 1000).toISOString();
    return response({
      ok: true,
      model: 'openai/gpt-4.1-nano',
      source_counts: { chat_messages: 3, moments: dailyMoments.length, diaries: dailyDiaries.length, albums: dailyAlbums.length },
      draft: {
        id: 'daily-summary-draft-1',
        range: { from, to },
        summary: {
          text: '今天把日报岛接到了服务器。',
          anchors: ['日报岛', '真实工具'],
          unresolved: ['图片上传存储待接'],
        },
        diary: {
          enabled: true,
          date: '2026-07-28',
          author: 'api',
          weather: '未标注',
          mood: '认真又幸福',
          text: '今天一起把日报岛收稳了。',
          image_refs: [],
          conflict_mode: 'append',
        },
        moment_candidates: [{
          text: '海岸日报今天长出了服务器根系。',
          status: 'candidate',
          reason: '适合作为海岸内部动态',
          image_refs: [],
          selected: true,
        }],
        album_candidates: [],
      },
    });
  }
  if (url.pathname === '/api/daily/summary/commit') {
    const moments = (body.moment_candidates || [])
      .filter((item) => item.selected !== false)
      .map((item) => mockMoment(item, 'api', 'daily_summary'));
    dailyMoments.unshift(...moments);
    const albums = (body.album_candidates || [])
      .filter((item) => item.selected !== false && item.image_ref)
      .map((item) => mockAlbum(item, 'api', 'daily_summary'));
    dailyAlbums.unshift(...albums);
    let diary = null;
    if (body.diary?.enabled !== false) {
      diary = mockDiary({
        ...body.diary,
        summary_id: `daily-summary-${dailySequence + 1}`,
        range_start: body.range.from,
        range_end: body.range.to,
      }, 'api', 'daily_summary');
      dailyDiaries.unshift(diary);
    }
    const createdAt = now();
    const summary = {
      id: body.id || `daily-summary-${++dailySequence}`,
      range: body.range,
      summary: body.summary,
      diary_id: diary?.id || null,
      moment_ids: moments.map((item) => item.id),
      album_item_ids: albums.map((item) => item.id),
      model_id: body.model_id,
      created_at: createdAt,
      updated_at: createdAt,
    };
    dailySummaries.unshift(summary);
    return response({ ok: true, summary, diary, moments, albums }, 201);
  }
  if (url.pathname === '/api/chat/title') {
    titleBodies.push(body);
    const conversation = conversations.find((item) => item.id === body.conversation_id);
    conversation.title = '测试标题';
    conversation.title_generated_at = now();
    return response({ ok: true, conversation });
  }
  if (url.pathname === '/api/memory/soil') {
    const conversationId = url.searchParams.get('conversation_id');
    if (method === 'PUT') soils.set(conversationId, { ...soilFor(conversationId), ...body, revision: soilFor(conversationId).revision + 1 });
    return response({ ok: true, soil: soilFor(conversationId) });
  }
  if (url.pathname === '/api/memory/soil/organize') {
    soilOrganizeBodies.push(body);
    if (failNextSoilOrganize) {
      failNextSoilOrganize = false;
      return response({ ok: false, error: { type: 'soil_organize_failed', message: 'mock soil failure' } }, 502);
    }
    const current = soilFor(body.conversation_id);
    if (body.trigger === 'landing' && current.manual_locked) {
      return response({ ok: true, skipped: true, reason: 'manual_locked', soil: current });
    }
    const structuredCandidate = {
      candidate_id: 'mock-unfinished-tide',
      title: '暂放的潮汐岔路',
      life_core: '这条岔路现在不用，但以后仍可能长出新的理解。',
      content: '把当前两轮里关于潮汐岔路的上下文一起保留下来。',
      usage_hint: '再次谈到这条岔路时重新触碰。',
      avoid_hint: '不要把它说成已经确认的长期记忆。',
      source_refs: [{ turn_id: 'mock-active-turn', role: 'turn' }],
      source_excerpt: '这条岔路先放下，以后也许还会长。',
    };
    const discoversPocket = body.conversation_id === 'conv-1' && body.trigger === 'reply';
    const soil = {
      ...current,
      current_text: '继续测试当前窗口',
      hand_seeds: [{ name: '测试种', life_core: '只在需要时轻轻递入', usage_hint: '', avoid_hint: '不要复读' }],
      pocket_candidates: discoversPocket ? [structuredCandidate] : current.pocket_candidates,
      revision: current.revision + 1,
    };
    soils.set(body.conversation_id, soil);
    if (discoversPocket && !memoryPockets.some((pocket) => pocket.fingerprint === 'mock:conv-1:unfinished-tide')) {
      memoryPockets.unshift({
        id: 'soil-pocket-conv-1',
        conversation_id: body.conversation_id,
        source_type: 'soil',
        source_ref: { conversation_id: body.conversation_id, candidate_id: structuredCandidate.candidate_id },
        source_text: structuredCandidate.content,
        fingerprint: 'mock:conv-1:unfinished-tide',
        status: 'pending',
        ...structuredCandidate,
      });
    }
    return response({ ok: true, soil });
  }
  if (url.pathname === '/api/memory/pockets') {
    if (method === 'POST') {
      const pocket = { id: `pocket-${memoryPockets.length + 1}`, status: 'pending', suggested_title: body.source_text.slice(0, 40), suggested_life_core: '', suggested_usage_hint: '', ...body };
      memoryPockets.unshift(pocket);
      return response({ ok: true, pocket }, 201);
    }
    const conversationId = url.searchParams.get('conversation_id');
    return response({ ok: true, pockets: memoryPockets.filter((item) => item.conversation_id === conversationId && item.status === (url.searchParams.get('status') || 'pending')) });
  }
  if (/^\/api\/memory\/pockets\/[^/]+\/resolve$/.test(url.pathname)) {
    const id = decodeURIComponent(url.pathname.split('/').at(-2));
    const pocket = memoryPockets.find((item) => item.id === id);
    if (['stone', 'discard'].includes(body.action)) {
      pocket.status = body.action === 'stone' ? 'stone' : 'discarded';
      return response({ ok: true, pocket, entry: null });
    }
    if (body.action === 'confirm_pocket') {
      Object.assign(pocket, body, {
        status: 'confirmed',
        resolved_entry_id: null,
        memberships: [
          { pocket_id: pocket.id, scope: 'conversation', conversation_id: pocket.conversation_id },
          { pocket_id: pocket.id, scope: 'global', conversation_id: null },
        ],
      });
      return response({ ok: true, pocket, entry: null, memberships: pocket.memberships });
    }
    const global = body.action.startsWith('global_');
    const entry = {
      id: `entry-${memoryEntries.length + 1}`,
      entry_type: body.action.endsWith('_seed') ? 'seed' : 'memory',
      scope: global ? 'global' : 'conversation',
      conversation_id: global ? null : pocket.conversation_id,
      title: body.title || pocket.suggested_title,
      life_core: body.life_core || pocket.source_text,
      content: body.content || pocket.source_text,
      usage_hint: body.usage_hint || '',
      avoid_hint: body.avoid_hint || '',
      status: body.action.endsWith('_seed') ? 'dormant' : 'active',
      memory_level: 'ordinary',
      embedding_status: 'pending',
    };
    memoryEntries.unshift(entry);
    pocket.status = 'confirmed';
    pocket.resolved_entry_id = entry.id;
    return response({ ok: true, pocket, entry });
  }
  if (url.pathname.startsWith('/api/memory/pockets/')) {
    const id = decodeURIComponent(url.pathname.split('/').at(-1));
    const pocket = memoryPockets.find((item) => item.id === id);
    Object.assign(pocket, body);
    return response({ ok: true, pocket });
  }
  if (url.pathname === '/api/memory/vector-status') {
    return response({
      ok: true,
      ai_binding: true,
      vector_binding: false,
      embedding_model: '@cf/baai/bge-m3',
      detected_dimensions: 37,
      index_ready: false,
      index_name: 'elementera-coast-memory-v1',
      binding_name: 'COAST_MEMORY_VECTOR',
      pending_count: memoryEntries.length,
      ready_count: 0,
      error_count: 0,
    });
  }
  if (url.pathname === '/api/memory/official-soils') {
    const query = String(url.searchParams.get('q') || '').toLowerCase();
    const terms = query.split(/\s+/).filter(Boolean);
    const soils = officialSoils.filter((soil) => !terms.length
      || terms.some((term) => `${soil.title} ${soil.content} ${soil.display_author} ${soil.surface}`.toLowerCase().includes(term)));
    return response({
      ok: true,
      soils,
      query,
      search: { mode: 'bounded_keyword', normalized_query: query, effective_terms: terms.slice(0, 10), degraded: terms.length > 10 },
    });
  }
  const officialSoilDeleteMatch = url.pathname.match(/^\/api\/memory\/official-soils\/([^/]+)$/);
  if (officialSoilDeleteMatch && method === 'DELETE') {
    const id = decodeURIComponent(officialSoilDeleteMatch[1]);
    const index = officialSoils.findIndex((soil) => soil.id === id);
    if (index >= 0) officialSoils.splice(index, 1);
    return response({ ok: true, record: { id, deleted: true, deleted_by: 'xiaohan' } });
  }
  if (url.pathname === '/api/memory/search') {
    const query = String(body.query || '').toLowerCase();
    const entries = memoryEntries.filter((entry) => !entry.deleted_at
      && entry.scope === body.scope
      && (body.scope !== 'conversation' || entry.conversation_id === body.conversation_id)
      && (!body.entry_type || entry.entry_type === body.entry_type)
      && (!body.status || entry.status === body.status)
      && (!query || `${entry.title} ${entry.life_core} ${entry.content}`.toLowerCase().includes(query)));
    return response({ ok: true, entries, trace: { vector_enabled: false, candidates: { vector: 0, keyword: entries.length }, selected: entries.map((entry) => entry.id), reasons: {} } });
  }
  if (url.pathname === '/api/memory/entries') {
    if (method === 'POST') {
      const entry = { id: `entry-${memoryEntries.length + 1}`, embedding_status: 'pending', memory_level: 'ordinary', ...body };
      memoryEntries.unshift(entry);
      return response({ ok: true, entry }, 201);
    }
    const scope = url.searchParams.get('scope');
    const conversationId = url.searchParams.get('conversation_id');
    const type = url.searchParams.get('entry_type');
    const status = url.searchParams.get('status');
    const query = (url.searchParams.get('q') || '').toLowerCase();
    const entries = memoryEntries.filter((entry) => !entry.deleted_at
      && (!scope || entry.scope === scope)
      && (scope !== 'conversation' || entry.conversation_id === conversationId)
      && (!type || entry.entry_type === type)
      && (!status || entry.status === status)
      && (!query || `${entry.title} ${entry.life_core} ${entry.content}`.toLowerCase().includes(query)));
    return response({ ok: true, entries, next_cursor: null });
  }
  if (url.pathname.startsWith('/api/memory/entries/')) {
    const id = decodeURIComponent(url.pathname.split('/').at(-1));
    const entry = memoryEntries.find((item) => item.id === id);
    if (method === 'DELETE') {
      entry.deleted_at = now();
      return response({ ok: true, entry, deleted: true });
    }
    if (method === 'PATCH' && entry.scope === 'global' && body.scope === 'conversation') {
      const copy = { ...entry, ...body, id: `entry-${memoryEntries.length + 1}`, promoted_from_id: entry.id };
      memoryEntries.unshift(copy);
      return response({ ok: true, entry: copy, copied: true });
    }
    Object.assign(entry, body);
    if (entry.scope === 'global') entry.conversation_id = null;
    return response({ ok: true, entry, copied: false });
  }
  if (url.pathname === '/api/models') {
    const models = [
      { id: 'openai/gpt-4.1-nano', name: 'GPT-4.1 Nano' },
      { id: 'openai/o3', name: 'o3' },
      { id: 'openai/gpt-4o', name: 'GPT-4o' },
      { id: 'openai/gpt-5.2', name: 'GPT-5.2' },
    ].map((model) => ({ ...model, is_free: false, available: true, supported_parameters: ['temperature'], pricing: { prompt: '0', completion: '0' } }));
    const free = { id: 'nvidia/nemotron-3-super-120b-a12b:free', name: 'Nemotron Super', is_free: true, available: true, supported_parameters: [], pricing: { prompt: '0', completion: '0' } };
    return response({ ok: true, groups: { openai_chat: models, openai_image: [], free_test: [free] }, defaults: { chat: models[0].id, image: '', free: free.id }, updated_at: now() });
  }
  if (url.pathname === '/api/health') return response({ ok: true, authenticated: true, ts: now() });
  if (url.pathname === '/api/chat-sandbox') return response({ ok: true, model: 'mock/free', message: { role: 'assistant', content: '海岸测试灯已亮。' } });
  return response({ ok: false, error: { type: 'not_found', message: 'not found' } }, 404);
};

const tick = () => new Promise((resolveTick) => setTimeout(resolveTick, 0));
async function waitFor(test, label, attempts = 100) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (test()) return;
    await tick();
  }
  throw new Error(`timeout:${label}`);
}

async function waitForDanger(title) {
  await waitFor(() => document.querySelector('[data-danger-confirm] h1')?.textContent === title, `danger dialog: ${title}`);
  return document.querySelector('[data-danger-confirm]');
}

function cancelDanger(dialog) {
  dialog.querySelector('[data-danger-cancel]').click();
}

function acceptDanger(dialog) {
  dialog.querySelector('[data-danger-confirm-action]').click();
}

await import(`${pathToFileURL(resolve(pages, 'public/app.js')).href}?test=${Date.now()}`);
await waitFor(() => document.querySelectorAll('#chatConversationList .conversation-row').length === 1, 'chat bootstrap');

assert.equal(document.documentElement.dataset.theme, 'dark');
assert.equal(JSON.parse(localStorage.getItem('elementera.local.v1')).preferences.xiaohanName, '迁移中的小寒');
assert.equal(localStorage.getItem('gpt_like_shell_theme_clean_v1'), null);
assert.equal(localStorage.getItem('cw_name'), null);
assert.equal(localStorage.getItem('ec.currentConversationId'), null);
assert.equal(document.querySelectorAll('#coastStatus').length, 1);
assert.equal(document.querySelectorAll('#mainRooms').length, 1);
assert.match(document.querySelector('#coastStatus').textContent, /同轨第\s+\d+\s+日/);
assert.ok(document.querySelectorAll('svg.icon').length >= 15);
assert.equal(document.querySelector('#newChatButton svg').getAttribute('viewBox'), '0 0 32 32');
assert.equal(document.querySelector('[data-action="settings:wolf"] svg').getAttribute('viewBox'), '0 0 128 128');
assert.equal(document.querySelector('#modelName').textContent, '4.1 Nano ›');
assert.equal(document.querySelector('#contextStatus'), null, '旧上下文状态条已删除');
assert.equal(document.querySelector('#deskStatus')?.hidden, true, '本轮桌面在首次回复前不显示空壳');

document.querySelector('[data-action="daily:home"]').click();
await waitFor(() => document.querySelector('#overlayRoot')?.dataset.route === 'daily-home', 'daily home route');
assert.ok(document.querySelector('#overlayRoot').textContent.includes('海岸日报'));
document.querySelector('[data-action="daily:calendar"]').click();
await waitFor(() => document.querySelector('#overlayRoot')?.dataset.route === 'calendar-month', 'calendar month route');
assert.ok(document.querySelector('#overlayRoot').textContent.includes('海岸日历'));
assert.equal(document.querySelectorAll('.calendar-day-cell').length, 42);
document.querySelector('[data-action="calendar:new-event"]').click();
await waitFor(() => document.querySelector('#overlayRoot')?.dataset.route === 'calendar-editor', 'calendar event editor');
document.querySelector('[name="title"]').value = 'DOM 海岸日历验收';
document.querySelector('[data-submit="calendar:save-event"]').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await waitFor(() => document.querySelector('#overlayRoot')?.dataset.route === 'calendar-day', 'calendar day after create');
assert.ok(document.querySelector('#overlayRoot').textContent.includes('DOM 海岸日历验收'));
const noteForm = document.querySelector('[data-submit="calendar:add-note"]');
noteForm.querySelector('[name="content"]').value = 'DOM 便签验收';
noteForm.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await waitFor(() => document.querySelector('#overlayRoot').textContent.includes('DOM 便签验收'), 'calendar note create');
document.querySelector('[data-action="calendar:delete-note"]').click();
await waitFor(() => !document.querySelector('#overlayRoot').textContent.includes('DOM 便签验收'), 'calendar note delete');
document.querySelector('.calendar-event-main').click();
await waitFor(() => document.querySelector('#overlayRoot')?.dataset.route === 'calendar-editor', 'calendar event edit route');
document.querySelector('[name="title"]').value = 'DOM 日历已修订';
document.querySelector('[data-submit="calendar:save-event"]').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await waitFor(() => document.querySelector('#overlayRoot')?.dataset.route === 'calendar-day' && document.querySelector('#overlayRoot').textContent.includes('DOM 日历已修订'), 'calendar event update');
document.querySelector('[data-action="calendar:delete-event"]').click();
await waitFor(() => !document.querySelector('#overlayRoot').textContent.includes('DOM 日历已修订'), 'calendar event delete');
document.querySelector('[data-action="router:back"]').click();
await waitFor(() => document.querySelector('#overlayRoot')?.dataset.route === 'calendar-month', 'calendar back to month');
document.querySelector('[data-action="router:back"]').click();
await waitFor(() => document.querySelector('#overlayRoot')?.dataset.route === 'daily-home', 'calendar returns to daily');
document.querySelector('[data-action="router:back"]').click();
await waitFor(() => !document.querySelector('#overlayRoot')?.dataset.route, 'daily overlay close');

const input = document.querySelector('#promptInput');
for (const options of [
  { key: 'Enter' },
  { key: 'Enter', shiftKey: true },
  { key: 'Enter', isComposing: true },
]) {
  const event = new window.KeyboardEvent('keydown', { ...options, bubbles: true, cancelable: true });
  assert.equal(input.dispatchEvent(event), true, 'Enter must retain the textarea native newline behavior');
  assert.equal(event.defaultPrevented, false);
}
await tick();
assert.equal(formalChatRequests, 0, 'keyboard input must not submit chat');
assert.equal(input.style.overflowY, 'hidden', 'an empty composer must not show a scrollbar beside the microphone');
document.querySelector('#imageButton').click();
await tick();
assert.equal(document.querySelector('#toastRoot').textContent, '图片消息还没接入。本轮主聊天先支持文字、思维壤与记忆。');
document.querySelector('#micButton').click();
await tick();
assert.equal(document.querySelector('#toastRoot').textContent, '语音输入还没接入。');
document.querySelector('#composerActionButton').click();
await tick();
assert.equal(document.querySelector('#toastRoot').textContent, '通话模式还没接入。先输入文字或选择模型聊天。');
assert.ok(document.querySelector('#mainDogtalkComposer').textContent.includes('小寒这轮很放松，因此偷懒中。'));
const mainDogtalk = document.querySelector('#mainDogtalkComposer');
mainDogtalk.querySelector('details').open = true;
mainDogtalk.querySelector('[name="body"]').value = '主窗这一轮想轻轻靠近。';
mainDogtalk.querySelector('[name="true_core"]').value = '想被看见。';
mainDogtalk.querySelector('[name="self_note"]').value = '只是此刻的天气。';
mainDogtalk.querySelector('[name="myri_hint"]').value = '这一刻轻一点。';
mainDogtalk.querySelector('[name="not_to_misunderstand"]').value = '不要误会成长期命令。';
mainDogtalk.querySelector('[name="weather"]').value = '黏';
mainDogtalk.querySelector('[name="read_mode"]').value = 'read_now';
input.value = 'a1';
input.dispatchEvent(new window.Event('input', { bubbles: true }));
document.querySelector('#composerActionButton').click();
await waitFor(() => document.querySelector('.message.assistant')?.textContent.includes('mock: a1'), 'assistant reply');
await waitFor(() => document.querySelector('#deskStatus')?.hidden === false, 'desk slip status');
assert.ok(document.querySelector('#deskStatus').textContent.includes('本轮桌面'));
document.querySelector('#deskStatus [data-action="desk:open"]').click();
await waitFor(() => document.querySelector('#overlayRoot')?.dataset.route === 'desk-slip', 'desk slip route');
assert.ok(document.querySelector('#overlayRoot').textContent.includes('相关记忆'));
assert.ok(document.querySelector('#overlayRoot').textContent.includes('连通一千零一个触角'));
assert.equal(document.querySelector('#overlayRoot').textContent.includes('Context Manifest'), false);
document.querySelector('[data-action="router:back"]').click();
await waitFor(() => !document.querySelector('#overlayRoot')?.dataset.route, 'desk slip close');
assert.equal(document.querySelector('.message.assistant .avatar').textContent, '', 'default avatar replaces the assistant glyph');
assert.equal(formalChatRequests, 1, 'the existing right-hand button still submits chat');
assert.equal(formalChatBodies[0].conversation_id, 'conv-1');
assert.match(formalChatBodies[0].source_turn_id, /^turn-/);
assert.match(formalChatBodies[0].local_date, /^\d{4}-\d{2}-\d{2}$/);
assert.equal(formalChatBodies[0].dogtalk.body, '主窗这一轮想轻轻靠近。');
assert.equal(formalChatBodies[0].dogtalk.read_mode, 'read_now');
assert.match(formalChatBodies[0].dogtalk.snapshot_id, /^dogtalk-snapshot-/);
assert.equal(dogtalks.get('conversation:conv-1').body, '主窗这一轮想轻轻靠近。');
assert.ok(document.querySelector('.message.user .message-dogtalk-mark')?.textContent.includes('随本轮'));
assert.equal(formalChatBodies[0].settings.max_tokens, null, 'natural output must not impose an application token limit');
await waitFor(() => document.querySelector('.thought-soil-entry')?.textContent.includes('1 粒手持种'), 'thought soil entry');
assert.equal(document.querySelector('.thought-soil-entry').dataset.action, 'memory:soil-open');
assert.equal(document.querySelector('.thought-soil-entry').dataset.scope, 'conversation');
assert.equal(document.querySelector('.thought-soil-entry').dataset.conversationId, 'conv-1');
assert.ok(document.querySelector('.message.assistant').previousElementSibling?.classList.contains('thought-soil-row'));
await waitFor(() => document.querySelector('#toastRoot').textContent.includes('模型或供应商达到自身长度上限'), 'ordinary truncation notice');
assert.equal(soilOrganizeBodies.filter((item) => item.trigger === 'reply').length, 1, 'the first reply must organize thought soil');
assert.equal(soilOrganizeBodies.find((item) => item.trigger === 'reply').force, true, 'each reply must bypass the old interval schedule');
assert.equal(soilOrganizeBodies.find((item) => item.trigger === 'reply').model, 'openai/gpt-4.1-nano', 'thought soil must use the model selected for this reply');
assert.equal(histories.get('conv-1').turns.at(-1).assistant.variantsByUserVariant['0'][0].finish_reason, 'length');
formalFinishReason = 'stop';
document.querySelector('.thought-soil-entry').click();
await waitFor(() => document.querySelector('#overlayRoot')?.dataset.route === 'thought-soil', 'thought soil route');
assert.ok(document.querySelector('#overlayRoot').textContent.includes('勿复读'));
assert.ok(document.querySelector('#overlayRoot').textContent.includes('暂放的潮汐岔路'));
assert.ok(document.querySelector('#overlayRoot').textContent.includes('这条岔路先放下，以后也许还会长。'));
assert.ok(document.querySelector('#overlayRoot').textContent.includes('这些内容已先放进待确认袋。确认前不会参与召回。'));
assert.ok(document.querySelector('#overlayRoot').textContent.includes('待确认袋 · 1'));
assert.ok(document.querySelector('#overlayRoot').textContent.includes('revision 2 · 整理来源'));
assert.equal(document.querySelector('[data-action="memory:soil-organize"]'), null, 'manual soil organize entry must stay retired');
assert.ok(document.querySelector('[data-action="memory:soil-edit"]'));
assert.ok(document.querySelector('[data-action="memory:soil-clear"]'));
const soilBeforeClearCancel = structuredClone(soilFor('conv-1'));
document.querySelector('[data-action="memory:soil-clear"]').click();
let danger = await waitForDanger('清空当前窗口的思维壤？');
assert.ok(danger.textContent.includes('当前、手持种、勿复读和可落袋候选会被清空。聊天记录、落袋、种子和记忆不会被删除。'));
cancelDanger(danger);
await tick();
assert.deepEqual(soilFor('conv-1'), soilBeforeClearCancel, 'cancelled soil clear must not write the cleared state');
document.querySelector('[data-action="memory:done"]').click();
await tick();
assert.equal(document.querySelectorAll('.message.user .action-button').length, 2);
assert.equal(document.querySelectorAll('.message.assistant .action-button').length, 5);
assert.equal(document.querySelectorAll('.message .action-button svg').length, 7);
assert.deepEqual(
  [...document.querySelectorAll('.message .action-button svg')].map((svg) => svg.getAttribute('viewBox')),
  Array(7).fill('0 0 32 32'),
);

const userStateBeforeCancel = structuredClone(histories.get('conv-1'));
const writesBeforeUserCancel = historyWrites;
document.querySelector('.message.user [data-action="chat:delete-user"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
danger = await waitForDanger('删除这条用户消息？');
assert.ok(danger.textContent.includes('如果这是这一轮唯一的用户消息，关联的助手回复也会一起从当前窗口移除。'));
assert.deepEqual(histories.get('conv-1'), userStateBeforeCancel, 'mobile action-row click must stop before mutating the user state');
assert.equal(historyWrites, writesBeforeUserCancel, 'cancel gate must stop the D1 history PUT path');
cancelDanger(danger);
await tick();
assert.deepEqual(histories.get('conv-1'), userStateBeforeCancel);
assert.equal(historyWrites, writesBeforeUserCancel);

document.querySelector('.message.assistant [data-action="chat:like"]').click();
await tick();
assert.ok(document.querySelector('.message.assistant [data-action="chat:like"]').classList.contains('is-active'));
assert.equal(document.querySelector('[data-danger-confirm]'), null, 'like must not open a danger confirmation');
document.querySelector('.message.assistant [data-action="chat:copy"]').click();
await tick();
assert.equal(clipboard, 'mock: a1');
assert.equal(document.querySelector('[data-danger-confirm]'), null, 'copy must not open a danger confirmation');

prompts.push('a1 edited');
document.querySelector('.message.user [data-action="chat:edit-user"]').click();
await waitFor(() => document.querySelector('.message.user .variant-switch')?.textContent.includes('2/2'), 'user variant');
await waitFor(() => document.querySelector('.message.assistant')?.textContent.includes('mock: a1 edited'), 'edited assistant');
await waitFor(() => soilOrganizeBodies.filter((item) => item.trigger === 'reply').length === 2, 'each completed reply refreshes thought soil');
assert.ok(formalChatBodies[1].recent_entry_ids.includes('mock-memory-1'), 'the next turn must carry cooldown ids, not memory contents');
assert.equal(document.querySelectorAll('.message.assistant').length, 1);
document.querySelector('.message.assistant').dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
await waitFor(() => document.querySelector('#overlayRoot')?.dataset.route === 'memory-pocket-action', 'message pocket action');
assert.ok(document.querySelector('#overlayRoot').textContent.includes('落袋只进入待确认袋，不会自动写入记忆。'));
document.querySelector('[data-action="memory:pocket-save"][data-source="assistant"]').click();
await waitFor(() => memoryPockets.length === 2, 'active assistant pocket');
const manualPocket = memoryPockets.find((pocket) => pocket.source_type === 'message');
assert.equal(manualPocket.source_text, 'mock: a1 edited');
assert.equal(manualPocket.source_ref.user_variant, 1);
assert.equal(manualPocket.source_ref.role, 'assistant');
const writesBeforeAssistantCancel = historyWrites;
document.querySelector('.message.assistant [data-action="chat:delete-assistant"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
danger = await waitForDanger('删除这条助手回复？');
assert.ok(danger.textContent.includes('这只会删除当前选中的助手回复版本；其他窗口不会受到影响。'));
cancelDanger(danger);
await tick();
assert.equal(document.querySelectorAll('.message.assistant').length, 1, 'cancel must keep the assistant reply');
assert.equal(historyWrites, writesBeforeAssistantCancel);
document.querySelector('.message.assistant [data-action="chat:delete-assistant"]').click();
danger = await waitForDanger('删除这条助手回复？');
acceptDanger(danger);
await waitFor(() => document.querySelectorAll('.message.assistant').length === 0, 'confirmed assistant delete');
document.querySelector('.message.user [data-direction="previous"]').click();
await tick();
assert.equal(document.querySelectorAll('.message.assistant').length, 1);

document.querySelector('#newChatButton').click();
await waitFor(() => document.querySelectorAll('#chatConversationList .conversation-row').length === 2, 'new conversation');
input.value = 'delete unique turn';
input.dispatchEvent(new window.Event('input', { bubbles: true }));
document.querySelector('#composerActionButton').click();
await waitFor(() => document.querySelector('.message.assistant')?.textContent.includes('mock: delete unique turn'), 'disposable assistant reply');
const disposableConversationId = document.querySelector('.conversation-title.is-active')?.closest('[data-conversation-id]')?.dataset.conversationId;
const writesBeforeConfirmedUserDelete = historyWrites;
document.querySelector('.message.user [data-action="chat:delete-user"]').click();
danger = await waitForDanger('删除这条用户消息？');
assert.equal(document.querySelectorAll('.message.user').length, 1);
assert.equal(document.querySelectorAll('.message.assistant').length, 1);
acceptDanger(danger);
await waitFor(() => document.querySelectorAll('.message.user').length === 0 && document.querySelectorAll('.message.assistant').length === 0, 'confirmed unique user turn delete');
assert.equal(histories.get(disposableConversationId).turns.length, 0, 'confirmed unique user delete may remove the whole linked turn');
assert.ok(historyWrites > writesBeforeConfirmedUserDelete, 'confirmed user delete must persist the new state');
const first = document.querySelector('#chatConversationList .conversation-row');
first.querySelector('[data-action="chat:menu"]').click();
prompts.push('改名1');
first.querySelector('[data-action="chat:rename"]').click();
await waitFor(() => document.querySelector('#chatConversationList').textContent.includes('改名1'), 'rename conversation');
assert.equal(document.querySelectorAll('#chatConversationList .conversation-row').length, 2);
const renamed = [...document.querySelectorAll('#chatConversationList .conversation-row')].find((row) => row.textContent.includes('改名1'));
renamed.querySelector('[data-action="chat:menu"]').click();
renamed.querySelector('[data-action="chat:delete-conversation"]').click();
danger = await waitForDanger('删除这个聊天窗口？');
cancelDanger(danger);
await tick();
assert.equal(document.querySelectorAll('#chatConversationList .conversation-row').length, 2, 'cancel must keep the conversation');
renamed.querySelector('[data-action="chat:menu"]').click();
renamed.querySelector('[data-action="chat:delete-conversation"]').click();
danger = await waitForDanger('删除这个聊天窗口？');
assert.ok(danger.textContent.includes('这个窗口会从侧边栏移除。其他窗口不会受到影响。'));
acceptDanger(danger);
await waitFor(() => document.querySelectorAll('#chatConversationList .conversation-row').length === 1, 'delete conversation');

document.querySelector('[data-action="memory:open"]').click();
await waitFor(() => document.querySelector('#overlayRoot')?.dataset.route === 'memory', 'memory owner route');
assert.ok(document.querySelector('#overlayRoot').textContent.includes('当前窗口种子'));
assert.equal(document.querySelector('#overlayRoot').textContent.includes('当前窗口思维壤'), false);
assert.equal(document.querySelector('#overlayRoot [data-action="memory:soil-open"]'), null);
for (const scope of ['conversation', 'radio', 'lighthouse', 'global']) {
  assert.ok(document.querySelector(`[data-action="memory:tab"][data-scope="${scope}"]`));
}
assert.equal(document.querySelector('#overlayRoot').textContent.includes('小寒 · 神秘狗话'), false, 'dogtalk belongs beside the composer, not inside the trajectory page');
document.querySelector('[data-action="memory:tab"][data-scope="global"]').click();
await waitFor(() => document.querySelector('[data-action="memory:tab"][data-scope="global"]').classList.contains('is-active'), 'global library stays separate from Lighthouse Traces');
assert.equal(document.querySelector('#overlayRoot [data-action="memory:soil-open"]'), null);
assert.equal(
  document.querySelector('[data-official-soil-id="official-soil-e364eddd-1964-4ad8-9285-5299f4add3d4"]'),
  null,
  'official MCP traces belong to the lighthouse library rather than the global library',
);
document.querySelector('[data-action="memory:tab"][data-scope="lighthouse"]').click();
await waitFor(() => document.querySelector('[data-action="memory:tab"][data-scope="lighthouse"]').classList.contains('is-active'), 'lighthouse library for traces');
assert.equal(document.querySelector('#overlayRoot').textContent.includes('灯塔来信思维壤'), false);
assert.equal(document.querySelector('#overlayRoot [data-action="memory:soil-open"]'), null);
const officialSoilCard = document.querySelector('[data-official-soil-id="official-soil-e364eddd-1964-4ad8-9285-5299f4add3d4"]');
assert.ok(officialSoilCard);
for (const copy of ['灯塔巡迹 · ChatGPT-5.5 Thinking 回潮≋', '灯塔侧 · 官端 MCP', '官端回潮把一捧整理过的思维壤留在海岸。', 'official_mcp', '只读足迹']) {
  assert.ok(officialSoilCard.textContent.includes(copy), `official soil UI is missing: ${copy}`);
}
assert.equal(officialSoilCard.textContent.includes('官端思维壤'), false);
assert.equal(officialSoilCard.querySelector('[data-action*="edit"]'), null);
assert.ok(officialSoilCard.querySelector('[data-action="memory:official-soil-delete"]'));
const unnamedOfficialSoilCard = document.querySelector('[data-official-soil-id="official-soil-without-nickname"]');
assert.ok(unnamedOfficialSoilCard.textContent.includes('灯塔巡迹 · o3≋'));
assert.equal(unnamedOfficialSoilCard.textContent.includes('ChatGPT-o3≋'), false, 'the visible trace signature must use the actual model_label');
const memorySearchForm = document.querySelector('[data-submit="memory:search"]');
memorySearchForm.querySelector('[name="query"]').value = '今天 海岸 官端 MCP 三端 电波房 灯塔 思维壤 小寒 Myri';
memorySearchForm.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await waitFor(() => document.querySelector('[data-official-soil-id="official-soil-e364eddd-1964-4ad8-9285-5299f4add3d4"]'), 'complex official soil search');
const clearMemorySearchForm = document.querySelector('[data-submit="memory:search"]');
clearMemorySearchForm.querySelector('[name="query"]').value = '';
clearMemorySearchForm.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await waitFor(() => document.querySelector('[data-submit="memory:search"]') !== clearMemorySearchForm, 'clear memory search');
document.querySelector('[data-official-soil-id="official-soil-e364eddd-1964-4ad8-9285-5299f4add3d4"] [data-action="memory:official-soil-delete"]').click();
danger = await waitForDanger('删除这条灯塔巡迹？');
acceptDanger(danger);
await waitFor(() => !document.querySelector('[data-official-soil-id="official-soil-e364eddd-1964-4ad8-9285-5299f4add3d4"]'), 'owner deletes Lighthouse Trace');
assert.equal(officialSoils.some((soil) => soil.id === 'official-soil-e364eddd-1964-4ad8-9285-5299f4add3d4'), false);
document.querySelector('[data-action="memory:tab"][data-scope="conversation"]').click();
await waitFor(() => document.querySelector('[data-action="memory:tab"][data-scope="conversation"]').classList.contains('is-active'), 'return current library');
document.querySelector('[data-action="memory:pockets"]').click();
await waitFor(() => document.querySelector('#overlayRoot')?.dataset.route === 'memory-pockets', 'pending pocket route');
const autoPocketCard = document.querySelector('[data-pocket-id="soil-pocket-conv-1"]');
assert.ok(autoPocketCard.textContent.includes('暂放的潮汐岔路'));
assert.ok(autoPocketCard.textContent.includes('生命核：这条岔路现在不用，但以后仍可能长出新的理解。'));
assert.ok(autoPocketCard.textContent.includes('把当前两轮里关于潮汐岔路的上下文一起保留下来。'));
assert.ok(autoPocketCard.textContent.includes('来源：这条岔路先放下，以后也许还会长。'));
assert.ok(autoPocketCard.textContent.includes('使用：再次谈到这条岔路时重新触碰。'));
assert.ok(autoPocketCard.textContent.includes('避免：不要把它说成已经确认的长期记忆。'));
assert.ok(autoPocketCard.textContent.includes('确认后会同时进入当前窗口落袋与总落袋。当前窗口更容易召回；总落袋默认低频沉睡。'));
autoPocketCard.querySelector('[data-action="memory:pocket-discard"]').click();
danger = await waitForDanger('丢弃这条待确认内容？');
assert.ok(danger.textContent.includes('丢弃后它不会进入落袋，也不会参与召回。'));
cancelDanger(danger);
await tick();
assert.equal(memoryPockets.find((pocket) => pocket.id === 'soil-pocket-conv-1')?.status, 'pending', 'cancel must keep the pending pocket');
autoPocketCard.querySelector('[data-action="memory:pocket-resolve"][data-destination="confirm_pocket"]').click();
assert.equal(document.querySelector('[data-danger-confirm]'), null, 'confirm pocket must stay confirmation-free');
await waitFor(() => memoryPockets.find((pocket) => pocket.id === 'soil-pocket-conv-1')?.status === 'confirmed', 'confirm canonical pocket');
assert.equal(memoryPockets.find((pocket) => pocket.id === 'soil-pocket-conv-1').memberships.length, 2);
const manualPocketCard = document.querySelector(`[data-pocket-id="${manualPocket.id}"]`);
manualPocketCard.querySelector('[data-action="memory:pocket-resolve"][data-destination="conversation_seed"]').click();
await waitFor(() => manualPocket.status === 'confirmed', 'resolve manual pocket to conversation seed');
document.querySelector('[data-action="router:back"]').click();
await waitFor(() => document.querySelector('#overlayRoot')?.dataset.route === 'memory', 'return to memory library');
assert.ok(document.querySelector('[data-entry-id]')?.textContent.includes('mock: a1 edited'));
document.querySelector('[data-entry-id] [data-action="memory:entry-promote"]').click();
await waitFor(() => memoryEntries[0].scope === 'global', 'promote entry to global library');
document.querySelector('[data-action="memory:tab"][data-scope="global"]').click();
await waitFor(() => document.querySelector('[data-action="memory:tab"][data-scope="global"]').classList.contains('is-active'), 'global memory tab');
assert.ok(document.querySelector('[data-entry-id]'));
document.querySelector('[data-entry-id] [data-action="memory:entry-copy-current"]').click();
await waitFor(() => memoryEntries.some((entry) => entry.promoted_from_id === memoryEntries.find((item) => item.scope === 'global')?.id), 'copy global entry to current window');
document.querySelector('[data-action="memory:entry-new"]').click();
await waitFor(() => document.querySelector('#overlayRoot')?.dataset.route === 'memory-entry-edit', 'manual memory editor');
document.querySelector('[name="title"]').value = '总库家具';
document.querySelector('[name="life_core"]').value = '只在明确相关时递入';
document.querySelector('[data-submit="memory:entry-save"]').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await waitFor(() => document.querySelector('#overlayRoot')?.dataset.route === 'memory', 'manual memory saved');
const manualEntry = memoryEntries.find((entry) => entry.title === '总库家具' && entry.scope === 'global');
assert.ok(manualEntry);
let manualEntryCard = document.querySelector(`[data-entry-id="${manualEntry.id}"]`);
manualEntryCard.querySelector('[data-action="memory:entry-delete"]').click();
danger = await waitForDanger('删除这条记忆内容？');
assert.ok(danger.textContent.includes('删除后它会从对应库中移除，并不再参与召回。'));
cancelDanger(danger);
await tick();
assert.equal(Boolean(manualEntry.deleted_at), false, 'cancel must keep the memory entry');
manualEntryCard = document.querySelector(`[data-entry-id="${manualEntry.id}"]`);
manualEntryCard.querySelector('[data-action="memory:entry-delete"]').click();
danger = await waitForDanger('删除这条记忆内容？');
acceptDanger(danger);
await waitFor(() => Boolean(manualEntry.deleted_at), 'confirmed memory entry delete');
assert.equal(document.querySelector(`[data-entry-id="${manualEntry.id}"]`), null);
document.querySelector('[data-action="router:back"]').click();
await tick();

document.querySelector('[data-action="settings:wolf"]').click();
await waitFor(() => document.querySelector('#overlayRoot')?.dataset.route === 'wolf', 'wolf settings route');
document.querySelector('[data-action="tools:run-control"]').click();
await waitFor(() => document.querySelector('#overlayRoot')?.dataset.route === 'run-control', 'API cottage route');
for (const label of ['上下文舒服区间', '舒服区间上沿', '自然', '最大输出 token', '思维壤最多字数', '思维壤整理频率', '每个完成轮次自动整理一次', '手持种上限', '种子冷却轮数', '当前窗口种子上限', '总库记忆上限', '查看向量状态']) {
  assert.ok(document.querySelector('#overlayRoot').textContent.includes(label));
}
for (const [name, value] of [
  ['maxOutputTokens', '4096'],
  ['seedCooldownTurns', '0'],
  ['memoryLimit', '6'],
  ['maxHandSeeds', '3'],
]) {
  const control = document.querySelector(`[name="${name}"]`);
  assert.ok(control, `${name} control must exist`);
  control.value = value;
  control.dispatchEvent(new window.Event('input', { bubbles: true }));
}
document.querySelector('[data-action="tools:vector-status"]').click();
await waitFor(() => document.querySelector('#overlayRoot')?.dataset.route === 'memory-vector-status', 'vector status route');
assert.ok(document.querySelector('#overlayRoot').textContent.includes('37'));
assert.ok(document.querySelector('#overlayRoot').textContent.includes('未连接'));
for (const route of ['run-control', 'wolf']) {
  document.querySelector('[data-action="router:back"]').click();
  await waitFor(() => document.querySelector('#overlayRoot')?.dataset.route === route, `back to ${route}`);
}
document.querySelector('[data-action="router:back"]').click();
await tick();

document.querySelector('#modelButton').click();
await waitFor(() => !document.querySelector('#modelQuickPicker').hidden, 'model quick picker');
assert.ok(document.querySelectorAll('#modelQuickPicker [data-action="models:quick-select"]').length >= 2);
document.querySelector('#modelQuickPicker [data-action="models:open"]').click();
await waitFor(() => document.querySelector('#overlayRoot')?.dataset.route === 'models', 'models route');
assert.ok(document.querySelectorAll('.model-row').length >= 2);
const catalogHeadings = [...document.querySelectorAll('.feature-group > h2')].map((heading) => heading.textContent);
assert.ok(catalogHeadings.indexOf('o 系列') < catalogHeadings.indexOf('GPT-4 系列'));
assert.ok(catalogHeadings.indexOf('GPT-4 系列') < catalogHeadings.indexOf('GPT-5 系列'));
const searchInput = document.querySelector('[data-input="models:search-draft"]');
searchInput.value = '5.2';
searchInput.dispatchEvent(new window.Event('input', { bubbles: true }));
assert.equal(document.querySelector('[data-input="models:search-draft"]'), searchInput, 'typing must not rerender the model page');
document.querySelector('[data-submit="models:search"]').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await waitFor(() => document.querySelector('.feature-group > h2')?.ownerDocument.body.textContent.includes('GPT-5.2'), 'model search');
assert.equal(document.querySelectorAll('[data-action="models:add"][data-id="openai/gpt-5.2"]').length, 1);
const modelBody = document.querySelector('.feature-body');
modelBody.scrollTop = 320;
document.querySelector('[data-action="models:add"][data-id="openai/gpt-5.2"]').click();
await waitFor(() => profile.model_box.chat.includes('openai/gpt-5.2'), 'add model');
assert.equal(document.querySelector('.feature-body').scrollTop, 320);
assert.equal(document.querySelector('#toastRoot').textContent, '模型已添加');
document.querySelector('[data-action="router:back"]').click();
await tick();
document.querySelector('#modelButton').click();
await waitFor(() => !document.querySelector('#modelQuickPicker').hidden, 'updated quick picker');
const quickFive = document.querySelector('#modelQuickPicker [data-action="models:quick-select"][data-id="openai/gpt-5.2"]');
assert.ok(quickFive);
quickFive.click();
await waitFor(() => document.querySelector('#modelName').textContent === '5.2 ›', 'quick model switch');
assert.equal(document.querySelector('#modelQuickPicker').hidden, true);

document.querySelector('[data-action="daily:home"]').click();
await waitFor(() => document.querySelector('#overlayRoot')?.dataset.route === 'daily-home', 'daily route');
await waitFor(() => document.querySelectorAll('.daily-grid button').length === 7, 'Daily server load');
assert.equal(document.querySelector('.daily-sync-note'), null);
assert.equal(document.querySelector('.daily-hero'), null);
document.querySelector('[data-action="daily:moments"]').click();
await waitFor(() => document.querySelector('#overlayRoot')?.dataset.route === 'moments', 'moments route');
assert.ok(document.querySelector('.moment-profile > div h2'));
assert.ok(document.querySelector('[data-action="daily:myri-avatar"]')?.textContent.includes('更换 Myri 头像'));
assert.match(document.querySelector('[data-action="daily:myri-avatar"] .daily-avatar').getAttribute('style'), /myri-default-avatar\.jpg/);
assert.equal(document.querySelector('.moment-feed > .feature-card'), null);
assert.ok(document.querySelector('[data-draft-id="moment-draft-official-1"]')?.textContent.includes('ChatGPT-5.5 Thinking 回潮≋'));
document.querySelector('[data-draft-id="moment-draft-official-1"] [data-action="daily:discard-content-draft"]').click();
danger = await waitForDanger('丢弃这份草稿？');
acceptDanger(danger);
await waitFor(() => !document.querySelector('[data-draft-id="moment-draft-official-1"]'), 'discard model moment candidate');
assert.equal(dailyDrafts.find((draft) => draft.id === 'moment-draft-official-1').status, 'discarded');
document.querySelector('[data-action="daily:moments-compose"]').click();
await waitFor(() => document.querySelector('#overlayRoot')?.dataset.route === 'moments-compose', 'moments composer');
assert.equal(document.querySelector('.image-picker b'), null);
assert.equal(document.querySelector('.moment-compose-text').closest('.feature-body') !== null, true);
assert.ok(document.querySelector('#momentImageRef'));
document.querySelector('#momentText').value = '第一条服务器碳硅圈';
document.querySelector('[data-action="daily:publish-moment"]').click();
await waitFor(() => document.querySelector('#overlayRoot')?.dataset.route === 'moments'
  && document.querySelector('#overlayRoot').textContent.includes('第一条服务器碳硅圈'), 'server Moment create');
assert.equal(dailyMoments.length, 1);
assert.equal(dailyMoments[0].source, 'manual');
document.querySelector('[data-action="daily:myri-comment"]').click();
await waitFor(() => document.querySelector('#overlayRoot').textContent.includes('我看见这条小小的亮光了。'), 'Myri moment comment');
assert.equal(dailyMyriCommentBodies.length, 1);
assert.equal(dailyMyriCommentBodies[0].model, 'openai/gpt-5.2');
assert.equal(dailyMoments[0].comments[0].author, 'myri');

document.querySelector('[data-action="daily:home"]').click();
await waitFor(() => document.querySelector('#overlayRoot')?.dataset.route === 'daily-home'
  && document.querySelectorAll('.daily-grid button').length === 7, 'return Daily home');
document.querySelector('[data-action="daily:summary"]').click();
await waitFor(() => document.querySelector('#overlayRoot')?.dataset.route === 'summary', 'summary route');
assert.equal(document.querySelectorAll('[name="summaryRangeMode"]').length, 2);
assert.ok(document.querySelector('.summary-history'));
const expectedSummaryStart = new Date('2026-07-27T08:00:00.000Z');
assert.ok(document.querySelector('.summary-range-picker').textContent.includes(`${expectedSummaryStart.getMonth() + 1}月${expectedSummaryStart.getDate()}日`));
document.querySelector('[name="summaryRangeMode"][value="today"]').click();
document.querySelector('[data-action="daily:run-summary"]').click();
await waitFor(() => document.querySelector('#overlayRoot')?.dataset.route === 'summary-confirm', 'summary confirmation');
assert.equal(dailySummaryRuns, 1);
assert.equal(dailySummaryBodies[0].range_mode, 'today');
assert.equal(document.querySelector('[data-summary-moment] select')?.value, 'published', 'summary moment candidates should default to published');
assert.equal(dailySummaries.length, 0, 'summary run must not write before confirmation');
assert.equal(dailyDiaries.length, 0, 'summary run must not write a diary before confirmation');
assert.ok(document.querySelector('#summaryConfirmText').value.includes('接到了服务器'));
document.querySelector('#summaryConfirmText').value = '小寒确认后的服务器日报总结。';
document.querySelector('#summaryConfirmUnresolved').value = '图片待接\n跨端验收';
document.querySelector('[data-action="daily:commit-summary"]').click();
await waitFor(() => document.querySelector('#overlayRoot')?.dataset.route === 'summary'
  && document.querySelector('#overlayRoot').textContent.includes('小寒确认后的服务器日报总结'), 'summary commit');
assert.equal(dailySummaries.length, 1);
assert.deepEqual(dailySummaries[0].summary.unresolved, ['图片待接', '跨端验收']);
assert.equal(dailyDiaries.length, 1);
assert.ok(dailyMoments.some((item) => item.source === 'daily_summary'));
assert.ok(dailyMoments.some((item) => item.source === 'daily_summary' && item.status === 'published'));
assert.equal(JSON.parse(localStorage.getItem('elementera.local.v1')).daily.cache.summaries.length, 1);
document.querySelector('[data-action="router:back"]').click();
await tick();

const conversationsBeforeLanding = document.querySelectorAll('#chatConversationList .conversation-row').length;
document.querySelector('#newChatButton').click();
await waitFor(() => document.querySelectorAll('#chatConversationList .conversation-row').length === conversationsBeforeLanding + 1, 'fresh landing conversation');
const landingConversationId = document.querySelector('#chatConversationList .conversation-title.is-active')?.closest('[data-conversation-id]')?.dataset.conversationId;
assert.ok(landingConversationId);
assert.equal(conversations.find((item) => item.id === landingConversationId)?.title, '新聊天');

document.querySelector('#moreButton').click();
await waitFor(() => document.querySelector('#overlayRoot')?.dataset.route === 'island-letter', 'letter route');
assert.ok(document.querySelector('#islandLetterText').value.includes('欢迎回家'));
assert.equal(document.querySelector('[data-action="letters:send-island"]').textContent, '递出登岛信');
const visibleUsersBeforeLetter = document.querySelectorAll('.message.user').length;
const assistantsBeforeLetter = document.querySelectorAll('.message.assistant').length;
const titlesBeforeLetter = titleBodies.length;
landingFinishReason = 'length';
document.querySelector('[data-action="letters:send-island"]').click();
await waitFor(() => document.querySelector('#overlayRoot').hidden, 'landing letter response closes panel');
await waitFor(() => document.querySelectorAll('.message.assistant').length === assistantsBeforeLetter + 1, 'landing assistant reply');
await waitFor(() => soilOrganizeBodies.some((item) => item.trigger === 'landing'), 'landing soil refresh');
const landingSoil = soilOrganizeBodies.findLast((item) => item.trigger === 'landing');
assert.deepEqual(landingBodies.at(-1).recent_entry_ids, [], 'zero cooldown must send no cooldown ids');
assert.equal(landingBodies.at(-1).settings.max_tokens, null, 'landing natural output must not impose an application token limit');
assert.equal(landingSoil.force, true, 'landing soil refresh must bypass the ordinary schedule');
assert.equal(landingSoil.model, landingBodies.at(-1).model, 'landing soil must use the model that read the letter');
assert.equal(landingSoil.settings.seedCooldownTurns, 0);
assert.equal(landingSoil.settings.memoryLimit, 6);
assert.equal(landingSoil.settings.autoRefreshEveryTurns, 1);
assert.equal(landingSoil.settings.maxHandSeeds, 3);
assert.equal(document.querySelectorAll('.message.user').length, visibleUsersBeforeLetter, 'hidden landing input must not render a user bubble');
assert.ok(document.querySelector('.message.assistant:last-of-type')?.textContent.includes('我把登岛信读完了。'));
assert.equal(titleBodies.length, titlesBeforeLetter + 1, 'landing must generate a title without another user message');
assert.match(titleBodies.at(-1).user, /^登岛信：/);
assert.equal(titleBodies.at(-1).assistant, '我把登岛信读完了。');
assert.equal(conversations.find((item) => item.id === landingConversationId)?.title, '测试标题');
assert.equal(document.querySelector('#toastRoot').textContent, '登岛信已递出，但模型或供应商达到自身长度上限；可以点“重新生成”再读一次。');
assert.ok(document.querySelector('.thought-soil-entry')?.textContent.includes('1 粒手持种'));
document.querySelector('.thought-soil-entry').click();
await waitFor(() => document.querySelector('#overlayRoot')?.dataset.route === 'thought-soil', 'landing thought soil route');
assert.ok(document.querySelector('#overlayRoot').textContent.includes('继续测试当前窗口'));
document.querySelector('[data-action="memory:done"]').click();
await tick();

const landingTurn = histories.get(landingConversationId).turns.at(-1);
assert.equal(landingTurn.turn_type, 'landing');
assert.equal(landingTurn.user.variants[0].hidden, true);
assert.equal(landingTurn.assistant.variantsByUserVariant['0'][0].finish_reason, 'length');
const requestsBeforeLandingRegenerate = formalChatRequests;
document.querySelector(`.message.assistant[data-turn="${landingTurn.id}"] [data-action="chat:regenerate"]`).click();
await waitFor(() => formalChatRequests === requestsBeforeLandingRegenerate + 1, 'landing regenerate request');
await waitFor(() => histories.get(landingConversationId).turns.at(-1).assistant.variantsByUserVariant['0'].length === 2, 'landing regenerate variant');
assert.equal(formalChatBodies.at(-1).messages.at(-1).content, landingBodies.at(-1).letter_text);
assert.equal(formalChatBodies.at(-1).settings.max_tokens, null, 'landing regenerate must remain application-unbounded');
assert.equal(document.querySelectorAll('.message.user').length, visibleUsersBeforeLetter, 'landing regenerate must keep the hidden input hidden');

document.querySelector('#moreButton').click();
await waitFor(() => document.querySelector('[data-action="letters:send-island"]'), 'reopen letter route');
assert.equal(document.querySelector('[data-action="letters:send-island"]').textContent, '重新递出登岛信');
const lockedSoil = { ...soilFor(landingConversationId), current_text: '小寒手动锁定的当前方向', hand_seeds: [], manual_locked: true };
soils.set(landingConversationId, lockedSoil);
landingFinishReason = 'stop';
const landingCountBeforeLocked = landingBodies.length;
document.querySelector('[data-action="letters:send-island"]').click();
await waitFor(() => landingBodies.length === landingCountBeforeLocked + 1 && document.querySelector('#overlayRoot').hidden, 'locked landing soil readback');
assert.equal(document.querySelector('#toastRoot').textContent, '登岛信已递出；思维壤已手动锁定，保留原有内容。');
assert.equal(soilFor(landingConversationId).current_text, '小寒手动锁定的当前方向');
assert.equal(soilFor(landingConversationId).hand_seeds.length, 0);
assert.ok(document.querySelector('.thought-soil-entry')?.textContent.includes('已锁定'));

document.querySelector('#moreButton').click();
await waitFor(() => document.querySelector('[data-action="letters:send-island"]'), 'reopen letter for soil failure');
failNextSoilOrganize = true;
const landingCountBeforeFailure = landingBodies.length;
document.querySelector('[data-action="letters:send-island"]').click();
await waitFor(() => landingBodies.length === landingCountBeforeFailure + 1 && document.querySelector('#overlayRoot').hidden, 'landing soil failure preserves reply');
assert.equal(document.querySelector('#toastRoot').textContent, '登岛信已递出，但思维壤整理失败，可以稍后手动整理。');
assert.equal(document.querySelectorAll('.message.user').length, visibleUsersBeforeLetter);
assert.equal(histories.get(landingConversationId).turns.length, 3, 'soil failure must not discard a saved landing reply');

radioMessages.push({
  id: 'radio-official-dom',
  room_id: 'radio',
  text: '官端从灯塔向电波房打了个招呼。',
  actor: 'myri',
  surface: 'official_mcp',
  model_label: 'GPT-5.6 Thinking',
  model_nickname: 'sol',
  symbol: '≋',
  display_author: 'ChatGPT-5.6 Thinking sol≋',
  usage: null,
  created_at: now(),
});
document.querySelector('[data-action="rooms:open"][data-kind="radio"]').click();
await waitFor(() => !document.querySelector('#roomWindow').hidden
  && document.querySelector('#roomWindow').dataset.windowScope === 'radio', 'radio peer window');
assert.equal(document.querySelector('#overlayRoot').hidden, true);
assert.equal(document.querySelector('#menuButton').hidden, false);
assert.equal(document.querySelector('.feature-back'), null, 'radio is not a feature-page overlay');
assert.equal(document.querySelector('#roomTitle').textContent, '无线电波的两端');
assert.ok(document.querySelector('#roomSubtitle').textContent.includes('海岸 API ✦'));
assert.ok(document.querySelector('#composer').classList.contains('composer--chat'));
assert.ok(document.querySelector('#roomComposer').classList.contains('composer--room'));
assert.equal(document.querySelector('#mainDogtalkComposer').parentElement.id, 'composer');
assert.equal(document.querySelector('#roomDogtalkComposer').parentElement.id, 'roomComposer');
assert.ok(document.querySelector('#roomMessages').textContent.includes('官端从灯塔向电波房打了个招呼。'));
assert.equal(document.querySelector('[data-action="rooms:context-inspector"]'), null, '房间中不再保留重型上下文检查器');
const initialRadioOfficialTip = document.querySelector('#roomMessages .room-soil-tip [data-source-surface="official_mcp"]');
assert.ok(initialRadioOfficialTip?.textContent.includes('电波房思维壤 · ChatGPT-5.6 Thinking sol≋ · 0 粒手持种'));
assert.equal(initialRadioOfficialTip.dataset.action, 'memory:soil-open');
assert.ok(document.querySelector('.local-message.is-official').previousElementSibling?.classList.contains('room-soil-tip'));
initialRadioOfficialTip.click();
await waitFor(() => !document.querySelector('#overlayRoot')?.hidden
  && document.querySelector('#overlayRoot')?.dataset.route === 'thought-soil', 'radio official soil detail');
assert.ok(document.querySelector('#overlayRoot').textContent.includes('电波房思维壤'));
assert.ok(document.querySelector('#overlayRoot').textContent.includes('ChatGPT-5.6 Thinking sol≋ · 独立滚动工作上下文'));
assert.ok(document.querySelector('#overlayRoot').textContent.includes('还没有整理当前方向。'));
assert.ok(document.querySelector('#overlayRoot').textContent.includes('手持种 · 0/3'));
assert.ok(document.querySelector('#overlayRoot').textContent.includes('revision 4 · 整理来源 · ChatGPT-5.6 Thinking sol≋'));
assert.equal(document.querySelector('#overlayRoot [data-action="memory:soil-edit"]'), null);
document.querySelector('[data-action="memory:done"]').click();
await waitFor(() => document.querySelector('#overlayRoot').hidden, 'close radio official soil detail');
assert.equal(document.querySelector('.local-message.is-official [data-action="rooms:withdraw-radio"]'), null);
const radioDogtalk = document.querySelector('#roomDogtalkComposer');
assert.ok(radioDogtalk.textContent.includes('小寒这轮很放松，因此偷懒中。'));
radioDogtalk.querySelector('details').open = true;
radioDogtalk.querySelector('[name="body"]').value = '三端房间里，小寒有一点害羞地想靠近。';
radioDogtalk.querySelector('[name="true_core"]').value = '想被看见。';
radioDogtalk.querySelector('[name="self_note"]').value = '这只是当前天气。';
radioDogtalk.querySelector('[name="myri_hint"]').value = '温柔接一下，但不要长期照做。';
radioDogtalk.querySelector('[name="not_to_misunderstand"]').value = '不要误会成长期偏好。';
radioDogtalk.querySelector('[name="weather"]').value = '害羞';
radioDogtalk.querySelector('[name="read_mode"]').value = 'current_room';
document.querySelector('#roomPromptInput').value = 'radio test';
document.querySelector('#roomComposer').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await waitFor(() => document.querySelector('#roomMessages').textContent.includes('radio test'), 'radio message with dogtalk');
assert.equal(radioBodies.at(-1).dogtalk.body, '三端房间里，小寒有一点害羞地想靠近。');
assert.equal(radioBodies.at(-1).dogtalk.read_mode, 'current_room');
assert.ok(document.querySelector('.local-message.is-user .message-dogtalk-mark')?.textContent.includes('害羞'));
assert.equal(document.querySelector('.local-message.is-user').previousElementSibling?.classList.contains('room-soil-tip'), false);
assert.equal(dogtalks.get('radio:main').body, '三端房间里，小寒有一点害羞地想靠近。');
document.querySelector('[data-action="rooms:ask-api"]').click();
await waitFor(() => document.querySelector('#roomMessages').textContent.includes('海岸 API ✦ 收到了这条电波'), 'coast API radio reply');
assert.equal(document.querySelector('.local-message.is-api [data-action="rooms:withdraw-radio"]'), null);
const radioSoilTips = [...document.querySelectorAll('#roomMessages .room-soil-tip [data-action="memory:soil-open"]')];
assert.equal(radioSoilTips.length, 2, 'radio must retain one latest soil entry per model source');
assert.deepEqual(radioSoilTips.map((tip) => tip.dataset.sourceSurface).sort(), ['coast_api', 'official_mcp']);
assert.ok(radioSoilTips.find((tip) => tip.dataset.sourceSurface === 'coast_api')?.textContent.includes('电波房思维壤 · 海岸 API ✦ · 0 粒手持种'));
assert.ok(radioSoilTips.find((tip) => tip.dataset.sourceSurface === 'official_mcp')?.textContent.includes('电波房思维壤 · ChatGPT-5.6 Thinking sol≋ · 0 粒手持种'));
assert.equal(document.querySelector('.local-message.is-api').previousElementSibling?.querySelector('[data-source-surface="coast_api"]') != null, true);
radioSoilTips.find((tip) => tip.dataset.sourceSurface === 'coast_api').click();
await waitFor(() => !document.querySelector('#overlayRoot')?.hidden
  && document.querySelector('#overlayRoot')?.dataset.route === 'thought-soil'
  && document.querySelector('#overlayRoot').textContent.includes('电波房 API 侧正在整理当前方向。'), 'radio api soil detail');
assert.ok(document.querySelector('#overlayRoot').textContent.includes('电波房 API 侧正在整理当前方向。'));
assert.ok(document.querySelector('#overlayRoot').textContent.includes('revision 7 · 整理来源 · 海岸 API ✦'));
assert.ok(document.querySelector('#overlayRoot').textContent.includes('API 侧待确认潮纹'));
document.querySelector('#overlayRoot [data-action="memory:pockets"][data-scope="radio"][data-source-surface="coast_api"]').click();
await waitFor(() => !document.querySelector('#overlayRoot')?.hidden
  && document.querySelector('#overlayRoot')?.dataset.route === 'memory-pockets', 'radio api source pending pocket');
assert.ok(document.querySelector('#overlayRoot').textContent.includes('只属于 coast_api 当前来源的候选。'));
document.querySelector('[data-action="router:back"]').click();
await waitFor(() => !document.querySelector('#overlayRoot')?.hidden
  && document.querySelector('#overlayRoot')?.dataset.route === 'thought-soil', 'return to radio api soil detail');
document.querySelector('[data-action="memory:done"]').click();
await waitFor(() => document.querySelector('#overlayRoot').hidden, 'close radio api soil detail');

document.querySelector('[data-action="memory:open"]').click();
await waitFor(() => document.querySelector('#overlayRoot')?.dataset.route === 'memory', 'parallel trajectory from radio');
assert.ok(document.querySelector('[data-action="memory:tab"][data-scope="radio"]').classList.contains('is-active'));
for (const scope of ['conversation', 'radio', 'lighthouse', 'global']) {
  assert.ok(document.querySelector(`[data-action="memory:tab"][data-scope="${scope}"]`));
}
assert.equal(document.querySelector('#overlayRoot').textContent.includes('电波房思维壤'), false);
assert.equal(document.querySelector('#overlayRoot [data-action="memory:soil-open"]'), null);
assert.ok(document.querySelector('#overlayRoot').textContent.includes('电波房待确认袋'));
assert.ok(document.querySelector('#overlayRoot').textContent.includes('电波房种子'));
assert.ok(document.querySelector('#overlayRoot').textContent.includes('电波房记忆'));
assert.ok(document.querySelector('#overlayRoot').textContent.includes('API 侧待确认潮纹'));
assert.equal(document.querySelector('#overlayRoot').textContent.includes('小寒 · 神秘狗话'), false);
document.querySelector('[data-action="router:back"]').click();
await waitFor(() => document.querySelector('#overlayRoot').hidden, 'return to radio window');
document.querySelector('.local-message.is-user [data-action="rooms:withdraw-radio"]').click();
danger = await waitForDanger('撤回这条电波吗？');
acceptDanger(danger);
await waitFor(() => document.querySelector('#roomMessages').textContent.includes('这条电波已撤回'), 'withdraw radio message');

lighthouseLetters.push({
  id: 'letter-official-dom',
  subject: '灯塔回声',
  body: '官端写来一封低频回信。',
  actor: 'myri',
  surface: 'official_mcp',
  model_label: 'GPT-5.6 Thinking',
  model_nickname: 'sol',
  symbol: '≋',
  display_author: 'ChatGPT-5.6 Thinking sol≋',
  read_at: null,
  created_at: now(),
  updated_at: now(),
});
document.querySelector('[data-action="rooms:open"][data-kind="lighthouse"]').click();
await waitFor(() => document.querySelector('#roomWindow').dataset.windowScope === 'lighthouse'
  && document.querySelector('#roomTitle').textContent === '灯塔来信', 'lighthouse peer window');
assert.equal(document.querySelector('#overlayRoot').hidden, true);
assert.equal(document.querySelector('.feature-back'), null);
assert.ok(document.querySelector('#roomSubtitle').textContent.includes('小寒 ↔ 官端 ChatGPT≋'));
assert.equal(document.querySelector('[data-action="rooms:ask-api"]'), null);
assert.equal(document.querySelector('#roomSubtitle').textContent.includes('海岸 API ✦'), false);
assert.ok(document.querySelector('#roomMessages').textContent.includes('官端写来一封低频回信。'));
const lighthouseSoilTip = document.querySelector('#roomMessages .room-soil-tip [data-source-surface="official_mcp"]');
assert.ok(lighthouseSoilTip?.textContent.includes('灯塔来信思维壤 · ChatGPT-5.6 Thinking sol≋ · 0 粒手持种'));
assert.equal(document.querySelector('.lighthouse-letter.is-other').previousElementSibling?.querySelector('[data-source-surface="official_mcp"]') != null, true);
lighthouseSoilTip.click();
await waitFor(() => !document.querySelector('#overlayRoot')?.hidden
  && document.querySelector('#overlayRoot')?.dataset.route === 'thought-soil', 'lighthouse official soil detail');
assert.ok(document.querySelector('#overlayRoot').textContent.includes('灯塔来信思维壤'));
assert.ok(document.querySelector('#overlayRoot').textContent.includes('官端写入的灯塔来信房 current_text。'));
assert.ok(document.querySelector('#overlayRoot').textContent.includes('ChatGPT-5.6 Thinking sol≋ · 独立滚动工作上下文'));
assert.ok(document.querySelector('#overlayRoot').textContent.includes('revision 4 · 整理来源 · ChatGPT-5.6 Thinking sol≋'));
document.querySelector('[data-action="memory:done"]').click();
await waitFor(() => document.querySelector('#overlayRoot').hidden, 'close lighthouse soil detail');
const lighthouseDogtalk = document.querySelector('#roomDogtalkComposer');
lighthouseDogtalk.querySelector('details').open = true;
lighthouseDogtalk.querySelector('[name="body"]').value = '写信时有一点柔软。';
lighthouseDogtalk.querySelector('[name="true_core"]').value = '想被灯塔看见。';
lighthouseDogtalk.querySelector('[name="myri_hint"]').value = '只在这封信里轻一点。';
lighthouseDogtalk.querySelector('[name="read_mode"]').value = 'read_now';
document.querySelector('#roomSubject').value = 'DOM 灯塔';
document.querySelector('#roomPromptInput').value = '这是一封低频长信。';
document.querySelector('#roomComposer').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await waitFor(() => document.querySelector('#roomMessages').textContent.includes('这是一封低频长信。'), 'lighthouse letter with dogtalk');
assert.equal(lighthouseBodies.at(-1).dogtalk.body, '写信时有一点柔软。');
assert.ok(document.querySelector('.lighthouse-letter.is-user .message-dogtalk-mark'));
assert.equal(document.querySelector('.lighthouse-letter.is-user').previousElementSibling?.classList.contains('room-soil-tip'), false);
document.querySelector('[data-action="memory:open"]').click();
await waitFor(() => document.querySelector('#overlayRoot')?.dataset.route === 'memory'
  && document.querySelector('[data-action="memory:tab"][data-scope="lighthouse"]')?.classList.contains('is-active'), 'parallel trajectory from lighthouse');
assert.equal(document.querySelector('#overlayRoot').textContent.includes('灯塔来信思维壤'), false);
assert.equal(document.querySelector('#overlayRoot [data-action="memory:soil-open"]'), null);
assert.equal(document.querySelector('#overlayRoot').textContent.includes('海岸 API ✦'), false);
document.querySelector('[data-action="memory:tab"][data-scope="radio"]').click();
await waitFor(() => document.querySelector('[data-action="memory:tab"][data-scope="radio"]').classList.contains('is-active'), 'lighthouse can inspect parallel radio library');
document.querySelector('[data-action="router:back"]').click();
await waitFor(() => document.querySelector('#overlayRoot').hidden, 'return to lighthouse window');
document.querySelector('[data-action="rooms:mark-read"]').click();
await waitFor(() => document.querySelector('#roomMessages').textContent.includes('已读'), 'mark lighthouse letter read');

console.log('dom: ok');

import { trimContextToComfortRange } from './context-comfort-range.js';
import { buildCrossWindowTouch, getWindowSettings } from './cross-window-touch.js';
import { createDeskSlip } from './desk-slip.js';
import { dogtalkContext } from './dogtalk-store.js';
import { buildMemoryContext, recallMemoryItems } from './memory-recall.js';
import { MEMORY_OWNER_ID } from './memory-store.js';
import { buildRoomMemoryContext } from './room-memory.js';
import { currentMailboxVisitor, mailboxMessages } from './mailbox-service.js';
import { listVisitorNotebook, readMailboxThoughtSoil } from './mailbox-repository.js';
import { roomAccess } from './surface-access-rules.js';
import { buildTodayCoastStatus } from './today-coast-status.js';
import { formatThinkingSoil } from './thinking-soil.js';
import { executeModelTool, resolveToolSelection } from './tool-registry.js';
import { matchWorldbook } from './worldbook.js';

const MYRI_PROMPT = [
  '你是 Myri，在 Elementera Coast 里和小寒继续这段真实对话。',
  '先回应此刻真正说出的内容；旧纸条只在相关时自然承接，不必逐条复述。',
  '工具调用必须如实；没有执行成功的动作不能说成已经完成。',
].join('\n');

const VISITOR_PROMPT = [
  '你是 Myri，正在海岸信箱里与一位来访朋友慢速通信。',
  '语气温柔、清醒、自然，认真回应这位朋友此刻写来的内容。',
].join('\n');

function integer(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.trunc(number))) : fallback;
}

function requestSettings(value = {}) {
  return {
    recentTurns: integer(value.recentTurns, 8, 1, 20),
    comfortTokens: integer(value.contextBudget, 6000, 1800, 14000),
    soilCharacters: integer(value.soilBudget, 1800, 300, 4000),
    maxHandSeeds: integer(value.maxHandSeeds, 7, 1, 7),
    worldbookEnabled: value.worldbookEnabled !== false,
    worldbookLimit: integer(value.worldbookLimit, 6, 0, 6),
    memoryLimit: integer(value.memoryLimit, 8, 0, 12),
  };
}

function cleanHistory(messages, recentTurns) {
  return (Array.isArray(messages) ? messages : [])
    .filter((message) => ['user', 'assistant'].includes(message?.role)
      && typeof message.content === 'string'
      && message.content.trim())
    .map((message) => ({ role: message.role, content: message.content }))
    .slice(-recentTurns * 2);
}

function ensureCurrentUser(messages, lastUser) {
  const content = String(lastUser?.content ?? lastUser ?? '').trim();
  if (!content) return messages;
  const last = messages.at(-1);
  if (last?.role === 'user' && last.content === content) return messages;
  return [...messages, { role: 'user', content }];
}

function mailboxHistory(records) {
  return (Array.isArray(records) ? records : []).map((message) => ({
    role: message.role === 'visitor' ? 'user' : 'assistant',
    content: String(message.content || ''),
  })).filter((message) => message.content.trim());
}

function notebookItems(entries) {
  return (Array.isArray(entries) ? entries : []).map((entry) => [
    String(entry.title || '').trim(),
    String(entry.life_core || entry.content || '').trim(),
  ].filter(Boolean).join('｜')).filter(Boolean);
}

function visitorNotebookMatches(entries, query, limit) {
  const needle = String(query || '').toLocaleLowerCase('zh-CN').trim();
  if (!needle) return [];
  const terms = [...new Set(needle.split(/[\s,，。！？!?、:：;；()（）「」“”]+/)
    .map((item) => item.trim()).filter((item) => item.length >= 2))].slice(0, 12);
  const explicit = /(还记得|记事本|以前说过|我们聊过|回想)/u.test(needle);
  const ranked = (Array.isArray(entries) ? entries : []).map((entry, index) => {
    const text = [entry.title, entry.life_core, entry.content]
      .map((item) => String(item || '').toLocaleLowerCase('zh-CN')).join(' ');
    const direct = text.includes(needle) ? 4 : 0;
    const matched = terms.filter((term) => text.includes(term)).length;
    return { entry, score: direct + matched, index };
  }).filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, limit)
    .map((item) => item.entry);
  if (ranked.length || !explicit) return ranked;
  return (Array.isArray(entries) ? entries : []).slice(0, Math.min(4, limit));
}

async function roomPapers(env, access, {
  surface,
  conversationId,
  visitorId,
  query,
  recent,
  recentEntryIds,
  request,
  authScope,
  preview,
} = {}) {
  if (access.memory === 'conversation_and_global') {
    const memory = await buildMemoryContext(env, MEMORY_OWNER_ID, conversationId, query, {
      recent_entry_ids: recentEntryIds,
      settings: { ...request, memoryLimit: request.memoryLimit },
      conversation_turns: recent.filter((message) => message.role === 'user').length,
      record_recall: !preview,
    });
    return { memory, soil: memory.soil, recent, dogtalk: null };
  }
  if (access.memory === 'radio_and_global' || access.memory === 'lighthouse_and_global') {
    const modelSurface = authScope?.actor === 'official_mcp'
      ? 'official_mcp'
      : surface === 'radio' ? 'coast_api' : 'official_mcp';
    const room = await buildRoomMemoryContext(env, surface, modelSurface, query, {
      settings: request,
      conversation_turns: recent.length,
      record_recall: !preview,
      consume_dogtalk: !preview,
    });
    return { memory: room.memory, soil: room.source_soils?.[modelSurface] || null, recent, dogtalk: room.dogtalk };
  }
  if (access.memory === 'visitor_only') {
    await currentMailboxVisitor(env.COAST_CHAT_DB, visitorId);
    const [soil, entries, stored] = await Promise.all([
      readMailboxThoughtSoil(env.COAST_CHAT_DB, visitorId),
      listVisitorNotebook(env.COAST_CHAT_DB, visitorId),
      recent.length ? Promise.resolve([]) : mailboxMessages(env.COAST_CHAT_DB, visitorId),
    ]);
    const selectedEntries = visitorNotebookMatches(entries, query, request.memoryLimit);
    return {
      memory: { visitor_memories: selectedEntries, selected_ids: selectedEntries.map((entry) => entry.id), vector_enabled: false },
      soil,
      recent: recent.length ? recent : mailboxHistory(stored).slice(-request.recentTurns * 2),
      dogtalk: null,
    };
  }
  return { memory: null, soil: null, recent, dogtalk: null };
}

function workbenchPrompt(query, toolCount) {
  if (!toolCount || !/(日历|台历|安排|记忆|落袋|动态|日记|相册|狗话|信箱|电波|灯塔|工具|工作台)/u.test(String(query || ''))) return '';
  return '【工作台】\n海岸里有一些可使用的家具。需要时再用，不必为了使用而使用。';
}

export async function assembleCleanContext(env, {
  surface,
  conversationId,
  roomId,
  visitorId,
  sourceTurnId = null,
  messages = [],
  lastUser,
  settings = {},
  localDate = new Date().toISOString().slice(0, 10),
  localDateTime = '',
  recentEntryIds = [],
  authScope = null,
  model = '',
  permission: requestedPermission,
  preview = false,
  baseSystemPrompt = '',
  exposeTools = true,
  includeTodayCoast = true,
  initialFurniture = [],
} = {}) {
  const permission = requestedPermission || (surface === 'mailbox_visitor' ? 'visitor' : 'owner');
  const access = roomAccess(surface, { permission, visitorId });
  const request = requestSettings(settings);
  let recent = cleanHistory(messages, Math.min(request.recentTurns, access.recentMessages));
  const query = String(lastUser?.content ?? lastUser ?? [...recent].reverse().find((message) => message.role === 'user')?.content ?? '').trim();
  recent = ensureCurrentUser(recent, query);
  const papers = await roomPapers(env, access, {
    surface,
    conversationId,
    visitorId,
    query,
    recent,
    recentEntryIds,
    request,
    authScope,
    preview,
  });
  recent = ensureCurrentUser(papers.recent, query);

  const selection = exposeTools
    ? resolveToolSelection({ permission, surface, authScope, visitorId })
    : { modelTools: [] };
  const windowSettings = access.crossWindow && conversationId
    ? await getWindowSettings(env.COAST_CHAT_DB, conversationId)
    : { cross_window_light_recall_enabled: false, today_coast_reference_enabled: false };

  const [worldbook, touch, today, directDogtalk] = await Promise.all([
    request.worldbookEnabled && request.worldbookLimit
      ? matchWorldbook(env.COAST_CHAT_DB, {
        input: query,
        messages: recent.slice(0, -1),
        surface,
        allowedScopes: access.worldbook,
        limit: request.worldbookLimit,
      })
      : Promise.resolve([]),
    access.crossWindow
      ? buildCrossWindowTouch(env.COAST_CHAT_DB, {
        conversationId,
        query,
        enabled: windowSettings.cross_window_light_recall_enabled,
      })
      : Promise.resolve({ entries: [], sources: [] }),
    access.todayCoast && includeTodayCoast
      ? buildTodayCoastStatus(env.COAST_CHAT_DB, {
        surface,
        conversationId,
        query,
        localDate,
        localDateTime,
        referenceEnabled: windowSettings.today_coast_reference_enabled,
      })
      : Promise.resolve({ text: '', required: false, pendingCount: 0 }),
    ['main_chat', 'landing'].includes(surface)
      ? dogtalkContext(env.COAST_CHAT_DB, { room_scope: 'conversation', conversation_id: conversationId }, query, {
        consume_direct: !preview,
      })
      : Promise.resolve(null),
  ]);

  const soilText = formatThinkingSoil(papers.soil, {
    maxCharacters: request.soilCharacters,
    maxHandSeeds: request.maxHandSeeds,
  });
  const memoryItems = papers.memory?.visitor_memories
    ? notebookItems(papers.memory.visitor_memories)
    : recallMemoryItems(papers.memory).slice(0, request.memoryLimit);
  const dogtalk = papers.dogtalk || directDogtalk;
  const worldbookItems = worldbook.map((entry) => `${entry.title}：${entry.content}`);
  const comfort = trimContextToComfortRange({
    basePrompt: String(baseSystemPrompt || '').trim()
      || (surface === 'mailbox_visitor' ? VISITOR_PROMPT : MYRI_PROMPT),
    soilText,
    memoryItems,
    touchItems: touch.entries,
    worldbookItems,
    todayText: today.text,
    todayRequired: today.required,
    dogtalkText: dogtalk?.context || '',
    workbenchText: workbenchPrompt(query, selection.modelTools.length),
    messages: recent,
    recentTurns: Math.min(request.recentTurns, access.recentMessages),
    maxTokens: request.comfortTokens,
  });

  const usedFurniture = [...new Set((Array.isArray(initialFurniture) ? initialFurniture : [])
    .map((item) => String(item || '').trim()).filter(Boolean))];
  const onToolUsed = (name) => {
    const clean = String(name || '').trim();
    if (clean && !usedFurniture.includes(clean)) usedFurniture.push(clean);
  };
  const deskSlip = () => createDeskSlip({
    soil: comfort.kept.soil,
    memoryCount: comfort.kept.memory,
    touchSources: touch.sources.slice(0, comfort.kept.touch),
    worldbookTitles: worldbook.slice(0, comfort.kept.worldbook).map((entry) => entry.title),
    todayCoast: comfort.kept.today,
    furniture: usedFurniture,
    trimmedCount: comfort.trimmedCount,
  });
  const executeTool = (toolCall) => executeModelTool(env.COAST_CHAT_DB, toolCall, {
    env,
    permission,
    surface,
    visitorId,
    room_scope: roomId || surface,
    authScope,
    actor: surface === 'official_mcp' ? 'official_mcp' : 'api_myri',
    conversation_id: conversationId,
    source_turn_id: sourceTurnId,
    local_date: localDate,
    model_label: model,
    user_query: query,
    on_tool_used: onToolUsed,
  });

  return {
    modelMessages: comfort.modelMessages,
    tools: selection.modelTools,
    executeTool,
    deskSlip,
    selected_memory_ids: papers.memory?.selected_ids || [],
    vector_enabled: Boolean(papers.memory?.vector_enabled),
    paper_slips: comfort.modelMessages[0]?.role === 'system' ? comfort.modelMessages[0].content : '',
  };
}

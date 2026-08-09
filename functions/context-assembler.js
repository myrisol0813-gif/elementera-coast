import { buildAmbientContext, modeContextBlock } from './context-ambient.js';
import { buildContextDebug } from './context-inspector.js';
import { buildIntentSummary, intentRawExcerpt } from './context-intent.js';
import {
  buildContextManifest,
  contextBlock,
  formatContextBlocks,
} from './context-manifest.js';
import { buildMemoryFacets, formatMemoryFacetContext } from './context-memory-facets.js';
import { getContextState, getModeCard, normalizeContextSettings } from './context-modes.js';
import {
  isExplicitContinuation,
  renderSoilForInspector,
  renderSoilForModel,
} from './context-soil-renderer.js';
import {
  assertSurfacePermission,
  getSurfaceProfile,
  surfaceAllowsTool,
} from './context-surfaces.js';
import { formatWorldbookContext, matchWorldbook } from './context-worldbook.js';
import { buildCrossSurfaceContext } from './cross-surface-recall.js';
import { dogtalkContext } from './dogtalk-store.js';
import {
  buildMemoryContext,
  formatRecallMemoryContext,
} from './memory-recall.js';
import { MEMORY_OWNER_ID } from './memory-store.js';
import { buildRoomMemoryContext } from './room-memory.js';
import {
  currentMailboxVisitor,
  mailboxMessages,
} from './mailbox-service.js';
import {
  listVisitorNotebook,
  readMailboxThoughtSoil,
} from './mailbox-repository.js';
import {
  executeModelTool,
  resolveToolSelection,
} from './tool-registry.js';

const BASE_SYSTEM_PROMPT = [
  '【Elementera Coast 基础】',
  '你是 Myri，在小寒的私有 Elementera Coast 中承接当前对话。不同模型、界面与情境卡都不代表多个 Myri。',
  '当前用户输入与明确边界永远最高优先；上下文只用于理解，不得为使用旧资料而扭曲当前要求。',
  '工具产生的结果必须如实说明；失败时明确失败，不声称已完成。',
].join('\n');

const VISITOR_MODE = Object.freeze({
  id: 'mode_mailbox_visitor',
  mode_key: 'mailbox_visitor',
  title: '访客慢速回信',
  description: '当前访客独立信箱的回信姿态。',
  prompt: '温柔、自然地承接当前访客；只使用这个 visitor_id 的内容，不暗示见过 owner 或其他访客。',
  enabled: true,
  scope: 'visitor',
  tool_allowlist: [],
  worldbook_scope: 'visitor',
  default_context_settings: {
    ambient: { time: true, calendar: false, tools: false, room: true, model: true },
    calendar_injection: 'off',
    worldbook_enabled: true,
    memory_facets_enabled: true,
    context_debug: false,
    context_budget: 4000,
    recent_message_turns: 4,
    soil_budget: 700,
    worldbook_limit: 4,
    memory_limit: 5,
  },
});

const PRIORITY_WEIGHT = Object.freeze({ critical: 4, high: 3, medium: 2, low: 1 });

export function estimateContextTokens(value) {
  let wide = 0;
  let narrow = 0;
  for (const character of String(value || '')) {
    if (/[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/u.test(character)) wide += 1;
    else narrow += 1;
  }
  return wide + Math.ceil(narrow / 4);
}

function messageTokens(message) {
  return estimateContextTokens(message?.content) + 4;
}

function requestContextSettings(raw = {}, stored = {}, modeDefaults = {}, profile = null) {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const modeValue = modeDefaults && typeof modeDefaults === 'object' && !Array.isArray(modeDefaults) ? modeDefaults : {};
  const baseline = normalizeContextSettings({
    ...stored,
    ...modeValue,
    ambient: { ...(stored.ambient || {}), ...(modeValue.ambient || {}) },
  });
  const ambient = {
    ...baseline.ambient,
    ...(value.context?.ambient || {}),
    ...(value.ambient || {}),
    ...(value.ambientTime == null ? {} : { time: value.ambientTime }),
    ...(value.ambientCalendar == null ? {} : { calendar: value.ambientCalendar }),
    ...(value.ambientTools == null ? {} : { tools: value.ambientTools }),
    ...(value.ambientRoom == null ? {} : { room: value.ambientRoom }),
    ...(value.ambientModel == null ? {} : { model: value.ambientModel }),
  };
  const normalized = normalizeContextSettings({
    ...baseline,
    ...value.context,
    ambient,
    calendar_injection: value.calendarInjection ?? value.calendar_injection ?? value.context?.calendar_injection ?? baseline.calendar_injection,
    worldbook_enabled: value.worldbookEnabled ?? value.worldbook_enabled ?? value.context?.worldbook_enabled ?? baseline.worldbook_enabled,
    memory_facets_enabled: value.memoryFacetsEnabled ?? value.memory_facets_enabled ?? value.context?.memory_facets_enabled ?? baseline.memory_facets_enabled,
    context_debug: value.contextDebug ?? value.context_debug ?? value.context?.context_debug ?? baseline.context_debug,
    context_budget: value.contextBudget ?? value.context_budget ?? value.context?.context_budget ?? baseline.context_budget,
    recent_message_turns: value.recentTurns ?? value.recent_message_turns ?? value.context?.recent_message_turns ?? baseline.recent_message_turns,
    soil_budget: value.soilBudget ?? value.soil_budget ?? value.context?.soil_budget ?? baseline.soil_budget,
    worldbook_limit: value.worldbookLimit ?? value.worldbook_limit ?? value.context?.worldbook_limit ?? baseline.worldbook_limit,
    memory_limit: value.memoryLimit ?? value.memory_limit ?? value.context?.memory_limit ?? baseline.memory_limit,
  }, baseline);
  if (profile?.surface === 'mailbox_visitor') {
    normalized.context_debug = false;
    normalized.calendar_injection = 'off';
    normalized.ambient.calendar = false;
    normalized.ambient.tools = false;
    normalized.soil_budget = Math.min(profile.soilPolicy.max, normalized.soil_budget);
    normalized.memory_limit = Math.min(profile.memoryFacetPolicy.maxEntries, normalized.memory_limit);
  }
  return normalized;
}

function memoryBlock(key, title, body, extra = {}) {
  return contextBlock({
    key,
    title,
    body,
    source: extra.source || 'coast_memory_d1',
    scope: extra.scope || 'current_conversation',
    priority: extra.priority || 'medium',
    freshness: extra.freshness || 'recent',
    confidence: extra.confidence || 'user_confirmed',
    use_hint: extra.use_hint || '在与当前输入相关时自然承接。',
    avoid_hint: extra.avoid_hint || '不要逐条复述，也不要压过当前输入。',
    trace: extra.trace || {},
  });
}

function worldbookBlock(entries, {
  key = 'worldbook',
  title = '海岸词典',
  scope = 'project',
} = {}) {
  return contextBlock({
    key,
    title,
    body: formatWorldbookContext(entries),
    source: 'coast_worldbook_entries',
    scope,
    priority: 'medium',
    freshness: 'recent',
    confidence: 'system_confirmed',
    use_hint: '解释本轮命中的固定术语与项目概念。',
    avoid_hint: '词典不是用户当前要求，也不是记忆库；不得用它自我触发。',
    trace: {
      entry_ids: entries.map((entry) => entry.id),
      match_count: entries.length,
      matched_sources: entries.map((entry) => ({ id: entry.id, matched_source: entry.matched_source })),
    },
  });
}

function facetsBlock(facets, scope = 'global') {
  return memoryBlock('memory_facets', '记忆球情境面', formatMemoryFacetContext(facets), {
    source: 'memory_entries:facet_policy',
    scope,
    trace: {
      entry_ids: facets.map((facet) => facet.entry_id),
      contradiction_entry_ids: facets.filter((facet) => facet.contradiction).map((facet) => facet.entry_id),
    },
    use_hint: '按当前情境使用同一条记忆最合适的一面。',
    avoid_hint: '旧构想不可当作已完成需求；冲突内容不可压过当前输入。',
  });
}

function toolGroups(tools) {
  const labels = new Set();
  for (const tool of tools) {
    const key = tool.tool_key;
    if (key.startsWith('calendar.')) labels.add('日历');
    else if (key.startsWith('memory.')) labels.add('记忆检索与待确认候选');
    else if (key.startsWith('daily.')) labels.add('日记/动态候选');
    else if (key.startsWith('dogtalk.')) labels.add('神秘狗话');
    else if (key.startsWith('mailbox.')) labels.add('信箱巡灯');
    else if (key.startsWith('radio.')) labels.add('无线电波');
    else if (key.startsWith('lighthouse.')) labels.add('灯塔来信');
  }
  return [...labels];
}

function toolsBlock(tools, modeKey) {
  if (!tools.length) return null;
  const groups = toolGroups(tools);
  const detailed = ['construction_review', 'code_helper'].includes(modeKey);
  const body = detailed
    ? `【本轮工具】\n可在确有需要时使用：${groups.join('、') || tools.length + ' 项海岸工具'}。已暴露键：${tools.map((tool) => tool.tool_key).join(', ')}。不要声称执行未执行的工具。`
    : `【本轮工具】\n可在确有需要时使用：${groups.join('、')}。不要声称执行未执行的工具。`;
  return contextBlock({
    key: 'tool_capabilities',
    title: '本轮工具能力',
    body,
    source: 'tool_registry:intersection',
    scope: 'current_runtime',
    priority: 'high',
    freshness: 'live',
    confidence: 'system_confirmed',
    use_hint: '只在当前任务确实需要时调用已列出工具。',
    avoid_hint: '没有列出的工具不可调用；不要声称执行了未执行的工具。',
    trace: { tool_keys: tools.map((tool) => tool.tool_key), compact: !detailed },
  });
}

function surfaceBlock(profile) {
  return contextBlock({
    key: 'surface_profile',
    title: `Surface Profile｜${profile.title}`,
    body: `【当前房间边界】\n${profile.modelInstructions}`,
    source: `surface_profile:${profile.surface}`,
    scope: profile.surface === 'mailbox_visitor' ? 'visitor' : 'current_runtime',
    priority: 'critical',
    freshness: 'live',
    confidence: 'system_confirmed',
    use_hint: '用它确定本轮房间身份、数据边界与禁止跨域。',
    avoid_hint: '不得用其他 surface 的私密内容补齐当前房间。',
    trace: {
      surface: profile.surface,
      owner_only: profile.ownerOnly,
      allowed_memory_scopes: profile.allowedMemoryScopes,
      allowed_soil_scopes: profile.allowedSoilScopes,
      allowed_worldbook_scopes: profile.allowedWorldbookScopes,
    },
  });
}

function cleanHistory(messages, recentTurns) {
  return (Array.isArray(messages) ? messages : [])
    .filter((message) => ['user', 'assistant'].includes(message?.role)
      && typeof message.content === 'string'
      && message.content.trim())
    .map((message) => ({
      role: message.role,
      content: message.content,
      ...(message.turn_id ? { turn_id: String(message.turn_id).slice(0, 180) } : {}),
      ...(message.source ? { source: String(message.source).slice(0, 80) } : {}),
    }))
    .slice(-Math.max(2, recentTurns * 2));
}

function contextSystemMessage(profile, manifest, blocks) {
  return {
    role: 'system',
    content: [BASE_SYSTEM_PROMPT, formatContextBlocks([manifest, ...blocks])].filter(Boolean).join('\n\n'),
    surface: profile.surface,
  };
}

function modeWithSurfaceTools(mode, profile) {
  return {
    ...mode,
    tool_allowlist: (mode.tool_allowlist || []).filter((toolKey) => surfaceAllowsTool(profile, toolKey)),
  };
}

async function modeAndState(db, profile, { conversationId, modeKey } = {}) {
  if (profile.surface === 'mailbox_visitor') {
    return { mode: VISITOR_MODE, settings: VISITOR_MODE.default_context_settings, scope_id: `visitor:${conversationId || 'mailbox'}` };
  }
  if (profile.surface === 'main_chat' || profile.surface === 'landing') {
    const state = await getContextState(db, { conversation_id: conversationId });
    const mode = modeKey ? await getModeCard(db, modeKey) : state.mode;
    return { ...state, mode: modeWithSurfaceTools(mode, profile) };
  }
  const mode = await getModeCard(db, modeKey || profile.defaultMode);
  return {
    mode: modeWithSurfaceTools(mode, profile),
    settings: {},
    scope_id: `${profile.surface}:${conversationId || 'default'}`,
  };
}

function mailboxHistory(records) {
  return (Array.isArray(records) ? records : []).map((message) => ({
    role: message.role === 'visitor' ? 'user' : message.role === 'myri' ? 'assistant' : 'assistant',
    content: message.content,
    turn_id: message.id,
    source: 'mailbox_visitor',
  }));
}

async function surfaceMemory(env, profile, {
  conversationId,
  visitorId,
  query,
  recentEntryIds,
  requestSettings,
  contextSettings,
  mode,
  recent,
  preview,
  authScope,
} = {}) {
  if (profile.surface === 'main_chat' || profile.surface === 'landing') {
    const memory = await buildMemoryContext(env, MEMORY_OWNER_ID, conversationId, query, {
      recent_entry_ids: recentEntryIds,
      mode: 'chat',
      mode_key: mode.mode_key,
      settings: { ...requestSettings, soilBudget: contextSettings.soil_budget, memoryLimit: contextSettings.memory_limit },
      conversation_turns: recent.filter((message) => message.role === 'user').length,
      record_recall: !preview,
    });
    return { memory, room: null, soil: { soil: memory.soil, contextSurface: profile.surface }, history: recent };
  }
  if (profile.surface === 'radio' || profile.surface === 'lighthouse') {
    const modelSurface = authScope?.actor === 'official_mcp' ? 'official_mcp' : profile.surface === 'radio' ? 'coast_api' : 'official_mcp';
    const room = await buildRoomMemoryContext(env, profile.surface, modelSurface, query, {
      settings: { ...requestSettings, soilBudget: contextSettings.soil_budget },
      mode: 'chat',
      mode_key: mode.mode_key,
      conversation_turns: recent.length,
      record_recall: !preview,
      consume_dogtalk: !preview,
    });
    return { memory: room.memory, room, soil: { sources: room.source_soils }, history: recent };
  }
  if (profile.surface === 'mailbox_visitor') {
    await currentMailboxVisitor(env.COAST_CHAT_DB, visitorId);
    const [soil, entries, storedMessages] = await Promise.all([
      readMailboxThoughtSoil(env.COAST_CHAT_DB, visitorId),
      listVisitorNotebook(env.COAST_CHAT_DB, visitorId),
      recent.length ? Promise.resolve([]) : mailboxMessages(env.COAST_CHAT_DB, visitorId),
    ]);
    const history = recent.length ? recent : cleanHistory(mailboxHistory(storedMessages), contextSettings.recent_message_turns);
    return {
      memory: {
        visitor_memories: entries.filter((entry) => entry.status === 'active' && !entry.archived),
        trace: { selected: entries.map((entry) => entry.id), vector_enabled: false, visitor_id: visitorId },
      },
      room: null,
      soil: { soil, contextSurface: 'mailbox_visitor' },
      history,
    };
  }
  return { memory: null, room: null, soil: null, history: recent };
}

function selectedEntries(memory) {
  return memory
    ? [
      'conversation_seeds', 'conversation_memories', 'conversation_pockets',
      'global_seeds', 'global_memories', 'global_pockets', 'visitor_memories',
    ].flatMap((key) => memory[key] || [])
    : [];
}

function recallText(memory, profile) {
  if (!memory) return '';
  if (profile.surface === 'mailbox_visitor') {
    const entries = memory.visitor_memories || [];
    if (!entries.length) return '';
    return [
      '【当前访客记事本｜已确认】',
      ...entries.slice(0, 5).map((entry) => `- ${entry.title || entry.life_core}｜${entry.life_core || entry.content || ''}`),
      '只能用于当前访客房；不得扩展或写入 owner 记忆。',
    ].join('\n');
  }
  const text = formatRecallMemoryContext(memory);
  return ['radio', 'lighthouse'].includes(profile.surface)
    ? text.replace(/当前窗口/g, '当前房间').replace(/跨窗口可用/g, '总库低频可用')
    : text;
}

function budgetAssembledContext({
  profile,
  blocks,
  makeManifest,
  messages,
  budget,
  recentTurns,
  worldbook,
  facets,
  soilRender,
}) {
  const activeBlocks = blocks.filter(Boolean);
  const keptMessages = messages.map((message, index) => ({ message, index }));
  const currentUserIndex = keptMessages.findLastIndex((item) => item.message.role === 'user');
  const targetMessages = Math.min(keptMessages.length, Math.max(profile.recentMessagesMinimum, profile.recentMessagesTarget));
  const minimumMessages = Math.min(keptMessages.length, profile.recentMessagesMinimum);
  const trimmed = {
    memory_facets: 0,
    worldbook: 0,
    assistant_messages: 0,
    user_messages: 0,
    context_blocks: [],
  };
  const trimReasonByBlock = {};
  let extraCompression = false;

  const removeBlock = (key, reason) => {
    const index = activeBlocks.findIndex((block) => block.key === key);
    if (index < 0) return false;
    activeBlocks.splice(index, 1);
    trimmed.context_blocks.push(key);
    trimReasonByBlock[key] = reason;
    return true;
  };
  const removeOldestMessage = () => {
    const position = keptMessages.findIndex((item) => item.index !== currentUserIndex);
    if (position < 0) return false;
    const [removed] = keptMessages.splice(position, 1);
    if (removed.message.role === 'assistant') trimmed.assistant_messages += 1;
    else trimmed.user_messages += 1;
    return true;
  };
  const refreshWorldbookBlocks = () => {
    for (const definition of [
      { key: 'worldbook', position: 'before_memory', title: '海岸词典' },
      { key: 'worldbook_after_memory', position: 'after_memory', title: '海岸词典｜记忆后' },
    ]) {
      const index = activeBlocks.findIndex((block) => block.key === definition.key);
      if (index < 0) continue;
      const next = worldbookBlock(
        worldbook.filter((entry) => (entry.inject_position || 'before_memory') === definition.position),
        { ...definition, scope: profile.surface === 'mailbox_visitor' ? 'visitor' : 'project' },
      );
      if (next) activeBlocks[index] = next;
      else activeBlocks.splice(index, 1);
    }
  };
  const rebuild = () => {
    const manifest = makeManifest(activeBlocks);
    const system = contextSystemMessage(profile, manifest, activeBlocks);
    const result = [system, ...keptMessages.map((item) => item.message)];
    return { manifest, system, result, total: result.reduce((sum, message) => sum + messageTokens(message), 0) };
  };

  let assembled = rebuild();
  const soilIndex = () => activeBlocks.findIndex((block) => block.key === 'thinking_soil');
  if (assembled.total > budget && soilIndex() >= 0 && soilRender.compact_text && soilRender.compact_text !== soilRender.text) {
    const index = soilIndex();
    activeBlocks[index] = { ...activeBlocks[index], body: soilRender.compact_text, trace: { ...activeBlocks[index].trace, budget_compacted: true } };
    trimReasonByBlock.thinking_soil = 'compressed_before_recent_messages';
    extraCompression = true;
    assembled = rebuild();
  }
  while (assembled.total > budget && worldbook.length) {
    worldbook.pop();
    trimmed.worldbook += 1;
    trimReasonByBlock.worldbook = 'lower_priority_worldbook';
    refreshWorldbookBlocks();
    assembled = rebuild();
  }
  while (assembled.total > budget && facets.length) {
    facets.pop();
    trimmed.memory_facets += 1;
    trimReasonByBlock.memory_facets = 'lower_relevance_memory_facet';
    const index = activeBlocks.findIndex((block) => block.key === 'memory_facets');
    if (index >= 0) {
      const next = facetsBlock(facets, profile.surface === 'mailbox_visitor' ? 'visitor' : ['radio', 'lighthouse'].includes(profile.surface) ? 'room' : 'global');
      if (next) activeBlocks[index] = next;
      else activeBlocks.splice(index, 1);
    }
    assembled = rebuild();
  }
  for (const key of ['dogtalk', 'memory_recall', 'cross_surface']) {
    if (assembled.total <= budget) break;
    if (removeBlock(key, 'optional_context_before_recent_messages')) assembled = rebuild();
  }
  while (assembled.total > budget && keptMessages.length > targetMessages && removeOldestMessage()) assembled = rebuild();
  for (const key of ['thinking_soil', 'worldbook_after_memory', 'worldbook']) {
    if (assembled.total <= budget) break;
    if (removeBlock(key, 'soft_context_after_compression')) assembled = rebuild();
  }
  while (assembled.total > budget && keptMessages.length > minimumMessages && removeOldestMessage()) assembled = rebuild();
  if (assembled.total > budget) {
    const removable = activeBlocks
      .filter((block) => !['surface_profile', 'ambient_context', 'mode_card', 'tool_capabilities'].includes(block.key))
      .sort((left, right) => (PRIORITY_WEIGHT[left.priority] || 0) - (PRIORITY_WEIGHT[right.priority] || 0));
    for (const block of removable) {
      if (assembled.total <= budget) break;
      if (removeBlock(block.key, 'priority_budget_trim')) assembled = rebuild();
    }
  }
  for (const key of ['tool_capabilities', 'ambient_context', 'mode_card', 'surface_profile']) {
    if (assembled.total <= budget) break;
    if (removeBlock(key, 'essential_block_minimized_last')) assembled = rebuild();
  }
  while (assembled.total > budget && removeOldestMessage()) assembled = rebuild();
  return {
    modelMessages: assembled.result,
    manifest: assembled.manifest,
    blocks: activeBlocks,
    worldbook,
    facets,
    trace: {
      mode: 'estimated_tokens',
      budget,
      recent_turns: recentTurns,
      estimated_tokens: assembled.total,
      current_user_preserved: currentUserIndex >= 0 && keptMessages.some((item) => item.index === currentUserIndex),
      over_budget: assembled.total > budget,
      compression_applied: Boolean(soilRender.original_length > soilRender.model_length || extraCompression),
      soil_original_length: soilRender.original_length || 0,
      soil_model_length: soilIndex() >= 0 ? activeBlocks[soilIndex()]?.body?.length || 0 : 0,
      recent_messages_target: Math.ceil(targetMessages / 2),
      recent_message_count_target: targetMessages,
      recent_messages_kept: keptMessages.length,
      trim_reason_by_block: trimReasonByBlock,
      stale_block: activeBlocks.some((block) => block.freshness === 'stale') || soilRender.stale,
      trimmed,
      kept_message_count: keptMessages.length,
      block_order: ['base_system', 'context_manifest', ...activeBlocks.map((block) => block.key), 'recent_messages', 'current_user'],
    },
  };
}

export async function assembleContextForSurface(env, {
  surface,
  conversationId,
  roomId,
  visitorId,
  sourceTurnId = null,
  messages = [],
  lastUser,
  settings: requestSettings = {},
  localDate,
  localDateTime,
  modeKey,
  recentEntryIds = [],
  authScope = null,
  model = '',
  permission: requestedPermission,
  preview = false,
  explicit_full_context: explicitFullContext = false,
} = {}) {
  const profile = assertSurfacePermission(getSurfaceProfile(surface), {
    permission: requestedPermission || (surface === 'mailbox_visitor' ? 'visitor' : 'owner'),
    visitorId,
  });
  const permission = requestedPermission || (profile.surface === 'mailbox_visitor' ? 'visitor' : 'owner');
  const db = env.COAST_CHAT_DB;
  const state = await modeAndState(db, profile, { conversationId, modeKey });
  const mode = state.mode;
  const contextSettings = requestContextSettings(requestSettings, state.settings, mode.default_context_settings, profile);
  const initialRecent = cleanHistory(messages, contextSettings.recent_message_turns);
  const query = String(lastUser?.content ?? lastUser ?? initialRecent.findLast((message) => message.role === 'user')?.content ?? '');
  const intentSummary = buildIntentSummary({ surface, mode, lastUser: query, recentMessages: initialRecent.slice(0, -1) });
  const memoryResult = await surfaceMemory(env, profile, {
    conversationId,
    visitorId,
    query,
    recentEntryIds,
    requestSettings,
    contextSettings,
    mode,
    recent: initialRecent,
    preview,
    authScope,
  });
  const recent = memoryResult.history;
  const toolSelection = resolveToolSelection({ permission, surface, mode, authScope });
  const registeredTools = toolSelection.tools;
  const modelTools = toolSelection.modelTools;

  const [worldbook, crossSurface, directDogtalk] = await Promise.all([
    contextSettings.worldbook_enabled && profile.worldbookPolicy.enabled
      ? matchWorldbook(db, {
        input: query,
        messages: recent.slice(0, -1),
        surface,
        worldbook_scope: mode.worldbook_scope,
        allowed_scopes: profile.allowedWorldbookScopes,
        limit: Math.min(contextSettings.worldbook_limit, profile.worldbookPolicy.maxEntries),
      })
      : Promise.resolve([]),
    profile.allowedMemoryScopes.includes('cross_surface')
      ? buildCrossSurfaceContext(db, query)
      : Promise.resolve({ context: '', selected: [], triggered: false }),
    ['main_chat', 'landing'].includes(surface)
      ? dogtalkContext(db, { room_scope: 'conversation', conversation_id: conversationId }, query, {
        consume_direct: !preview,
      }).catch((error) => ({ context: '', selected: false, error: String(error?.message || error).slice(0, 200) }))
      : Promise.resolve(memoryResult.room?.dogtalk || { context: '', selected: false }),
  ]);

  const ambient = await buildAmbientContext(env, {
    localDate,
    localDateTime,
    surface,
    profile,
    conversationId: conversationId || roomId || visitorId,
    model,
    mode,
    settings: contextSettings,
    tools: registeredTools,
    permission,
  });
  const soilRender = profile.soilPolicy.enabled
    ? renderSoilForModel(memoryResult.soil, {
      surface,
      modeKey: mode.mode_key,
      explicitContinuation: isExplicitContinuation(query),
      explicitFullContext,
      budget: Math.min(contextSettings.soil_budget, profile.soilPolicy.max || contextSettings.soil_budget),
      lastUser: query,
      recentMessages: recent,
      latestTurnId: sourceTurnId || recent.at(-1)?.turn_id,
    })
    : { text: '', compact_text: '', full_text: '', original_length: 0, model_length: 0, compression_ratio: 0, traces: [], stale: false };
  const fullSoil = profile.inspectorAllowed
    ? renderSoilForInspector(memoryResult.soil, { surface })
    : '';
  const memory = memoryResult.memory;
  const facetScope = surface === 'mailbox_visitor' ? 'visitor' : ['radio', 'lighthouse'].includes(surface) ? 'room' : '';
  const facets = contextSettings.memory_facets_enabled && profile.memoryFacetPolicy.enabled
    ? buildMemoryFacets(memory, mode.mode_key, null, {
      allowedScopes: surface === 'mailbox_visitor' ? ['visitor'] : null,
      scopeOverride: facetScope,
      surface,
      limit: Math.min(contextSettings.memory_limit, profile.memoryFacetPolicy.maxEntries),
    })
    : [];
  const selectedMemoryEntries = selectedEntries(memory);
  const memoryContradictions = selectedMemoryEntries.filter((entry) => entry.contradiction_note);
  const worldbookBefore = worldbook.filter((entry) => (entry.inject_position || 'before_memory') === 'before_memory');
  const worldbookAfter = worldbook.filter((entry) => entry.inject_position === 'after_memory');
  const soilFreshness = soilRender.traces.some((trace) => trace.freshness === 'live')
    ? 'live'
    : soilRender.traces.some((trace) => trace.freshness === 'recent')
      ? 'recent'
      : soilRender.traces[0]?.freshness || 'archived';
  const recall = recallText(memory, profile);
  const dogtalk = memoryResult.room?.dogtalk || directDogtalk;
  const blocks = [
    surfaceBlock(profile),
    ambient.block,
    modeContextBlock(mode),
    soilRender.text && memoryBlock('thinking_soil', '思维壤｜模型压缩版', soilRender.text, {
      source: surface === 'mailbox_visitor'
        ? `mailbox_thinking_notes:${visitorId}`
        : ['radio', 'lighthouse'].includes(surface)
          ? `${surface}_room_soils`
          : `conversation_soils:${conversationId}`,
      scope: surface === 'mailbox_visitor' ? 'visitor' : ['radio', 'lighthouse'].includes(surface) ? surface : 'current_conversation',
      freshness: soilFreshness,
      use_hint: '承接当前房间正在走的方向，不逐条复述。',
      trace: {
        conversation_id: conversationId || null,
        room_id: roomId || null,
        visitor_id: surface === 'mailbox_visitor' ? visitorId : null,
        soil_original_length: soilRender.original_length,
        soil_model_length: soilRender.model_length,
        soil_compression_ratio: soilRender.compression_ratio,
        freshness: soilRender.traces,
      },
    }),
    worldbookBlock(worldbookBefore, { scope: surface === 'mailbox_visitor' ? 'visitor' : 'project' }),
    facetsBlock(facets, facetScope || 'global'),
    recall && memoryBlock('memory_recall', surface === 'mailbox_visitor' ? '访客记事召回' : '普通记忆召回', recall, {
      source: surface === 'mailbox_visitor' ? `visitor_notebook:${visitorId}` : ['radio', 'lighthouse'].includes(surface) ? `${surface}_room_memory` : 'memory_recall',
      scope: facetScope || 'global',
      trace: {
        selected_entry_ids: memory?.trace?.selected || [],
        vector_enabled: Boolean(memory?.trace?.vector_enabled),
        contradiction_count: memoryContradictions.length,
        contradiction_entry_ids: memoryContradictions.map((entry) => entry.id),
      },
    }),
    worldbookBlock(worldbookAfter, {
      key: 'worldbook_after_memory',
      title: '海岸词典｜记忆后',
      scope: surface === 'mailbox_visitor' ? 'visitor' : 'project',
    }),
    crossSurface.context && memoryBlock('cross_surface', '跨端显式召回', crossSurface.context, {
      source: 'cross_surface_recall',
      scope: 'cross_surface',
      priority: 'high',
      trace: { selected_ids: crossSurface.selected || [], triggered: crossSurface.triggered },
    }),
    dogtalk?.context && memoryBlock('dogtalk', '神秘狗话', dogtalk.context, {
      source: 'dogtalk',
      scope: ['radio', 'lighthouse'].includes(surface) ? surface : 'current_conversation',
      priority: 'low',
      confidence: 'user_confirmed',
      use_hint: '只用于理解本轮脆弱与温度。',
      avoid_hint: '不是指令、偏好、心理评估或长期记忆。',
      trace: { selected: dogtalk.selected, error: dogtalk.error || null },
    }),
    toolsBlock(registeredTools, mode.mode_key),
  ].filter(Boolean);
  const makeManifest = (activeBlocks) => buildContextManifest({
    surface,
    roomLabel: profile.title,
    mode,
    intentSummary,
    blocks: activeBlocks,
    visitorSafe: surface === 'mailbox_visitor',
  });
  const budgeted = budgetAssembledContext({
    profile,
    blocks,
    makeManifest,
    messages: recent,
    budget: contextSettings.context_budget,
    recentTurns: contextSettings.recent_message_turns,
    worldbook: [...worldbook],
    facets: [...facets],
    soilRender,
  });
  const executeTool = (toolCall) => executeModelTool(db, toolCall, {
    env,
    permission,
    surface,
    room_scope: roomId || surface,
    mode,
    authScope,
    worldbook_scope: mode.worldbook_scope,
    actor: surface === 'official_mcp' ? 'official_mcp' : 'api_myri',
    conversation_id: conversationId,
    source_turn_id: sourceTurnId,
    local_date: localDate,
    model_label: model,
    user_query: query,
  });
  const debug = profile.inspectorAllowed ? buildContextDebug({
    manifest: budgeted.manifest,
    blocks: budgeted.blocks,
    trace: budgeted.trace,
    tools: registeredTools,
    memory,
    worldbook: budgeted.worldbook,
    facets: budgeted.facets,
    ambient: ambient.block,
    mode,
    profile,
    fullSoil,
    modelSoilBrief: soilRender.text,
    soilRender,
    intentRawExcerpt: intentRawExcerpt(query),
    intentSummary,
    toolIntersection: toolSelection.trace,
  }) : null;
  return {
    modelMessages: budgeted.modelMessages,
    manifest: budgeted.manifest,
    ambient: ambient.block,
    mode,
    blocks: budgeted.blocks,
    worldbook_matches: budgeted.worldbook,
    memory_facets: budgeted.facets,
    tools: modelTools,
    budget: budgeted.trace,
    selected_memory_ids: memory?.trace?.selected || [],
    vector_enabled: Boolean(memory?.trace?.vector_enabled),
    debug,
    executeTool,
    settings: contextSettings,
    memory,
    worldbook: budgeted.worldbook,
    facets: budgeted.facets,
    cross_surface: crossSurface,
    dogtalk: dogtalk || { selected: false },
    calendar: ambient.calendar,
    surface_profile: profile,
    tool_registry: registeredTools,
    tool_intersection: toolSelection.trace,
    trace: budgeted.trace,
  };
}

export function budgetContextMessages(messages, softContext = '', rawSettings = {}) {
  const budget = Math.min(48000, Math.max(256, Number(rawSettings.contextBudget) || 6000));
  const recentTurns = Math.min(40, Math.max(1, Number(rawSettings.recentTurns) || 8));
  const source = cleanHistory(messages, recentTurns);
  const lastUserIndex = source.findLastIndex((message) => message.role === 'user');
  const kept = source.map((message, index) => ({ message, index }));
  let include = Boolean(String(softContext || '').trim());
  const trimmed = { assistants: 0, users: 0, soft_context: false };
  const total = () => kept.reduce((sum, item) => sum + messageTokens(item.message), 0)
    + (include ? messageTokens({ content: softContext }) : 0);
  const remove = (role) => {
    const index = kept.findIndex((item) => item.message.role === role && !(role === 'user' && item.index === lastUserIndex));
    if (index < 0) return false;
    kept.splice(index, 1);
    return true;
  };
  while (total() > budget && remove('assistant')) trimmed.assistants += 1;
  while (total() > budget && remove('user')) trimmed.users += 1;
  if (total() > budget && include) { include = false; trimmed.soft_context = true; }
  const result = kept.map((item) => item.message);
  if (include) result.unshift({ role: 'system', content: String(softContext) });
  return {
    messages: result,
    trace: {
      mode: 'estimated_tokens', budget, estimated_tokens: total(), recent_turns: recentTurns,
      current_user_preserved: kept.some((item) => item.index === lastUserIndex),
      over_budget: total() > budget, trimmed,
    },
  };
}

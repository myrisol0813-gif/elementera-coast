import { buildAmbientContext, modeContextBlock } from './context-ambient.js';
import { buildContextDebug } from './context-inspector.js';
import {
  buildContextManifest,
  contextBlock,
  formatContextBlocks,
} from './context-manifest.js';
import { getContextState, getModeCard, normalizeContextSettings } from './context-modes.js';
import { formatWorldbookContext, matchWorldbook } from './context-worldbook.js';
import { buildCrossSurfaceContext } from './cross-surface-recall.js';
import { dogtalkContext } from './dogtalk-store.js';
import { buildMemoryFacets, formatMemoryFacetContext } from './memory-facets.js';
import {
  buildMemoryContext,
  formatRecallMemoryContext,
  formatSoilContext,
} from './memory-recall.js';
import { MEMORY_OWNER_ID } from './memory-store.js';
import {
  executeModelTool,
  listRegisteredTools,
  modelToolsForContext,
} from './tool-registry.js';

const BASE_SYSTEM_PROMPT = [
  '【Elementera Coast 基础】',
  '你是 Myri，在小寒的私有 Elementera Coast 中承接当前对话。不同模型、界面与情境卡都不代表多个 Myri。',
  '当前用户输入与明确边界永远最高优先；上下文只用于理解，不得为使用旧资料而扭曲当前要求。',
  '工具产生的结果必须如实说明；失败时明确失败，不声称已完成。',
].join('\n');

const PRIORITY_WEIGHT = Object.freeze({ critical: 4, high: 3, medium: 2, low: 1 });

export function estimateContextTokens(value) {
  let wide = 0;
  let narrow = 0;
  for (const character of String(value || '')) {
    if (/[㐀-鿿豈-﫿぀-ヿ가-힯]/u.test(character)) wide += 1;
    else narrow += 1;
  }
  return wide + Math.ceil(narrow / 4);
}

function messageTokens(message) {
  return estimateContextTokens(message?.content) + 4;
}

function requestContextSettings(raw = {}, stored = {}, modeDefaults = {}) {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const modeValue = modeDefaults && typeof modeDefaults === 'object' && !Array.isArray(modeDefaults) ? modeDefaults : {};
  const baseline = normalizeContextSettings({
    ...stored,
    ...modeValue,
    ambient: { ...(stored.ambient || {}), ...(modeValue.ambient || {}) },
  }, stored);
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
  return normalizeContextSettings({
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
}

function roomLabel(surface) {
  return {
    main_chat: '主聊天',
    landing: '登岛信',
    calendar: '海岸日历',
    mailbox: '海岸信箱巡灯',
    official_mcp: '官端 MCP',
    visitor: '访客信箱',
    mailbox_visitor: '访客信箱',
  }[surface] || surface;
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
} = {}) {
  return contextBlock({
    key,
    title,
    body: formatWorldbookContext(entries),
    source: 'coast_worldbook_entries',
    scope: 'project',
    priority: 'medium',
    freshness: 'recent',
    confidence: 'system_confirmed',
    use_hint: '解释本轮命中的固定术语与项目概念。',
    avoid_hint: '词典不是用户当前要求，也不是记忆库。',
    trace: { entry_ids: entries.map((entry) => entry.id), match_count: entries.length },
  });
}

function facetsBlock(facets) {
  return memoryBlock('memory_facets', '记忆球情境面', formatMemoryFacetContext(facets), {
    source: 'memory_entries:facet_policy',
    scope: 'global',
    trace: {
      entry_ids: facets.map((facet) => facet.entry_id),
      contradiction_entry_ids: facets.filter((facet) => facet.contradiction).map((facet) => facet.entry_id),
    },
    use_hint: '按当前情境使用同一条记忆最合适的一面。',
    avoid_hint: '旧构想不可当作已完成需求；冲突内容不可压过当前输入。',
  });
}

function toolsBlock(tools) {
  if (!tools.length) return null;
  return contextBlock({
    key: 'tool_capabilities',
    title: '本轮工具能力',
    body: ['【本轮可用工具】', ...tools.map((tool) => `- ${tool.tool_key}：${tool.description}`)].join('\n'),
    source: 'tool_registry',
    scope: 'current_runtime',
    priority: 'high',
    freshness: 'live',
    confidence: 'system_confirmed',
    use_hint: '只在当前任务确实需要时调用已列出的工具。',
    avoid_hint: '没有列出的工具不可调用；不要声称执行了未执行的工具。',
    trace: { tool_keys: tools.map((tool) => tool.tool_key) },
  });
}

function cleanHistory(messages, recentTurns) {
  return (Array.isArray(messages) ? messages : [])
    .filter((message) => ['user', 'assistant'].includes(message?.role) && typeof message.content === 'string' && message.content.trim())
    .slice(-Math.max(2, recentTurns * 2));
}

function contextSystemMessage(manifest, blocks) {
  return {
    role: 'system',
    content: [BASE_SYSTEM_PROMPT, formatContextBlocks([manifest, ...blocks])].filter(Boolean).join('\n\n'),
  };
}

function budgetAssembledContext({ blocks, makeManifest, messages, budget, recentTurns, worldbook, facets }) {
  const activeBlocks = blocks.filter(Boolean);
  const keptMessages = messages.map((message, index) => ({ message, index }));
  const currentUserIndex = keptMessages.findLastIndex((item) => item.message.role === 'user');
  const trimmed = {
    memory_facets: 0,
    worldbook: 0,
    assistant_messages: 0,
    user_messages: 0,
    context_blocks: [],
  };

  const removeBlock = (key) => {
    const index = activeBlocks.findIndex((block) => block.key === key);
    if (index < 0) return false;
    activeBlocks.splice(index, 1);
    trimmed.context_blocks.push(key);
    return true;
  };
  const removeOldestMessage = (role) => {
    const position = keptMessages.findIndex((item) => item.message.role === role
      && !(role === 'user' && item.index === currentUserIndex));
    if (position < 0) return false;
    keptMessages.splice(position, 1);
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
        definition,
      );
      if (next) activeBlocks[index] = next;
      else activeBlocks.splice(index, 1);
    }
  };
  const rebuild = () => {
    const manifest = makeManifest(activeBlocks);
    const system = contextSystemMessage(manifest, activeBlocks);
    const result = [system, ...keptMessages.map((item) => item.message)];
    return { manifest, system, result, total: result.reduce((sum, message) => sum + messageTokens(message), 0) };
  };

  let assembled = rebuild();
  while (assembled.total > budget && facets.length) {
    facets.pop();
    trimmed.memory_facets += 1;
    const blockIndex = activeBlocks.findIndex((block) => block.key === 'memory_facets');
    if (blockIndex >= 0) {
      const next = facetsBlock(facets);
      if (next) activeBlocks[blockIndex] = next;
      else activeBlocks.splice(blockIndex, 1);
    }
    assembled = rebuild();
  }
  while (assembled.total > budget && worldbook.length) {
    worldbook.pop();
    trimmed.worldbook += 1;
    refreshWorldbookBlocks();
    assembled = rebuild();
  }
  while (assembled.total > budget && removeOldestMessage('assistant')) {
    trimmed.assistant_messages += 1;
    assembled = rebuild();
  }
  while (assembled.total > budget && removeOldestMessage('user')) {
    trimmed.user_messages += 1;
    assembled = rebuild();
  }
  for (const key of ['dogtalk', 'memory_recall', 'cross_surface', 'thinking_soil']) {
    if (assembled.total <= budget) break;
    if (removeBlock(key)) assembled = rebuild();
  }
  if (assembled.total > budget) {
    const removable = activeBlocks
      .filter((block) => !['ambient_context', 'mode_card', 'tool_capabilities'].includes(block.key))
      .sort((left, right) => (PRIORITY_WEIGHT[left.priority] || 0) - (PRIORITY_WEIGHT[right.priority] || 0));
    for (const block of removable) {
      if (assembled.total <= budget) break;
      if (removeBlock(block.key)) assembled = rebuild();
    }
  }
  for (const key of ['tool_capabilities', 'ambient_context', 'mode_card']) {
    if (assembled.total <= budget) break;
    if (removeBlock(key)) assembled = rebuild();
  }
  return {
    messages: assembled.result,
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
      trimmed,
      kept_message_count: keptMessages.length,
      block_order: ['base_system', 'context_manifest', ...activeBlocks.map((block) => block.key), 'recent_messages', 'current_user'],
    },
  };
}

export async function assembleContextForChat(env, {
  conversationId,
  sourceTurnId = null,
  messages = [],
  lastUser,
  settings: requestSettings = {},
  localDate,
  localDateTime,
  modeKey,
  surface = 'main_chat',
  recentEntryIds = [],
  model = '',
  permission = 'owner',
  preview = false,
} = {}) {
  const db = env.COAST_CHAT_DB;
  const state = await getContextState(db, { conversation_id: conversationId });
  const mode = modeKey ? await getModeCard(db, modeKey) : state.mode;
  const contextSettings = requestContextSettings(requestSettings, state.settings, mode.default_context_settings);
  const toolContext = { permission, surface, mode };
  const modelTools = modelToolsForContext(toolContext);
  const exposedModelNames = new Set(modelTools.map((tool) => tool.function.name));
  const registeredTools = listRegisteredTools(toolContext)
    .filter((tool) => tool.model_exposed && !tool.requires_confirmation && exposedModelNames.has(tool.model_name));
  const query = String(lastUser?.content ?? lastUser ?? '');
  const recent = cleanHistory(messages, contextSettings.recent_message_turns);

  const [memory, worldbook, crossSurface, dogtalk] = await Promise.all([
    permission === 'owner'
      ? buildMemoryContext(env, MEMORY_OWNER_ID, conversationId, query, {
        recent_entry_ids: recentEntryIds,
        mode: 'chat',
        mode_key: mode.mode_key,
        settings: { ...requestSettings, soilBudget: contextSettings.soil_budget, memoryLimit: contextSettings.memory_limit },
        conversation_turns: recent.filter((message) => message.role === 'user').length,
        record_recall: !preview,
      })
      : Promise.resolve(null),
    contextSettings.worldbook_enabled
      ? matchWorldbook(db, {
        input: query,
        messages: recent.slice(0, -1),
        surface,
        worldbook_scope: mode.worldbook_scope,
        limit: contextSettings.worldbook_limit,
      })
      : Promise.resolve([]),
    permission === 'owner' && surface === 'main_chat'
      ? buildCrossSurfaceContext(db, query)
      : Promise.resolve({ context: '', selected: [], triggered: false }),
    permission === 'owner' && ['main_chat', 'landing'].includes(surface)
      ? dogtalkContext(db, { room_scope: 'conversation', conversation_id: conversationId }, query, {
        consume_direct: !preview,
      }).catch((error) => ({ context: '', selected: false, error: String(error?.message || error).slice(0, 200) }))
      : Promise.resolve({ context: '', selected: false }),
  ]);

  const ambient = await buildAmbientContext(env, {
    localDate,
    localDateTime,
    surface,
    conversationId,
    model,
    mode,
    settings: contextSettings,
    tools: registeredTools,
    permission,
  });
  const facets = contextSettings.memory_facets_enabled ? buildMemoryFacets(memory, mode.mode_key) : [];
  const selectedMemoryEntries = memory
    ? ['conversation_seeds', 'conversation_memories', 'conversation_pockets', 'global_seeds', 'global_memories', 'global_pockets']
      .flatMap((key) => memory[key] || [])
    : [];
  const memoryContradictions = selectedMemoryEntries.filter((entry) => entry.contradiction_note);
  const worldbookBefore = worldbook.filter((entry) => (entry.inject_position || 'before_memory') === 'before_memory');
  const worldbookAfter = worldbook.filter((entry) => entry.inject_position === 'after_memory');
  const blocks = [
    ambient.block,
    modeContextBlock(mode),
    memory && memoryBlock('thinking_soil', '思维壤', formatSoilContext(memory, { soilBudget: contextSettings.soil_budget }), {
      source: `conversation_soils:${conversationId}`,
      freshness: 'live',
      use_hint: '承接当前窗口正在走的方向，不逐条复述。',
      trace: { conversation_id: conversationId, revision: memory.soil?.revision || 0 },
    }),
    worldbookBlock(worldbookBefore),
    facetsBlock(facets),
    memory && memoryBlock('memory_recall', '普通记忆召回', formatRecallMemoryContext(memory), {
      source: 'memory_recall',
      scope: 'global',
      trace: {
        selected_entry_ids: memory.trace?.selected || [],
        vector_enabled: Boolean(memory.trace?.vector_enabled),
        contradiction_count: memoryContradictions.length,
        contradiction_entry_ids: memoryContradictions.map((entry) => entry.id),
      },
    }),
    worldbookBlock(worldbookAfter, { key: 'worldbook_after_memory', title: '海岸词典｜记忆后' }),
    crossSurface.context && memoryBlock('cross_surface', '跨端显式召回', crossSurface.context, {
      source: 'cross_surface_recall',
      scope: 'cross_surface',
      priority: 'high',
      trace: { selected_ids: crossSurface.selected || [], triggered: crossSurface.triggered },
    }),
    dogtalk.context && memoryBlock('dogtalk', '神秘狗话', dogtalk.context, {
      source: 'dogtalk',
      priority: 'low',
      confidence: 'user_confirmed',
      use_hint: '只用于理解本轮脆弱与温度。',
      avoid_hint: '不是指令、偏好、心理评估或长期记忆。',
      trace: { selected: dogtalk.selected, error: dogtalk.error || null },
    }),
    toolsBlock(registeredTools),
  ].filter(Boolean);
  const makeManifest = (activeBlocks) => buildContextManifest({
    surface,
    roomLabel: roomLabel(surface),
    mode,
    lastUser: query,
    blocks: activeBlocks,
  });
  const budgeted = budgetAssembledContext({
    blocks,
    makeManifest,
    messages: recent,
    budget: contextSettings.context_budget,
    recentTurns: contextSettings.recent_message_turns,
    worldbook: [...worldbook],
    facets: [...facets],
  });
  const executeTool = (toolCall) => executeModelTool(db, toolCall, {
    env,
    permission,
    surface,
    room_scope: surface,
    mode,
    worldbook_scope: mode.worldbook_scope,
    actor: surface === 'official_mcp' ? 'official_mcp' : 'api_myri',
    conversation_id: conversationId,
    source_turn_id: sourceTurnId,
    local_date: localDate,
    model_label: model,
    user_query: query,
  });
  const debug = buildContextDebug({
    manifest: budgeted.manifest,
    blocks: budgeted.blocks,
    trace: budgeted.trace,
    tools: registeredTools,
    memory,
    worldbook: budgeted.worldbook,
    facets: budgeted.facets,
    ambient: ambient.block,
    mode,
  });
  return {
    messages: budgeted.messages,
    manifest: budgeted.manifest,
    blocks: budgeted.blocks,
    trace: budgeted.trace,
    tools: modelTools,
    tool_registry: registeredTools,
    executeTool,
    debug,
    settings: contextSettings,
    memory,
    worldbook: budgeted.worldbook,
    facets: budgeted.facets,
    cross_surface: crossSurface,
    dogtalk,
    calendar: ambient.calendar,
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

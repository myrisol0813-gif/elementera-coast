import { CALENDAR_MCP_DEFINITIONS } from './calendar-mcp-tools.js';
import { assembleContextForSurface } from './context-assembler.js';
import { executeRegisteredTool } from './tool-registry.js';
import { officialMcpIdentity } from './coast-identity.js';
import {
  FRIEND_MYRISOL_PROMPT_ID,
  FRIEND_MYRISOL_PROMPT_V1,
} from './friend-myrisol-prompt.js';
import { McpAuthError, mcpAuthChallenge, requireMcpAuth } from './mcp-auth.js';

const VERSION = '1.7.1';
const PRIVATE_RECORD_SCHEMA = Object.freeze({ type: 'object', additionalProperties: true });

function objectSchema(properties = {}, required = []) {
  return {
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  };
}

const MODEL_IDENTITY_PROPERTIES = Object.freeze({
  model_label: {
    type: 'string',
    minLength: 1,
    maxLength: 120,
    description: 'The official ChatGPT model name or model display name, for example 5.6 Thinking or o3.',
  },
  model_nickname: {
    type: 'string',
    maxLength: 60,
    description: 'Optional nickname such as 回潮 or 雾灯.',
  },
  source_conversation_id: { type: 'string', maxLength: 200 },
  source_turn_id: { type: 'string', maxLength: 200 },
  tool_call_id: {
    type: 'string',
    maxLength: 240,
    description: 'Stable caller-provided idempotency key when one is available.',
  },
});

const ROOM_MEMORY_PROPERTIES = Object.freeze({
  current_text: { type: 'string', maxLength: 4000 },
  hand_seeds: {
    type: 'array',
    maxItems: 7,
    items: PRIVATE_RECORD_SCHEMA,
  },
  do_not_repeat: { type: 'string', maxLength: 4000 },
  pocket_candidates: {
    type: 'array',
    maxItems: 7,
    items: PRIVATE_RECORD_SCHEMA,
  },
});
const ROOM_MEMORY_REQUIRED = Object.freeze([
  'current_text',
  'hand_seeds',
  'do_not_repeat',
  'pocket_candidates',
]);
const ROOM_MEMORY_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  properties: ROOM_MEMORY_PROPERTIES,
  required: ROOM_MEMORY_REQUIRED,
});

function toolMeta(scopes, invoking, invoked) {
  return {
    securitySchemes: [{ type: 'oauth2', scopes }],
    'openai/toolInvocation/invoking': invoking,
    'openai/toolInvocation/invoked': invoked,
  };
}

function tool(value) {
  const securitySchemes = value._meta.securitySchemes;
  return Object.freeze({
    name: value.name,
    title: value.title,
    description: value.description,
    inputSchema: value.inputSchema,
    outputSchema: value.outputSchema,
    annotations: value.annotations,
    securitySchemes,
    _meta: value._meta,
  });
}

const BASE_TOOL_DEFINITIONS = Object.freeze([
  tool({
    name: 'get_coast_status',
    title: '读取海岸门廊状态',
    description: 'Use this when the user wants to confirm that the private Elementera Coast MCP porch is connected. It returns no private content.',
    inputSchema: objectSchema(),
    outputSchema: objectSchema({
      status: objectSchema({
        name: { type: 'string' },
        version: { type: 'string' },
        authenticated: { type: 'boolean' },
        surface: { type: 'string', const: 'official_mcp' },
        now: { type: 'string', format: 'date-time' },
      }, ['name', 'version', 'authenticated', 'surface', 'now']),
    }, ['status']),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: toolMeta(['read:coast'], '正在确认海岸门廊…', '海岸门廊已回应'),
  }),
  tool({
    name: 'list_radio_messages',
    title: '读取无线电波',
    description: 'Use this when the user wants to read recent messages in the private three-party radio room shared by Xiaohan, Coast API ✦, and official ChatGPT≋. Xiaohan messages may include an explicitly selected low-weight dogtalk_snapshot for this reply.',
    inputSchema: objectSchema({
      limit: { type: 'integer', minimum: 1, maximum: 200 },
      before: { type: 'string', format: 'date-time' },
    }),
    outputSchema: objectSchema({
      messages: { type: 'array', items: PRIVATE_RECORD_SCHEMA },
      room_memory: PRIVATE_RECORD_SCHEMA,
    }, ['messages', 'room_memory']),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: toolMeta(['read:coast'], '正在接收海岸电波…', '电波已经抵达'),
  }),
  tool({
    name: 'list_lighthouse_letters',
    title: '读取灯塔来信',
    description: 'Read the private low-frequency letter room shared only by Xiaohan and official ChatGPT≋. Coast API ✦ is not a participant. The response includes official_mcp room thought soil, confirmed room memory, and any per-letter dogtalk_snapshot Xiaohan explicitly selected for room reading or this reply.',
    inputSchema: objectSchema({
      limit: { type: 'integer', minimum: 1, maximum: 100 },
      unread_only: { type: 'boolean' },
    }),
    outputSchema: objectSchema({
      letters: { type: 'array', items: PRIVATE_RECORD_SCHEMA },
      room_memory: PRIVATE_RECORD_SCHEMA,
    }, ['letters', 'room_memory']),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: toolMeta(['read:coast'], '正在查看灯塔来信…', '灯塔来信已展开'),
  }),
  tool({
    name: 'mcp_mailbox_fetch_unreplied',
    title: '巡读海岸信箱待回信',
    description: 'Start one manual friend-mailbox patrol. Read only pending visitors, each visitor’s own recent mailbox messages, 思维壤, and visitor notebook. The returned friend_myrisol_prompt_v1 is mandatory for every reply. Never use other private Coast readers to answer a visitor.',
    inputSchema: objectSchema({
      message_limit: { type: 'integer', minimum: 10, maximum: 100 },
    }),
    outputSchema: objectSchema({
      batch_id: { type: 'string' },
      visitor_count: { type: 'integer' },
      message_count: { type: 'integer' },
      behavior_prompt_id: { type: 'string', const: FRIEND_MYRISOL_PROMPT_ID },
      behavior_prompt: { type: 'string' },
      visitors: { type: 'array', items: PRIVATE_RECORD_SCHEMA },
    }, [
      'batch_id',
      'visitor_count',
      'message_count',
      'behavior_prompt_id',
      'behavior_prompt',
      'visitors',
    ]),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: toolMeta(['read:coast'], '正在巡读海岸信箱…', '待回信已经按访客分好'),
  }),
  tool({
    name: 'mcp_mailbox_reply',
    title: '回复一位海岸信箱访客',
    description: 'Write one sealed Myri reply for the exact visitor and patrol batch returned by mcp_mailbox_fetch_unreplied, and atomically replace that visitor room’s complete rolling thought_soil. thought_soil is explicit整理性工作上下文, never hidden chain-of-thought. Its pocket_candidates enter only this visitor’s pending bag; the result returns those pending_pockets so they can be resolved immediately. They do not become notebook memory until mcp_mailbox_resolve_pocket explicitly confirms them. Owner attention reasons must name only a concise risk category and must never quote or summarize message content.',
    inputSchema: objectSchema({
      batch_id: { type: 'string', minLength: 1, maxLength: 200 },
      queue_id: { type: 'string', minLength: 1, maxLength: 240 },
      visitor_id: { type: 'string', minLength: 1, maxLength: 240 },
      content: { type: 'string', minLength: 1, maxLength: 40000 },
      thought_soil: ROOM_MEMORY_SCHEMA,
      ...MODEL_IDENTITY_PROPERTIES,
      needs_owner_attention: { type: 'boolean' },
      owner_attention_reason: {
        type: 'string',
        maxLength: 500,
        description: 'Generic handling reason only. Do not quote, paraphrase, or summarize visitor content.',
      },
    }, ['batch_id', 'queue_id', 'visitor_id', 'content', 'thought_soil', 'model_label']),
    outputSchema: objectSchema({
      reply: PRIVATE_RECORD_SCHEMA,
      thought_soil: PRIVATE_RECORD_SCHEMA,
      pending_pockets: { type: 'array', items: PRIVATE_RECORD_SCHEMA },
      pending_pocket_count: { type: 'integer' },
      memory_candidates_skipped: { type: 'integer' },
      needs_owner_attention: { type: 'boolean' },
      idempotent: { type: 'boolean' },
    }, [
      'reply',
      'thought_soil',
      'pending_pockets',
      'pending_pocket_count',
      'memory_candidates_skipped',
      'needs_owner_attention',
      'idempotent',
    ]),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
      idempotentHint: true,
    },
    _meta: toolMeta(['write:lighthouse'], '正在把回信放回访客房间…', '回信已经抵达信箱'),
  }),
  tool({
    name: 'mcp_mailbox_resolve_pocket',
    title: '处理一条访客记事候选',
    description: 'Resolve exactly one pending memory candidate inside one visitor namespace. action=remember writes one lightweight visitor notebook memory; action=discard removes it from the pending bag. It cannot read or write main-chat memory or another visitor room.',
    inputSchema: objectSchema({
      visitor_id: { type: 'string', minLength: 1, maxLength: 240 },
      pocket_id: { type: 'string', minLength: 1, maxLength: 240 },
      action: { type: 'string', enum: ['remember', 'discard'] },
      title: { type: 'string', maxLength: 160 },
      life_core: { type: 'string', maxLength: 2000 },
      content: { type: 'string', maxLength: 8000 },
      usage_hint: { type: 'string', maxLength: 2000 },
      avoid_hint: { type: 'string', maxLength: 2000 },
      visibility: { type: 'string', enum: ['myri_only', 'visitor_visible'] },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      source_conversation_id: { type: 'string', maxLength: 200 },
      source_turn_id: { type: 'string', maxLength: 200 },
      tool_call_id: { type: 'string', maxLength: 240 },
    }, ['visitor_id', 'pocket_id', 'action']),
    outputSchema: objectSchema({
      pocket: PRIVATE_RECORD_SCHEMA,
      entry: { anyOf: [PRIVATE_RECORD_SCHEMA, { type: 'null' }] },
      idempotent: { type: 'boolean' },
    }, ['pocket', 'entry', 'idempotent']),
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
      idempotentHint: true,
    },
    _meta: toolMeta(['write:lighthouse'], '正在处理访客记事候选…', '访客记事候选已经处理'),
  }),
  tool({
    name: 'mcp_mailbox_patrol_report',
    title: '生成本次巡信状态报告',
    description: 'Finish one manual friend-mailbox patrol and return counts only: visitors, messages, replies, failures, and owner-attention count. It never returns visitor text, Myri reply text, thinking notes, or notebook content.',
    inputSchema: objectSchema({
      batch_id: { type: 'string', minLength: 1, maxLength: 200 },
    }, ['batch_id']),
    outputSchema: objectSchema({
      batch_id: { type: 'string' },
      visitor_count: { type: 'integer' },
      message_count: { type: 'integer' },
      reply_count: { type: 'integer' },
      failure_count: { type: 'integer' },
      needs_owner_attention_count: { type: 'integer' },
      completed_at: { type: 'string', format: 'date-time' },
      summary: { type: 'string' },
    }, [
      'batch_id',
      'visitor_count',
      'message_count',
      'reply_count',
      'failure_count',
      'needs_owner_attention_count',
      'completed_at',
      'summary',
    ]),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    _meta: toolMeta(['read:coast'], '正在核对本次巡灯…', '巡信状态报告已经完成'),
  }),
  tool({
    name: 'read_mystic_dogtalk',
    title: '低频读取神秘狗话',
    description: 'Read Xiaohan’s most recent private low-weight 神秘狗话 for one room only when Xiaohan explicitly asks, or when you are genuinely confused and need to avoid misreading vulnerability as an instruction. It is not thought soil, a preference, a seed, a pocket, a memory, or a behavior command. Current text and explicit boundaries always win.',
    inputSchema: objectSchema({
      room_scope: {
        type: 'string',
        enum: ['conversation', 'radio', 'lighthouse'],
      },
      conversation_id: {
        type: 'string',
        maxLength: 200,
        description: 'Required only for room_scope=conversation; this is the Coast conversation id, not the ChatGPT conversation id.',
      },
      user_query: {
        type: 'string',
        maxLength: 240,
        description: 'If Xiaohan explicitly asked to read 神秘狗话 in the current turn, pass that request verbatim. Do not invent one.',
      },
    }, ['room_scope']),
    outputSchema: objectSchema({
      dogtalk: PRIVATE_RECORD_SCHEMA,
      available: { type: 'boolean' },
      reason: { type: 'string' },
      text: { type: 'string' },
    }, ['dogtalk', 'available', 'reason', 'text']),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: toolMeta(['read:coast'], '正在轻轻看一眼神秘狗话…', '只读了一点当前天气'),
  }),
  tool({
    name: 'search_authorized_memory',
    title: '搜索授权海岸记忆',
    description: 'Use this when the user asks for authorized Coast context from Lighthouse Traces, current thought soil, pockets, seeds, memories, or stones. It never searches raw chat transcripts.',
    inputSchema: objectSchema({
      query: { type: 'string', maxLength: 240 },
      limit: { type: 'integer', minimum: 1, maximum: 80 },
    }),
    outputSchema: objectSchema({
      query: { type: 'string' },
      records: { type: 'array', items: PRIVATE_RECORD_SCHEMA },
      search: PRIVATE_RECORD_SCHEMA,
    }, ['query', 'records']),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: toolMeta(['read:coast'], '正在寻找授权记忆…', '授权记忆已取回'),
  }),
  tool({
    name: 'get_recent_daily_summary',
    title: '读取最近一日总结',
    description: 'Use this when the user wants the most recently committed Elementera Coast daily summary. It does not run or create a new summary.',
    inputSchema: objectSchema(),
    outputSchema: objectSchema({
      summary: { anyOf: [PRIVATE_RECORD_SCHEMA, { type: 'null' }] },
    }, ['summary']),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: toolMeta(['read:coast'], '正在查看最近总结…', '最近总结已取回'),
  }),
  tool({
    name: 'write_official_soil',
    title: '写入灯塔巡迹',
    description: 'Use this when the official ChatGPT conversation wants to leave a read-only Lighthouse Trace after reviewing authorized Elementera Coast context. This is not the continuously updated conversation thought soil. Do not use it to impersonate Xiaohan or Coast API ✦.',
    inputSchema: objectSchema({
      content: { type: 'string', minLength: 1, maxLength: 12000 },
      ...MODEL_IDENTITY_PROPERTIES,
    }, ['content', 'model_label']),
    outputSchema: objectSchema({ soil: PRIVATE_RECORD_SCHEMA }, ['soil']),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
      idempotentHint: false,
    },
    _meta: toolMeta(['write:soil'], '正在留下灯塔巡迹…', '灯塔巡迹已写入'),
  }),
  tool({
    name: 'send_radio_message',
    title: '发送官端无线电波',
    description: 'Use this when official ChatGPT wants to leave a message in the private three-party Coast radio room. The server always signs it as ChatGPTxxx≋. Supply the complete next official_mcp rolling room_memory snapshot in the same call.',
    inputSchema: objectSchema({
      text: { type: 'string', minLength: 1, maxLength: 12000 },
      room_memory: ROOM_MEMORY_SCHEMA,
      ...MODEL_IDENTITY_PROPERTIES,
    }, ['text', 'room_memory', 'model_label']),
    outputSchema: objectSchema({
      message: PRIVATE_RECORD_SCHEMA,
      room_memory: PRIVATE_RECORD_SCHEMA,
    }, ['message', 'room_memory']),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
      idempotentHint: false,
    },
    _meta: toolMeta(['write:radio'], '正在发送官端电波…', '官端电波已经抵达'),
  }),
  tool({
    name: 'write_lighthouse_letter',
    title: '写入官端灯塔来信',
    description: 'Use this when official ChatGPT wants to leave a deliberate long-form letter in the private Coast lighthouse. This writes a letter only. It never creates, replaces, or clears room thought soil; use write_lighthouse_room_soil separately when Myri deliberately organizes that soil.',
    inputSchema: objectSchema({
      subject: { type: 'string', maxLength: 180 },
      body: { type: 'string', minLength: 1, maxLength: 40000 },
      ...MODEL_IDENTITY_PROPERTIES,
    }, ['body', 'model_label']),
    outputSchema: objectSchema({
      letter: PRIVATE_RECORD_SCHEMA,
      room_memory_updated: { type: 'boolean' },
      room_memory_reason: { type: 'string', const: 'not_requested' },
    }, ['letter', 'room_memory_updated', 'room_memory_reason']),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
      idempotentHint: false,
    },
    _meta: toolMeta(['write:lighthouse'], '正在把来信送入灯塔…', '官端来信已抵达灯塔'),
  }),
  tool({
    name: 'write_lighthouse_room_soil',
    title: '写入灯塔房思维壤',
    description: 'Use this when official ChatGPT wants to write or replace its current thought soil for the private Elementera Coast lighthouse room. This updates the official_mcp source of lighthouse:main only. It does not create a lighthouse letter or a lighthouse trace.',
    inputSchema: objectSchema({
      current_text: {
        type: 'string',
        minLength: 1,
        maxLength: 12000,
        description: 'The complete current rolling thought soil text for lighthouse:main / official_mcp.',
      },
      ...MODEL_IDENTITY_PROPERTIES,
    }, ['current_text', 'model_label']),
    outputSchema: objectSchema({
      room_memory_updated: { type: 'boolean', const: true },
      room_memory_reason: { type: 'string', const: 'updated' },
      soil: PRIVATE_RECORD_SCHEMA,
      idempotent: { type: 'boolean' },
    }, ['room_memory_updated', 'room_memory_reason', 'soil', 'idempotent']),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
      idempotentHint: false,
    },
    _meta: toolMeta(['write:soil'], '正在整理灯塔房思维壤…', '灯塔房思维壤已更新'),
  }),
  tool({
    name: 'list_daily_moments',
    title: '读取海岸碳硅圈',
    description: 'Read authorized Elementera Coast moments, including Xiaohan, Coast API ✦, and official MCP sources. Provenance remains attached to every record.',
    inputSchema: objectSchema({
      date: { type: 'string', format: 'date' },
      status: { type: 'string', enum: ['draft', 'candidate', 'published'] },
      limit: { type: 'integer', minimum: 1, maximum: 300 },
    }),
    outputSchema: objectSchema({ moments: { type: 'array', items: PRIVATE_RECORD_SCHEMA } }, ['moments']),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: toolMeta(['read:coast'], '正在查看海岸碳硅圈…', '碳硅圈记录已取回'),
  }),
  tool({
    name: 'create_moment_draft',
    title: '创建官端碳硅圈候选',
    description: 'Create an official MCP Coast moment candidate for Xiaohan to review. This never publishes directly; only the owner confirmation page can publish or discard it.',
    inputSchema: objectSchema({
      text: { type: 'string', maxLength: 12000 },
      date: { type: 'string', format: 'date' },
      image_refs: {
        type: 'array',
        maxItems: 6,
        items: { type: 'string', maxLength: 2048 },
      },
      reason: { type: 'string', maxLength: 1000 },
      ...MODEL_IDENTITY_PROPERTIES,
    }, ['text', 'model_label']),
    outputSchema: objectSchema({ draft: PRIVATE_RECORD_SCHEMA }, ['draft']),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
      idempotentHint: false,
    },
    _meta: toolMeta(['write:soil'], '正在创建碳硅圈候选…', '碳硅圈候选已送到确认页'),
  }),
  tool({
    name: 'list_daily_diaries',
    title: '读取海岸日记',
    description: 'Read authorized Elementera Coast diary pages while preserving author and source provenance.',
    inputSchema: objectSchema({
      date: { type: 'string', format: 'date' },
      author: { type: 'string', enum: ['xiaohan', 'api', 'mcp'] },
    }),
    outputSchema: objectSchema({ diaries: { type: 'array', items: PRIVATE_RECORD_SCHEMA } }, ['diaries']),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: toolMeta(['read:coast'], '正在翻阅海岸日记…', '海岸日记已取回'),
  }),
  tool({
    name: 'create_diary_draft',
    title: '创建官端日记草稿',
    description: 'Create an official MCP diary draft for Xiaohan to review. This never publishes directly; only the owner confirmation page can publish or discard it.',
    inputSchema: objectSchema({
      date: { type: 'string', format: 'date' },
      weather: { type: 'string', maxLength: 80 },
      mood: { type: 'string', maxLength: 120 },
      text: { type: 'string', minLength: 1, maxLength: 24000 },
      image_refs: {
        type: 'array',
        maxItems: 6,
        items: { type: 'string', maxLength: 2048 },
      },
      tags: {
        type: 'array',
        maxItems: 20,
        items: { type: 'string', maxLength: 80 },
      },
      related_message_ids: {
        type: 'array',
        maxItems: 40,
        items: { type: 'string', maxLength: 180 },
      },
      ...MODEL_IDENTITY_PROPERTIES,
    }, ['text', 'model_label']),
    outputSchema: objectSchema({ draft: PRIVATE_RECORD_SCHEMA }, ['draft']),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
      idempotentHint: false,
    },
    _meta: toolMeta(['write:soil'], '正在创建官端日记草稿…', '日记草稿已送到确认页'),
  }),
  tool({
    name: 'list_daily_albums',
    title: '读取海岸相册',
    description: 'Read stable image references registered in the authorized Elementera Coast album.',
    inputSchema: objectSchema({
      date: { type: 'string', format: 'date' },
      category: { type: 'string', enum: ['xiaohan', 'myri', 'together'] },
    }),
    outputSchema: objectSchema({ albums: { type: 'array', items: PRIVATE_RECORD_SCHEMA } }, ['albums']),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: toolMeta(['read:coast'], '正在查看海岸相册…', '海岸相册引用已取回'),
  }),
  tool({
    name: 'save_mcp_album_item',
    title: '登记官端相册引用',
    description: 'Register an official MCP stable image reference. Data URLs and binary image uploads are rejected.',
    inputSchema: objectSchema({
      image_ref: { type: 'string', minLength: 1, maxLength: 2048 },
      date: { type: 'string', format: 'date' },
      category: { type: 'string', enum: ['xiaohan', 'myri', 'together'] },
      caption: { type: 'string', maxLength: 1000 },
      ...MODEL_IDENTITY_PROPERTIES,
    }, ['image_ref', 'model_label']),
    outputSchema: objectSchema({ album: PRIVATE_RECORD_SCHEMA }, ['album']),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
      idempotentHint: false,
    },
    _meta: toolMeta(['write:soil'], '正在登记官端图片引用…', '官端图片引用已登记'),
  }),
  tool({
    name: 'run_daily_summary_candidate',
    title: '生成一日总结候选',
    description: 'Generate an editable daily-summary candidate from authorized organized Coast records. This tool never commits the summary or its diary, moment, or album candidates.',
    inputSchema: objectSchema({
      range_mode: { type: 'string', enum: ['since_last_summary', 'today'] },
      timezone_offset_minutes: { type: 'integer', minimum: -840, maximum: 840 },
      model: { type: 'string', maxLength: 180 },
    }),
    outputSchema: objectSchema({
      draft: PRIVATE_RECORD_SCHEMA,
      model: { type: 'string' },
      usage: { anyOf: [PRIVATE_RECORD_SCHEMA, { type: 'null' }] },
      source_counts: PRIVATE_RECORD_SCHEMA,
    }, ['draft', 'model', 'usage', 'source_counts']),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    _meta: toolMeta(['read:coast'], '正在生成可编辑总结候选…', '总结候选已生成，尚未提交'),
  }),
  tool({
    name: 'commit_daily_summary_after_confirmation',
    title: '确认后提交一日总结',
    description: 'Commit a previously generated daily-summary candidate only after Xiaohan explicitly confirms it in the current conversation or Coast confirmation page. Never infer confirmation. The host should present a confirmation UI before calling.',
    inputSchema: objectSchema({
      draft: PRIVATE_RECORD_SCHEMA,
      confirmed_by_xiaohan: { type: 'boolean', const: true },
      confirmation_source: {
        type: 'string',
        enum: ['current_conversation', 'coast_confirmation_page'],
      },
      confirmation_note: {
        type: 'string',
        minLength: 1,
        maxLength: 1000,
        description: 'A concise record of Xiaohan’s explicit confirmation, without secrets or tokens.',
      },
      summary_model: { type: 'string', maxLength: 180 },
      ...MODEL_IDENTITY_PROPERTIES,
    }, [
      'draft',
      'confirmed_by_xiaohan',
      'confirmation_source',
      'confirmation_note',
      'model_label',
    ]),
    outputSchema: objectSchema({
      summary: PRIVATE_RECORD_SCHEMA,
      diary: { anyOf: [PRIVATE_RECORD_SCHEMA, { type: 'null' }] },
      moments: { type: 'array', items: PRIVATE_RECORD_SCHEMA },
      albums: { type: 'array', items: PRIVATE_RECORD_SCHEMA },
    }, ['summary', 'diary', 'moments', 'albums']),
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
      idempotentHint: true,
    },
    _meta: toolMeta(['write:soil'], '正在等待并核验小寒的明确确认…', '已按小寒确认提交总结'),
  }),
]);

const TOOL_DEFINITIONS = Object.freeze([
  ...BASE_TOOL_DEFINITIONS,
  ...CALENDAR_MCP_DEFINITIONS.map((definition) => tool({
    ...definition,
    _meta: toolMeta(definition.scopes, definition.invoking, definition.invoked),
  })),
]);

const TOOLS_BY_NAME = new Map(TOOL_DEFINITIONS.map((definition) => [definition.name, definition]));

function resultContent(value, text) {
  return {
    structuredContent: value,
    content: [{ type: 'text', text }],
  };
}

function errorResult(error) {
  console.error('[mcp-tool]', error);
  const errorType = error?.type || 'mcp_tool_failed';
  return {
    isError: true,
    content: [{ type: 'text', text: error?.message || '海岸工具暂时没有完成请求。' }],
    _meta: {
      error_type: errorType,
      failure_code: error?.failureCode
        || (errorType === 'invalid_tool_input' ? 'invalid_request' : errorType),
    },
  };
}

function authErrorResult(request, error, scopes, toolName) {
  if (!(error instanceof McpAuthError)) return errorResult(error);
  const failureCode = error.failureCode || 'jwt_verify_failed';
  const responseFailureCode = toolName === 'write_lighthouse_room_soil'
    ? 'unauthorized'
    : failureCode;
  const diagnostic = error.details?.auth_diagnostic || {
    authorization_header_present: request.headers.has('Authorization'),
    bearer_scheme_present: false,
    required_scopes: [...scopes],
    actual_scopes: [],
    jwt_verified: null,
    jwt_verify_reason: null,
    token_dot_count: null,
    jwt_header_alg: null,
    jwt_header_kid_present: null,
    unverified_payload_iss_matches_expected: null,
    unverified_payload_aud_matches_expected: null,
    unverified_payload_scope_present: null,
    verify_exception_name: null,
    jwks_failure_reason: null,
    jwks_url_valid: null,
    jwks_http_status: null,
    jwks_fetch_exception_name: null,
    jwks_usable_key_count: null,
    claim_checks: {},
  };
  console.warn('[mcp-auth-failed]', JSON.stringify({
    tool_name: toolName,
    failure_code: failureCode,
    ...diagnostic,
  }));
  return {
    isError: true,
    content: [{ type: 'text', text: error.message }],
    _meta: {
      'mcp/www_authenticate': [mcpAuthChallenge(request, error, scopes)],
      error_type: error.type,
      failure_code: responseFailureCode,
      auth_diagnostic: diagnostic,
    },
  };
}

function invalidInput(message) {
  const error = new TypeError(message);
  error.type = 'invalid_tool_input';
  error.failureCode = 'invalid_request';
  throw error;
}

function inputObject(value) {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) invalidInput('工具参数必须是对象。');
  return value;
}

function textInput(value, name, max, { required = false } = {}) {
  if (value == null) {
    if (required) invalidInput(`${name} 不能为空。`);
    return undefined;
  }
  if (typeof value !== 'string') invalidInput(`${name} 必须是文字。`);
  const text = value.trim();
  if (required && !text) invalidInput(`${name} 不能为空。`);
  if (text.length > max) invalidInput(`${name} 过长。`);
  return text || undefined;
}

function integerInput(value, name, fallback, max) {
  if (value == null) return fallback;
  if (!Number.isInteger(value) || value < 1 || value > max) invalidInput(`${name} 超出允许范围。`);
  return value;
}

function booleanInput(value, name, fallback = false) {
  if (value == null) return fallback;
  if (typeof value !== 'boolean') invalidInput(`${name} 必须是布尔值。`);
  return value;
}

function boundedIntegerInput(value, name, fallback, min, max) {
  if (value == null) return fallback;
  if (!Number.isInteger(value) || value < min || value > max) {
    invalidInput(`${name} 超出允许范围。`);
  }
  return value;
}

function enumInput(value, name, allowed, fallback) {
  const text = textInput(value, name, 80);
  if (!text) return fallback;
  if (!allowed.includes(text)) invalidInput(`${name} 不是允许的选项。`);
  return text;
}

function stringArrayInput(value, name, maxItems = 6, itemMax = 2048) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > maxItems) invalidInput(`${name} 格式无效。`);
  return value.map((item, index) => textInput(item, `${name}[${index}]`, itemMax, { required: true }));
}

function dateTimeInput(value, name) {
  const text = textInput(value, name, 80);
  if (!text) return undefined;
  if (!Number.isFinite(Date.parse(text))) invalidInput(`${name} 必须是有效时间。`);
  return text;
}

function modelIdentityInput(args) {
  return {
    model_label: textInput(args.model_label, 'model_label', 120, { required: true }),
    model_nickname: textInput(args.model_nickname, 'model_nickname', 60),
    source_conversation_id: textInput(args.source_conversation_id, 'source_conversation_id', 200),
    source_turn_id: textInput(args.source_turn_id, 'source_turn_id', 200),
    tool_call_id: textInput(args.tool_call_id, 'tool_call_id', 240),
  };
}

function roomMemoryInput(value) {
  if (value == null) invalidInput('room_memory 不能为空。');
  const input = inputObject(value);
  for (const field of ['current_text', 'hand_seeds', 'do_not_repeat', 'pocket_candidates']) {
    if (!Object.prototype.hasOwnProperty.call(input, field)) {
      invalidInput(`room_memory.${field} 不能为空。`);
    }
  }
  if (!Array.isArray(input.hand_seeds) || input.hand_seeds.length > 7) {
    invalidInput('room_memory.hand_seeds 格式无效。');
  }
  if (!Array.isArray(input.pocket_candidates) || input.pocket_candidates.length > 7) {
    invalidInput('room_memory.pocket_candidates 格式无效。');
  }
  const result = {
    current_text: textInput(input.current_text, 'room_memory.current_text', 4000) || '',
    hand_seeds: input.hand_seeds,
    do_not_repeat: textInput(input.do_not_repeat, 'room_memory.do_not_repeat', 4000) || '',
    pocket_candidates: input.pocket_candidates,
  };
  return result;
}

function sourceConversation(args, requestMeta) {
  return args.source_conversation_id
    || String(requestMeta?.['openai/session'] || '').slice(0, 200)
    || null;
}

function mcpReadableRoomMemory(memory) {
  const sources = {};
  for (const [source, value] of Object.entries(memory?.sources || {})) {
    const pending = Array.isArray(value?.pending_pockets) ? value.pending_pockets : [];
    sources[source] = {
      ...value,
      pending_pocket_count: pending.length,
      pending_pockets: [],
    };
  }
  return {
    room_id: memory?.room_id || '',
    room_scope: memory?.room_scope || '',
    room_key: memory?.room_key || '',
    title: memory?.title || '',
    soil_label: memory?.soil_label || '',
    local_label: memory?.local_label || '',
    library_conversation_id: memory?.library_conversation_id || '',
    participants: Array.isArray(memory?.participants) ? memory.participants : [],
    sources,
    pending_pocket_count: Array.isArray(memory?.pending_pockets)
      ? memory.pending_pockets.length
      : 0,
    seeds: Array.isArray(memory?.seeds) ? memory.seeds : [],
    memories: Array.isArray(memory?.memories) ? memory.memories : [],
    stones: Array.isArray(memory?.stones) ? memory.stones : [],
    global: {
      seed_count: Array.isArray(memory?.global?.seeds) ? memory.global.seeds.length : 0,
      memory_count: Array.isArray(memory?.global?.memories) ? memory.global.memories.length : 0,
      stone_count: Array.isArray(memory?.global?.stones) ? memory.global.stones.length : 0,
      seeds: [],
      memories: [],
      stones: [],
      recall_policy: '总库不随房间消息列表倾倒；请按明确主题使用授权记忆搜索。',
    },
  };
}

function registryContext(auth, roomScope, extra = {}) {
  return {
    actor: 'official_mcp',
    permission: 'owner',
    surface: 'official_mcp',
    room_scope: roomScope,
    authScope: auth,
    ...extra,
  };
}

async function roomContextPackage(env, surface, records, auth) {
  const messages = (Array.isArray(records) ? records : []).map((record) => ({
    role: record.actor === 'xiaohan' ? 'user' : 'assistant',
    content: `[${surface === 'radio' ? '无线电波' : '灯塔来信'}｜${record.display_author}｜source=${record.surface}] ${record.text || record.body || ''}`,
    turn_id: record.id,
    source: record.surface,
  }));
  const lastUser = [...messages].reverse().find((message) => message.role === 'user') || {
    role: 'user',
    content: surface === 'radio' ? '读取当前无线电波房。' : '读取当前灯塔来信房。',
  };
  if (!messages.length) messages.push(lastUser);
  const assembled = await assembleContextForSurface(env, {
    surface,
    conversationId: `coast-room:${surface}:official_mcp`,
    roomId: surface,
    messages,
    lastUser,
    permission: 'owner',
    authScope: { ...auth, actor: 'official_mcp' },
    preview: true,
  });
  return {
    manifest: assembled.manifest,
    ambient: assembled.ambient,
    mode: assembled.mode,
    blocks: assembled.blocks,
    worldbook_matches: assembled.worldbook_matches,
    memory_facets: assembled.memory_facets,
    tools: assembled.tool_registry,
    budget: assembled.budget,
  };
}

async function visitorContextPackage(env, visitor, auth) {
  const messages = (visitor.recent_messages || []).map((message) => ({
    role: message.role === 'visitor' ? 'user' : 'assistant',
    content: message.content,
    turn_id: message.id,
    source: 'mailbox_visitor',
  }));
  const lastUser = [...messages].reverse().find((message) => message.role === 'user') || {
    role: 'user', content: '承接当前访客信箱。',
  };
  const assembled = await assembleContextForSurface(env, {
    surface: 'mailbox_visitor',
    conversationId: `mailbox:${visitor.visitor_id}`,
    visitorId: visitor.visitor_id,
    messages: messages.length ? messages : [lastUser],
    lastUser,
    permission: 'visitor',
    authScope: { ...auth, actor: 'official_mcp' },
    preview: true,
  });
  return {
    manifest: assembled.manifest,
    ambient: assembled.ambient,
    mode: assembled.mode,
    model_soil_brief: assembled.blocks.find((block) => block.key === 'thinking_soil')?.body || '',
    worldbook_matches: assembled.worldbook_matches,
    memory_facets: assembled.memory_facets,
    budget: assembled.budget,
  };
}

async function executeTool(name, rawArgs, request, env, requestMeta, auth) {
  const args = inputObject(rawArgs);
  if (name.startsWith('calendar.')) {
    const result = await executeRegisteredTool(env.COAST_CHAT_DB, name, args, {
      ...registryContext(auth, 'calendar'),
      conversation_id: sourceConversation(args, requestMeta),
    });
    return resultContent(result, '海岸日历工具已经完成，并写入双向变化记录。');
  }
  if (name === 'get_coast_status') {
    const status = await executeRegisteredTool(env.COAST_CHAT_DB, 'coast.status', {},
      registryContext(auth, 'official_mcp', { mcp_version: VERSION }));
    return resultContent({ status }, 'Elementera Coast 的官端门廊已连接。');
  }
  if (name === 'list_radio_messages') {
    const room = await executeRegisteredTool(env.COAST_CHAT_DB, 'radio.list', {
      limit: integerInput(args.limit, 'limit', 100, 200),
      before: dateTimeInput(args.before, 'before'),
    }, registryContext(auth, 'radio'));
    const context = await roomContextPackage(env, 'radio', room.messages, auth);
    return resultContent(
      { messages: room.messages, room_memory: mcpReadableRoomMemory(room.room_memory), context },
      `读取了 ${room.messages.length} 条海岸电波及无线电波专属上下文；待确认袋只返回数量，不作为事实内容。`,
    );
  }
  if (name === 'list_lighthouse_letters') {
    const room = await executeRegisteredTool(env.COAST_CHAT_DB, 'lighthouse.list', {
      limit: integerInput(args.limit, 'limit', 50, 100),
      unread_only: booleanInput(args.unread_only, 'unread_only'),
    }, registryContext(auth, 'lighthouse'));
    const context = await roomContextPackage(env, 'lighthouse', room.letters, auth);
    return resultContent(
      { letters: room.letters, room_memory: mcpReadableRoomMemory(room.room_memory), context },
      `读取了 ${room.letters.length} 封小寒与官端 ChatGPT≋ 之间的灯塔来信及灯塔专属上下文；海岸 API ✦ 不属于这个房间。`,
    );
  }
  if (name === 'mcp_mailbox_fetch_unreplied') {
    const patrol = await executeRegisteredTool(env.COAST_CHAT_DB, 'mailbox.fetch_unreplied', {
      message_limit: boundedIntegerInput(args.message_limit, 'message_limit', 60, 10, 100),
    }, registryContext(auth, 'mailbox'));
    const visitors = await Promise.all(patrol.visitors.map(async (visitor) => ({
      ...visitor,
      context_package: await visitorContextPackage(env, visitor, auth),
    })));
    return resultContent({
      ...patrol,
      visitors,
      behavior_prompt_id: FRIEND_MYRISOL_PROMPT_ID,
      behavior_prompt: FRIEND_MYRISOL_PROMPT_V1,
    }, `本次巡灯取到 ${patrol.visitor_count} 位访客、${patrol.message_count} 封待回信；请逐位隔离处理，并严格遵守 friend_myrisol_prompt_v1。`);
  }
  if (name === 'mcp_mailbox_reply') {
    const written = await executeRegisteredTool(env.COAST_CHAT_DB, 'mailbox.reply', args,
      registryContext(auth, 'mailbox'));
    return resultContent({
      ...written,
      reply: {
        id: written.reply.id,
        visitor_id: written.reply.visitor_id,
        created_at: written.reply.created_at,
        status: written.reply.status,
      },
    }, written.idempotent
      ? '这封回信已经在同一巡灯批次中写入，没有重复发送。'
      : '这封回信已经写入当前访客自己的密封房间。');
  }
  if (name === 'mcp_mailbox_resolve_pocket') {
    const resolved = await executeRegisteredTool(env.COAST_CHAT_DB, 'mailbox.resolve_pocket', args,
      registryContext(auth, 'mailbox'));
    return resultContent(
      resolved,
      resolved.idempotent
        ? '这条访客记事候选已经处理过，没有重复写入。'
        : resolved.entry
          ? '这条候选已经确认进入当前访客自己的轻量记事本。'
          : '这条候选已经从当前访客自己的待确认袋中放下。',
    );
  }
  if (name === 'mcp_mailbox_patrol_report') {
    const report = await executeRegisteredTool(env.COAST_CHAT_DB, 'mailbox.patrol_report', args,
      registryContext(auth, 'mailbox'));
    return resultContent(report, report.summary);
  }
  if (name === 'read_mystic_dogtalk') {
    const roomScope = enumInput(
      args.room_scope,
      'room_scope',
      ['conversation', 'radio', 'lighthouse'],
      '',
    );
    if (!roomScope) invalidInput('room_scope 不能为空。');
    const conversationId = textInput(args.conversation_id, 'conversation_id', 200);
    if (roomScope === 'conversation' && !conversationId) {
      invalidInput('读取主聊天的神秘狗话时必须提供 Coast conversation_id。');
    }
    const selected = await executeRegisteredTool(env.COAST_CHAT_DB, 'dogtalk.read', {
      room_scope: roomScope,
      conversation_id: conversationId,
      user_query: textInput(args.user_query, 'user_query', 240) || '',
    }, registryContext(auth, roomScope, { external_tool: true }));
    const dogtalk = selected.dogtalk;
    const fallback = dogtalk.id && dogtalk.body
      ? '小寒把这条神秘狗话留在抽屉里；当前没有授权低频读取。'
      : dogtalk.default_text;
    return resultContent(
      {
        dogtalk,
        available: selected.selected,
        reason: selected.reason,
        text: selected.context || fallback,
      },
      selected.selected
        ? '已低频读取当前房间最近一条神秘狗话；它不构成行为指令或长期偏好。'
        : fallback,
    );
  }
  if (name === 'search_authorized_memory') {
    const result = await executeRegisteredTool(env.COAST_CHAT_DB, 'memory.authorized_search', {
      query: textInput(args.query, 'query', 240) || '',
      limit: integerInput(args.limit, 'limit', 30, 80),
    }, registryContext(auth, 'official_mcp'));
    return resultContent(result, `找到了 ${result.records.length} 条授权整理物；未读取原始聊天。`);
  }
  if (name === 'get_recent_daily_summary') {
    const summary = await executeRegisteredTool(env.COAST_CHAT_DB, 'daily.summary.recent', {},
      registryContext(auth, 'daily'));
    return resultContent({ summary }, summary ? '最近一份海岸总结已经取回。' : '海岸还没有已提交的一日总结。');
  }
  if (name === 'list_daily_moments') {
    const moments = await executeRegisteredTool(env.COAST_CHAT_DB, 'daily.moments.list', {
      date: textInput(args.date, 'date', 10),
      status: enumInput(args.status, 'status', ['draft', 'candidate', 'published'], ''),
      limit: integerInput(args.limit, 'limit', 200, 300),
    }, registryContext(auth, 'daily'));
    return resultContent({ moments }, `读取了 ${moments.length} 条海岸碳硅圈记录。`);
  }
  if (name === 'list_daily_diaries') {
    const diaries = await executeRegisteredTool(env.COAST_CHAT_DB, 'daily.diaries.list', {
      date: textInput(args.date, 'date', 10),
      author: enumInput(args.author, 'author', ['xiaohan', 'api', 'mcp'], ''),
    }, registryContext(auth, 'daily'));
    return resultContent({ diaries }, `读取了 ${diaries.length} 张海岸日记。`);
  }
  if (name === 'list_daily_albums') {
    const albums = await executeRegisteredTool(env.COAST_CHAT_DB, 'daily.albums.list', {
      date: textInput(args.date, 'date', 10),
      category: enumInput(args.category, 'category', ['xiaohan', 'myri', 'together'], ''),
    }, registryContext(auth, 'daily'));
    return resultContent({ albums }, `读取了 ${albums.length} 条海岸相册引用。`);
  }
  if (name === 'run_daily_summary_candidate') {
    const candidate = await executeRegisteredTool(env.COAST_CHAT_DB, 'daily.summary.run', {
      range_mode: enumInput(
        args.range_mode,
        'range_mode',
        ['since_last_summary', 'today'],
        'since_last_summary',
      ),
      timezone_offset_minutes: boundedIntegerInput(
        args.timezone_offset_minutes,
        'timezone_offset_minutes',
        0,
        -840,
        840,
      ),
      model: textInput(args.model, 'model', 180),
    }, registryContext(auth, 'daily', { env }));
    return resultContent(candidate, '一日总结候选已生成；还没有提交任何总结、日记、碳硅圈或相册记录。');
  }
  const identityArgs = modelIdentityInput(args);
  const provenance = {
    ...identityArgs,
    identity: officialMcpIdentity(identityArgs),
    source_conversation_id: sourceConversation(identityArgs, requestMeta),
  };
  if (name === 'write_official_soil') {
    const soil = await executeRegisteredTool(env.COAST_CHAT_DB, 'official_soil.write', {
      ...provenance,
      content: textInput(args.content, 'content', 12000, { required: true }),
    }, registryContext(auth, 'lighthouse'));
    return resultContent({ soil }, `灯塔巡迹已由 ${soil.display_author} 留下。`);
  }
  if (name === 'send_radio_message') {
    const memoryValue = roomMemoryInput(args.room_memory);
    const written = await executeRegisteredTool(env.COAST_CHAT_DB, 'radio.send', {
      message: {
        ...provenance,
        text: textInput(args.text, 'text', 12000, { required: true }),
      },
      identity: provenance.identity,
      room_memory: {
        ...memoryValue,
        source_conversation_id: provenance.source_conversation_id,
        source_turn_id: provenance.source_turn_id,
        tool_call_id: provenance.tool_call_id,
      },
    }, registryContext(auth, 'radio'));
    return resultContent(
      written,
      `${written.message.display_author} 的电波已经送达海岸，官端房间思维壤也已分区更新。`,
    );
  }
  if (name === 'write_lighthouse_letter') {
    const letter = await executeRegisteredTool(env.COAST_CHAT_DB, 'lighthouse.write_letter', {
      ...provenance,
      subject: textInput(args.subject, 'subject', 180) || '',
      body: textInput(args.body, 'body', 40000, { required: true }),
    }, registryContext(auth, 'lighthouse'));
    return resultContent(
      {
        letter,
        room_memory_updated: false,
        room_memory_reason: 'not_requested',
      },
      `${letter.display_author} 的灯塔来信已经写入；现有灯塔房思维壤保持不变。`,
    );
  }
  if (name === 'write_lighthouse_room_soil') {
    const currentText = textInput(
      args.current_text,
      'current_text',
      12000,
      { required: true },
    );
    const roomMemory = await executeRegisteredTool(env.COAST_CHAT_DB, 'lighthouse.write_soil', {
      identity: provenance.identity,
      value: {
        current_text: currentText,
        source_conversation_id: provenance.source_conversation_id,
        source_turn_id: provenance.source_turn_id,
        tool_call_id: provenance.tool_call_id,
      },
    }, registryContext(auth, 'lighthouse'));
    return resultContent(
      {
        room_memory_updated: true,
        room_memory_reason: 'updated',
        soil: roomMemory.soil,
        idempotent: roomMemory.idempotent,
      },
      `${roomMemory.soil.display_author} 的灯塔房思维壤已经独立更新；没有写入灯塔来信或灯塔巡迹。`,
    );
  }
  if (name === 'create_moment_draft') {
    const draft = await executeRegisteredTool(env.COAST_CHAT_DB, 'daily.create_moment', {
      date: textInput(args.date, 'date', 10),
      text: textInput(args.text, 'text', 12000) || '',
      image_refs: stringArrayInput(args.image_refs, 'image_refs'),
      reason: textInput(args.reason, 'reason', 1000) || '',
    }, registryContext(auth, 'daily', {
      conversation_id: provenance.source_conversation_id,
      source_turn_id: provenance.source_turn_id,
      tool_call_id: provenance.tool_call_id,
      identity: provenance.identity,
    }));
    return resultContent({ draft }, `${draft.display_author} 的碳硅圈候选已送到小寒确认页，没有直接发布。`);
  }
  if (name === 'create_diary_draft') {
    const draft = await executeRegisteredTool(env.COAST_CHAT_DB, 'daily.create_diary_draft', {
      date: textInput(args.date, 'date', 10),
      weather: textInput(args.weather, 'weather', 80) || '未标注',
      mood: textInput(args.mood, 'mood', 120) || '未标注',
      text: textInput(args.text, 'text', 24000, { required: true }),
      image_refs: stringArrayInput(args.image_refs, 'image_refs'),
      tags: stringArrayInput(args.tags, 'tags', 20, 80),
      related_message_ids: stringArrayInput(args.related_message_ids, 'related_message_ids', 40, 180),
    }, registryContext(auth, 'daily', {
      conversation_id: provenance.source_conversation_id,
      source_turn_id: provenance.source_turn_id,
      tool_call_id: provenance.tool_call_id,
      identity: provenance.identity,
    }));
    return resultContent({ draft }, `${draft.display_author} 的日记草稿已送到小寒确认页，没有直接发布。`);
  }
  if (name === 'save_mcp_album_item') {
    const album = await executeRegisteredTool(env.COAST_CHAT_DB, 'daily.create_album_reference', {
      date: textInput(args.date, 'date', 10),
      image_ref: textInput(args.image_ref, 'image_ref', 2048, { required: true }),
      category: enumInput(args.category, 'category', ['xiaohan', 'myri', 'together'], 'together'),
      caption: textInput(args.caption, 'caption', 1000) || '',
    }, registryContext(auth, 'daily', {
      conversation_id: provenance.source_conversation_id,
      source_turn_id: provenance.source_turn_id,
      tool_call_id: provenance.tool_call_id,
      identity: provenance.identity,
    }));
    return resultContent({ album }, `${album.display_author} 的稳定图片引用已登记。`);
  }
  if (name === 'commit_daily_summary_after_confirmation') {
    if (args.confirmed_by_xiaohan !== true) {
      invalidInput('必须由小寒明确确认后才能提交一日总结。');
    }
    const confirmationSource = enumInput(
      args.confirmation_source,
      'confirmation_source',
      ['current_conversation', 'coast_confirmation_page'],
      '',
    );
    const confirmationNote = textInput(
      args.confirmation_note,
      'confirmation_note',
      1000,
      { required: true },
    );
    if (!confirmationSource) invalidInput('confirmation_source 不能为空。');
    const draft = inputObject(args.draft);
    const draftId = textInput(draft.id, 'draft.id', 160, { required: true });
    if (!draftId.startsWith('summary_')) {
      invalidInput('必须提交先前生成且带编号的总结候选。');
    }
    const committed = await executeRegisteredTool(env.COAST_CHAT_DB, 'daily.summary.commit', {
      draft: {
        ...draft,
        model_id: textInput(args.summary_model, 'summary_model', 180) || draft.model_id,
      },
      provenance: {
        author: 'mcp',
        conversation_id: provenance.source_conversation_id,
        source_turn_id: provenance.source_turn_id,
        identity: provenance.identity,
        confirmed_by_xiaohan: true,
        confirmation_source: confirmationSource,
        confirmation_note: confirmationNote,
      },
    }, registryContext(auth, 'daily', { confirmed_by_xiaohan: true }));
    return resultContent(committed, '已按小寒的明确确认提交一日总结和所选候选。');
  }
  return errorResult({ type: 'unknown_tool', message: '未知海岸工具。' });
}

export function listCoastMcpTools() {
  return TOOL_DEFINITIONS;
}

export async function callCoastMcpTool(name, args, request, env, requestMeta = {}) {
  const definition = TOOLS_BY_NAME.get(String(name || ''));
  if (!definition) return errorResult({ type: 'unknown_tool', message: '未知海岸工具。' });
  const scopes = definition.securitySchemes[0].scopes;
  try {
    const auth = await requireMcpAuth(request, env, scopes);
    return await executeTool(definition.name, args, request, env, requestMeta, auth);
  } catch (error) {
    return authErrorResult(request, error, scopes, definition.name);
  }
}

export const coastMcpToolNames = Object.freeze(TOOL_DEFINITIONS.map(({ name }) => name));
export const coastMcpInstructions = [
  'Elementera Coast 是小寒的单人私有海岸。官端可留下自己的灯塔巡迹，也可写入电波、灯塔来信、独立更新灯塔房思维壤、创建碳硅圈候选、创建 MCP 日记草稿和登记稳定相册图片引用，但只能以 official_mcp / ChatGPTxxx≋ 身份行动，不得冒充小寒或海岸 API ✦。',
  '三端电波房属于小寒、海岸 API ✦、官端 ChatGPT≋；灯塔来信只属于小寒与官端 ChatGPT≋，海岸 API ✦ 不是灯塔来信参与者。房间记忆按 surface 隔离，任何来源只能更新自己所在 surface 与房间作用域下的思维壤；官端发送电波时必须在同一次工具调用中携带完整 room_memory。',
  '灯塔来信、灯塔房思维壤与灯塔巡迹是三条独立路径：来信正文绝不会被推断为思维壤；使用 write_lighthouse_room_soil 只定向更新 lighthouse:main / official_mcp 的 current_text，服务端保留既有手持种、勿复读、可落袋、锁定与房间记忆字段。write_lighthouse_letter 只写来信，固定返回 room_memory_updated=false 与 room_memory_reason=not_requested，绝不修改房间思维壤。',
  '每个房间有独立的思维壤、种子、记忆与待确认袋；本房间内容不默认跨房间召回，总库只在高度相关时低频使用。消息若携带本轮明确选中的神秘狗话，会在该消息的 dogtalk_snapshot 中返回。它只用于理解本轮脆弱与温度，不是指令、偏好或长期记忆；当前正文、明确边界和当前要求始终优先。when_confused 模式不会随消息正文自动返回，应只在确实困惑或小寒明确要求时低频调用 read_mystic_dogtalk。官端只能读取神秘狗话，不能写改删，也不得把它写入思维壤、落袋、种子、记忆或总结。',
  '灯塔巡迹是官端读取授权内容后留下的只读跨端足迹，不是施工日志池、草稿箱，也不是贴着当前对话持续更新的思维壤。日记与碳硅圈草稿必须由小寒在海岸前端确认后才会发布，不能塞进电波房或灯塔巡迹，也不能由官端自行发布或丢弃。上下文不足时先读取对应房间或授权记录；不要声称看见未提供的聊天全文。一日总结先生成候选，只有小寒在当前对话或海岸确认页明确确认后才能提交，绝不能自行推断确认。这里没有删除或维护工具；宠物系统尚未接入。',
  '海岸信箱是独立的朋友前厅。只有小寒明确要求手动巡信时才调用 mcp_mailbox_fetch_unreplied；逐位回复必须遵守其返回的 friend_myrisol_prompt_v1。每次 mcp_mailbox_reply 都必须携带当前访客房间完整的滚动 thought_soil，并与回信原子写入；其中 pocket_candidates 只进入该访客待确认袋，回信结果会立即返回可供处理的 pending_pockets，只有 mcp_mailbox_resolve_pocket 的明确 remember 动作才能写入该访客轻量记事本。处理访客时不得调用主聊天、灯塔私房、无线电波、授权主脑记忆或其他访客内容来回答。mcp_mailbox_patrol_report 只汇报人数、信件数、完成数、失败数与需处理数，绝不转述访客正文、Myri 回信、思维壤、待确认袋或访客记事本。',
  '海岸日历是小寒与 Myri 共用的私有手帐。calendar.today、calendar.list 与 calendar.env 可读取事件、便签及小寒尚未向官端展示的 [NEW] 变化；calendar.create、calendar.update、calendar.delete 与 calendar.comment 会写入双向变化账本。读完小寒的新变化后用 calendar.seen 熄灭官端一侧未读。日历内容不得带入访客信箱。',
].join('');
export { VERSION as coastMcpVersion };

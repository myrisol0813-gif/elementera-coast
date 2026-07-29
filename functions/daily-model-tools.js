import {
  DailyStoreError,
  createAlbumItem,
  createDiaryDraft,
  createMomentDraft,
  sanitizeImageRefs,
} from './daily-store.js';
import { apiMyriIdentity } from './coast-identity.js';

const CREATE_MOMENT = {
  type: 'function',
  function: {
    name: 'create_moment',
    description: '创建一条 Elementera Coast 内部碳硅圈候选，送到小寒确认页。不会直接发布，也不会外发到任何社交平台。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        text: {
          type: 'string',
          description: '碳硅圈正文。',
        },
        source_window: {
          type: 'string',
          enum: ['current'],
          description: '来源窗口。当前普通聊天中填写 current；服务器会绑定真实 conversation_id。',
        },
        visible_status: {
          type: 'string',
          enum: ['candidate'],
          description: '模型只能创建 candidate；发布由小寒在确认页完成。',
        },
        has_image_refs: {
          type: 'boolean',
          description: '这条动态是否带有稳定图片引用。',
        },
        image_refs: {
          type: 'array',
          maxItems: 6,
          items: { type: 'string' },
          description: '仅允许稳定 URL、站内路径、coast:// 或未来的 R2 引用；不要传 base64。',
        },
        reason: {
          type: 'string',
          description: '为什么现在值得写进碳硅圈，简短说明。',
        },
      },
      required: ['text', 'source_window', 'visible_status', 'has_image_refs', 'image_refs', 'reason'],
    },
  },
};

const SAVE_ALBUM_REFERENCE = {
  type: 'function',
  function: {
    name: 'save_album_reference',
    description: '把一张已经拥有稳定引用的图片记录到 Elementera Coast 内部相册。不会上传 base64，也不会外发。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        image_ref: {
          type: 'string',
          description: '稳定图片 URL、站内路径、coast:// 或未来的 R2 引用。',
        },
        category: {
          type: 'string',
          enum: ['xiaohan', 'myri', 'together'],
          description: '相册分类。',
        },
        caption: {
          type: 'string',
          description: '图片说明。',
        },
        source_window: {
          type: 'string',
          enum: ['current'],
          description: '来源窗口。当前普通聊天中填写 current；服务器会绑定真实 conversation_id。',
        },
      },
      required: ['image_ref', 'category', 'caption', 'source_window'],
    },
  },
};

const CREATE_DIARY_DRAFT = {
  type: 'function',
  function: {
    name: 'create_diary_draft',
    description: '创建一份 Elementera Coast 日记草稿，送到小寒的日记确认页。不会直接发布，也不会把草稿塞进电波房或灯塔巡迹。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        text: {
          type: 'string',
          description: '较长的当天自观、关系变化、生活或创作沉淀。',
        },
        weather: {
          type: 'string',
          description: '可选天气；不确定时填写“未标注”。',
        },
        mood: {
          type: 'string',
          description: '可选心情；不确定时填写“未标注”。',
        },
        source_window: {
          type: 'string',
          enum: ['current'],
          description: '来源窗口。服务器会绑定当前真实 conversation_id。',
        },
        has_image_refs: {
          type: 'boolean',
          description: '草稿是否带有稳定图片引用。',
        },
        image_refs: {
          type: 'array',
          maxItems: 6,
          items: { type: 'string' },
          description: '仅允许稳定 URL、站内路径或 coast:// 引用；不要传 base64。',
        },
        tags: {
          type: 'array',
          maxItems: 20,
          items: { type: 'string' },
          description: '可选的轻量标签。',
        },
      },
      required: ['text', 'weather', 'mood', 'source_window', 'has_image_refs', 'image_refs', 'tags'],
    },
  },
};

export const DAILY_MODEL_TOOLS = Object.freeze([
  CREATE_MOMENT,
  CREATE_DIARY_DRAFT,
  SAVE_ALBUM_REFERENCE,
]);

export function isDailyModelTool(name) {
  return DAILY_MODEL_TOOLS.some((tool) => tool.function.name === name);
}

function parseArguments(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || '{}'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not_object');
    return parsed;
  } catch {
    throw new DailyStoreError('invalid_tool_arguments', '日报工具参数不是有效的 JSON 对象。', 400);
  }
}

function toolShape(toolCall) {
  return {
    id: String(toolCall?.id || '').slice(0, 160),
    name: String(toolCall?.function?.name || toolCall?.name || ''),
    arguments: toolCall?.function?.arguments ?? toolCall?.arguments,
  };
}

export async function executeDailyModelTool(db, toolCall, context = {}) {
  const call = toolShape(toolCall);
  if (!call.id) throw new DailyStoreError('missing_tool_call_id', '日报工具缺少调用编号。', 400);
  if (!isDailyModelTool(call.name)) {
    throw new DailyStoreError('unknown_daily_tool', '这个日报工具不存在。', 400);
  }
  const args = parseArguments(call.arguments);
  if (String(args.source_window || '').trim() !== 'current') {
    throw new DailyStoreError('invalid_tool_source', '日报工具来源窗口必须是当前聊天窗口。', 400);
  }
  const trusted = {
    author: 'myri',
    source: 'chat_tool',
    conversation_id: context.conversation_id,
    source_turn_id: context.source_turn_id,
    tool_call_id: call.id,
  };
  const modelLabel = String(context.model_label || '').trim().slice(0, 180);
  if (modelLabel) trusted.identity = apiMyriIdentity({ model_label: modelLabel });

  if (call.name === 'create_moment') {
    const imageRefs = sanitizeImageRefs(args.image_refs);
    if (Boolean(args.has_image_refs) !== Boolean(imageRefs.length)) {
      throw new DailyStoreError('tool_image_refs_mismatch', '动态的图片引用标记与实际引用不一致。', 400);
    }
    if (args.visible_status !== 'candidate') {
      throw new DailyStoreError('owner_confirmation_required', '模型只能创建碳硅圈候选，不能直接发布。', 403);
    }
    const draft = await createMomentDraft(db, {
      date: context.local_date,
      text: args.text,
      image_refs: imageRefs,
      reason: args.reason,
    }, trusted);
    return {
      ok: true,
      kind: 'moment_draft',
      id: draft.id,
      status: draft.status,
      published_at: null,
      duplicate_safe: true,
    };
  }

  if (call.name === 'create_diary_draft') {
    const imageRefs = sanitizeImageRefs(args.image_refs);
    if (Boolean(args.has_image_refs) !== Boolean(imageRefs.length)) {
      throw new DailyStoreError('tool_image_refs_mismatch', '日记草稿的图片引用标记与实际引用不一致。', 400);
    }
    const draft = await createDiaryDraft(db, {
      date: context.local_date,
      weather: args.weather || '未标注',
      mood: args.mood || '未标注',
      text: args.text,
      image_refs: imageRefs,
      tags: args.tags,
      related_message_ids: context.source_turn_id ? [context.source_turn_id] : [],
    }, { ...trusted, author: 'api' });
    return {
      ok: true,
      kind: 'diary_draft',
      id: draft.id,
      status: draft.status,
      published_at: null,
      duplicate_safe: true,
    };
  }

  const album = await createAlbumItem(db, {
    date: context.local_date,
    image_ref: args.image_ref,
    category: args.category,
    caption: args.caption,
  }, trusted);
  return {
    ok: true,
    kind: 'album_item',
    id: album.id,
    image_ref: album.image_ref,
    duplicate_safe: true,
  };
}

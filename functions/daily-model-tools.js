import {
  DailyStoreError,
  createAlbumItem,
  createMoment,
  sanitizeImageRefs,
} from './daily-store.js';

const CREATE_MOMENT = {
  type: 'function',
  function: {
    name: 'create_moment',
    description: '把一条动态真实写入 Elementera Coast 内部碳硅圈。只写海岸内部服务器，不会外发到任何社交平台。',
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
          enum: ['draft', 'candidate', 'published'],
          description: '海岸内部可见状态。',
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

export const DAILY_MODEL_TOOLS = Object.freeze([CREATE_MOMENT, SAVE_ALBUM_REFERENCE]);

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

  if (call.name === 'create_moment') {
    const imageRefs = sanitizeImageRefs(args.image_refs);
    if (Boolean(args.has_image_refs) !== Boolean(imageRefs.length)) {
      throw new DailyStoreError('tool_image_refs_mismatch', '动态的图片引用标记与实际引用不一致。', 400);
    }
    const moment = await createMoment(db, {
      date: context.local_date,
      text: args.text,
      status: args.visible_status,
      image_refs: imageRefs,
      reason: args.reason,
    }, trusted);
    return {
      ok: true,
      kind: 'moment',
      id: moment.id,
      status: moment.status,
      published_at: moment.published_at,
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

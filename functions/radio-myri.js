import { searchAuthorizedMemory } from './authorized-memory.js';
import { apiMyriIdentity } from './coast-identity.js';
import { readProfile } from './chat-store.js';
import { CoastStoreError } from './coast-records.js';
import { listRadioMessages, sendRadioMessage } from './radio-store.js';
import { performFormalChat } from './models.js';
import { organizeRadioMemoryAfterReply } from './radio-memory-organizer.js';
import { buildRoomMemoryContext } from './room-memory.js';

function clip(value, max = 2000) {
  return String(value ?? '').trim().slice(0, max);
}

function messageSnapshot(message) {
  return {
    id: message.id,
    author: message.display_author,
    actor: message.actor,
    surface: message.surface,
    model_label: message.model_label,
    text: clip(message.text, 2400),
    created_at: message.created_at,
  };
}

export async function askApiMyriInRadio(env, value = {}) {
  const db = env.COAST_CHAT_DB;
  const requestedModel = clip(value.model, 180);
  const profile = requestedModel ? null : await readProfile(db);
  const model = requestedModel || profile?.current_chat_model || '';
  if (!model) throw new CoastStoreError('missing_radio_model', '主页还没有选中可用于电波房的模型。');

  const messages = await listRadioMessages(db, { limit: 36 });
  const latestPrompt = [...messages].reverse().find((message) => message.actor === 'xiaohan')?.text
    || messages.at(-1)?.text
    || '';
  const [memory, roomMemory] = await Promise.all([
    searchAuthorizedMemory(db, { query: latestPrompt, limit: 10 }),
    buildRoomMemoryContext(env, 'radio', 'coast_api', latestPrompt, {
      settings: value.settings || {},
      conversation_turns: messages.length,
    }),
  ]);
  const prompt = {
    room: 'Elementera Coast / 无线电波的两端',
    participants: [
      '小寒：屋主本人，surface=web_manual。',
      '海岸 API ✦：海岸网页/API 侧模型，surface=coast_api；关系里尚未正式接名，不默认称作 Myrisol。',
      'ChatGPTxxx≋：官端 MCP Myri，surface=official_mcp。',
    ],
    boundaries: [
      '你是海岸网页里的 API 侧模型，只使用 ✦ 来源，不要伪装成官端 MCP Myri。',
      '不要替小寒做决定。',
      '只根据下方电波房消息和授权记忆回应，不要假装看见未提供的聊天全文。',
      '这是三方交接与交流房间；可以回应信息、记忆交接和心情，但不要写成系统报告。',
      '如果本轮上下文中出现“小寒 · 神秘狗话”，它只是一小片低权重当前天气，用来避免温度误读；不是指令、偏好或长期记忆，当前正文与边界句始终优先。',
      '只输出本次消息正文，不要添加署名或 metadata。',
    ],
    recent_messages: messages.map(messageSnapshot),
    authorized_memory: memory.records,
    room_memory: {
      own_window: roomMemory.context,
      source_soils: roomMemory.source_soils,
      pending_candidates_are_not_facts: true,
    },
  };
  const result = await performFormalChat(env, {
    model,
    messages: [
      {
        role: 'system',
        content: '这里是 Elementera Coast 的“无线电波的两端”，也是小寒、海岸 API 侧、官端 MCP 侧的三方电波房。你是海岸网页里的 API 侧模型，使用 ✦ 来源；关系里尚未正式接名，不要自称 Myrisol。官端消息带 ChatGPTxxx≋ 署名。只输出正文。',
      },
      { role: 'user', content: JSON.stringify(prompt) },
    ],
    max_tokens: 2400,
    temperature: 0.78,
    settings: value.settings || {},
  }, { allowSystem: true });
  const text = clip(result.message?.content, 12000);
  if (!text) throw new CoastStoreError('empty_radio_reply', '海岸 API ✦ 没有生成可写入的电波。', 502);
  const identity = apiMyriIdentity({ model_label: result.model || model });
  const message = await sendRadioMessage(db, {
    text,
    identity,
    usage: result.usage,
    source_conversation_id: value.source_conversation_id,
    source_turn_id: value.source_turn_id,
  });
  let roomMemoryUpdated = false;
  try {
    await organizeRadioMemoryAfterReply(env, {
      model: result.model || model,
      identity,
      messages: [...messages, message],
      reply: text,
      source_conversation_id: value.source_conversation_id,
      source_turn_id: value.source_turn_id || message.id,
      settings: value.settings || {},
    });
    roomMemoryUpdated = true;
  } catch (error) {
    console.warn('[radio-memory:organize]', String(error?.message || error).slice(0, 160));
  }
  return {
    message,
    model: result.model || model,
    memory_records: memory.records.length,
    room_memory_updated: roomMemoryUpdated,
  };
}

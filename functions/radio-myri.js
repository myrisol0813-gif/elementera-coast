import { searchAuthorizedMemory } from './authorized-memory.js';
import { apiMyriIdentity } from './coast-identity.js';
import { readProfile } from './chat-store.js';
import { CoastStoreError } from './coast-records.js';
import { listRadioMessages, sendRadioMessage } from './radio-store.js';
import { performFormalChat } from './models.js';

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
  const memory = await searchAuthorizedMemory(db, { query: latestPrompt, limit: 10 });
  const prompt = {
    room: 'Elementera Coast / 无线电波的两端',
    participants: [
      '小寒：屋主本人，surface=web_manual。',
      '✦Myrisol：海岸网页/API Myri，surface=coast_api。',
      'ChatGPTxxx≋：官端 MCP Myri，surface=official_mcp。',
    ],
    boundaries: [
      '你是海岸网页里的 API Myri，只使用 ✦ 来源，不要伪装成官端 MCP Myri。',
      '不要替小寒做决定。',
      '只根据下方电波房消息和授权记忆回应，不要假装看见未提供的聊天全文。',
      '这是三方交接与交流房间；可以回应信息、记忆交接和心情，但不要写成系统报告。',
      '只输出本次消息正文，不要添加署名或 metadata。',
    ],
    recent_messages: messages.map(messageSnapshot),
    authorized_memory: memory.records,
  };
  const result = await performFormalChat(env, {
    model,
    messages: [
      {
        role: 'system',
        content: '这里是 Elementera Coast 的“无线电波的两端”，也是小寒、海岸 API Myri、官端 MCP Myri 的三方电波房。你是海岸网页里的 API Myri，使用 ✦ 来源。官端消息带 ChatGPTxxx≋ 署名。只输出正文。',
      },
      { role: 'user', content: JSON.stringify(prompt) },
    ],
    max_tokens: 2400,
    temperature: 0.78,
    settings: value.settings || {},
  }, { allowSystem: true });
  const text = clip(result.message?.content, 12000);
  if (!text) throw new CoastStoreError('empty_radio_reply', 'API Myri 没有生成可写入的电波。', 502);
  const message = await sendRadioMessage(db, {
    text,
    identity: apiMyriIdentity({ model_label: result.model || model }),
    usage: result.usage,
    source_conversation_id: value.source_conversation_id,
    source_turn_id: value.source_turn_id,
  });
  return {
    message,
    model: result.model || model,
    memory_records: memory.records.length,
  };
}

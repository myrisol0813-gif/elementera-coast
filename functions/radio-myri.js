import { assembleCleanContext } from './context-assemble-clean.js';
import { apiMyriIdentity } from './coast-identity.js';
import { readProfile } from './chat-store.js';
import { CoastStoreError } from './coast-records.js';
import { performFormalChatWithTools } from './models.js';
import { organizeRadioMemoryAfterReply } from './radio-memory-organizer.js';
import { listRadioMessages, sendRadioMessage } from './radio-store.js';

function clip(value, max = 2000) {
  return String(value ?? '').trim().slice(0, max);
}

function radioContextMessages(messages, latestPrompt, sourceTurnId) {
  const latestXiaohan = [...messages].reverse().find((message) => message.actor === 'xiaohan') || null;
  const recent = messages
    .filter((message) => message.id !== latestXiaohan?.id)
    .map((message) => ({
      role: message.actor === 'xiaohan' ? 'user' : 'assistant',
      content: `[无线电波｜${message.display_author}] ${clip(message.text, 2400)}`,
      turn_id: message.id,
      source: message.surface,
    }));
  recent.push({
    role: 'user',
    content: latestPrompt,
    turn_id: latestXiaohan?.id || sourceTurnId || `radio-prompt-${Date.now()}`,
    source: 'web_manual',
  });
  return recent;
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
  const contextMessages = radioContextMessages(messages, latestPrompt, value.source_turn_id);
  const assembled = await assembleCleanContext(env, {
    surface: 'radio',
    conversationId: 'coast-room:radio:coast_api',
    roomId: 'radio',
    sourceTurnId: contextMessages.at(-1)?.turn_id,
    messages: contextMessages,
    lastUser: contextMessages.at(-1),
    settings: value.settings || {},
    localDate: value.local_date,
    localDateTime: value.local_datetime,
    model,
    permission: 'owner',
    authScope: { actor: 'coast_api' },
  });
  const result = await performFormalChatWithTools(env, {
    model,
    messages: assembled.modelMessages,
    max_tokens: 2400,
    temperature: 0.78,
    settings: value.settings || {},
    tools: assembled.tools,
  }, {
    allowSystem: true,
    executeTool: assembled.executeTool,
  });
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
    memory_records: assembled.selected_memory_ids.length,
    room_memory_updated: roomMemoryUpdated,
    desk_slip: assembled.deskSlip(),
  };
}

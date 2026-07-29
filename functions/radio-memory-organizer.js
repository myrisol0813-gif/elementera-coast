import { performFormalChat } from './models.js';
import { buildRoomMemoryContext, writeRoomMemory } from './room-memory.js';

const RESPONSE_FORMAT = Object.freeze({
  type: 'json_schema',
  json_schema: Object.freeze({
    name: 'radio_room_memory',
    strict: true,
    schema: Object.freeze({
      type: 'object',
      additionalProperties: false,
      properties: Object.freeze({
        current_text: { type: 'string' },
        hand_seeds: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              name: { type: 'string' },
              life_core: { type: 'string' },
              usage_hint: { type: 'string' },
              avoid_hint: { type: 'string' },
            },
            required: ['name', 'life_core', 'usage_hint', 'avoid_hint'],
          },
        },
        do_not_repeat: { type: 'string' },
        pocket_candidates: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              candidate_id: { type: 'string' },
              title: { type: 'string' },
              life_core: { type: 'string' },
              content: { type: 'string' },
              usage_hint: { type: 'string' },
              avoid_hint: { type: 'string' },
              source_excerpt: { type: 'string' },
            },
            required: [
              'candidate_id',
              'title',
              'life_core',
              'content',
              'usage_hint',
              'avoid_hint',
              'source_excerpt',
            ],
          },
        },
      }),
      required: ['current_text', 'hand_seeds', 'do_not_repeat', 'pocket_candidates'],
    }),
  }),
});

function parseObject(value) {
  const text = String(value || '').trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1] || text;
  const result = JSON.parse(fenced);
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('invalid_room_memory');
  return result;
}

function snapshot(messages) {
  return messages.slice(-36).map((message) => ({
    id: message.id,
    actor: message.actor,
    surface: message.surface,
    author: message.display_author,
    text: String(message.text || '').slice(0, 2200),
    created_at: message.created_at,
  }));
}

export async function organizeRadioMemoryAfterReply(env, value = {}) {
  const query = String(value.reply || '').slice(0, 2400);
  const current = await buildRoomMemoryContext(env, 'radio', 'coast_api', query, {
    settings: value.settings || {},
  });
  const result = await performFormalChat(env, {
    model: value.model,
    messages: [
      {
        role: 'system',
        content: '你只整理三端电波房中海岸 API ✦ 自己这一侧的滚动思维壤。不要改写小寒或官端灯塔侧的思维壤；不要把待确认候选当作事实；只返回 JSON。',
      },
      {
        role: 'user',
        content: JSON.stringify({
          existing_soil: current.source_soils.coast_api,
          recent_messages: snapshot(value.messages || []),
          latest_api_reply: query,
          instructions: {
            current_text: '保留贴着当前电波对话的轻量承接，不写思考过程或流水账。',
            hand_seeds: '最多 7 粒，只保留当前值得手持的关系锚点。',
            pocket_candidates: '只提出值得由小寒确认的候选，不自动升级为记忆。',
          },
        }),
      },
    ],
    response_format: RESPONSE_FORMAT,
    max_tokens: 2200,
    temperature: 0.28,
    settings: value.settings || {},
  }, { allowSystem: true });
  const memory = parseObject(result.message?.content);
  return writeRoomMemory(env.COAST_CHAT_DB, 'radio', value.identity, {
    ...memory,
    source_conversation_id: value.source_conversation_id,
    source_turn_id: value.source_turn_id,
  });
}

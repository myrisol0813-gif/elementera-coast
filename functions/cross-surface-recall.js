import { listLighthouseLetters } from './lighthouse-store.js';
import { listOfficialSoils } from './official-soil-store.js';
import { listRadioMessages } from './radio-store.js';
import { listRoomMemory } from './room-memory.js';

const CROSS_SURFACE_TERMS = /(官端|灯塔|三端|无线电波|电波房|MCP|门廊|跨端|official_mcp|ChatGPT.*≋|海岸\s*API)/iu;
const TRACE_TERMS = /(灯塔巡迹|官端|MCP|门廊|跨端|三端|official_mcp|≋)/iu;
const RADIO_TERMS = /(三端|无线电波|电波房|官端.*海岸|海岸.*官端|API.*官端|官端.*API)/iu;
const LETTER_TERMS = /(灯塔来信|长信|官端|灯塔|跨端关系|三端关系)/iu;

function clip(value, max) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function memoryLines(memory, limit = 5) {
  const result = [];
  for (const source of Object.values(memory?.sources || {})) {
    for (const entry of [...(source.seeds || []), ...(source.memories || [])]) {
      result.push(`- ${clip(entry.title, 100)}｜${clip(entry.life_core, 520)}`);
      if (result.length >= limit) return result;
    }
  }
  return result;
}

export async function buildCrossSurfaceContext(db, query) {
  const text = String(query || '').trim();
  if (!CROSS_SURFACE_TERMS.test(text)) {
    return { context: '', selected: [], triggered: false };
  }
  const selected = [];
  const blocks = ['【跨端分区｜仅在官端、灯塔或三端主题相关时使用】'];

  if (RADIO_TERMS.test(text)) {
    const [messages, memory] = await Promise.all([
      listRadioMessages(db, { limit: 16 }),
      listRoomMemory(db, 'radio'),
    ]);
    const lines = messages.slice(-8).map((message) => {
      selected.push(message.id);
      return `- ${clip(message.display_author, 100)}：${clip(message.text, 680)}`;
    });
    if (lines.length) blocks.push('近期三端电波：', ...lines);
    const confirmed = memoryLines(memory);
    if (confirmed.length) blocks.push('三端房间已确认种子 / 记忆：', ...confirmed);
  }

  if (LETTER_TERMS.test(text)) {
    const [letters, memory] = await Promise.all([
      listLighthouseLetters(db, { limit: 8 }),
      listRoomMemory(db, 'lighthouse'),
    ]);
    const lines = letters.slice(0, 4).map((letter) => {
      selected.push(letter.id);
      return `- ${clip(letter.display_author, 100)}｜${clip(letter.subject || '无题来信', 120)}｜${clip(letter.body, 720)}`;
    });
    if (lines.length) blocks.push('近期灯塔来信：', ...lines);
    const confirmed = memoryLines(memory, 4);
    if (confirmed.length) blocks.push('灯塔分区已确认种子 / 记忆：', ...confirmed);
  }

  if (TRACE_TERMS.test(text)) {
    const traces = (await listOfficialSoils(db, { limit: 8 })).slice(0, 4);
    if (traces.length) {
      blocks.push('低频灯塔巡迹：', ...traces.map((trace) => {
        selected.push(trace.id);
        return `- ${clip(trace.display_author, 100)}：${clip(trace.content, 680)}`;
      }));
    }
  }

  if (blocks.length === 1) return { context: '', selected: [], triggered: true };
  blocks.push(
    '约束：这些内容按来源分区，不代表小寒本人；待确认袋不在这里。不要为了使用跨端记忆而使用它，也不要把灯塔巡迹高频塞进普通日常聊天。',
  );
  return {
    context: blocks.join('\n').slice(0, 7600),
    selected,
    triggered: true,
  };
}

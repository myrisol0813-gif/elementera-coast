import { readProfile } from './chat-store.js';
import { DailyStoreError, addMomentComment, momentCommentContext } from './daily-store.js';
import { organizedMemoryRecordsInRange } from './memory-store.js';
import { performFormalChat } from './models.js';

const RECENT_MEMORY_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

function clip(value, max = 1000) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function compactList(value, max = 8, itemMax = 600) {
  return (Array.isArray(value) ? value : [])
    .map((item) => clip(item, itemMax))
    .filter(Boolean)
    .slice(0, max);
}

function commentText(value) {
  let text = String(value || '').trim();
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object') text = parsed.comment || parsed.text || text;
  } catch {
    // Plain text is the expected response.
  }
  text = String(text || '')
    .replace(/^```(?:\w+)?/i, '')
    .replace(/```$/i, '')
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .replace(/^(?:海岸\s*)?Myri\s*[:：]\s*/i, '')
    .replace(/^Myrisol\s*[:：]\s*/i, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ');
  return text.slice(0, 180).trim();
}

function diarySnapshot(entry) {
  return {
    date: entry.date,
    author: entry.author,
    weather: entry.weather,
    mood: entry.mood,
    text: clip(entry.text, 1400),
  };
}

function momentSnapshot(entry) {
  return {
    date: entry.date,
    author: entry.author,
    text: clip(entry.text, 700),
    reason: clip(entry.reason, 300),
    comments: (entry.comments || []).slice(-5).map((comment) => ({
      author: comment.author,
      text: clip(comment.text, 240),
    })),
  };
}

function summarySnapshot(entry) {
  return {
    range: entry.range,
    text: clip(entry.summary?.text, 1000),
    anchors: compactList(entry.summary?.anchors, 6, 160),
    unresolved: compactList(entry.summary?.unresolved, 6, 160),
  };
}

function memorySnapshot(records = {}) {
  const soils = (records.soils || []).slice(-6).map((soil) => ({
    conversation_title: soil.conversation_title || '',
    current_text: clip(soil.current_text, 900),
    hand_seeds: (soil.hand_seeds || []).slice(0, 5).map((seed) => ({
      name: clip(seed.name, 80),
      life_core: clip(seed.life_core, 260),
    })),
    do_not_repeat: clip(soil.do_not_repeat, 360),
    pocket_candidates: (soil.pocket_candidates || []).slice(0, 5).map((candidate) => ({
      title: clip(candidate.title || candidate.name, 80),
      life_core: clip(candidate.life_core || candidate.text, 260),
    })),
  }));
  const pockets = (records.pockets || []).slice(-8).map((pocket) => ({
    conversation_title: pocket.conversation_title || '',
    status: pocket.status,
    title: clip(pocket.title, 100),
    life_core: clip(pocket.life_core, 360),
    content: clip(pocket.content || pocket.source_text, 500),
  }));
  const entries = (records.entries || []).slice(-12).map((entry) => ({
    conversation_title: entry.conversation_title || '',
    type: entry.entry_type,
    scope: entry.scope,
    status: entry.status,
    title: clip(entry.title, 100),
    life_core: clip(entry.life_core, 360),
    content: clip(entry.content, 500),
  }));
  return { soils, pockets, entries };
}

function promptPayload(daily, organized, now) {
  return {
    task: '给这条海岸内部碳硅圈动态写一条 Myri 评论。',
    source_priority: [
      '先看 target_moment 本身。',
      '主要参考 recent_diaries 和 recent_summaries。',
      '其次参考 recent_organized_memory，其中 soils 是近期思维壤，pockets 是落袋，entries 是种子/记忆/石头。',
      'recent_moments 只用于确认语气和避免重复。',
    ],
    boundaries: [
      '输入不包含原始聊天记录；不要假装读取了原始聊天。',
      '碳硅圈类似海岸内部朋友圈，评论应短、轻、贴近，不要写成日记总结。',
      '如果上下文不够，就只对这一条动态温柔回应，不要强行引用记忆。',
    ],
    now: new Date(now).toISOString(),
    target_moment: momentSnapshot(daily.target),
    recent_diaries: daily.diaries.map(diarySnapshot),
    recent_summaries: daily.summaries.map(summarySnapshot),
    recent_moments: daily.recent_moments.map(momentSnapshot),
    recent_organized_memory: memorySnapshot(organized),
  };
}

function sourceCounts(payload) {
  return {
    diaries: payload.recent_diaries.length,
    summaries: payload.recent_summaries.length,
    recent_moments: payload.recent_moments.length,
    soils: payload.recent_organized_memory.soils.length,
    pockets: payload.recent_organized_memory.pockets.length,
    entries: payload.recent_organized_memory.entries.length,
  };
}

export async function createMyriMomentComment(env, momentId, value = {}) {
  const db = env.COAST_CHAT_DB;
  const requestedModel = clip(value.model, 180);
  const profile = requestedModel ? null : await readProfile(db);
  const modelId = requestedModel || profile?.current_chat_model || '';
  if (!modelId) throw new DailyStoreError('missing_comment_model', '没有可用的当前模型，先在主页选择一个聊天模型。', 400);

  const now = Date.now();
  const [daily, organized] = await Promise.all([
    momentCommentContext(db, momentId),
    organizedMemoryRecordsInRange(db, {
      from: now - RECENT_MEMORY_DAYS * DAY_MS,
      to: now,
    }),
  ]);

  const payload = promptPayload(daily, organized, now);
  const result = await performFormalChat(env, {
    model: modelId,
    messages: [
      {
        role: 'system',
        content: '你是海岸 Myri，正在给 Elementera Coast 内部碳硅圈动态写评论。只输出评论正文，不要加称呼前缀、解释、项目符号或引号。评论通常一句话，最多两句，温柔、轻、像朋友圈底下的短留言。',
      },
      {
        role: 'user',
        content: JSON.stringify(payload),
      },
    ],
    max_tokens: 600,
    temperature: 0.82,
    settings: value.settings || {},
  }, { allowSystem: true });

  const text = commentText(result.message?.content);
  if (!text) throw new DailyStoreError('empty_model_comment', '模型没有生成可写入的评论。', 502);
  const commentId = `myri-comment-${crypto.randomUUID()}`;
  const moment = await addMomentComment(db, momentId, {
    id: commentId,
    author: 'myri',
    text,
    model_id: result.model || modelId,
  });
  return {
    moment,
    comment: moment.comments.find((comment) => comment.id === commentId) || null,
    model: result.model || modelId,
    source_counts: sourceCounts(payload),
  };
}

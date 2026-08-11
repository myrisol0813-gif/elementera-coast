import { readProfile } from './chat-store.js';
import { assembleCleanContext } from './context-assemble-clean.js';
import { DailyStoreError, addMomentComment, momentCommentContext } from './daily-store.js';
import { organizedMemoryRecordsInRange } from './memory-store.js';
import { performFormalChat } from './models.js';

const RECENT_MEMORY_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

function clip(value, max = 1000) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
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

function paperSection(title, lines) {
  const clean = lines.map((line) => String(line || '').trim()).filter(Boolean);
  return clean.length ? [title, ...clean].join('\n') : '';
}

function promptPaper(daily, organized, now) {
  const soilLines = (organized.soils || []).slice(-6).map((soil) => {
    const seeds = (soil.hand_seeds || []).slice(0, 3)
      .map((seed) => clip(seed.life_core || seed.name, 220)).filter(Boolean);
    return [clip(soil.conversation_title || '一个海岸窗口', 80), clip(soil.current_text, 700), ...seeds]
      .filter(Boolean).join('｜');
  });
  const memoryLines = [
    ...(organized.pockets || []).slice(-6).map((item) => `落袋：${clip(item.title, 100)}｜${clip(item.life_core || item.content, 360)}`),
    ...(organized.entries || []).slice(-10).map((item) => `${item.entry_type === 'seed' ? '种子' : '记忆'}：${clip(item.title, 100)}｜${clip(item.life_core || item.content, 360)}`),
  ];
  return [
    paperSection('【这条碳硅圈】', [`${daily.target.date || new Date(now).toISOString().slice(0, 10)}｜${clip(daily.target.text, 900)}`]),
    paperSection('【近期日记】', daily.diaries.map((item) => `${item.date}｜${clip(item.text, 700)}`)),
    paperSection('【近期海岸日报】', daily.summaries.map((item) => `${item.range?.to || ''}｜${clip(item.summary?.text, 700)}`)),
    paperSection('【近期思维壤】', soilLines),
    paperSection('【相关记忆】', memoryLines),
    paperSection('【近期碳硅圈】', daily.recent_moments.map((item) => `${item.date}｜${clip(item.text, 420)}`)),
  ].filter(Boolean).join('\n\n');
}

function sourceCounts(daily, organized) {
  return {
    diaries: daily.diaries.length,
    summaries: daily.summaries.length,
    recent_moments: daily.recent_moments.length,
    soils: organized.soils.length,
    pockets: organized.pockets.length,
    entries: organized.entries.length,
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

  const paper = promptPaper(daily, organized, now);
  const assembled = await assembleCleanContext(env, {
    surface: 'daily',
    messages: [{ role: 'user', content: paper }],
    lastUser: paper,
    settings: { ...(value.settings || {}), worldbookEnabled: false, recentTurns: 2 },
    baseSystemPrompt: '你是海岸 Myri，正在给碳硅圈动态写一条短评论。只输出评论正文，不加称呼前缀、解释、项目符号或引号。通常一句，最多两句，温柔、轻、像朋友圈底下的留言。',
    exposeTools: false,
    includeTodayCoast: false,
    permission: 'owner',
    preview: true,
  });
  const result = await performFormalChat(env, {
    model: modelId,
    messages: assembled.modelMessages,
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
    source_counts: sourceCounts(daily, organized),
  };
}

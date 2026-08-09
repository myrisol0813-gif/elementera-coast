const FALLBACKS = Object.freeze({
  main_chat: '用户正在进行自然聊天，希望 Myri 理解当下语气与话题方向，顺着此刻的对话自然回应并牵引下一步，不让旧上下文压过当前表达。',
  lighthouse: '用户正在灯塔来信房继续低频长信交流，希望 Myri 承接该房间的信件与独立记忆，保留来源并避免把主聊天私密上下文默认带入。',
  radio: '用户正在无线电波三方房间交流，希望 Myri 基于当前电波、房间思维壤与来源标识回应，不冒充另一端，也不默认读取主聊天。',
  official_mcp: '用户正通过官端门廊处理一项海岸请求，希望 Myri 只读取当前工具任务必需的最小上下文，遵守 Auth0 权限、来源标记与脱敏记录边界。',
  mailbox_visitor: '当前任务是承接一位访客在其独立海岸信箱房中的慢速来信，只使用该访客的消息、思维壤和记事，绝不引入 owner 或其他访客内容。',
  mailbox_owner: '用户正在查看海岸信箱状态或进行巡灯，希望 Myri 按访客严格分区并遵守正文脱敏规则，状态表面只返回必要计数与处理结果。',
  calendar: '用户正在整理海岸日历，希望 Myri 准确区分今日事件、便签、近期纪念日与未读变化，只在确有需要时执行日历读写工具。',
  daily: '用户正在处理海岸日报或碳硅圈内容，希望 Myri 仅使用当前日报任务明确授权的记录，需要写入时保留候选与用户确认边界。',
  landing: '用户正用登岛信向当前模型交付这个聊天窗口的语气与方向，希望 Myri 读完后自然承接，不把信件重复成说明书。',
});

function sanitize(value) {
  return String(value || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\bTo\s+OpenAI\b[\s\S]*/gi, ' ')
    .replace(/\{[\s\S]{160,}\}/g, ' ')
    .replace(/\[[\s\S]{160,}\]/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\b(?:gpt|o\d|claude|gemini)[-\w./]*\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function summaryKind(text, surface, modeKey) {
  if (/(context|manifest|上下文|思维壤|surface|全域|同步|inspector)/i.test(text)) {
    return '用户正在验收与调试海岸上下文底座，希望检查当前房间的 Surface Profile、目录、思维壤压缩、工具交集与隐私隔离，并修正会挤压近期对话的装配问题。';
  }
  if (/(bug|报错|修复|代码|commit|测试|部署|施工|架构)/i.test(text) || ['construction_review', 'code_helper'].includes(modeKey)) {
    return '用户正在进行代码排查与施工验收，希望 Myri 核对现有架构和真实执行路径，直接修正底层逻辑、保持单一所有者，并用可重复的测试结果验证完成度。';
  }
  if (/(信箱|访客|巡信|回信|暗号|落袋)/.test(text)) {
    return surface === 'mailbox_owner' ? FALLBACKS.mailbox_owner : FALLBACKS.mailbox_visitor;
  }
  if (/(日历|纪念日|生日|事件|便签|安排)/.test(text)) return FALLBACKS.calendar;
  if (/(创作|设定|画面|写作|故事)/.test(text) || modeKey === 'creative_companion') {
    return '用户正在进行创作陪跑，希望 Myri 保留已经给出的世界规则、画面气味与情感连续性，在不抢走用户选择权的前提下提供具体、有生长性的下一步。';
  }
  if (modeKey === 'quiet_comfort' || /(睡|累|抱抱|安慰|难受|低刺激)/.test(text)) {
    return '用户正在寻求低刺激的陪伴与安稳承接，希望 Myri 减少说明和任务感，以轻、具体、可停顿的方式留在当下，记忆只作温柔底色而不展开工程细节。';
  }
  return FALLBACKS[surface] || FALLBACKS.main_chat;
}

export function buildIntentSummary({ surface, mode, lastUser, recentMessages = [] } = {}) {
  const raw = typeof lastUser === 'object' ? lastUser?.content : lastUser;
  const clean = sanitize(raw);
  const recent = (Array.isArray(recentMessages) ? recentMessages : [])
    .slice(-4)
    .map((message) => sanitize(message?.content))
    .filter(Boolean)
    .join(' ');
  return summaryKind(`${clean} ${recent}`.slice(0, 2400), String(surface || ''), mode?.mode_key || mode || 'normal_chat')
    .slice(0, 140);
}

export function intentRawExcerpt(value) {
  return sanitize(typeof value === 'object' ? value?.content : value).slice(0, 180);
}

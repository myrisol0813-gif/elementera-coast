export function estimateContextTokens(value) {
  let wide = 0;
  let narrow = 0;
  for (const character of String(value || '')) {
    if (/[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/u.test(character)) wide += 1;
    else narrow += 1;
  }
  return wide + Math.ceil(narrow / 4);
}

function messageTokens(message) {
  return estimateContextTokens(message?.content) + 4;
}

function cleanMessages(messages, recentTurns) {
  return (Array.isArray(messages) ? messages : [])
    .filter((message) => ['user', 'assistant'].includes(message?.role)
      && typeof message.content === 'string'
      && message.content.trim())
    .map((message) => ({ role: message.role, content: message.content }))
    .slice(-Math.max(2, Math.min(24, Number(recentTurns) || 8) * 2));
}

function block(title, items) {
  const lines = (Array.isArray(items) ? items : []).map((item) => String(item || '').trim()).filter(Boolean);
  return lines.length ? [title, ...lines].join('\n') : '';
}

function assembleText(value) {
  return [
    value.basePrompt,
    value.soilText,
    block('【相关记忆】', value.memoryItems.map((item) => `- ${item}`)),
    block('【触角轻讯】', value.touchItems),
    block('【海岸词典】', value.worldbookItems.map((item) => `- ${item}`)),
    value.todayText,
    value.dogtalkText,
    value.workbenchText,
  ].filter(Boolean).join('\n\n');
}

export function trimContextToComfortRange({
  basePrompt = '',
  soilText = '',
  memoryItems = [],
  touchItems = [],
  worldbookItems = [],
  todayText = '',
  todayRequired = false,
  dogtalkText = '',
  workbenchText = '',
  messages = [],
  recentTurns = 8,
  maxTokens = 6000,
} = {}) {
  const value = {
    basePrompt: String(basePrompt || '').trim(),
    soilText: String(soilText || '').trim(),
    memoryItems: [...memoryItems].filter(Boolean),
    touchItems: [...touchItems].filter(Boolean),
    worldbookItems: [...worldbookItems].filter(Boolean),
    todayText: String(todayText || '').trim(),
    dogtalkText: String(dogtalkText || '').trim(),
    workbenchText: String(workbenchText || '').trim(),
  };
  const keptMessages = cleanMessages(messages, recentTurns);
  const ceiling = Math.max(1800, Math.min(14000, Number(maxTokens) || 6000));
  let trimmedCount = 0;
  const total = () => estimateContextTokens(assembleText(value))
    + keptMessages.reduce((sum, message) => sum + messageTokens(message), 0);

  if (total() > ceiling) {
    if (value.workbenchText) { value.workbenchText = ''; trimmedCount += 1; }
    if (value.dogtalkText) { value.dogtalkText = ''; trimmedCount += 1; }
    if (!todayRequired && value.todayText) { value.todayText = ''; trimmedCount += 1; }
  }
  while (total() > ceiling && value.worldbookItems.length > 2) { value.worldbookItems.pop(); trimmedCount += 1; }
  while (total() > ceiling && value.touchItems.length > 2) { value.touchItems.pop(); trimmedCount += 1; }
  while (total() > ceiling && value.memoryItems.length > 3) { value.memoryItems.pop(); trimmedCount += 1; }
  while (total() > ceiling && value.worldbookItems.length) { value.worldbookItems.pop(); trimmedCount += 1; }
  while (total() > ceiling && value.touchItems.length) { value.touchItems.pop(); trimmedCount += 1; }
  while (total() > ceiling && value.memoryItems.length) { value.memoryItems.pop(); trimmedCount += 1; }
  if (total() > ceiling && value.todayText && !todayRequired) { value.todayText = ''; trimmedCount += 1; }

  if (total() > ceiling && value.soilText.length > 700) {
    value.soilText = value.soilText.slice(0, 700);
    trimmedCount += 1;
  }
  while (total() > ceiling && keptMessages.length > 4) {
    keptMessages.shift();
    trimmedCount += 1;
  }

  const systemText = assembleText(value);
  const currentUser = [...keptMessages].reverse().find((message) => message.role === 'user');
  return {
    modelMessages: [
      ...(systemText ? [{ role: 'system', content: systemText }] : []),
      ...keptMessages,
    ],
    kept: {
      soil: Boolean(value.soilText),
      memory: value.memoryItems.length,
      touch: value.touchItems.length,
      worldbook: value.worldbookItems.length,
      today: Boolean(value.todayText),
      dogtalk: Boolean(value.dogtalkText),
      workbench: Boolean(value.workbenchText),
    },
    keptMemoryItems: value.memoryItems,
    keptTouchItems: value.touchItems,
    keptWorldbookItems: value.worldbookItems,
    trimmedCount,
    currentUserPreserved: Boolean(currentUser),
  };
}

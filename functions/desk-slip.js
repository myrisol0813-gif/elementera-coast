function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || '').trim()).filter(Boolean))];
}

export function createDeskSlip({
  soil = false,
  memoryCount = 0,
  touchSources = [],
  worldbookTitles = [],
  todayCoast = false,
  furniture = [],
  trimmedCount = 0,
} = {}) {
  const sources = uniqueStrings(touchSources);
  const words = uniqueStrings(worldbookTitles);
  const tools = uniqueStrings(furniture);
  const counts = [];
  if (soil) counts.push('思维壤 1');
  if (memoryCount) counts.push(`记忆 ${Number(memoryCount)}`);
  if (sources.length) counts.push(`触角 ${sources.length}`);
  if (words.length) counts.push(`词典 ${words.length}`);
  if (todayCoast) counts.push('今日海岸 1');
  if (tools.length) counts.push(`工作台 ${tools.length}`);
  const comfort = trimmedCount > 0
    ? `已裁去 ${Number(trimmedCount)} 条低相关旧纸条`
    : '已保持在舒服区间';
  return {
    summary: `本轮桌面${counts.length ? ` · ${counts.join('｜')}` : ''}`,
    soil: Boolean(soil),
    memory_count: Math.max(0, Number(memoryCount) || 0),
    touch_count: sources.length,
    touch_sources: sources,
    worldbook_count: words.length,
    worldbook_titles: words,
    today_coast: Boolean(todayCoast),
    workbench_count: tools.length,
    furniture: tools,
    comfort,
  };
}

export function deskSlipAfterTools(slip, furniture = []) {
  return createDeskSlip({
    soil: slip?.soil,
    memoryCount: slip?.memory_count,
    touchSources: slip?.touch_sources,
    worldbookTitles: slip?.worldbook_titles,
    todayCoast: slip?.today_coast,
    furniture,
    trimmedCount: String(slip?.comfort || '').startsWith('已裁去')
      ? Number(String(slip.comfort).match(/\d+/)?.[0] || 0)
      : 0,
  });
}

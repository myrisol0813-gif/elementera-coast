'use strict';

/**
 * Future v106 dailyShell module.
 *
 * Current runtime owner: public/app.js, window.__v106SiliconCarbonMoments IIFE.
 * This file is intentionally not imported or loaded yet.
 *
 * P3-STRUCT-03 stages behavior-neutral daily hall config and empty-state copy here.
 * The live openDaily() / openChild() functions still remain in app.js until a later task.
 */

(function attachDailyShell(root) {
  const modules = (root.ElementeraDailyModules = root.ElementeraDailyModules || {});

  const DAILY_ROOM_NAMES = Object.freeze({
    moments: '硅碳圈',
    diary: '日记',
    album: '相册',
    widgets: '小组件',
    pet: '宠物系统',
  });

  const DAILY_ENTRY_STATUS = '暂未接入';
  const DAILY_HALL_COPY = Object.freeze({
    title: '海岸日报',
    subtitle: '海岸日报',
    description: '这里会承接日报、动态、日记、相册和小组件。',
  });

  const DAILY_CHILD_EMPTY_COPY = Object.freeze({
    subtitle: DAILY_ENTRY_STATUS,
    status: '暂未接入。',
    description: '这个入口会在正式接入后显示内容。',
    backLabel: '返回海岸日报',
  });

  function getDailyRoomName(kind) {
    return DAILY_ROOM_NAMES[kind] || DAILY_HALL_COPY.title;
  }

  function getDailyEntries() {
    return Object.entries(DAILY_ROOM_NAMES).map(([kind, title]) => ({
      kind,
      title,
      status: DAILY_ENTRY_STATUS,
    }));
  }

  modules.dailyShell = Object.freeze({
    moduleName: 'dailyShell',
    panelId: 'freshDailyPanelV101',
    isRuntimeWired: false,
    DAILY_ROOM_NAMES,
    DAILY_ENTRY_STATUS,
    DAILY_HALL_COPY,
    DAILY_CHILD_EMPTY_COPY,
    getDailyRoomName,
    getDailyEntries,
  });
})(globalThis);

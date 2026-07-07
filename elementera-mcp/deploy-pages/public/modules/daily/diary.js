'use strict';

/**
 * Future v106 diary module.
 *
 * Current runtime owner: public/app.js, window.__v106SiliconCarbonMoments IIFE.
 * This file is intentionally not imported or loaded yet.
 *
 * P3-STRUCT-03 stages pure date/label helpers and diary copy here. Live diary
 * rendering still remains in app.js until a later wiring task.
 */

(function attachDiary(root) {
  const modules = (root.ElementeraDailyModules = root.ElementeraDailyModules || {});

  const DIARY_COPY = Object.freeze({
    title: '日记',
    subtitle: '本地草稿原型，暂未同步服务器',
    emptyTitle: '暂无日记。',
    emptyDescription: '这里是本地草稿原型，暂未同步服务器。今天可以留下小寒、✦Myrisol、≋Myrisol 的纸页。',
    composeTitle: '写日记',
    composeButton: '保存本地日记预览',
    composeNotice: '本地草稿原型，暂未同步服务器。刷新后可能消失。',
  });

  function dateKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function dateLabel(key) {
    const parts = String(key || dateKey()).split('-');
    return `${parts[1] || '--'}月${parts[2] || '--'}日`;
  }

  function authorName(author) {
    return author === 'api' ? '✦Myrisol' : author === 'mcp' ? '≋Myrisol' : '小寒';
  }

  function createDiaryDraft({ id, date, author, weather, mood, text, image } = {}) {
    return {
      id: id || `diary-${Date.now()}`,
      date: date || dateKey(),
      author: author || 'xiaohan',
      weather: weather || '未标注',
      mood: mood || '未标注',
      text: text || '',
      image: image || '',
    };
  }

  modules.diary = Object.freeze({
    moduleName: 'diary',
    isRuntimeWired: false,
    DIARY_COPY,
    dateKey,
    dateLabel,
    authorName,
    createDiaryDraft,
  });
})(globalThis);

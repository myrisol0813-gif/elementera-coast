'use strict';

/**
 * Future v106 moments module.
 *
 * Current runtime owner: public/app.js, window.__v106SiliconCarbonMoments IIFE.
 * This file is intentionally not imported or loaded yet.
 *
 * P3-STRUCT-03 stages moments copy/config and pure card helpers here. Live UI
 * rendering still remains in app.js until a later wiring task.
 */

(function attachMoments(root) {
  const modules = (root.ElementeraDailyModules = root.ElementeraDailyModules || {});

  const MOMENTS_COPY = Object.freeze({
    title: '硅碳圈',
    subtitle: '本地草稿原型，暂未同步服务器',
    localMeta: '本地草稿原型 · 暂未同步服务器',
    emptyTitle: '暂无动态。',
    emptyDescription: '这里是本地草稿原型，暂未同步服务器。刷新后可能消失。',
    composeTitle: '发表硅碳圈',
    composeButton: '保存本地草稿预览',
    composeNotice: '本地草稿原型，暂未同步服务器。刷新后可能消失。',
  });

  const MOMENTS_FORBIDDEN_DEFAULTS = Object.freeze([
    '这里是只有 Myri 能看见的小朋友圈。',
    '今日主屋状态：在。',
    '沿海岸保存回声。',
    '灯塔已照亮',
    '回潮记录完成',
    '好好笑',
    '那我要把脸贴到窗户上看。',
  ]);

  function createMomentDraft({ id, text, image, location } = {}) {
    return {
      id: id || `local-${Date.now()}`,
      text: text || '',
      image: image || '',
      location: location || '',
    };
  }

  function createMomentPostViewModel(draft) {
    return {
      id: draft.id,
      author: '小寒',
      meta: MOMENTS_COPY.localMeta,
      text: draft.text || '（无正文）',
      image: draft.image || '',
      baseComments: [],
      baseLikes: 0,
    };
  }

  modules.moments = Object.freeze({
    moduleName: 'moments',
    isRuntimeWired: false,
    MOMENTS_COPY,
    MOMENTS_FORBIDDEN_DEFAULTS,
    createMomentDraft,
    createMomentPostViewModel,
  });
})(globalThis);

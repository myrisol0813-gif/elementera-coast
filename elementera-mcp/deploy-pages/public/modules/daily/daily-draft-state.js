'use strict';

/**
 * Future v106 dailyDraftState module.
 *
 * Current runtime owner: public/app.js, window.__v106SiliconCarbonMoments IIFE.
 * This file is intentionally not imported or loaded yet.
 *
 * P3-STRUCT-03 stages runtime-only initial state factories here. These helpers
 * intentionally do not read or write localStorage.
 */

(function attachDailyDraftState(root) {
  const modules = (root.ElementeraDailyModules = root.ElementeraDailyModules || {});

  const DAILY_DRAFT_STATE_KEYS = Object.freeze([
    'scPosts',
    'scLikes',
    'scComments',
    'scCommentTarget',
    'diaries',
    'diaryDate',
    'albumItems',
  ]);

  function createDailyDraftState() {
    return {
      scPosts: [],
      scLikes: {},
      scComments: {},
      scCommentTarget: '',
      diaries: [],
      diaryDate: '',
      albumItems: [],
    };
  }

  modules.dailyDraftState = Object.freeze({
    moduleName: 'dailyDraftState',
    isRuntimeWired: false,
    DAILY_DRAFT_STATE_KEYS,
    createDailyDraftState,
  });
})(globalThis);

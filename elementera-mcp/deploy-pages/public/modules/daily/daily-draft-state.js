'use strict';

/**
 * Future v106 dailyDraftState module.
 *
 * Current runtime owner: public/app.js, window.__v106SiliconCarbonMoments IIFE.
 * This file is intentionally not imported or loaded yet.
 *
 * Future responsibilities:
 * - Centralize in-memory draft state for v106 daily features.
 * - Own posts, likes, comments, active comment target, diaries, selected diary date, and album items.
 * - Keep first extraction in memory only; do not add localStorage keys here.
 */

const dailyDraftStateSkeleton = Object.freeze({
  moduleName: 'dailyDraftState',
  runtimeOnlyState: [
    'scPosts',
    'scLikes',
    'scComments',
    'scCommentTarget',
    'diaries',
    'diaryDate',
    'albumItems',
  ],
  isRuntimeWired: false,
});

function createDailyDraftStateSkeleton() {
  return dailyDraftStateSkeleton;
}

void createDailyDraftStateSkeleton;

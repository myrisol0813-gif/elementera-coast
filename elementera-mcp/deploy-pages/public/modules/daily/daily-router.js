'use strict';

/**
 * Future v106 dailyRouter module.
 *
 * Current runtime owner: public/app.js, window.__v106SiliconCarbonMoments IIFE.
 * This file is intentionally not imported or loaded yet.
 *
 * Future responsibilities:
 * - Own the captured event router for the daily entry.
 * - Preserve pointer/touch/click capture order and stopImmediatePropagation timing.
 * - Route daily hall, moments, diary, album, widgets, pet, and back actions.
 * - Delegate business mutations to moments / diary / album / dailyDraftState.
 */

const dailyRouterSkeleton = Object.freeze({
  moduleName: 'dailyRouter',
  isRuntimeWired: false,
});

function createDailyRouterSkeleton() {
  return dailyRouterSkeleton;
}

void createDailyRouterSkeleton;

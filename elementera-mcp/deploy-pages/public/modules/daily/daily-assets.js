'use strict';

/**
 * Future v106 dailyAssets module.
 *
 * Current runtime owner: public/app.js, window.__v106SiliconCarbonMoments IIFE.
 * This file is intentionally not imported or loaded yet.
 *
 * Future responsibilities:
 * - Centralize avatar, cover, and image-preview helpers.
 * - Preserve the existing 小寒 avatar key when migration begins.
 * - Keep cover, diary images, and album images runtime-only until a persistence plan exists.
 * - Do not introduce new storage keys here.
 */

const dailyAssetsSkeleton = Object.freeze({
  moduleName: 'dailyAssets',
  existingAvatarKey: 'coast_avatar_xiaohan_v099',
  isRuntimeWired: false,
});

function createDailyAssetsSkeleton() {
  return dailyAssetsSkeleton;
}

void createDailyAssetsSkeleton;

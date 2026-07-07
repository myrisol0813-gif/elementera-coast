'use strict';

/**
 * Future v106 album module.
 *
 * Current runtime owner: public/app.js, window.__v106SiliconCarbonMoments IIFE.
 * This file is intentionally not imported or loaded yet.
 *
 * Future responsibilities:
 * - Render 相册 wall, sections, cards, upload form, and download action.
 * - Preserve 小寒 / Myri / 蛇蛇狗合照 categories.
 * - Store only runtime draft images until a later persistence plan exists.
 * - Avoid default fake images.
 */

const albumSkeleton = Object.freeze({
  moduleName: 'album',
  stateOwners: ['albumItems'],
  isRuntimeWired: false,
});

function createAlbumSkeleton() {
  return albumSkeleton;
}

void createAlbumSkeleton;

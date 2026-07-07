'use strict';

/**
 * Future v106 dailyRouter module.
 *
 * Current runtime owner: public/app.js, window.__v106SiliconCarbonMoments IIFE.
 * This file is intentionally not imported or loaded yet.
 *
 * P3-STRUCT-03 only stages selector/action configuration. The live handle(e),
 * targetOf(), capture listeners, and stopImmediatePropagation timing stay in app.js.
 */

(function attachDailyRouter(root) {
  const modules = (root.ElementeraDailyModules = root.ElementeraDailyModules || {});

  const DAILY_ENTRY_SELECTORS = Object.freeze([
    '[data-room="daily"]',
    '[data-room-v095="daily"]',
  ]);

  const DAILY_INTERNAL_SELECTORS = Object.freeze([
    '[data-fresh-daily-room]',
    '[data-fresh-daily-action]',
    '[data-sc-like]',
    '[data-sc-comment]',
    '[data-sc-send-comment]',
    '[data-diary-date]',
    '[data-album-download]',
  ]);

  const DAILY_CAPTURE_EVENTS = Object.freeze([
    'pointerdown',
    'touchstart',
    'touchend',
    'touchcancel',
    'click',
  ]);

  const DAILY_ACTIONS = Object.freeze({
    topBack: 'top-back',
    backDaily: 'back-daily',
    momentsCompose: 'moments-compose',
    diaryCompose: 'diary-compose',
    diaryFinish: 'diary-finish',
    albumCompose: 'album-compose',
    albumFinish: 'album-finish',
    avatarUpload: 'avatar-upload',
    coverUpload: 'cover-upload',
    publishPlaceholder: 'publish-placeholder',
    locationPlaceholder: 'location-placeholder',
  });

  modules.dailyRouter = Object.freeze({
    moduleName: 'dailyRouter',
    isRuntimeWired: false,
    DAILY_ENTRY_SELECTORS,
    DAILY_INTERNAL_SELECTORS,
    DAILY_CAPTURE_EVENTS,
    DAILY_ACTIONS,
  });
})(globalThis);

'use strict';

/**
 * Future v106 dailyAssets module.
 *
 * Current runtime owner: public/app.js, window.__v106SiliconCarbonMoments IIFE.
 * This file is intentionally not imported or loaded yet.
 *
 * P3-STRUCT-03 stages asset constants and pure helper boundaries here. It does
 * not add storage keys and does not wire these helpers into runtime.
 */

(function attachDailyAssets(root) {
  const modules = (root.ElementeraDailyModules = root.ElementeraDailyModules || {});

  const SC_XIAOHAN_AVATAR_KEY = 'coast_avatar_xiaohan_v099';
  const RUNTIME_ONLY_ASSET_KEYS = Object.freeze([
    'scCoverData',
    'composeImagePreview',
    'diaryImagePreview',
    'albumImagePreview',
  ]);

  function createInitialAvatars(storage) {
    let xiaohan = '';
    try {
      xiaohan = storage && storage.getItem(SC_XIAOHAN_AVATAR_KEY) || '';
    } catch (_) {
      xiaohan = '';
    }
    return { xiaohan, api: '', mcp: '' };
  }

  function readImageFile(file) {
    return new Promise((resolve, reject) => {
      if (!file || typeof FileReader === 'undefined') {
        resolve('');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result || '');
      reader.onerror = () => reject(reader.error || new Error('image read failed'));
      reader.readAsDataURL(file);
    });
  }

  modules.dailyAssets = Object.freeze({
    moduleName: 'dailyAssets',
    isRuntimeWired: false,
    SC_XIAOHAN_AVATAR_KEY,
    RUNTIME_ONLY_ASSET_KEYS,
    createInitialAvatars,
    readImageFile,
  });
})(globalThis);

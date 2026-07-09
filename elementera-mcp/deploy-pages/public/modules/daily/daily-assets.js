'use strict';

/**
 * P3-DAILY-REPAIR-02 canonical Daily asset helpers.
 *
 * Daily image reads and one-shot image picking are owned here. Feature modules
 * may render their own input positions, but file-to-data-url conversion should
 * flow through this module so router/actions do not depend on ad-hoc element ids
 * such as scAvatarInput.
 */

(function attachDailyAssets(root) {
  const modules = (root.ElementeraDailyModules = root.ElementeraDailyModules || {});

  const VERSION = 'P3-DAILY-REPAIR-02';
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
      if (!file || typeof root.FileReader === 'undefined') {
        resolve('');
        return;
      }
      const reader = new root.FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('image read failed'));
      reader.readAsDataURL(file);
    });
  }

  function pickImageDataUrl({ accept = 'image/*' } = {}) {
    return new Promise((resolve, reject) => {
      if (!root.document || typeof root.FileReader === 'undefined') {
        resolve('');
        return;
      }
      const input = root.document.createElement('input');
      input.type = 'file';
      input.accept = accept;
      input.hidden = true;
      input.setAttribute('data-daily-asset-picker', VERSION);
      input.onchange = () => {
        const file = input.files && input.files[0];
        readImageFile(file)
          .then(resolve)
          .catch(reject)
          .finally(() => input.remove());
      };
      input.oncancel = () => {
        input.remove();
        resolve('');
      };
      root.document.body.appendChild(input);
      input.click();
    });
  }

  modules.dailyAssets = Object.freeze({
    moduleName: 'dailyAssets',
    VERSION,
    isRuntimeWired: true,
    SC_XIAOHAN_AVATAR_KEY,
    RUNTIME_ONLY_ASSET_KEYS,
    createInitialAvatars,
    readImageFile,
    pickImageDataUrl,
  });
})(globalThis);

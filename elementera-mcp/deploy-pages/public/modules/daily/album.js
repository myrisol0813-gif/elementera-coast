'use strict';

/**
 * Future v106 album module.
 *
 * Current runtime owner: public/app.js, window.__v106SiliconCarbonMoments IIFE.
 * This file is intentionally not imported or loaded yet.
 *
 * P3-STRUCT-03 stages pure label helpers and album copy here. Live album
 * rendering still remains in app.js until a later wiring task.
 */

(function attachAlbum(root) {
  const modules = (root.ElementeraDailyModules = root.ElementeraDailyModules || {});

  const ALBUM_COPY = Object.freeze({
    title: '相册',
    subtitle: '本地草稿原型，暂未同步服务器',
    emptyText: '暂无图片。这里是本地草稿原型，暂未同步服务器。',
    composeTitle: '上传相册',
    composeButton: '保存本地相册预览',
    composeNotice: '本地草稿原型，暂未同步服务器。刷新后可能消失。',
  });

  const ALBUM_CATEGORIES = Object.freeze({
    xiaohan: '小寒',
    myri: 'Myri',
    together: '蛇蛇狗合照',
  });

  const ALBUM_BORDER_COLORS = Object.freeze([
    '#d9a441',
    '#8fb0bd',
    '#d78fb1',
    '#88b86a',
    '#b49bdf',
    '#ef9c74',
    '#7fb9a8',
    '#d0c269',
  ]);

  function albumLabel(category) {
    return ALBUM_CATEGORIES[category] || ALBUM_CATEGORIES.xiaohan;
  }

  function albumBorderColor(index) {
    return ALBUM_BORDER_COLORS[index % ALBUM_BORDER_COLORS.length];
  }

  function createAlbumDraft({ id, image, cat } = {}) {
    return {
      id: id || `album-${Date.now()}`,
      image: image || '',
      cat: cat || 'xiaohan',
    };
  }

  modules.album = Object.freeze({
    moduleName: 'album',
    isRuntimeWired: false,
    ALBUM_COPY,
    ALBUM_CATEGORIES,
    ALBUM_BORDER_COLORS,
    albumLabel,
    albumBorderColor,
    createAlbumDraft,
  });
})(globalThis);

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

  function escapeHtml(value) {
    return String(value ?? '').replace(
      /[&<>"']/g,
      (char) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[char],
    );
  }

  function albumCard(item = {}, index = 0) {
    const image = item.image || '';
    const id = item.id || '';
    return (
      '<figure class="album-card" style="--album-border:' +
      albumBorderColor(index) +
      '"><img src="' +
      image +
      '" alt="海岸涂鸦"><figcaption><span>' +
      escapeHtml(albumLabel(item.cat)) +
      '</span><button type="button" data-album-download="' +
      escapeHtml(id) +
      '">下载</button></figcaption></figure>'
    );
  }

  function albumSection(category, items = []) {
    const list = Array.isArray(items) ? items.filter((item) => item.cat === category) : [];
    return (
      '<section class="album-section"><h2>' +
      escapeHtml(albumLabel(category)) +
      '</h2><div class="album-grid">' +
      (list.length
        ? list.map(albumCard).join('')
        : '<div class="album-empty">' + escapeHtml(ALBUM_COPY.emptyText) + '</div>') +
      '</div></section>'
    );
  }

  function albumCategoryOptions() {
    return Object.keys(ALBUM_CATEGORIES)
      .map((category) => '<option value="' + escapeHtml(category) + '">' + escapeHtml(albumLabel(category)) + '</option>')
      .join('');
  }

  function renderAlbumHome(items = []) {
    return (
      '<button type="button" class="album-plus" data-fresh-daily-action="album-compose">＋</button>' +
      '<p class="coast-room-card">' +
      escapeHtml(ALBUM_COPY.composeNotice) +
      '</p><section class="album-wall">' +
      Object.keys(ALBUM_CATEGORIES).map((category) => albumSection(category, items)).join('') +
      '</section>'
    );
  }

  function renderAlbumCompose() {
    return (
      '<section class="album-compose"><p class="coast-room-card">' +
      escapeHtml(ALBUM_COPY.composeNotice) +
      '</p><label class="album-upload"><input id="albumImageInput" type="file" accept="image/*" hidden><span>＋</span><b>选择一张图片</b></label><div class="album-preview" id="albumPreview"></div><label class="album-select-label">归类<select id="albumCategory">' +
      albumCategoryOptions() +
      '</select></label><button type="button" class="album-finish" data-fresh-daily-action="album-finish">' +
      escapeHtml(ALBUM_COPY.composeButton) +
      '</button></section>'
    );
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
    albumCard,
    albumSection,
    albumCategoryOptions,
    renderAlbumHome,
    renderAlbumCompose,
  });
})(globalThis);

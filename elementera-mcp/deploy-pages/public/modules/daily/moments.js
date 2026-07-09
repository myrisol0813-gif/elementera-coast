'use strict';

(function attachMoments(root) {
  const modules = (root.ElementeraDailyModules = root.ElementeraDailyModules || {});
  const VERSION = 'P3-DAILY-REPAIR-03';
  const MOMENTS_COPY = Object.freeze({
    title: '硅碳圈',
    subtitle: '本地草稿原型，暂未同步服务器',
    localMeta: '本地草稿原型 · 暂未同步服务器',
    emptyTitle: '暂无动态。',
    emptyDescription: '这里是本地草稿原型，暂未同步服务器。刷新后可能消失。',
    composeTitle: '发表硅碳圈',
    composeButton: '保存本地草稿预览',
    composeNotice: '本地草稿原型，暂未同步服务器。刷新后可能消失。',
  });
  const MOMENTS_FORBIDDEN_DEFAULTS = Object.freeze([
    '这里是只有 Myri 能看见的小朋友圈。',
    '今日主屋状态：在。',
    '沿海岸保存回声。',
    '灯塔已照亮',
    '回潮记录完成',
    '好好笑',
    '那我要把脸贴到窗户上看。',
  ]);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
  ));

  function createMomentDraft({ id, text, image, location } = {}) {
    return { id: id || `local-${Date.now()}`, text: text || '', image: image || '', location: location || '' };
  }

  function createMomentPostViewModel(draft = {}) {
    return {
      id: draft.id,
      author: '小寒',
      meta: MOMENTS_COPY.localMeta,
      text: draft.text || '（无正文）',
      image: draft.image || '',
      baseComments: [],
      baseLikes: 0,
    };
  }

  const envList = (env, getter) => {
    const value = typeof env[getter] === 'function' ? env[getter]() : [];
    return Array.isArray(value) ? value : [];
  };
  const envObject = (env, getter) => {
    const value = typeof env[getter] === 'function' ? env[getter]() : {};
    return value && typeof value === 'object' ? value : {};
  };

  function avatar(env = {}, label = '寒', account = 'xiaohan') {
    if (typeof env.avatar === 'function') return env.avatar(label, account);
    return '<div class="sc-avatar sc-avatar-' + esc(account) + '">' + esc(label) + '</div>';
  }

  function coverStyle(env = {}) {
    const cover = typeof env.getMomentCover === 'function' ? env.getMomentCover() : '';
    return cover
      ? ' style="background-image:linear-gradient(rgba(0,0,0,.12),rgba(0,0,0,.12)),url(' +
          cover +
          ') !important;background-size:cover !important;background-position:center !important"'
      : '';
  }

  function commentsHtml(postId, base = [], env = {}) {
    const comments = envObject(env, 'getMomentComments');
    const target = typeof env.getMomentCommentTarget === 'function' ? env.getMomentCommentTarget() : '';
    const list = [...(Array.isArray(base) ? base : []), ...(comments[postId] || [])];
    let html = list.length
      ? '<div class="sc-comments">' + list.map((item) => '<p><b>' + esc(item.who || '小寒') + ':</b> ' + esc(item.text || '') + '</p>').join('') + '</div>'
      : '';
    if (target === postId) {
      html += '<div class="sc-comment-editor"><input id="scCommentInput" placeholder="写评论"><button type="button" data-sc-send-comment="' + esc(postId) + '">发送</button></div>';
    }
    return html;
  }

  function momentCard(view = {}, env = {}) {
    const likes = envObject(env, 'getMomentLikes');
    const liked = !!likes[view.id];
    const count = Number(view.baseLikes || 0) + (liked ? 1 : 0);
    const image = view.image ? '<img class="sc-post-image" src="' + view.image + '" alt="硅碳圈配图">' : '';
    return (
      '<article class="sc-post sc-post-xiaohan"><div class="sc-post-avatar">' +
      avatar(env, '寒', 'xiaohan') +
      '</div><div class="sc-post-main"><h3>' +
      esc(view.author || '小寒') +
      '</h3><p>' +
      esc(view.text || '（无正文）') +
      '</p>' +
      image +
      '<div class="sc-post-actions"><span>' +
      esc(view.meta || MOMENTS_COPY.localMeta) +
      '</span><button type="button" class="' +
      (liked ? 'is-liked' : '') +
      '" data-sc-like="' +
      esc(view.id || '') +
      '">♡ ' +
      count +
      '</button><button type="button" data-sc-comment="' +
      esc(view.id || '') +
      '">评论</button></div>' +
      commentsHtml(view.id, view.baseComments, env) +
      '</div></article>'
    );
  }

  function renderMomentsHome(env = {}) {
    const posts = envList(env, 'getMoments').map(createMomentPostViewModel);
    const feed = posts.length
      ? posts.map((post) => momentCard(post, env)).join('')
      : '<section class="coast-room-card"><h2>' + esc(MOMENTS_COPY.emptyTitle) + '</h2><p>' + esc(MOMENTS_COPY.emptyDescription) + '</p></section>';
    return (
      '<button type="button" class="sc-plus" data-fresh-daily-action="moments-compose">＋</button>' +
      '<button type="button" class="sc-cover sc-cover-static" data-fresh-daily-action="cover-upload"' +
      coverStyle(env) +
      '><span>上传封面</span></button>' +
      '<section class="sc-profile"><button type="button" class="sc-profile-avatar" data-fresh-daily-action="avatar-upload">' +
      avatar(env, '寒', 'xiaohan') +
      '</button><h2>小寒</h2><p>' +
      esc(MOMENTS_COPY.subtitle) +
      '</p></section><section class="sc-feed">' +
      feed +
      '</section>'
    );
  }

  function renderMomentsCompose() {
    return (
      '<section class="sc-compose"><p class="coast-room-card">' +
      esc(MOMENTS_COPY.composeNotice) +
      '</p><textarea id="scComposeText" placeholder="这一刻的想法..." rows="5"></textarea><div class="sc-compose-images"><label><input id="scComposeInput" type="file" accept="image/*" hidden><span class="sc-upload-box">＋</span></label><div class="sc-compose-preview" id="scComposePreview"></div></div><button type="button" class="sc-location" data-fresh-daily-action="location-placeholder"><b>所在位置</b><span>暂未接入</span></button><button type="button" class="sc-publish-note" data-fresh-daily-action="publish-placeholder">' +
      esc(MOMENTS_COPY.composeButton) +
      '</button></section>'
    );
  }

  function bindImagePreview(env = {}) {
    if (typeof env.q !== 'function' || typeof env.readImageFile !== 'function') return false;
    const input = env.q('#scComposeInput');
    const preview = env.q('#scComposePreview');
    if (!input || !preview) return false;
    input.onchange = () => {
      const file = input.files && input.files[0];
      env.readImageFile(file).then((image) => {
        if (!image) return;
        preview.dataset.image = image;
        preview.innerHTML = '<img src="' + image + '" alt="preview">';
      }).catch(() => undefined);
    };
    return true;
  }

  function openMoments(env = {}) {
    if (typeof env.panel !== 'function') return false;
    env.panel(MOMENTS_COPY.title, MOMENTS_COPY.subtitle, renderMomentsHome(env), 'moments');
    return true;
  }

  function openMomentsCompose(env = {}) {
    if (typeof env.panel !== 'function') return false;
    env.panel(MOMENTS_COPY.composeTitle, MOMENTS_COPY.subtitle, renderMomentsCompose(), 'compose');
    bindImagePreview(env);
    return true;
  }

  function finishMoment(env = {}) {
    if (typeof env.q !== 'function') return false;
    const text = (env.q('#scComposeText')?.value || '').trim();
    const image = env.q('#scComposePreview')?.dataset.image || '';
    if (text || image) {
      const next = [createMomentDraft({ text, image }), ...envList(env, 'getMoments')];
      if (typeof env.setMoments === 'function') env.setMoments(next);
    }
    if (typeof env.openMoments === 'function') env.openMoments();
    return true;
  }

  function toggleLike(env = {}, postId) {
    if (!postId) return false;
    const likes = { ...envObject(env, 'getMomentLikes') };
    likes[postId] = !likes[postId];
    if (typeof env.setMomentLikes === 'function') env.setMomentLikes(likes);
    openMoments(env);
    return true;
  }

  function toggleComment(env = {}, postId) {
    if (!postId) return false;
    const current = typeof env.getMomentCommentTarget === 'function' ? env.getMomentCommentTarget() : '';
    if (typeof env.setMomentCommentTarget === 'function') env.setMomentCommentTarget(current === postId ? '' : postId);
    openMoments(env);
    return true;
  }

  function sendComment(env = {}, postId) {
    if (!postId || typeof env.q !== 'function') return false;
    const text = (env.q('#scCommentInput')?.value || '').trim();
    const comments = { ...envObject(env, 'getMomentComments') };
    if (text) comments[postId] = [...(comments[postId] || []), { who: '小寒', text }];
    if (typeof env.setMomentComments === 'function') env.setMomentComments(comments);
    if (typeof env.setMomentCommentTarget === 'function') env.setMomentCommentTarget('');
    openMoments(env);
    return true;
  }

  modules.moments = Object.freeze({
    moduleName: 'moments',
    VERSION,
    isRuntimeWired: true,
    MOMENTS_COPY,
    MOMENTS_FORBIDDEN_DEFAULTS,
    createMomentDraft,
    createMomentPostViewModel,
    momentCard,
    renderMomentsHome,
    renderMomentsCompose,
    bindImagePreview,
    openMoments,
    openMomentsCompose,
    finishMoment,
    toggleLike,
    toggleComment,
    sendComment,
  });
})(globalThis);

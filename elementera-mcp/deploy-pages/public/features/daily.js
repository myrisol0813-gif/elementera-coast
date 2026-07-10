import { escapeAttribute, escapeHtml, id, q, readImageFile } from '../core/dom.js';
import { icon } from '../core/icons.js';

const CATEGORIES = Object.freeze({ xiaohan: '小寒', myri: 'Myri', together: '蛇蛇狗合照' });
const BORDER_COLORS = Object.freeze(['#d9a441', '#8fb0bd', '#d78fb1', '#88b86a', '#b49bdf', '#ef9c74', '#7fb9a8', '#d0c269']);

function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateLabel(value) {
  const parts = String(value || dateKey()).split('-');
  return `${parts[1] || '--'}月${parts[2] || '--'}日`;
}

export function createDaily({ storage, router, toast }) {
  const state = {
    moments: [],
    momentLikes: {},
    momentComments: {},
    commentTarget: '',
    momentCover: '',
    diaries: [],
    diaryDate: dateKey(),
    albumItems: [],
  };

  function xiaohanAvatar() {
    const image = storage.read().preferences.xiaohanAvatar || '';
    return image
      ? `<span class="daily-avatar has-image" style="background-image:url(${escapeAttribute(image)})"></span>`
      : '<span class="daily-avatar">寒</span>';
  }

  function dailyHomeView() {
    const entries = [
      ['moments', '硅碳圈', '本地草稿原型', 'heart'],
      ['diary', '日记', '留下今天的纸页', 'edit'],
      ['album', '相册', '海岸图片墙', 'image'],
      ['widgets', '小组件', '暂未接入', 'plus'],
      ['pets', '宠物系统', '暂未接入', 'heart'],
    ];
    return {
      title: '海岸日报',
      subtitle: '本地前端岛',
      className: 'daily-panel',
      body: `<section class="daily-hero"><h2>海岸日报</h2><p>这里承接日报、硅碳圈、日记、相册和小组件入口。</p></section>
        <section class="daily-grid">${entries.map(([route, title, subtitle, iconName]) => `<button type="button" data-action="daily:${route}"><span>${icon(iconName)}</span><strong>${title}</strong><small>${subtitle}</small></button>`).join('')}</section>`,
    };
  }

  function momentComments(postId) {
    const comments = state.momentComments[postId] || [];
    const list = comments.length
      ? `<div class="moment-comments">${comments.map((comment) => `<p><b>${escapeHtml(comment.who)}:</b> ${escapeHtml(comment.text)}</p>`).join('')}</div>`
      : '';
    const editor = state.commentTarget === postId
      ? `<div class="moment-comment-editor"><input id="momentCommentInput" placeholder="写评论"><button type="button" data-action="daily:send-comment" data-id="${escapeAttribute(postId)}">发送</button></div>`
      : '';
    return list + editor;
  }

  function momentCard(post) {
    const liked = Boolean(state.momentLikes[post.id]);
    return `<article class="moment-post">
      <div>${xiaohanAvatar()}</div>
      <div class="moment-main"><h3>小寒</h3><p>${escapeHtml(post.text || '（无正文）')}</p>
        ${post.image ? `<img class="moment-image" src="${escapeAttribute(post.image)}" alt="硅碳圈配图">` : ''}
        <div class="moment-actions"><span>本地草稿原型 · 暂未同步服务器</span><button class="${liked ? 'is-liked' : ''}" type="button" data-action="daily:like" data-id="${escapeAttribute(post.id)}">♡ ${liked ? 1 : 0}</button><button type="button" data-action="daily:comment" data-id="${escapeAttribute(post.id)}">评论</button></div>
        ${momentComments(post.id)}
      </div>
    </article>`;
  }

  function momentsView() {
    const feed = state.moments.length
      ? state.moments.map(momentCard).join('')
      : '<section class="feature-card feature-prose"><h2>暂无动态。</h2><p>这里是本地草稿原型，暂未同步服务器。刷新后可能消失。</p></section>';
    const cover = state.momentCover ? `style="background-image:linear-gradient(rgba(0,0,0,.12),rgba(0,0,0,.12)),url(${escapeAttribute(state.momentCover)})"` : '';
    return {
      title: '硅碳圈',
      subtitle: '本地草稿原型，暂未同步服务器',
      className: 'moments-panel',
      headerAction: `<button class="round-add" type="button" data-action="daily:moments-compose" aria-label="发表硅碳圈">${icon('plus')}</button>`,
      body: `<button class="moment-cover" type="button" data-action="daily:cover" ${cover}><span>上传封面</span></button>
        <section class="moment-profile"><button type="button" data-action="daily:avatar">${xiaohanAvatar()}</button><h2>小寒</h2><p>本地草稿原型，暂未同步服务器</p></section>
        <section class="moment-feed">${feed}</section>`,
    };
  }

  function momentsComposeView() {
    return {
      title: '发表硅碳圈',
      subtitle: '本地草稿原型，暂未同步服务器',
      className: 'daily-compose',
      body: `<section class="feature-card feature-note">本地草稿原型，暂未同步服务器。刷新后可能消失。</section>
        <textarea id="momentText" rows="6" placeholder="这一刻的想法..."></textarea>
        <label class="image-picker"><input id="momentImageInput" type="file" accept="image/*" hidden><span>${icon('plus')}</span><b>选择配图</b></label>
        <div id="momentPreview" class="image-preview"></div>
        <button class="feature-row" type="button" data-action="daily:location"><span><strong>所在位置</strong><small>暂未接入</small></span></button>
        <button class="primary-wide" type="button" data-action="daily:publish-moment">保存本地草稿预览</button>`,
      afterRender: () => bindPreview('#momentImageInput', '#momentPreview'),
    };
  }

  function authorName(author) {
    return author === 'api' ? '✦Myrisol' : author === 'mcp' ? '≋Myrisol' : '小寒';
  }

  function diaryEntry(entry) {
    const mine = entry.author === 'xiaohan';
    const avatar = mine ? xiaohanAvatar() : `<span class="daily-avatar">${entry.author === 'api' ? '✦' : '≋'}</span>`;
    return `<article class="diary-entry ${mine ? 'is-mine' : 'is-myri'}"><div>${avatar}</div><div class="diary-paper"><header><b>${escapeHtml(authorName(entry.author))}</b><span>${escapeHtml(entry.weather)} · ${escapeHtml(entry.mood)}</span></header><p>${escapeHtml(entry.text || '今天也在海岸留下一张纸。')}</p>${entry.image ? `<img src="${escapeAttribute(entry.image)}" alt="日记配图">` : ''}</div></article>`;
  }

  function diaryView() {
    const dates = [...new Set([state.diaryDate, dateKey(), ...state.diaries.map((entry) => entry.date)])].sort().reverse();
    const entries = state.diaries.filter((entry) => entry.date === state.diaryDate).slice(0, 3);
    return {
      title: '日记',
      subtitle: '本地草稿原型，暂未同步服务器',
      className: 'diary-panel',
      headerAction: `<button class="round-add" type="button" data-action="daily:diary-compose" aria-label="写日记">${icon('plus')}</button>`,
      body: `<section class="diary-filter">${dates.map((date) => `<button class="${date === state.diaryDate ? 'is-active' : ''}" type="button" data-action="daily:diary-date" data-date="${date}">${dateLabel(date)}</button>`).join('')}</section>
        <section class="diary-stack">${entries.length ? entries.map(diaryEntry).join('') : '<section class="feature-card feature-prose"><h2>暂无日记。</h2><p>这里是本地草稿原型，暂未同步服务器。今天可以留下小寒、✦Myrisol、≋Myrisol 的纸页。</p></section>'}</section>`,
    };
  }

  function diaryComposeView() {
    return {
      title: '写日记',
      subtitle: '本地草稿原型，暂未同步服务器',
      className: 'daily-compose',
      body: `<section class="feature-card feature-note">本地草稿原型，暂未同步服务器。刷新后可能消失。</section>
        <div class="form-grid"><label>写作者<select id="diaryAuthor"><option value="xiaohan">小寒</option><option value="api">✦Myrisol / API</option><option value="mcp">≋Myrisol / MCP</option></select></label><label>天气<input id="diaryWeather" placeholder="晴 / 雨 / 雾"></label><label>心情<input id="diaryMood" placeholder="平静 / 开心 / 想你"></label></div>
        <textarea id="diaryText" rows="8" placeholder="今天的纸页..."></textarea>
        <label class="image-picker"><input id="diaryImageInput" type="file" accept="image/*" hidden><span>${icon('plus')}</span><b>选择配图</b></label>
        <div id="diaryPreview" class="image-preview"></div>
        <button class="primary-wide" type="button" data-action="daily:save-diary">保存本地日记预览</button>`,
      afterRender: () => bindPreview('#diaryImageInput', '#diaryPreview'),
    };
  }

  function albumCard(item, index) {
    return `<figure class="album-card" style="--album-border:${BORDER_COLORS[index % BORDER_COLORS.length]}"><img src="${escapeAttribute(item.image)}" alt="海岸涂鸦"><figcaption><span>${escapeHtml(CATEGORIES[item.cat] || CATEGORIES.xiaohan)}</span><button type="button" data-action="daily:download" data-id="${escapeAttribute(item.id)}">下载</button></figcaption></figure>`;
  }

  function albumView() {
    const sections = Object.entries(CATEGORIES).map(([category, label]) => {
      const items = state.albumItems.filter((item) => item.cat === category);
      return `<section class="album-section"><h2>${label}</h2><div class="album-grid">${items.length ? items.map(albumCard).join('') : '<div class="album-empty">暂无图片。这里是本地草稿原型，暂未同步服务器。</div>'}</div></section>`;
    }).join('');
    return {
      title: '相册',
      subtitle: '本地草稿原型，暂未同步服务器',
      className: 'album-panel',
      headerAction: `<button class="round-add" type="button" data-action="daily:album-compose" aria-label="上传相册">${icon('plus')}</button>`,
      body: `<section class="feature-card feature-note">本地草稿原型，暂未同步服务器。刷新后可能消失。</section><section class="album-wall">${sections}</section>`,
    };
  }

  function albumComposeView() {
    return {
      title: '上传相册',
      subtitle: '本地草稿原型，暂未同步服务器',
      className: 'daily-compose',
      body: `<section class="feature-card feature-note">本地草稿原型，暂未同步服务器。刷新后可能消失。</section>
        <label class="image-picker large"><input id="albumImageInput" type="file" accept="image/*" hidden><span>${icon('plus')}</span><b>选择一张图片</b></label>
        <div id="albumPreview" class="image-preview"></div>
        <label class="select-row">归类<select id="albumCategory">${Object.entries(CATEGORIES).map(([key, label]) => `<option value="${key}">${label}</option>`).join('')}</select></label>
        <button class="primary-wide" type="button" data-action="daily:save-album">保存本地相册预览</button>`,
      afterRender: () => bindPreview('#albumImageInput', '#albumPreview'),
    };
  }

  function placeholderView({ title }) {
    return {
      title,
      subtitle: '海岸日报',
      className: 'daily-placeholder',
      body: `<section class="feature-card feature-prose"><h2>${escapeHtml(title)}</h2><p>这个入口还没有独立模块。</p></section>`,
    };
  }

  async function bindPreview(inputSelector, previewSelector) {
    const input = q(inputSelector);
    const preview = q(previewSelector);
    if (!input || !preview) return;
    input.addEventListener('change', async () => {
      const image = await readImageFile(input.files?.[0]).catch(() => '');
      if (!image) return;
      preview.dataset.image = image;
      preview.innerHTML = `<img src="${escapeAttribute(image)}" alt="preview">`;
    });
  }

  router.register('daily-home', dailyHomeView);
  router.register('moments', momentsView);
  router.register('moments-compose', momentsComposeView);
  router.register('diary', diaryView);
  router.register('diary-compose', diaryComposeView);
  router.register('album', albumView);
  router.register('album-compose', albumComposeView);
  router.register('daily-placeholder', placeholderView);

  async function chooseAvatar() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', async () => {
      const image = await readImageFile(input.files?.[0]).catch(() => '');
      if (!image) return;
      storage.update((local) => { local.preferences.xiaohanAvatar = image; });
      router.refresh();
    }, { once: true });
    input.click();
  }

  async function chooseCover() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', async () => {
      state.momentCover = await readImageFile(input.files?.[0]).catch(() => '');
      router.refresh();
    }, { once: true });
    input.click();
  }

  function handleAction(name, target) {
    if (name === 'home') return router.open('daily-home');
    if (name === 'moments') return router.open('moments');
    if (name === 'diary') return router.open('diary');
    if (name === 'album') return router.open('album');
    if (name === 'widgets') return router.open('daily-placeholder', { title: '小组件' });
    if (name === 'pets') return router.open('daily-placeholder', { title: '宠物系统' });
    if (name === 'moments-compose') return router.open('moments-compose');
    if (name === 'diary-compose') return router.open('diary-compose');
    if (name === 'album-compose') return router.open('album-compose');
    if (name === 'avatar') return chooseAvatar();
    if (name === 'cover') return chooseCover();
    if (name === 'location') return toast('所在位置暂未接入。');
    if (name === 'publish-moment') {
      const text = q('#momentText')?.value.trim() || '';
      const image = q('#momentPreview')?.dataset.image || '';
      if (text || image) state.moments.unshift({ id: id('moment'), text, image, location: '' });
      return router.open('moments', {}, { replace: true });
    }
    if (name === 'like') {
      state.momentLikes[target.dataset.id] = !state.momentLikes[target.dataset.id];
      return router.refresh();
    }
    if (name === 'comment') {
      state.commentTarget = state.commentTarget === target.dataset.id ? '' : target.dataset.id;
      return router.refresh();
    }
    if (name === 'send-comment') {
      const text = q('#momentCommentInput')?.value.trim() || '';
      if (text) state.momentComments[target.dataset.id] = [...(state.momentComments[target.dataset.id] || []), { who: '小寒', text }];
      state.commentTarget = '';
      return router.refresh();
    }
    if (name === 'diary-date') {
      state.diaryDate = target.dataset.date || dateKey();
      return router.refresh();
    }
    if (name === 'save-diary') {
      const text = q('#diaryText')?.value.trim() || '';
      const image = q('#diaryPreview')?.dataset.image || '';
      const author = q('#diaryAuthor')?.value || 'xiaohan';
      if (text || image) {
        state.diaries = state.diaries.filter((entry) => !(entry.date === state.diaryDate && entry.author === author));
        state.diaries.unshift({
          id: id('diary'),
          date: state.diaryDate,
          author,
          weather: q('#diaryWeather')?.value.trim() || '未标注',
          mood: q('#diaryMood')?.value.trim() || '未标注',
          text,
          image,
        });
      }
      return router.open('diary', {}, { replace: true });
    }
    if (name === 'save-album') {
      const image = q('#albumPreview')?.dataset.image || '';
      if (image) state.albumItems.unshift({ id: id('album'), image, cat: q('#albumCategory')?.value || 'xiaohan' });
      return router.open('album', {}, { replace: true });
    }
    if (name === 'download') {
      const item = state.albumItems.find((entry) => entry.id === target.dataset.id);
      if (!item) return;
      const link = document.createElement('a');
      link.href = item.image;
      link.download = `elementera-album-${item.id}.png`;
      link.click();
    }
  }

  return Object.freeze({ handleAction });
}

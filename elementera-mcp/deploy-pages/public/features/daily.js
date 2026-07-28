import { escapeAttribute, escapeHtml, id, q, readImageFile } from '../core/dom.js';
import { icon } from '../core/icons.js';

const CATEGORIES = Object.freeze({ xiaohan: '小寒', myri: 'Myri', together: '蛇蛇狗合照' });

function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateLabel(value) {
  const parts = String(value || dateKey()).split('-');
  return `${parts[1] || '--'}月${parts[2] || '--'}日`;
}

function timeLabel(value) {
  const date = new Date(Number(value) || Date.now());
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function uniqueDates(current, ...collections) {
  const dates = new Set([current, dateKey()]);
  for (const collection of collections) {
    for (const item of collection || []) dates.add(item.date || dateKey(new Date(Number(item.createdAt) || Date.now())));
  }
  return [...dates].sort().reverse();
}

function entryDate(entry) {
  return entry.date || dateKey(new Date(Number(entry.createdAt) || Date.now()));
}

export function createDaily({ storage, router, toast }) {
  const saved = storage.read().daily || {};
  const state = {
    moments: saved.moments || [],
    momentLikes: saved.momentLikes || {},
    momentComments: saved.momentComments || {},
    commentTarget: '',
    momentCover: saved.momentCover || '',
    diaries: saved.diaries || [],
    diaryDate: dateKey(),
    albumItems: saved.albumItems || [],
    summaries: saved.summaries || [],
    summaryDate: dateKey(),
  };

  function persistDaily() {
    storage.update((local) => {
      local.daily = {
        moments: state.moments,
        momentLikes: state.momentLikes,
        momentComments: state.momentComments,
        momentCover: state.momentCover,
        diaries: state.diaries,
        albumItems: state.albumItems,
        summaries: state.summaries,
      };
    });
  }

  function xiaohanAvatar() {
    const image = storage.read().preferences.xiaohanAvatar || '';
    return image
      ? `<span class="daily-avatar has-image" style="background-image:url(${escapeAttribute(image)})"></span>`
      : '<span class="daily-avatar">寒</span>';
  }

  function summaryFor(date = dateKey()) {
    return state.summaries.find((entry) => entry.date === date) || null;
  }

  function dailyHomeView() {
    const today = dateKey();
    const todaySummary = summaryFor(today);
    const entries = [
      ['summary', '一日总结', todaySummary ? '今天已经收束' : '把今天轻轻合上', 'edit'],
      ['moments', '碳硅圈', '小寒的朋友圈页面', 'heart'],
      ['diary', '日记', '留下今天的纸页', 'edit'],
      ['album', '相册', '海岸图片墙', 'image'],
      ['widgets', '小组件', '暂未接入', 'plus'],
      ['pets', '宠物系统', '暂未接入', 'heart'],
    ];
    return {
      title: '海岸日报',
      subtitle: '本机保存的日常岛',
      className: 'daily-panel',
      body: `<section class="daily-hero"><h2>海岸日报</h2><p>这里承接一日总结、碳硅圈、日记、相册和小组件入口。</p></section>
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
    const stamp = `${dateLabel(entryDate(post))} · ${timeLabel(post.createdAt)}`;
    return `<article class="moment-post">
      <div>${xiaohanAvatar()}</div>
      <div class="moment-main"><h3>小寒</h3><p>${escapeHtml(post.text || '（无正文）')}</p>
        ${post.image ? `<img class="moment-image" src="${escapeAttribute(post.image)}" alt="碳硅圈配图">` : ''}
        <div class="moment-actions"><span>${stamp} · 本机保存</span><button class="${liked ? 'is-liked' : ''}" type="button" data-action="daily:like" data-id="${escapeAttribute(post.id)}">♡ ${liked ? 1 : 0}</button><button type="button" data-action="daily:comment" data-id="${escapeAttribute(post.id)}">评论</button></div>
        ${momentComments(post.id)}
      </div>
    </article>`;
  }

  function momentsView() {
    const feed = state.moments.length
      ? state.moments.map(momentCard).join('')
      : '<section class="daily-empty"><h2>暂无动态。</h2><p>这里会放小寒写下的碳硅圈。内容会保存在本机，未来再接服务器同步。</p></section>';
    const cover = state.momentCover ? `style="background-image:linear-gradient(rgba(0,0,0,.12),rgba(0,0,0,.12)),url(${escapeAttribute(state.momentCover)})"` : '';
    return {
      title: '碳硅圈',
      subtitle: '小寒的页面 · 本机保存',
      className: 'moments-panel',
      headerAction: `<button class="round-add" type="button" data-action="daily:moments-compose" aria-label="发表碳硅圈">${icon('plus')}</button>`,
      body: `<button class="moment-cover" type="button" data-action="daily:cover" ${cover}><span>上传封面</span></button>
        <section class="moment-profile"><button type="button" data-action="daily:avatar">${xiaohanAvatar()}</button><div><h2>小寒</h2><p>本机保存 · 未来给 Myri / MCP / API 留入口</p></div></section>
        <section class="moment-feed">${feed}</section>`,
    };
  }

  function momentsComposeView() {
    return {
      title: '发表碳硅圈',
      subtitle: '本机保存',
      className: 'daily-compose',
      body: `<p class="daily-context">写给小寒自己的页面。现在先本机保存，未来再接服务器同步。</p>
        <textarea id="momentText" class="moment-compose-text" rows="8" placeholder="这一刻的想法..."></textarea>
        <label class="image-picker" aria-label="选择配图"><input id="momentImageInput" type="file" accept="image/*" hidden><span>${icon('plus')}</span></label>
        <div id="momentPreview" class="image-preview"></div>
        <button class="compose-location" type="button" data-action="daily:location"><span><strong>所在位置</strong><small>暂未接入</small></span><b>›</b></button>
        <button class="primary-wide" type="button" data-action="daily:publish-moment">发布到碳硅圈</button>`,
      afterRender: () => bindPreview('#momentImageInput', '#momentPreview'),
    };
  }

  function authorName(author) {
    return author === 'api' ? '✦Myrisol' : author === 'mcp' ? '≋Myrisol' : '小寒';
  }

  function diaryEntry(entry) {
    return `<article class="diary-paper"><header><b>${escapeHtml(authorName(entry.author))}</b><span>${escapeHtml(entry.weather)} · ${escapeHtml(entry.mood)}</span></header><p>${escapeHtml(entry.text || '今天也在海岸留下一张纸。')}</p>${entry.image ? `<img src="${escapeAttribute(entry.image)}" alt="日记配图">` : ''}</article>`;
  }

  function diaryView() {
    const dates = uniqueDates(state.diaryDate, state.diaries);
    const entries = state.diaries.filter((entry) => entry.date === state.diaryDate).slice(0, 3);
    return {
      title: '日记',
      subtitle: '本机保存',
      className: 'diary-panel',
      headerAction: `<button class="round-add" type="button" data-action="daily:diary-compose" aria-label="写日记">${icon('plus')}</button>`,
      body: `<section class="diary-filter">${dates.map((date) => `<button class="${date === state.diaryDate ? 'is-active' : ''}" type="button" data-action="daily:diary-date" data-date="${date}">${dateLabel(date)}</button>`).join('')}</section>
        <section class="diary-stack">${entries.length ? entries.map(diaryEntry).join('') : '<section class="daily-empty"><h2>暂无日记。</h2><p>今天可以留下小寒、✦Myrisol、≋Myrisol 的纸页。</p></section>'}</section>`,
    };
  }

  function diaryComposeView() {
    return {
      title: '写日记',
      subtitle: '本机保存',
      className: 'daily-compose',
      body: `<p class="daily-context">一天最多三张纸页：小寒、✦Myrisol、≋Myrisol 各一张。同日同作者再次收笔会替换当天纸页。</p>
        <section class="daily-form-surface">
          <div class="form-grid"><label>写作者<select id="diaryAuthor"><option value="xiaohan">小寒</option><option value="api">✦Myrisol / API</option><option value="mcp">≋Myrisol / MCP</option></select></label><label>天气<input id="diaryWeather" placeholder="晴 / 雨 / 雾"></label><label>心情<input id="diaryMood" placeholder="平静 / 开心 / 想你"></label></div>
          <textarea id="diaryText" rows="8" placeholder="今天的小句子..."></textarea>
          <label class="image-picker" aria-label="选择日记配图"><input id="diaryImageInput" type="file" accept="image/*" hidden><span>${icon('plus')}</span></label>
          <div id="diaryPreview" class="image-preview"></div>
          <button class="primary-wide" type="button" data-action="daily:save-diary">收笔</button>
        </section>`,
      afterRender: () => bindPreview('#diaryImageInput', '#diaryPreview'),
    };
  }

  function albumCard(item) {
    return `<figure class="album-card"><img src="${escapeAttribute(item.image)}" alt="海岸涂鸦"><figcaption><span>${escapeHtml(CATEGORIES[item.cat] || CATEGORIES.xiaohan)}</span><button type="button" data-action="daily:download" data-id="${escapeAttribute(item.id)}">下载</button></figcaption></figure>`;
  }

  function albumView() {
    const sections = Object.entries(CATEGORIES).map(([category, label]) => {
      const items = state.albumItems.filter((item) => item.cat === category);
      return `<section class="album-section"><h2>${label}</h2><div class="album-grid">${items.length ? items.map(albumCard).join('') : '<div class="album-empty">暂无图片。这里会放海岸的小画片。</div>'}</div></section>`;
    }).join('');
    return {
      title: '相册',
      subtitle: '本机保存',
      className: 'album-panel',
      headerAction: `<button class="round-add" type="button" data-action="daily:album-compose" aria-label="上传相册">${icon('plus')}</button>`,
      body: `<p class="daily-context">本机保存的海岸图片墙。</p><section class="album-wall">${sections}</section>`,
    };
  }

  function albumComposeView() {
    return {
      title: '上传相册',
      subtitle: '本机保存',
      className: 'daily-compose',
      body: `<p class="daily-context">选择一张小画片放进海岸相册。</p>
        <section class="daily-form-surface album-compose-surface">
          <label class="image-picker large" aria-label="选择一张图片"><input id="albumImageInput" type="file" accept="image/*" hidden><span>${icon('plus')}</span></label>
          <div id="albumPreview" class="image-preview"></div>
          <label class="select-row">归类<select id="albumCategory">${Object.entries(CATEGORIES).map(([key, label]) => `<option value="${key}">${label}</option>`).join('')}</select></label>
          <button class="primary-wide" type="button" data-action="daily:save-album">保存到本机相册</button>
        </section>`,
      afterRender: () => bindPreview('#albumImageInput', '#albumPreview'),
    };
  }

  function entriesForSummary(date) {
    return {
      diaries: state.diaries.filter((entry) => entry.date === date),
      moments: state.moments.filter((entry) => entryDate(entry) === date),
      albums: state.albumItems.filter((entry) => entryDate(entry) === date),
    };
  }

  function draftSummaryText(date) {
    const { diaries, moments, albums } = entriesForSummary(date);
    const lines = [`${dateLabel(date)}的一日总结`];

    if (!diaries.length && !moments.length && !albums.length) {
      lines.push('今天还没有留下纸页、动态或小画片。');
      lines.push('也可以只写一句：今天在海岸停了一会儿。');
      return lines.join('\n');
    }

    if (moments.length) {
      lines.push('', '碳硅圈：');
      for (const moment of moments.slice(0, 3)) lines.push(`- ${moment.text ? moment.text.slice(0, 80) : '留下了一张配图。'}`);
    }

    if (diaries.length) {
      lines.push('', '日记：');
      for (const diary of diaries.slice(0, 3)) {
        const label = `${authorName(diary.author)} · ${diary.weather || '未标注'} · ${diary.mood || '未标注'}`;
        lines.push(`- ${label}：${(diary.text || '留下了一张纸。').slice(0, 80)}`);
      }
    }

    if (albums.length) lines.push('', `相册：今天收下 ${albums.length} 张小画片。`);
    lines.push('', '今天可以这样合上：');
    return lines.join('\n');
  }

  function summaryCard(entry) {
    return `<article class="diary-paper"><header><b>一日总结</b><span>${dateLabel(entry.date)} · ${timeLabel(entry.updatedAt)}</span></header><p>${escapeHtml(entry.text)}</p></article>`;
  }

  function summaryView() {
    const dates = uniqueDates(state.summaryDate, state.summaries, state.diaries, state.moments, state.albumItems);
    const summary = summaryFor(state.summaryDate);
    const { diaries, moments, albums } = entriesForSummary(state.summaryDate);
    const value = summary?.text || draftSummaryText(state.summaryDate);
    return {
      title: '一日总结',
      subtitle: `${dateLabel(state.summaryDate)} · 本机保存`,
      className: 'diary-panel',
      body: `<section class="diary-filter">${dates.map((date) => `<button class="${date === state.summaryDate ? 'is-active' : ''}" type="button" data-action="daily:summary-date" data-date="${date}">${dateLabel(date)}</button>`).join('')}</section>
        <section class="daily-form-surface">
          <p class="daily-context">今日来源：碳硅圈 ${moments.length} 条 · 日记 ${diaries.length} 张 · 相册 ${albums.length} 张。</p>
          <textarea id="summaryText" rows="10" placeholder="把今天收束成几句话...">${escapeHtml(value)}</textarea>
          <button class="primary-wide" type="button" data-action="daily:save-summary">保存一日总结</button>
        </section>
        <section class="diary-stack">${summary ? summaryCard(summary) : ''}</section>`,
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
  router.register('summary', summaryView);
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
      persistDaily();
      router.refresh();
    }, { once: true });
    input.click();
  }

  function handleAction(name, target) {
    if (name === 'home') return router.open('daily-home');
    if (name === 'summary') return router.open('summary');
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
    if (name === 'summary-date') {
      state.summaryDate = target.dataset.date || dateKey();
      return router.refresh();
    }
    if (name === 'save-summary') {
      const text = q('#summaryText')?.value.trim() || '';
      if (!text) return toast('先写一点今天的收束。');
      const existing = summaryFor(state.summaryDate);
      if (existing) {
        existing.text = text;
        existing.updatedAt = Date.now();
      } else {
        state.summaries.unshift({ id: id('summary'), date: state.summaryDate, text, updatedAt: Date.now() });
      }
      persistDaily();
      toast('一日总结已保存。');
      return router.refresh();
    }
    if (name === 'publish-moment') {
      const text = q('#momentText')?.value.trim() || '';
      const image = q('#momentPreview')?.dataset.image || '';
      if (text || image) {
        const createdAt = Date.now();
        state.moments.unshift({ id: id('moment'), date: dateKey(new Date(createdAt)), createdAt, text, image, location: '' });
        persistDaily();
      }
      return router.open('moments', {}, { replace: true });
    }
    if (name === 'like') {
      state.momentLikes[target.dataset.id] = !state.momentLikes[target.dataset.id];
      persistDaily();
      return router.refresh();
    }
    if (name === 'comment') {
      state.commentTarget = state.commentTarget === target.dataset.id ? '' : target.dataset.id;
      return router.refresh();
    }
    if (name === 'send-comment') {
      const text = q('#momentCommentInput')?.value.trim() || '';
      if (text) {
        state.momentComments[target.dataset.id] = [...(state.momentComments[target.dataset.id] || []), { who: '小寒', text }];
        persistDaily();
      }
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
          updatedAt: Date.now(),
        });
        persistDaily();
      }
      return router.open('diary', {}, { replace: true });
    }
    if (name === 'save-album') {
      const image = q('#albumPreview')?.dataset.image || '';
      if (image) {
        const createdAt = Date.now();
        state.albumItems.unshift({ id: id('album'), image, cat: q('#albumCategory')?.value || 'xiaohan', date: dateKey(new Date(createdAt)), createdAt });
        persistDaily();
      }
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

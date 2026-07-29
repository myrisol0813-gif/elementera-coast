import { escapeAttribute, escapeHtml, q, readImageFile } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { createDailyClient } from './daily-client.js';

const CATEGORIES = Object.freeze({ xiaohan: '小寒', myri: 'Myri', together: '蛇蛇狗合照' });
const SUMMARY_RANGE_MODES = Object.freeze({
  SINCE_LAST: 'since_last_summary',
  TODAY: 'today',
});
const DAILY_ROUTES = new Set([
  'daily-home',
  'daily-legacy',
  'summary',
  'summary-confirm',
  'moments',
  'moments-compose',
  'diary',
  'diary-compose',
  'album',
  'album-compose',
  'daily-placeholder',
]);

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

function rangeLabel(range = {}) {
  const from = new Date(range.from || Date.now());
  const to = new Date(range.to || Date.now());
  return `${dateLabel(dateKey(from))} ${timeLabel(from)} — ${dateLabel(dateKey(to))} ${timeLabel(to)}`;
}

function shortDateLabel(value = Date.now()) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return `${date.getMonth() + 1}月${date.getDate()}日`;
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

function stableImageRef(value) {
  const clean = String(value || '').trim();
  return /^(https?:\/\/|\/|r2:\/\/|asset:\/\/|coast:\/\/)/i.test(clean) && !/^data:/i.test(clean);
}

function legacyId(prefix, value) {
  return `${prefix}-legacy-${String(value || Date.now())}`.replace(/[^\w:.-]/g, '_').slice(0, 160);
}

export function createDaily({ storage, router, toast, chat }) {
  const client = createDailyClient();
  const saved = storage.read().daily || {};
  const cache = saved.cache || {};
  const state = {
    moments: cache.moments || [],
    diaries: cache.diaries || [],
    albumItems: cache.albumItems || [],
    summaries: cache.summaries || [],
    drafts: [],
    commentTarget: '',
    myriCommentingTarget: '',
    diaryDate: dateKey(),
    momentCover: saved.momentCover || '',
    summaryDraft: null,
    summaryModel: '',
    summaryRanges: null,
    summaryRunning: false,
    summaryCommitting: false,
    loaded: false,
    loadPromise: null,
    sync: 'idle',
    syncError: '',
    legacyDrafts: saved.legacyDrafts || null,
    legacyStatus: saved.legacyStatus || 'none',
    legacyMigrating: false,
  };

  function cacheSnapshot() {
    return {
      moments: state.moments,
      diaries: state.diaries,
      albumItems: state.albumItems,
      summaries: state.summaries,
      syncedAt: state.sync === 'server' ? Date.now() : Number(cache.syncedAt || 0),
    };
  }

  function persistCache() {
    try {
      storage.update((local) => {
        local.daily.cache = cacheSnapshot();
        local.daily.momentCover = state.momentCover;
      });
    } catch (error) {
      console.warn('[daily-cache]', error);
    }
  }

  function persistLegacy() {
    storage.update((local) => {
      local.daily.legacyDrafts = state.legacyDrafts;
      local.daily.legacyStatus = state.legacyStatus;
    });
  }

  function currentDailyRoute() {
    return DAILY_ROUTES.has(router.current()?.name);
  }

  function startLoad(force = false) {
    if (state.loadPromise) return state.loadPromise;
    if (state.loaded && !force) return Promise.resolve();
    state.sync = 'loading';
    state.syncError = '';
    state.loadPromise = client.load({
      timezone_offset_minutes: new Date().getTimezoneOffset(),
    })
      .then((data) => {
        state.moments = data.moments;
        state.diaries = data.diaries;
        state.albumItems = data.albumItems;
        state.summaries = data.summaries;
        state.drafts = data.drafts || [];
        state.summaryRanges = data.summaryRanges;
        state.loaded = true;
        state.sync = 'server';
        persistCache();
      })
      .catch((error) => {
        state.loaded = true;
        state.sync = 'cache';
        state.syncError = error?.message || '服务器暂不可用。';
      })
      .finally(() => {
        state.loadPromise = null;
        if (currentDailyRoute()) router.refresh().catch(() => undefined);
      });
    return state.loadPromise;
  }

  function loadStateView(title, subtitle) {
    startLoad();
    return {
      title,
      subtitle,
      className: 'daily-panel',
      body: '<section class="daily-empty"><h2>正在从服务器读取……</h2><p>海岸日报正在把今天的纸页拿过来。</p></section>',
    };
  }

  function syncNotice() {
    if (state.sync === 'cache') {
      return `<section class="daily-sync-note is-offline"><strong>当前显示本机缓存</strong><p>${escapeHtml(state.syncError)} 服务器恢复后可以重新载入。</p><button type="button" data-action="daily:reload">重新载入</button></section>`;
    }
    return '<section class="daily-sync-note"><strong>服务器已同步</strong><p>D1 是正式数据源；本机只保留最近一次读取缓存。</p></section>';
  }

  function xiaohanAvatar() {
    const image = storage.read().preferences.xiaohanAvatar || '';
    return image
      ? `<span class="daily-avatar has-image" style="background-image:url(${escapeAttribute(image)})"></span>`
      : '<span class="daily-avatar">寒</span>';
  }

  function myriAvatar() {
    const image = storage.read().preferences.myriAvatar || '';
    return image
      ? `<span class="daily-avatar is-myri has-image" style="background-image:url(${escapeAttribute(image)})"></span>`
      : '<span class="daily-avatar is-myri">M</span>';
  }

  function momentAvatar(author) {
    if (author === 'xiaohan') return xiaohanAvatar();
    return myriAvatar();
  }

  function authorName(author, entry = {}) {
    if (entry.displayAuthor) return entry.displayAuthor;
    if (author === 'api') return '海岸 API ✦';
    if (author === 'mcp') return 'ChatGPT≋';
    if (author === 'myri') return 'Myri';
    return '小寒';
  }

  function shortModelName(modelId) {
    const bare = String(modelId || '').split('/').at(-1)?.replace(/:free$/i, '') || '';
    return bare.split(/[-_]+/).filter(Boolean).slice(0, 4).map((part) => {
      if (part.toLowerCase() === 'gpt') return 'GPT';
      if (/^[a-z]\d+[a-z]?$/i.test(part) || /^\d+[a-z]+$/i.test(part)) return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1);
    }).join(' ') || modelId;
  }

  function legacyCount() {
    const legacy = state.legacyDrafts || {};
    return ['moments', 'diaries', 'albumItems', 'summaries']
      .reduce((total, key) => total + (Array.isArray(legacy[key]) ? legacy[key].length : 0), 0);
  }

  function legacyNotice() {
    const count = legacyCount();
    if (!count) return '';
    const label = state.legacyStatus === 'completed' ? '仍保留旧本机图片或总结' : '发现旧本机草稿';
    return `<button class="daily-legacy-note" type="button" data-action="daily:legacy"><strong>${escapeHtml(label)} · ${count} 项</strong><small>查看可迁移内容与只保留在本机的图片 ›</small></button>`;
  }

  function dailyHomeView() {
    if (!state.loaded) return loadStateView('海岸日报', '正在连接服务器');
    const entries = [
      ['summary', '一日总结', state.summaries.length ? '从上次记录继续' : '选择一段时间收拢', 'edit'],
      ['moments', '碳硅圈', '海岸内部朋友圈', 'heart'],
      ['diary', '日记', '留下今天的纸页', 'edit'],
      ['album', '相册', '海岸图片引用墙', 'image'],
      ['widgets', '小组件', '暂未接入', 'plus'],
      ['pets', '宠物系统', '暂未接入', 'heart'],
    ];
    return {
      title: '海岸日报',
      subtitle: state.sync === 'server' ? '服务器同步的日常岛' : '本机缓存',
      className: 'daily-panel',
      body: `${legacyNotice()}<section class="daily-grid">${entries.map(([route, title, subtitle, iconName]) => `<button type="button" data-action="daily:${route}"><span>${icon(iconName)}</span><strong>${title}</strong><small>${subtitle}</small></button>`).join('')}</section>`,
    };
  }

  function momentComments(post) {
    const comments = post.comments || [];
    const list = comments.length
      ? `<div class="moment-comments">${comments.map((comment) => {
        const model = comment.modelId ? ` <small>· ${escapeHtml(shortModelName(comment.modelId))}</small>` : '';
        return `<p><b>${escapeHtml(comment.who)}:</b> ${escapeHtml(comment.text)}${model}</p>`;
      }).join('')}</div>`
      : '';
    const editor = state.commentTarget === post.id
      ? `<div class="moment-comment-editor"><input id="momentCommentInput" placeholder="写评论"><button type="button" data-action="daily:send-comment" data-id="${escapeAttribute(post.id)}">发送</button></div>`
      : '';
    return list + editor;
  }

  function momentStatus(post) {
    if (post.status === 'draft') return '草稿';
    if (post.status === 'candidate') return '候选';
    return '已发布';
  }

  function momentCard(post) {
    const stamp = `${dateLabel(entryDate(post))} · ${timeLabel(post.createdAt)}`;
    const myriThinking = state.myriCommentingTarget === post.id;
    const publishAction = post.status === 'published'
      ? ''
      : `<button type="button" data-action="daily:publish-moment-status" data-id="${escapeAttribute(post.id)}">确认发布</button>`;
    return `<article class="moment-post">
      <div>${momentAvatar(post.author)}</div>
      <div class="moment-main"><h3>${escapeHtml(authorName(post.author, post))}</h3><p>${escapeHtml(post.text || '（无正文）')}</p>
        ${post.image ? `<img class="moment-image" src="${escapeAttribute(post.image)}" alt="碳硅圈配图">` : ''}
        <div class="moment-actions"><span>${stamp} · ${momentStatus(post)}</span>${publishAction}<button class="${post.liked ? 'is-liked' : ''}" type="button" data-action="daily:like" data-id="${escapeAttribute(post.id)}">♡ ${Number(post.likeCount || 0)}</button><button type="button" data-action="daily:comment" data-id="${escapeAttribute(post.id)}">评论</button><button type="button" data-action="daily:myri-comment" data-id="${escapeAttribute(post.id)}" ${myriThinking ? 'disabled' : ''}>${myriThinking ? 'Myri在看…' : 'Myri回一句'}</button></div>
        ${momentComments(post)}
      </div>
    </article>`;
  }

  function momentsView() {
    if (!state.loaded) return loadStateView('碳硅圈', '正在连接服务器');
    const feed = state.moments.length
      ? state.moments.map(momentCard).join('')
      : '<section class="daily-empty"><h2>暂无动态。</h2><p>小寒或 Myri 写入的海岸内部动态会从服务器出现在这里。</p></section>';
    const cover = state.momentCover ? `style="background-image:linear-gradient(rgba(0,0,0,.12),rgba(0,0,0,.12)),url(${escapeAttribute(state.momentCover)})"` : '';
    const avatarTools = `<section class="moment-avatar-tools" aria-label="碳硅圈头像设置">
      <button type="button" data-action="daily:avatar">${xiaohanAvatar()}<span><strong>更换小寒头像</strong><small>碳硅圈里的小寒头像</small></span></button>
      <button type="button" data-action="daily:myri-avatar">${myriAvatar()}<span><strong>更换 Myri 头像</strong><small>Myri 动态与评论使用这里的头像</small></span></button>
    </section>`;
    const candidateCount = state.moments.filter((entry) => entry.status === 'candidate').length;
    const candidateNotice = candidateCount
      ? `<button class="daily-legacy-note" type="button" data-action="daily:publish-candidates"><strong>确认发布全部候选 · ${candidateCount} 条</strong><small>把一日总结里误留的候选扶正 ›</small></button>`
      : '';
    const drafts = state.drafts.filter((entry) => entry.contentType === 'moment');
    const draftSection = drafts.length
      ? `<section class="daily-form-surface daily-model-drafts"><h2>待确认碳硅圈候选 · ${drafts.length}</h2>
        ${drafts.map((entry) => contentDraftCard(entry)).join('')}</section>`
      : '';
    return {
      title: '碳硅圈',
      subtitle: state.sync === 'server' ? '海岸内部 · 服务器同步' : '本机缓存',
      className: 'moments-panel',
      headerAction: `<button class="round-add" type="button" data-action="daily:moments-compose" aria-label="发表碳硅圈">${icon('plus')}</button>`,
      body: `${state.sync === 'cache' ? syncNotice() : ''}<button class="moment-cover" type="button" data-action="daily:cover" ${cover}><span>上传本机封面</span></button>
        <section class="moment-profile"><button type="button" data-action="daily:avatar">${xiaohanAvatar()}</button><div><h2>小寒</h2><p>服务器同步 · Myri 可通过真实工具写入</p></div></section>
        ${avatarTools}${draftSection}
        ${candidateNotice}<section class="moment-feed">${feed}</section>`,
    };
  }

  function momentsComposeView() {
    return {
      title: '发表碳硅圈',
      subtitle: '发布到海岸内部服务器',
      className: 'daily-compose',
      body: `<p class="daily-context">这里适合短短记一瞬：小事、闪过去的念头、路过的心情。它只进入海岸内部碳硅圈，不会外发到微信、微博或 X。</p>
        <textarea id="momentText" class="moment-compose-text" rows="8" placeholder="这一刻的小事、心情或好玩的念头..."></textarea>
        <section class="daily-form-surface">
          <label>图片引用（可选）<input id="momentImageRef" placeholder="https://… / coast://…"></label>
          <p class="daily-context">图片上传存储尚待接入；当前只保存稳定 URL 或 coast 引用，不把 base64 写进 D1。</p>
        </section>
        <button class="compose-location" type="button" data-action="daily:location"><span><strong>所在位置</strong><small>暂未接入</small></span><b>›</b></button>
        <button class="primary-wide" type="button" data-action="daily:publish-moment">发布到碳硅圈</button>`,
    };
  }

  function diaryEntry(entry) {
    return `<article class="diary-paper"><header><b>${escapeHtml(authorName(entry.author, entry))}</b><span>${escapeHtml(entry.weather)} · ${escapeHtml(entry.mood)}</span></header><p>${escapeHtml(entry.text || '今天也在海岸留下一张纸。')}</p>${entry.image ? `<img src="${escapeAttribute(entry.image)}" alt="日记配图">` : ''}</article>`;
  }

  function contentDraftCard(entry) {
    const payload = entry.payload || {};
    const kind = entry.contentType === 'moment' ? '碳硅圈候选' : '日记草稿';
    const metadata = [
      authorName(entry.author, entry),
      entry.surface || '',
      shortDateLabel(entry.createdAt),
    ].filter(Boolean).join(' · ');
    return `<article class="summary-candidate daily-model-draft" data-draft-id="${escapeAttribute(entry.id)}">
      <small>${escapeHtml(`${kind} · ${metadata}`)}</small>
      ${entry.contentType === 'diary'
        ? `<h3>${escapeHtml(payload.date || dateKey())} · ${escapeHtml(payload.weather || '未标注')} · ${escapeHtml(payload.mood || '未标注')}</h3>`
        : ''}
      <p>${escapeHtml(payload.text || '（仅图片引用）')}</p>
      <div class="button-row">
        <button type="button" data-action="daily:discard-content-draft" data-id="${escapeAttribute(entry.id)}">丢弃</button>
        <button class="primary-wide" type="button" data-action="daily:publish-content-draft" data-id="${escapeAttribute(entry.id)}">确认发布</button>
      </div>
    </article>`;
  }

  function diaryView() {
    if (!state.loaded) return loadStateView('日记', '正在连接服务器');
    const dates = uniqueDates(state.diaryDate, state.diaries);
    const entries = state.diaries.filter((entry) => entry.date === state.diaryDate);
    const drafts = state.drafts.filter((entry) => entry.contentType === 'diary');
    const draftSection = drafts.length
      ? `<section class="daily-form-surface daily-model-drafts"><h2>待确认日记草稿 · ${drafts.length}</h2>
        ${drafts.map((entry) => contentDraftCard(entry)).join('')}</section>`
      : '';
    return {
      title: '日记',
      subtitle: state.sync === 'server' ? '服务器同步' : '本机缓存',
      className: 'diary-panel',
      headerAction: `<button class="round-add" type="button" data-action="daily:diary-compose" aria-label="写日记">${icon('plus')}</button>`,
      body: `${state.sync === 'cache' ? syncNotice() : ''}${draftSection}<section class="diary-filter">${dates.map((date) => `<button class="${date === state.diaryDate ? 'is-active' : ''}" type="button" data-action="daily:diary-date" data-date="${date}">${dateLabel(date)}</button>`).join('')}</section>
        <section class="diary-stack">${entries.length ? entries.map(diaryEntry).join('') : '<section class="daily-empty"><h2>暂无日记。</h2><p>日记只由小寒手动写入，或从一日总结确认页提交。</p></section>'}</section>`,
    };
  }

  function diaryComposeView() {
    return {
      title: '写日记',
      subtitle: '手动写入服务器',
      className: 'daily-compose',
      body: `<p class="daily-context">日记不会成为普通聊天工具。同日同作者已有纸页时，请明确选择追加或替换。</p>
        <section class="daily-form-surface">
          <div class="form-grid"><label>写作者<input value="小寒" disabled></label><label>天气<input id="diaryWeather" placeholder="晴 / 雨 / 雾"></label><label>心情<input id="diaryMood" placeholder="平静 / 开心 / 想你"></label></div>
          <textarea id="diaryText" rows="8" placeholder="今天的小句子..."></textarea>
          <label>图片引用（可选）<input id="diaryImageRef" placeholder="https://… / coast://…"></label>
          <label>同日同作者已有纸页时<select id="diaryConflictMode"><option value="append">追加一张</option><option value="replace">替换最新一张</option></select></label>
          <button class="primary-wide" type="button" data-action="daily:save-diary">收笔</button>
        </section>`,
    };
  }

  function albumCard(item) {
    return `<figure class="album-card"><img src="${escapeAttribute(item.image)}" alt="${escapeAttribute(item.caption || '海岸图片')}"><figcaption><span>${escapeHtml(item.caption || CATEGORIES[item.cat] || CATEGORIES.xiaohan)}</span><button type="button" data-action="daily:download" data-id="${escapeAttribute(item.id)}">下载</button></figcaption></figure>`;
  }

  function albumView() {
    if (!state.loaded) return loadStateView('相册', '正在连接服务器');
    const sections = Object.entries(CATEGORIES).map(([category, label]) => {
      const items = state.albumItems.filter((item) => item.cat === category);
      return `<section class="album-section"><h2>${label}</h2><div class="album-grid">${items.length ? items.map(albumCard).join('') : '<div class="album-empty">暂无图片引用。这里会放海岸的小画片。</div>'}</div></section>`;
    }).join('');
    return {
      title: '相册',
      subtitle: state.sync === 'server' ? '服务器图片引用' : '本机缓存',
      className: 'album-panel',
      headerAction: `<button class="round-add" type="button" data-action="daily:album-compose" aria-label="保存图片引用">${icon('plus')}</button>`,
      body: `${state.sync === 'cache' ? syncNotice() : ''}<p class="daily-context">第一版同步图片 URL / image_ref / coast 引用；图片上传存储待 R2 或正式文件存储接入。</p><section class="album-wall">${sections}</section>`,
    };
  }

  function bindRefPreview() {
    const input = q('#albumImageRef');
    const preview = q('#albumPreview');
    if (!input || !preview) return;
    input.addEventListener('input', () => {
      const value = input.value.trim();
      preview.innerHTML = stableImageRef(value)
        ? `<img src="${escapeAttribute(value)}" alt="preview">`
        : '';
    });
  }

  function albumComposeView() {
    return {
      title: '保存图片引用',
      subtitle: '服务器相册',
      className: 'daily-compose',
      body: `<p class="daily-context">可以保存 GPT 生图结果的稳定引用，也可以手动填写已有图片地址。不会把大 base64 塞进 D1。</p>
        <section class="daily-form-surface album-compose-surface">
          <label>图片引用<input id="albumImageRef" placeholder="https://… / coast://…"></label>
          <div id="albumPreview" class="image-preview"></div>
          <label>说明<input id="albumCaption" placeholder="这张小画片的名字或故事"></label>
          <label class="select-row">归类<select id="albumCategory">${Object.entries(CATEGORIES).map(([key, label]) => `<option value="${key}">${label}</option>`).join('')}</select></label>
          <button class="primary-wide" type="button" data-action="daily:save-album">保存到服务器相册</button>
        </section>`,
      afterRender: bindRefPreview,
    };
  }

  function summaryCard(entry) {
    const stamp = entry.range ? rangeLabel(entry.range) : dateLabel(entry.date);
    return `<article class="diary-paper"><header><b>一日总结</b><span>${escapeHtml(stamp)}</span></header><p>${escapeHtml(entry.text)}</p>${entry.unresolved?.length ? `<small>待续：${escapeHtml(entry.unresolved.join('、'))}</small>` : ''}</article>`;
  }

  function summaryRangePicker() {
    const previous = state.summaries.find((entry) => entry.range?.to);
    const today = shortDateLabel();
    const rangePreview = state.summaryRanges?.since_last_summary || {};
    const continuedFrom = previous?.range?.to || rangePreview.from;
    const hasEarlierRecord = previous || rangePreview.source === 'earliest_record';
    const continuedRange = hasEarlierRecord && continuedFrom
      ? `${shortDateLabel(continuedFrom)} 到 ${today}`
      : `尚无更早记录 · 从 ${today} 开始`;
    return `<fieldset class="summary-range-picker">
      <legend>这次收拢哪一段？</legend>
      <label>
        <input type="radio" name="summaryRangeMode" value="${SUMMARY_RANGE_MODES.SINCE_LAST}" checked>
        <span><strong>上次记录后至今</strong><small>${escapeHtml(continuedRange)}</small></span>
      </label>
      <label>
        <input type="radio" name="summaryRangeMode" value="${SUMMARY_RANGE_MODES.TODAY}">
        <span><strong>仅记录今天</strong><small>${escapeHtml(today)}</small></span>
      </label>
    </fieldset>`;
  }

  function summaryView() {
    if (!state.loaded) return loadStateView('一日总结', '正在连接服务器');
    return {
      title: '一日总结',
      subtitle: '选择这次的记录范围',
      className: 'diary-panel summary-panel',
      body: `${state.sync === 'cache' ? syncNotice() : ''}<section class="daily-form-surface summary-run-surface">
          ${summaryRangePicker()}
          <p class="daily-context">范围以点击生成的这一刻为终点；结果先进入确认页，不会立刻写入。</p>
          <button class="primary-wide" type="button" data-action="daily:run-summary">结束今日 / 生成一日总结</button>
        </section>
        <section class="diary-stack summary-history">${state.summaries.length ? state.summaries.map(summaryCard).join('') : '<section class="daily-empty"><h2>还没有正式总结。</h2><p>“上次记录后至今”会从最早仍可读取的海岸记录开始。</p></section>'}</section>`,
    };
  }

  function summaryMomentCandidate(candidate, index) {
    const selectedStatus = candidate.status === 'draft' ? 'draft' : 'published';
    const statusHint = '默认发布；候选是先放待确认，草稿是只存草稿。';
    return `<article class="summary-candidate" data-summary-moment="${index}">
      <label class="summary-select"><input type="checkbox" checked>写入碳硅圈</label>
      <textarea rows="4">${escapeHtml(candidate.text || '')}</textarea>
      <label>状态<select><option value="published" ${selectedStatus === 'published' ? 'selected' : ''}>发布</option><option value="candidate" ${selectedStatus === 'candidate' ? 'selected' : ''}>候选</option><option value="draft" ${selectedStatus === 'draft' ? 'selected' : ''}>草稿</option></select></label>
      <small>${escapeHtml([candidate.reason, statusHint].filter(Boolean).join(' · '))}</small>
    </article>`;
  }

  function summaryAlbumCandidate(candidate, index) {
    return `<article class="summary-candidate" data-summary-album="${index}">
      <label class="summary-select"><input type="checkbox" checked>保存到相册</label>
      <input value="${escapeAttribute(candidate.image_ref || '')}" aria-label="图片引用">
      <input value="${escapeAttribute(candidate.caption || '')}" aria-label="图片说明">
      <label>分类<select><option value="xiaohan" ${candidate.category === 'xiaohan' ? 'selected' : ''}>小寒</option><option value="myri" ${candidate.category === 'myri' ? 'selected' : ''}>Myri</option><option value="together" ${candidate.category === 'together' ? 'selected' : ''}>蛇蛇狗合照</option></select></label>
    </article>`;
  }

  function summaryConfirmView() {
    const draft = state.summaryDraft;
    if (!draft) return summaryView();
    const diary = draft.diary || {};
    return {
      title: '确认一日总结',
      subtitle: rangeLabel(draft.range),
      className: 'diary-panel summary-confirm-panel',
      body: `<section class="daily-form-surface">
          <h2>本次总结</h2>
          <textarea id="summaryConfirmText" rows="10">${escapeHtml(draft.summary?.text || '')}</textarea>
          <label>本次锚点（每行一项）<textarea id="summaryConfirmAnchors" class="summary-list-editor" rows="3">${escapeHtml((draft.summary?.anchors || []).join('\n'))}</textarea></label>
          <label>未完成事项（每行一项）<textarea id="summaryConfirmUnresolved" class="summary-list-editor" rows="3">${escapeHtml((draft.summary?.unresolved || []).join('\n'))}</textarea></label>
        </section>
        <section class="daily-form-surface">
          <label class="summary-select"><input id="summaryDiaryEnabled" type="checkbox" ${diary.enabled ? 'checked' : ''}>保存日记草稿</label>
          <div class="form-grid"><label>日期<input id="summaryDiaryDate" value="${escapeAttribute(diary.date || dateKey())}"></label><label>天气<input id="summaryDiaryWeather" value="${escapeAttribute(diary.weather || '未标注')}"></label><label>心情<input id="summaryDiaryMood" value="${escapeAttribute(diary.mood || '未标注')}"></label></div>
          <textarea id="summaryDiaryText" rows="7">${escapeHtml(diary.text || '')}</textarea>
          <label>同日已有海岸 API ✦ 日记时<select id="summaryDiaryConflict"><option value="append">追加一张</option><option value="replace">替换最新一张</option></select></label>
        </section>
        ${draft.moment_candidates?.length ? `<section class="daily-form-surface"><h2>碳硅圈候选</h2>${draft.moment_candidates.map(summaryMomentCandidate).join('')}</section>` : ''}
        ${draft.album_candidates?.length ? `<section class="daily-form-surface"><h2>相册候选</h2>${draft.album_candidates.map(summaryAlbumCandidate).join('')}</section>` : ''}
        <section class="summary-confirm-actions">
          <button type="button" data-action="daily:discard-summary">丢弃本次结果</button>
          <button class="primary-wide" type="button" data-action="daily:commit-summary">确认并写入服务器</button>
        </section>`,
    };
  }

  function legacySection(title, entries, render) {
    if (!entries?.length) return '';
    return `<section class="daily-form-surface"><h2>${escapeHtml(title)}</h2>${entries.map(render).join('')}</section>`;
  }

  function legacyView() {
    const legacy = state.legacyDrafts || {};
    const base64Count = [...(legacy.moments || []), ...(legacy.diaries || []), ...(legacy.albumItems || [])]
      .filter((entry) => /^data:/i.test(String(entry.image || ''))).length;
    return {
      title: '旧草稿区',
      subtitle: '一次性本机内容迁移',
      className: 'diary-panel',
      body: `<section class="daily-sync-note"><strong>旧内容不会被静默删除</strong><p>文字与稳定图片引用可以确认迁入服务器；base64 图片继续只留在本机，等待未来图片存储接入。</p></section>
        ${legacySection('旧碳硅圈', legacy.moments, (entry) => `<article class="diary-paper"><p>${escapeHtml(entry.text || '（仅图片）')}</p></article>`)}
        ${legacySection('旧日记', legacy.diaries, diaryEntry)}
        ${legacySection('旧相册', legacy.albumItems, (entry) => `<article class="diary-paper"><p>${escapeHtml(stableImageRef(entry.image) ? entry.image : '本机图片（未同步）')}</p></article>`)}
        ${legacySection('旧一日总结', legacy.summaries, summaryCard)}
        <section class="daily-form-surface">
          <p class="daily-context">共 ${legacyCount()} 项；其中 ${base64Count} 项含本机 base64 图片。旧总结先保留在这里，不伪造新的总结范围。</p>
          <button class="primary-wide" type="button" data-action="daily:migrate-legacy" ${state.legacyMigrating ? 'disabled' : ''}>${state.legacyMigrating ? '正在迁移……' : '确认迁移可同步内容'}</button>
        </section>`,
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

  router.register('daily-home', dailyHomeView);
  router.register('daily-legacy', legacyView);
  router.register('summary', summaryView);
  router.register('summary-confirm', summaryConfirmView);
  router.register('moments', momentsView);
  router.register('moments-compose', momentsComposeView);
  router.register('diary', diaryView);
  router.register('diary-compose', diaryComposeView);
  router.register('album', albumView);
  router.register('album-compose', albumComposeView);
  router.register('daily-placeholder', placeholderView);

  function replaceMoment(next) {
    state.moments = state.moments.map((entry) => entry.id === next.id ? next : entry);
    persistCache();
  }

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

  async function chooseMyriAvatar() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', async () => {
      const image = await readImageFile(input.files?.[0]).catch(() => '');
      if (!image) return;
      storage.update((local) => { local.preferences.myriAvatar = image; });
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
      persistCache();
      router.refresh();
    }, { once: true });
    input.click();
  }

  async function runSummary() {
    if (state.summaryRunning) return;
    state.summaryRunning = true;
    const button = q('[data-action="daily:run-summary"]');
    const rangeMode = q('input[name="summaryRangeMode"]:checked')?.value || SUMMARY_RANGE_MODES.SINCE_LAST;
    if (button) button.disabled = true;
    toast(rangeMode === SUMMARY_RANGE_MODES.TODAY
      ? '正在收拢今天的海岸记录……'
      : '正在收拢上次记录后至今的海岸记录……', 3200);
    try {
      const data = await client.runSummary({
        range_mode: rangeMode,
        timezone_offset_minutes: new Date().getTimezoneOffset(),
        local_date: dateKey(),
      });
      state.summaryDraft = data.draft;
      state.summaryModel = data.model || '';
      await router.open('summary-confirm', {}, { replace: true });
    } finally {
      state.summaryRunning = false;
      if (button?.isConnected) button.disabled = false;
    }
  }

  function collectSummaryCommit() {
    const draft = state.summaryDraft;
    const lines = (selector) => (q(selector)?.value || '')
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
    const moments = [...document.querySelectorAll('[data-summary-moment]')].map((root) => {
      const index = Number(root.dataset.summaryMoment);
      const source = draft.moment_candidates[index] || {};
      return {
        ...source,
        selected: Boolean(root.querySelector('input[type="checkbox"]')?.checked),
        text: root.querySelector('textarea')?.value.trim() || '',
        status: root.querySelector('select')?.value || 'published',
      };
    });
    const albums = [...document.querySelectorAll('[data-summary-album]')].map((root) => {
      const index = Number(root.dataset.summaryAlbum);
      const inputs = root.querySelectorAll('input');
      return {
        ...(draft.album_candidates[index] || {}),
        selected: Boolean(root.querySelector('input[type="checkbox"]')?.checked),
        image_ref: inputs[1]?.value.trim() || '',
        caption: inputs[2]?.value.trim() || '',
        category: root.querySelector('select')?.value || 'together',
      };
    });
    return {
      id: draft.id,
      range: draft.range,
      summary: {
        ...draft.summary,
        text: q('#summaryConfirmText')?.value.trim() || '',
        anchors: lines('#summaryConfirmAnchors'),
        unresolved: lines('#summaryConfirmUnresolved'),
      },
      diary: {
        ...draft.diary,
        enabled: Boolean(q('#summaryDiaryEnabled')?.checked),
        date: q('#summaryDiaryDate')?.value.trim() || dateKey(),
        weather: q('#summaryDiaryWeather')?.value.trim() || '未标注',
        mood: q('#summaryDiaryMood')?.value.trim() || '未标注',
        text: q('#summaryDiaryText')?.value.trim() || '',
        conflict_mode: q('#summaryDiaryConflict')?.value || 'append',
      },
      moment_candidates: moments,
      album_candidates: albums,
      model_id: state.summaryModel,
    };
  }

  async function commitSummaryDraft() {
    if (state.summaryCommitting) return;
    const value = collectSummaryCommit();
    state.summaryCommitting = true;
    const button = q('[data-action="daily:commit-summary"]');
    if (button) button.disabled = true;
    try {
      const result = await client.commitSummary(value);
      state.summaries = [result.summary, ...state.summaries.filter((entry) => entry.id !== result.summary.id)];
      if (result.diary) {
        state.diaries = [result.diary, ...state.diaries.filter((entry) => entry.id !== result.diary.id)];
      }
      const momentIds = new Set(result.moments.map((entry) => entry.id));
      state.moments = [...result.moments, ...state.moments.filter((entry) => !momentIds.has(entry.id))];
      const albumIds = new Set(result.albums.map((entry) => entry.id));
      state.albumItems = [...result.albums, ...state.albumItems.filter((entry) => !albumIds.has(entry.id))];
      state.summaryDraft = null;
      state.summaryModel = '';
      persistCache();
      toast('一日总结与所选内容已经写入服务器。', 2800);
      await router.open('summary', {}, { replace: true });
    } finally {
      state.summaryCommitting = false;
      if (button?.isConnected) button.disabled = false;
    }
  }

  async function migrateLegacy() {
    const legacy = state.legacyDrafts;
    if (!legacy || state.legacyMigrating) return;
    state.legacyMigrating = true;
    await router.refresh();
    try {
      const migratedMomentIds = new Set();
      for (const entry of legacy.moments || []) {
        const imageRef = stableImageRef(entry.image) ? entry.image : '';
        if (!entry.text && !imageRef) continue;
        const created = await client.createMoment({
          id: legacyId('moment', entry.id),
          date: entry.date || dateKey(new Date(entry.createdAt || Date.now())),
          text: entry.text || '',
          status: 'published',
          image_refs: imageRef ? [imageRef] : [],
        });
        migratedMomentIds.add(entry.id);
        for (const [index, comment] of (legacy.momentComments?.[entry.id] || []).entries()) {
          await client.commentMoment(
            created.id,
            comment.text,
            legacyId('comment', `${entry.id}-${index}`),
          );
        }
        if (legacy.momentLikes?.[entry.id]) await client.setMomentLike(created.id, true);
      }
      for (const entry of legacy.diaries || []) {
        const imageRef = stableImageRef(entry.image) ? entry.image : '';
        if (!entry.text && !imageRef) continue;
        await client.createDiary({
          id: legacyId('diary', entry.id),
          date: entry.date || dateKey(),
          author: entry.author || 'xiaohan',
          weather: entry.weather || '未标注',
          mood: entry.mood || '未标注',
          text: entry.text || '',
          image_refs: imageRef ? [imageRef] : [],
          conflict_mode: 'append',
        });
      }
      for (const entry of legacy.albumItems || []) {
        if (!stableImageRef(entry.image)) continue;
        await client.createAlbum({
          id: legacyId('album', entry.id),
          date: entry.date || dateKey(),
          category: entry.cat || 'xiaohan',
          image_ref: entry.image,
          caption: '',
        });
      }
      const retainedMoments = (legacy.moments || [])
        .filter((entry) => entry.image && !stableImageRef(entry.image));
      const retainedMomentIds = new Set(retainedMoments.map((entry) => entry.id));
      state.legacyDrafts = {
        ...legacy,
        moments: retainedMoments,
        diaries: (legacy.diaries || []).filter((entry) => entry.image && !stableImageRef(entry.image)),
        albumItems: (legacy.albumItems || []).filter((entry) => !stableImageRef(entry.image)),
        summaries: legacy.summaries || [],
        momentLikes: Object.fromEntries(Object.entries(legacy.momentLikes || {})
          .filter(([id]) => retainedMomentIds.has(id) && !migratedMomentIds.has(id))),
        momentComments: Object.fromEntries(Object.entries(legacy.momentComments || {})
          .filter(([id]) => retainedMomentIds.has(id) && !migratedMomentIds.has(id))),
      };
      state.legacyStatus = legacyCount() ? 'completed' : 'none';
      persistLegacy();
      await startLoad(true);
      toast('可同步的旧草稿已经迁入服务器；本机图片与旧总结仍安稳保留。', 3600);
    } finally {
      state.legacyMigrating = false;
      await router.refresh();
    }
  }

  async function handleAction(name, target) {
    if (name === 'home') {
      await router.open('daily-home');
      return startLoad(true);
    }
    if (name === 'legacy') return router.open('daily-legacy');
    if (name === 'reload') {
      await startLoad(true);
      return router.refresh();
    }
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
    if (name === 'myri-avatar') return chooseMyriAvatar();
    if (name === 'cover') return chooseCover();
    if (name === 'location') return toast('所在位置暂未接入。');
    if (name === 'run-summary') return runSummary();
    if (name === 'discard-summary') {
      state.summaryDraft = null;
      state.summaryModel = '';
      toast('本次生成结果已经丢弃，没有写入服务器。');
      return router.open('summary', {}, { replace: true });
    }
    if (name === 'commit-summary') return commitSummaryDraft();
    if (name === 'migrate-legacy') return migrateLegacy();
    if (name === 'publish-moment') {
      const text = q('#momentText')?.value.trim() || '';
      const imageRef = q('#momentImageRef')?.value.trim() || '';
      if (!text && !imageRef) return toast('先写一点正文或图片引用。');
      const created = await client.createMoment({
        date: dateKey(),
        text,
        status: 'published',
        image_refs: imageRef ? [imageRef] : [],
      });
      state.moments.unshift(created);
      persistCache();
      return router.open('moments', {}, { replace: true });
    }
    if (name === 'like') {
      const current = state.moments.find((entry) => entry.id === target.dataset.id);
      if (!current) return;
      replaceMoment(await client.setMomentLike(current.id, !current.liked));
      return router.refresh();
    }
    if (name === 'publish-moment-status') {
      const current = state.moments.find((entry) => entry.id === target.dataset.id);
      if (!current) return;
      replaceMoment(await client.patchMoment(current.id, { status: 'published' }));
      toast('这条动态已经确认发布。', 1800);
      return router.refresh();
    }
    if (name === 'publish-candidates') {
      const candidates = state.moments.filter((entry) => entry.status === 'candidate');
      if (!candidates.length) return toast('现在没有候选动态。');
      for (const entry of candidates) replaceMoment(await client.patchMoment(entry.id, { status: 'published' }));
      toast(`已确认发布 ${candidates.length} 条候选动态。`, 2200);
      return router.refresh();
    }
    if (name === 'publish-content-draft') {
      const current = state.drafts.find((entry) => entry.id === target.dataset.id);
      if (!current) return;
      const value = current.contentType === 'diary'
        ? { conflict_mode: 'append' }
        : {};
      const result = await client.publishDraft(current.id, value);
      state.drafts = state.drafts.filter((entry) => entry.id !== current.id);
      if (current.contentType === 'moment') {
        state.moments = [result.record, ...state.moments.filter((entry) => entry.id !== result.record.id)];
      } else {
        state.diaries = [result.record, ...state.diaries.filter((entry) => entry.id !== result.record.id)];
        state.diaryDate = result.record.date;
      }
      persistCache();
      toast(current.contentType === 'moment' ? '候选已发布到碳硅圈。' : '日记草稿已经收笔。');
      return router.refresh();
    }
    if (name === 'discard-content-draft') {
      const current = state.drafts.find((entry) => entry.id === target.dataset.id);
      if (!current) return;
      await client.discardDraft(current.id);
      state.drafts = state.drafts.filter((entry) => entry.id !== current.id);
      toast('这份草稿已丢弃，没有发布。');
      return router.refresh();
    }
    if (name === 'comment') {
      state.commentTarget = state.commentTarget === target.dataset.id ? '' : target.dataset.id;
      return router.refresh();
    }
    if (name === 'send-comment') {
      const text = q('#momentCommentInput')?.value.trim() || '';
      if (text) replaceMoment(await client.commentMoment(target.dataset.id, text));
      state.commentTarget = '';
      return router.refresh();
    }
    if (name === 'myri-comment') {
      if (state.myriCommentingTarget) return;
      const id = target.dataset.id;
      const model = chat?.getProfile?.().current_chat_model || '';
      if (!model) return toast('先在主页选择一个聊天模型。');
      state.myriCommentingTarget = id;
      await router.refresh();
      try {
        toast('Myri 正在读最近日记和思维壤……', 2600);
        const result = await client.myriCommentMoment(id, {
          model,
          timezone_offset_minutes: new Date().getTimezoneOffset(),
          local_date: dateKey(),
        });
        replaceMoment(result.moment);
        toast('Myri 已经回了一句。', 2200);
      } finally {
        state.myriCommentingTarget = '';
        await router.refresh();
      }
      return;
    }
    if (name === 'diary-date') {
      state.diaryDate = target.dataset.date || dateKey();
      return router.refresh();
    }
    if (name === 'save-diary') {
      const text = q('#diaryText')?.value.trim() || '';
      const imageRef = q('#diaryImageRef')?.value.trim() || '';
      if (!text && !imageRef) return toast('先写一点日记正文或图片引用。');
      const created = await client.createDiary({
        date: state.diaryDate,
        weather: q('#diaryWeather')?.value.trim() || '未标注',
        mood: q('#diaryMood')?.value.trim() || '未标注',
        text,
        image_refs: imageRef ? [imageRef] : [],
        conflict_mode: q('#diaryConflictMode')?.value || 'append',
      });
      state.diaries = [created, ...state.diaries.filter((entry) => entry.id !== created.id)];
      persistCache();
      return router.open('diary', {}, { replace: true });
    }
    if (name === 'save-album') {
      const imageRef = q('#albumImageRef')?.value.trim() || '';
      if (!imageRef) return toast('请先填写稳定图片引用。');
      const created = await client.createAlbum({
        date: dateKey(),
        category: q('#albumCategory')?.value || 'xiaohan',
        image_ref: imageRef,
        caption: q('#albumCaption')?.value.trim() || '',
      });
      state.albumItems.unshift(created);
      persistCache();
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

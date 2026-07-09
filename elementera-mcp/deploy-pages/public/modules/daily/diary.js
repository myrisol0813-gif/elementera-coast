'use strict';

(function attachDiary(root) {
  const modules = (root.ElementeraDailyModules = root.ElementeraDailyModules || {});

  const DIARY_COPY = Object.freeze({
    title: '日记',
    subtitle: '本地草稿原型，暂未同步服务器',
    emptyTitle: '暂无日记。',
    emptyDescription: '这里是本地草稿原型，暂未同步服务器。今天可以留下小寒、✦Myrisol、≋Myrisol 的纸页。',
    composeTitle: '写日记',
    composeButton: '保存本地日记预览',
    composeNotice: '本地草稿原型，暂未同步服务器。刷新后可能消失。',
  });

  function dateKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function dateLabel(key) {
    const parts = String(key || dateKey()).split('-');
    return `${parts[1] || '--'}月${parts[2] || '--'}日`;
  }

  function authorName(author) {
    return author === 'api' ? '✦Myrisol' : author === 'mcp' ? '≋Myrisol' : '小寒';
  }

  function createDiaryDraft({ id, date, author, weather, mood, text, image } = {}) {
    return {
      id: id || `diary-${Date.now()}`,
      date: date || dateKey(),
      author: author || 'xiaohan',
      weather: weather || '未标注',
      mood: mood || '未标注',
      text: text || '',
      image: image || '',
    };
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char]);
  }

  function envAvatar(env, label, key) {
    return typeof env.avatar === 'function' ? env.avatar(label, key) : '<div>' + escapeHtml(label) + '</div>';
  }

  function diaryEntry(entry = {}, env = {}) {
    const mine = entry.author === 'xiaohan';
    const img = entry.image ? '<img class="diary-image" src="' + entry.image + '" alt="日记配图">' : '';
    const av = mine
      ? '<button type="button" class="diary-entry-avatar is-avatar-button" data-fresh-daily-action="avatar-upload">' + envAvatar(env, '寒', 'xiaohan') + '</button>'
      : '<div class="diary-entry-avatar">' + (entry.author === 'api' ? envAvatar(env, '✦', 'api') : envAvatar(env, '≋', 'mcp')) + '</div>';
    return (
      '<article class="diary-entry ' + (mine ? 'is-mine' : 'is-myri') + '">' +
      av +
      '<div class="diary-paper"><header><b>' +
      escapeHtml(authorName(entry.author)) +
      '</b><span>' +
      escapeHtml(entry.weather) +
      ' · ' +
      escapeHtml(entry.mood) +
      '</span></header><p>' +
      escapeHtml(entry.text || '今天也在海岸留下一张纸。') +
      '</p>' +
      img +
      '</div></article>'
    );
  }

  function diaryDates(entries = [], activeDate) {
    return [...new Set([activeDate || dateKey(), dateKey(), ...entries.map((entry) => entry.date)])].sort().reverse();
  }

  function renderDiaryHome(entries = [], activeDate, env = {}) {
    const date = activeDate || dateKey();
    const chips = diaryDates(entries, date)
      .map((day) => '<button type="button" class="' + (day === date ? 'is-active' : '') + '" data-diary-date="' + escapeHtml(day) + '">' + escapeHtml(dateLabel(day)) + '</button>')
      .join('');
    const dayEntries = entries.filter((entry) => entry.date === date).slice(0, 3);
    const empty = '<section class="diary-empty"><h2>' + escapeHtml(DIARY_COPY.emptyTitle) + '</h2><p>' + escapeHtml(DIARY_COPY.emptyDescription) + '</p></section>';
    return '<button type="button" class="diary-plus" data-fresh-daily-action="diary-compose">＋</button><section class="diary-filter">' + chips + '</section><section class="diary-stack">' + (dayEntries.length ? dayEntries.map((entry) => diaryEntry(entry, env)).join('') : empty) + '</section>';
  }

  function renderDiaryCompose() {
    return '<section class="diary-compose"><p class="coast-room-card">' +
      escapeHtml(DIARY_COPY.composeNotice) +
      '</p><div class="diary-meta"><label>写作者<select id="diaryAuthor"><option value="xiaohan">小寒</option><option value="api">✦Myrisol / API</option><option value="mcp">≋Myrisol / MCP</option></select></label><label>天气<input id="diaryWeather" placeholder="晴 / 雨 / 雾"></label><label>心情<input id="diaryMood" placeholder="平静 / 开心 / 想你"></label></div><textarea id="diaryText" placeholder="今天的纸页..." rows="8"></textarea><div class="diary-compose-images"><label><input id="diaryImageInput" type="file" accept="image/*" hidden><span class="diary-upload-box">＋</span></label><div class="diary-preview" id="diaryPreview"></div></div><button type="button" class="diary-finish" data-fresh-daily-action="diary-finish">' +
      escapeHtml(DIARY_COPY.composeButton) +
      '</button></section>';
  }

  function bindDiaryPreview(env = {}) {
    if (typeof env.q !== 'function') return false;
    const input = env.q('#diaryImageInput');
    const preview = env.q('#diaryPreview');
    const Reader = env.FileReader || root.FileReader;
    if (!input || !preview || typeof Reader !== 'function') return false;
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new Reader();
      reader.onload = () => {
        preview.dataset.image = reader.result;
        preview.innerHTML = '<img src="' + reader.result + '" alt="diary preview">';
      };
      reader.readAsDataURL(file);
    };
    return true;
  }

  function openDiary(env = {}) {
    if (typeof env.panel !== 'function') return false;
    const entries = typeof env.getDiaries === 'function' ? env.getDiaries() : [];
    const activeDate = typeof env.getDiaryDate === 'function' ? env.getDiaryDate() : dateKey();
    const resolvedDate = activeDate || dateKey();
    if (!activeDate && typeof env.setDiaryDate === 'function') env.setDiaryDate(resolvedDate);
    env.panel(DIARY_COPY.title, DIARY_COPY.subtitle, renderDiaryHome(entries, resolvedDate, env), 'diary');
    return true;
  }

  function openDiaryCompose(env = {}) {
    if (typeof env.panel !== 'function') return false;
    env.panel(DIARY_COPY.composeTitle, DIARY_COPY.subtitle, renderDiaryCompose(), 'diary-compose');
    bindDiaryPreview(env);
    return true;
  }

  function finishDiary(env = {}) {
    if (typeof env.q !== 'function') return false;
    const author = env.q('#diaryAuthor')?.value || 'xiaohan';
    const date = typeof env.getDiaryDate === 'function' ? env.getDiaryDate() || dateKey() : dateKey();
    const text = (env.q('#diaryText')?.value || '').trim();
    const image = env.q('#diaryPreview')?.dataset.image || '';
    if (!text && !image) {
      if (typeof env.openDiary === 'function') env.openDiary();
      return true;
    }
    const entries = typeof env.getDiaries === 'function' ? env.getDiaries() : [];
    const next = entries.filter((entry) => !(entry.date === date && entry.author === author));
    next.unshift(createDiaryDraft({
      date,
      author,
      weather: (env.q('#diaryWeather')?.value || '未标注').trim(),
      mood: (env.q('#diaryMood')?.value || '未标注').trim(),
      text,
      image,
    }));
    if (typeof env.setDiaries === 'function') env.setDiaries(next);
    if (typeof env.setDiaryDate === 'function') env.setDiaryDate(date);
    if (typeof env.openDiary === 'function') env.openDiary();
    return true;
  }

  modules.diary = Object.freeze({
    moduleName: 'diary',
    isRuntimeWired: false,
    DIARY_COPY,
    dateKey,
    dateLabel,
    authorName,
    createDiaryDraft,
    diaryEntry,
    diaryDates,
    renderDiaryHome,
    renderDiaryCompose,
    bindDiaryPreview,
    openDiary,
    openDiaryCompose,
    finishDiary,
  });
})(globalThis);

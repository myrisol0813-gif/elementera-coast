import { API, requestJson } from '../core/api.js';

function milliseconds(value) {
  const number = Date.parse(String(value || ''));
  return Number.isFinite(number) ? number : Date.now();
}

function moment(value = {}) {
  const refs = Array.isArray(value.image_refs) ? value.image_refs : [];
  return {
    id: value.id,
    date: value.date,
    author: value.author,
    source: value.source,
    status: value.status,
    text: value.text || '',
    image: refs[0] || '',
    imageRefs: refs,
    conversationId: value.conversation_id || null,
    sourceTurnId: value.source_turn_id || null,
    surface: value.surface || '',
    modelLabel: value.model_label || null,
    modelNickname: value.model_nickname || null,
    symbol: value.symbol || '',
    displayAuthor: value.display_author || '',
    reason: value.reason || '',
    publishedAt: value.published_at ? milliseconds(value.published_at) : null,
    createdAt: milliseconds(value.created_at),
    updatedAt: milliseconds(value.updated_at),
    liked: Boolean(value.liked),
    likeCount: Number(value.like_count || 0),
    comments: (Array.isArray(value.comments) ? value.comments : []).map((commentValue) => ({
      id: commentValue.id,
      who: commentValue.author === 'xiaohan' ? '小寒' : 'Myri',
      author: commentValue.author,
      text: commentValue.text || '',
      modelId: commentValue.model_id || null,
      createdAt: milliseconds(commentValue.created_at),
    })),
  };
}

function diary(value = {}) {
  const refs = Array.isArray(value.image_refs) ? value.image_refs : [];
  return {
    id: value.id,
    date: value.date,
    author: value.author,
    source: value.source,
    weather: value.weather || '未标注',
    mood: value.mood || '未标注',
    text: value.text || '',
    image: refs[0] || '',
    imageRefs: refs,
    summaryId: value.summary_id || null,
    rangeStart: value.range_start || null,
    rangeEnd: value.range_end || null,
    surface: value.surface || '',
    modelLabel: value.model_label || null,
    modelNickname: value.model_nickname || null,
    symbol: value.symbol || '',
    displayAuthor: value.display_author || '',
    createdAt: milliseconds(value.created_at),
    updatedAt: milliseconds(value.updated_at),
  };
}

function draft(value = {}) {
  return {
    id: value.id,
    contentType: value.content_type,
    status: value.status,
    payload: value.payload && typeof value.payload === 'object' ? value.payload : {},
    author: value.author,
    source: value.source,
    surface: value.surface || '',
    modelLabel: value.model_label || null,
    modelNickname: value.model_nickname || null,
    symbol: value.symbol || '',
    displayAuthor: value.display_author || '',
    conversationId: value.conversation_id || null,
    sourceTurnId: value.source_turn_id || null,
    createdAt: milliseconds(value.created_at),
    updatedAt: milliseconds(value.updated_at),
  };
}

function album(value = {}) {
  return {
    id: value.id,
    date: value.date,
    cat: value.category,
    category: value.category,
    author: value.author,
    source: value.source,
    image: value.image_ref || '',
    imageRef: value.image_ref || '',
    caption: value.caption || '',
    createdAt: milliseconds(value.created_at),
    updatedAt: milliseconds(value.updated_at),
  };
}

function summary(value = {}) {
  return {
    id: value.id,
    date: String(value.range?.to || '').slice(0, 10),
    range: value.range,
    text: value.summary?.text || '',
    anchors: Array.isArray(value.summary?.anchors) ? value.summary.anchors : [],
    unresolved: Array.isArray(value.summary?.unresolved) ? value.summary.unresolved : [],
    diaryId: value.diary_id || null,
    momentIds: Array.isArray(value.moment_ids) ? value.moment_ids : [],
    albumItemIds: Array.isArray(value.album_item_ids) ? value.album_item_ids : [],
    modelId: value.model_id || null,
    createdAt: milliseconds(value.created_at),
    updatedAt: milliseconds(value.updated_at),
  };
}

export function createDailyClient() {
  async function load({ timezone_offset_minutes = 0 } = {}) {
    const [momentsData, diariesData, albumsData, summariesData, rangesData, draftsData] = await Promise.all([
      requestJson(API.dailyMoments),
      requestJson(API.dailyDiaries),
      requestJson(API.dailyAlbums),
      requestJson(API.dailySummaries),
      requestJson(`${API.dailySummaryRange}?timezone_offset_minutes=${encodeURIComponent(timezone_offset_minutes)}`),
      requestJson(`${API.dailyDrafts}?status=pending`),
    ]);
    return {
      moments: (momentsData.moments || []).map(moment),
      diaries: (diariesData.diaries || []).map(diary),
      albumItems: (albumsData.albums || []).map(album),
      summaries: (summariesData.summaries || []).map(summary),
      summaryRanges: rangesData.ranges || null,
      drafts: (draftsData.drafts || []).map(draft),
    };
  }

  async function createMoment(value) {
    const data = await requestJson(API.dailyMoments, {
      method: 'POST',
      body: JSON.stringify(value),
    });
    return moment(data.moment);
  }

  async function patchMoment(id, value) {
    const data = await requestJson(`${API.dailyMoments}/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(value),
    });
    return moment(data.moment);
  }

  async function commentMoment(id, text, commentId = '') {
    const data = await requestJson(`${API.dailyMoments}/${encodeURIComponent(id)}/comments`, {
      method: 'POST',
      body: JSON.stringify({ id: commentId || undefined, text }),
    });
    return moment(data.moment);
  }

  async function myriCommentMoment(id, value = {}) {
    const data = await requestJson(`${API.dailyMoments}/${encodeURIComponent(id)}/myri-comment`, {
      method: 'POST',
      body: JSON.stringify(value),
    });
    return {
      moment: moment(data.moment),
      comment: data.comment || null,
      model: data.model || value.model || '',
      sourceCounts: data.source_counts || null,
    };
  }

  async function setMomentLike(id, liked) {
    const data = await requestJson(`${API.dailyMoments}/${encodeURIComponent(id)}/like`, {
      method: liked ? 'PUT' : 'DELETE',
    });
    return moment(data.moment);
  }

  async function createDiary(value) {
    const data = await requestJson(API.dailyDiaries, {
      method: 'POST',
      body: JSON.stringify(value),
    });
    return diary(data.diary);
  }

  async function createAlbum(value) {
    const data = await requestJson(API.dailyAlbums, {
      method: 'POST',
      body: JSON.stringify(value),
    });
    return album(data.album);
  }

  async function runSummary(value) {
    return requestJson(API.dailySummaryRun, {
      method: 'POST',
      body: JSON.stringify(value),
    });
  }

  async function commitSummary(value) {
    const data = await requestJson(API.dailySummaryCommit, {
      method: 'POST',
      body: JSON.stringify(value),
    });
    return {
      summary: summary(data.summary),
      diary: data.diary ? diary(data.diary) : null,
      moments: (data.moments || []).map(moment),
      albums: (data.albums || []).map(album),
    };
  }

  async function publishDraft(id, value = {}) {
    const data = await requestJson(`${API.dailyDrafts}/${encodeURIComponent(id)}/publish`, {
      method: 'POST',
      body: JSON.stringify(value),
    });
    return {
      draft: draft(data.draft),
      record: data.draft?.content_type === 'moment'
        ? moment(data.record)
        : diary(data.record),
    };
  }

  async function discardDraft(id) {
    const data = await requestJson(`${API.dailyDrafts}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    return draft(data.draft);
  }

  return Object.freeze({
    load,
    createMoment,
    patchMoment,
    commentMoment,
    myriCommentMoment,
    setMomentLike,
    createDiary,
    createAlbum,
    runSummary,
    commitSummary,
    publishDraft,
    discardDraft,
  });
}

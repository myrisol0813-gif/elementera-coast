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
    const [momentsData, diariesData, albumsData, summariesData, rangesData] = await Promise.all([
      requestJson(API.dailyMoments),
      requestJson(API.dailyDiaries),
      requestJson(API.dailyAlbums),
      requestJson(API.dailySummaries),
      requestJson(`${API.dailySummaryRange}?timezone_offset_minutes=${encodeURIComponent(timezone_offset_minutes)}`),
    ]);
    return {
      moments: (momentsData.moments || []).map(moment),
      diaries: (diariesData.diaries || []).map(diary),
      albumItems: (albumsData.albums || []).map(album),
      summaries: (summariesData.summaries || []).map(summary),
      summaryRanges: rangesData.ranges || null,
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
  });
}

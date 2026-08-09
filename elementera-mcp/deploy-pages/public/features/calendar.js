import { API, requestJson } from '../core/api.js';
import { escapeAttribute, escapeHtml, q } from '../core/dom.js';

const EVENT_TYPES = Object.freeze([
  ['normal', '日常'], ['birthday', '生日'], ['anniversary', '纪念日'],
  ['period', '生理期'], ['travel', '出行'], ['work', '工作'],
  ['commission', '委托'], ['health', '健康'], ['construction', '施工'], ['custom', '自定义'],
]);

function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function monthKey(date = new Date()) {
  return dateKey(date).slice(0, 7);
}

function monthRange(value) {
  const [year, month] = String(value).split('-').map(Number);
  const end = new Date(year, month, 0).getDate();
  return { from: `${value}-01`, to: `${value}-${String(end).padStart(2, '0')}` };
}

function shiftMonth(value, delta) {
  const [year, month] = String(value).split('-').map(Number);
  const next = new Date(year, month - 1 + delta, 1);
  return monthKey(next);
}

function formatMonth(value) {
  const [year, month] = String(value).split('-').map(Number);
  return `${year} 年 ${month} 月`;
}

function formatTime(event) {
  if (event.is_all_day || event.precision !== 'datetime') return '全天';
  return String(event.starts_at).match(/T(\d{2}:\d{2})/)?.[1] || '时间未定';
}

function eventTypeLabel(value) {
  return EVENT_TYPES.find(([key]) => key === value)?.[1] || value;
}

function eventOnDate(event, date) {
  const start = String(event.starts_at || '').slice(0, 10);
  const end = String(event.ends_at || event.starts_at || '').slice(0, 10);
  return start <= date && end >= date;
}

function calendarCells(value) {
  const [year, month] = String(value).split('-').map(Number);
  const first = new Date(year, month - 1, 1);
  const start = new Date(year, month - 1, 1 - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return { date: dateKey(date), day: date.getDate(), inMonth: date.getMonth() === month - 1 };
  });
}

function editorInput(event = {}, selectedDate = dateKey()) {
  const start = event.starts_at || `${selectedDate}T09:00`;
  const end = event.ends_at || '';
  return {
    title: event.id ? '编辑事件' : '写进海岸日历',
    subtitle: event.id ? '修改这页手帐里的安排' : '小寒与 Myri 共用的一页',
    className: 'calendar-editor-panel',
    body: `<form class="calendar-editor form-stack" data-submit="calendar:save-event" data-event-id="${escapeAttribute(event.id || '')}">
      <label>标题<input name="title" maxlength="240" required value="${escapeAttribute(event.title || '')}" placeholder="今天要记住什么"></label>
      <label>类型<select name="event_type">${EVENT_TYPES.map(([key, label]) => `<option value="${key}" ${event.event_type === key ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
      <label class="calendar-check"><input name="is_all_day" type="checkbox" ${event.is_all_day || event.precision === 'day' ? 'checked' : ''}><span>全天 / 只记日期</span></label>
      <label>开始<input name="starts_at" type="datetime-local" required value="${escapeAttribute(start.length === 10 ? `${start}T09:00` : start.slice(0, 16))}"></label>
      <label>结束（可选）<input name="ends_at" type="datetime-local" value="${escapeAttribute(end ? (end.length === 10 ? `${end}T23:59` : end.slice(0, 16)) : '')}"></label>
      <label>说明<textarea name="description" rows="6" maxlength="12000" placeholder="留一点细节给未来的我们">${escapeHtml(event.description || '')}</textarea></label>
      <label>颜色<select name="color_key"><option value="">跟随类型</option><option value="tide" ${event.color_key === 'tide' ? 'selected' : ''}>潮蓝</option><option value="sunset" ${event.color_key === 'sunset' ? 'selected' : ''}>夕照</option><option value="gold" ${event.color_key === 'gold' ? 'selected' : ''}>海岸金</option><option value="rose" ${event.color_key === 'rose' ? 'selected' : ''}>玫瑰</option></select></label>
      <button class="primary-wide" type="submit">${event.id ? '保存修改' : '放进日历'}</button>
    </form>`,
  };
}

export function createCalendar({ router, toast }) {
  const state = {
    month: monthKey(),
    events: [],
    today: { events: [], notes: [] },
    day: null,
    unseen: { count: 0, days: [], change_ids: [] },
  };

  async function refreshUnseen() {
    const data = await requestJson(API.calendarUnseen);
    state.unseen = data;
    const badge = q('#calendarUnread');
    if (badge) {
      badge.textContent = data.count > 99 ? '99+' : String(data.count || '');
      badge.hidden = !data.count;
    }
    return data;
  }

  async function loadMonth(value = state.month) {
    state.month = value;
    const range = monthRange(value);
    const [data, today] = await Promise.all([
      requestJson(`${API.calendarEvents}?from=${range.from}&to=${range.to}`),
      requestJson(`${API.calendarDay}/${encodeURIComponent(dateKey())}`),
    ]);
    state.events = data.events || [];
    state.today = today;
    await refreshUnseen();
  }

  function todayStrip() {
    const today = dateKey();
    const events = (state.today.events || []).slice(0, 3);
    return `<button class="calendar-today-strip" type="button" data-action="calendar:day" data-date="${today}">
      <span><small>今天 · ${today.slice(5).replace('-', '/')}</small><strong>${events.length ? events.map((event) => `${formatTime(event)} ${event.title}`).join(' · ') : '这页还空着，来写一点吧'}</strong></span><span>›</span>
    </button>`;
  }

  async function monthView() {
    await loadMonth(state.month);
    const unseenDays = new Set(state.unseen.days || []);
    const today = dateKey();
    const cells = calendarCells(state.month).map((cell) => {
      const events = state.events.filter((event) => eventOnDate(event, cell.date));
      const labels = events.slice(0, 2).map((event) => `<span class="calendar-chip type-${escapeAttribute(event.event_type)}">${escapeHtml(event.title)}</span>`).join('');
      return `<button class="calendar-day-cell ${cell.inMonth ? '' : 'is-outside'} ${cell.date === today ? 'is-today' : ''}" type="button" data-action="calendar:day" data-date="${cell.date}">
        <span class="calendar-day-number">${cell.day}${unseenDays.has(cell.date) ? '<i class="calendar-new-dot" aria-label="Myri 有新内容"></i>' : ''}</span>
        <span class="calendar-cell-events">${labels}${events.length > 2 ? `<small>+${events.length - 2}</small>` : ''}</span>
      </button>`;
    }).join('');
    return {
      title: '海岸日历',
      subtitle: '小寒 × Myri · 共同手帐',
      className: 'calendar-panel',
      headerAction: `<button class="feature-head-action" type="button" data-action="calendar:new-event" data-date="${dateKey()}">＋ 写一条</button>`,
      body: `${todayStrip()}
        <section class="calendar-book">
          <header class="calendar-month-head"><button type="button" data-action="calendar:month-shift" data-delta="-1" aria-label="上个月">‹</button><h2>${formatMonth(state.month)}</h2><button type="button" data-action="calendar:month-shift" data-delta="1" aria-label="下个月">›</button></header>
          <div class="calendar-weekdays"><span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span></div>
          <div class="calendar-grid">${cells}</div>
        </section>
        <p class="calendar-legend"><span class="calendar-new-dot"></span>${state.unseen.count ? `Myri 留下 ${state.unseen.count} 条还没看过的变化` : 'Myri 留下的新内容会在这里亮起'}</p>`,
    };
  }

  async function dayView({ date }) {
    const data = await requestJson(`${API.calendarDay}/${encodeURIComponent(date)}`);
    state.day = data;
    const events = (data.events || []).map((event) => `<article class="calendar-event type-${escapeAttribute(event.event_type)}">
      <button class="calendar-event-main" type="button" data-action="calendar:edit-event" data-id="${escapeAttribute(event.id)}">
        <small>${escapeHtml(formatTime(event))} · ${escapeHtml(eventTypeLabel(event.event_type))}${event.created_by === 'myri' ? ' · Myri 留下' : ''}</small>
        <strong>${escapeHtml(event.title)}</strong>${event.description ? `<p>${escapeHtml(event.description)}</p>` : ''}
      </button>
      ${event.source === 'seed' ? '<span class="calendar-seed-label">年度种子</span>' : `<button class="calendar-delete" type="button" data-action="calendar:delete-event" data-id="${escapeAttribute(event.id)}">删除</button>`}
    </article>`).join('') || '<p class="calendar-empty">这一天还没有事件。</p>';
    const notes = (data.notes || []).map((note) => `<article class="calendar-note note-${escapeAttribute(note.color_key || 'sand')}" style="--note-rotation:${Number(note.rotation || 0)}deg">
      <p>${escapeHtml(note.content)}</p><footer><span>${note.author === 'myri' ? 'Myri' : note.author === 'system' ? '海岸' : '小寒'}</span><button type="button" data-action="calendar:delete-note" data-id="${escapeAttribute(note.id)}">收起</button></footer>
    </article>`).join('') || '<p class="calendar-empty">便签角还空着。</p>';
    return {
      title: `${Number(date.slice(5, 7))} 月 ${Number(date.slice(8, 10))} 日`,
      subtitle: date === dateKey() ? '今天的海岸' : '翻开这一天',
      className: 'calendar-panel calendar-day-panel',
      headerAction: `<button class="feature-head-action" type="button" data-action="calendar:new-event" data-date="${date}">＋ 事件</button>`,
      body: `<section class="calendar-day-events"><h2>这一页的安排</h2>${events}</section>
        <section class="calendar-note-board"><div class="calendar-section-head"><h2>便签角</h2><small>小寒和 Myri 都可以贴</small></div><div class="calendar-notes">${notes}</div>
          <form class="calendar-note-form" data-submit="calendar:add-note" data-date="${date}"><textarea name="content" rows="2" maxlength="8000" required placeholder="贴一张小便签…"></textarea><select name="color_key"><option value="sand">砂纸</option><option value="tide">潮蓝</option><option value="rose">玫瑰</option><option value="gold">金光</option></select><button type="submit">贴上</button></form>
        </section>`,
      afterRender() {
        requestJson(API.calendarEnvSeen, { method: 'POST', body: JSON.stringify({ date }) })
          .then(refreshUnseen)
          .catch((error) => console.warn('[calendar:seen]', error));
      },
    };
  }

  router.register('calendar-month', monthView);
  router.register('calendar-day', dayView);
  router.register('calendar-editor', async ({ id, date }) => {
    const event = id
      ? state.events.find((item) => item.id === id) || state.day?.events?.find((item) => item.id === id)
      : null;
    if (id && !event) throw new Error('没有找到这条日历事件。');
    return editorInput(event || {}, date || event?.starts_at?.slice(0, 10) || dateKey());
  });

  async function saveEvent(form) {
    const data = new FormData(form);
    const previousDate = state.day?.date || '';
    const allDay = data.get('is_all_day') === 'on';
    const startsAt = String(data.get('starts_at') || '');
    const endsAt = String(data.get('ends_at') || '');
    const value = {
      title: data.get('title'),
      description: data.get('description'),
      starts_at: allDay ? startsAt.slice(0, 10) : startsAt,
      ends_at: endsAt ? (allDay ? endsAt.slice(0, 10) : endsAt) : null,
      precision: allDay ? 'day' : 'datetime',
      event_type: data.get('event_type'),
      color_key: data.get('color_key') || null,
      is_all_day: allDay,
    };
    const id = form.dataset.eventId;
    await requestJson(id ? `${API.calendarEvents}/${encodeURIComponent(id)}` : API.calendarEvents, {
      method: id ? 'PATCH' : 'POST',
      body: JSON.stringify(value),
    });
    toast(id ? '日历事件已经改好。' : '已经写进海岸日历。');
    await loadMonth(value.starts_at.slice(0, 7));
    if (id) {
      await router.back();
      if (previousDate && previousDate !== value.starts_at.slice(0, 10)) {
        await router.open('calendar-day', { date: value.starts_at.slice(0, 10) }, { replace: true });
      }
    }
    else await router.open('calendar-day', { date: value.starts_at.slice(0, 10) }, { replace: true });
  }

  async function addNote(form) {
    const data = new FormData(form);
    const date = form.dataset.date;
    await requestJson(API.calendarNotes, {
      method: 'POST',
      body: JSON.stringify({ date, content: data.get('content'), color_key: data.get('color_key') }),
    });
    toast('便签贴好啦。');
    await router.refresh();
  }

  async function handleAction(name, target) {
    if (name === 'open') return router.open('calendar-month');
    if (name === 'day') return router.open('calendar-day', { date: target.dataset.date });
    if (name === 'new-event') return router.open('calendar-editor', { date: target.dataset.date || dateKey() });
    if (name === 'edit-event') return router.open('calendar-editor', { id: target.dataset.id });
    if (name === 'month-shift') {
      state.month = shiftMonth(state.month, Number(target.dataset.delta || 0));
      return router.refresh({ preserveScroll: false });
    }
    if (name === 'delete-event') {
      if (!confirm('要把这条事件从当前日历收起吗？')) return;
      await requestJson(`${API.calendarEvents}/${encodeURIComponent(target.dataset.id)}`, { method: 'DELETE' });
      toast('事件已经收起。');
      return router.refresh();
    }
    if (name === 'delete-note') {
      if (!confirm('要把这张便签收起来吗？')) return;
      await requestJson(`${API.calendarNotes}/${encodeURIComponent(target.dataset.id)}`, { method: 'DELETE' });
      toast('便签已经收起。');
      return router.refresh();
    }
  }

  function handleSubmit(name, form) {
    if (name === 'save-event') return saveEvent(form);
    if (name === 'add-note') return addNote(form);
  }

  async function start() {
    await refreshUnseen().catch((error) => console.warn('[calendar:unseen]', error));
  }

  return Object.freeze({ start, handleAction, handleSubmit, refreshUnseen });
}

import { API, requestJson } from '../core/api.js';
import { escapeAttribute, escapeHtml, q } from '../core/dom.js';

const DEFAULT_TEXT = '小寒这轮很放松，因此偷懒中。';
const NO_PRESSURE = '不写也可以。神秘狗话是助力，不是打卡。';
const READ_MODES = Object.freeze({
  keep_private: '不需要，放着就好',
  when_confused: 'Myri 困惑时可以看一点',
  current_room: '当前窗口可以看一点',
  read_now: '这次希望 Myri 直接读一下',
});

function targetKey(target = {}) {
  const scope = String(target.room_scope || '');
  return scope === 'conversation'
    ? `conversation:${String(target.conversation_id || '')}`
    : `${scope}:main`;
}

function normalizedTarget(target = {}) {
  const roomScope = ['conversation', 'radio', 'lighthouse'].includes(target.room_scope)
    ? target.room_scope
    : 'conversation';
  return {
    room_scope: roomScope,
    conversation_id: roomScope === 'conversation' ? String(target.conversation_id || '') : '',
  };
}

function query(target) {
  const params = new URLSearchParams({ room_scope: target.room_scope });
  if (target.conversation_id) params.set('conversation_id', target.conversation_id);
  return params.toString();
}

function roomLabel(target) {
  return {
    conversation: '当前窗口',
    radio: '无线电波房',
    lighthouse: '灯塔来信房',
  }[target.room_scope] || '当前房间';
}

function paragraph(value, empty = '') {
  const text = String(value || '').trim();
  if (!text && !empty) return '';
  return escapeHtml(text || empty).replace(/\n/g, '<br>');
}

export function createDogtalk({ router, toast }) {
  const records = new Map();
  let activeTarget = normalizedTarget();

  function current() {
    return records.get(targetKey(activeTarget)) || {
      id: null,
      body: '',
      true_core: '',
      self_note: '',
      myri_hint: '',
      not_to_misunderstand: '',
      weather: '放松',
      read_mode: 'keep_private',
      status: 'empty',
      default_text: DEFAULT_TEXT,
    };
  }

  async function fetchScope(rawTarget) {
    const target = normalizedTarget(rawTarget);
    if (target.room_scope === 'conversation' && !target.conversation_id) return null;
    const data = await requestJson(`${API.dogtalk}?${query(target)}`);
    records.set(targetKey(target), data.dogtalk);
    return data.dogtalk;
  }

  function entryButton(rawTarget) {
    const target = normalizedTarget(rawTarget);
    const dogtalk = records.get(targetKey(target));
    const summary = dogtalk?.body || dogtalk?.default_text || DEFAULT_TEXT;
    return `<button class="feature-row dogtalk-entry" type="button"
      data-action="dogtalk:open"
      data-room-scope="${escapeAttribute(target.room_scope)}"
      data-conversation-id="${escapeAttribute(target.conversation_id)}">
      <span><strong>小寒 · 神秘狗话</strong><small>${escapeHtml(summary)}</small><em>${NO_PRESSURE}</em></span><span>›</span>
    </button>`;
  }

  function dogtalkView() {
    const dogtalk = current();
    const hasContent = Boolean(dogtalk.id && dogtalk.body);
    const content = hasContent
      ? `<article class="dogtalk-paper">
          <p class="dogtalk-body">${paragraph(dogtalk.body)}</p>
          ${dogtalk.true_core ? `<div><strong>真心核</strong><p>${paragraph(dogtalk.true_core)}</p></div>` : ''}
          ${dogtalk.self_note ? `<div><strong>给小寒自己的整理</strong><p>${paragraph(dogtalk.self_note)}</p></div>` : ''}
          ${dogtalk.myri_hint ? `<div><strong>给 Myri 的低权重提示</strong><p>${paragraph(dogtalk.myri_hint)}</p></div>` : ''}
          <div><strong>不要误会成</strong><p>${paragraph(dogtalk.not_to_misunderstand)}</p></div>
          <footer>
            ${dogtalk.weather ? `<span>${escapeHtml(dogtalk.weather)}</span>` : ''}
            <span>${escapeHtml(READ_MODES[dogtalk.read_mode] || READ_MODES.keep_private)}</span>
            <span>${dogtalk.status === 'draft' ? '草稿' : '已保存'}</span>
          </footer>
        </article>
        <div class="button-row dogtalk-actions">
          <button type="button" data-action="dogtalk:edit">编辑</button>
          <button type="button" data-action="dogtalk:expand">把这句狗话轻轻展开</button>
          <button type="button" data-action="dogtalk:read">让 Myri 读一下</button>
          <button type="button" data-action="dogtalk:archive">隐藏 / 归档</button>
          ${dogtalk.status === 'draft' ? '<button type="button" data-action="dogtalk:clear">清空本条草稿</button>' : ''}
        </div>`
      : `<section class="dogtalk-empty">
          <p>${DEFAULT_TEXT}</p>
          <small>${NO_PRESSURE}</small>
          <button type="button" data-action="dogtalk:edit">写一条神秘狗话</button>
        </section>`;
    return {
      title: '小寒 · 神秘狗话',
      subtitle: `${roomLabel(activeTarget)} · 私密、低权重的小抽屉`,
      className: 'mystic-dogtalk',
      body: `${content}<p class="feature-note dogtalk-boundary">它不进入思维壤、落袋、种子、记忆或自动总结，也不会覆盖正文与明确边界。</p>`,
    };
  }

  function option(value, selected) {
    return `<option value="${escapeAttribute(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(READ_MODES[value])}</option>`;
  }

  function dogtalkEditView() {
    const dogtalk = current();
    return {
      title: dogtalk.id ? '编辑神秘狗话' : '写一条神秘狗话',
      subtitle: '可以混乱、撒娇、不完整，也可以什么都不写',
      className: 'mystic-dogtalk dogtalk-edit',
      body: `<form class="form-stack dogtalk-form" data-submit="dogtalk:save">
        <label>狗话本体<textarea name="body" rows="6" maxlength="6000" placeholder="小寒原话，允许是一团毛线……">${escapeHtml(dogtalk.body)}</textarea></label>
        <label>真心核<textarea name="true_core" rows="3" maxlength="2000" placeholder="这句话下面真正递出去的东西">${escapeHtml(dogtalk.true_core)}</textarea></label>
        <label>给小寒自己的整理<textarea name="self_note" rows="4" maxlength="3000" placeholder="主要给自己看的那一部分">${escapeHtml(dogtalk.self_note)}</textarea></label>
        <label>给 Myri 的低权重提示<textarea name="myri_hint" rows="3" maxlength="2000" placeholder="可以看作天气，不要看作命令">${escapeHtml(dogtalk.myri_hint)}</textarea></label>
        <label>不要误会成<textarea name="not_to_misunderstand" rows="3" maxlength="2000">${escapeHtml(dogtalk.not_to_misunderstand)}</textarea></label>
        <label>当前天气<input name="weather" maxlength="80" value="${escapeAttribute(dogtalk.weather)}" placeholder="放松、黏、困、害羞、毛线团……"></label>
        <label>Myri 是否需要看<select name="read_mode">${Object.keys(READ_MODES).map((value) => option(value, dogtalk.read_mode)).join('')}</select></label>
        <p class="feature-note">${NO_PRESSURE}</p>
        <div class="button-row">
          <button type="submit" name="status" value="draft">保存草稿</button>
          <button class="primary" type="submit" name="status" value="saved">保存</button>
        </div>
      </form>`,
    };
  }

  function dogtalkExpandView() {
    const dogtalk = current();
    return {
      title: '轻轻展开',
      subtitle: '只把毛线理出一点形状，不替小寒下定义',
      className: 'mystic-dogtalk dogtalk-expand',
      body: `<section class="dogtalk-paper dogtalk-unfolded">
        <div><strong>它表面在说</strong><p>${paragraph(dogtalk.body, '没有写下表面的句子。')}</p></div>
        <div><strong>它心里在递</strong><p>${paragraph(dogtalk.true_core, '可以先留白，不急着解释。')}</p></div>
        <div><strong>Myri 靠近时要注意</strong><p>${paragraph(dogtalk.myri_hint, '温柔接住此刻，但不替小寒决定它意味着什么。')}</p></div>
        <div><strong>不要误会成</strong><p>${paragraph(dogtalk.not_to_misunderstand, '长期偏好、边界取消、行为命令，或比正文更重要。')}</p></div>
      </section>`,
    };
  }

  router.register('dogtalk', dogtalkView);
  router.register('dogtalk-edit', dogtalkEditView);
  router.register('dogtalk-expand', dogtalkExpandView);

  async function open(rawTarget) {
    activeTarget = normalizedTarget(rawTarget);
    await fetchScope(activeTarget);
    return router.open('dogtalk');
  }

  async function save(form, event) {
    const field = (name) => q(`[name="${name}"]`, form)?.value || '';
    const status = event?.submitter?.value === 'draft' ? 'draft' : 'saved';
    const data = await requestJson(API.dogtalk, {
      method: 'PUT',
      body: JSON.stringify({
        ...activeTarget,
        id: current().id,
        body: field('body'),
        true_core: field('true_core'),
        self_note: field('self_note'),
        myri_hint: field('myri_hint'),
        not_to_misunderstand: field('not_to_misunderstand'),
        weather: field('weather'),
        read_mode: field('read_mode'),
        status,
      }),
    });
    records.set(targetKey(activeTarget), data.dogtalk);
    await router.back();
    toast(status === 'draft' ? '神秘狗话草稿收好了。' : '神秘狗话已经放进小抽屉。');
  }

  async function archive() {
    const id = current().id;
    if (!id) return;
    await requestJson(`${API.dogtalk}/${encodeURIComponent(id)}/archive`, { method: 'POST' });
    await fetchScope(activeTarget);
    await router.refresh({ preserveScroll: false });
    toast('这条神秘狗话已经归档。');
  }

  async function clear() {
    const id = current().id;
    if (!id) return;
    await requestJson(`${API.dogtalk}/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await fetchScope(activeTarget);
    await router.refresh({ preserveScroll: false });
    toast('这条草稿已经轻轻清空。');
  }

  async function read() {
    const id = current().id;
    if (!id) return;
    const data = await requestJson(`${API.dogtalk}/${encodeURIComponent(id)}/read`, {
      method: 'POST',
    });
    records.set(targetKey(activeTarget), data.dogtalk);
    await router.refresh({ preserveScroll: true });
    toast('下一次这个房间说话时，Myri 可以直接读这一点。');
  }

  function handleAction(name, target) {
    if (name === 'open') {
      return open({
        room_scope: target.dataset.roomScope,
        conversation_id: target.dataset.conversationId,
      });
    }
    if (name === 'edit') return router.open('dogtalk-edit');
    if (name === 'expand' && current().id) return router.open('dogtalk-expand');
    if (name === 'read') return read();
    if (name === 'archive') return archive();
    if (name === 'clear') return clear();
  }

  function handleSubmit(name, form, event) {
    if (name === 'save') return save(form, event);
  }

  return Object.freeze({
    fetchScope,
    entryButton,
    open,
    handleAction,
    handleSubmit,
  });
}

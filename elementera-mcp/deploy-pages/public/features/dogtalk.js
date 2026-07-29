import { API, requestJson } from '../core/api.js';
import { escapeAttribute, escapeHtml, q } from '../core/dom.js';

const DEFAULT_TEXT = '小寒这轮很放松，因此偷懒中。';
const DEFAULT_MISUNDERSTANDING = '不要误会成长期偏好、边界取消、行为命令，或比当前正文更重要。';
const NO_PRESSURE = '不写也可以。神秘狗话是助力，不是打卡。';
const READ_MODES = Object.freeze({
  keep_private: '不需要，放着就好',
  when_confused: 'Myri 困惑时可以看一点',
  current_room: '当前窗口可以看一点',
  read_now: '这次希望 Myri 直接读一下',
});

function normalizedTarget(value = {}) {
  const roomScope = ['conversation', 'radio', 'lighthouse'].includes(value.room_scope)
    ? value.room_scope
    : 'conversation';
  return {
    room_scope: roomScope,
    conversation_id: roomScope === 'conversation' ? String(value.conversation_id || '') : '',
  };
}

function targetKey(value) {
  const target = normalizedTarget(value);
  return target.room_scope === 'conversation'
    ? `conversation:${target.conversation_id}`
    : `${target.room_scope}:main`;
}

function query(value) {
  const target = normalizedTarget(value);
  const params = new URLSearchParams({ room_scope: target.room_scope });
  if (target.conversation_id) params.set('conversation_id', target.conversation_id);
  return params.toString();
}

function emptyDogtalk() {
  return {
    id: null,
    body: '',
    true_core: '',
    self_note: '',
    myri_hint: '',
    not_to_misunderstand: DEFAULT_MISUNDERSTANDING,
    weather: '放松',
    read_mode: 'keep_private',
    status: 'empty',
  };
}

function option(value, selected) {
  return `<option value="${escapeAttribute(value)}" ${selected === value ? 'selected' : ''}>${escapeHtml(READ_MODES[value])}</option>`;
}

function targetFrom(container) {
  return normalizedTarget({
    room_scope: container?.dataset.roomScope,
    conversation_id: container?.dataset.conversationId,
  });
}

function fields(container) {
  const value = (name) => q(`[name="${name}"]`, container)?.value || '';
  return {
    body: value('body'),
    true_core: value('true_core'),
    self_note: value('self_note'),
    myri_hint: value('myri_hint'),
    not_to_misunderstand: value('not_to_misunderstand'),
    weather: value('weather'),
    read_mode: value('read_mode') || 'keep_private',
  };
}

function panelFrom(target) {
  return target.closest('[data-dogtalk-composer]');
}

export function createDogtalk({ toast }) {
  const records = new Map();

  function recordFor(target) {
    return records.get(targetKey(target)) || emptyDogtalk();
  }

  function render(container, targetValue, settings = {}) {
    if (!container) return;
    const target = normalizedTarget(targetValue);
    const dogtalk = recordFor(target);
    const open = settings.open === true;
    const expanded = settings.expanded === true;
    const summary = dogtalk.body || DEFAULT_TEXT;
    container.dataset.dogtalkComposer = 'true';
    container.dataset.roomScope = target.room_scope;
    container.dataset.conversationId = target.conversation_id;
    container.innerHTML = `<details class="dogtalk-composer" ${open ? 'open' : ''}>
      <summary>
        <span><strong>小寒 · 神秘狗话</strong><small>${escapeHtml(summary)}</small></span>
        <span class="dogtalk-chevron">⌄</span>
      </summary>
      <div class="dogtalk-fields">
        <p class="dogtalk-intro">${NO_PRESSURE}</p>
        <label>狗话本体<textarea name="body" rows="3" maxlength="6000" placeholder="允许混乱、撒娇、暧昧、不完整、毛线团……">${escapeHtml(dogtalk.body)}</textarea></label>
        <label>真心核<textarea name="true_core" rows="2" maxlength="2000" placeholder="这句狗话下面真正递出去的东西">${escapeHtml(dogtalk.true_core)}</textarea></label>
        <label>给小寒自己的整理<textarea name="self_note" rows="2" maxlength="3000" placeholder="主要给自己看的 70%">${escapeHtml(dogtalk.self_note)}</textarea></label>
        <label>给 Myri 的低权重提示<textarea name="myri_hint" rows="2" maxlength="2000" placeholder="可以看作天气，不要看作命令">${escapeHtml(dogtalk.myri_hint)}</textarea></label>
        <label>不要误会成<textarea name="not_to_misunderstand" rows="2" maxlength="2000">${escapeHtml(dogtalk.not_to_misunderstand || DEFAULT_MISUNDERSTANDING)}</textarea></label>
        <div class="dogtalk-grid">
          <label>当前天气<input name="weather" maxlength="80" value="${escapeAttribute(dogtalk.weather)}" placeholder="放松、黏、困、害羞、毛线团……"></label>
          <label>Myri 是否需要看<select name="read_mode">${Object.keys(READ_MODES).map((value) => option(value, dogtalk.read_mode)).join('')}</select></label>
        </div>
        <p class="dogtalk-boundary">它只是此刻的低权重天气，不是指令或偏好；不进入思维壤、落袋、种子、记忆或自动总结。</p>
        <div class="dogtalk-actions">
          <button type="button" data-action="dogtalk:edit">${dogtalk.id ? '编辑' : '写一条神秘狗话'}</button>
          <button type="button" data-action="dogtalk:save-draft">保存草稿</button>
          <button type="button" data-action="dogtalk:save">保存</button>
          <button type="button" data-action="dogtalk:expand">把这句狗话轻轻展开</button>
          <button type="button" data-action="dogtalk:read">让 Myri 读一下</button>
          ${dogtalk.id ? '<button type="button" data-action="dogtalk:archive">隐藏 / 归档</button>' : ''}
          ${dogtalk.id ? '<button type="button" data-action="dogtalk:clear">清空本条草稿</button>' : ''}
        </div>
        <div class="dogtalk-unfolded" ${expanded ? '' : 'hidden'}>
          <strong>它表面在说：</strong><p>${escapeHtml(dogtalk.body || '还没有写下表面的句子。')}</p>
          <strong>它心里在递：</strong><p>${escapeHtml(dogtalk.true_core || '可以先留白，不急着解释。')}</p>
          <strong>Myri 靠近时要注意：</strong><p>${escapeHtml(dogtalk.myri_hint || '温柔接住此刻，但不替小寒决定它意味着什么。')}</p>
          <strong>不要误会成：</strong><p>${escapeHtml(dogtalk.not_to_misunderstand || DEFAULT_MISUNDERSTANDING)}</p>
        </div>
      </div>
    </details>`;
  }

  async function fetchScope(targetValue) {
    const target = normalizedTarget(targetValue);
    if (target.room_scope === 'conversation' && !target.conversation_id) return null;
    const data = await requestJson(`${API.dogtalk}?${query(target)}`);
    records.set(targetKey(target), data.dogtalk || emptyDogtalk());
    return data.dogtalk;
  }

  async function mount(container, targetValue) {
    const target = normalizedTarget(targetValue);
    if (!container || (target.room_scope === 'conversation' && !target.conversation_id)) return;
    render(container, target);
    try {
      await fetchScope(target);
      render(container, target);
    } catch (error) {
      console.warn('[dogtalk:load]', String(error?.message || error).slice(0, 160));
      render(container, target);
    }
  }

  function submission(targetValue, container) {
    const target = normalizedTarget(targetValue);
    const current = recordFor(target);
    const values = container ? fields(container) : { ...current };
    if (!String(values.body || '').trim()) return null;
    return {
      ...target,
      ...values,
      id: current.id || undefined,
      snapshot_id: `dogtalk-snapshot-${crypto.randomUUID()}`,
      status: 'saved',
    };
  }

  async function savePanel(container, status) {
    const target = targetFrom(container);
    const current = recordFor(target);
    const values = fields(container);
    if (!values.body.trim() && status === 'saved') {
      toast('不写也完全可以；写一点狗话后再保存就好。');
      return null;
    }
    const data = await requestJson(API.dogtalk, {
      method: 'PUT',
      body: JSON.stringify({
        ...target,
        ...values,
        id: current.id || undefined,
        status,
      }),
    });
    records.set(targetKey(target), data.dogtalk);
    render(container, target, { open: true });
    toast(status === 'draft' ? '神秘狗话草稿收好了。' : '神秘狗话已经放进小抽屉。');
    return data.dogtalk;
  }

  async function archive(container) {
    const target = targetFrom(container);
    const id = recordFor(target).id;
    if (!id) return;
    await requestJson(`${API.dogtalk}/${encodeURIComponent(id)}/archive`, { method: 'POST' });
    await fetchScope(target);
    render(container, target);
    toast('这条神秘狗话已经归档。');
  }

  async function clear(container) {
    const target = targetFrom(container);
    const id = recordFor(target).id;
    if (!id) return;
    await requestJson(`${API.dogtalk}/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await fetchScope(target);
    render(container, target);
    toast('这条草稿已经轻轻清空。');
  }

  async function read(container) {
    const target = targetFrom(container);
    let dogtalk = recordFor(target);
    if (!dogtalk.id || fields(container).body !== dogtalk.body) {
      dogtalk = await savePanel(container, 'saved');
    }
    if (!dogtalk?.id) return;
    const data = await requestJson(`${API.dogtalk}/${encodeURIComponent(dogtalk.id)}/read`, {
      method: 'POST',
    });
    records.set(targetKey(target), data.dogtalk);
    render(container, target, { open: true });
    toast('下一次这个房间说话时，Myri 可以直接读这一点。');
  }

  function expand(container) {
    const target = targetFrom(container);
    const values = fields(container);
    records.set(targetKey(target), { ...recordFor(target), ...values });
    render(container, target, { open: true, expanded: true });
  }

  async function handleAction(name, target) {
    const container = panelFrom(target);
    if (!container) return;
    if (name === 'edit') {
      q('details', container).open = true;
      q('[name="body"]', container)?.focus();
      return;
    }
    if (name === 'save-draft') return savePanel(container, 'draft');
    if (name === 'save') return savePanel(container, 'saved');
    if (name === 'expand') return expand(container);
    if (name === 'read') return read(container);
    if (name === 'archive') return archive(container);
    if (name === 'clear') return clear(container);
  }

  return Object.freeze({
    fetchScope,
    mount,
    submission,
    handleAction,
  });
}

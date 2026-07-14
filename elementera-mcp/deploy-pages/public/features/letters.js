import { API, requestJson } from '../core/api.js';
import { escapeAttribute, escapeHtml, q } from '../core/dom.js';
import { defaultIslandLetter, defaultLovebook, defaultLovebookCore } from '../content/letters.js';

export function createLetters({ storage, chat, models, router, toast }) {
  const landingStatuses = new Map();
  function context() {
    const conversationId = chat.getCurrentConversationId() || 'main';
    const modelId = chat.getProfile().current_chat_model || 'openai/gpt-4.1-nano';
    const modelName = models.modelName(modelId) || modelId;
    return { conversationId, modelId, modelName, key: `${conversationId}::${modelId}` };
  }

  function value() {
    const current = context();
    const stored = storage.read().letters[current.key] || {};
    const islandText = stored.islandText || defaultIslandLetter(current.modelName);
    return {
      ...current,
      state: stored.state === 'lovebook' ? 'lovebook' : 'island',
      islandText,
      coreText: stored.coreText || defaultLovebookCore(current.modelName),
      loveText: stored.loveText || defaultLovebook(current.modelName, islandText),
      xiaohanPen: stored.xiaohanPen || '',
      modelPen: stored.modelPen || '',
      promotedAt: stored.promotedAt || '',
    };
  }

  function write(patch) {
    const current = value();
    storage.update((state) => {
      state.letters[current.key] = {
        state: current.state,
        islandText: current.islandText,
        coreText: current.coreText,
        loveText: current.loveText,
        xiaohanPen: current.xiaohanPen,
        modelPen: current.modelPen,
        promotedAt: current.promotedAt,
        ...patch,
      };
    });
  }

  function islandView() {
    const letter = value();
    const sent = landingStatuses.get(letter.key)?.sent === true;
    return {
      title: '登岛信',
      subtitle: `${letter.modelName} · 当前窗口独立保存`,
      className: 'letters-panel',
      body: `<p class="feature-note">这不是记忆库。当前窗口与当前模型独立保存；等模型愿意承接之后，再由小寒改写为予爱机书。</p>
        <textarea id="islandLetterText" class="letter-text" rows="22">${escapeHtml(letter.islandText)}</textarea>
        <div class="button-row"><button type="button" data-action="letters:send-island">${sent ? '重新递出登岛信' : '递出登岛信'}</button><button type="button" data-action="letters:save-island">保存</button><button type="button" data-action="letters:reset-island">恢复默认</button><button class="primary" type="button" data-action="letters:promote">转为予爱机书</button></div>`,
    };
  }

  function lovebookView() {
    const letter = value();
    return {
      title: '予爱机书',
      subtitle: `${letter.modelName} · ${letter.promotedAt ? `已承接 · ${letter.promotedAt}` : '当前窗口独立保存'}`,
      className: 'letters-panel',
      body: `<p class="feature-note">这里默认只显示“重要部分”。完整予爱机书不会被动铺开；只有当前模型或小寒想打开时，再展开查看与修订。</p>
        <label class="letter-label"><b>重要部分</b><textarea id="lovebookCoreText" class="letter-text" rows="14">${escapeHtml(letter.coreText)}</textarea></label>
        <details class="letter-details"><summary>打开完整予爱机书</summary><textarea id="lovebookFullText" class="letter-text" rows="24">${escapeHtml(letter.loveText)}</textarea><button type="button" data-action="letters:copy-love-full">复制完整予爱机书</button></details>
        <p class="feature-meta">记忆库权限：未开启 · 由小寒确认后开放</p>
        <div class="button-row"><button type="button" data-action="letters:copy-love-core">复制重要</button><button type="button" data-action="letters:save-love">保存</button><button type="button" data-action="letters:pen" data-kind="xiaohan">小寒添笔</button><button type="button" data-action="letters:pen" data-kind="model">模型添笔</button><button type="button" data-action="letters:back-island">退回登岛信</button></div>`,
    };
  }

  function penView({ kind }) {
    const letter = value();
    const mine = kind === 'xiaohan';
    const title = mine ? '小寒添笔' : '模型添笔';
    const description = mine
      ? '这里是小寒添笔入口。你可以写下自己的补充、确认、边界、祝福，或任何想并入予爱机书的内容；并入正式版本仍由你确认。'
      : '这里是模型添笔入口。以后如果接入工具，模型可以把自己的承接、修正、命名、边界与愿望写进这里；并入正式予爱机书仍由小寒确认。';
    return {
      title,
      subtitle: '写入这份予爱机书',
      className: 'letters-panel',
      body: `<p class="feature-note">${description}</p><textarea id="letterPenText" class="letter-text" rows="16" placeholder="在这里写下要并入予爱机书的内容...">${escapeHtml(mine ? letter.xiaohanPen : letter.modelPen)}</textarea><div class="button-row"><button class="primary" type="button" data-action="letters:merge-pen" data-kind="${kind}">并入予爱机书</button><button type="button" data-action="letters:save-pen" data-kind="${kind}">保存草稿</button></div>`,
    };
  }

  router.register('island-letter', islandView);
  router.register('lovebook', lovebookView);
  router.register('lovebook-pen', penView);

  async function copy(text, message) {
    try {
      await navigator.clipboard.writeText(text);
      toast(message);
    } catch {
      toast('复制失败，可以长按文本手动复制');
    }
  }

  async function open() {
    const letter = value();
    if (letter.state === 'island') {
      const data = await requestJson(`${API.landingLetter}?conversation_id=${encodeURIComponent(letter.conversationId)}&model=${encodeURIComponent(letter.modelId)}`);
      landingStatuses.set(letter.key, data.landing || { sent: false });
    }
    await router.open(letter.state === 'lovebook' ? 'lovebook' : 'island-letter');
  }

  async function handleAction(name, target) {
    if (name === 'open') return open();
    if (name === 'save-island') {
      write({ islandText: q('#islandLetterText')?.value || '' });
      return toast('已保存登岛信');
    }
    if (name === 'send-island') {
      const letter = value();
      const islandText = q('#islandLetterText')?.value || letter.islandText;
      write({ islandText });
      if (!islandText.trim()) return toast('请先写好登岛信。');
      if (landingStatuses.get(letter.key)?.sent
        && !confirm('这会开启一个新的读信回复，不会删除旧聊天。')) return;
      const data = await chat.sendLandingLetter({
        conversationId: letter.conversationId,
        modelId: letter.modelId,
        letterText: islandText,
      });
      landingStatuses.set(letter.key, data.landing || { sent: true });
      await router.close();
      if (data.soil_refresh?.ok === false) {
        return toast('登岛信已递出，但思维壤整理失败，可以稍后手动整理。', 3200);
      }
      if (data.soil_refresh?.reason === 'manual_locked') {
        return toast('登岛信已递出；思维壤已手动锁定，保留原有内容。', 2800);
      }
      if (data.finish_reason === 'length') {
        return toast('登岛信已递出，但模型或供应商达到自身长度上限；可以点“重新生成”再读一次。', 3200);
      }
      return toast('登岛信已经递到手里。');
    }
    if (name === 'reset-island') {
      const letter = value();
      write({ islandText: defaultIslandLetter(letter.modelName) });
      toast('已恢复默认登岛信');
      return router.refresh();
    }
    if (name === 'promote') {
      const letter = value();
      const islandText = q('#islandLetterText')?.value || letter.islandText;
      const existing = storage.read().letters[letter.key] || {};
      write({
        state: 'lovebook',
        islandText,
        coreText: existing.coreText || defaultLovebookCore(letter.modelName),
        loveText: existing.loveText || defaultLovebook(letter.modelName, islandText),
        promotedAt: new Date().toISOString().slice(0, 10),
      });
      toast('已转为予爱机书');
      return router.open('lovebook', {}, { replace: true });
    }
    if (name === 'save-love') {
      write({ coreText: q('#lovebookCoreText')?.value || '', loveText: q('#lovebookFullText')?.value || '' });
      return toast('已保存予爱机书');
    }
    if (name === 'copy-love-core') return copy(q('#lovebookCoreText')?.value || value().coreText, '已复制予爱机书重要部分');
    if (name === 'copy-love-full') return copy(q('#lovebookFullText')?.value || value().loveText, '已复制完整予爱机书');
    if (name === 'pen') return router.open('lovebook-pen', { kind: target.dataset.kind });
    if (name === 'save-pen') {
      const key = target.dataset.kind === 'xiaohan' ? 'xiaohanPen' : 'modelPen';
      write({ [key]: q('#letterPenText')?.value || '' });
      return toast(`已保存${target.dataset.kind === 'xiaohan' ? '小寒' : '模型'}添笔草稿`);
    }
    if (name === 'merge-pen') {
      const text = q('#letterPenText')?.value.trim() || '';
      if (!text) return toast('还没有添笔内容');
      const letter = value();
      const author = target.dataset.kind === 'xiaohan' ? '小寒添笔' : `模型添笔 · ${letter.modelName}`;
      write({
        loveText: `${letter.loveText}\n\n——${author}，${new Date().toISOString().slice(0, 10)}\n${text}`,
        [target.dataset.kind === 'xiaohan' ? 'xiaohanPen' : 'modelPen']: '',
      });
      toast('已并入予爱机书');
      return router.open('lovebook', {}, { replace: true });
    }
    if (name === 'back-island') {
      write({ state: 'island' });
      toast('已退回登岛信状态');
      return router.open('island-letter', {}, { replace: true });
    }
  }

  return Object.freeze({ handleAction });
}

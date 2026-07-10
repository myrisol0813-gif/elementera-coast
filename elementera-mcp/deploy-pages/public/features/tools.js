import { API, requestJson } from '../core/api.js';
import { escapeAttribute, escapeHtml, q } from '../core/dom.js';

const DEFAULT_FREE = 'nvidia/nemotron-3-super-120b-a12b:free';
const FREE_MODELS = Object.freeze([
  ['nvidia/nemotron-3-super-120b-a12b:free', 'NVIDIA Nemotron 3 Super · free'],
  ['nvidia/nemotron-3-ultra-550b-a55b:free', 'NVIDIA Nemotron 3 Ultra · free'],
]);

export function createTools({ storage, router, toast }) {
  let sandboxModel = DEFAULT_FREE;

  const choices = Object.freeze({
    recentTurns: [[2, '2'], [4, '4'], [8, '8'], [12, '12']],
    contextBudget: [[2000, '低 · 2000'], [6000, '中 · 6000'], [12000, '高 · 12000']],
    outputLength: [['auto', '自动'], ['short', '偏短'], ['long', '长信']],
    creativity: [['stable', '稳定'], ['balanced', '自然'], ['expansive', '发散']],
  });

  function choiceRow(name, title, note = '') {
    const settings = storage.read().runControl;
    const options = choices[name].map(([value, label]) => `<label class="choice-pill"><input type="radio" name="${name}" data-input="tools:setting" value="${escapeAttribute(value)}" ${String(settings[name]) === String(value) ? 'checked' : ''}><span>${escapeHtml(label)}</span></label>`).join('');
    return `<div class="control-item"><h3>${escapeHtml(title)}</h3><div class="choice-list">${options}</div>${note ? `<p>${escapeHtml(note)}</p>` : ''}</div>`;
  }

  function numberRow(name, title, min, max, step, note) {
    const value = storage.read().runControl[name];
    return `<label class="control-item number-item"><h3>${escapeHtml(title)}</h3><input type="number" name="${name}" data-input="tools:setting" min="${min}" max="${max}" step="${step}" inputmode="numeric" value="${escapeAttribute(value)}"><p>${escapeHtml(note)}</p></label>`;
  }

  function group(title, body) {
    return `<section class="feature-group"><h2>${escapeHtml(title)}</h2><div class="feature-card control-card">${body}</div></section>`;
  }

  function runControlView() {
    return {
      title: 'API 小屋运行控制层',
      subtitle: 'Local settings · Context · Token budget',
      className: 'run-control',
      body: `<p class="feature-note">这些设置保存在统一的本地状态中，并直接供主聊天请求读取。</p>
        ${group('上下文预算', choiceRow('recentTurns', '最近上下文轮数') + choiceRow('contextBudget', '上下文 token 预算', '预算值，当前不做精确 tokenizer 计算。'))}
        ${group('输出偏好', choiceRow('outputLength', '回答长度', '默认由模型按话题判断长度；这里只作为临时偏好。') + choiceRow('creativity', '表达倾向'))}
        ${group('小纸条与种子 · 预留', numberRow('scratchpadBudget', '小纸条预算 · 预留', 0, 2400, 100, '当前只保存预算，不生成小纸条。') + numberRow('seedRecallLimit', '种子召回上限 · 预留', 0, 6, 1, '当前不召回真实种子。') + '<div class="control-info"><strong>记忆召回：暂未接入</strong><p>未来默认自动低频，由模型按相关性判断。</p></div>')}
        ${group('应急清理', '<button class="danger-row" type="button" data-action="tools:clear-context"><strong>清空 API 临时上下文</strong><small>用于重置请求前临时拼装；不会删除聊天记录。</small></button><button class="disabled-row" type="button" disabled><strong>清空当前小纸条 · 暂未接入</strong><small>当前没有真实小纸条。</small></button><button class="disabled-row" type="button" disabled><strong>清空待确认袋 · 暂未接入</strong><small>当前没有待确认袋。</small></button>')}`,
    };
  }

  function sandboxChoices() {
    return FREE_MODELS.map(([value, label]) => `<label class="sandbox-model"><input type="radio" name="sandboxModel" data-input="tools:sandbox-model" value="${escapeAttribute(value)}" ${value === sandboxModel ? 'checked' : ''}><span><strong>${escapeHtml(label)}</strong><small>${escapeHtml(value)}</small></span></label>`).join('');
  }

  function sandboxView() {
    return {
      title: 'API 免费沙盒测试',
      subtitle: 'Session · OpenRouter · Free endpoint',
      className: 'api-sandbox',
      body: `<p class="feature-note">这是施工测试，不会写入聊天记录，不会读取记忆，不会暴露 API key。这里只发送固定无隐私测试句。</p>
        ${group('免费测试模型', `<div class="sandbox-models">${sandboxChoices()}</div>`)}
        ${group('测试', '<button class="feature-row" type="button" data-action="tools:check-session"><span><strong>检查 session</strong><small>GET /api/health</small></span></button><button class="feature-row" type="button" data-action="tools:send-sandbox"><span><strong>发送免费模型测试</strong><small>POST /api/chat-sandbox · 固定无隐私测试句</small></span></button>')}
        ${group('结果', '<pre id="sandboxResult" class="sandbox-result is-muted">还没有运行测试。</pre>')}`,
    };
  }

  router.register('run-control', runControlView);
  router.register('api-sandbox', sandboxView);

  function setResult(value, muted = false) {
    const result = q('#sandboxResult');
    if (!result) return;
    result.textContent = value;
    result.classList.toggle('is-muted', muted);
  }

  async function withTimeout(promiseFactory, milliseconds = 30000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), milliseconds);
    try {
      return await promiseFactory(controller.signal);
    } finally {
      clearTimeout(timeout);
    }
  }

  async function checkSession() {
    setResult('正在检查 session……', true);
    try {
      const data = await requestJson(API.health);
      setResult(`ok: ${data.ok}\nauthenticated: ${data.authenticated}\nts: ${data.ts || ''}`);
    } catch (error) {
      setResult(`请求失败：${error.message}`);
    }
  }

  async function sendSandbox() {
    setResult('正在请求免费模型……如果长时间没有返回，可能是免费 endpoint 排队或限速。', true);
    try {
      const data = await withTimeout((signal) => requestJson(API.sandbox, {
        method: 'POST',
        signal,
        body: JSON.stringify({
          model: sandboxModel,
          messages: [{ role: 'user', content: '请用一句不超过二十字的中文回应：海岸测试灯已亮。' }],
          max_tokens: 80,
          temperature: 0.2,
        }),
      }));
      setResult(`model: ${data.model || sandboxModel}\n\n${data?.message?.content || '模型没有返回文本。'}`);
    } catch (error) {
      setResult(error.name === 'AbortError'
        ? '请求超时：免费模型可能正在排队、限速或临时不可用。'
        : `请求失败：${error.message}`);
    }
  }

  function handleAction(name) {
    if (name === 'run-control') return router.open('run-control');
    if (name === 'sandbox') return router.open('api-sandbox');
    if (name === 'clear-context') {
      if (!confirm('确定清空 API 临时上下文吗？这不会清空现有聊天记录。')) return;
      toast('API 临时上下文已清空。');
      return;
    }
    if (name === 'check-session') return checkSession();
    if (name === 'send-sandbox') return sendSandbox();
  }

  function handleInput(name, target) {
    if (name === 'sandbox-model') {
      sandboxModel = target.value || DEFAULT_FREE;
      return;
    }
    if (name !== 'setting') return;
    const numeric = ['recentTurns', 'contextBudget', 'scratchpadBudget', 'seedRecallLimit'].includes(target.name);
    storage.update((state) => {
      state.runControl[target.name] = numeric ? Number(target.value) : target.value;
    });
  }

  return Object.freeze({ handleAction, handleInput, getSettings: () => storage.read().runControl });
}


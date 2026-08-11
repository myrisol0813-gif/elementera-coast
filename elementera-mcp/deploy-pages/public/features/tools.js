import { API, requestJson } from '../core/api.js';
import { escapeAttribute, escapeHtml, q } from '../core/dom.js';

const DEFAULT_FREE = 'nvidia/nemotron-3-super-120b-a12b:free';
const FREE_MODELS = Object.freeze([
  ['nvidia/nemotron-3-super-120b-a12b:free', 'NVIDIA Nemotron 3 Super · free'],
  ['nvidia/nemotron-3-ultra-550b-a55b:free', 'NVIDIA Nemotron 3 Ultra · free'],
]);

export function createTools({ storage, router, toast, memory }) {
  let sandboxModel = DEFAULT_FREE;

  const choices = Object.freeze({
    recentTurns: [[2, '2'], [4, '4'], [8, '8'], [12, '12']],
    contextBudget: [[2000, '低 · 2000'], [6000, '中 · 6000'], [12000, '高 · 12000']],
    outputLength: [['auto', '自然'], ['short', '偏短'], ['long', '长信']],
    creativity: [['stable', '稳定'], ['balanced', '自然'], ['expansive', '发散']],
    streamingEnabled: [[false, '关闭'], [true, '开启']],
    worldbookEnabled: [[false, '关闭'], [true, '开启']],
  });

  function choiceRow(name, title, note = '') {
    const settings = storage.read().runControl;
    const current = ['streamingEnabled', 'worldbookEnabled'].includes(name) ? Boolean(settings[name]) : settings[name];
    const options = choices[name].map(([value, label]) => `<label class="choice-pill"><input type="radio" name="${name}" data-input="tools:setting" value="${escapeAttribute(value)}" ${String(current) === String(value) ? 'checked' : ''}><span>${escapeHtml(label)}</span></label>`).join('');
    return `<div class="control-item"><h3>${escapeHtml(title)}</h3><div class="choice-list">${options}</div>${note ? `<p>${escapeHtml(note)}</p>` : ''}</div>`;
  }

  function numberRow(name, title, min, max, step, note) {
    const value = storage.read().runControl[name];
    return `<label class="control-item number-item"><h3>${escapeHtml(title)}</h3><input type="number" name="${name}" data-input="tools:setting" min="${min}" max="${max}" step="${step}" inputmode="numeric" value="${escapeAttribute(value)}"><p>${escapeHtml(note)}</p></label>`;
  }

  function noteRow(title, note) {
    return `<div class="control-item"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(note)}</p></div>`;
  }

  function group(title, body) {
    return `<section class="feature-group"><h2>${escapeHtml(title)}</h2><div class="feature-card control-card">${body}</div></section>`;
  }

  function runControlView() {
    return {
      title: 'API 小屋运行控制层',
      subtitle: '本地设置 · 干净纸条 · 舒服区间',
      className: 'run-control',
      body: `<p class="feature-note">这些设置保存在统一的本地状态中，并直接供主聊天请求读取。</p>
        ${group('上下文舒服区间', choiceRow('recentTurns', '最近聊天轮数') + choiceRow('contextBudget', '舒服区间上沿', '接近上沿时先裁低相关旧纸条，当前输入、最近聊天与思维壤最后才动。'))}
        ${group('输出偏好', choiceRow('outputLength', '回答长度', '“偏短”最多 700 tokens；“自然”和“长信”使用下方上限。') + numberRow('maxOutputTokens', '最大输出 token', 64, 65536, 64, '这是单次回复允许生成的最高值，不代表每次一定用满。余额较少时可调低；自动标题固定为 40，不受此项影响。') + choiceRow('creativity', '表达倾向'))}
        ${group('生成方式', choiceRow('streamingEnabled', '流式输出', '默认关闭。开启后只有普通聊天走真实流式输出；登岛信继续使用稳定 JSON 路径。'))}
        ${group('思维壤与记忆', numberRow('soilBudget', '思维壤最多字数', 300, 4000, 100, '过长时只做普通截断，不生成压缩版或压缩报告。') + noteRow('思维壤整理频率', '每个完成轮次自动整理一次。') + numberRow('maxHandSeeds', '手持种上限', 1, 7, 1, '默认最多 7 粒。') + numberRow('seedCooldownTurns', '种子冷却轮数', 0, 8, 1, '避免同一张记忆纸条连续出现。') + numberRow('conversationSeedLimit', '当前窗口种子上限', 0, 6, 1, '默认最多 3 粒。') + numberRow('globalSeedLimit', '总库种子上限', 0, 6, 1, '默认最多 1 粒。') + numberRow('conversationMemoryLimit', '当前窗口记忆上限', 0, 6, 1, '默认最多 2 条。') + numberRow('globalMemoryLimit', '总库记忆上限', 0, 6, 1, '默认最多 1 条。') + numberRow('memoryLimit', '全部相关记忆上限', 0, 12, 1, '还会由舒服区间继续裁纸。'))}
        ${group('海岸词典', choiceRow('worldbookEnabled', '关键词词典') + numberRow('worldbookLimit', '每轮最多词条', 0, 6, 1, '没有命中时不会递空块。'))}
        ${group('应急与查看', '<button class="danger-row" type="button" data-action="tools:clear-soil"><strong>清空当前思维壤</strong><small>不会删除聊天、种子或记忆。</small></button><button class="feature-row" type="button" data-action="tools:open-pockets"><span><strong>打开待确认袋</strong><small>确认落袋内容的去向。</small></span><span>›</span></button><button class="feature-row" type="button" data-action="tools:vector-status"><span><strong>查看向量状态</strong><small>检查 Workers AI 与记忆检索连接。</small></span><span>›</span></button>')}`,
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
    if (name === 'clear-soil') return memory.clearSoil().then((cleared) => {
      if (cleared) toast('当前思维壤已清空。');
    });
    if (name === 'open-pockets') return memory.openPockets();
    if (name === 'vector-status') return memory.showVectorStatus();
    if (name === 'check-session') return checkSession();
    if (name === 'send-sandbox') return sendSandbox();
  }

  function handleInput(name, target) {
    if (name === 'sandbox-model') {
      sandboxModel = target.value || DEFAULT_FREE;
      return;
    }
    if (name !== 'setting') return;
    const numeric = [
      'recentTurns', 'contextBudget', 'maxOutputTokens', 'soilBudget', 'autoRefreshEveryTurns', 'maxHandSeeds',
      'conversationSeedLimit', 'conversationSeedStallLimit', 'globalSeedLimit',
      'conversationMemoryLimit', 'globalMemoryLimit', 'seedCooldownTurns',
      'worldbookLimit', 'memoryLimit',
    ].includes(target.name);
    storage.update((state) => {
      if (['streamingEnabled', 'worldbookEnabled'].includes(target.name)) state.runControl[target.name] = target.value === 'true';
      else state.runControl[target.name] = numeric ? Number(target.value) : target.value;
    });
  }

  return Object.freeze({ handleAction, handleInput, getSettings: () => storage.read().runControl });
}

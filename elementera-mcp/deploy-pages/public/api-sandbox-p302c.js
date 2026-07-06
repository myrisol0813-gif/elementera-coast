(() => {
  if (window.__apiSandboxP302C) return;
  window.__apiSandboxP302C = true;

  const MODELS = [
    ['nvidia/nemotron-3-super-120b-a12b:free', 'NVIDIA Nemotron 3 Super · free'],
    ['nvidia/nemotron-3-ultra-550b-a55b:free', 'NVIDIA Nemotron 3 Ultra · free'],
  ];
  const DEFAULT_MODEL = 'nvidia/nemotron-3-super-120b-a12b:free';
  const REQUEST_TIMEOUT_MS = 30000;
  let selectedModel = DEFAULT_MODEL;

  const q = (selector, root = document) => root.querySelector(selector);
  const qa = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const esc = (value) => String(value ?? '').replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char]));

  function installCss() {
    if (q('#apiSandboxP302CStyle')) return;
    const style = document.createElement('style');
    style.id = 'apiSandboxP302CStyle';
    style.textContent = `.api-sandbox-p302c .sandbox-note{margin:0 0 16px;color:var(--muted);font-size:13px;line-height:1.65}.api-sandbox-p302c .sandbox-models{display:grid;gap:9px}.api-sandbox-p302c .sandbox-model{display:flex;gap:9px;align-items:flex-start;padding:13px 14px;border-bottom:1px solid var(--line)}.api-sandbox-p302c .sandbox-model:last-child{border-bottom:0}.api-sandbox-p302c .sandbox-model input{margin-top:3px}.api-sandbox-p302c .sandbox-model strong{display:block;color:var(--text);font-size:15px}.api-sandbox-p302c .sandbox-model small{display:block;margin-top:4px;color:var(--muted);font-size:12px;word-break:break-word;overflow-wrap:anywhere}.api-sandbox-p302c .sandbox-actions{display:grid;gap:0}.api-sandbox-p302c .sandbox-actions button{display:block;width:100%;min-height:58px;padding:14px 18px;text-align:left;color:var(--text);background:transparent;border-bottom:1px solid var(--line)}.api-sandbox-p302c .sandbox-actions button:last-child{border-bottom:0}.api-sandbox-p302c .sandbox-actions strong{display:block;font-size:16px;letter-spacing:-.02em}.api-sandbox-p302c .sandbox-actions small{display:block;margin-top:5px;color:var(--muted);font-size:13px;line-height:1.45}.api-sandbox-p302c .sandbox-result{box-sizing:border-box;width:100%;margin:0;padding:16px 18px;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;font-size:13px;line-height:1.7;color:var(--text)}.api-sandbox-p302c .sandbox-result.is-muted{color:var(--muted)}`;
    document.head.appendChild(style);
  }

  function group(title, body) {
    return `<section class="clean-group"><h2>${esc(title)}</h2><div class="clean-card">${body}</div></section>`;
  }

  function modelChoices() {
    return `<div class="sandbox-models">${MODELS.map(([value, label]) => `<label class="sandbox-model"><input type="radio" name="sandboxModelP302C" value="${esc(value)}" ${value === selectedModel ? 'checked' : ''}><span><strong>${esc(label)}</strong><small>${esc(value)}</small></span></label>`).join('')}</div>`;
  }

  function setResult(text, muted = false) {
    const box = q('#apiSandboxResultP302C');
    if (!box) return;
    box.classList.toggle('is-muted', muted);
    box.textContent = text;
  }

  function explain(status, data) {
    const error = data?.error || 'Request failed.';
    if (status === 401) return '401 Unauthorized：未登录或 session 过期，请先通过海岸密码门登录。';
    if (status === 503) return '503：OpenRouter key is not configured. 请检查 Cloudflare Variables and secrets 或重新部署。';
    if (status === 400 && String(error).includes('Model')) return '400：Model is not allowed. 当前模型不在免费白名单中。';
    if (status === 502) return '502：OpenRouter 上游失败，可能是免费模型限速、排队、临时不可用或网络问题。请换另一个免费模型或稍后再试。';
    return `${status || 'Error'}：${error}`;
  }

  async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function checkSession() {
    setResult('正在检查 session……', true);
    try {
      const res = await fetch('/api/health', { credentials: 'same-origin', cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        setResult(explain(res.status, data));
        return;
      }
      setResult(`ok: ${data.ok}\nauthenticated: ${data.authenticated}\nts: ${data.ts || ''}`);
    } catch (error) {
      setResult(`请求失败：${error?.message || error}`);
    }
  }

  async function sendSandbox() {
    setResult('正在请求免费模型……如果长时间没有返回，可能是免费 endpoint 排队或限速。', true);
    try {
      const res = await fetchWithTimeout('/__coast_free_chat', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: selectedModel }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        setResult(explain(res.status, data));
        return;
      }
      const content = data?.message?.content || '';
      setResult(`model: ${data.model || selectedModel}\n\n${content || '模型没有返回文本。'}`);
    } catch (error) {
      if (error?.name === 'AbortError') {
        setResult('请求超时：免费模型可能正在排队、限速或临时不可用。请换另一个模型或稍后再试。');
        return;
      }
      setResult(`请求失败：${error?.message || error}`);
    }
  }

  function panelHtml() {
    return `<header class="clean-head"><button class="clean-back" type="button" data-sandbox-back>←</button><div><h1>API 免费沙盒测试</h1><p>Session · OpenRouter · Free endpoint</p></div></header><main class="clean-body"><p class="sandbox-note">这是施工测试，不会写入聊天记录，不会读取记忆，不会暴露 API key。免费 endpoint 可能记录 prompts 和输出，所以这里只发送固定无隐私测试句。</p>${group('免费测试模型', modelChoices())}${group('测试', '<div class="sandbox-actions"><button type="button" data-sandbox-action="session"><strong>检查 session</strong><small>GET /api/health</small></button><button type="button" data-sandbox-action="send"><strong>发送免费模型测试</strong><small>POST /__coast_free_chat · 固定无隐私测试句</small></button></div>')}${group('结果', '<pre id="apiSandboxResultP302C" class="sandbox-result is-muted">还没有运行测试。</pre>')}</main>`;
  }

  function openPanel() {
    installCss();
    let panel = q('#apiSandboxPanelP302C');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'apiSandboxPanelP302C';
      panel.className = 'clean-panel api-sandbox-p302c';
      document.body.appendChild(panel);
    }
    panel.hidden = false;
    panel.innerHTML = panelHtml();
    q('#cleanDeskV093')?.setAttribute('hidden', '');
    document.body.classList.add('wolf-open');
  }

  function closePanel() {
    const panel = q('#apiSandboxPanelP302C');
    if (panel) panel.hidden = true;
    const desk = q('#cleanDeskV093');
    if (desk) desk.hidden = false;
  }

  function ensureEntry() {
    installCss();
    const desk = q('#cleanDeskV093');
    if (!desk || q('[data-api-sandbox-p302c]', desk)) return;
    const group = qa('.clean-group', desk).find((section) => (q('h2', section)?.textContent || '').includes('施工'));
    const card = group && q('.clean-card', group);
    if (!card) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'clean-row api-sandbox-entry-p302c';
    button.dataset.apiSandboxP302c = 'open';
    button.innerHTML = '<span><strong>API 免费沙盒测试</strong><small>OpenRouter free endpoint · 不写入聊天</small></span>';
    card.appendChild(button);
  }

  document.addEventListener('click', (event) => {
    const entry = event.target.closest('[data-api-sandbox-p302c]');
    if (entry) {
      event.preventDefault();
      event.stopPropagation();
      openPanel();
      return;
    }
    if (event.target.closest('[data-sandbox-back]')) {
      event.preventDefault();
      event.stopPropagation();
      closePanel();
      return;
    }
    const action = event.target.closest('[data-sandbox-action]')?.dataset.sandboxAction;
    if (action === 'session') {
      event.preventDefault();
      event.stopPropagation();
      checkSession();
    }
    if (action === 'send') {
      event.preventDefault();
      event.stopPropagation();
      sendSandbox();
    }
  }, true);

  document.addEventListener('change', (event) => {
    if (event.target?.name === 'sandboxModelP302C') selectedModel = event.target.value || DEFAULT_MODEL;
  }, true);

  const start = () => {
    installCss();
    ensureEntry();
    new MutationObserver(ensureEntry).observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();

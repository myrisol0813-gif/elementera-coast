import { API, requestJson } from '../core/api.js';
import { escapeHtml } from '../core/dom.js';

export function createToolroom({ chat, router }) {
  const state = { tools: [], runs: [] };

  async function load() {
    const conversation = encodeURIComponent(chat.getCurrentConversationId() || '');
    const [tools, runs] = await Promise.all([
      requestJson(`${API.workbenchTools}?conversation_id=${conversation}&surface=main_chat`),
      requestJson(`${API.workbenchRuns}?limit=100`),
    ]);
    state.tools = tools.tools || [];
    state.runs = runs.runs || [];
  }

  async function view() {
    await load();
    return {
      title: '工作台记录',
      subtitle: '海岸家具 · 只记动作摘要',
      className: 'toolroom-panel',
      headerAction: '<button class="feature-head-action" type="button" data-action="toolroom:refresh">刷新</button>',
      body: `<section class="tool-catalog"><h2>海岸家具</h2><div>${state.tools.map((tool) => `<span title="${escapeHtml(tool.description)}">${escapeHtml(tool.display_name)}</span>`).join('')}</div></section><section class="tool-run-list"><h2>最近动用</h2>${state.runs.length ? state.runs.map((run) => { const furniture = state.tools.find((tool) => tool.tool_key === run.tool_key)?.display_name || run.tool_key; return `<details class="tool-run is-${escapeHtml(run.status)}"><summary><span><strong>${escapeHtml(furniture)}</strong><small>${escapeHtml(run.actor)} · ${escapeHtml(run.room_scope)} · ${new Date(run.created_at).toLocaleString()}</small></span><i>${escapeHtml(run.status)}</i></summary><pre>${escapeHtml(JSON.stringify({ input: run.input_summary, output: run.output_summary, error: run.error_message }, null, 2))}</pre></details>`; }).join('') : '<p class="feature-note">还没有家具运行记录。</p>'}</section>`,
    };
  }

  router.register('toolroom', view);

  function handleAction(name) {
    if (name === 'open') return router.open('toolroom');
    if (name === 'refresh') return router.refresh({ preserveScroll: false });
  }

  return Object.freeze({ handleAction });
}

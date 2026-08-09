import { API, requestJson } from '../core/api.js';
import { escapeHtml } from '../core/dom.js';

export function createToolroom({ chat, router }) {
  const state = { tools: [], runs: [] };

  async function load() {
    const conversation = encodeURIComponent(chat.getCurrentConversationId() || '');
    const [tools, runs] = await Promise.all([
      requestJson(`${API.contextTools}?conversation_id=${conversation}&surface=main_chat`),
      requestJson(`${API.contextToolRuns}?limit=100`),
    ]);
    state.tools = tools.tools || [];
    state.runs = runs.runs || [];
  }

  async function view() {
    await load();
    return {
      title: '工具运行记录',
      subtitle: 'Tool Registry · owner-only',
      className: 'toolroom-panel',
      headerAction: '<button class="feature-head-action" type="button" data-action="toolroom:refresh">刷新</button>',
      body: `<section class="tool-catalog"><h2>当前情境可用</h2><div>${state.tools.map((tool) => `<span title="${escapeHtml(tool.description)}">${escapeHtml(tool.tool_key)}</span>`).join('')}</div></section><section class="tool-run-list"><h2>最近运行</h2>${state.runs.length ? state.runs.map((run) => `<details class="tool-run is-${escapeHtml(run.status)}"><summary><span><strong>${escapeHtml(run.tool_key)}</strong><small>${escapeHtml(run.actor)} · ${escapeHtml(run.room_scope)} · ${new Date(run.created_at).toLocaleString()}</small></span><i>${escapeHtml(run.status)}</i></summary><pre>${escapeHtml(JSON.stringify({ input: run.input_summary, output: run.output_summary, error: run.error_message }, null, 2))}</pre></details>`).join('') : '<p class="feature-note">还没有工具运行记录。</p>'}</section>`,
    };
  }

  router.register('toolroom', view);

  function handleAction(name) {
    if (name === 'open') return router.open('toolroom');
    if (name === 'refresh') return router.refresh({ preserveScroll: false });
  }

  return Object.freeze({ handleAction });
}

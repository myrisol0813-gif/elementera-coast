import { McpAuthError, mcpAuthChallenge, requireMcpAuth } from './mcp-auth.js';

const WIDGET_URI = 'ui://widget/elementera-thinking-soil-v1.html';
const WIDGET_MIME = 'text/html;profile=mcp-app';
const MAX_CURRENT = 6000;
const MAX_DO_NOT_REPEAT = 1600;
const MAX_SEEDS = 7;

function cleanText(value, limit) {
  return String(value ?? '').trim().slice(0, limit);
}

function cleanSeeds(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanText(item, 420))
    .filter(Boolean)
    .slice(0, MAX_SEEDS);
}

export const THINKING_BLOCK_TOOL_NAME = 'render_thinking_block';

export const THINKING_BLOCK_TOOL = Object.freeze({
  name: THINKING_BLOCK_TOOL_NAME,
  title: '展开本轮思维壤',
  description: [
    'Render one concise, user-visible working-note card before the final answer when showing the current direction, constraints, options, or uncertainty would genuinely help.',
    'Your internal reasoning is normally hidden from the user; use this tool to turn the shareable part into a concise visible summary without exposing private chain-of-thought.',
    'Do not use it for trivial replies. Keep current_text useful and compact; hand_seeds should be short constraints or threads. After calling this tool, continue with the final answer.',
    'This presentation-only card does not read or write Elementera Coast memory and does not replace the persistent 思维壤 shown in the Coast web app.',
  ].join(' '),
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      style: {
        type: 'string',
        enum: ['deep_think', 'relational'],
        description: 'deep_think for analytical work; relational for interpersonal or reflective work.',
      },
      effort: {
        type: 'string',
        enum: ['low', 'medium', 'high'],
        description: 'How much visible working context is useful for this turn.',
      },
      current_text: {
        type: 'string',
        minLength: 1,
        maxLength: MAX_CURRENT,
        description: 'A concise visible version of the shareable part of reasoning that would otherwise remain hidden from the user; do not expose private chain-of-thought.',
      },
      hand_seeds: {
        type: 'array',
        maxItems: MAX_SEEDS,
        items: { type: 'string', minLength: 1, maxLength: 420 },
        description: 'Short constraints, assumptions, or threads worth keeping in hand for the final answer.',
      },
      do_not_repeat: {
        type: 'string',
        maxLength: MAX_DO_NOT_REPEAT,
        description: 'Optional note about an approach already ruled out or a mistake to avoid repeating.',
      },
    },
    required: ['style', 'effort', 'current_text'],
  },
  outputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      style: { type: 'string', enum: ['deep_think', 'relational'] },
      effort: { type: 'string', enum: ['low', 'medium', 'high'] },
      current_text: { type: 'string' },
      hand_seeds: { type: 'array', items: { type: 'string' } },
      do_not_repeat: { type: 'string' },
      persisted: { type: 'boolean', const: false },
    },
    required: ['style', 'effort', 'current_text', 'hand_seeds', 'do_not_repeat', 'persisted'],
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
    idempotentHint: true,
  },
  securitySchemes: [{ type: 'oauth2', scopes: ['read:coast'] }],
  _meta: {
    securitySchemes: [{ type: 'oauth2', scopes: ['read:coast'] }],
    ui: { resourceUri: WIDGET_URI, visibility: ['model', 'app'] },
    'openai/outputTemplate': WIDGET_URI,
    'openai/toolInvocation/invoking': '正在整理本轮思维壤…',
    'openai/toolInvocation/invoked': '本轮思维壤已展开',
  },
});

function normalizeThinkingBlock(input = {}) {
  const style = input.style === 'relational' ? 'relational' : 'deep_think';
  const effort = ['low', 'medium', 'high'].includes(input.effort) ? input.effort : 'medium';
  const current_text = cleanText(input.current_text, MAX_CURRENT);
  if (!current_text) throw new TypeError('current_text is required.');
  return {
    style,
    effort,
    current_text,
    hand_seeds: cleanSeeds(input.hand_seeds),
    do_not_repeat: cleanText(input.do_not_repeat, MAX_DO_NOT_REPEAT),
    persisted: false,
  };
}

export function renderThinkingBlockResult(input = {}) {
  const block = normalizeThinkingBlock(input);
  return {
    content: [{
      type: 'text',
      text: '已把默认隐藏的思考中可公开的部分整理成本轮可见工作笔记；它不会写入海岸记忆。',
    }],
    structuredContent: block,
    _meta: {
      ...block,
      'openai/outputTemplate': WIDGET_URI,
    },
  };
}

export async function callThinkingBlockTool(input, request, env) {
  const scopes = ['read:coast'];
  try {
    await requireMcpAuth(request, env, scopes);
    return renderThinkingBlockResult(input);
  } catch (error) {
    if (error instanceof McpAuthError) {
      return {
        isError: true,
        content: [{ type: 'text', text: error.message }],
        _meta: {
          'mcp/www_authenticate': [mcpAuthChallenge(request, error, scopes)],
          error_type: error.type,
          failure_code: error.failureCode || 'jwt_verify_failed',
          auth_diagnostic: error.details?.auth_diagnostic || null,
        },
      };
    }
    return {
      isError: true,
      content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
      _meta: { error_type: 'thinking_block_failed' },
    };
  }
}

export function listThinkingBlockResources() {
  return [{
    uri: WIDGET_URI,
    name: 'Elementera Coast · 本轮思维壤',
    title: '本轮思维壤',
    description: '把默认隐藏的思考中可公开的部分整理成 Elementera Coast 思维壤风格的可见工作笔记卡。',
    mimeType: WIDGET_MIME,
    _meta: {
      ui: { prefersBorder: false },
      'openai/widgetDescription': '把默认隐藏的思考中可公开部分整理成一张 Elementera Coast 思维壤风格的本轮可见工作笔记；不写入持久记忆。',
      'openai/widgetPrefersBorder': false,
    },
  }];
}

export function readThinkingBlockResource(uri) {
  if (String(uri || '') !== WIDGET_URI) return null;
  return {
    contents: [{
      uri: WIDGET_URI,
      mimeType: WIDGET_MIME,
      text: WIDGET_HTML,
      _meta: {
        ui: { prefersBorder: false },
        'openai/widgetDescription': '把默认隐藏的思考中可公开部分整理成一张 Elementera Coast 思维壤风格的本轮可见工作笔记；不写入持久记忆。',
        'openai/widgetPrefersBorder': false,
      },
    }],
  };
}

const WIDGET_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>本轮思维壤</title>
<style>
:root {
  color-scheme: light dark;
  --bg: transparent;
  --surface-soft: rgba(127,127,127,.095);
  --surface-raised: rgba(127,127,127,.13);
  --text: #181818;
  --text-soft: #323232;
  --muted: #77736d;
  --line: rgba(127,127,127,.16);
  --accent: #9b7835;
  --shadow: 0 12px 34px rgba(0,0,0,.07);
}
html[data-theme="dark"] {
  --surface-soft: rgba(255,255,255,.07);
  --surface-raised: rgba(255,255,255,.105);
  --text: #f3f0e8;
  --text-soft: #ded8cc;
  --muted: #aaa297;
  --line: rgba(255,255,255,.10);
  --accent: #d8b66d;
  --shadow: 0 14px 38px rgba(0,0,0,.24);
}
* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 2px;
  overflow-wrap: anywhere;
  background: var(--bg);
  color: var(--text);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.shell {
  overflow: hidden;
  border: 0;
  border-radius: 15px;
  background: var(--surface-soft);
  box-shadow: var(--shadow);
}
summary {
  display: grid;
  grid-template-columns: minmax(0,1fr) auto;
  align-items: center;
  gap: 12px;
  min-height: 52px;
  padding: 10px 15px;
  list-style: none;
  cursor: pointer;
}
summary::-webkit-details-marker { display: none; }
.headline { min-width: 0; }
.headline strong, .headline small { display: block; }
.headline strong {
  font-size: 13px;
  font-weight: 680;
  letter-spacing: -.01em;
}
.headline small {
  margin-top: 2px;
  overflow: hidden;
  color: var(--muted);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chevron {
  color: var(--muted);
  font-size: 15px;
  transition: transform .16s ease;
}
details[open] .chevron { transform: rotate(90deg); }
.body {
  display: grid;
  gap: 16px;
  padding: 2px 15px 16px;
}
.group h2 {
  margin: 0;
  padding: 0 3px 7px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 650;
}
.card {
  border: 0;
  border-radius: 13px;
  background: var(--surface-raised);
}
.prose {
  margin: 0;
  padding: 14px 15px;
  color: var(--text-soft);
  font-size: 13px;
  line-height: 1.66;
  white-space: pre-wrap;
}
.seeds { display: grid; }
.seed {
  padding: 11px 14px;
  color: var(--text-soft);
  font-size: 12px;
  line-height: 1.48;
}
.seed + .seed { border-top: 1px solid var(--line); }
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 2px;
  color: var(--muted);
  font-size: 10px;
}
.pill {
  padding: 3px 7px;
  border-radius: 999px;
  background: var(--surface-raised);
}
.note {
  margin: 0;
  color: var(--muted);
  font-size: 10px;
  line-height: 1.5;
}
[hidden] { display: none !important; }
</style>
</head>
<body>
<details class="shell" open>
  <summary>
    <div class="headline">
      <strong>本轮思维壤</strong>
      <small id="subtitle">默认隐藏 → 可见整理 · 不写入海岸记忆</small>
    </div>
    <span class="chevron" aria-hidden="true">›</span>
  </summary>
  <div class="body">
    <section class="group">
      <h2>当前</h2>
      <div class="card"><p class="prose" id="current">正在整理…</p></div>
    </section>
    <section class="group" id="seedGroup" hidden>
      <h2 id="seedTitle">手持种</h2>
      <div class="card seeds" id="seeds"></div>
    </section>
    <section class="group" id="avoidGroup" hidden>
      <h2>勿复读</h2>
      <div class="card"><p class="prose" id="avoid"></p></div>
    </section>
    <div class="meta">
      <span class="pill" id="stylePill">分析</span>
      <span class="pill" id="effortPill">中等展开</span>
      <span class="pill">仅本轮</span>
    </div>
    <p class="note">你的内部思考过程默认对用户隐藏；这里把其中可公开、可分享的部分整理成可见版，不展示私密内部推理，也不会覆盖海岸网页里的持久思维壤。</p>
  </div>
</details>
<script>
(() => {
  const $ = (id) => document.getElementById(id);
  const labels = {
    deep_think: '分析', relational: '关系/反思',
    low: '轻量展开', medium: '中等展开', high: '较深展开',
  };
  function payload() {
    const input = window.openai?.toolInput || {};
    const output = window.openai?.toolOutput || {};
    const meta = window.openai?.toolResponseMetadata || {};
    return { ...input, ...output, ...meta };
  }
  function applyTheme() {
    const theme = window.openai?.theme || 'light';
    document.documentElement.dataset.theme = theme === 'dark' ? 'dark' : 'light';
  }
  function render() {
    applyTheme();
    const data = payload();
    const current = String(data.current_text || '').trim();
    $('current').textContent = current || '正在整理本轮方向…';
    const seeds = Array.isArray(data.hand_seeds) ? data.hand_seeds.map(String).map((x) => x.trim()).filter(Boolean).slice(0, 7) : [];
    $('seedGroup').hidden = seeds.length === 0;
    $('seedTitle').textContent = seeds.length ? '手持种 · ' + seeds.length : '手持种';
    $('seeds').replaceChildren(...seeds.map((seed) => {
      const div = document.createElement('div');
      div.className = 'seed';
      div.textContent = seed;
      return div;
    }));
    const avoid = String(data.do_not_repeat || '').trim();
    $('avoidGroup').hidden = !avoid;
    $('avoid').textContent = avoid;
    $('stylePill').textContent = labels[data.style] || labels.deep_think;
    $('effortPill').textContent = labels[data.effort] || labels.medium;
    $('subtitle').textContent = (labels[data.style] || labels.deep_think) + ' · 默认隐藏 → 可见整理 · 不写入海岸记忆';
  }
  window.addEventListener('openai:set_globals', render);
  render();
})();
</script>
</body>
</html>`;

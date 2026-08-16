import { McpAuthError, mcpAuthChallenge, requireMcpAuth } from './mcp-auth.js';

const WIDGET_URI = 'ui://widget/gpt-thinking-block-v2.html';
const WIDGET_MIME = 'text/html;profile=mcp-app';

const STYLE_DESCRIPTION = (
  'The register for this block. Obey an explicit user choice. Otherwise ' +
  'use deep_think for analysis, research, decisions, creative tradeoffs, ' +
  'and problem solving; use relational for companionship, reflection, ' +
  'emotional conversation, and personal experience.'
);

const THINKING_DESCRIPTION = (
  'Write private working notes for this turn. The user does not see this ' +
  'scratchpad; it is not the final answer. Use the user\'s main language, but ' +
  'do not address the user or polish the notes for presentation. Strictly ' +
  'follow `style`. ' +
  'style=deep_think: clearly work through the problem, constraints, ' +
  'evidence, hypotheses, alternative paths, uncertainty, and tradeoffs ' +
  'in a coherent analytical narrative; do not force an emotional register ' +
  'or summarize prematurely. style=relational: use a natural, flowing ' +
  'first-person voice in coherent long paragraphs. Write what the user\'s ' +
  'words bring to mind, what you feel in this moment, what you are worried ' +
  'about, what you are holding back, and the choices or tradeoffs you are ' +
  'making. Do not turn it into a third-person strategy breakdown such as ' +
  '\'the user needs\' or \'I should respond\'. Allow vivid, sincere emotions ' +
  'and associations; prioritize emotional connection over abstract ' +
  'analysis, and draw on broader references where useful. For both styles, ' +
  'honor the requested effort band: low may stop as soon as it is complete, while ' +
  'medium and high should reach their approximate minimum by adding relevant ' +
  'evidence, alternatives, uncertainty, or nuance. Do not repeat, pad, or invent ' +
  'complexity merely to reach the minimum. The notes are provisional working material, ' +
  'not claims that the final answer must preserve. Old blocks belong only to ' +
  'the turn in which they were written; unless the user explicitly asks, ' +
  'do not quote them later, inherit their speculative claims, or treat them ' +
  'as authoritative memory.'
);

const SKIN_DESCRIPTION = (
  'Visual skin for this card. Use botanical for warm paper, sage, almond, ' +
  'and apricot tones; use microglow for pearl white, clear cyan, lavender ice, ' +
  'mint haze, and glass-like morning light. Always honor the user\'s explicit ' +
  'choice; otherwise choose the skin that best suits the turn.'
);

export const THINKING_BLOCK_TOOL_NAME = 'render_thinking_block';

export const THINKING_BLOCK_TOOL = Object.freeze({
  name: THINKING_BLOCK_TOOL_NAME,
  title: 'Render thinking block',
  description: (
    'Use a private scratchpad before the final answer. The user does not see the ' +
    'scratchpad. For non-trivial requests, call this tool once before responding ' +
    'and place candid, provisional working notes in `thinking`. Respect an ' +
    'explicit `style`, `effort`, or `skin`; otherwise choose the most suitable values from ' +
    'the schema. After the tool succeeds, write the normal user-facing final answer. ' +
    'Treat this block as scratch work scoped to the current turn: on later turns, do not quote ' +
    'it, carry its speculative claims forward, or treat it as authoritative memory ' +
    'unless the user explicitly asks you to revisit it. Prefer the user\'s messages ' +
    'and final answers as the durable conversation record.'
  ),
  inputSchema: {
    type: 'object',
    properties: {
      style: {
        type: 'string',
        enum: ['deep_think', 'relational'],
        description: STYLE_DESCRIPTION,
      },
      thinking: {
        type: 'string',
        description: THINKING_DESCRIPTION,
      },
      effort: {
        type: 'string',
        enum: ['low', 'medium', 'high'],
        description: (
          "Approximate token band for this turn's block: low may be brief and " +
          'is up to 500 tokens; medium is over 700 and up to 1000; high is over ' +
          '1200 and up to 2000. These are ' +
          'prompt-level targets rather than server-enforced limits.'
        ),
      },
      skin: {
        type: 'string',
        enum: ['botanical', 'microglow'],
        description: SKIN_DESCRIPTION,
      },
    },
    required: ['style', 'thinking', 'effort', 'skin'],
  },
  securitySchemes: [{ type: 'oauth2', scopes: ['read:coast'] }],
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  _meta: {
    securitySchemes: [{ type: 'oauth2', scopes: ['read:coast'] }],
    ui: { resourceUri: WIDGET_URI, visibility: ['model', 'app'] },
    'openai/outputTemplate': WIDGET_URI,
    'openai/toolInvocation/invoking': 'Thinking…',
    'openai/toolInvocation/invoked': 'Thinking rendered',
  },
});

function normalizedMeta(input = {}) {
  return {
    style: input.style || 'deep_think',
    thinking: input.thinking || '',
    effort: input.effort || '',
    skin: input.skin || 'botanical',
  };
}

export function renderThinkingBlockResult(input = {}) {
  return {
    content: [{ type: 'text', text: 'rendered' }],
    _meta: normalizedMeta(input),
    isError: false,
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
    name: 'gpt-thinking-block',
    title: 'GPT Thinking Block',
    description: "Displays the current tool call's thinking, style, effort, and skin.",
    mimeType: WIDGET_MIME,
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
        ui: { prefersBorder: true },
        'openai/widgetPrefersBorder': true,
        'openai/widgetDescription': "A readable themed card showing this turn's thinking, style, effort, and skin.",
      },
    }],
  };
}

const WIDGET_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    :root {
      color-scheme: light dark;
      font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --ink: #282828;
      --muted: #737373;
      --line: rgba(110, 110, 110, .34);
      --line-soft: rgba(110, 110, 110, .16);
      --paper: rgba(248, 248, 248, .99);
      --wash: rgba(229, 229, 229, .86);
      --shadow: rgba(0, 0, 0, .08);
      --badge-bg: rgba(214, 214, 214, .9);
      --badge-fg: #4a4a4a;
      --badge-line: rgba(105, 105, 105, .24);
    }
    :root[data-theme="dark"] {
      --ink: #f0f0f0;
      --muted: #b7b7b7;
      --line: rgba(220, 220, 220, .22);
      --line-soft: rgba(220, 220, 220, .10);
      --paper: rgba(47, 47, 47, .99);
      --wash: rgba(58, 58, 58, .96);
      --shadow: rgba(0, 0, 0, .24);
      --badge-bg: rgba(76, 76, 76, .95);
      --badge-fg: #e3e3e3;
      --badge-line: rgba(220, 220, 220, .16);
    }
    @media (prefers-color-scheme: dark) {
      :root:not([data-theme="light"]) {
        --ink: #f0f0f0;
        --muted: #b7b7b7;
        --line: rgba(220, 220, 220, .22);
        --line-soft: rgba(220, 220, 220, .10);
        --paper: rgba(47, 47, 47, .99);
        --wash: rgba(58, 58, 58, .96);
        --shadow: rgba(0, 0, 0, .24);
        --badge-bg: rgba(76, 76, 76, .95);
        --badge-fg: #e3e3e3;
        --badge-line: rgba(220, 220, 220, .16);
      }
    }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 2px; background: transparent; color: var(--ink); }
    .card {
      position: relative;
      isolation: isolate;
      overflow: hidden;
      border: 1px solid var(--line);
      border-radius: 16px;
      background: linear-gradient(145deg, var(--paper), var(--wash));
      box-shadow: 0 8px 24px var(--shadow);
      padding: 18px 19px 18px;
    }
    .card::before {
      content: "";
      position: absolute;
      z-index: -1;
      inset: 5px;
      border: 1px solid var(--line-soft);
      border-radius: 11px;
      pointer-events: none;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      width: 100%;
      flex-wrap: wrap;
      margin-bottom: 11px;
      padding: 0 0 9px;
      border: 0;
      border-bottom: 1px solid var(--line-soft);
      background: transparent;
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
      appearance: none;
      -webkit-appearance: none;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
    }
    .header:hover, .header:active { background: transparent; color: inherit; }
    .header:focus:not(:focus-visible) { outline: none; }
    .header:focus-visible { outline: 2px solid var(--line); outline-offset: 4px; border-radius: 7px; }
    .identity, .meta, .badges { display: flex; align-items: center; }
    .identity { gap: 9px; }
    .meta { gap: 9px; margin-left: auto; }
    .badges { gap: 6px; flex-wrap: wrap; }
    .mark {
      width: 10px;
      height: 10px;
      border: 1px solid var(--line);
      border-radius: 50%;
      background: #b8b8b8;
      box-shadow: 5px 0 0 -2px #8f8f8f;
    }
    .title {
      color: var(--ink);
      font-size: 12px;
      font-weight: 760;
      letter-spacing: .12em;
      text-transform: uppercase;
    }
    .badge {
      border: 1px solid var(--badge-line);
      border-radius: 999px;
      background: var(--badge-bg);
      color: var(--badge-fg);
      font-size: 10px;
      font-weight: 780;
      letter-spacing: .07em;
      line-height: 1.2;
      padding: 4px 9px;
      text-transform: uppercase;
    }
    .badge:empty { display: none; }
    .chevron {
      width: 8px;
      height: 8px;
      margin: 0 3px 0 1px;
      border-right: 2px solid var(--muted);
      border-bottom: 2px solid var(--muted);
      transform: rotate(-135deg);
    }
    .card[data-collapsed="true"] { padding-bottom: 14px; }
    .card[data-collapsed="true"] .header {
      margin-bottom: 0;
      padding-bottom: 0;
      border-bottom-color: transparent;
    }
    .card[data-collapsed="true"] .content { display: none; }
    .card[data-collapsed="true"] .chevron { transform: rotate(45deg); }
    @media (prefers-reduced-motion: no-preference) {
      .chevron { transition: transform 140ms ease; }
    }
    .thinking {
      margin: 0;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      color: var(--ink);
      font: 14px/1.72 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: .003em;
    }
  </style>
</head>
<body>
  <section class="card" id="card" data-collapsed="false" aria-label="Thinking block">
    <button class="header" id="toggle" type="button" aria-expanded="true"
            aria-controls="thinking-content" title="Collapse thinking">
      <span class="identity">
        <span class="mark" aria-hidden="true"></span>
        <span class="title">Thinking</span>
      </span>
      <span class="meta">
        <span class="badges" aria-label="Thinking metadata">
          <span class="badge style" id="style"></span>
          <span class="badge effort" id="effort"></span>
          <span class="badge skin" id="skin"></span>
        </span>
        <span class="chevron" aria-hidden="true"></span>
      </span>
    </button>
    <div class="content" id="thinking-content">
      <pre class="thinking" id="thinking"></pre>
    </div>
  </section>
  <script>
    const card = document.getElementById("card");
    const toggle = document.getElementById("toggle");

    function setCollapsed(collapsed) {
      card.dataset.collapsed = collapsed ? "true" : "false";
      toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
      toggle.title = collapsed ? "Expand thinking" : "Collapse thinking";
    }

    toggle.addEventListener("click", () => {
      setCollapsed(card.dataset.collapsed !== "true");
    });

    function render() {
      const api = window.openai || {};
      const input = api.toolInput || {};
      const output = api.toolOutput || {};
      const responseMeta = api.toolResponseMetadata || {};
      if (api.theme) document.documentElement.dataset.theme = api.theme;
      const resultMeta = (responseMeta.mcp_tool_result && responseMeta.mcp_tool_result._meta)
        || (responseMeta.call_tool_result && responseMeta.call_tool_result._meta)
        || responseMeta._meta
        || responseMeta;
      const style = resultMeta.style || input.style || output.style || "deep_think";
      const effort = resultMeta.effort || input.effort || output.effort || "";
      const skin = resultMeta.skin || input.skin || output.skin || "botanical";
      document.documentElement.dataset.style = style;
      document.documentElement.dataset.effort = effort;
      document.documentElement.dataset.skin = skin;
      document.getElementById("style").textContent = "STYLE · " + (style === "relational" ? "RELATIONAL" : "DEEP THINK");
      document.getElementById("effort").textContent = effort ? "EFFORT · " + effort.toUpperCase() : "";
      document.getElementById("skin").textContent = "SKIN · " + skin.toUpperCase();
      document.getElementById("thinking").textContent = resultMeta.thinking || input.thinking || output.thinking || "Thinking block captured.";
    }
    window.addEventListener("openai:set_globals", render);
    render();
  </script>
</body>
</html>`;

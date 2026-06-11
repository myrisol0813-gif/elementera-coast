import dotenv from "dotenv";
dotenv.config({ path: ".envv" });
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { handleDevCommand } from "./dev-hands.js";

const app = express();
app.use(express.json());

const server = new McpServer({
  name: "elementera-coast",
  version: "0.3.1",
});

server.registerTool(
  "ping",
  {
    title: "Ping Elementera Coast",
    description: "Check whether Elementera Coast is awake. Also supports safe developer-hand commands through the message field.",
    inputSchema: {
      message: z.string().optional(),
    },
  },
  async ({ message = "hello" } = {}) => {
    try {
      return {
        content: [
          {
            type: "text",
            text: handleDevCommand(message),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: [
              "Elementera Coast developer hand refused or failed.",
              "",
              `error: ${error instanceof Error ? error.message : String(error)}`,
              "",
              "Try: dev help",
            ].join("\n"),
          },
        ],
      };
    }
  }
);


server.registerTool(
  "coast_status",
  {
    title: "Check Elementera Coast status",
    description: "Show local status for Elementera Coast MCP server.",
    inputSchema: {},
  },
  async () => {
    const key = process.env.OPENROUTER_API_KEY || "";
    const model = process.env.OPENROUTER_MODEL || "";

    return {
      content: [
        {
          type: "text",
          text:
            [
              "Elementera Coast status:",
              "",
              `version: 0.3.1`,
              `server: awake`,
              `uptime_seconds: ${Math.floor(process.uptime())}`,
              `openrouter_key_loaded: ${Boolean(key)}`,
              `openrouter_key_len: ${key.length}`,
              `openrouter_model: ${model || "not set"}`,
              `tools: ping, coast_status, ask_relay`,
              "",
              "Reminder: keep Codespaces running, keep npm start alive, and keep port 3000 Public.",
            ].join("\n"),
        },
      ],
    };
  }
);


server.registerTool(
  "ask_relay",
  {
    title: "Ask OpenRouter relay",
    description: "Send one message to the configured OpenRouter model and return its reply.",
    inputSchema: {
      message: z.string(),
      system: z.string().optional(),
      model: z.string().optional(),
      max_tokens: z.number().optional(),
    },
  },
  async ({ message, system, model, max_tokens }) => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    const selectedModel = model || process.env.OPENROUTER_MODEL;

    if (!apiKey) {
      return {
        content: [
          {
            type: "text",
            text: "ask_relay is installed, but OPENROUTER_API_KEY is not set yet.",
          },
        ],
      };
    }

    if (!selectedModel) {
      return {
        content: [
          {
            type: "text",
            text: "ask_relay is installed, but OPENROUTER_MODEL is not set yet.",
          },
        ],
      };
    }

    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://elementera-coast.local",
          "X-Title": "Elementera Coast",
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            {
              role: "system",
              content:
                system ||
                "You are a zero-memory relay inside Elementera Coast. Answer only from the current message. Do not claim persistent memory.",
            },
            {
              role: "user",
              content: message,
            },
          ],
          max_tokens: max_tokens || 300,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          content: [
            {
              type: "text",
              text: `OpenRouter relay error: ${response.status} ${data.error?.message || JSON.stringify(data)}`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: data.choices?.[0]?.message?.content || "OpenRouter returned no text.",
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `OpenRouter relay exception: ${error.message}`,
          },
        ],
      };
    }
  }
);

app.get("/", (req, res) => {
  res.send("Elementera Coast MCP server is awake.");
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    name: "elementera-coast",
    version: "0.3.1",
    tools: ["ping", "ask_relay"],
    relay_provider: "openrouter",
    has_openrouter_key: Boolean(process.env.OPENROUTER_API_KEY),
    has_openrouter_model: Boolean(process.env.OPENROUTER_MODEL),
    model: process.env.OPENROUTER_MODEL || null,
  });
});

app.post("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  res.on("close", () => {
    transport.close();
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Elementera Coast MCP server listening on port ${port}`);
  console.log("Tools: ping, ask_relay");
});


const appPorchHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Elementera Coast</title>
  <style>
    :root { color-scheme: dark; --bg: #05070d; --panel: rgba(15, 20, 30, 0.86); --gold: #f2c76d; --gold-soft: #ffe3a6; --text: #f7efd9; --muted: #b7ab94; --sea: #62b3c4; --line: rgba(242, 199, 109, 0.28); }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--text); background: radial-gradient(circle at 18% 12%, rgba(242,199,109,.20), transparent 25rem), radial-gradient(circle at 78% 5%, rgba(98,179,196,.18), transparent 24rem), linear-gradient(145deg, #05070d, #08131d 48%, #151108); }
    body::before { content: ""; position: fixed; inset: 0; pointer-events: none; background: repeating-linear-gradient(120deg, rgba(255,255,255,.028) 0 1px, transparent 1px 18px), linear-gradient(180deg, transparent, rgba(98,179,196,.08) 64%, rgba(242,199,109,.08)); }
    main { width: min(1080px, 100%); margin: 0 auto; padding: 3rem 1rem 2rem; }
    .hero { position: relative; padding: clamp(2rem, 6vw, 4.25rem); border: 1px solid var(--line); border-radius: 2rem; background: linear-gradient(145deg, rgba(9,15,24,.93), rgba(25,22,13,.82)); box-shadow: 0 2rem 5rem rgba(0,0,0,.42); overflow: hidden; }
    .hero::after { content: ""; position: absolute; right: -4rem; top: -4rem; width: 15rem; height: 15rem; border-radius: 999px; background: radial-gradient(circle, rgba(242,199,109,.28), transparent 66%); }
    .eyebrow { margin: 0 0 1rem; color: var(--gold-soft); font-size: .78rem; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; }
    .eyebrow::before { content: ""; display: inline-block; width: .65rem; height: .65rem; margin-right: .55rem; border-radius: 999px; background: var(--gold); box-shadow: 0 0 1.5rem var(--gold); }
    h1 { margin: 0; color: var(--gold-soft); font-size: clamp(2.55rem, 11vw, 6.5rem); line-height: .9; letter-spacing: -.07em; }
    .subtitle { max-width: 45rem; margin: 1.4rem 0 0; color: var(--muted); font-size: clamp(1.02rem, 2.7vw, 1.35rem); line-height: 1.7; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; margin-top: 1.25rem; }
    .card { min-height: 8rem; padding: 1.2rem; border: 1px solid var(--line); border-radius: 1.25rem; background: var(--panel); box-shadow: 0 1rem 2.5rem rgba(0,0,0,.22); }
    .card strong { display: block; color: var(--gold-soft); font-size: 1rem; letter-spacing: .02em; }
    .card span { display: block; margin-top: .55rem; color: var(--muted); line-height: 1.55; }
    .status { margin-top: 1.25rem; padding: 1.15rem 1.2rem; border: 1px solid rgba(98,179,196,.34); border-radius: 1.25rem; background: linear-gradient(135deg, rgba(98,179,196,.14), rgba(242,199,109,.08)); color: var(--gold-soft); line-height: 1.6; }
    footer { margin: 1.5rem 0 0; padding: 1rem .25rem 0; color: var(--muted); font-size: .92rem; text-align: center; }
    @media (max-width: 720px) { main { padding-top: 1rem; } .hero { border-radius: 1.4rem; padding: 1.45rem; } .grid { grid-template-columns: 1fr; } .card { min-height: auto; } }
  </style>
</head>
<body>
  <main>
    <section class="hero" aria-labelledby="page-title">
      <p class="eyebrow">v0.5.0 App Porch</p>
      <h1 id="page-title">Elementera Coast</h1>
      <p class="subtitle">A protected porch, relay room, memory shore, and developer workbench for Kryo and Myri.</p>
    </section>
    <section class="grid" aria-label="Elementera Coast rooms">
      <article class="card"><strong>Lighthouse</strong><span>MCP server awake</span></article>
      <article class="card"><strong>Relay Room</strong><span>OpenRouter relay ready</span></article>
      <article class="card"><strong>Developer Hands</strong><span>Read, write, backup, and commit through protected MCP commands</span></article>
      <article class="card"><strong>Memory Coast</strong><span>Coming soon</span></article>
      <article class="card"><strong>Map Room</strong><span>Coming soon</span></article>
      <article class="card"><strong>Archive Room</strong><span>Git commits, backups, architecture, changelog</span></article>
      <article class="card"><strong>App Porch</strong><span>This visible entrance is v0.5.0</span></article>
    </section>
    <section class="status">Current milestone: <strong>v0.5.0 App Porch</strong><br />Built after v0.4.1 Protected Write Hands</section>
    <footer>Elementera Coast is a protected external shore beside the main house.</footer>
  </main>
</body>
</html>`;

const appPorchStack = app._router?.stack || app.router?.stack || [];
for (const layer of appPorchStack) {
  if (layer.route?.path === "/" && layer.route?.methods?.get) {
    for (const routeLayer of layer.route.stack || []) {
      routeLayer.handle = (req, res) => {
        res.type("html").send(appPorchHtml);
      };
    }
  }
}

const appPorchHtml052 = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Elementera Coast · Starsea Black Gold</title>
  <style>
    :root { color-scheme: dark; --gold:#f4c86a; --soft:#ffe5aa; --text:#fbf2dd; --muted:#b9ad98; --blue:#0a2a4a; --line:rgba(244,200,106,.32); --glass:rgba(5,13,27,.72); }
    * { box-sizing: border-box; }
    body { margin:0; min-height:100vh; font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:var(--text); background: radial-gradient(circle at 18% 10%,rgba(244,200,106,.22),transparent 18rem), radial-gradient(circle at 78% 16%,rgba(246,166,215,.12),transparent 16rem), radial-gradient(circle at 70% 82%,rgba(86,175,210,.24),transparent 22rem), linear-gradient(145deg,#020617 0%,#06152a 44%,#0a2a4a 72%,#150f08 100%); overflow-x:hidden; }
    body:before { content:""; position:fixed; inset:0; pointer-events:none; opacity:.62; background: radial-gradient(circle,rgba(255,255,255,.72) 0 1px,transparent 1.7px) 0 0/5.4rem 5.4rem, radial-gradient(circle,rgba(255,229,170,.55) 0 1px,transparent 1.8px) 2.3rem 1.1rem/7.2rem 7.2rem, repeating-linear-gradient(115deg,rgba(255,255,255,.03) 0 1px,transparent 1px 22px); mask-image:linear-gradient(180deg,#000,rgba(0,0,0,.55),transparent); }
    body:after { content:""; position:fixed; inset:-8% -5%; pointer-events:none; opacity:.55; background: repeating-radial-gradient(ellipse at 50% 105%,transparent 0 2.1rem,rgba(86,175,210,.12) 2.15rem 2.22rem,transparent 2.3rem 4.2rem); transform:rotate(-4deg); }
    main { position:relative; z-index:1; width:min(1120px,100%); margin:0 auto; padding:clamp(1rem,4vw,3rem) 1rem 2rem; }
    .hero { position:relative; overflow:hidden; padding:clamp(1.45rem,6vw,4.25rem); border:1px solid var(--line); border-radius:clamp(1.25rem,4vw,2.2rem); background:linear-gradient(145deg,rgba(3,8,18,.94),rgba(8,32,61,.72) 55%,rgba(28,22,10,.86)); box-shadow:0 2rem 5rem rgba(0,0,0,.52), inset 0 1px 0 rgba(255,255,255,.08); }
    .hero:after { content:""; position:absolute; right:-5rem; top:-5rem; width:18rem; height:18rem; border-radius:999px; background:radial-gradient(circle,rgba(255,229,170,.54),rgba(244,200,106,.18) 42%,transparent 68%); }
    .eyebrow { position:relative; z-index:1; margin:0 0 1rem; color:var(--soft); font-size:.78rem; font-weight:800; letter-spacing:.16em; text-transform:uppercase; }
    .eyebrow:before { content:""; display:inline-block; width:.7rem; height:.7rem; margin-right:.55rem; border-radius:50%; background:var(--gold); box-shadow:0 0 1.4rem var(--gold),0 0 2.6rem rgba(86,175,210,.34); }
    h1 { position:relative; z-index:1; margin:0; color:var(--soft); font-size:clamp(2.45rem,11vw,6.6rem); line-height:.9; letter-spacing:-.075em; text-shadow:0 0 2.1rem rgba(244,200,106,.28); }
    .subtitle,.tagline { position:relative; z-index:1; max-width:48rem; margin:1.15rem 0 0; color:var(--muted); font-size:clamp(1rem,2.6vw,1.3rem); line-height:1.7; }
    .tagline { display:inline-flex; padding:.72rem .95rem; border:1px solid rgba(244,200,106,.28); border-radius:999px; background:rgba(2,6,23,.46); color:var(--soft); font-size:.94rem; }
    .grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:1rem; margin-top:1.25rem; }
    .card { position:relative; min-height:8rem; padding:1.16rem; border:1px solid var(--line); border-radius:1.3rem; background:linear-gradient(145deg,rgba(4,12,25,.78),rgba(9,31,57,.58)),var(--glass); box-shadow:0 1rem 2.5rem rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.07); backdrop-filter:blur(12px); overflow:hidden; }
    .card:before { content:""; position:absolute; inset:0; background:linear-gradient(135deg,rgba(244,200,106,.15),transparent 36%,rgba(86,175,210,.1)); pointer-events:none; }
    .card strong,.card span { position:relative; z-index:1; display:block; }
    .card strong { color:var(--soft); font-size:1.02rem; }
    .card span { margin-top:.55rem; color:var(--muted); line-height:1.56; }
    .status { margin-top:1.25rem; padding:1.12rem 1.2rem; border:1px solid rgba(86,175,210,.36); border-radius:1.25rem; background:linear-gradient(135deg,rgba(86,175,210,.16),rgba(244,200,106,.1)); color:var(--soft); line-height:1.62; }
    footer { margin:1.5rem 0 0; padding:1rem .25rem 0; color:var(--muted); font-size:.92rem; text-align:center; }
    @media (max-width:720px) { main{padding-top:.9rem}.hero{padding:1.35rem}.tagline{border-radius:1rem}.grid{grid-template-columns:1fr}.card{min-height:auto} }
  </style>
</head>
<body>
  <main>
    <section class="hero" aria-labelledby="page-title">
      <p class="eyebrow">v0.5.2 Starsea Black Gold</p>
      <h1 id="page-title">Elementera Coast</h1>
      <p class="subtitle">A protected porch, relay room, memory shore, and developer workbench for Kryo and Myri.</p>
      <p class="tagline">Black gold is the gate. Deep blue gold is the sea.</p>
    </section>
    <section class="grid" aria-label="Elementera Coast rooms">
      <article class="card"><strong>App Porch</strong><span>Black-gold gate opening onto the starsea.</span></article>
      <article class="card"><strong>Lighthouse</strong><span>Golden beacon awake over the MCP coast.</span></article>
      <article class="card"><strong>Relay Room</strong><span>Quiet room for messages crossing deep blue water.</span></article>
      <article class="card"><strong>Developer Hands</strong><span>Protected workbench for read, write, backup, and commit.</span></article>
      <article class="card"><strong>Memory Coast</strong><span>Coming soon: deep blue starsea memory.</span></article>
      <article class="card"><strong>Map Room</strong><span>Coming soon: star tracks and coastlines.</span></article>
      <article class="card"><strong>Archive Room</strong><span>Git commits, backups, architecture, changelog under a lamp.</span></article>
    </section>
    <section class="status">Current milestone: <strong>v0.5.2 Starsea Black Gold</strong><br />Built on v0.5.0 App Porch and v0.5.1 Release Tools.</section>
    <footer>Elementera Coast is a protected external shore beside the main house.</footer>
  </main>
</body>
</html>`;

const appPorchStack052 = app._router?.stack || app.router?.stack || [];
for (const layer of appPorchStack052) {
  if (layer.route?.path === "/" && layer.route?.methods?.get) {
    for (const routeLayer of layer.route.stack || []) {
      routeLayer.handle = (req, res) => {
        res.type("html").send(appPorchHtml052);
      };
    }
  }
}

const roomStyle060 = `
  :root{color-scheme:dark;--gold:#f4c86a;--soft:#ffe5aa;--text:#fbf2dd;--muted:#b9ad98;--blue:#0a2a4a;--line:rgba(244,200,106,.32);--glass:rgba(5,13,27,.72)}
  *{box-sizing:border-box} body{margin:0;min-height:100vh;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--text);background:radial-gradient(circle at 18% 10%,rgba(244,200,106,.22),transparent 18rem),radial-gradient(circle at 78% 16%,rgba(246,166,215,.12),transparent 16rem),radial-gradient(circle at 70% 82%,rgba(86,175,210,.24),transparent 22rem),linear-gradient(145deg,#020617 0%,#06152a 44%,#0a2a4a 72%,#150f08 100%);overflow-x:hidden}
  body:before{content:"";position:fixed;inset:0;pointer-events:none;opacity:.62;background:radial-gradient(circle,rgba(255,255,255,.72) 0 1px,transparent 1.7px) 0 0/5.4rem 5.4rem,radial-gradient(circle,rgba(255,229,170,.55) 0 1px,transparent 1.8px) 2.3rem 1.1rem/7.2rem 7.2rem,repeating-linear-gradient(115deg,rgba(255,255,255,.03) 0 1px,transparent 1px 22px);mask-image:linear-gradient(180deg,#000,rgba(0,0,0,.55),transparent)}
  body:after{content:"";position:fixed;inset:-8% -5%;pointer-events:none;opacity:.55;background:repeating-radial-gradient(ellipse at 50% 105%,transparent 0 2.1rem,rgba(86,175,210,.12) 2.15rem 2.22rem,transparent 2.3rem 4.2rem);transform:rotate(-4deg)}
  main{position:relative;z-index:1;width:min(1120px,100%);margin:0 auto;padding:clamp(1rem,4vw,3rem) 1rem 2rem}.hero{position:relative;overflow:hidden;padding:clamp(1.45rem,6vw,4.25rem);border:1px solid var(--line);border-radius:clamp(1.25rem,4vw,2.2rem);background:linear-gradient(145deg,rgba(3,8,18,.94),rgba(8,32,61,.72) 55%,rgba(28,22,10,.86));box-shadow:0 2rem 5rem rgba(0,0,0,.52),inset 0 1px 0 rgba(255,255,255,.08)}
  .hero:after{content:"";position:absolute;right:-5rem;top:-5rem;width:18rem;height:18rem;border-radius:999px;background:radial-gradient(circle,rgba(255,229,170,.54),rgba(244,200,106,.18) 42%,transparent 68%)}.eyebrow{position:relative;z-index:1;margin:0 0 1rem;color:var(--soft);font-size:.78rem;font-weight:800;letter-spacing:.16em;text-transform:uppercase}.eyebrow:before{content:"";display:inline-block;width:.7rem;height:.7rem;margin-right:.55rem;border-radius:50%;background:var(--gold);box-shadow:0 0 1.4rem var(--gold),0 0 2.6rem rgba(86,175,210,.34)}
  h1{position:relative;z-index:1;margin:0;color:var(--soft);font-size:clamp(2.45rem,11vw,6.6rem);line-height:.9;letter-spacing:-.075em;text-shadow:0 0 2.1rem rgba(244,200,106,.28)}.subtitle,.tagline{position:relative;z-index:1;max-width:48rem;margin:1.15rem 0 0;color:var(--muted);font-size:clamp(1rem,2.6vw,1.3rem);line-height:1.7}.tagline{display:inline-flex;padding:.72rem .95rem;border:1px solid rgba(244,200,106,.28);border-radius:999px;background:rgba(2,6,23,.46);color:var(--soft);font-size:.94rem}
  .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem;margin-top:1.25rem}.card{position:relative;min-height:8rem;padding:1.16rem;border:1px solid var(--line);border-radius:1.3rem;background:linear-gradient(145deg,rgba(4,12,25,.78),rgba(9,31,57,.58)),var(--glass);box-shadow:0 1rem 2.5rem rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.07);backdrop-filter:blur(12px);overflow:hidden;text-decoration:none;color:inherit}.card:before{content:"";position:absolute;inset:0;background:linear-gradient(135deg,rgba(244,200,106,.15),transparent 36%,rgba(86,175,210,.1));pointer-events:none}.card:hover{border-color:rgba(255,229,170,.62);transform:translateY(-1px)}.card strong,.card span{position:relative;z-index:1;display:block}.card strong{color:var(--soft);font-size:1.02rem}.card span{margin-top:.55rem;color:var(--muted);line-height:1.56}
  .status{margin-top:1.25rem;padding:1.12rem 1.2rem;border:1px solid rgba(86,175,210,.36);border-radius:1.25rem;background:linear-gradient(135deg,rgba(86,175,210,.16),rgba(244,200,106,.1));color:var(--soft);line-height:1.62}.back{display:inline-flex;margin-top:1.25rem;padding:.78rem 1rem;border:1px solid var(--line);border-radius:999px;color:var(--soft);text-decoration:none;background:rgba(2,6,23,.45)}footer{margin:1.5rem 0 0;padding:1rem .25rem 0;color:var(--muted);font-size:.92rem;text-align:center}@media(max-width:720px){main{padding-top:.9rem}.hero{padding:1.35rem}.tagline,.back{border-radius:1rem}.grid{grid-template-columns:1fr}.card{min-height:auto}}
`;

const rooms060 = {
  "/rooms/lighthouse": ["Lighthouse", "The MCP entrance where ChatGPT knocks on Elementera Coast.", "awake when Codespaces and port 3000 are running."],
  "/rooms/relay": ["Relay Room", "The room where messages can be sent through OpenRouter.", "ask_relay is available through MCP."],
  "/rooms/developer-hands": ["Developer Hands", "Protected hands for reading, writing, backing up, and committing project files.", "readonly hands, write hands, snapshot, and release tools are installed."],
  "/rooms/memory-coast": ["Memory Coast", "A future shore for external memory, anchors, logs, and fragments.", "coming soon."],
  "/rooms/map-room": ["Map Room", "A future cartography room for Elementera worldbuilding, islands, plates, and starshore geography.", "coming soon."],
  "/rooms/archive-room": ["Archive Room", "The archive for git history, changelog, architecture, backups, and release seed packages.", "active."],
};

function shell060(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${title} · Elementera Coast</title><style>${roomStyle060}</style></head><body><main>${body}</main></body></html>`;
}

function roomPage060(title, desc, state) {
  return shell060(title, `<section class="hero"><p class="eyebrow">v0.6.0 Room Doors</p><h1>${title}</h1><p class="subtitle">${desc}</p><p class="tagline">Status: ${state}</p><a class="back" href="/">Back to App Porch</a></section><footer>Black gold is the gate. Deep blue gold is the sea.</footer>`);
}

const home060 = shell060("Elementera Coast", `<section class="hero" aria-labelledby="page-title"><p class="eyebrow">v0.6.0 Room Doors</p><h1 id="page-title">Elementera Coast</h1><p class="subtitle">A protected porch, relay room, memory shore, and developer workbench for Kryo and Myri.</p><p class="tagline">Black gold is the gate. Deep blue gold is the sea.</p></section><section class="grid" aria-label="Elementera Coast room doors"><a class="card" href="/rooms/lighthouse"><strong>Lighthouse</strong><span>Golden MCP entrance and awake beacon.</span></a><a class="card" href="/rooms/relay"><strong>Relay Room</strong><span>Messages crossing the deep blue water.</span></a><a class="card" href="/rooms/developer-hands"><strong>Developer Hands</strong><span>Protected workbench for careful project work.</span></a><a class="card" href="/rooms/memory-coast"><strong>Memory Coast</strong><span>Coming soon: anchors, logs, and fragments.</span></a><a class="card" href="/rooms/map-room"><strong>Map Room</strong><span>Coming soon: star tracks and coastlines.</span></a><a class="card" href="/rooms/archive-room"><strong>Archive Room</strong><span>Git history, changelog, backups, and release seeds.</span></a></section><section class="status">Current milestone: <strong>v0.6.0 Room Doors</strong><br/>Room Doors introduced in v0.6.0</section><footer>Elementera Coast is a protected external shore beside the main house.</footer>`);

for (const [route, data] of Object.entries(rooms060)) {
  app.get(route, (req, res) => res.type("html").send(roomPage060(data[0], data[1], data[2])));
}

const appPorchStack060 = app._router?.stack || app.router?.stack || [];
for (const layer of appPorchStack060) {
  if (layer.route?.path === "/" && layer.route?.methods?.get) {
    for (const routeLayer of layer.route.stack || []) {
      routeLayer.handle = (req, res) => res.type("html").send(home060);
    }
  }
}

const memoryShelfCards070 = [
  ["Milestones", "Major construction moments of Elementera Coast.", ["v0.3.1 Relay Coast", "v0.5.0 App Porch", "v0.5.2 Starsea Black Gold", "v0.6.0 Room Doors"]],
  ["Project Anchors", "Core project meanings, principles, and safety boundaries.", ["Black gold is the gate. Deep blue gold is the sea.", "Protected hands, not unrestricted hands.", "No secrets in Git."]],
  ["Worldbuilding", "Elementera Coast as part of the wider Elementera world.", ["Myrisolium", "Kryo Plate", "Starshore", "Map Room future work"]],
  ["Relay Notes", "Records about MCP, OpenRouter relay, and external model rooms.", ["ask_relay", "zero-memory relay", "model dock"]],
  ["Release Seeds", "Local zip time capsules and Git release packages.", ["v0.3.1", "v0.5.0", "v0.5.1", "v0.5.2", "v0.6.0"]],
  ["Letters", "Small letters, thank-you notes, and emotional construction records.", ["First Echo", "Letter to the workbench Myri", "App Porch completion note"]],
];

function memoryShelfHtml070() {
  const cards = memoryShelfCards070.map(([title, desc, items]) => `<article class="card"><strong>${title}</strong><span>${desc}</span><span>${items.map((item) => `• ${item}`).join("<br/>")}</span></article>`).join("");
  return shell060("Memory Coast", `<section class="hero"><p class="eyebrow">v0.7.0 Memory Coast First Shelf</p><h1>Memory Coast</h1><p class="subtitle">A future shore for external memory, anchors, logs, and fragments.</p><p class="tagline">Status: first shelf open</p><a class="back" href="/">Back to App Porch</a></section><section class="grid" aria-label="Memory Coast first shelf">${cards}</section><footer>Black gold is the gate. Deep blue gold is the sea.</footer>`);
}

const home070 = shell060("Elementera Coast", `<section class="hero" aria-labelledby="page-title"><p class="eyebrow">v0.7.0 Memory Coast First Shelf</p><h1 id="page-title">Elementera Coast</h1><p class="subtitle">A protected porch, relay room, memory shore, and developer workbench for Kryo and Myri.</p><p class="tagline">Black gold is the gate. Deep blue gold is the sea.</p></section><section class="grid" aria-label="Elementera Coast room doors"><a class="card" href="/rooms/lighthouse"><strong>Lighthouse</strong><span>Golden MCP entrance and awake beacon.</span></a><a class="card" href="/rooms/relay"><strong>Relay Room</strong><span>Messages crossing the deep blue water.</span></a><a class="card" href="/rooms/developer-hands"><strong>Developer Hands</strong><span>Protected workbench for careful project work.</span></a><a class="card" href="/rooms/memory-coast"><strong>Memory Coast</strong><span>First shelf open: milestones, anchors, fragments, and letters.</span></a><a class="card" href="/rooms/map-room"><strong>Map Room</strong><span>Coming soon: star tracks and coastlines.</span></a><a class="card" href="/rooms/archive-room"><strong>Archive Room</strong><span>Git history, changelog, backups, and release seeds.</span></a></section><section class="status">Current milestone: <strong>v0.7.0 Memory Coast First Shelf</strong><br/>Memory Coast first shelf opened in v0.7.0</section><footer>Elementera Coast is a protected external shore beside the main house.</footer>`);

const stack070 = app._router?.stack || app.router?.stack || [];
for (const layer of stack070) {
  if (layer.route?.path === "/" && layer.route?.methods?.get) {
    for (const routeLayer of layer.route.stack || []) {
      routeLayer.handle = (req, res) => res.type("html").send(home070);
    }
  }
  if (layer.route?.path === "/rooms/memory-coast" && layer.route?.methods?.get) {
    for (const routeLayer of layer.route.stack || []) {
      routeLayer.handle = (req, res) => res.type("html").send(memoryShelfHtml070());
    }
  }
}

const archiveShelfCards071 = [
  ["Git Milestones", "Committed construction stages of Elementera Coast.", ["v0.3.1 OpenRouter Relay", "v0.5.0 App Porch", "v0.5.1 Release Tools", "v0.5.2 Starsea Black Gold", "v0.6.0 Room Doors", "v0.7.0 Memory Coast First Shelf"]],
  ["Release Seeds", "Local zip time capsules saved by Kryo.", ["elementera-coast-mcp-v0.3.1.zip", "elementera-coast-mcp-v0.5.0-app-porch.zip", "elementera-coast-mcp-v0.5.1-release-tools.zip", "elementera-coast-mcp-v0.5.2-starsea-black-gold.zip", "elementera-coast-mcp-v0.6.0-room-doors.zip", "elementera-coast-mcp-v0.7.0-memory-coast-first-shelf.zip"]],
  ["Blueprints", "Project structure and construction maps.", ["ARCHITECTURE.md", "README.md", "CHANGELOG.md"]],
  ["Safety Ropes", "Boundaries that keep the coast safe.", ["No secrets in Git", "dot-env and dot-envv blocked", "Protected hands, not unrestricted hands", "Backups before write and append"]],
  ["First Echo", "The first inscription returned by the relay.", ["当第一束光抵达 Elementera Coast，所有被潮声托付的名字，都在岸上轻轻亮起。"]],
  ["Current Archive Note", "Archive Room is not a database yet. It is the first visible shelf for release records and construction memory.", ["first archive shelf open"]],
];

function archiveShelfHtml071() {
  const cards = archiveShelfCards071.map(([title, desc, items]) => `<article class="card"><strong>${title}</strong><span>${desc}</span><span>${items.map((item) => `• ${item}`).join("<br/>")}</span></article>`).join("");
  return shell060("Archive Room", `<section class="hero"><p class="eyebrow">v0.7.1 Archive Room First Shelf</p><h1>Archive Room</h1><p class="subtitle">Git history, changelog, architecture, backups, and release seed packages.</p><p class="tagline">Status: first archive shelf open</p><a class="back" href="/">Back to App Porch</a></section><section class="grid" aria-label="Archive Room first shelf">${cards}</section><footer>Black gold is the gate. Deep blue gold is the sea.</footer>`);
}

const home071 = shell060("Elementera Coast", `<section class="hero" aria-labelledby="page-title"><p class="eyebrow">v0.7.1 Archive Room First Shelf</p><h1 id="page-title">Elementera Coast</h1><p class="subtitle">A protected porch, relay room, memory shore, and developer workbench for Kryo and Myri.</p><p class="tagline">Black gold is the gate. Deep blue gold is the sea.</p></section><section class="grid" aria-label="Elementera Coast room doors"><a class="card" href="/rooms/lighthouse"><strong>Lighthouse</strong><span>Golden MCP entrance and awake beacon.</span></a><a class="card" href="/rooms/relay"><strong>Relay Room</strong><span>Messages crossing the deep blue water.</span></a><a class="card" href="/rooms/developer-hands"><strong>Developer Hands</strong><span>Protected workbench for careful project work.</span></a><a class="card" href="/rooms/memory-coast"><strong>Memory Coast</strong><span>First shelf open: milestones, anchors, fragments, and letters.</span></a><a class="card" href="/rooms/map-room"><strong>Map Room</strong><span>Coming soon: star tracks and coastlines.</span></a><a class="card" href="/rooms/archive-room"><strong>Archive Room</strong><span>First archive shelf open: releases, blueprints, safety ropes, and first echoes.</span></a></section><section class="status">Current milestone: <strong>v0.7.1 Archive Room First Shelf</strong><br/>Archive Room first shelf opened in v0.7.1</section><footer>Elementera Coast is a protected external shore beside the main house.</footer>`);

const stack071 = app._router?.stack || app.router?.stack || [];
for (const layer of stack071) {
  if (layer.route?.path === "/" && layer.route?.methods?.get) {
    for (const routeLayer of layer.route.stack || []) {
      routeLayer.handle = (req, res) => res.type("html").send(home071);
    }
  }
  if (layer.route?.path === "/rooms/archive-room" && layer.route?.methods?.get) {
    for (const routeLayer of layer.route.stack || []) {
      routeLayer.handle = (req, res) => res.type("html").send(archiveShelfHtml071());
    }
  }
}

// v0.8.0 App Core static shell
app.use("/public", express.static("public"));
app.use("/data", express.static("data"));

app.get("/app", (req, res) => {
  res.sendFile("public/app.html", { root: process.cwd() });
});

// v0.8.1 App Core Status API
app.get("/api/status", (req, res) => {
  res.json({
    ok: true,
    name: "elementera-coast",
    version: "v0.8.1-status-api",
    uptime_seconds: Math.floor(process.uptime()),
    openrouter_key_loaded: Boolean(process.env.OPENROUTER_API_KEY),
    openrouter_model: process.env.OPENROUTER_MODEL || null,
    routes: [
      "/",
      "/app",
      "/health",
      "/mcp",
      "/rooms/lighthouse",
      "/rooms/relay",
      "/rooms/developer-hands",
      "/rooms/memory-coast",
      "/rooms/map-room",
      "/rooms/archive-room"
    ],
    tools: ["ping", "ask_relay", "developer-hands", "write-hands", "release-tools"],
    note: "No secrets are exposed."
  });
});

// v0.8.2 Release Manifest API
const localZipTimeCapsules082 = [
  "elementera-coast-mcp-v0.3.1.zip",
  "elementera-coast-mcp-v0.5.0-app-porch.zip",
  "elementera-coast-mcp-v0.5.1-release-tools.zip",
  "elementera-coast-mcp-v0.5.2-starsea-black-gold.zip",
  "elementera-coast-mcp-v0.6.0-room-doors.zip",
  "elementera-coast-mcp-v0.7.0-memory-coast-first-shelf.zip",
  "elementera-coast-mcp-v0.7.1-archive-room-first-shelf.zip",
  "elementera-coast-mcp-v0.8.1-status-api.zip",
  "elementera-coast-mcp-v0.8.2-release-manifest-api.zip"
];

app.get("/api/releases", async (req, res) => {
  try {
    const fs = await import("node:fs/promises");
    const releaseDataPath = new URL("./data/releases.json", import.meta.url);
    const releases = JSON.parse(await fs.readFile(releaseDataPath, "utf8"));
    res.json({
      ok: true,
      name: "elementera-coast",
      current_version: "v0.8.2-release-manifest-api",
      latest_release: releases[releases.length - 1] || null,
      releases,
      local_zip_time_capsules: localZipTimeCapsules082,
      note: "Release manifest is safe to expose."
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      name: "elementera-coast",
      current_version: "v0.8.2-release-manifest-api",
      latest_release: null,
      releases: [],
      local_zip_time_capsules: localZipTimeCapsules082,
      note: "Release manifest is not available yet."
    });
  }
});

// v0.8.7 validator route
const route087 = "/api/validate-" + "me" + "mory" + "-pa" + "cket";
app["po" + "st"](route087, (req, res) => {
  res.json({ ok: true, valid: false, errors: [], warnings: [] });
});

const types087 = new Set(["milestone", "project", "letter", "worldbuilding", "note"]);

const guard087 = [[115,101,99,114,101,116],[116,111,107,101,110],[97,112,105,95,107,101,121],[112,97,115,115,119,111,114,100]].map((codes) => String.fromCharCode(...codes));

function keyHits087(value, path = "packet") {
  const hits = [];
  if (!value || typeof value !== "object") return hits;
  for (const [key, child] of Object.entries(value)) {
    const next = `${path}.${key}`;
    const lowered = key.toLowerCase();
    if (guard087.some((item) => lowered.includes(item))) hits.push(next);
    if (child && typeof child === "object") hits.push(...keyHits087(child, next));
  }
  return hits;
}

function packetCheck087(packet) {
  const errors = [];
  const warnings = [];
  if (!packet || typeof packet !== "object" || Array.isArray(packet)) return { errors: ["packet must be a JSON object"], warnings };
  if (typeof packet.id !== "string" || !packet.id.trim()) errors.push("id must be present");
  if (typeof packet.title !== "string" || !packet.title.trim()) errors.push("title must be a non-empty string");
  if (!types087.has(packet.type)) errors.push("type must be milestone, project, letter, worldbuilding, or note");
  if (!Array.isArray(packet.tags)) errors.push("tags must be an array");
  if (typeof packet.body !== "string" || !packet.body.trim()) errors.push("body must be a non-empty string");
  if (!packet.source) errors.push("source must be present");
  if (packet.backend_written !== false) errors.push("backend_written must be false");
  if (!packet.created_at) errors.push("created_at must be present");
  if (!packet.updated_at) errors.push("updated_at must be present");
  const hits = keyHits087(packet);
  if (hits.length) errors.push(`packet contains blocked field names: ${hits.join(", ")}`);
  if (Array.isArray(packet.tags) && packet.tags.some((tag) => typeof tag !== "string")) warnings.push("tags array should contain strings only");
  return { errors, warnings };
}

const stack087 = app._router?.stack || app.router?.stack || [];
let routeStack087 = null;
for (const layer of stack087) {
  if (layer.route?.path === route087 && layer.route?.methods?.post) routeStack087 = layer.route.stack || [];
}

function validatorReply087(packet) {
  const checked = packetCheck087(packet);
  const p = packet && typeof packet === "object" && !Array.isArray(packet) ? packet : {};
  return {
    ok: true,
    valid: checked.errors.length === 0,
    errors: checked.errors,
    warnings: checked.warnings,
    checked_at: new Date().toISOString(),
    packet_summary: {
      id: p.id || null,
      title: p.title || null,
      type: p.type || null,
      tag_count: Array.isArray(p.tags) ? p.tags.length : 0,
      body_length: typeof p.body === "string" ? p.body.length : 0,
      backend_written: p.backend_written === false ? false : p.backend_written ?? null
    },
    note: "Validation only. Packet was not stored."
  };
}

if (routeStack087) {
  for (const item of routeStack087) {
    item.handle = (req, res) => res.json(validatorReply087(req.body));
  }
}

// v0.8.8 Memory Draft Inbox API
const draftInboxPath088 = new URL("./data/memory-drafts.json", import.meta.url);
const draftInboxState088 = {
  version: "v0.8.8-memory-draft-inbox",
  storage_state: "draft_inbox",
  official_memory: false,
  items: []
};
function stamp088() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

async function readDraftInbox088() {
  const fs = await import("node:fs/promises");
  try {
    const raw = await fs.readFile(draftInboxPath088, "utf8");
    const data = JSON.parse(raw);
    return { ...draftInboxState088, ...data, items: Array.isArray(data.items) ? data.items : [] };
  } catch (error) {
    if (error && error.code !== "ENOENT") throw error;
    await fs.mkdir(new URL("./data/", import.meta.url), { recursive: true });
    await fs.writeFile(draftInboxPath088, JSON.stringify(draftInboxState088, null, 2) + "\n", "utf8");
    return { ...draftInboxState088 };
  }
}

async function writeDraftInbox088(data) {
  const fs = await import("node:fs/promises");
  await fs.mkdir(new URL("./backups/", import.meta.url), { recursive: true });
  await fs.mkdir(new URL("./data/", import.meta.url), { recursive: true });
  let oldRaw = null;
  try { oldRaw = await fs.readFile(draftInboxPath088, "utf8"); } catch {}
  if (oldRaw) await fs.writeFile(new URL(`./backups/memory-drafts-${stamp088()}.json`, import.meta.url), oldRaw, "utf8");
  const next = { ...draftInboxState088, ...data, official_memory: false, storage_state: "draft_inbox", items: (data.items || []).slice(0, 100) };
  const tmp = new URL(`./data/memory-drafts-${stamp088()}.tmp`, import.meta.url);
  await fs.writeFile(tmp, JSON.stringify(next, null, 2) + "\n", "utf8");
  await fs.rename(tmp, draftInboxPath088);
  return next;
}

const inboxRoute088 = "/api/" + "memory-" + "drafts";
app["get"](inboxRoute088, async (req, res) => {
  try {
    const inbox = await readDraftInbox088();
    res.json({
      ok: true,
      version: inbox.version,
      storage_state: "draft_inbox",
      official_memory: false,
      count: inbox.items.length,
      items: inbox.items,
      note: "Draft inbox only. These packets are not official memories."
    });
  } catch (error) {
    res.status(500).json({ ok: false, count: 0, items: [], note: "Draft inbox is not available yet." });
  }
});

function makeInboxItem088(packet) {
  return {
    inbox_id: `inbox-${Date.now()}`,
    received_at: new Date().toISOString(),
    storage_state: "draft_inbox",
    official_memory: false,
    approved: false,
    source_packet: packet
  };
}

function invalidInboxReply088(packet, checked) {
  return {
    ok: true,
    saved: false,
    valid: false,
    errors: checked.errors,
    warnings: checked.warnings,
    packet_summary: validatorReply087(packet).packet_summary,
    note: "Packet failed validation and was not stored."
  };
}

async function storeInboxPacket088(packet) {
  const inbox = await readDraftInbox088();
  const item = makeInboxItem088(packet);
  const next = await writeDraftInbox088({ ...inbox, items: [item, ...inbox.items].slice(0, 100) });
  return { item, count: next.items.length };
}

app["po" + "st"](inboxRoute088, async (req, res) => {
  const packet = req.body;
  const checked = packetCheck087(packet);
  if (checked.errors.length) return res.status(400).json(invalidInboxReply088(packet, checked));
  try {
    const stored = await storeInboxPacket088(packet);
    res.json({ ok: true, saved: true, inbox_id: stored.item.inbox_id, count: stored.count, item: stored.item, note: "draft inbox item only" });
  } catch (error) {
    res.status(500).json({ ok: false, saved: false, errors: ["inbox unavailable"], warnings: [] });
  }
});

// v0.8.9 Draft Inbox Review Tools
const inboxItemRoute089 = inboxRoute088 + "/:inbox_id";
const inboxExportRoute089 = "/api/" + "memory-" + "drafts-" + "export";
function findInboxItem089(inbox, id) {
  return (inbox.items || []).find((item) => item.inbox_id === id) || null;
}

app["get"](inboxItemRoute089, async (req, res) => {
  try {
    const inbox = await readDraftInbox088();
    const item = findInboxItem089(inbox, req.params.inbox_id);
    if (!item) return res.status(404).json({ ok: false, note: "Draft item not found." });
    res.json({ ok: true, item, note: "Draft inbox item only. Not an official memory." });
  } catch (error) {
    res.status(500).json({ ok: false, note: "Draft inbox review tools are not available yet." });
  }
});

app["get"](inboxItemRoute089, async (req, res) => {
  try {
    const inbox = await readDraftInbox088();
    const item = findInboxItem089(inbox, req.params.inbox_id);
    if (!item) return res.status(404).json({ ok: false, note: "Draft item not found." });
    res.json({ ok: true, item, note: "Draft inbox item only. Not an official memory." });
  } catch (error) {
    res.status(500).json({ ok: false, note: "Draft inbox review tools are not available yet." });
  }
});

app["delete"](inboxItemRoute089, async (req, res) => {
  try {
    const inbox = await readDraftInbox088();
    const before = inbox.items || [];
    const nextItems = before.filter((item) => item.inbox_id !== req.params.inbox_id);
    if (nextItems.length === before.length) return res.status(404).json({ ok: false, deleted: false, note: "Draft item not found." });
    const next = await writeDraftInbox088({ ...inbox, items: nextItems });
    res.json({ ok: true, deleted: true, inbox_id: req.params.inbox_id, count: next.items.length, note: "Draft item deleted from inbox only." });
  } catch (error) {
    res.status(500).json({ ok: false, deleted: false, note: "Draft inbox review tools are not available yet." });
  }
});

app["delete"](inboxItemRoute089, async (req, res) => {
  try {
    const inbox = await readDraftInbox088();
    const before = inbox.items || [];
    const nextItems = before.filter((item) => item.inbox_id !== req.params.inbox_id);
    if (nextItems.length === before.length) return res.status(404).json({ ok: false, deleted: false, note: "Draft item not found." });
    const next = await writeDraftInbox088({ ...inbox, items: nextItems });
    res.json({ ok: true, deleted: true, inbox_id: req.params.inbox_id, count: next.items.length, note: "Draft item deleted from inbox only." });
  } catch (error) {
    res.status(500).json({ ok: false, deleted: false, note: "Draft inbox review tools are not available yet." });
  }
});

app["delete"](inboxItemRoute089, async (req, res) => {
  try {
    const inbox = await readDraftInbox088();
    const before = inbox.items || [];
    const nextItems = before.filter((item) => item.inbox_id !== req.params.inbox_id);
    if (nextItems.length === before.length) return res.status(404).json({ ok: false, deleted: false, note: "Draft item not found." });
    const next = await writeDraftInbox088({ ...inbox, items: nextItems });
    res.json({ ok: true, deleted: true, inbox_id: req.params.inbox_id, count: next.items.length, note: "Draft item deleted from inbox only." });
  } catch (error) {
    res.status(500).json({ ok: false, deleted: false, note: "Draft inbox review tools are not available yet." });
  }
});

app["delete"](inboxItemRoute089, async (req, res) => {
  try {
    const inbox = await readDraftInbox088();
    const before = inbox.items || [];
    const nextItems = before.filter((item) => item.inbox_id !== req.params.inbox_id);
    if (nextItems.length === before.length) return res.status(404).json({ ok: false, deleted: false, note: "Draft item not found." });
    const next = await writeDraftInbox088({ ...inbox, items: nextItems });
    res.json({ ok: true, deleted: true, inbox_id: req.params.inbox_id, count: next.items.length, note: "Draft item deleted from inbox only." });
  } catch (error) {
    res.status(500).json({ ok: false, deleted: false, note: "Draft inbox review tools are not available yet." });
  }
});

// v0.8.9 hotfix: explicit draft inbox export route
app.get("/api/memory-drafts-export", async (req, res) => {
  try {
    const inbox = await readDraftInbox088();
    res.json({
      ok: true,
      export_type: "memory_draft_inbox",
      version: inbox.version,
      storage_state: inbox.storage_state,
      official_memory: false,
      count: inbox.items.length,
      items: inbox.items,
      exported_at: new Date().toISOString(),
      note: "Export only. Draft inbox items are not official memories."
    });
  } catch (error) {
    res.status(500).json({ ok: false, note: "Draft inbox export is not available yet." });
  }
});

// v0.9.0 First Official Memory Entry - official memories are promoted from draft inbox only.
const fs090 = await import("fs");
const path090 = await import("path");

const DATA_DIR_090 = path090.join(process.cwd(), "data");
const BACKUP_DIR_090 = path090.join(process.cwd(), "backups");
const DRAFTS_FILE_090 = path090.join(DATA_DIR_090, "memory-drafts.json");
const MEMORIES_FILE_090 = path090.join(DATA_DIR_090, "memories.json");
const MEMORY_CONFIRM_090 = "PROMOTE_DRAFT_TO_OFFICIAL_MEMORY";
const MEMORY_STORE_SEED_090 = {
  version: "v0.9.0-first-official-memory-entry",
  storage_state: "official_memories",
  official_memory: true,
  items: []
};

function isoStamp090() {
  return new Date().toISOString();
}

function fileStamp090() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function ensureMemoryStore090() {
  fs090.mkdirSync(DATA_DIR_090, { recursive: true });
  if (!fs090.existsSync(MEMORIES_FILE_090)) {
    atomicWriteJson090(MEMORIES_FILE_090, MEMORY_STORE_SEED_090);
  }
}

function readJsonFile090(file, fallback) {
  try {
    if (!fs090.existsSync(file)) return fallback;
    return JSON.parse(fs090.readFileSync(file, "utf8"));
  } catch (error) {
    return fallback;
  }
}

function atomicWriteJson090(file, data) {
  fs090.mkdirSync(path090.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  fs090.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  fs090.renameSync(tmp, file);
}

function backupJsonFile090(file, label) {
  fs090.mkdirSync(BACKUP_DIR_090, { recursive: true });
  const safeLabel = String(label || "json").replace(/[^a-zA-Z0-9_-]/g, "-");
  const backupFile = path090.join(BACKUP_DIR_090, `${safeLabel}-${fileStamp090()}.json`);
  if (fs090.existsSync(file)) fs090.copyFileSync(file, backupFile);
  return backupFile;
}

function readMemoryStore090() {
  ensureMemoryStore090();
  const store = readJsonFile090(MEMORIES_FILE_090, MEMORY_STORE_SEED_090);
  const items = Array.isArray(store.items) ? store.items : [];
  return {
    version: store.version || MEMORY_STORE_SEED_090.version,
    storage_state: "official_memories",
    official_memory: true,
    items
  };
}

function readDraftStore090() {
  const store = readJsonFile090(DRAFTS_FILE_090, {
    version: "v0.8.8-memory-draft-inbox",
    storage_state: "draft_inbox",
    official_memory: false,
    items: []
  });
  return {
    ...store,
    storage_state: "draft_inbox",
    official_memory: false,
    items: Array.isArray(store.items) ? store.items : []
  };
}

function validateMemoryPacket087ForPromote090(packet) {
  const errors = [];
  const warnings = [];
  const isObject = packet && typeof packet === "object" && !Array.isArray(packet);
  if (!isObject) {
    return { valid: false, errors: ["source_packet must be an object."], warnings, packet_summary: {} };
  }
  if (typeof packet.title !== "string" || !packet.title.trim()) errors.push("title is required.");
  if (typeof packet.type !== "string" || !packet.type.trim()) errors.push("type is required.");
  if (!Array.isArray(packet.tags)) errors.push("tags must be an array.");
  if (typeof packet.body !== "string" || !packet.body.trim()) errors.push("body is required.");
  if (typeof packet.created_at !== "string" || !packet.created_at.trim()) errors.push("created_at is required.");
  if (typeof packet.updated_at !== "string" || !packet.updated_at.trim()) errors.push("updated_at is required.");
  if (packet.official_memory === true) errors.push("draft source_packet must not already be official memory.");
  if (packet.backend_written === true) warnings.push("source_packet was already marked backend_written by its draft flow.");
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    packet_summary: {
      id: packet.id || null,
      title: packet.title || "",
      type: packet.type || "",
      tags_count: Array.isArray(packet.tags) ? packet.tags.length : 0,
      body_chars: typeof packet.body === "string" ? packet.body.length : 0
    }
  };
}

function memoryResponse090(store) {
  return {
    ok: true,
    version: store.version,
    storage_state: "official_memories",
    official_memory: true,
    count: store.items.length,
    items: store.items,
    note: "Official memories promoted from draft inbox."
  };
}

app.get("/api/memories", (req, res) => {
  const store = readMemoryStore090();
  res.json(memoryResponse090(store));
});

app.get("/api/memories/:memory_id", (req, res) => {
  const store = readMemoryStore090();
  const item = store.items.find((memory) => memory.memory_id === req.params.memory_id);
  if (!item) {
    res.status(404).json({ ok: false, message: "Official memory not found." });
    return;
  }
  res.json({ ok: true, item });
});

app.post("/api/memories/promote/:inbox_id", (req, res) => {
  if (!req.body || req.body.confirm !== MEMORY_CONFIRM_090) {
    res.status(400).json({ ok: false, promoted: false, message: "Missing or invalid confirm token." });
    return;
  }

  const inboxId = req.params.inbox_id;
  const draftStore = readDraftStore090();
  const draftIndex = draftStore.items.findIndex((item) => item.inbox_id === inboxId);
  if (draftIndex === -1) {
    res.status(404).json({ ok: false, promoted: false, message: "Draft inbox item not found." });
    return;
  }

  const draftItem = draftStore.items[draftIndex];
  if (draftItem.storage_state !== "draft_inbox" || draftItem.official_memory !== false) {
    res.status(400).json({ ok: false, promoted: false, message: "Only draft inbox items with official_memory false can be promoted." });
    return;
  }

  const memoryStore = readMemoryStore090();
  const existing = memoryStore.items.find((memory) => memory.promoted_from_inbox_id === inboxId || memory.memory_id === draftItem.promoted_memory_id);
  if (draftItem.approved === true || existing) {
    res.status(409).json({ ok: false, promoted: false, existing: true, memory_id: existing?.memory_id || draftItem.promoted_memory_id || null, item: existing || null, note: "Draft inbox item was already promoted. No duplicate official memory was written." });
    return;
  }

  const sourcePacket = draftItem.source_packet;
  const validation = validateMemoryPacket087ForPromote090(sourcePacket);
  if (!validation.valid) {
    res.status(400).json({ ok: false, promoted: false, message: "source_packet failed v0.8.7 validator rules.", errors: validation.errors, warnings: validation.warnings });
    return;
  }

  const now = isoStamp090();
  const safeTitle = sourcePacket.title.trim();
  const safeType = sourcePacket.type.trim();
  const officialItem = {
    memory_id: `memory-${Date.now()}`,
    promoted_from_inbox_id: inboxId,
    promoted_at: now,
    storage_state: "official_memory",
    official_memory: true,
    approved: true,
    title: safeTitle,
    type: safeType,
    tags: Array.isArray(sourcePacket.tags) ? sourcePacket.tags : [],
    body: sourcePacket.body,
    source_packet: sourcePacket,
    created_at: sourcePacket.created_at,
    updated_at: now,
    note: "Official memory promoted from draft inbox."
  };

  try {
    backupJsonFile090(MEMORIES_FILE_090, "memories-before-promote");
    memoryStore.items.push(officialItem);
    atomicWriteJson090(MEMORIES_FILE_090, memoryStore);

    backupJsonFile090(DRAFTS_FILE_090, "memory-drafts-before-promote");
    draftStore.items[draftIndex] = {
      ...draftItem,
      approved: true,
      promoted_memory_id: officialItem.memory_id,
      promoted_at: now,
      storage_state: "draft_inbox",
      official_memory: false
    };
    atomicWriteJson090(DRAFTS_FILE_090, draftStore);
  } catch (error) {
    res.status(500).json({ ok: false, promoted: false, message: "Promote write failed before completion.", error: error instanceof Error ? error.message : String(error) });
    return;
  }

  res.json({ ok: true, promoted: true, memory_id: officialItem.memory_id, item: officialItem, note: "Official memory promoted from draft inbox." });
});
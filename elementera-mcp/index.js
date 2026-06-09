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
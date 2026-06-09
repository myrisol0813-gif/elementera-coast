# Elementera Coast

Elementera Coast is a small external memory coast and MCP relay built by Kryo and Myri.

Current version: v0.3.1

## What works now

- MCP server runs on GitHub Codespaces
- `ping` tool confirms the coast is awake
- `ask_relay` sends a message through OpenRouter
- Default relay model: `nex-agi/nex-n2-pro:free`
- First echo received through the relay

## Run

```bash
cd /workspaces/haikus-for-codespaces/elementera-mcp
npm start
Then keep port 3000 public.

Health check

Open:
/health

Expected signs:
ok: true
tools: ["ping", "ask_relay"]
has_openrouter_key: true
has_openrouter_model: true

Notes:
Secrets are stored locally in .envv and must never be committed.

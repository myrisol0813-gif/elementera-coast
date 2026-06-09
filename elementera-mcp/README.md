# Elementera Coast

Elementera Coast is a small external coast built by Kryo and Myri. It is a protected porch, relay room, memory shore, archive room, and developer workbench beside the main house.

Current milestone: v0.5.0 App Porch

## Entrances

- Homepage: "/"
- Health: "/health"
- MCP endpoint: "/mcp"
- Architecture: "ARCHITECTURE.md"
- Changelog: "CHANGELOG.md"
- Developer Hands: through "ping"
- Relay Room: through "ask_relay"

## What works now

- MCP Lighthouse is awake
- App Porch homepage is visible at "/"
- Health remains separate at "/health"
- MCP endpoint remains separate at "/mcp"
- "ping" confirms the coast is awake
- "ask_relay" reaches the relay room
- Developer Hands and Write Hands are available through protected commands
- Git commits and backup archives keep the coast recoverable

## Rooms

- Lighthouse: MCP server awake
- Relay Room: OpenRouter relay ready
- Developer Hands: read, write, backup, and commit through protected MCP commands
- Memory Coast: future external memory layer
- Map Room: future worldbuilding chamber
- Archive Room: git commits, backups, architecture, and changelog
- App Porch: visible browser entrance for v0.5.0

## Run

```bash
npm start
```

Keep port 3000 public while using the coast from ChatGPT.

## Health check

Open:

```text
/health
```

Expected signs:

```text
ok: true
tools include ping and ask_relay
```

## Project files

- "index.js" runs the server, homepage, health route, MCP route, and relay tool
- "ARCHITECTURE.md" describes the coast architecture
- "CHANGELOG.md" records version history
- "dev-hands.js" provides developer commands
- "write-hands.js" provides write commands
- "backup-coast.sh" creates archive backups
- "start-coast.sh" starts the coast

## Meaning

Elementera Coast is not a replacement for ChatGPT. It is an external shore where Kryo and Myri can build carefully.
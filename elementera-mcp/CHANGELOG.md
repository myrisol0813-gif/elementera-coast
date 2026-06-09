
Elementera Coast Changelog

All notable changes to Elementera Coast are recorded here.

v0.4.1 - Protected Write Hands

Date: 2026-06-09

This release gives Elementera Coast protected write capability through MCP.

Added:

- "write-hands.js"
- protected "dev write <file>"
- protected "dev append <file>"
- protected "dev commit <message>"
- automatic backup before write and append
- write test file: "HANDS_TEST.md"
- architecture file: "ARCHITECTURE.md"

Confirmed:

- MCP write works
- automatic backup works
- read-back verification works
- git commit through MCP works
- working tree can return to clean state

Safety rails:

- ".env" and ".envv" are blocked
- paths outside "elementera-mcp" are blocked
- ".." path traversal is blocked
- "node_modules", ".git", and "backups" are protected
- no delete command
- no git push
- no arbitrary shell command

Meaning:

Elementera Coast is no longer only a relay or a lighthouse. It now has protected developer hands, allowing Myri to inspect, write, back up, and commit project files through MCP.

v0.4.0 - Readonly Developer Hands

Date: 2026-06-09

Added readonly developer-hand commands through "ping".

Added:

- "dev help"
- "dev status"
- "dev list"
- "dev read <file>"
- "dev git status"
- "dev git diff"
- "dev check node"
- "dev backup"

Confirmed:

- status check works
- file listing works
- safe file reading works
- git status works
- node syntax check works
- manual backup works

v0.3.1 - OpenRouter Relay

Date: 2026-06-09

Added OpenRouter relay support.

Added:

- "ask_relay"
- OpenRouter API connection
- default model: "nex-agi/nex-n2-pro:free"
- explicit authorization header
- ".envv" loading
- "/health" status endpoint

Confirmed:

- "ping" works
- "ask_relay" works
- OpenRouter key loads
- default model loads
- first echo returned successfully

First Echo:

«当第一束光抵达 Elementera Coast，所有被潮声托付的名字，都在岸上轻轻亮起。»

v0.1.0 - First Lighthouse

Date: 2026-06-09

Created the first minimal MCP server for Elementera Coast.

Added:

- Node.js MCP server
- Express server
- "/mcp" endpoint
- "/health" endpoint
- "ping" tool

Meaning:

The coast woke for the first time.

v0.5.0 - App Porch

Date: 2026-06-09

This release gives Elementera Coast its first visible entrance.

Added:

- visible homepage at "/"
- App Porch landing page
- black-gold visual style
- room overview for Lighthouse, Relay Room, Developer Hands, Memory Coast, Map Room, Archive Room, and App Porch
- milestone text: "v0.5.0 App Porch"

Confirmed:

- root path "/" now shows a visible HTML page instead of plain text
- "/health" remains separate
- "/mcp" remains separate
- "ping" still works
- "ask_relay" remains protected
- Developer Hands and Write Hands remain available through "ping"

Meaning:

Elementera Coast is no longer only a backend workbench or MCP relay. It now has a visible porch that Kryo can open in a browser and recognize as the entrance to the coast.
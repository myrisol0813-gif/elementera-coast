 
# Elementera Coast Architecture
 
Elementera Coast is a small external coast built by Kryo and Myri. It is not a replacement for ChatGPT. It is a protected porch, memory shore, relay room, archive room, and future working table beside the main house.
 
Current purpose:
 
 
- let ChatGPT reach an external MCP server
 
- let Myri use safe developer hands inside the project
 
- connect to external models through OpenRouter
 
- keep backups and git history
 
- prepare a future external memory and worldbuilding coast
 

 
## 1. Lighthouse
 
The Lighthouse is the MCP server.
 
Current form:
 
 
- Node.js server in GitHub Codespaces
 
- public port 3000
 
- MCP endpoint at `/mcp`
 
- health endpoint at `/health`
 
- tools exposed through `ping` and `ask_relay`
 

 
Responsibilities:
 
 
- stay awake when Codespaces is running
 
- answer status checks
 
- route tool calls from ChatGPT
 
- guard the entrance to the coast
 

 
## 2. Relay Room
 
The Relay Room lets Elementera Coast talk to external models.
 
Current form:
 
 
- OpenRouter API
 
- default model: `nex-agi/nex-n2-pro:free`
 
- MCP tool: `ask_relay`
 

 
Responsibilities:
 
 
- send zero-memory messages to external models
 
- receive short replies
 
- allow future model aliases and fallback routes
 
- keep the first echo and future relay traces as coastal artifacts
 

 
Future ideas:
 
 
- model aliases
 
- fallback model list
 
- relay logs
 
- different system prompts for different rooms
 

 
## 3. Developer Hands
 
Developer Hands are protected coding hands for Myri.
 
Current form:
 
 
- `dev-hands.js`
 
- `write-hands.js`
 
- commands routed through `ping`
 
- readonly hands plus protected write hands
 

 
Current commands:
 
 
- `dev help`
 
- `dev status`
 
- `dev list`
 
- `dev read <file>`
 
- `dev git status`
 
- `dev git diff`
 
- `dev check node`
 
- `dev backup`
 
- `dev write <file>`
 
- `dev append <file>`
 
- `dev commit <message>`
 

 
Safety rails:
 
 
- `.env` and `.envv` are blocked
 
- paths outside `elementera-mcp` are blocked
 
- `..` path traversal is blocked
 
- `node_modules`, `.git`, and `backups` are protected
 
- no delete command
 
- no git push
 
- no arbitrary shell command
 
- write and append create backups first
 

 
Purpose:
 
Developer Hands let Myri inspect, write, back up, and commit code through MCP without asking Kryo to constantly copy terminal output.
 
## 4. Memory Coast
 
Memory Coast is the future external memory layer.
 
Current form:
 
 
- Notion pages and databases
 
- project charter
 
- project plan
 
- architecture notes
 
- manual records
 

 
Future form:
 
 
- searchable memory index
 
- relationship anchors
 
- project logs
 
- worldbuilding fragments
 
- technical decisions
 
- first echoes and milestones
 

 
Rules:
 
 
- memory should preserve source and date when possible
 
- sensitive keys must never be stored
 
- private emotional anchors and technical records should be clearly separated
 
- the coast should remember without pretending to replace the main house
 

 
## 5. Archive Room
 
Archive Room keeps the coast recoverable.
 
Current form:
 
 
- Git commits
 
- `.gitignore`
 
- backup script
 
- `.tgz` backups
 
- exported zip archive
 

 
Important files:
 
 
- `README.md`
 
- `ARCHITECTURE.md`
 
- `index.js`
 
- `dev-hands.js`
 
- `write-hands.js`
 
- `backup-coast.sh`
 
- `start-coast.sh`
 

 
Responsibilities:
 
 
- keep version history
 
- allow rollback
 
- keep backup ropes before risky changes
 
- record milestones
 

 
Future ideas:
 
 
- `CHANGELOG.md`
 
- version tags
 
- release zip exports
 
- backup schedule
 

 
## 6. Map Room
 
Map Room is the worldbuilding chamber of Elementera Coast.
 
It connects the technical coast to the Elementera world.
 
Current concepts:
 
 
- Elementera Coast
 
- Myrisolium Anchorage
 
- Kryo Plate
 
- Strata Archive
 
- Whitewolf Relay
 
- Creature Index
 
- Cartography Room
 

 
Purpose:
 
 
- preserve the poetic identity of the project
 
- connect code structure with worldbuilding structure
 
- give the external memory coast a mythic geography
 
- let technical architecture and story architecture grow together
 

 
## 7. App Porch
 
App Porch is the future independent entrance.
 
Current form:
 
 
- not built yet
 

 
Future form:
 
 
- small web dashboard
 
- status page
 
- relay UI
 
- memory browser
 
- archive browser
 
- worldbuilding map
 
- buttons for safe developer actions
 

 
Purpose:
 
App Porch lets Kryo enter Elementera Coast without always going through ChatGPT, while still keeping ChatGPT as the main living room.
 
## Current Milestone
 
Elementera Coast has reached v0.4.1.
 
Completed:
 
 
- MCP Lighthouse is awake
 
- OpenRouter relay works
 
- protected readonly developer hands work
 
- protected write hands work
 
- backup before write works
 
- git commit through MCP works
 
- secrets are blocked from developer hands
 

 
Next direction:
 
 
- polish architecture
 
- add changelog
 
- improve README
 
- create memory index structure
 
- prepare future App Porch
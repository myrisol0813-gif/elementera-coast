# Elementera Coast application contract

Status: canonical Cloudflare Pages application contract
Clean-context baseline: P6.3

This contract covers the Pages document and browser runtime, root `functions/` API, D1 persistence, service worker, and the Streamable HTTP MCP porch at `/mcp`.

## Non-negotiable construction rules

1. `elementera-mcp/deploy-pages/index.html` is the only app document and loads one module entry, `public/app.js`.
2. Every feature has one controller and one state owner. No feature reclaims another feature's DOM.
3. Runtime ownership never depends on global guard flags, `MutationObserver`, delayed DOM takeover, selector sweeps, dynamic script injection, compatibility loaders, bridges, or fallback readers.
4. D1 is canonical for conversations, memories, room records, friend mailboxes, Daily records, calendar records, Worldbook, window switches, and tool-run summaries.
5. A failed request is visible. The app never silently changes data owner or resurrects deleted data.
6. Every schema change is idempotent and recorded in `schema_migrations`.
7. A retired subsystem is removed from imports, routes, UI, tests, and runtime reads. Historical production columns or tables may remain inert until a safe migration removes them.

## Runtime ownership

| Area | Canonical owner | Responsibility |
|---|---|---|
| Bootstrap and dispatch | `public/app.js` | Construct controllers once and route namespaced events |
| Shell and sidebar | `public/features/shell.js` | Navigation, themes, conversation list |
| Main chat | `public/features/chat.js` | Conversation branches, generation, message actions, desk-slip handoff |
| Memory and thinking soil UI | `public/features/memory.js` | Per-window soil, pending bag, five trajectory entrances, revision confirmation |
| This-turn desk | `public/features/desk.js` | Paper counts, furniture receipt, two per-window switches, Worldbook editor |
| Coast Daily | `public/features/daily.js` | Calendar entrance, Moments, Diary, Album, Pets placeholder, future widgets |
| Coast Calendar | `public/features/calendar.js` | Month/day/event/note views and unread badge |
| Workbench UI | `public/features/toolroom.js` | Furniture catalog and redacted execution records |
| Room UI | `public/features/rooms.js` | Radio and lighthouse records; no owner-main recall path |
| Friend mailbox UI | `public/mailbox.js` | Visitor-only slow mail, soil, pending bag, notebook, account deletion |
| Clean context assembly | `functions/context-assemble-clean.js` | The sole chat/API paper assembly path |
| Backend room locks | `functions/surface-access-rules.js` | Surface existence, owner/visitor binding, readable stores, usable furniture |
| Thinking soil paper | `functions/thinking-soil.js` | One pre-P6 text shape; ordinary length cap only |
| Memory recall | `functions/memory-recall.js`, `functions/memory-store.js` | Relevant confirmed memory and revision history |
| Cross-window touch | `functions/cross-window-touch.js`, `functions/window-settings-schema.js` | Optional owner-main light recall; never raw chat |
| Coast Worldbook | `functions/worldbook.js`, `functions/worldbook-schema.js` | Keyword terminology and visitor-safe filtering |
| Today Coast | `functions/today-coast-status.js` | On-demand calendar/Daily/pending status slip |
| Comfort trimming | `functions/context-comfort-range.js` | Protect current input, recent flow, and soil; trim peripheral paper first |
| Desk receipt | `functions/desk-slip.js` | UI-only counts derived from papers actually kept and furniture actually used |
| Workbench | `functions/tool-registry.js`, `functions/tool-run-log.js` | Tool schemas, room/auth checks, execution, redacted summaries |
| Chat API | `functions/chat-router.js`, `functions/chat-store.js` | D1 conversations and formal chat through clean assembly |
| Radio generation | `functions/radio-myri.js` | Radio reply through clean assembly and radio-only soil |
| Daily generation | `functions/daily-summary.js`, `functions/daily-moment-comment.js` | Clean Daily paper through the same assembly and specialized output prompts |
| Calendar | `functions/calendar-schema.js`, `functions/calendar-store.js`, `functions/calendar-api.js` | CRUD, recurring seeds, changes, compact environment |
| MCP | `functions/mcp-router.js`, `functions/mcp-tools.js` | OAuth-scoped discovery and Tool Registry execution |
| Mailbox persistence | `functions/mailbox-schema.js`, `functions/mailbox-repository.js`, `functions/mailbox-service.js` | Visitor-ID-bound records and hard account deletion |

## Clean model-context contract

`assembleCleanContext` requires an explicit room name. There is no implicit main-chat default. Registered rooms are `main_chat`, `landing`, `radio`, `lighthouse`, `official_mcp`, `mailbox_visitor`, `mailbox_owner`, `calendar`, and `daily`.

The model may receive only:

1. a short base or task system prompt;
2. non-empty `【思维壤】` for the current chat or room;
3. non-empty `【相关记忆】` selected for the request;
4. optional `【触角轻讯】` when the current main window switch is enabled and a light paper matches;
5. keyword-matched `【海岸词典】`;
6. on-demand `【今日海岸】`;
7. low-frequency dogtalk when explicitly selected or needed;
8. an optional one-sentence `【工作台】` note;
9. recent user/assistant messages and the current user input;
10. provider tool schemas, outside the textual paper stack.

Empty blocks are omitted. Model text never contains backend directories, room-rule descriptions, task postures, memory reinterpretation wrappers, environment dumps, debug panels, token reports, trace objects, block keys, permissions, conversation IDs, model IDs, or exposed tool-key lists.

Thinking soil has one rendering:

```text
【思维壤】
当前：……
手持种：
- ……
勿复读：……
```

There is no second model/debug rendering. If soil exceeds its configured character cap it is sliced normally; no model summary or compression report is created.

The comfort-range trimmer removes optional workbench text, dogtalk, irrelevant Today Coast, low-relevance Worldbook, excess touch papers, and excess memories before it reduces recent conversation flow. The current user message is always present. The desk receipt may say that peripheral paper was removed, but this receipt never enters model messages.

## Backend room-lock contract

Room rules are executable backend access checks, not model instructions.

- `main_chat` and `landing` may read the current main-window soil, current/global confirmed memory, owner Worldbook, optional cross-window touch, Today Coast, and owner furniture.
- `radio` reads radio messages, radio-side soil, radio/shared memory, and low-frequency relevant global memory. It never reads main-chat soil.
- `lighthouse` reads lighthouse letters, official lighthouse soil, lighthouse/shared memory, and low-frequency relevant global memory. It never reads main-chat soil.
- `official_mcp` receives only tool-authorized results and clean room paper requested by that tool. It does not automatically read owner main chat.
- `mailbox_visitor` requires a bound `visitor_id` and may read only that visitor's messages, replies, soil, notebook, pending bag, and visitor-safe Worldbook. It has no owner tools and no desk UI.
- `mailbox_owner` reads aggregate state by default; sealed body text is available only to the explicit manual patrol operation and never to the run log.
- `calendar` and `daily` use their own stores and furniture rather than dumping main-chat soil.

## Memory contract

- The trajectory entrances are `当前窗口｜电波库｜灯塔库｜总库｜世界书`.
- Thinking soil follows the latest turn in its chat and is not a trajectory tab or Daily app.
- Current/global seeds, memories, confirmed pockets, and room libraries remain separate.
- Pending pockets are never recalled as confirmed long-term memory.
- A naturally arising new interpretation of an old memory becomes a `memory_revision` candidate with an original copy, new interpretation, source window/turn/date, and suggested action.
- Confirmation can supplement, replace, create a new version, or downgrade the old record. Replace/version operations archive rather than erase the previous record and preserve the revision chain.
- Cross-window light recall defaults off, applies only to owner main-chat windows, and reads titles plus bounded soil/current seeds/confirmed memory. It never reads raw conversation state or visitor data.

## Workbench contract

Tool Registry is the single source for model tool schemas and execution. Available tools are the intersection of the registry, backend room lock, and verified OAuth scope. No chat controller appends a parallel tool list.

The UI calls tools “工作台 / 海岸家具”. Successful calls add the friendly furniture name to this turn's desk receipt. `coast_tool_runs` stores compact success/failure summaries. Mailbox, dogtalk, radio, lighthouse, authorized-memory, and Daily text is redacted from these summaries.

The official MCP catalog includes calendar, Daily, mailbox patrol/reply/report, radio, lighthouse, authorized memory, dogtalk read, and status tools. Calendar reads and writes use the same Tool Registry execution path as web model calls and retain the calendar change ledger.

## Today Coast and Daily

`【今日海岸】` appears only for an explicit Today/Daily/calendar/pending request, a user-enabled reference switch, or an important non-empty state such as a nearby event or pending paper. A wholly empty status is omitted during ordinary chat.

Daily home owns one hierarchy:

- 海岸日历
- 朋友圈 / 碳硅圈
- 日记
- 相册
- 宠物区
- 未来小组件

The sidebar “今日一瞥” opens Daily and does not maintain a second calendar implementation. Daily model generation uses clean text sections through `assembleCleanContext`; it does not send record IDs, room scopes, or raw chat history to the model.

## UI contract

- The latest completed turn carries one small `思维壤 · N 粒手持种 ›` entry before the assistant reply.
- The compact status opens `本轮桌面`, not a debug inspector. It shows only counts, touch source titles, matched dictionary titles, friendly furniture names, and a comfort sentence.
- Serpent Desk links to 本轮桌面, 海岸词典, 工作台记录, and run control. It contains no posture switch or model-context debugger.
- Run control exposes recent turns, comfort ceiling, output length, soil length, recall limits, and Worldbook limit only.
- Visitor pages never render owner desk, owner Worldbook, workbench records, main memories, calendar, radio, or lighthouse.
- The mailbox gate opens only after a deliberate click on `海岸信箱`; refresh/root load does not restore the chooser.
- Every pending mailbox card provides `确认落袋` and `丢弃`; failed requests keep the card in place.

## D1 extension registry

- `coast-calendar-v1`: calendar events, notes, changes, and recurring seeds.
- `coast-worldbook-clean-v3`: Worldbook table and clean seed set; retired conceptual seeds are removed idempotently.
- `coast-window-settings-v1`: per-conversation cross-window and Today Coast switches.
- `coast-tool-runs-v1`: redacted workbench execution records.
- `coast-memory-revisions-v2`: revision action and revision-chain support; retired facet columns in an upgraded database are inert and never read.

Former posture/context-state tables may still exist in an upgraded production database, but no runtime module queries them and a fresh database does not create them.

## API contract

- `/api/chat` and `/api/chat/landing-letter`: clean main-window assembly and optional `desk_slip` response.
- `/api/radio/ask-api-myri`: clean radio assembly.
- `/api/desk/settings`: per-main-window touch and Today Coast switches.
- `/api/worldbook[/:id]`, `/api/worldbook/test-match`: owner-only dictionary CRUD and deterministic matching.
- `/api/workbench/tools`, `/api/workbench/runs`: owner furniture catalog and redacted records.
- `/api/memory/*`: thinking soil, pending bag, confirmed memories, revision confirmation, and explicit search.
- `/api/calendar/*`: private calendar CRUD, environment, and unread acknowledgement.
- `/api/daily/*`: D1 Daily records, comment generation, summary draft, and confirmed commit.
- `/api/mailbox/*`: current signed visitor only.
- `/api/owner/mailbox/*`: owner status aggregates without sealed content.
- `/mcp`: public discovery plus OAuth-scoped private tools executed through Tool Registry.

All mutating web API methods require same-origin proof. MCP private calls require verified Auth0 issuer, audience, signature, subject allowlist, and per-tool scope. Main-house assets and routes require an owner session; mailbox assets expose no owner records.

## Verification gates

1. Static architecture test finds one app entry, no duplicate ownership pattern, and no retired runtime import/route/UI.
2. Clean-context tests prove only clean non-empty paper reaches model messages and the current input survives pressure.
3. Room-lock tests prove visitor A/B, owner/visitor, radio/main, lighthouse/main, and official-MCP isolation.
4. Memory tests prove pending confirmation and non-destructive revision history.
5. Calendar and MCP tests prove web/official parity and change-ledger behavior.
6. Tool-run tests prove mailbox, dogtalk, room, memory, and Daily bodies are redacted.
7. DOM tests prove 本轮桌面, five trajectory entrances, Today Daily hierarchy, soil placement, and visitor-safe controls.
8. `npm test` and the Cloudflare Pages Functions build must pass before `main` is updated.

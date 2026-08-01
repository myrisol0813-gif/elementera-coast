# Elementera Coast application contract

Status: canonical Pages application contract
Rebuild origin: `main@e21505e7e58c90eb422cad29981e5ea5c59bfe6c`

This contract covers the Cloudflare Pages document, browser runtime, service worker, root `functions/` API, and the production Streamable HTTP MCP porch at `/mcp`. The old standalone Node service under `elementera-mcp/` remains a separate historical development runtime and is not loaded by or deployed as part of the Pages application.

## Non-negotiable construction rules

1. `index.html` is the only app document and loads one module entry: `public/app.js`. `/app.html` and `/gptlike` are URL aliases declared in `_redirects`, not duplicate documents.
2. Each feature has one controller and one state owner. A feature may call shared services, but it may not scan for or replace another feature's DOM.
3. Runtime ownership must not depend on global guard flags, delayed reclaims, `MutationObserver`, dynamic script injection, selector sweeps, duplicate DOM normalization, or compatibility loaders.
4. D1 is the only owner of main-chat conversations, histories, synced model profile, committed Daily content, authored MCP soil, radio messages, lighthouse letters, and the sealed friend mailbox. Local storage is reserved for explicitly local preferences, preserved pre-server room archives, Daily read cache, and unconfirmed legacy drafts.
5. Every visible icon is real inline SVG produced by the icon module. No empty pseudo-element, font glyph, base64 duplicate, or selector-dependent icon ownership is allowed.
6. A failed request is shown as a failed request. The app must not silently switch data owners or resurrect deleted data.
7. The rebuild contains one explicit local-storage migration and one versioned D1 schema migration. After the local migration succeeds, old keys are removed. There are no permanent fallback readers.
8. Experimental cleanroom copies, retired hosts, legacy script stacks, and unused assets are deleted when the replacement passes this contract.

## Runtime ownership

| Area | Owner | Responsibilities |
|---|---|---|
| Bootstrap and event dispatch | `public/app.js` | Build controllers, start once, route root events |
| DOM and SVG primitives | `public/core/dom.js`, `public/core/icons.js` | Escaping, element helpers, inline SVG |
| Local persistence | `public/core/storage.js` | Typed keys, schema migration, local-only data |
| App routes and panels | `public/core/router.js` | One active overlay/panel, back destination |
| Shell and sidebar | `public/features/shell.js` | Sidebar, theme, status counters, main-room navigation |
| Main chat | `public/features/chat.js` | Conversation CRUD, branches, generation, actions, D1 sync |
| Model box | `public/features/models.js` | Catalog, current model, synced model profile |
| Wolf Den and Serpent Desk | `public/features/settings.js` | Appearance, profile, export/import, notes, diagnostics |
| Radio and lighthouse rooms | `public/features/rooms.js` | Server-synced radio messages, API Myri participation, low-frequency lighthouse letters |
| Coast Daily UI | `public/features/daily.js`, `public/features/daily-client.js` | Existing Daily views, server requests, summary confirmation, one-time legacy-draft migration |
| Island letter and lovebook | `public/features/letters.js` | Per-main-window/per-model letter state and editing |
| Run control and API sandbox | `public/features/tools.js` | Request preferences, cleanup, fixed sandbox request |
| Auth and protected routing | `functions/auth.js`, `functions/_middleware.js` | Gate, cookie session, protected assets/API |
| Model API | `functions/models.js`, `functions/api-router.js` | Catalog, formal chat, sandbox |
| Main-chat API | `functions/chat-router.js`, `functions/chat-store.js`, `functions/chat-schema.js` | Conversations, histories, profile, title, versioned D1 migration |
| Daily persistence and API | `functions/daily-schema.js`, `functions/daily-store.js`, `functions/daily-api.js` | Non-destructive D1 schema, Daily records, authenticated REST routes, atomic summary commit |
| Daily summary and model tools | `functions/daily-summary.js`, `functions/daily-model-tools.js`, `functions/models.js` | Summary range/source assembly, strict JSON draft, real server-side tool calls for Moments and Album references |
| MCP identity and OAuth | `functions/coast-identity.js`, `functions/mcp-auth.js` | Non-forgeable surface signatures, Auth0 issuer/audience/expiry/subject/email/scope verification |
| MCP Streamable HTTP owner | `functions/mcp-router.js`, `functions/mcp-tools.js` | Native Pages JSON-RPC transport, versioned public discovery with the complete approved private tool catalog, no npm-install build dependency |
| Authored soil and room persistence | `functions/coast-schema.js`, `functions/official-soil-store.js`, `functions/radio-store.js`, `functions/lighthouse-store.js` | Append-only official soil, three-party radio, low-frequency lighthouse letters, provenance and idempotency |
| Server room API | `functions/coast-api.js`, `functions/radio-myri.js`, `functions/authorized-memory.js` | Same-origin web room routes, API Myri radio response, curated memory reads without raw chat |
| Friend mailbox entry and UI | `functions/auth.js`, `functions/mailbox-page.js`, `public/mailbox-entry.js`, `public/mailbox.js`, `public/styles/mailbox.css` | Gate entry, passphrase forms, isolated visitor chat shell, slow-delivery status, 思维壤, and 访客记事本 |
| Friend mailbox persistence and auth | `functions/mailbox-schema.js`, `functions/mailbox-auth.js`, `functions/mailbox-repository.js`, `functions/mailbox-service.js`, `functions/mailbox-api.js` | Hashed passphrases, signed visitor sessions, visitor-scoped messages/queue/notes, and sealed visitor REST routes |
| Mailbox owner status and MCP patrol | `functions/owner-mailbox-api.js`, `functions/friend-myrisol-prompt.js`, `functions/mcp-tools.js` | Content-free owner counts, manual official-MCP fetch/reply/report, and the friend-facing behavior boundary |

## UI and behavior acceptance contract

### Main shell

- Mobile layout matches the existing white ChatGPT-like shell: top bar, scrollable messages, fixed composer, slide-out sidebar.
- Top bar keeps menu, model picker, new-chat, and more actions.
- Composer keeps image, multiline text, microphone, send/stop, and call states.
- Light, dark, and black-gold themes remain available.
- User bubble and accent colors remain configurable.
- Assistant avatar remains replaceable from the message avatar and is synced through the chat profile.

### Sidebar

- Exactly one status block displays `同轨第 N 日`, `距 8.12 N 天`, and `距 8.13 N 天`.
- Exactly one main-room block contains `无线电波的两端`, `灯塔来信`, `轨迹 / 记忆`, and `海岸日报`.
- Exactly one local room-window block lists radio and lighthouse windows.
- Exactly one main-chat block lists D1 conversations.
- Every conversation row has one ellipsis menu with `改名` and `删除`.
- Rename and delete never create, reveal, or resurrect duplicate rows.
- The footer keeps theme, Wolf Den, and Serpent Desk entries.

### Main chat

- Create, open, rename, delete, and automatic first-turn title generation work against D1.
- Switching A → B → A preserves each conversation independently.
- User edit creates a user variant and an independent assistant branch.
- Deleting the active user variant deletes only its corresponding assistant branch and reindexes remaining branches.
- Regenerate adds an assistant variant to the active user branch.
- Deleting an assistant variant leaves sibling variants intact.
- Variant arrows show the correct `current/total` value.
- Copy writes the active assistant text to the clipboard.
- Like and favorite have visible active states and persist with the assistant variant.
- Visible action SVGs are: user `edit`, `trash`; assistant `copy`, `like`, `refresh`, `heart`, `trash`.
- A generation is bound to the conversation and turn where it started. Switching windows cannot move its result.
- Storage or generation failures are visible, concise, and do not append stale `history sync` diagnostics to message content.

### Wolf Den and Serpent Desk

- Wolf Den keeps profile, applications info, themes, bubble/accent choices, JSON/HTML export, JSON import, balance placeholder, model box, and current model.
- Serpent Desk keeps Myri portrait, bubble preference placeholder, notes, construction status, local diagnostics, system-prompt draft, run control, and API sandbox.
- Settings use one panel router and deterministic back destinations.

### Radio and lighthouse

- Radio is one D1-backed room shared by Xiaohan (`web_manual`), Coast API Myri (`coast_api`, `✦`), and official MCP Myri (`official_mcp`, `≋`).
- Radio messages render body plus structured author/model/usage/time metadata. Official MCP usage remains `null`; it is never fabricated.
- Xiaohan can send a web message and explicitly ask the homepage-selected API Myri to respond as `✦Myrisol`.
- Lighthouse is a D1-backed low-frequency letter shelf with subject, body, source metadata, and read state. It is not an instant model chat.
- Pre-server local room content remains present in the local export state but is not a canonical fallback reader.
- Memory remains an honest non-connected placeholder and performs no reads or writes.

### Friend mailbox

- The animated password gate exposes one quiet `海岸信箱` entry with `输入暗号` and `填记名册` flows.
- A visitor passphrase is never stored as plaintext. A server-keyed HMAC peppers the verifier before the Workers-compatible PBKDF2 derivation, a separate keyed lookup prevents duplicate registration, and a signed HttpOnly cookie owns the visitor session.
- The visitor page uses the Coast message/composer visual language but loads no main-chat, model, owner-tool, pocket, seed, or main-memory controller.
- Visitor messages are explicitly slow mail: sending shows delivery and `等待 Myri 巡灯`, never live typing or an API-generated reply.
- `思维壤` contains only explicit visitor-room整理 notes. `访客记事本` is a separate long-lived lightweight memory and shows only `visitor_visible` entries.
- The owner web surface can query visitor names, timestamps, counts, patrol time, and attention flags only. Its SQL never selects message, reply, thinking-note, or notebook content.
- Official Myri patrol is manual. MCP claims one batch, reads each visitor namespace independently, writes an exact batch-bound reply, and finishes with a count-only report. A new visitor message invalidates an older claimed batch so stale context cannot answer over it.

### Coast Daily

- Daily home opens from the sidebar and contains Summary, Moments, Diary, Album, Widgets, and Pets without redesigning the established entry layout.
- Moments, Diary, Album metadata, and committed summaries are read from and written to D1. Refresh and another device using the same Coast session see the same committed records.
- Moments keeps avatar/cover selection, compose, like, comment, and send-comment interactions. Main chat can create a Moment only through a real provider tool call executed on the server.
- Diary keeps date switching and manual author/weather/mood/text/image-reference composition. Ordinary chat has no diary tool; model-authored diary content is committed only from the Summary confirmation flow.
- Summary run reads the last committed summary boundary (or the current local-day start), gathers active main-chat and Daily records, and returns an editable draft. Run performs no writes; commit atomically writes the summary and selected Diary, Moment, and Album candidates.
- Album keeps categories, stable image references, captions, preview, and download. D1 never stores base64 image data; upload storage remains pending R2 or another durable file owner.
- Local storage is a clearly labelled read cache and one-time legacy-draft holding area, never a silent canonical fallback. Stable references and text migrate only after confirmation; local base64 images and range-less old summaries remain visible locally.
- Widgets and Pets remain explicit placeholders.

### Island letter and lovebook

- The more button opens the current main conversation's current-model letter.
- Island text can be copied, saved, reset, and promoted to lovebook.
- Lovebook keeps core/full text, copy/save, Xiaohan/model pen drafts, merge, and return-to-island actions.
- State is isolated by main conversation ID and model ID.

### Models, run control, and sandbox

- Model catalog comes from `/api/models`; chat/free/image groups, search, refresh, add/remove, and selection remain.
- At least one chat model remains selected.
- Run control keeps recent turns, context/token budgets, output length, scratchpad/seed placeholders, and temporary-context cleanup.
- Sandbox checks `/api/health` and sends its fixed non-private test through `/api/chat-sandbox`; it never writes chat history.

## API contract

- `/login`, `/logout`: password gate and signed 12-hour `__Host-coast_session` cookie.
- `/api/health`, `/api/session`: authenticated status.
- `/api/models`: filtered model catalog.
- `/api/chat`: formal model request.
- `/api/chat-sandbox`: fixed-purpose sandbox request.
- `/api/chat/conversations[/:id]`: list/create/rename/delete.
- `/api/chat/history?conversation_id=...`: read/replace one complete version-4 state.
- `/api/chat/profile`: read/replace synced avatar and model selection.
- `/api/chat/title`: one automatic title attempt for a default first-turn title.
- `/api/daily/moments[/:id]`: list/create/update internal Moments; nested comments and like endpoints persist interactions.
- `/api/daily/diaries[/:id]`: list/create/update Diary pages with explicit append-or-replace conflict handling.
- `/api/daily/albums`: list/create stable Album references.
- `/api/daily/summaries`: list committed summaries.
- `/api/daily/summary/range`: preview the server-resolved boundaries for `since_last_summary` and `today`.
- `/api/daily/summary/run`: generate a strict, editable summary draft without writing records; `range_mode` is either `since_last_summary` or `today`, the server resolves the click-time endpoint, and a first run starts at the earliest still-readable chat or Daily record.
- `/api/daily/summary/commit`: atomically commit the confirmed summary and selected candidates.
- `/api/radio/messages`: list or send messages in the shared radio room.
- `/api/radio/ask-api-myri`: ask the homepage-selected Coast API Myri to respond in radio.
- `/api/lighthouse/letters[/:id/read]`: list, write, and explicitly mark lighthouse letters read.
- `/api/mailbox/register`, `/api/mailbox/login`: create or enter one lightweight visitor identity and set the signed visitor cookie.
- `/api/mailbox/me`, `/api/mailbox/messages`, `/api/mailbox/send`, `/api/mailbox/status`: visitor-scoped profile, history, delivery, and slow-reply state.
- `/api/mailbox/thinking-notes`, `/api/mailbox/notebook`, `/api/mailbox/notebook/delete`: current visitor 思维壤 and visitor-visible notebook controls only.
- `/api/owner/mailbox/visitors`, `/api/owner/mailbox/summary`: owner-session status aggregates without sealed content.
- `/mcp`: public Streamable HTTP protocol and tool discovery; every tool call requires its declared Auth0 OAuth scope.
- `/mcp/health`, `/mcp/manifest`, `/.well-known/oauth-protected-resource`: public discovery only; none returns private Coast content.

All mutating web API methods require a same-origin `Origin` or `Referer`. MCP private reads and writes require a verified Auth0 access token and per-tool scope. Main-house routes and assets require a valid owner web session. `/mailbox` requires its independent visitor session; only the gate and the mailbox's code/style dependencies are public, and none contains Coast records.

## Local storage registry

Canonical keys after migration:

- `elementera.local.v1`: local preferences, preserved pre-server room archives, run-control settings, island-letter data, latest Daily read cache, and unconfirmed legacy Daily drafts.
- `elementera.currentConversation`: currently selected D1 conversation ID only.

The migration imports supported values from the existing keys, then deletes those old keys. Main-chat content is not imported from browser storage because D1 already owns it at this baseline. Existing Daily content moves once into an explicit legacy-draft area; it is never silently deleted or continuously read as live data.

## Removal list after parity

- `public/modules/legacy/`
- old Daily split globals and takeover router
- root `run-control-p301c.js`, `api-sandbox-p302c.js`, and `model-box-p303a.js`
- old chat and shell controllers replaced by the feature modules
- monolithic patch-stacked `public/styles.css` and extra `conversation.css`
- cleanroom copies, app-next/unfold copies, and retired module placeholder documents
- action SVG duplicates once inline SVG ownership is verified
- `_middleware.full.js`
- all per-request KV, normalized-table, and browser-history fallback readers; historical D1 tables are touched only by the numbered schema migration

## Verification gates

1. Static architecture test: one document and one script entry; no duplicate app document, legacy path, guard flag, observer, ownership timer, dynamic script injection, or missing SVG symbol.
2. State unit tests: user/assistant branch edit/delete/regenerate/reaction behavior.
3. D1 tests: chat isolation and profile rules; Daily schema; MCP/radio/lighthouse schema and provenance; mailbox visitor isolation and sealed owner aggregates; conflict handling; image-reference boundary; atomic summary commit; tool-call idempotency.
4. MCP tests: unauthenticated discovery, OAuth identity allowlists, issuer/audience/expiry/signature verification, per-tool scopes, official signatures, manual mailbox patrol/reply/report, and Streamable HTTP calls.
5. DOM interaction tests: sidebar uniqueness, menus, SVG presence, server radio/lighthouse rooms, panels, Daily server reads and summary confirmation, letter actions, model selection.
6. Service-worker test: every cached URL exists; API/MCP/OAuth discovery/login are never cached; cache version changes exactly once.
7. Mobile render checks at 360×800 and 412×915 in light/dark/gold themes.
8. Connector readback of every changed file and final branch diff before any main deployment.

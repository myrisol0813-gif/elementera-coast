# Elementera Coast application contract

Status: canonical Pages application contract
Rebuild origin: `main@e21505e7e58c90eb422cad29981e5ea5c59bfe6c`

This contract covers the Cloudflare Pages document, browser runtime, service worker, and root `functions/` API. The standalone Node MCP service under `elementera-mcp/` is a separate runtime with its own routes, data files, and tests; it is not loaded by or deployed as part of this Pages application.

## Non-negotiable construction rules

1. `index.html` is the only app document and loads one module entry: `public/app.js`. `/app.html` and `/gptlike` are URL aliases declared in `_redirects`, not duplicate documents.
2. Each feature has one controller and one state owner. A feature may call shared services, but it may not scan for or replace another feature's DOM.
3. Runtime ownership must not depend on global guard flags, delayed reclaims, `MutationObserver`, dynamic script injection, selector sweeps, duplicate DOM normalization, or compatibility loaders.
4. D1 is the only owner of main-chat conversations, histories, synced model profile, and committed Daily content. Local storage is reserved for explicitly local preferences, local-only rooms, Daily read cache, and unconfirmed legacy drafts.
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
| Radio and lighthouse rooms | `public/features/rooms.js` | Local room windows and local messages |
| Coast Daily UI | `public/features/daily.js`, `public/features/daily-client.js` | Existing Daily views, server requests, summary confirmation, one-time legacy-draft migration |
| Island letter and lovebook | `public/features/letters.js` | Per-main-window/per-model letter state and editing |
| Run control and API sandbox | `public/features/tools.js` | Request preferences, cleanup, fixed sandbox request |
| Auth and protected routing | `functions/auth.js`, `functions/_middleware.js` | Gate, cookie session, protected assets/API |
| Model API | `functions/models.js`, `functions/api-router.js` | Catalog, formal chat, sandbox |
| Main-chat API | `functions/chat-router.js`, `functions/chat-store.js`, `functions/chat-schema.js` | Conversations, histories, profile, title, versioned D1 migration |
| Daily persistence and API | `functions/daily-schema.js`, `functions/daily-store.js`, `functions/daily-api.js` | Non-destructive D1 schema, Daily records, authenticated REST routes, atomic summary commit |
| Daily summary and model tools | `functions/daily-summary.js`, `functions/daily-model-tools.js`, `functions/models.js` | Summary range/source assembly, strict JSON draft, real server-side tool calls for Moments and Album references |

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

### Local rooms

- Radio and lighthouse each keep a default window, window creation, switching, and local message sending.
- Memory remains an honest non-connected placeholder and performs no reads or writes.

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
- `/api/daily/summary/run`: generate a strict, editable summary draft without writing records.
- `/api/daily/summary/commit`: atomically commit the confirmed summary and selected candidates.

All mutating API methods require a same-origin `Origin` or `Referer`. All app routes and assets require a valid session.

## Local storage registry

Canonical keys after migration:

- `elementera.local.v1`: local preferences, room data, run-control settings, letter data, latest Daily read cache, and unconfirmed legacy Daily drafts.
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
3. D1 tests: chat isolation and profile rules; Daily schema, provenance, conflict handling, image-reference boundary, atomic summary commit, and tool-call idempotency.
4. DOM interaction tests: sidebar uniqueness, menus, SVG presence, local rooms, panels, Daily server reads and summary confirmation, letter actions, model selection.
5. Service-worker test: every cached URL exists; API/login are never cached; cache version changes exactly once.
6. Mobile render checks at 360×800 and 412×915 in light/dark/gold themes.
7. Connector readback of every changed file and final branch diff before any main deployment.

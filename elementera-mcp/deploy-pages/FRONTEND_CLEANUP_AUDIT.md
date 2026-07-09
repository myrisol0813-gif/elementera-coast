# P3-CLEAN-AUDIT-00 front-end repo usefulness audit

Status: audit map only. No production entry switch. No deletion. No JS/CSS/service-worker/functions edits.

Connector limitation note:
- No repo shell / Codespaces workspace was available during this audit.
- A local temporary clone was attempted outside the repo workspace, but the container could not resolve `github.com`; therefore no `grep`, `node --check`, or `git diff` result is claimed here.
- Audit method: GitHub connector direct file reads for known deployed frontend surface, entry files, canonical daily modules, canary app-next modules, public runtime layers, root functions, manifest, redirects, and service worker.

## 1. Current formal entry chain

### `index.html`

Current role: formal/root shell candidate.

Loads:
- `/manifest.json`
- `/public/styles.css`
- `/public/app.js`
- `/public/run-control-p301c.js`
- `/public/api-sandbox-p302c.js?v=p302d2`
- `/public/model-box-p303a.js?v=p303a-fix1`

It does not load `public/modules/daily/*` directly.

Classification: keep / formal entry, but inconsistent with `app.html` because it does not preload daily canonical modules.

### `app.html`

Current role: formal app shell candidate / explicit app page.

Loads:
- `/manifest.json`
- `/public/styles.css`
- `/public/modules/daily/daily-shell.js?v=p3-struct-13a`
- `/public/modules/daily/daily-draft-state.js?v=p3-struct-13a`
- `/public/modules/daily/daily-assets.js?v=p3-struct-13a`
- `/public/modules/daily/moments.js?v=p3-struct-13a`
- `/public/modules/daily/diary.js?v=p3-struct-13a`
- `/public/modules/daily/album.js?v=p3-struct-13a`
- `/public/modules/daily/daily-router.js?v=p3-struct-13a`
- `/public/app.js?v=p3-struct-13a`
- `/public/run-control-p301c.js`
- `/public/api-sandbox-p302c.js?v=p302d2`
- `/public/model-box-p303a.js?v=p303a-fix1`

Classification: keep / formal entry, but still depends on old `public/app.js` and temporary daily-router takeover.

### `app-next.html`

Current role: canary only.

Loads the same shell/CSS plus daily canonical modules with `v=p3-struct-14`, then `type=module` `/public/app-next/bootstrap.js?v=p3-struct-14`, then the three public runtime layers.

Classification: canary / experimental. Do not switch production to this yet. Do not delete yet because it is the current app.js externalization canary.

### `_redirects`

Current role: routing file, probably for Pages-style hosting. It maps:
- `/gptlike` -> `/index.html`
- `/app.html` -> `/index.html`
- `/classic` -> `/index.html`
- `/classic-chat-shell` -> `/index.html`

Classification: active legacy / pending decision.

Risk note:
- If this file is active in the deploy environment, `/app.html` may be routed to `index.html`, which means the explicit `app.html` daily preload chain may not actually be reached via that route.
- If this file is ignored by the deploy target, then `app.html` is a real separate page.
- Do not delete before confirming deployed routing behavior.

### `service-worker.js`

Current role: protected runtime cache layer.

Caches:
- `/`, `/index.html`, `/app.html`, `/gptlike`, `/manifest.json`, `/service-worker.js`
- `/public/app.js`, `/public/styles.css`
- `/public/run-control-p301c.js`, `/public/api-sandbox-p302c.js`, `/public/model-box-p303a.js`
- action icons and shell icons

Classification: red-line protected / active legacy.

Risk note:
- It does not cache `app-next.html` or `public/app-next/*`.
- It does not cache `public/modules/daily/*`.
- This is important for later cutover; do not edit in this audit.

## 2. File classification table

| Path | Classification | Why |
| --- | --- | --- |
| `index.html` | keep / formal entry | Root/PWA shell currently loads old app.js and public runtime layers. |
| `app.html` | keep / formal entry | Explicit app page loads daily canonical modules then old app.js and runtime layers. |
| `app-next.html` | canary / experimental | App-next shadow canary only; not formal route. |
| `_redirects` | active legacy / pending decision | May shadow `/app.html` to `/index.html`; must verify deploy routing before removal. |
| `manifest.json` | keep | Referenced by entry pages; PWA start_url points to `/gptlike?source=pwa`. |
| `service-worker.js` | red-line protected | Active cache layer; edits can create stale frontend behavior. |
| `public/styles.css` | red-line protected / keep | Shared stylesheet for formal and canary shells. |
| `public/app.js` | compat / active legacy / red-line protected | Formal runtime still loads it. Contains main chat, Wolf/Desk, v094-v119 patches, daily old cluster, v119. Do not delete yet. |
| `public/run-control-p301c.js` | compat / active runtime layer | Formal pages load it; provides local run-control settings and panel injection. |
| `public/api-sandbox-p302c.js` | compat / active runtime layer | Formal pages load it; provides API sandbox panel and calls `/api/health` and `/__coast_free_chat`. |
| `public/model-box-p303a.js` | active runtime layer / partial canonical API adapter | Formal pages load it; owns model catalog panel and `/api/chat` adapter. Also duplicates chat render/action logic. |
| `public/modules/daily/daily-shell.js` | canonical module | Current daily shell/panel source. |
| `public/modules/daily/moments.js` | canonical module | Current silicon-carbon/moments UI source. |
| `public/modules/daily/diary.js` | canonical module | Current diary UI source. |
| `public/modules/daily/album.js` | canonical module | Current album UI source. |
| `public/modules/daily/daily-router.js` | canonical module with temporary takeover | Current daily router source, but still has capture blocking because old app.js daily cluster remains. |
| `public/modules/daily/daily-draft-state.js` | pending canonical / staged helper | Loaded by `app.html` and `app-next.html`; marked internally as not runtime wired. |
| `public/modules/daily/daily-assets.js` | pending canonical / staged helper | Loaded by `app.html` and `app-next.html`; marked internally as not runtime wired. |
| `public/app-next/bootstrap.js` | canary clean module | Canary entry only. |
| `public/app-next/app-env.js` | canary clean module | Shared canary helper/constants only. |
| `public/app-next/app-router.js` | canary clean module | Canary boot orchestration only. |
| `public/app-next/app-events.js` | canary clean helper with sharp tool | Contains `stopHard`; canary only. |
| `public/app-next/app-panel.js` | canary mostly clean helper | Shared canary panel shell. |
| `public/app-next/daily-entry.js` | canary temporary bridge | Script-injection fallback for daily canonical modules. |
| `public/app-next/main-chat-compat.js` | canary compat / unfolded box | Externalized main chat + Wolf/Desk compatibility. |
| `public/app-next/v097-compat.js` | canary compat / unfolded box | Externalized v094-v098 compatibility knot. |
| `public/app-next/v119-compat.js` | canary compat / protected semantic module | Externalized island/lovebook behavior. |
| `public/app-next/APP_NEXT_MAP.md` | docs keep | Canary cleanup map from P3-STRUCT-14A. |
| `functions/_middleware.js` | red-line protected | Auth gate, `/api/health`, `/api/session`, `/api/models`, `/api/chat`, `/api/chat-sandbox`. |
| `functions/__coast_free_chat.js` | red-line protected / maybe legacy endpoint | Fixed no-privacy free endpoint used by API sandbox. |
| `public/icons/*` | keep | Referenced by service worker and shell icon CSS/cache. |

## 3. Redundancy and patch surface

### fallback

- `public/app.js`: starter compatibility wrapper, legacy starter filtering, daily old cluster fallback, room fallback data.
- `public/modules/daily/daily-router.js`: module loader fallback, diagnostic panel fallback, temporary takeover fallback.
- `public/modules/daily/daily-shell.js`: child diagnostic fallback for widgets/pet or missing modules.
- `public/app-next/daily-entry.js`: canary script-injection fallback.
- `public/app-next/main-chat-compat.js`: local stream placeholder fallback.
- `public/app-next/v097-compat.js`: default room/main-window fallback data and placeholder panels.
- `public/app-next/v119-compat.js`: default island/lovebook text and old v118 island-key migration fallback.
- `public/model-box-p303a.js`: model catalog cache/default fallback and chat error fallback.
- `public/api-sandbox-p302c.js`: fixed free model fallback.

### overlay

- `public/app.js`: Wolf/Desk panels, v095/v096/v097 room panels, v119 island panel, daily panel.
- `public/modules/daily/daily-shell.js`: `freshDailyPanelV101` daily overlay.
- `public/modules/daily/daily-router.js`: fallback panel / toast overlays.
- `public/run-control-p301c.js`: `runControlPanelP301C` overlay.
- `public/api-sandbox-p302c.js`: `apiSandboxPanelP302C` overlay.
- `public/model-box-p303a.js`: `modelBoxPanelP303A` overlay.
- `public/app-next/*compat.js`: multiple canary overlays.

### hard stop / stopImmediatePropagation

- `public/app.js`: old v094/v097/v119 capture patches include hard stops.
- `public/modules/daily/daily-router.js`: capture event block uses `stopImmediatePropagation` as temporary takeover.
- `public/model-box-p303a.js`: composer submit adapter uses `stopImmediatePropagation` to override old local send.
- `public/app-next/app-events.js`: exposes `stopHard`.
- `public/app-next/v097-compat.js` and `public/app-next/v119-compat.js`: consume `stopHard`.

### prototype patch

- `public/app.js`: v094 safe text setter patch exists in old runtime.
- `public/app-next/v097-compat.js`: carries the same `Node.prototype.textContent` patch externally.

### duplicate render / controller / storage

- Main chat render/storage appears in old `public/app.js`, `public/app-next/main-chat-compat.js`, and again in `public/model-box-p303a.js` for the formal `/api/chat` adapter.
- Daily render/controller appears in old `public/app.js` v106 cluster and in canonical `public/modules/daily/*`.
- Room/sidebar render/controller appears in old `public/app.js`, canary `v097-compat.js`, and partially in daily-router capture wiring.
- Model display/storage appears in old app.js / app-next main-chat compat and in model-box.
- Run-control and model-box both inject into Wolf/Desk panels by MutationObserver.

### mock / placeholder / coming soon / local only / fake defaults

- `public/app.js`: local-only main chat fallback, room placeholders, daily old cluster placeholders.
- `public/modules/daily/moments.js`, `diary.js`, `album.js`: intentionally local draft prototypes, not server sync.
- `public/modules/daily/daily-shell.js`: widgets/pet child diagnostic fallback.
- `public/api-sandbox-p302c.js`: sandbox fixed no-privacy prompt.
- `public/run-control-p301c.js`: scratchpad/seed/memory recall settings are saved but not wired to real memory.
- `public/model-box-p303a.js`: image model slot is saved only; refresh/regenerate partial placeholder remains.

### old route / old page / old entry

- `_redirects`: `/classic` and `/classic-chat-shell` are old route aliases pending deletion decision.
- `index.html` vs `app.html`: two formal-looking shells diverge; one lacks daily canonical preload.
- `app-next.html`: canary entry only.
- `public/app.js`: old monolith, still active formal runtime.

## 4. Suggested first deletion batch

No file deletion is recommended in this audit commit.

Reason:
- There is no repo shell, no real tree listing, and no reliable grep result.
- The known files are either actively loaded, canary-owned, canonical daily modules, protected backend/runtime, or pending routing decision.
- Deleting without deploy-route confirmation could remove an active page or cache target.

Deletion candidates for a later shell-backed pass:

### `_redirects` old route lines, not the file yet

- Path: `elementera-mcp/deploy-pages/_redirects`
- Candidate lines: `/classic`, `/classic-chat-shell`
- Why maybe unused: old aliases to `index.html`.
- Reference status: unknown without route/deploy analytics or full grep.
- Deletion risk: low-to-medium. Could break old bookmarks.
- Rollback: restore lines from Git history.

### `app-next.html` and `public/app-next/*`

- Status: not deletion candidates now.
- Why not delete: they are current canary/externalization audit assets.
- Future decision: delete only after production fully switches to clean modular entry or after deciding to abandon canary route.

### `daily-draft-state.js` and `daily-assets.js`

- Status: not deletion candidates now.
- Why not delete: they are loaded by `app.html` and `app-next.html`, even though marked not runtime wired.
- Future decision: either wire into daily canonical runtime or remove from HTML after confirming no import/runtime dependency.

## 5. Suggested first refactor batch

Do not start by locally cleaning `v097-compat.js` alone. First resolve formal entry and active source of truth.

Priority 1: entry-chain convergence audit.
- Decide whether `index.html` or `app.html` is the real formal shell.
- Resolve `_redirects` behavior for `/app.html`.
- Make daily canonical preload behavior consistent across the formal entry that is actually served.
- Do not switch to `app-next.html` yet.

Priority 2: main chat source-of-truth split.
- `public/app.js` still owns local main chat render/storage.
- `public/model-box-p303a.js` owns formal `/api/chat` send adapter and duplicates main chat render/actions.
- `public/app-next/main-chat-compat.js` owns canary copy.
- Next clean target should identify one future canonical main-chat state/view/composer/API adapter path.

Priority 3: daily old cluster purge planning.
- Canonical daily source is already `public/modules/daily/*`.
- `public/app.js` still contains v106 daily cluster.
- `public/modules/daily/daily-router.js` still has temporary capture takeover because old app.js handler exists.
- The purge should wait for shell-backed grep/node-check or a safer staged replacement plan.

Priority 4: public runtime layers.
- `run-control-p301c.js`, `api-sandbox-p302c.js`, `model-box-p303a.js` are active because entries load them.
- They are not final architecture: each injects panels/styles/controllers by global capture/MutationObserver.
- Later split into canonical modules only after formal entry/source-of-truth is resolved.

Priority 5: canary map.
- Keep `app-next` as canary until it has served its purpose.
- Do not expand it.
- Do not clean one compat file in isolation until entry-chain and full repo usefulness audit decisions are accepted.

## 6. Hard no-change confirmations for this audit

- No formal entry switched.
- Old `public/app.js` not deleted.
- v119 / island letter / lovebook core text not changed.
- No key / secret / env touched.
- No new localStorage key added.
- No localStorage clear/remove operation added.
- No functions edited.
- No service worker edited.
- No CSS edited.

## 7. Next recommended task

P3-CLEAN-AUDIT-01 should be shell-backed if possible:

- `find elementera-mcp/deploy-pages -maxdepth 4 -type f | sort`
- `grep -R "app-next\|modules/daily\|model-box\|run-control\|api-sandbox\|classic-chat-shell\|moments-clean\|localStorage\.removeItem\|stopImmediatePropagation\|Node\.prototype" elementera-mcp/deploy-pages functions -n`
- `node --check` for all active JS files
- `git status --short`

If shell remains unavailable, use connector-only path again, but do not delete files without a complete tree listing.

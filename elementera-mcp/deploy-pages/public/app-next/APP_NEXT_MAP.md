# P3-STRUCT-14A app-next cleanup map

Status: app.js externalized canary map only. This is not a production entry switch and not a claim that cleanup is complete.

## Hard boundaries for this map

- Do not switch `app.html` to `app-next` yet.
- Do not delete `public/app.js` yet.
- Do not expand the shadow app with new product behavior.
- Do not add routes, storage keys, API behavior, CSS, service worker, functions, env, key, or secret changes.
- Do not rewrite v119 island/lovebook core text or semantics.
- Do not rewrite the real main-chat API path.

## Entry state

- Canary page: `elementera-mcp/deploy-pages/app-next.html`.
- Canary JS entry: `public/app-next/bootstrap.js`.
- Production page remains `elementera-mcp/deploy-pages/app.html`.
- Production page still loads old `/public/app.js?v=p3-struct-13a`.
- The canary page loads canonical daily modules and then the `app-next` module tree.

## File responsibility map

### `bootstrap.js`

Type: clean module.

Responsibility:
- Tiny entry only.
- Imports `bootShadowApp` from `app-router.js`.
- Calls `bootShadowApp(globalThis)`.

Cleanup note:
- Should stay tiny.
- No feature logic should be added here.

### `app-env.js`

Type: clean module.

Responsibility:
- Shared constants and helpers.
- Central list of existing storage keys used by app-next.
- DOM helpers: `$`, `$$`.
- Escaping helpers.
- Message paragraph formatting helper.
- JSON load/save wrappers.
- Date helpers for coast-day and anniversary counters.
- Sidebar show/hide helpers.
- Service worker registration helper, copied as a wrapper around existing behavior.

Cleanup note:
- This should remain the only place for shared constants/helpers.
- It currently centralizes existing keys; it must not become a place to mint new localStorage keys casually.

### `app-router.js`

Type: clean module.

Responsibility:
- Shadow app orchestrator.
- Guards one-time boot with `__p3Struct14ShadowAppBooted`.
- Publishes a small `__p3Struct14ShadowApp` descriptor.
- Calls daily canonical loader, main chat compat, v097 compat, and v119 compat.

Cleanup note:
- Good future target for reducing compat mounts one by one.
- When a compat file is deleted or replaced by a clean controller, this file should be the only boot list that changes.

### `app-events.js`

Type: clean module, but contains one sharp tool.

Responsibility:
- Event delegation helper.
- `onceFlag` one-shot boot guard.
- `stopHard`, which wraps `preventDefault`, `stopPropagation`, and `stopImmediatePropagation`.

Cleanup note:
- `stopHard` is necessary while compat layers compete with old-style delegated handlers.
- Long-term target: remove or reduce `stopHard` call sites as controllers become canonical and non-overlapping.

### `app-panel.js`

Type: mostly clean module.

Responsibility:
- Shared panel shell creation.
- Known panel close helper.
- Main-chat local notice helper.

Cleanup note:
- `openPanel` is clean and should become the preferred shared panel shell.
- `localNotice` is still main-chat-specific and can later move into a clean main-chat UI module.

### `daily-entry.js`

Type: clean bridge / temporary loader.

Responsibility:
- Ensures canonical daily modules are present.
- Loads these existing canonical scripts if missing:
  - `daily-shell.js`
  - `daily-draft-state.js`
  - `daily-assets.js`
  - `moments.js`
  - `diary.js`
  - `album.js`
  - `daily-router.js`
- Does not own daily behavior itself.

Compat surface:
- Contains a fallback console warning if canonical daily loading fails.
- Has a script-injection path as a safety bridge.

Cleanup note:
- Daily canonical source is already `public/modules/daily/`.
- Long-term, `daily-entry.js` should become either a tiny import/loader shim or disappear once the HTML entry ordering is final and reliable.

### `main-chat-compat.js`

Type: compat copy / unfolded box.

Responsibility:
- Main-chat local message state and render.
- Composer auto-height and send/stop button state.
- Local placeholder stream notice.
- Sidebar open/close wiring.
- Wolf Den / Serpent Desk local panels.
- Export JSON / export HTML / import JSON.
- Avatar picker.
- Model picker display.
- Theme / user bubble / accent display settings.
- Assistant/user action buttons.
- Service worker registration via helper.

Known compat / cleanup surface:
- fallback: yes. `stream()` intentionally falls back to local notice instead of real API generation.
- stub: yes. balance, model management, Myri bubble, system prompt draft, app connection descriptions, image/mic click no-op, refresh notice.
- overlay: yes. Creates panels over current shell, mutates sidebar footer, mounts model picker popover.
- stopImmediatePropagation: no direct call in this file.
- global patch: no prototype patch, but it installs a document-level capture click controller.
- repeated controller: yes. Handles sidebar, model picker, panels, message actions, and composer in one file.
- repeated render: yes. Owns main message render and multiple panel render helpers.
- repeated storage operation: yes. Reads/writes message, theme, avatar, model, bubble, accent, local profile, note, portrait, and system draft keys.
- second logic kept to avoid breakage: yes. Local stream placeholder, legacy starter filtering, import/export, Wolf/Desk panel shell, and model picker are preserved compat behaviors.

Canonical candidates:
- Main message storage/render should eventually move to a clean `main-chat-state` + `main-chat-view` split.
- Wolf Den / Serpent Desk should become a clean account/panel module or be removed if superseded.
- Settings storage should be separated from panel rendering.
- Service worker registration belongs in entry/platform, not main-chat compat.

### `v097-compat.js`

Type: compat copy / unfolded box. This is currently the fattest cleanup target.

Responsibility:
- v094 detail back patch.
- Wolf Apps text mutation fix.
- Node.prototype `textContent` safe setter global patch.
- v095 sidebar room base.
- v096 radio/lighthouse local room windows.
- v097 sidebar polish and main-chat window list.
- v098 final sidebar order / hide legacy saved section.
- Memory/daily placeholder panels.

Known compat / cleanup surface:
- fallback: yes. Default room data and placeholder panels are created when storage/data is missing.
- stub: yes. memory and daily fallback panels are placeholder content; daily fallback duplicates canonical daily entry concept.
- overlay: yes. Creates `coastRoomPanelV095`, `coastRoomPanelV096`, `coastRoomPanelV097`, and `coastChatRoomV096` overlays.
- stopImmediatePropagation: yes, via `stopHard` in back patch, new chat, memory, and daily capture paths.
- global patch: yes. It patches `Node.prototype.textContent`.
- repeated controller: yes. v095, v096, v097, v098 controllers are combined in one file.
- repeated render: yes. Renders status, room buttons, radio/lighthouse chat, memory, daily fallback, main chat windows, and sidebar order.
- repeated storage operation: yes. Radio rooms, lighthouse rooms, main windows, active main window, and main messages are all read/written here.
- second logic kept to avoid breakage: yes. v095/v096/v097 daily placeholders and multiple sidebar/order loops remain to avoid breaking the old UI sequence.

Canonical candidates:
- Daily behavior should remain in `public/modules/daily/` and `daily-router.js`, not in v097 compat fallback panels.
- Main-chat windows should be separated into a clean `main-windows` controller.
- Radio/lighthouse local room storage should become a clean room module if retained.
- The global textContent patch should be removed once the old mutation loop risk is gone.
- Sidebar ordering should become one deterministic mount pass, not interval-based polish.

### `v119-compat.js`

Type: compat copy / protected semantic module.

Responsibility:
- More button opens island letter or lovebook based on per-window/model state.
- Builds per-window/per-model storage namespace.
- Stores and renders island letter, lovebook core/full text, and xiaohan/model pen drafts.
- Copy, save, reset, promote, back-to-island, pen, merge actions.

Known compat / cleanup surface:
- fallback: yes. Default island/core/lovebook text is generated if no stored value exists; old v118 island key is read as fallback.
- stub: mild. Model pen copy says future tool connection may allow model-side edits; current behavior remains local UI only.
- overlay: yes. Creates `islandLetterPanelV118` overlay and toast.
- stopImmediatePropagation: yes, via `stopHard` for More button and island actions.
- global patch: no prototype/global API patch; it does register a document-level capture click controller.
- repeated controller: yes, but bounded to v119 island/lovebook domain.
- repeated render: yes. Renders island, lovebook, pen, toast.
- repeated storage operation: yes. Per-window/model state, island text, core text, full text, and pen drafts.
- second logic kept to avoid breakage: yes. v118 old island-key fallback is preserved for migration safety.

Canonical candidates:
- v119 core text/semantics should not be rewritten in cleanup.
- Only shell/render/controller split should be considered later.
- Old v118 migration fallback can be removed only after explicit migration decision.

## Redundancy and canonical-source map

Already canonical or should be canonical elsewhere:

- Daily shell/router/moments/diary/album: canonical source is `public/modules/daily/`.
- Daily placeholder panels inside `v097-compat.js`: should not remain long-term.
- Panel shell creation: canonical helper should be `app-panel.js`.
- Generic DOM/storage/date helpers: canonical helper should be `app-env.js`.
- Event hard-stop helper: currently centralized in `app-events.js`, but call sites should shrink.
- Main-chat local render/storage: not canonical yet; needs clean split.
- Main-chat windows: not canonical yet; should split out of `v097-compat.js`.
- Radio/lighthouse local room windows: not canonical yet; should either become clean room module or be cut if obsolete.
- v119 text semantics: protected source remains current v119 behavior; do not rewrite content in cleanup.

## Cleanup priority

Priority 1: `v097-compat.js`.

Reason:
- It is the largest compatibility knot.
- It contains global patching, capture-layer hard stops, repeated controllers, repeated renderers, interval-based sidebar polishing, and daily fallback panels that overlap with canonical daily modules.
- First cleanup should remove daily placeholders from this file once canonical daily router is confirmed on canary.
- Second cleanup should split main-chat windows into a dedicated module.

Priority 2: `main-chat-compat.js`.

Reason:
- It owns too many unrelated duties: chat render, composer, sidebar footer mutation, Wolf/Desk panels, settings, avatar, import/export, and service worker registration.
- Good next split: `main-chat-state.js`, `main-chat-view.js`, `main-chat-composer.js`, and `wolf-desk-compat.js` or equivalent.

Priority 3: `daily-entry.js`.

Reason:
- It is small, but still a temporary loader bridge.
- Once canary script ordering is stable, reduce it or remove script injection.

Do not prioritize `v119-compat.js` for semantic cleanup yet.

Reason:
- v119 is protected semantic content.
- Cleanup should only split shell/controller later, without rewriting island/lovebook core text.

## Storage notes

This map commit adds no localStorage key.

Current app-next code already references existing keys centralized in `app-env.js`, plus inherited legacy local keys inside `main-chat-compat.js` and v119 dynamic per-window/model keys.

No `localStorage.clear()` should exist in app-next.

Known inherited `removeItem` usage:
- `main-chat-compat.js` uses `localStorage.removeItem(STORAGE_KEYS.userBubble)` for the existing bubble-default behavior. This is inherited compat behavior, not newly added by this map commit.

## API / env / secret notes

- No real main-chat API rewrite in this map.
- No key/env/secret changes.
- No functions changes.
- No service worker file changes.
- No CSS changes.
- v119 island/lovebook core semantic text is not changed by this map.

## Suggested next knife

P3-STRUCT-15 should not switch production yet.

Suggested focus:
1. Verify app-next canary manually on mobile path.
2. In code, reduce `v097-compat.js` first:
   - remove or disable daily fallback panels after canonical daily-router is verified;
   - replace interval/sidebar ordering with deterministic mount where possible;
   - isolate main-chat windows into a dedicated module.
3. Then split `main-chat-compat.js` into state/view/composer/settings/panel pieces.

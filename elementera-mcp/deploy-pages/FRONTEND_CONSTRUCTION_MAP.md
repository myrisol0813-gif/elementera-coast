# Elementera Coast frontend construction map

Status: P3-MAINTAINABLE-00

This document replaces the cleanroom-first plan for now. The goal is not to fully rewrite the frontend in one pass. The goal is to make the current frontend maintainable by construction blocks, so future work can start from the correct file instead of digging through the whole legacy `public/app.js`.

## Current route policy

- Formal production entry: `elementera-mcp/deploy-pages/index.html`.
- Mirror / alias entry: `elementera-mcp/deploy-pages/app.html`.
- Experimental areas: `app-next` and cleanroom are not the active construction path for this phase.
- Do not switch production to app-next in this phase.
- Do not continue P3-CLEANROOM work in this phase.

## Production script order

`index.html` currently loads:

1. `/public/styles.css`
2. `/public/modules/daily/daily-shell.js`
3. `/public/modules/daily/daily-draft-state.js`
4. `/public/modules/daily/daily-assets.js`
5. `/public/modules/daily/moments.js`
6. `/public/modules/daily/diary.js`
7. `/public/modules/daily/album.js`
8. `/public/modules/daily/daily-router.js`
9. `/public/app.js`
10. `/public/run-control-p301c.js`
11. `/public/api-sandbox-p302c.js`
12. `/public/model-box-p303a.js`

`public/app.js` is still loaded and remains the legacy host. New product logic must not be added there.

## Construction block directories

- `public/modules/core/`: app bootstrap, shared runtime contracts, lifecycle notes.
- `public/modules/sidebar/`: sidebar open/close, history, footer rows, route buttons.
- `public/modules/chat/`: main thread rendering, composer, message actions.
- `public/modules/daily/`: Coast Daily, Moments, Diary, Album, widgets, pet placeholders.
- `public/modules/model-box/`: model catalog, model picker, model-backed send orchestration.
- `public/modules/wolf-den/`: Wolf Den settings, profile, appearance, export/import, account panels.
- `public/modules/serpent-desk/`: Serpent Desk workspace, Myri notes, diagnostics, system draft.
- `public/modules/letters/`: 予爱机书, 登岛信, letter drafts and letter-specific rendering.
- `public/modules/storage/`: storage key registry and migrations.
- `public/modules/ui/`: shared visual primitives and CSS ownership notes.

## Global rules

1. Do not add new product logic to `public/app.js`.
2. `public/app.js` is legacy host: allowed direction is shrink / extract / remove only.
3. Do not add new HTML bridge / fallback / overlay patches unless production is broken and the patch includes a clear removal condition.
4. Fixes should land in the owning module block first.
5. `index.html` should remain the formal entry. Do not make it a feature dumping ground.
6. Storage keys must be documented in `public/modules/storage/README.md` before new persistence is added.
7. API secrets, keys, `.env`, `.envv`, and Cloudflare env values do not belong in frontend modules.

## Feature ownership table

| Feature | Current files / owner | Future construction block | Still depends on `public/app.js`? | First file to inspect when fixing | Notes |
|---|---|---|---:|---|---|
| 登录门 / 入口 | Cloudflare / deployment layer; `index.html`; `app.html`; `_redirects`; `_routes.json`; `_headers` | `public/modules/core/` plus deployment docs | Partly | `index.html`, `_redirects`, `_routes.json`, `_headers`, Cloudflare dashboard if Unauthorized appears | `Unauthorized` seen on formal domain is likely outside app shell or from Functions/Access layer. Do not solve by adding app.js patches. |
| 侧边栏 | DOM in `index.html`; open/close/footer mutation in `public/app.js` | `public/modules/sidebar/` | Yes | `public/app.js`, then `public/modules/sidebar/README.md` | Future extraction should move footer rows and route binding out of app.js. |
| 主聊天 | DOM in `index.html`; message render/storage/composer in `public/app.js`; model send in `public/model-box-p303a.js` | `public/modules/chat/` | Yes | `public/app.js`; `public/model-box-p303a.js` for real model send | Split renderer, composer controller, and message actions before deleting app.js branches. |
| 输入框 | DOM in `index.html`; sizing and send/call state in `public/app.js`; model-box intercepts submit/send | `public/modules/chat/` | Yes | `public/app.js`, `public/model-box-p303a.js` | Do not add input hacks in `index.html`. |
| 模型箱 | `public/model-box-p303a.js`; root-level active module | `public/modules/model-box/` | Uses chat storage shared with app.js | `public/model-box-p303a.js` | Next step should move active file under `modules/model-box/` or leave root as compatibility loader only. |
| Wolf Den | Generated in `public/app.js` (`cleanWolfV093`, `wolfRowV093`, etc.) | `public/modules/wolf-den/` | Yes | `public/app.js` | Extract one panel/action at a time. |
| Serpent Desk | Generated in `public/app.js` (`cleanDeskV093`, `cleanDetailV093`, `serpentDeskRowV093`) | `public/modules/serpent-desk/` | Yes | `public/app.js` | Extract one panel/action at a time. |
| 海岸日报首页 | `public/modules/daily/daily-router.js`; `daily-shell.js`; legacy collision noted in app.js | `public/modules/daily/` | Partly | `public/modules/daily/daily-router.js`, then `daily-shell.js` | Daily entry belongs to daily-router / daily-shell, not `index.html`. |
| 硅碳圈 / 朋友圈 | `public/modules/daily/moments.js`; routed by `daily-router.js` | `public/modules/daily/` | Partly | `public/modules/daily/moments.js`, then `daily-router.js` | Do not route via HTML bridge. |
| 日记 | `public/modules/daily/diary.js`; routed by `daily-router.js` | `public/modules/daily/` | Partly | `public/modules/daily/diary.js`, then `daily-router.js` | Date selection and compose actions belong here. |
| 相册 | `public/modules/daily/album.js`; routed by `daily-router.js`; assets in `daily-assets.js` | `public/modules/daily/` | Partly | `public/modules/daily/album.js`, then `daily-assets.js`, then `daily-router.js` | Album download/upload fixes belong here. |
| 予爱机书 | Active owner not confirmed in this pass | `public/modules/letters/` | Unknown | Search for letter copy / v119 markers before editing | Do not place in Daily or app.js. |
| 登岛信 | Active owner not confirmed in this pass | `public/modules/letters/` | Unknown | Search for island / letter copy before editing | Do not place in Daily or app.js. |
| 小组件 | Placeholder from Daily home / child route | `public/modules/daily/` or future `public/modules/ui/` if purely visual | Partly | `daily-shell.js`, `daily-router.js` | Until real feature exists, keep as Daily child placeholder. |
| 宠物系统 | Placeholder from Daily home / child route | `public/modules/daily/` | Partly | `daily-shell.js`, `daily-router.js` | Do not add pet logic to app.js. |
| service worker | `service-worker.js` | `public/modules/core/` docs only; actual SW stays root for browser scope | No direct app.js dependency | `service-worker.js` | Keep root location. Changes must explain cache/fallback impact. |
| storage keys | `public/app.js`; `public/model-box-p303a.js`; Daily local state in modules | `public/modules/storage/` | Yes | `public/modules/storage/README.md`, then the writer file | Add no new key without registry update. |
| API / functions | `/api/*` behind Cloudflare Pages Functions or deployment layer; model-box calls `/api/models` | Backend/functions area, not frontend modules | No | `public/model-box-p303a.js` for callers; Cloudflare/Functions source for implementation | Frontend must not contain secrets or env values. |

## Legacy files: can shrink, must not grow

- `public/app.js`: legacy host for chat, sidebar, Wolf Den, Serpent Desk, theme/storage, and old Daily collision code. Do not add new features here.
- `public/run-control-p301c.js`: production control layer. Touch only for its own run-control responsibility.
- `public/api-sandbox-p302c.js`: API sandbox responsibility only.
- `public/model-box-p303a.js`: active model-box implementation at root. Allowed next direction is move under `public/modules/model-box/` or keep a root compatibility loader.
- Any cleanroom / app-next files: experimental, not current production construction path.

## Daily production bug policy

If 海岸日报 or an internal Daily button is broken, fix in this order:

1. `public/modules/daily/daily-router.js` for event routing / selectors / capture conflict.
2. `public/modules/daily/daily-shell.js` for Daily home shell and child placeholder rendering.
3. `public/modules/daily/moments.js`, `diary.js`, or `album.js` for child feature behavior.
4. Only if production is blocked by legacy interference, add the smallest compatibility fence with a removal condition. Do not expand HTML bridges.

Current documented removal condition: `daily-router.js` temporary takeover exists only until the old app.js Daily cluster is physically purged.

## Recommended next work

1. Move `public/model-box-p303a.js` into `public/modules/model-box/model-box.js`, leaving a tiny root compatibility loader if script paths cannot change immediately.
2. Extract sidebar footer setup from `public/app.js` into `public/modules/sidebar/sidebar.js`.
3. Extract Wolf Den as `public/modules/wolf-den/wolf-den.js`, one panel/action at a time.
4. Extract Serpent Desk as `public/modules/serpent-desk/serpent-desk.js`, one panel/action at a time.
5. Split main chat into `chat-renderer.js`, `composer-controller.js`, and `message-actions.js` before deleting legacy render/submit branches from `public/app.js`.

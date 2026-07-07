# v106 daily modules

These files are future module landing points for the v106 daily shell: 海岸日报、硅碳圈、日记、相册、草稿状态与素材处理。

Current production behavior is still owned by `public/app.js` inside the `window.__v106SiliconCarbonMoments` IIFE. These files are not loaded by `app.html`, are not imported anywhere, and must not change runtime behavior until a later migration task explicitly wires them in.

Planned module boundaries:

- `daily-router.js`: future captured-event router for daily entry clicks and v106 child actions.
- `daily-shell.js`: future `#freshDailyPanelV101` panel shell, daily hall, and generic child empty states.
- `moments.js`: future 硅碳圈 UI shell, post cards, comments, likes, and compose form.
- `diary.js`: future 日记 UI shell, paper cards, date chips, and compose form.
- `album.js`: future 相册 wall, upload form, cards, and download action.
- `daily-draft-state.js`: future in-memory draft state boundary for posts, likes, comments, diaries, and albums.
- `daily-assets.js`: future image/avatar/cover helpers.

Do not place these unrelated areas here:

- v119 予爱机书 / 登岛信 core copy or storage.
- Main chat rendering, composer, or real API send chain.
- v097 main chat windows storage or switching.
- Model box / API sandbox / run-control internals.
- keys, secrets, tokens, `.env`, `.envv`, or server data.

Until a later P3-STRUCT migration wires this directory into the app, the only valid changes here are comments, placeholder functions, and module-boundary documentation.

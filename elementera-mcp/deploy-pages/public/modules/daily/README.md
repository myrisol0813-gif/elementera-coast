# v106 daily modules

These files are future module landing points for the v106 daily shell: 海岸日报、硅碳圈、日记、相册、草稿状态与素材处理。

Current production behavior is still owned by `public/app.js` inside the `window.__v106SiliconCarbonMoments` IIFE. These files are not loaded by `app.html`, are not imported anywhere, and must not change runtime behavior until a later migration task explicitly wires them in.

P3-STRUCT-03 stages pure helper and configuration copies in these files. The staged helpers are classic-script compatible and attach only to `globalThis.ElementeraDailyModules` if the files are loaded in a later task. They are not loaded now, so online behavior remains unchanged.

Planned module boundaries:

- `daily-router.js`: future captured-event router for daily entry clicks and v106 child actions. P3-STRUCT-03 only records selectors and action names; it does not move the live `handle(e)`.
- `daily-shell.js`: future `#freshDailyPanelV101` panel shell, daily hall config, and generic child empty states.
- `moments.js`: future 硅碳圈 UI shell, post cards, comments, likes, compose form, and local-draft copy.
- `diary.js`: future 日记 UI shell, pure date/author helpers, paper cards, and compose form.
- `album.js`: future 相册 wall, pure label helpers, upload form, cards, and download action.
- `daily-draft-state.js`: future runtime-only draft-state boundary for posts, likes, comments, diaries, selected date, and albums.
- `daily-assets.js`: future image/avatar/cover helpers and the existing avatar-key boundary.

Do not place these unrelated areas here:

- v119 予爱机书 / 登岛信 core copy or storage.
- Main chat rendering, composer, or real API send chain.
- v097 main chat windows storage or switching.
- Model box / API sandbox / run-control internals.
- keys, secrets, tokens, `.env`, `.envv`, or server data.

Until a later P3-STRUCT migration wires this directory into the app, changes here must stay behavior-neutral: comments, pure helpers, constants, and module-boundary documentation only. Do not add `import`/`export`, do not add script tags, and do not create new storage keys.

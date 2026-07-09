# public/modules/daily

Purpose: Coast Daily home and children: Moments / silicon-carbon circle, Diary, Album, widgets, and pet placeholders.

Current active files:

- `daily-router.js`: route capture, module dispatch, and temporary takeover fencing.
- `daily-shell.js`: Daily home / panel shell.
- `moments.js`: Moments / silicon-carbon circle UI.
- `diary.js`: Diary UI.
- `album.js`: Album UI.
- `daily-draft-state.js`: Daily draft helpers.
- `daily-assets.js`: Daily image / asset helpers.

Known legacy dependency: `daily-router.js` still declares temporary capture fencing because `public/app.js` contains an older Daily cluster. Removal condition: after the matching app.js daily cluster is physically purged, the router can drop capture fencing and become a normal route listener.

Construction rule: Daily fixes belong here, not in `index.html`, not in `public/app.js`, and not in generic HTML bridges.

Do not place these unrelated areas here:

- v119 予爱机书 / 登岛信 core copy or storage.
- Main chat rendering, composer, or real API send chain.
- Model box / API sandbox / run-control internals.
- keys, secrets, tokens, `.env`, `.envv`, or server data.

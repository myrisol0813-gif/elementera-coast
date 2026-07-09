# public/modules/serpent-desk

Purpose: Serpent Desk workspace, Myri profile notes, assistant bubble preferences, construction status, diagnostics, and system-prompt drafts.

Current state: Serpent Desk UI is still generated inside `public/app.js` with ids such as `cleanDeskV093`, `cleanDetailV093`, and `serpentDeskRowV093`.

Construction rule: future Serpent Desk changes should start here and retire the matching app.js branch one panel at a time.

Do not mix Serpent Desk notes with Daily, model-box, or main chat logic.

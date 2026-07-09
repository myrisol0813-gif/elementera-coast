# public/modules/sidebar

Purpose: sidebar navigation, history list, footer entries, and route buttons.

Current state: sidebar DOM lives in `index.html`; open/close and footer mutation still live in `public/app.js`.

Construction rule: future sidebar changes should start here, then remove matching legacy behavior from `public/app.js` once replaced.

Do not add new sidebar rows by mutating random DOM from unrelated modules.

# public/modules/core

Purpose: formal app bootstrap and shared runtime contracts.

Current state: formal entry is still `index.html`; `app.html` is a mirror / alias. Core runtime behavior is still mostly hosted by `public/app.js` and the script order in `index.html`.

Construction rule: new cross-module contracts, bootstrap notes, and shared lifecycle decisions belong here. Do not add new product behavior to `public/app.js`.

Migration target: move only stable app lifecycle helpers here after the owning feature has been identified. Do not turn this folder into a new grab-bag.

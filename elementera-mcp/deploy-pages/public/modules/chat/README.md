# public/modules/chat

Purpose: main chat thread, message rendering, composer submit state, stop/send UI, and assistant/user message actions.

Current state: main chat DOM lives in `index.html`; message storage/render/composer behavior still lives in `public/app.js`. Model-backed sending is currently intercepted by `public/model-box-p303a.js`.

Construction rule: new chat behavior belongs here or in `model-box` when it is model selection / API orchestration. Do not add new chat behavior to `public/app.js`.

Migration target: split renderer, composer controller, and message action controller into explicit files before deleting matching app.js code.

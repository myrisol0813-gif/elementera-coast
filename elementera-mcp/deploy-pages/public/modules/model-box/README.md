# public/modules/model-box

Purpose: model catalog, selected chat/image model state, model picker UI, and model-backed chat send orchestration.

Current state: active implementation is still `public/model-box-p303a.js` at the public root.

Construction rule: the next touch to model selection or model-backed send should first move or wrap the active file here, then leave the root file as a compatibility loader only if needed.

Do not store keys, secrets, or environment values here. API calls should remain behind `/api/*` functions.

# public/modules/storage

Purpose: storage key registry, migration notes, and persistence ownership.

Current known keys from production files:

- `gpt_like_test_window_messages_clean_v1`: main chat messages, currently used by `public/app.js` and `public/model-box-p303a.js`.
- `gpt_like_shell_theme_clean_v1`: theme, currently used by `public/app.js`.
- `gpt_like_assistant_avatar_dataurl_v1`: assistant avatar, currently used by `public/app.js` and `public/model-box-p303a.js`.
- `wolf_model_v092`: old model label compatibility, currently used by `public/app.js` and `public/model-box-p303a.js`.
- `wolf_user_bubble_v092`: user bubble color, currently used by `public/app.js`.
- `wolf_accent_v092`: accent color, currently used by `public/app.js`.
- `ec.modelCatalog.cache`: model catalog cache, currently used by `public/model-box-p303a.js`.
- `ec.modelBox.v1`: model box selections, currently used by `public/model-box-p303a.js`.
- `ec.currentChatModel`: current chat model, currently used by `public/model-box-p303a.js`.
- `ec.currentImageModel`: current image model, currently used by `public/model-box-p303a.js`.

Construction rule: do not add a new localStorage/sessionStorage key without listing owner, reader, writer, migration plan, and removal condition here.

# public/modules/wolf-den

Purpose: Wolf Den settings, user profile, appearance controls, chat import/export, account status, and settings landing UI.

Current state: Wolf Den UI is still generated inside `public/app.js` with ids such as `cleanWolfV093` and `wolfRowV093`.

Construction rule: future Wolf Den fixes should start here. Move one panel or action at a time, then remove the matching app.js branch.

Storage keys must be listed in `public/modules/storage` before adding new persistence.

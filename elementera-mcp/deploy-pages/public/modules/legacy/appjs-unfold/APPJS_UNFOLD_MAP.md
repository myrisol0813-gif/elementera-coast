# APPJS UNFOLD MAP

Status: P3-APPJS-UNFOLD-RUNTIME-00

Goal: keep the legacy runtime behavior unchanged while moving the current working `app.full.js` source into the appjs-unfold runtime area.

Runtime entry loaded by production HTML:

`/public/modules/legacy/appjs-unfold/appjs-unfold-runtime.js?v=p3-appjs-unfold-runtime-00`

Rollback entry remains available at:

`/public/app.js`

`public/app.js` was not deleted.

## Build rule

Concatenate the source block list below in order with no separator and no generated header/footer.

For this first unfold pass, the exported working file is preserved as one byte-faithful source block so the rebuilt runtime can be verified without touching legacy behavior. The runtime bundle is byte-identical to the uploaded `app.full.js`.

No source block is loaded directly by HTML. Only `appjs-unfold-runtime.js` is loaded by `index.html`, `app.html`, and the service worker CORE list.

## Hashes

- app.full.js SHA256: `de853b7ab934c070894b05a6e1e4105fcbe9882fd22ec51f664fbdba68a498cc`
- appjs-unfold-runtime.js SHA256: `de853b7ab934c070894b05a6e1e4105fcbe9882fd22ec51f664fbdba68a498cc`
- stripped SHA256: same as runtime SHA256 because no generated header/comment was added.
- git blob SHA for both runtime and source block: `f90c2bb91d7296e9833ccb51b8fc59d34a17ecb8`

## Source block order

| Order | File | Original line range | SHA256 |
|---:|---|---:|---|
| 1 | `source/app.full.part-001.js` | 1-3041 | `de853b7ab934c070894b05a6e1e4105fcbe9882fd22ec51f664fbdba68a498cc` |

## Verification

```bash
cat public/modules/legacy/appjs-unfold/source/app.full.part-001.js > public/modules/legacy/appjs-unfold/appjs-unfold-runtime.js
sha256sum app.full.js public/modules/legacy/appjs-unfold/appjs-unfold-runtime.js
node --check public/modules/legacy/appjs-unfold/appjs-unfold-runtime.js
```

import { SHADOW_APP_VERSION } from "./app-env.js";
import { onceFlag } from "./app-events.js";
import { ensureDailyCanonical } from "./daily-entry.js";
import { mountMainChatCompat } from "./main-chat-compat.js";
import { mountV097Compat } from "./v097-compat.js";
import { mountV119Compat } from "./v119-compat.js";

export function bootShadowApp(root = globalThis) {
  if (!onceFlag(root, "__p3Struct14ShadowAppBooted")) return;
  root.__p3Struct14ShadowApp = Object.freeze({
    version: SHADOW_APP_VERSION,
    entry: "/public/app-next/bootstrap.js",
    oldAppJsRequired: false,
  });

  ensureDailyCanonical(root);
  mountMainChatCompat(root);
  mountV097Compat(root);
  mountV119Compat(root);
}

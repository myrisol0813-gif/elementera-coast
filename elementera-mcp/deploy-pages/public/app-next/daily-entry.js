const DAILY_SCRIPTS = Object.freeze([
  { name: "dailyShell", src: "/public/modules/daily/daily-shell.js?v=p3-struct-13a" },
  { name: "dailyDraftState", src: "/public/modules/daily/daily-draft-state.js?v=p3-struct-13a" },
  { name: "dailyAssets", src: "/public/modules/daily/daily-assets.js?v=p3-struct-13a" },
  { name: "moments", src: "/public/modules/daily/moments.js?v=p3-struct-13a" },
  { name: "diary", src: "/public/modules/daily/diary.js?v=p3-struct-13a" },
  { name: "album", src: "/public/modules/daily/album.js?v=p3-struct-13a" },
  { name: "dailyRouter", src: "/public/modules/daily/daily-router.js?v=p3-struct-13a", router: true },
]);

function scriptExists(root, src) {
  const clean = src.split("?")[0];
  return Array.from(root.document?.scripts || []).some((script) => {
    const current = script.getAttribute("src") || "";
    return current === src || current.split("?")[0] === clean;
  });
}

function moduleExists(root, name, router) {
  if (router) return !!root.__p3Struct13DailyRouter || !!root.__p3Struct13ADailyRouter;
  const modules = root.ElementeraDailyModules || {};
  return !!(modules[name] && Object.keys(modules[name]).length);
}

function loadScript(root, src) {
  return new Promise((resolve, reject) => {
    if (scriptExists(root, src)) {
      setTimeout(resolve, 0);
      return;
    }
    const script = root.document.createElement("script");
    script.src = src;
    script.async = false;
    script.onload = resolve;
    script.onerror = () => reject(new Error("DAILY_CANONICAL_SCRIPT_LOAD_ERROR:" + src));
    root.document.head.appendChild(script);
  });
}

export function ensureDailyCanonical(root = globalThis) {
  root.ElementeraDailyModules = root.ElementeraDailyModules || {};
  return DAILY_SCRIPTS.reduce((chain, item) => {
    return chain.then(() => {
      if (moduleExists(root, item.name, item.router) || scriptExists(root, item.src)) return undefined;
      return loadScript(root, item.src);
    });
  }, Promise.resolve()).catch((error) => {
    console.warn("[P3-STRUCT-14] daily canonical load fallback", error);
  });
}

// v094 wolf apps back fix: avoid desk keyword in Wolf Den Apps detail
(() => {
  if (window.__v094WolfAppsBackFix) return;
  window.__v094WolfAppsBackFix = true;
  function fix() {
    document.querySelectorAll("section").forEach((sec) => {
      const h = sec.querySelector("h1");
      if (!h || h.textContent.trim() !== "应用") return;
      sec.querySelectorAll("*").forEach((el) => {
        if (el.childNodes.length === 1 && el.childNodes[0].nodeType === 3) {
          el.textContent = el.textContent.replace(/施工工具/g, "工程工具");
        }
      });
    });
  }
  new MutationObserver(fix).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  document.addEventListener("click", () => setTimeout(fix, 0), true);
  fix();
})();


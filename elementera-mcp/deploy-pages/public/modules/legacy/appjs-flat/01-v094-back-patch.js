// clean rewrite probe

// v094 detail back patch: third-level pages return to their parent panel
(() => {
  if (window.__v094BackPatch) return;
  window.__v094BackPatch = true;
  const $ = (s, r = document) => r.querySelector(s);
  function byId(ids) {
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) return el;
    }
    return null;
  }
  function hideDetails() {
    [
      "wolfDetailV092",
      "wolfAccountDetailV092",
      "acctDetailV092",
      "serpentDetailV092",
      "serpentStableDetailV092",
      "cleanDetailV093",
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.hidden = true;
    });
  }
  function showParent(kind) {
    hideDetails();
    const ids =
      kind === "desk"
        ? [
            "serpentStableV092",
            "serpentDeskV092",
            "serpentDeskPanelV092",
            "deskStableV092",
            "cleanDeskV093",
          ]
        : ["wolfDenPanelV092", "wolfStableV092", "cleanWolfV093"];
    const p = byId(ids);
    if (p) {
      p.hidden = false;
      document.body.classList.add("wolf-open");
    } else {
      document.body.classList.remove("wolf-open");
    }
  }
  function infer(sec, btn) {
    const id = (sec && sec.id) || "";
    const txt =
      ((sec && sec.textContent) || "") +
      " " +
      ((btn && btn.dataset && btn.dataset.back) || "");
    if (
      id.toLowerCase().includes("serpent") ||
      id.toLowerCase().includes("desk")
    )
      return "desk";
    if (
      txt.includes("Myri") ||
      txt.includes("小蛇") ||
      txt.includes("施工") ||
      txt.includes("本地诊断") ||
      txt.includes("System Prompt") ||
      txt.includes("便签")
    )
      return "desk";
    return "wolf";
  }
  window.addEventListener(
    "click",
    (e) => {
      const btn = e.target.closest(
        ".wolf-back,.clean-back,[data-cd-back],[data-clean-close]",
      );
      if (!btn) return;
      const sec = btn.closest("section");
      if (!sec) return;
      const id = sec.id || "";
      const detail =
        /Detail|acctDetail/i.test(id) ||
        sec.querySelector(".wolf-detail-page,.clean-detail-page") ||
        id === "cleanDetailV093";
      if (!detail) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      showParent(infer(sec, btn));
    },
    true,
  );
})();


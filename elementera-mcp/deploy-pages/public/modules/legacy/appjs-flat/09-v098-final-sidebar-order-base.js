// v098 final sidebar order base
(() => {
  if (window.__v098FinalSidebarPolish) return;
  window.__v098FinalSidebarPolish = true;
  function q(s, r = document) {
    return r.querySelector(s);
  }
  function qa(s, r = document) {
    return Array.from(r.querySelectorAll(s));
  }
  function hideLegacySaved() {
    const h = q(".history-list");
    if (!h) return;
    qa("h2,h3,.history-section-title,.section-title", h).forEach((t) => {
      if ((t.textContent || "").trim() === "已保存") {
        const p = t.closest("section,div");
        if (p && p.id !== "mainWindowsV097")
          p.classList.add("legacy-saved-hidden-v098");
        else t.classList.add("legacy-saved-hidden-v098");
      }
    });
  }
  function orderMainWindows() {
    const rooms = q("#coastRoomsV095"),
      main = q("#mainWindowsV097"),
      roomWins = q("#coastRoomWindowsV096");
    if (rooms && main && main.previousElementSibling !== rooms)
      rooms.after(main);
    if (main && roomWins && roomWins.previousElementSibling !== main)
      main.after(roomWins);
  }
  function polish() {
    hideLegacySaved();
    orderMainWindows();
  }

  // v098 hide legacy saved section
  (() => {
    if (window.__v098HideSaved) return;
    window.__v098HideSaved = true;
    function hideSaved() {
      const b = document.querySelector("#testWindowButton");
      const s = b && b.closest("section");
      if (s) s.style.display = "none";
    }
    document.addEventListener("DOMContentLoaded", hideSaved);
    setTimeout(hideSaved, 300);
    setInterval(hideSaved, 1500);
  })();
  document.addEventListener("DOMContentLoaded", polish);
  document.addEventListener("click", () => setTimeout(polish, 50), true);
  setInterval(polish, 1200);
  setTimeout(polish, 300);
})();


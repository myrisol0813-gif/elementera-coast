// v098 final sidebar order
(() => {
  if (window.__v098FinalOrder) return;
  window.__v098FinalOrder = true;
  function order() {
    const rooms = document.querySelector("#coastRoomsV095");
    const main = document.querySelector("#mainWindowsV097");
    if (rooms && main && rooms.nextElementSibling !== main) rooms.after(main);
    const h = document.querySelector("#mainWindowsV097 h2");
    if (h) h.textContent = "主聊天窗口";
  }
  document.addEventListener("DOMContentLoaded", order);
  setTimeout(order, 300);
  setInterval(order, 1500);
})();


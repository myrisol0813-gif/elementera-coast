import { $, esc, hideSidebar, showSidebar } from "./app-env.js";

export function closeKnownPanels(ids = []) {
  ids.forEach((id) => {
    const node = document.getElementById(id);
    if (node) node.hidden = true;
  });
}

export function openPanel({ id, className, title, subtitle, body, backId, backClass = "coast-room-back", closeToSidebar = true }) {
  if (closeToSidebar) hideSidebar();
  let panel = document.getElementById(id);
  if (!panel) {
    panel = document.createElement("section");
    panel.id = id;
    document.body.appendChild(panel);
  }
  panel.className = className;
  panel.hidden = false;
  panel.innerHTML =
    '<div class="coast-room-shell"><header class="coast-room-head"><button type="button" id="' +
    esc(backId) +
    '" class="' +
    esc(backClass) +
    '">←</button><div><h1>' +
    esc(title) +
    "</h1><p>" +
    esc(subtitle) +
    '</p></div></header><main class="coast-room-body">' +
    body +
    "</main></div>";
  const back = $("#" + backId, panel);
  if (back) {
    back.onclick = () => {
      panel.hidden = true;
      showSidebar();
    };
  }
  return panel;
}

export function localNotice(message, hostSelector = "#messages") {
  const host = $(hostSelector);
  if (!host) {
    alert(message);
    return;
  }
  let notice = $("#mainChatNoticeP303B");
  if (!notice) {
    notice = document.createElement("div");
    notice.id = "mainChatNoticeP303B";
    notice.setAttribute("role", "status");
    notice.style.cssText =
      "margin:12px auto 0;padding:10px 14px;max-width:min(86vw,560px);border-radius:16px;background:var(--panel);color:var(--muted);font-size:14px;line-height:1.5;text-align:center;";
  }
  notice.textContent = message;
  host.appendChild(notice);
  clearTimeout(notice._timer);
  notice._timer = setTimeout(() => notice.remove(), 2600);
}

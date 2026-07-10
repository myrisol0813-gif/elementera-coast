import { escapeAttribute } from './dom.js';

const ICONS = Object.freeze({
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
  theme: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 0 0 16Z" fill="currentColor" stroke="none"/>',
  'new-chat': '<path d="M5 19h14V8l-3-3H5z"/><path d="M14 5v5h5M12 12v5M9.5 14.5h5"/>',
  more: '<circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
  image: '<rect x="4" y="5" width="16" height="14" rx="3"/><circle cx="9" cy="10" r="1.5"/><path d="m6 17 4-4 3 3 2-2 3 3"/>',
  mic: '<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M6.5 11.5a5.5 5.5 0 0 0 11 0M12 17v4M9 21h6"/>',
  send: '<path d="m4 11 16-7-6.5 16-2.2-6.2Z"/><path d="m11.3 13.8 4.4-4.4"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none"/>',
  call: '<path d="M7.2 4.5 10 8.2 8.4 10c1.2 2.5 3.1 4.4 5.6 5.6l1.8-1.6 3.7 2.8-.9 2.4c-.4 1-1.5 1.5-2.5 1.2C9.9 18.6 5.4 14.1 3.6 7.9c-.3-1 .2-2.1 1.2-2.5Z"/>',
  back: '<path d="m14.5 5-7 7 7 7"/>',
  copy: '<rect x="5" y="7" width="11" height="12" rx="1.5"/><path d="M9 7V5h10v11h-3"/>',
  edit: '<path d="m5 19 1.4-4.8L15.6 5a2 2 0 0 1 2.8 2.8L9.2 17Z"/><path d="m14 6.6 3.4 3.4M5 19h5"/>',
  heart: '<path d="M12 20s-7-4.2-7-9.1C5 8.2 6.8 6.5 9 6.5c1.4 0 2.5.7 3 1.8.5-1.1 1.6-1.8 3-1.8 2.2 0 4 1.7 4 4.4C19 15.8 12 20 12 20Z"/>',
  like: '<path d="M8 20H5V10h3zM8 10c2.5-1.9 3.5-4.5 3.8-6 .1-.6.7-.9 1.2-.7 1.3.5 1.7 1.8 1.4 3.3l-.5 2.6H18c1.6 0 2.6 1.4 2.2 2.9L19 17.6a3 3 0 0 1-2.9 2.4H8Z"/>',
  refresh: '<path d="M19 8V4l-2 2a7 7 0 0 0-11.5 2M5 16v4l2-2a7 7 0 0 0 11.5-2"/><path d="M15 4h4v4M9 20H5v-4"/>',
  trash: '<path d="M5 7h14M9 7l1-2h4l1 2M7.5 9l.8 10h7.4l.8-10M10.5 11v5M13.5 11v5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  wolf: '<path d="m5 5 4 3 3-4 3 4 4-3-1 10-6 5-6-5Z"/><path d="m9 13 3 2 3-2M9 10h.01M15 10h.01"/>',
  serpent: '<path d="M7 5h10v14H7zM9.5 9h5M9.5 12h5M9.5 15h3"/>',
  radio: '<circle cx="12" cy="12" r="2"/><path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.5 5.5a9 9 0 0 0 0 13M18.5 5.5a9 9 0 0 1 0 13"/>',
  letter: '<rect x="3.5" y="6" width="17" height="12" rx="2"/><path d="m5 8 7 5 7-5"/>',
  memory: '<path d="M7 5.5A4.5 4.5 0 0 1 12 6a4.5 4.5 0 0 1 5-.5c2 1 2.5 3.5 1.4 5.2 1.1 1.8.4 4.2-1.5 5.1A4.5 4.5 0 0 1 12 18a4.5 4.5 0 0 1-4.9-2.2c-1.9-.9-2.6-3.3-1.5-5.1C4.5 9 5 6.5 7 5.5Z"/><path d="M12 6v12M8.5 9.5H12M12 14.5h3.5"/>',
  daily: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 9h16M8 13h3M8 16h6"/>',
  check: '<path d="m5 12 4 4 10-10"/>',
  download: '<path d="M12 4v11M8 11l4 4 4-4M5 20h14"/>',
});

export function icon(name, className = '') {
  const body = ICONS[name];
  if (!body) throw new Error(`unknown_icon:${name}`);
  return `<svg class="icon ${escapeAttribute(className)}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

export function hydrateIconSlots(root = document) {
  root.querySelectorAll('[data-icon]').forEach((slot) => {
    slot.replaceChildren();
    slot.insertAdjacentHTML('afterbegin', icon(slot.dataset.icon));
  });
}

export const iconNames = Object.freeze(Object.keys(ICONS));


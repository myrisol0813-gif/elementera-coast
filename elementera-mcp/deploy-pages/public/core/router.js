import { escapeHtml } from './dom.js';
import { icon } from './icons.js';

export function createRouter(root, { onOpen = () => {}, onClose = () => {} } = {}) {
  const renderers = new Map();
  const stack = [];
  let renderToken = 0;

  async function render() {
    const token = ++renderToken;
    const current = stack.at(-1);
    if (!current) {
      root.hidden = true;
      root.replaceChildren();
      onClose();
      return;
    }

    const renderer = renderers.get(current.name);
    if (!renderer) throw new Error(`route_not_registered:${current.name}`);
    const view = await renderer(current.params || {});
    if (token !== renderToken) return;
    root.hidden = false;
    root.dataset.route = current.name;
    root.className = `app-overlay ${view.className || ''}`.trim();
    root.innerHTML = `<section class="feature-panel">
      <header class="feature-head">
        <button class="feature-back" type="button" data-action="router:back" aria-label="返回">${icon('back')}</button>
        <div><h1>${escapeHtml(view.title || '')}</h1><p>${escapeHtml(view.subtitle || '')}</p></div>
        ${view.headerAction || ''}
      </header>
      <main class="feature-body">${view.body || ''}</main>
      ${view.footer || ''}
    </section>`;
    onOpen(current);
    view.afterRender?.(root);
  }

  return Object.freeze({
    register(name, renderer) {
      if (renderers.has(name)) throw new Error(`duplicate_route:${name}`);
      renderers.set(name, renderer);
    },
    async open(name, params = {}, { replace = false } = {}) {
      if (replace && stack.length) stack[stack.length - 1] = { name, params };
      else stack.push({ name, params });
      await render();
    },
    async back() {
      stack.pop();
      await render();
    },
    async close() {
      stack.length = 0;
      await render();
    },
    async refresh() {
      await render();
    },
    current: () => stack.at(-1) || null,
  });
}


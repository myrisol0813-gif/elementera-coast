export function delegate(root, type, selector, handler, options = true) {
  root.addEventListener(
    type,
    (event) => {
      const target = event.target?.closest?.(selector);
      if (!target) return;
      handler(event, target);
    },
    options,
  );
}

export function stopHard(event) {
  event.preventDefault();
  event.stopPropagation();
  if (event.stopImmediatePropagation) event.stopImmediatePropagation();
}

export function onceFlag(root, flag) {
  if (root[flag]) return false;
  root[flag] = true;
  return true;
}

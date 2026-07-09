// v094 stop same text mutation loops caused by text replacement patch
(() => {
  if (window.__v094SafeTextSetter) return;
  window.__v094SafeTextSetter = true;
  const d = Object.getOwnPropertyDescriptor(Node.prototype, "textContent");
  if (!d || !d.set || !d.get) return;
  Object.defineProperty(Node.prototype, "textContent", {
    get() {
      return d.get.call(this);
    },
    set(v) {
      const s = String(v ?? "");
      if (d.get.call(this) === s) return;
      return d.set.call(this, s);
    },
    configurable: true,
  });
})();


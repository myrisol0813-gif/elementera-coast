export const q = (selector, root = document) => root?.querySelector?.(selector) || null;

export const qa = (selector, root = document) => Array.from(root?.querySelectorAll?.(selector) || []);

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

export const escapeAttribute = escapeHtml;

export function clamp(value, length) {
  if (length < 1) return 0;
  return Math.min(Math.max(0, Number(value) || 0), length - 1);
}

export function id(prefix = 'id') {
  const value = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${value}`.replace(/[^\w:.-]/g, '_').slice(0, 160);
}

export function sanitizeId(value, fallback = 'id') {
  const clean = String(value || '').replace(/[^\w:.-]/g, '_').slice(0, 160);
  return clean || id(fallback);
}

export function formatRichText(value) {
  return escapeHtml(value)
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

export function readImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || typeof FileReader === 'undefined') {
      resolve('');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('image_read_failed'));
    reader.readAsDataURL(file);
  });
}

export function chooseImage(accept = 'image/*') {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.hidden = true;
    input.addEventListener('change', async () => {
      try {
        resolve(await readImageFile(input.files?.[0]));
      } catch (error) {
        reject(error);
      } finally {
        input.remove();
      }
    }, { once: true });
    input.addEventListener('cancel', () => {
      input.remove();
      resolve('');
    }, { once: true });
    document.body.appendChild(input);
    input.click();
  });
}

export function downloadFile(body, filename, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

export function timestampLabel(date = new Date()) {
  const two = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${two(date.getMonth() + 1)}${two(date.getDate())}-${two(date.getHours())}${two(date.getMinutes())}${two(date.getSeconds())}`;
}


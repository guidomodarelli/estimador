/** Utilidades de DOM y binding de formularios, sin estado de la app. */

export const byId = (elementId) => document.getElementById(elementId);

const HTML_ESCAPES = Object.freeze({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' });

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);
}

export function getAtPath(target, path) {
  return path.split('.').reduce((current, segment) => (current == null ? undefined : current[segment]), target);
}

export function setAtPath(target, path, value) {
  const segments = path.split('.');
  const last = segments.pop();
  const parent = segments.reduce((current, segment) => {
    current[segment] ??= {};
    return current[segment];
  }, target);
  if (value === undefined) delete parent[last];
  else parent[last] = value;
}

export function optionsHtml(options, selectedValue) {
  return options
    .map((option) => `<option value="${escapeHtml(option.value)}"${option.value === selectedValue ? ' selected' : ''}>${escapeHtml(option.label)}</option>`)
    .join('');
}

const PERCENT_SCALE = 100;

/** Traduce el valor de un control al modelo según su `data-type`. */
export function parseInputValue(input) {
  const type = input.dataset.type;
  if (input.type === 'checkbox') return 'invertFalse' in input.dataset ? input.checked : input.checked;
  if (type === 'number' || type === 'optional-number') {
    if (input.value.trim() === '') return type === 'optional-number' ? undefined : 0;
    return Number(input.value);
  }
  if (type === 'percent') return Number(input.value) / PERCENT_SCALE;
  if (type === 'list') return input.value.split(',').map((item) => item.trim()).filter(Boolean);
  if (type === 'lines') return input.value.split('\n').map((item) => item.trim()).filter(Boolean);
  if (type === 'optional-text') return input.value || undefined;
  return input.value;
}

/** Vuelca un valor del modelo en el control. */
export function formatInputValue(input, value) {
  const type = input.dataset.type;
  if (input.type === 'checkbox') {
    input.checked = 'invertFalse' in input.dataset ? value !== false : Boolean(value);
    return;
  }
  if (input.type === 'radio') {
    input.checked = input.value === value;
    return;
  }
  if (type === 'percent') input.value = value == null ? '' : Math.round(value * PERCENT_SCALE);
  else if (type === 'list') input.value = (value ?? []).join(', ');
  else if (type === 'lines') input.value = (value ?? []).join('\n');
  else input.value = value ?? '';
}

/** Sincroniza todos los controles con `data-bind` dentro de un contenedor. */
export function syncBoundInputs(container, bindingRoot) {
  for (const input of container.querySelectorAll('[data-bind]')) {
    formatInputValue(input, getAtPath(bindingRoot, input.dataset.bind));
  }
}

/** Re-renderiza un contenedor conservando el control enfocado y la posición del cursor. */
export function preserveFocus(render) {
  const active = document.activeElement;
  const key = active?.dataset?.bind ?? active?.dataset?.focusKey;
  const radioValue = active?.type === 'radio' ? active.value : null;
  const selection = active?.type === 'text' ? [active.selectionStart, active.selectionEnd] : null;
  render();
  if (!key) return;
  const attribute = active.dataset.bind ? 'data-bind' : 'data-focus-key';
  const radioSelector = radioValue === null ? '' : `[value="${CSS.escape(radioValue)}"]`;
  const restored = document.querySelector(`[${attribute}="${CSS.escape(key)}"]${radioSelector}`);
  restored?.focus({ preventScroll: true });
  if (selection && restored?.setSelectionRange) restored.setSelectionRange(...selection);
}

export function downloadFile(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  link.click();
  URL.revokeObjectURL(url);
}

export const slugify = (text) =>
  String(text).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'estimacion';

export function uniqueId(prefix, existingIds) {
  let counter = existingIds.length + 1;
  while (existingIds.includes(`${prefix}-${counter}`)) counter += 1;
  return `${prefix}-${counter}`;
}

const TOAST_DURATION_MS = 2600;
/** Con "Deshacer" el aviso dura más, para dar tiempo a reaccionar. */
const UNDO_TOAST_DURATION_MS = 8000;
let toastTimer = null;

/**
 * Muestra un aviso breve; con `actionLabel` agrega un botón (por ejemplo "Deshacer").
 * @param {string} message
 * @param {{actionLabel?: string, onAction?: () => void}} [options]
 */
export function showToast(message, options = {}) {
  const toast = byId('toast');
  const hide = () => { toast.hidden = true; };
  toast.replaceChildren(Object.assign(document.createElement('span'), { textContent: message }));
  if (options.actionLabel && options.onAction) {
    const actionButton = Object.assign(document.createElement('button'), { type: 'button', className: 'toast-action', textContent: options.actionLabel });
    actionButton.addEventListener('click', () => {
      hide();
      options.onAction();
    }, { once: true });
    toast.append(actionButton);
  }
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hide, options.actionLabel ? UNDO_TOAST_DURATION_MS : TOAST_DURATION_MS);
}

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Íconos SVG propios, todos con el mismo trazo (1.75 px sobre una grilla de 16 px) y `currentColor`,
 * para que hereden el color del texto. Son decorativos: el control que los contiene lleva su nombre accesible.
 */

const ICON_PATHS = Object.freeze({
  close: '<path d="M4 4l8 8M12 4l-8 8"/>',
  quarter: '<rect x="2" y="3" width="12" height="11" rx="1.5"/><path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3M5 9.5h2M9 9.5h2M5 12h2"/>',
  team: '<circle cx="6" cy="5.5" r="2.25"/><path d="M1.75 13.5c.5-2.3 2.2-3.5 4.25-3.5s3.75 1.2 4.25 3.5"/><path d="M10.5 3.6a2.1 2.1 0 010 4M12.2 10.4c1 .5 1.7 1.5 2 3.1"/>',
  history: '<path d="M2.5 8a5.5 5.5 0 105.5-5.5A5.5 5.5 0 004 4.3"/><path d="M3.6 1.8L4 4.3l2.5-.4"/><path d="M8 5v3.2l2.1 1.3"/>',
});

/** @param {keyof typeof ICON_PATHS} name */
export function iconSvg(name) {
  return `<svg class="icon-svg" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICON_PATHS[name]}</svg>`;
}

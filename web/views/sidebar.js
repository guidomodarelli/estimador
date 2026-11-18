import { COMPLEXITY_LABELS, formatHours } from '../../src/core/index.js';
import { shortDate } from '../charts/svg.js';
import { escapeHtml } from '../utils/dom.js';
import { iconSvg } from '../utils/icons.js';
import { actualTotal, ESTIMATE_STATUS } from '../state/estimates.js';
import { VIEW } from '../state/store.js';

const NAV_ITEMS = Object.freeze([
  { view: VIEW.QUARTER, icon: 'quarter', label: 'Trimestre' },
  { view: VIEW.TEAM, icon: 'team', label: 'Equipo' },
  { view: VIEW.HISTORY, icon: 'history', label: 'Historial' },
]);

function estimateItem(estimate, isActive) {
  const name = estimate.project.name?.trim() || 'Sin nombre';
  const complexityLabel = COMPLEXITY_LABELS[estimate.project.complexity];
  const typeLabel = complexityLabel ? `Complejidad ${complexityLabel.toLowerCase()}` : '';
  const detail = estimate.status === ESTIMATE_STATUS.DONE
    ? `<span class="item-detail done">Terminada · real ${formatHours(actualTotal(estimate))}</span>`
    : estimate.summary
      ? `<span class="item-detail">${estimate.summary.rolloutDate ? `Rollout ${shortDate(estimate.summary.rolloutDate)} · ` : ''}P80 ${shortDate(estimate.summary.p80Date)}</span>`
      : `<span class="item-detail">${typeLabel}</span>`;
  return `<li><button type="button" class="estimate-item${isActive ? ' active' : ''}" data-action="open-estimate" data-id="${escapeHtml(estimate.id)}"${isActive ? ' aria-current="page"' : ''}>
    <span class="item-name">${escapeHtml(name)}</span>${detail}
  </button></li>`;
}

/** Sidebar: lista de estimaciones (abiertas y terminadas) y navegación a las vistas del equipo. */
export function renderSidebar(store) {
  const { ui } = store;
  const byRecent = [...store.estimates].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const open = byRecent.filter((estimate) => estimate.status !== ESTIMATE_STATUS.DONE);
  const done = byRecent.filter((estimate) => estimate.status === ESTIMATE_STATUS.DONE);
  const isActive = (estimate) => ui.view === VIEW.ESTIMATE && ui.estimateId === estimate.id;
  return `
    <button type="button" class="button primary new-estimate" data-action="new-estimate">+ Nueva estimación</button>
    <nav class="sidebar-section" aria-label="Estimaciones abiertas">
      <h2 class="sidebar-heading">Abiertas <span>${open.length}</span></h2>
      <ul class="estimate-list">${open.map((estimate) => estimateItem(estimate, isActive(estimate))).join('') || '<li class="empty">Sin estimaciones abiertas</li>'}</ul>
    </nav>
    ${done.length ? `<nav class="sidebar-section" aria-label="Estimaciones terminadas">
      <details${done.some(isActive) ? ' open' : ''}><summary class="sidebar-heading">Terminadas <span>${done.length}</span></summary>
      <ul class="estimate-list">${done.map((estimate) => estimateItem(estimate, isActive(estimate))).join('')}</ul></details>
    </nav>` : ''}
    <nav class="sidebar-section sidebar-nav" aria-label="Vistas del equipo">
      ${NAV_ITEMS.map((item) => `<button type="button" class="nav-item${ui.view === item.view ? ' active' : ''}" data-action="open-view" data-view="${item.view}"${ui.view === item.view ? ' aria-current="page"' : ''}>${iconSvg(item.icon)}${item.label}</button>`).join('')}
    </nav>
    <div class="sidebar-footer">
      <button type="button" class="button link" data-action="export-backup">Exportar respaldo</button>
      <button type="button" class="button link" data-action="import-backup">Importar</button>
    </div>`;
}

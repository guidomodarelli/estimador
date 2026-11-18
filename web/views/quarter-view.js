import { formatHours } from '../../src/core/index.js';
import { renderQuarterLoad } from '../charts/quarter-load.js';
import { shortDate } from '../charts/svg.js';
import { escapeHtml } from '../utils/dom.js';
import { ESTIMATE_STATUS } from '../state/estimates.js';
import { quarterBounds, weeklyLoad } from '../state/quarter.js';

/**
 * Trimestre: ¿entran las estimaciones abiertas con la capacidad del equipo?
 * Cada estimación se planificó como si tuviera al equipo para ella sola; acá se suman.
 */
export function renderQuarterView(store, todayIso, quarterOffset) {
  const quarter = quarterBounds(todayIso, quarterOffset);
  const open = store.estimates.filter((estimate) => estimate.status !== ESTIMATE_STATUS.DONE && estimate.summary);
  const inQuarter = open.filter((estimate) => estimate.summary.startDate <= quarter.end && estimate.summary.p80Date >= quarter.start);
  const weeks = weeklyLoad(inQuarter.map((estimate) => estimate.summary), store.team, quarter);
  const demand = weeks.reduce((sum, week) => sum + week.demandHours, 0);
  const capacity = weeks.reduce((sum, week) => sum + week.capacityHours, 0);
  const overWeeks = weeks.filter((week) => week.demandHours > week.capacityHours + 0.01);
  const verdict = !inQuarter.length
    ? 'No hay estimaciones abiertas en este trimestre.'
    : overWeeks.length
      ? `${overWeeks.length} semana(s) con más trabajo que capacidad: la primera es la del ${shortDate(overWeeks[0].weekStart)}. Las fechas P80 de esas tareas no se sostienen en paralelo.`
      : 'Entra: ninguna semana supera la capacidad del equipo.';

  return `<header class="view-header row">
      <div><h1>Trimestre ${quarter.label}</h1><p class="muted">Horas P80 de las estimaciones abiertas contra la capacidad efectiva del equipo.</p></div>
      <div class="row-actions">
        <button type="button" class="button" data-action="shift-quarter" data-offset="-1" aria-label="Trimestre anterior">←</button>
        <button type="button" class="button" data-action="shift-quarter" data-offset="0">Actual</button>
        <button type="button" class="button" data-action="shift-quarter" data-offset="1" aria-label="Trimestre siguiente">→</button>
      </div>
    </header>
    <div class="stats">
      <div class="stat"><span class="stat-label">Comprometido (P80)</span><span class="stat-value">${formatHours(demand)}</span><span class="stat-hint">${inQuarter.length} estimación(es)</span></div>
      <div class="stat"><span class="stat-label">Capacidad del equipo</span><span class="stat-value">${formatHours(capacity)}</span><span class="stat-hint">horas efectivas</span></div>
      <div class="stat${overWeeks.length ? ' alert' : ''}"><span class="stat-label">Uso</span><span class="stat-value">${capacity ? Math.round((demand / capacity) * 100) : 0} %</span><span class="stat-hint">${overWeeks.length ? `${overWeeks.length} semana(s) excedida(s)` : 'sin semanas excedidas'}</span></div>
    </div>
    <p class="verdict${overWeeks.length ? ' alert' : ''}">${escapeHtml(verdict)}</p>
    ${renderQuarterLoad(weeks)}
    <div class="legend"><span class="legend-item">Horas comprometidas</span><span class="legend-item over">Excede la capacidad</span><span class="legend-item capacity">Capacidad</span></div>
    ${inQuarter.length ? `<div class="table-scroll"><table class="data-table compact">
      <thead><tr><th>Estimación</th><th>Inicio</th><th>Rollout</th><th>Fin probable</th><th>Fin P80</th><th>Horas P80</th></tr></thead>
      <tbody>${inQuarter
        .sort((left, right) => left.summary.p80Date.localeCompare(right.summary.p80Date))
        .map((estimate) => `<tr><td><button type="button" class="button link" data-action="open-estimate" data-id="${escapeHtml(estimate.id)}">${escapeHtml(estimate.project.name || 'Sin nombre')}</button></td><td>${shortDate(estimate.summary.startDate)}</td><td>${estimate.summary.rolloutDate ? shortDate(estimate.summary.rolloutDate) : '—'}</td><td>${shortDate(estimate.summary.endDate)}</td><td>${shortDate(estimate.summary.p80Date)}</td><td>${formatHours(estimate.summary.p80Hours)}</td></tr>`)
        .join('')}</tbody></table></div>` : ''}`;
}

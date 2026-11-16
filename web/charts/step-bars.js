import { escapeHtml } from '../utils/dom.js';
import { formatDays } from '../../src/core/index.js';

/**
 * "De dónde sale la fecha": cada barra suma una capa de realismo sobre la anterior
 * (jornadas completas → capacidad real → dependencias → incertidumbre).
 * @param {Array<{label: string, days: number, hint: string, emphasis?: boolean}>} steps
 */
export function renderStepBars(steps) {
  const maxDays = Math.max(...steps.map((step) => step.days), 1);
  return `<ol class="step-bars" aria-label="Cómo se llega a la duración">${steps
    .map(
      (step, index) => `<li class="step-bar${step.emphasis ? ' emphasis' : ''}">
        <span class="step-label">${escapeHtml(step.label)}<small>${escapeHtml(step.hint)}</small></span>
        <span class="step-track"><span class="step-fill step-${index}" style="width:${(step.days / maxDays) * 100}%"></span></span>
        <span class="step-value">${formatDays(step.days)} d</span>
      </li>`,
    )
    .join('')}</ol>`;
}

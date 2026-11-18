import { BACKTEST_ACCEPTANCE, COMPLEXITY_LABELS, COMPLEXITY_OPTIONS, formatDays, formatHours, MIN_BACKTEST_RECORDS, runBacktest, UNCERTAINTY_MODEL } from '../../src/core/index.js';
import { renderAccuracyScatter } from '../charts/accuracy-scatter.js';
import { escapeHtml } from '../utils/dom.js';
import { actualTotal, calibrationFor, ESTIMATE_STATUS, MIN_CALIBRATION_SAMPLES } from '../state/estimates.js';

const BACKTEST_RUNS = 400;
const MODEL_LABELS = Object.freeze({
  [UNCERTAINTY_MODEL.INDEPENDENT]: 'Etapas independientes',
  [UNCERTAINTY_MODEL.COMMON_FACTOR]: 'Error común (default)',
  [UNCERTAINTY_MODEL.REFERENCE_CLASS]: 'Tu historial',
});
const share = (value) => (value === null ? '—' : `${Math.round(value * 100)} %`);

/** Tareas terminadas con estimado y real totales (de la app y del historial anterior). */
function taskTotals(store) {
  const totals = new Map();
  for (const record of store.history) {
    const key = record.estimateId ?? `${record.projectName}|${record.recordedAt}`;
    const entry = totals.get(key) ?? { label: record.projectName ?? 'Iniciativa', complexity: record.complexity, estimatedHours: 0, actualHours: 0 };
    entry.estimatedHours += record.estimatedHours;
    entry.actualHours += record.actualHours;
    totals.set(key, entry);
  }
  return [...totals.values()];
}

function backtestHtml(store) {
  const records = store.estimates
    .filter((estimate) => estimate.status === ESTIMATE_STATUS.DONE && estimate.project.quick && actualTotal(estimate) > 0)
    .map((estimate) => ({ id: estimate.id, title: estimate.project.name, answers: estimate.project.quick, actualHours: actualTotal(estimate) }));
  if (records.length < MIN_BACKTEST_RECORDS) {
    return `<p class="note">El chequeo de calibración necesita ${MIN_BACKTEST_RECORDS} iniciativas terminadas con las preguntas rápidas (hay ${records.length}). Mide si el P80 acierta 8 de cada 10 veces.</p>`;
  }
  const result = runBacktest(records, { runs: BACKTEST_RUNS });
  return `<table class="data-table compact">
    <thead><tr><th>Modelo</th><th>P50 acertó</th><th>P80 acertó</th><th>Veredicto</th></tr></thead>
    <tbody>${result.models.map((model) => `<tr><td>${MODEL_LABELS[model.kind]}</td><td>${share(model.coverage[50])}</td><td>${share(model.coverage[80])}</td><td>${escapeHtml(model.verdict)}</td></tr>`).join('')}</tbody>
  </table>
  <p class="note">Pasa si el P80 acierta entre ${share(BACKTEST_ACCEPTANCE.p80.min)} y ${share(BACKTEST_ACCEPTANCE.p80.max)} de las veces y el P50 entre ${share(BACKTEST_ACCEPTANCE.p50.min)} y ${share(BACKTEST_ACCEPTANCE.p50.max)}.</p>`;
}

/** Historial: qué tan bien venís estimando y si los rangos aciertan. */
export function renderHistoryView(store) {
  const totals = taskTotals(store);
  const calibrationRows = COMPLEXITY_OPTIONS
    .map((complexity) => ({ complexity, calibration: calibrationFor(store.history, complexity), count: totals.filter((total) => total.complexity === complexity).length }))
    .filter((row) => row.count > 0);
  const doneEstimates = store.estimates.filter((estimate) => estimate.status === ESTIMATE_STATUS.DONE);

  return `<header class="view-header"><h1>Historial</h1><p class="muted">Cada iniciativa terminada mejora las próximas estimaciones de la misma complejidad.</p></header>
    ${totals.length
      ? `<div class="history-grid">
          <section><h2 class="section-title">Estimado contra real</h2>${renderAccuracyScatter(totals.map((total) => ({ ...total, label: total.label })))}
            <p class="note">Sobre la diagonal: llevó más de lo estimado.</p></section>
          <section><h2 class="section-title">Por complejidad</h2>
            <table class="data-table compact"><thead><tr><th>Complejidad</th><th>Iniciativas</th><th>Real / estimado</th><th>Subestimadas</th></tr></thead>
            <tbody>${calibrationRows.map(({ complexity, calibration, count }) => `<tr><td>${COMPLEXITY_LABELS[complexity]}</td><td>${count}</td><td>${calibration ? `×${formatDays(calibration.medianRatio)}` : `faltan datos (${MIN_CALIBRATION_SAMPLES} etapas)`}</td><td>${calibration ? share(calibration.underestimatedShare) : '—'}</td></tr>`).join('')}</tbody></table>
            <h2 class="section-title">¿Los rangos aciertan?</h2>${backtestHtml(store)}
          </section>
        </div>`
      : '<p class="empty-state">Todavía no hay tareas terminadas. Cuando termines una, abrila y cargá las horas reales en "Terminé la tarea".</p>'}
    ${doneEstimates.length ? `<section class="view-section"><h2 class="section-title">Terminadas</h2>
      <table class="data-table compact"><thead><tr><th>Tarea</th><th>Estimado</th><th>Real</th><th>Desvío</th></tr></thead><tbody>${doneEstimates
        .map((estimate) => {
          const estimated = estimate.summary?.expectedHours;
          const actual = actualTotal(estimate);
          const deviation = estimated ? Math.round(((actual - estimated) / estimated) * 100) : null;
          return `<tr><td><button type="button" class="button link" data-action="open-estimate" data-id="${escapeHtml(estimate.id)}">${escapeHtml(estimate.project.name || 'Sin nombre')}</button></td><td>${estimated ? formatHours(estimated) : '—'}</td><td>${formatHours(actual)}</td><td>${deviation === null ? '—' : `${deviation > 0 ? '+' : ''}${deviation} %`}</td></tr>`;
        })
        .join('')}</tbody></table></section>` : ''}
    ${store.history.length ? `<div class="row-actions"><button type="button" class="button danger" data-action="clear-history">Borrar historial (${store.history.length} registros)</button></div>` : ''}`;
}

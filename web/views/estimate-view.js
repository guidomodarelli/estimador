import {
  COMMUNICATED_PERCENTILE,
  COMPLEXITY_LABELS,
  CONTINGENCY_ACTIVITY_NAME,
  COMPLEXITY_OPTIONS,
  DEFAULT_DEVELOPMENT_HOURS,
  describeUncertaintyModel,
  formatDate,
  formatDays,
  formatHours,
  renderMarkdownSummary,
  RFC_PART_LABELS,
  RFC_PART_OPTIONS,
  SUMMARY_TECHNICAL_DETAIL_HEADING,
} from '../../src/core/index.js';
import { renderGantt } from '../charts/gantt.js';
import { renderProbabilityCurve } from '../charts/probability-curve.js';
import { renderStepBars } from '../charts/step-bars.js';
import { byId, escapeHtml, optionsHtml } from '../utils/dom.js';
import { markdownToHtml } from '../utils/markdown.js';
import { iconSvg } from '../utils/icons.js';
import { actualTotal, calibrationFor, ESTIMATE_STATUS, isDoubleCountWarning, referenceClassRatios } from '../state/estimates.js';
import { TAB } from '../state/store.js';

export const NEW_PERSON_OPTION_VALUE = '__new-person__';
const CONFIDENCE_PERCENTILE = COMMUNICATED_PERCENTILE;

/** Clave del plegable de etapas de una estimación: lo que el usuario elige se recuerda por estimación. */
export const stagesFoldKey = (estimateId) => `stages:${estimateId}`;

/** Estado de la tabla de etapas cuando el usuario las ajustó a mano (lo usan la vista y la app). */
export const CUSTOMIZED_STAGES_STATUS_HTML = 'Ajustaste las etapas a mano, así que la complejidad ya no las recalcula. <button type="button" class="button link" data-action="regenerate-stages">Volver a calcularlas</button>';

const TABS = Object.freeze([
  { id: TAB.ESTIMATE, label: 'Estimar' },
  { id: TAB.PLAN, label: 'Plan' },
  { id: TAB.UNCERTAINTY, label: 'Incertidumbre' },
  { id: TAB.SHARE, label: 'Compartir' },
]);


/* ───────────── Encabezado y pestañas ───────────── */

function headerHtml(estimate) {
  const isDone = estimate.status === ESTIMATE_STATUS.DONE;
  return `<header class="estimate-header">
    <div class="estimate-title">
      <input type="text" class="title-input" aria-label="Nombre de la tarea" placeholder="Nombre de la tarea" data-bind="project.name" data-sidebar-refresh>
      <p class="headline" id="estimate-headline">${isDone ? `Terminada · real ${formatHours(actualTotal(estimate))}` : ''}</p>
    </div>
    <div class="header-actions">
      ${isDone ? '<button type="button" class="button" data-action="reopen-estimate">Reabrir</button>' : ''}
      <button type="button" class="button" data-action="duplicate-estimate">Duplicar</button>
      <button type="button" class="button icon-text danger" data-action="delete-estimate">Eliminar</button>
    </div>
  </header>`;
}

function tabsHtml(activeTab) {
  return `<div class="tabs" role="tablist" aria-label="Secciones de la estimación">${TABS.map(
    (tab) => `<button type="button" role="tab" id="tab-${tab.id}" aria-selected="${tab.id === activeTab}" aria-controls="tab-panel" tabindex="${tab.id === activeTab ? 0 : -1}" data-action="select-tab" data-tab="${tab.id}">${tab.label}</button>`,
  ).join('')}</div>`;
}

/* ───────────── Pestaña Estimar ───────────── */

function choiceRowHtml(bindPath, label, options) {
  const name = bindPath.replace(/\./g, '-');
  return `<div class="choice-row" role="radiogroup" aria-label="${escapeHtml(label)}">
    <span class="choice-label">${escapeHtml(label)}</span>
    <span class="segmented">${options.map((option) => `<label><input type="radio" name="${name}" value="${escapeHtml(option.value)}" data-bind="${bindPath}"><span>${escapeHtml(option.label)}</span></label>`).join('')}</span>
  </div>`;
}

function quickHtml(context) {
  const { estimate, history } = context;
  const answers = estimate.project.quick;
  const historyRatios = referenceClassRatios(history, answers.complexity);
  const calibration = calibrationFor(history, answers.complexity);
  const selectedParts = answers.rfcParts ?? RFC_PART_OPTIONS;
  const historyNote = historyRatios
    ? `<p class="note">El rango sale de tus ${historyRatios.length} iniciativas terminadas de esta complejidad.</p>`
    : calibration
      ? `<label class="inline-check"><input type="checkbox" data-bind="project.quick.applyCalibration"> Ajustar con mi historial (lo real fue ×${formatDays(calibration.medianRatio)} lo estimado)</label>`
      : '';
  const status = answers.customized
    ? CUSTOMIZED_STAGES_STATUS_HTML
    : 'RFC → Desarrollo → Pruebas → Rollout → Demo o evidencia: los tiempos salen de la complejidad.';
  return `<section class="quick" aria-labelledby="quick-heading">
    <h2 id="quick-heading" class="section-title">Iniciativa</h2>
    ${choiceRowHtml('project.quick.complexity', 'Complejidad', COMPLEXITY_OPTIONS.map((complexity) => ({ value: complexity, label: COMPLEXITY_LABELS[complexity] })))}
    <div class="choice-row">
      <span class="choice-label" id="rfc-parts-label">El RFC incluye</span>
      <span class="chips" role="group" aria-labelledby="rfc-parts-label">${RFC_PART_OPTIONS.map((part) => `<label class="chip"><input type="checkbox" data-action="toggle-rfc-part" data-rfc-part="${escapeHtml(part)}"${selectedParts.includes(part) ? ' checked' : ''}>${escapeHtml(RFC_PART_LABELS[part])}</label>`).join('')}</span>
    </div>
    <div class="choice-row">
      <label class="choice-label" for="development-hours">Horas de desarrollo</label>
      <span class="inline-fields">
        <input id="development-hours" type="number" min="0.5" step="0.5" inputmode="decimal" class="hours-input" placeholder="${DEFAULT_DEVELOPMENT_HOURS[answers.complexity]}" data-bind="project.quick.developmentHours" data-type="optional-number" aria-describedby="development-hint">
        <small id="development-hint">lo más probable · vacío = ${DEFAULT_DEVELOPMENT_HOURS[answers.complexity]} h sugeridas</small>
      </span>
    </div>
    <div class="choice-row">
      <label class="choice-label" for="start-date">Inicio</label>
      <input id="start-date" type="date" class="date-input" data-bind="project.startDate">
    </div>
    ${historyNote}
    <p class="note" id="quick-status">${status}</p>
  </section>`;
}

/** "Empieza después de X" en texto legible. */
export function describeStart(stage, stages) {
  const names = (stage.dependsOn ?? []).map((dependencyId) => stages.find((candidate) => candidate.id === dependencyId)?.name).filter(Boolean);
  if (!names.length) return 'Al inicio';
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} y ${names.at(-1)}`;
}

function assigneeSelectHtml(stage, index, team) {
  const peopleOptions = team.people.map((person) => ({ value: person.id, label: person.name || person.id }));
  return `<select class="cell-select" aria-label="Responsable de ${escapeHtml(stage.name)}" data-assignee-index="${index}">${optionsHtml(peopleOptions, stage.assigneeId ?? peopleOptions[0]?.value)}<option value="${NEW_PERSON_OPTION_VALUE}">+ Agregar persona…</option></select>`;
}

function stageOptionsRowHtml(stage, index, stages, openState, team, columnCount) {
  const chips = stages
    .filter((candidate) => candidate.id !== stage.id)
    .map((candidate) => `<label class="chip"><input type="checkbox" data-action="toggle-dependency" data-stage-index="${index}" data-dependency-id="${escapeHtml(candidate.id)}"${(stage.dependsOn ?? []).includes(candidate.id) ? ' checked' : ''}>${escapeHtml(candidate.name)}</label>`)
    .join('');
  return `<tr class="stage-options-row"><td colspan="${columnCount}">
    <div class="stage-options">
      <div class="option-group">
        <span class="option-label">Empieza después de</span>
        <div class="chips">${chips}</div>
      </div>
      <label class="option-inline">Responsable ${assigneeSelectHtml(stage, index, team)}</label>
      <label class="option-inline">Espera después (días laborales)
        <input type="number" min="0" step="1" placeholder="0" class="small-number" data-bind="project.stages.${index}.waitWorkingDaysAfter" data-type="number">
      </label>
      <div class="inline-add"${openState.addingPerson ? '' : ' hidden'}>
        <input type="text" placeholder="Nombre de la persona" aria-label="Nombre de la nueva persona" data-new-person-index="${index}" data-focus-key="new-person-${index}">
        <button type="button" class="button primary" data-action="confirm-new-person" data-index="${index}">Agregar</button>
        <button type="button" class="button" data-action="cancel-new-person" data-index="${index}">Cancelar</button>
      </div>
      <div class="row-actions">
        <button type="button" class="button primary" data-action="close-stage-options" data-index="${index}">Listo</button>
        <button type="button" class="button" data-action="cancel-stage-options" data-index="${index}">Cancelar</button>
        <button type="button" class="button link" data-action="reset-dependencies" data-index="${index}">Volver al orden de la plantilla</button>
      </div>
    </div>
  </td></tr>`;
}

function stageTableHtml(context) {
  const { estimate, team, openStageRows } = context;
  const stages = estimate.project.stages;
  // Con una sola persona la columna Responsable no aporta: queda en "más opciones".
  const showAssignee = team.people.length > 1;
  const columnCount = showAssignee ? 9 : 8;
  const rows = stages
    .map((stage, index) => {
      const disabled = stage.included === false;
      const openState = openStageRows.get(stage.id);
      return `<tr class="stage-row${disabled ? ' disabled' : ''}">
        <td><input type="checkbox" aria-label="Incluir ${escapeHtml(stage.name)}" data-bind="project.stages.${index}.included" data-invert-false data-rerender></td>
        <td><input type="text" class="cell-text" aria-label="Nombre de la etapa" data-bind="project.stages.${index}.name"></td>
        <td><input type="number" min="0" step="0.5" class="cell-number" aria-label="Horas mínimas de ${escapeHtml(stage.name)}" data-bind="project.stages.${index}.optimistic" data-type="number"></td>
        <td><input type="number" min="0" step="0.5" class="cell-number" aria-label="Horas probables de ${escapeHtml(stage.name)}" data-bind="project.stages.${index}.mostLikely" data-type="number"></td>
        <td><input type="number" min="0" step="0.5" class="cell-number" aria-label="Horas máximas de ${escapeHtml(stage.name)}" data-bind="project.stages.${index}.pessimistic" data-type="number"></td>
        <td class="computed" id="stage-expected-${index}">—</td>
        ${showAssignee ? `<td>${assigneeSelectHtml(stage, index, team)}</td>` : ''}
        <td><button type="button" class="button link start-after" data-action="toggle-stage-options" data-index="${index}" aria-expanded="${Boolean(openState)}">${escapeHtml(describeStart(stage, stages))}</button>${stage.waitWorkingDaysAfter ? `<small class="wait-note">+${stage.waitWorkingDaysAfter} d de espera</small>` : ''}</td>
        <td><button type="button" class="button icon" data-action="remove-stage" data-index="${index}" aria-label="Eliminar ${escapeHtml(stage.name)}">${iconSvg('close')}</button></td>
      </tr>${openState ? stageOptionsRowHtml(stage, index, stages, openState, team, columnCount) : ''}`;
    })
    .join('');
  // Con solo la complejidad alcanza: la tabla queda plegada hasta que alguien la abre o la edita.
  // Lo que el usuario eligió al abrir o cerrar manda; si no eligió nada, se abre solo cuando hay ajustes a mano.
  const foldKey = stagesFoldKey(estimate.id);
  const isOpen = openStageRows.size > 0 || (context.foldStates?.get(foldKey) ?? Boolean(estimate.project.quick?.customized));
  const includedCount = stages.filter((stage) => stage.included !== false).length;
  return `<details class="fold stages" data-fold-key="${escapeHtml(foldKey)}"${isOpen ? ' open' : ''}>
    <summary><span class="section-title" id="stages-heading">Etapas</span> <span class="summary-hint">${includedCount} etapas · horas mín., probables y máx. de cada una</span></summary>
    <div class="table-scroll"><table class="stage-table" aria-labelledby="stages-heading">
      <thead><tr><th><span class="sr-only">Incluir</span></th><th>Etapa</th><th title="Horas si todo sale bien">Mín.</th><th title="Horas más probables">Probable</th><th title="Horas si se complica">Máx.</th><th title="Promedio ponderado: (mín. + 4 × probable + máx.) / 6">Esperado</th>${showAssignee ? '<th>Responsable</th>' : ''}<th>Después de</th><th><span class="sr-only">Eliminar</span></th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td></td><td>Total</td><td id="total-optimistic">—</td><td id="total-most-likely">—</td><td id="total-pessimistic">—</td><td id="total-expected" class="computed">—</td><td colspan="${showAssignee ? 3 : 2}" id="total-note"></td></tr></tfoot>
    </table></div>
    <div class="row-actions"><button type="button" class="button" data-action="add-stage">+ Etapa</button></div>
  </details>`;
}

function actualsHtml(context) {
  const { estimate } = context;
  const included = estimate.project.stages.filter((stage) => stage.included !== false);
  const isDone = estimate.status === ESTIMATE_STATUS.DONE;
  return `<details class="fold"${isDone ? ' open' : ''}>
    <summary>${isDone ? 'Horas reales registradas' : 'Terminé la iniciativa: registrar horas reales'}</summary>
    <p class="note">Con 5 iniciativas terminadas de la misma complejidad, el rango de las próximas sale de tu historial.</p>
    <div class="actuals-grid">${included
      .map((stage) => `<label>${escapeHtml(stage.name)}<input type="number" min="0" step="0.5" placeholder="horas" data-bind="actuals.${escapeHtml(stage.id)}" data-type="optional-number"${isDone ? ' disabled' : ''}></label>`)
      .join('')}</div>
    ${isDone ? '' : '<div class="row-actions"><button type="button" class="button primary" data-action="complete-estimate">Guardar y marcar terminada</button></div>'}
  </details>`;
}

function detailsHtml() {
  return `<details class="fold">
    <summary>Supuestos y dependencias externas</summary>
    <label class="block">Supuestos <small>(uno por línea)</small><textarea rows="3" data-bind="project.assumptions" data-type="lines"></textarea></label>
    <label class="block">Dependencias externas <small>(una por línea)</small><textarea rows="2" data-bind="project.externalDependencies" data-type="lines"></textarea></label>
  </details>`;
}

function estimateTabHtml(context) {
  return `<div class="estimate-grid">
    <div class="estimate-main">${quickHtml(context)}${stageTableHtml(context)}${detailsHtml()}${actualsHtml(context)}</div>
    <aside class="estimate-aside" aria-label="Resultado">
      <div id="estimate-stats" class="stats"></div>
      <h2 class="section-title">De dónde sale la fecha</h2>
      <div id="step-bars"></div>
      <div id="warnings"></div>
    </aside>
  </div>`;
}

/* ───────────── Pestaña Incertidumbre ───────────── */

function risksHtml(context) {
  const { project } = context.estimate;
  const stageOptions = [{ value: '', label: 'General (al final)' }, ...project.stages.filter((stage) => stage.included !== false).map((stage) => ({ value: stage.id, label: stage.name }))];
  const rows = (project.risks ?? [])
    .map((risk, index) => `<tr>
      <td><input type="text" class="cell-text" aria-label="Descripción del riesgo" data-bind="project.risks.${index}.description"></td>
      <td><input type="number" min="0" max="100" step="5" class="cell-number" aria-label="Probabilidad (%)" data-bind="project.risks.${index}.probability" data-type="percent"></td>
      <td><input type="number" min="0" step="0.5" class="cell-number" aria-label="Impacto (h)" data-bind="project.risks.${index}.impactHours" data-type="number"></td>
      <td><select class="cell-select" aria-label="Etapa afectada" data-bind="project.risks.${index}.activityId" data-type="optional-text">${optionsHtml(stageOptions, risk.activityId ?? '')}</select></td>
      <td><input type="checkbox" aria-label="Ya contemplado en las horas máximas" data-bind="project.risks.${index}.includedInPessimistic"></td>
      <td><button type="button" class="button icon" data-action="remove-risk" data-index="${index}" aria-label="Eliminar riesgo">${iconSvg('close')}</button></td>
    </tr>`)
    .join('');
  return `<section aria-labelledby="risks-heading">
    <div class="section-head"><h2 id="risks-heading" class="section-title">Riesgos</h2><button type="button" class="button" data-action="add-risk">+ Riesgo</button></div>
    ${rows ? `<div class="table-scroll"><table class="data-table">
      <thead><tr><th>Riesgo</th><th>Prob. %</th><th>Impacto h</th><th>Afecta a</th><th title="Ya contemplado en las horas máximas de la etapa: no se suma de nuevo">Ya en el máx.</th><th><span class="sr-only">Eliminar</span></th></tr></thead>
      <tbody>${rows}</tbody></table></div>` : '<p class="note">Sin riesgos. Agregá los concretos: su probabilidad por su impacto se suma como contingencia.</p>'}
  </section>`;
}

/* ───────────── Render principal ───────────── */

/** Esqueleto de la vista; los resultados se completan con `renderEstimateResults`. */
export function renderEstimateView(context) {
  const { ui } = context;
  const panels = {
    [TAB.ESTIMATE]: () => estimateTabHtml(context),
    [TAB.PLAN]: () => '<div id="plan-chart" class="gantt-wrapper table-scroll"></div><div class="legend"><span class="legend-item">Etapa</span><span class="legend-item critical">Cadena crítica (con borde)</span><span class="legend-item wait">Espera</span><span class="legend-item offday">No laborable</span><span class="legend-item p80">Fin con 80 % de confianza</span><span class="legend-item today">Hoy</span></div><p class="note" id="plan-note"></p>',
    [TAB.UNCERTAINTY]: () => `<div class="uncertainty-grid"><div><h2 class="section-title">Probabilidad de terminar antes de cada fecha</h2><div id="probability-curve"></div><p class="note" id="model-note"></p></div><div id="percentiles"></div></div>${risksHtml(context)}`,
    [TAB.SHARE]: () => `<p class="muted share-intro">Así lo va a leer quien lo reciba. Se copia en Markdown, listo para pegar en un documento, Slack o Jira.</p>
      <div class="row-actions"><button type="button" class="button primary" data-action="copy-summary" title="Copiar resumen (Alt+C)">Copiar resumen</button><button type="button" class="button" data-action="download-summary">Descargar .md</button><button type="button" class="button" data-action="export-estimate">Exportar esta estimación (JSON)</button></div>
      <article id="share-preview" class="share-preview" aria-label="Vista previa del resumen"></article>`,
  };
  return `${headerHtml(context.estimate)}${tabsHtml(ui.tab)}<div id="tab-panel" role="tabpanel" aria-labelledby="tab-${ui.tab}" class="tab-panel">${panels[ui.tab]()}</div>`;
}

/** La fecha de rollout es lo que se comparte: encabeza el resultado con su P80 al lado. */
function leadStatHtml(result) {
  const rollout = result.milestones?.[0];
  if (!rollout) return '';
  const p80 = rollout.percentiles.find((row) => row.percentile === CONFIDENCE_PERCENTILE);
  return `<div class="stat lead">
    <span class="stat-label">Fecha de rollout</span>
    <span class="stat-value">${formatDate(rollout.plannedDate)}</span>
    <span class="stat-hint">${p80 ? `Con 80 % de confianza, a más tardar el ${formatDate(p80.endDate)}` : 'Fin de la etapa de rollout'}</span>
  </div>`;
}

function statsHtml(result) {
  const p80 = result.simulation?.percentiles.find((row) => row.percentile === CONFIDENCE_PERCENTILE);
  return `
    ${leadStatHtml(result)}
    <div class="stat"><span class="stat-label">Fin probable</span><span class="stat-value">${formatDate(result.schedule.endDate)}</span><span class="stat-hint">${result.duration.scheduledWorkingDays} días laborales</span></div>
    ${p80 ? `<div class="stat"><span class="stat-label">Fin (P80)</span><span class="stat-value">${formatDate(p80.endDate)}</span><span class="stat-hint">${p80.workingDays} días laborales · 8 de cada 10 escenarios</span></div>` : ''}
    <div class="stat"><span class="stat-label">Esfuerzo esperado</span><span class="stat-value">${formatHours(result.effort.totalExpected)}</span><span class="stat-hint">entre ${formatHours(result.effort.optimistic)} y ${formatHours(result.effort.pessimistic + result.effort.contingencyHours)}</span></div>`;
}

function warningsHtml(result) {
  if (!result.warnings.length) return '';
  return `<h2 class="section-title warnings-title">Para revisar</h2><ul class="warnings">${result.warnings
    .map((warning) => `<li>${escapeHtml(warning)}${isDoubleCountWarning(warning) ? ' <button type="button" class="button link" data-action="acknowledge-meetings">Son reuniones distintas, no avisar más</button>' : ''}</li>`)
    .join('')}</ul>`;
}

/** Vista previa del resumen: lo que lee producto a la vista y el detalle de cálculo plegado. */
function sharePreviewHtml(markdown) {
  const [summary, technical] = markdown.split(SUMMARY_TECHNICAL_DETAIL_HEADING);
  return `${markdownToHtml(summary)}${technical ? `<details class="fold"><summary>Detalle técnico</summary>${markdownToHtml(technical)}</details>` : ''}`;
}

/** Completa las zonas calculadas de la pestaña activa sin tocar los controles. */
export function renderEstimateResults(result, context) {
  const { estimate, team, ui } = context;
  const p80 = result.simulation?.percentiles.find((row) => row.percentile === CONFIDENCE_PERCENTILE);
  const rollout = result.milestones?.[0];
  const rolloutP80 = rollout?.percentiles.find((row) => row.percentile === CONFIDENCE_PERCENTILE);
  const headline = byId('estimate-headline');
  if (headline && estimate.status !== ESTIMATE_STATUS.DONE) {
    // La fecha de rollout encabeza; las horas van al final porque no son lo que se comunica.
    const rolloutText = rollout ? `Rollout ${formatDate(rollout.plannedDate)}${rolloutP80 ? ` (P80 ${formatDate(rolloutP80.endDate)})` : ''} · ` : '';
    headline.textContent = `${rolloutText}fin ${formatDate(result.schedule.endDate)}${p80 ? ` (P80 ${formatDate(p80.endDate)})` : ''} · ${formatHours(result.effort.totalExpected)}`;
  }

  if (ui.tab === TAB.ESTIMATE) {
    byId('estimate-stats').innerHTML = statsHtml(result);
    const capacity = result.capacity.people[0];
    byId('step-bars').innerHTML = renderStepBars([
      { label: 'Jornadas completas', hint: `÷ ${formatHours(capacity.workdayHours)} por día`, days: result.duration.naiveWorkdays },
      { label: 'Capacidad real', hint: `÷ ${formatHours(result.capacity.teamDailyCapacity)} efectivas por día`, days: result.duration.idealTeamWorkdays },
      { label: 'Dependencias y calendario', hint: 'esperas, feriados, orden', days: result.duration.scheduledWorkingDays },
      ...(p80 ? [{ label: 'Con incertidumbre (P80)', hint: '8 de cada 10 escenarios', days: p80.workingDays, emphasis: true }] : []),
    ]);
    byId('warnings').innerHTML = warningsHtml(result);
    estimate.project.stages.forEach((stage, index) => {
      const cell = byId(`stage-expected-${index}`);
      const computed = result.stages.find((candidate) => candidate.id === stage.id);
      if (cell) cell.textContent = computed ? formatHours(computed.expected + computed.contingencyHours) : '—';
    });
    byId('total-optimistic').textContent = formatHours(result.effort.optimistic);
    byId('total-most-likely').textContent = formatHours(result.effort.mostLikely);
    byId('total-pessimistic').textContent = formatHours(result.effort.pessimistic);
    byId('total-expected').textContent = formatHours(result.effort.totalExpected);
    byId('total-note').textContent = result.effort.contingencyHours ? `incluye ${formatHours(result.effort.contingencyHours)} de contingencia por riesgos` : '';
  }

  if (ui.tab === TAB.PLAN) {
    const contingency = result.schedule.activities.find((activity) => !result.stages.some((stage) => stage.id === activity.id));
    const rows = [...result.stages, ...(contingency ? [{ ...contingency, name: CONTINGENCY_ACTIVITY_NAME }] : [])];
    const dependencies = result.schedule.activities.flatMap((activity) => {
      const stage = estimate.project.stages.find((candidate) => candidate.id === activity.id);
      return (stage?.dependsOn ?? []).map((dependencyId) => ({ from: dependencyId, to: activity.id }));
    });
    byId('plan-chart').innerHTML = renderGantt({
      rows,
      scheduledActivities: result.schedule.activities,
      dependencies,
      waitDaysById: new Map(result.stages.map((stage) => [stage.id, stage.waitWorkingDaysAfter])),
      criticalChain: result.schedule.criticalChain,
      startDate: result.schedule.startDate,
      endDate: result.schedule.endDate,
      calendar: { ...team.calendar, startDate: result.schedule.startDate },
      markers: [
        ...(p80 ? [{ date: p80.endDate, label: `P80 ${formatDate(p80.endDate)}`, kind: 'p80' }] : []),
        { date: context.todayIso, label: 'Hoy', kind: 'today' },
      ],
    });
    const chainNames = result.schedule.criticalChain.map((stageId) => result.stages.find((stage) => stage.id === stageId)?.name ?? 'Contingencia');
    byId('plan-note').textContent = `${result.duration.scheduledWorkingDays} días laborales. Las etapas de la cadena crítica (${chainNames.join(' → ')}) definen la fecha: acortar otra etapa no la adelanta.`;
  }

  if (ui.tab === TAB.UNCERTAINTY && result.simulation) {
    byId('probability-curve').innerHTML = renderProbabilityCurve(result.simulation.endDateHistogram, result.simulation.percentiles);
    byId('model-note').textContent = `${describeUncertaintyModel(result.simulation.uncertaintyModel)} No es una garantía de cumplimiento.`;
    byId('percentiles').innerHTML = `<table class="data-table compact"><thead><tr><th>Confianza</th><th>Fin</th><th>Días</th><th>Esfuerzo</th></tr></thead><tbody>${result.simulation.percentiles
      .map((row) => `<tr${row.percentile === CONFIDENCE_PERCENTILE ? ' class="highlight"' : ''}><td>${row.percentile} % (P${row.percentile})</td><td>${formatDate(row.endDate)}</td><td>${row.workingDays}</td><td>${formatHours(row.effortHours)}</td></tr>`)
      .join('')}</tbody></table>`;
  }

  if (ui.tab === TAB.SHARE) byId('share-preview').innerHTML = sharePreviewHtml(renderMarkdownSummary(result));
}

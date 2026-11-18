import {
  COMPLEXITY_LABELS,
  COMPLEXITY_OPTIONS,
  DEFAULT_DEVELOPMENT_HOURS,
  describeUncertaintyModel,
  formatDate,
  formatDays,
  formatHours,
  renderMarkdownSummary,
  RFC_PART_LABELS,
  RFC_PART_OPTIONS,
} from '../../src/core/index.js';
import { renderGantt } from '../charts/gantt.js';
import { renderProbabilityCurve } from '../charts/probability-curve.js';
import { renderStepBars } from '../charts/step-bars.js';
import { byId, escapeHtml, optionsHtml } from '../utils/dom.js';
import { iconSvg } from '../utils/icons.js';
import { actualTotal, calibrationFor, ESTIMATE_STATUS, isDoubleCountWarning, referenceClassRatios } from '../state/estimates.js';
import { TAB } from '../state/store.js';

export const NEW_PERSON_OPTION_VALUE = '__new-person__';

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
    ? `Editaste las etapas a mano: las respuestas ya no las regeneran. <button type="button" class="button link" data-action="regenerate-stages">Regenerar</button>`
    : 'RFC → Desarrollo → Pruebas → Rollout → Demo o evidencia: los tiempos salen de la complejidad.';
  return `<section class="quick" aria-labelledby="quick-heading">
    <h2 id="quick-heading" class="section-title">Preguntas</h2>
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
        <td><input type="number" min="0" step="0.5" class="cell-number" aria-label="Optimista de ${escapeHtml(stage.name)}" data-bind="project.stages.${index}.optimistic" data-type="number"></td>
        <td><input type="number" min="0" step="0.5" class="cell-number" aria-label="Probable de ${escapeHtml(stage.name)}" data-bind="project.stages.${index}.mostLikely" data-type="number"></td>
        <td><input type="number" min="0" step="0.5" class="cell-number" aria-label="Pesimista de ${escapeHtml(stage.name)}" data-bind="project.stages.${index}.pessimistic" data-type="number"></td>
        <td class="computed" id="stage-expected-${index}">—</td>
        ${showAssignee ? `<td>${assigneeSelectHtml(stage, index, team)}</td>` : ''}
        <td><button type="button" class="button link start-after" data-action="toggle-stage-options" data-index="${index}" aria-expanded="${Boolean(openState)}">${escapeHtml(describeStart(stage, stages))}</button>${stage.waitWorkingDaysAfter ? `<small class="wait-note">+${stage.waitWorkingDaysAfter} d de espera</small>` : ''}</td>
        <td><button type="button" class="button icon" data-action="remove-stage" data-index="${index}" aria-label="Eliminar ${escapeHtml(stage.name)}">${iconSvg('close')}</button></td>
      </tr>${openState ? stageOptionsRowHtml(stage, index, stages, openState, team, columnCount) : ''}`;
    })
    .join('');
  return `<section class="stages" aria-labelledby="stages-heading">
    <div class="section-head">
      <h2 id="stages-heading" class="section-title">Etapas</h2>
      <button type="button" class="button" data-action="add-stage">+ Etapa</button>
    </div>
    <div class="table-scroll"><table class="stage-table">
      <thead><tr><th><span class="sr-only">Incluir</span></th><th>Etapa</th><th title="Optimista">O</th><th title="Más probable">M</th><th title="Pesimista">P</th><th>Esperado</th>${showAssignee ? '<th>Responsable</th>' : ''}<th>Después de</th><th><span class="sr-only">Eliminar</span></th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td></td><td>Total</td><td id="total-optimistic">—</td><td id="total-most-likely">—</td><td id="total-pessimistic">—</td><td id="total-expected" class="computed">—</td><td colspan="${showAssignee ? 3 : 2}" id="total-note"></td></tr></tfoot>
    </table></div>
  </section>`;
}

function actualsHtml(context) {
  const { estimate } = context;
  const included = estimate.project.stages.filter((stage) => stage.included !== false);
  const isDone = estimate.status === ESTIMATE_STATUS.DONE;
  return `<details class="fold"${isDone ? ' open' : ''}>
    <summary>${isDone ? 'Horas reales registradas' : 'Terminé la tarea: registrar horas reales'}</summary>
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
      <td><input type="checkbox" aria-label="Ya contemplado en la pesimista" data-bind="project.risks.${index}.includedInPessimistic"></td>
      <td><button type="button" class="button icon" data-action="remove-risk" data-index="${index}" aria-label="Eliminar riesgo">${iconSvg('close')}</button></td>
    </tr>`)
    .join('');
  return `<section aria-labelledby="risks-heading">
    <div class="section-head"><h2 id="risks-heading" class="section-title">Riesgos</h2><button type="button" class="button" data-action="add-risk">+ Riesgo</button></div>
    ${rows ? `<div class="table-scroll"><table class="data-table">
      <thead><tr><th>Riesgo</th><th>Prob. %</th><th>Impacto h</th><th>Afecta a</th><th title="Ya contemplado en la estimación pesimista">Ya en P</th><th><span class="sr-only">Eliminar</span></th></tr></thead>
      <tbody>${rows}</tbody></table></div>` : '<p class="note">Sin riesgos. Agregá los concretos: probabilidad × impacto se suma como contingencia.</p>'}
  </section>`;
}

/* ───────────── Render principal ───────────── */

/** Esqueleto de la vista; los resultados se completan con `renderEstimateResults`. */
export function renderEstimateView(context) {
  const { ui } = context;
  const panels = {
    [TAB.ESTIMATE]: () => estimateTabHtml(context),
    [TAB.PLAN]: () => '<div id="plan-chart" class="gantt-wrapper table-scroll"></div><div class="legend"><span class="legend-item">Etapa</span><span class="legend-item critical">Cadena crítica</span><span class="legend-item wait">Espera</span><span class="legend-item offday">No laborable</span></div><p class="note" id="plan-note"></p>',
    [TAB.UNCERTAINTY]: () => `<div class="uncertainty-grid"><div><h2 class="section-title">Probabilidad de terminar antes de cada fecha</h2><div id="probability-curve"></div><p class="note" id="model-note"></p></div><div id="percentiles"></div></div>${risksHtml(context)}`,
    [TAB.SHARE]: () => `<div class="row-actions"><button type="button" class="button primary" data-action="copy-summary">Copiar resumen (Markdown)</button><button type="button" class="button" data-action="download-summary">Descargar .md</button><button type="button" class="button" data-action="export-estimate">Exportar esta estimación (JSON)</button></div><pre id="share-preview" class="share-preview"></pre>`,
  };
  return `${headerHtml(context.estimate)}${tabsHtml(ui.tab)}<div id="tab-panel" role="tabpanel" aria-labelledby="tab-${ui.tab}" class="tab-panel">${panels[ui.tab]()}</div>`;
}

/** La fecha de rollout es lo que se comparte: encabeza el resultado con su P80 al lado. */
function leadStatHtml(result) {
  const rollout = result.milestones?.[0];
  if (!rollout) return '';
  const p80 = rollout.percentiles.find((row) => row.percentile === 80);
  return `<div class="stat lead">
    <span class="stat-label">Fecha de rollout</span>
    <span class="stat-value">${formatDate(rollout.plannedDate)}</span>
    <span class="stat-hint">${p80 ? `Con 80 % de confianza, a más tardar el ${formatDate(p80.endDate)}` : 'Fin de la etapa de rollout'}</span>
  </div>`;
}

function statsHtml(result) {
  const p80 = result.simulation?.percentiles.find((row) => row.percentile === 80);
  return `
    ${leadStatHtml(result)}
    <div class="stat"><span class="stat-label">Fin probable</span><span class="stat-value">${formatDate(result.schedule.endDate)}</span><span class="stat-hint">${result.duration.scheduledWorkingDays} días laborales</span></div>
    ${p80 ? `<div class="stat"><span class="stat-label">Fin P80</span><span class="stat-value">${formatDate(p80.endDate)}</span><span class="stat-hint">${p80.workingDays} días laborales</span></div>` : ''}
    <div class="stat"><span class="stat-label">Esfuerzo esperado</span><span class="stat-value">${formatHours(result.effort.totalExpected)}</span><span class="stat-hint">${formatHours(result.effort.optimistic)} – ${formatHours(result.effort.pessimistic + result.effort.contingencyHours)}</span></div>`;
}

function warningsHtml(result) {
  if (!result.warnings.length) return '';
  return `<ul class="warnings">${result.warnings
    .map((warning) => `<li>${escapeHtml(warning)}${isDoubleCountWarning(warning) ? ' <button type="button" class="button link" data-action="acknowledge-meetings">Son reuniones distintas, no avisar más</button>' : ''}</li>`)
    .join('')}</ul>`;
}

/** Completa las zonas calculadas de la pestaña activa sin tocar los controles. */
export function renderEstimateResults(result, context) {
  const { estimate, team, ui } = context;
  const p80 = result.simulation?.percentiles.find((row) => row.percentile === 80);
  const headline = byId('estimate-headline');
  if (headline && estimate.status !== ESTIMATE_STATUS.DONE) {
    const rollout = result.milestones?.[0];
    headline.textContent = `${formatHours(result.effort.totalExpected)}${rollout ? ` · rollout ${formatDate(rollout.plannedDate)}` : ''} · fin ${formatDate(result.schedule.endDate)}${p80 ? ` (P80 ${formatDate(p80.endDate)})` : ''}`;
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
    const rows = [...result.stages, ...(contingency ? [{ ...contingency, name: 'Contingencia por riesgos' }] : [])];
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
    });
    const chainNames = result.schedule.criticalChain.map((stageId) => result.stages.find((stage) => stage.id === stageId)?.name ?? 'Contingencia');
    byId('plan-note').textContent = `${result.duration.scheduledWorkingDays} días laborales. La cadena crítica (${chainNames.join(' → ')}) define la fecha: acortar otra etapa no la adelanta.`;
  }

  if (ui.tab === TAB.UNCERTAINTY && result.simulation) {
    byId('probability-curve').innerHTML = renderProbabilityCurve(result.simulation.endDateHistogram, result.simulation.percentiles);
    byId('model-note').textContent = `${describeUncertaintyModel(result.simulation.uncertaintyModel)} No es una garantía de cumplimiento.`;
    byId('percentiles').innerHTML = `<table class="data-table compact"><thead><tr><th>Confianza</th><th>Entrega</th><th>Días</th><th>Esfuerzo</th></tr></thead><tbody>${result.simulation.percentiles
      .map((row) => `<tr${row.percentile === 80 ? ' class="highlight"' : ''}><td>P${row.percentile}</td><td>${formatDate(row.endDate)}</td><td>${row.workingDays}</td><td>${formatHours(row.effortHours)}</td></tr>`)
      .join('')}</tbody></table>`;
  }

  if (ui.tab === TAB.SHARE) byId('share-preview').textContent = renderMarkdownSummary(result);
}

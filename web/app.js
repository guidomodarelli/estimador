import { EstimationInputError, percentError, renderMarkdownSummary, RFC_PART_OPTIONS, templateDependencies } from '../src/core/index.js';
import { byId, downloadFile, getAtPath, parseInputValue, preserveFocus, setAtPath, showToast, slugify, syncBoundInputs, uniqueId } from './utils/dom.js';
import { loadStore, parseImportedStore, saveStore, TAB, VIEW } from './state/store.js';
import { actualTotal, computeEstimate, createNewEstimate, ESTIMATE_STATUS, refreshSummary, regenerateStages, summarizeResult } from './state/estimates.js';
import { renderSidebar } from './views/sidebar.js';
import { CUSTOMIZED_STAGES_STATUS_HTML, NEW_PERSON_OPTION_VALUE, renderEstimateResults, renderEstimateView } from './views/estimate-view.js';
import { pluralize } from './utils/text.js';
import { capacityText, datePreviewHtml, renderTeamView } from './views/team-view.js';
import { renderHistoryView } from './views/history-view.js';
import { renderQuarterView } from './views/quarter-view.js';

/* ───────────── Estado ───────────── */

const WEB_SIMULATION_RUNS = 1500;
const RECOMPUTE_DEBOUNCE_MS = 250;
const SUMMARY_REFRESH_DELAY_MS = 600;
const QUICK_BIND_PREFIX = 'project.quick.';
const STAGES_BIND_PREFIX = 'project.stages.';
const TEAM_BIND_PREFIX = 'team.';

const todayIso = new Date().toISOString().slice(0, 10);
let store = loadStore(todayIso);
let quarterOffset = 0;
let focusPersonId = null;
let recomputeTimer = null;
let summaryTimer = null;
/** Último resultado calculado de la estimación abierta (para compartir y registrar reales). */
let lastResult = null;
/** Filas de etapa con "más opciones" abiertas: stageId → { snapshot, addingPerson }. */
const openStageRows = new Map();
/** Plegables que el usuario abrió o cerró a mano (`data-fold-key` → abierto): la elección sobrevive a los re-renders. */
const foldStates = new Map();
/**
 * Atajos con Alt, por tecla física (`event.code`): en macOS, Option+letra produce otro carácter
 * en `event.key`, así que la letra no sirve para reconocerlos.
 */
const ALT_SHORTCUT_ACTIONS = Object.freeze({ KeyN: 'new-estimate', KeyC: 'copy-summary' });

const currentEstimate = () => store.estimates.find((estimate) => estimate.id === store.ui.estimateId) ?? null;
const bindingRoot = () => ({ project: currentEstimate()?.project, team: store.team, actuals: currentEstimate()?.actuals });
const persist = () => saveStore(store);

function touchCurrentEstimate() {
  const estimate = currentEstimate();
  if (estimate) estimate.updatedAt = new Date().toISOString();
}

/* ───────────── Render ───────────── */

function renderSidebarOnly() {
  byId('sidebar').innerHTML = renderSidebar(store);
}

function renderMain() {
  const main = byId('main');
  const { view } = store.ui;
  if (view === VIEW.ESTIMATE && !currentEstimate()) {
    store.ui.view = VIEW.QUARTER;
    return renderMain();
  }
  preserveFocus(() => {
    if (view === VIEW.ESTIMATE) main.innerHTML = renderEstimateView({ estimate: currentEstimate(), team: store.team, history: store.history, ui: store.ui, openStageRows, foldStates });
    if (view === VIEW.TEAM) main.innerHTML = renderTeamView(store, focusPersonId);
    if (view === VIEW.HISTORY) main.innerHTML = renderHistoryView(store);
    if (view === VIEW.QUARTER) {
      for (const estimate of store.estimates) if (!estimate.summary && estimate.status !== ESTIMATE_STATUS.DONE) refreshSummary(estimate, store.team, store.history);
      main.innerHTML = renderQuarterView(store, todayIso, quarterOffset);
    }
    syncBoundInputs(main, bindingRoot());
  });
  if (view === VIEW.ESTIMATE) recompute();
}

function render() {
  renderSidebarOnly();
  renderMain();
}

function showError(message) {
  const banner = byId('error-banner');
  banner.hidden = !message;
  banner.textContent = message ? `No se pudo calcular: ${message}` : '';
}

function recompute() {
  const estimate = currentEstimate();
  if (store.ui.view !== VIEW.ESTIMATE || !estimate) return;
  for (const invalid of document.querySelectorAll('[aria-invalid="true"]')) invalid.removeAttribute('aria-invalid');
  try {
    const result = computeEstimate(estimate, store.team, store.history, WEB_SIMULATION_RUNS);
    estimate.summary = summarizeResult(result);
    showError(null);
    byId('main').classList.remove('stale');
    renderEstimateResults(result, { estimate, team: store.team, ui: store.ui, todayIso });
    lastResult = result;
  } catch (computeError) {
    if (!(computeError instanceof EstimationInputError)) console.error('app:recompute failed', computeError);
    showError(computeError.message.replace(/^[\w:]+ failed( for [^:]+)?: /, ''));
    byId('main').classList.add('stale');
    const match = computeError.message.match(/activity "([^"]+)"/);
    const index = estimate.project.stages.findIndex((stage) => stage.id === match?.[1]);
    for (const field of ['optimistic', 'mostLikely', 'pessimistic']) {
      if (index >= 0) document.querySelector(`[data-bind="project.stages.${index}.${field}"]`)?.setAttribute('aria-invalid', 'true');
    }
  }
  persist();
  renderSidebarOnly();
}

function scheduleRecompute() {
  persist();
  clearTimeout(recomputeTimer);
  recomputeTimer = setTimeout(recompute, RECOMPUTE_DEBOUNCE_MS);
}

/** Tras cambiar equipo o historial, las fechas de todas las estimaciones cambian: se refrescan en segundo plano. */
function scheduleSummaryRefresh() {
  clearTimeout(summaryTimer);
  summaryTimer = setTimeout(() => {
    for (const estimate of store.estimates) {
      if (estimate.status !== ESTIMATE_STATUS.DONE && estimate.id !== store.ui.estimateId) refreshSummary(estimate, store.team, store.history);
    }
    persist();
    renderSidebarOnly();
    if (store.ui.view === VIEW.QUARTER) renderMain();
  }, SUMMARY_REFRESH_DELAY_MS);
}

/* ───────────── Cambios del usuario ───────────── */

function markStagesCustomized() {
  const quick = currentEstimate()?.project.quick;
  if (!quick || quick.customized) return;
  quick.customized = true;
  const status = byId('quick-status');
  if (status) status.innerHTML = CUSTOMIZED_STAGES_STATUS_HTML;
}

/** Regenera las etapas tras cambiar una respuesta; devuelve false si la respuesta no es válida. */
function regenerateFromAnswers() {
  try {
    regenerateStages(currentEstimate(), store.history);
    return true;
  } catch (generationError) {
    if (!(generationError instanceof EstimationInputError)) throw generationError;
    showError(generationError.message.replace(/^[\w:]+ failed: /, ''));
    return false;
  }
}

function applyBoundChange(input, value) {
  const path = input.dataset.bind;
  setAtPath(bindingRoot(), path, value);
  if (path.startsWith('project.')) touchCurrentEstimate();
  if (path.startsWith(STAGES_BIND_PREFIX)) markStagesCustomized();
  if (path.startsWith(TEAM_BIND_PREFIX)) {
    for (const [index, person] of store.team.people.entries()) {
      const cell = byId(`person-capacity-${index}`);
      if (cell) cell.innerHTML = capacityText(person);
    }
    const preview = document.querySelector(`[data-date-preview="${CSS.escape(path)}"]`);
    if (preview) {
      preview.outerHTML = datePreviewHtml(path, getAtPath(bindingRoot(), path));
      const hasInvalidDates = document.querySelector(`[data-date-preview="${CSS.escape(path)}"]`).classList.contains('invalid');
      if (hasInvalidDates) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    }
    scheduleSummaryRefresh();
  }
  if (path.startsWith(QUICK_BIND_PREFIX) && !currentEstimate().project.quick.customized) {
    if (regenerateFromAnswers()) renderMain();
    return;
  }
  if ('sidebarRefresh' in input.dataset) renderSidebarOnly();
  scheduleRecompute();
}

/* ───────────── Acciones ───────────── */

function openEstimate(estimateId) {
  store.ui = { ...store.ui, view: VIEW.ESTIMATE, estimateId };
  openStageRows.clear();
  persist();
  render();
}

function addPerson(name) {
  const person = {
    id: uniqueId('persona', store.team.people.map((existing) => existing.id)),
    name,
    workdayHours: 8,
    reserveHours: 1,
    deductions: [{ label: 'Reuniones recurrentes', hours: 1, scope: 'external', kind: 'meetings' }],
    absences: [],
  };
  store.team.people.push(person);
  scheduleSummaryRefresh();
  return person;
}

function stageAt(index) {
  return currentEstimate().project.stages[Number(index)];
}

/**
 * Aplica un cambio destructivo al instante y ofrece "Deshacer" en el aviso.
 * Reemplaza a window.confirm, que algunos navegadores embebidos bloquean (devuelve false sin mostrarse).
 */
function runUndoable(message, mutate) {
  const snapshot = structuredClone(store);
  mutate();
  persist();
  render();
  showToast(message, {
    actionLabel: 'Deshacer',
    onAction: () => {
      store = snapshot;
      persist();
      render();
      showToast('Cambio deshecho');
    },
  });
}

function exportBackup() {
  downloadFile(`estimador-respaldo-${todayIso}.json`, `${JSON.stringify(store, null, 2)}\n`, 'application/json');
}

const ACTIONS = {
  'new-estimate': () => {
    const estimate = createNewEstimate(todayIso);
    regenerateStages(estimate, store.history);
    store.estimates.push(estimate);
    store.ui.tab = TAB.ESTIMATE;
    openEstimate(estimate.id);
    document.querySelector('[data-bind="project.name"]')?.select();
    return false;
  },
  'open-estimate': ({ id }) => {
    openEstimate(id);
    return false;
  },
  'open-view': ({ view }) => {
    store.ui.view = view;
    focusPersonId = null;
    persist();
    render();
    return false;
  },
  'select-tab': ({ tab }) => {
    store.ui.tab = tab;
    persist();
    renderMain();
    byId(`tab-${tab}`)?.focus();
    return false;
  },
  'duplicate-estimate': () => {
    const source = currentEstimate();
    const copy = structuredClone(source);
    Object.assign(copy, { id: `est-${Date.now().toString(36)}`, status: ESTIMATE_STATUS.DRAFT, actuals: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    copy.project.name = `${source.project.name} (copia)`;
    store.estimates.push(copy);
    openEstimate(copy.id);
    showToast('Estimación duplicada');
    return false;
  },
  'delete-estimate': () => {
    const estimate = currentEstimate();
    runUndoable(`"${estimate.project.name || 'Sin nombre'}" eliminada`, () => {
      store.estimates = store.estimates.filter((candidate) => candidate.id !== estimate.id);
      const next = store.estimates.find((candidate) => candidate.status !== ESTIMATE_STATUS.DONE) ?? store.estimates[0];
      store.ui = next ? { ...store.ui, estimateId: next.id } : { ...store.ui, view: VIEW.QUARTER, estimateId: null };
    });
    return false;
  },
  'complete-estimate': () => {
    const estimate = currentEstimate();
    const result = lastResult;
    const records = (result?.stages ?? [])
      .filter((stage) => Number(estimate.actuals[stage.id]) > 0 && stage.expected > 0)
      .map((stage) => ({
        complexity: estimate.project.complexity,
        stageId: stage.id,
        estimatedHours: stage.expected + stage.contingencyHours,
        actualHours: Number(estimate.actuals[stage.id]),
        projectName: estimate.project.name,
        recordedAt: todayIso,
        estimateId: estimate.id,
      }));
    if (!records.length) {
      showToast('Cargá las horas reales de al menos una etapa');
      return false;
    }
    store.history = [...store.history.filter((record) => record.estimateId !== estimate.id), ...records];
    estimate.status = ESTIMATE_STATUS.DONE;
    touchCurrentEstimate();
    const estimated = records.reduce((sum, record) => sum + record.estimatedHours, 0);
    const error = percentError(estimated, actualTotal(estimate));
    showToast(`Terminada: real ${Math.round(actualTotal(estimate))} h, ${error > 0 ? '+' : ''}${Math.round(error)} % contra lo estimado`);
    scheduleSummaryRefresh();
  },
  'reopen-estimate': () => {
    const estimate = currentEstimate();
    estimate.status = ESTIMATE_STATUS.DRAFT;
    store.history = store.history.filter((record) => record.estimateId !== estimate.id);
    touchCurrentEstimate();
    scheduleSummaryRefresh();
    showToast('Reabierta: sus horas reales salieron del historial hasta que la vuelvas a terminar');
  },
  'regenerate-stages': () => {
    regenerateStages(currentEstimate(), store.history);
    openStageRows.clear();
    showToast('Etapas regeneradas desde las respuestas');
  },
  'add-stage': () => {
    const { project } = currentEstimate();
    markStagesCustomized();
    project.stages.push({ id: uniqueId('etapa', project.stages.map((stage) => stage.id)), name: 'Nueva etapa', optimistic: 1, mostLikely: 2, pessimistic: 4, method: 'pert', included: true, dependsOn: [] });
  },
  'remove-stage': ({ index }) => {
    const { project } = currentEstimate();
    markStagesCustomized();
    const [removed] = project.stages.splice(Number(index), 1);
    for (const stage of project.stages) stage.dependsOn = (stage.dependsOn ?? []).filter((dependencyId) => dependencyId !== removed.id);
    project.risks = (project.risks ?? []).map((risk) => (risk.activityId === removed.id ? { ...risk, activityId: undefined } : risk));
    openStageRows.delete(removed.id);
  },
  'toggle-stage-options': ({ index }) => {
    const stage = stageAt(index);
    if (openStageRows.has(stage.id)) openStageRows.delete(stage.id);
    else openStageRows.set(stage.id, { snapshot: { dependsOn: [...(stage.dependsOn ?? [])], waitWorkingDaysAfter: stage.waitWorkingDaysAfter, customized: currentEstimate().project.quick.customized }, addingPerson: false });
  },
  'close-stage-options': ({ index }) => {
    openStageRows.delete(stageAt(index).id);
  },
  'cancel-stage-options': ({ index }) => {
    const stage = stageAt(index);
    const snapshot = openStageRows.get(stage.id)?.snapshot;
    if (snapshot) {
      stage.dependsOn = snapshot.dependsOn;
      stage.waitWorkingDaysAfter = snapshot.waitWorkingDaysAfter;
      currentEstimate().project.quick.customized = snapshot.customized;
    }
    openStageRows.delete(stage.id);
  },
  'reset-dependencies': ({ index }) => {
    const stage = stageAt(index);
    stage.dependsOn = templateDependencies(stage.id);
    showToast(`"${stage.name}" vuelve al orden de la plantilla`);
  },
  'confirm-new-person': ({ index }) => {
    const input = document.querySelector(`[data-new-person-index="${index}"]`);
    const name = input.value.trim();
    if (!name) {
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return false;
    }
    const stage = stageAt(index);
    stage.assigneeId = addPerson(name).id;
    markStagesCustomized();
    openStageRows.get(stage.id).addingPerson = false;
    showToast(`${name} se sumó al equipo con 6 h efectivas por día (ajustable en Equipo)`);
  },
  'cancel-new-person': ({ index }) => {
    const state = openStageRows.get(stageAt(index).id);
    if (state) state.addingPerson = false;
  },
  'add-risk': () => {
    const { project } = currentEstimate();
    (project.risks ??= []).push({ id: uniqueId('riesgo', project.risks.map((risk) => risk.id)), description: 'Nuevo riesgo', probability: 0.2, impactHours: 4 });
  },
  'remove-risk': ({ index }) => {
    currentEstimate().project.risks.splice(Number(index), 1);
  },
  'acknowledge-meetings': () => {
    store.team.meetingsReviewed = true;
    showToast('Listo: no se vuelve a avisar (se puede cambiar en Equipo)');
    scheduleSummaryRefresh();
  },
  'copy-summary': async () => {
    const markdown = renderMarkdownSummary(lastResult);
    try {
      await navigator.clipboard.writeText(markdown);
      showToast('Resumen copiado');
    } catch (clipboardError) {
      console.warn('app:copySummary failed, se descarga el archivo', clipboardError);
      downloadFile(`${slugify(currentEstimate().project.name)}.md`, markdown, 'text/markdown');
      showToast('No se pudo copiar: se descargó el .md');
    }
    return false;
  },
  'download-summary': () => {
    downloadFile(`${slugify(currentEstimate().project.name)}.md`, renderMarkdownSummary(lastResult), 'text/markdown');
    return false;
  },
  'export-estimate': () => {
    const estimate = currentEstimate();
    downloadFile(`${slugify(estimate.project.name)}.json`, `${JSON.stringify({ ...estimate.project, people: store.team.people, calendar: store.team.calendar }, null, 2)}\n`, 'application/json');
    return false;
  },
  'export-backup': () => {
    exportBackup();
    return false;
  },
  'import-backup': () => {
    byId('import-file').click();
    return false;
  },
  'add-person': () => {
    addPerson(`Persona ${store.team.people.length + 1}`);
  },
  'remove-person': ({ index }) => {
    const [removed] = store.team.people.splice(Number(index), 1);
    for (const estimate of store.estimates) for (const stage of estimate.project.stages) if (stage.assigneeId === removed.id) delete stage.assigneeId;
    scheduleSummaryRefresh();
  },
  'add-deduction': ({ personIndex }) => {
    (store.team.people[Number(personIndex)].deductions ??= []).push({ label: 'Nuevo descuento', hours: 0.5, scope: 'external', kind: 'other' });
    focusPersonId = store.team.people[Number(personIndex)].id;
    scheduleSummaryRefresh();
  },
  'remove-deduction': ({ personIndex, index }) => {
    store.team.people[Number(personIndex)].deductions.splice(Number(index), 1);
    focusPersonId = store.team.people[Number(personIndex)].id;
    scheduleSummaryRefresh();
  },
  'clear-history': () => {
    runUndoable(`Historial borrado (${store.history.length} registros)`, () => {
      store.history = [];
    });
    scheduleSummaryRefresh();
    return false;
  },
  'shift-quarter': ({ offset }) => {
    quarterOffset = Number(offset) === 0 ? 0 : quarterOffset + Number(offset);
  },
};

/* ───────────── Eventos ───────────── */

document.addEventListener('input', (event) => {
  const input = event.target;
  if (!input.dataset?.bind || ['checkbox', 'radio'].includes(input.type) || input.tagName === 'SELECT') return;
  applyBoundChange(input, parseInputValue(input));
});

document.addEventListener('change', (event) => {
  const input = event.target;
  if (input.id === 'import-file') {
    importBackupFile(input.files[0]);
    input.value = '';
    return;
  }
  if (input.dataset.assigneeIndex !== undefined) {
    const stage = stageAt(input.dataset.assigneeIndex);
    if (input.value === NEW_PERSON_OPTION_VALUE) {
      input.value = stage.assigneeId ?? store.team.people[0].id;
      const state = openStageRows.get(stage.id) ?? { snapshot: { dependsOn: [...(stage.dependsOn ?? [])], waitWorkingDaysAfter: stage.waitWorkingDaysAfter, customized: currentEstimate().project.quick.customized } };
      openStageRows.set(stage.id, { ...state, addingPerson: true });
      renderMain();
      document.querySelector(`[data-new-person-index="${input.dataset.assigneeIndex}"]`)?.focus();
      return;
    }
    stage.assigneeId = input.value;
    markStagesCustomized();
    touchCurrentEstimate();
    scheduleRecompute();
    return;
  }
  if (input.dataset.action === 'toggle-rfc-part') {
    const { quick } = currentEstimate().project;
    const selected = new Set(quick.rfcParts ?? RFC_PART_OPTIONS);
    if (input.checked) selected.add(input.dataset.rfcPart);
    else selected.delete(input.dataset.rfcPart);
    quick.rfcParts = RFC_PART_OPTIONS.filter((part) => selected.has(part));
    touchCurrentEstimate();
    if (!quick.customized && regenerateFromAnswers()) renderMain();
    else scheduleRecompute();
    return;
  }
  if (input.dataset.action === 'toggle-dependency') {
    const stage = stageAt(input.dataset.stageIndex);
    const dependencies = new Set(stage.dependsOn ?? []);
    if (input.checked) dependencies.add(input.dataset.dependencyId);
    else dependencies.delete(input.dataset.dependencyId);
    stage.dependsOn = [...dependencies];
    markStagesCustomized();
    touchCurrentEstimate();
    scheduleRecompute();
    return;
  }
  if (!input.dataset.bind) return;
  if (['checkbox', 'radio'].includes(input.type) || input.tagName === 'SELECT') applyBoundChange(input, parseInputValue(input));
  if ('rerender' in input.dataset) renderMain();
});

document.addEventListener('click', async (event) => {
  const trigger = event.target.closest('button[data-action]');
  if (!trigger) return;
  const handler = ACTIONS[trigger.dataset.action];
  if (!handler) return;
  const result = await handler(trigger.dataset);
  if (result === false) return;
  touchCurrentEstimate();
  persist();
  render();
});

// Se escucha el clic en el `summary` (también lo dispara el teclado) y no el evento `toggle`,
// que el navegador también emite al renderizar un `<details open>` y no distingue la elección del usuario.
document.addEventListener('click', (event) => {
  const summary = event.target.closest?.('summary');
  const details = summary?.parentElement;
  if (!details?.dataset.foldKey || details.querySelector(':scope > summary') !== summary) return;
  foldStates.set(details.dataset.foldKey, !details.open);
});

document.addEventListener('keydown', (event) => {
  const target = event.target;
  const shortcutAction = event.altKey && !event.ctrlKey && !event.metaKey ? ALT_SHORTCUT_ACTIONS[event.code] : null;
  if (shortcutAction) {
    const trigger = document.querySelector(`button[data-action="${shortcutAction}"]`);
    if (trigger) {
      event.preventDefault();
      trigger.click();
      return;
    }
  }
  if (target.dataset?.newPersonIndex !== undefined) {
    const actionName = { Enter: 'confirm-new-person', Escape: 'cancel-new-person' }[event.key];
    if (!actionName) return;
    event.preventDefault();
    document.querySelector(`[data-action="${actionName}"][data-index="${target.dataset.newPersonIndex}"]`)?.click();
    return;
  }
  if (target.getAttribute?.('role') === 'tab' && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
    const tabs = [...document.querySelectorAll('[role="tab"]')];
    const next = tabs[(tabs.indexOf(target) + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    next.click();
  }
});

async function importBackupFile(file) {
  if (!file) return;
  try {
    const imported = parseImportedStore(JSON.parse(await file.text()));
    runUndoable(`Importado "${file.name}": ${pluralize(imported.estimates.length, 'estimación', 'estimaciones')}`, () => {
      store = imported;
    });
  } catch (importError) {
    console.error(`app:importBackupFile failed for "${file.name}"`, importError);
    showToast(`No se pudo importar ${file.name}: ${importError.message}`);
  }
}

render();
scheduleSummaryRefresh();


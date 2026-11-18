import {
  buildEstimate,
  buildStagesFromAnswers,
  DEFAULT_UNCERTAINTY_MODEL,
  INITIATIVE_COMPLEXITY,
  MIN_REFERENCE_CLASS_SAMPLES,
  SAMPLE_ASSUMPTIONS,
  summarizeCalibration,
  UNCERTAINTY_MODEL,
  withDefaultAnswers,
} from '../../src/core/index.js';

/** Lógica de dominio de las estimaciones guardadas en la app (sin DOM). */

export const ESTIMATE_STATUS = Object.freeze({ DRAFT: 'draft', DONE: 'done' });
export const DEFAULT_QUICK_ANSWERS = Object.freeze({ complexity: INITIATIVE_COMPLEXITY.MEDIUM, developmentHours: null, applyCalibration: false, customized: false });
export const SAMPLE_ESTIMATE_NAME = 'Iniciativa de ejemplo';
export const MIN_CALIBRATION_SAMPLES = 3;
const SUMMARY_SIMULATION_RUNS = 600;

const newId = () => `est-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** Envuelve un proyecto (sin equipo) en una estimación guardable. */
export function createEstimateFromProject(project) {
  const now = new Date().toISOString();
  const quick = project.quick ?? withDefaultAnswers({ ...DEFAULT_QUICK_ANSWERS, complexity: project.complexity ?? DEFAULT_QUICK_ANSWERS.complexity, customized: true });
  return { id: newId(), status: ESTIMATE_STATUS.DRAFT, createdAt: now, updatedAt: now, project: { ...project, quick }, actuals: {}, summary: null };
}

/** Estimación nueva con las respuestas por defecto y etapas generadas. */
export function createNewEstimate(startDate, name = 'Nueva iniciativa') {
  const estimate = createEstimateFromProject({
    name,
    startDate,
    complexity: DEFAULT_QUICK_ANSWERS.complexity,
    stages: [],
    risks: [],
    assumptions: name === SAMPLE_ESTIMATE_NAME ? [...SAMPLE_ASSUMPTIONS] : [],
    externalDependencies: [],
    factors: {},
    quick: withDefaultAnswers({ ...DEFAULT_QUICK_ANSWERS }),
  });
  regenerateStages(estimate, []);
  return estimate;
}

/** Cocientes real/estimado por iniciativa terminada de una complejidad (agrupando el historial por iniciativa). */
export function referenceClassRatios(history, complexity) {
  const totalsByTask = new Map();
  for (const record of history.filter((candidate) => candidate.complexity === complexity && candidate.estimatedHours > 0)) {
    const key = record.estimateId ?? `${record.projectName}|${record.recordedAt}`;
    const totals = totalsByTask.get(key) ?? { estimated: 0, actual: 0 };
    totals.estimated += record.estimatedHours;
    totals.actual += record.actualHours;
    totalsByTask.set(key, totals);
  }
  const ratios = [...totalsByTask.values()].map((totals) => totals.actual / totals.estimated).filter((ratio) => ratio > 0);
  return ratios.length >= MIN_REFERENCE_CLASS_SAMPLES ? ratios : null;
}

export function calibrationFor(history, complexity) {
  return summarizeCalibration(history, { complexity, minimumSamples: MIN_CALIBRATION_SAMPLES });
}

/** Con historial suficiente el rango sale de tareas reales; si no, factor común por defecto. */
export function uncertaintyModelFor(history, complexity) {
  const ratios = referenceClassRatios(history, complexity);
  return ratios ? { kind: UNCERTAINTY_MODEL.REFERENCE_CLASS, ratios } : DEFAULT_UNCERTAINTY_MODEL;
}

/** Regenera las etapas desde las respuestas rápidas, sin aplicar el historial dos veces. */
export function regenerateStages(estimate, history) {
  const { project } = estimate;
  const answers = project.quick;
  const calibration = calibrationFor(history, answers.complexity);
  const historyAlreadyInRange = referenceClassRatios(history, answers.complexity) !== null;
  const result = buildStagesFromAnswers({
    ...answers,
    calibrationRatio: answers.applyCalibration && calibration && !historyAlreadyInRange ? calibration.medianRatio : 1,
  });
  project.stages = result.stages;
  project.complexity = answers.complexity;
  project.factors = result.factors;
  project.generatedAssumptions = result.explanations;
  project.risks = (project.risks ?? []).filter((risk) => !risk.activityId || project.stages.some((stage) => stage.id === risk.activityId && stage.included));
  answers.customized = false;
}

/** Proyecto completo que entiende el núcleo: la estimación más el equipo compartido. */
export function projectForCore(estimate, team) {
  const { project } = estimate;
  const generated = project.quick?.customized ? [] : project.generatedAssumptions ?? [];
  return {
    ...project,
    people: team.people,
    calendar: team.calendar,
    assumptions: [...(project.assumptions ?? []), ...generated],
  };
}

const DOUBLE_COUNT_WARNING_PREFIX = 'Posible doble conteo';

/** Calcula la estimación; si el equipo ya revisó las reuniones, no repite el aviso de doble conteo. */
export function computeEstimate(estimate, team, history, runs) {
  const result = buildEstimate(projectForCore(estimate, team), {
    runs,
    uncertaintyModel: uncertaintyModelFor(history, estimate.project.quick?.complexity ?? estimate.project.complexity),
  });
  if (team.meetingsReviewed) result.warnings = result.warnings.filter((warning) => !warning.startsWith(DOUBLE_COUNT_WARNING_PREFIX));
  return result;
}

export const isDoubleCountWarning = (warning) => warning.startsWith(DOUBLE_COUNT_WARNING_PREFIX);

/** Resumen liviano que se guarda con la estimación para la sidebar y el trimestre. */
export function summarizeResult(result) {
  const percentile = (value) => result.simulation?.percentiles.find((row) => row.percentile === value);
  const rollout = result.milestones?.[0];
  return {
    expectedHours: result.effort.totalExpected,
    startDate: result.schedule.startDate,
    endDate: result.schedule.endDate,
    p50Date: percentile(50)?.endDate ?? result.schedule.endDate,
    p80Date: percentile(80)?.endDate ?? result.schedule.endDate,
    p80Hours: percentile(80)?.effortHours ?? result.effort.totalExpected,
    p80WorkingDays: percentile(80)?.workingDays ?? result.duration.scheduledWorkingDays,
    rolloutDate: rollout?.plannedDate ?? null,
    rolloutP80Date: rollout?.percentiles.find((row) => row.percentile === 80)?.endDate ?? rollout?.plannedDate ?? null,
  };
}

/** Recalcula el resumen de una estimación que no se está viendo (menos corridas). */
export function refreshSummary(estimate, team, history) {
  try {
    estimate.summary = summarizeResult(computeEstimate(estimate, team, history, SUMMARY_SIMULATION_RUNS));
  } catch (computeError) {
    console.warn(`estimates:refreshSummary failed for estimate "${estimate.id}"`, computeError);
    estimate.summary = null;
  }
  return estimate.summary;
}

/** Total real registrado de una estimación terminada. */
export const actualTotal = (estimate) => Object.values(estimate.actuals ?? {}).reduce((sum, hours) => sum + (Number(hours) || 0), 0);

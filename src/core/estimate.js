import {
  DEDUCTION_SCOPE,
  DEFAULT_ASSIGNEE_ID,
  DEFAULT_SIMULATION_RUNS,
  DEFAULT_SIMULATION_SEED,
} from './constants/estimation.js';
import { STAGE_KIND } from './constants/stages.js';
import { aggregateEfforts, computeActivityEffort } from './pert.js';
import { computeEffectiveCapacity } from './capacity.js';
import { computeExpectedContingency, contingencyRisks } from './risks.js';
import { scheduleActivities } from './schedule.js';
import { simulateDelivery } from './simulation.js';
import { EstimationInputError } from './errors.js';
import { DEFAULT_COMMON_ERROR_SIGMA, UNCERTAINTY_MODEL } from './constants/uncertainty.js';

/** Sin historial, las etapas comparten un factor de error común (ver constants/uncertainty.js). */
export const DEFAULT_UNCERTAINTY_MODEL = Object.freeze({ kind: UNCERTAINTY_MODEL.COMMON_FACTOR, sigma: DEFAULT_COMMON_ERROR_SIGMA });

/** Id de la actividad sintética que absorbe riesgos sin etapa asignada. */
export const CONTINGENCY_ACTIVITY_ID = 'contingencia';

/**
 * @typedef {Object} Stage
 * @property {string} id
 * @property {string} name
 * @property {string} [kind] Ver STAGE_KIND.
 * @property {number} optimistic
 * @property {number} mostLikely
 * @property {number} pessimistic
 * @property {'pert'|'manual'} [method]
 * @property {boolean} [included] false = etapa desactivada.
 * @property {string} [assigneeId]
 * @property {string[]} [dependsOn]
 * @property {number} [waitWorkingDaysAfter]
 */

/**
 * @typedef {Object} Project
 * @property {string} name
 * @property {string} [taskType]
 * @property {string} startDate
 * @property {{workingWeekdays?: number[], holidays?: string[]}} [calendar]
 * @property {import('./capacity.js').Person[]} [people]
 * @property {Stage[]} stages
 * @property {import('./risks.js').Risk[]} [risks]
 * @property {string[]} [assumptions]
 * @property {string[]} [externalDependencies]
 * @property {Record<string, string>} [factors] Complejidad, claridad, etc. (se registran, no multiplican).
 */

/**
 * Calcula la estimación completa: esfuerzo, capacidad, duración, fecha e incertidumbre,
 * manteniendo cada concepto separado y explicable.
 * @param {Project} project
 * @param {{runs?: number, seed?: number, uncertaintyModel?: import('./simulation.js').UncertaintyModel, includeSchedule?: boolean}} [options]
 */
export function buildEstimate(project, options = {}) {
  const runs = options.runs ?? DEFAULT_SIMULATION_RUNS;
  const seed = options.seed ?? DEFAULT_SIMULATION_SEED;
  const uncertaintyModel = options.uncertaintyModel ?? DEFAULT_UNCERTAINTY_MODEL;
  const people = project.people?.length ? project.people : [{ id: DEFAULT_ASSIGNEE_ID, name: 'Desarrollador' }];
  const defaultAssigneeId = people[0].id;
  const calendar = { ...project.calendar, startDate: project.startDate };
  const risks = project.risks ?? [];

  const includedStages = project.stages.filter((stage) => stage.included !== false);
  if (includedStages.length === 0) {
    throw new EstimationInputError(`estimate:buildEstimate failed for project "${project.name}": no hay etapas incluidas`);
  }
  const includedIds = new Set(includedStages.map((stage) => stage.id));

  // 1. Esfuerzo por etapa (PERT) e incertidumbre.
  const stageEfforts = includedStages.map((stage) => ({ stage, effort: computeActivityEffort(stage) }));
  const baseEffort = aggregateEfforts(stageEfforts.map(({ effort }) => effort));

  // 2. Contingencia por riesgos no contemplados en la P.
  for (const risk of risks) {
    if (risk.activityId && !includedIds.has(risk.activityId)) {
      throw new EstimationInputError(`estimate:buildEstimate failed: el riesgo "${risk.id}" apunta a la etapa "${risk.activityId}", que no existe o está desactivada`);
    }
  }
  const contingency = computeExpectedContingency(risks);
  const applicableRisks = contingencyRisks(risks);
  const needsContingencyActivity = applicableRisks.some((risk) => !risk.activityId);

  // 3. Capacidad efectiva por persona.
  const capacities = people.map((person) => computeEffectiveCapacity(person));
  const baseCapacityByPerson = new Map(capacities.map((capacity) => [capacity.personId, capacity.effectiveHours]));
  const teamDailyCapacity = capacities.reduce((sum, capacity) => sum + capacity.effectiveHours, 0);

  // 4. Actividades planificables (dependencias solo entre etapas incluidas).
  const expectedContingencyByStage = new Map();
  for (const risk of applicableRisks) {
    const target = risk.activityId ?? CONTINGENCY_ACTIVITY_ID;
    expectedContingencyByStage.set(target, (expectedContingencyByStage.get(target) ?? 0) + risk.probability * risk.impactHours);
  }
  const activities = stageEfforts.map(({ stage, effort }) => ({
    id: stage.id,
    name: stage.name,
    assigneeId: stage.assigneeId ?? defaultAssigneeId,
    dependsOn: resolveIncludedDependencies(stage.id, project.stages, includedIds),
    waitWorkingDaysAfter: stage.waitWorkingDaysAfter ?? 0,
    threePoint: effort,
    effortHours: effort.expected + (expectedContingencyByStage.get(stage.id) ?? 0),
  }));
  if (needsContingencyActivity) {
    const dependedOn = new Set(activities.flatMap((activity) => activity.dependsOn));
    activities.push({
      id: CONTINGENCY_ACTIVITY_ID,
      name: 'Contingencia por riesgos',
      assigneeId: defaultAssigneeId,
      dependsOn: activities.filter((activity) => !dependedOn.has(activity.id)).map((activity) => activity.id),
      waitWorkingDaysAfter: 0,
      threePoint: { optimistic: 0, mostLikely: 0, pessimistic: 0 },
      effortHours: expectedContingencyByStage.get(CONTINGENCY_ACTIVITY_ID) ?? 0,
    });
  }

  // 5. Planificación determinística con el esfuerzo esperado.
  const plan = scheduleActivities({ activities, people, baseCapacityByPerson, calendar });

  // 6. Monte Carlo sobre el mismo planificador.
  const riskEvents = applicableRisks.map((risk) => ({
    probability: risk.probability,
    impactHours: risk.impactHours,
    targetActivityId: risk.activityId ?? CONTINGENCY_ACTIVITY_ID,
  }));
  const simulation = runs > 0
    ? simulateDelivery({ activities, riskEvents, people, baseCapacityByPerson, calendar, runs, seed, uncertaintyModel, includeSchedule: options.includeSchedule ?? true })
    : null;

  const totalExpectedWithContingency = baseEffort.expected + contingency.expectedHours;
  const workdayHoursReference = capacities[0].workdayHours;

  return {
    project: { name: project.name, taskType: project.taskType ?? null, startDate: project.startDate },
    stages: stageEfforts.map(({ stage, effort }) => {
      const scheduled = plan.activities.find((entry) => entry.id === stage.id);
      return {
        id: stage.id,
        name: stage.name,
        kind: stage.kind ?? null,
        method: stage.method ?? 'pert',
        assigneeId: stage.assigneeId ?? defaultAssigneeId,
        dependsOn: stage.dependsOn ?? [],
        waitWorkingDaysAfter: stage.waitWorkingDaysAfter ?? 0,
        ...effort,
        contingencyHours: expectedContingencyByStage.get(stage.id) ?? 0,
        startDate: scheduled.startDate,
        endDate: scheduled.endDate,
      };
    }),
    effort: { ...baseEffort, contingencyHours: contingency.expectedHours, totalExpected: totalExpectedWithContingency },
    contingency,
    capacity: { people: capacities, teamDailyCapacity },
    duration: {
      naiveWorkdays: totalExpectedWithContingency / workdayHoursReference,
      effectiveWorkdaysSinglePerson: totalExpectedWithContingency / capacities[0].effectiveHours,
      idealTeamWorkdays: totalExpectedWithContingency / teamDailyCapacity,
      scheduledWorkingDays: plan.workingDays,
    },
    schedule: plan,
    simulation,
    risks,
    assumptions: project.assumptions ?? [],
    externalDependencies: project.externalDependencies ?? [],
    factors: project.factors ?? {},
    warnings: collectWarnings(project, stageEfforts, people),
  };
}

/**
 * Si una dependencia está desactivada, se heredan sus propias dependencias,
 * para que desactivar una etapa no rompa el orden del flujo.
 * @param {string} stageId
 * @param {Stage[]} allStages
 * @param {Set<string>} includedIds
 */
function resolveIncludedDependencies(stageId, allStages, includedIds) {
  const byId = new Map(allStages.map((stage) => [stage.id, stage]));
  const resolved = new Set();
  const visited = new Set();
  const walk = (dependencyIds) => {
    for (const dependencyId of dependencyIds) {
      if (visited.has(dependencyId)) continue;
      visited.add(dependencyId);
      if (includedIds.has(dependencyId)) resolved.add(dependencyId);
      else if (byId.has(dependencyId)) walk(byId.get(dependencyId).dependsOn ?? []);
      else resolved.add(dependencyId); // inexistente: el planificador reporta el error con contexto
    }
  };
  walk(byId.get(stageId).dependsOn ?? []);
  return [...resolved];
}

/** Advertencias explicables sobre posibles dobles conteos o datos débiles. */
function collectWarnings(project, stageEfforts, people) {
  const warnings = [];
  const coordinationStage = stageEfforts.find(({ stage, effort }) => stage.kind === STAGE_KIND.COORDINATION && effort.expected > 0);
  const peopleWithMeetingDeduction = people.filter((person) =>
    (person.deductions ?? []).some((deduction) => deduction.kind === 'meetings' && (deduction.scope ?? DEDUCTION_SCOPE.EXTERNAL) === DEDUCTION_SCOPE.EXTERNAL),
  );
  if (coordinationStage && peopleWithMeetingDeduction.length > 0) {
    warnings.push(
      `Posible doble conteo: la etapa "${coordinationStage.stage.name}" estima reuniones de la tarea y la capacidad de ${peopleWithMeetingDeduction.map((person) => person.name ?? person.id).join(', ')} también descuenta reuniones. Verificá que las descontadas sean solo las ajenas a esta tarea (o marcalas como scope "task").`,
    );
  }
  for (const { stage, effort } of stageEfforts) {
    if (effort.optimistic === effort.pessimistic && effort.expected > 0) {
      warnings.push(`La etapa "${stage.name}" no tiene rango (O = P): la incertidumbre queda subestimada.`);
    }
  }
  for (const risk of project.risks ?? []) {
    if (risk.includedInPessimistic) {
      warnings.push(`El riesgo "${risk.description}" ya está contemplado en la estimación pesimista: no suma contingencia.`);
    }
  }
  return warnings;
}

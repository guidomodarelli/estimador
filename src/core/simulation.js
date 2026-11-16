import { REPORTED_PERCENTILES } from './constants/estimation.js';
import { UNCERTAINTY_MODEL } from './constants/uncertainty.js';
import { createSeededRandom, percentileOf, sampleBetaPert, sampleUnitMeanLognormal } from './random.js';
import { scheduleActivities } from './schedule.js';
import { EstimationInputError } from './errors.js';

/**
 * @typedef {{kind: 'independent'}
 *   | {kind: 'common-factor', sigma: number}
 *   | {kind: 'reference-class', ratios: number[]}} UncertaintyModel
 */

/**
 * Devuelve una función que, por corrida, muestrea el esfuerzo de cada actividad según el modelo.
 * @param {UncertaintyModel} model
 * @param {() => number} random
 * @returns {(activity: {effortHours: number, threePoint: {optimistic: number, mostLikely: number, pessimistic: number}}, runFactor: number, random: () => number) => number}
 */
function createEffortSampler(model) {
  if (model.kind === UNCERTAINTY_MODEL.REFERENCE_CLASS) {
    // El cociente histórico se midió contra el esperado con contingencia: se aplica sobre ese mismo valor.
    return (activity, runFactor) => activity.effortHours * runFactor;
  }
  return (activity, runFactor, random) => sampleBetaPert(activity.threePoint, random) * runFactor;
}

/** Multiplicador compartido por todas las etapas de una corrida. */
function sampleRunFactor(model, random) {
  if (model.kind === UNCERTAINTY_MODEL.COMMON_FACTOR) return sampleUnitMeanLognormal(model.sigma, random);
  if (model.kind === UNCERTAINTY_MODEL.REFERENCE_CLASS) return model.ratios[Math.floor(random() * model.ratios.length)];
  return 1;
}

/** @param {UncertaintyModel} model */
export function assertValidUncertaintyModel(model) {
  if (!Object.values(UNCERTAINTY_MODEL).includes(model?.kind)) {
    throw new EstimationInputError(`simulation:assertValidUncertaintyModel failed: modelo desconocido "${model?.kind}"`);
  }
  if (model.kind === UNCERTAINTY_MODEL.COMMON_FACTOR && !(model.sigma >= 0)) {
    throw new EstimationInputError(`simulation:assertValidUncertaintyModel failed: sigma debe ser >= 0 (recibido ${model.sigma})`);
  }
  if (model.kind === UNCERTAINTY_MODEL.REFERENCE_CLASS && !(model.ratios?.length > 0 && model.ratios.every((ratio) => ratio > 0))) {
    throw new EstimationInputError('simulation:assertValidUncertaintyModel failed: reference class necesita cocientes real/esperado > 0');
  }
}

/**
 * Simulación Monte Carlo: en cada corrida muestrea el esfuerzo de cada actividad según el
 * modelo de incertidumbre, decide si ocurre cada riesgo y vuelve a planificar con calendario,
 * dependencias y capacidad. Así el rango de fechas incorpora paralelismo, esperas y cuellos de botella.
 *
 * @param {Object} input
 * @param {Array<import('./schedule.js').SchedulableActivity & {threePoint: {optimistic: number, mostLikely: number, pessimistic: number, expected?: number}}>} input.activities
 * @param {Array<{probability: number, impactHours: number, targetActivityId: string}>} input.riskEvents
 * @param {import('./capacity.js').Person[]} input.people
 * @param {Map<string, number>} input.baseCapacityByPerson
 * @param {import('./calendar.js').WorkCalendar} input.calendar
 * @param {number} input.runs
 * @param {number} input.seed
 * @param {UncertaintyModel} [input.uncertaintyModel]
 * @param {boolean} [input.includeSchedule] false = solo esfuerzo, sin planificar fechas (backtests masivos).
 */
export function simulateDelivery({ activities, riskEvents, people, baseCapacityByPerson, calendar, runs, seed, uncertaintyModel = { kind: UNCERTAINTY_MODEL.INDEPENDENT }, includeSchedule = true }) {
  assertValidUncertaintyModel(uncertaintyModel);
  const random = createSeededRandom(seed);
  const sampleEffort = createEffortSampler(uncertaintyModel);
  // En reference class los riesgos ocurridos ya están dentro de los cocientes históricos.
  const sampledRiskEvents = uncertaintyModel.kind === UNCERTAINTY_MODEL.REFERENCE_CLASS ? [] : riskEvents;
  const totalEfforts = [];
  const endDates = [];
  const workingDays = [];

  for (let run = 0; run < runs; run += 1) {
    const runFactor = sampleRunFactor(uncertaintyModel, random);
    const sampledEffort = new Map(activities.map((activity) => [activity.id, sampleEffort(activity, runFactor, random)]));
    for (const riskEvent of sampledRiskEvents) {
      if (random() < riskEvent.probability) {
        sampledEffort.set(riskEvent.targetActivityId, sampledEffort.get(riskEvent.targetActivityId) + riskEvent.impactHours);
      }
    }
    totalEfforts.push([...sampledEffort.values()].reduce((sum, hours) => sum + hours, 0));
    if (!includeSchedule) continue;
    const sampledActivities = activities.map((activity) => ({ ...activity, effortHours: sampledEffort.get(activity.id) }));
    const plan = scheduleActivities({ activities: sampledActivities, people, baseCapacityByPerson, calendar });
    endDates.push(plan.endDate);
    workingDays.push(plan.workingDays);
  }

  totalEfforts.sort((left, right) => left - right);
  endDates.sort();
  workingDays.sort((left, right) => left - right);

  return {
    runs,
    seed,
    uncertaintyModel: uncertaintyModel.kind === UNCERTAINTY_MODEL.REFERENCE_CLASS
      ? { kind: uncertaintyModel.kind, sampleCount: uncertaintyModel.ratios.length }
      : uncertaintyModel,
    percentiles: REPORTED_PERCENTILES.map((percentile) => ({
      percentile,
      effortHours: percentileOf(totalEfforts, percentile),
      endDate: includeSchedule ? percentileOf(endDates, percentile) : null,
      workingDays: includeSchedule ? percentileOf(workingDays, percentile) : null,
    })),
    endDateHistogram: includeSchedule ? buildHistogram(endDates) : [],
  };
}

/** Cuenta cuántas corridas terminan en cada fecha (para graficar). */
function buildHistogram(sortedEndDates) {
  const counts = new Map();
  for (const endDate of sortedEndDates) counts.set(endDate, (counts.get(endDate) ?? 0) + 1);
  return [...counts.entries()].map(([endDate, count]) => ({ endDate, count }));
}

import {
  ESTIMATION_METHOD,
  PERT_DIVISOR,
  PERT_MOST_LIKELY_WEIGHT,
} from './constants/estimation.js';
import { EstimationInputError } from './errors.js';

/**
 * @typedef {Object} ThreePointEstimate
 * @property {number} optimistic Horas si todo sale bien (O).
 * @property {number} mostLikely Horas en condiciones normales (M).
 * @property {number} pessimistic Horas ante dificultades previsibles (P).
 */

/**
 * @typedef {Object} ActivityEffort
 * @property {number} optimistic
 * @property {number} mostLikely
 * @property {number} pessimistic
 * @property {number} expected Esfuerzo esperado en horas.
 * @property {number} standardDeviation Desviación estándar aproximada en horas.
 * @property {number} variance Varianza aproximada en horas².
 */

/**
 * Valida que O <= M <= P y que no haya negativos.
 * @param {ThreePointEstimate} estimate
 * @param {string} activityId
 */
export function assertValidThreePoint(estimate, activityId) {
  const { optimistic, mostLikely, pessimistic } = estimate;
  const values = [optimistic, mostLikely, pessimistic];
  if (values.some((value) => typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
    throw new EstimationInputError(
      `pert:assertValidThreePoint failed for activity "${activityId}": O, M y P deben ser números >= 0 (recibido O=${optimistic}, M=${mostLikely}, P=${pessimistic})`,
    );
  }
  if (!(optimistic <= mostLikely && mostLikely <= pessimistic)) {
    throw new EstimationInputError(
      `pert:assertValidThreePoint failed for activity "${activityId}": se requiere O <= M <= P (recibido O=${optimistic}, M=${mostLikely}, P=${pessimistic})`,
    );
  }
}

/**
 * Calcula esfuerzo esperado e incertidumbre de una actividad.
 * Con método manual, el esperado es M y la incertidumbre se sigue derivando de O y P.
 * @param {ThreePointEstimate & {id?: string, method?: string}} activity
 * @returns {ActivityEffort}
 */
export function computeActivityEffort(activity) {
  const activityId = activity.id ?? '(sin id)';
  assertValidThreePoint(activity, activityId);
  const { optimistic, mostLikely, pessimistic } = activity;
  const expected =
    activity.method === ESTIMATION_METHOD.MANUAL
      ? mostLikely
      : (optimistic + PERT_MOST_LIKELY_WEIGHT * mostLikely + pessimistic) / PERT_DIVISOR;
  const standardDeviation = (pessimistic - optimistic) / PERT_DIVISOR;
  return {
    optimistic,
    mostLikely,
    pessimistic,
    expected,
    standardDeviation,
    variance: standardDeviation ** 2,
  };
}

/**
 * Suma esfuerzos asumiendo actividades independientes (las varianzas se suman).
 * @param {ActivityEffort[]} efforts
 */
export function aggregateEfforts(efforts) {
  const totals = efforts.reduce(
    (accumulated, effort) => ({
      optimistic: accumulated.optimistic + effort.optimistic,
      mostLikely: accumulated.mostLikely + effort.mostLikely,
      pessimistic: accumulated.pessimistic + effort.pessimistic,
      expected: accumulated.expected + effort.expected,
      variance: accumulated.variance + effort.variance,
    }),
    { optimistic: 0, mostLikely: 0, pessimistic: 0, expected: 0, variance: 0 },
  );
  return { ...totals, standardDeviation: Math.sqrt(totals.variance) };
}

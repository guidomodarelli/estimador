import {
  BACKTEST_ACCEPTANCE,
  BACKTEST_REFERENCE_PERSON,
  BACKTEST_REFERENCE_START_DATE,
  BACKTEST_VERDICT,
  DEFAULT_BACKTEST_RUNS,
  MIN_BACKTEST_RECORDS,
} from './constants/backtest.js';
import { DEFAULT_SIMULATION_SEED, REPORTED_PERCENTILES } from './constants/estimation.js';
import { DEFAULT_COMMON_ERROR_SIGMA, MIN_REFERENCE_CLASS_SAMPLES, UNCERTAINTY_MODEL } from './constants/uncertainty.js';
import { buildEstimate } from './estimate.js';
import { buildStagesFromAnswers } from './quick.js';
import { EstimationInputError } from './errors.js';

/**
 * @typedef {Object} BacktestRecord
 * @property {string} id
 * @property {string} [title]
 * @property {import('./quick.js').QuickAnswers} answers Respuestas como se habrían dado el día de inicio.
 * @property {number} actualHours Esfuerzo real total.
 */

/** Proyecto mínimo para evaluar el esfuerzo de una tarea desde sus respuestas rápidas. */
function projectFromRecord(record) {
  return {
    name: record.title ?? record.id,
    taskType: record.answers.taskType,
    startDate: BACKTEST_REFERENCE_START_DATE,
    people: [BACKTEST_REFERENCE_PERSON],
    stages: buildStagesFromAnswers(record.answers).stages,
  };
}

/** Pinball loss relativa al real: penaliza más quedarse corto cuanto más alto es el cuantil. */
function relativePinballLoss(actual, forecast, quantile) {
  const difference = actual - forecast;
  const loss = difference >= 0 ? quantile * difference : (quantile - 1) * difference;
  return loss / actual;
}

/** @param {BacktestRecord} record */
function assertValidRecord(record, index) {
  if (!(record?.actualHours > 0)) {
    throw new EstimationInputError(`backtest:assertValidRecord failed for record #${index} "${record?.id ?? '(sin id)'}": actualHours debe ser > 0`);
  }
  if (!record.answers) {
    throw new EstimationInputError(`backtest:assertValidRecord failed for record #${index} "${record.id}": faltan las respuestas (answers)`);
  }
}

/**
 * Cocientes real/esperado de las OTRAS tareas (leave-one-out), del mismo tipo si alcanzan.
 * Evaluar una tarea con su propio dato inflaría la cobertura.
 */
function leaveOneOutRatios(evaluated, currentIndex) {
  const others = evaluated.filter((_, index) => index !== currentIndex);
  const sameType = others.filter((entry) => entry.record.answers.taskType === evaluated[currentIndex].record.answers.taskType);
  const pool = sameType.length >= MIN_REFERENCE_CLASS_SAMPLES ? sameType : others;
  return pool.length >= MIN_REFERENCE_CLASS_SAMPLES ? pool.map((entry) => entry.ratio) : null;
}

/** Veredicto según el criterio de aceptación fijado antes de mirar los datos. */
function verdictFor(coverage, evaluatedCount) {
  if (evaluatedCount < MIN_BACKTEST_RECORDS) return BACKTEST_VERDICT.INSUFFICIENT;
  const { p50, p80, p80Fail } = BACKTEST_ACCEPTANCE;
  if (coverage[80] < p80Fail.min || coverage[80] > p80Fail.max) return BACKTEST_VERDICT.FAIL;
  const inRange = (value, range) => value >= range.min && value <= range.max;
  return inRange(coverage[80], p80) && inRange(coverage[50], p50) ? BACKTEST_VERDICT.PASS : BACKTEST_VERDICT.BORDERLINE;
}

/**
 * Reestima cada tarea pasada con cada modelo de incertidumbre y mide si los percentiles
 * aciertan en la proporción que prometen (cobertura) y cuánto se equivocan (pinball loss).
 *
 * @param {BacktestRecord[]} records
 * @param {{runs?: number, seed?: number, commonErrorSigma?: number}} [options]
 */
export function runBacktest(records, options = {}) {
  const runs = options.runs ?? DEFAULT_BACKTEST_RUNS;
  const seed = options.seed ?? DEFAULT_SIMULATION_SEED;
  const sigma = options.commonErrorSigma ?? DEFAULT_COMMON_ERROR_SIGMA;
  records.forEach(assertValidRecord);

  const evaluated = records.map((record) => {
    const project = projectFromRecord(record);
    const expectedHours = buildEstimate(project, { runs: 0 }).effort.totalExpected;
    return { record, project, expectedHours, ratio: record.actualHours / expectedHours };
  });

  const modelFactories = {
    [UNCERTAINTY_MODEL.INDEPENDENT]: () => ({ kind: UNCERTAINTY_MODEL.INDEPENDENT }),
    [UNCERTAINTY_MODEL.COMMON_FACTOR]: () => ({ kind: UNCERTAINTY_MODEL.COMMON_FACTOR, sigma }),
    [UNCERTAINTY_MODEL.REFERENCE_CLASS]: (index) => {
      const ratios = leaveOneOutRatios(evaluated, index);
      return ratios ? { kind: UNCERTAINTY_MODEL.REFERENCE_CLASS, ratios } : null;
    },
  };

  const models = Object.entries(modelFactories).map(([kind, createModel]) => {
    const hits = Object.fromEntries(REPORTED_PERCENTILES.map((percentile) => [percentile, 0]));
    const pinball = Object.fromEntries(REPORTED_PERCENTILES.map((percentile) => [percentile, 0]));
    const perRecord = [];
    let evaluatedCount = 0;
    evaluated.forEach((entry, index) => {
      const uncertaintyModel = createModel(index);
      if (!uncertaintyModel) return;
      const estimate = buildEstimate(entry.project, { runs, seed: seed + index, uncertaintyModel, includeSchedule: false });
      evaluatedCount += 1;
      const forecasts = {};
      for (const { percentile, effortHours } of estimate.simulation.percentiles) {
        forecasts[percentile] = effortHours;
        if (entry.record.actualHours <= effortHours) hits[percentile] += 1;
        pinball[percentile] += relativePinballLoss(entry.record.actualHours, effortHours, percentile / 100);
      }
      perRecord.push({ id: entry.record.id, actualHours: entry.record.actualHours, expectedHours: entry.expectedHours, forecasts });
    });
    const coverage = Object.fromEntries(REPORTED_PERCENTILES.map((percentile) => [percentile, evaluatedCount ? hits[percentile] / evaluatedCount : null]));
    const meanPinball = evaluatedCount
      ? REPORTED_PERCENTILES.reduce((sum, percentile) => sum + pinball[percentile], 0) / (REPORTED_PERCENTILES.length * evaluatedCount)
      : null;
    return { kind, evaluatedCount, coverage, meanRelativePinballLoss: meanPinball, verdict: verdictFor(coverage, evaluatedCount), perRecord };
  });

  const ratios = evaluated.map((entry) => entry.ratio).sort((left, right) => left - right);
  return {
    recordCount: records.length,
    medianActualToExpectedRatio: ratios.length ? ratios[Math.floor((ratios.length - 1) / 2)] : null,
    models,
  };
}

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BACKTEST_VERDICT,
  buildEstimate,
  buildStagesFromAnswers,
  EstimationInputError,
  runBacktest,
  UNCERTAINTY_MODEL,
} from '../src/core/index.js';
import { generateSyntheticHistory } from './helpers/synthetic-history.js';

const BACKTEST_RUNS = 300;
const modelResult = (result, kind) => result.models.find((model) => model.kind === kind);
const quickProject = (answers) => ({
  name: 'Prueba',
  startDate: '2026-11-16',
  people: [{ id: 'dev', manualEffectiveHours: 5 }],
  stages: buildStagesFromAnswers(answers).stages,
  risks: [{ id: 'riesgo', description: 'Riesgo', probability: 0.5, impactHours: 10 }],
});

describe('Modelos de incertidumbre', () => {
  const answers = { taskType: 'feature', anchorHours: 20 };

  it('el factor común ensancha el rango sin mover la mediana de forma apreciable', () => {
    const independent = buildEstimate(quickProject(answers), { runs: 2000, uncertaintyModel: { kind: UNCERTAINTY_MODEL.INDEPENDENT }, includeSchedule: false });
    const common = buildEstimate(quickProject(answers), { runs: 2000, uncertaintyModel: { kind: UNCERTAINTY_MODEL.COMMON_FACTOR, sigma: 0.3 }, includeSchedule: false });
    const spread = (estimate) => estimate.simulation.percentiles[2].effortHours - estimate.simulation.percentiles[0].effortHours;
    assert.ok(spread(common) > spread(independent) * 1.5, `${spread(common)} vs ${spread(independent)}`);
    const median = (estimate) => estimate.simulation.percentiles[0].effortHours;
    assert.ok(Math.abs(median(common) / median(independent) - 1) < 0.1);
  });

  it('reference class escala el esperado por los cocientes históricos y no vuelve a sumar riesgos', () => {
    const estimate = buildEstimate(quickProject(answers), { runs: 1000, uncertaintyModel: { kind: UNCERTAINTY_MODEL.REFERENCE_CLASS, ratios: [1, 1, 1, 1, 1] }, includeSchedule: false });
    for (const { effortHours } of estimate.simulation.percentiles) {
      assert.ok(Math.abs(effortHours - estimate.effort.totalExpected) < 1e-9, 'con cocientes 1 el rango colapsa al esperado');
    }
  });

  it('rechaza modelos inválidos con un error claro', () => {
    assert.throws(() => buildEstimate(quickProject(answers), { runs: 10, uncertaintyModel: { kind: 'magia' } }), EstimationInputError);
    assert.throws(() => buildEstimate(quickProject(answers), { runs: 10, uncertaintyModel: { kind: UNCERTAINTY_MODEL.REFERENCE_CLASS, ratios: [] } }), /cocientes/);
  });
});

describe('Backtest', () => {
  it('con error correlacionado y sesgo optimista, detecta que el modelo independiente falla y reference class pasa', () => {
    const records = generateSyntheticHistory({ count: 120, seed: 11, trueLogBias: 0.15, trueLogSigma: 0.35 });
    const result = runBacktest(records, { runs: BACKTEST_RUNS });
    const independent = modelResult(result, UNCERTAINTY_MODEL.INDEPENDENT);
    const referenceClass = modelResult(result, UNCERTAINTY_MODEL.REFERENCE_CLASS);
    assert.ok(independent.coverage[80] < 0.65, `independiente P80 = ${independent.coverage[80]}`);
    assert.equal(independent.verdict, BACKTEST_VERDICT.FAIL);
    assert.equal(referenceClass.verdict, BACKTEST_VERDICT.PASS, `reference class P50 = ${referenceClass.coverage[50]}, P80 = ${referenceClass.coverage[80]}`);
  });

  it('si la realidad no tiene error común, reference class no infla el rango', () => {
    const records = generateSyntheticHistory({ count: 120, seed: 5, trueLogBias: 0, trueLogSigma: 0 });
    const referenceClass = modelResult(runBacktest(records, { runs: BACKTEST_RUNS }), UNCERTAINTY_MODEL.REFERENCE_CLASS);
    assert.ok(referenceClass.coverage[80] <= 0.9, `P80 = ${referenceClass.coverage[80]}`);
  });

  it('con pocas tareas no emite veredicto', () => {
    const records = generateSyntheticHistory({ count: 4, seed: 3, trueLogBias: 0, trueLogSigma: 0.2 });
    const result = runBacktest(records, { runs: 100 });
    for (const model of result.models) assert.equal(model.verdict, BACKTEST_VERDICT.INSUFFICIENT, model.kind);
    assert.equal(modelResult(result, UNCERTAINTY_MODEL.REFERENCE_CLASS).evaluatedCount, 0);
  });

  it('es reproducible con la misma semilla', () => {
    const records = generateSyntheticHistory({ count: 15, seed: 2, trueLogBias: 0.1, trueLogSigma: 0.3 });
    const first = runBacktest(records, { runs: 150, seed: 9 });
    const second = runBacktest(records, { runs: 150, seed: 9 });
    assert.deepEqual(first.models.map((model) => model.coverage), second.models.map((model) => model.coverage));
  });

  it('rechaza registros sin horas reales, nombrando el registro', () => {
    assert.throws(
      () => runBacktest([{ id: 'tarea-sin-horas', answers: { taskType: 'bug', anchorHours: 3 }, actualHours: 0 }]),
      (error) => error instanceof EstimationInputError && error.message.includes('tarea-sin-horas'),
    );
  });
});

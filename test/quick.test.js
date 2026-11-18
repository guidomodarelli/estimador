import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildEstimate, buildStagesFromAnswers, DEFAULT_DEVELOPMENT_HOURS, EstimationInputError, RFC_PART, STAGE_ID } from '../src/core/index.js';

const MONDAY = '2026-11-16';
const SINGLE_DEV = [{ id: 'dev', manualEffectiveHours: 5 }];
const stageById = (stages, stageId) => stages.find((stage) => stage.id === stageId);
const estimateFrom = (answers, runs = 0) =>
  buildEstimate({ name: 'Iniciativa', startDate: MONDAY, people: SINGLE_DEV, stages: buildStagesFromAnswers(answers).stages }, { runs });

describe('Estimación por complejidad', () => {
  it('genera RFC → Desarrollo → Pruebas → Rollout → Demo o evidencia, en ese orden', () => {
    const estimate = estimateFrom({ complexity: 'media' });
    assert.deepEqual(estimate.stages.map((stage) => stage.id), [STAGE_ID.RFC, STAGE_ID.DEVELOPMENT, STAGE_ID.TESTING, STAGE_ID.ROLLOUT, STAGE_ID.EVIDENCE]);
    for (const [previous, next] of estimate.stages.slice(0, -1).map((stage, index) => [stage, estimate.stages[index + 1]])) {
      assert.ok(next.startDate >= previous.endDate, `${next.id} empieza antes de que termine ${previous.id}`);
    }
  });

  it('sin horas de desarrollo usa las sugeridas para la complejidad, y con horas usa exactamente esas como M', () => {
    const suggested = buildStagesFromAnswers({ complexity: 'alta' });
    assert.equal(stageById(suggested.stages, STAGE_ID.DEVELOPMENT).mostLikely, DEFAULT_DEVELOPMENT_HOURS.alta);
    const explicit = buildStagesFromAnswers({ complexity: 'alta', developmentHours: 30 });
    assert.equal(stageById(explicit.stages, STAGE_ID.DEVELOPMENT).mostLikely, 30);
    for (const stage of explicit.stages) assert.ok(stage.optimistic <= stage.mostLikely && stage.mostLikely <= stage.pessimistic, stage.id);
  });

  it('más complejidad, con las mismas horas de desarrollo, alarga RFC, pruebas, demo y la fecha de rollout', () => {
    const low = estimateFrom({ complexity: 'baja', developmentHours: 20 });
    const high = estimateFrom({ complexity: 'alta', developmentHours: 20 });
    for (const stageId of [STAGE_ID.RFC, STAGE_ID.TESTING, STAGE_ID.EVIDENCE]) {
      assert.ok(stageById(high.stages, stageId).expected > stageById(low.stages, stageId).expected, stageId);
    }
    assert.ok(high.milestones[0].plannedDate > low.milestones[0].plannedDate);
  });

  it('el RFC suma solo las partes elegidas, y sin partes queda desactivado', () => {
    const full = buildStagesFromAnswers({ complexity: 'media' });
    const onlyUseCases = buildStagesFromAnswers({ complexity: 'media', rfcParts: [RFC_PART.USE_CASES] });
    assert.ok(stageById(onlyUseCases.stages, STAGE_ID.RFC).mostLikely < stageById(full.stages, STAGE_ID.RFC).mostLikely);
    const withoutRfc = estimateFrom({ complexity: 'media', rfcParts: [] });
    assert.ok(!withoutRfc.stages.some((stage) => stage.id === STAGE_ID.RFC));
    assert.equal(withoutRfc.stages[0].startDate, MONDAY, 'sin RFC, el desarrollo arranca el primer día');
  });

  it('reporta la fecha de rollout como hito, antes del fin, con P50 ≤ P80 ≤ P90', () => {
    const estimate = estimateFrom({ complexity: 'media' }, 400);
    const [rollout] = estimate.milestones;
    assert.equal(rollout.id, STAGE_ID.ROLLOUT);
    assert.ok(rollout.plannedDate < estimate.schedule.endDate, 'la evidencia espera el seguimiento del rollout');
    const [p50, p80, p90] = rollout.percentiles.map((row) => row.endDate);
    assert.ok(p50 <= p80 && p80 <= p90);
  });

  it('cada valor aplicado queda explicado en los supuestos', () => {
    const { explanations } = buildStagesFromAnswers({ complexity: 'alta' });
    assert.ok(explanations.some((text) => text.includes('Casos de uso')));
    assert.ok(explanations.some((text) => text.startsWith('Rollout')));
    assert.ok(explanations.some((text) => text.includes('sugerido')));
  });

  it('aplica la calibración histórica a todas las etapas', () => {
    const plain = buildStagesFromAnswers({ complexity: 'baja', developmentHours: 4 });
    const calibrated = buildStagesFromAnswers({ complexity: 'baja', developmentHours: 4, calibrationRatio: 1.5 });
    assert.equal(stageById(calibrated.stages, STAGE_ID.DEVELOPMENT).mostLikely, stageById(plain.stages, STAGE_ID.DEVELOPMENT).mostLikely * 1.5);
  });

  it('rechaza complejidades y partes del RFC fuera de las opciones', () => {
    assert.throws(() => buildStagesFromAnswers({ complexity: 'extrema' }), (error) => error instanceof EstimationInputError && /baja \| media \| alta/.test(error.message));
    assert.throws(() => buildStagesFromAnswers({ rfcParts: ['wireframes'] }), /wireframes/);
  });
});

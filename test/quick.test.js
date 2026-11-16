import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildEstimate, buildStagesFromAnswers, EstimationInputError } from '../src/core/index.js';

const MONDAY = '2026-11-16';
const SINGLE_DEV = [{ id: 'dev', manualEffectiveHours: 5 }];
const stageById = (stages, stageId) => stages.find((stage) => stage.id === stageId);
const estimateFrom = (answers) =>
  buildEstimate({ name: 'Rápida', startDate: MONDAY, people: SINGLE_DEV, stages: buildStagesFromAnswers(answers).stages }, { runs: 0 });

describe('Estimación rápida (5 preguntas)', () => {
  it('con respuestas por defecto, desarrollo usa exactamente las horas indicadas como M', () => {
    const { stages } = buildStagesFromAnswers({ taskType: 'feature', anchorHours: 10 });
    assert.equal(stageById(stages, 'desarrollo').mostLikely, 10);
    for (const stage of stages.filter((candidate) => candidate.included)) {
      assert.ok(stage.optimistic <= stage.mostLikely && stage.mostLikely <= stage.pessimistic, stage.id);
    }
  });

  it('el doble de horas de programación duplica aproximadamente el esfuerzo total', () => {
    const small = estimateFrom({ taskType: 'feature', anchorHours: 10 }).effort.expected;
    const large = estimateFrom({ taskType: 'feature', anchorHours: 20 }).effort.expected;
    assert.ok(Math.abs(large / small - 2) < 0.15, `ratio ${large / small}`);
  });

  it('requerimientos ambiguos ensanchan la P y suben el esperado, pero no tocan M', () => {
    const clear = buildStagesFromAnswers({ taskType: 'feature', anchorHours: 20 });
    const ambiguous = buildStagesFromAnswers({ taskType: 'feature', anchorHours: 20, requirementsClarity: 'ambiguos' });
    assert.equal(stageById(ambiguous.stages, 'desarrollo').mostLikely, stageById(clear.stages, 'desarrollo').mostLikely);
    assert.ok(stageById(ambiguous.stages, 'desarrollo').pessimistic > stageById(clear.stages, 'desarrollo').pessimistic);
    assert.ok(ambiguous.explanations.some((text) => text.includes('ambiguos')));
  });

  it('las dependencias externas alargan la fecha sin sumar esfuerzo', () => {
    const none = estimateFrom({ taskType: 'feature', anchorHours: 20 });
    const many = estimateFrom({ taskType: 'feature', anchorHours: 20, externalDependencies: 'múltiples' });
    assert.equal(many.effort.expected, none.effort.expected);
    assert.ok(many.schedule.workingDays > none.schedule.workingDays);
  });

  it('en un spike la pregunta dimensiona la investigación', () => {
    const { stages } = buildStagesFromAnswers({ taskType: 'spike', anchorHours: 6 });
    assert.equal(stageById(stages, 'investigacion').mostLikely, 6);
  });

  it('aplica la calibración histórica a todas las etapas', () => {
    const plain = buildStagesFromAnswers({ taskType: 'bug', anchorHours: 4 });
    const calibrated = buildStagesFromAnswers({ taskType: 'bug', anchorHours: 4, calibrationRatio: 1.5 });
    assert.equal(stageById(calibrated.stages, 'desarrollo').mostLikely, stageById(plain.stages, 'desarrollo').mostLikely * 1.5);
  });

  it('rechaza horas no positivas y respuestas fuera de las opciones', () => {
    assert.throws(() => buildStagesFromAnswers({ taskType: 'bug', anchorHours: 0 }), EstimationInputError);
    assert.throws(() => buildStagesFromAnswers({ taskType: 'bug', anchorHours: 3, complexity: 'extrema' }), /complexity/);
  });
});

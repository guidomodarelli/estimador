import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { quarterBounds, weeklyLoad } from '../web/state/quarter.js';
import { createNewEstimate, referenceClassRatios, regenerateStages, computeEstimate, summarizeResult, isDoubleCountWarning } from '../web/state/estimates.js';
import { createSampleProject } from '../src/core/index.js';

const TEAM = { people: [{ id: 'dev', manualEffectiveHours: 5 }], calendar: {}, meetingsReviewed: false };

describe('Trimestre', () => {
  it('calcula los límites del trimestre y permite moverse entre trimestres', () => {
    assert.deepEqual(quarterBounds('2026-11-16'), { start: '2026-10-01', end: '2026-12-31', label: 'Q4 2026' });
    assert.deepEqual(quarterBounds('2026-11-16', 1), { start: '2027-01-01', end: '2027-03-31', label: 'Q1 2027' });
    assert.equal(quarterBounds('2026-02-10', -1).label, 'Q4 2025');
  });

  it('reparte las horas P80 en los días laborales y las compara con la capacidad semanal', () => {
    const quarter = quarterBounds('2026-11-16');
    // Lunes 16 a viernes 20 de noviembre: 5 días laborales, 50 h → 10 h/día contra 5 h/día de capacidad.
    const weeks = weeklyLoad([{ startDate: '2026-11-16', p80Date: '2026-11-20', p80Hours: 50 }], TEAM, quarter);
    const week = weeks.find((candidate) => candidate.weekStart === '2026-11-16');
    assert.equal(Math.round(week.demandHours), 50);
    assert.equal(week.capacityHours, 25);
    const total = weeks.reduce((sum, candidate) => sum + candidate.demandHours, 0);
    assert.equal(Math.round(total), 50);
  });

  it('descuenta feriados de la capacidad', () => {
    const quarter = quarterBounds('2026-11-16');
    const team = { ...TEAM, calendar: { holidays: ['2026-11-18'] } };
    const week = weeklyLoad([], team, quarter).find((candidate) => candidate.weekStart === '2026-11-16');
    assert.equal(week.capacityHours, 20);
  });
});

describe('Estimaciones guardadas', () => {
  it('una estimación nueva trae las etapas generadas desde las respuestas', () => {
    const estimate = createNewEstimate('2026-11-16');
    assert.ok(estimate.project.stages.length > 0);
    assert.equal(estimate.project.quick.customized, false);
  });

  it('el historial se agrupa por estimación para reference class', () => {
    const history = [1.2, 1.4, 0.9, 1.1, 1.6].flatMap((ratio, index) => [
      { taskType: 'bug', estimateId: `e${index}`, stageId: 'desarrollo', estimatedHours: 4, actualHours: 4 * ratio },
      { taskType: 'bug', estimateId: `e${index}`, stageId: 'testing', estimatedHours: 2, actualHours: 2 * ratio },
    ]);
    const ratios = referenceClassRatios(history, 'bug');
    assert.equal(ratios.length, 5);
    assert.ok(Math.abs(ratios[0] - 1.2) < 1e-9);
    assert.equal(referenceClassRatios(history, 'feature'), null);
  });

  it('el aviso de doble conteo se oculta cuando el equipo ya revisó sus reuniones', () => {
    const estimate = createNewEstimate('2026-11-16');
    regenerateStages(estimate, []);
    const team = { people: createSampleProject('2026-11-16').people, calendar: {}, meetingsReviewed: false };
    assert.ok(computeEstimate(estimate, team, [], 0).warnings.some(isDoubleCountWarning));
    assert.ok(!computeEstimate(estimate, { ...team, meetingsReviewed: true }, [], 0).warnings.some(isDoubleCountWarning));
  });

  it('el resumen guardado trae fecha P80 y horas P80', () => {
    const summary = summarizeResult(computeEstimate(createNewEstimate('2026-11-16'), TEAM, [], 200));
    assert.ok(summary.p80Date >= summary.p50Date);
    assert.ok(summary.p80Hours >= summary.expectedHours * 0.8);
  });
});

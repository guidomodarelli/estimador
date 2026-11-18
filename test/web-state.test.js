import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { quarterBounds, weeklyLoad } from '../web/state/quarter.js';
import { createNewEstimate, referenceClassRatios, regenerateStages, computeEstimate, summarizeResult, isDoubleCountWarning } from '../web/state/estimates.js';
import { migrateTaskTypeStore } from '../web/state/store.js';
import { createSampleProject, STAGE_KIND } from '../src/core/index.js';

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

  it('el historial se agrupa por iniciativa y complejidad para reference class', () => {
    const history = [1.2, 1.4, 0.9, 1.1, 1.6].flatMap((ratio, index) => [
      { complexity: 'baja', estimateId: `e${index}`, stageId: 'desarrollo', estimatedHours: 4, actualHours: 4 * ratio },
      { complexity: 'baja', estimateId: `e${index}`, stageId: 'pruebas', estimatedHours: 2, actualHours: 2 * ratio },
    ]);
    const ratios = referenceClassRatios(history, 'baja');
    assert.equal(ratios.length, 5);
    assert.ok(Math.abs(ratios[0] - 1.2) < 1e-9);
    assert.equal(referenceClassRatios(history, 'alta'), null);
  });

  it('cambiar la complejidad regenera las etapas y mueve la fecha de rollout', () => {
    const estimate = createNewEstimate('2026-11-16');
    const before = summarizeResult(computeEstimate(estimate, TEAM, [], 0));
    estimate.project.quick.complexity = 'alta';
    regenerateStages(estimate, []);
    const after = summarizeResult(computeEstimate(estimate, TEAM, [], 0));
    assert.equal(estimate.project.complexity, 'alta');
    assert.ok(after.rolloutDate > before.rolloutDate);
  });

  it('migra datos guardados por tipo de tarea sin perder las etapas ni el historial', () => {
    const legacyStages = [{ id: 'desarrollo', name: 'Desarrollo e implementación', optimistic: 2, mostLikely: 4, pessimistic: 8 }];
    const migrated = migrateTaskTypeStore({
      version: 2,
      estimates: [{ id: 'e1', project: { name: 'Bug viejo', taskType: 'bug', stages: legacyStages, quick: { taskType: 'bug', anchorHours: 4, complexity: 'alta', requirementsClarity: 'parcial' } } }],
      history: [{ taskType: 'bug', estimateId: 'e1', estimatedHours: 4, actualHours: 6 }],
      team: TEAM,
    });
    const [estimate] = migrated.estimates;
    assert.equal(migrated.version, 3);
    assert.deepEqual(estimate.project.stages, legacyStages);
    assert.equal(estimate.project.quick.complexity, 'alta');
    assert.equal(estimate.project.quick.developmentHours, 4);
    assert.equal(estimate.project.quick.customized, true);
    assert.equal(migrated.history[0].complexity, 'alta');
    assert.ok(!('taskType' in estimate.project) && !('taskType' in migrated.history[0]));
  });

  it('el aviso de doble conteo se oculta cuando el equipo ya revisó sus reuniones', () => {
    const estimate = createNewEstimate('2026-11-16');
    estimate.project.stages.push({ id: 'reuniones', name: 'Reuniones de la iniciativa', kind: STAGE_KIND.COORDINATION, optimistic: 1, mostLikely: 2, pessimistic: 3 });
    const team = { people: createSampleProject('2026-11-16').people, calendar: {}, meetingsReviewed: false };
    assert.ok(computeEstimate(estimate, team, [], 0).warnings.some(isDoubleCountWarning));
    assert.ok(!computeEstimate(estimate, { ...team, meetingsReviewed: true }, [], 0).warnings.some(isDoubleCountWarning));
  });

  it('el resumen guardado trae fecha P80 y horas P80', () => {
    const summary = summarizeResult(computeEstimate(createNewEstimate('2026-11-16'), TEAM, [], 200));
    assert.ok(summary.p80Date >= summary.p50Date);
    assert.ok(summary.p80Hours >= summary.expectedHours * 0.8);
    assert.ok(summary.rolloutDate && summary.rolloutP80Date >= summary.rolloutDate);
  });
});

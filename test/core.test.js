import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEstimate,
  computeActivityEffort,
  computeEffectiveCapacity,
  buildStagesFromAnswers,
  createSampleProject,
  EstimationInputError,
  percentError,
  renderMarkdownSummary,
  scheduleActivities,
  STAGE_ID,
  STAGE_KIND,
  summarizeCalibration,
} from '../src/core/index.js';

/** Lunes sin feriados, para que las fechas esperadas sean fáciles de razonar. */
const MONDAY = '2026-11-16';
const SINGLE_DEV = [{ id: 'dev', workdayHours: 8, manualEffectiveHours: 5 }];
const baseCapacity = (people) => new Map(people.map((person) => [person.id, computeEffectiveCapacity(person).effectiveHours]));

describe('PERT', () => {
  it('calcula el esperado y la desviación del ejemplo de la propuesta (4/6/12 h)', () => {
    const effort = computeActivityEffort({ id: 'dev', optimistic: 4, mostLikely: 6, pessimistic: 12 });
    assert.equal(effort.expected.toFixed(2), '6.67');
    assert.equal(effort.standardDeviation.toFixed(2), '1.33');
  });

  it('en modo manual usa M como esperado pero conserva la incertidumbre', () => {
    const effort = computeActivityEffort({ id: 'dev', optimistic: 4, mostLikely: 6, pessimistic: 12, method: 'manual' });
    assert.equal(effort.expected, 6);
    assert.ok(effort.standardDeviation > 0);
  });

  it('rechaza O > M con un error que nombra la actividad', () => {
    assert.throws(
      () => computeActivityEffort({ id: 'testing', optimistic: 5, mostLikely: 3, pessimistic: 8 }),
      (error) => error instanceof EstimationInputError && error.message.includes('"testing"'),
    );
  });
});

describe('Capacidad efectiva', () => {
  it('8 h − 1 reuniones − 1 soporte − 1 reserva = 5 h', () => {
    const capacity = computeEffectiveCapacity({
      id: 'dev', workdayHours: 8, reserveHours: 1,
      deductions: [{ label: 'Reuniones', hours: 1 }, { label: 'Soporte', hours: 1 }],
    });
    assert.equal(capacity.effectiveHours, 5);
  });

  it('no descuenta reuniones que ya están estimadas como etapa (evita doble conteo)', () => {
    const capacity = computeEffectiveCapacity({
      id: 'dev', workdayHours: 8,
      deductions: [{ label: 'Reuniones de la tarea', hours: 1.5, scope: 'task' }, { label: 'Soporte', hours: 1 }],
    });
    assert.equal(capacity.effectiveHours, 7);
    assert.equal(capacity.excludedTaskDeductions.length, 1);
  });

  it('falla si las deducciones consumen toda la jornada', () => {
    assert.throws(() => computeEffectiveCapacity({ id: 'dev', workdayHours: 4, deductions: [{ label: 'x', hours: 4 }] }), EstimationInputError);
  });
});

describe('Planificación', () => {
  it('30 h con 5 h/día ocupan 6 días laborales y saltean el fin de semana', () => {
    const plan = scheduleActivities({
      activities: [{ id: 'feature', effortHours: 30, assigneeId: 'dev' }],
      people: SINGLE_DEV, baseCapacityByPerson: baseCapacity(SINGLE_DEV), calendar: { startDate: MONDAY },
    });
    assert.equal(plan.workingDays, 6);
    assert.equal(plan.endDate, '2026-11-23'); // lunes siguiente
  });

  it('respeta feriados y ausencias individuales', () => {
    const people = [{ ...SINGLE_DEV[0], absences: ['2026-11-18'] }];
    const plan = scheduleActivities({
      activities: [{ id: 'feature', effortHours: 15, assigneeId: 'dev' }],
      people, baseCapacityByPerson: baseCapacity(people), calendar: { startDate: MONDAY, holidays: ['2026-11-17'] },
    });
    assert.equal(plan.endDate, '2026-11-20'); // lun, (mar feriado), (mié ausente), jue, vie
  });

  it('dos personas en paralelo terminan antes que la suma secuencial', () => {
    const people = [{ id: 'ana', manualEffectiveHours: 5 }, { id: 'beto', manualEffectiveHours: 5 }];
    const plan = scheduleActivities({
      activities: [
        { id: 'front', effortHours: 10, assigneeId: 'ana' },
        { id: 'back', effortHours: 10, assigneeId: 'beto' },
        { id: 'integracion', effortHours: 5, assigneeId: 'ana', dependsOn: ['front', 'back'] },
      ],
      people, baseCapacityByPerson: baseCapacity(people), calendar: { startDate: MONDAY },
    });
    assert.equal(plan.workingDays, 3);
    assert.deepEqual(plan.criticalChain.at(-1), 'integracion');
  });

  it('el tiempo de espera alarga la duración sin sumar esfuerzo', () => {
    const activities = [
      { id: 'review', effortHours: 5, assigneeId: 'dev', waitWorkingDaysAfter: 2 },
      { id: 'deploy', effortHours: 5, assigneeId: 'dev', dependsOn: ['review'] },
    ];
    const plan = scheduleActivities({ activities, people: SINGLE_DEV, baseCapacityByPerson: baseCapacity(SINGLE_DEV), calendar: { startDate: MONDAY } });
    const deploy = plan.activities.find((activity) => activity.id === 'deploy');
    assert.equal(deploy.startDate, '2026-11-19'); // lun review, mar-mié espera, jue deploy
  });

  it('detecta dependencias circulares', () => {
    assert.throws(
      () => scheduleActivities({
        activities: [
          { id: 'a', effortHours: 1, assigneeId: 'dev', dependsOn: ['b'] },
          { id: 'b', effortHours: 1, assigneeId: 'dev', dependsOn: ['a'] },
        ],
        people: SINGLE_DEV, baseCapacityByPerson: baseCapacity(SINGLE_DEV), calendar: { startDate: MONDAY },
      }),
      /circular/,
    );
  });
});

describe('Estimación completa', () => {
  it('mantiene separados esfuerzo, capacidad, duración e incertidumbre', () => {
    const estimate = buildEstimate(createSampleProject(MONDAY), { runs: 300 });
    assert.ok(estimate.effort.expected > estimate.effort.optimistic);
    assert.equal(estimate.capacity.people[0].effectiveHours, 5);
    assert.ok(estimate.duration.scheduledWorkingDays >= Math.ceil(estimate.duration.effectiveWorkdaysSinglePerson));
    assert.ok(estimate.duration.naiveWorkdays < estimate.duration.effectiveWorkdaysSinglePerson);
  });

  it('la contingencia excluye riesgos ya contemplados en la P', () => {
    const project = createSampleProject(MONDAY);
    project.risks = [
      { id: 'a', description: 'A', probability: 0.5, impactHours: 10 },
      { id: 'b', description: 'B', probability: 0.5, impactHours: 10, includedInPessimistic: true },
    ];
    const estimate = buildEstimate(project, { runs: 0 });
    assert.equal(estimate.effort.contingencyHours, 5);
    assert.ok(estimate.warnings.some((warning) => warning.includes('"B"')));
  });

  it('Monte Carlo es reproducible con la misma semilla y P50 ≤ P80 ≤ P90', () => {
    const project = createSampleProject(MONDAY);
    const first = buildEstimate(project, { runs: 400, seed: 7 });
    const second = buildEstimate(project, { runs: 400, seed: 7 });
    assert.deepEqual(first.simulation.percentiles, second.simulation.percentiles);
    const [p50, p80, p90] = first.simulation.percentiles;
    assert.ok(p50.endDate <= p80.endDate && p80.endDate <= p90.endDate);
    assert.ok(p50.effortHours <= p80.effortHours);
  });

  it('desactivar una etapa hereda sus dependencias (sin pruebas, el rollout sigue al desarrollo)', () => {
    const stages = buildStagesFromAnswers({ complexity: 'baja' }).stages.map((stage) => (stage.id === STAGE_ID.TESTING ? { ...stage, included: false } : stage));
    const estimate = buildEstimate({ name: 'Sin pruebas', startDate: MONDAY, people: SINGLE_DEV, stages }, { runs: 0 });
    const development = estimate.stages.find((stage) => stage.id === STAGE_ID.DEVELOPMENT);
    const rollout = estimate.stages.find((stage) => stage.id === STAGE_ID.ROLLOUT);
    assert.ok(rollout.startDate >= development.endDate);
    assert.ok(!estimate.stages.some((stage) => stage.id === STAGE_ID.TESTING));
  });

  it('advierte posible doble conteo entre una etapa de reuniones y las reuniones descontadas', () => {
    const project = createSampleProject(MONDAY);
    project.stages.push({ id: 'reuniones', name: 'Reuniones', kind: STAGE_KIND.COORDINATION, optimistic: 1, mostLikely: 2, pessimistic: 3 });
    const estimate = buildEstimate(project, { runs: 0 });
    assert.ok(estimate.warnings.some((warning) => warning.startsWith('Posible doble conteo')));
  });

  it('genera un resumen compartible con totales, rango y supuestos', () => {
    const summary = renderMarkdownSummary(buildEstimate(createSampleProject(MONDAY), { runs: 200 }));
    assert.match(summary, /## Esfuerzo por etapa/);
    assert.match(summary, /P80/);
    assert.match(summary, /## Supuestos/);
    assert.match(summary, /Fecha de rollout/);
  });
});

describe('Historial', () => {
  it('error porcentual positivo indica subestimación', () => {
    assert.equal(percentError(10, 13), 30);
  });

  it('calibra con la mediana real/estimado de tareas similares', () => {
    const records = [
      { complexity: 'baja', estimatedHours: 4, actualHours: 6 },
      { complexity: 'baja', estimatedHours: 2, actualHours: 3 },
      { complexity: 'baja', estimatedHours: 5, actualHours: 5 },
      { complexity: 'alta', estimatedHours: 20, actualHours: 40 },
    ];
    const calibration = summarizeCalibration(records, { complexity: 'baja' });
    assert.equal(calibration.sampleCount, 3);
    assert.equal(calibration.medianRatio, 1.5);
    assert.equal(summarizeCalibration(records, { complexity: 'alta' }), null);
  });
});

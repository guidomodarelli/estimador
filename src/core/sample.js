import { INITIATIVE_COMPLEXITY, STAGE_ID } from './constants/stages.js';
import { buildStagesFromAnswers } from './quick.js';

/** Supuestos de negocio del ejemplo (los de la plantilla se agregan solos). */
export const SAMPLE_ASSUMPTIONS = Object.freeze(['El RFC se aprueba sin cambios grandes de alcance.', 'El entorno de staging está disponible para las pruebas.']);

/**
 * Iniciativa de ejemplo (jornada 8 h, capacidad efectiva 5 h), de complejidad media salvo que se indique otra.
 * @param {string} startDate
 * @param {import('./quick.js').QuickAnswers} [answers]
 */
export function createSampleProject(startDate, answers = { complexity: INITIATIVE_COMPLEXITY.MEDIUM }) {
  const generated = buildStagesFromAnswers(answers);
  return {
    name: 'Iniciativa de ejemplo',
    complexity: generated.factors.complexity,
    startDate,
    calendar: { workingWeekdays: [1, 2, 3, 4, 5], holidays: [] },
    people: [
      {
        id: 'dev',
        name: 'Desarrollador',
        workdayHours: 8,
        deductions: [
          { label: 'Reuniones recurrentes (daily, planning, retro)', hours: 1, scope: 'external', kind: 'meetings' },
          { label: 'Soporte e interrupciones', hours: 1, scope: 'external', kind: 'interruptions' },
        ],
        reserveHours: 1,
        absences: [],
      },
    ],
    stages: generated.stages,
    risks: [
      { id: 'api-externa', description: 'La API del otro equipo no está lista a tiempo', probability: 0.3, impactHours: 6, activityId: STAGE_ID.DEVELOPMENT },
      { id: 'rollback', description: 'Las métricas del rollout obligan a volver atrás y corregir', probability: 0.15, impactHours: 8, activityId: STAGE_ID.ROLLOUT },
    ],
    assumptions: [...SAMPLE_ASSUMPTIONS, ...generated.explanations],
    externalDependencies: ['Endpoint del equipo Backend'],
    factors: generated.factors,
  };
}

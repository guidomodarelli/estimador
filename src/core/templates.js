import { STAGE_KIND, TASK_TYPE } from './constants/stages.js';

/**
 * Las 10 etapas del ciclo. Las dependencias por defecto modelan el flujo habitual;
 * la coordinación corre en paralelo y el code review incluye 1 día de espera de revisores.
 */
const STAGE_DEFINITIONS = Object.freeze([
  { id: 'requerimientos', name: 'Relevamiento y requerimientos', kind: STAGE_KIND.REQUIREMENTS, dependsOn: [] },
  { id: 'investigacion', name: 'Investigación y análisis técnico', kind: STAGE_KIND.RESEARCH, dependsOn: ['requerimientos'] },
  { id: 'diseno-ux', name: 'Diseño y coordinación UX/UI', kind: STAGE_KIND.DESIGN, dependsOn: ['requerimientos'] },
  { id: 'planificacion', name: 'Planificación técnica', kind: STAGE_KIND.PLANNING, dependsOn: ['investigacion', 'diseno-ux'] },
  { id: 'desarrollo', name: 'Desarrollo e implementación', kind: STAGE_KIND.DEVELOPMENT, dependsOn: ['planificacion'] },
  { id: 'testing', name: 'Testing y validaciones', kind: STAGE_KIND.TESTING, dependsOn: ['desarrollo'] },
  { id: 'code-review', name: 'Code review', kind: STAGE_KIND.CODE_REVIEW, dependsOn: ['testing'], waitWorkingDaysAfter: 1 },
  { id: 'coordinacion', name: 'Coordinación y comunicación', kind: STAGE_KIND.COORDINATION, dependsOn: [] },
  { id: 'demo', name: 'Demo y validación funcional', kind: STAGE_KIND.DEMO, dependsOn: ['code-review'] },
  { id: 'despliegue', name: 'Despliegue y seguimiento', kind: STAGE_KIND.DEPLOYMENT, dependsOn: ['demo'] },
]);

/**
 * Horas O/M/P por etapa y tipo de tarea. Son un punto de partida: se reemplazan
 * con la calibración histórica en cuanto haya datos reales.
 * `null` = etapa desactivada por defecto en esa plantilla.
 */
const TEMPLATE_HOURS = Object.freeze({
  [TASK_TYPE.FEATURE]: {
    requerimientos: [1, 2, 4], investigacion: [1, 3, 6], 'diseno-ux': [0.5, 1.5, 3], planificacion: [1, 2, 3],
    desarrollo: [12, 20, 36], testing: [4, 8, 14], 'code-review': [1, 2, 5], coordinacion: [2, 3, 5],
    demo: [1, 1.5, 3], despliegue: [0.5, 1, 3],
  },
  [TASK_TYPE.BUG]: {
    requerimientos: [0.5, 1, 2], investigacion: [1, 2, 6], 'diseno-ux': null, planificacion: null,
    desarrollo: [1, 3, 8], testing: [1, 2, 4], 'code-review': [0.5, 1, 2], coordinacion: [0.5, 1, 2],
    demo: null, despliegue: [0.5, 1, 2],
  },
  [TASK_TYPE.REFACTOR]: {
    requerimientos: [0.5, 1, 2], investigacion: [2, 4, 8], 'diseno-ux': null, planificacion: [1, 2, 4],
    desarrollo: [8, 14, 28], testing: [3, 6, 12], 'code-review': [1, 3, 6], coordinacion: [1, 2, 3],
    demo: null, despliegue: [0.5, 1, 3],
  },
  [TASK_TYPE.SPIKE]: {
    requerimientos: [0.5, 1, 2], investigacion: [4, 8, 16], 'diseno-ux': null, planificacion: null,
    desarrollo: [2, 4, 8], testing: null, 'code-review': null, coordinacion: [0.5, 1, 2],
    demo: [0.5, 1, 2], despliegue: null,
  },
});

/** Nombres visibles de cada plantilla. */
export const TEMPLATE_LABELS = Object.freeze({
  [TASK_TYPE.FEATURE]: 'Nueva funcionalidad',
  [TASK_TYPE.BUG]: 'Bug',
  [TASK_TYPE.REFACTOR]: 'Refactorización',
  [TASK_TYPE.SPIKE]: 'Investigación técnica (spike)',
});

/**
 * Crea las etapas de una plantilla listas para editar.
 * @param {string} taskType
 */
export function createStagesFromTemplate(taskType) {
  const hours = TEMPLATE_HOURS[taskType];
  if (!hours) throw new Error(`templates:createStagesFromTemplate failed: plantilla desconocida "${taskType}"`);
  return STAGE_DEFINITIONS.map((definition) => {
    const values = hours[definition.id];
    const [optimistic, mostLikely, pessimistic] = values ?? [0, 0, 0];
    return {
      ...definition,
      dependsOn: [...definition.dependsOn],
      optimistic,
      mostLikely,
      pessimistic,
      method: 'pert',
      included: values !== null,
    };
  });
}

/**
 * Proyecto de ejemplo coherente con el caso de la propuesta (jornada 8 h, capacidad 5 h).
 * @param {string} startDate
 */
export function createSampleProject(startDate) {
  return {
    name: 'Nueva funcionalidad de ejemplo',
    taskType: TASK_TYPE.FEATURE,
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
    stages: createStagesFromTemplate(TASK_TYPE.FEATURE),
    risks: [
      { id: 'api-externa', description: 'La API del otro equipo no está lista a tiempo', probability: 0.3, impactHours: 6, activityId: 'desarrollo' },
      { id: 'cambio-alcance', description: 'Producto cambia criterios de aceptación tras la demo', probability: 0.2, impactHours: 8 },
    ],
    assumptions: ['Los diseños de UX están aprobados antes de empezar el desarrollo.', 'El entorno de staging está disponible.'],
    externalDependencies: ['Endpoint de pagos del equipo Backend'],
    factors: { complexity: 'media', requirementsClarity: 'parcial', externalDependencies: 'pocas', priorExperience: 'sí', reworkRisk: 'medio' },
  };
}

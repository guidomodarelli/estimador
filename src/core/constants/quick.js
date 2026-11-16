/**
 * Parámetros de la estimación rápida. Son un punto de partida explícito y editable:
 * no se aplican en silencio, cada ajuste queda registrado como supuesto y la
 * calibración histórica los reemplaza en cuanto hay datos reales.
 */

/** Etapa que el usuario dimensiona con una sola cifra, según el tipo de tarea. */
export const ANCHOR_STAGE_BY_TASK_TYPE = Object.freeze({
  bug: 'desarrollo',
  feature: 'desarrollo',
  refactor: 'desarrollo',
  spike: 'investigacion',
});

/** Opciones de cada pregunta (el primer valor es el default). */
export const QUICK_OPTIONS = Object.freeze({
  requirementsClarity: ['definidos', 'parcial', 'ambiguos'],
  complexity: ['baja', 'media', 'alta'],
  priorExperience: ['sí', 'parcial', 'no'],
  externalDependencies: ['ninguna', 'pocas', 'múltiples'],
});

/**
 * Cuánto se ensancha la estimación pesimista (P) según cada respuesta,
 * como fracción adicional, y qué etapas afecta.
 */
export const PESSIMISTIC_WIDENING = Object.freeze({
  requirementsClarity: {
    values: { definidos: 0, parcial: 0.25, ambiguos: 0.6 },
    stageIds: ['requerimientos', 'diseno-ux', 'desarrollo', 'testing', 'demo'],
    label: 'Claridad de requerimientos',
  },
  complexity: {
    values: { baja: 0, media: 0.15, alta: 0.4 },
    stageIds: ['investigacion', 'desarrollo', 'testing', 'code-review'],
    label: 'Complejidad técnica',
  },
  priorExperience: {
    values: { sí: 0, parcial: 0.2, no: 0.5 },
    stageIds: ['investigacion', 'desarrollo', 'testing'],
    label: 'Experiencia previa',
  },
});

/**
 * Las dependencias externas no suman esfuerzo: agregan días laborales de espera
 * después de la etapa de desarrollo (aprobaciones, respuestas de otros equipos).
 */
export const EXTERNAL_DEPENDENCY_WAIT_DAYS = Object.freeze({ ninguna: 0, pocas: 1, múltiples: 3 });
export const EXTERNAL_DEPENDENCY_WAIT_STAGE_ID = 'desarrollo';

/** Las horas generadas se redondean a medias horas. */
export const QUICK_HOURS_ROUNDING_STEP = 0.5;

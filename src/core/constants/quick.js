import { INITIATIVE_COMPLEXITY, RFC_PART } from './stages.js';

/**
 * Parámetros de la estimación por complejidad. Son un punto de partida explícito y editable:
 * cada valor aplicado queda escrito en los supuestos del resumen y la calibración histórica
 * los corrige en cuanto hay iniciativas terminadas. Las ternas son horas [O, M, P].
 */

const { LOW, MEDIUM, HIGH } = INITIATIVE_COMPLEXITY;

/** Opciones de complejidad (el valor del medio es el default). */
export const COMPLEXITY_OPTIONS = Object.freeze([LOW, MEDIUM, HIGH]);
export const DEFAULT_COMPLEXITY = MEDIUM;

/** Partes del RFC, todas incluidas por defecto. */
export const RFC_PART_OPTIONS = Object.freeze(Object.values(RFC_PART));

/** Horas de cada parte del RFC según la complejidad. */
export const RFC_PART_HOURS = Object.freeze({
  [RFC_PART.STAGES]: { [LOW]: [0.5, 1, 2], [MEDIUM]: [1, 2, 4], [HIGH]: [2, 4, 8] },
  [RFC_PART.USE_CASES]: { [LOW]: [0.5, 1, 2], [MEDIUM]: [1, 3, 5], [HIGH]: [3, 5, 10] },
  [RFC_PART.TRACKING_METRICS]: { [LOW]: [0.5, 1, 2], [MEDIUM]: [1, 2, 4], [HIGH]: [2, 4, 8] },
  [RFC_PART.ROLLOUT_METRICS]: { [LOW]: [0.5, 1, 1.5], [MEDIUM]: [1, 1.5, 3], [HIGH]: [1.5, 3, 6] },
});

/** Días laborales de espera para la revisión y aprobación del RFC antes de desarrollar. */
export const RFC_REVIEW_WAIT_DAYS = Object.freeze({ [LOW]: 0, [MEDIUM]: 1, [HIGH]: 2 });

/** Horas de desarrollo sugeridas cuando no se indican. */
export const DEFAULT_DEVELOPMENT_HOURS = Object.freeze({ [LOW]: 8, [MEDIUM]: 24, [HIGH]: 56 });

/** Rango del desarrollo como múltiplo de las horas más probables: más complejidad, cola más larga. */
export const DEVELOPMENT_RANGE_FACTORS = Object.freeze({
  [LOW]: { optimistic: 0.75, pessimistic: 1.5 },
  [MEDIUM]: { optimistic: 0.75, pessimistic: 1.8 },
  [HIGH]: { optimistic: 0.75, pessimistic: 2.3 },
});

/** Pruebas como fracción [O, M, P] de las horas más probables de desarrollo. */
export const TESTING_SHARE_OF_DEVELOPMENT = Object.freeze({
  [LOW]: [0.15, 0.25, 0.4],
  [MEDIUM]: [0.2, 0.35, 0.55],
  [HIGH]: [0.3, 0.45, 0.75],
});

/** Esfuerzo del rollout (deploy, flags, monitoreo inicial). */
export const ROLLOUT_HOURS = Object.freeze({ [LOW]: [0.5, 1, 2], [MEDIUM]: [1, 2, 4], [HIGH]: [2, 4, 8] });

/** Días laborales de seguimiento del rollout (métricas por RO) antes de poder mostrar evidencia. */
export const ROLLOUT_MONITORING_WAIT_DAYS = Object.freeze({ [LOW]: 1, [MEDIUM]: 2, [HIGH]: 5 });

/** Esfuerzo de la demo o de armar la evidencia compartible. */
export const EVIDENCE_HOURS = Object.freeze({ [LOW]: [0.5, 1, 2], [MEDIUM]: [1, 2, 4], [HIGH]: [2, 4, 8] });

/** Las horas generadas se redondean a medias horas. */
export const QUICK_HOURS_ROUNDING_STEP = 0.5;

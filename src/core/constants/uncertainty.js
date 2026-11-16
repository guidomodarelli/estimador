/**
 * Modelos de incertidumbre de la simulación Monte Carlo.
 *
 * - independent: cada etapa varía por su cuenta (Beta-PERT). Subestima el rango cuando
 *   los errores de las etapas están correlacionados, que es lo habitual.
 * - common-factor: además del ruido por etapa, cada corrida aplica un multiplicador
 *   lognormal compartido por todas las etapas (optimismo o requerimientos borrosos que
 *   afectan a toda la tarea). Media 1: no mueve el esperado, ensancha el rango.
 * - reference-class: con historial suficiente, el multiplicador se sortea de los cocientes
 *   real/esperado de tareas pasadas del mismo tipo (bootstrap). El historial ya incluye
 *   ruido por etapa y riesgos ocurridos, por eso en este modo no se suman de nuevo.
 */
export const UNCERTAINTY_MODEL = Object.freeze({
  INDEPENDENT: 'independent',
  COMMON_FACTOR: 'common-factor',
  REFERENCE_CLASS: 'reference-class',
});

/**
 * Desvío del logaritmo del factor común cuando no hay historial. Es un punto de partida
 * NO validado con datos del usuario: 0,25 equivale a que el total real quede, en 2 de cada
 * 3 tareas, entre −22 % y +28 % de lo esperado. El backtest con tareas reales debe reemplazarlo.
 */
export const DEFAULT_COMMON_ERROR_SIGMA = 0.25;

/** Tareas pasadas del mismo tipo necesarias para usar reference class. */
export const MIN_REFERENCE_CLASS_SAMPLES = 5;

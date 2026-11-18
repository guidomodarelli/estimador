import { INITIATIVE_COMPLEXITY, RFC_PART, STAGE_ID, STAGE_KIND } from './constants/stages.js';

/**
 * Las 5 etapas de una iniciativa típica, en cadena: el RFC define el alcance, después se
 * desarrolla y se prueba, se hace el rollout y, con las métricas del rollout, se arma la
 * demo o la evidencia compartible.
 */
export const STAGE_DEFINITIONS = Object.freeze([
  { id: STAGE_ID.RFC, name: 'RFC', kind: STAGE_KIND.RFC, dependsOn: [] },
  { id: STAGE_ID.DEVELOPMENT, name: 'Desarrollo', kind: STAGE_KIND.DEVELOPMENT, dependsOn: [STAGE_ID.RFC] },
  { id: STAGE_ID.TESTING, name: 'Pruebas', kind: STAGE_KIND.TESTING, dependsOn: [STAGE_ID.DEVELOPMENT] },
  { id: STAGE_ID.ROLLOUT, name: 'Rollout', kind: STAGE_KIND.ROLLOUT, dependsOn: [STAGE_ID.TESTING] },
  { id: STAGE_ID.EVIDENCE, name: 'Demo o evidencia compartible', kind: STAGE_KIND.EVIDENCE, dependsOn: [STAGE_ID.ROLLOUT] },
]);

/** Nombres visibles de las partes del RFC. */
export const RFC_PART_LABELS = Object.freeze({
  [RFC_PART.STAGES]: 'Etapas',
  [RFC_PART.USE_CASES]: 'Casos de uso',
  [RFC_PART.TRACKING_METRICS]: 'Métricas (tracks)',
  [RFC_PART.ROLLOUT_METRICS]: 'Métricas por RO',
});

/** Nombres visibles de cada complejidad. */
export const COMPLEXITY_LABELS = Object.freeze({
  [INITIATIVE_COMPLEXITY.LOW]: 'Baja',
  [INITIATIVE_COMPLEXITY.MEDIUM]: 'Media',
  [INITIATIVE_COMPLEXITY.HIGH]: 'Alta',
});

/** Dependencias por defecto de una etapa de la plantilla (vacío si no es de la plantilla). */
export function templateDependencies(stageId) {
  return [...(STAGE_DEFINITIONS.find((definition) => definition.id === stageId)?.dependsOn ?? [])];
}

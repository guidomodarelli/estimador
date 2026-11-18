/** Tipos de etapa del ciclo de una iniciativa. */
export const STAGE_KIND = Object.freeze({
  RFC: 'rfc',
  DEVELOPMENT: 'development',
  TESTING: 'testing',
  ROLLOUT: 'rollout',
  EVIDENCE: 'evidence',
  /** No está en la plantilla: se conserva para avisar doble conteo si alguien agrega una etapa de reuniones. */
  COORDINATION: 'coordination',
});

/** Ids de las etapas de la plantilla, en orden. */
export const STAGE_ID = Object.freeze({
  RFC: 'rfc',
  DEVELOPMENT: 'desarrollo',
  TESTING: 'pruebas',
  ROLLOUT: 'rollout',
  EVIDENCE: 'demo-evidencia',
});

/** Complejidad de la iniciativa: es la única pregunta que mueve los tiempos de todas las etapas. */
export const INITIATIVE_COMPLEXITY = Object.freeze({
  LOW: 'baja',
  MEDIUM: 'media',
  HIGH: 'alta',
});

/** Partes que componen el RFC. */
export const RFC_PART = Object.freeze({
  STAGES: 'etapas',
  USE_CASES: 'casos-de-uso',
  TRACKING_METRICS: 'metricas-tracks',
  ROLLOUT_METRICS: 'metricas-ro',
});

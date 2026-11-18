/**
 * Constantes del modelo de estimación. Todo valor con significado de dominio vive acá
 * para que el modelo sea configurable y explicable.
 */

/** Peso del valor más probable en la fórmula PERT: (O + 4M + P) / 6. */
export const PERT_MOST_LIKELY_WEIGHT = 4;
/** Divisor PERT para media y desviación estándar. */
export const PERT_DIVISOR = 6;

/** Métodos de estimación por actividad. */
export const ESTIMATION_METHOD = Object.freeze({
  PERT: 'pert',
  MANUAL: 'manual',
});

/**
 * Clasificación de una deducción de la jornada para evitar el doble conteo:
 * - external: actividad ajena a la tarea, reduce la capacidad.
 * - task: ya estimada como etapa de la tarea, NO se descuenta.
 */
export const DEDUCTION_SCOPE = Object.freeze({
  EXTERNAL: 'external',
  TASK: 'task',
});

/** Días laborales por defecto (0 = domingo ... 6 = sábado). */
export const DEFAULT_WORKING_WEEKDAYS = Object.freeze([1, 2, 3, 4, 5]);

/** Jornada laboral por defecto en horas. */
export const DEFAULT_WORKDAY_HOURS = 8;

/** Corridas de Monte Carlo por defecto. */
export const DEFAULT_SIMULATION_RUNS = 2000;
/** Semilla por defecto para que la simulación sea reproducible. */
export const DEFAULT_SIMULATION_SEED = 42;
/** Percentiles reportados por la simulación. */
export const REPORTED_PERCENTILES = Object.freeze([50, 80, 90]);
/** Percentil que se comunica como fecha comprometida ("con 80 % de confianza"). */
export const COMMUNICATED_PERCENTILE = 80;
/** Escala de una proporción (0–1) a porcentaje. */
export const PERCENT_SCALE = 100;
/** Nombre visible de la actividad que agrupa la contingencia por riesgos. */
export const CONTINGENCY_ACTIVITY_NAME = 'Contingencia por riesgos';
/** Título que separa, en el resumen compartible, lo que lee producto del detalle de cálculo. */
export const SUMMARY_TECHNICAL_DETAIL_HEADING = '## Detalle técnico';

/** Tolerancia numérica para comparar horas. */
export const HOURS_EPSILON = 1e-9;

/** Tope de días calendario que el planificador recorre antes de abortar (evita loops infinitos). */
export const MAX_SCHEDULING_CALENDAR_DAYS = 3650;

/** Milisegundos en un día, para aritmética de fechas UTC. */
export const MILLISECONDS_PER_DAY = 86_400_000;

/** Persona asignada por defecto cuando una actividad no indica responsable. */
export const DEFAULT_ASSIGNEE_ID = 'dev';

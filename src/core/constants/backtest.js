/** Criterio de aceptación del backtest: la cobertura real debe parecerse a la prometida. */
export const BACKTEST_ACCEPTANCE = Object.freeze({
  p50: { min: 0.4, max: 0.6 },
  p80: { min: 0.7, max: 0.9 },
  /** Fuera de este rango el P80 es directamente inútil (demasiado optimista o demasiado ancho). */
  p80Fail: { min: 0.65, max: 0.95 },
});

export const BACKTEST_VERDICT = Object.freeze({ PASS: 'pasa', BORDERLINE: 'dudoso', FAIL: 'falla', INSUFFICIENT: 'sin datos suficientes' });

/** Tareas mínimas para emitir veredicto: con menos, la cobertura es puro ruido. */
export const MIN_BACKTEST_RECORDS = 10;

/** Corridas por tarea en el backtest (solo esfuerzo, sin calendario). */
export const DEFAULT_BACKTEST_RUNS = 800;

/** Fecha fija para que el backtest no dependa del día en que se corre. */
export const BACKTEST_REFERENCE_START_DATE = '2026-01-05';

/** Capacidad irrelevante para el esfuerzo; solo hace falta un responsable válido. */
export const BACKTEST_REFERENCE_PERSON = Object.freeze({ id: 'dev', name: 'Desarrollador', manualEffectiveHours: 6 });

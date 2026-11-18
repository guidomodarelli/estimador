import { percentileOf } from './random.js';
import { EstimationInputError } from './errors.js';

/**
 * @typedef {Object} ActualRecord
 * @property {string} complexity Complejidad de la iniciativa (baja, media, alta).
 * @property {string} [stageId] Etapa, si el registro es por etapa.
 * @property {number} estimatedHours
 * @property {number} actualHours
 */

/**
 * Error porcentual = (real − estimado) / estimado × 100.
 * Positivo = se subestimó. No es una métrica de precisión absoluta.
 * @param {number} estimatedHours
 * @param {number} actualHours
 */
export function percentError(estimatedHours, actualHours) {
  if (!(estimatedHours > 0)) {
    throw new EstimationInputError(`history:percentError failed: el estimado debe ser > 0 (recibido ${estimatedHours})`);
  }
  return ((actualHours - estimatedHours) / estimatedHours) * 100;
}

/**
 * Resume la relación real/estimado de registros similares para calibrar estimaciones futuras.
 * Devuelve null si no hay datos suficientes.
 * @param {ActualRecord[]} records
 * @param {{complexity?: string, stageId?: string, minimumSamples?: number}} [filter]
 */
export function summarizeCalibration(records, filter = {}) {
  const minimumSamples = filter.minimumSamples ?? 3;
  const matching = records.filter(
    (record) =>
      record.estimatedHours > 0 &&
      (!filter.complexity || record.complexity === filter.complexity) &&
      (!filter.stageId || record.stageId === filter.stageId),
  );
  if (matching.length < minimumSamples) return null;
  const ratios = matching.map((record) => record.actualHours / record.estimatedHours).sort((left, right) => left - right);
  const errors = matching.map((record) => percentError(record.estimatedHours, record.actualHours));
  return {
    sampleCount: matching.length,
    medianRatio: percentileOf(ratios, 50),
    p80Ratio: percentileOf(ratios, 80),
    meanPercentError: errors.reduce((sum, error) => sum + error, 0) / errors.length,
    underestimatedShare: matching.filter((record) => record.actualHours > record.estimatedHours).length / matching.length,
  };
}

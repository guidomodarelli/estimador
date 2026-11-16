import { EstimationInputError } from './errors.js';

/**
 * @typedef {Object} Risk
 * @property {string} id
 * @property {string} description
 * @property {number} probability Probabilidad de ocurrencia (0-1).
 * @property {number} impactHours Horas extra si ocurre.
 * @property {string} [activityId] Actividad afectada; si falta, se agrega al final.
 * @property {boolean} [includedInPessimistic] Ya contemplado en la P: no suma contingencia (evita doble conteo).
 */

/** @param {Risk} risk */
export function assertValidRisk(risk) {
  if (!(risk.probability >= 0 && risk.probability <= 1)) {
    throw new EstimationInputError(`risks:assertValidRisk failed for risk "${risk.id}": la probabilidad debe estar entre 0 y 1 (recibido ${risk.probability})`);
  }
  if (!(risk.impactHours >= 0)) {
    throw new EstimationInputError(`risks:assertValidRisk failed for risk "${risk.id}": el impacto debe ser >= 0 h (recibido ${risk.impactHours})`);
  }
}

/** Riesgos que aportan contingencia (los ya incluidos en la P se excluyen). */
export function contingencyRisks(risks) {
  return risks.filter((risk) => !risk.includedInPessimistic);
}

/**
 * Contingencia esperada = Σ probabilidad × impacto, solo sobre riesgos no incluidos en la P.
 * @param {Risk[]} risks
 */
export function computeExpectedContingency(risks) {
  risks.forEach(assertValidRisk);
  const applicable = contingencyRisks(risks);
  return {
    expectedHours: applicable.reduce((sum, risk) => sum + risk.probability * risk.impactHours, 0),
    applicableRiskIds: applicable.map((risk) => risk.id),
    excludedRiskIds: risks.filter((risk) => risk.includedInPessimistic).map((risk) => risk.id),
  };
}

import { PERT_MOST_LIKELY_WEIGHT } from './constants/estimation.js';

/** Constantes del algoritmo mulberry32 (generador pseudoaleatorio con semilla). */
const MULBERRY_INCREMENT = 0x6d2b79f5;
const UINT32_RANGE = 4_294_967_296;

/**
 * Generador pseudoaleatorio reproducible: misma semilla, mismos resultados.
 * @param {number} seed
 * @returns {() => number} Números en [0, 1).
 */
export function createSeededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + MULBERRY_INCREMENT) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / UINT32_RANGE;
  };
}

/** Normal estándar por Box-Muller. */
export function sampleStandardNormal(random) {
  const uniformA = 1 - random();
  const uniformB = random();
  return Math.sqrt(-2 * Math.log(uniformA)) * Math.cos(2 * Math.PI * uniformB);
}

/** Gamma(shape >= 1, 1) por Marsaglia-Tsang. */
function sampleGamma(shape, random) {
  const offset = shape - 1 / 3;
  const scale = 1 / Math.sqrt(9 * offset);
  for (;;) {
    let normal;
    let candidate;
    do {
      normal = sampleStandardNormal(random);
      candidate = 1 + scale * normal;
    } while (candidate <= 0);
    candidate = candidate ** 3;
    const uniform = random();
    if (Math.log(uniform) < 0.5 * normal ** 2 + offset - offset * candidate + offset * Math.log(candidate)) {
      return offset * candidate;
    }
  }
}

/**
 * Muestra de la distribución Beta-PERT, coherente con la media (O + 4M + P) / 6.
 * @param {{optimistic: number, mostLikely: number, pessimistic: number}} estimate
 * @param {() => number} random
 */
export function sampleBetaPert({ optimistic, mostLikely, pessimistic }, random) {
  const range = pessimistic - optimistic;
  if (range <= 0) return mostLikely;
  const alpha = 1 + (PERT_MOST_LIKELY_WEIGHT * (mostLikely - optimistic)) / range;
  const beta = 1 + (PERT_MOST_LIKELY_WEIGHT * (pessimistic - mostLikely)) / range;
  const gammaAlpha = sampleGamma(alpha, random);
  const gammaBeta = sampleGamma(beta, random);
  return optimistic + (gammaAlpha / (gammaAlpha + gammaBeta)) * range;
}

/**
 * Multiplicador lognormal con media 1 (mu = −σ²/2): ensancha sin mover el esperado.
 * @param {number} sigma Desvío del logaritmo.
 * @param {() => number} random
 */
export function sampleUnitMeanLognormal(sigma, random) {
  if (!(sigma > 0)) return 1;
  return Math.exp(-(sigma ** 2) / 2 + sigma * sampleStandardNormal(random));
}

/**
 * Percentil por rango más cercano sobre valores ya ordenados.
 * @template T
 * @param {T[]} sortedValues
 * @param {number} percentile 0-100
 * @returns {T}
 */
export function percentileOf(sortedValues, percentile) {
  const rank = Math.ceil((percentile / 100) * sortedValues.length);
  return sortedValues[Math.min(sortedValues.length - 1, Math.max(0, rank - 1))];
}

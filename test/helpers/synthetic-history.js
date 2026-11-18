import { buildStagesFromAnswers, COMPLEXITY_OPTIONS } from '../../src/core/index.js';
import { createSeededRandom, sampleBetaPert, sampleStandardNormal } from '../../src/core/random.js';

/**
 * Genera un historial sintético con una "verdad" conocida: el esfuerzo real es la suma de las
 * etapas muestreadas por Beta-PERT, multiplicada por un factor común lognormal con sesgo
 * optimista (las tareas tienden a llevar más de lo estimado, como reporta la literatura).
 * Sirve para comprobar que el backtest detecta un modelo mal calibrado y que reference class lo corrige.
 *
 * @param {{count: number, seed: number, trueLogBias: number, trueLogSigma: number}} options
 */
export function generateSyntheticHistory({ count, seed, trueLogBias, trueLogSigma }) {
  const random = createSeededRandom(seed);
  const pick = (options) => options[Math.floor(random() * options.length)];
  return Array.from({ length: count }, (_, index) => {
    const answers = {
      complexity: pick(COMPLEXITY_OPTIONS),
      developmentHours: Math.round((2 + random() * 40) * 2) / 2,
    };
    const commonFactor = Math.exp(trueLogBias + trueLogSigma * sampleStandardNormal(random));
    const stageSum = buildStagesFromAnswers(answers).stages
      .filter((stage) => stage.included)
      .reduce((sum, stage) => sum + sampleBetaPert(stage, random), 0);
    return { id: `sintetica-${index + 1}`, answers, actualHours: stageSum * commonFactor };
  });
}

import {
  COMPLEXITY_OPTIONS,
  DEFAULT_COMPLEXITY,
  DEFAULT_DEVELOPMENT_HOURS,
  DEVELOPMENT_RANGE_FACTORS,
  EVIDENCE_HOURS,
  QUICK_HOURS_ROUNDING_STEP,
  RFC_PART_HOURS,
  RFC_PART_OPTIONS,
  RFC_REVIEW_WAIT_DAYS,
  ROLLOUT_HOURS,
  ROLLOUT_MONITORING_WAIT_DAYS,
  TESTING_SHARE_OF_DEVELOPMENT,
} from './constants/quick.js';
import { STAGE_ID } from './constants/stages.js';
import { formatDays } from './summary.js';
import { COMPLEXITY_LABELS, RFC_PART_LABELS, STAGE_DEFINITIONS } from './templates.js';
import { EstimationInputError } from './errors.js';

/**
 * @typedef {Object} QuickAnswers
 * @property {string} [complexity] baja | media | alta (default: media).
 * @property {number|null} [developmentHours] Horas más probables de desarrollo; vacío = sugerido por complejidad.
 * @property {string[]} [rfcParts] Partes del RFC a escribir (default: todas).
 * @property {number} [calibrationRatio] Factor real/estimado del historial; 1 o vacío = sin calibrar.
 */

/** @typedef {[number, number, number]} ThreePointHours Horas [optimista, más probable, pesimista]. */

const roundHours = (hours) => Math.round(hours / QUICK_HOURS_ROUNDING_STEP) * QUICK_HOURS_ROUNDING_STEP;
const sumThreePoints = (threePoints) => threePoints.reduce((total, values) => total.map((sum, index) => sum + values[index]), [0, 0, 0]);
const formatHoursList = (threePoint) => threePoint.map(formatDays).join(' / ');
const workingDaysText = (days) => `${days} ${days === 1 ? 'día laboral' : 'días laborales'}`;

/** Completa las respuestas faltantes con los valores por defecto. */
export function withDefaultAnswers(answers = {}) {
  const complexity = answers.complexity ?? DEFAULT_COMPLEXITY;
  return {
    ...answers,
    complexity,
    developmentHours: answers.developmentHours > 0 ? answers.developmentHours : null,
    rfcParts: Array.isArray(answers.rfcParts) ? answers.rfcParts : [...RFC_PART_OPTIONS],
  };
}

/** Horas de desarrollo que se usan: las indicadas o las sugeridas para la complejidad. */
export function resolveDevelopmentHours(answers) {
  const completed = withDefaultAnswers(answers);
  return completed.developmentHours ?? DEFAULT_DEVELOPMENT_HOURS[completed.complexity];
}

function assertValidAnswers(answers) {
  if (!COMPLEXITY_OPTIONS.includes(answers.complexity)) {
    throw new EstimationInputError(`quick:buildStagesFromAnswers failed: "complexity" debe ser ${COMPLEXITY_OPTIONS.join(' | ')} (recibido "${answers.complexity}")`);
  }
  const unknownParts = answers.rfcParts.filter((part) => !RFC_PART_OPTIONS.includes(part));
  if (unknownParts.length) {
    throw new EstimationInputError(`quick:buildStagesFromAnswers failed: partes del RFC desconocidas "${unknownParts.join(', ')}" (opciones: ${RFC_PART_OPTIONS.join(', ')})`);
  }
}

/**
 * Calcula la terna de horas y la espera posterior de cada etapa de la plantilla.
 * @returns {Record<string, {threePoint: ThreePointHours, waitDays: number, included: boolean, explanation: string}>}
 */
function stagePlan(answers, developmentHours) {
  const { complexity } = answers;
  const label = COMPLEXITY_LABELS[complexity].toLowerCase();
  const rfcHours = sumThreePoints(answers.rfcParts.map((part) => RFC_PART_HOURS[part][complexity]));
  const rfcPartNames = answers.rfcParts.map((part) => RFC_PART_LABELS[part]).join(', ');
  const range = DEVELOPMENT_RANGE_FACTORS[complexity];
  const testingShare = TESTING_SHARE_OF_DEVELOPMENT[complexity];
  const rfcWait = RFC_REVIEW_WAIT_DAYS[complexity];
  const monitoringWait = ROLLOUT_MONITORING_WAIT_DAYS[complexity];
  return {
    [STAGE_ID.RFC]: {
      threePoint: rfcHours,
      waitDays: rfcWait,
      included: answers.rfcParts.length > 0,
      explanation: answers.rfcParts.length
        ? `RFC con ${rfcPartNames}: ${formatHoursList(rfcHours)} h${rfcWait ? `, más ${workingDaysText(rfcWait)} de revisión y aprobación` : ''}.`
        : 'Sin RFC: la iniciativa arranca directo en desarrollo.',
    },
    [STAGE_ID.DEVELOPMENT]: {
      threePoint: [developmentHours * range.optimistic, developmentHours, developmentHours * range.pessimistic],
      waitDays: 0,
      included: true,
      explanation: `Desarrollo: ${developmentHours} h más probables; con complejidad ${label}, el máximo es ${formatDays(range.pessimistic)} veces eso.`,
    },
    [STAGE_ID.TESTING]: {
      threePoint: testingShare.map((share) => developmentHours * share),
      waitDays: 0,
      included: true,
      explanation: `Pruebas: ${Math.round(testingShare[1] * 100)} % del desarrollo (complejidad ${label}).`,
    },
    [STAGE_ID.ROLLOUT]: {
      threePoint: ROLLOUT_HOURS[complexity],
      waitDays: monitoringWait,
      included: true,
      explanation: `Rollout: ${formatHoursList(ROLLOUT_HOURS[complexity])} h y ${workingDaysText(monitoringWait)} de seguimiento de métricas antes de la evidencia.`,
    },
    [STAGE_ID.EVIDENCE]: {
      threePoint: EVIDENCE_HOURS[complexity],
      waitDays: 0,
      included: true,
      explanation: `Demo o evidencia compartible: ${formatHoursList(EVIDENCE_HOURS[complexity])} h.`,
    },
  };
}

/**
 * Genera las etapas de la iniciativa a partir de la complejidad, las horas de desarrollo y las
 * partes del RFC. Cada valor aplicado se devuelve como explicación para el resumen.
 * @param {QuickAnswers} rawAnswers
 */
export function buildStagesFromAnswers(rawAnswers = {}) {
  const answers = withDefaultAnswers(rawAnswers);
  assertValidAnswers(answers);
  const developmentHours = resolveDevelopmentHours(answers);
  const calibrationRatio = answers.calibrationRatio > 0 ? answers.calibrationRatio : 1;
  const plan = stagePlan(answers, developmentHours);

  const stages = STAGE_DEFINITIONS.map((definition) => {
    const { threePoint, waitDays, included } = plan[definition.id];
    const [optimistic, mostLikely, pessimistic] = threePoint.map((hours) => hours * calibrationRatio);
    const roundedOptimistic = roundHours(optimistic);
    const roundedMostLikely = Math.max(roundedOptimistic, QUICK_HOURS_ROUNDING_STEP, roundHours(mostLikely));
    return {
      ...definition,
      dependsOn: [...definition.dependsOn],
      optimistic: roundedOptimistic,
      mostLikely: roundedMostLikely,
      pessimistic: Math.max(roundedMostLikely, roundHours(pessimistic)),
      method: 'pert',
      included,
      ...(waitDays ? { waitWorkingDaysAfter: waitDays } : {}),
    };
  });

  const explanations = [
    `Complejidad ${COMPLEXITY_LABELS[answers.complexity].toLowerCase()}${answers.developmentHours ? '' : ` (desarrollo sugerido: ${developmentHours} h)`}.`,
    ...STAGE_DEFINITIONS.map((definition) => plan[definition.id].explanation),
  ];
  if (calibrationRatio !== 1) explanations.push(`Calibración histórica aplicada: ×${formatDays(calibrationRatio)} sobre todas las etapas.`);

  return { stages, explanations, factors: { complexity: answers.complexity } };
}

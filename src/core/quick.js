import {
  ANCHOR_STAGE_BY_TASK_TYPE,
  EXTERNAL_DEPENDENCY_WAIT_DAYS,
  EXTERNAL_DEPENDENCY_WAIT_STAGE_ID,
  PESSIMISTIC_WIDENING,
  QUICK_HOURS_ROUNDING_STEP,
  QUICK_OPTIONS,
} from './constants/quick.js';
import { createStagesFromTemplate } from './templates.js';
import { EstimationInputError } from './errors.js';

/**
 * @typedef {Object} QuickAnswers
 * @property {string} taskType bug | feature | refactor | spike
 * @property {number} anchorHours Horas "más probables" de la etapa ancla (programación, o investigación en un spike).
 * @property {string} [requirementsClarity] definidos | parcial | ambiguos
 * @property {string} [complexity] baja | media | alta
 * @property {string} [priorExperience] sí | parcial | no
 * @property {string} [externalDependencies] ninguna | pocas | múltiples
 * @property {number} [calibrationRatio] Factor real/estimado del historial; 1 o vacío = sin calibrar.
 */

const roundHours = (hours) => Math.round(hours / QUICK_HOURS_ROUNDING_STEP) * QUICK_HOURS_ROUNDING_STEP;

/** Completa respuestas faltantes con el primer valor de cada pregunta. */
export function withDefaultAnswers(answers) {
  const completed = { ...answers };
  for (const [question, options] of Object.entries(QUICK_OPTIONS)) completed[question] ??= options[0];
  return completed;
}

/**
 * Genera todas las etapas a partir de cinco respuestas. Las proporciones entre etapas
 * salen de la plantilla del tipo de tarea; las respuestas solo ensanchan la P o agregan
 * espera, y cada ajuste se devuelve como explicación para el resumen.
 * @param {QuickAnswers} rawAnswers
 * @returns {{stages: ReturnType<typeof createStagesFromTemplate>, explanations: string[], factors: Record<string, string>}}
 */
export function buildStagesFromAnswers(rawAnswers) {
  const answers = withDefaultAnswers(rawAnswers);
  const anchorStageId = ANCHOR_STAGE_BY_TASK_TYPE[answers.taskType];
  if (!anchorStageId) {
    throw new EstimationInputError(`quick:buildStagesFromAnswers failed: tipo de tarea desconocido "${answers.taskType}"`);
  }
  if (!(answers.anchorHours > 0)) {
    throw new EstimationInputError(`quick:buildStagesFromAnswers failed: las horas de la etapa principal deben ser > 0 (recibido ${answers.anchorHours})`);
  }
  for (const [question, options] of Object.entries(QUICK_OPTIONS)) {
    if (!options.includes(answers[question])) {
      throw new EstimationInputError(`quick:buildStagesFromAnswers failed: "${question}" debe ser ${options.join(' | ')} (recibido "${answers[question]}")`);
    }
  }

  const stages = createStagesFromTemplate(answers.taskType);
  const anchor = stages.find((stage) => stage.id === anchorStageId);
  const calibrationRatio = answers.calibrationRatio > 0 ? answers.calibrationRatio : 1;
  const scale = (answers.anchorHours / anchor.mostLikely) * calibrationRatio;
  const explanations = [
    `Etapas proporcionales a ${answers.anchorHours} h de "${anchor.name}", según la plantilla del tipo de tarea.`,
  ];
  if (calibrationRatio !== 1) explanations.push(`Calibración histórica aplicada: ×${calibrationRatio.toFixed(2)} sobre todas las etapas.`);

  const wideningByStage = new Map();
  for (const [question, rule] of Object.entries(PESSIMISTIC_WIDENING)) {
    const widening = rule.values[answers[question]];
    if (!widening) continue;
    for (const stageId of rule.stageIds) wideningByStage.set(stageId, (wideningByStage.get(stageId) ?? 0) + widening);
    explanations.push(`${rule.label} "${answers[question]}": pesimista +${Math.round(widening * 100)} % en ${rule.stageIds.length} etapas.`);
  }

  for (const stage of stages) {
    if (!stage.included) continue;
    const optimistic = roundHours(stage.optimistic * scale);
    const mostLikely = Math.max(optimistic, QUICK_HOURS_ROUNDING_STEP, roundHours(stage.mostLikely * scale));
    const widenedPessimistic = stage.pessimistic * scale * (1 + (wideningByStage.get(stage.id) ?? 0));
    Object.assign(stage, { optimistic, mostLikely, pessimistic: Math.max(mostLikely, roundHours(widenedPessimistic)) });
  }

  const waitDays = EXTERNAL_DEPENDENCY_WAIT_DAYS[answers.externalDependencies];
  if (waitDays > 0) {
    const waitStage = stages.find((stage) => stage.id === EXTERNAL_DEPENDENCY_WAIT_STAGE_ID && stage.included) ?? anchor;
    waitStage.waitWorkingDaysAfter = (waitStage.waitWorkingDaysAfter ?? 0) + waitDays;
    explanations.push(`Dependencias externas "${answers.externalDependencies}": ${waitDays} día(s) laborales de espera después de "${waitStage.name}" (alarga la fecha, no el esfuerzo).`);
  }

  return {
    stages,
    explanations,
    factors: {
      complexity: answers.complexity,
      requirementsClarity: answers.requirementsClarity,
      externalDependencies: answers.externalDependencies,
      priorExperience: answers.priorExperience,
    },
  };
}

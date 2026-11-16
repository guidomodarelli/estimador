/** API pública del núcleo de estimación, compartida por la web y la CLI. */
export { buildEstimate, CONTINGENCY_ACTIVITY_ID } from './estimate.js';
export { computeActivityEffort, aggregateEfforts } from './pert.js';
export { computeEffectiveCapacity } from './capacity.js';
export { scheduleActivities } from './schedule.js';
export { percentError, summarizeCalibration } from './history.js';
export { createStagesFromTemplate, createSampleProject, TEMPLATE_LABELS } from './templates.js';
export { renderMarkdownSummary, formatHours, formatDays, formatDate, describeUncertaintyModel } from './summary.js';
export { EstimationInputError } from './errors.js';
export { buildStagesFromAnswers, withDefaultAnswers } from './quick.js';
export { runBacktest } from './backtest.js';
export { BACKTEST_ACCEPTANCE, BACKTEST_VERDICT, MIN_BACKTEST_RECORDS } from './constants/backtest.js';
export { UNCERTAINTY_MODEL, DEFAULT_COMMON_ERROR_SIGMA, MIN_REFERENCE_CLASS_SAMPLES } from './constants/uncertainty.js';
export { DEFAULT_UNCERTAINTY_MODEL } from './estimate.js';
export { QUICK_OPTIONS, ANCHOR_STAGE_BY_TASK_TYPE } from './constants/quick.js';
export { TASK_TYPE, STAGE_KIND } from './constants/stages.js';
export { DEDUCTION_SCOPE } from './constants/estimation.js';

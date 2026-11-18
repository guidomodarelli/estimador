/** API pública del núcleo de estimación, compartida por la web y la CLI. */
export { buildEstimate, CONTINGENCY_ACTIVITY_ID, MILESTONE_STAGE_KINDS } from './estimate.js';
export { computeActivityEffort, aggregateEfforts } from './pert.js';
export { computeEffectiveCapacity } from './capacity.js';
export { scheduleActivities } from './schedule.js';
export { percentError, summarizeCalibration } from './history.js';
export { STAGE_DEFINITIONS, RFC_PART_LABELS, COMPLEXITY_LABELS, templateDependencies } from './templates.js';
export { createSampleProject, SAMPLE_ASSUMPTIONS } from './sample.js';
export { renderMarkdownSummary, formatHours, formatDays, formatDate, describeUncertaintyModel } from './summary.js';
export { EstimationInputError } from './errors.js';
export { buildStagesFromAnswers, withDefaultAnswers, resolveDevelopmentHours } from './quick.js';
export { runBacktest } from './backtest.js';
export { BACKTEST_ACCEPTANCE, BACKTEST_VERDICT, MIN_BACKTEST_RECORDS } from './constants/backtest.js';
export { UNCERTAINTY_MODEL, DEFAULT_COMMON_ERROR_SIGMA, MIN_REFERENCE_CLASS_SAMPLES } from './constants/uncertainty.js';
export { DEFAULT_UNCERTAINTY_MODEL } from './estimate.js';
export { COMPLEXITY_OPTIONS, DEFAULT_COMPLEXITY, DEFAULT_DEVELOPMENT_HOURS, RFC_PART_OPTIONS } from './constants/quick.js';
export { INITIATIVE_COMPLEXITY, RFC_PART, STAGE_ID, STAGE_KIND } from './constants/stages.js';
export { COMMUNICATED_PERCENTILE, CONTINGENCY_ACTIVITY_NAME, DEDUCTION_SCOPE, PERCENT_SCALE, SUMMARY_TECHNICAL_DETAIL_HEADING } from './constants/estimation.js';

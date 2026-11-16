/** Tipos de etapa del ciclo de desarrollo. */
export const STAGE_KIND = Object.freeze({
  REQUIREMENTS: 'requirements',
  RESEARCH: 'research',
  DESIGN: 'design',
  PLANNING: 'planning',
  DEVELOPMENT: 'development',
  TESTING: 'testing',
  CODE_REVIEW: 'code-review',
  COORDINATION: 'coordination',
  DEMO: 'demo',
  DEPLOYMENT: 'deployment',
});

/** Tipos de tarea con plantilla predefinida. */
export const TASK_TYPE = Object.freeze({
  BUG: 'bug',
  FEATURE: 'feature',
  REFACTOR: 'refactor',
  SPIKE: 'spike',
});

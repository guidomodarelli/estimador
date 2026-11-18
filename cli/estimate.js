#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import {
  buildEstimate,
  COMPLEXITY_LABELS,
  createSampleProject,
  DEFAULT_COMPLEXITY,
  EstimationInputError,
  formatDate,
  formatHours,
  renderMarkdownSummary,
  resolveDevelopmentHours,
  RFC_PART_OPTIONS,
  buildStagesFromAnswers,
  runBacktest,
  BACKTEST_ACCEPTANCE,
  BACKTEST_VERDICT,
  UNCERTAINTY_MODEL,
} from '../src/core/index.js';
import { createUi, supportsColor } from './ui.js';

const EXIT_CODE = Object.freeze({ OK: 0, INPUT_ERROR: 1, USAGE_ERROR: 2 });
const OUTPUT_FORMAT = Object.freeze({ TEXT: 'text', MARKDOWN: 'md', JSON: 'json' });
const DEFAULT_PROJECT_FILE = 'estimacion.json';
const DEFAULT_CLI_RUNS = '2000';
/** Prefijo de los códigos de error de node:util parseArgs (opción desconocida, valor ambiguo, etc.). */
const PARSE_ARGS_ERROR_PREFIX = 'ERR_PARSE_ARGS';
/** Valor de --rfc para estimar sin RFC. */
const NO_RFC_OPTION = 'ninguno';

const HELP_TEXT = `estimador — estimaciones de desarrollo con PERT, capacidad efectiva y Monte Carlo

Uso:
  estimador quick [horas] [--complexity baja|media|alta] [--rfc partes] [--team equipo.json] [--save archivo.json]
  estimador init [--complexity baja|media|alta] [--rfc partes] [--start YYYY-MM-DD] [--output archivo.json]
  estimador <proyecto.json> [--format text|md|json] [--runs N] [--seed N]
  estimador backtest <tareas.json> [--format text|json] [--runs N] [--sigma X]

Backtest: reestima tareas ya terminadas (respuestas del día de inicio + horas reales) y
mide si P50/P80/P90 aciertan en la proporción que prometen. Ver data/backtest-plantilla.json.
      --sigma       Desvío del factor común a evaluar (default: el del modelo)

Estimación rápida (quick): una iniciativa típica es RFC → Desarrollo → Pruebas →
Rollout → Demo o evidencia compartible. La complejidad define los tiempos de cada etapa;
[horas] son las horas de desarrollo más probables (si se omiten, se usan las sugeridas).
      --complexity  baja | media | alta (default: ${DEFAULT_COMPLEXITY})
      --rfc         Partes del RFC separadas por coma: ${RFC_PART_OPTIONS.join(', ')}
                    (default: todas; "${NO_RFC_OPTION}" = sin RFC)
      --team        Proyecto JSON del que se toman equipo, capacidad y feriados
      --save        Guarda el proyecto generado para ajustarlo después
      --name        Nombre de la tarea

Opciones:
  -s, --start      Fecha de inicio para init (default: hoy)
  -o, --output     Archivo a generar con init (default: ${DEFAULT_PROJECT_FILE})
  -f, --format     Salida: text (default), md (resumen para compartir) o json
  -r, --runs       Corridas de Monte Carlo (default: ${DEFAULT_CLI_RUNS}; 0 la desactiva)
      --seed       Semilla de la simulación (resultados reproducibles)
  -h, --help       Muestra esta ayuda
`;

const todayIso = () => new Date().toISOString().slice(0, 10);

/** Partes del RFC pedidas con --rfc (undefined = todas). */
function parseRfcParts(rfcOption) {
  if (rfcOption === undefined) return undefined;
  if (rfcOption.trim() === NO_RFC_OPTION) return [];
  return rfcOption.split(',').map((part) => part.trim()).filter(Boolean);
}

async function runInit(values, ui) {
  const complexity = values.complexity ?? DEFAULT_COMPLEXITY;
  const project = createSampleProject(values.start ?? todayIso(), { complexity, rfcParts: parseRfcParts(values.rfc) });
  project.name = `Iniciativa de complejidad ${COMPLEXITY_LABELS[complexity].toLowerCase()}`;
  const outputPath = values.output ?? DEFAULT_PROJECT_FILE;
  await writeFile(outputPath, `${JSON.stringify(project, null, 2)}\n`, 'utf8');
  ui.banner('estimador init', project.name);
  ui.status('done', `Proyecto creado en ${outputPath}`);
  ui.write();
  ui.box('Próximos pasos', [`1. Editá ${outputPath} (horas O/M/P, equipo, riesgos)`, `2. estimador ${outputPath}`, `3. estimador ${outputPath} --format md > resumen.md`]);
}

async function readProjectFile(projectPath) {
  try {
    return JSON.parse(await readFile(projectPath, 'utf8'));
  } catch (readError) {
    throw new EstimationInputError(`cli:loadProject failed for "${projectPath}": ${readError.message}`, { cause: readError });
  }
}

/** Arma un proyecto completo desde las respuestas rápidas; equipo y calendario salen de --team o del ejemplo. */
async function buildQuickProject(values, hoursArgument) {
  const developmentHours = hoursArgument === undefined ? null : Number(hoursArgument);
  if (developmentHours !== null && !(developmentHours > 0)) {
    throw new UsageError(`quick: las horas de desarrollo deben ser un número > 0 (recibido "${hoursArgument}")`);
  }
  const answers = { complexity: values.complexity ?? DEFAULT_COMPLEXITY, developmentHours, rfcParts: parseRfcParts(values.rfc) };
  const generated = buildStagesFromAnswers(answers);
  const base = values.team ? await readProjectFile(values.team) : createSampleProject(values.start ?? todayIso());
  return {
    ...base,
    name: values.name ?? `Iniciativa de complejidad ${COMPLEXITY_LABELS[answers.complexity].toLowerCase()} (${resolveDevelopmentHours(answers)} h de desarrollo)`,
    complexity: answers.complexity,
    startDate: values.start ?? (values.team ? base.startDate : todayIso()),
    stages: generated.stages,
    factors: generated.factors,
    risks: values.team ? base.risks ?? [] : [],
    assumptions: [...(values.team ? base.assumptions ?? [] : []), ...generated.explanations],
    externalDependencies: values.team ? base.externalDependencies ?? [] : [],
  };
}

const MODEL_LABELS = Object.freeze({
  [UNCERTAINTY_MODEL.INDEPENDENT]: 'Etapas independientes',
  [UNCERTAINTY_MODEL.COMMON_FACTOR]: 'Factor de error común',
  [UNCERTAINTY_MODEL.REFERENCE_CLASS]: 'Historial (reference class)',
});
const VERDICT_STATUS = Object.freeze({
  [BACKTEST_VERDICT.PASS]: 'done',
  [BACKTEST_VERDICT.BORDERLINE]: 'warning',
  [BACKTEST_VERDICT.FAIL]: 'error',
  [BACKTEST_VERDICT.INSUFFICIENT]: 'skipped',
});
const formatShare = (share) => (share === null ? '—' : `${Math.round(share * 100)} %`);

function renderBacktestText(result, ui) {
  const { p50, p80 } = BACKTEST_ACCEPTANCE;
  ui.banner('Backtest de calibración', `${result.recordCount} tareas · mediana real/esperado ×${result.medianActualToExpectedRatio?.toFixed(2) ?? '—'}`);
  ui.step(1, 2, 'Cobertura real de cada percentil (cuántas tareas terminaron en ese esfuerzo o menos)');
  ui.table(
    ['Modelo', 'Tareas', 'P50', 'P80', 'P90', 'Pinball'],
    result.models.map((model) => [MODEL_LABELS[model.kind], model.evaluatedCount, formatShare(model.coverage[50]), formatShare(model.coverage[80]), formatShare(model.coverage[90]), model.meanRelativePinballLoss?.toFixed(3) ?? '—']),
    [1, 2, 3, 4, 5],
  );
  ui.write();
  ui.step(2, 2, `Veredicto (pasa si P80 entre ${formatShare(p80.min)} y ${formatShare(p80.max)} y P50 entre ${formatShare(p50.min)} y ${formatShare(p50.max)})`);
  for (const model of result.models) ui.status(VERDICT_STATUS[model.verdict], `${MODEL_LABELS[model.kind]}: ${model.verdict}`);
  ui.write();
  ui.write(ui.paint('dim', '  Pinball: error relativo promedio de los percentiles (menor es mejor). Historial evaluado sin usar la propia tarea (leave-one-out).'));
}

async function runBacktestCommand(values, recordsPath, runs, ui) {
  if (!recordsPath) throw new UsageError('backtest necesita el archivo de tareas (ver data/backtest-plantilla.json)');
  const content = await readProjectFile(recordsPath);
  const records = Array.isArray(content) ? content : content.records;
  if (!Array.isArray(records)) throw new EstimationInputError(`cli:backtest failed for "${recordsPath}": se esperaba una lista de tareas o { "records": [...] }`);
  const sigma = values.sigma === undefined ? undefined : Number(values.sigma);
  if (sigma !== undefined && !(sigma >= 0)) throw new UsageError(`--sigma debe ser un número >= 0 (recibido "${values.sigma}")`);
  const result = runBacktest(records, { runs, seed: values.seed === undefined ? undefined : Number(values.seed), commonErrorSigma: sigma });
  if (values.format === OUTPUT_FORMAT.JSON) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else renderBacktestText(result, ui);
}

function renderText(estimate, ui) {
  const { paint } = ui;
  ui.banner(`Estimación: ${estimate.project.name}`, `Inicio ${formatDate(estimate.project.startDate)}`);

  ui.step(1, 4, 'Esfuerzo por etapa (PERT)');
  ui.table(
    ['Etapa', 'O', 'M', 'P', 'Esperado', '±σ', 'Fin'],
    estimate.stages.map((stage) => [stage.name, formatHours(stage.optimistic), formatHours(stage.mostLikely), formatHours(stage.pessimistic), formatHours(stage.expected + stage.contingencyHours), formatHours(stage.standardDeviation), formatDate(stage.endDate)]),
    [1, 2, 3, 4, 5],
  );
  ui.write();

  ui.step(2, 4, 'Capacidad efectiva');
  for (const person of estimate.capacity.people) {
    ui.status('done', `${person.personId}: ${formatHours(person.effectiveHours)}/día de ${formatHours(person.workdayHours)} de jornada`);
    for (const excluded of person.excludedTaskDeductions) ui.status('skipped', `No se descuenta "${excluded.label}": ya es una etapa`);
  }
  ui.write();

  ui.step(3, 4, 'Planificación con dependencias');
  ui.status('done', `${estimate.duration.scheduledWorkingDays} días laborales → ${formatDate(estimate.schedule.endDate)}`);
  ui.status('changed', `Cadena crítica: ${estimate.schedule.criticalChain.join(' → ')}`);
  for (const milestone of estimate.milestones) ui.status('done', `Fecha de ${milestone.name.toLowerCase()}: ${formatDate(milestone.plannedDate)}`);
  ui.write();

  ui.step(4, 4, 'Rango probabilístico');
  if (estimate.simulation) {
    ui.table(
      ['Confianza', 'Esfuerzo', 'Días', 'Entrega'],
      estimate.simulation.percentiles.map((row) => [`P${row.percentile}`, formatHours(row.effortHours), row.workingDays, formatDate(row.endDate)]),
      [1, 2],
    );
  } else {
    ui.status('skipped', 'Monte Carlo desactivado (--runs 0)');
  }
  ui.write();
  for (const warning of estimate.warnings) ui.status('warning', paint('yellow', warning));
  if (estimate.warnings.length) ui.write();

  const p80 = estimate.simulation?.percentiles.find((row) => row.percentile === 80);
  ui.box('Resumen', [
    `Esfuerzo esperado:   ${formatHours(estimate.effort.totalExpected)} (rango ${formatHours(estimate.effort.optimistic)} – ${formatHours(estimate.effort.pessimistic + estimate.effort.contingencyHours)})`,
    `Capacidad usada:     ${formatHours(estimate.capacity.teamDailyCapacity)}/día (equipo)`,
    `Duración planificada: ${estimate.duration.scheduledWorkingDays} días laborales`,
    ...estimate.milestones.map((milestone) => {
      const milestoneP80 = milestone.percentiles.find((row) => row.percentile === 80);
      return `Fecha de ${milestone.name.toLowerCase()}:    ${formatDate(milestone.plannedDate)}${milestoneP80 ? ` (P80 ${formatDate(milestoneP80.endDate)})` : ''}`;
    }),
    `Fecha probable:      ${formatDate(estimate.schedule.endDate)}`,
    ...(p80 ? [`Fecha P80:           ${formatDate(p80.endDate)}`] : []),
  ]);
}

class UsageError extends Error {}

async function main() {
  const ui = createUi({ stream: process.stdout, colorEnabled: supportsColor(process.stdout) });
  const errorUi = createUi({ stream: process.stderr, colorEnabled: supportsColor(process.stderr) });
  try {
    const { values, positionals } = parseArgs({
      allowPositionals: true,
      options: {
        start: { type: 'string', short: 's' },
        output: { type: 'string', short: 'o' },
        format: { type: 'string', short: 'f', default: OUTPUT_FORMAT.TEXT },
        runs: { type: 'string', short: 'r', default: DEFAULT_CLI_RUNS },
        seed: { type: 'string' },
        complexity: { type: 'string' },
        rfc: { type: 'string' },
        team: { type: 'string' },
        save: { type: 'string' },
        name: { type: 'string' },
        sigma: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
    });
    if (values.help || positionals.length === 0) {
      process.stdout.write(HELP_TEXT);
      return values.help ? EXIT_CODE.OK : EXIT_CODE.USAGE_ERROR;
    }
    if (positionals[0] === 'init') {
      await runInit(values, ui);
      return EXIT_CODE.OK;
    }

    const runs = Number(values.runs);
    if (!Number.isInteger(runs) || runs < 0) throw new UsageError(`--runs debe ser un entero >= 0 (recibido "${values.runs}")`);
    const seed = values.seed === undefined ? undefined : Number(values.seed);
    if (seed !== undefined && !Number.isInteger(seed)) throw new UsageError(`--seed debe ser un entero (recibido "${values.seed}")`);

    if (positionals[0] === 'backtest') {
      await runBacktestCommand(values, positionals[1], runs, ui);
      return EXIT_CODE.OK;
    }
    const isQuick = positionals[0] === 'quick';
    const project = isQuick ? await buildQuickProject(values, positionals[1]) : await readProjectFile(positionals[0]);
    if (isQuick && values.save) await writeFile(values.save, `${JSON.stringify(project, null, 2)}\n`, 'utf8');
    const estimate = buildEstimate(project, { runs, seed });

    if (values.format === OUTPUT_FORMAT.JSON) process.stdout.write(`${JSON.stringify(estimate, null, 2)}\n`);
    else if (values.format === OUTPUT_FORMAT.MARKDOWN) process.stdout.write(`${renderMarkdownSummary(estimate)}\n`);
    else if (values.format === OUTPUT_FORMAT.TEXT) renderText(estimate, ui);
    else throw new UsageError(`--format desconocido "${values.format}". Opciones: ${Object.values(OUTPUT_FORMAT).join(', ')}`);
    return EXIT_CODE.OK;
  } catch (caughtError) {
    if (caughtError instanceof UsageError || String(caughtError?.code).startsWith(PARSE_ARGS_ERROR_PREFIX)) {
      errorUi.error(`${caughtError.message}\n  Probá: estimador --help`);
      return EXIT_CODE.USAGE_ERROR;
    }
    if (caughtError instanceof EstimationInputError) {
      errorUi.error(caughtError.message);
      return EXIT_CODE.INPUT_ERROR;
    }
    throw caughtError;
  }
}

process.exitCode = await main();

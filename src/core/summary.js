/** Locale de formato numérico y de fechas del resumen. */
const SUMMARY_LOCALE = 'es-AR';
const HOURS_FRACTION_DIGITS = 1;

/** @param {number} value */
export function formatHours(value) {
  return `${value.toLocaleString(SUMMARY_LOCALE, { maximumFractionDigits: HOURS_FRACTION_DIGITS })} h`;
}

/** @param {number} value */
export function formatDays(value) {
  return value.toLocaleString(SUMMARY_LOCALE, { maximumFractionDigits: HOURS_FRACTION_DIGITS });
}

/** @param {string|null} isoDate */
export function formatDate(isoDate) {
  if (!isoDate) return '—';
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString(SUMMARY_LOCALE, {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

/**
 * Explica en una frase de dónde sale el rango probabilístico.
 * @param {{kind: string, sigma?: number, sampleCount?: number}} model
 */
export function describeUncertaintyModel(model) {
  if (model?.kind === 'reference-class') {
    return `Rango calculado con ${model.sampleCount} iniciativas reales terminadas de la misma complejidad (cuánto se desviaron de lo estimado); con pocas tareas el rango puede quedar algo optimista en los extremos.`;
  }
  if (model?.kind === 'common-factor') {
    return `Rango con un margen de error común a todas las etapas (de alrededor de ±${Math.round(model.sigma * PERCENT_SCALE)} %), porque cuando una tarea se subestima suelen fallar todas sus etapas a la vez. Ese margen es un punto de partida: con 5 iniciativas terminadas de la misma complejidad se reemplaza por tu historial.`;
  }
  return 'Rango con etapas que varían de forma independiente; tiende a quedar angosto si los errores de las etapas se mueven juntos.';
}

const PERCENT_SCALE = 100;
const CONFIDENCE_PERCENTILE = 80;
const CONTINGENCY_STAGE_NAME = 'Contingencia por riesgos';

const FACTOR_LABELS = Object.freeze({
  complexity: 'Complejidad',
});

const findPercentile = (rows, percentile) => rows?.find((row) => row.percentile === percentile);

/** Nombre legible de una actividad del plan (la contingencia no es una etapa). */
function activityName(estimate, activityId) {
  return estimate.stages.find((stage) => stage.id === activityId)?.name ?? CONTINGENCY_STAGE_NAME;
}

/** Lo que necesita quien recibe la estimación: fechas con su rango, esfuerzo y factores, sin jerga del modelo. */
function summaryLines(estimate) {
  const { effort, schedule, simulation } = estimate;
  const lines = ['## Resumen', ''];
  for (const milestone of estimate.milestones ?? []) {
    const p80 = findPercentile(milestone.percentiles, CONFIDENCE_PERCENTILE);
    lines.push(`- **Fecha de ${milestone.name.toLowerCase()}: ${formatDate(milestone.plannedDate)}**${p80 ? ` · con 80 % de confianza, a más tardar el ${formatDate(p80.endDate)}` : ''}.`);
  }
  const endP80 = findPercentile(simulation?.percentiles, CONFIDENCE_PERCENTILE);
  lines.push(`- Fin de la iniciativa: ${formatDate(schedule.endDate)}${endP80 ? ` · con 80 % de confianza, a más tardar el ${formatDate(endP80.endDate)}` : ''}.`);
  lines.push(`- Inicio: ${formatDate(schedule.startDate)} · ${estimate.duration.scheduledWorkingDays} días laborales planificados.`);
  lines.push(`- Esfuerzo esperado: ${formatHours(effort.totalExpected)}.`);
  const factorEntries = Object.entries(estimate.factors).filter(([, value]) => value);
  lines.push(...factorEntries.map(([key, value]) => `- ${FACTOR_LABELS[key] ?? key}: ${value}.`));
  if (simulation) {
    lines.push('', '> "Con 80 % de confianza" significa que 8 de cada 10 escenarios simulados terminan en esa fecha o antes. No es una garantía de cumplimiento.');
  }
  lines.push('');
  return lines;
}

function stageTableLines(estimate) {
  const { effort } = estimate;
  const hasContingency = effort.contingencyHours > 0;
  const lines = ['### Esfuerzo por etapa', ''];
  lines.push(`| Etapa | Mín | Probable | Máx | Esperado |${hasContingency ? ' Riesgos |' : ''} Inicio | Fin |`);
  lines.push(`|---|---:|---:|---:|---:|${hasContingency ? '---:|' : ''}---|---|`);
  for (const stage of estimate.stages) {
    const contingencyCell = hasContingency ? ` ${stage.contingencyHours ? formatHours(stage.contingencyHours) : '—'} |` : '';
    lines.push(`| ${stage.name} | ${formatHours(stage.optimistic)} | ${formatHours(stage.mostLikely)} | ${formatHours(stage.pessimistic)} | ${formatHours(stage.expected)} |${contingencyCell} ${formatDate(stage.startDate)} | ${formatDate(stage.endDate)} |`);
  }
  const contingencyTotal = hasContingency ? ` **${formatHours(effort.contingencyHours)}** |` : '';
  lines.push(`| **Total** | **${formatHours(effort.optimistic)}** | **${formatHours(effort.mostLikely)}** | **${formatHours(effort.pessimistic)}** | **${formatHours(effort.expected)}** |${contingencyTotal} | |`, '');
  return lines;
}

function capacityLines(estimate) {
  const lines = ['### Capacidad efectiva diaria', ''];
  for (const person of estimate.capacity.people) {
    const detail = person.isManual
      ? 'definida manualmente'
      : `${formatHours(person.workdayHours)} de jornada − ${formatHours(person.externalHours)} de actividades externas − ${formatHours(person.reserveHours)} de reserva`;
    lines.push(`- **${person.personName ?? person.personId}**: ${formatHours(person.effectiveHours)} por día (${detail}).`);
    for (const excluded of person.excludedTaskDeductions) {
      lines.push(`  - No se descuenta "${excluded.label}" (${formatHours(excluded.hours)}): ya está estimada como etapa.`);
    }
  }
  lines.push('');
  return lines;
}

function durationLines(estimate) {
  const { duration, schedule } = estimate;
  return [
    '### Duración',
    '',
    `- Sin considerar capacidad efectiva: ${formatDays(duration.naiveWorkdays)} jornadas completas.`,
    `- Con capacidad efectiva, una persona, sin dependencias: ${formatDays(duration.effectiveWorkdaysSinglePerson)} días laborales.`,
    `- Planificado con dependencias, esperas y calendario: **${duration.scheduledWorkingDays} días laborales** (${formatDate(schedule.startDate)} → ${formatDate(schedule.endDate)}).`,
    `- Cadena crítica (las etapas que definen la fecha): ${schedule.criticalChain.map((activityId) => activityName(estimate, activityId)).join(' → ')}.`,
    '',
  ];
}

function rangeLines(simulation) {
  if (!simulation) return [];
  const lines = ['### Rango de fechas', ''];
  lines.push('| Confianza | Fecha de fin | Días laborales | Esfuerzo |');
  lines.push('|---|---|---:|---:|');
  for (const row of simulation.percentiles) {
    lines.push(`| ${row.percentile} % (P${row.percentile}) | ${formatDate(row.endDate)} | ${row.workingDays} | ${formatHours(row.effortHours)} |`);
  }
  lines.push('', `> Simulación de ${simulation.runs} escenarios. ${describeUncertaintyModel(simulation.uncertaintyModel)}`, '');
  return lines;
}

/**
 * Genera un resumen en Markdown para compartir con Producto o líderes técnicos.
 * Arriba va lo que se comunica (fechas con su rango y supuestos); el detalle de cálculo queda al final.
 * @param {ReturnType<typeof import('./estimate.js').buildEstimate>} estimate
 */
export function renderMarkdownSummary(estimate) {
  const lines = [`# Estimación: ${estimate.project.name}`, '', ...summaryLines(estimate)];

  lines.push('## Supuestos', '', ...estimate.assumptions.map((assumption) => `- ${assumption}`), '');
  if (estimate.risks.length) {
    lines.push('## Riesgos', '');
    for (const risk of estimate.risks) {
      const note = risk.includedInPessimistic ? 'ya contemplado en el máximo' : `suma ${formatHours(risk.probability * risk.impactHours)} esperadas de contingencia`;
      lines.push(`- ${risk.description}: probabilidad ${Math.round(risk.probability * PERCENT_SCALE)} %, impacto ${formatHours(risk.impactHours)} (${note}).`);
    }
    lines.push('');
  }
  if (estimate.externalDependencies.length) {
    lines.push('## Dependencias externas', '', ...estimate.externalDependencies.map((dependency) => `- ${dependency}`), '');
  }
  if (estimate.warnings.length) {
    lines.push('## Advertencias', '', ...estimate.warnings.map((warning) => `- ${warning}`), '');
  }

  lines.push('## Detalle técnico', '');
  lines.push(...stageTableLines(estimate), ...capacityLines(estimate), ...durationLines(estimate), ...rangeLines(estimate.simulation));
  lines.push(
    '### Cómo se calcula',
    '',
    '- Esfuerzo esperado de cada etapa: (mín + 4 × probable + máx) / 6 (método PERT).',
    '- Contingencia: suma de probabilidad × impacto de los riesgos que no están contemplados en el máximo.',
    '- Una persona trabaja en una etapa a la vez, priorizando la cadena restante más larga.',
    '',
  );
  return lines.join('\n');
}

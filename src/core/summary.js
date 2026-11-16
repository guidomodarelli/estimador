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
    return `Rango calculado con ${model.sampleCount} tareas reales terminadas del mismo tipo (cuánto se desviaron de lo estimado); con pocas tareas el rango puede quedar algo optimista en los extremos.`;
  }
  if (model?.kind === 'common-factor') {
    return `Rango con un error común a todas las etapas (σ ${model.sigma}), porque cuando una tarea se subestima suelen fallar todas sus etapas a la vez. Ese valor es un punto de partida: con 5 tareas terminadas del mismo tipo se reemplaza por tu historial.`;
  }
  return 'Rango con etapas que varían de forma independiente (Beta-PERT); tiende a quedar angosto si los errores están correlacionados.';
}

const FACTOR_LABELS = Object.freeze({
  complexity: 'Complejidad técnica',
  requirementsClarity: 'Claridad de requerimientos',
  externalDependencies: 'Dependencias externas',
  priorExperience: 'Experiencia previa',
  reworkRisk: 'Riesgo de retrabajo',
});

/**
 * Genera un resumen en Markdown para compartir con Producto o líderes técnicos.
 * @param {ReturnType<typeof import('./estimate.js').buildEstimate>} estimate
 */
export function renderMarkdownSummary(estimate) {
  const lines = [];
  const { effort, capacity, duration, schedule, simulation } = estimate;
  lines.push(`# Estimación: ${estimate.project.name}`, '');
  lines.push(`Inicio: **${formatDate(schedule.startDate)}** · Fecha probable (plan con esfuerzo esperado): **${formatDate(schedule.endDate)}**`, '');

  lines.push('## Esfuerzo por etapa', '');
  lines.push('| Etapa | O | M | P | Esperado (PERT) | ± σ | Contingencia | Inicio | Fin |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---|---|');
  for (const stage of estimate.stages) {
    lines.push(
      `| ${stage.name} | ${formatHours(stage.optimistic)} | ${formatHours(stage.mostLikely)} | ${formatHours(stage.pessimistic)} | ${formatHours(stage.expected)} | ${formatHours(stage.standardDeviation)} | ${stage.contingencyHours ? formatHours(stage.contingencyHours) : '—'} | ${formatDate(stage.startDate)} | ${formatDate(stage.endDate)} |`,
    );
  }
  lines.push(
    `| **Total** | **${formatHours(effort.optimistic)}** | **${formatHours(effort.mostLikely)}** | **${formatHours(effort.pessimistic)}** | **${formatHours(effort.expected)}** | **${formatHours(effort.standardDeviation)}** | **${formatHours(effort.contingencyHours)}** | | |`,
    '',
  );
  lines.push(`**Esfuerzo total esperado (con contingencia): ${formatHours(effort.totalExpected)}**`, '');

  lines.push('## Capacidad efectiva diaria', '');
  for (const person of capacity.people) {
    const detail = person.isManual
      ? 'definida manualmente'
      : `${formatHours(person.workdayHours)} de jornada − ${formatHours(person.externalHours)} de actividades externas − ${formatHours(person.reserveHours)} de reserva`;
    lines.push(`- **${person.personId}**: ${formatHours(person.effectiveHours)} por día (${detail}).`);
    for (const excluded of person.excludedTaskDeductions) {
      lines.push(`  - No se descuenta "${excluded.label}" (${formatHours(excluded.hours)}): ya está estimada como etapa.`);
    }
  }
  lines.push('');

  lines.push('## Duración', '');
  lines.push(`- Sin considerar capacidad efectiva: ${formatDays(duration.naiveWorkdays)} jornadas completas.`);
  lines.push(`- Con capacidad efectiva, una persona, sin dependencias: ${formatDays(duration.effectiveWorkdaysSinglePerson)} días laborales.`);
  lines.push(`- Planificado con dependencias, esperas y calendario: **${duration.scheduledWorkingDays} días laborales** (${formatDate(schedule.startDate)} → ${formatDate(schedule.endDate)}).`);
  lines.push(`- Cadena crítica: ${schedule.criticalChain.join(' → ')}.`, '');

  if (simulation) {
    lines.push(`## Rango probabilístico (Monte Carlo, ${simulation.runs} corridas)`, '');
    lines.push('| Confianza | Esfuerzo | Días laborales | Fecha de entrega |');
    lines.push('|---|---:|---:|---|');
    for (const row of simulation.percentiles) {
      lines.push(`| P${row.percentile} | ${formatHours(row.effortHours)} | ${row.workingDays} | ${formatDate(row.endDate)} |`);
    }
    lines.push('', `> P80 significa que, bajo los supuestos del modelo, 8 de cada 10 escenarios simulados terminan en esa fecha o antes. No es una garantía de cumplimiento.`, `> ${describeUncertaintyModel(simulation.uncertaintyModel)}`, '');
  }

  if (estimate.risks.length) {
    lines.push('## Riesgos', '');
    for (const risk of estimate.risks) {
      const note = risk.includedInPessimistic ? 'ya incluido en la P' : `aporta ${formatHours(risk.probability * risk.impactHours)} de contingencia esperada`;
      lines.push(`- ${risk.description} — probabilidad ${Math.round(risk.probability * 100)} %, impacto ${formatHours(risk.impactHours)} (${note}).`);
    }
    lines.push('');
  }
  if (estimate.externalDependencies.length) {
    lines.push('## Dependencias externas', '', ...estimate.externalDependencies.map((dependency) => `- ${dependency}`), '');
  }
  const factorEntries = Object.entries(estimate.factors).filter(([, value]) => value);
  if (factorEntries.length) {
    lines.push('## Factores de incertidumbre registrados', '');
    lines.push(...factorEntries.map(([key, value]) => `- ${FACTOR_LABELS[key] ?? key}: ${value}`), '');
  }
  lines.push('## Supuestos', '');
  lines.push(...estimate.assumptions.map((assumption) => `- ${assumption}`));
  lines.push(
    '- Esfuerzo esperado por PERT: (O + 4M + P) / 6; σ ≈ (P − O) / 6, sumando varianzas como si las etapas fueran independientes.',
    '- Contingencia = Σ probabilidad × impacto de los riesgos no contemplados en la estimación pesimista.',
    '- Una persona trabaja en una etapa a la vez, priorizando la cadena restante más larga.',
    '',
  );
  if (estimate.warnings.length) {
    lines.push('## Advertencias', '', ...estimate.warnings.map((warning) => `- ⚠️ ${warning}`), '');
  }
  return lines.join('\n');
}

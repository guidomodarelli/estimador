import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildEstimate, createSampleProject, renderMarkdownSummary } from '../src/core/index.js';
import { computeEstimate, createNewEstimate, regenerateStages } from '../web/state/estimates.js';
import { markdownToHtml } from '../web/utils/markdown.js';
import { describeDateList, isValidIsoDate } from '../web/utils/date-list.js';
import { placeMarkerLabels, renderGantt } from '../web/charts/gantt.js';
import { pluralize } from '../web/utils/text.js';

const MONDAY = '2026-11-16';
const TEAM = { people: [{ id: 'dev', name: 'Ana', manualEffectiveHours: 5 }], calendar: {}, meetingsReviewed: false };

describe('Resumen para compartir', () => {
  const summary = renderMarkdownSummary(buildEstimate(createSampleProject(MONDAY), { runs: 200 }));

  it('abre con el resumen de fechas y deja el detalle de cálculo al final', () => {
    const summaryIndex = summary.indexOf('## Resumen');
    const technicalIndex = summary.indexOf('## Detalle técnico');
    assert.ok(summaryIndex > 0 && technicalIndex > summaryIndex);
    assert.ok(summary.indexOf('Fecha de rollout') < technicalIndex);
    assert.ok(summary.indexOf('con 80 % de confianza') < technicalIndex);
    assert.ok(summary.indexOf('## Supuestos') < technicalIndex);
  });

  it('no expone jerga del modelo ni identificadores internos', () => {
    assert.doesNotMatch(summary, /σ/);
    assert.doesNotMatch(summary, /\| O \| M \| P \|/);
    const chainLine = summary.split('\n').find((line) => line.includes('Cadena crítica'));
    // Los ids de etapa son slugs en minúscula con guiones; en el resumen tienen que aparecer los nombres.
    assert.doesNotMatch(chainLine, /\b[a-z]+-[a-z]+\b/);
  });

  it('dice la misma complejidad que la pantalla aunque las etapas estén editadas a mano', () => {
    const estimate = createNewEstimate(MONDAY);
    estimate.project.quick.complexity = 'baja';
    regenerateStages(estimate, []);
    estimate.project.quick.customized = true;
    estimate.project.quick.complexity = 'alta';
    const markdown = renderMarkdownSummary(computeEstimate(estimate, TEAM, [], 0));
    assert.match(markdown, /Complejidad: alta/);
    assert.doesNotMatch(markdown, /Complejidad: baja/);
  });

  it('escapa los | de los nombres de etapa para no romper la tabla', () => {
    const estimate = createNewEstimate(MONDAY);
    estimate.project.stages[0].name = 'Front | Back';
    const markdown = renderMarkdownSummary(computeEstimate(estimate, TEAM, [], 0));
    const stageRow = markdown.split('\n').find((line) => line.startsWith('| Front'));
    assert.match(stageRow, /^\| Front \\\| Back \|/);
  });

  it('nombra a las personas por su nombre en la capacidad', () => {
    const estimate = createNewEstimate(MONDAY);
    assert.match(renderMarkdownSummary(computeEstimate(estimate, TEAM, [], 0)), /\*\*Ana\*\*: 5 h por día/);
  });
});

describe('Vista previa del Markdown', () => {
  it('convierte títulos, listas anidadas, tablas, citas y negritas', () => {
    const html = markdownToHtml('## Resumen\n\n- **Rollout: mié**\n  - detalle\n- otra\n\n| Etapa | Horas |\n|---|---:|\n| RFC | 3 h |\n\n> nota');
    assert.match(html, /<h3>Resumen<\/h3>/);
    assert.match(html, /<li><strong>Rollout: mié<\/strong><ul><li>detalle<\/li><\/ul><\/li><li>otra<\/li>/);
    assert.match(html, /<th class="numeric">Horas<\/th>/);
    assert.match(html, /<td class="numeric">3 h<\/td>/);
    assert.match(html, /<blockquote>nota<\/blockquote>/);
  });

  it('no se cuelga con una línea que empieza con | y no es una tabla', () => {
    assert.match(markdownToHtml('| suelto\ntexto'), /<p>\| suelto texto<\/p>/);
  });

  it('respeta los | escapados dentro de una celda', () => {
    const html = markdownToHtml('| Etapa | Horas |\n|---|---:|\n| Front \\| Back | 3 h |');
    assert.match(html, /<td>Front \| Back<\/td><td class="numeric">3 h<\/td>/);
  });

  it('escapa el HTML que venga en nombres o supuestos', () => {
    const html = markdownToHtml('- <img src=x onerror=alert(1)> **ok**');
    assert.doesNotMatch(html, /<img/);
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt; <strong>ok<\/strong>/);
  });
});

describe('Fechas cargadas como texto', () => {
  it('acepta fechas ISO reales y rechaza las imposibles o mal escritas', () => {
    assert.equal(isValidIsoDate('2026-12-24'), true);
    assert.equal(isValidIsoDate('2026-02-30'), false);
    assert.equal(isValidIsoDate('24/12/2026'), false);
  });

  it('muestra cómo se interpretó la lista y señala las inválidas', () => {
    assert.deepEqual(describeDateList(['2026-12-24', '31/12']).invalid, ['31/12']);
    assert.match(describeDateList(['2026-12-24']).text, /24 dic/);
    assert.match(describeDateList([]).text, /AAAA-MM-DD/);
  });
});

describe('Gantt', () => {
  const baseInput = {
    rows: [{ id: 'dev', name: 'Desarrollo', startDate: MONDAY, endDate: '2026-11-18' }],
    scheduledActivities: [{ id: 'dev', readyDate: MONDAY, drivenBy: null }],
    dependencies: [],
    waitDaysById: new Map(),
    criticalChain: ['dev'],
    startDate: MONDAY,
    endDate: '2026-11-18',
    calendar: {},
  };

  it('estira el eje hasta el P80', () => {
    const svg = renderGantt({ ...baseInput, markers: [{ date: '2026-11-20', label: 'P80 vie, 20 nov', kind: 'p80' }] });
    assert.match(svg, /gantt-marker p80/);
    assert.match(svg, /P80 vie, 20 nov/);
  });

  it('marca la cadena crítica también con texto cuando hay etapas que no lo son', () => {
    const parallelRow = { id: 'docs', name: 'Documentación', startDate: MONDAY, endDate: MONDAY };
    const withParallel = renderGantt({ ...baseInput, rows: [...baseInput.rows, parallelRow] });
    assert.equal(withParallel.match(/· crítica/g).length, 1);
    assert.doesNotMatch(renderGantt(baseInput), /· crítica/);
  });

  it('baja a otro renglón la etiqueta que pisaría a la anterior', () => {
    const markers = [{ label: 'Hoy', kind: 'today', x: 300 }, { label: 'P80 mié, 9 dic 2026', kind: 'p80', x: 320 }, { label: 'Lejos', kind: 'p80', x: 900 }];
    const rows = placeMarkerLabels(markers, (marker) => marker.x).map((label) => label.row);
    assert.deepEqual(rows, [0, 1, 0]);
  });

  it('omite la marca de hoy si cae fuera del plan', () => {
    const svg = renderGantt({ ...baseInput, markers: [{ date: '2026-10-01', label: 'Hoy', kind: 'today' }] });
    assert.doesNotMatch(svg, /gantt-marker today/);
  });
});

describe('Plurales', () => {
  it('usa singular o plural según la cantidad', () => {
    assert.equal(pluralize(1, 'estimación', 'estimaciones'), '1 estimación');
    assert.equal(pluralize(3, 'estimación', 'estimaciones'), '3 estimaciones');
  });
});

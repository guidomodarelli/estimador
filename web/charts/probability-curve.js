import { dayIndex, linearScale, shortDate } from './svg.js';

const WIDTH = 600;
const HEIGHT = 220;
const PADDING = Object.freeze({ top: 16, right: 16, bottom: 34, left: 44 });
const PERCENT_TICKS = [0, 50, 80, 100];
const HIGHLIGHTED_PERCENTILES = [50, 80];

/**
 * Curva de probabilidad acumulada: para cada fecha, qué proporción de escenarios simulados
 * termina ese día o antes. Responde directo "¿qué chance hay de llegar al día X?".
 * @param {Array<{endDate: string, count: number}>} histogram Ordenado por fecha.
 * @param {Array<{percentile: number, endDate: string}>} percentiles
 */
export function renderProbabilityCurve(histogram, percentiles) {
  if (!histogram.length) return '';
  const total = histogram.reduce((sum, bucket) => sum + bucket.count, 0);
  const firstDate = histogram[0].endDate;
  const lastDay = Math.max(dayIndex(histogram.at(-1).endDate, firstDate), 1);
  const x = linearScale([0, lastDay], [PADDING.left, WIDTH - PADDING.right]);
  const y = linearScale([0, 100], [HEIGHT - PADDING.bottom, PADDING.top]);

  let cumulative = 0;
  const points = [`${x(0)},${y(0)}`];
  for (const bucket of histogram) {
    const day = dayIndex(bucket.endDate, firstDate);
    points.push(`${x(day)},${y((cumulative / total) * 100)}`);
    cumulative += bucket.count;
    points.push(`${x(day)},${y((cumulative / total) * 100)}`);
  }

  const markers = percentiles
    .filter((row) => HIGHLIGHTED_PERCENTILES.includes(row.percentile))
    .map((row) => {
      const markerX = x(dayIndex(row.endDate, firstDate));
      return `<g class="curve-marker p${row.percentile}">
        <line x1="${markerX}" x2="${markerX}" y1="${y(0)}" y2="${y(row.percentile)}"></line>
        <line x1="${PADDING.left}" x2="${markerX}" y1="${y(row.percentile)}" y2="${y(row.percentile)}"></line>
        <circle cx="${markerX}" cy="${y(row.percentile)}" r="4"></circle>
        <text x="${markerX + 6}" y="${y(row.percentile) - 6}">P${row.percentile} · ${shortDate(row.endDate)}</text>
      </g>`;
    })
    .join('');

  const yAxis = PERCENT_TICKS.map((tick) => `<g class="axis"><line x1="${PADDING.left}" x2="${WIDTH - PADDING.right}" y1="${y(tick)}" y2="${y(tick)}"></line><text x="${PADDING.left - 6}" y="${y(tick) + 4}" text-anchor="end">${tick} %</text></g>`).join('');
  const xLabels = [histogram[0].endDate, histogram.at(-1).endDate]
    .map((date, index) => `<text class="axis-label" x="${x(dayIndex(date, firstDate))}" y="${HEIGHT - 10}" text-anchor="${index ? 'end' : 'start'}">${shortDate(date)}</text>`)
    .join('');

  return `<svg class="chart probability-curve" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-labelledby="curve-title">
    <title id="curve-title">Probabilidad de terminar en cada fecha o antes</title>
    ${yAxis}
    <polyline class="curve-line" points="${points.join(' ')}"></polyline>
    ${markers}
    ${xLabels}
  </svg>`;
}

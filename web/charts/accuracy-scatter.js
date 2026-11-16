import { escapeHtml } from '../utils/dom.js';
import { linearScale, niceTicks } from './svg.js';

const SIZE = 320;
const PADDING = Object.freeze({ top: 12, right: 12, bottom: 40, left: 48 });
const POINT_RADIUS = 5;

/**
 * Estimado contra real por tarea terminada. La diagonal es el acierto perfecto:
 * los puntos por encima son tareas que llevaron más de lo estimado.
 * @param {Array<{estimatedHours: number, actualHours: number, label: string}>} points
 */
export function renderAccuracyScatter(points) {
  if (!points.length) return '';
  const ticks = niceTicks(Math.max(...points.flatMap((point) => [point.estimatedHours, point.actualHours]), 1));
  const maxValue = ticks.at(-1);
  const x = linearScale([0, maxValue], [PADDING.left, SIZE - PADDING.right]);
  const y = linearScale([0, maxValue], [SIZE - PADDING.bottom, PADDING.top]);
  const grid = ticks
    .map((tick) => `<g class="axis"><line x1="${PADDING.left}" x2="${SIZE - PADDING.right}" y1="${y(tick)}" y2="${y(tick)}"></line><text x="${PADDING.left - 6}" y="${y(tick) + 4}" text-anchor="end">${tick}</text><text x="${x(tick)}" y="${SIZE - PADDING.bottom + 16}" text-anchor="middle">${tick}</text></g>`)
    .join('');
  const dots = points
    .map((point) => {
      const over = point.actualHours > point.estimatedHours;
      return `<circle class="scatter-point${over ? ' over' : ''}" cx="${x(point.estimatedHours)}" cy="${y(point.actualHours)}" r="${POINT_RADIUS}"><title>${escapeHtml(point.label)}: estimado ${Math.round(point.estimatedHours)} h, real ${Math.round(point.actualHours)} h</title></circle>`;
    })
    .join('');
  return `<svg class="chart accuracy-scatter" viewBox="0 0 ${SIZE} ${SIZE}" role="img" aria-labelledby="scatter-title">
    <title id="scatter-title">Horas estimadas contra horas reales por tarea terminada</title>
    ${grid}
    <line class="diagonal" x1="${x(0)}" y1="${y(0)}" x2="${x(maxValue)}" y2="${y(maxValue)}"></line>
    ${dots}
    <text class="axis-label" x="${(PADDING.left + SIZE - PADDING.right) / 2}" y="${SIZE - 6}" text-anchor="middle">Estimado (h)</text>
    <text class="axis-label" transform="translate(12 ${(PADDING.top + SIZE - PADDING.bottom) / 2}) rotate(-90)" text-anchor="middle">Real (h)</text>
  </svg>`;
}

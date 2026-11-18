import { isTeamWorkingDay } from '../../src/core/calendar.js';
import { escapeHtml } from '../utils/dom.js';
import { addDays, dayIndex, shortDate } from './svg.js';

const LABEL_WIDTH = 190;
const ROW_HEIGHT = 28;
const BAR_HEIGHT = 14;
/** Renglón de fechas del encabezado; debajo van uno o más renglones con las etiquetas de las marcas (P80, hoy). */
const DATE_ROW_HEIGHT = 26;
const MARKER_ROW_HEIGHT = 16;
/** Ancho aproximado de un carácter de las etiquetas de marcas, para detectar etiquetas que se pisan. */
const MARKER_LABEL_CHAR_WIDTH_PX = 6.5;
const MARKER_LABEL_GAP_PX = 6;
const MIN_DAY_WIDTH = 16;
const TARGET_TIMELINE_WIDTH = 820;
const ARROW_ELBOW_PX = 8;

/**
 * Gantt con las dependencias dibujadas como flechas, la cadena crítica resaltada,
 * los días no laborables sombreados y las esperas (aprobaciones) como tramos punteados.
 * Es el "grafo" de dependencias, pero sobre el calendario real.
 *
 * @param {Object} input
 * @param {Array<{id: string, name: string, startDate: string|null, endDate: string|null}>} input.rows
 * @param {Array<{id: string, readyDate: string|null, drivenBy: string|null}>} input.scheduledActivities
 * @param {Array<{from: string, to: string}>} input.dependencies
 * @param {Map<string, number>} input.waitDaysById
 * @param {string[]} input.criticalChain
 * @param {string} input.startDate
 * @param {string} input.endDate
 * @param {import('../../src/core/calendar.js').WorkCalendar} input.calendar
 * @param {Array<{date: string, label: string, kind: 'p80'|'today'}>} [input.markers] Líneas verticales de referencia (fin P80, hoy).
 */
/**
 * Ubica cada etiqueta de marca (alineada a la derecha de su línea) en el primer renglón donde no pisa a otra.
 * @returns {Array<{marker: object, x: number, row: number}>}
 */
export function placeMarkerLabels(markers, xOf) {
  const rowRightEdges = [];
  return markers
    .map((marker) => ({ marker, x: xOf(marker) }))
    .sort((left, right) => left.x - right.x)
    .map((label) => {
      const labelLeft = label.x - 3 - label.marker.label.length * MARKER_LABEL_CHAR_WIDTH_PX;
      let row = rowRightEdges.findIndex((rightEdge) => rightEdge + MARKER_LABEL_GAP_PX <= labelLeft);
      if (row === -1) row = rowRightEdges.length;
      rowRightEdges[row] = label.x;
      return { ...label, row };
    });
}

export function renderGantt({ rows, scheduledActivities, dependencies, waitDaysById, criticalChain, startDate, endDate: planEndDate, calendar, markers = [] }) {
  const visibleRows = rows.filter((row) => row.startDate && row.endDate);
  // El eje se estira hasta la marca más tardía (el P80 suele caer después del fin del plan); hoy se muestra solo si cae en el rango.
  const endDate = markers.reduce((latest, marker) => (marker.kind !== 'today' && marker.date > latest ? marker.date : latest), planEndDate);
  const visibleMarkers = markers.filter((marker) => marker.date >= startDate && marker.date <= endDate);
  const totalDays = dayIndex(endDate, startDate) + 1;
  const dayWidth = Math.max(MIN_DAY_WIDTH, TARGET_TIMELINE_WIDTH / totalDays);
  const width = LABEL_WIDTH + totalDays * dayWidth + 8;
  const markerLabels = placeMarkerLabels(visibleMarkers, (marker) => LABEL_WIDTH + dayIndex(marker.date, startDate) * dayWidth + (marker.kind === 'today' ? 0 : dayWidth));
  const markerRowCount = Math.max(1, ...markerLabels.map((label) => label.row + 1));
  const HEADER_HEIGHT = DATE_ROW_HEIGHT + markerRowCount * MARKER_ROW_HEIGHT;
  const height = HEADER_HEIGHT + visibleRows.length * ROW_HEIGHT + 4;
  const rowIndexById = new Map(visibleRows.map((row, index) => [row.id, index]));
  const critical = new Set(criticalChain);
  // Si todas las etapas son críticas (flujo en serie), la etiqueta no distingue nada y solo agrega ruido.
  const tagCriticalRows = visibleRows.some((row) => !critical.has(row.id));
  const xStart = (isoDate) => LABEL_WIDTH + dayIndex(isoDate, startDate) * dayWidth;
  const xEnd = (isoDate) => xStart(isoDate) + dayWidth;
  const yMid = (index) => HEADER_HEIGHT + index * ROW_HEIGHT + ROW_HEIGHT / 2;

  const dayColumns = [];
  for (let day = 0; day < totalDays; day += 1) {
    const isoDate = addDays(startDate, day);
    const x = LABEL_WIDTH + day * dayWidth;
    if (!isTeamWorkingDay(isoDate, calendar)) dayColumns.push(`<rect class="gantt-offday" x="${x}" y="${HEADER_HEIGHT}" width="${dayWidth}" height="${height - HEADER_HEIGHT}"></rect>`);
    const isWeekStart = new Date(`${isoDate}T00:00:00Z`).getUTCDay() === 1;
    if (day === 0 || isWeekStart) dayColumns.push(`<text class="gantt-date" x="${x + 2}" y="16">${shortDate(isoDate)}</text>`);
  }

  const waits = scheduledActivities
    .filter((activity) => activity.drivenBy && (waitDaysById.get(activity.drivenBy) ?? 0) > 0 && rowIndexById.has(activity.drivenBy))
    .map((activity) => {
      const driver = visibleRows[rowIndexById.get(activity.drivenBy)];
      const y = yMid(rowIndexById.get(activity.drivenBy));
      return `<line class="gantt-wait" x1="${xEnd(driver.endDate)}" x2="${xStart(activity.readyDate)}" y1="${y}" y2="${y}"><title>Espera de ${waitDaysById.get(activity.drivenBy)} día(s) después de ${escapeHtml(driver.name)}</title></line>`;
    })
    .join('');

  const arrows = dependencies
    .filter((dependency) => rowIndexById.has(dependency.from) && rowIndexById.has(dependency.to))
    .map((dependency) => {
      const fromRow = visibleRows[rowIndexById.get(dependency.from)];
      const toRow = visibleRows[rowIndexById.get(dependency.to)];
      const fromX = xEnd(fromRow.endDate);
      const fromY = yMid(rowIndexById.get(dependency.from));
      const toX = xStart(toRow.startDate);
      const toY = yMid(rowIndexById.get(dependency.to));
      const elbowX = Math.max(fromX + ARROW_ELBOW_PX, Math.min(toX - ARROW_ELBOW_PX, fromX + ARROW_ELBOW_PX));
      const isCritical = critical.has(dependency.from) && critical.has(dependency.to);
      return `<path class="gantt-arrow${isCritical ? ' critical' : ''}" d="M${fromX},${fromY} H${elbowX} V${toY} H${toX - 2}" marker-end="url(#gantt-arrowhead${isCritical ? '-critical' : ''})"></path>`;
    })
    .join('');

  const bars = visibleRows
    .map((row, index) => {
      const y = yMid(index);
      const isCritical = critical.has(row.id);
      return `<g class="gantt-row${isCritical ? ' critical' : ''}">
        <text class="gantt-label" x="0" y="${y + 4}">${escapeHtml(row.name)}${isCritical && tagCriticalRows ? '<tspan class="gantt-critical-tag"> · crítica</tspan>' : ''}</text>
        <rect class="gantt-bar" x="${xStart(row.startDate)}" y="${y - BAR_HEIGHT / 2}" width="${Math.max(xEnd(row.endDate) - xStart(row.startDate), 3)}" height="${BAR_HEIGHT}" rx="3">
          <title>${escapeHtml(row.name)}: ${shortDate(row.startDate)} → ${shortDate(row.endDate)}${isCritical ? ' (cadena crítica)' : ''}</title>
        </rect>
      </g>`;
    })
    .join('');

  const markerLines = markerLabels
    .map(({ marker, x, row }) => {
      const labelY = DATE_ROW_HEIGHT + (row + 1) * MARKER_ROW_HEIGHT - 4;
      return `<g class="gantt-marker ${marker.kind}"><line x1="${x}" x2="${x}" y1="${labelY + 4}" y2="${height}"></line><text x="${x - 3}" y="${labelY}" text-anchor="end">${escapeHtml(marker.label)}</text></g>`;
    })
    .join('');

  return `<svg class="chart gantt" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="gantt-title">
    <title id="gantt-title">Plan de etapas con dependencias, del ${shortDate(startDate)} al ${shortDate(endDate)}</title>
    <defs>
      <marker id="gantt-arrowhead" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path class="gantt-arrowhead" d="M0,0 L8,4 L0,8 z"></path></marker>
      <marker id="gantt-arrowhead-critical" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path class="gantt-arrowhead critical" d="M0,0 L8,4 L0,8 z"></path></marker>
    </defs>
    ${dayColumns.join('')}
    ${waits}
    ${arrows}
    ${bars}
    ${markerLines}
  </svg>`;
}

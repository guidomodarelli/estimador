import { linearScale, niceTicks, shortDate } from './svg.js';

const WIDTH = 640;
const HEIGHT = 240;
const PADDING = Object.freeze({ top: 16, right: 12, bottom: 36, left: 46 });
const BAR_GAP_RATIO = 0.25;

/**
 * Demanda semanal (horas P80 comprometidas) contra la capacidad efectiva del equipo.
 * Las semanas por encima de la capacidad se marcan: ahí el trimestre no entra.
 * @param {Array<{weekStart: string, demandHours: number, capacityHours: number}>} weeks
 */
export function renderQuarterLoad(weeks) {
  if (!weeks.length) return '';
  const maxValue = Math.max(...weeks.flatMap((week) => [week.demandHours, week.capacityHours]), 1);
  const ticks = niceTicks(maxValue);
  const y = linearScale([0, ticks.at(-1)], [HEIGHT - PADDING.bottom, PADDING.top]);
  const slotWidth = (WIDTH - PADDING.left - PADDING.right) / weeks.length;
  const barWidth = slotWidth * (1 - BAR_GAP_RATIO);
  const slotX = (index) => PADDING.left + index * slotWidth;

  const grid = ticks.map((tick) => `<g class="axis"><line x1="${PADDING.left}" x2="${WIDTH - PADDING.right}" y1="${y(tick)}" y2="${y(tick)}"></line><text x="${PADDING.left - 6}" y="${y(tick) + 4}" text-anchor="end">${tick} h</text></g>`).join('');
  const bars = weeks
    .map((week, index) => {
      const over = week.demandHours > week.capacityHours + 0.01;
      const barX = slotX(index) + (slotWidth - barWidth) / 2;
      return `<rect class="load-bar${over ? ' over' : ''}" x="${barX}" y="${y(week.demandHours)}" width="${barWidth}" height="${Math.max(y(0) - y(week.demandHours), 0)}" rx="2">
        <title>Semana del ${shortDate(week.weekStart)}: ${Math.round(week.demandHours)} h comprometidas de ${Math.round(week.capacityHours)} h disponibles</title></rect>`;
    })
    .join('');
  const capacityPath = weeks
    .map((week, index) => `${index ? 'L' : 'M'}${slotX(index)},${y(week.capacityHours)} H${slotX(index) + slotWidth}`)
    .join(' ');
  const labelEvery = Math.ceil(weeks.length / 7);
  const xLabels = weeks
    .map((week, index) => (index % labelEvery === 0 ? `<text class="axis-label" x="${slotX(index) + slotWidth / 2}" y="${HEIGHT - 12}" text-anchor="middle">${shortDate(week.weekStart)}</text>` : ''))
    .join('');

  return `<svg class="chart quarter-load" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-labelledby="quarter-title">
    <title id="quarter-title">Horas comprometidas por semana contra la capacidad del equipo</title>
    ${grid}${bars}
    <path class="capacity-line" d="${capacityPath}"></path>
    ${xLabels}
  </svg>`;
}

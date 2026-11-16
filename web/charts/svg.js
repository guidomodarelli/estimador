/** Helpers compartidos por los gráficos SVG (fechas UTC y escalas lineales). */

export const MILLISECONDS_PER_DAY = 86_400_000;

export const dayIndex = (isoDate, originIsoDate) =>
  Math.round((Date.parse(`${isoDate}T00:00:00Z`) - Date.parse(`${originIsoDate}T00:00:00Z`)) / MILLISECONDS_PER_DAY);

export const addDays = (isoDate, days) =>
  new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * MILLISECONDS_PER_DAY).toISOString().slice(0, 10);

/** Escala lineal de un dominio a un rango de píxeles. */
export function linearScale([domainMin, domainMax], [rangeMin, rangeMax]) {
  const span = domainMax - domainMin || 1;
  return (value) => rangeMin + ((value - domainMin) / span) * (rangeMax - rangeMin);
}

const SHORT_DATE_FORMAT = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
export const shortDate = (isoDate) => SHORT_DATE_FORMAT.format(new Date(`${isoDate}T00:00:00Z`));

/** Valores "redondos" para ejes (1, 2, 5 × 10^n). */
export function niceTicks(maxValue, targetCount = 4) {
  if (!(maxValue > 0)) return [0];
  const rawStep = maxValue / targetCount;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= rawStep);
  const ticks = [];
  for (let value = 0; value <= maxValue + step / 2; value += step) ticks.push(Math.round(value * 100) / 100);
  return ticks;
}

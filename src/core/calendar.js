import { DEFAULT_WORKING_WEEKDAYS, MILLISECONDS_PER_DAY } from './constants/estimation.js';
import { EstimationInputError } from './errors.js';

/**
 * Las fechas se manejan como strings ISO `YYYY-MM-DD` interpretadas en UTC,
 * para que el resultado no dependa de la zona horaria de quien ejecuta.
 */

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @param {string} isoDate
 * @returns {number} Milisegundos UTC a medianoche.
 */
export function parseIsoDate(isoDate) {
  if (typeof isoDate !== 'string' || !ISO_DATE_PATTERN.test(isoDate)) {
    throw new EstimationInputError(`calendar:parseIsoDate failed: se esperaba YYYY-MM-DD (recibido "${String(isoDate).slice(0, 40)}")`);
  }
  const timestamp = Date.parse(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(timestamp)) {
    throw new EstimationInputError(`calendar:parseIsoDate failed: fecha inexistente "${isoDate}"`);
  }
  return timestamp;
}

/** @param {number} timestamp */
export function formatIsoDate(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

/**
 * @param {string} isoDate
 * @param {number} days
 */
export function addCalendarDays(isoDate, days) {
  return formatIsoDate(parseIsoDate(isoDate) + days * MILLISECONDS_PER_DAY);
}

/** @param {string} isoDate 0 = domingo ... 6 = sábado. */
export function weekdayOf(isoDate) {
  return new Date(parseIsoDate(isoDate)).getUTCDay();
}

/**
 * @typedef {Object} WorkCalendar
 * @property {string} startDate Fecha de inicio YYYY-MM-DD.
 * @property {number[]} [workingWeekdays] Días laborales (0-6).
 * @property {string[]} [holidays] Feriados YYYY-MM-DD.
 */

/**
 * Indica si una fecha es laboral para el equipo (sin considerar ausencias individuales).
 * @param {string} isoDate
 * @param {WorkCalendar} calendar
 */
export function isTeamWorkingDay(isoDate, calendar) {
  const workingWeekdays = calendar.workingWeekdays ?? DEFAULT_WORKING_WEEKDAYS;
  if (!workingWeekdays.includes(weekdayOf(isoDate))) return false;
  return !(calendar.holidays ?? []).includes(isoDate);
}

/**
 * Cuenta días laborales del equipo entre dos fechas, ambas inclusive.
 * @param {string} fromIsoDate
 * @param {string} toIsoDate
 * @param {WorkCalendar} calendar
 */
export function countTeamWorkingDays(fromIsoDate, toIsoDate, calendar) {
  let count = 0;
  for (let current = fromIsoDate; current <= toIsoDate; current = addCalendarDays(current, 1)) {
    if (isTeamWorkingDay(current, calendar)) count += 1;
  }
  return count;
}

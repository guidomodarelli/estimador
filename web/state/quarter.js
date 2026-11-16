import { capacityOnDate, computeEffectiveCapacity } from '../../src/core/capacity.js';
import { isTeamWorkingDay } from '../../src/core/calendar.js';

/** Cálculo de carga del trimestre (sin DOM, testeable con node:test). */

const MONTHS_PER_QUARTER = 3;
const DAYS_PER_WEEK = 7;
const MONDAY = 1;
const MILLISECONDS_PER_DAY = 86_400_000;

const addDays = (isoDate, days) => new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * MILLISECONDS_PER_DAY).toISOString().slice(0, 10);

/**
 * Trimestre calendario que contiene la fecha, desplazado `offset` trimestres.
 * @returns {{start: string, end: string, label: string}}
 */
export function quarterBounds(isoDate, offset = 0) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  const quarterIndex = Math.floor(date.getUTCMonth() / MONTHS_PER_QUARTER) + offset;
  const year = date.getUTCFullYear() + Math.floor(quarterIndex / 4);
  const quarter = ((quarterIndex % 4) + 4) % 4;
  const start = new Date(Date.UTC(year, quarter * MONTHS_PER_QUARTER, 1));
  const end = new Date(Date.UTC(year, (quarter + 1) * MONTHS_PER_QUARTER, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10), label: `Q${quarter + 1} ${year}` };
}

/** Lunes de la semana que contiene la fecha. */
function weekStartOf(isoDate) {
  const weekday = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  return addDays(isoDate, -((weekday - MONDAY + DAYS_PER_WEEK) % DAYS_PER_WEEK));
}

/**
 * Carga semanal del trimestre: horas P80 de cada estimación abierta repartidas en partes
 * iguales entre sus días laborales (inicio → fecha P80), contra la capacidad efectiva del equipo.
 * Cada estimación se planificó como si tuviera al equipo para ella sola: este gráfico es el
 * que muestra si, sumadas, entran.
 *
 * @param {Array<{startDate: string, p80Date: string, p80Hours: number}>} commitments
 * @param {{people: import('../../src/core/capacity.js').Person[], calendar: Object}} team
 * @param {{start: string, end: string}} quarter
 */
export function weeklyLoad(commitments, team, quarter) {
  const calendar = { ...team.calendar };
  const baseCapacity = new Map(team.people.map((person) => [person.id, computeEffectiveCapacity(person).effectiveHours]));
  const demandByDate = new Map();
  for (const commitment of commitments) {
    const workingDates = [];
    for (let date = commitment.startDate; date <= commitment.p80Date; date = addDays(date, 1)) {
      if (isTeamWorkingDay(date, calendar)) workingDates.push(date);
    }
    if (!workingDates.length) continue;
    const hoursPerDay = commitment.p80Hours / workingDates.length;
    for (const date of workingDates) demandByDate.set(date, (demandByDate.get(date) ?? 0) + hoursPerDay);
  }

  const weeks = [];
  for (let weekStart = weekStartOf(quarter.start); weekStart <= quarter.end; weekStart = addDays(weekStart, DAYS_PER_WEEK)) {
    let demandHours = 0;
    let capacityHours = 0;
    for (let offset = 0; offset < DAYS_PER_WEEK; offset += 1) {
      const date = addDays(weekStart, offset);
      if (date < quarter.start || date > quarter.end) continue;
      demandHours += demandByDate.get(date) ?? 0;
      capacityHours += team.people.reduce((sum, person) => sum + capacityOnDate(person, baseCapacity.get(person.id), date, calendar), 0);
    }
    weeks.push({ weekStart, demandHours, capacityHours });
  }
  return weeks;
}

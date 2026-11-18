import { DEDUCTION_SCOPE, DEFAULT_WORKDAY_HOURS } from './constants/estimation.js';
import { EstimationInputError } from './errors.js';
import { isTeamWorkingDay } from './calendar.js';

/**
 * @typedef {Object} CapacityDeduction
 * @property {string} label Ej. "Daily y refinamientos".
 * @property {number} hours Horas diarias.
 * @property {'external'|'task'} [scope] `task` = ya estimada como etapa: no se descuenta.
 * @property {'meetings'|'interruptions'|'operational'|'other'} [kind]
 */

/**
 * @typedef {Object} Person
 * @property {string} id
 * @property {string} [name]
 * @property {number} [workdayHours] Jornada laboral total.
 * @property {CapacityDeduction[]} [deductions] Actividades no disponibles.
 * @property {number} [reserveHours] Reserva operativa diaria.
 * @property {number} [manualEffectiveHours] Si se define, reemplaza el cálculo.
 * @property {string[]} [absences] Vacaciones o ausencias YYYY-MM-DD.
 * @property {Record<string, number>} [dailyOverrides] Horas efectivas para fechas puntuales (jornada reducida).
 */

/**
 * Capacidad efectiva diaria = jornada − actividades externas − reserva.
 * Las deducciones con scope `task` se informan pero no se restan (evita doble conteo).
 * @param {Person} person
 */
export function computeEffectiveCapacity(person) {
  const workdayHours = person.workdayHours ?? DEFAULT_WORKDAY_HOURS;
  const deductions = person.deductions ?? [];
  const externalDeductions = deductions.filter((deduction) => (deduction.scope ?? DEDUCTION_SCOPE.EXTERNAL) === DEDUCTION_SCOPE.EXTERNAL);
  const excludedTaskDeductions = deductions.filter((deduction) => deduction.scope === DEDUCTION_SCOPE.TASK);
  const externalHours = externalDeductions.reduce((sum, deduction) => sum + deduction.hours, 0);
  const reserveHours = person.reserveHours ?? 0;
  const isManual = typeof person.manualEffectiveHours === 'number';
  const effectiveHours = isManual ? person.manualEffectiveHours : workdayHours - externalHours - reserveHours;

  if (!(effectiveHours > 0)) {
    throw new EstimationInputError(
      `capacity:computeEffectiveCapacity failed for person "${person.id}": la capacidad efectiva debe ser > 0 (jornada=${workdayHours}, deducciones=${externalHours}, reserva=${reserveHours})`,
    );
  }
  if (effectiveHours > workdayHours && !isManual) {
    throw new EstimationInputError(`capacity:computeEffectiveCapacity failed for person "${person.id}": capacidad mayor a la jornada`);
  }

  return {
    personId: person.id,
    personName: person.name?.trim() || person.id,
    workdayHours,
    externalDeductions,
    excludedTaskDeductions,
    externalHours,
    reserveHours,
    effectiveHours,
    isManual,
  };
}

/**
 * Horas efectivas de una persona en una fecha concreta, considerando calendario,
 * feriados, ausencias y jornadas especiales.
 * @param {Person} person
 * @param {number} baseEffectiveHours
 * @param {string} isoDate
 * @param {import('./calendar.js').WorkCalendar} calendar
 */
export function capacityOnDate(person, baseEffectiveHours, isoDate, calendar) {
  if (!isTeamWorkingDay(isoDate, calendar)) return 0;
  if ((person.absences ?? []).includes(isoDate)) return 0;
  const override = person.dailyOverrides?.[isoDate];
  return typeof override === 'number' ? Math.max(0, override) : baseEffectiveHours;
}

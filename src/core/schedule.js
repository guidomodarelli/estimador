import { HOURS_EPSILON, MAX_SCHEDULING_CALENDAR_DAYS } from './constants/estimation.js';
import { addCalendarDays, countTeamWorkingDays, isTeamWorkingDay } from './calendar.js';
import { capacityOnDate } from './capacity.js';
import { EstimationInputError } from './errors.js';

/**
 * @typedef {Object} SchedulableActivity
 * @property {string} id
 * @property {string} [name]
 * @property {number} effortHours Horas de esfuerzo a planificar.
 * @property {string} assigneeId Persona que ejecuta la actividad.
 * @property {string[]} [dependsOn] Fin-a-inicio: arranca cuando terminan estas.
 * @property {number} [waitWorkingDaysAfter] Espera (aprobación, revisión externa) tras terminar:
 *   alarga la duración calendario de sus sucesoras sin sumar esfuerzo.
 */

/**
 * @typedef {Object} ScheduledActivity
 * @property {string} id
 * @property {string|null} startDate
 * @property {string|null} endDate
 * @property {string|null} readyDate Fecha en que quedó habilitada.
 * @property {string|null} drivenBy Predecesora que determinó la habilitación (null si arrancó al inicio).
 */

/**
 * Ordena topológicamente y detecta ciclos o dependencias inexistentes.
 * @param {SchedulableActivity[]} activities
 * @returns {string[]}
 */
export function topologicalOrder(activities) {
  const byId = new Map(activities.map((activity) => [activity.id, activity]));
  const visitState = new Map();
  const ordered = [];
  const visit = (activityId, path) => {
    const state = visitState.get(activityId);
    if (state === 'done') return;
    if (state === 'visiting') {
      throw new EstimationInputError(`schedule:topologicalOrder failed: dependencia circular ${[...path, activityId].join(' → ')}`);
    }
    visitState.set(activityId, 'visiting');
    for (const dependencyId of byId.get(activityId).dependsOn ?? []) {
      if (!byId.has(dependencyId)) {
        throw new EstimationInputError(`schedule:topologicalOrder failed: "${activityId}" depende de "${dependencyId}", que no existe`);
      }
      visit(dependencyId, [...path, activityId]);
    }
    visitState.set(activityId, 'done');
    ordered.push(activityId);
  };
  for (const activity of activities) visit(activity.id, []);
  return ordered;
}

/**
 * Horas de la cadena más larga desde cada actividad hasta el final (prioridad de planificación).
 * @param {SchedulableActivity[]} activities
 * @param {string[]} order
 */
function computeDownstreamHours(activities, order) {
  const successors = new Map(activities.map((activity) => [activity.id, []]));
  for (const activity of activities) {
    for (const dependencyId of activity.dependsOn ?? []) successors.get(dependencyId).push(activity.id);
  }
  const byId = new Map(activities.map((activity) => [activity.id, activity]));
  const downstream = new Map();
  for (const activityId of [...order].reverse()) {
    const longestSuccessor = Math.max(0, ...successors.get(activityId).map((successorId) => downstream.get(successorId)));
    downstream.set(activityId, byId.get(activityId).effortHours + longestSuccessor);
  }
  return downstream;
}

/**
 * Avanza N días laborales del equipo desde una fecha (excluyéndola).
 * @param {string} isoDate
 * @param {number} workingDays
 * @param {import('./calendar.js').WorkCalendar} calendar
 */
function addTeamWorkingDays(isoDate, workingDays, calendar) {
  let current = isoDate;
  let remaining = workingDays;
  while (remaining > 0) {
    current = addCalendarDays(current, 1);
    if (isTeamWorkingDay(current, calendar)) remaining -= 1;
  }
  return current;
}

/**
 * Planifica día a día respetando dependencias, tiempos de espera y la capacidad
 * efectiva de cada persona. Una persona trabaja primero en la actividad habilitada
 * con la cadena restante más larga (heurística de camino crítico).
 *
 * @param {Object} input
 * @param {SchedulableActivity[]} input.activities
 * @param {import('./capacity.js').Person[]} input.people
 * @param {Map<string, number>} input.baseCapacityByPerson Horas efectivas base por persona.
 * @param {import('./calendar.js').WorkCalendar} input.calendar
 */
export function scheduleActivities({ activities, people, baseCapacityByPerson, calendar }) {
  const order = topologicalOrder(activities);
  const downstreamHours = computeDownstreamHours(activities, order);
  const peopleById = new Map(people.map((person) => [person.id, person]));
  for (const activity of activities) {
    if (!peopleById.has(activity.assigneeId)) {
      throw new EstimationInputError(`schedule:scheduleActivities failed: la actividad "${activity.id}" está asignada a "${activity.assigneeId}", que no está en el equipo`);
    }
  }

  const remainingHours = new Map(activities.map((activity) => [activity.id, activity.effortHours]));
  /** @type {Map<string, ScheduledActivity>} */
  const scheduled = new Map(
    activities.map((activity) => [activity.id, { id: activity.id, startDate: null, endDate: null, readyDate: null, drivenBy: null }]),
  );
  const byId = new Map(activities.map((activity) => [activity.id, activity]));
  const pendingIds = new Set(activities.map((activity) => activity.id));

  const resolveReadiness = (activityId) => {
    const entry = scheduled.get(activityId);
    if (entry.readyDate) return true;
    const dependencies = byId.get(activityId).dependsOn ?? [];
    if (dependencies.some((dependencyId) => !scheduled.get(dependencyId).endDate)) return false;
    let readyDate = calendar.startDate;
    let drivenBy = null;
    for (const dependencyId of dependencies) {
      const dependency = byId.get(dependencyId);
      const dependencyEnd = scheduled.get(dependencyId).endDate;
      const waitDays = dependency.waitWorkingDaysAfter ?? 0;
      // Con espera, los días de espera se consumen enteros y la sucesora arranca al día siguiente.
      const releaseDate = waitDays > 0 ? addCalendarDays(addTeamWorkingDays(dependencyEnd, waitDays, calendar), 1) : dependencyEnd;
      if (releaseDate >= readyDate) {
        readyDate = releaseDate;
        drivenBy = dependencyId;
      }
    }
    entry.readyDate = readyDate;
    entry.drivenBy = drivenBy;
    return true;
  };

  let currentDate = calendar.startDate;
  for (let dayIndex = 0; pendingIds.size > 0; dayIndex += 1) {
    if (dayIndex > MAX_SCHEDULING_CALENDAR_DAYS) {
      throw new EstimationInputError(
        `schedule:scheduleActivities failed: no se pudo completar en ${MAX_SCHEDULING_CALENDAR_DAYS} días; revisá capacidad, ausencias o feriados (pendientes: ${[...pendingIds].join(', ')})`,
      );
    }
    const availableToday = new Map(
      people.map((person) => [person.id, capacityOnDate(person, baseCapacityByPerson.get(person.id), currentDate, calendar)]),
    );

    let progressed = true;
    while (progressed) {
      progressed = false;
      for (const person of people) {
        let available = availableToday.get(person.id);
        const candidates = order
          .filter((activityId) => pendingIds.has(activityId) && byId.get(activityId).assigneeId === person.id)
          .filter((activityId) => resolveReadiness(activityId) && scheduled.get(activityId).readyDate <= currentDate)
          .sort((left, right) => downstreamHours.get(right) - downstreamHours.get(left));
        for (const activityId of candidates) {
          const remaining = remainingHours.get(activityId);
          const entry = scheduled.get(activityId);
          if (remaining <= HOURS_EPSILON) {
            // Actividades de 0 h (ej. hitos) terminan el día en que se habilitan.
            entry.startDate ??= currentDate;
            entry.endDate = currentDate;
            pendingIds.delete(activityId);
            progressed = true;
            continue;
          }
          if (available <= HOURS_EPSILON) break;
          const allocated = Math.min(available, remaining);
          available -= allocated;
          entry.startDate ??= currentDate;
          remainingHours.set(activityId, remaining - allocated);
          progressed = true;
          if (remaining - allocated <= HOURS_EPSILON) {
            entry.endDate = currentDate;
            pendingIds.delete(activityId);
          }
        }
        availableToday.set(person.id, available);
      }
    }
    if (pendingIds.size > 0) currentDate = addCalendarDays(currentDate, 1);
  }

  const results = order.map((activityId) => scheduled.get(activityId));
  const endDate = results.reduce((latest, entry) => (entry.endDate > latest ? entry.endDate : latest), calendar.startDate);
  return {
    activities: results,
    startDate: calendar.startDate,
    endDate,
    workingDays: countTeamWorkingDays(calendar.startDate, endDate, calendar),
    criticalChain: traceCriticalChain(results, endDate),
  };
}

/**
 * Reconstruye la cadena que determinó la fecha final siguiendo `drivenBy` hacia atrás.
 * @param {ScheduledActivity[]} results
 * @param {string} endDate
 */
function traceCriticalChain(results, endDate) {
  const byId = new Map(results.map((entry) => [entry.id, entry]));
  const last = [...results].reverse().find((entry) => entry.endDate === endDate);
  const chain = [];
  for (let current = last; current; current = current.drivenBy ? byId.get(current.drivenBy) : null) {
    chain.unshift(current.id);
  }
  return chain;
}

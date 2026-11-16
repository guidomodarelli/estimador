import { computeEffectiveCapacity, formatHours } from '../../src/core/index.js';
import { escapeHtml, optionsHtml } from '../utils/dom.js';

const DEDUCTION_SCOPE_OPTIONS = Object.freeze([
  { value: 'external', label: 'Ajena a las tareas (se descuenta)' },
  { value: 'task', label: 'Ya es una etapa (no se descuenta)' },
]);
const DEDUCTION_KIND_OPTIONS = Object.freeze([
  { value: 'meetings', label: 'Reuniones' },
  { value: 'interruptions', label: 'Interrupciones / soporte' },
  { value: 'operational', label: 'Tareas operativas' },
  { value: 'other', label: 'Otra' },
]);

function capacityText(person) {
  try {
    const capacity = computeEffectiveCapacity(person);
    return capacity.isManual ? `${formatHours(capacity.effectiveHours)} (manual)` : formatHours(capacity.effectiveHours);
  } catch (capacityError) {
    return `<span class="error-text">${escapeHtml(capacityError.message.replace(/^[\w:]+ failed for person "[^"]+": /, ''))}</span>`;
  }
}

function deductionsHtml(person, personIndex) {
  const rows = (person.deductions ?? [])
    .map((deduction, deductionIndex) => {
      const path = `team.people.${personIndex}.deductions.${deductionIndex}`;
      return `<tr>
        <td><input type="text" class="cell-text" aria-label="Concepto" data-bind="${path}.label"></td>
        <td><input type="number" min="0" step="0.25" class="cell-number" aria-label="Horas por día" data-bind="${path}.hours" data-type="number"></td>
        <td><select class="cell-select" aria-label="Tratamiento" data-bind="${path}.scope">${optionsHtml(DEDUCTION_SCOPE_OPTIONS, deduction.scope ?? 'external')}</select></td>
        <td><select class="cell-select" aria-label="Tipo" data-bind="${path}.kind">${optionsHtml(DEDUCTION_KIND_OPTIONS, deduction.kind ?? 'other')}</select></td>
        <td><button type="button" class="button icon" data-action="remove-deduction" data-person-index="${personIndex}" data-index="${deductionIndex}" aria-label="Eliminar ${escapeHtml(deduction.label)}">✕</button></td>
      </tr>`;
    })
    .join('');
  return `<table class="data-table compact">
    <thead><tr><th>Descuento diario</th><th>h/día</th><th>Tratamiento</th><th>Tipo</th><th><span class="sr-only">Eliminar</span></th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <button type="button" class="button" data-action="add-deduction" data-person-index="${personIndex}">+ Descuento</button>`;
}

/** Equipo y calendario: se configuran una vez y valen para todas las estimaciones. */
export function renderTeamView(store, focusPersonId) {
  const { team } = store;
  const rows = team.people
    .map((person, index) => {
      const path = `team.people.${index}`;
      return `<tbody class="person-group">
        <tr>
          <td><input type="text" class="cell-text strong" aria-label="Nombre" data-bind="${path}.name" data-focus-key="person-${escapeHtml(person.id)}" data-sidebar-refresh></td>
          <td><input type="number" min="0" step="0.5" class="cell-number" aria-label="Jornada (h)" data-bind="${path}.workdayHours" data-type="number"></td>
          <td><input type="number" min="0" step="0.25" class="cell-number" aria-label="Reserva para imprevistos (h)" data-bind="${path}.reserveHours" data-type="number"></td>
          <td><input type="number" min="0" step="0.25" class="cell-number" placeholder="Auto" aria-label="Capacidad manual (h), vacío para calcular" data-bind="${path}.manualEffectiveHours" data-type="optional-number"></td>
          <td><input type="text" class="cell-text" placeholder="2026-12-24, 2026-12-31" aria-label="Ausencias (fechas separadas por coma)" data-bind="${path}.absences" data-type="list"></td>
          <td class="computed" id="person-capacity-${index}">${capacityText(person)}</td>
          <td>${team.people.length > 1 ? `<button type="button" class="button icon" data-action="remove-person" data-index="${index}" aria-label="Eliminar ${escapeHtml(person.name)}">✕</button>` : ''}</td>
        </tr>
        <tr class="person-deductions${person.id === focusPersonId ? ' focused' : ''}"><td colspan="7"><details${person.id === focusPersonId ? ' open' : ''}><summary>Descuentos diarios de ${escapeHtml(person.name || 'esta persona')}</summary>${deductionsHtml(person, index)}</details></td></tr>
      </tbody>`;
    })
    .join('');
  return `<header class="view-header"><h1>Equipo y capacidad</h1><p class="muted">Vale para todas las estimaciones. Descontá solo lo ajeno a las tareas.</p></header>
    <div class="table-scroll"><table class="data-table team-table">
      <thead><tr><th>Persona</th><th>Jornada h</th><th>Reserva h</th><th>Manual h</th><th>Ausencias</th><th>Capacidad efectiva</th><th><span class="sr-only">Eliminar</span></th></tr></thead>
      ${rows}
    </table></div>
    <div class="row-actions"><button type="button" class="button" data-action="add-person">+ Persona</button></div>
    <section class="view-section">
      <h2 class="section-title">Calendario</h2>
      <label class="block">Feriados<input type="text" placeholder="2026-12-25, 2027-01-01" data-bind="team.calendar.holidays" data-type="list"></label>
      <label class="inline-check"><input type="checkbox" data-bind="team.meetingsReviewed"> Las reuniones que descuento son ajenas a las tareas (no avisar de doble conteo con la etapa de coordinación)</label>
    </section>`;
}

export { capacityText };

import { formatDate } from '../../src/core/index.js';

/** Fechas que se cargan como texto (feriados, ausencias): AAAA-MM-DD separadas por coma. */
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** true si el texto es una fecha ISO real (rechaza, por ejemplo, 2026-02-30). */
export function isValidIsoDate(value) {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

/**
 * Cómo se interpretó una lista de fechas, para mostrarla junto al campo.
 * @param {string[]|undefined} values
 * @returns {{text: string, invalid: string[]}}
 */
export function describeDateList(values) {
  const dates = values ?? [];
  const invalid = dates.filter((value) => !isValidIsoDate(value));
  if (invalid.length) return { text: `No es una fecha válida: ${invalid.join(', ')}. Usá AAAA-MM-DD.`, invalid };
  if (!dates.length) return { text: 'Sin fechas. Formato AAAA-MM-DD, separadas por coma.', invalid };
  return { text: dates.map(formatDate).join(' · '), invalid };
}

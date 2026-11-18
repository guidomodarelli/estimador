/** Utilidades de texto para la interfaz. */

/**
 * "1 estimación" / "3 estimaciones": evita los "(es)" y "(s)" en el copy.
 * @param {number} count
 * @param {string} singular
 * @param {string} plural
 */
export const pluralize = (count, singular, plural) => `${count} ${count === 1 ? singular : plural}`;

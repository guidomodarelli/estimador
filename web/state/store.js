import { createSampleProject } from '../../src/core/index.js';
import { createEstimateFromProject, createNewEstimate } from './estimates.js';

/**
 * Persistencia local (por navegador) de la app: varias estimaciones, un equipo compartido
 * y el historial de horas reales. Exportar JSON es la forma de respaldar o mover los datos.
 */

const STORAGE_KEY = 'estimador:v2';
/** Claves del formato anterior (una sola estimación): se migran una vez y se dejan intactas. */
const LEGACY_STORAGE_KEYS = Object.freeze({ PROJECT: 'estimador:project', HISTORY: 'estimador:history' });
const STORE_VERSION = 2;

export const VIEW = Object.freeze({ ESTIMATE: 'estimate', TEAM: 'team', HISTORY: 'history', QUARTER: 'quarter' });
export const TAB = Object.freeze({ ESTIMATE: 'estimar', PLAN: 'plan', UNCERTAINTY: 'incertidumbre', SHARE: 'compartir' });

function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (storageError) {
    console.warn(`store:readJson failed for key "${key}"`, storageError);
    return null;
  }
}

/** Equipo del ejemplo: 8 h de jornada, 1 h de reuniones, 1 h de soporte y 1 h de reserva. */
function createDefaultTeam(startDate) {
  const sample = createSampleProject(startDate);
  return { people: sample.people, calendar: sample.calendar, meetingsReviewed: false };
}

/** Convierte el formato v1 (un proyecto con su equipo adentro) al v2. */
function migrateLegacy(legacyProject, legacyHistory) {
  const { people, calendar, ...projectWithoutTeam } = legacyProject;
  const estimate = createEstimateFromProject(projectWithoutTeam);
  return {
    version: STORE_VERSION,
    estimates: [estimate],
    team: { people: people?.length ? people : createDefaultTeam(legacyProject.startDate).people, calendar: calendar ?? {}, meetingsReviewed: false },
    history: (legacyHistory ?? []).map((record) => ({ ...record, estimateId: null })),
    ui: { view: VIEW.ESTIMATE, estimateId: estimate.id, tab: TAB.ESTIMATE },
  };
}

export function loadStore(todayIso) {
  const stored = readJson(STORAGE_KEY);
  if (stored?.version === STORE_VERSION && Array.isArray(stored.estimates)) return stored;
  const legacyProject = readJson(LEGACY_STORAGE_KEYS.PROJECT);
  if (legacyProject?.stages) return migrateLegacy(legacyProject, readJson(LEGACY_STORAGE_KEYS.HISTORY));
  const estimate = createNewEstimate(todayIso, 'Nueva funcionalidad de ejemplo');
  return {
    version: STORE_VERSION,
    estimates: [estimate],
    team: createDefaultTeam(todayIso),
    history: readJson(LEGACY_STORAGE_KEYS.HISTORY) ?? [],
    ui: { view: VIEW.ESTIMATE, estimateId: estimate.id, tab: TAB.ESTIMATE },
  };
}

export function saveStore(store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (storageError) {
    console.warn('store:saveStore failed', storageError);
  }
}

/** Valida lo mínimo de un respaldo importado antes de reemplazar los datos. */
export function parseImportedStore(content) {
  if (content?.version === STORE_VERSION && Array.isArray(content.estimates) && content.team) return content;
  if (Array.isArray(content?.stages) && typeof content.startDate === 'string') return migrateLegacy(content, []);
  throw new Error('el archivo no es un respaldo del estimador (faltan "estimates" y "team") ni una estimación suelta (faltan "stages" y "startDate")');
}

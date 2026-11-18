import { COMPLEXITY_OPTIONS, createSampleProject, withDefaultAnswers } from '../../src/core/index.js';
import { createEstimateFromProject, createNewEstimate, DEFAULT_QUICK_ANSWERS, SAMPLE_ESTIMATE_NAME } from './estimates.js';

/**
 * Persistencia local (por navegador) de la app: varias estimaciones, un equipo compartido
 * y el historial de horas reales. Exportar JSON es la forma de respaldar o mover los datos.
 */

const STORAGE_KEY = 'estimador:v2';
/** Claves del formato anterior (una sola estimación): se migran una vez y se dejan intactas. */
const LEGACY_STORAGE_KEYS = Object.freeze({ PROJECT: 'estimador:project', HISTORY: 'estimador:history' });
const STORE_VERSION = 3;
/** Versión con tipos de tarea (bug, feature, refactor, spike) en vez de complejidad de la iniciativa. */
const TASK_TYPE_STORE_VERSION = 2;

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

/** Convierte el formato v1 (un proyecto con su equipo adentro) al actual. */
function migrateLegacy(legacyProject, legacyHistory) {
  const { people, calendar, taskType, ...projectWithoutTeam } = legacyProject;
  const estimate = createEstimateFromProject(projectWithoutTeam);
  return {
    version: STORE_VERSION,
    estimates: [estimate],
    team: { people: people?.length ? people : createDefaultTeam(legacyProject.startDate).people, calendar: calendar ?? {}, meetingsReviewed: false },
    history: (legacyHistory ?? []).map(({ taskType: legacyTaskType, ...record }) => ({ ...record, complexity: record.complexity ?? null, estimateId: null })),
    ui: { view: VIEW.ESTIMATE, estimateId: estimate.id, tab: TAB.ESTIMATE },
  };
}

/**
 * Convierte respuestas por tipo de tarea a respuestas por complejidad. Las etapas guardadas se
 * conservan tal cual (quedan como editadas a mano) para no perder estimaciones ya hechas.
 */
function migrateTaskTypeQuick(quick = {}) {
  return withDefaultAnswers({
    complexity: COMPLEXITY_OPTIONS.includes(quick.complexity) ? quick.complexity : DEFAULT_QUICK_ANSWERS.complexity,
    developmentHours: quick.taskType === 'spike' ? null : quick.anchorHours ?? null,
    applyCalibration: quick.applyCalibration ?? false,
    customized: true,
  });
}

/** v2 → v3: la complejidad reemplaza al tipo de tarea en estimaciones e historial. */
export function migrateTaskTypeStore(stored) {
  const complexityByEstimate = new Map();
  const estimates = stored.estimates.map((estimate) => {
    const { taskType, ...project } = estimate.project;
    const quick = project.quick?.complexity && !project.quick.taskType && !('anchorHours' in project.quick) ? project.quick : migrateTaskTypeQuick(project.quick);
    complexityByEstimate.set(estimate.id, quick.complexity);
    return { ...estimate, project: { ...project, complexity: quick.complexity, quick } };
  });
  const history = (stored.history ?? []).map(({ taskType, ...record }) => ({ ...record, complexity: record.complexity ?? complexityByEstimate.get(record.estimateId) ?? null }));
  return { ...stored, version: STORE_VERSION, estimates, history };
}

export function loadStore(todayIso) {
  const stored = readJson(STORAGE_KEY);
  if (stored?.version === STORE_VERSION && Array.isArray(stored.estimates)) return stored;
  if (stored?.version === TASK_TYPE_STORE_VERSION && Array.isArray(stored.estimates)) return migrateTaskTypeStore(stored);
  const legacyProject = readJson(LEGACY_STORAGE_KEYS.PROJECT);
  if (legacyProject?.stages) return migrateLegacy(legacyProject, readJson(LEGACY_STORAGE_KEYS.HISTORY));
  const estimate = createNewEstimate(todayIso, SAMPLE_ESTIMATE_NAME);
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
  if (content?.version === TASK_TYPE_STORE_VERSION && Array.isArray(content.estimates) && content.team) return migrateTaskTypeStore(content);
  if (Array.isArray(content?.stages) && typeof content.startDate === 'string') return migrateLegacy(content, []);
  throw new Error('el archivo no es un respaldo del estimador (faltan "estimates" y "team") ni una estimación suelta (faltan "stages" y "startDate")');
}

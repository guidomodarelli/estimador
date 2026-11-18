#!/usr/bin/env node
/**
 * Genera un historial INVENTADO para probar el backtest de punta a punta mientras no haya
 * tareas reales. No sirve para calibrar nada: solo refleja los supuestos de abajo.
 *
 * Supuestos (inspirados en lo que reporta la literatura de estimación, no medidos):
 * - Sesgo optimista: la mediana real/estimado ronda ×1,3 (las tareas llevan ~30 % más).
 * - Error común a toda la tarea con desvío logarítmico 0,4 (colas largas).
 * - 1 de cada 8 tareas tiene una sorpresa grande (×1,8 adicional).
 */
import { writeFile } from 'node:fs/promises';
import { buildStagesFromAnswers } from '../src/core/index.js';
import { createSeededRandom, sampleBetaPert, sampleStandardNormal } from '../src/core/random.js';

const OUTPUT_PATH = new URL('../data/backtest-inventado.json', import.meta.url);
const SEED = 2026;
const INVENTED_LOG_BIAS = Math.log(1.3);
const INVENTED_LOG_SIGMA = 0.4;
const SURPRISE_PROBABILITY = 1 / 8;
const SURPRISE_MULTIPLIER = 1.8;

/** Iniciativas típicas de un equipo web: título, complejidad y horas de desarrollo estimadas. */
const INVENTED_TASKS = [
  ['Filtro de búsqueda devuelve duplicados', 'baja', 3], ['Checkout con nuevo medio de pago', 'alta', 40],
  ['Exportar reportes a CSV', 'baja', 8], ['Migrar formularios a la nueva librería', 'media', 16],
  ['Notificaciones push en la app', 'media', 20], ['Error 500 al subir imágenes grandes', 'baja', 4],
  ['Panel de métricas para administradores', 'alta', 30], ['Separar módulo de pagos en servicios', 'alta', 48],
  ['Login con Google', 'media', 12], ['Fechas mal en zona horaria de México', 'baja', 2],
  ['Listado de pedidos más rápido', 'media', 14], ['Carrito persistente entre dispositivos', 'media', 18],
  ['Reemplazar moment por date-fns', 'baja', 10], ['Botón de reintento no responde en iOS', 'baja', 3],
  ['Onboarding de usuarios nuevos en 3 pasos', 'media', 20], ['Notificaciones por email de envío', 'media', 10],
  ['Búsqueda semántica en el catálogo', 'alta', 36], ['Paginación rota con filtros combinados', 'baja', 5],
  ['Unificar manejo de errores de la API', 'media', 14], ['Integración con sistema de facturación', 'alta', 56],
  ['Precio con descuento redondea mal', 'baja', 2], ['Modo oscuro en toda la app', 'media', 16],
  ['Tipar la capa de servicios con TypeScript', 'alta', 22], ['Nuevo gráfico de ventas', 'baja', 6],
  ['Cupones con vencimiento y límite de uso', 'media', 14],
];

const random = createSeededRandom(SEED);

const records = INVENTED_TASKS.map(([title, complexity, developmentHours], index) => {
  const answers = { complexity, developmentHours };
  const stageSum = buildStagesFromAnswers(answers).stages
    .filter((stage) => stage.included)
    .reduce((sum, stage) => sum + sampleBetaPert(stage, random), 0);
  const commonFactor = Math.exp(INVENTED_LOG_BIAS + INVENTED_LOG_SIGMA * sampleStandardNormal(random));
  const surprise = random() < SURPRISE_PROBABILITY ? SURPRISE_MULTIPLIER : 1;
  return {
    id: `inventada-${String(index + 1).padStart(2, '0')}`,
    title: `INVENTADA — ${title}`,
    answers,
    actualHours: Math.round(stageSum * commonFactor * surprise * 2) / 2,
  };
});

const document = {
  inventado: true,
  advertencia: 'Datos INVENTADOS con supuestos de la literatura (mediana ×1,3, error común σ log 0,4, sorpresas ×1,8 en 1 de cada 8). Sirven para probar el backtest, NO para calibrar el modelo de un equipo real.',
  generadoCon: 'node scripts/generate-invented-history.js',
  records,
};
await writeFile(OUTPUT_PATH, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
process.stdout.write(`Generadas ${records.length} iniciativas inventadas en data/backtest-inventado.json\n`);

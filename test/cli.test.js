import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const CLI_PATH = fileURLToPath(new URL('../cli/estimate.js', import.meta.url));
const ANSI_ESCAPE_PATTERN = /\x1b\[/;

/** Ejecuta la CLI real en un proceso aparte; devuelve stdout, stderr y exit code. */
async function runCli(args) {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [CLI_PATH, ...args], { env: { ...process.env, NO_COLOR: '1' } });
    return { stdout, stderr, exitCode: 0 };
  } catch (processError) {
    return { stdout: processError.stdout, stderr: processError.stderr, exitCode: processError.code };
  }
}

describe('CLI', () => {
  let workDirectory;
  let projectPath;
  before(async () => {
    workDirectory = await mkdtemp(join(tmpdir(), 'estimador-'));
    projectPath = join(workDirectory, 'bug.json');
  });
  after(() => rm(workDirectory, { recursive: true, force: true }));

  it('init genera una iniciativa válida con la complejidad y las partes del RFC pedidas', async () => {
    const result = await runCli(['init', '--complexity', 'baja', '--rfc', 'ninguno', '--start', '2026-11-16', '--output', projectPath]);
    assert.equal(result.exitCode, 0);
    const project = JSON.parse(await readFile(projectPath, 'utf8'));
    assert.equal(project.complexity, 'baja');
    assert.equal(project.stages.find((stage) => stage.id === 'rfc').included, false);
  });

  it('estima en texto plano sin escapes ANSI cuando NO_COLOR está definida', async () => {
    const result = await runCli([projectPath, '--runs', '200']);
    assert.equal(result.exitCode, 0);
    assert.doesNotMatch(result.stdout, ANSI_ESCAPE_PATTERN);
    assert.match(result.stdout, /P80/);
    assert.match(result.stdout, /Fecha probable/);
    assert.match(result.stdout, /Fecha de rollout/);
  });

  it('--format json devuelve un objeto parseable con la simulación', async () => {
    const result = await runCli([projectPath, '--format', 'json', '--runs', '100', '--seed', '3']);
    const estimate = JSON.parse(result.stdout);
    assert.equal(estimate.simulation.runs, 100);
    assert.equal(estimate.simulation.seed, 3);
  });

  it('quick estima con la complejidad y las horas de desarrollo, y guarda el proyecto generado', async () => {
    const savedPath = join(workDirectory, 'rapida.json');
    const result = await runCli(['quick', '6', '--complexity', 'alta', '--rfc', 'casos-de-uso,metricas-tracks', '--format', 'json', '--runs', '0', '--start', '2026-11-16', '--save', savedPath]);
    assert.equal(result.exitCode, 0);
    const estimate = JSON.parse(result.stdout);
    assert.equal(estimate.stages.find((stage) => stage.id === 'desarrollo').mostLikely, 6);
    assert.ok(estimate.assumptions.some((assumption) => assumption.includes('Casos de uso, Métricas (tracks)')));
    assert.equal(estimate.milestones[0].id, 'rollout');
    const saved = JSON.parse(await readFile(savedPath, 'utf8'));
    assert.equal(saved.complexity, 'alta');
  });

  it('quick sin horas usa las sugeridas para la complejidad', async () => {
    const result = await runCli(['quick', '--complexity', 'baja', '--format', 'json', '--runs', '0']);
    assert.equal(result.exitCode, 0);
    assert.equal(JSON.parse(result.stdout).stages.find((stage) => stage.id === 'desarrollo').mostLikely, 8);
  });

  it('quick con horas inválidas: exit code 2', async () => {
    const result = await runCli(['quick', 'muchas']);
    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, /horas de desarrollo/);
  });

  it('quick con una respuesta fuera de las opciones: exit code 1 con las opciones válidas', async () => {
    const result = await runCli(['quick', '5', '--complexity', 'extrema']);
    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /baja \| media \| alta/);
  });

  it('backtest de la plantilla: corre, pero no emite veredicto con 2 tareas', async () => {
    const templatePath = fileURLToPath(new URL('../data/backtest-plantilla.json', import.meta.url));
    const result = await runCli(['backtest', templatePath, '--runs', '200']);
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /Cobertura real/);
    assert.match(result.stdout, /sin datos suficientes/);
    assert.doesNotMatch(result.stdout, /: pasa$/m);
  });

  it('backtest sin archivo: exit code 2', async () => {
    const result = await runCli(['backtest']);
    assert.equal(result.exitCode, 2);
  });

  it('archivo inexistente: error claro y exit code 1', async () => {
    const result = await runCli([join(workDirectory, 'no-existe.json')]);
    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /cli:loadProject failed/);
  });

  for (const invalidArgs of [['--runs', '-5'], ['--runs=-5'], ['--runs', 'muchas'], ['--opcion-inexistente']]) {
    it(`opción inválida ${invalidArgs.join(' ')}: exit code 2 con sugerencia de ayuda`, async () => {
      const result = await runCli([projectPath, ...invalidArgs]);
      assert.equal(result.exitCode, 2);
      assert.match(result.stderr, /--help/);
      assert.doesNotMatch(result.stderr, /at main/); // sin stack trace crudo
    });
  }
});

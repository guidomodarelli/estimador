#!/usr/bin/env node
/** Servidor estático mínimo para la app web (los ES modules no cargan desde file://). */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const DEFAULT_PORT = 5173;
const WEB_ENTRY_PATH = '/web/index.html';
const CONTENT_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
});

const port = Number(process.env.PORT ?? DEFAULT_PORT);

createServer(async (request, response) => {
  const requestPath = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  if (requestPath === '/' || requestPath === '/web' || requestPath === '/web/') {
    // Redirigir para que las rutas relativas (./app.js, ../src) resuelvan desde /web/.
    if (requestPath !== '/web/') {
      response.writeHead(302, { Location: '/web/' }).end();
      return;
    }
  }
  const relativePath = requestPath === '/web/' ? WEB_ENTRY_PATH : requestPath;
  const filePath = normalize(join(PROJECT_ROOT, relativePath));
  if (!filePath.startsWith(normalize(PROJECT_ROOT + sep))) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const body = await readFile(filePath);
    response.writeHead(200, { 'Content-Type': CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(body);
  } catch (readError) {
    response.writeHead(readError.code === 'ENOENT' ? 404 : 500).end(`serve: GET ${requestPath} failed (${readError.code})`);
  }
})
  .on('error', (serverError) => {
    const reason = serverError.code === 'EADDRINUSE'
      ? `el puerto ${port} ya está en uso (¿quedó otro servidor abierto?). Probá con PORT=${port + 1} npm run serve`
      : serverError.message;
    process.stderr.write(`serve: no se pudo iniciar el servidor: ${reason}\n`);
    process.exitCode = 1;
  })
  .listen(port, () => {
    process.stdout.write(`Estimador web en http://localhost:${port}\n`);
  });

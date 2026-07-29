import { DatabaseSync } from 'node:sqlite';
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const rootDirectory = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dataDirectory = join(rootDirectory, 'data');
const databasePath = join(dataDirectory, 'control-gastos.sqlite');
const distDirectory = join(rootDirectory, 'dist');
const port = Number(process.env.PORT || 5174);

mkdirSync(dataDirectory, { recursive: true });

const database = new DatabaseSync(databasePath);
database.exec(`
  CREATE TABLE IF NOT EXISTS budget_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);

const readState = database.prepare('SELECT payload, updated_at FROM budget_state WHERE id = 1');
const writeState = database.prepare(`
  INSERT INTO budget_state (id, payload, updated_at)
  VALUES (1, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    payload = excluded.payload,
    updated_at = excluded.updated_at
`);

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

function readJsonBody(request) {
  return new Promise((resolveBody, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 5_000_000) {
        reject(new Error('El cuerpo de la petición es demasiado grande.'));
        request.destroy();
      }
    });
    request.on('end', () => {
      try {
        resolveBody(JSON.parse(body || '{}'));
      } catch {
        reject(new Error('JSON no válido.'));
      }
    });
    request.on('error', reject);
  });
}

function isValidBudgetData(data) {
  return Boolean(
    data
    && typeof data === 'object'
    && data.schemaVersion === 2
    && data.salaries
    && typeof data.salaries === 'object'
    && Array.isArray(data.fixedExpenseSeries)
    && Array.isArray(data.movements)
    && (!data.monthlyClosures
      || (typeof data.monthlyClosures === 'object' && !Array.isArray(data.monthlyClosures))),
  );
}

function serveStaticFile(request, response) {
  if (!existsSync(distDirectory)) {
    sendJson(response, 404, { error: 'La aplicación aún no se ha compilado.' });
    return;
  }

  const requestedPath = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
  const relativePath = requestedPath === '/' ? 'index.html' : requestedPath.replace(/^\/+/, '');
  const normalizedPath = normalize(relativePath);
  let filePath = resolve(distDirectory, normalizedPath);

  if (!filePath.startsWith(distDirectory) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(distDirectory, 'index.html');
  }

  const contentTypes = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
  };
  response.writeHead(200, { 'Content-Type': contentTypes[extname(filePath)] || 'application/octet-stream' });
  createReadStream(filePath).pipe(response);
}

const server = http.createServer(async (request, response) => {
  if (request.url === '/api/health' && request.method === 'GET') {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.url === '/api/budget' && request.method === 'GET') {
    const row = readState.get();
    sendJson(response, 200, {
      data: row ? JSON.parse(row.payload) : null,
      updatedAt: row?.updated_at || null,
    });
    return;
  }

  if (request.url === '/api/budget' && request.method === 'PUT') {
    try {
      const body = await readJsonBody(request);
      if (!isValidBudgetData(body.data)) {
        sendJson(response, 400, { error: 'La estructura de datos no es válida.' });
        return;
      }
      const updatedAt = new Date().toISOString();
      writeState.run(JSON.stringify(body.data), updatedAt);
      sendJson(response, 200, { ok: true, updatedAt });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  if (request.url?.startsWith('/api/')) {
    sendJson(response, 404, { error: 'Ruta no encontrada.' });
    return;
  }

  serveStaticFile(request, response);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`API SQLite disponible en http://127.0.0.1:${port}`);
});

function closeServer() {
  server.close(() => {
    database.close();
    process.exit(0);
  });
}

process.on('SIGINT', closeServer);
process.on('SIGTERM', closeServer);

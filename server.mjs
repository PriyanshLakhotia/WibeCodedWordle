import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, resolve, sep } from 'node:path';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
const port = Number(process.env.PORT || 6000);
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function handleRequest(request, response) {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  } catch {
    response.writeHead(400).end('Bad request');
    return;
  }
  const allowedPath = pathname === '/' || pathname === '/index.html'
    || pathname.startsWith('/src/') || pathname.startsWith('/public/');
  const file = resolve(root, pathname === '/' ? 'index.html' : `.${pathname}`);
  if (!allowedPath || !file.startsWith(`${root}${sep}`)) {
    response.writeHead(404).end('Not found');
    return;
  }
  readFile(file).then(content => {
    response.writeHead(200, {
      'Content-Type': mimeTypes[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    });
    response.end(request.method === 'HEAD' ? undefined : content);
  }).catch(() => response.writeHead(404).end('Not found'));
}

const servers = [];
function listen(serverPort, optional = false) {
  const server = createServer(handleRequest);
  server.on('error', error => {
    console.error(`${optional ? 'Preview' : 'Server'}: ${error.message}`);
    if (!optional) process.exit(1);
  });
  server.listen(serverPort, '127.0.0.1', () => {
    console.log(`${optional ? 'Browser preview' : 'Wibe Coded Wordle'}: http://localhost:${serverPort}`);
  });
  servers.push(server);
}

listen(port);
// Browsers reserve port 6000 for X11. This second listener serves the same app.
if (port === 6000) listen(6001, true);
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    for (const server of servers) server.close();
  });
}

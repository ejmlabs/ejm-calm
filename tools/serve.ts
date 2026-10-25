import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'dist');
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

// Shared with index.html meta CSP. Header adds frame-ancestors (meta cannot set it).
export const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; worker-src 'self'; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
export const CSP_HEADER = `${CSP}; frame-ancestors 'none'`;

const HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cache-Control': 'no-cache',
  'Content-Security-Policy': CSP_HEADER,
};

const ALLOWED = new Set(['index.html', 'LICENSE', 'THIRD_PARTY_NOTICES', 'favicon.ico', 'favicon.svg', 'favicon.png']);

function allowed(relative: string): boolean {
  if (ALLOWED.has(relative)) return true;
  if (relative.startsWith('favicon')) return true;
  if (relative === 'assets' || relative.startsWith('assets/')) return true;
  return false;
}

export type StartServerOptions = {
  port?: number;
  root?: string;
};

export type AppServer = {
  server: ReturnType<typeof createServer>;
  url: string;
  close: () => Promise<void>;
};

export async function startServer({ port = 8080, root = DIST }: StartServerOptions = {}): Promise<AppServer> {
  const base = await realpath(root);
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const reply = (status: number, body: string) => {
      response.writeHead(status, { ...HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
      response.end(request.method === 'HEAD' ? undefined : body);
    };
    if (!request.method || !['GET', 'HEAD'].includes(request.method)) {
      response.setHeader('Allow', 'GET, HEAD');
      reply(405, 'Method not allowed');
      return;
    }
    let path: string;
    try {
      path = decodeURIComponent((request.url ?? '/').split('?')[0]!);
    } catch {
      reply(400, 'Invalid path');
      return;
    }
    if (path.includes('\0') || path.includes('\\') || path.split('/').some((part) => part.startsWith('.'))) {
      reply(403, 'Forbidden');
      return;
    }
    const relative = path === '/' ? 'index.html' : path.replace(/^\//, '');
    if (!allowed(relative)) {
      reply(404, 'Not found');
      return;
    }
    try {
      const file = await realpath(resolve(base, relative));
      if (!file.startsWith(`${base}${sep}`)) {
        reply(403, 'Forbidden');
        return;
      }
      if (!(await stat(file)).isFile()) {
        reply(404, 'Not found');
        return;
      }
      const body = await readFile(file);
      response.writeHead(200, {
        ...HEADERS,
        'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
        'Content-Length': body.length,
      });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch {
      reply(404, 'Not found');
    }
  });
  await new Promise<void>((accept, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', accept);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Server failed to bind a port');
  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((accept, reject) => server.close((error) => (error ? reject(error) : accept()))),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const raw = process.env.PORT ?? process.argv[2] ?? '8080';
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Port must be an integer from 0 to 65535');
  const app = await startServer({ port });
  console.log(`Local preview: ${app.url}`);
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, async () => {
      await app.close();
      process.exit(0);
    });
  }
}

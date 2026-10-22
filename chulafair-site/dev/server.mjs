// Local preview server that mimics vercel.json — for testing only, never deployed.
//   DATABASE_URL=postgres://… INSECURE_COOKIES=1 node dev/server.mjs
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const pub = join(root, 'public');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2' };

const render = (await import('../api/render.js')).default;
const admin = (await import('../api/admin.js')).default;

function rewrite(path) {
  if (path === '/') return '/api/render?home=1';
  if (path === '/blog') return '/api/render?blog=1';
  if (path === '/sitemap.xml') return '/api/render?sitemap=1';
  let m;
  if ((m = path.match(/^\/blog\/([^/]+)$/))) return `/api/render?post=${m[1]}`;
  if ((m = path.match(/^\/p\/([^/]+)$/))) return `/api/render?page=${m[1]}`;
  return null;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://local');
  const target = rewrite(url.pathname);
  if (target) {
    const t = new URL(target, 'http://local');
    url.searchParams.forEach((v, k) => t.searchParams.set(k, v));
    req.url = t.pathname + t.search;
    return render(req, res);
  }
  if (url.pathname.startsWith('/api/admin')) return admin(req, res);
  if (url.pathname.startsWith('/api/render')) return render(req, res);

  let file = normalize(join(pub, url.pathname));
  if (!file.startsWith(pub)) { res.statusCode = 403; return res.end(); }
  try {
    const s = await stat(file).catch(() => null);
    if (!s || s.isDirectory()) file = file.replace(/\/$/, '') + '.html';
    const body = await readFile(file);
    res.setHeader('content-type', types[extname(file)] || 'application/octet-stream');
    res.end(body);
  } catch {
    res.statusCode = 404;
    res.end('not found');
  }
});

const port = Number(process.env.PORT || 3000);
server.listen(port, () => console.log(`chulafair.com preview on http://localhost:${port}`));

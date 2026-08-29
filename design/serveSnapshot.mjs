import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { queryKey } from './tmdbKey.mjs';

/**
 * TMDB, answered from disk.
 *
 * The app points `tmdbBase` at `/3` here and `tmdbImage` at `/t/p`, so `TmdbProvider` runs
 * unmodified — the same requests, the same parsing, the same shapes — and the browser never
 * touches the network, which in this container it cannot. §6.151.
 *
 * A 404 is **loud**. A snapshot missing an answer would otherwise look exactly like a show
 * with no seasons, and a screenshot of that is a screenshot of the harness rather than of
 * the design — which is the whole failure §6.146 spent a sprint on.
 */
const ROOT = new URL('./real/', import.meta.url).pathname;
const PORT = Number(process.argv[2] ?? 4203);

const TYPES = { '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };

const missing = new Set();

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization,content-type',
  'access-control-allow-methods': 'GET,OPTIONS',
};

const server = createServer((req, res) => {
  /*
   * The preflight, which is the whole reason the first run of this photographed nothing.
   *
   * `TmdbProvider` sends `Authorization: Bearer …`, and a header like that makes the
   * request non-simple — so the browser asks `OPTIONS` first. A server that answers 404 to
   * that turns every call into "Failed to fetch", and the screen shows its network-failure
   * state, which looks exactly like a provider that has nothing. The clause in
   * `capture-real.mjs` refused to hand back the screenshots, which is what it is for.
   */
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  const url = new URL(req.url, 'http://localhost');
  let file;

  if (url.pathname.startsWith('/3/')) {
    const params = Object.fromEntries(url.searchParams);
    file = join(ROOT, queryKey(url.pathname.slice(2), params));
  } else if (url.pathname.startsWith('/t/p/')) {
    file = join(ROOT, url.pathname.slice(1));
  } else if (url.pathname === '/MANIFEST.json') {
    file = join(ROOT, 'MANIFEST.json');
  }

  // `normalize` and a prefix check, because a path from a request is a path from outside.
  if (!file || !normalize(file).startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) {
    if (file && !missing.has(url.pathname + url.search)) {
      missing.add(url.pathname + url.search);
      console.error(`snapshot has no answer for ${url.pathname}${url.search}`);
    }
    res.writeHead(404, { 'content-type': 'application/json', ...CORS });
    res.end('{"status_message":"not in the snapshot"}');
    return;
  }

  res.writeHead(200, {
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
    // The harness is the only client and it wants the same bytes every run.
    'cache-control': 'no-store',
    ...CORS,
  });
  res.end(readFileSync(file));
});

server.listen(PORT, () => console.log(`snapshot of real TMDB on http://localhost:${PORT}`));

process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());

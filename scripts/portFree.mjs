/**
 * Refuse to start a smoke run on a port somebody else is already holding.
 *
 * `serve` and `vite preview` both answer a taken port by quietly binding a different
 * one — and `smoke.mjs` goes on talking to the address it was told, which is whatever
 * stale server is still there. §6.75 spent an hour on four failing phone checks that
 * turned out to be a previous run's server, with a previous run's browser storage,
 * answering on 4200 while this run's export sat unvisited on 45303.
 *
 * A suite that silently tests the wrong build is the §6.74 shape again: green and
 * meaningless, or red for a reason that is nowhere in the diff. So fail here instead,
 * with the port named.
 */
import { createServer } from 'node:net';

const port = Number(process.argv[2]);
if (!Number.isInteger(port)) {
  console.error('usage: node scripts/portFree.mjs <port>');
  process.exit(2);
}

const server = createServer();
server.once('error', (e) => {
  console.error(
    `Port ${port} is already in use (${e.code}). Something from an earlier run is still ` +
      `holding it, and this suite would test that instead of the build it just made.\n` +
      `  ps -eo pid,cmd | grep -E "serve dist|vite preview"`,
  );
  process.exit(1);
});
server.once('listening', () => server.close(() => process.exit(0)));
server.listen(port, '127.0.0.1');

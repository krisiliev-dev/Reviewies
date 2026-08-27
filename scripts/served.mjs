/**
 * Serve a build, run a suite against it, and take the server down again — including when
 * the suite fails.
 *
 * `(npx vite preview & sleep 6) && node smoke.mjs` starts a server the shell never owns.
 * When the suite passes, `npm` exits and the process group goes with it; when the suite
 * *fails*, the preview is left holding port 4173, and the next run stops before it starts
 * with `EADDRINUSE`. So the run after a red run is red for a different reason, and the
 * first thing anybody does is kill a process by hand. It happened twice in one sprint.
 *
 * `portFree.mjs` is still the check in front of this — it says plainly what is holding the
 * port rather than testing a stale build by accident. This is what stops it having
 * anything to find.
 *
 * Usage: node ../scripts/served.mjs <port> "<server command>" <suite command...>
 *
 * The server is one shell string because the two workspaces serve differently — the web
 * previews its Vite build, the phone serves an Expo export — and the point is that both
 * get taken down the same way.
 */
import { spawn } from 'node:child_process';
import net from 'node:net';

const [port, serve, ...command] = process.argv.slice(2);
if (!port || !serve || command.length === 0) {
  console.error('usage: served.mjs <port> "<server command>" <suite command...>');
  process.exit(2);
}

const server = spawn(serve, {
  shell: true,
  stdio: 'inherit',
  // Its own group, so one kill takes the shell and whatever npx spawns under it. Killing
  // the pid alone left the actual server orphaned, which is the bug this file exists for.
  detached: true,
});

let done = false;
const stop = () => {
  if (done) return;
  done = true;
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    // Already gone. Nothing to do, and nothing worth saying about it.
  }
};
process.on('exit', stop);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => process.exit(130));

/** Ready when the port answers, rather than after a fixed sleep that is usually wrong. */
const ready = async () => {
  for (let attempt = 0; attempt < 100; attempt++) {
    const open = await new Promise((resolve) => {
      const socket = net.connect(Number(port), '127.0.0.1');
      socket.on('connect', () => (socket.end(), resolve(true)));
      socket.on('error', () => resolve(false));
    });
    if (open) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
};

if (!(await ready())) {
  console.error(`Nothing came up on port ${port} within ten seconds.`);
  stop();
  process.exit(1);
}

const suite = spawn(command[0], command.slice(1), { stdio: 'inherit' });
suite.on('exit', (code, signal) => {
  stop();
  process.exit(signal ? 1 : (code ?? 1));
});

/**
 * The whole chain, with only the television pretended.
 *
 *   app  →  relay  →  bridge  →  RokuAdapter  →  a fake Roku on port 8060
 *
 * Every box but the last is the real thing: the relay server as it is deployed, the
 * bridge as a spawned process with its real SSDP discovery and its real HTTP transport,
 * and an app-side socket that speaks exactly what `app/src/remote/useBridge.ts` speaks.
 *
 * Nothing had ever run this. §6.43 found that neither client could even connect to the
 * relay, because both dialled a bare URL it refuses — and beyond that, §7 has said since
 * they were written that the Roku adapter has never spoken to hardware. The adapter's own
 * tests hand it a mock transport; the bridge's tests exercise its protocol parser; each
 * is correct and the joins between them had never been made.
 *
 * A Roku's External Control Protocol is why this is possible at all: plain HTTP on 8060,
 * no authentication, no pairing. `/query/device-info` returns XML, `/keypress/Play` is a
 * POST, `/query/media-player` reports position. A fake is a small server that answers
 * those three and records what it was asked for.
 *
 * Discovery is real too, which was not obvious: the bridge sends an SSDP M-SEARCH to
 * 239.255.255.250 and a responder here answers it. Multicast loops back inside this
 * container, so the bridge finds the fake the same way it would find a television.
 *
 * What this still does not prove: that a real Roku behaves as its documentation says. The
 * fake answers with the XML the parser expects, so a passing run says the two agree with
 * each other. §7.
 */
import { createServer } from 'node:http';
import { createSocket } from 'node:dgram';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { WebSocket } from 'ws';
import { relayConnectionUrl } from '@reviewies/core/devices/relayUrl';
import { MprisAdapter } from './src/mpris.ts';
import { gdbusMprisTransport } from './src/transports.ts';

/**
 * Re-run under a session bus if there is not one.
 *
 * The MPRIS half of the bridge shells out to `gdbus`, and `gdbus` needs a bus to talk to.
 * A container has none by default, so this suite starts one and runs itself inside it —
 * which is the difference between exercising the real command line and asserting against
 * a mock that agrees with whatever we assumed.
 */
if (!process.env.DBUS_SESSION_BUS_ADDRESS) {
  const child = spawnSync('dbus-run-session', ['--', process.execPath, ...process.argv.slice(1)], {
    stdio: 'inherit',
  });
  process.exit(child.status ?? 1);
}

const ROOT = new URL('../', import.meta.url).pathname;
const TOKEN = randomBytes(16).toString('hex');
const ECP_PORT = 8060;
const RELAY_PORT = 8791;

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

// --- The fake television -----------------------------------------------------
const asked = [];
/** Flipped to make the device stop answering, which is what a television going away looks like. */
let reachable = true;
let playerState = 'play';
let positionMs = 754_000;

const DEVICE_INFO = `<?xml version="1.0" encoding="UTF-8" ?>
<device-info>
  <udn>29c5d5c0-fake-1010-8000-000000000001</udn>
  <serial-number>FAKE0001</serial-number>
  <model-name>Roku Ultra</model-name>
  <friendly-device-name>Living Room TV</friendly-device-name>
</device-info>`;

const mediaPlayer = () => `<?xml version="1.0" encoding="UTF-8" ?>
<player error="false" state="${playerState}">
  <plugin bandwidth="20000000 bps" id="12" name="Netflix" />
  <format audio="aac_adts" captions="none" container="hls" drm="widevine" video="mpeg4_10b" />
  <position>${positionMs} ms</position>
  <duration>2700000 ms</duration>
  <is_live>false</is_live>
  <title>The Long Dark</title>
</player>`;

const roku = createServer((req, res) => {
  asked.push(`${req.method} ${req.url}`);
  if (!reachable) {
    res.writeHead(503);
    res.end();
    return;
  }
  if (req.url === '/query/device-info') {
    res.writeHead(200, { 'content-type': 'text/xml' });
    res.end(DEVICE_INFO);
    return;
  }
  if (req.url === '/query/media-player') {
    res.writeHead(200, { 'content-type': 'text/xml' });
    res.end(mediaPlayer());
    return;
  }
  if (req.method === 'POST' && req.url.startsWith('/keypress/')) {
    res.writeHead(200);
    res.end();
    return;
  }
  res.writeHead(404);
  res.end();
});

// --- Something that answers M-SEARCH -----------------------------------------
const ssdp = createSocket({ type: 'udp4', reuseAddr: true });
ssdp.on('message', (msg, from) => {
  if (!msg.toString().startsWith('M-SEARCH')) return;
  ssdp.send(
    [
      'HTTP/1.1 200 OK',
      'Cache-Control: max-age=3600',
      'ST: roku:ecp',
      'USN: uuid:roku:ecp:FAKE0001',
      `LOCATION: http://127.0.0.1:${ECP_PORT}/`,
      '',
      '',
    ].join('\r\n'),
    from.port,
    from.address,
  );
});

const started = [];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Collect messages off the app socket, so assertions can wait for one to arrive. */
function inbox(socket) {
  const seen = [];
  socket.on('message', (raw) => {
    try {
      seen.push(JSON.parse(raw.toString()));
    } catch {
      /* not ours */
    }
  });
  return {
    all: seen,
    async next(type, timeoutMs = 8000) {
      const from = seen.length;
      const until = Date.now() + timeoutMs;
      while (Date.now() < until) {
        const found = seen.slice(from).find((m) => m.type === type);
        if (found) return found;
        await wait(100);
      }
      return undefined;
    },
    since() {
      return seen.length;
    },
    after(n, type) {
      return seen.slice(n).filter((m) => m.type === type);
    },
  };
}

let app;
try {
  await new Promise((r) => roku.listen(ECP_PORT, '127.0.0.1', r));
  await new Promise((r) => ssdp.bind(1900, r));
  try {
    ssdp.addMembership('239.255.255.250');
  } catch {
    /* single-interface container; loopback still delivers */
  }

  const bridgeLog = (globalThis.__bridgeLog = []);

  /** Spawn a child and wait for a line it prints, rather than for a guessed delay. */
  function start(script, env, label, until) {
    const child = spawn(process.execPath, [script], { env: { ...process.env, ...env }, stdio: 'pipe' });
    started.push(child);
    const collect = (d) => bridgeLog.push(`[${label}] ${d}`);
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('error', (e) => collect(`spawn error: ${e.message}\n`));
    child.on('exit', (code, signal) => collect(`exited ${code} ${signal}\n`));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label} never said "${until}"`)), 20000);
      const check = () => {
        if (bridgeLog.join('').includes(until)) {
          clearTimeout(timer);
          clearInterval(poll);
          resolve(child);
        }
      };
      const poll = setInterval(check, 100);
    });
  }

  // Sequenced rather than slept through. The bridge retries every five seconds, so
  // starting it before the relay is listening costs the run a five-second hole and looks
  // exactly like a bridge that cannot connect — which is what this suite exists to tell
  // apart from one that can.
  await start(`${ROOT}relay/src/server.ts`, { PORT: String(RELAY_PORT) }, 'relay', 'Relay listening');
  await start(
    `${ROOT}bridge/src/index.ts`,
    { REVIEWIES_RELAY: `ws://127.0.0.1:${RELAY_PORT}`, REVIEWIES_TOKEN: TOKEN },
    'bridge',
    'Connected to relay',
  );

  // --- The app connects --------------------------------------------------------
  app = new WebSocket(relayConnectionUrl(`ws://127.0.0.1:${RELAY_PORT}`, 'app', TOKEN));
  const seen = inbox(app);
  await new Promise((resolve, reject) => {
    app.on('open', resolve);
    app.on('close', (code, reason) => reject(new Error(`app socket closed ${code} ${reason}`)));
    setTimeout(() => reject(new Error('app socket never opened')), 8000);
  });
  check('the app reaches the bridge through the relay', true);

  app.send(JSON.stringify({ type: 'hello', version: 1, token: TOKEN }));
  const welcome = await seen.next('welcome');
  check('the bridge answers the handshake', welcome?.bridgeName === 'reviewies-bridge', JSON.stringify(welcome ?? {}));

  // --- Discovery ---------------------------------------------------------------
  app.send(JSON.stringify({ type: 'listDevices' }));
  const listed = await seen.next('devices', 15000);
  const device = listed?.devices?.[0];
  check('the bridge finds a device by asking the network', !!device, JSON.stringify(listed?.devices ?? []));
  // Every field the app's RemoteDevice declares, because a shape the drawer cannot render
  // is the same as no device at all.
  check(
    'and describes it in the shape the drawer expects',
    !!device &&
      typeof device.id === 'string' &&
      device.adapter === 'roku' &&
      typeof device.address === 'string' &&
      device.name === 'Living Room TV',
    JSON.stringify(device ?? {}),
  );
  check(
    'reading the name off the device rather than inventing one',
    device?.name === 'Living Room TV',
    device?.name,
  );
  check(
    'and it got there over real HTTP',
    asked.includes('GET /query/device-info'),
    asked.join(' | ').slice(0, 120),
  );

  // --- A command ---------------------------------------------------------------
  const beforeCommand = asked.length;
  app.send(JSON.stringify({ type: 'command', deviceId: device.id, command: 'pause' }));
  await wait(1500);
  const keypresses = asked.slice(beforeCommand).filter((a) => a.startsWith('POST /keypress/'));
  check(
    'pressing pause arrives at the device as a keypress',
    keypresses.length === 1,
    keypresses.join(' | ') || 'nothing arrived',
  );
  // ECP has no separate pause; Play toggles, which is what the adapter documents.
  check('as the ECP key the adapter says it sends', keypresses[0] === 'POST /keypress/Play', keypresses[0]);
  check(
    'and the app is not told the command failed',
    !seen.all.some((m) => m.type === 'error' && m.code === 'send-failed'),
  );

  // --- Position ----------------------------------------------------------------
  app.send(JSON.stringify({ type: 'subscribe', deviceId: device.id }));
  const playback = await seen.next('playback');
  check('subscribing starts position reports', !!playback, JSON.stringify(playback ?? {}));
  check(
    'carrying a position the drawer can render',
    Math.abs((playback?.playback?.positionSec ?? 0) - 754) < 1 &&
      playback?.playback?.durationSec === 2700,
    `${playback?.playback?.positionSec}s of ${playback?.playback?.durationSec}s`,
  );
  check(
    'and what is playing, read off the device',
    playback?.playback?.title === 'The Long Dark' && playback?.playback?.source === 'Netflix',
    `${playback?.playback?.title} on ${playback?.playback?.source}`,
  );
  check('and knows it is playing rather than paused', playback?.playback?.paused === false);

  // It follows, rather than reporting the first reading forever.
  positionMs = 800_000;
  await wait(2500);
  const moved = seen.all.filter((m) => m.type === 'playback').at(-1);
  check(
    'the position follows the device',
    Math.abs((moved?.playback?.positionSec ?? 0) - 800) < 1,
    `${moved?.playback?.positionSec}s`,
  );

  // --- The device goes away ----------------------------------------------------
  //
  // §6.42's staleness bug in a different costume: a stream that has stopped must not look
  // like a paused one. Here the bridge polls, gets nothing, and has to say so.
  reachable = false;
  const before = seen.since();
  const ended = await seen.next('playbackEnded');
  check('a device that stops answering is reported, not frozen', !!ended, JSON.stringify(ended ?? {}));
  check(
    'and no further position is claimed for it',
    seen.after(before, 'playback').every((m) => m.at <= (ended?.at ?? 0)),
  );
  reachable = true;

  // --- Unsubscribing -----------------------------------------------------------
  app.send(JSON.stringify({ type: 'unsubscribe' }));
  await wait(1500);
  const quiet = seen.since();
  await wait(2500);
  check(
    'unsubscribing stops the polling',
    seen.after(quiet, 'playback').length === 0 && seen.after(quiet, 'playbackEnded').length === 0,
    `${seen.after(quiet, 'playback').length} more readings`,
  );

  // --- A command for something that is not there -------------------------------
  app.send(JSON.stringify({ type: 'command', deviceId: 'roku:203.0.113.9', command: 'play' }));
  const unknown = await seen.next('error');
  check('a command for an unknown device is refused, not swallowed', unknown?.code === 'no-device', JSON.stringify(unknown ?? {}));

  // --- MPRIS, as far as it can be taken here ------------------------------------
  //
  // A laptop rather than a television: MPRIS is a D-Bus interface, which is why the
  // bridge stayed useful after the phone learned to reach a Roku directly. There is no
  // media player on this bus and no way to register one without a D-Bus binding, so what
  // can be checked is the half that has never been exercised at all — that the `gdbus`
  // command line the transport builds is accepted by a real `gdbus` against a real bus,
  // and that its output parses. An empty bus must come back as no players, not as a
  // throw. §7 keeps the rest.
  const mpris = new MprisAdapter(gdbusMprisTransport);
  let discovered;
  let threw;
  try {
    discovered = await mpris.discover();
  } catch (error) {
    threw = error;
  }
  check(
    'the MPRIS transport speaks to a real session bus',
    !threw,
    threw ? String(threw).slice(0, 140) : 'no error',
  );
  check(
    'and reports no players rather than failing, on a bus that has none',
    Array.isArray(discovered) && discovered.length === 0,
    JSON.stringify(discovered ?? null),
  );

  // --- The bridge said what it was doing ----------------------------------------
  check(
    'the bridge reported its connection and what it found',
    /Connected to relay/.test(bridgeLog.join('')) && /Found \d+ device/.test(bridgeLog.join('')),
    bridgeLog.join('').trim().split('\n').slice(0, 3).join(' | '),
  );
} catch (error) {
  check('end-to-end run completed', false, String(error).slice(0, 300));
  console.log('\n--- bridge output ---\n' + (globalThis.__bridgeLog ?? []).join(''));
} finally {
  try {
    app?.close();
  } catch {
    /* never opened */
  }
  for (const child of started) child.kill('SIGKILL');
  ssdp.close();
  roku.close();
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);

/**
 * The extension, running in a real browser, for the first time.
 *
 * Everything about this directory used to be argued from the source: `content.ts`,
 * `background.ts` and `inject.ts` had no tests and had never been loaded into anything.
 * Only `parse.ts` and `adapters.ts` were covered, from the app package — the pure
 * functions, which are the easy half.
 *
 * What that left unchecked is the part that spans three sides: a content script reads a
 * page, sends a message to a service worker, which stores it and answers a second
 * content script on the Reviewies origin, which posts it into the page for
 * `app/src/watching/extensionBridge.ts` to receive. Each side is individually plausible
 * and nothing had ever put them together. §6.27 found sync failing in exactly that
 * shape.
 *
 * So this loads the built extension into the pinned Chromium and drives it. Two fixture
 * pages, both served by route interception rather than a server:
 *
 *  - `https://www.netflix.com/watch/1`, so the manifest's own match patterns decide
 *    whether the content script runs. Injecting it by hand would test the script and
 *    not the manifest, and the manifest is where this extension has been wrong before.
 *  - `http://localhost:4173/`, which is what the second content script matches.
 *
 * The video is real. `findVideo` requires a duration over 120 seconds and
 * `Number.isFinite`, so a stubbed element would not survive it — and a property defined
 * on the page's wrapper is not visible to a content script's isolated world anyway. A
 * WAV of silence is generated here instead: three and a half minutes of it, which
 * decodes to a genuine duration and seeks like anything else.
 *
 * What this cannot do is meet a real streaming site. The selectors in `adapters.ts` stay
 * unverified (§7); a fixture written from the same assumptions as the adapter proves
 * they agree with each other, which is not the same as being right.
 */
import { chromium } from 'playwright';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EXT = new URL('./dist/', import.meta.url).pathname.replace(/\/$/, '');

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

/** Silence, as a WAV, long enough to be an episode as far as the adapters are concerned. */
function silence(seconds = 210, rate = 8000) {
  const bytes = seconds * rate * 2; // 16-bit mono
  const buffer = Buffer.alloc(44 + bytes);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + bytes, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16); // PCM header length
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28); // byte rate
  buffer.writeUInt16LE(2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write('data', 36);
  buffer.writeUInt32LE(bytes, 40);
  // Signed 16-bit, so silence really is zero and `Buffer.alloc` has already written it.
  return buffer;
}

/**
 * A player page shaped the way the netflix adapter expects to find one.
 *
 * The title is in the page title *as well*, because that is the fallback path, and
 * having both here means a run cannot tell us the selectors worked when it was really
 * reading `document.title`. The assertion below distinguishes them by using an on-screen
 * title the page title does not contain.
 */
const PLAYER = `<!doctype html>
<meta charset="utf-8">
<title>Watch something — Netflix</title>
<div data-uia="video-title"><h4>The Long Dark</h4><span>S1:E4 Deep Cold</span></div>
<video id="v" src="/silence.wav" preload="auto"></video>`;

const BROWSE = `<!doctype html>
<meta charset="utf-8">
<title>Browse — Netflix</title>
<h1>Browse</h1>`;

const APP = `<!doctype html>
<meta charset="utf-8">
<title>Reviewies</title>
<script>
  window.__received = [];
  window.__watched = [];
  addEventListener('message', (e) => {
    if (e.data && e.data.type === 'reviewies:playback') window.__received.push(e.data.payload);
    if (e.data && e.data.type === 'reviewies:watched') window.__watched.push(e.data.payload);
  });
</script>
<h1>Reviewies</h1>`;

const profile = mkdtempSync(join(tmpdir(), 'reviewies-ext-'));
const context = await chromium.launchPersistentContext(profile, {
  executablePath:
    process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: [
    `--disable-extensions-except=${EXT}`,
    `--load-extension=${EXT}`,
    // The fixture plays rather than seeks. `route.fulfill` answers with a plain 200 and
    // no range support, so Chromium reports the media as unseekable and `currentTime =
    // 90` is silently refused — which is a property of this harness and not of the
    // extension, and worth writing down because it looks exactly like a bug in the
    // content script.
    '--autoplay-policy=no-user-gesture-required',
    '--mute-audio',
  ],
  headless: true,
  viewport: { width: 1280, height: 720 },
});

const wav = silence();

/**
 * Everything on the streaming origin, including the bytes of the video.
 *
 * One handler rather than a specific route beside a broad one: Playwright matches the
 * most recently registered route first, so a `**` added after a `/silence.wav` swallows
 * it and the video never loads.
 *
 * The media is answered with range support by hand. A plain 200 leaves Chromium
 * reporting the file as unseekable, so `currentTime = 190` is silently refused — which
 * looks exactly like a broken content script and is a property of the harness. Serving
 * it from a real server instead does not work either: the page is https and a local
 * server is not, so it is blocked as mixed content.
 */
await context.route('https://www.netflix.com/**', (route) => {
  const url = route.request().url();

  if (url.endsWith('/silence.wav')) {
    const range = /bytes=(\d+)-(\d*)/.exec(route.request().headers().range ?? '');
    if (!range) {
      return route.fulfill({
        status: 200,
        headers: { 'content-type': 'audio/wav', 'accept-ranges': 'bytes' },
        body: wav,
      });
    }
    const start = Number(range[1]);
    const end = range[2] ? Number(range[2]) : wav.length - 1;
    return route.fulfill({
      status: 206,
      headers: {
        'content-type': 'audio/wav',
        'accept-ranges': 'bytes',
        'content-range': `bytes ${start}-${end}/${wav.length}`,
      },
      body: wav.subarray(start, end + 1),
    });
  }

  // Anything that is not the player is the browse page: a real site has pages with no
  // video on them, and leaving the player is how playback stops.
  return route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: url.includes('/watch/') ? PLAYER : BROWSE,
  });
});
await context.route('http://localhost:4173/**', (route) =>
  route.fulfill({ status: 200, contentType: 'text/html', body: APP }),
);

try {
  // --- The service worker starts at all ----------------------------------------
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15000 });
  check('the service worker registers', !!worker, worker?.url() ?? '');

  // --- The content script runs, and reads the page -----------------------------
  const player = await context.newPage();
  await player.goto('https://www.netflix.com/watch/1', { waitUntil: 'load' });
  // Wait for the media to have a duration; until then `findVideo` rejects it, which is
  // the behaviour that keeps an advert from being scrobbled as an episode.
  await player.waitForFunction(() => {
    const v = document.querySelector('video');
    return v && Number.isFinite(v.duration) && v.duration > 120;
  }, { timeout: 20000 });
  const duration = await player.evaluate(() => document.querySelector('video').duration);
  check('the fixture video has a real duration', duration > 120, `${duration.toFixed(1)}s`);

  // Play it, and wait for the element to confirm it has moved rather than assuming:
  // asserting on a position the page has not reached yet would be a check measuring
  // this script's own timing.
  await player.evaluate(() => document.querySelector('video').play());
  await player.waitForFunction(() => document.querySelector('video').currentTime > 1.5, {
    timeout: 15000,
  });
  // Long enough for the ten-second heartbeat, not just the first send. Ordinary playback
  // advances about a second per poll, which `changedMeaningfully` correctly declines to
  // report — so the only thing that moves the stored position during steady viewing is
  // the heartbeat, and waiting less than one would be measuring the first reading and
  // calling it the live one.
  await player.waitForTimeout(13000);

  const state = await worker.evaluate(async () => (await chrome.storage.local.get('state')).state);
  check('the service worker was told what is playing', !!state?.detection, JSON.stringify(state?.detection ?? {}));
  check(
    'and it read the on-screen title, not the page title',
    state?.detection?.show === 'The Long Dark',
    `show=${state?.detection?.show}`,
  );
  check(
    'and the season and episode off the label beside it',
    state?.detection?.season === 1 && state?.detection?.episode === 4,
    `S${state?.detection?.season}E${state?.detection?.episode}`,
  );
  check(
    'and the position off the video element, moving',
    (state?.detection?.positionSec ?? 0) > 1 && state.detection.positionSec < 60,
    `${state?.detection?.positionSec}s`,
  );
  check(
    'and knows it is playing rather than paused',
    state?.detection?.paused === false,
    `paused=${state?.detection?.paused}`,
  );
  check('and named the site it came from', state?.detection?.site === 'netflix', state?.detection?.site);

  // --- The app page receives it ------------------------------------------------
  const app = await context.newPage();
  await app.goto('http://localhost:4173/', { waitUntil: 'load' });
  await app.waitForFunction(() => window.__received.length > 0, { timeout: 15000 });
  const [update] = await app.evaluate(() => window.__received);

  check('the app page receives a playback update', !!update, JSON.stringify(update ?? {}));
  // The shape app/src/watching/extensionBridge.ts actually accepts, asserted field by
  // field rather than by eye: this is the contract that had three sides and no test.
  check(
    'in milliseconds, which is what the app reads',
    Number.isFinite(update?.positionMs) && update.positionMs > 1000 && update.positionMs < 60_000,
    `${update?.positionMs}ms`,
  );
  check(
    'with a duration and a paused flag',
    Number.isFinite(update?.durationMs) && update.durationMs > 120_000 && typeof update?.paused === 'boolean',
    `${update?.durationMs}ms paused=${update?.paused}`,
  );
  check(
    'and a timestamp, so the app can tell a stale reading',
    Number.isFinite(update?.at) && Math.abs(Date.now() - update.at) < 60_000,
  );
  check(
    'carrying the episode, so a show in another tab cannot drag the timeline',
    update?.season === 1 && update?.episode === 4,
    `S${update?.season}E${update?.episode}`,
  );

  // --- Finishing an episode ----------------------------------------------------
  //
  // The half that never worked. The extension has computed `isWatched` since it shipped
  // and POSTed the result to a URL configured on an options page —
  // `https://your-reviewies-instance/api/playback` — which no Reviewies instance serves.
  // On the deployed origin the SPA rewrite answers that path with `index.html` and a
  // 200, so the fetch resolved and nothing was recorded. §6.42 deleted the endpoint and
  // sent the watch down the channel that already works.
  //
  // Seeking is why the media is served with range support above: reaching ninety per
  // cent by playing would take three minutes of real time.
  await player.evaluate(() => {
    const v = document.querySelector('video');
    v.currentTime = v.duration * 0.95;
  });
  await player.waitForFunction(() => document.querySelector('video').currentTime > 190, {
    timeout: 15000,
  });
  await app.waitForFunction(() => window.__watched.length > 0, { timeout: 15000 });
  const watched = await app.evaluate(() => window.__watched);

  check('finishing an episode reaches the app', watched.length > 0, JSON.stringify(watched[0] ?? {}));
  check(
    'naming the show, season and episode',
    watched[0]?.show === 'The Long Dark' && watched[0]?.season === 1 && watched[0]?.episode === 4,
    `${watched[0]?.show} S${watched[0]?.season}E${watched[0]?.episode}`,
  );
  check(
    'and when it was seen, so the watch is not stamped whenever a tab opened',
    Number.isFinite(watched[0]?.at) && Math.abs(Date.now() - watched[0].at) < 60_000,
  );
  // Once, not once a second. The poll repeats every second while the position stays past
  // the threshold, and a watch recorded on each pass would be a rewatch per second.
  await app.waitForTimeout(4000);
  const repeated = await app.evaluate(() => window.__watched.length);
  check('and it is delivered once, not once a poll', repeated === 1, `${repeated} deliveries`);

  // --- Stopping ----------------------------------------------------------------
  //
  // Leaving the player does not send anything. The content script's `playback-stopped`
  // only fires when a page that *had* a detection loses it; a navigation destroys that
  // script instead, so the worker keeps its last reading and the app page keeps being
  // handed it. That is by design — the worker is allowed to be evicted and must not
  // depend on a farewell — and it is why the app ignores readings older than fifteen
  // seconds.
  //
  // Which only works if the timestamp ages. It did not: this poll stamped `Date.now()`
  // on a stored reading every second, so a stopped stream looked like a live paused one
  // forever. What is checked here is that the timestamp the app receives stops advancing
  // once nothing is watching, because that is the whole of the protection.
  await player.goto('https://www.netflix.com/browse', { waitUntil: 'load' });
  await player.waitForTimeout(3000);
  await app.evaluate(() => {
    window.__received.length = 0;
  });
  await app.waitForFunction(() => window.__received.length >= 2, { timeout: 15000 });
  const afterLeaving = await app.evaluate(() => window.__received);
  const stamps = new Set(afterLeaving.map((u) => u.at));
  check(
    'the timestamp stops advancing once nothing is playing',
    stamps.size === 1,
    `${afterLeaving.length} readings, ${stamps.size} distinct timestamps`,
  );
  check(
    'so the app sees them as stale within its fifteen seconds',
    Date.now() - afterLeaving[afterLeaving.length - 1].at < 60_000 &&
      afterLeaving[afterLeaving.length - 1].at < Date.now() - 2000,
    `${Math.round((Date.now() - afterLeaving[afterLeaving.length - 1].at) / 1000)}s old`,
  );

  // --- The permissions it asks for ---------------------------------------------
  // Measured from the running extension rather than read off the manifest, so this
  // says what Chrome granted and not what somebody meant to ask for.
  const granted = await worker.evaluate(() => chrome.runtime.getManifest().permissions ?? []);
  check(
    'it asks for storage and nothing it does not use',
    JSON.stringify([...granted].sort()) === JSON.stringify(['storage']),
    granted.join(', ') || 'none',
  );
} catch (error) {
  check('extension smoke completed', false, String(error).slice(0, 300));
} finally {
  await context.close();
  rmSync(profile, { recursive: true, force: true });
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);

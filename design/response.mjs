/**
 * How long the app takes to answer a press.
 *
 * ## Why this exists
 *
 * Nothing in this repository has ever measured it. The only timing in any suite is
 * `app/smoke.mjs`'s `ms < 20000`, which is a hang detector — and it waits a fixed 500ms
 * *before* stopping the clock, so it does not even measure the thing it prints. Every
 * other instrument here answers what a screen *looks* like. `design/cost.mjs` models how
 * long a task takes a *person*, and says in its own header that no number in it came from
 * a device. This is the other half: how long the machine takes.
 *
 * ## The bound, and where it actually comes from
 *
 * **100ms**, and the number is perceptual rather than conventional. Feedback within about
 * 100ms of an input is perceived as *caused by* that input; past it, the two come apart and
 * the press becomes something you did and then waited on. That figure is the human half of
 * how Google derived the INP metric.
 *
 * **Not 200ms**, which is the published "good" INP threshold and is a different kind of
 * number. Google chose 200 by taking the ~100ms perceptual finding and then calibrating
 * against CrUX so that a majority of origins could actually reach it at the 75th percentile
 * — an ecosystem-achievability allowance, not a claim about perception. A local-first app
 * has no business spending it: it is not waiting on a server, and the whole argument for
 * `docs/design/direction.md`'s stance is that the data is already on the device. Taking the
 * web's allowance for network latency, in an app with no network in the loop, would be
 * borrowing an excuse we do not have.
 *
 * **And not 400ms.** The "Doherty threshold" is cited everywhere as 400ms and **that number
 * is not in the paper**. Doherty & Thadani (IBM Systems Journal, 1982) measured 0.3s, 0.6s
 * and 1.0s and found productivity rising *more than* in proportion as response time fell,
 * accelerating below one second — 180 transactions an hour at 3s against 371 at 0.3s. What
 * the paper supports is a **sub-second** budget. It also studied IBM programmers and chip
 * designers on mainframes doing repetitive transactions, which is not somebody marking an
 * episode watched, so it is cited here for the shape of the curve and not for a threshold.
 *
 * ## What is measured
 *
 * `PerformanceObserver` with `type: 'event'` and `durationThreshold: 0`, which is the API
 * INP itself is computed from. Each entry gives `startTime` (the input), `processingStart`
 * and `processingEnd` (the handler), and `duration` (input to the next paint, rounded to
 * 8ms by the platform). The split matters: a long `duration` with a short handler is a
 * rendering cost, and the two want different repairs.
 *
 * ## What `duration` is not, and it is the more interesting half
 *
 * It runs to the **next paint**, not to the paint that contains what you asked for. Press a
 * row that opens a title page and the browser paints the new route almost immediately — the
 * masthead, the empty shell, a *Loading…* — and stops the clock there. Every reading below is
 * therefore an answer to *"did something happen"*, which is the question the perceptual bound
 * is about, and **not** to *"did the thing I asked for arrive"*.
 *
 * So `settled` is measured beside it: the press, then the wall clock until the screen stops
 * changing, sampled against the rendered text. That is the second question, it is the one
 * "smooth" usually means, and the two numbers can disagree by a lot. A screen that answers in
 * 16ms and settles in 900ms is honest about being busy and still slow to use; one that
 * answers in 16ms and settles in 20 is finished before you look up.
 *
 * Run: `node design/response.mjs [--url http://localhost:PORT] [--json]`
 */

import { chromiumOptions } from '../scripts/browser.mjs';
import { chromium } from 'playwright';
import { CSV } from './library.mjs';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const BASE = args[args.indexOf('--url') + 1]?.startsWith('http')
  ? args[args.indexOf('--url') + 1]
  : 'http://localhost:4320';

/** The perceptual bound. See the header for why this is not 200 and not 400. */
const FEELS_CAUSED = 100;

/**
 * The screens, and how many controls to press on each.
 *
 * **Discovered rather than listed, and that is a repair.** The first version of this file
 * carried seven hand-written needles — `/^Mark .* watched/i`, `Last 30 days`, `Open …` — and
 * reached **two of seven**. Five were names I had invented rather than read; the real ones
 * are `/^Mark .* watched$/` and `30 days`. A list of selectors somebody typed is a list of
 * things they believed, and it fails silently as *"nothing on the screen matches"*, which
 * reads exactly like a missing control.
 *
 * So the instrument asks the screen. Every element the accessibility tree calls a control is
 * a candidate, and the ones actually pressed are named in the output by their announced name
 * — so the reading says what was measured rather than what was hoped for.
 *
 * `each` is capped because a press mutates: marking an episode removes its row, and pressing
 * twenty controls on one screen measures a cascade rather than a screen. The page is
 * re-navigated **between every press**, so each reading is of an interaction with a settled
 * screen rather than with whatever the last press left behind. That is slow and it is the
 * only honest way — `design/capture.mjs` learned the same thing the expensive way when its
 * press census emptied the shelf it was about to photograph.
 */
const SCREENS = [
  { on: '/', each: 5 },
  { on: '/?on=coming', each: 3 },
  { on: '/discover', each: 4 },
  { on: '/watchlist', each: 3 },
  { on: '/stats', each: 4 },
  { on: '/lists', each: 3 },
  { on: '/more', each: 3 },
];

const browser = await chromium.launch(chromiumOptions());
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

/*
 * Seeded from the same CSV the capture passes use, so this is judged on the same shows.
 *
 * An empty app has nothing to press, and a measurement of an empty app is a measurement of
 * nothing — which is not a hypothetical: the first run of this file invented a `localStorage`
 * key that does not exist, seeded nothing, and reported **2 of 7** interactions. It said so,
 * which is the only reason the run was not mistaken for an answer. The denominator is the
 * check on the instrument, and it earned its place on the first attempt.
 *
 * The needle is `Imported [1-9]\d* watches` and not the sentence, because "Imported 0
 * watches" satisfies a looser one and means everything below measures an empty screen.
 * §6.104, learned twice already in this directory.
 */
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.locator('input[type=file]').last().setInputFiles({
  name: 'episodes.csv',
  mimeType: 'text/csv',
  buffer: Buffer.from(CSV),
});
let landed = '';
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(500);
  landed = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  if (/Imported [1-9]\d* watches/.test(landed)) break;
}
if (!/Imported [1-9]\d* watches/.test(landed)) {
  console.error(`The library never landed — ${landed.slice(0, 140)}`);
  console.error('Everything below would be a measurement of an empty app. Stopping.');
  await browser.close();
  process.exit(1);
}

const readings = [];
const unreachable = [];

/** Install a fresh observer after the screen has settled, so a load is not folded into a press. */
const watch = (p) =>
  p.evaluate(() => {
    window.__events = [];
    window.__obs?.disconnect();
    window.__obs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        window.__events.push({
          name: e.name,
          duration: e.duration,
          handler: e.processingEnd - e.processingStart,
          waited: e.processingStart - e.startTime,
        });
      }
    });
    window.__obs.observe({ type: 'event', durationThreshold: 0 });
  });

let offered = 0;
for (const screen of SCREENS) {
  await page.goto(`${BASE}${screen.on}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  const controls = page.locator('button, [role=button], a[href], [role=radio], [role=link]');
  const count = await controls.count();
  offered += count;
  if (count === 0) {
    unreachable.push(`${screen.on}: no controls at all`);
    continue;
  }

  /*
   * Names first, in one pass, before anything is pressed — because a press can remove the
   * control that follows and an index taken before the mutation is an index into a page that
   * no longer exists. That is `pressReadings`' defect, avoided rather than rediscovered.
   */
  const names = [];
  for (let i = 0; i < count && names.length < screen.each; i++) {
    const el = controls.nth(i);
    const box = await el.boundingBox().catch(() => null);
    if (!box || box.width < 24 || box.height < 16) continue;
    const said = ((await el.getAttribute('aria-label')) || (await el.innerText().catch(() => '')) || '')
      .replace(/\s+/g, ' ')
      .trim();
    /*
     * The whole name, not a slice of it.
     *
     * This read `names.push(said.slice(0, 40))`, and the matcher below asks for
     * `{ name: said, exact: true }` — so every control whose accessible name ran past 40
     * characters was looked up under a string that could not equal it, failed, and was
     * filed as *"was there a moment ago and is not now"*. That line reads as a finding
     * about the app and is a fact about this file. `/more` contributed **zero** measured
     * interactions for that reason alone, and the run reported 18 rather than the 24 the
     * screens actually offer.
     *
     * Found by the mid-press instrument (§6.191) rather than by this file, which is the
     * point: nothing here could see it, because a control that is silently dropped leaves
     * no trace in a count of the controls that were not dropped. Truncation is for
     * printing, and printing happens at the bottom.
     */
    if (said) names.push(said);
  }

  for (const said of names) {
    await page.goto(`${BASE}${screen.on}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(900);
    await watch(page);

    const target = page.getByRole('button', { name: said, exact: true }).or(
      page.getByRole('link', { name: said, exact: true }),
    ).or(page.getByRole('radio', { name: said, exact: true })).first();
    if (!(await target.count())) {
      unreachable.push(`${screen.on}: "${said.slice(0, 60)}" was there a moment ago and is not now`);
      continue;
    }
    const pressedAt = Date.now();
    await target.click({ timeout: 5000 }).catch(() => {});

    /*
     * Settled: sample the rendered text until it stops changing twice in a row. Text rather
     * than a network-idle or an animation-frame count, because what a person is waiting for is
     * words appearing — and because a spinner that never stops would keep any frame-based
     * measure busy for ever while the screen is, to a reader, simply not finished.
     *
     * Capped, and the cap is reported rather than folded into the number: a screen still
     * changing at the cap has not settled, and calling that "1500ms" would be a measurement of
     * the cap.
     */
    const SETTLE_CAP = 3000;
    let last = '';
    let stable = 0;
    let settled = -1;
    while (Date.now() - pressedAt < SETTLE_CAP) {
      const now = await page.locator('body').innerText().catch(() => last);
      if (now === last) {
        stable += 1;
        if (stable >= 2) { settled = Date.now() - pressedAt; break; }
      } else {
        stable = 0;
        last = now;
      }
      await page.waitForTimeout(60);
    }

    await page.waitForTimeout(400);
    const events = await page.evaluate(() => window.__events ?? []);
    const pointer = events.filter((e) => /pointer|click|mouse/.test(e.name));
    if (pointer.length === 0) {
      unreachable.push(`${screen.on}: "${said.slice(0, 60)}" was pressed and the browser reported no interaction`);
      continue;
    }
    const worst = pointer.reduce((a, b) => (b.duration > a.duration ? b : a));
    readings.push({ on: screen.on, does: said, settled, cap: SETTLE_CAP, ...worst });
  }
}

await browser.close();

const slow = readings.filter((r) => r.duration > FEELS_CAUSED);

if (asJson) {
  console.log(JSON.stringify({ bound: FEELS_CAUSED, measured: readings.length, offered, unreachable, readings }, null, 2));
} else {
  console.log(`\nHow long the app takes to answer a press. Bound ${FEELS_CAUSED}ms — perceptual, not the`);
  console.log(`published 200ms INP allowance and not the 400ms nobody can find in Doherty.\n`);
  console.log(`  ${String(readings.length).padStart(2)} interactions measured across ${SCREENS.length} screens ` +
    `(${offered} controls offered)` + (unreachable.length ? `, ${unreachable.length} unreachable` : ''));
  if (readings.length === 0) {
    console.log('\n  NOTHING WAS MEASURED. That is not a result about the app; it is a broken run.');
  }
  console.log('');
  for (const r of readings.sort((a, b) => b.duration - a.duration)) {
    const flag = r.duration > FEELS_CAUSED ? ' ← past the bound' : '';
    console.log(
      `  ${String(Math.round(r.duration)).padStart(4)}ms answered  ` +
      `${r.settled < 0 ? `still moving at ${r.cap}ms` : `${String(r.settled).padStart(4)}ms settled`}  ` +
      `${r.on.padEnd(14)} ${r.does}${flag}`,
    );
  }
  for (const u of unreachable) console.log(`  ----   ${u}`);
  console.log('');
  if (slow.length) {
    console.error(`Presses the app does not answer within ${FEELS_CAUSED}ms:\n  ${slow.map((s) => `${s.does}: ${Math.round(s.duration)}ms`).join('\n  ')}`);
  }
  console.log(
    'A long `duration` with a short handler is a rendering cost; a long handler is work on the\n' +
    'main thread. The two want different repairs, which is why both are printed.\n',
  );
  /*
   * **The settle floor is this instrument's, not the app's.** Samples are 60ms apart and two
   * identical readings are required, so nothing can settle in under about 120ms however fast
   * it is, and the ~155ms end of the range is at that floor rather than measured. A number at
   * its instrument's floor is a *bound* — "no slower than this" — and reporting it as a value
   * is the shape §6.190 caught in `scrollTop 450` against a maximum of 450.
   *
   * It does not affect the conclusion, which is about the other end: nothing here is anywhere
   * near a bound a person would notice. Tightening the sampling would buy resolution on
   * numbers that are all already fast, which is why it has not been done.
   */
  const floor = 60 * 2;
  const atFloor = readings.filter((r) => r.settled >= 0 && r.settled < floor + 60).length;
  if (atFloor) {
    console.log(
      `  ${atFloor} of ${readings.length} settle readings are within one sample of this\n` +
      `  instrument's own ${floor}ms floor, so those are bounds rather than values.\n`,
    );
  }
}

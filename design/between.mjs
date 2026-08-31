/**
 * What the screen does between the press and the settle.
 *
 * ## Why this exists
 *
 * `design/response.mjs` measured how long the app takes to answer a press and found that
 * nothing comes near the perceptual bound — 16–24ms answered, 154–240ms settled, against
 * 100ms. Its own header says what that leaves open, and says it more sharply than this one
 * could: `duration` runs to the **next paint**, not to the paint containing what you asked
 * for, and `settled` only reports that the text stopped changing. **Neither says anything
 * about what happened in between**, and the in-between is what people mean by smooth.
 *
 * So this file measures the interval those two numbers bracket and never look inside. Three
 * channels, because there are three distinct ways an interval that is fast can still be bad:
 *
 *  1. **Shift** — something appears above what you are reading and pushes it down.
 *  2. **States** — how many distinct things get painted between the press and the answer.
 *  3. **Held** — what the control looks like while the finger is on it, on glass.
 *
 * Latency has been ruled out, so every number below is about a screen that is already fast.
 *
 * ## Channel 1: shift, and why the published threshold is not used
 *
 * The browser reports `layout-shift` entries with a `value` and `sources`. The published
 * Cumulative Layout Shift threshold is 0.1, and it is the same kind of number as INP's
 * 200ms: calibrated against CrUX so that a reachable share of origins can pass it, not
 * derived from what a shift does to a reader. `response.mjs`'s header refuses 200ms on
 * exactly that ground and this file refuses 0.1 on the same one.
 *
 * **And there is a second, harder reason, which is specific to what is being measured here.**
 * A `layout-shift` entry carries `hadRecentInput`, true when the shift lands within 500ms of
 * a discrete input, and CLS **excludes every one of those from the score**. The assumption is
 * that a shift after a press is a shift the person asked for. That assumption is exactly what
 * is in question: pressing a row asks for a title page, it does not ask for a banner to
 * appear over the list 140ms later and push it down. So the interval this file exists to
 * examine is, by construction, the interval CLS scores as zero. Every entry's flag is printed
 * rather than filtered, so the reading says which side of that line it fell on.
 *
 * **The bound used instead is a distance in pixels, argued from the product's own type.**
 * `value` is a dimensionless product of two viewport fractions and corresponds to nothing a
 * reader experiences. What a reader experiences is losing their place, and the unit of
 * losing your place is **a line of text**. This product's body line is `text.s14` at
 * `leading.l143` — 14 × 1.43 = **20.02px** — so a persistent element that moves 20px or more
 * has moved the line you were reading out from under your eye by at least a whole line, and
 * that is the bound. It is reported beside a second one for the other failure a shift causes:
 * `size.target` is 44, so a move of 22px or more can take a control out from under a finger
 * already descending. The line bound is the tighter of the two and is the one that decides.
 *
 * Both numbers come from `core/src/tokens.ts` and are read from it rather than typed here,
 * for the reason this directory keeps rediscovering: a constant copied is a constant that
 * drifts.
 *
 * ## Channel 2: states, and the bound is one
 *
 * A route that paints a blank shell, then a spinner, then content has three states where one
 * would do. The count is taken in a `requestAnimationFrame` loop, so a state is counted when
 * it is **painted** rather than when the DOM changed — two commits inside one frame are one
 * state, because one is what anybody saw.
 *
 * The bound is that the interval contains **the state you pressed from and the answer, and
 * nothing else**. Zero intermediate states. That is a strong bound and it is the right one
 * *here* specifically: `docs/design/direction.md` and `docs/design/seams.md` both argue from
 * the app reading an on-device database, and `app/src/wiring/screenStates.ts` already writes
 * the consequence down twice — `loading` on `/watchlist` and on `/stats` is marked `never`,
 * "Dexie resolves before the first paint locally". A networked app gets to show a process. An
 * app whose answer is already in memory is showing one by choice.
 *
 * The signature is `textContent`, which does not force layout, rather than `innerText`, which
 * does — a sampler that reflows the page every frame is measuring itself.
 *
 * ## Channel 3: held, and it has never been done on glass
 *
 * `core/src/ui/surface.ts` decided that a press sinks one ground step, and its header says
 * the two conventions were "measured by pressing, in `design/capture.mjs`, because a style
 * that exists only while the pointer is down is in no stylesheet a source clause can read".
 * `docs/design/seams.md` records that this was measured on an **export** and never on glass.
 * The failure that decision exists to prevent is named there as a number: a press that lands
 * on the colour the control is already painted is **1.000 — invisible**, "no feedback at all
 * on the highest-frequency gesture in the product".
 *
 * So: hold the real control down in the running app, composite the effective background
 * through any transparent ancestors, and report the contrast ratio between rest and held. The
 * bound is that it is not 1.000. A number is printed for every control either way, because
 * "the press is visible" and "nothing was pressed" are the two readings this repository has
 * most often confused.
 *
 * ## The denominator
 *
 * Every channel prints how many interactions it measured, not only how many were bad. Four
 * defects of that exact shape were found in this harness in one sprint. Three of them are
 * guarded against here explicitly:
 *
 *  - `frames` — total `requestAnimationFrame` ticks taken during the interval. A reading of
 *    "no intermediate states" from a sampler that ticked twice is a reading about the
 *    sampler. Under `MIN_FRAMES` the interaction is void and is counted as void.
 *  - `supported` — whether `layout-shift` is an entry type this browser observes at all. If
 *    it is not, "0 shifts" is a lie and the run refuses rather than printing a clean line.
 *  - `held` readings are counted separately from presses, because a control whose colour
 *    could not be sampled is not a control whose press is fine.
 *
 * Run: `node design/between.mjs [--url http://localhost:PORT] [--json]`
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromiumOptions } from '../scripts/browser.mjs';
import { chromium } from 'playwright';
import { CSV } from './library.mjs';
import { leading, size, text } from '../core/src/tokens.ts';
import { COPY } from '../core/src/copy.ts';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
/**
 * `--phone` reads the expo web export instead of the web app.
 *
 * **And what that reading is a reading of has to be said before any number is quoted from
 * it.** The export is `react-native-web`, which is not React Native: the DOM it emits, the
 * way `:active` and `Pressable` resolve to styles, and what the compositor does with them
 * are properties of that renderer, not of the app on a phone. This record already carries
 * six entries where a fact about one was written down as a fact about the product.
 *
 * So of the three channels, only **states** crosses. The count of distinct painted states
 * between a press and an answer is produced by the product's own component tree and its own
 * `useLive` — the same JavaScript runs on a device — and a screen that renders a loading
 * branch here renders one there. **Shift** and **held** do not cross and are printed under
 * `--phone` marked as such: a layout shift in the export is `react-native-web`'s flexbox
 * emitted as CSS, and a held colour is `Pressable`'s style function resolved by a DOM
 * renderer rather than by the platform's own press handling.
 */
const PHONE = args.includes('--phone');
const BASE = args[args.indexOf('--url') + 1]?.startsWith('http')
  ? args[args.indexOf('--url') + 1]
  : PHONE
    ? 'http://localhost:4481'
    : 'http://localhost:4480';

const ROOT = resolve(import.meta.dirname, '..');

/**
 * The bounds, derived rather than typed. See the header for the arguments.
 *
 * `LOSES_THE_LINE` is one line of body text: the size and the leading the product sets its
 * prose in. `MOVES_THE_TARGET` is half the house target, the distance past which a control
 * can leave a finger already on its way down.
 */
const LOSES_THE_LINE = text.s14 * leading.l143;
const MOVES_THE_TARGET = size.target / 2;
/** Painted states between the press and the answer, over and above the two ends. */
const EXTRA_STATES = 0;
/** A press that lands on the colour it started on. `surface.ts` names this failure as 1.000. */
const INVISIBLE = 1.0;
/**
 * How long a press has to look like something.
 *
 * The same perceptual bound `design/response.mjs` derives at length for the answer: feedback
 * within about 100ms is perceived as *caused by* the press. It applies here for the same
 * reason and with more force — the answer at least arrives eventually, whereas a press that
 * never changes colour has nothing arriving at all.
 */
const FEELS_CAUSED = 100;
/** Past this, nothing changed and the press is not late but absent. */
const PRESS_CAP = 250;

/** Below this many rAF ticks, the interval was not observed and the reading is void. */
const MIN_FRAMES = 6;
/** No painted change for this long, and the screen has settled. */
const QUIET_MS = 250;
const SETTLE_CAP = 3000;
/**
 * How long to keep watching **after** the screen has settled.
 *
 * This file had no such window and a plant walked straight through the gap: the same banner
 * that fails every channel at 140ms was moved to 800ms — after the settle, so after the
 * observers were torn down — and four presses landing on that screen reported it clean. An
 * instrument that stops at the settle can only ever say what happened before it, and
 * `design/response.mjs` stops there too, so between them nothing in this repository could
 * see a screen that moves once you have started reading it.
 *
 * That case is not milder than the ones above; it is worse. A screen still assembling is at
 * least visibly mid-transition. A screen that has stopped, been read for a third of a
 * second, and *then* moves has already told the reader it was finished.
 *
 * A second is not a proof of quiescence and is not offered as one — a change at 3s would
 * still escape. It is what an extra second per interaction costs, stated, and the bound
 * appears in the output so nobody reads a clean line as "nothing ever happens later".
 */
const AFTER_MS = 1000;
/**
 * One frame of grace on the settle boundary.
 *
 * The settle is a frame, and a shift stamped a millisecond after that frame is that frame,
 * not a second event. Without this, `/stats`'s figure changing from `2.5h` to `1.9 days`
 * reported itself as "the screen moved again after it had settled" at **+1ms and 0px** —
 * a zero-pixel move, one millisecond late, on a screen that had done exactly what was asked
 * of it. That is the guard failing on a correct change, so the rule moved and not the file.
 * A repaint has to be a frame clear of the settle, and a shift has to actually shift.
 */
const AFTER_GRACE = 32;

/**
 * The screens, and how many controls to press on each — the same seven and the same caps as
 * `design/response.mjs`, so the two instruments are reading the same interactions from
 * opposite ends. Its header has why the controls are discovered from the accessibility tree
 * rather than listed, and why the page is re-navigated between every press.
 */
const PHONE_SCREENS = [
  { on: '/', each: 5 },
  { on: '/discover', each: 4 },
  { on: '/watchlist', each: 3 },
  { on: '/stats', each: 3 },
  { on: '/lists', each: 2 },
  { on: '/more', each: 4 },
];

const WEB_SCREENS = [
  { on: '/', each: 5 },
  { on: '/?on=coming', each: 3 },
  { on: '/discover', each: 4 },
  { on: '/watchlist', each: 3 },
  { on: '/stats', each: 4 },
  { on: '/lists', each: 3 },
  { on: '/more', each: 3 },
];

const SCREENS = PHONE ? PHONE_SCREENS : WEB_SCREENS;

/**
 * Which file draws a route, read off `App.tsx`'s own route table and import list.
 *
 * A failure that says "something shifted on /watchlist" is a failure somebody has to go and
 * find the file for. Derived rather than written down beside it, because a second list of
 * which screen is which file is a second thing to keep in step — the defect
 * `app/src/wiring/screenStates.ts` avoids by reading the same table.
 */
function screenFiles() {
  const src = readFileSync(resolve(ROOT, 'app/src/App.tsx'), 'utf8');
  const table = src.slice(src.indexOf('const ROUTES'), src.indexOf('/** Breaks this screen'));
  const imports = new Map();
  for (const [, names, from] of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*'([^']+)'/g)) {
    for (const name of names.split(',').map((n) => n.trim())) {
      if (name && from.startsWith('.')) imports.set(name, from);
    }
  }
  const files = new Map();
  for (const [, path, screen] of table.matchAll(/path: '([^']+)', screen: (\w+)/g)) {
    const from = imports.get(screen);
    files.set(path, from ? `app/src/${from.replace(/^\.\//, '')}.tsx` : `app/src/screens/${screen}.tsx`);
  }
  return files;
}
const FILES = PHONE ? new Map() : screenFiles();

/**
 * The words the product uses to say it is working, read from `core/src/copy.ts` rather than
 * typed here.
 *
 * `COPY.waiting`'s own header says these are six keys and not one because five of them name
 * what is being waited for. An intermediate state carrying one of them is a screen saying
 * *I am busy*; an intermediate state carrying none is a screen that reflowed for a reason it
 * did not tell anybody about. Those are different findings and the output separates them.
 */
const WAITING = Object.values(COPY.waiting);
/** The route a press was made *from*; a shift is drawn by whatever the app lands on. */
const fileFor = (route) => {
  const path = route.split('?')[0];
  if (!PHONE) {
    if (FILES.has(path)) return FILES.get(path);
    /*
     * A concrete address against a parameterised route. `/title/:id` is how the table spells
     * it and `/title/tmdb%3Atv%3A2` is where a press actually lands, so an exact lookup
     * returns nothing and the failure names the URL back at the reader instead of a file —
     * which is the same half-repair as blaming the route pressed *from*. `:param` matches one
     * segment; `*` is the catch-all and is tried only when nothing else matched.
     */
    for (const [pattern, file] of FILES) {
      if (pattern === '*' || !pattern.includes(':')) continue;
      const parts = pattern.split('/');
      const here = path.split('/');
      if (parts.length !== here.length) continue;
      if (parts.every((seg, i) => seg.startsWith(':') || seg === here[i])) return file;
    }
    return FILES.get('*') ?? path;
  }
  /*
   * The phone's screens are its filenames — expo-router — so the route *is* the file, give
   * or take the group segment. `screenStates.ts`'s `phoneRoutes` walks `mobile/app` the same
   * way and for the same reason: a second table mapping one to the other is a second thing
   * to keep in step.
   */
  const TABS = ['/', '/discover', '/watchlist', '/more'];
  const leaf = path === '/' ? 'index' : path.slice(1);
  return TABS.includes(path) ? `mobile/app/(tabs)/${leaf}.tsx` : `mobile/app/${leaf}.tsx`;
};

const browser = await chromium.launch(chromiumOptions());
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

/**
 * `layout-shift` has to be an entry type this browser actually observes.
 *
 * Asked before anything is measured and refused loudly rather than folded into the readings,
 * because an unsupported entry type produces no entries and no error — which is
 * indistinguishable from a page that never shifted. That is the `0 inset rules over a page
 * with no rules at all` shape, and it is the one this channel is most exposed to.
 */
const supported = await page.evaluate(() =>
  (PerformanceObserver.supportedEntryTypes ?? []).includes('layout-shift'),
);
if (!supported) {
  console.error('This browser does not observe `layout-shift`. Every shift reading below would');
  console.error('be a zero that means "nothing was watched". Stopping rather than printing them.');
  await browser.close();
  process.exit(1);
}

/*
 * Seeded from the same CSV the capture passes use — `design/response.mjs` has the whole
 * argument, including the run that invented a `localStorage` key and measured an empty app.
 * The needle is `Imported [1-9]\d* watches` for the reason given there.
 */
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
if (PHONE) {
  /*
   * The phone has no `input[type=file]` to reach for: its import goes through the system
   * document picker, which `app/src/wiring/screenStates.ts` records as undriveable from the
   * web export. `design/capture.mjs` seeds it by answering the file chooser the export
   * opens and pressing the migration offer, which is how somebody actually would, and this
   * follows it rather than inventing a second way in.
   */
  await page.waitForTimeout(1500);
  page.on('filechooser', (c) =>
    c.setFiles({ name: 'episodes.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) }).catch(() => {}),
  );
  await page.getByRole('button', { name: /Import from TV Time/i }).click().catch(() => {});
} else {
  await page.locator('input[type=file]').last().setInputFiles({
    name: 'episodes.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(CSV),
  });
}
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

/**
 * And then wait for **matching** to finish, which is not the same as the import landing.
 *
 * This file did not, and the first phone run showed what that costs. Pressing *Out now* on
 * Up Next reported seven intermediate states and eleven repaints spread over a second after
 * the settle, with rows swapping between two shows — and every one of them was the matcher
 * still writing the library in the background. Those are a screen that is *genuinely busy*,
 * which is §6.80's third state, and filing them as unsmooth would have been this instrument
 * blaming the app for the harness's own seed.
 *
 * `MatchImports` runs while it is mounted, and it is mounted on Up Next — so this is
 * `design/capture.mjs`'s wait, which learned the same thing from the other end when three
 * sprints of design review were taken across a spread of half-matched libraries. The
 * condition is the sentence going away and staying away, and the ceiling is reported rather
 * than passed over: a run that gives up here is measuring an app still writing to itself and
 * says so.
 */
let matching = 'never looked';
let stuckFor = 0;
for (let i = 0; i < 40; i++) {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  const body = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ');
  /*
   * `Matching… 3 of 12` is work in flight. `Matching… 0 of 0` is the same panel with
   * nothing to do, and it stays on the screen — so a needle that matches the word rather
   * than the counts reads a finished library as a busy one and warns about every run. The
   * denominator has to be non-zero for there to be anything to wait for.
   */
  const line = body.match(/Matching… \d+ of [1-9]\d*[^.]*\.?/)?.[0] ?? '';
  /*
   * Absent, **or stopped moving** — `design/capture.mjs`'s own condition, and the second
   * half is not optional. On the phone export there is no metadata token, so the matcher
   * reports `Matching… 0 of 0, 0 matched so far.` and stays there for ever: a loop waiting
   * for that line to disappear waits for ever and then declares the app busy. Progress that
   * has stopped is a finished run in every way this instrument cares about.
   */
  stuckFor = line === matching ? stuckFor + 1 : 0;
  matching = line;
  if (!line && !/imported shows? still need matching/i.test(body) && i > 1) {
    matching = '';
    break;
  }
  if (stuckFor >= 4) break;
}
if (matching) {
  console.error(
    `The matcher stopped at "${matching}" rather than finishing, so the library below is only` +
      ' partly matched. Readings on screens it writes to may be of a busy screen.\n',
  );
}

/**
 * Arm the interval: one shift observer and one per-frame sampler, installed after the screen
 * has settled so that a route load is not folded into a press.
 *
 * The first frame is taken before the press, so `frames[0]` is what the reader was looking at
 * and the intermediate states are everything strictly between it and the last.
 */
const arm = (p) =>
  p.evaluate(() => {
    const B = (window.__between = { shifts: [], frames: [], ticks: 0, t0: performance.now() });

    const name = (node) => {
      if (!node || node.nodeType !== 1) return 'a node no longer in the document';
      const said = node.getAttribute?.('aria-label') || (node.textContent || '').trim();
      return `<${node.tagName.toLowerCase()}> ${said.replace(/\s+/g, ' ').slice(0, 48)}`.trim();
    };

    B.obs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        B.shifts.push({
          at: Math.round(e.startTime - B.t0),
          value: e.value,
          /* Printed, never filtered. The header has why: CLS discards exactly these. */
          hadRecentInput: e.hadRecentInput,
          sources: [...(e.sources ?? [])].map((s) => ({
            what: name(s.node),
            /* Where it started, so a thing that moved can be placed against the press. */
            fromY: Math.round(s.previousRect.y),
            movedY: Math.round(s.currentRect.y - s.previousRect.y),
            movedX: Math.round(s.currentRect.x - s.previousRect.x),
          })),
        });
      }
    });
    B.obs.observe({ type: 'layout-shift', buffered: false });

    /*
     * `textContent`, not `innerText`: `innerText` forces a reflow, and a sampler that
     * relayouts the page on every frame is measuring its own cost. The scroller is `<main>`
     * — `UpNext`'s `Present` scrolls the arriving screen through it — and its offset is
     * recorded beside the text because a screen that moves under you is an in-between
     * behaviour that `layout-shift` deliberately does not count, scrolling being excluded
     * from the metric by definition.
     */
    const scroller = () => document.querySelector('main') ?? document.scrollingElement;
    const sample = () => ({
      text: (document.body.textContent || '').replace(/\s+/g, ' ').trim(),
      scroll: Math.round(scroller()?.scrollTop ?? 0),
    });

    const tick = () => {
      if (B.stop) return;
      B.ticks += 1;
      const s = sample();
      const last = B.frames[B.frames.length - 1];
      if (!last || last.text !== s.text || last.scroll !== s.scroll) {
        if (B.frames.length < 200) {
          B.frames.push({ at: Math.round(performance.now() - B.t0), ...s });
        }
      }
      requestAnimationFrame(tick);
    };
    B.frames.push({ at: 0, ...sample() });
    requestAnimationFrame(tick);
  });

/** How long since the last painted change — asked from outside so the settle is not a timer. */
const quietFor = (p) =>
  p.evaluate(() => {
    const B = window.__between;
    return Math.round(performance.now() - B.t0 - (B.frames.at(-1)?.at ?? 0));
  });

const disarm = (p) =>
  p.evaluate(() => {
    const B = window.__between;
    B.stop = true;
    B.obs.disconnect();
    return { shifts: B.shifts, frames: B.frames, ticks: B.ticks };
  });

/**
 * The effective background of an element: its own, or the first ancestor's that is not
 * transparent.
 *
 * Necessary rather than fussy. The web's row target carries no fill at rest — `Row.tsx`'s
 * `TARGET` is `active:bg-ground-well` and nothing else — so `backgroundColor` at rest reads
 * `rgba(0, 0, 0, 0)`, and comparing that against a real colour would report every press in
 * the product as a change from nothing to something. What a person sees is the composite.
 *
 * **Passed as a function and never as a string.** Playwright evaluates a string argument as
 * an *expression*, so a function written as a template literal is evaluated to the function
 * object and serialises back as `undefined`. This channel's first run read `--` on 20 of 20
 * interactions for exactly that reason, and the only thing that made it a finding rather
 * than a clean page of dashes was `heldMeasured` being printed beside the presses.
 */
const HELD = (el) => {
  for (let n = el; n; n = n.parentElement) {
    const m = getComputedStyle(n).backgroundColor.match(/rgba?\(([^)]+)\)/);
    if (!m) continue;
    const [r, g, b, a = 1] = m[1].split(',').map((v) => parseFloat(v));
    if (a > 0) return [r, g, b];
  }
  return null;
};

/**
 * Watch a held control until its colour changes, and say how long that took.
 *
 * **This channel sampled two frames and stopped, and that was wrong in a way worth keeping
 * here.** On the web the pressed rule is a CSS pseudo-class — `Row.tsx`'s `active:bg-ground-well`
 * — so it lands in the same frame as the pointer event and two frames is generous. On the
 * phone it is a `Pressable` style function driven by React state, so it costs a render: the
 * export was measured going `rgb(19,17,20)` to `rgb(12,11,13)` — `ground` to `groundWell`,
 * `PRESS` exactly — somewhere **between 16ms and 50ms** after the pointer went down. A
 * two-frame window is about 32ms, so the first phone run of this file reported **13 of 13
 * presses invisible**, on a platform whose presses are all working. That is the fabricated
 * finding this task's own brief warns about, produced in one line of sampling code.
 *
 * So it waits, and it reports *when* rather than only *whether* — which is the better
 * reading anyway. A press has to look like something within the same window an answer does:
 * feedback inside about 100ms is perceived as caused by the press, which is the bound
 * `design/response.mjs` argues for at length. Past `PRESS_CAP` it is not late, it is absent.
 */
const PRESS_WATCH = (el, [rest, cap]) =>
  new Promise((resolve) => {
    const t0 = performance.now();
    const paint = (node) => {
      for (let n = node; n; n = n.parentElement) {
        const m = getComputedStyle(n).backgroundColor.match(/rgba?\(([^)]+)\)/);
        if (!m) continue;
        const [r, g, b, a = 1] = m[1].split(',').map((v) => parseFloat(v));
        if (a > 0) return [r, g, b];
      }
      return null;
    };
    const tick = () => {
      const now = paint(el);
      const at = performance.now() - t0;
      if (now && rest && now.join() !== rest.join()) return resolve({ down: now, at: Math.round(at) });
      if (at > cap) return resolve({ down: now, at: -1 });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

/** WCAG relative luminance, and the ratio `surface.ts`'s table is written in. */
const ratio = (a, b) => {
  if (!a || !b) return null;
  const lum = ([r, g, b2]) => {
    const f = (v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b2);
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const readings = [];
const unreachable = [];
const voided = [];
let offered = 0;

for (const screen of SCREENS) {
  await page.goto(`${BASE}${screen.on}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  const controls = page.locator(
    'button, [role=button], a[href], [role=radio], [role=link], [role=tab]',
  );
  const count = await controls.count();
  offered += count;
  if (count === 0) {
    unreachable.push(`${screen.on}: no controls at all`);
    continue;
  }

  /*
   * Names first, in one pass, before anything is pressed — `response.mjs` has why.
   *
   * **The whole name is kept and only the printing is shortened**, which is the one place
   * this file departs from that one. There the name is truncated to 40 characters and then
   * looked up again with `exact: true`, so every control whose announced name is longer than
   * forty characters fails to match and is filed as *"was there a moment ago and is not
   * now"*. That reads like a control that vanished and is in fact a control that was never
   * asked for: `/more` is a screen of long descriptive rows — "Lists — Film and television in
   * the same place" — and it contributes **zero** measured interactions to that run for this
   * reason alone, while reporting three unreachable ones. Keeping the full name and
   * shortening only at the point of printing recovers them.
   */
  const names = [];
  for (let i = 0; i < count && names.length < screen.each; i++) {
    const el = controls.nth(i);
    const box = await el.boundingBox().catch(() => null);
    if (!box || box.width < 24 || box.height < 16) continue;
    const said = ((await el.getAttribute('aria-label')) || (await el.innerText().catch(() => '')) || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (said) names.push(said);
  }

  for (const said of names) {
    /*
     * `tab` is in this list and is not in `response.mjs`'s.
     *
     * The phone's tab bar is drawn by expo-router's `Tabs`, which announces each destination
     * with `role="tab"` — so a lookup that tries only button, link and radio finds nothing and
     * files it as *"was there a moment ago and is not now"*. Four of the phone's five
     * unreachable readings were that, on the eight controls the product is navigated with,
     * and the web's equivalent is exactly the control this file has a finding about. A
     * cross-platform comparison that silently drops one platform's copy of the control is not
     * a comparison.
     */
    const find = (p) =>
      p
        .getByRole('button', { name: said, exact: true })
        .or(p.getByRole('link', { name: said, exact: true }))
        .or(p.getByRole('radio', { name: said, exact: true }))
        .or(p.getByRole('tab', { name: said, exact: true }))
        .first();

    // ---- channel 3, on its own visit: the control while it is held -----------------
    await page.goto(`${BASE}${screen.on}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(900);
    let held = null;
    const holdTarget = find(page);
    if (await holdTarget.count()) {
      const box = await holdTarget.boundingBox().catch(() => null);
      const handle = await holdTarget.elementHandle().catch(() => null);
      if (box && handle) {
        const rest = await handle.evaluate(HELD).catch(() => null);
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        /* The cap is handed in rather than written twice: it runs in the page and cannot
         * close over a constant out here, and a bound spelled in two places is a bound. */
        const watched = await handle.evaluate(PRESS_WATCH, [rest, PRESS_CAP]).catch(() => null);
        const down = watched?.down ?? null;
        const at = watched?.at ?? -1;
        await page.mouse.up();
        /*
         * The class list, so a dead press names the rule rather than a list of files it
         * might be in. `active:bg-ground-well` is written out in the renderer — Tailwind
         * compiles from source text — so the string here greps straight to the line.
         */
        const drawnBy = await handle
          .evaluate((el) => `<${el.tagName.toLowerCase()} class="${el.className}">`)
          .catch(() => null);
        held = { rest, down, at, ratio: ratio(rest, down), drawnBy };
      }
    }

    // ---- channels 1 and 2: the interval ------------------------------------------
    await page.goto(`${BASE}${screen.on}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(900);
    await arm(page);

    const target = find(page);
    if (!(await target.count())) {
      unreachable.push(`${screen.on}: "${said}" was there a moment ago and is not now`);
      continue;
    }
    /* The top edge of the thing pressed, so a shift below it can be told from one above. */
    const pressBox = await target.boundingBox().catch(() => null);
    const pressY = pressBox ? pressBox.y : 0;
    const pressedAt = Date.now();
    await target.click({ timeout: 5000 }).catch(() => {});

    let quiet = 0;
    while (Date.now() - pressedAt < SETTLE_CAP) {
      await page.waitForTimeout(50);
      quiet = await quietFor(page).catch(() => 0);
      if (quiet >= QUIET_MS) break;
    }
    const settled = Date.now() - pressedAt >= SETTLE_CAP ? -1 : Date.now() - pressedAt - quiet;

    /*
     * The page's own clock for where the settle fell, so "after" is decided on the same
     * timeline the frames and shifts are stamped on rather than on the wall clock out here.
     */
    const settleMark = await page.evaluate(() => window.__between.frames.at(-1)?.at ?? 0);
    await page.waitForTimeout(AFTER_MS);

    const { shifts, frames, ticks } = await disarm(page);
    /* The interval proper: everything up to and including the frame the screen settled on. */
    const upto = frames.filter((f) => f.at <= settleMark);
    /*
     * Where the press went. A shift is drawn by whatever the app **landed on**, and the
     * first version of this file named the route it was pressed *from* — so a press on
     * /watchlist that shifted Up Next's list blamed `Watchlist.tsx`. Naming the wrong file
     * is worse than naming none, which is why both are carried from here on.
     */
    const landedOn = new URL(page.url()).pathname + new URL(page.url()).search;

    /*
     * A reading from a sampler that barely ran is a reading about the sampler. Counted as
     * void rather than as clean — the distinction four instruments in this harness did not
     * make, and the reason `frames` is printed for every interaction below.
     */
    if (ticks < MIN_FRAMES) {
      voided.push(`${screen.on}: "${said}" — the sampler ticked ${ticks} times; nothing was observed`);
      continue;
    }

    readings.push({
      on: screen.on,
      landedOn,
      pressY: Math.round(pressY),
      does: said,
      settled,
      ticks,
      settleMark,
      /* Painted after the screen had stopped — see AFTER_MS for why this is its own line. */
      after: frames
        .filter((f) => f.at - settleMark > AFTER_GRACE)
        .map((f) => ({ at: f.at, since: f.at - settleMark, says: f.text.slice(0, 60) })),
      afterShifts: shifts
        .filter((sh) => sh.at - settleMark > AFTER_GRACE)
        .flatMap((sh) => sh.sources.map((x) => ({ at: sh.at, movedY: x.movedY, what: x.what })))
        .filter((x) => Math.abs(x.movedY) >= 1),
      /* Everything strictly between what you pressed from and what you ended on. */
      states: upto.length,
      /*
       * What the state *said*, not only how long it was. A count of intermediate states is
       * a number somebody still has to go and look up; the excerpt and the waiting word are
       * what make the honest/noise judgement readable off the output.
       */
      intermediate: upto.slice(1, -1).map((f, j) => ({
        at: f.at,
        /*
         * How long it was actually on the screen, which is the number that decides what
         * kind of finding it is. A `Loading…` that stands for 200ms is a screen saying it
         * is busy. The same word painted for a single frame is not a message at all — it is
         * too short to read, so it carries no information and only flickers. Without this
         * the two are one count and the judgement cannot be made from the output.
         */
        heldFor: upto[j + 2].at - f.at,
        chars: f.text.length,
        says: f.text.slice(0, 70),
        waiting: WAITING.find((w) => f.text.includes(w)) ?? null,
      })),
      scrolled: upto.at(-1).scroll - upto[0].scroll,
      /* Only the interval. The rest is `afterShifts`, which is a different finding. */
      shifts: shifts.filter((sh) => sh.at <= settleMark),
      held,
    });
  }
}

await browser.close();

/* ---- the judgements ------------------------------------------------------------- */

/**
 * The worst **vertical** move, and the worst horizontal one, kept apart.
 *
 * They were one number for one run of this file and that was wrong. Losing your place in a
 * paragraph is a vertical phenomenon: the line you were reading is somewhere else *down the
 * page*. A figure that changes from `2.5h` to `1.9 days` gets wider and nudges the label
 * beside it 29px sideways — which is not a reader losing their place, it is the answer they
 * asked for being longer than the last one. Flagging that was the guard failing on a correct
 * change, so the rule moved rather than the file. Horizontal movement is still printed,
 * because it is real and somebody may yet want a bound for it; it does not decide anything.
 */
const worstMove = (r) => Math.max(0, ...r.shifts.flatMap((s) => s.sources.map((x) => Math.abs(x.movedY))));
const worstSideways = (r) => Math.max(0, ...r.shifts.flatMap((s) => s.sources.map((x) => Math.abs(x.movedX))));
const totalValue = (r) => r.shifts.reduce((a, s) => a + s.value, 0);

/**
 * A disclosure, which is a shift somebody asked for.
 *
 * The distinction the raw measurement cannot make on its own, and the one the whole
 * honest/noise judgement turns on. Pressing *Tell me about* on the calendar opens the
 * notification options and pushes the next two months down 285px — the largest single shift
 * in this app — and that is not a defect: the person pressed a control asking to see
 * something, the something appeared where the control is, and everything that moved was
 * already **below** it. Nothing they were reading went anywhere.
 *
 * So: same route, and every element that moved started at or below the top of the control
 * that was pressed. Anything else — a shift on a route the press navigated *to*, or a shift
 * of something above the press — is content moving under a reader who did not ask.
 *
 * `- 1` for the pressed control itself, which is allowed to be one of the things that moves.
 */
const isDisclosure = (r) =>
  r.landedOn === r.on && r.shifts.every((s) => s.sources.every((x) => x.fromY >= r.pressY - 1));

const shifted = readings.filter((r) => worstMove(r) >= LOSES_THE_LINE && !isDisclosure(r));
const disclosed = readings.filter((r) => worstMove(r) >= LOSES_THE_LINE && isDisclosure(r));
const noisy = readings.filter((r) => r.intermediate.length > EXTRA_STATES);
const measuredHeld = readings.filter((r) => r.held?.rest != null);
/** Nothing happened at all inside `PRESS_CAP`, or it happened and was the same colour. */
const dead = measuredHeld.filter((r) => r.held.at < 0 || r.held.ratio <= INVISIBLE + 0.0005);
/** It happened, and too late to read as caused by the press. */
const late = measuredHeld.filter((r) => r.held.at >= FEELS_CAUSED && r.held.at <= PRESS_CAP);
const anyInput = readings.flatMap((r) => r.shifts).filter((s) => s.hadRecentInput).length;
const allShifts = readings.flatMap((r) => r.shifts).length;

if (asJson) {
  console.log(
    JSON.stringify(
      {
        bounds: {
          LOSES_THE_LINE,
          MOVES_THE_TARGET,
          EXTRA_STATES,
          INVISIBLE,
          FEELS_CAUSED,
          PRESS_CAP,
          QUIET_MS,
          AFTER_MS,
        },
        measured: readings.length,
        offered,
        heldMeasured: measuredHeld.length,
        unreachable,
        voided,
        readings,
      },
      null,
      2,
    ),
  );
} else {
  console.log(`\nWhat the screen does between the press and the settle.\n`);
  console.log(
    `  ${String(readings.length).padStart(2)} interactions measured across ${SCREENS.length} screens ` +
      `(${offered} controls offered)` +
      (unreachable.length ? `, ${unreachable.length} unreachable` : '') +
      (voided.length ? `, ${voided.length} void` : ''),
  );
  console.log(
    `  ${String(measuredHeld.length).padStart(2)} of those had a control whose held colour could be sampled` +
      (PHONE
        ? '\n     (--phone: the shift and held channels below are readings of react-native-web,\n' +
          '      not of the app on a device. Only the state count crosses — see the header.)'
        : ''),
  );
  console.log(
    `  ${String(allShifts).padStart(2)} layout shifts observed in total, of which ${anyInput} carry ` +
      `hadRecentInput\n     and are therefore invisible to CLS by definition — see the header`,
  );
  if (readings.length === 0) {
    console.log('\n  NOTHING WAS MEASURED. That is not a result about the app; it is a broken run.');
  }

  console.log(
    `\n  Bounds: a persistent element that moves ${LOSES_THE_LINE.toFixed(2)}px has moved a whole line of\n` +
      `  body text (text.s14 x leading.l143) out from under the eye; ${MOVES_THE_TARGET}px is half a\n` +
      `  target (size.target) and can take a control out from under a descending finger.\n` +
      `  Sideways movement is printed beside it and does not decide — see worstMove.\n` +
      `  ${EXTRA_STATES} intermediate painted states, on an app reading an on-device database.\n` +
      `  A press must not land on the colour it started on — surface.ts calls that 1.000.\n` +
      `  A shift wholly below a control you pressed, on the route you were already on, is a\n` +
      `  disclosure you asked for: reported, and it does not fail.\n` +
      `  Each screen is then watched for a further ${AFTER_MS}ms: anything painted or moved after it\n` +
      `  has settled is its own finding, and a change later than that is outside this file.\n`,
  );

  for (const r of readings.sort((a, b) => worstMove(b) - worstMove(a) || b.intermediate.length - a.intermediate.length)) {
    const moved = worstMove(r);
    const flags = [];
    if (moved >= LOSES_THE_LINE) {
      flags.push(isDisclosure(r) ? `opens ${moved}px (asked for)` : `shifts ${moved}px`);
    }
    if (r.intermediate.length > EXTRA_STATES) flags.push(`${r.intermediate.length} extra state(s)`);
    if (r.held?.rest != null && (r.held.at < 0 || r.held.ratio <= INVISIBLE + 0.0005)) {
      flags.push(r.held.at < 0 ? `press never changed in ${PRESS_CAP}ms` : 'press invisible');
    } else if (r.held?.at >= FEELS_CAUSED) flags.push(`press showed at ${r.held.at}ms`);
    /*
     * A screen still repainting at the cap has not settled, so its interval has no far end
     * and every count above is a count of the cap rather than of the interaction. Said, for
     * the reason `response.mjs` gives about its own cap: reporting a bound as a value is how
     * a measurement becomes a claim it cannot support.
     */
    if (r.settled < 0) flags.push(`never settled within ${SETTLE_CAP}ms`);
    console.log(
      `  ${String(r.intermediate.length).padStart(2)} between  ` +
        `${String(moved).padStart(4)}px down ${String(worstSideways(r)).padStart(3)}px across  ` +
        `${totalValue(r).toFixed(4)} CLS  ` +
        `${r.held?.rest == null ? '  --  ' : r.held.at < 0 ? ' none ' : `${r.held.ratio.toFixed(3)}`} ` +
        `at ${r.held?.rest == null ? ' -- ' : r.held.at < 0 ? ' -- ' : `${String(r.held.at).padStart(3)}ms`}  ` +
        `${String(r.ticks).padStart(3)}f  ` +
        `${r.on.padEnd(14)} ${r.does.slice(0, 44)}` +
        (flags.length ? `  <- ${flags.join(', ')}` : ''),
    );
    for (const i of r.intermediate) {
      console.log(
        `        +${String(i.at).padStart(4)}ms for ${String(i.heldFor).padStart(3)}ms  ` +
          `${i.waiting ? `[${i.waiting}] ` : ''}${i.says}`,
      );
    }
    for (const s of r.shifts) {
      for (const src of s.sources) {
        console.log(
          `        +${String(s.at).padStart(4)}ms  moved ${String(src.movedY).padStart(5)}px from y=` +
            `${String(src.fromY).padStart(4)}  ${src.what}`,
        );
      }
    }
  }
  for (const u of unreachable) console.log(`  ----   ${u}`);
  for (const v of voided) console.log(`  VOID   ${v}`);
  console.log('');

  const say = [];
  if (shifted.length) {
    say.push(
      `Content moved under the reader on ${shifted.length} of ${readings.length} interactions:\n  ` +
        shifted
          .map(
            (r) =>
              `${r.on} "${r.does}" -> ${r.landedOn} — ${worstMove(r)}px, ` +
              `drawn by ${fileFor(r.landedOn)}`,
          )
          .join('\n  '),
    );
  }
  if (disclosed.length) {
    console.log(
      'Shifts somebody asked for — a control pressed, and what it opened appeared below it, on\n' +
        'the route they were already on. Reported, not failed:\n  ' +
        disclosed
          .map((r) => `${r.on} "${r.does}" — ${worstMove(r)}px, all of it below y=${r.pressY}`)
          .join('\n  ') +
        '\n',
    );
  }
  if (noisy.length) {
    say.push(
      `Screens that painted something between the press and the answer, on ${noisy.length} of ` +
        `${readings.length}:\n  ` +
        noisy
          .map(
            (r) =>
              `${r.on} "${r.does}" -> ${r.landedOn} — ${r.intermediate.length} state(s), ` +
              `drawn by ${fileFor(r.landedOn)}\n         ` +
              r.intermediate
                .map(
                  (i) =>
                    `${i.at}ms for ${i.heldFor}ms: ` +
                    `${i.waiting ? `says "${i.waiting}"` : `"${i.says.slice(0, 40)}"`}`,
                )
                .join('\n         '),
          )
          .join('\n  '),
    );
  }
  if (dead.length) {
    say.push(
      `Presses that land on the colour they started on, on ${dead.length} of ` +
        `${measuredHeld.length} sampled:\n  ` +
        dead
          .map(
            (r) =>
              `${r.on} "${r.does.slice(0, 46)}" — rest rgb(${r.held.rest}), and ` +
              (r.held.at < 0
                ? `nothing changed in ${PRESS_CAP}ms`
                : `held at rgb(${r.held.down}), ratio ${r.held.ratio.toFixed(3)}`) +
              `\n         ${r.held.drawnBy}\n         ` +
              `the pressed rule belongs in that class, against core/src/ui/surface.ts's PRESS`,
          )
          .join('\n  '),
    );
  }
  const moved_after = readings.filter((r) => r.after.length || r.afterShifts.length);
  if (moved_after.length) {
    console.error(
      `Screens that changed again AFTER they had settled and been still for ${QUIET_MS}ms — the\n` +
        `reader has already been told the screen is finished. On ${moved_after.length} of ${readings.length}:\n  ` +
        moved_after
          .map(
            (r) =>
              `${r.on} "${r.does.slice(0, 40)}" -> ${r.landedOn}, drawn by ${fileFor(r.landedOn)}\n         ` +
              [
                ...r.after.map((a) => `+${a.since}ms after the settle it repainted: "${a.says.slice(0, 44)}"`),
                ...r.afterShifts.map((a) => `+${a.at - r.settleMark}ms after the settle, ${a.movedY}px: ${a.what}`),
              ].join('\n         '),
          )
          .join('\n  '),
    );
    console.log('');
  }
  if (late.length) {
    console.log(
      `Presses whose feedback arrived after the ${FEELS_CAUSED}ms a press is read as having caused,\n` +
        `on ${late.length} of ${measuredHeld.length} sampled:\n  ` +
        late.map((r) => `${r.on} "${r.does.slice(0, 46)}" — ${r.held.at}ms`).join('\n  ') +
        '\n',
    );
  }
  if (say.length) {
    console.error(say.join('\n\n'));
    console.log('');
  } else {
    console.log(
      'Nothing moved a line, nothing was painted in between, and every sampled press changed\n' +
        'colour. On this build, over these interactions, the interval is empty — which is what\n' +
        'the two ends already suggested and what nothing had checked.\n',
    );
  }
}

process.exitCode =
  shifted.length || noisy.length || dead.length || readings.some((r) => r.after.length || r.afterShifts.length)
    ? 1
    : 0;

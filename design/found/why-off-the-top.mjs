/**
 * Why three of the phone's thirty-three shots — and two of each web theme's twelve — are
 * taken most of a screen down, and whether anything but the harness can reach that.
 *
 * Both denominators counted rather than remembered. The phone: a full `capture.mjs` run on
 * this build files **33** shots, **14** of which are the top of a longer screen and **3** of
 * which are not at the top — `03-upnext`, `00-caughtup-upnext` and `00-caughtup-finished`,
 * every one of them Up Next, every other shot at 0. Counted from the per-shot log lines and
 * not from the pass's own summary, which is printed with eight shots still to come and so
 * reports `10` and `1`. The web: `capture-web.mjs` files ten routes, `06-stats-year` and
 * `11-remote` per theme — twelve a pass, twenty-four in the run — of which `01-upnext` and
 * `11-remote` are off the top in both themes, and `11-remote` arrives at `/`, so both are
 * Up Next as well.
 *
 * ## The reading this exists to close
 *
 * §6.193 gave `design/shoot.mjs` an `at`, and the first run reported shots taken at a scroll
 * position nobody had asked for:
 *
 *   phone  03-upnext           3484 of 3500     16pt short of the end
 *   phone  00-caughtup-upnext  3484 of 3500     16pt short
 *   phone  00-caughtup-finished 1160 of 1176    16pt short
 *   web    dark-01-upnext      3795 of 3891     96pt short
 *   web    dark-11-remote      3795 of 3891     96pt short
 *
 * Five shots, three libraries, three browser contexts, two platforms, four runs, and every
 * one of them exactly its platform's own constant short of the foot. `shoot.mjs`'s header
 * recorded it as an open question and wrote down the one story it had already killed — the
 * closed `RemoteDrawer`, whose `scrollHeight` equals its `clientHeight` — leaving the number
 * unattributed. An unattributed number in this directory is how the last three retractions
 * in the record happened.
 *
 * ## What it reports, and why each line is here rather than a paragraph
 *
 * The suspicion worth killing is that the walk creates the position — a click Playwright
 * scrolled into view, a page not put back, a foot shot that leaked into the next route. So
 * this reaches the screen the way a person does and touches nothing: one load, no press, no
 * fill, no reveal, and a **timeline** of the scroller's `scrollTop` sampled from the moment
 * the document is asked for. A position that appears while nothing is driving the page is
 * the page's own.
 *
 * Then, on that one element:
 *
 * - `scrollTop of max`, so no number is written down without the bound it is compared
 *   against — `architecture.md` §8 recorded `scrollTop 450` on a page whose `maxScroll` was
 *   also 450, and `shoot.mjs`'s own header is about that retraction.
 * - **which child's top the scroll landed on**, found by walking the content and reporting
 *   the offsets rather than by trusting a class name. `scrollTop === marker.offsetTop` is
 *   the difference between an arrival that was honoured and one the browser refused and
 *   clamped, and those two produce numbers that look alike.
 * - the **trailing room below the marker**, which is the arithmetic of the residual: the
 *   distance left under a marker parked at the top of the frame is
 *   `markerHeight + trailingPad - frame`, so a marker floored at exactly one frame leaves
 *   the container's own bottom padding and nothing else.
 * - what is at `y = 0` in the picture, and where the screen's own name got to.
 *
 * Run against either platform's build — the reading is the same reading, which is
 * `shoot.mjs`'s point:
 *
 *   npx serve mobile/dist -p 4470 --no-clipboard
 *   BASE=http://localhost:4470 node design/found/why-off-the-top.mjs
 *
 *   cd app && npx vite preview --port 4471 --strictPort
 *   BASE=http://localhost:4471 WEB=1 node design/found/why-off-the-top.mjs
 */
import { chromium } from 'playwright';
import { chromiumOptions } from '../../scripts/browser.mjs';
import { CSV } from '../library.mjs';

const BASE = process.env.BASE ?? 'http://localhost:4470';
const WEB = !!process.env.WEB;
const OUT = new URL('./', import.meta.url).pathname;
/** The two windows the two passes shoot in. */
const VIEW = WEB ? { width: 420, height: 900 } : { width: 390, height: 844 };

/** One sample of the scroller: where it is, how far it goes, and what it is. */
const WHERE = () => {
  const { best, most } = (() => {
    const inThePicture = (el) => {
      const r = el.getBoundingClientRect();
      return (
        r.width > 0 && r.height > 0 &&
        r.right > 0 && r.bottom > 0 && r.left < window.innerWidth && r.top < window.innerHeight
      );
    };
    let best = null;
    let most = 0;
    for (const el of document.querySelectorAll('*')) {
      const over = el.scrollHeight - el.clientHeight;
      if (over > most && el.clientHeight > 200 && getComputedStyle(el).overflowY !== 'visible' && inThePicture(el)) {
        most = over;
        best = el;
      }
    }
    return { best, most };
  })();
  if (!best) return { none: true };
  return { at: Math.round(best.scrollTop), max: Math.round(most), frame: best.clientHeight };
};

const browser = await chromium.launch(chromiumOptions());
const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2 });
const page = await context.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));

/* Seed the library the two passes seed, out of the same file, and by the same door. */
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
if (WEB) {
  await page.locator('input[type=file]').last().setInputFiles({
    name: 'episodes.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV),
  });
} else {
  page.on('filechooser', (c) =>
    c.setFiles({ name: 'episodes.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) }).catch(() => {}));
  await page.getByRole('button', { name: /Import from TV Time/i }).click();
}
let landed = '';
for (let i = 0; i < 60; i++) {
  await page.waitForTimeout(500);
  landed = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  if (/Imported [1-9]\d* watches/.test(landed)) break;
}
if (!/Imported [1-9]\d* watches/.test(landed)) {
  console.error(`The import never landed, so everything below is a measurement of an empty app.\n  ${landed.slice(0, 160)}`);
  process.exitCode = 1;
}

/*
 * And then the matching, which is the condition the control run of §6.193 was missing.
 *
 * `UpNext`'s `Present` asks for the history as `writing ? [] : getHistory()` — so while an
 * import is in flight *or* rows are still unmatched the past is empty, and a screen with no
 * past has no floor under its present, nothing to scroll past and no overflow at all. That
 * is exactly the state the first control reading was taken in: this probe's own first run
 * photographed `Match imported shows` still on the screen, the heading at the top, and
 * `nothing on the page overflows` at every sample out to ten seconds. Which is a true
 * reading of a *different* screen from the one the passes photograph, and reporting it as
 * "a fresh load does not do this" is how the number stayed unattributed.
 *
 * So: matched first, by the app's own sentence, and then the load.
 */
for (let attempt = 0; attempt < 12; attempt++) {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const match = page.getByRole('button', { name: /^Match imported shows$/i }).first();
  if (await match.count()) await match.click().catch(() => {});
  for (let i = 0; i < 60; i++) {
    const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    if (!/Matching…|Match imported shows|Bringing in/.test(body)) break;
    await page.waitForTimeout(1000);
  }
  await page.goto(`${BASE}/more`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const tracked = Number(
    (await page.locator('body').innerText()).replace(/\s+/g, ' ').match(/Tracked (\d+)/)?.[1] ?? 0,
  );
  if (tracked >= 3) break;
  if (attempt === 11) {
    console.error(`Only ${tracked} of 3 shows ever matched, so the past below is not the past the passes photograph.`);
    process.exitCode = 1;
  }
}

/*
 * And now the load a person performs: one navigation, and then nothing at all.
 *
 * No press, no fill, no `reveal`, no foot shot. Playwright's only contact with the page
 * between the `goto` and the last sample is `evaluate`, which does not scroll anything —
 * so any position that appears in the timeline below arrived without a hand on it.
 */
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
const timeline = [];
const started = Date.now();
for (const wait of [0, 200, 300, 500, 500, 500, 1000, 1000, 1000, 1000, 2000, 2000]) {
  await page.waitForTimeout(wait);
  timeline.push({ ms: Date.now() - started, ...(await page.evaluate(WHERE)) });
}

console.log(`\n${WEB ? 'web' : 'phone'} — Up Next at ${BASE}/, ${VIEW.width}x${VIEW.height}, untouched`);
console.log('  when      where');
for (const t of timeline) {
  console.log(`  ${String(t.ms).padStart(5)}ms   ` + (t.none ? 'nothing on the page overflows' : `at ${t.at} of ${t.max} (frame ${t.frame})`));
}

/*
 * What the position is *of*: the child of the scrolled content whose top the scroll came to
 * rest on, reported with the two neighbours either side of it so that "it landed on this
 * one" is a reading rather than an assertion.
 */
const anatomy = await page.evaluate(() => {
  const inThePicture = (el) => {
    const r = el.getBoundingClientRect();
    return (
      r.width > 0 && r.height > 0 &&
      r.right > 0 && r.bottom > 0 && r.left < window.innerWidth && r.top < window.innerHeight
    );
  };
  let best = null;
  let most = 0;
  for (const el of document.querySelectorAll('*')) {
    const over = el.scrollHeight - el.clientHeight;
    if (over > most && el.clientHeight > 200 && getComputedStyle(el).overflowY !== 'visible' && inThePicture(el)) {
      most = over;
      best = el;
    }
  }
  if (!best) return null;
  const named = (el) =>
    `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''} "${(el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 44)}"`;

  // The content view: on `react-native-web` a `ScrollView` is a scroller with one child.
  const content = best.children.length === 1 ? best.firstElementChild : best;
  const rows = [...content.children].map((el) => ({
    top: Math.round(el.getBoundingClientRect().top - content.getBoundingClientRect().top),
    height: Math.round(el.getBoundingClientRect().height),
    what: named(el),
  }));
  const cs = getComputedStyle(content);
  const at = Math.round(best.scrollTop);
  // Every element in the document whose top sits exactly where the scroll came to rest.
  const landedOn = [];
  for (const el of best.querySelectorAll('*')) {
    const top = Math.round(el.getBoundingClientRect().top - content.getBoundingClientRect().top);
    if (Math.abs(top - at) <= 1 && el.getBoundingClientRect().height > 40) {
      landedOn.push({ top, height: Math.round(el.getBoundingClientRect().height), what: named(el) });
    }
  }
  // What a reader of the photograph is looking at, and where the screen's own name went.
  const topOfPicture = document.elementFromPoint(Math.round(window.innerWidth / 2), 4);
  const heading = [...document.querySelectorAll('*')].find(
    (el) => el.children.length === 0 && /^Up Next$/.test((el.textContent ?? '').trim()),
  );
  return {
    scroller: named(best),
    at,
    max: Math.round(most),
    frame: best.clientHeight,
    contentHeight: Math.round(content.getBoundingClientRect().height),
    padBottom: cs.paddingBottom,
    padTop: cs.paddingTop,
    rows,
    landedOn,
    topOfPicture: topOfPicture ? named(topOfPicture) : 'nothing',
    headingTop: heading ? Math.round(heading.getBoundingClientRect().top) : null,
  };
});

if (!anatomy) {
  console.log('\n  Nothing on the page overflows, so there is no arrival to explain.');
} else {
  console.log(`\n  scroller       ${anatomy.scroller}`);
  console.log(`  came to rest   ${anatomy.at} of a possible ${anatomy.max}, in a ${anatomy.frame}pt frame`);
  console.log(`  left below     ${anatomy.max - anatomy.at}pt`);
  console.log(`  content pad    top ${anatomy.padTop}, bottom ${anatomy.padBottom}`);
  console.log('  the blocks of the column, and where each begins:');
  for (const r of anatomy.rows) console.log(`    ${String(r.top).padStart(5)} +${String(r.height).padStart(4)}  ${r.what}`);
  console.log(`  what begins exactly at ${anatomy.at}:`);
  for (const r of anatomy.landedOn) console.log(`    ${String(r.top).padStart(5)} +${String(r.height).padStart(4)}  ${r.what}`);
  if (!anatomy.landedOn.length) console.log('    nothing — the scroll is not the top of any block, so it was clamped rather than honoured');
  console.log(`  at y=0 in the picture   ${anatomy.topOfPicture}`);
  console.log(`  the screen's own name   ${anatomy.headingTop === null ? 'not in the document' : `${anatomy.headingTop}pt from the top of the window`}`);
}

await page.screenshot({ path: `${OUT}off-the-top-${WEB ? 'web' : 'phone'}.png` });
console.log(`\n  photographed as design/found/off-the-top-${WEB ? 'web' : 'phone'}.png`);

/**
 * And the clause, because a probe that only prints is a probe nobody re-runs.
 *
 * ## What is checked, and why it is these two things
 *
 * Up Next's arrival is *supposed* to leave the screen most of a column down — that is the
 * whole finding above, and a clause objecting to a non-zero `at` would be the overfiring
 * guard §6.190 corrected three of. What can go wrong is the arrival being **refused**, and
 * the record already holds one reading of that written down as a success:
 * `architecture.md` §8's `scrollTop 450` on a page whose `maxScroll` was also 450.
 *
 * So, two measurements, neither of which reads the thing that renders the floor:
 *
 * 1. **It did not come to rest at its own end.** `at === max` is what a column that ignored
 *    the request entirely produces, and it is indistinguishable from an honoured arrival in
 *    any reading that does not carry the bound.
 * 2. **Something a frame tall begins exactly where it came to rest.** `scrollIntoView` and
 *    `scrollTo` are requests a browser honours only while a frame of content remains below
 *    the target; the floor under the present is what makes the request answerable, and the
 *    observable consequence is a block at the top of the frame that is at least as tall as
 *    the frame. Derived from the laid-out page rather than from `min-h-dvh` or
 *    `minHeight: frame`, because a check that reads the token the subject renders from
 *    moves with it — `wrongWay`'s lesson, §6.185.
 *
 * ## Measured, not imagined: what it costs when it is missing
 *
 * Planted by deleting the floor from `app/src/screens/UpNext.tsx` — `past?.length &&
 * String(past.length).length > 9999`, semantically dead and type-clean, so `npx tsc -b core
 * app mobile` stays at 0 and the plant is a plant. Rebuilt and run:
 *
 *   came to rest   3265 of a possible 3265, in a 900pt frame
 *   left below     0pt
 *   at y=0         span "Hollow Crown Saga"     — a row of the **past**, not the present
 *
 * The screen clamps at the foot of its own history with the present entirely below the
 * fold. **This file, one clause shorter, printed all of that and exited 0.** That is the
 * gap, and it is the reason the clause is here rather than in the paragraph above it.
 *
 * ## What it still cannot see
 *
 * A floor on the **wrong** block satisfies both measurements. Move the frame-height floor
 * onto the last row of the past and scroll to that instead, and the column comes to rest
 * short of its end on a block a frame tall, with the present still off the bottom — and
 * this passes. Distinguishing those needs the *identity* of the block, which means naming
 * content, which is the 2-of-7. The limit is written down rather than papered over.
 */
if (anatomy) {
  const complaints = [];
  if (anatomy.at > 0 && anatomy.at === anatomy.max) {
    complaints.push(
      `the column came to rest at ${anatomy.at} of a possible ${anatomy.max} — its own end, ` +
        'which is where a column that ignored the arrival entirely would also be',
    );
  }
  if (anatomy.at > 0 && !anatomy.landedOn.some((r) => r.height >= anatomy.frame)) {
    complaints.push(
      `nothing a frame tall (${anatomy.frame}pt) begins at ${anatomy.at}, where the column came ` +
        `to rest — the tallest block that does is ${Math.max(0, ...anatomy.landedOn.map((r) => r.height))}pt, ` +
        'so there was no trailing room and the arrival was clamped rather than honoured',
    );
  }
  if (complaints.length) {
    console.error(`\n  Up Next's arrival is not being honoured:\n    ${complaints.join('\n    ')}`);
    process.exitCode = 1;
  }
}

await browser.close();

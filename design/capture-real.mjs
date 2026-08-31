import { chromium } from 'playwright';
import { chromiumOptions } from '../scripts/browser.mjs';
import { longerScreens, offTheTop, shoot, unusedGround } from './shoot.mjs';
import { mkdirSync } from 'node:fs';
import { FILM, SHOWS, manifest, track } from './realLibrary.mjs';

/**
 * The same phone app, photographed against **real** TMDB.
 *
 * ## What this is for
 *
 * Every other pass in this directory photographs `FixtureProvider`: five titles of two or
 * three short words, `Episode {n}` for every episode name, one-sentence overviews, and no
 * artwork at all — the fixture supplies no `posterUrl`, so **every poster in the entire
 * design record is the two-letter fallback**. Thirty-odd sprints of design review have
 * judged a set of screens none of whose content resembles what a person will put in them.
 *
 * The token has been in `.env` the whole time and all three design scripts blank it. That
 * was a real decision — determinism, because the fixture pass asserts specific titles — and
 * it justified keeping that pass, not having only it. §6.151.
 *
 * ## Why it asserts almost nothing
 *
 * The other passes have `MUST_SHOW` clauses naming content. This one cannot: its content is
 * whatever TMDB said when the snapshot was taken, and pinning a screenshot to an overview
 * somebody may re-write is a clause that fails for the wrong reason.
 *
 * What it *does* refuse is the failure §6.146 spent a sprint on — **a shot of the thing not
 * being there**. Every screen must carry the title it was walked to, and the run says
 * plainly what it could not reach. That is the floor: this pass exists to be looked at, and
 * a picture of an empty screen is not a picture of the design.
 */

const OUT = new URL('./real-screens/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

/*
 * Overridable, exactly as `capture-web-real.mjs`'s own `BASE` is and for the reason that
 * file states: *"a worktree running beside others cannot take them, and a pass that can only
 * run on two fixed ports is a pass that cannot be run twice at once."* The default stays the
 * port `npm run design:real` serves on, so the npm script is unchanged.
 *
 * This one was the last of the real-data passes still pinned. Two agents on one machine each
 * needing 4204 is not a hypothetical — it is what a sprint of three worktrees is.
 */
const BASE = process.env.BASE ?? 'http://localhost:4204';

const browser = await chromium.launch(chromiumOptions());
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));

const problems = [];
const scrolls = [];

/*
 * The shot, from `design/shoot.mjs`. §6.160.
 *
 * Its comment used to read *"the same shot-and-measure `capture.mjs` does"* and it was the
 * furthest of the five from that: where the others took the **tallest** overflowing element,
 * this took the **first** one in document order, with no floor on its height at all. On a
 * screen whose first scroller is a chip row, that reports the chip row — and this is the pass
 * that photographs 1,220-episode title pages, where the number is the whole point (#191).
 * Nobody chose that; it is what four copies of one act do while nobody is reading all four.
 *
 * `settle: 700`, which is this pass's own wait and shorter than the fixture pass's 1200
 * because it runs against a local snapshot rather than a build that is still deciding.
 */
const shot = (name, mustContain) =>
  shoot(page, { out: OUT, name, mustContain, problems, scrolls, settle: 700 });

console.log(`Photographing against a snapshot of real TMDB — ${manifest.titles.length} titles.`);

for (const show of SHOWS) {
  try {
    await track(page, BASE, show.name);
  } catch (e) {
    problems.push(`could not track ${show.name}: ${e.message.split('\n')[0].slice(0, 80)}`);
  }
}

// Search, with a real result on it — the longest title in the library, deliberately.
const LONGEST = [...SHOWS].sort((a, b) => b.name.length - a.name.length)[0];
await page.goto(`${BASE}/discover`, { waitUntil: 'networkidle' });
await page.getByPlaceholder('Shows, films, anime…').fill(LONGEST.name);
await page.waitForTimeout(2500);
await shot('r1-search-long-title', LONGEST.name);

// A film, which is the other row shape.
if (FILM) {
  await page.goto(`${BASE}/discover`, { waitUntil: 'networkidle' });
  await page.getByPlaceholder('Shows, films, anime…').fill(FILM.name);
  await page.waitForTimeout(2500);
  await shot('r2-search-film', FILM.name);
}

await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
await shot('r3-upnext');

await page.goto(`${BASE}/(tabs)/discover`, { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
const shelf = await shot('r4-discover');

/*
 * And the box turned over, which is the half of the shelf no real-data pass has ever seen.
 *
 * `design/screens/05-discover-back.png` is the only photograph of a back in the record and
 * it is a fixture one: `FixtureProvider`'s overviews are **one sentence**, so `BOX.backLines`
 * — a six-line clamp, written for a paragraph — has never had a paragraph put in it. Nor has
 * `boxFacts`, whose whole argument is that it says *less* when `seasonCount` and `runtimeMin`
 * are not cached, and which the fixture always feeds.
 *
 * The front is the same shape either way, so a back beside its neighbours' fronts is the
 * only shot that can answer whether it reads as the other side of one object.
 *
 * `More about …` is `COPY.controls.turnOver`, so the press is named by the contract the
 * renderer is built from rather than by a class or a position on the page.
 */
await page.goto(`${BASE}/(tabs)/discover`, { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
try {
  await page.getByRole('button', { name: /^More about / }).first().click({ timeout: 15000 });
  await page.waitForTimeout(700);
  const turned = await shot('r4-discover-back', 'Track');

  /*
   * And how far the shelf scrolls, before and after, which is the only instrument that can
   * see this one.
   *
   * The web's grid gives a turned-over box its row's height for nothing — the back is
   * `h-full` — and the phone lays its shelf out with `flexWrap`, which has no such thing.
   * `mobile/src/ui/Browse.tsx` had a floor for that, written when the back was **shorter**
   * than its neighbours and the row collapsed; the floor was the plate's height, 260 points
   * of a 304-point front, so it sat under the thing it was matching and could not bind. With
   * a real synopsis in it the back had gone the other way and this pass measured it: 2720pt
   * of shelf against 2746, twenty-six points appearing under the thumb that pressed it.
   *
   * Two photographs could not have shown that. They are the same shelf a fold apart, and the
   * difference is a number at the bottom of a column neither frame contains — which is
   * `architecture.md` §8's whole subject, and why the shots and the readings are taken by the
   * same act.
   *
   * Exactly equal, not a tolerance: both numbers come from the same content in the same
   * browser at the same width, and anything at all between them is a row that changed height.
   */
  if (turned !== shelf) {
    problems.push(
      `mobile/src/ui/Browse.tsx: turning a box over moved the shelf — r4-discover scrolls ` +
        `${shelf}pt against r4-discover-back's ${turned}, a difference of ` +
        `${turned - shelf}pt. A back is the front turned over and is exactly as tall as it.`,
    );
  } else {
    console.log(`  the shelf holds still when a box turns over: ${shelf}pt either way`);
  }

  /*
   * And the other half of the same repair, which the shelf's own height cannot see.
   *
   * A back that is exactly as tall as its front and still clamps its paragraph to a number
   * would pass the clause above and be the defect this sprint was about: `BOX.backLines: 6`
   * left 40 to 90 points of the web's panel empty under a cut synopsis, and on this platform
   * the same six lines were 26 points *more* than the box had. So the ground is read here
   * too, by the reading `design/shoot.mjs` holds for both passes — `react-native-web` draws
   * `numberOfLines` as the same `-webkit-line-clamp` the web writes, so it is one act.
   *
   * The bound is one line of ground under a paragraph that was cut. Less is the remainder of
   * a division; more is a line the box had room for and did not draw.
   */

  /*
   * The shot is filed; now turn the rest of the shelf over, because one back is one
   * synopsis and one synopsis is not a distribution. Whether a paragraph was cut depends on
   * how long the provider wrote it, so a single box can report a clean ground on a build
   * where every other box on the screen is truncating.
   *
   * After the shutter rather than before it, so the photograph is still of one back among
   * its neighbours' fronts — which is the only arrangement that answers whether it reads as
   * the other side of one object.
   */
  for (const button of await page.getByRole('button', { name: /^More about / }).all()) {
    await button.click({ timeout: 4000 }).catch(() => {});
  }
  await page.waitForTimeout(600);
  const grounds = await unusedGround(page);

  const halfDrawn = grounds.filter((g) => g.truncated && g.overhang > 1);
  if (halfDrawn.length) {
    problems.push(
      `mobile/src/ui/Browse.tsx: ${halfDrawn.length} of ${grounds.length} backs draw part of the ` +
        `line after the one they clamped to — ` +
        halfDrawn
          .slice(0, 3)
          .map((g) => `${g.name} overhangs its ${g.shown} lines by ${g.overhang}pt`)
          .join('; ') +
        `. A clamped paragraph's box is the lines it shows.`,
    );
  }
  const wasted = grounds.filter((g) => g.truncated && g.spare >= g.line);
  if (wasted.length) {
    problems.push(
      `mobile/src/ui/Browse.tsx: ${wasted.length} of ${grounds.length} backs cut the synopsis ` +
        `with room left under it — ` +
        wasted
          .slice(0, 3)
          .map((g) => `${g.name} shows ${g.shown} of ${g.wants} lines with ${g.spare}pt spare`)
          .join('; ') +
        `. The bound is one ${Math.round(grounds[0]?.line ?? 0)}pt line.`,
    );
  } else if (grounds.length) {
    const most = grounds.reduce((a, b) => (b.spare > a.spare ? b : a));
    console.log(
      `  ${grounds.length} backs: the most ground any of them leaves under a cut paragraph ` +
        `is ${most.truncated ? most.spare : 0}pt, against a ${Math.round(most.line)}pt line`,
    );
  } else {
    problems.push(
      `design/capture-real.mjs: no turned-over box had a synopsis this measure could find, ` +
        `so it has nothing to say about the clamp and must not report a clean one. It looks ` +
        `for the flex child of a back panel that clips its overflow.`,
    );
  }
} catch (e) {
  problems.push(`could not turn a box over: ${e.message.split('\n')[0].slice(0, 80)}`);
}

await page.goto(`${BASE}/?on=coming`, { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
await shot('r5-calendar');

// A title page each, because the episode list is where real names and real counts land.
for (const show of SHOWS) {
  try {
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.getByText(show.name, { exact: true }).first().click({ timeout: 15000 });
    await page.waitForTimeout(2500);
    await shot(`r6-title-${show.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24)}`, show.name);
  } catch (e) {
    problems.push(`could not open ${show.name}: ${e.message.split('\n')[0].slice(0, 80)}`);
  }
}

const longer = longerScreens(scrolls);
if (longer) console.log(`\nshots that are the top of a longer screen: ${longer}`);
const off = offTheTop(scrolls);
if (off) console.log(`shots not taken at the top of their screen: ${off}`);
if (problems.length) {
  console.error(`\nreal pass could not photograph what it went for:\n  ${problems.join('\n  ')}`);
  process.exitCode = 1;
}
await browser.close();

import { chromium } from 'playwright';
import { chromiumOptions } from '../scripts/browser.mjs';
import { longerScreens, shoot } from './shoot.mjs';
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
await shot('r4-discover');

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
if (problems.length) {
  console.error(`\nreal pass could not photograph what it went for:\n  ${problems.join('\n  ')}`);
  process.exitCode = 1;
}
await browser.close();

import { chromium } from 'playwright';
import { chromiumOptions } from '../scripts/browser.mjs';
import { mkdirSync } from 'node:fs';

/**
 * Screenshots of every screen of the phone app, for design review.
 *
 * A design pass judges what the app looks like, so it has to look at the app rather
 * than at the code — and at a *full* one, since every screen has an empty state that
 * flatters it. Run this before every design sprint; stale screenshots are how a review
 * ends up describing a version nobody is using.
 *
 *   cd mobile && npx expo export --platform web && npx serve dist -p 4200 &
 *   node design/capture.mjs
 */

const OUT = new URL('./screens/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
/**
 * A library, built here rather than read from a file somebody has to already have.
 *
 * **The names are the fixture provider's, and that is the whole point.** This seeded
 * twelve real shows — Dark, Andor, Chernobyl — into a build with no TMDB token, whose
 * provider knows four invented titles and nothing else. So matching ran, matched nothing,
 * and every screenshot below was of an app with an empty library: three sprints of design
 * review looking at the empty state, which is exactly the failure this file's header warns
 * about arriving by a different door. An import only fills a library if the provider it is
 * matched against has heard of what is in it.
 *
 * Two seasons of the two multi-season fixtures and a run of the long one: enough rows that
 * a list is judged as a list, and enough left unwatched that Up Next has something in it.
 */
const CSV = (() => {
  const rows = ['show,season,number,name,seen,seen_date,times_watched,air_date,show_id,episode_id'];
  // Season lengths as `core/src/metadata/fixtures.ts` declares them, so nothing is
  // imported that the provider will then say does not exist.
  const shows = [
    { name: 'The Long Dark', seasons: [8, 10] },
    { name: 'Kitchen Nightshift', seasons: [12] },
    { name: 'Hollow Crown Saga', seasons: [96] },
  ];
  shows.forEach((show, i) => {
    show.seasons.forEach((episodes, s) => {
      // Not the whole season: leaving the tail unwatched is what gives Up Next a row and
      // the title page something to cross off.
      for (let n = 1; n <= Math.max(1, episodes - 3); n++) {
        const d = `2024-03-${String((n % 28) + 1).padStart(2, '0')}`;
        rows.push(
          `${show.name},${s + 1},${n},Episode ${n},True,${d} 20:00:00,1,${d},${100 + i},${1000 + i * 200 + s * 100 + n}`,
        );
      }
    });
  });
  return rows.join('\n');
})();

const browser = await chromium.launch(chromiumOptions());
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));

const shot = async (name) => {
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}${name}.png` });
  console.log('shot', name);
};

await page.goto('http://localhost:4200/');
await page.waitForTimeout(2500);
await shot('01-first-run');

// Seed a real library the way somebody actually would.
page.on('filechooser', (c) =>
  c.setFiles({ name: 'episodes.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) }).catch(() => {}));
await page.getByRole('button', { name: /Import from TV Time/i }).click();
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(500);
  const b = await page.locator('body').innerText();
  if (/Your history is in/.test(b)) break;
}
await shot('02-import-done');

/*
 * Wait for matching to *finish*, rather than for nine seconds.
 *
 * Nine was enough on the machine it was written on and is not enough here: two sprints
 * running, this harness produced an Up Next still saying "Matching… 3 of 12" and a
 * calendar and watchlist with no rows in them at all. A design review of an empty screen
 * reviews the empty state — which is exactly the failure this file's own header warns
 * about ("stale screenshots are how a review ends up describing a version nobody is
 * using"), arriving by a different door.
 *
 * Up Next is the screen that says so out loud: it prints "Matching… n of m" while the run
 * is going and stops when it is done. Poll that, with a ceiling so a stuck run fails
 * loudly rather than quietly photographing a spinner.
 */
await page.goto('http://localhost:4200/');
/*
 * Wait for the library, not for the absence of a spinner.
 *
 * The first version of this polled for "Matching…" to *disappear* — and passed on its
 * first sample, while the app was still booting and the body was empty. "Not showing the
 * working state" is not "finished working": the same shape as §6.56's rule that an empty
 * state is a claim about somebody's own data. So this waits for a row to actually exist.
 */
/*
 * The slowest show, not the first — and Up Next cannot see the slowest show.
 *
 * Waiting for *a* row let the calendar be photographed before the ninety-six-episode
 * fixture had finished caching, so it said "nothing airing" and the row §6.97 rebuilt was
 * in no photograph. Two explanations were written down before the store was actually
 * inspected, and both were wrong: the fixture's air dates are generated relative to today
 * rather than fixed in the past, and the shows do all match — a probe against the web
 * build's IndexedDB shows all three with `tmdb:` titles and full episode caches of 18, 12
 * and 96, every library row `watching`.
 *
 * What was wrong was the settle test. Watching Up Next's text stop changing looks like
 * "the writes have stopped", and Up Next is the one screen that *cannot* see the long
 * fixture: its next unwatched episode has not aired, so it never appears there however
 * much of it is cached. A proxy that is blind to the thing it is waiting for is not a
 * proxy. So this waits on the calendar, which is the screen that depends on the slowest
 * data — and if the wait is ever wrong again, the screen it is waiting for is the screen
 * that shows it.
 */
await page.goto('http://localhost:4200/calendar');
let filled = false;
let steady = 0;
let last = -1;
for (let i = 0; i < 180; i++) {
  const body = await page.locator('body').innerText();
  // A dated row on the calendar: the last thing to arrive, so everything else is in.
  const seen = /Hollow Crown Saga/.test(body) && !/Nothing airing/.test(body);
  steady = seen && body.length === last ? steady + 1 : 0;
  last = body.length;
  if (seen && steady >= 3) {
    filled = true;
    break;
  }
  await page.waitForTimeout(1000);
}
if (!filled) {
  console.error(
    'The calendar never filled, so the screenshots below may be of a half-imported app. ' +
      'Check that the CSV names match what the metadata provider in this build knows, and ' +
      'that the seeded shows have episodes left to air.',
  );
  process.exitCode = 1;
}

const routes = [
  ['03-upnext', '/'],
  ['04-search', '/search'],
  ['05-discover', '/discover'],
  ['06-watchlist', '/watchlist'],
  ['07-more', '/more'],
  ['08-stats', '/stats'],
  ['09-calendar', '/calendar'],
  ['10-lists', '/lists'],
  ['11-people', '/people'],
  ['12-account', '/account'],
  ['13-data', '/data'],
  ['14-remote', '/remote'],
];
/**
 * What a screen must be showing for its photograph to be worth looking at.
 *
 * Three sprints of design review looked at an empty app, and the run that finally seeded a
 * matching library still handed back a calendar reading "Nothing airing" — after the wait
 * above had already watched that same screen fill. Whatever the cause, the durable fix is
 * that the harness stops handing over a screenshot of an empty state as though it were a
 * screenshot of the screen: a shot of the thing not being there is not a shot of the thing.
 */
const MUST_SHOW = {
  '03-upnext': /The Long Dark/,
  '06-watchlist': /Nothing saved yet|Add a note/,
  '09-calendar': /Hollow Crown Saga/,
};

const hollow = [];
for (const [name, path] of routes) {
  await page.goto(`http://localhost:4200${path}`);
  await shot(name);
  const want = MUST_SHOW[name];
  if (want) {
    const body = await page.locator('body').innerText();
    if (!want.test(body)) hollow.push(`${name} (${path}) does not show ${want}`);
  }
}
if (hollow.length) {
  console.error(`Screenshots of an empty screen, which is not a screenshot of the screen:\n  ${hollow.join('\n  ')}`);
  process.exitCode = 1;
}

// A title page and Watching Mode need a real target.
await page.goto('http://localhost:4200/');
await page.waitForTimeout(2000);
const link = page
  .locator('a, [role=link], [role=button]')
  .filter({ hasText: /The Long Dark|Kitchen Nightshift|Hollow Crown Saga/ })
  .first();
if (await link.count()) {
  await link.click();
  await shot('15-title');
}
await browser.close();

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
 * 264 rows over 12 shows — the same shape mobile/smoke.mjs uses, and enough that the
 * screens are judged full rather than empty. A design review of an empty app reviews
 * the empty state and nothing else.
 */
const CSV = (() => {
  const rows = ['show,season,number,name,seen,seen_date,times_watched,air_date,show_id,episode_id'];
  const shows = ['Dark', 'Andor', 'Chernobyl', 'Severance', 'Shogun', 'The Bear',
                 'Frieren', 'Mr. Robot', 'The Leftovers', 'Vinland Saga', 'Halt', 'Fringe'];
  shows.forEach((name, i) => {
    for (let season = 1; season <= 2; season++) {
      for (let n = 1; n <= 11; n++) {
        const d = `2024-03-0${(n % 9) + 1}`;
        rows.push(`${name},${season},${n},Episode ${n},True,${d} 20:00:00,1,${d},${100 + i},${1000 + i * 100 + season * 20 + n}`);
      }
    }
  });
  return rows.slice(0, 265).join('\n');
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

// Let matching run.
await page.waitForTimeout(9000);

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
for (const [name, path] of routes) {
  await page.goto(`http://localhost:4200${path}`);
  await shot(name);
}

// A title page and Watching Mode need a real target.
await page.goto('http://localhost:4200/');
await page.waitForTimeout(2000);
const link = page.locator('a, [role=link], [role=button]').filter({ hasText: /Dark|Andor|Frieren|Bear|Shogun/ }).first();
if (await link.count()) {
  await link.click();
  await shot('15-title');
}
await browser.close();

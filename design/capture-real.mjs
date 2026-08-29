import { chromium } from 'playwright';
import { chromiumOptions } from '../scripts/browser.mjs';
import { mkdirSync, readFileSync } from 'node:fs';

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

const BASE = 'http://localhost:4204';
const manifest = JSON.parse(readFileSync(new URL('./real/MANIFEST.json', import.meta.url), 'utf8'));
const SHOWS = manifest.titles.filter((t) => t.kind === 'tv');
const FILM = manifest.titles.find((t) => t.kind === 'movie');

const browser = await chromium.launch(chromiumOptions());
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));

const problems = [];
const scrolls = [];

/** The same shot-and-measure `capture.mjs` does: a screen that scrolls is part of a screen. */
const FOOT = 120;
async function shot(name, mustContain) {
  await page.waitForTimeout(700);
  const body = await page.locator('body').innerText();
  if (mustContain && !body.includes(mustContain)) {
    problems.push(`${name}: nothing on it says "${mustContain}"`);
  }
  const overflow = await page.evaluate(() => {
    const el = [...document.querySelectorAll('*')].find((n) => n.scrollHeight > n.clientHeight + 4);
    return el ? el.scrollHeight - el.clientHeight : 0;
  });
  await page.screenshot({ path: `${OUT}${name}.png` });
  if (overflow > FOOT) {
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('*')].find((n) => n.scrollHeight > n.clientHeight + 4);
      if (el) el.scrollTop = el.scrollHeight;
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}${name}-foot.png` });
    scrolls.push(`${name} +${overflow}pt`);
    console.log(`shot ${name} (scrolls ${overflow}pt, foot on file)`);
  } else {
    console.log(`shot ${name}${overflow ? ` (scrolls ${overflow}pt)` : ''}`);
  }
}

/**
 * Track a show by searching for it, the way a person would — and then **wait for its
 * episodes**, which is a thing the fixture never made anybody think about.
 *
 * The first run of this photographed *"59 more episodes"* for One Piece against 1,220, and
 * *"33"* for It's Always Sunny against 255, while the three short shows were right. Both
 * shapes look identical from a screenshot: a wrong query, or a cache still filling when the
 * shutter fired. The fixture's longest show is twenty-four episodes in one request, so a
 * fixed 2.5-second wait had never been asked to cover twenty-four *seasons* fetched one at
 * a time.
 *
 * So: wait for Up Next's count to stop moving. `settle` is the number that decides whether
 * §6.152's third finding is a defect or an instrument, and it says so out loud either way.
 */
async function track(name) {
  await page.goto(`${BASE}/search`, { waitUntil: 'networkidle' });
  await page.getByPlaceholder('Shows, films, anime…').fill(name);
  const row = page.getByText(name, { exact: true }).first();
  await row.waitFor({ timeout: 25000 });
  const button = page.getByRole('button', { name: new RegExp(`^Track ${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) });
  await button.first().click({ timeout: 20000 });
  /*
   * Wait for the row to say so before leaving.
   *
   * The settle loop went straight to Up Next and found nothing, five times: pressing Track
   * starts a write *and* an episode fetch, and against a real provider that is twenty-four
   * requests rather than one resolved promise. Navigating within the same tick lost the lot
   * — the fixture never showed it because the fixture answers instantly.
   *
   * Whether a person can do the same thing is a question for the product, not the harness,
   * and §6.152 files it rather than guessing. What the harness owes is to wait like
   * somebody who is watching the screen.
   */
  await page.getByText('Tracking', { exact: true }).first().waitFor({ timeout: 30000 });
  await settle(name);
}

/**
 * Watch Up Next's count for this show until it stops growing.
 *
 * **In place.** The first version of this re-navigated on every poll and reported `-1` for
 * all five shows: a full app boot per second is slower than the boot, so the row was never
 * on screen when it looked. The app is a live query — it redraws as the cache fills — so
 * the right instrument is to arrive once and watch. §6.152.
 */
async function settle(name) {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  let last = -1;
  let steady = 0;
  for (let i = 0; i < 60 && steady < 5; i++) {
    await page.waitForTimeout(1000);
    const body = await page.locator('body').innerText();
    const at = body.indexOf(name);
    const count =
      at === -1 ? -1 : Number(body.slice(at, at + 200).match(/(\d+) more episodes?/)?.[1] ?? -1);
    steady = count === last && count > 0 ? steady + 1 : 0;
    last = count;
  }
  console.log(`  tracked ${name} — Up Next settled at ${last} more`);
  return last;
}

console.log(`Photographing against a snapshot of real TMDB — ${manifest.titles.length} titles.`);

for (const show of SHOWS) {
  try {
    await track(show.name);
  } catch (e) {
    problems.push(`could not track ${show.name}: ${e.message.split('\n')[0].slice(0, 80)}`);
  }
}

// Search, with a real result on it — the longest title in the library, deliberately.
const LONGEST = [...SHOWS].sort((a, b) => b.name.length - a.name.length)[0];
await page.goto(`${BASE}/search`, { waitUntil: 'networkidle' });
await page.getByPlaceholder('Shows, films, anime…').fill(LONGEST.name);
await page.waitForTimeout(2500);
await shot('r1-search-long-title', LONGEST.name);

// A film, which is the other row shape.
if (FILM) {
  await page.goto(`${BASE}/search`, { waitUntil: 'networkidle' });
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

await page.goto(`${BASE}/calendar`, { waitUntil: 'networkidle' });
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

if (scrolls.length) console.log(`\nshots that are the top of a longer screen: ${scrolls.join(', ')}`);
if (problems.length) {
  console.error(`\nreal pass could not photograph what it went for:\n  ${problems.join('\n  ')}`);
  process.exitCode = 1;
}
await browser.close();

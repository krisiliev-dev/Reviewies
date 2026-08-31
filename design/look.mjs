/**
 * A short walk through the surfaces this sprint moved, on a real browser.
 *
 * Not a replacement for `capture.mjs` — it takes no design decisions and files no shots
 * into the record. It exists because `docs/design/architecture.md` changed what the tab bar
 * offers and what each surface does, and a change of that size that has only ever been read
 * by a type-checker and a set of source guards has not been seen at all.
 *
 * Ports are the caller's: this takes the address it is given rather than picking one, so it
 * can be run beside another pass without either of them taking the other's port.
 */
import { chromium } from 'playwright';
import { chromiumOptions } from '../scripts/browser.mjs';

const BASE = process.argv[2] ?? 'http://localhost:4320';
const problems = [];
const note = (line) => console.log(`  ${line}`);

/*
 * The browser comes from `scripts/browser.mjs`, as it does for the other ten launches here.
 *
 * The paragraph this replaces had the diagnosis exactly right — this checkout's
 * `playwright-core` asks for a `chrome-headless-shell` build that is not on the machine,
 * the full chromium under `/opt/pw-browsers` is, and *"a pass that cannot start is not
 * evidence"* — and then read the answer from `process.env.CHROME`, which nothing in
 * `package.json` sets. So `npm run design:look` died on `chromium.launch` before its first
 * navigation, every time, on the walk `architecture.md` section 8 calls the only thing here
 * that has seen the new architecture. §6.46 wrote that answer down once; this asks for it.
 */
const browser = await chromium.launch(chromiumOptions());
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', (e) => problems.push(`page error: ${e.message.split('\n')[0]}`));

const body = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
const at = async (path, want, name) => {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 20; i++) {
    if (want.test(await body())) break;
    await page.waitForTimeout(400);
  }
  const seen = await body();
  if (!want.test(seen)) problems.push(`${name} (${path}) does not show ${want}: ${seen.slice(0, 120)}`);
  else note(`${name}: ${seen.slice(0, 90)}`);
};

// The tab bar, which is the thing that changed shape.
await at('/', /Up Next/, 'Up Next');
const tabs = await page.getByRole('navigation', { name: 'Sections' }).innerText();
note(`tabs: ${tabs.replace(/\s+/g, ' ')}`);
if (/Search/.test(tabs)) problems.push('the bar still offers Search');
if (!/Discover/.test(tabs)) problems.push('the bar does not offer Discover');

// Up Next's two halves.
await at('/?on=coming', /Tell me about|Nothing airing/, 'Up Next — Upcoming');
const heading = await page.getByRole('heading', { level: 1 }).allInnerTexts();
note(`h1 on the coming half: ${JSON.stringify(heading)}`);
if (heading.length !== 1 || heading[0] !== 'Up Next') {
  problems.push(`the coming half has ${JSON.stringify(heading)} as its top-level heading`);
}

// Discover: the shelf, then the list.
await at('/discover', /Nothing you have already watched|Nothing new to suggest|so these are what people are watching/, 'Discover — shelf');
const filters = await page.getByRole('button', { name: /^Filters — / }).count();
if (!filters) problems.push('Discover has no filter row');
else note('the filter row is there and shut');

const box = page.getByRole('button', { name: /^More about / }).first();
if (!(await box.count())) note('no box on the shelf to turn over (an empty library suggests nothing)');
else {
  const name = await box.getAttribute('aria-label');
  await box.click();
  await page.waitForTimeout(400);
  const back = await body();
  note(`turned over: ${name} → ${back.slice(0, 90)}`);
  if (!/Track/.test(back)) problems.push('the back of a box does not offer Track');
}

await page.goto(`${BASE}/discover`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(600);
const field = page.getByPlaceholder(/Shows, films/i).first();
if (!(await field.count())) problems.push('Discover has no search field');
else {
  await field.fill('long');
  await page.waitForTimeout(2500);
  const results = await body();
  note(`searching: ${results.slice(0, 110)}`);
  if (!/The Long Dark/.test(results)) problems.push('searching Discover found nothing');
}

/*
 * The front and the back of a box, in full — the three things a spine carries, and the
 * synopsis behind them.
 */
await page.goto(`${BASE}/discover`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
const front = await page.getByRole('button', { name: /^More about The Long Dark$/ }).first();
if (await front.count()) {
  note(`front: ${(await front.innerText()).replace(/\s+/g, ' ')}`);
  await front.click();
  await page.waitForTimeout(400);
  note(`back: ${(await body()).replace(/^.*The Long Dark/, 'The Long Dark').slice(0, 200)}`);
}

// The filter row, opened, and the genres it offers.
await page.goto(`${BASE}/discover`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
await page.getByRole('button', { name: /^Filters — / }).first().click();
await page.waitForTimeout(400);
const chips = await page.getByRole('radio').allInnerTexts();
note(`filter chips: ${chips.join(' | ')}`);
if (!chips.some((c) => /Drama|Comedy|Crime/.test(c))) problems.push('no genre chips on Discover');
if (!chips.some((c) => /Well rated/.test(c))) problems.push('no standing chip on Discover');

/*
 * The past, above the present — the bullet with the highest daily value, and the one thing
 * here a source guard genuinely cannot see.
 */
await page.goto(`${BASE}/discover`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);
await page.getByPlaceholder(/Shows, films/i).first().fill('long');
await page.waitForTimeout(2500);
const track = page.getByRole('button', { name: /^Track The Long Dark$/ }).first();
if (!(await track.count())) problems.push('nothing to track, so the past cannot be produced');
else {
  await track.click();
  await page.waitForTimeout(3000);
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const ring = page.getByRole('checkbox', { name: /^Mark The Long Dark/ }).first();
  if (!(await ring.count())) problems.push('Up Next offers nothing to mark');
  else {
    /*
     * Ten, not one. One watch is one row, and one row plus the list still fits an 844pt
     * frame — so a screen that had never scrolled would pass a scroll check by having
     * nothing to scroll. §6.146's rule: a case the harness cannot produce is a case nobody
     * has judged, and the first version of this clause produced exactly that and reported
     * `scrollTop 0` as a defect in the product.
     */
    for (let i = 0; i < 10; i++) {
      const next = page.getByRole('checkbox', { name: /^Mark The Long Dark/ }).first();
      if (!(await next.count())) break;
      await next.click();
      await page.waitForTimeout(500);
    }
    await page.waitForTimeout(1500);
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const home = await body();
    note(`Up Next with a past: ${home.slice(0, 200)}`);
    if (!/Already watched/i.test(home)) problems.push('Up Next drew no past after a mark');
    const struck = await page.getByRole('checkbox', { name: /^Unmark The Long Dark/ }).count();
    if (!struck) problems.push('the past has no filled ring to take a watch back with');
    else note(`the past carries ${struck} reversible mark(s)`);

    /*
     * And the screen arrived at the present rather than at the top of the past.
     *
     * The one half of `architecture.md` section 3 that no source guard can reach: the past
     * is laid out above and the column is scrolled past it once. Measured off the scroller
     * `App.tsx` owns — a number, because "it looked fine" is not an answer to a question
     * about a scroll position.
     *
     * ## Why one number was the wrong number
     *
     * This asked `scrollTop > 0` and reported **450**, and `architecture.md` section 8 wrote
     * that figure down as the proof. Read again with the scroller's own range beside it, 450
     * is also the **maximum** — `scrollHeight - clientHeight` exactly — so the column did not
     * stop at the present, it stopped at the end of itself, and the number would have been
     * the same had `scrollIntoView` asked for the bottom of the document. A clause that
     * passes on the clamp cannot fail for the reason it was written, which is §6.157's rule
     * about an instrument that can only return one answer.
     *
     * `scrollIntoView({ block: 'start' })` is a *request*: it is honoured only while there
     * is a frame of content below the target. Up Next's present is one screen at most and
     * usually a few rows, so the request is refused almost always — measured on this walk,
     * the first live row sits 615 points down an 844 point frame with seven struck rows above
     * it. So the honest reading is where the present **landed**, and the clamp is reported as
     * itself rather than as an arrival.
     */
    const arrival = await page.evaluate(() => {
      const main = document.querySelector('main');
      if (!main) return null;
      const frame = main.getBoundingClientRect();
      // The first row that is not crossed off: the present, as somebody sees it.
      for (const li of document.querySelectorAll('li')) {
        const box = li.getBoundingClientRect();
        if (box.top < frame.top) continue;
        const struckOut = [...li.querySelectorAll('*')].some((e) =>
          /line-through/.test(getComputedStyle(e).textDecorationLine),
        );
        if (struckOut) continue;
        return {
          scrolled: Math.round(main.scrollTop),
          most: Math.round(main.scrollHeight - main.clientHeight),
          frame: Math.round(main.clientHeight),
          present: Math.round(box.top - frame.top),
        };
      }
      return {
        scrolled: Math.round(main.scrollTop),
        most: Math.round(main.scrollHeight - main.clientHeight),
        frame: Math.round(main.clientHeight),
        present: null,
      };
    });
    if (!arrival) problems.push('there is no scroller on Up Next to measure');
    else {
      note(
        `arrived at scrollTop ${arrival.scrolled} of a possible ${arrival.most}; the present ` +
          `begins ${arrival.present}pt down a ${arrival.frame}pt frame`,
      );
      if (arrival.scrolled <= 0) {
        problems.push(`the screen arrived at the top of the past (scrollTop ${arrival.scrolled})`);
      } else if (arrival.present === null) {
        problems.push('nothing unstruck is on Up Next, so where it arrived cannot be read');
      } else if (arrival.present > 0 && arrival.scrolled >= arrival.most) {
        // Not "it did not scroll" — it scrolled all it could and the present still is not at
        // the top. Reported rather than repaired: the repair is a screenful of trailing room
        // under the present, which is a decision about what the bottom of the longest screen
        // in the product looks like, and this file takes no design decisions.
        problems.push(
          `the screen ran out of column before it reached the present: scrollTop ` +
            `${arrival.scrolled} is the whole range, and the present is still ${arrival.present}pt ` +
            `down an ${arrival.frame}pt frame`,
        );
      }
    }
  }
}

// The two addresses that are no longer screens.
for (const gone of ['/search', '/calendar']) {
  await page.goto(`${BASE}${gone}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  const seen = await body();
  note(`${gone}: ${seen.slice(0, 70)}`);
  if (!/Nothing at this address/.test(seen)) {
    problems.push(`${gone} still renders something other than the not-found screen`);
  }
}

await browser.close();
if (problems.length) {
  console.error(`\nProblems:\n  ${problems.join('\n  ')}`);
  process.exitCode = 1;
} else {
  console.log('\nThe walk found nothing to report.');
}

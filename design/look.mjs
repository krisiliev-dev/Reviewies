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

const BASE = process.argv[2] ?? 'http://localhost:4320';
const problems = [];
const note = (line) => console.log(`  ${line}`);

/*
 * The channel is named rather than left to the bundled default.
 *
 * This checkout's `playwright-core` asks for a `chrome-headless-shell` build that is not on
 * the machine — the browsers under `/opt/pw-browsers` are a version behind. The full
 * chromium *is* there, so the walk uses it: a pass that cannot start is not evidence, and
 * §6.187's finding was exactly this shape from the other end — `verify` red on a fresh
 * checkout for three reasons, none of them the code.
 */
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? undefined });
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
     */
    const scrolled = await page.evaluate(() => document.querySelector('main')?.scrollTop ?? -1);
    note(`arrived at scrollTop ${scrolled}`);
    if (scrolled <= 0) problems.push(`the screen arrived at the top of the past (scrollTop ${scrolled})`);
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

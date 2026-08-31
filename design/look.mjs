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
 * And the search survives going back, which is the thing a source guard cannot see.
 *
 * `docs/research/11-what-a-task-costs.md` §7.2. The query used to live in `useState`, so
 * opening a result and pressing Back remounted Discover with an empty field and the shelf
 * where the results had been — four characters, a press and a mental operation, every time,
 * on the loop that is most of why anybody searches. It is in the address now.
 *
 * This clause is here because a plant proved the source guard's width.
 * `app/src/wiring/addressState.test.ts` asks whether the address is read and written, and a
 * screen can do both and still bind its field to a private mirror: planted as
 * `const [typed, setTyped] = useState('')` beside a correct `queryFrom`, that guard reported
 * nothing wrong on a build that lost the search exactly as before. The question a guard can
 * ask about the source is *is the address wired up*; the question this walk asks is the one
 * the reader has, which is **is my search still there**.
 *
 * Read off the field rather than off the address bar. `/discover?q=long` proves the browser
 * came back to the right URL and proves nothing about the screen — and a screen that reads
 * right and renders wrong is the whole subject of this file.
 */
await page.goto(`${BASE}/discover`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);
const typeHere = page.getByPlaceholder(/Shows, films/i).first();
if (!(await typeHere.count())) problems.push('Discover has no search field to go back to');
else {
  await typeHere.fill('long');
  await page.waitForTimeout(2500);
  const opened = page.getByRole('link', { name: /^Open The Long Dark/ }).first();
  const anyOpen = (await opened.count()) ? opened : page.getByRole('link', { name: /^Open / }).first();
  if (!(await anyOpen.count())) problems.push('searching Discover offered nothing to open');
  else {
    const url = page.url();
    await anyOpen.click();
    await page.waitForTimeout(1500);
    await page.goBack({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const back = page.getByPlaceholder(/Shows, films/i).first();
    const held = (await back.count()) ? await back.inputValue() : null;
    note(`searched at ${url}, opened a result, came back to a field holding ${JSON.stringify(held)}`);
    if (held !== 'long') {
      problems.push(
        `app/src/screens/Discover.tsx: the search did not survive going back — the field holds ` +
          `${JSON.stringify(held)} where "long" was typed. That is four characters and a press, ` +
          `charged on every look-before-you-commit`,
      );
    }
    const seen = await body();
    if (!/The Long Dark/.test(seen)) {
      problems.push('coming back from a result left Discover showing the shelf rather than the results');
    }
  }
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
     *
     * ## And "it did not clamp" is not the same claim as "it arrived"
     *
     * The clause that replaced the one-number check asked `present > 0 && scrolled >= most`
     * — *did the column run out*. That is a question about the **cause**, and it passes on
     * every screen that stops short of the present for any other reason. Planted and
     * measured: with the marker sitting 300pt above the row it is supposed to name, this
     * walk printed `the present begins 300pt down a 844pt frame` and **exited 0**, because
     * the column had 96pt of range left over. A guard that prints the defect and passes is
     * the same shape as the number it was written to replace, one clause along.
     *
     * So the clause asks the thing the screen actually claims: **is the present at the top
     * of the frame**. `architecture.md` section 3's sentence is "the screen still arrives at
     * the present", and the reading of that is a position, not a cause.
     *
     * The bound is one row, and it is measured off this screen rather than chosen: a present
     * that begins less than its own row-height down the frame is a row at the top of the
     * screen. `scrolled` and `most` stay in the message because they say *why* — ran out of
     * column, or stopped short with room to spare — and a failure that cannot be told apart
     * from its neighbour is a failure somebody has to reproduce before they can read it.
     *
     * The `scrolled <= 0` half is gone with it, and deliberately: it fails on a screen with
     * a past short enough to need no scroll, which is a correct screen. The position answers
     * that case correctly without a special case, because a screen that never scrolled and
     * never needed to has its present at the top.
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
          // The bound, measured rather than picked: one of this screen's own rows.
          row: Math.round(box.height),
        };
      }
      return {
        scrolled: Math.round(main.scrollTop),
        most: Math.round(main.scrollHeight - main.clientHeight),
        frame: Math.round(main.clientHeight),
        present: null,
        row: null,
      };
    });
    if (!arrival) problems.push('there is no scroller on Up Next to measure');
    else if (arrival.present === null) {
      note(`arrived at scrollTop ${arrival.scrolled} of a possible ${arrival.most}`);
      problems.push('nothing unstruck is on Up Next, so where it arrived cannot be read');
    } else {
      // Every number with the bound it is being compared against, in the same breath. That
      // is the whole subject of the header above this clause.
      note(
        `arrived at scrollTop ${arrival.scrolled} of a possible ${arrival.most}; the present ` +
          `begins ${arrival.present}pt down a ${arrival.frame}pt frame, against a bound of ` +
          `${arrival.row}pt (one of this screen's own rows)`,
      );
      if (arrival.present > arrival.row) {
        problems.push(
          `app/src/screens/UpNext.tsx: the screen did not arrive at the present. It begins ` +
            `${arrival.present}pt down a ${arrival.frame}pt frame, past the ${arrival.row}pt bound ` +
            `(one row) — and scrollTop ${arrival.scrolled} of a possible ${arrival.most} says ` +
            (arrival.scrolled >= arrival.most
              ? `the column ran out before it got there, so the present needs more trailing room ` +
                `under it`
              : `the column still had ${arrival.most - arrival.scrolled}pt of range left, so the ` +
                `scroll stopped short of the present rather than being refused`),
        );
      }
    }
    /*
     * And the arrival is spent **once**, which is a different claim from where it landed and
     * needs its own reading.
     *
     * This clause exists because a plant proved the one above could not see it. With the
     * `arrived` ref removed — so the scroll re-fires on every commit, and `useLiveQuery`
     * commits on every write in the app — the clause above printed
     * `the present begins 0pt down a 844pt frame` and **exited 0**. It measures arrival, and
     * arrival is correct in that build; what is broken is what happens *afterwards*, on the
     * one action this product exists for. `UpNext.tsx`'s own header says so in as many
     * words: "crossing something off would yank the page back to a position that had just
     * changed under it".
     *
     * ## It is measured from where the reader is, not from where the screen landed
     *
     * The first version of this clause marked an episode with the screen still sitting at
     * its arrival and asked for `scrollTop` **unchanged**. It failed on the correct build,
     * 1065 → 1156, which makes it the ninth guard in this repository to fail on a change
     * that was right — and the reason is worth the paragraph, because it is a fact about
     * the renderer rather than about the product. Chromium **scroll-anchors**: a row
     * inserted above the visible area moves `scrollTop` by that row's height on purpose, so
     * that what you are looking at does not jump. Marking an episode inserts a struck row at
     * the top of the past, above the fold, so a correct build moves `scrollTop` by exactly
     * one row and the screen does not move at all. `scrollTop` is not the reader's position;
     * it is the reader's position plus whatever the browser did to preserve it.
     *
     * Worse, at the arrival the two builds are genuinely indistinguishable: the present is at
     * the top of the frame, so a re-fired scroll puts it back exactly where anchoring was
     * about to leave it. The defect is invisible from the one position the screen chooses
     * for itself.
     *
     * So the reading is taken from somewhere the reader has moved to. Scroll to the top of
     * the past — the place §3 is about, where you have gone back to look at what you watched
     * — and write from there. A build that spends its arrival once stays where it was put; a
     * build that re-fires snaps hundreds of points down to the present, mid-read. The bound
     * is one row, which is the most anchoring can account for.
     *
     * ## The ring pressed is the past's, and that is forced rather than chosen
     *
     * The obvious press is the present's `Mark …`, and it cannot be used: it is off-screen
     * from the top of the past *by construction*, and Playwright scrolls an element into
     * view before clicking it. The first version of this clause did exactly that and
     * reported the column moving 0 → 684 on a correct build — a measurement of the harness
     * driving the page, filed as a defect in the page. `docs/design/on-a-device.md`'s rule
     * applies to instruments too.
     *
     * The past's `Unmark …` is at the top of the column, so pressing it moves nothing, and it
     * is the same test: the claim in `UpNext.tsx` is about **every** write re-running every
     * query, and taking a watch back is a write. It is also the exact gesture §3 built the
     * reversible ring for — "the mis-tap you noticed a minute later" — which is a thing you
     * do while reading the past, from the top of the past.
     */
    if (arrival && arrival.present !== null) {
      const again = page.getByRole('checkbox', { name: /^Unmark The Long Dark/ }).first();
      if (!(await again.count())) {
        note('no reversible mark in the past, so the arrival cannot be asked to stay put');
      } else {
        await page.evaluate(() => document.querySelector('main')?.scrollTo({ top: 0 }));
        await page.waitForTimeout(400);
        const left = await page.evaluate(() =>
          Math.round(document.querySelector('main')?.scrollTop ?? -1),
        );
        await again.click();
        await page.waitForTimeout(1500);
        const after = await page.evaluate(() =>
          Math.round(document.querySelector('main')?.scrollTop ?? -1),
        );
        note(
          `read the past at scrollTop ${left}, took a mark back from there, and the column ` +
            `sits at ${after} — a move of ${after - left}pt against a bound of ${arrival.row}pt ` +
            `(one row, which is all scroll anchoring can account for)`,
        );
        if (Math.abs(after - left) > arrival.row) {
          problems.push(
            `app/src/screens/UpNext.tsx: a write made while reading the past moved the ` +
              `column from ${left} to ${after} (${after - left}pt), past ` +
              `the ${arrival.row}pt bound. The arrival is spent once and guarded by a ref for ` +
              `exactly this reason — a scroll that re-fires yanks the page out from under the ` +
              `reader on the one action the product exists for`,
          );
        }
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

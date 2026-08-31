/**
 * The same short walk as `look.mjs`, against the phone's web export.
 *
 * Separate rather than a flag, for the reason `capture.mjs` and `capture-web.mjs` are
 * separate: the two platforms are reached differently. The phone has no `Sections`
 * landmark round its tab bar — React Navigation draws its own — its segment control is
 * `role=radio` through `Choice`, and `?on=coming` arrives through expo-router's parameters
 * rather than through a router that owns the URL.
 *
 * `mobile/smoke.mjs` is the suite; this is a walk, and it exists because
 * `docs/design/architecture.md` moved three surfaces on the platform this product is built
 * around, and the scroll-to-present and `router.setParams` paths are unreachable from any
 * source guard. Ports are the caller's.
 */
import { chromium } from 'playwright';
import { chromiumOptions } from '../scripts/browser.mjs';

const BASE = process.argv[2] ?? 'http://localhost:4321';
const problems = [];
const note = (line) => console.log(`  ${line}`);

// From `scripts/browser.mjs`, like every other launch here — `look.mjs` has the paragraph.
// This took `process.env.CHROME`, which nothing sets, and so could not start at all.
const browser = await chromium.launch(chromiumOptions());
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', (e) => problems.push(`page error: ${e.message.split('\n')[0]}`));

const body = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
const at = async (path, want, name) => {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 25; i++) {
    if (want.test(await body())) break;
    await page.waitForTimeout(500);
  }
  const seen = await body();
  if (!want.test(seen)) problems.push(`${name} (${path}) does not show ${want}: ${seen.slice(0, 140)}`);
  else note(`${name}: ${seen.slice(0, 110)}`);
};

await at('/', /Up Next/, 'Up Next');
/*
 * The bar, read as controls rather than as body text.
 *
 * The first version grepped `innerText` for "Search" and matched the first-run sentence
 * *"Nothing to import? Search for a show and start from there."* — a needle about a word
 * answering a question about a control. §6.74's finding, which `app/smoke.mjs` records at
 * length: the tab bar prints its labels on every screen, so body text cannot tell you what
 * the bar offers, and prose cannot tell you either.
 */
const tab = (label) => page.getByText(label, { exact: true }).first().count();
if (await tab('Search')) problems.push('the bar still offers Search');
if (!(await tab('Discover'))) problems.push('the bar does not offer Discover');
note(`bar: ${(await body()).slice(-60)}`);

// The segment, pressed rather than addressed — which is how a person reaches it.
const coming = page.getByRole('radio', { name: /Upcoming/ }).first();
if (!(await coming.count())) problems.push('Up Next has no segment control');
else {
  await coming.click();
  await page.waitForTimeout(2000);
  const half = await body();
  note(`coming: ${half.slice(0, 120)}`);
  if (!/Tell me about|Nothing airing|NEXT TWO MONTHS/i.test(half)) {
    problems.push('pressing Upcoming did not show what is coming');
  }
  if (!/on=coming/.test(page.url())) problems.push(`the segment is not in the address: ${page.url()}`);
}

// And by address, which is the half a deep link and a harness use.
await at('/?on=coming', /Tell me about|Nothing airing|NEXT TWO MONTHS/i, 'Up Next — by address');

await at('/discover', /Nothing you have already watched|so these are what people are watching/, 'Discover');
const box = page.getByRole('button', { name: /^More about / }).first();
if (!(await box.count())) problems.push('nothing on the shelf to turn over');
else {
  note(`front: ${(await box.innerText()).replace(/\s+/g, ' ')}`);
  await box.click();
  await page.waitForTimeout(600);
  const back = await body();
  if (!/Track/.test(back)) problems.push('the back of a box does not offer Track');
  else note(`back: ${back.slice(0, 140)}`);
}

// The past, produced through the app and read back off the screen.
await page.goto(`${BASE}/discover`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
await page.getByPlaceholder(/Shows, films/i).first().fill('long');
await page.waitForTimeout(3000);
const track = page.getByRole('button', { name: /^Track The Long Dark$/ }).first();
if (!(await track.count())) problems.push('nothing to track, so the past cannot be produced');
else {
  await track.click();
  await page.waitForTimeout(4000);
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const ring = page.getByRole('checkbox', { name: /^Mark The Long Dark/ }).first();
  if (!(await ring.count())) problems.push('Up Next offers nothing to mark');
  else {
    /*
     * Ten, not one. One watch is one row, and one row plus the list still fits an 844pt
     * frame — so a screen that had never scrolled would pass a scroll check by having
     * nothing to scroll. §6.146: a case the harness cannot produce is a case nobody has
     * judged, and the web's twin reported `scrollTop 0` as a defect on exactly that.
     */
    for (let i = 0; i < 10; i++) {
      const next = page.getByRole('checkbox', { name: /^Mark The Long Dark/ }).first();
      if (!(await next.count())) break;
      await next.click();
      await page.waitForTimeout(600);
    }
    await page.waitForTimeout(2000);
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const home = await body();
    note(`Up Next with a past: ${home.slice(0, 200)}`);
    if (!/Already watched/i.test(home)) problems.push('Up Next drew no past after a mark');
    const struck = await page.getByRole('checkbox', { name: /^Unmark The Long Dark/ }).count();
    if (!struck) problems.push('the past has no filled ring to take a watch back with');
    else note(`the past carries ${struck} reversible mark(s)`);

    /*
     * And the screen arrived at the present. `architecture.md` section 3's one claim no
     * source guard can reach.
     *
     * The scroller is found rather than named: React Native's `ScrollView` is a `div` with
     * its own overflow on this export and has no stable selector, so the measurement asks
     * the document which element has actually been scrolled — which is also the only
     * question worth asking.
     *
     * ## This clause used to ask `scrollTop > 0`, and that is the defect it exists to catch
     *
     * The web's twin had exactly this clause and `architecture.md` section 8 wrote its
     * output down as proof the screen arrived; the retraction in that section is what a
     * number with no bound beside it is worth. **This side never got the retraction.**
     * Measured at HEAD, on the build before this sprint's repair: `scrollTop 359` of a
     * possible **359** — the entire range, the column stopped at the end of itself with the
     * first markable row still most of a screen down — and this walk printed
     * `arrived at scrollTop 359` and **exited 0**. It could not have failed: on a screen with
     * a past above it, any scroll at all is positive, so the clause returned the same answer
     * for an arrival and for an end-stop.
     *
     * Planted afterwards to size the repair rather than argue for it: with the arrival
     * deliberately landing 300pt short, this clause printed `arrived at scrollTop 694` and
     * exited 0 again.
     *
     * ## What it asks now
     *
     * Where the present **landed**, against the bound it has to land inside, in the same
     * breath — and `scrollTop` against its own maximum, so a failure says whether the column
     * ran out or the scroll stopped short. Those are different repairs.
     *
     * The instrument is the first ring named `Mark …` rather than `Unmark …`: the first thing
     * on this screen you can act on, which is the whole of what "arrives at the present"
     * means, and the one element here with a name stable enough to find. The bound is one
     * row, measured off the pitch of the struck rows above rather than chosen — a ring sits
     * somewhere inside its row, so "within one row of the top of the frame" is the tightest
     * honest reading of a ring's position.
     */
    const arrival = await page.evaluate(() => {
      const scrollers = [];
      for (const el of document.querySelectorAll('*')) {
        if (el.scrollHeight - el.clientHeight > 8) scrollers.push(el);
      }
      // The column is the deepest thing that actually scrolls; the document does not here.
      const column = scrollers.sort(
        (a, b) => b.scrollHeight - b.clientHeight - (a.scrollHeight - a.clientHeight),
      )[0];
      if (!column) return null;
      const frame = column.getBoundingClientRect();
      const named = [...document.querySelectorAll('[aria-label]')];
      const struck = named.filter((e) => (e.getAttribute('aria-label') ?? '').startsWith('Unmark '));
      const live = named.find((e) => (e.getAttribute('aria-label') ?? '').startsWith('Mark '));
      const pitch =
        struck.length > 1
          ? Math.abs(
              struck[1].getBoundingClientRect().top - struck[0].getBoundingClientRect().top,
            )
          : null;
      return {
        what: `${column.tagName}.${(column.className || '').toString().slice(0, 40)}`,
        scrolled: Math.round(column.scrollTop),
        most: Math.round(column.scrollHeight - column.clientHeight),
        frame: Math.round(column.clientHeight),
        present: live ? Math.round(live.getBoundingClientRect().top - frame.top) : null,
        row: pitch ? Math.round(pitch) : null,
      };
    });
    // The scroller is named as well as measured: "nothing scrolled" and "there was nothing
    // to scroll" are two different answers and only one of them is a defect. §6.57's rule,
    // on an instrument rather than on a screen.
    if (!arrival) problems.push('nothing on Up Next scrolls, so where it arrived cannot be read');
    else if (arrival.present === null || arrival.row === null) {
      note(`what scrolls: ${JSON.stringify(arrival)}`);
      problems.push(
        'the past and the present cannot both be found by name, so the arrival cannot be read',
      );
    } else {
      note(`what scrolls: ${arrival.what}`);
      note(
        `arrived at scrollTop ${arrival.scrolled} of a possible ${arrival.most}; the present ` +
          `begins ${arrival.present}pt down a ${arrival.frame}pt frame, against a bound of ` +
          `${arrival.row}pt (one row of the past)`,
      );
      if (arrival.present > arrival.row) {
        problems.push(
          `mobile/app/(tabs)/index.tsx: the screen did not arrive at the present. It begins ` +
            `${arrival.present}pt down a ${arrival.frame}pt frame, past the ${arrival.row}pt bound ` +
            `(one row) — and scrollTop ${arrival.scrolled} of a possible ${arrival.most} says ` +
            (arrival.scrolled >= arrival.most
              ? `the column ran out before it got there, so the present needs more trailing room ` +
                `under it`
              : `the column still had ${arrival.most - arrival.scrolled}pt of range left, so the ` +
                `scroll stopped short of the present rather than being clamped`),
        );
      }
    }
  }
}

for (const gone of ['/search', '/calendar']) {
  await page.goto(`${BASE}${gone}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const seen = await body();
  note(`${gone}: ${seen.slice(0, 70)}`);
}

await browser.close();
if (problems.length) {
  console.error(`\nProblems:\n  ${problems.join('\n  ')}`);
  process.exitCode = 1;
} else {
  console.log('\nThe walk found nothing to report.');
}

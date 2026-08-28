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
 *   npm run design
 *
 * That is one command on purpose. It was three, remembered from this comment, which is
 * the difference between a step in the work and a thing somebody means to get around to —
 * and the reason to make it one is that everything below only holds if it is actually run.
 * It exports the phone build, serves it, drives the app, and exits non-zero if any screen
 * is missing what makes it worth looking at.
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
import { CSV } from './library.mjs';

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
/*
 * The import has to have actually landed, and it has to say so.
 *
 * This waited fifteen seconds for "Your history is in" and then carried on whether it
 * appeared or not, so a run where the file never reached the app photographed an empty
 * library and reported nothing. Same shape as everything else this harness has been
 * wrong about: proceeding is not the same as succeeding.
 */
const landed = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
// A *count*, not the sentence. Planted with a CSV nothing could read, the screen still
// said "Imported 0 watches" and `/Imported \d+ watches/` was perfectly happy with it —
// the same shape as the stats clause this sprint had to strengthen an hour earlier, in a
// line written an hour earlier. §6.73 is not a lesson you learn once.
if (!/Imported [1-9]\d* watches/.test(landed)) {
  console.error(`The import never landed, so everything below is a photograph of an empty app.\n  ${landed.slice(0, 200)}`);
  process.exitCode = 1;
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
/*
 * First on Up Next, because that is where the work happens.
 *
 * Matching runs from `MatchImports`, which is mounted on Up Next and nowhere else. This
 * harness used to sit on `/calendar` for three minutes waiting for rows — on a screen
 * where nothing was matching — and then navigate away and photograph a library that had
 * only started progressing again the moment it left.
 *
 * §6.101 is what made that visible: before it, matching stopped after the first show
 * anyway, so waiting in the wrong place and waiting for something that had stalled looked
 * identical. Two waits now, each on the screen that can actually see its own thing —
 * Up Next until it stops saying "Matching…", then the calendar until the slowest show's
 * episodes have landed.
 */
await page.goto('http://localhost:4200/');
/*
 * Arrived, before asking whether it has finished — and this is the second time this file
 * has needed that sentence.
 *
 * §6.98 wrote it down: "the first version of this polled for 'Matching…' to *disappear* —
 * and passed on its first sample, while the app was still booting and the body was empty".
 * The wait added below it four sections later did exactly that again, sampled an empty
 * body, decided matching was done and moved on. "Not showing the working state" is not
 * "finished working".
 *
 * So: wait for Up Next to be a screen with something on it, and only then watch the
 * counter. `Up Next` is its heading and it is there as soon as the screen renders.
 */
await page.getByText('Up Next', { exact: true }).first().waitFor({ timeout: 30000 });
await page.waitForTimeout(2000);

/*
 * Matching, waited for by its *result* rather than by watching its progress line.
 *
 * The old wait watched "Matching… n of m" and stopped when the line went away — and the
 * line goes away both when the run finishes and when it has not begun, so this harness
 * could not tell those apart. Measured across five consecutive runs of the same build it
 * read "1 of 2", "0 of 0", "0 of 0", "1 of 2", "1 of 2", and the libraries that came out
 * the other side were matched, half-matched and not matched at all. Three sprints of
 * design review were taken across that spread without the harness ever saying which.
 *
 * `MatchImports` runs while it is mounted, and it is mounted on Up Next and nowhere else,
 * so a run that stops half way is resumed by going back to Up Next. That is what somebody
 * would do, and it is what this does — up to a ceiling, and then it says so.
 *
 * The condition is the end state: every imported show tracked under a real name, which
 * More prints as a count. §6.98's rule, third application — wait for the thing you want,
 * never for the absence of the thing you do not.
 */
const WANT_TRACKED = 3;
let tracked = 0;
for (let attempt = 0; attempt < 12 && tracked < WANT_TRACKED; attempt++) {
  await page.goto('http://localhost:4200/');
  await page.getByText('Up Next', { exact: true }).first().waitFor({ timeout: 30000 });
  // Let the run get as far as it is going to on this mount.
  let progress = '';
  let stuckFor = 0;
  for (let i = 0; i < 90; i++) {
    const line = (await page.locator('body').innerText()).match(/Matching… [^\n]*/)?.[0] ?? '';
    stuckFor = line === progress ? stuckFor + 1 : 0;
    progress = line;
    if (!line && i > 2) break;
    if (stuckFor >= 30) break;
    await page.waitForTimeout(1000);
  }
  await page.goto('http://localhost:4200/more');
  await page.waitForTimeout(1500);
  tracked = Number(
    (await page.locator('body').innerText()).replace(/\s+/g, ' ').match(/Tracked (\d+)/)?.[1] ?? 0,
  );
}
if (tracked < WANT_TRACKED) {
  console.error(
    `Only ${tracked} of ${WANT_TRACKED} imported shows ever matched, so the screenshots below are of a ` +
      'part-imported library. Check that the CSV names are ones the provider in this build knows.',
  );
  process.exitCode = 1;
}

/*
 * And then the slowest data, which is not the same thing as the matching being done.
 *
 * `Tracked 3` on More says every imported show now has a real identity. It does not say
 * their episodes have been fetched, and the ninety-six-episode fixture is the last thing
 * to land — the calendar is the only screen that depends on it, which is why the wait is
 * here rather than on a screen that would look finished either way (§6.102).
 *
 * The caching runs from Up Next, so a calendar that has not filled is a reason to go back
 * there rather than to keep watching a screen where nothing is happening. This alternates,
 * which is what somebody would do, and says so if it never arrives.
 */
let filled = false;
for (let attempt = 0; attempt < 8 && !filled; attempt++) {
  if (attempt) {
    await page.goto('http://localhost:4200/');
    await page.waitForTimeout(15000);
  }
  await page.goto('http://localhost:4200/calendar');
  let steady = 0;
  let last = -1;
  for (let i = 0; i < 40; i++) {
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
}
if (!filled) {
  console.error(
    'The calendar never filled, so the screenshots below may be of a half-imported app. ' +
      'Check that the CSV names match what the metadata provider in this build knows, and ' +
      'that the seeded shows have episodes left to air.',
  );
  process.exitCode = 1;
}

/**
 * Where each screen is, and — for the ones behind More — what to press to get there.
 *
 * The `via` half is not decoration. A screen pushed onto the stack renders a navigation
 * bar with a back control; the same screen opened by URL has no history behind it, so the
 * bar appears without one, at a different size and weight. Measured on the same build:
 *
 *   Up Next, a tab      30px / 700, no back control     (an inline large title)
 *   Stats, via More     15px / 600, one back control    (a navigation bar)
 *   Stats, by URL       18px / 500, no back control     (neither)
 *
 * Every screenshot of a More screen this harness has ever taken was the third one, and a
 * design review looking at them read "the headings are inconsistent" — filed as a bug that
 * was never in the app. The screens are two deliberate conventions; the harness was the
 * third thing. It navigates the way somebody does now.
 */
const routes = [
  ['03-upnext', '/'],
  ['04-search', '/search'],
  ['05-discover', '/discover'],
  ['06-watchlist', '/watchlist'],
  ['07-more', '/more'],
  ['08-stats', '/stats', 'Stats'],
  ['09-calendar', '/calendar', 'Upcoming'],
  ['10-lists', '/lists', 'Lists'],
  ['11-people', '/people', 'People'],
  ['12-account', '/account', 'Account'],
  ['13-data', '/data', 'Your data'],
  ['14-remote', '/remote', 'Remote'],
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
  '04-search': /Quiet Harbour/,
  '05-discover': /Because you watched/,
  '07-more': /Watches\s+[1-9]/,
  '10-lists': /Lists/,
  '11-people': /People/,
  '12-account': /Account/,
  '13-data': /Export everything/,
  '14-remote': /Scan/,
  /*
   * A number, not four zeros.
   *
   * Stats had no clause, which is how three sprints of design review judged a screen
   * reading "Watched 0m · Episodes 0 · Titles 0" over a hundred and fourteen watched
   * episodes without this harness objecting — the seed's dates were fixed in 2024 and
   * the default period is this year. Both halves are fixed; this is what says so if
   * either comes back.
   */
  '08-stats': /Watched\s+[1-9]/,
  /*
   * Something saved, not the empty state.
   *
   * The clause here used to be `/Nothing saved yet|Add a note/`, which accepted either —
   * so this screen has been photographed empty for every review there has ever been, on a
   * library of a hundred and fourteen episodes, and the harness agreed that was fine. An
   * alternation that includes the empty state is not a clause about the screen; it is a
   * clause about the screen *or* its absence. `THEN` below puts something on the watchlist
   * first, the way a person would.
   *
   * The note, not the affordance to write one: since §6.106 the phone's search row can
   * save the reason with the title, so the row that arrives here carries it. A clause
   * naming the note is the strongest thing this screen can be asked for — it can only
   * pass if a row exists, was saved through the app, and kept what was said about it.
   */
  '06-watchlist': /Ana recommended/,
  '09-calendar': /Hollow Crown Saga/,
};

/**
 * And one screen judged on what it must *not* show.
 *
 * Discover's whole claim is that nothing you already track appears in it. The phone smoke
 * has a check for that now and it passes — on a library built by tracking shows directly,
 * which is not how anybody's library is built. This harness's library is the other path:
 * a TV Time CSV imported and then reconciled onto provider IDs, and a capture of this
 * screen showed "Hollow Crown Saga" suggested directly under "Because you watched Hollow
 * Crown Saga and The Long Dark".
 *
 * That observation came from looking at a picture, which is not a method. This is the
 * check that makes it reproducible, in the one harness whose conditions produce it: no
 * suggested title may be a title the same screen names as a reason.
 */
async function suggestsWhatYouTrack() {
  const body = await page.locator('body').innerText();
  const seeds = (body.match(/Because you watched ([^\n]+)/)?.[1] ?? '')
    .split(' and ')
    .map((n) => n.trim())
    .filter(Boolean);
  if (!seeds.length) return [];
  const names = await Promise.all(
    (await page.getByRole('link', { name: /^Open / }).all()).map(async (row) =>
      ((await row.getAttribute('aria-label')) ?? '').replace(/^Open /, ''),
    ),
  );
  return names.filter((name) => seeds.includes(name));
}

/**
 * Screens that need the app *used* before they are worth a photograph.
 *
 * Visiting an address is not the same as arriving somewhere, which is §6.104's whole
 * lesson, and there is a second half to it: some screens have nothing on them until
 * somebody does something. Search photographed as an empty box with a tab bar under it,
 * and the watchlist photographed as "Nothing saved yet" — on a full library, for every
 * design review this project has had. Neither is a picture of the screen.
 *
 * `USE` runs on the screen before the shot; `THEN` runs after it, to set up a later one.
 * They are separated because the searching and the saving belong to different pictures:
 * the search shot is of results, not of a note composer half-open over them.
 */
const USE = {
  '04-search': async () => {
    const box = page.getByPlaceholder(/Shows, films/i).first();
    await box.click();
    await box.fill('Quiet');
  },
};

const THEN = {
  /*
   * On Discover, not on Search — because Discover's whole content is *what you have not
   * got*, and putting the one suggestion on the watchlist before photographing it left
   * that screen empty and its clause failing. The harness using the app has to leave the
   * app in a state the next screen is still worth photographing in.
   */
  '05-discover': async () => {
    await page.goto('http://localhost:4200/search');
    await page.waitForTimeout(800);
    const box = page.getByPlaceholder(/Shows, films/i).first();
    await box.click();
    await box.fill('Quiet');
    await page.waitForTimeout(1500);
    // One thing on the watchlist, added the way somebody adds one — from a search result,
    // with the note the feature exists for.
    // `to watchlist` on the phone, `to your watchlist` on the web — the same control, named
    // two ways, which is §6.98's problem alive in an accessible name. Filed; matched here
    // either way rather than pinned to the platform this harness happens to drive.
    const add = page
      .getByRole('button', { name: /Add Quiet Harbour to (your )?watchlist/i })
      .first();
    if (!(await add.count())) {
      console.error('05-discover: nothing to add to the watchlist, so 06 will be an empty state.');
      process.exitCode = 1;
      return;
    }
    await add.click();
    await page.waitForTimeout(600);
    const note = page.getByPlaceholder(/Why did you save/i).first();
    if (await note.count()) await note.fill('Ana recommended');
    // The web opens a note composer here and the phone saves straight away — also filed.
    const save = page
      .getByRole('button', { name: /Save Quiet Harbour to (your )?watchlist/i })
      .first();
    if (await save.count()) await save.click();
    await page.waitForTimeout(800);
  },
};

/*
 * A route with no clause is a route nobody has decided anything about, and it will be
 * reviewed anyway. Fail here rather than hand over a photograph of an unknown state.
 */

/**
 * How far the rules actually reach, measured against the viewport edge.
 *
 * `docs/design/direction.md` picks LATE EDITION, and the first thing its comparison
 * names is **full-bleed rows on hairlines** — a printed artefact you mark up, where the
 * rule runs to the paper's edge and only the words are inset. `mobile/src/ui/Row.tsx`
 * says so in a comment of its own: *"Full bleed and ruled, not a card."*
 *
 * It is not. Every screen wraps its rows in `content: { padding: 16 }`, so the rule stops
 * 16pt short at both ends and the row reads as a card with three sides missing. The
 * component's claim and the screen's container disagree, and the component's claim is the
 * one written down.
 *
 * Measured rather than grepped, for the §6.120 reason: a class name is not an edge.
 * `border-b` is present and correct in both renderers, and the defect is entirely in what
 * contains them — which no clause reading `Row.tsx` could ever see.
 */
async function insetRules(page) {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const out = [];
    for (const el of document.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      const w = parseFloat(cs.borderBottomWidth);
      if (!w || w > 2 || cs.borderBottomStyle === 'none') continue;
      // A rule, not a bordered control: controls are allowed to be inset, and are the
      // reason this cannot simply count every thin bottom border on the page.
      if (parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderLeftWidth) > 0) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 80 || r.height < 8) continue;
      if (Math.abs(r.left) > 1 || Math.abs(r.right - width) > 1) {
        out.push(`${Math.round(r.left)}..${Math.round(r.right)} of ${width}: ` +
          (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 32));
      }
    }
    return out;
  });
}


/**
 * What a press actually looks like, held down and read out of the document.
 *
 * The app has **two** press conventions and does not know it. `Key` and Watching Mode's
 * pad sink to `groundWell`; `Row`, `Choice` and `Button` rise to `groundRaised`. Four
 * controls say a press rises and two say it sinks, in one product, and nothing had ever
 * compared them because each is correct on its own screen.
 *
 * The rise is the one that breaks. `groundRaised` is also the card fill — `lists.tsx`,
 * `people.tsx`, `account.tsx` and `comments/[targetId].tsx` all wrap rows in it — so a
 * press inside a card repaints to the colour it is already painted, and produces no
 * feedback at all. The sink has no such collision, because nothing is filled with
 * `groundWell` that also contains a control.
 *
 * Measured by pressing, because a style that only exists while the pointer is down is not
 * in any stylesheet a source clause could read.
 */
async function pressReadings(page) {
  const out = [];
  const targets = page.locator('[role=link], a, [role=button], button');
  const n = Math.min(await targets.count(), 6);
  for (let i = 0; i < n; i++) {
    const el = targets.nth(i);
    const box = await el.boundingBox().catch(() => null);
    if (!box || box.width < 60 || box.height < 20) continue;
    const read = () =>
      el.evaluate((node) => {
        // The nearest ancestor that actually paints, which is what a press must differ from.
        let behind = node.parentElement;
        while (behind) {
          const bg = getComputedStyle(behind).backgroundColor;
          if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') break;
          behind = behind.parentElement;
        }
        return {
          own: getComputedStyle(node).backgroundColor,
          behind: behind ? getComputedStyle(behind).backgroundColor : 'none',
          name: (node.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28),
        };
      });
    const rest = await read();
    await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 20));
    await page.mouse.down();
    await page.waitForTimeout(120);
    const held = await read();
    await page.mouse.up();
    await page.waitForTimeout(60);
    if (held.own === rest.own) continue; // not a control that paints on press
    out.push({ ...held, rest: rest.own });
  }
  return out;
}


/**
 * How far a screen's first content sits below its own title.
 *
 * Three screens centred their message — `lists.tsx`, `people.tsx`, `account.tsx` — in a
 * `flex: 1` container with `justifyContent: 'center'`, while every other screen and the
 * whole of the web top-aligned. `10-lists.png` is what that looked like: "Lists" pinned to
 * the top, some seven hundred points of nothing, and "Lists need an account" floating at
 * 55% of the viewport with the tab bar under it.
 *
 * The rule (`EMPTY_ALIGN` in `core/src/ui/screen.ts`) is that a screen with a title is a
 * screen and its message is content, so it begins where content begins. `_layout.tsx`
 * centres and is right to — it replaces the whole app before the router mounts, with no
 * title at all — which is exactly why this measures the gap *below a title* rather than
 * looking for centring: a full-screen state has nothing to be below.
 *
 * Measured, not grepped. `justifyContent: 'center'` is a legitimate declaration in a dozen
 * places and the defect is where the words land.
 */
async function floatingContent(page) {
  return page.evaluate(() => {
    const heading = document.querySelector('h1, [role="heading"]');
    if (!heading) return null;
    const top = heading.getBoundingClientRect();
    let nearest = Infinity;
    let what = '';
    for (const el of document.querySelectorAll('p, span, div, li, a, button')) {
      if (el.contains(heading) || heading.contains(el)) continue;
      const text = (el.textContent || '').trim();
      if (!text || el.children.length > 0) continue;
      const r = el.getBoundingClientRect();
      // Below the title, on screen, and not the tab bar pinned to the foot.
      if (r.top < top.bottom || r.top > window.innerHeight * 0.92 || r.width === 0) continue;
      if (r.top - top.bottom < nearest) {
        nearest = r.top - top.bottom;
        what = text.slice(0, 34);
      }
    }
    return nearest === Infinity ? null : { gap: Math.round(nearest), what };
  });
}

const unjudged = routes.map(([name]) => name).filter((name) => !MUST_SHOW[name]);
if (unjudged.length) {
  console.error(`These screens have no MUST_SHOW clause, so nothing knows what they should be showing:\n  ${unjudged.join('\n  ')}`);
  process.exitCode = 1;
}

const hollow = [];
/** Rules that stop short of the edge — the direction's first named property. */
const inset = [];
/** Screens whose first words float far below their own title. */
const floating = [];
/** Every press that repaints, and the ones that repaint to the colour behind them. */
const presses = [];
const invisible = [];
for (const [name, path, via] of routes) {
  if (via) {
    // Through More, so the screen gets the stack it would really have. Falls back to the
    // address if the link cannot be found, and says so rather than quietly photographing
    // the wrong thing.
    await page.goto('http://localhost:4200/more');
    await page.waitForTimeout(1200);
    const link = page.getByText(via, { exact: true }).first();
    if (await link.count()) {
      await link.click();
      await page.waitForTimeout(1200);
    } else {
      console.error(`${name}: no "${via}" on More, so this is a by-address screenshot.`);
      process.exitCode = 1;
      await page.goto(`http://localhost:4200${path}`);
    }
  } else {
    await page.goto(`http://localhost:4200${path}`);
  }
  await USE[name]?.();
  const want = MUST_SHOW[name];
  if (want) {
    /*
     * Wait for the thing that makes the photograph worth taking, rather than for a fixed
     * delay — a positive condition, which is the rule §6.98 and §6.102 both cost a sprint
     * to learn. Reaching these screens through More rather than by address means they
     * mount fresh and load their own data, and `shot()`'s pause is a pause rather than a
     * promise. It still fails by name if the wait runs out.
     */
    for (let i = 0; i < 20; i++) {
      if (want.test(await page.locator('body').innerText())) break;
      await page.waitForTimeout(500);
    }
  }
  await shot(name);
  if (want) {
    const body = await page.locator('body').innerText();
    if (!want.test(body)) hollow.push(`${name} (${path}) does not show ${want}`);
  }
  for (const rule of await insetRules(page)) inset.push(`${name}: ${rule}`);
  const below = await floatingContent(page);
  /*
   * A quarter of the viewport. Ordinary screens put their first words twelve to forty
   * points under the title; a centred message on an otherwise blank screen lands three
   * hundred or more. No margin beyond that: a threshold with slack in it tolerates exactly
   * the half-drift this exists to notice.
   */
  if (below && below.gap > 844 * 0.25) {
    floating.push(`${name}: "${below.what}" sits ${below.gap}pt below the title`);
  }
  for (const p of await pressReadings(page)) {
    presses.push(`${name}: "${p.name}" ${p.rest} -> ${p.own} on ${p.behind}`);
    if (p.own === p.behind) {
      invisible.push(`${name}: "${p.name}" presses to ${p.own}, which is what it sits on`);
    }
  }
  await THEN[name]?.();
  if (name === '05-discover') {
    const already = await suggestsWhatYouTrack();
    if (already.length) {
      hollow.push(`${name} (${path}) suggests what you already track: ${already.join(', ')}`);
    }
  }
}
if (hollow.length) {
  console.error(`Screenshots that do not show what makes them worth taking:\n  ${hollow.join('\n  ')}`);
  process.exitCode = 1;
}
if (inset.length) {
  console.error(`Rules that stop short of the edge, so the row reads as a card:\n  ${inset.join('\n  ')}`);
  process.exitCode = 1;
}
console.log(`\nfull-bleed: ${inset.length} inset rules across ${routes.length} routes`);
console.log(`presses measured: ${presses.length}`);
if (floating.length) {
  console.error(`Screens whose message floats instead of beginning where content begins:\n  ${floating.join('\n  ')}`);
  process.exitCode = 1;
}
for (const p of presses) console.log(`  ${p}`);
if (invisible.length) {
  console.error(`Presses that repaint to the colour behind them, so nothing happens:\n  ${invisible.join('\n  ')}`);
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

/*
 * Watching Mode, which the line above has promised since it was written and never took.
 *
 * It was the last route in the product with no photograph, and it is the flagship — the
 * emoji pad, the reaction stream, the transport, the one screen `EDGE_EXEMPT` names as
 * exempt from the screen edge. Every design judgement about it had been made from source.
 *
 * It is a dynamic route, so a deep link to `/watching/<id>` is a 404 against a static
 * export (§6.129); it has to be reached the way a person reaches it, from an episode row's
 * own "React" button. That is also why it took this long: the harness only grew a title
 * page to press it from in §6.105.
 *
 * Numbered from 22 rather than 16 on purpose. These come from the signed-out pass, which
 * runs first, so the numbers are out of creation order — but 16 to 21 are cited by name in
 * §6.126 and §6.129, and renaming a photograph the record already points at costs more
 * than a gap in a sequence. The numbers are identity, not order.
 */
// `hollow` above is already reported and this runs after it, so these get their own list
// and their own message rather than pushing into one that has been printed.
const unseen = [];
const watching = page.getByRole('link', { name: /^React along with /i }).first();
await watching.waitFor({ timeout: 20000 });
await watching.click();
await page.waitForTimeout(2500);
await shot('22-watching-start');
const before = await page.locator('body').innerText();
// The start block, not the running screen: this is what you see before you press play, and
// "Start watching" is the only thing on it that no other state prints.
if (!/Tap the moment you press play/i.test(before)) {
  unseen.push('22-watching-start is not the before-playback state');
}

await page.getByRole('button', { name: 'Start watching' }).click();
await page.waitForTimeout(1500);
// A reaction of your own, so the stream has something in it. Nothing else can put one
// there: `fetchRemoteReactions` needs an account, and an empty stream photographs as a
// blank strip that looks exactly like a broken one.
await page.getByRole('button', { name: /^React with /i }).first().click();
await page.waitForTimeout(2500);
await shot('23-watching-live');
const live = await page.locator('body').innerText();
if (!/Pause|Resume/.test(live)) unseen.push('23-watching-live has no transport, so the clock never started');
/*
 * The timecode is the one thing on this screen that proves it is *running* rather than
 * merely started, and it is the screen's whole premise. Read twice, a second apart.
 */
const readClock = async () =>
  (await page.locator('body').innerText()).match(/\b\d{1,2}:\d{2}(?::\d{2})?\b/)?.[0];
const first = await readClock();
await page.waitForTimeout(2000);
if (!first || first === (await readClock())) {
  unseen.push(`23-watching-live's clock is not moving (${first ?? 'no timecode on the screen'})`);
}

/*
 * And the drawer, which is the state a person meets when there is no television to talk
 * to. It is the only part of this screen that can say "nothing is set up" and nobody has
 * ever seen it say it.
 */
const drawer = page.getByRole('button', { name: /remote|device/i }).first();
if (await drawer.count()) {
  await drawer.click();
  await page.waitForTimeout(1500);
  await shot('24-watching-remote');
} else {
  unseen.push('24-watching-remote: nothing on Watching Mode opens the remote drawer');
}

await browser.close();
if (unseen.length) {
  console.error(`Watching Mode shots that do not show what makes them worth taking:\n  ${unseen.join('\n  ')}`);
  process.exitCode = 1;
}

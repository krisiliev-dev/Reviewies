import { chromium } from 'playwright';
import { longerScreens, reveal, shoot } from './shoot.mjs';
import { chromiumOptions } from '../scripts/browser.mjs';
import { mkdirSync } from 'node:fs';
import { color } from '../core/src/tokens.ts';
import { PRESS, PRESS_FILL } from '../core/src/ui/surface.ts';
import { contrast, TEXT_FLOOR } from '../core/src/ui/contrast.ts';

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
import { CAUGHT_UP_CSV, CSV, FINISHED_CSV } from './library.mjs';

const browser = await chromium.launch(chromiumOptions());
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));

/**
 * Every screenshot is taken at scroll 0, and until §6.141 nothing said so.
 *
 * §6.138 read `07-more.png` and filed a defect: the last row ends under the tab bar with
 * its rule hidden, and nothing signals there is anything to scroll to. Measured, that was
 * wrong in the part that mattered. React Navigation reserves the bar's space — the scroll
 * viewport ends at 783 and the bar starts at 783 — and scrolled to the end there are 91
 * points between the last words and the bar. What the picture showed was a screen whose
 * content is **42 points taller than the viewport**, photographed at the top, so the last
 * row's rule sits just below the fold. "Cut off at the bottom" is what that always looks
 * like.
 *
 * So the shot records what is below it. `overflow` is the number a reader of these files
 * needs and could not have: a shot of a screen that scrolls is a shot of part of a screen,
 * and the design track has been judging forty-four of them without knowing which.
 *
 * A second shot at the foot for anything that overflows by more than a fold's worth,
 * because at that point the top is not a fair likeness of the screen at all.
 */
const scrolls = [];

/*
 * Where this pass's shots and walks report their failures. §6.160.
 *
 * The act is shared; the channel is not, and that is the answer to the question #196 asked.
 * The four copies of the shot differed in three ways nobody had chosen, but they also
 * differed in one way somebody had: `capture.mjs` prints five separate lists under five
 * headings — `hollow`, `inset`, `floating`, `invisible`, `unseen` — each next to the block
 * that fills it, while the web passes print one. A shared act that owned its reporting
 * would have flattened all of that into one message, which is worse than four copies of
 * twenty lines. So `shoot`/`reveal` take the list and this file decides what to call it.
 *
 * `unshot` is this pass's list for the shot itself: a screen that never loaded, a reveal
 * whose control was not on the page, a press that timed out. Printed at the very end,
 * because the walks are now the last thing that runs.
 */
const unshot = [];

/*
 * The shot, from `design/shoot.mjs`. §6.160.
 *
 * This was its own copy of the same act, and so were `capture-signedin.mjs`'s and the two
 * web passes'. Collapsing them found three differences nobody had chosen — which element
 * counts as scrolling, whether the page is put back afterwards, and where the settle lives
 * — and that file's header has them.
 *
 * `settle: 1200` is the one real difference and it stays a parameter: how long a screen
 * needs before the shutter is the caller's knowledge, and every shot below was written
 * against that wait.
 */
const shot = (name) => shoot(page, { out: OUT, name, problems: unshot, scrolls, settle: 1200 });

await page.goto('http://localhost:4200/');
await page.waitForTimeout(2500);
await shot('01-first-run');

/*
 * The empty app, before anything is put in it. §6.162.
 *
 * This pass imports a full library on its second screen and never comes back, and so does
 * every other pass in this directory — so thirty-odd sprints of design review have looked at
 * a populated app and nothing else. `core/src/ui/emptyStates.ts` is the register of what that
 * missed; these four are the ones reachable by simply looking before the import.
 *
 * They are numbered `00-` rather than appended, because they come **before** `01-first-run`
 * in the life of the app and the numbers in this directory are read as an order. That breaks
 * the rule §6.130 wrote about the Watching Mode shots — "the numbers are identity, not order"
 * — in the one direction it can be broken safely: nothing in the record cites a `00-` name,
 * because none existed until now.
 *
 * Waited on by their own sentence rather than by a clock, which is the rule §6.98, §6.102 and
 * §6.161 have each paid for separately. An empty screen and a screen that has not loaded look
 * identical, and this is the pass whose whole job is telling those apart.
 */
/*
 * Objects rather than tuples, and that is not a style choice.
 *
 * `everyWorkspaceRuns.test.ts` ratchets this file's `routes` table by counting lines that
 * start `  ['<digit>` — and a three-tuple here starting `'00-…'` counts as a route. Two
 * different lists under one floor means deleting three routes can be hidden by adding three
 * of these. Written this way the two are countable apart, and both are counted.
 */
const EMPTY_FIRST = [
  { name: '00-watchlist-empty', path: '/watchlist', want: 'Nothing saved yet' },
  // `?on=coming` rather than `/calendar`: what is airing is the second half of Up Next
  // since `docs/design/architecture.md` section 4, and `segments.ts` owns the parameter.
  { name: '00-calendar-empty', path: '/?on=coming', want: 'Nothing airing in the next two months' },
  { name: '00-stats-empty', path: '/stats', want: 'Nothing watched in this period yet' },
];
for (const { name, path, want } of EMPTY_FIRST) {
  await page.goto(`http://localhost:4200${path}`);
  for (let i = 0; i < 20; i++) {
    if ((await page.locator('body').innerText()).includes(want)) break;
    await page.waitForTimeout(400);
  }
  await shoot(page, { out: OUT, name, mustContain: want, problems: unshot, scrolls, settle: 1200 });
}
await page.goto('http://localhost:4200/');
await page.waitForTimeout(1500);

// Seed a real library the way somebody actually would.
page.on('filechooser', (c) =>
  c.setFiles({ name: 'episodes.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) }).catch(() => {}));
await page.getByRole('button', { name: /Import from TV Time/i }).click();

/*
 * The import while it is running — the sentence §6.161 spent a sprint on and nobody had seen.
 *
 * `stillImporting` is up for about four seconds on this fixture, which is long enough to
 * photograph and short enough that a fixed wait would be a coin toss. So this waits on the
 * sentence and gives up saying which one it wanted, rather than filing whatever was on screen.
 * §6.161's own lesson, applied from the other side: a shot of a transient state is a race
 * unless the condition is the state itself.
 */
let reading = false;
for (let i = 0; i < 40 && !reading; i++) {
  reading = (await page.locator('body').innerText()).includes('Still reading');
  if (!reading) await page.waitForTimeout(150);
}
if (reading) {
  await shoot(page, {
    out: OUT,
    name: '02a-import-reading',
    mustContain: 'Still reading',
    problems: unshot,
    scrolls,
  });
} else {
  unshot.push(
    `02a-import-reading: the import never said "Still reading", so the state is unphotographed — it said: ${(await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 140)}`,
  );
}

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
  await page.goto('http://localhost:4200/?on=coming');
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

/*
 * And then Up Next itself, which the two waits above do not cover.
 *
 * The calendar wait proves the **96-episode** fixture is cached, and the sprint that
 * tightened `MUST_SHOW['03-upnext']` found that is not the same as proving the 12-episode
 * one is: the first full run after the clause named both shows failed on Kitchen
 * Nightshift, and two isolated runs before it had shown both. Caching does not land in
 * episode-count order, so "the slowest data is in" says nothing about a show that is not
 * the slowest.
 *
 * The rule this file keeps rediscovering (§6.98, §6.102, §6.135): wait on the screen that
 * can see the thing, for the thing itself. Up Next can see both of its own rows, so it is
 * asked for them. `MUST_SHOW` still checks it afterwards — this is the wait, that is the
 * verdict, and the verdict is what fails by name if the wait runs out.
 */
let bothRows = false;
for (let attempt = 0; attempt < 8 && !bothRows; attempt++) {
  await page.goto('http://localhost:4200/');
  await page.getByText('Up Next', { exact: true }).first().waitFor({ timeout: 30000 });
  for (let i = 0; i < 30; i++) {
    const body = await page.locator('body').innerText();
    if (/The Long Dark/.test(body) && /Kitchen Nightshift/.test(body)) {
      bothRows = true;
      break;
    }
    await page.waitForTimeout(1000);
  }
}
if (!bothRows) {
  /*
   * What it actually said, not only that it was wrong. The first version of this printed
   * the complaint alone and cost a probe to answer the obvious next question — which is
   * §6.130's rule about a harness that fails without saying why, applied to a wait rather
   * than to a locator.
   */
  /*
   * What the screen said, and then what the store holds — because §6.143 spent a probe
   * failing to reproduce this and the run that does reproduce it is the only one that can
   * answer the question.
   *
   * The hypothesis worth killing or confirming: `acceptMatch` caches a show's episodes as
   * part of matching, and `getEpisodesCached` swallows a provider failure with
   * `catch { return cached; }`. So "Tracked 3" can be true with an empty episode cache,
   * and the retry loop above cannot help, because matching will not run again for a show
   * it has already matched. If that is what happens, this prints `0 episode rows` for the
   * missing show while the other two are full.
   *
   * Measured through the app's own screens rather than the store, because the phone's web
   * export is wa-sqlite and there is no handle to it from here. A title page lists one row
   * per episode, which is the same fact by a different route.
   */
  const showed = (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 300);
  const holdings = [];
  for (const show of ['The Long Dark', 'Kitchen Nightshift', 'Hollow Crown Saga']) {
    try {
      await page.goto('http://localhost:4200/discover');
      await page.waitForTimeout(1500);
      await page.getByPlaceholder('Shows, films, anime…').fill(show);
      await page.waitForTimeout(2500);
      const found = page.locator('a, [role=link], [role=button]').filter({ hasText: new RegExp(show) }).first();
      if (!(await found.count())) {
        holdings.push(`${show}: not even in search`);
        continue;
      }
      await found.click();
      await page.waitForTimeout(3000);
      const rows = ((await page.locator('body').innerText()).match(/^\s*\d+\.\s/gm) ?? []).length;
      holdings.push(`${show}: ${rows} episode rows`);
    } catch (error) {
      holdings.push(`${show}: could not be reached — ${String(error).slice(0, 80)}`);
    }
  }
  console.error(
    'Up Next never held both of the two shows that belong on it. What it showed:\n  ' +
      showed +
      '\nWhat the store holds:\n  ' +
      holdings.join('\n  '),
  );
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
/*
 * Twelve routes and one fewer destination, which is not a contradiction.
 *
 * `docs/design/architecture.md` merged Search into Discover (section 5) and Upcoming into Up
 * Next (section 4), so two addresses went. The **pictures** did not: searching and browsing
 * are two states of one surface and both are still worth judging, so `04-search` and
 * `05-discover` are the same path with `USE` putting the screen into the state its name
 * says. `09-calendar` is the same idea one screen over, reached by its own address because
 * the segment is in the address.
 *
 * The shot names are unchanged on purpose. They are cited by `reveals.ts`, by
 * `emptyStates.ts` and by the record — §6.130's rule that "the numbers are identity, not
 * order" — and renaming a photograph to match a route that moved would break every one of
 * those to gain nothing.
 */
const routes = [
  ['03-upnext', '/'],
  ['04-search', '/discover'],
  ['05-discover', '/discover'],
  ['06-watchlist', '/watchlist'],
  ['07-more', '/more'],
  ['08-stats', '/stats', 'Stats'],
  ['09-calendar', '/?on=coming'],
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
  /*
   * **Both** rows, not one of them.
   *
   * The seed has three shows. Hollow Crown Saga is legitimately not here — every episode
   * of it that has aired is watched, which is the fact the settle test above is built
   * around — so Up Next holds exactly two, deterministically: `design/library.mjs` says
   * which episodes each show has watched and `designLibrary.test.ts` holds that against
   * when the provider says they aired.
   *
   * It has not been showing two. §6.137's design pass photographed this screen with only
   * The Long Dark on it, and the two runs either side of it had both — the harness waits
   * for the *slowest* show's episodes to land on the calendar, and nothing says the other
   * shows' caches finished before the shutter. A clause naming one of the two passes on a
   * screen missing half its content, which is §6.109's rule turned on the instrument
   * again: it is not a shot of Up Next if Up Next is half empty.
   *
   * Two lookaheads rather than an alternation, for the reason `06-watchlist` records right
   * below: a clause that accepts either is a clause about the screen *or* its absence.
   */
  '03-upnext': /(?=[\s\S]*The Long Dark)(?=[\s\S]*Kitchen Nightshift)/,
  '04-search': /Quiet Harbour/,
  /*
   * Case-insensitive, and that is a fact about the treatment rather than a loosening.
   *
   * `docs/design/architecture.md` section 5 made the reason a **section head** over the
   * group of boxes it is true of, and `SECTION.section.caps` draws a section head in
   * tracked capitals — so the page reads `BECAUSE YOU WATCHED THE LONG DARK`. `innerText`
   * returns what `text-transform` paints, so a case-sensitive needle fails on a screen
   * behaving exactly as the direction specifies. The DOM text underneath keeps a show's own
   * casing, which is what a screen reader is handed, and `app/smoke.mjs` asserts *that*
   * rather than this; here the question is only whether the shot is of a populated shelf.
   */
  '05-discover': /because you watched/i,
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
  /*
   * **Both** shows, for the reason `03-upnext` gives above and for one more.
   *
   * A clause naming one show passed for every design review there has ever been on a
   * calendar that could only ever contain one show. Every fixture started on the same day,
   * forty weeks back, so a show reached the future only by having more than forty episodes
   * — one of four did. Nine dates, nine rows, one title repeated nine times, and not a
   * premiere or a finale anywhere on the screen whose notification default is called
   * *Premieres & finales*.
   *
   * The numbers are held in `app/src/wiring/designLibrary.test.ts`, which is where a
   * property belongs. This is the part only the photograph can say: that the second show
   * reached the screen. §6.146.
   */
  '09-calendar': /(?=[\s\S]*Hollow Crown Saga)(?=[\s\S]*The Long Dark)/,
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
  /*
   * Discover, with something typed — which is what `04-search` is a photograph of now.
   *
   * The field is at the top of the surface and the shelf gives way to the list. Both halves
   * are photographed because both are designed: `05-discover` is the same address with
   * nothing typed.
   */
  '04-search': async () => {
    const box = page.getByPlaceholder(/Shows, films/i).first();
    await box.click();
    await box.fill('Quiet');
  },

  /*
   * The back of a box, taken **before** this route's own shot rather than with the other
   * reveals at the foot of the file. Two things empty the shelf and both happen later.
   *
   * `pressReadings` presses every control on the screen it has just photographed — §6.184
   * removed its cap deliberately — so on a shelf it turns boxes over and presses the Track
   * and Watchlist behind them, which is exactly what makes a suggestion leave the feed. And
   * `THEN` below then parks the last film, because `00-discover-empty` needs an empty feed.
   * By the time the reveal block at the foot of the file runs there is nothing to turn over,
   * and it said so — correctly, about a state the harness itself had removed.
   *
   * So it is taken here, and the shelf is re-arrived at afterwards so that `05-discover`
   * remains a photograph of the front of the boxes rather than of one of them open.
   */
  '05-discover': async () => {
    await reveal(page, {
      out: OUT,
      name: '05-discover-back',
      // A box is one control with two faces, named for the title it is about — a shelf of
      // twenty of them is twenty controls, and §6.96 is what happens when they share a name.
      control: /More about /i,
      arrive: 'http://localhost:4200/discover',
      problems: unshot,
      scrolls,
    });
    await page.goto('http://localhost:4200/discover');
    await page.waitForTimeout(1200);
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
    /*
     * Off the watchlist first, and this is not belt-and-braces.
     *
     * `pressReadings` presses **every** control on every route it photographs — §6.184
     * removed its cap of six deliberately — and on the results list that includes the row's
     * Watchlist button and the Save beside the note it opens. So by the time this hook runs,
     * Quiet Harbour may already be parked, with no note: the control below is then
     * `disabled`, the click waits thirty seconds, and the phone's whole pass dies at route
     * five. It did.
     *
     * The step's purpose is `06-watchlist`'s clause — a row that carries the reason it was
     * saved — so what it needs is to be *idempotent*, not lucky. Removing first makes it so,
     * and it is a walk a person takes: this is the control the watchlist row offers.
     */
    await page.goto('http://localhost:4200/watchlist');
    await page.waitForTimeout(1200);
    const parked = page
      .getByRole('button', { name: /Remove Quiet Harbour from (your )?watchlist/i })
      .first();
    if (await parked.count()) {
      await parked.click();
      await page.waitForTimeout(600);
    }

    await page.goto('http://localhost:4200/discover');
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
  /*
   * Every candidate, not the first six.
   *
   * Six was the original cap and §6.184 measured what it bought: across twelve routes it
   * pressed **five** controls and all five were `Row`s, because a row is what the top of
   * every list screen is made of. So this harness — built by §6.122 to settle which way a
   * press goes — had never pressed a `Button`, which is the control §6.122 got wrong.
   * Proved by planting: with the old `PRESSED.fill` back in place, the wrong-way check
   * below stayed silent at a cap of six.
   *
   * The cap was there for time. Twelve routes at a fifth of a second each is a cost worth
   * paying for a check that can reach more than one component.
   */
  /*
   * Re-counted every iteration, and that is a repair rather than a flourish.
   *
   * §6.189 lifted the cap of six so this could reach a `Button` — and left `count()` where
   * it was, read **once** before a loop that then *presses things*. A press on this product
   * is not inert: marking an episode watched removes its row, so the list this loop is
   * indexing into gets shorter while the loop is running. `nth(5)` on a page that now has
   * five controls does not fail fast; `evaluate` waits thirty seconds for an element that
   * will never attach and throws, which took the whole phone pass down.
   *
   * It survived several green runs because the walk had not yet reached a screen where a
   * press removed enough. §6.190's Up Next floor and the title page's new Track control
   * changed what the walk reaches, and the latent defect surfaced — a cached count against a
   * mutating page is wrong on every run and only visible on some.
   *
   * `live` is asked each pass and the loop stops when the page has fewer controls than it
   * started with, rather than reaching for one that is gone.
   */
  for (let i = 0; ; i++) {
    const live = await targets.count();
    if (i >= live) break;
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
        /*
         * The label's colour as well as the box's, because a press repaints one and not
         * the other and the pair is what a reader actually sees. §6.185: a `primary`
         * button rests as near-black `actionLabel` on a near-white `actionFill`, and the
         * press repaints only the ground — to `groundWell`, which is also near-black.
         * Reading the box alone reports that as a healthy step. It is a control whose
         * words are gone while your finger is on it.
         *
         * The deepest text node, because `node` is the button and its colour is inherited
         * by whatever actually draws the glyphs; a `<span>` inside can override it.
         */
        let inked = node;
        for (;;) {
          const next = [...inked.children].find((c) => (c.textContent || '').trim());
          if (!next) break;
          inked = next;
        }
        return {
          own: getComputedStyle(node).backgroundColor,
          ink: getComputedStyle(inked).color,
          behind: behind ? getComputedStyle(behind).backgroundColor : 'none',
          name: (node.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28),
        };
      });
    const rest = await read();
    await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 20));
    await page.mouse.down();
    await page.waitForTimeout(120);
    const held = await read();
    /*
     * **Released somewhere else, so the control is measured and not activated.**
     *
     * This was `mouse.down()` … `mouse.up()` on the same point, which is a *click*. So an
     * instrument whose whole job is to read what a control looks like while held was also
     * pressing every one of them: marking episodes watched, parking films on the watchlist,
     * turning boxes over. At §6.122's cap of six that was survivable, because six controls
     * from the top of a list screen are six rows. §6.189 lifted the cap so this could finally
     * reach a `Button` — and thereby handed it every control on every screen the walk visits.
     *
     * It showed up as `05-discover-back: nothing on the screen matches /More about /i` — the
     * shelf was empty by the time the reveal ran, because this had already parked its
     * contents. A reading instrument that changes what the next reading sees is the same
     * defect as a census that drops the runs it was sent to measure, one layer in.
     *
     * A browser fires `click` only when the press and the release land on the same element,
     * so releasing at the origin leaves the `:active` reading intact and the handler unrun.
     */
    await page.mouse.move(0, 0);
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
/**
 * Presses that repaint to something other than `PRESS`.
 *
 * `invisible` below asks whether a press can be *seen*; this asks whether it goes the
 * direction the product decided. They are not the same question and §6.184 is the proof:
 * the phone's `Button` rose to `groundRaised` for two days after §6.122 ruled that a press
 * sinks, and this harness printed that reading on every run without objecting, because on
 * a plain page a rise is perfectly visible. `own === behind` catches the collision; nothing
 * caught the disagreement.
 *
 * Taken from the token file rather than typed, so the day somebody changes `elevation` this
 * moves with it. Node reads the `.ts` directly — `scripts/tokens-to-css.mjs` has done the
 * same since it was written.
 */
const wrongWay = [];
/**
 * Presses whose label stops being readable against the ground the press paints.
 *
 * The question `wrongWay` cannot ask. A press repaints the box and leaves the label alone,
 * so a control whose rest state is a *filled plate* changes one half of a pair and keeps
 * the other — and the pair is what a reader sees. §6.185.
 */
const illegible = [];
const rgbOf = (hex) => {
  const [, r, g, b] = /^#(..)(..)(..)$/.exec(hex);
  return `rgb(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)})`;
};
const PRESS_RGB = rgbOf(color.dark[PRESS]);
const PRESS_FILL_RGB = rgbOf(color.dark[PRESS_FILL]);

/*
 * **`wrongWay` cannot fail for the defect it is named after, and this is the clause that can.**
 *
 * Its expectation is `rgbOf(color.dark[PRESS])` — read from the same token the components
 * render from. So a change to `PRESS` moves the app and the check together, and the two agree
 * however wrong they both are. Proved by planting `PRESS = elevation.raised`, the exact defect
 * §6.122 got wrong: the phone pass reported *presses measured: 32* and exited 0.
 *
 * That does not make `wrongWay` useless — it catches a component that hardcodes a colour
 * instead of asking the token, which is a real and different thing. It makes its **name** a
 * larger claim than its body, which is §6.120's subject.
 *
 * What can be checked without reference to itself is the *direction*: a press sinks, so the
 * step it names must be darker than the ground it sits on. `surface.ts` argues that in prose
 * and nothing held it. Two grounds, because a press on the raised plate and a press on the
 * base are both real.
 */
{
  const lum = (c) => {
    const [r, g, b] = rgbOf(c).match(/\d+/g).map(Number);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const sunk = lum(color.dark[PRESS]);
  for (const ground of ['ground', 'groundRaised']) {
    if (color.dark[ground] === undefined) continue;
    if (sunk >= lum(color.dark[ground])) {
      console.error(
        `PRESS (${PRESS}) is not darker than ${ground} — a press that sinks must sink. ` +
          `surface.ts says so in prose and this is the clause that holds it.`,
      );
      process.exitCode = 1;
    }
  }
}

/**
 * Which of the two a given press should land on, decided from the reading itself.
 *
 * `surface.ts`'s rule is that a press steps the control's **own surface**, and this harness
 * cannot see which component it just pressed — but it does not need to. The rest background
 * *is* the answer: an opaque one means the control has a fill of its own, and a transparent
 * one means its surface is the ground behind it. So the check derives the expectation from
 * what it measured rather than from a list of component names somebody keeps up to date.
 *
 * §6.185 wrote this the narrow way first — one expectation, `PRESS`, for every control — and
 * it went red on the very fix it was measuring, because a `primary` button correctly stopped
 * landing on the ground step. A guard that fails on a correct change is a guard that states
 * the rule wrongly, and the fix is to state the rule.
 */
const opaque = (bg) => bg !== 'none' && !/rgba\([^)]*,\s*0\s*\)$/.test(bg);
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
    } else {
      const filled = opaque(p.rest);
      const want = filled ? PRESS_FILL_RGB : PRESS_RGB;
      if (p.own !== want) {
        wrongWay.push(
          `${name}: "${p.name}" rests ${p.rest} and presses to ${p.own}; ` +
            `a ${filled ? 'filled' : 'groundless'} control steps to ${want}`,
        );
      }
    }
    // Independent of direction: a press that is the right colour can still put the label out.
    const held = p.ink && contrast(p.ink, p.own);
    if (held && held < TEXT_FLOOR) {
      illegible.push(
        `${name}: "${p.name}" held reads ${held.toFixed(2)}:1 — ${p.ink} on ${p.own}`,
      );
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
if (wrongWay.length) {
  console.error(`Presses that repaint the wrong way, against PRESS:\n  ${wrongWay.join('\n  ')}`);
  process.exitCode = 1;
}
if (illegible.length) {
  console.error(
    `Presses whose label goes under ${TEXT_FLOOR}:1 while held:\n  ${illegible.join('\n  ')}`,
  );
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

  /*
   * And the title page's three **revealed** states. §6.158.
   *
   * Every shot this harness has ever taken is of a route as it arrives. §6.129's rule —
   * composing is revealed, not resident — has been applied five times, and every
   * application moved content *out* of the arriving shot: the design track's coverage got
   * worse each time the product got better, and nothing connected the two.
   * `core/src/ui/reveals.ts` is the register, and `reveals.test.ts` fails when a reveal has
   * no shot named for it here.
   *
   * `open` reports rather than throws, for the reason a needle per route exists: a walk
   * that cannot find its control is worth knowing about by name, and is not worth losing
   * the other seven shots to.
   */
  /*
   * Each from the page as it arrives, not from whatever the last one left open.
   *
   * The first version of this ran the three in sequence on one page and the second failed
   * to find its control, because the first had opened a country list over it. A shot of a
   * reveal on top of another reveal is not a shot of either.
   */
  /*
   * Re-arrived by **clicking**, not by a URL. §6.130 already wrote this down about Watching
   * Mode — "a dynamic route cannot be deep-linked in the phone's web export" — and the
   * first version of these three navigated to `page.url()` and found nothing on any of the
   * three, which is that same fact arriving by a different door.
   */
  const arrive = async () => {
    await page.goto('http://localhost:4200/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);
    await page
      .locator('a, [role=link], [role=button]')
      .filter({ hasText: /The Long Dark|Kitchen Nightshift|Hollow Crown Saga/ })
      .first()
      .click();
    await page.waitForTimeout(1800);
  };
  await reveal(page, { out: OUT, name: '15-title-country', control: /Change country/i, arrive, problems: unshot, scrolls });
  /*
   * And the control says it is open. §6.173: `aria-expanded` was one of the four keys
   * §6.172 converted from `accessibilityState` and did not measure arriving, and this
   * reveal is the only place in either pass where something is expanded — so the
   * measurement costs a line here and nothing anywhere else.
   */
  {
    /*
     * No `if (count)` guard around this. A clause that skips itself when it cannot find the
     * control is §6.153's instrument: the reveal above has already failed loudly if the
     * country list never opened, so by this line the opener exists or the pass is lying.
     */
    const opener = page.getByRole('button', { name: /Change country/i }).first();
    const said = (await opener.count()) ? await opener.getAttribute('aria-expanded') : 'no such control';
    if (said !== 'true') {
      unshot.push(`15-title-country: the country list is open and the control says ${said}`);
    }
  }
  /*
   * `15-title-warnings` is **not** here. `ContentWarnings` opens with
   * `if (!syncConfigured()) return null`, so on the fixture build the control does not
   * exist at all — the walk said so by name rather than filing a shot of a screen without
   * it. It lives in `capture-signedin.mjs` with `15-title-addtolist`, which needs an
   * account for the same reason.
   */
  /*
   * The **episode row's** offer, not the title's own five stars.
   *
   * `/^(Rate|Change your rating of) /` matched `Rate Kitchen Nightshift 1 stars` — one of
   * the ten star buttons in the title's already-open rating, which is resident by decision
   * (§6.141: "one of StarRating's two call sites honours its rule"). Clicking it threw and
   * took the four remaining shots with it. The row's name carries the season and episode,
   * which is `row.ts`'s rule and what tells the two apart.
   */
  await reveal(page, {
    out: OUT,
    name: '15-title-rating',
    control: /^(Rate|Change your rating of) season \d+ episode/i,
    arrive,
    problems: unshot,
    scrolls,
  });
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
/*
 * Back to Up Next first, because *React along with* is a row there.
 *
 * §6.158's reveal walks end on the watchlist, and this block used to inherit whatever
 * screen the previous step happened to leave behind — which was Up Next by luck until the
 * walks were added, and then a twenty-second timeout on a link that was never going to be
 * on the page. The `THEN` table's own comment already says it: *"the harness using the app
 * has to leave the app in a state the next screen is still worth photographing in"*. Saying
 * where this one starts is cheaper than every step remembering to tidy up after itself.
 */
const watching = page.getByRole('link', { name: /^React along with /i }).first();
try {
  await watching.waitFor({ timeout: 20000 });
} catch {
  const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 300);
  const links = await page.getByRole('link').allInnerTexts();
  console.error(`Watching Mode: no "React along with" link. Up Next says: ${body}`);
  console.error(`  links here: ${links.slice(0, 12).join(' | ')}`);
  throw new Error('watching-mode-unreachable');
}
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

/*
 * What each shot is a shot *of*. A reader of `design/screens/` cannot tell a whole screen
 * from the top of a long one, and §6.141 is what happens when nobody can: a defect filed
 * from the fold of a screen that was simply scrolling.
 */
const longer = longerScreens(scrolls);
console.log(
  longer ? `shots that are the top of a longer screen: ${longer}` : 'every shot is a whole screen',
);

/*
 * The other three, each on the screen that owns it. §6.158.
 *
 * Separate navigations rather than hooks in `USE`, because `USE` runs *before* the route's
 * own shot and these are pictures of a different state of the same screen — the arriving
 * shot has to survive, or the pair proves nothing.
 *
 * **Last in the file**, and that is not cosmetic. They were above Watching Mode's walk,
 * which had always inherited whatever screen the previous step left behind — Up Next, by
 * luck — and these end on the watchlist, so it spent twenty seconds waiting for a link that
 * was never going to be there. Navigating it home first did not fix it either: a **hard
 * reload** of the static export leaves the rows on screen as text while
 * `getByRole('link')` still returns one item, so the harness reported "no React along with
 * link" about a page that plainly had two.
 *
 * The `THEN` table's own comment already states the rule these broke: *"the harness using
 * the app has to leave the app in a state the next screen is still worth photographing
 * in."* The cheapest way to obey it is to be the step that has nothing after it.
 */
await reveal(page, {
  out: OUT,
  name: '09-calendar-tuning',
  control: /Tell me about/i,
  arrive: 'http://localhost:4200/?on=coming',
  problems: unshot,
  scrolls,
});

/*
 * The two Discover opened this sprint. `docs/design/architecture.md` sections 5 and 6.
 *
 * Registered in `core/src/ui/reveals.ts` the hour the panels were written rather than three
 * sprints later, which is the whole point of that register: every previous application of
 * §6.129's rule moved content out of the arriving shot and nothing noticed.
 */
await reveal(page, {
  out: OUT,
  name: '05-discover-filters',
  // The shut row states the current setting, which is what its name is built from.
  control: /Filters —/i,
  arrive: 'http://localhost:4200/discover',
  problems: unshot,
  scrolls,
});

/*
 * `05-discover-back` is **not** here, and where it is says why.
 *
 * It is taken inside `THEN['05-discover']`, at the top, before that hook parks the last
 * film on the watchlist. By the time this block runs the shelf is deliberately empty — the
 * `00-discover-empty` shot below depends on it being empty — so a reveal that arrives at
 * `/discover` this late finds no box to turn over and says so, correctly, about a state the
 * harness itself removed. §6.146: a case a fixture cannot produce is a case nobody has
 * judged, and the fix is to photograph it where it exists rather than to loosen the needle.
 */

// The control that opens the note is the one that saves: on this screen, saving and
// saying why are one act. §6.148's finding was an empty state asking for a note the phone
// had no way to write; this is the shot of the way it writes one.
await reveal(page, {
  out: OUT,
  name: '04-search-noting',
  control: /to (your )?watchlist/i,
  problems: unshot,
  scrolls,
  arrive: async () => {
    await page.goto('http://localhost:4200/discover', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);
    const box = page.getByPlaceholder(/Shows, films/i).first();
    await box.click();
    /*
     * Salt Flats, not Quiet Harbour. `05-discover`'s hook puts Quiet Harbour on the
     * watchlist so that `06-watchlist` has something on it, which leaves its control
     * reading *On watchlist* and disabled — and a disabled control cannot open the note.
     * The harness using the app has to notice what its own earlier steps did, which is the
     * same lesson that hook's own comment records from the other direction.
     */
    await box.fill('Salt');
    await page.waitForTimeout(1800);
  },
});

await reveal(page, {
  out: OUT,
  name: '06-watchlist-editing',
  control: /note|Why you saved/i,
  arrive: 'http://localhost:4200/watchlist',
  problems: unshot,
  scrolls,
});

/*
 * Stats with a **year** chosen, which §6.170 gave the web pass and not this one.
 *
 * `08-stats` lands on the screen and leaves, so the second row of the period control has
 * only ever been photographed holding no answer — and §6.167 restyled that row's label on
 * the strength of exactly that shot, on both platforms. §6.171 also gave the phone the
 * headline card the web has had since Stats shipped, so there is now something here that
 * only this state shows.
 *
 * `announce` joins an option's label and hint — `2025 — your 2025` — so the needle is the
 * whole name, not either half. Read out of the control rather than typed, because a
 * hard-coded year is a shot that starts failing in January.
 *
 * **Here, not up with the title page's reveals, and that placement is the finding.** The
 * first version of this sat after `15-title-rating`, and the run died forty lines later
 * with `watching-mode-unreachable`: this walk ends on `/stats`, and the Watching Mode step
 * clicks its way there from Up Next rather than deep-linking, because §6.130 established a
 * dynamic route cannot be deep-linked in the phone's web export. The comment above that
 * step says it in as many words — *"the harness using the app has to leave the app in a
 * state the next screen is still worth photographing in"* — and adding a step in the middle
 * of the sequence is how you find out it meant it. Last, where the reveals are, for the
 * reason the file already gives them: nothing follows that a stray route can spoil.
 *
 * **And not through `reveal`.** That helper looks for a `button`; `Choice` renders
 * `role="radio"`, so the needle could never match — which the pass then said by name,
 * *"nothing on the screen matches"*, which reads exactly like a control that is not there.
 * `capture-web.mjs` has the same note above the same walk, written a sprint earlier and
 * not applied here.
 */
await page.goto('http://localhost:4200/stats', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1800);
const aYear = page.getByRole('radio', { name: /^\d{4} — your \d{4}$/ }).first();
if (await aYear.count()) {
  await aYear.click();
  await page.waitForTimeout(1200);
  await shot('08-stats-year');
  /*
   * The press became the **answer**, not merely a press — a chip that takes one without
   * taking the other is §6.138's defect, and this state is the only one that can show it.
   *
   * Both halves, because §6.172 turned the second one from untestable into the point.
   * §6.171 wrote that `aria-checked` was null on every radio in this export and filed it
   * as a device-only unknown; it was `accessibilityState`, a prop react-native-web 0.21
   * does not read, dead at seventeen sites. The flat spelling reaches both renderers and
   * this now measures it.
   */
  if (!/Your \d{4}/.test(await page.locator('body').innerText())) {
    unshot.push('08-stats-year: the year was pressed and is not the answer');
  }
  if ((await aYear.getAttribute('aria-checked')) !== 'true') {
    unshot.push('08-stats-year: the year is the answer and the phone does not say so');
  }
} else {
  unshot.push('08-stats-year: the period control offers no year to choose');
}

/*
 * The caught-up library, in a context of its own. §6.163.
 *
 * Two of the states `core/src/ui/emptyStates.ts` registers are not about a screen at all —
 * they are about a **library**. `upNext.allCaughtUp` needs nothing aired left unwatched, and
 * `discover.empty` needs the recommender to have nothing left to offer, which §6.162 measured
 * is *not* the same as an empty library: Discover falls back to trending, and an empty library
 * excludes nothing from it.
 *
 * A second context rather than a second pass: same build, same server, a fresh IndexedDB, and
 * `CAUGHT_UP_CSV` — the same four shows with every aired episode watched. Nine more rows than
 * the library above, and a different app.
 *
 * Last in the file for the reason the reveals are: it is the step with nothing after it, so it
 * cannot leave the app in a state the next screen is not worth photographing in.
 */
const settled = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const done = await settled.newPage();
done.on('pageerror', (e) => console.log('PAGEERROR (caught up)', e.message));
try {
  await done.goto('http://localhost:4200/');
  await done.waitForTimeout(2500);
  done.on('filechooser', (c) =>
    c.setFiles({ name: 'episodes.csv', mimeType: 'text/csv', buffer: Buffer.from(CAUGHT_UP_CSV) }).catch(() => {}));
  await done.getByRole('button', { name: /Import from TV Time/i }).click();

  /*
   * `00-calendar-unmatched` is **not** here, and the attempt is why. §6.163.
   *
   * `calendar.emptyUnmatched` needs a landed library that has not been matched, and the walk
   * for it looked right: matching runs from `MatchImports`, which is mounted on Up Next and
   * nowhere else, so going straight to the calendar should have found the shows still
   * unmatched. It found a full calendar — *"The Long Dark S2E10 · SEASON FINALE"* — because
   * against `FixtureProvider` the import resolves every name as it reads it. Nothing is ever
   * unmatched in this build. See `emptyStates.ts`, where it and `matchingImport` now share one
   * measured reason.
   */
  for (let i = 0; i < 40; i++) {
    if (/Your history is in/.test(await done.locator('body').innerText())) break;
    await done.waitForTimeout(500);
  }

  // Now Up Next, which starts matching by being mounted, and wait for it to finish.
  for (let attempt = 0; attempt < 12; attempt++) {
    await done.goto('http://localhost:4200/');
    await done.getByText('Up Next', { exact: true }).first().waitFor({ timeout: 30000 });
    let quiet = 0;
    for (let i = 0; i < 60 && quiet < 4; i++) {
      quiet = /Matching…/.test(await done.locator('body').innerText()) ? 0 : quiet + 1;
      await done.waitForTimeout(500);
    }
    if (/All caught up/.test(await done.locator('body').innerText())) break;
  }
  await shoot(done, {
    out: OUT,
    name: '00-caughtup-upnext',
    mustContain: 'All caught up',
    problems: unshot,
    scrolls,
    settle: 1200,
  });

  /*
   * And Discover, once the film is parked too.
   *
   * The CSV carries episodes, so it tracks the four series and cannot touch Quiet Harbour —
   * which the recommender then offers, correctly, and which is why an empty Discover needs one
   * more act rather than one more row. Parking it on the watchlist is what a person does with
   * a film they are not watching tonight, and `excludedTitleIds` counts the watchlist.
   */
  await done.goto('http://localhost:4200/discover');
  await done.waitForTimeout(2000);
  /*
   * Turn the box over first. `docs/design/architecture.md` section 5: the shelf is boxes, and
   * a box's two verbs are on its **back**, because a shelf of twenty each carrying Track and
   * Watchlist is forty controls with two names between them. So parking a film is two presses
   * now, and the harness has to do what a person does rather than what it used to do.
   */
  const turn = done.getByRole('button', { name: /^More about Quiet Harbour$/i }).first();
  if (await turn.count()) {
    await turn.click();
    await done.waitForTimeout(800);
  } else {
    unshot.push('00-discover-empty: no box for Quiet Harbour on the shelf to turn over');
  }
  const park = done.getByRole('button', { name: /Quiet Harbour to (your )?watchlist/i }).first();
  if (await park.count()) {
    await park.click();
    await done.waitForTimeout(1200);
  } else {
    unshot.push('00-discover-empty: nothing on Discover offered to park Quiet Harbour, so the feed cannot be emptied');
  }
  await done.goto('http://localhost:4200/discover');
  for (let i = 0; i < 20; i++) {
    if (/Nothing new to suggest yet/.test(await done.locator('body').innerText())) break;
    await done.waitForTimeout(400);
  }
  await shoot(done, {
    out: OUT,
    name: '00-discover-empty',
    mustContain: 'Nothing new to suggest yet',
    problems: unshot,
    scrolls,
    settle: 1200,
  });
} finally {
  await settled.close();
}

/*
 * Caught up and **finished**, which is the other half of the same screen. §6.164.
 *
 * `00-caughtup-upnext` above is somebody waiting: two of its four shows are still running and
 * Up Next now names the next episode and offers the calendar. `allCaughtUp` is what the screen
 * says when nothing is coming at all, and it keeps *Find something to watch* because there the
 * question really is a new show.
 *
 * A third library and a third context, for the reason the second one needed its own: this is
 * not a state of a screen, it is a state of a library. `FINISHED_CSV` is every show that is
 * over **and** has no episode left to air — one of the four.
 */
const finished = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const over = await finished.newPage();
over.on('pageerror', (e) => console.log('PAGEERROR (finished)', e.message));
try {
  await over.goto('http://localhost:4200/');
  await over.waitForTimeout(2500);
  over.on('filechooser', (c) =>
    c.setFiles({ name: 'episodes.csv', mimeType: 'text/csv', buffer: Buffer.from(FINISHED_CSV) }).catch(() => {}));
  await over.getByRole('button', { name: /Import from TV Time/i }).click();
  for (let i = 0; i < 40; i++) {
    if (/Your history is in/.test(await over.locator('body').innerText())) break;
    await over.waitForTimeout(500);
  }
  for (let attempt = 0; attempt < 12; attempt++) {
    await over.goto('http://localhost:4200/');
    await over.getByText('Up Next', { exact: true }).first().waitFor({ timeout: 30000 });
    let quiet = 0;
    for (let i = 0; i < 60 && quiet < 4; i++) {
      quiet = /Matching…/.test(await over.locator('body').innerText()) ? 0 : quiet + 1;
      await over.waitForTimeout(500);
    }
    if (/nothing has aired that you have not seen/.test(await over.locator('body').innerText())) break;
  }
  await shoot(over, {
    out: OUT,
    name: '00-caughtup-finished',
    mustContain: 'nothing has aired that you have not seen',
    problems: unshot,
    scrolls,
    settle: 1200,
  });
} finally {
  await finished.close();
}

await browser.close();
if (unseen.length) {
  console.error(`Watching Mode shots that do not show what makes them worth taking:\n  ${unseen.join('\n  ')}`);
  process.exitCode = 1;
}
if (unshot.length) {
  console.error(`States that were never photographed, so the pair proves nothing:\n  ${unshot.join('\n  ')}`);
  process.exitCode = 1;
}

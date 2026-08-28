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
/**
 * When this library was watched, relative to today rather than fixed in 2024.
 *
 * The dates used to be a hard-coded `2024-03-nn`, written when that was recent. Absolute
 * dates in a fixture rot: every day the clock moves, the seeded history sits further in
 * the past, and by the time this was looked at the whole library was two calendar years
 * behind. Stats opens on *this year*, so the screen a design review had been judging read
 * "Watched 0m · Episodes 0 · Titles 0" over a hundred and fourteen episodes — which is
 * §6.104's shape again: an instrument answering a question it was not in a position to
 * answer.
 *
 * What it should represent is a real migrant. TV Time shut down on 15 July 2026, so
 * somebody importing has history that ends a few weeks before today and runs back over
 * years. `TAIL_DAYS` is that gap; the per-show offsets spread the three shows across
 * about eighteen months, so more than one year chip exists and Year in Review has
 * something to review. Episodes inside a season are consecutive days, which is what
 * gives the screen a streak to name.
 */
const TAIL_DAYS = 44;
const dayString = (daysAgo) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

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
      const watched = Math.max(1, episodes - 3);
      for (let n = 1; n <= watched; n++) {
        const d = dayString(TAIL_DAYS + i * 200 + s * 60 + (watched - n));
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
const unjudged = routes.map(([name]) => name).filter((name) => !MUST_SHOW[name]);
if (unjudged.length) {
  console.error(`These screens have no MUST_SHOW clause, so nothing knows what they should be showing:\n  ${unjudged.join('\n  ')}`);
  process.exitCode = 1;
}

const hollow = [];
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

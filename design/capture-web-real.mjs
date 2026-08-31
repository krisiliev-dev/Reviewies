import { chromium } from 'playwright';
import { chromiumOptions } from '../scripts/browser.mjs';
import { mkdirSync } from 'node:fs';
import { FILM, SHOWS, manifest, track } from './realLibrary.mjs';
import { longerScreens, shoot } from './shoot.mjs';
import { PROSE_CHARACTERS } from '../core/src/ui/screen.ts';

/**
 * The **web** app, photographed against a snapshot of real TMDB.
 *
 * ## Why this exists
 *
 * §6.151 built the snapshot and pointed the phone at it. Its first run found five things,
 * and every one of them was invisible until real data arrived: a title page opening on
 * `SEASON 0`, *"Because you watched Trending now"*, a thirty-second Track that said
 * nothing, counts that were the harness, and two hundred viewports of episode list. The
 * fixture could not have shown any of them.
 *
 * The web app had never seen real data at all. Its pass seeds a CSV of four invented
 * titles — `Episode {n}` for every episode name, one-sentence overviews, and **no artwork
 * anywhere**, because the fixture supplies no `posterUrl`. So the layout has been reviewed
 * for thirty-odd sprints against content that resembles nothing a person will put in it,
 * and at 420pt, on a window that goes to 1280.
 *
 * ## Why it does not replace the fixture pass
 *
 * `capture-web.mjs` names specific titles in a needle per route and photographs both
 * themes. That determinism is what makes it fail usefully, and §6.151's argument was for
 * having both passes rather than swapping one for the other. This one asserts almost
 * nothing about content — its content is whatever TMDB said on the day the snapshot was
 * taken — and refuses only the failure §6.146 spent a sprint on: **a shot of the thing not
 * being there.**
 *
 * ## Two widths
 *
 * 420 and 1280. The phone's passes are 390 and the web's fixture pass is 420, so the wide
 * window every desktop visitor actually gets has never been photographed by anything. A
 * layout designed at phone width and stretched to 1280 is a different design, and nobody
 * has looked at it.
 */

/*
 * Overridable, in the house style of `app/smoke.mjs`'s own `BASE`. The two ports are the
 * ones `npm run design:web:real` serves on and stay the default; a worktree running beside
 * others cannot take them, and a pass that can only run on two fixed ports is a pass that
 * cannot be run twice at once.
 */
const BASE = process.env.BASE ?? 'http://localhost:4206';
/** The snapshot server, which this build is *allowed* to reach and the fixture pass is not. */
const SNAPSHOT = process.env.SNAPSHOT ?? 'http://localhost:4203';
const OUT = new URL('./web-real/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch(chromiumOptions());
const problems = [];
const scrolls = [];
const offOrigin = new Set();

/**
 * Title pages whose synopsis this pass could actually measure, and the ones it could not.
 *
 * Two lists rather than a count, because the interesting failure is partial: five titles
 * read and one not is a fact about that title's provider, and none read is a fact about
 * this instrument. See the clause below `longestProseLine` for the plant that proved a
 * single count could not tell those apart.
 */
const proseRead = [];
const proseUnread = [];

/** Widths, and what each is for. */
const WIDTHS = [
  ['narrow', 420],
  ['wide', 1280],
];

const context = await browser.newContext({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });
const page = await context.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));

/*
 * Everything except the build and the snapshot is refused.
 *
 * The fixture pass aborts *all* off-origin traffic, which is right for a build that must
 * not reach a provider. This one has a provider — a local one — so the allowance is a
 * single named origin rather than a hole. Anything else is collected and reported, which
 * is how §6.125's stall was found.
 */
await page.route('**', async (route) => {
  const url = route.request().url();
  if (
    url.startsWith(BASE) ||
    url.startsWith(SNAPSHOT) ||
    url.startsWith('data:') ||
    url.startsWith('blob:')
  ) {
    return route.continue();
  }
  offOrigin.add(new URL(url).host);
  return route.abort();
});

console.log(`Photographing the web app against a snapshot of real TMDB — ${manifest.titles.length} titles.`);

for (const show of SHOWS) {
  try {
    await track(page, BASE, show.name);
  } catch (e) {
    problems.push(`could not track ${show.name}: ${e.message.split('\n')[0].slice(0, 80)}`);
  }
}

/** The longest real title in the library, deliberately: a row's worst case. */
const LONGEST = [...SHOWS].sort((a, b) => b.name.length - a.name.length)[0];

/**
 * Every route, with the one thing that makes the shot worth looking at.
 *
 * A needle per route, for `capture.mjs`'s reason: a screenshot of a screen that did not
 * load is a photograph of a spinner, and a design review of it reviews nothing. The needles
 * are the library's own names rather than invented ones, so nothing here can pass against
 * an empty app.
 */
const ROUTES = [
  ['upnext', '/', LONGEST.name],
  ['search', `/discover`, LONGEST.name, LONGEST.name],
  ['search-film', `/discover`, FILM.name, FILM.name],
  ['discover', '/discover', undefined],
  ['calendar', '/?on=coming', undefined],
  ['stats', '/stats', undefined],
  ['watchlist', '/watchlist', undefined],
];

for (const [label, width] of WIDTHS) {
  await page.setViewportSize({ width, height: 900 });

  for (const [shot, path, want, typed] of ROUTES) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
    if (typed) {
      await page.getByPlaceholder('Shows, films, anime…').fill(typed);
      await page.waitForTimeout(2500);
    }
    for (let i = 0; i < 16; i++) {
      if (!want || (await page.locator('body').innerText()).includes(want)) break;
      await page.waitForTimeout(400);
    }
    await page.waitForTimeout(900);
    await shoot(page, { out: OUT, name: `${label}-${shot}`, mustContain: want, problems, scrolls });
  }

  // A title page each: the episode list is where real names, real counts and §6.156's
  // collapsed seasons land, and it is the screen #191 was about.
  for (const show of SHOWS) {
    try {
      await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1200);
      await page.getByText(show.name, { exact: true }).first().click({ timeout: 15000 });
      await page.waitForTimeout(2000);
      await shoot(page, {
        out: OUT,
        name: `${label}-title-${slug(show.name)}`,
        mustContain: show.name,
        problems,
        scrolls,
      });

      /*
       * And the measure of the one paragraph in the product, which only this pass can read.
       *
       * `SCREEN.prose` is a width in points and the claim it exists to satisfy is in
       * characters, so the arithmetic cannot check itself: how many characters a width holds
       * depends on the face and the text size, and both are decided in a stylesheet. This is
       * the half that measures — the browser's own line boxes, counted rather than estimated
       * from an em, on real synopses at both photographed widths.
       *
       * It found the defect it exists for: before `SCREEN.prose`, Shōgun's synopsis set at
       * **89 characters** here and at 44 in the same build at 420. The row's measure had
       * been doing a paragraph's job because it was the only number in the table.
       *
       * ## The reading is tallied, because `-1` is not a measurement
       *
       * `longestProseLine` returns `-1` when there is no paragraph it can read, and says so
       * in its own header: *"so a title with no synopsis is not reported as a paragraph that
       * passed. §6.57's distinction: nothing to read is not a good reading."* That sentence
       * described a contract **nothing implemented**. The only rule here was
       * `longest > PROSE_CHARACTERS`, and `-1` satisfies it silently — so a run in which the
       * measure could see nothing at all printed the same clean page as a run in which every
       * paragraph was inside its ceiling.
       *
       * Proved by planting, not argued. `SCREEN.prose` widened to 1200 makes the synopsis
       * genuinely overset, and this pass failed correctly and named five titles at 82–89
       * characters. Wrapping `{title.overview}` in a `<span>` — which is all it takes, and
       * which one paragraph on this very screen already does — leaves the overset in place
       * and moves the text node one level down, past `el.firstChild`. The pass then walked
       * the same ten title pages — five shows at two widths — discarded ten `-1`s, printed
       * nothing about prose and **exited 0**. Repaired, on that same build, it fails and
       * names the file; on the correct one it prints `prose measured on 10 of 10 title
       * pages; widest line 71 characters (One Piece at wide) against the 75 ceiling`, which
       * is a reading nothing printed before.
       *
       * So the readings are counted and the count is printed on a green run, which is
       * `capture.mjs`'s `presses measured:` and `measure.mjs`'s "found none of N names" and
       * `calibrate.mjs`'s `repeatUntested` — this repository already has the rule three
       * times and this clause did not have it.
       *
       * The floor is **none of them**, not all of them, and that is deliberate: a title
       * whose provider has no synopsis is a real and correct case, and a clause that failed
       * on one would be the tenth guard here to go red on something that was right. What
       * cannot be a correct build is every paragraph on every title page at both widths
       * going unreadable at once — that is a fact about this instrument, not about TMDB.
       * The pages it could not read are named either way, so a drift from six to one is
       * visible on a run that still passes.
       */
      const longest = await longestProseLine(page);
      if (longest < 0) proseUnread.push(`${show.name} at ${label}`);
      else proseRead.push({ what: `${show.name} at ${label}`, longest });
      if (longest > PROSE_CHARACTERS) {
        problems.push(
          `${show.name} at ${label}: the synopsis sets ${longest} characters to a line, ` +
            `over the ${PROSE_CHARACTERS} SCREEN.prose is for`,
        );
      }
    } catch (e) {
      problems.push(`could not open ${show.name} at ${label}: ${e.message.split('\n')[0].slice(0, 80)}`);
    }
  }
}

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24);
}

/**
 * The longest line the longest paragraph on this page actually drew, in characters.
 *
 * Counted off the browser's own line boxes — a `Range` walked one character at a time, and
 * a line ends where the top of that range moves — rather than divided out of a width by an
 * assumed em. The em is the thing that would have to be guessed, and guessing it is how a
 * measurement becomes an estimate wearing a number.
 *
 * `-1` when there is no prose on the page, so a title with no synopsis is not reported as a
 * paragraph that passed. §6.57's distinction: nothing to read is not a good reading.
 */
async function longestProseLine(page) {
  return page.evaluate(() => {
    let longest = -1;
    for (const el of document.querySelectorAll('p')) {
      const node = el.firstChild;
      if (!node || node.nodeType !== Node.TEXT_NODE || node.length < 120) continue;
      const range = document.createRange();
      const lines = [];
      let start = 0;
      let top = null;
      for (let i = 1; i <= node.length; i++) {
        range.setStart(node, i - 1);
        range.setEnd(node, i);
        const box = range.getBoundingClientRect();
        if (top === null) top = box.top;
        if (Math.abs(box.top - top) > 2) {
          lines.push(i - 1 - start);
          start = i - 1;
          top = box.top;
        }
      }
      lines.push(node.length - start);
      longest = Math.max(longest, ...lines);
    }
    return longest;
  });
}

const longer = longerScreens(scrolls);
if (longer) console.log(`\nshots that are the top of a longer screen: ${longer}`);

/*
 * The prose reading, as a number on every run rather than as silence on a good one.
 *
 * `widest` is printed beside the ceiling it is being held to, which is the rule §6.157 and
 * the Up Next arrival clause both had to learn twice: a measurement with no bound beside it
 * cannot be read, and a bound with no measurement beside it cannot be trusted.
 */
const widest = proseRead.reduce((a, b) => (b.longest > a.longest ? b : a), { longest: -1, what: 'nothing' });
console.log(
  `\nprose measured on ${proseRead.length} of ${proseRead.length + proseUnread.length} title pages` +
    (proseRead.length
      ? `; widest line ${widest.longest} characters (${widest.what}) against the ${PROSE_CHARACTERS} ceiling`
      : ''),
);
if (proseUnread.length) {
  console.log(`  no paragraph this measure could read on: ${proseUnread.join(', ')}`);
}
if (!proseRead.length) {
  problems.push(
    `design/capture-web-real.mjs: the prose measure read no paragraph on any of the ` +
      `${proseUnread.length} title pages it walked, so it has nothing to say about ` +
      `SCREEN.prose and must not report a clean one. ` +
      `\`longestProseLine\` finds a <p> whose first child is a text node of 120 characters ` +
      `or more; if the synopsis grew a wrapper — a "read more", an italic lead-in, a link — ` +
      `the words moved one level down and this pass went blind rather than red.`,
  );
}

if (offOrigin.size) {
  problems.push(`the build reached hosts nothing accounts for: ${[...offOrigin].join(', ')}`);
}

if (problems.length) {
  console.error(`\nweb real pass could not photograph what it went for:\n  ${problems.join('\n  ')}`);
  process.exitCode = 1;
}
await browser.close();

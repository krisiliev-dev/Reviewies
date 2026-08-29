import { chromium } from 'playwright';
import { chromiumOptions } from '../scripts/browser.mjs';
import { mkdirSync } from 'node:fs';
import { FILM, SHOWS, manifest, track } from './realLibrary.mjs';
import { longerScreens, shoot } from './shoot.mjs';

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

const BASE = 'http://localhost:4206';
/** The snapshot server, which this build is *allowed* to reach and the fixture pass is not. */
const SNAPSHOT = 'http://localhost:4203';
const OUT = new URL('./web-real/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch(chromiumOptions());
const problems = [];
const scrolls = [];
const offOrigin = new Set();

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
  ['search', `/search`, LONGEST.name, LONGEST.name],
  ['search-film', `/search`, FILM.name, FILM.name],
  ['discover', '/discover', undefined],
  ['calendar', '/calendar', undefined],
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
    } catch (e) {
      problems.push(`could not open ${show.name} at ${label}: ${e.message.split('\n')[0].slice(0, 80)}`);
    }
  }
}

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24);
}

const longer = longerScreens(scrolls);
if (longer) console.log(`\nshots that are the top of a longer screen: ${longer}`);

if (offOrigin.size) {
  problems.push(`the build reached hosts nothing accounts for: ${[...offOrigin].join(', ')}`);
}

if (problems.length) {
  console.error(`\nweb real pass could not photograph what it went for:\n  ${problems.join('\n  ')}`);
  process.exitCode = 1;
}
await browser.close();

/**
 * Screenshots of every screen of the **web** app, in both themes.
 *
 * ## What #162 actually turned out to be
 *
 * The task said "nothing has ever been photographed in light mode", and §7 drew the
 * conclusion that the design track "has been reviewing half the app". Checking it first —
 * §6.124's lesson — found something else.
 *
 * Nothing sets `data-theme`. Not a control, not a preference, not `prefers-color-scheme`
 * (§6.87 removed that on purpose), and `app/index.html` declares
 * `<meta name="color-scheme" content="dark">`. On the phone, `mobile/src/ui/theme.ts` is
 * `color.dark` at module load and `app.json` pins `userInterfaceStyle: "dark"`. So the
 * light palette is **unreachable in the shipping product on both platforms**: it is read
 * by twelve test files and by nothing else — the fourth token layer in this build to have
 * a name, a meaning and no consumers, after `ratio.poster` (§6.118), heading depth
 * (§6.120) and `elevation` (§6.122), and by far the largest.
 *
 * So the design track has not been reviewing half the app. It has been reviewing all of
 * the shipping app, in the only theme the shipping app has.
 *
 * ## But it *has* been reviewing half the product
 *
 * `design/capture.mjs` serves `mobile/dist` — the **phone's** web export. All twenty-four
 * shots in `design/screens` are the phone. The web app has never had a design pass at all;
 * its only screenshots are `app/screenshots/`, taken by the smoke suite as evidence for
 * checks rather than to be looked at.
 *
 * That is the real gap #162 was reaching for, and this file closes it. Every route, in the
 * theme the product ships in, and then the same routes again under `data-theme="light"` —
 * because the light table is what twelve guards are asserting about and no photograph has
 * ever shown what they are asserting about.
 */
import { chromium } from 'playwright';
import { chromiumOptions } from '../scripts/browser.mjs';
import { mkdirSync } from 'node:fs';
import { CSV } from './library.mjs';
import { longerScreens, reveal, shoot } from './shoot.mjs';

const BASE = 'http://localhost:4202';
const OUT = new URL('./web/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch(chromiumOptions());
const problems = [];
/** Hosts anything asked for outside the served build. Should stay empty. */
const offOrigin = new Set();

/**
 * A tab, seeded the way a migrant seeds it, then photographed.
 *
 * `theme` is `undefined` for the shipping build and `'light'` for the pass that exists to
 * make the light table visible. It is set with `addInitScript` rather than after load, so
 * no screen is ever photographed mid-swap.
 */
async function pass(theme) {
  const context = await browser.newContext({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  /*
   * Anything that leaves this origin, collected and reported.
   *
   * §6.125's rule, and this file needed it within an hour of being written. A build made
   * without the blank credentials reaches `api.themoviedb.org`, the proxy resets the
   * connection, and matching stalls at "Matching… 1 of 3, 0 matched so far" — a harness
   * photographing an app that is quietly waiting on a network it should not be using. The
   * npm script blanks the tokens; this is what notices when something else does not.
   */
  await page.route('**', async (route) => {
    const url = route.request().url();
    if (url.startsWith(BASE) || url.startsWith('data:') || url.startsWith('blob:')) {
      return route.continue();
    }
    offOrigin.add(new URL(url).host);
    // Aborted, not merely counted. A design pass that waits on a third party photographs
    // whatever that third party felt like doing, and the app already handles the refusal:
    // `resolveFromTmdb` catches and falls back to what it had. §6.125's rule, enforced
    // rather than hoped for.
    return route.abort();
  });
  if (theme) {
    /*
     * Set on `documentElement` as soon as there is one, not when the script runs.
     *
     * An init script runs *before* the document is parsed, so `document.documentElement`
     * is null and the first version threw eleven times — once per navigation — and
     * photographed the dark app under a light filename. The ground check below is the only
     * reason that was noticed rather than shipped as "light mode reviewed", and it is
     * exactly the shape §6.87 found by reading colour off the pixels.
     */
    await page.addInitScript((value) => {
      const apply = () => document.documentElement?.setAttribute('data-theme', value);
      apply();
      document.addEventListener('DOMContentLoaded', apply);
    }, theme);
  }

  /*
   * `domcontentloaded`, not `networkidle`. The second run of this file timed out waiting
   * for idle on a page the first run had loaded twice — a service worker registering, a
   * font request, anything periodic keeps "idle" from arriving, and a design harness that
   * fails one run in three is one nobody trusts (§6.125). Every wait below is for the
   * *content* the shot exists to show, which is the thing actually being waited on.
   */
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  /*
   * The ground colour, read off the pixels before anything else.
   *
   * The whole point of the light pass is that it is light. A `data-theme` that failed to
   * apply — a typo, an init script that ran after the paint, a stylesheet that does not
   * carry the block — would photograph the dark app twice and this file would report two
   * passes and one theme. §6.87's own finding was caught exactly this way: by reading
   * colour off the pixels rather than trusting the CSS.
   */
  const ground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const dim = ground.match(/\d+/g)?.slice(0, 3).map(Number) ?? [0, 0, 0];
  const luminance = (dim[0] * 0.2126 + dim[1] * 0.7152 + dim[2] * 0.0722) / 255;
  const name = theme ?? 'dark';
  console.log(`${name} pass: body ground ${ground}`);
  if (theme === 'light' && luminance < 0.5) {
    problems.push(`the light pass photographed a dark ground (${ground}) — data-theme did not apply`);
  }
  if (!theme && luminance > 0.5) {
    problems.push(`the shipping pass photographed a light ground (${ground})`);
  }

  // Seed a library, the way `capture.mjs` does and out of the same file, so the two
  // platforms are judged on the same shows.
  await page.locator('input[type=file]').last().setInputFiles({
    name: 'episodes.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(CSV),
  });
  let landed = '';
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(500);
    landed = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    if (/Imported [1-9]\d* watches/.test(landed)) break;
  }
  // A count, not the sentence: "Imported 0 watches" satisfies a looser needle and means
  // every shot below is of an empty app. §6.104, and `capture.mjs` learned it the hard way.
  if (!/Imported [1-9]\d* watches/.test(landed)) {
    problems.push(`${name}: the import never landed — ${landed.slice(0, 120)}`);
  }

  /*
   * Matching runs after the import, against the fixture provider, and Up Next says
   * "Matching… n of m" out loud while it does. Wait for the *library*, not for the absence
   * of a spinner: "not showing the working state" includes "has not started yet", which is
   * how `capture.mjs` once photographed an empty app on its first sample.
   *
   * Ninety seconds. Thirty was enough while `networkidle` was accidentally doing the
   * waiting, and the run that dropped it reported `dark-01-upnext does not show /The Long
   * Dark|Kitchen Nightshift/` — the harness telling the truth about its own timing rather
   * than photographing an empty screen, which is the whole point of a needle per route.
   */
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  /*
   * Matching starts on its own here, and the first version of this pressed a button.
   *
   * The failure message that suggested otherwise was a truncated body — "…Match imported
   * sh" — read from a moment before the run began, and the press was written from that
   * rather than from watching the screen. A probe showed `button count: 0` and
   * "Matching… 1 of 3" already climbing: `MatchImports` renders the button only while it
   * is *not* running. The real stall was a network the build should not have been able to
   * reach, which is what `offOrigin` above now says out loud.
   */
  let library = '';
  for (let i = 0; i < 180; i++) {
    await page.waitForTimeout(500);
    library = await page.locator('body').innerText();
    if (!/Matching…/.test(library) && /The Long Dark|Kitchen Nightshift|Hollow Crown/.test(library)) break;
  }
  if (!/The Long Dark|Kitchen Nightshift|Hollow Crown/.test(library)) {
    problems.push(`${name}: matching never filled the library — ${library.replace(/\s+/g, ' ').slice(0, 120)}`);
  }

  /**
   * Every route, with the content that makes each one worth looking at.
   *
   * A needle per route, for `capture.mjs`'s reason: a screenshot of a screen that did not
   * load is a photograph of a spinner, and a design review of it reviews nothing.
   */
  const scrolls = [];
  const ROUTES = [
    ['01-upnext', '/', /The Long Dark|Kitchen Nightshift/],
    // Search is a state of Discover since `docs/design/architecture.md` section 5, and the
    // shot name is kept because the record cites it. `?q=` is not a thing the screen reads —
    // the field is typed into after the loop, below, where the results shot is taken.
    ['02-search', '/discover', /Quiet Harbour/],
    ['03-watchlist', '/watchlist', /Watchlist|Nothing on the list/i],
    ['04-discover', '/discover', /Discover|Because you watched/i],
    // Up Next's second half, at its own address — `segments.ts` owns the parameter.
    ['05-calendar', '/?on=coming', /Upcoming|Tell me about/i],
    ['06-stats', '/stats', /Watched|Episodes/],
    ['07-lists', '/lists', /Lists/],
    ['08-people', '/people', /People/],
    ['09-more', '/more', /More|Everything lives on this device/i],
    ['10-settings', '/settings', /Your data|Watching|People/i],
  ];

  /**
   * What to do on a route before photographing it, where the route's name is a **state** of
   * the surface rather than the surface itself.
   *
   * `docs/design/architecture.md` section 5 merged Search into Discover, and both halves are
   * still designed: the shelf with nothing typed, and the list with something typed. Two
   * shots of one address, and this is what puts the second one into the state its name says.
   * Without it `02-search` and `04-discover` would be the same photograph twice, which is a
   * design record claiming coverage it does not have — §6.146's shape.
   */
  const USE = {
    '02-search': async () => {
      const box = page.getByPlaceholder(/Shows, films/i).first();
      if (!(await box.count())) {
        problems.push(`${name}-02-search: Discover has no search field to type into`);
        return;
      }
      await box.click();
      await box.fill('Quiet');
    },
  };

  for (const [shot, path, want] of ROUTES) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
    await USE[shot]?.();
    for (let i = 0; i < 16; i++) {
      if (want.test(await page.locator('body').innerText())) break;
      await page.waitForTimeout(400);
    }
    await page.waitForTimeout(900);
    /*
     * The **scrolling element**, not `fullPage`.
     *
     * This was `page.screenshot({ fullPage: true })` and a metric reading
     * `documentElement.scrollHeight / window.innerHeight`, and it reported *"every shot
     * fits one screen"* for every route of both themes from the day it was written.
     * §6.142 believed it and wrote the belief into the record as a correction: "its
     * twenty shots are whole documents and were never scroll positions".
     *
     * §6.157 read the files. All twenty are **exactly 1800px tall** at
     * `deviceScaleFactor: 2` — one 900pt window, every one. `App.tsx` puts
     * `overflow-y-auto` on `<main>`, so the document never scrolls, `fullPage` captures
     * the window, and the metric could only ever return `1.0x`. The web design track has
     * been reviewing the top of every screen while saying it was reviewing whole ones.
     *
     * `shoot` finds whatever actually scrolls and files a foot shot, which is what the
     * phone's two passes have always done. §6.153: an instrument that can only return one
     * answer is not returning an answer.
     */
    await shoot(page, {
      out: OUT,
      name: `${name}-${shot}`,
      problems,
      scrolls,
    });
    if (!want.test(await page.locator('body').innerText())) {
      problems.push(`${name}-${shot} (${path}) does not show ${want}`);
    }
  }

  /*
   * What the reader is holding. Every shot is a **screen** now — one window of a page that
   * may be much longer — and the list below is which of them have more underneath, with a
   * `-foot` shot on file for each. §6.141's retracted defect came from not knowing which.
   */
  /*
   * Stats with a **year** chosen, which nothing had ever photographed.
   *
   * The routes loop lands on `/stats` and leaves, so the second row of the period control
   * has only ever been seen holding no answer — and §6.167 restyled that row's label from a
   * `Section` to a footnote on the strength of exactly that shot. §6.146: a fixture that
   * cannot produce the case has an opinion about the screen.
   *
   * Not `reveal`, which clicks a `button`: `Choice` renders `role="radio"`, so the helper's
   * needle would never match and the miss would be reported as "nothing on the screen
   * matches" rather than as a year that will not press. The year is read out of the control
   * rather than typed here, because a hard-coded 2025 is a shot that starts failing in
   * January. §6.146 again, from the other end.
   */
  await page.goto(`${BASE}/stats`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  // `announce` joins the label and the hint: `2025 — your 2025`, not either half.
  const years = page.getByRole('radio', { name: /^\d{4} — your \d{4}$/ });
  if (await years.count()) {
    await years.first().click();
    await page.waitForTimeout(900);
    await shoot(page, { out: OUT, name: `${name}-06-stats-year`, problems, scrolls });
    // The mark, not merely the click: `aria-checked` is what the row announces, and a chip
    // that took the press without taking the answer is the §6.138 defect this state exists
    // to keep an eye on.
    if ((await years.first().getAttribute('aria-checked')) !== 'true') {
      problems.push(`${name}-06-stats-year: the year was pressed and is not the answer`);
    }
  } else {
    problems.push(`${name}-06-stats-year: the period control offers no year to choose`);
  }

  /*
   * The remote drawer, and the edge tab that opens it.
   *
   * `RemoteDrawer` returns `null` unless `bridgeConfigured()`, which reads two build-time
   * `VITE_` variables — so the web's only route to the remote had **never been in a
   * screenshot**, and §6.167 decided to *keep* that tab, on the argument that it is the
   * web's only route, without a picture of it. §6.146.
   *
   * The npm script sets a deliberately dead relay: port 9 is discard, and `page.route`
   * aborts anything off this origin anyway. Nothing is being connected to. What is being
   * photographed is the affordance and the panel, which is what the decision was about.
   */
  await reveal(page, {
    out: OUT,
    name: `${name}-11-remote`,
    control: 'Open remote',
    arrive: `${BASE}/`,
    problems,
    scrolls,
  });

  const longer = longerScreens(scrolls);
  console.log(
    longer
      ? `${name ?? 'dark'} shots that are the top of a longer screen: ${longer}`
      : `${name ?? 'dark'}: every shot is a whole screen`,
  );

  await context.close();
}

await pass(undefined);
await pass('light');
await browser.close();

/**
 * What the app reached for, and the one host it is allowed to.
 *
 * `graphql.anilist.co` is expected, and the reason is the seeded library rather than a
 * stray import: `Hollow Crown Saga` is one season of ninety-six episodes, which is exactly
 * the shape `correctAnimeSeasons` exists to re-cut — and that correction finds the AniList
 * entry by title because ARM cannot be queried by TMDB ID. The fixture was built to
 * exercise that path (§6.124), so the request is the fixture working.
 *
 * It is named here rather than tolerated silently, because the *next* host to appear is
 * the thing worth knowing about, and a run that quietly reaches two would look like a run
 * that reaches one.
 */
const EXPECTED_OFF_ORIGIN = ['graphql.anilist.co'];
const unexpected = [...offOrigin].filter((host) => !EXPECTED_OFF_ORIGIN.includes(host));
if (unexpected.length) {
  problems.push(`the build reached hosts nothing accounts for: ${unexpected.join(', ')}`);
}
for (const host of EXPECTED_OFF_ORIGIN) {
  // §6.41: an allowance that outlives what it allows is the next thing to mislead somebody.
  if (!offOrigin.has(host)) problems.push(`${host} is allowed for and was never reached`);
}

if (problems.length) {
  console.error(`Web design pass:\n  ${problems.join('\n  ')}`);
  process.exitCode = 1;
}

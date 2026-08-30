/**
 * What the screens say when the metadata provider fails.
 *
 * §6.57's source-level guard states its own blind spot: it can see that a failure is
 * bound, not that it is ever rendered. `const result = await …` followed by silence
 * passes it and fails a reader. This is the other half, driven in a real browser.
 *
 * The provider is the one dependency reachable without an account, which is why it is
 * where this starts. Three failures, because they are three different bugs: a request
 * that is refused, one that answers with an error, and one that never answers at all.
 * The third is the one that has never been tested anywhere — a hang does not reject, so
 * every `catch` in the app is unreachable by it, and only the deadline in
 * `SEARCH_TIMEOUT_MS` can end it.
 *
 * No network is needed. Interception happens before the request leaves the browser, so
 * this runs in a container that cannot reach TMDB — the point is the app's behaviour,
 * not the provider's.
 */
import { chromium } from 'playwright';
import { chromiumOptions } from '../scripts/browser.mjs';

/*
 * What a retry control is called, on either platform.
 *
 * It was `/try again/i`, and §6.131 broke it by making the web's Search retry a `Button`
 * with the name the *phone* had been using — "Try that search again". §6.56's rule is that
 * a control carries what tells it from its neighbours, so the specific name is the right
 * one and this needle was the bare one; the title screen's is still "Try again".
 */
const RETRY = /try\b.*\bagain/i;

const BASE = process.env.BASE ?? 'http://localhost:4173';
const OUT = 'screenshots/';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch(chromiumOptions());
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');

/**
 * Make every provider request fail in one of three ways.
 *
 * `hang` never settles the route, which is what a dead connection actually looks like:
 * the socket stays open and nothing arrives. Playwright leaves the request pending for
 * as long as the handler does.
 */
async function providerFails(mode) {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.route('**://api.themoviedb.org/**', async (route) => {
    if (mode === 'abort') return route.abort('failed');
    if (mode === 'error') {
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ status_message: 'The server is having a moment.' }),
      });
    }
    // hang: return a promise that never resolves.
    await new Promise(() => {});
  });
}

try {
  // The build has to be the one with a token, or the fixture provider answers from
  // memory and none of this is reachable. Said out loud rather than assumed: a run that
  // silently tested nothing is the failure mode this whole file exists to catch.
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const settings = await text();
  check(
    'this build talks to the real provider',
    !/Running on sample data/i.test(settings),
    settings.slice(0, 120),
  );

  for (const mode of ['abort', 'error']) {
    await providerFails(mode);

    await page.goto(`${BASE}/discover`, { waitUntil: 'domcontentloaded' });
    await page.locator('input').first().fill('the wire');
    await page.waitForTimeout(3000);
    const searched = await text();
    check(
      `search says the ${mode} out loud`,
      /took too long|failed|could not|error|try again/i.test(searched),
      searched.slice(0, 140),
    );
    check(
      `search offers something to press after the ${mode}`,
      await page.getByRole('button', { name: RETRY }).isVisible().catch(() => false),
    );

    await page.goto(`${BASE}/discover`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const discover = await text();
    // Either it has enough locally to suggest something, or it says why not. What it may
    // not do is sit on "Finding something…" for ever.
    check(
      `discover resolves through the ${mode}`,
      !/Finding something…/.test(discover),
      discover.slice(0, 140),
    );

    await page.goto(`${BASE}/?on=coming`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const calendar = await text();
    check(
      `the calendar still draws through the ${mode}`,
      // Case-insensitively: the heading is drawn `uppercase` since §6.110 and `innerText`
      // returns what is rendered, so a literal match here was asserting a CSS transform
      // rather than the presence of the section. What is being checked is that the screen
      // drew at all through a dead provider.
      /Upcoming/i.test(calendar) && /Tell me about/i.test(calendar),
      calendar.slice(0, 120),
    );

    // A title nothing has cached, so the page has only the provider to go on. The first
    // version of this check asked whether the page was non-blank, which it was — sitting
    // on "Loading…" with a five-star rating widget under it, for ever. §6.58.
    await page.goto(`${BASE}/title/tmdb%3A1399`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const title = await text();
    check(
      `a title page stops loading through the ${mode}`,
      !/Loading…/.test(title),
      title.slice(0, 140),
    );
    check(
      `and says why, with something to press, through the ${mode}`,
      /Could not load this title/.test(title) &&
        (await page.getByRole('button', { name: RETRY }).isVisible().catch(() => false)),
      title.slice(0, 140),
    );
    check(
      `and does not claim to know where it streams through the ${mode}`,
      !/Not on any service/.test(title) && /Could not check where this is streaming/.test(title),
      title.slice(0, 200),
    );
  }

  // --- The one that never answers ------------------------------------------------
  //
  // A hang does not reject, so nothing in the app's error handling can see it. Only the
  // deadline can. §7 has recorded this as untested since the deadline was written.
  await providerFails('hang');
  await page.goto(`${BASE}/discover`, { waitUntil: 'domcontentloaded' });
  await page.locator('input').first().fill('the wire');
  await page.waitForTimeout(3000);
  const waiting = await text();
  check('a hanging search says it is working', /Searching…/.test(waiting), waiting.slice(0, 120));

  // Past SEARCH_TIMEOUT_MS, which is ten seconds.
  await page.waitForTimeout(9000);
  const gaveUp = await text();
  check(
    'and gives up rather than spinning for ever',
    /took too long/i.test(gaveUp),
    gaveUp.slice(0, 140),
  );
  check(
    'with something to press',
    await page.getByRole('button', { name: RETRY }).isVisible().catch(() => false),
  );
  await page.screenshot({ path: OUT + 'f1-hung-search.png' });
} catch (err) {
  check('the failure run completed', false, err.message.slice(0, 160));
} finally {
  await browser.close();
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);

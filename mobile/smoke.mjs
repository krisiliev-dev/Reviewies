/**
 * End-to-end check of the native app, rendered through react-native-web.
 *
 * This is not a substitute for running on a device — it cannot see haptics, the
 * local-network entitlement, or how anything feels. What it does prove, on every
 * change, is the part most likely to break silently: that the app boots, binds
 * SQLite, and that the core loop the whole product is judged on still works against
 * a real database rather than a mock.
 *
 * Run against `npx expo export --platform web && npx serve dist`.
 */
import { chromium } from 'playwright';
import { chromiumOptions } from '../scripts/browser.mjs';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:4200';
const OUT = new URL('./screenshots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

// A pinned Chromium when this environment has one, and whatever Playwright downloaded
// otherwise — see scripts/browser.mjs.
const browser = await chromium.launch(chromiumOptions());
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');

/**
 * Every control on a screen has a role and a name, on every screen — not only the one
 * this suite happened to collide with.
 *
 * Two failures are possible and both matter. A control with no *name* announces as
 * "button" and nothing else. A control with no *role* — a tappable View, which is what
 * a Pressable renders as unless it is given an accessibilityRole — is not announced at
 * all, and is invisible to this check too. So the count is asserted as well: a screen
 * that reports zero controls has not passed, it has failed to be looked at.
 */
/**
 * The same screen at twice the text size.
 *
 * §6.21 measured this on the web and left the phone out, with a reason: React Native's
 * styles compile to CSS classes carrying pixel values, `Dimensions` hardcodes
 * `fontScale: 1`, and nothing in `Text` or `StyleSheet` consumes it — so asking the
 * browser for larger text changes nothing at all. §6.37 measured that and found it true:
 * a heading is 30px whether the root font is 16px or 32px.
 *
 * True, and it had been standing in for a test since. So this does the thing the setting
 * would do rather than asking the browser to: every element's computed font size,
 * doubled inline, with every other pixel value left where it is. That is exactly what
 * raising the text size on a device does — the type grows and the poster does not — and
 * it is the property 1.4.4 actually asks about.
 *
 * Not a substitute for a device. It is a substitute for nothing, which is what was here.
 */
/**
 * Nothing parked outside the screen that the screen can be scrolled to.
 *
 * §6.38 found the closed remote drawer this way, by following a number rather than a
 * failing control: 300 wide, absolute, parked at `translateX(300)` while shut, with
 * nothing clipping it — so the page measured 690 in a 390 viewport and could be dragged
 * sideways to reveal a drawer that is supposed to be closed. True at any text size and
 * true since the drawer shipped.
 *
 * A cold load does not reproduce it, which is why this lives in the suite rather than a
 * standalone probe: the fault needs the overlay *mounted and closed*, and that is a
 * state you arrive at by using the app — a probe over cold URLs found nothing on either
 * platform.
 *
 * Both axes, and the vertical half was checked rather than assumed: an element parked at
 * `top: 2000px` inside the app's own scroll container takes `documentElement.scrollHeight`
 * from 844 to 2300, because an absolutely-positioned thing resolves against the nearest
 * *positioned* ancestor and the scroll container is not one. Which is the same escape the
 * drawer made sideways. If a future container does position itself, its overflow rule
 * clips the ghost and there is nothing left to catch.
 */
async function noGhosts(screen) {
  const m = await page.evaluate(() => ({
    w: document.documentElement.scrollWidth,
    h: document.documentElement.scrollHeight,
    vw: innerWidth,
    vh: innerHeight,
  }));

  check(
    `${screen}: nothing parked off screen to scroll to`,
    m.w <= m.vw + 1 && m.h <= m.vh + 1,
    `${m.w}x${m.h} in ${m.vw}x${m.vh}`,
  );
}

async function scaled(screen) {
  const applied = await page.evaluate(() => {
    let count = 0;
    for (const el of document.querySelectorAll('*')) {
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (!Number.isFinite(size) || size === 0) continue;
      el.setAttribute('data-was', el.style.fontSize);
      el.style.fontSize = `${size * 2}px`;
      count++;
    }
    return count;
  });

  await page.waitForTimeout(400);

  const result = await page.evaluate(() => {
    const clipped = [];
    for (const el of document.querySelectorAll(
      '[role="button"],[role="link"],[role="radio"],[role="switch"],button,a[href],input',
    )) {
      if (el.closest('[aria-hidden="true"]')) continue;
      const box = el.getBoundingClientRect();
      if (box.width === 0) continue;
      // Any part past either edge, not merely all of it — the mistake §6.31 found in
      // the web's version of this check.
      if (box.right > innerWidth + 1 || box.left < -1) {
        clipped.push((el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 30));
      }
    }
    return { scrollWidth: document.documentElement.scrollWidth, viewport: innerWidth, clipped };
  });

  await page.evaluate(() => {
    for (const el of document.querySelectorAll('[data-was]')) {
      el.style.fontSize = el.getAttribute('data-was') || '';
      el.removeAttribute('data-was');
    }
  });
  await page.waitForTimeout(200);

  // Non-vacuous: a pass on a screen where nothing was scaled proves nothing.
  check(`${screen}: text could actually be doubled`, applied > 10, `${applied} elements`);
  check(
    `${screen}: holds together at 200% text`,
    result.scrollWidth <= result.viewport + 1 && result.clipped.length === 0,
    `${result.scrollWidth} wide in ${result.viewport}${result.clipped.length ? `, off screen: ${result.clipped.join(', ')}` : ''}`,
  );
}

async function audit(screen, atLeast) {
  const found = await page.evaluate(() => {
    const ROLES = ['button', 'link', 'radio', 'checkbox', 'switch', 'tab', 'menuitem'];
    const selector = ROLES.map((r) => `[role="${r}"]`).join(',');
    const named = [];
    const nameless = [];
    const small = [];
    for (const el of document.querySelectorAll(selector)) {
      if (el.closest('[aria-hidden="true"]')) continue;
      // Off-screen but mounted: the remote drawer is always in the tree, and its keys
      // are correctly hidden from screen readers while it is closed.
      if (el.closest('[inert]')) continue;
      const labelledBy = (el.getAttribute('aria-labelledby') ?? '')
        .split(/\s+/)
        .filter(Boolean)
        .map((id) => document.getElementById(id)?.textContent ?? '')
        .join(' ');
      // Text inside an aria-hidden descendant is not part of the accessible name, and
      // reading it as though it were is how this check first passed a link that had no
      // name at all: the poster placeholder holds the title, and is aria-hidden.
      const clone = el.cloneNode(true);
      for (const hidden of clone.querySelectorAll('[aria-hidden="true"]')) hidden.remove();
      const name = (
        el.getAttribute('aria-label') ??
        (labelledBy.trim() || clone.textContent) ??
        ''
      ).trim();
      (name ? named : nameless).push(name || el.outerHTML.slice(0, 80));

      // WCAG 2.5.8 asks for 24x24 CSS pixels of target. Measured on the box the
      // pointer actually has to hit, so padding counts and a bare line of text does
      // not. Zero-sized elements are not on screen; the skip link is one pixel by
      // design and is a keyboard affordance, not a pointer one.
      const box = el.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) continue;
      if (box.width < 1.5 && box.height < 1.5) continue;
      if (box.width < 24 || box.height < 24) {
        small.push(`${name || el.tagName} ${Math.round(box.width)}x${Math.round(box.height)}`);
      }
    }
    /*
     * Two controls a screen reader cannot tell apart. The web's copy of this found the
     * title page announcing "React along with episode 5, Episode 5" twice, once per
     * season, and the phone had exactly the same names.
     *
     * Named for what it measures rather than the rule it is reaching for. "No two controls
     * share a name" is not the rule — five "React" links down a season share one and are
     * fine, because each is reached by reading the row it sits in. A *pair* is the shape a
     * collision takes.
     */
    const byName = new Map();
    for (const name of named) byName.set(name, (byName.get(name) ?? 0) + 1);
    const collisions = [...byName.entries()]
      .filter(([, count]) => count === 2)
      .map(([name]) => name);
    return { named: named.length, nameless, small, collisions };
  });

  check(
    `${screen}: every control is named`,
    found.nameless.length === 0,
    found.nameless.length ? found.nameless.join(' | ') : `${found.named} named`,
  );
  // The guard above passes trivially on a screen where nothing declares itself a
  // control at all, which is the more common bug of the two.
  check(
    `${screen}: and the screen reports its controls`,
    found.named >= atLeast,
    `${found.named} found, expected at least ${atLeast}`,
  );
  check(
    `${screen}: no name is shared by exactly two controls`,
    found.collisions.length === 0,
    found.collisions.join(' | '),
  );
  check(
    `${screen}: every control is big enough to hit`,
    found.small.length === 0,
    found.small.join(' | '),
  );
}

try {
  // --- Boot ------------------------------------------------------------------
  // The layout gates rendering on the platform bindings, so reaching Up Next at all
  // means SQLite opened and the core was wired up.
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Up Next', { timeout: 20000 });
  check('app boots and binds SQLite', true);
  // The first minute. This app exists because TV Time shut down, and what it said to
  // someone arriving with years of history was "Nothing tracked yet" and a search box,
  // with the import that would have rescued all of it behind a tab called Data.
  const firstRun = await text();
  check(
    'the first screen offers the migration, not a search box',
    /Bring your history with you/.test(firstRun) && /Import from TV Time/.test(firstRun),
    firstRun.slice(0, 90),
  );
  // Three different things arrive under the name "my TV Time data", and someone holding
  // one of them has to see their own case named before they will believe it works.
  for (const format of ['GDPR zip', 'CSV', 'DioCache.db']) {
    check(`and names the ${format}`, firstRun.includes(format));
  }
  check(
    'searching is still offered, as the alternative',
    /Find something to watch/.test(firstRun),
  );
  // The other half of the migration — matching those shows to the provider — cannot be
  // reached from here: importing on the phone goes through the system document picker,
  // which the web export has no way to drive. It is asserted in app/src/ui/migration
  // parity instead, and its behaviour by the core's own tests.
  await page.screenshot({ path: OUT + '1-empty.png' });

  // --- The empty ones ----------------------------------------------------------
  //
  // The only moment in the run when the database holds nothing, and until §6.40 no
  // screen but Up Next had ever been rendered in it. An empty state is not a cosmetic
  // detail — it is the whole screen for somebody who has just installed the app.
  //
  // Each also has to offer the way out it names. §6.50 found the phone's empty
  // watchlist saying "Add something from Search" and its empty calendar saying "track a
  // show that is still airing", with neither offering to take you anywhere — the dead
  // end doc 10 §8 had already found on the web's calendar and fixed there.
  for (const [path, expected, wayOut] of [
    ['stats', /Nothing watched in this period yet/i],
    ['calendar', /Nothing airing in the next two months/i, 'Find something to watch'],
    ['watchlist', /Nothing saved yet/i, 'Find something'],
  ]) {
    await page.goto(`${BASE}/${path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const body = await text();
    check(`${path} says what empty means`, expected.test(body), body.slice(0, 120));
    if (!wayOut) continue;
    const link = page.getByText(wayOut, { exact: true }).first();
    check(`${path} offers a way out of empty`, await link.isVisible().catch(() => false), wayOut);
  }

  // --- An address that is not a screen -----------------------------------------
  //
  // expo-router's built-in unmatched route is "404 — The requested path could not be
  // found" and, measured, zero controls: no link home, no tab bar, nothing but the
  // system back gesture, which somebody arriving from a shared link does not have.
  // §6.40 replaced it with `app/+not-found.tsx`.
  //
  // Reached by its own address rather than by asking for a wrong one, because this
  // harness serves a static export: `serve` answers an unknown path with its own 404
  // page and the app never boots, so nothing about the app would be under test. On a
  // device expo-router routes to this screen instead. That the *routing* happens is
  // the framework's business; that the screen exists and leads somewhere is ours.
  await page.goto(`${BASE}/+not-found`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const missing = await text();
  check('an unknown address says so', /Nothing at this address/i.test(missing), missing.slice(0, 110));
  check('and offers a way out', /Go to Up Next/.test(missing) && /See everything else/.test(missing));
  await audit('the not-found screen', 2);
  await noGhosts('the not-found screen');
  await scaled('the not-found screen');

  // The route listing expo-router adds for development shipped in the production
  // export: every screen by source filename, plus a build-information panel, at a
  // public URL. Turned off in app.json; asserted here so it cannot come back.
  await page.goto(`${BASE}/_sitemap`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  check(
    'the developer route listing is not in the build',
    !/watching\/\[targetId\]/.test(await text()),
    (await text()).slice(0, 110),
  );

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Up Next', { timeout: 20000 });

  // --- Search and track ------------------------------------------------------
  await page.getByText('Find something to watch').click();
  await page.getByPlaceholder('Shows, films, anime…').fill('long');
  await page.waitForSelector('text=The Long Dark', { timeout: 15000 });
  check('search returns results', true);
  await audit('Search', 6);
  await noGhosts('Search');
  await scaled('Search');
  await page.screenshot({ path: OUT + '2-search.png' });

  await page.getByText('Track', { exact: true }).first().click();
  await page.waitForSelector('text=Tracking', { timeout: 15000 });
  check('tracking a show persists', true);

  // --- Up Next ---------------------------------------------------------------
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=The Long Dark', { timeout: 20000 });
  const first = await text();
  check('Up Next offers the first episode', /S1E1\b/.test(first), first.slice(0, 90));

  const before = Number(first.match(/(\d+) more episodes/)?.[1]);
  check('shows a remaining count, not a vague badge', Number.isFinite(before), String(before));
  await audit('Up Next', 4);
  await noGhosts('Up Next');
  await scaled('Up Next');
  await page.screenshot({ path: OUT + '3-upnext.png' });

  // --- Mark watched ----------------------------------------------------------
  // By name rather than by the word printed on it: the pill said "Watched", the ring says
  // nothing at all, and the name is the part that was always meant to carry it.
  await page
    .getByRole('checkbox', { name: /^Mark The Long Dark S1E1 watched$/ })
    .first()
    .click();
  await page.waitForSelector('text=/S1E2/', { timeout: 15000 });
  const after = await text();
  const now = Number(after.match(/(\d+) more episodes/)?.[1]);
  check('marking watched advances to the next episode', /S1E2\b/.test(after));
  check('remaining count decrements', now === before - 1, `${before} → ${now}`);
  await page.screenshot({ path: OUT + '4-watched.png' });

  // --- Persistence -----------------------------------------------------------
  // A reload proves the write reached SQLite rather than living in React state.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('text=The Long Dark', { timeout: 20000 });
  check('progress survives a reload', /S1E2\b/.test(await text()));

  // --- The watchlist note ----------------------------------------------------
  // The reason for saving something is the whole value of a watchlist — "I have ZERO
  // memory for why they're there" is the quote the screen was built around. The phone
  // could display a note the web had written and never write one, which is a note
  // nobody has.
  await page.getByText('Search', { exact: true }).first().click();
  await page.getByPlaceholder('Shows, films, anime…').fill('hollow');
  await page.waitForSelector('text=Hollow Crown Saga', { timeout: 20000 });
  await page.getByLabel('Add Hollow Crown Saga to watchlist').click();
  await page.waitForSelector('text=On watchlist', { timeout: 15000 });

  await page.getByText('Watchlist', { exact: true }).first().click();
  await page.waitForSelector('text=Add a note', { timeout: 15000 });
  check('a watchlist note can be written on the phone', true);

  await page.getByText('Add a note').first().click();
  await page.getByPlaceholder('Why did you save this?').fill('Recommended by Sam.');
  await page.getByText('Save', { exact: true }).first().click();
  await page.waitForTimeout(1200);
  check(
    'and the note survives being written',
    (await text()).includes('Recommended by Sam.'),
  );

  // Back where the rest of this script expects to be. Leaving the app on another tab
  // makes every later step depend on the order these blocks happen to sit in. A reload
  // rather than a tab tap, because "Up Next" is also the heading of the screen it names
  // and picking the wrong one of those is not a failure worth debugging twice.

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=The Long Dark', { timeout: 20000 });

  // --- Tabs ------------------------------------------------------------------
  // Five, and no more: the web app's eight is already too many for a phone, and
  // simplicity was the loudest single finding in the research.
  /**
   * The heading, not the word in the tab bar.
   *
   * This asked whether the screen's name appeared anywhere on it — and the tab bar
   * prints all five names on every screen, so the check was satisfied wherever the app
   * happened to be. §6.74 found and fixed the web's version of exactly this; the phone's
   * was never looked at.
   *
   * Fixing it needed a product change first: the phone's screen titles were plain text
   * with no heading role, so there was nothing to ask for — which is also why a screen
   * reader here could not jump between them the way it can on the web. They are headings
   * now, and this asks for one by name. §6.79.
   */
  for (const tab of ['Discover', 'Watchlist', 'More']) {
    // The tab, by its role, and not the first thing on screen that says the word.
    // `getByText('Watchlist')` on the Discover tab hits a suggestion card's "Watchlist"
    // button — which adds a title to your watchlist and navigates nowhere — and the old
    // check then confirmed success by finding "Watchlist" written in the tab bar. So it
    // passed for three reasons at once, none of them the right one, and it had never
    // once opened the screen it is named after. §6.79.
    await page.getByRole('tab', { name: new RegExp(tab) }).first().click();
    await page.waitForTimeout(1200);
    const arrived = await page
      .getByRole('heading', { name: tab, exact: true })
      .first()
      .isVisible()
      .catch(() => false);
    check(`the ${tab} tab opens`, arrived);

    /**
     * And on Discover, how many titles the reason names.
     *
     * The web wrote `because.slice(0, 2)` and the phone wrote `because.join(' and ')`,
     * so a library of a dozen shows produced "Because you watched Halt and Catch Fire
     * and The Leftovers and Frieren and The Bear and Shogun" — five titles, four "and"s,
     * off the edge of the card. One "and" at most, now that the sentence is shared.
     */
    if (tab === 'Discover') {
      const reasons = (await text()).match(/Because you watched [^\n]+/g) ?? [];
      const overlong = reasons.filter((line) => (line.match(/ and /g) ?? []).length > 1);
      check(
        'a suggestion names at most two things you watched',
        reasons.length > 0 && overlong.length === 0,
        overlong[0] ?? reasons[0] ?? '(no suggestions on this library)',
      );
    }
    // Six is the tab bar alone, so anything at or below that means the screen's own
    // controls did not declare themselves.
    await audit(`the ${tab} tab`, 7);
    await noGhosts(`the ${tab} tab`);
  }
  await page.screenshot({ path: OUT + '6-more.png' });

  // --- The rest of More --------------------------------------------------------
  // Every link has to lead somewhere. A route that does not exist is a dead end that
  // only shows up when someone taps it, which is how the title page shipped broken.
  // The minimum is per screen and not a blanket number, because two of these are
  // gated: without an account Lists and People are a sentence explaining why, and
  // asserting they hold three controls would assert something untrue. What the audit
  // still catches there is a control that exists and has no name.
  for (const [detail, expect_, controls] of [
    ['What is airing, and what to be told about', /Tell me about/i, 4],
    ['Film and television in the same list', /list/i, 1],
    ['Your handle, following, blocking', /account|sync|following/i, 1],
  ]) {
    await page.getByText(detail).click();
    await page.waitForTimeout(1500);
    const body = await text();
    check(`${detail.slice(0, 22)}… opens`, expect_.test(body), body.slice(0, 90));
    await audit(detail.slice(0, 22), controls);
    await page.goBack();
    await page.waitForTimeout(1000);
  }

  // --- Notifications say what they can actually do -----------------------------
  // The phone offered the same three granularity settings as the web and had nothing
  // that could act on them. Under react-native-web there is still nothing — the web
  // build gets its notifications from the browser — so what must be true here is that
  // the screen says so rather than showing a control that does nothing.
  await page.getByText('What is airing, and what to be told about').click();
  await page.waitForSelector('text=/Tell me about/i', { timeout: 15000 });
  const upcoming = await text();
  check(
    'the calendar is honest about what it can deliver',
    /Nothing can be delivered to this device yet/i.test(upcoming),
    upcoming.slice(0, 120),
  );
  check(
    'and says which reason applies',
    /browser|simulator|project id/i.test(upcoming),
  );
  await page.goBack();
  await page.waitForTimeout(1000);

  // --- The watching preference -------------------------------------------------
  // The web has offered this since it shipped. The phone did the opposite of what the
  // toggle describes — it never opened the conversation — which is a worse kind of
  // missing than an absent control, because nothing said so.
  await page.getByText('Import from TV Time, export everything').click();
  await page.waitForTimeout(1500);
  check(
    'the phone offers the open-the-conversation preference',
    (await page.getByText('Open the conversation after marking watched').count()) > 0,
  );
  // Walked through for a toggle since it shipped, and never once read. §6.40.
  await audit('Your data', 5);
  await noGhosts('Your data');
  await scaled('Your data');
  await page.goBack();
  await page.waitForTimeout(1000);

  // --- Account ---------------------------------------------------------------
  await page.getByText('Optional — adds sync and the shared layer').click();
  await page.waitForTimeout(1500);
  const account = await text();
  // A credential-free build must say why rather than showing a form that cannot work.
  check(
    'the account screen explains what it needs',
    /not configured on this build/i.test(account),
    account.slice(0, 120),
  );
  // One control on a credential-free build — the header's back — and that one still has
  // to have a name and be big enough to hit.
  await audit('Account', 1);
  await noGhosts('Account');
  await scaled('Account');
  await page.goBack();
  await page.waitForTimeout(1000);

  // --- The remote ------------------------------------------------------------
  // This is what going native bought: the same feature on the web needed a companion
  // process dialling out to a relay, because a page cannot reach a LAN address.
  await page.getByText('Control a TV on your Wi-Fi, directly').click();
  await page.waitForTimeout(1500);
  const remote = await text();
  // By name rather than by the legend printed on the key: the legends are mono marks now
  // ('HOME', 'VOL +', '−15'), and the name is the part that was always meant to carry it.
  check(
    'the remote opens with its buttons',
    /Scan Wi-Fi/.test(remote) && (await page.getByLabel('Home').count()) > 0,
    remote.slice(0, 110),
  );

  /*
   * And every one of them is off until there is something to talk to.
   *
   * Every key used to render pressable with no device attached, so pressing one did
   * nothing and said nothing about why. The web faded the lot behind a `fieldset` at 40%
   * opacity, which says "broken" rather than "waiting". This is the state the suite lands
   * in every run — no television on this network — so it is the state worth asserting.
   */
  check(
    'and every key is off until a device is found',
    await page.evaluate(() =>
      ['Up', 'Select', 'Play or pause', 'Home', 'Volume up'].every((name) => {
        const el = document.querySelector(`[aria-label="${name}"]`);
        return el instanceof HTMLButtonElement && el.disabled;
      }),
    ),
  );
  check(
    'it says plainly that nothing is paired yet',
    /No device yet/.test(remote),
  );
  await audit('the remote', 12);
  await noGhosts('the remote');
  await scaled('the remote');
  await page.screenshot({ path: OUT + '10-remote.png' });
  await page.goBack();
  await page.waitForTimeout(1000);

  // --- Stats -----------------------------------------------------------------
  await page.getByText('Runtime-weighted, and your year in review').click();
  await page.waitForTimeout(2000);
  const stats = await text();
  // The numbers, not the labels above them — and the day, written the way this app
  // writes days rather than as the storage key it came from. §6.78.
  check(
    'stats are runtime-weighted',
    /Watched\s*\d/.test(stats) && /Episodes\s*\d/.test(stats),
    stats.slice(0, 110),
  );
  const busiest = stats.match(/Busiest day was (.+?) with \d+ episodes?\./)?.[1];
  check(
    'the busiest day is written the way this app writes days',
    // Absent is fine here: this phone's library may hold a single day of watches and no
    // busiest day to name. Present and spelled as a date key is not.
    !busiest || (!/\//.test(busiest) && !/^\d{4}-\d{2}-\d{2}$/.test(busiest)),
    busiest ?? '(no busiest day on this library)',
  );
  await audit('Stats', 4);
  await noGhosts('Stats');
  await scaled('Stats');
  await page.screenshot({ path: OUT + '7-stats.png' });
  await page.goBack();
  await page.waitForTimeout(800);
  // Back on More; the title page is reached from Up Next.
  await page.getByText('Up Next', { exact: true }).last().click();
  await page.waitForTimeout(1200);

  // --- The title page --------------------------------------------------------
  // Both other screens link here. This check exists because the file once failed to
  // write and nothing noticed until the link was followed by hand.
  await page.getByText('The Long Dark').first().click();
  await page.waitForTimeout(2000);
  const title = await text();
  check('the title page opens rather than dead-ending', /survival drama/i.test(title), title.slice(0, 100));
  check('the episode list renders', /season 1/i.test(title), title.slice(0, 130));
  // Availability is why people open a tracker once they have decided what to watch and
  // not how, and the phone had none of it until the parity audit.
  check('where to watch lists a service', /Where to watch/i.test(title) && /Stream/.test(title));
  check(
    'JustWatch attribution appears with the data',
    /JustWatch/.test(title),
    'licence condition, not a courtesy',
  );

  // The override lives on the library row, so it only appears for something tracked.
  check(
    'a custom poster can be set',
    (await page.getByText('Use a different poster').count()) > 0,
  );
  // Eighteen episodes, each with React, Talk and Mark; plus the stars, the poster
  // override, where-to-watch and the content warnings.
  await audit('the title page', 30);
  await noGhosts('the title page');
  await scaled('the title page');

  await page.screenshot({ path: OUT + '5-title.png' });

  // --- Catching up in bulk ----------------------------------------------------
  // Coming back to a show after a week away and marking six episodes one at a time is
  // what this avoids. It shows numbers and nothing else: an episode list would spoil
  // exactly the person using it.
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=The Long Dark', { timeout: 20000 });
  await page.getByText('Caught up further?').first().click();
  await page.waitForSelector('text=How far have you got?', { timeout: 15000 });
  const sheet = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  check('the catch-up sheet opens', true);
  check(
    'and shows numbers rather than episode names',
    !/Episode \d/.test(sheet.split('How far have you got?')[1] ?? ''),
  );
  await audit('the catch-up sheet', 3);
  await noGhosts('the catch-up sheet');
  await scaled('the catch-up sheet');

  // Two seasons in the fixture, so the season comes first — one season would skip
  // straight to episodes, which is why the sheet chooses rather than always asking.
  await page.getByLabel('Season: 1').click();
  await page.waitForSelector('text=/Last episode you watched/', { timeout: 15000 });
  await page.getByLabel(/^Last episode you watched in season 1: 5$/).click();
  await page.waitForTimeout(1500);
  const confirmed = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  // The confirmation has to survive the row it came from disappearing, which is why the
  // sheet belongs to the screen and not to the row.
  check('the confirmation survives the row disappearing', /Marked \d+ episodes? as watched/.test(confirmed), confirmed.slice(0, 80));
  await page.getByText('Done', { exact: true }).click();
  await page.waitForTimeout(1000);

  // Back to the title page, which is where the next section starts from. Catching up
  // navigated here from Up Next, so without this the Watching Mode step would be
  // looking for a control on a screen it is no longer on.
  await page.getByText('The Long Dark').first().click();
  await page.waitForTimeout(2000);

  // --- Watching Mode ---------------------------------------------------------
  // The reason this app exists rather than another tracker.
  await page.getByText('React', { exact: true }).first().click();
  await page.waitForTimeout(2000);
  check('Watching Mode opens', (await text()).includes('Start watching'));

  // Continuous listening is native-only: `useAudioStream` has no web implementation, so
  // the control must remove itself rather than offer a button that cannot work. Worth a
  // check because the failure mode is a dead affordance, not an error.
  check(
    'listening hides itself where there is no audio stream',
    !(await text()).includes('Keep in sync by listening'),
  );

  await page.getByText('Start watching').click();
  await page.waitForTimeout(1500);
  await page.getByText('Cliffhanger').click();
  await page.waitForTimeout(1200);

  const stored = await page.evaluate(async () => {
    const response = await fetch('/');
    void response;
    return document.body.innerText.includes('Pause');
  });
  check('the clock runs once started', stored);

  // WCAG 2.2.2: anything that moves by itself for longer than five seconds needs a way
  // to stop. Density thinned the stream; nothing halted it.
  const hold = page.getByLabel(/reactions (still|move again)/);
  check('the stream can be held still', (await hold.count()) === 1);
  await hold.click();
  await page.waitForTimeout(400);
  check(
    'holding it does not stop the clock',
    /Pause/.test(await text()),
    'the timecode is the point of the screen',
  );
  await hold.click();
  await page.waitForTimeout(400);

  // The hook claims AccessibilityInfo covers all three platforms because
  // react-native-web implements it on top of prefers-reduced-motion. That is the sort
  // of claim worth checking rather than asserting in a comment.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(600);
  // Something has to be in the stream to look at, and a tap of the pad puts it there:
  // your own reactions replay alongside everyone else's.
  await page.getByLabel('React with funny').click();
  // Far enough into the four-second lifetime that a drifting one would have moved a
  // long way. Position is the discriminator, not presence: the animated version is
  // still on screen at this point, just somewhere else.
  await page.waitForTimeout(2200);
  const calm = await page.evaluate(() => {
    const stream = document.querySelector('[aria-label="Reactions from other viewers"]');
    const emoji = stream?.querySelector('div');
    if (!emoji) return { shown: false };
    return {
      shown: true,
      onScreen: emoji.getBoundingClientRect().width > 0,
      // react-native-web writes Animated's translateX into an inline transform.
      transform: getComputedStyle(emoji).transform,
    };
  });
  check(
    'the phone reads the reduced-motion setting through react-native-web',
    calm.shown && calm.onScreen && (calm.transform === 'none' || /matrix\(1, 0, 0, 1, 0, 0\)/.test(calm.transform)),
    JSON.stringify(calm),
  );
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.waitForTimeout(400);

  // What the stream says out loud. The web's announced every reaction — twenty-four a
  // minute at the default density — and the phone's announced nothing at all, which
  // removes the feature outright for anyone who cannot see it. Both are wrong; it
  // summarises a moment now, and the emoji themselves are out of the reading order.
  const spoken = await page.evaluate(() => {
    const stream = document.querySelector('[aria-label="Reactions from other viewers"]');
    if (!stream) return { found: false };
    const live = stream.querySelector('[aria-live="polite"]');
    return {
      found: true,
      speaks: Boolean(live),
      // A live region announces its whole subtree, so an emoji inside one is announced
      // whatever else is done to it.
      saysEmoji: /\p{Extended_Pictographic}/u.test(live?.textContent ?? ''),
      emojiHidden: [...stream.querySelectorAll('div')]
        .filter((el) => /\p{Extended_Pictographic}/u.test(el.textContent ?? ''))
        .every((el) => el.closest('[aria-hidden="true"]')),
    };
  });
  check(
    'the stream has a voice that is not the emoji',
    spoken.found && spoken.speaks && !spoken.saysEmoji,
    JSON.stringify(spoken),
  );
  check(
    'and the emoji are out of the reading order',
    spoken.emojiHidden,
    JSON.stringify(spoken),
  );

  await page.screenshot({ path: OUT + '8-watching.png' });

  await page.getByPlaceholder('Search any emoji…').fill('twist');
  await page.waitForTimeout(800);
  check('emoji search filters the pad', (await text()).includes('Mind blown'));

  // "Any emojis can be used by simply searching in the search bar." For a while that
  // meant thirty-two of them, so a taco did not exist as far as the app was concerned.
  await page.getByPlaceholder('Search any emoji…').fill('taco');
  await page.waitForTimeout(800);
  check('search reaches emoji outside the curated pad', (await text()).includes('🌮'));

  await page.getByPlaceholder('Search any emoji…').fill('');
  await page.waitForTimeout(500);
  // Twenty emoji on the pad, plus the clock controls, the density chips and the two
  // ways out. An emoji reads as its own Unicode name, so a pad button labelled only by
  // its caption announces the name twice over with two different words for it — these
  // carry one name each, and it is the word a person would say.
  await audit('Watching Mode', 26);
  await noGhosts('Watching Mode');
  await scaled('Watching Mode');
  await page.screenshot({ path: OUT + '9-emoji-search.png' });

  // --- The remote, in a drawer ------------------------------------------------
  // "Hidden in a drawer to the side." The phone had the controls on their own screen
  // reached through the More tab, so using the remote during an episode meant leaving
  // Watching Mode — losing the clock and the reaction stream, and having to find the
  // episode again afterwards.
  await page.getByLabel('Open remote').click();
  await page.waitForTimeout(800);
  const drawer = await text();
  check('the remote opens as a drawer without leaving Watching Mode', /Scan Wi-Fi/.test(drawer));
  check(
    'and the clock is still running behind it',
    /Pause|Resume/.test(drawer),
    'the whole reason for not making it a separate screen',
  );
  await page.screenshot({ path: OUT + '11-remote-drawer.png' });
  // Every control in the drawer says what it is, not just what it looks like. "▲" read
  // aloud is "up-pointing triangle"; the web remote has named these since it shipped.
  for (const name of ['Up', 'Select', 'Play or pause', 'Back 15 seconds', 'Volume up']) {
    check(`the remote's ${name} key is named`, (await page.getByLabel(name).count()) > 0);
  }
  await audit('the remote drawer', 25);
  await noGhosts('the remote drawer');
  await scaled('the remote drawer');

  await page.getByLabel('Close remote').click();
  await page.waitForTimeout(600);

  // The drawer stays mounted when closed — that is the point of it, the connection is
  // not torn down each time — so it has to be hidden from screen readers rather than
  // merely moved off-screen, or the whole remote sits in the swipe order invisibly.
  const drawerHidden = await page.evaluate(() => {
    const key = [...document.querySelectorAll('[aria-label="Play or pause"]')][0];
    if (!key) return 'the key is gone from the DOM entirely';
    return key.closest('[aria-hidden="true"], [inert]') ? true : 'still reachable';
  });
  check(
    'the closed drawer is out of the screen reader\'s reach',
    drawerHidden === true,
    typeof drawerHidden === 'string' ? drawerHidden : '',
  );

  await page.getByLabel('Leave Watching Mode').click();
  await page.waitForTimeout(1500);

  // --- Comments, and the spoiler gate ------------------------------------------
  // The gate is a database policy; this screen only explains it. Unwatched episodes
  // must say so rather than showing an empty thread that looks like nobody commented.
  await page.getByText('Talk', { exact: true }).last().click();
  await page.waitForTimeout(1500);
  const talk = await text();
  check(
    'an unwatched episode says its comments are sealed',
    /Hidden until you watch it|needs? an account|not configured/i.test(talk),
    talk.slice(0, 130),
  );
  // Gated like Lists and People: without an account this is the explanation and a way
  // back, and nothing else.
  await audit('comments', 1);
  await noGhosts('comments');
  await page.screenshot({ path: OUT + '11-comments.png' });
  await page.goBack();
  await page.waitForTimeout(1000);

  // --- With the network off ------------------------------------------------------
  //
  // Navigated by tapping, not by `goto`: this is the static web export and a fresh
  // document fetch with the network off is the browser's own error page, which tests the
  // export rather than the app. There is no service worker here — on a phone the bundle
  // is on the device — so the honest question is the aeroplane one: the app is already
  // running, the network goes away, does it keep working. Nothing had asked it. §6.56.
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.context().setOffline(true);
  try {
    // Matched on what the screen itself says, not on its own name: "Watchlist" is
    // written on the tab bar, so a tap that navigated nowhere would pass that.
    for (const [tab, expected] of [
      // The note written earlier in this run, which only the watchlist shows.
      ['Watchlist', /Recommended by Sam|Nothing saved yet/],
      ['Discover', /Nothing you have already watched or added|Because you watched/],
    ]) {
      await page.getByText(tab, { exact: true }).first().click();
      await page.waitForTimeout(1500);
      const body = await text();
      check(`the ${tab} tab still works with no network`, expected.test(body), body.slice(0, 110));
    }

    // The two that ask a server, reached the way somebody would reach them.
    await page.getByText('More', { exact: true }).first().click();
    await page.waitForTimeout(1200);
    for (const [name, expected] of [
      ['Lists', /Sign in .* to make lists|Lists need an account|No lists yet/],
      ['People', /Sign in .* to follow people|needs sync configured|Following/],
    ]) {
      await page.getByText(name, { exact: true }).first().click();
      await page.waitForTimeout(2000);
      const body = await text();
      // The failure being guarded against is either of them rendering a server error, or
      // worse, rendering as "you have nothing".
      check(`${name} says something true with no network`, expected.test(body), body.slice(0, 130));
      await page.goBack();
      await page.waitForTimeout(1000);
    }
  } finally {
    await page.context().setOffline(false);
  }

  /**
   * The import, end to end, on the platform that could not be driven.
   *
   * `app/src/ui/migrationParity.test.ts` used to say the phone's end of this was
   * unreachable, because importing goes through the system document picker. It is
   * reachable: `expo-document-picker` on web is a hidden file input, and Playwright
   * answers it with `page.on('filechooser')`. §6.79 found that out; §6.80 needed it.
   *
   * A fresh context so nothing above is disturbed, and so this starts from an empty
   * library the way somebody arriving from TV Time does.
   */
  const migrant = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const fresh = await migrant.newPage();
  try {
    // 264 rows over 12 shows, which takes the phone's store about five seconds — long
    // enough that the window this checks is real rather than theoretical.
    const rows = ['show,season,number,name,seen,seen_date,times_watched,air_date,show_id,episode_id'];
    const shows = ['Dark', 'Andor', 'Chernobyl', 'Severance', 'Shogun', 'The Bear',
                   'Frieren', 'Mr. Robot', 'The Leftovers', 'Vinland Saga', 'Halt', 'Fringe'];
    shows.forEach((name, i) => {
      for (let season = 1; season <= 2; season++) {
        for (let n = 1; n <= 11; n++) {
          rows.push(`${name},${season},${n},Episode ${n},True,2024-03-0${(n % 9) + 1} 20:00:00,1,2024-03-0${(n % 9) + 1},${100 + i},${1000 + i * 100 + season * 20 + n}`);
        }
      }
    });
    const csv = rows.slice(0, 265).join('\n');

    await fresh.goto(BASE);
    await fresh.waitForTimeout(2500);
    fresh.on('filechooser', (chooser) => {
      chooser
        .setFiles({ name: 'episodes.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
        .catch(() => {});
    });
    await fresh.getByRole('button', { name: /Import from TV Time/i }).click();

    // Sample the whole run rather than one moment: the bug §6.80 fixed was a five-second
    // window, and a single well-timed look is how it survived two evenings.
    const midFlight = [];
    let landed = false;
    for (let i = 0; i < 25 && !landed; i++) {
      await fresh.waitForTimeout(400);
      const body = (await fresh.locator('body').innerText()).replace(/\s+/g, ' ');
      if (/Your history is in/.test(body)) landed = true;
      else if (/Still reading|came from an import|Bringing in/.test(body)) midFlight.push(body);
    }

    check('the phone can import a TV Time export at all', landed);
    check(
      'the import is visibly under way rather than silent',
      midFlight.length > 0,
      `${midFlight.length} samples`,
    );

    /**
     * The three things §6.80 found, each asserted over every sample rather than one.
     * A settled sentence, a growing count, or a repair button — any of them appearing
     * once during the run is the bug.
     */
    const settled = midFlight.find((b) => /came from an import|Bringing in \d+ show/.test(b));
    check('never describes a settled library mid-import', !settled, (settled ?? '').slice(0, 120));

    const offered = midFlight.find((b) => /Match imported shows/.test(b));
    check(
      'never offers to match a library still being written',
      !offered,
      (offered ?? '').slice(0, 120),
    );

    const said = midFlight.every((b) => /Still reading your TV Time export/.test(b));
    check('says it is still reading, and names what', said, midFlight[0]?.slice(0, 120) ?? '');
  } finally {
    await migrant.close();
  }

  check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
} catch (err) {
  check('smoke run completed', false, err.message);
} finally {
  await browser.close();
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);

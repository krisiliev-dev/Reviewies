/**
 * End-to-end smoke check of the core loop, driven in a real browser.
 *
 * Verifies the flow the whole product is judged on: find a show, track it, see it in
 * Up Next with a remaining count, mark an episode watched, and confirm the count
 * moves. Then exercises Watching Mode and export.
 *
 * Run against `npm run preview` — of a build made *without* a TMDB token, which is what
 * `npm run smoke` does. This suite asserts on the fixture catalogue: eighteen episodes of
 * The Long Dark, two seasons, a film called Quiet Harbour. Against a credentialed build it
 * would be asking a real API about shows that do not exist.
 *
 * That was accidental until doc 10 §1. `metadata/index.ts` chose its provider at module
 * scope, before the app had bound its config, so every build behaved as a fixture build
 * whatever the token said — and this suite passed because of a bug rather than because of
 * an arrangement. It is arranged now.
 *
 * Screenshots land in ./screenshots.
 */
import { chromium } from 'playwright';
import { chromiumOptions } from '../scripts/browser.mjs';
import { mkdirSync } from 'node:fs';
import { strToU8, zipSync } from 'fflate';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.BASE ?? 'http://localhost:4173';
const OUT = new URL('./screenshots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

/**
 * A real DioCache.db with real write-ahead frames, built by real SQLite.
 *
 * The second film is written after a checkpoint, so it exists only in the -wal —
 * which is the whole point. Both files are copied while the connection is still open,
 * because closing SQLite checkpoints and deletes the log.
 */
function buildDioCache() {
  const dir = mkdtempSync(join(tmpdir(), 'smoke-dio-'));
  const path = join(dir, 'DioCache.db');

  const movie = (uuid, name) => ({
    status: 'success',
    data: {
      type: 'list',
      objects: [
        {
          uuid,
          entity_type: 'movie',
          rewatch_count: 0,
          watched_at: '2026-02-01T20:00:00Z',
          filter: ['watched'],
          extended: { is_watched: true },
          meta: { uuid, name, runtime: 6000 },
        },
      ],
    },
  });

  const script = [
    "const fs = require('node:fs');",
    "const { DatabaseSync } = require('node:sqlite');",
    `const p = ${JSON.stringify(path)};`,
    'const db = new DatabaseSync(p);',
    'db.exec("pragma journal_mode = wal");',
    'db.exec("create table cache_dio (key text, subKey text, max_age_date integer, ' +
      'max_stale_date integer, content BLOB, statusCode integer, headers BLOB, ' +
      'primary key (key, subKey))");',
    'const put = (k, o) => db.prepare("insert into cache_dio values (?,?,?,?,?,?,?)")' +
      '.run(k, "s", 0, 0, Buffer.from(JSON.stringify(o)), 200, Buffer.from("{}"));',
    `put('checkpointed', ${JSON.stringify(movie('m1', 'Checkpointed Film'))});`,
    // Padding, so the checkpoint has whole pages to move.
    "for (let i = 0; i < 200; i++) put('pad' + i, { junk: 'x'.repeat(200) });",
    'db.exec("pragma wal_checkpoint(full)");',
    `put('walonly', ${JSON.stringify(movie('m2', 'Only In The Log'))});`,
    "fs.copyFileSync(p, p + '.copy');",
    "fs.copyFileSync(p + '-wal', p + '.copy-wal');",
  ].join('\n');

  execFileSync(process.execPath, ['-e', script], { stdio: 'pipe' });

  return { db: readFileSync(path + '.copy'), wal: readFileSync(path + '.copy-wal'), dir };
}

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

// A pinned Chromium when this environment has one, and whatever Playwright downloaded
// otherwise — see scripts/browser.mjs.
const browser = await chromium.launch(chromiumOptions());
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', (e) => check('no page errors', false, e.message));

/**
 * Every control on a screen has a name, on every screen — not only the ones this suite
 * happened to reach for.
 *
 * A poster link is the case that made this worth writing: the image is `alt=""` and the
 * placeholder is aria-hidden, both correct on their own, and the link wrapping them had
 * no accessible name at all on five screens. Nothing visual was wrong with it, so
 * nothing but this would have found it.
 *
 * The count is asserted too. Half the ways to lose a name also lose the role, and a
 * screen reporting no controls has not passed — it has failed to be looked at.
 */
/**
 * Reach something that is no longer a tab.
 *
 * The bar is the phone's five now — Up Next, Search, Discover, Watchlist, More — and
 * Upcoming, Lists, People, Stats and Your data live behind the last one. Their URLs did
 * not change; only the route somebody takes to them did, and this suite takes the same
 * route a person would rather than jumping straight to the address.
 */
async function viaMore(name) {
  await page.getByRole('link', { name: /^More$/ }).click();
  await page.getByRole('navigation', { name: 'More sections' }).waitFor({ timeout: 5000 });
  await page.getByRole('link', { name }).click();
}

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

async function audit(screen, atLeast) {
  const found = await page.evaluate(() => {
    const ROLES = ['button', 'link', 'radio', 'checkbox', 'switch', 'tab', 'menuitem'];
    const selector = ROLES.map((r) => `[role="${r}"]`).join(',') + ',button,a[href]';
    let named = 0;
    const nameless = [];
    const small = [];
    for (const el of document.querySelectorAll(selector)) {
      if (el.closest('[aria-hidden="true"], [inert]')) continue;
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
      if (name) named++;
      else nameless.push(el.outerHTML.slice(0, 90));

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
    return { named, nameless, small };
  });

  check(
    `${screen}: every control is named`,
    found.nameless.length === 0,
    found.nameless.length ? found.nameless.join(' | ') : `${found.named} named`,
  );
  check(
    `${screen}: and the screen reports its controls`,
    found.named >= atLeast,
    `${found.named} found, expected at least ${atLeast}`,
  );
  check(
    `${screen}: every control is big enough to hit`,
    found.small.length === 0,
    found.small.join(' | '),
  );
}

/**
 * The same screen with the text at twice the size.
 *
 * WCAG 1.4.4 asks for 200% without loss of content or function. Everything here is
 * sized in rem, so doubling the root size is the honest simulation — and the shape this
 * app is full of, a fixed-width control beside text that grows, is exactly the one that
 * pushes a page sideways. A phone that scrolls horizontally has lost the layout.
 */
async function scaled(screen) {
  await page.addStyleTag({ content: 'html { font-size: 32px !important; }' });
  await page.waitForTimeout(400);

  const result = await page.evaluate(() => {
    const clipped = [];
    // `select` and `input` were missing, which is why the country picker on the title
    // page ran off the right-hand edge for as long as it did: it is a native select,
    // and a check that only looked at buttons and links could not see it.
    for (const el of document.querySelectorAll(
      'button,a[href],select,input,[role="button"],[role="radio"]',
    )) {
      if (el.closest('[aria-hidden="true"],[inert]')) continue;
      const box = el.getBoundingClientRect();
      if (box.width === 0) continue;
      // Any part of it past either edge, not only all of it. Written the loose way
      // first — `left > innerWidth || right < 0` — which asks whether a control is
      // *entirely* gone, and the ones that were actually broken were half gone: a
      // skip button with its right half past the edge is as unusable as one that is
      // not there, and it looked like a pass.
      if (box.right > innerWidth + 1 || box.left < -1) {
        clipped.push((el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 30));
      }
    }
    return {
      scrollWidth: document.documentElement.scrollWidth,
      viewport: innerWidth,
      clipped,
    };
  });

  await page.evaluate(() => document.querySelectorAll('style')[document.querySelectorAll('style').length - 1]?.remove());
  await page.waitForTimeout(300);

  check(
    `${screen}: holds together at 200% text`,
    result.scrollWidth <= result.viewport + 1 && result.clipped.length === 0,
    `${result.scrollWidth} wide in ${result.viewport}${result.clipped.length ? `, off screen: ${result.clipped.join(', ')}` : ''}`,
  );
}

try {
  // --- The first minute ------------------------------------------------------
  // This app exists because TV Time shut down. For a long time the first thing it said
  // to somebody arriving with years of history in a zip was "Nothing tracked yet" and a
  // search box, with the import that would have rescued all of it two taps away behind
  // a tab called Data.
  await page.goto(BASE, { waitUntil: 'networkidle' });
  check(
    'app loads',
    await page.getByRole('heading', { name: 'Bring your history with you' }).isVisible(),
  );
  check(
    'the first screen offers the migration, not a search box',
    (await page.getByText('Import from TV Time').count()) > 0,
  );
  // Three different things arrive under the name "my TV Time data", and someone holding
  // one of them has to see their own case named before they will believe it works.
  const firstRun = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  for (const format of ['GDPR zip', 'CSV', 'DioCache.db']) {
    check(`and names the ${format}`, firstRun.includes(format));
  }
  check(
    'searching is still offered, as the alternative',
    (await page.getByRole('link', { name: /Find something to watch/i }).count()) > 0,
  );
  await page.screenshot({ path: OUT + '01-empty.png' });

  // --- Reaching things without a pointer ---------------------------------------
  // The navigation is the last thing in the document, which is right for a thumb and
  // wrong for a keyboard: a season of eighteen episodes puts fifty-four controls in
  // front of it.
  await page.keyboard.press('Tab');
  const firstStop = await page.evaluate(() => document.activeElement?.textContent?.trim());
  check('the first tab stop is a way past the page', firstStop === 'Skip to navigation', firstStop);

  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  await page.keyboard.press('Tab');
  check(
    'and it lands on the navigation',
    await page.evaluate(() => !!document.activeElement?.closest('nav')),
    await page.evaluate(() => document.activeElement?.textContent?.trim() ?? ''),
  );

  // A focus ring that cannot be seen is the same as no focus ring. The browser's
  // default computed to rgb(16, 16, 16) against a #0b0b0f background — a contrast of
  // about 1.03 — so every control in this app was reachable and none of them showed
  // where you were.
  const ring = await page.evaluate(() => {
    const style = getComputedStyle(document.activeElement);
    const rgb = (value) => value.match(/\d+/g).slice(0, 3).map(Number);
    const lum = (c) => {
      const [r, g, b] = c
        .map((v) => v / 255)
        .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const behind = getComputedStyle(document.body).backgroundColor;
    const [hi, lo] = [lum(rgb(style.outlineColor)), lum(rgb(behind))].sort((a, b) => b - a);
    return {
      width: parseFloat(style.outlineWidth),
      style: style.outlineStyle,
      contrast: (hi + 0.05) / (lo + 0.05),
    };
  });
  check(
    'the focused control is visibly ringed',
    // 3:1 and 2px: the thresholds WCAG sets for a non-text indicator.
    ring.contrast >= 3 && ring.width >= 2 && ring.style !== 'none',
    `${ring.style} ${ring.width}px at ${ring.contrast.toFixed(2)}:1`,
  );

  // --- The empty ones ----------------------------------------------------------
  //
  // Every screen has an empty state and, until §6.40 went looking, three of them had
  // never been rendered by anything: this suite tracks a show early and then never
  // returns to a screen while it still holds nothing. An empty state is not
  // a cosmetic detail here — it is the entire screen for somebody who has just arrived,
  // which is who this product is for.
  //
  // This is the only moment in the run when the database is genuinely empty, so it has
  // to happen here or not at all.
  for (const [name, expected] of [
    [/Stats/, /Nothing watched in this period yet/i],
    [/Upcoming/, /Nothing airing in the next two months/i],
  ]) {
    await viaMore(name);
    await page.waitForTimeout(400);
    const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    check(
      `${String(name).slice(1, -1)} says what empty means`,
      expected.test(body),
      body.slice(0, 120),
    );
  }
  await page.getByRole('link', { name: /Watchlist/ }).click();
  await page.waitForTimeout(400);
  check(
    'the empty watchlist says so',
    /Nothing saved yet/i.test(await page.locator('body').innerText()),
    (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 100),
  );
  await page.screenshot({ path: OUT + '01b-empty-watchlist.png' });
  await page.goto(BASE, { waitUntil: 'networkidle' });

  // --- An address that is not a screen -----------------------------------------
  //
  // There was no catch-all route, so an unknown URL rendered the tab bar, the skip link
  // and an empty `<main>`: no heading, no message, no way to tell a typo from a broken
  // app. Nothing had ever loaded one, which is how it stayed that way — and this suite
  // was itself reading that blank page to decide whether the build had credentials.
  await page.goto(new URL('not-a-screen', BASE + '/').href, { waitUntil: 'networkidle' });
  const missing = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  check('an unknown address says so', /Nothing at this address/i.test(missing), missing.slice(0, 110));
  check('and names the address that was asked for', /\/not-a-screen/.test(missing));
  await audit('the not-found screen', 8);
  await noGhosts('the not-found screen');
  // And it leads somewhere, rather than being a dead end with a message on it.
  await page.getByRole('link', { name: 'Go to Up Next' }).click();
  await page.waitForTimeout(400);
  check(
    'and offers a way back that works',
    (await page.getByRole('heading', { name: 'Bring your history with you' }).count()) > 0,
  );


  // --- Is this build signed in to anything? -----------------------------------
  //
  // Several checks below are about what an account-gated control does, and the answer
  // differs depending on whether the build has Supabase credentials. Asserting the
  // credential-free answer unconditionally used to look fine, because it was written
  // against a build with no `.env` — and `vite.config.ts` sets `envDir: '..'`, so an
  // ordinary build in this repository picks up the root `.env` and takes the other
  // branch. The run then failed on a correct app.
  //
  // So ask the app, once, and hold the answer.
  //
  // `/settings`, not `/account`. This asked `/account` for as long as it has existed — an address
  // the phone has and the web does not — and with no catch-all route the app rendered an
  // empty `<main>`, which does not contain "not configured on this build". So the answer
  // was "configured" unconditionally and three checks below branched on it. It passed
  // only because this checkout has a root `.env`; on a credential-free build it would
  // have asserted the wrong half of each and failed a correct app, which is precisely
  // what the paragraph above says this probe exists to prevent. §6.40.
  //
  // Asserted rather than assumed now: whichever address this is, the panel has to
  // actually be on it, or the probe is reading a blank page again.
  await page.goto(new URL('settings', BASE + '/').href, { waitUntil: 'networkidle' });
  const accountText = await page.locator('body').innerText();
  check(
    'the sync probe is reading the account panel',
    /Sync across devices/i.test(accountText),
    accountText.replace(/\s+/g, ' ').slice(0, 90),
  );
  const configured = !/not configured on this build/i.test(accountText);
  console.log(`(build is ${configured ? 'configured for sync' : 'credential-free'})`);
  await page.goto(BASE, { waitUntil: 'networkidle' });

  // --- Search and track ------------------------------------------------------
  await page.getByRole('link', { name: /Find something to watch/i }).click();
  await page.getByPlaceholder('Shows, films, anime…').fill('long');
  await page.waitForSelector('text=The Long Dark', { timeout: 5000 });
  check('search returns results', true);
  await audit('Search', 8);
  await noGhosts('Search');
  await scaled('Search');
  await page.screenshot({ path: OUT + '02-search.png' });

  await page.getByRole('button', { name: 'Track The Long Dark' }).click();
  await page.waitForSelector('text=Tracking', { timeout: 5000 });

  // --- Up Next ---------------------------------------------------------------
  await page.getByRole('link', { name: /Up Next/ }).click();
  await page.waitForSelector('text=The Long Dark', { timeout: 5000 });

  const row = page.locator('li').filter({ hasText: 'The Long Dark' }).first();
  await row.waitFor({ timeout: 5000 });
  const rowText = (await row.innerText()).replace(/\s+/g, ' ');
  check('Up Next offers the first episode', /S1E1\b/.test(rowText), rowText);

  const remainingText = await page.locator('text=/more episodes/').first().textContent();
  check('shows a remaining count, not a vague badge', /\d+ more episodes/.test(remainingText ?? ''), remainingText?.trim());
  await audit('Up Next', 10);
  await noGhosts('Up Next');
  await scaled('Up Next');
  await page.screenshot({ path: OUT + '03-upnext.png' });

  // --- Mark watched ----------------------------------------------------------
  await page.getByRole('button', { name: /Mark The Long Dark S1E1 watched/i }).click();

  // Opening the conversation after marking watched is how TV Time worked and was named
  // as a failing in two of its successors — but only when there is an account behind
  // it, because an empty comments page is a dead end. Both halves of that rule are
  // worth asserting; which one applies depends on the build, and the check has to come
  // before anything that looks at Up Next, because in one of the two it is no longer
  // the page being looked at.
  if (configured) {
    await page.waitForURL(/\/comments\//, { timeout: 5000 });
    check('marking watched opens the conversation when there is one', true, page.url());

    // And then it looked at the URL and left. This is the one screen in the app the
    // suite arrived at and never read — §6.40 — and it is the screen that carries the
    // composer, the effort filter and the spoiler gate. Reachable here precisely
    // because the episode was just marked watched: the gate is a local watch count,
    // not an account, so a signed-out build with credentials gets the open state.
    await page
      .getByRole('radiogroup', { name: 'How much effort a comment has to show' })
      .waitFor({ timeout: 8000 });
    const conversation = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    check(
      'the conversation is open, not sealed',
      !/Hidden until you watch it/.test(conversation),
      conversation.slice(0, 110),
    );
    check(
      'and offers somewhere to write',
      (await page.getByPlaceholder(/What did you think/i).count()) > 0,
    );
    check(
      'and says which episode it is about',
      /S1E1/.test(conversation),
      conversation.slice(0, 110),
    );
    // Three effort levels, a composer with its attach control, Back, and the tab bar.
    await audit('the conversation', 11);
    await noGhosts('the conversation');
    await scaled('the conversation');
    await page.screenshot({ path: OUT + '03b-comments.png' });

    await page.getByRole('link', { name: /Up Next/ }).click();
    await page.waitForSelector('text=The Long Dark', { timeout: 5000 });
  } else {
    check('marking watched stays put without an account', page.url().endsWith('/'), page.url());
  }

  await page.waitForSelector('text=/S1E2/', { timeout: 5000 });
  check('marking watched advances to the next episode', true);

  const after = await page.locator('text=/more episodes/').first().textContent();
  const before = Number(remainingText?.match(/(\d+)/)?.[1]);
  const now = Number(after?.match(/(\d+)/)?.[1]);
  check('remaining count decrements', now === before - 1, `${before} → ${now}`);
  await viaMore(/Your data/);
  await page.waitForSelector('text=Open the conversation after marking watched', { timeout: 5000 });
  check('the preference for it is offered', true);
  await page.getByRole('link', { name: /Up Next/ }).click();

  // --- Watching Mode ---------------------------------------------------------
  await page.getByRole('link', { name: /^Watch along with / }).first().click();
  await page.waitForSelector('text=Start watching', { timeout: 5000 });
  check('Watching Mode opens', true);
  await page.screenshot({ path: OUT + '04-watching-start.png' });

  await page.getByRole('button', { name: 'Start watching' }).click();
  await page.waitForTimeout(1200);

  await page.getByRole('button', { name: 'React with cliffhanger' }).click();
  await page.getByRole('button', { name: 'React with reveal' }).click();
  check('reactions can be recorded', true);

  const reactionCount = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open('reviewies');
        req.onsuccess = () => {
          const tx = req.result.transaction('reactions', 'readonly');
          const count = tx.objectStore('reactions').count();
          count.onsuccess = () => resolve(count.result);
        };
      }),
  );
  check('reactions persist to IndexedDB', reactionCount === 2, `${reactionCount} stored`);

  // --- Holding the stream still --------------------------------------------------
  // WCAG 2.2.2 asks for a way to stop anything that moves by itself for more than five
  // seconds. This drifts for the length of an episode, and density only thinned it.
  const hold = page.getByRole('button', { name: /reactions (still|move again)/ });
  check('the stream can be held', (await hold.count()) === 1);
  await hold.click();
  check(
    'and says so',
    (await hold.getAttribute('aria-pressed')) === 'true',
    (await hold.getAttribute('aria-label')) ?? '',
  );
  // Held is not the same as paused: the timecode is the point of the screen.
  check(
    'the clock keeps running while it is held',
    (await page.getByRole('button', { name: 'Pause the clock' }).count()) === 1,
  );
  await hold.click();

  // --- Less motion, not less feature ---------------------------------------------
  // index.css flattens every animation under prefers-reduced-motion, which is right for
  // everything except the one component whose animation *is* the feature: the drift ran
  // straight to its end state, off the left-hand edge, so the setting emptied the top of
  // the screen entirely. It has to change how reactions are presented, not how fast.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Back before the two reactions recorded above, then let the clock reach them again.
  await page.getByRole('button', { name: 'Move the clock back 5 seconds' }).click();
  await page.waitForTimeout(4000);

  const stillThere = await page.evaluate(() => {
    const stream = document.querySelector('[aria-label="Reactions from other viewers"]');
    const first = stream?.querySelector('span');
    if (!first) return { inDom: false };
    const box = first.getBoundingClientRect();
    const style = getComputedStyle(first);
    return {
      inDom: true,
      // Where it actually is, not whether it exists. The broken version left the span
      // in the document and ran the animation instantly to its end state, which is
      // translateX(-20vw) — present, and a fifth of a screen past the left edge.
      onScreen: box.right > 0 && box.left < innerWidth,
      left: Math.round(box.left),
      animated: style.animationName !== 'none',
    };
  });
  check(
    'reactions still appear when less motion is asked for',
    stillThere.inDom && stillThere.onScreen,
    JSON.stringify(stillThere),
  );
  check(
    'and they are placed rather than animated',
    stillThere.inDom && !stillThere.animated,
    JSON.stringify(stillThere),
  );
  await page.screenshot({ path: OUT + '17-reduced-motion.png' });
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  await page.getByPlaceholder('Search any emoji…').fill('twist');
  await page.waitForTimeout(300);
  check(
    'emoji search filters the pad',
    (await page.getByRole('button', { name: 'React with mind blown' }).count()) > 0,
  );

  // "Any emojis can be used by simply searching in the search bar." The index arrives as
  // its own chunk once Watching Mode opens, so this also proves that chunk loads.
  await page.getByPlaceholder('Search any emoji…').fill('taco');
  await page.waitForTimeout(800);
  check(
    'search reaches emoji outside the curated pad',
    (await page.locator('body').innerText()).includes('🌮'),
  );
  await page.getByPlaceholder('Search any emoji…').fill('');
  await page.waitForTimeout(400);
  // Twenty emoji on the pad plus the clock controls and the way out. The emoji glyph
  // is aria-hidden and the caption is the whole name, so each of these announces once,
  // as a word a person would say rather than as a Unicode description.
  await audit('Watching Mode', 23);
  await noGhosts('Watching Mode');
  await scaled('Watching Mode');
  await page.screenshot({ path: OUT + '05-watching-live.png' });

  // --- Stepping away and coming back ---------------------------------------------
  //
  // The sharpest thing doc 10 found by using the app: the clock lived in React state and
  // nowhere else, so leaving this screen for a moment — a phone call, checking who that
  // actor is — came back to 0:00 and "Start watching". For a second-screen app that is
  // not an edge case, it is the case.
  //
  // What must be true is not "the number is preserved" but "the episode kept playing":
  // a clock that was running comes back *further on*, by roughly the time you were away.
  const beforeLeaving = await page.locator('text=/^\\d+:\\d\\d$/').first().innerText();
  await page.getByRole('button', { name: 'Leave Watching Mode' }).click();
  await page.waitForSelector('h1:text("Up Next")', { timeout: 5000 });
  await page.waitForTimeout(3000);
  await page.getByRole('link', { name: /^Watch along with / }).first().click();
  await page.waitForTimeout(1200);

  const onReturn = await page.locator('text=/^\\d+:\\d\\d$/').first().innerText();
  const seconds = (t) => Number(t.split(':')[0]) * 60 + Number(t.split(':')[1]);
  check(
    'coming back picks up where you left off',
    seconds(onReturn) >= seconds(beforeLeaving),
    `${beforeLeaving} → ${onReturn}`,
  );
  check(
    'and further on, because the episode did not stop',
    seconds(onReturn) > seconds(beforeLeaving),
    `${beforeLeaving} → ${onReturn}`,
  );
  check(
    'and offers to resume rather than to start',
    (await page.getByRole('button', { name: /Resume/ }).count()) > 0,
  );

  // --- Extension auto-sync ---------------------------------------------------
  // Simulate what the extension's content script posts into the page and confirm
  // the clock follows it instead of needing a manual start.
  await page.getByRole('button', { name: 'Leave Watching Mode' }).click();
  await page.getByRole('link', { name: /Up Next/ }).click();
  await page.getByRole('link', { name: /^Watch along with / }).first().click();
  // "Resume", not "Start watching": the clock persists since doc 10 §2, and re-entering
  // an episode that was running is now a resume. The extension's reading has to
  // supersede a restored position as much as an absent one.
  await page
    .getByRole('button', { name: /Resume|Start watching/ })
    .first()
    .waitFor({ timeout: 5000 });

  await page.evaluate(() => {
    window.postMessage(
      {
        type: 'reviewies:playback',
        payload: { positionMs: 754000, durationMs: 3000000, paused: false, at: Date.now() },
      },
      window.location.origin,
    );
  });
  await page.waitForTimeout(600);

  const syncedText = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  check('extension position drives the clock', /12:3\d/.test(syncedText), syncedText.slice(0, 90));
  check('auto-sync replaces the manual start prompt', !/Start watching/.test(syncedText));
  await page.screenshot({ path: OUT + '11-autosync.png' });

  await page.evaluate(() => {
    // A stale reading must be ignored rather than freezing the clock.
    window.postMessage(
      {
        type: 'reviewies:playback',
        payload: { positionMs: 1000, durationMs: 3000000, paused: false, at: Date.now() - 60000 },
      },
      window.location.origin,
    );
  });
  await page.waitForTimeout(400);
  const afterStale = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  check('stale readings are ignored', !/0:0\d/.test(afterStale), afterStale.slice(0, 90));

  // --- Extension scrobbling ----------------------------------------------------
  //
  // The other half of what the extension sends, and the half that never arrived
  // anywhere: it POSTed watches to a URL no Reviewies instance serves. §6.42 sent them
  // down this channel instead, and this is the check that the app is actually listening
  // — the rules are unit-tested in core, and a rule nothing calls is §6.26 again.
  await page.getByRole('button', { name: 'Leave Watching Mode' }).click();
  await page.getByRole('link', { name: /Up Next/ }).click();
  await page.waitForSelector('text=The Long Dark', { timeout: 5000 });
  const beforeScrobble = await page.locator('text=/more episodes/').first().textContent();
  const nextUp = (await page.locator('body').innerText()).match(/S1E(\d+)/)?.[1];

  await page.evaluate((episode) => {
    window.postMessage(
      {
        type: 'reviewies:watched',
        payload: { show: 'The Long Dark', season: 1, episode: Number(episode), at: Date.now() },
      },
      window.location.origin,
    );
  }, nextUp);
  await page.waitForTimeout(1200);

  const afterScrobble = await page.locator('text=/more episodes/').first().textContent();
  const was = Number(beforeScrobble?.match(/(\d+)/)?.[1]);
  const nowRemaining = Number(afterScrobble?.match(/(\d+)/)?.[1]);
  check(
    'a scrobble from the extension marks the episode watched',
    nowRemaining === was - 1,
    `${was} → ${nowRemaining}`,
  );

  // And only for something you already track. A page title must not be able to start
  // tracking a show on your behalf, or to invent a watch for one you have never added.
  const libraryBefore = await page.evaluate(async () => {
    const dbs = await indexedDB.databases();
    return dbs.length;
  });
  await page.evaluate(() => {
    window.postMessage(
      {
        type: 'reviewies:watched',
        payload: { show: 'A Show Nobody Tracks', season: 1, episode: 1, at: Date.now() },
      },
      window.location.origin,
    );
  });
  await page.waitForTimeout(1000);
  const afterUnknown = await page.locator('text=/more episodes/').first().textContent();
  check(
    'and a show that is not in the library changes nothing',
    Number(afterUnknown?.match(/(\d+)/)?.[1]) === nowRemaining &&
      (await page.evaluate(async () => (await indexedDB.databases()).length)) === libraryBefore,
    afterUnknown?.trim(),
  );

  // --- Watchlist with notes --------------------------------------------------
  // Already out of Watching Mode: the scrobble section above left it to read Up Next.
  await page.getByRole('link', { name: /Search/ }).click();
  await page.getByPlaceholder('Shows, films, anime…').fill('quiet');
  await page.waitForSelector('text=Quiet Harbour', { timeout: 5000 });
  await page.getByRole('button', { name: 'Add Quiet Harbour to your watchlist' }).click();
  await page.getByPlaceholder(/Why\?/).fill('Ana recommended');
  await page.getByRole('button', { name: 'Save Quiet Harbour to your watchlist' }).click();

  await page.getByRole('link', { name: /Watchlist/ }).click();
  await page.waitForSelector('text=Quiet Harbour', { timeout: 5000 });
  const noteShown = await page
    .getByText('Ana recommended')
    .first()
    .waitFor({ timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  check(
    'watchlist note is saved and shown',
    noteShown,
    noteShown ? '' : (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 200),
  );
  await audit('Watchlist', 9);
  await noGhosts('Watchlist');
  await scaled('Watchlist');
  await page.screenshot({ path: OUT + '06-watchlist.png' });

  // --- Spoiler-free quick log --------------------------------------------------
  // Logging a film must not require opening its page, which is covered in other
  // people's ratings and its own synopsis.
  await page.getByRole('link', { name: /Search/ }).click();
  await page.getByPlaceholder('Shows, films, anime…').fill('quiet');
  await page.waitForSelector('text=Quiet Harbour', { timeout: 5000 });
  const beforeUrl = page.url();
  await page.getByRole('button', { name: 'Log that you have seen Quiet Harbour' }).click();
  await page.waitForSelector('text=Logged', { timeout: 5000 });
  check('a film can be logged without leaving search', page.url() === beforeUrl, page.url());

  // --- Spoiler-free catch-up ---------------------------------------------------
  await page.getByRole('link', { name: /Up Next/ }).click();
  await page.waitForSelector('text=The Long Dark', { timeout: 5000 });
  await page.getByRole('button', { name: 'Catch up on The Long Dark' }).click();
  // Two-season fixture, so the season step comes first.
  await page.waitForSelector('text=/^Season$/', { timeout: 5000 });
  const sheet = await page.locator('div.rounded-t-3xl').innerText();
  // The whole point of the control: numbers, and no episode names anywhere.
  check(
    'catch-up picker shows no episode names',
    !/Pilot|Thaw|Episode \d/.test(sheet),
    sheet.replace(/\s+/g, ' ').slice(0, 140),
  );
  await audit('the catch-up sheet', 4);
  await noGhosts('the catch-up sheet');
  await scaled('the catch-up sheet');
  await page.screenshot({ path: OUT + '15-catchup.png' });

  // --- The sheet, without a pointer --------------------------------------------
  // Naming a control does not mean anyone can reach it. This sheet was openable,
  // readable and correctly labelled, and a keyboard opening it was left standing
  // outside: focus stayed on the button behind, Tab walked into the page underneath,
  // and Escape did nothing.
  const inDialog = () =>
    page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));

  check('opening the sheet moves focus into it', await inDialog());

  // Ten is more stops than the sheet holds at this step, so at least one wrap happens.
  let escaped = false;
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Tab');
    if (!(await inDialog())) escaped = true;
  }
  check('Tab stays inside the sheet', !escaped, escaped ? 'focus left the dialog' : '10 stops');

  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check(
    'Escape closes the sheet',
    (await page.locator('[role="dialog"]').count()) === 0,
  );
  check(
    'and focus goes back to the button that opened it',
    await page.evaluate(
      () => document.activeElement?.getAttribute('aria-label') === 'Catch up on The Long Dark',
    ),
    await page.evaluate(
      () => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName,
    ),
  );

  // Reopen for the rest of the section, which drives it by pointer.
  await page.getByRole('button', { name: 'Catch up on The Long Dark' }).click();
  await page.waitForSelector('text=/^Season$/', { timeout: 5000 });

  await page.getByRole('button', { name: 'Season: 2' }).click();
  await page.waitForSelector('text=/Last episode you watched in season 2/', { timeout: 5000 });
  await page.screenshot({ path: OUT + '16-catchup-episodes.png' });
  await page.getByRole('button', { name: 'Last episode you watched in season 2: 4' }).click();
  await page.waitForSelector('text=/Marked \\d+ episode/', { timeout: 5000 });
  const markedText = (await page.locator('text=/Marked/').first().innerText()).replace(/\s+/g, ' ');
  // 18 aired episodes; S1E1 was marked by hand and S1E2 by the extension scrobble above,
  // so 10 of the first 12 remain. Catching up must skip the two rather than re-marking
  // them, which would fabricate a rewatch — the count is the assertion that it did.
  check('catching up marks the whole run at once', /Marked 10 episodes/.test(markedText), markedText);
  await page.getByRole('button', { name: 'Done catching up' }).click();

  const afterCatchUp = await page.locator('text=/more episodes|Last one/').first().textContent();
  check('Up Next moves on after catching up', /more episodes|Last one/.test(afterCatchUp ?? ''), afterCatchUp?.trim());

  // --- A finished show completes itself ----------------------------------------
  // r/serializd, about a competitor: "I have over 100 shows stuck in Currently
  // Watching." Kitchen Nightshift is the ended fixture.
  await page.getByRole('link', { name: /Search/ }).click();
  await page.getByPlaceholder('Shows, films, anime…').fill('kitchen');
  await page.waitForSelector('text=Kitchen Nightshift', { timeout: 5000 });
  await page.getByRole('button', { name: 'Track Kitchen Nightshift' }).click();
  await page.waitForSelector('text=Tracking', { timeout: 5000 });

  await page.getByRole('link', { name: /Up Next/ }).click();
  const kitchen = page.locator('li').filter({ hasText: 'Kitchen Nightshift' }).first();
  await kitchen.waitFor({ timeout: 5000 });
  await kitchen.getByRole('button', { name: 'Catch up on Kitchen Nightshift' }).click();
  await page.waitForSelector('text=/Last episode you watched/', { timeout: 5000 });
  await page.getByRole('button', { name: /Last episode you watched.*: 12$/ }).click();
  // Completing the show removes its Up Next row. The confirmation must outlive that,
  // or the sheet just disappears and nothing tells you it worked.
  await page.waitForSelector('text=/Marked \\d+ episode/', { timeout: 5000 });
  check('the catch-up confirmation survives the row disappearing', true);
  await page.getByRole('button', { name: 'Done catching up' }).click();
  await page.waitForTimeout(400);

  const libStatus = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open('reviewies');
        req.onsuccess = () => {
          const store = req.result.transaction('library', 'readonly').objectStore('library');
          const all = store.getAll();
          all.onsuccess = () =>
            resolve(all.result.filter((r) => r.kind === 'show').map((r) => r.status).sort());
        };
      }),
  );
  check('a finished show completes itself', libStatus.includes('completed'), JSON.stringify(libStatus));
  // The one still airing must not be swept up with it.
  check('a show still airing stays in watching', libStatus.includes('watching'), JSON.stringify(libStatus));

  // --- Upcoming --------------------------------------------------------------
  // Through More, which is where it lives now — the tab bar is the phone's five.
  await viaMore(/Upcoming/);
  await page.waitForSelector('text=Tell me about', { timeout: 5000 });
  const upcomingText = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  check('upcoming offers notification granularity', /Premieres & finales/.test(upcomingText));
  check('milestones is the default', /The moments worth knowing about/.test(upcomingText));
  await audit('Upcoming', 9);
  await noGhosts('Upcoming');
  await scaled('Upcoming');
  await page.screenshot({ path: OUT + '10-upcoming.png' });

  // --- Discover --------------------------------------------------------------
  await page.getByRole('link', { name: /Discover/ }).click();
  await page.waitForSelector('text=Nothing you have already watched', { timeout: 5000 });
  await page.waitForTimeout(800);
  // Check the suggested titles specifically, not the whole page: a tracked show
  // legitimately appears in the "Because you watched…" attribution.
  const suggestedTitles = await page.locator('li p.font-medium').allInnerTexts();
  check(
    'discover excludes what you already track',
    !suggestedTitles.includes('The Long Dark'),
    suggestedTitles.join(', '),
  );
  check('discover suggests something', suggestedTitles.length > 0, `${suggestedTitles.length} suggested`);
  check(
    'discover explains why',
    /Because you watched The Long Dark/.test((await page.locator('body').innerText()).replace(/\s+/g, ' ')),
  );
  await audit('Discover', 9);
  await noGhosts('Discover');
  await scaled('Discover');
  await page.screenshot({ path: OUT + '09-discover.png' });

  // --- Stats -----------------------------------------------------------------
  await viaMore(/Stats/);
  await page.waitForSelector('text=Most watched', { timeout: 5000 });
  const statsText = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  check('stats show runtime-weighted totals', /Watched/.test(statsText) && /Episodes/.test(statsText), statsText.slice(0, 120));
  check('stats list the most-watched title', /The Long Dark/.test(statsText));
  await audit('Stats', 9);
  await noGhosts('Stats');
  await scaled('Stats');
  await page.screenshot({ path: OUT + '08-stats.png' });

  // Year in Review is a whole second layout on this screen — a headline panel that only
  // appears when a year is picked rather than a rolling window — and nothing had ever
  // picked one. It shipped in task #16 and had been rendered by unit tests and by
  // nobody's browser.
  const year = new Date().getFullYear();
  await page.getByRole('radio', { name: `Your ${year}` }).click();
  await page.waitForTimeout(500);
  const review = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  check('a year can be picked', /Your \d{4}/.test(review), review.slice(0, 120));
  check(
    'and it puts the year in review at the top',
    review.indexOf(`Your ${year}`) < review.indexOf('Watched'),
    review.slice(0, 140),
  );
  await audit('Year in Review', 9);
  await noGhosts('Year in Review');
  await scaled('Year in Review');
  await page.screenshot({ path: OUT + '08b-year.png' });

  // --- The screens behind More -------------------------------------------------
  //
  // More, Your data and Lists were each walked through by this suite — for a link, a
  // toggle, an import — and none of the three had ever been audited or measured. A
  // screen a suite passes through is not a screen a suite has looked at.
  await page.getByRole('link', { name: /^More$/ }).click();
  await page.waitForSelector('h1:text("More")', { timeout: 5000 });
  await audit('More', 11);
  await noGhosts('More');
  await scaled('More');

  await viaMore(/Lists/);
  await page.waitForSelector('h1:text("Lists")', { timeout: 5000 });
  const listsText = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  // Three reasons for an empty list screen, and they are not the same reason: nothing
  // made yet, the question could never be asked, or nobody is signed in to ask it.
  // §6.33 separated the first two; §6.56 found the third being told as the first —
  // "No lists yet" over a Create box whose button silently did nothing.
  check(
    'the lists screen says which kind of empty it is',
    configured
      ? /No lists yet|Could not|Sign in on the Data tab to make lists/i.test(listsText)
      : /needs? an account/i.test(listsText),
    listsText.slice(0, 130),
  );
  // Four when there is a session and a create box; the signed-out screen is a sentence
  // and the navigation, which is what it should be rather than a form that cannot work.
  await audit('Lists', /Sign in on the Data tab/.test(listsText) ? 6 : 7);
  await noGhosts('Lists');
  await scaled('Lists');
  await page.screenshot({ path: OUT + '08c-lists.png' });

  await viaMore(/Your data/);
  await page.waitForSelector('text=Choose files', { timeout: 5000 });
  await audit('Your data', 12);
  await noGhosts('Your data');
  await scaled('Your data');

  // --- Ratings and poster override -------------------------------------------
  await page.getByRole('link', { name: /Up Next/ }).click();
  await page.locator('li').filter({ hasText: 'The Long Dark' }).first().locator('a').first().click();
  await page.waitForSelector('text=Season 1', { timeout: 8000 });

  await page.getByRole('button', { name: '4 stars' }).first().click();
  await page.waitForTimeout(400);
  const rated = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  check('title can be rated in half stars', /4\.0/.test(rated), rated.slice(0, 80));

  // Tapping the same star again clears it — the escape from a mis-tap.
  await page.getByRole('button', { name: '4 stars' }).first().click();
  await page.waitForTimeout(400);
  const cleared = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  check('tapping the same star clears the rating', !/4\.0/.test(cleared));

  // --- Where to watch ----------------------------------------------------------
  await page.waitForSelector('text=Where to watch', { timeout: 5000 });
  const wtw = await page.locator('section', { hasText: 'Where to watch' }).first().innerText();
  check('where-to-watch lists a service', /Example Streaming/.test(wtw), wtw.replace(/\s+/g, ' ').slice(0, 120));
  // TMDB requires this wherever availability data appears; it is a licence condition.
  check('JustWatch attribution appears with the data', /JustWatch/.test(wtw));

  // Availability is per country, so answering for one silently would be confidently
  // wrong for most of the world.
  await page.getByRole('button', { name: /^Change country/ }).click();
  await page.getByRole('radio', { name: 'Show availability in United Kingdom' }).click();
  await page.waitForTimeout(400);
  const afterRegion = await page.locator('section', { hasText: 'Where to watch' }).first().innerText();
  check('the country can be changed', /United Kingdom/.test(afterRegion), afterRegion.replace(/\s+/g, ' ').slice(0, 90));

  check(
    'poster override is offered',
    (await page.getByText('Use a different poster').count()) > 0,
  );
  // Lists need an account, so "Add to list" correctly hides itself in this
  // credential-free build — same rule as the remote drawer. Its presence with sync
  // configured is covered by the lists unit tests.
  check(
    configured ? 'add-to-list is offered when signed in' : 'add-to-list is hidden without an account',
    ((await page.getByText('Add to list').count()) > 0) === configured,
  );
  // Content warnings are a community aggregate, so they need an account too. Their
  // ordering and verdict logic is covered by unit tests; what matters here is that a
  // credential-free build shows no dead control.
  check(
    configured
      ? 'content warnings are offered when signed in'
      : 'content warnings are hidden without an account',
    ((await page.getByRole('button', { name: 'Content warnings' }).count()) > 0) === configured,
  );
  // Eighteen episodes, each with React, Talk and Mark, plus the stars and the rest.
  await audit('the title page', 30);
  await noGhosts('the title page');
  await scaled('the title page');
  await page.screenshot({ path: OUT + '13-title.png' });

  // --- People ----------------------------------------------------------------
  // Directly from More now, rather than through the data screen's own People row.
  await viaMore(/People/);
  await page.waitForSelector('h1:text("People")', { timeout: 5000 });
  const peopleText = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  // Empty either way, and it must say which kind of empty rather than showing a search
  // box that can never return anything. The two reasons are different — the feature is
  // unavailable in this build, or it is available and you are signed out — and telling
  // someone the wrong one sends them looking for a setting that is not there.
  check(
    'people screen explains what it needs',
    configured ? /Sign in/i.test(peopleText) : /works without it/.test(peopleText),
    peopleText.slice(0, 140),
  );
  await audit('People', 6);
  await noGhosts('People');
  await scaled('People');
  await page.screenshot({ path: OUT + '14-people.png' });
  await page.goBack();

  // --- Remote drawer ---------------------------------------------------------
  // With no relay configured the drawer must not appear at all: an inert remote
  // is worse than none.
  check(
    'remote drawer is hidden when no bridge is configured',
    (await page.getByRole('button', { name: 'Open remote' }).count()) === 0,
  );

  // --- Importing an archive ----------------------------------------------------
  // Doc 8 §3: the GDPR zip is how most people got their data out of TV Time, and
  // every tracker in the field is judged on whether it can read one.
  await viaMore(/Your data/);
  await page.waitForSelector('text=Choose files', { timeout: 5000 });

  const zip = Buffer.from(
    zipSync({
      'export/episodes.csv': strToU8(
        'show,season,number,name,seen,seen_date,times_watched,air_date,show_id,episode_id\n' +
          'Rescued Show,1,1,Pilot,True,2026-01-05,2,2026-01-01,900,4001',
      ),
      'export/readme.txt': strToU8('not data'),
    }),
  );
  await page.locator('input[type=file]').last().setInputFiles({
    name: 'tvtime-export.zip',
    mimeType: 'application/zip',
    buffer: zip,
  });
  await page.waitForSelector('text=/Imported \\d+ watch/', { timeout: 10000 });

  const importText = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  // times_watched of 2 must survive: rewatch counts are the whole reason watches are
  // modelled as events.
  check('a GDPR-style zip imports', /Imported 2 watches/.test(importText), importText.slice(0, 160));
  check(
    'each file in the zip is accounted for',
    /episodes\.csv/.test(importText) && /readme\.txt/.test(importText),
  );
  // Silence is the failure mode every competitor has: "imported!" while dropping half.
  check('an unreadable file is named, not silently dropped', /Not recognised/.test(importText));
  await page.getByText(/Imported \d+ watch/).scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await page.screenshot({ path: OUT + '17-import.png' });

  // --- Recovering a DioCache.db in the browser ---------------------------------
  // This is the claim doc 8 §3.1 rests on, and the only place SQLite-in-WebAssembly
  // is exercised in a real browser: rows written after a checkpoint live only in the
  // -wal, so importing the pair must find them and the .db alone must not.
  const dio = buildDioCache();
  await page.locator('input[type=file]').last().setInputFiles([
    { name: 'DioCache.db', mimeType: 'application/octet-stream', buffer: dio.db },
    { name: 'DioCache.db-wal', mimeType: 'application/octet-stream', buffer: dio.wal },
  ]);
  await page.waitForSelector('text=/TV Time cache/', { timeout: 30000 });

  const dioText = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  check('a DioCache.db is read in the browser', /TV Time cache/.test(dioText), dioText.match(/DioCache\.db — [^\n]{0,60}/)?.[0]);
  check(
    'the write-ahead log is merged, not ignored',
    /Recovered \d+ page\(s\) from the write-ahead log/.test(dioText),
  );
  check('the -wal was paired automatically, not asked for twice', !/No DioCache.db-wal was supplied/.test(dioText));

  const recovered = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open('reviewies');
        req.onsuccess = () => {
          const all = req.result.transaction('watches', 'readonly').objectStore('watches').getAll();
          all.onsuccess = () =>
            resolve(all.result.map((w) => w.targetId).filter((id) => id.startsWith('local:movie:')));
        };
      }),
  );
  // The film written after the checkpoint is the one the .db alone would lose.
  check(
    'a film that exists only in the -wal is recovered',
    recovered.includes('local:movie:only-in-the-log'),
    JSON.stringify(recovered),
  );
  await page.getByText(/TV Time cache/).scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await page.screenshot({ path: OUT + '18-diocache.png' });
  rmSync(dio.dir, { recursive: true, force: true });

  // --- Export ----------------------------------------------------------------
  await viaMore(/Your data/);
  await page.waitForSelector('text=Export everything (JSON)', { timeout: 5000 });

  const download = await Promise.race([
    page.waitForEvent('download', { timeout: 5000 }),
    page.getByRole('button', { name: /Export everything/ }).click().then(() => null),
  ]).catch(() => null);
  const exported = await page.waitForEvent('download', { timeout: 5000 }).catch(() => download);
  check('export produces a file', Boolean(exported), exported?.suggestedFilename?.());
  await page.screenshot({ path: OUT + '07-data.png' });

  // --- The migration, end to end ------------------------------------------------
  // A fresh profile, because this is about somebody's first minute and the rest of
  // this suite has spent the last five hundred lines filling a library.
  //
  // What it caught: importing a history wrote the watches and nothing else. No library
  // rows, no names. So a successful rescue of everything somebody had left the app
  // saying "Nothing tracked yet" over a set of IDs with no titles attached, which looks
  // exactly like an import that silently failed.
  const arrival = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const fresh = await arrival.newPage();
  try {
    await fresh.goto(BASE, { waitUntil: 'networkidle' });
    await fresh.waitForSelector('text=Bring your history with you', { timeout: 10000 });

    const history = Buffer.from(
      zipSync({
        'export/episodes.csv': strToU8(
          'show,season,number,name,seen,seen_date,times_watched,air_date,show_id,episode_id\n' +
            'Rescued Show,1,1,Pilot,True,2026-01-05,2,2026-01-01,900,4001',
        ),
      }),
    );
    await fresh.locator('input[type=file]').last().setInputFiles({
      name: 'tvtime-export.zip',
      mimeType: 'application/zip',
      buffer: history,
    });

    // The confirmation has to survive the import changing what this screen renders.
    // Putting shows in the library is exactly what stops it being the empty state.
    await fresh.waitForSelector('text=Your history is in', { timeout: 15000 });
    const landed = (await fresh.locator('body').innerText()).replace(/\s+/g, ' ');
    check('the import confirms itself where it was started', /Imported 2 watches/.test(landed), landed.slice(0, 120));
    // An export carries no provider IDs, so what landed is a set of shows with no
    // artwork, no air dates and no episode lists beyond what was watched. Matching them
    // is offered here rather than mentioned, because here is where somebody is standing.
    //
    // Not pressed: it would make a live search against whatever the provider says about
    // a fixture name today. What it does is covered by the core's own tests.
    check(
      'and offers to finish the job rather than describing it',
      (await fresh.getByRole('button', { name: 'Match imported shows' }).count()) === 1,
      landed.slice(0, 120),
    );

    await fresh.getByRole('button', { name: 'Later' }).click();
    await fresh.waitForTimeout(600);
    const quiet = (await fresh.locator('body').innerText()).replace(/\s+/g, ' ');
    check(
      'Up Next explains its own silence rather than claiming you are caught up',
      /Bringing in \d+ shows? from your import/.test(quiet),
      quiet.slice(0, 130),
    );
    // Doc 10 §4: this used to say the shows "have no episode lists until they are
    // matched" above a button. An empty screen and a chore, at the moment somebody has
    // just handed over years of history. It does the work instead, and says so — which
    // is why what this checks is the absence of the button rather than its presence.
    check(
      'and gets on with it rather than handing over a task',
      (await fresh.getByRole('button', { name: 'Match imported shows' }).count()) === 0,
      quiet.slice(0, 130),
    );

    await fresh.goto(new URL('stats', BASE + '/').href, { waitUntil: 'networkidle' });
    await fresh.waitForTimeout(1200);
    const rescued = (await fresh.locator('body').innerText()).replace(/\s+/g, ' ');
    // The name is the proof the import wrote a title and not just an identifier.
    check('the rescued history is visible by name', /Rescued Show/.test(rescued), rescued.slice(0, 140));
    check('and counted', /Episodes 2/.test(rescued), rescued.slice(0, 140));

    // The title page for an imported show used to be a name over an empty season list:
    // the only record of an episode was a watch event keyed by an opaque ID, so there
    // was nothing to render. What was watched is now written as episodes — which is
    // also the only thing that will make matching them to a provider possible, since
    // that has to be done by season and number.
    await fresh.goto(new URL('title/local%3Atv%3Atvtime-900', BASE + '/').href, {
      waitUntil: 'networkidle',
    });
    await fresh.waitForTimeout(1500);
    const page18 = (await fresh.locator('body').innerText()).replace(/\s+/g, ' ');
    check('an imported show has its watched episodes on it', /Pilot/.test(page18), page18.slice(0, 150));
    check('under the name from the export', /Rescued Show/.test(page18));
    await fresh.screenshot({ path: OUT + '18-migration.png' });
  } finally {
    await arrival.close();
  }

  // --- 19. The second launch, on a database an older build wrote ----------------
  //
  // Every other check in this file starts from nothing, which is the one thing no real
  // install ever does. This one hand-builds the version 1 IndexedDB — the stores and
  // indexes as the first release declared them — puts somebody's tracked show in it, and
  // then loads the app, which opens it, upgrades it to the current version and has to
  // render what was there. §6.53.
  const returning = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const second = await returning.newPage();
  try {
    // Seeded before any script runs, so the app's own open() is the upgrade.
    await second.addInitScript(() => {
      indexedDB.deleteDatabase('reviewies');
      const request = indexedDB.open('reviewies', 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        const library = db.createObjectStore('library', { keyPath: 'titleId' });
        for (const index of ['kind', 'status', 'addedAt']) library.createIndex(index, index);
        const watches = db.createObjectStore('watches', { keyPath: 'id' });
        for (const index of ['targetId', 'seriesId', 'watchedAt']) watches.createIndex(index, index);
        const titles = db.createObjectStore('titles', { keyPath: 'id' });
        for (const index of ['kind', 'fetchedAt']) titles.createIndex(index, index);
        const episodes = db.createObjectStore('episodes', { keyPath: 'id' });
        episodes.createIndex('seriesId', 'seriesId');
        episodes.createIndex('fetchedAt', 'fetchedAt');
        episodes.createIndex('[seriesId+season]', ['seriesId', 'season']);
      };
      request.onsuccess = () => {
        const tx = request.result.transaction(['library', 'titles', 'episodes'], 'readwrite');
        tx.objectStore('titles').put({
          id: 'tmdb:1399',
          kind: 'show',
          name: 'Older Build Show',
          year: 2011,
          fetchedAt: Date.now(),
        });
        tx.objectStore('library').put({
          titleId: 'tmdb:1399',
          kind: 'show',
          status: 'watching',
          addedAt: Date.now(),
        });
        tx.objectStore('episodes').put({
          id: 'tmdb:ep:9001',
          seriesId: 'tmdb:1399',
          season: 1,
          number: 1,
          name: 'From Before',
          airDate: '2011-04-17',
          fetchedAt: Date.now(),
        });
        tx.oncomplete = () => request.result.close();
      };
    });

    await second.goto(BASE, { waitUntil: 'networkidle' });
    await second.waitForTimeout(2500);
    const upgraded = await second.locator('body').innerText();
    // Not the first-run screen: a returning person's library is not empty, and an
    // upgrade that lost it would land them back on "Bring your history with you".
    check(
      'a database from an older build still has its shows in it',
      /Older Build Show/.test(upgraded),
      upgraded.replace(/\s+/g, ' ').slice(0, 140),
    );
    check(
      'and is not mistaken for a first run',
      !/Bring your history with you/.test(upgraded),
      upgraded.replace(/\s+/g, ' ').slice(0, 140),
    );
    // The library query Up Next makes goes through the `status` index, which version 1
    // had; the check that matters is that the upgrade did not drop it.
    const version = await second.evaluate(
      () =>
        new Promise((resolve) => {
          const request = indexedDB.open('reviewies');
          request.onsuccess = () => {
            const db = request.result;
            const names = [...db.objectStoreNames];
            const result = { version: db.version, names };
            db.close();
            resolve(result);
          };
        }),
    );
    check(
      'upgraded to the current version, keeping every store',
      // Thirty, not three: Dexie multiplies its version by ten so it can slot schema
      // changes in between, and what IndexedDB reports is the native number.
      version.version === 30 &&
        ['outbox', 'syncState', 'animeIds'].every((n) => version.names.includes(n)),
      JSON.stringify(version),
    );
    await second.screenshot({ path: OUT + '19-upgraded.png' });
  } finally {
    await returning.close();
  }

  // --- 20. A library somebody has actually used --------------------------------
  //
  // Every other check in this file runs against a handful of rows, and the core's own
  // measurements (§6.54) are of the queries alone. This is the screens: a hundred and
  // fifty shows, four thousand episodes and three thousand watches seeded straight into
  // IndexedDB, then the app opened on top of it. What it is looking for is not a
  // millisecond count — a container says little about a phone — but the shape of a
  // mistake: a home screen that takes ten seconds, or a list that renders one row.
  const heavy = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const loaded = await heavy.newPage();
  try {
    await loaded.addInitScript(() => {
      indexedDB.deleteDatabase('reviewies');
      const request = indexedDB.open('reviewies', 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        const library = db.createObjectStore('library', { keyPath: 'titleId' });
        for (const index of ['kind', 'status', 'addedAt']) library.createIndex(index, index);
        const watches = db.createObjectStore('watches', { keyPath: 'id' });
        for (const index of ['targetId', 'seriesId', 'watchedAt']) watches.createIndex(index, index);
        const titles = db.createObjectStore('titles', { keyPath: 'id' });
        for (const index of ['kind', 'fetchedAt']) titles.createIndex(index, index);
        const episodes = db.createObjectStore('episodes', { keyPath: 'id' });
        episodes.createIndex('seriesId', 'seriesId');
        episodes.createIndex('fetchedAt', 'fetchedAt');
        episodes.createIndex('[seriesId+season]', ['seriesId', 'season']);
      };
      request.onsuccess = () => {
        const now = Date.now();
        const day = 86_400_000;
        const tx = request.result.transaction(
          ['library', 'titles', 'episodes', 'watches'],
          'readwrite',
        );
        for (let s = 0; s < 150; s++) {
          const seriesId = `tmdb:${2000 + s}`;
          tx.objectStore('titles').put({
            id: seriesId,
            kind: 'show',
            name: `Long Running Show ${s}`,
            year: 2006 + (s % 18),
            runtimeMin: 42,
            fetchedAt: now,
          });
          tx.objectStore('library').put({
            titleId: seriesId,
            kind: 'show',
            status: 'watching',
            addedAt: now - s * day,
          });
          for (let e = 1; e <= 28; e++) {
            const id = `tmdb:ep:${s}:${e}`;
            // Ten years of history ending now, with the last two episodes still to air —
            // so Up Next has something to offer, Calendar has something to list, and
            // this year's stats are not empty.
            // Skewed backwards by an hour per show, never forwards: an "aired" episode
            // dated a few hours from now is not aired, and Up Next correctly drops the
            // show — which is how the first version of this fixture ended up with one
            // row where it meant a hundred and fifty.
            const aired =
              e > 26 ? now + (e - 26) * 20 * day : now - (26 - e) * 140 * day - s * 3600_000;
            tx.objectStore('episodes').put({
              id,
              seriesId,
              season: 1 + Math.floor((e - 1) / 14),
              number: ((e - 1) % 14) + 1,
              name: `Episode ${e}`,
              airDate: new Date(aired).toISOString().slice(0, 10),
              runtimeMin: 42,
              fetchedAt: now,
            });
            // Watched up to the most recent aired episode but one, so this year has
            // something in it, Up Next has something to offer, and Calendar has the two
            // that have not aired.
            if (e <= 25) {
              tx.objectStore('watches').put({
                id: `w:${s}:${e}`,
                targetId: id,
                seriesId,
                watchedAt: aired + day,
                runtimeMin: 42,
              });
            }
          }
        }
        tx.oncomplete = () => request.result.close();
      };
    });

    const openedAt = Date.now();
    await loaded.goto(BASE, { waitUntil: 'domcontentloaded' });
    await loaded.waitForSelector('text=Long Running Show', { timeout: 30000 });
    const homeMs = Date.now() - openedAt;
    check(
      'the home screen comes up with a hundred and fifty shows in it',
      homeMs < 20000,
      `${homeMs}ms`,
    );

    // Counted after the list settles rather than at first paint: React yields part way
    // through a hundred and fifty rows, and the first version of this check counted
    // nineteen and called it a missing list. What is being measured is when the last row
    // is there, which is the number somebody scrolling actually waits for.
    let rows = 0;
    const settleBy = Date.now() + 20000;
    while (Date.now() < settleBy) {
      const now = await loaded.getByRole('button', { name: /^Mark / }).count();
      if (now >= 150) {
        rows = now;
        break;
      }
      rows = now;
      await loaded.waitForTimeout(250);
    }
    check(
      'and lists them all, not the first few',
      rows >= 150,
      `${rows} rows after ${Date.now() - openedAt}ms`,
    );
    await loaded.screenshot({ path: OUT + '20-heavy-upnext.png' });

    for (const [path, expected] of [
      ['stats', /Watched/i],
      ['calendar', /Upcoming|Tell me about/i],
      ['watchlist', /Watchlist/i],
      ['discover', /Discover/i],
    ]) {
      const startedAt = Date.now();
      await loaded.goto(`${BASE}/${path}`, { waitUntil: 'domcontentloaded' });
      await loaded.waitForSelector(`text=${expected.source.split('|')[0].replace(/[^\w ]/g, '')}`, {
        timeout: 30000,
      });
      // Let whatever the screen computes actually finish before stopping the clock.
      await loaded.waitForTimeout(500);
      const ms = Date.now() - startedAt;
      const body = await loaded.locator('body').innerText();
      check(`${path} renders against a real library`, expected.test(body) && ms < 20000, `${ms}ms`);
    }

    // Stats, on a library whose history runs back ten years.
    //
    // The first version of this check accepted "Loading…" as a pass, and pressing on it
    // is what found §6.54's real bug: the screen opens on this year, and somebody whose
    // watching was all in previous years is told "Nothing watched in this period yet"
    // with nine year-buttons sitting above it — an app that looks like it has lost the
    // history it is in fact holding. It now offers the way out, and this drives it.
    const statsAt = Date.now();
    await loaded.goto(`${BASE}/stats`, { waitUntil: 'domcontentloaded' });
    await loaded.getByText('Episodes', { exact: true }).waitFor({ timeout: 30000 });
    const statsMs = Date.now() - statsAt;
    const stats = (await loaded.locator('body').innerText()).replace(/\s+/g, ' ');
    check('stats counts this year of a ten-year history', /Episodes \d/.test(stats), stats.slice(0, 160));
    check('and does not sit on Loading', !/Loading…/.test(stats), `${statsMs}ms`);

    // An empty window with history behind it: nothing here was watched in the last
    // thirty days, and every year of the decade has something in it.
    await loaded.getByRole('radio', { name: '30 days' }).click();
    await loaded.waitForTimeout(800);
    const emptyYear = (await loaded.locator('body').innerText()).replace(/\s+/g, ' ');
    check(
      'an empty year says so and offers a way out of it',
      /Nothing watched in this period yet/.test(emptyYear) && /Show all time/.test(emptyYear),
      emptyYear.slice(0, 160),
    );
    await loaded.getByRole('button', { name: 'Show all time' }).click();
    await loaded.getByText('Episodes', { exact: true }).waitFor({ timeout: 15000 });
    const allTime = (await loaded.locator('body').innerText()).replace(/\s+/g, ' ');
    check(
      'and the way out lands on the whole history',
      /Episodes 3\d{3}/.test(allTime),
      allTime.slice(0, 160),
    );
    await loaded.screenshot({ path: OUT + '21-heavy-stats.png' });
  } finally {
    await heavy.close();
  }

  // --- 22. With the network off ------------------------------------------------
  //
  // The claim the whole product rests on is that everything lives on this device and
  // nothing is withheld without an account. Nothing had ever tested it: every check in
  // this file has had a working localhost, and the fixture provider always answers.
  //
  // What this looks for is not that the app survives — it is what the screens *say*. A
  // read that fails and renders as ordinary emptiness ("no lists yet", "nothing here")
  // is worse than an error, because it tells somebody their own data is gone. §6.56.
  const air = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const plane = await air.newPage();
  try {
    // Warm, so the service worker installs and precaches the shell.
    await plane.goto(BASE, { waitUntil: 'networkidle' });
    const registered = await plane.evaluate(async () => {
      const reg = await navigator.serviceWorker?.ready.catch(() => undefined);
      return !!reg?.active;
    });
    check('the service worker installs at all', registered);

    await plane.evaluate(async () => {
      const open = indexedDB.open('reviewies');
      await new Promise((resolve) => {
        open.onsuccess = resolve;
      });
      const db = open.result;
      const tx = db.transaction(['titles', 'library', 'episodes'], 'readwrite');
      const now = Date.now();
      tx.objectStore('titles').put({
        id: 'tmdb:77',
        kind: 'show',
        name: 'Offline Show',
        year: 2020,
        runtimeMin: 42,
        fetchedAt: now,
      });
      tx.objectStore('library').put({
        titleId: 'tmdb:77',
        kind: 'show',
        status: 'watching',
        addedAt: now,
      });
      for (const number of [1, 2]) {
        tx.objectStore('episodes').put({
          id: `tmdb:ep:77:${number}`,
          seriesId: 'tmdb:77',
          season: 1,
          number,
          name: `Episode ${number}`,
          airDate: '2020-01-0' + number,
          runtimeMin: 42,
          fetchedAt: now,
        });
      }
      await new Promise((resolve) => {
        tx.oncomplete = resolve;
      });
      db.close();
    });

    await air.setOffline(true);

    // A cold launch with no network at all: the shell has to come from the cache, or
    // an installed app is a browser error page the moment somebody is on a train.
    await plane.goto(BASE, { waitUntil: 'domcontentloaded' });
    await plane.waitForTimeout(2000);
    const offlineHome = (await plane.locator('body').innerText()).replace(/\s+/g, ' ');
    check(
      'a cold launch with no network still comes up',
      /Up Next/.test(offlineHome) && /Offline Show/.test(offlineHome),
      offlineHome.slice(0, 140),
    );

    for (const [path, expected] of [
      ['watchlist', /Nothing saved yet/],
      ['stats', /Stats/],
      ['calendar', /Upcoming/],
      ['more', /Everything lives on this device/],
      // The two that ask a server. Signed out they say so; the failure mode being
      // guarded against is either of them rendering as "you have nothing".
      ['lists', /Sign in on the Data tab to make lists|Lists need an account/],
      ['people', /Sign in on the Data tab to follow people|needs sync configured/],
    ]) {
      await plane.goto(`${BASE}/${path}`, { waitUntil: 'domcontentloaded' });
      await plane.waitForTimeout(1200);
      const body = (await plane.locator('body').innerText()).replace(/\s+/g, ' ');
      check(`/${path} says something true with no network`, expected.test(body), body.slice(0, 130));
    }

    // And it still records what you did.
    await plane.goto(BASE, { waitUntil: 'domcontentloaded' });
    await plane.waitForTimeout(1200);
    await plane.getByRole('button', { name: /^Mark Offline Show/ }).first().click();
    await plane.waitForTimeout(1200);
    const stored = await plane.evaluate(async () => {
      const open = indexedDB.open('reviewies');
      await new Promise((resolve) => {
        open.onsuccess = resolve;
      });
      const db = open.result;
      const count = (name) =>
        new Promise((resolve) => {
          const request = db.transaction(name).objectStore(name).count();
          request.onsuccess = () => resolve(request.result);
        });
      const result = { watches: await count('watches'), outbox: await count('outbox') };
      db.close();
      return result;
    });
    check(
      'a watch marked offline is written, and queued to go out',
      stored.watches === 1 && stored.outbox >= 1,
      JSON.stringify(stored),
    );

    // Back on the network: the queue is still one row, not two, and nothing was lost.
    await air.setOffline(false);
    await plane.goto(BASE, { waitUntil: 'networkidle' });
    await plane.waitForTimeout(2000);
    const after = await plane.evaluate(async () => {
      const open = indexedDB.open('reviewies');
      await new Promise((resolve) => {
        open.onsuccess = resolve;
      });
      const db = open.result;
      const request = db.transaction('watches').objectStore('watches').count();
      const watches = await new Promise((resolve) => {
        request.onsuccess = () => resolve(request.result);
      });
      db.close();
      return watches;
    });
    check('and coming back online does not duplicate it', after === 1, `${after} watches`);
    await plane.screenshot({ path: OUT + '22-offline.png' });
  } finally {
    await air.close();
  }
} catch (err) {
  check(
    'smoke run completed',
    false,
    `${err.message} — at ${page.url()} :: ${(await page.locator('body').innerText().catch(() => ''))
      .replace(/\s+/g, ' ')
      .slice(0, 200)}`,
  );
} finally {
  await browser.close();
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);

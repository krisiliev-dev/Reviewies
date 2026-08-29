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

/**
 * The number under a stats label, or 0 if there is not one.
 *
 * The clause reading this screen asked `/Watched\s*\d/`, which "Watched 0m" satisfies —
 * so a screen of zeros passed a check named for runtime weighting. The comment beside it
 * said exactly that and the clause stayed as it was for two sprints, until §6.105 found
 * the phone rendering that screen. Reading the figure is the difference between "a digit
 * is printed" and "there is something there". §6.73.
 */
const figure = (body, label) => {
  const m = new RegExp(`${label}\\s+([\\d.]+)`).exec(body);
  return m ? Number(m[1]) : 0;
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
    /** Accessible name → how many controls answer to it. */
    const byName = new Map();
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
      if (name) {
        named++;
        byName.set(name, (byName.get(name) ?? 0) + 1);
      } else nameless.push(el.outerHTML.slice(0, 90));

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
     * Two controls a screen reader cannot tell apart.
     *
     * A repeated name is fine when the controls are interchangeable — five "React" links
     * down a season all do the same thing to different rows, and are reached by reading
     * the row they sit in. What is not fine is a *pair*: two rings both called "Unmark
     * episode 5, Episode 5", one in each season, doing different things to different
     * episodes. So the signal is exactly two, and the check is named for that rather than
     * for the broader rule it is reaching for.
     */
    const collisions = [...byName.entries()]
      .filter(([, count]) => count === 2)
      .map(([name]) => name);
    return { named, nameless, small, collisions };
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
  check(
    /*
     * Found by a locator that matched two rings on the title page: season 1 and season 2
     * each have an "episode 5, Episode 5", so both answered to the same sentence. Doc 6
     * §5's rule is that every name in a list of rows carries what tells it from its
     * neighbours, and the episode number alone stops doing that at two seasons.
     *
     * Named for what it measures rather than the rule it is reaching for. "No two controls
     * share a name" is not the rule — five "React" links down a season share one and are
     * fine, because each is reached by reading the row it sits in. A *pair* is the shape a
     * collision takes, and a pair is what this says.
     */
    `${screen}: no name is shared by exactly two controls`,
    found.collisions.length === 0,
    found.collisions.join(' | '),
  );

  // Measured on every screen this suite already looks at, rather than on a list somebody
  // maintains. A screen added to the audit is a screen measured for contrast, which is
  // the coupling that stops the second check falling behind the first.
  await legible(screen);
}

/**
 * Every word on the screen, measured against what is actually behind it.
 *
 * Three sprints running, a colour defect shipped and nothing saw it. §6.90 turned the
 * page near-white by deleting a token that a stylesheet had been silently relying on.
 * §6.91 painted the active tab `action.label` — near-black on a near-black bar, the same
 * colour, not merely a low ratio. Both were found by reading the diff.
 *
 * Every existing colour guard measures the *token table*: it proves `ink.secondary` on
 * `ground.raised` is 8.14:1, which is true and was true throughout both defects. What
 * neither could say is which colour a given word ended up on. That is a property of the
 * rendered page and can only be read from it, so this reads it from there.
 *
 * Deliberately not clever about the failures it excuses. If it is visible, has text, and
 * fails, it is reported — a real false positive costs a minute, and the alternative is a
 * check with a list of exceptions that grows until it means nothing (§6.59).
 */
async function legible(screen) {
  const bad = await page.evaluate(() => {
    /*
     * `getComputedStyle` does not promise rgb(), and a canvas will not translate it.
     *
     * Tailwind v4 writes an opacity modifier as `oklab(0.74 0.007 0.015 / 0.7)` and
     * Chrome returns that verbatim. Reading three numbers out of it as red, green and
     * blue is how the first version of this check reported Watching Mode's placeholder
     * at 1.12:1 — a precise, confident, invented number. The second version passed the
     * string to a canvas `fillStyle`, which *rejects* it and silently keeps the previous
     * value: black, giving 1.08:1 against the near-black ground. Two different wrong
     * answers that both looked like a finding.
     *
     * So the conversion is done here, from the published Oklab matrices. The canvas is
     * still used for everything else — named colours, hex, hsl() — where it is correct.
     */
    const canvas = document.createElement('canvas').getContext('2d');
    const gamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
    const fromOklab = (L, a, bb, alpha) => {
      const l = (L + 0.3963377774 * a + 0.2158037573 * bb) ** 3;
      const m = (L - 0.1055613458 * a - 0.0638541728 * bb) ** 3;
      const s2 = (L - 0.0894841775 * a - 1.291485548 * bb) ** 3;
      const to255 = (v) => Math.max(0, Math.min(255, Math.round(gamma(v) * 255)));
      return {
        r: to255(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s2),
        g: to255(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s2),
        b: to255(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s2),
        a: alpha,
      };
    };
    const parse = (colour) => {
      const oklab = colour.match(/^oklab\(([^)]*)\)/);
      if (oklab) {
        const [L, a, bb, alpha = 1] = oklab[1].split(/[\s/]+/).filter(Boolean).map(Number);
        return fromOklab(L, a, bb, alpha);
      }
      const oklch = colour.match(/^oklch\(([^)]*)\)/);
      if (oklch) {
        const [L, C, H, alpha = 1] = oklch[1].split(/[\s/]+/).filter(Boolean).map(Number);
        const rad = (H * Math.PI) / 180;
        return fromOklab(L, C * Math.cos(rad), C * Math.sin(rad), alpha);
      }
      canvas.fillStyle = '#000';
      canvas.fillStyle = colour;
      const normalised = canvas.fillStyle;
      if (normalised.startsWith('#')) {
        const hex = normalised.slice(1);
        const wide = hex.length > 4;
        const at = (i) => parseInt(wide ? hex.slice(i * 2, i * 2 + 2) : hex[i].repeat(2), 16);
        return { r: at(0), g: at(1), b: at(2), a: 1 };
      }
      const [r, g, b, a = 1] = (normalised.match(/[\d.]+/g) ?? []).map(Number);
      return { r, g, b, a };
    };
    const luminance = ({ r, g, b }) => {
      const lin = [r, g, b].map((c) => {
        const v = c / 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
    };
    const ratio = (a, b) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    /** Composite over what is behind, because a translucent fill is not a colour. */
    const over = (top, bottom) => ({
      r: top.r * top.a + bottom.r * (1 - top.a),
      g: top.g * top.a + bottom.g * (1 - top.a),
      b: top.b * top.a + bottom.b * (1 - top.a),
      a: 1,
    });

    const page = parse(getComputedStyle(document.body).backgroundColor);
    const failures = [];
    for (const el of document.querySelectorAll('*')) {
      // Its OWN text, not its descendants'. A container inherits a colour it never uses.
      const own = [...el.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent.trim())
        .join(' ')
        .trim();
      if (!own) continue;

      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      if (Number(style.opacity) === 0) continue;
      const box = el.getBoundingClientRect();
      if (box.width < 1 || box.height < 1) continue;
      // Parked off-screen to keep an accessibility tree while invisible, which is an
      // idiom this app uses on purpose and is not a contrast question.
      if (box.right < 0 || box.bottom < 0) continue;
      if (el.closest('[aria-hidden="true"], [inert]')) continue;

      // What is behind it: the first ancestor that actually paints, composited down.
      let behind = page;
      for (let node = el; node; node = node.parentElement) {
        const fill = parse(getComputedStyle(node).backgroundColor);
        if (fill.a > 0) {
          behind = fill.a === 1 ? fill : over(fill, page);
          break;
        }
      }

      // Translucent text is genuinely lower contrast, so it composites too rather than
      // being measured at full strength.
      const inkRaw = parse(style.color);
      const ink = inkRaw.a === 1 ? inkRaw : over(inkRaw, behind);
      const size = parseFloat(style.fontSize);
      const bold = Number(style.fontWeight) >= 700;
      // WCAG 1.4.3: 18.66px bold or 24px is "large" and takes 3.0 instead of 4.5.
      const floor = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
      const measured = ratio(ink, behind);
      if (measured + 0.005 < floor) {
        failures.push(
          `${el.tagName.toLowerCase()} "${own.slice(0, 24)}" ${measured.toFixed(2)}:1 ` +
            `(needs ${floor}) ${style.color} on rgb(${Math.round(behind.r)}, ` +
            `${Math.round(behind.g)}, ${Math.round(behind.b)})`,
        );
      }
    }
    return failures;
  });
  check(`${screen}: every word is legible on what is behind it`, bad.length === 0, bad.join(' | '));
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
  // Injected, measured, and then *removed*. It used to be left in place, so every
  // screenshot taken between a call to this and the next navigation was a picture of the
  // app at twice the text size — including 05-watching-live.png, the one image of the
  // feature this product is built around. Nobody noticed for as long as nobody looked at
  // the screenshots, which was until §6.61.
  const doubled = await page.addStyleTag({ content: 'html { font-size: 32px !important; }' });
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

  await doubled.evaluate((el) => el.remove());
  await page.waitForTimeout(300);
}

/**
 * Did the browser arrive at a screen, or only at the tab bar?
 *
 * A level-1 heading is what says a screen rendered. Body text is not: the tab bar prints
 * "Up Next", "Search", "Discover", "Watchlist" and "More" at the bottom of every screen
 * in the app, so a check that reads `body.innerText` for one of those words is satisfied
 * wherever the browser happens to be — including on an address that is not a screen at
 * all. §6.74 found two checks doing exactly that and proved it by pointing them at
 * `/zzz-not-a-screen`, where both passed in under a second.
 *
 * The self-test below runs every time, because an instrument that has stopped
 * discriminating reports the same green as one that works.
 */
async function arrivedAt(target, heading, timeout = 30000) {
  try {
    await target.getByRole('heading', { name: heading, level: 1 }).waitFor({ timeout });
    return true;
  } catch {
    return false;
  }
}

try {
  // --- The instrument, before anything is measured with it ---------------------
  await page.goto(`${BASE}/zzz-not-a-screen`, { waitUntil: 'domcontentloaded' });
  check(
    'an address that is not a screen does not count as arriving at one',
    (await arrivedAt(page, /^Nothing at this address$/, 5000)) &&
      !(await arrivedAt(page, /^Watchlist$/, 2000)) &&
      !(await arrivedAt(page, /^Discover$/, 2000)),
  );

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

  /**
   * The stylesheet is generated. This is the only thing that proves it is *applied*.
   *
   * `tokens.generated.test.ts` regenerates the file and byte-compares, which proves what
   * was written. Every other check in this suite asserts text, roles and geometry, and
   * every one of them runs in dark. A stylesheet Tailwind silently declined to process —
   * a mis-ordered `@import`, a `@theme` block it did not pick up, a custom property that
   * resolves to nothing — would leave all of them green and the app unstyled.
   *
   * So: read the colour off the pixels and compare it to the token.
   */
  const resolved = await page.evaluate(() => {
    const seen = (el, prop) => (el ? getComputedStyle(el).getPropertyValue(prop).trim() : '');
    const root = getComputedStyle(document.documentElement);
    return {
      ground: root.getPropertyValue('--ground').trim(),
      body: seen(document.body, 'background-color'),
      heading: seen(document.querySelector('h1'), 'color'),
      // What the browser would *like*, which is the whole point of the check below.
      prefersLight: matchMedia('(prefers-color-scheme: light)').matches,
    };
  });

  /**
   * Did Tailwind actually process the generated `@theme` block?
   *
   * That is the failure this whole check exists for, and it needs its own probe: after
   * §6.86 the only place in the web app reading a new-token utility is the remote
   * drawer's handle, and that returns null unless a bridge is configured — so the first
   * version of this check read an empty string off an element that was never rendered
   * and reported it as a failure of the stylesheet.
   *
   * A probe element carrying the class is the honest way to ask. It tests the compiled
   * stylesheet rather than any screen, which is what is in doubt: if `@theme` were
   * skipped, `bg-stroke-signal` would generate nothing and this comes back transparent.
   */
  const utility = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.className = 'bg-stroke-signal';
    probe.style.position = 'fixed';
    probe.style.left = '-9999px';
    document.body.append(probe);
    const painted = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return painted;
  });

  check(
    'the generated custom properties reach the document',
    resolved.ground.toLowerCase() === '#131114',
    `--ground resolved to "${resolved.ground}"`,
  );
  check(
    'the body is painted in the ground token, not a browser default',
    // #131114. This expected rgb(11, 11, 15) — the LEGACY near-black — until §6.90, and
    // was right the whole time for the wrong reason: `index.css` said `--color-ink`, the
    // generated @theme defined that name twice, and the legacy definition came second and
    // won. Deleting the legacy table flipped the page to near-white and this went red in
    // the same run, which is the entire argument for reading colour off the pixels.
    resolved.body === 'rgb(19, 17, 20)',
    resolved.body,
  );
  /**
   * And the type scale, which is new and is the one layer whose failure looks like nothing.
   *
   * A colour that does not resolve paints black on black and something eventually notices.
   * A `--text-*` namespace Tailwind declined to process makes `text-s30` generate nothing —
   * and measured, by deleting the property and rebuilding, the title then renders at
   * **16px / 700**: Tailwind's own preflight has already flattened `h1` to inherit, so the
   * fallback is not the browser's big default but body text in bold. Every other check in
   * this suite would stay green through that. §6.87's argument one layer along: emitted is
   * not rendered.
   *
   * Read off a real heading rather than an injected probe. Tailwind v4 is JIT, so a class
   * with no call site does not exist; a heading is where the call sites are.
   */
  const type = await page.evaluate(() => {
    const h1 = document.querySelector('h1');
    if (!h1) return { size: 'no h1', weight: '' };
    const style = getComputedStyle(h1);
    return { size: style.fontSize, weight: style.fontWeight };
  });
  check(
    'a screen title is drawn at the token size and weight',
    // text.s30 and weight.bold — the tab-root large title, one step on both platforms
    // since §6.107. Compared exactly, not as "is it big": the measured failure is 16px at
    // the same weight, which reads as an unstyled page rather than as a missing token.
    type.size === '30px' && type.weight === '700',
    `${type.size} / ${type.weight}`,
  );

  check(
    'Tailwind generated a utility from the @theme block',
    // #8A8079 — stroke.signal, the stroke that means something.
    utility === 'rgb(138, 128, 121)',
    `bg-stroke-signal painted "${utility}"`,
  );

  /**
   * And the classes the screens actually write, now that they write them.
   *
   * §6.87 could only probe `bg-stroke-signal`, because Tailwind v4 is JIT and that was
   * the single new-token class with a call site anywhere in the source. §6.90 gave the
   * whole palette call sites, so the probe can stop being a proof about one class.
   *
   * Read off a rendered screen rather than an injected div: a probe proves the stylesheet
   * compiled, and this proves the app is drawn from it. `bg-ground-raised` is the plate
   * every card is, and `border-stroke-signal` is the rule that replaced the fills.
   */
  // On /more, because the first-run screen is deliberately bare and has no plate on it.
  // The first version probed the arrival screen and reported "no such element" for
  // `bg-ground-raised` — which is not the stylesheet failing, it is the check looking at
  // a screen that has nothing of the kind. A probe has to be pointed at something.
  await page.goto(`${BASE}/more`, { waitUntil: 'networkidle' });
  const painted = await page.evaluate(() => {
    const seen = (selector, prop) => {
      const el = document.querySelector(selector);
      return el ? getComputedStyle(el)[prop] : 'no such element';
    };
    return {
      plate: seen('.bg-ground-raised', 'backgroundColor'),
      rule: seen('.border-stroke-signal', 'borderTopColor'),
      secondary: seen('.text-ink-secondary', 'color'),
    };
  });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  check(
    'a card on screen is painted in the plate token',
    painted.plate === 'rgb(28, 25, 30)',
    `bg-ground-raised on a real element painted "${painted.plate}"`,
  );
  check(
    'and the rule that replaced the fills is drawn in stroke.signal',
    // The whole argument of §6.90: a quiet action outlined at 4.51:1 reads as available,
    // where the grey fill it replaced read as disabled.
    painted.rule === 'rgb(138, 128, 121)',
    `border-stroke-signal on a real element painted "${painted.rule}"`,
  );
  check(
    'and secondary text is the secondary ink, not the old 4.6 grey',
    painted.secondary === 'rgb(179, 169, 160)',
    `text-ink-secondary on a real element painted "${painted.secondary}"`,
  );

  /**
   * And the light block, which nothing in the product can reach.
   *
   * There is no theme switch: `data-theme` is set here and nowhere else in the app. That
   * is worth stating rather than implying — this proves the override *works*, not that
   * light mode is a feature somebody can use. The generator emits two themes because a
   * token that exists in one and not the other is how a screen ends up unstyled in
   * exactly one of them, and this is what stops the unused half rotting unnoticed.
   */
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  await page.waitForTimeout(120);
  const light = await page.evaluate(() => {
    const probe = document.createElement('div');
    // `bg-stroke-signal`, because Tailwind v4 is JIT: a token in `@theme` with no call
    // site anywhere in the source generates no utility at all. `bg-ground` is in the
    // theme block and painted transparent here, which is correct behaviour and was
    // briefly mistaken for a broken stylesheet. This class is the one the drawer uses,
    // so it exists.
    probe.className = 'bg-stroke-signal';
    document.body.append(probe);
    const painted = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return {
      ground: getComputedStyle(document.documentElement).getPropertyValue('--ground').trim(),
      probe: painted,
      heading: getComputedStyle(document.querySelector('h1')).color,
    };
  });
  await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));

  check(
    'the light override is live, not merely emitted',
    light.ground.toLowerCase() === '#f5f0e8',
    `--ground under data-theme=light resolved to "${light.ground}"`,
  );
  check(
    'and nothing switches theme without being asked',
    // The app is dark by decision, not by preference. The first version of the generator
    // honoured prefers-color-scheme, which flipped the new tokens and left the legacy
    // seven dark, because they have no light value. Half a theme on top of another, and
    // every other check stayed green.
    //
    // The preference is asserted, not assumed. Planting a wrong dark value showed this
    // check going red for the same reason the one above it did — which means it was
    // re-asserting the dark value rather than the claim in its name. It only says
    // anything if the browser wanted light and did not get it, so if headless ever
    // reports dark this goes red as untestable rather than passing on nothing.
    resolved.prefersLight && resolved.ground.toLowerCase() === '#131114',
    resolved.prefersLight
      ? `--ground with no data-theme resolved to "${resolved.ground}"`
      : 'this browser does not prefer light, so the check cannot see the defect it names',
  );
  check(
    'and a utility built on it repaints',
    // Through a probe, not through a screen, and the difference is the finding. Every
    // rendered element still reads a LEGACY token — `text-text`, `bg-ink` — and those
    // have no light value by design, so the heading is the same colour in both themes.
    // Asserting on the heading is what the first version of this check did, and it was
    // measuring the un-migrated half of the app rather than the stylesheet.
    // stroke.signal is #8A8079 in dark and #6E6456 in light.
    light.probe === 'rgb(110, 100, 86)',
    `bg-stroke-signal under light painted "${light.probe}"`,
  );
  check(
    'and the screens follow the theme, now that they read it',
    /*
     * This line used to assert the opposite, and its comment said so: "when this goes
     * red, some screen has started reading the new palette and this line should be
     * deleted with a cheer." §6.90 turned it red.
     *
     * The heading is `ink` — #F4EFE7 dark, #191419 light — so it must now DIFFER between
     * the themes. An app still on the legacy palette would report the same colour twice,
     * which is what this asserted for three sprints and no longer accepts.
     */
    light.heading !== resolved.heading,
    `h1 is ${resolved.heading} in dark and ${light.heading} in light`,
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

  /**
   * Which tab you are on, told twice.
   *
   * §6.90 traded a pink active tint for `ink` on `ink.secondary` and wrote that down as a
   * regression: a brightness step where there had been a hue, which is one channel doing
   * the app's most important piece of wayfinding. §6.91 adds the `border.tally` rule the
   * direction specified.
   *
   * Both halves are asserted, because either alone can be satisfied by an accident: a
   * rule on every tab marks nothing, and a rule on none is the regression still standing.
   */
  const tally = await page.evaluate(() => {
    const links = [...document.querySelectorAll('nav#tabs a')];
    const marks = links.map((a) => {
      const rule = a.querySelector('span[aria-hidden="true"]');
      const style = rule && getComputedStyle(rule);
      return {
        current: a.getAttribute('aria-current') === 'page',
        width: style ? parseFloat(style.borderTopWidth) : 0,
        colour: style ? style.borderTopColor : 'none',
      };
    });
    return {
      tabs: marks.length,
      ruled: marks.filter((m) => m.colour !== 'rgba(0, 0, 0, 0)').map((m) => m.colour),
      onCurrent: marks.find((m) => m.current) ?? null,
    };
  });
  check(
    'the tab you are on carries a rule, not only a brighter grey',
    // 3 is border.tally; #F4EFE7 is the ink.
    tally.onCurrent?.width === 3 && tally.onCurrent?.colour === 'rgb(244, 239, 231)',
    JSON.stringify(tally.onCurrent),
  );
  check(
    'and only that one carries it',
    tally.tabs >= 5 && tally.ruled.length === 1,
    `${tally.ruled.length} of ${tally.tabs} tabs ruled`,
  );

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
  //
  // Waited for rather than slept through. This was a flat 400ms and it passed seventy-six
  // times and failed once, on the calendar — whose entries query is the slowest thing on
  // any screen here, and which had not decided yet. A fixed wait turns "this screen is
  // slow" into "this screen is wrong", at random, and the honest instrument is one that
  // waits until the screen has stopped saying `Loading…` and then says how long it took.
  for (const [name, expected] of [
    [/Stats/, /Nothing watched in this period yet/i],
    [/Upcoming/, /Nothing airing in the next two months/i],
  ]) {
    const screen = String(name).slice(1, -1);
    await viaMore(name);
    // Arrived, before asking whether it has finished: `viaMore` clicks and returns, so
    // a `Loading…` that has not been rendered yet is a `Loading…` this would not wait for.
    await page.getByRole('heading', { name }).first().waitFor({ timeout: 5000 });
    const began = Date.now();
    const settled = await page
      .locator('text=/Loading…/')
      .first()
      .waitFor({ state: 'detached', timeout: 8000 })
      .then(() => true)
      .catch(() => false);
    const took = Date.now() - began;
    const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    if (screen === 'Stats') {
      // And says it *instead of* four zeros. The web has always done this; the phone
      // printed the zeros above the sentence until §6.105, so the clause belongs on both
      // suites rather than only on the one that was broken.
      check(
        'Stats says nothing rather than printing zeros',
        !/Watched\s*0\b/.test(body) && !/Episodes\s*0\b/.test(body),
        body.slice(Math.max(0, body.length - 160)),
      );
    }
    check(
      `${screen} says what empty means`,
      settled && expected.test(body),
      // The part being judged, not the top of the page: the calendar's settings section
      // is long enough to fill a 120-character slice on its own, so the one run that
      // failed showed me the notification copy and nothing about why.
      settled
        ? `after ${took}ms: …${body.slice(Math.max(0, body.length - 160))}`
        : `still loading after ${took}ms`,
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
  // A checkbox, not a button. The pill that used to be here announced `aria-pressed`,
  // which says "a toggle button" rather than "a thing that is or is not done"; an open
  // circle you fill is exactly what `aria-checked` is for. This locator failing is how
  // the migration announced itself.
  await page.getByRole('checkbox', { name: /Mark The Long Dark S1E1 watched/i }).click();

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
    /*
     * Reading first, then writing — §6.129's rule, walked rather than asserted.
     *
     * This clause used to be one line: a placeholder exists. It does not any more, and
     * that is the point. The composer was 880 points of empty form above the first
     * comment on a screen people come to in order to read, so it is behind a control now.
     * Both halves are checked, because "no composer" and "no composer you can get to" look
     * identical from the outside and only one of them is the design.
     */
    check(
      'does not open on a form',
      (await page.getByRole('textbox').count()) === 0,
    );
    await page.getByRole('button', { name: /^Say something$/ }).click();
    check(
      'and offers somewhere to write, one tap in',
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

  // --- §6.70 Every screen, three times -----------------------------------------------
  //
  // §6.69 found two bugs in Watching Mode that a single visit could not see, and §6.70
  // asked whether that was a coincidence. Every check in this suite visits each screen
  // once. This visits them all three times and looks for the same shape: a screen that
  // renders the first time and not the third, or timers that pile up per visit.
  //
  // Bounded — six screens, three visits, a few hundred milliseconds each. `pageerror`
  // is already wired to fail the run, so an exception thrown on a later visit is caught
  // without asking for it here.
  await page.getByRole('button', { name: 'Leave Watching Mode' }).click();
  await page.waitForSelector('h1:text("Up Next")', { timeout: 5000 });
  await page.evaluate(() => {
    const w = window;
    w.__revisits = new Set();
    const realSet = w.setInterval;
    const realClear = w.clearInterval;
    w.setInterval = (...args) => {
      const id = realSet.apply(w, args);
      w.__revisits.add(id);
      return id;
    };
    w.clearInterval = (id) => {
      w.__revisits.delete(id);
      return realClear.call(w, id);
    };
  });
  const timersHere = () => page.evaluate(() => window.__revisits.size);
  const beforeRevisits = await timersHere();

  /**
   * Where to go, and the heading that proves it arrived.
   *
   * Loose link patterns on purpose: the More screen names each link
   * "Stats — Runtime-weighted, and your year in review", so an anchored `/^Stats$/`
   * matches nothing. The *heading* is what says the screen rendered.
   */
  const SCREENS = [
    ['Search', /Search/, true],
    ['Discover', /Discover/, true],
    ['Watchlist', /Watchlist/, true],
    ['Stats', /Stats/, false],
    ['Upcoming', /Upcoming/, false],
    ['Lists', /Lists/, false],
    ['People', /People/, false],
  ];

  for (const [label, link, isTab] of SCREENS) {
    let arrived = 0;
    for (let visit = 1; visit <= 3; visit++) {
      if (isTab) await page.getByRole('link', { name: link }).first().click();
      else await viaMore(link);
      try {
        await page.getByRole('heading', { name: label, level: 1 }).waitFor({ timeout: 4000 });
        arrived++;
      } catch {
        /* counted below rather than throwing: the point is which visit failed. */
      }
      await page.getByRole('link', { name: /Up Next/ }).click();
      await page.waitForSelector('h1:text("Up Next")', { timeout: 5000 });
    }
    check(`${label} renders on all three visits`, arrived === 3, `${arrived}/3`);
  }

  check(
    'and twenty-one visits leave no timers behind',
    (await timersHere()) <= beforeRevisits,
    `${beforeRevisits} before, ${await timersHere()} after`,
  );

  await page.getByRole('link', { name: /^Watch along with / }).first().click();
  await page.waitForTimeout(700);

  /**
   * Reopening an episode you have already reacted to, before pressing anything.
   *
   * Two reactions were recorded on this episode further up, so this is the second visit
   * with a history behind it — which is the case §6.78 found broken by opening the
   * screen and looking at it. The component primes a set of "already flown" ids so that
   * your own past reactions are history rather than taps; the priming ran against the
   * empty array the live query was given as a default, before it had answered, so the
   * real history arrived a render later and read as a burst. Eight emoji drifting across
   * a screen whose clock had not been started.
   *
   * The stream is the band at the top; before the clock is running it holds nothing.
   */
  const drifting = () =>
    page.locator('[aria-label="Reactions from other viewers"] span').count();
  const driftingBeforeStart = await drifting();
  check(
    'reopening an episode does not replay your own reactions',
    driftingBeforeStart === 0,
    `${driftingBeforeStart} drifting before the clock was started`,
  );

  /**
   * And the instrument works, which the check above cannot say on its own.
   *
   * It asserts a count of zero through a selector, so a selector that matches nothing
   * passes it forever — §6.71's shape, a stuck queue looking exactly like an empty one.
   * That was not hypothetical here: this read `.will-change-transform` until §6.89
   * renamed a neighbouring class and the suite spent thirty seconds on a different
   * selector that no longer existed. A class is a design decision; an aria-label is a
   * promise to a screen reader, and only one of the two is meant to survive a redesign.
   *
   * So: start the clock, react, and require the same selector to find it. Zero here
   * means the check above has stopped being able to see anything.
   */
  // The clock is already running here — this is a *resumed* session, which is the whole
  // reason the check above is interesting — so Start is only pressed if it is offered.
  const start = page.getByRole('button', { name: 'Start watching' });
  if (await start.count()) await start.click();
  await page.getByRole('button', { name: 'React with cliffhanger' }).click();
  await page.waitForTimeout(600);
  const driftingAfterReacting = await drifting();
  check(
    'and the check above can see a reaction when there is one',
    driftingAfterReacting > 0,
    `${driftingAfterReacting} drifting after one tap`,
  );

  // --- §6.69 What a long session leaves behind ---------------------------------------
  //
  // Nothing in this repository had ever run for longer than a few seconds, or done
  // anything more than once. Watching Mode is a screen somebody leaves open for
  // forty-five minutes and steps away from repeatedly — a phone call, the kettle, who
  // that actor is. §6.69.
  //
  // Bounded on purpose: three round trips, not forty-five minutes. What breaks over an
  // episode breaks per visit, and a check that needs an hour is one nobody runs.
  //
  // The timer census is taken from Up Next both times, so the count is "what is left
  // behind" rather than "what the screen I am standing on is using". Wrapping while
  // inside Watching Mode measured a baseline of zero against two live intervals that
  // were simply the current screen's, which is a check that reports its own setup.
  await page.getByRole('button', { name: 'Leave Watching Mode' }).click();
  await page.waitForSelector('h1:text("Up Next")', { timeout: 5000 });
  await page.evaluate(() => {
    const w = window;
    w.__timers = new Set();
    const realSet = w.setInterval;
    const realClear = w.clearInterval;
    w.setInterval = (...args) => {
      const id = realSet.apply(w, args);
      w.__timers.add(id);
      return id;
    };
    w.clearInterval = (id) => {
      w.__timers.delete(id);
      return realClear.call(w, id);
    };
  });
  const liveTimers = () => page.evaluate(() => window.__timers.size);
  const timersOnUpNext = await liveTimers();

  const timecode = () => page.locator('text=/^\\d+:\\d\\d$/').first().innerText();
  /** `seconds` is taken further down, by the single-round-trip check this one precedes. */
  const asSeconds = (t) => Number(t.split(':')[0]) * 60 + Number(t.split(':')[1]);

  for (let visit = 0; visit < 3; visit++) {
    await page.getByRole('link', { name: /^Watch along with / }).first().click();
    await page.waitForTimeout(700);
    await page.getByRole('button', { name: 'Leave Watching Mode' }).click();
    await page.waitForSelector('h1:text("Up Next")', { timeout: 5000 });
  }
  check(
    'leaving Watching Mode stops its timers',
    (await liveTimers()) <= timersOnUpNext,
    `${timersOnUpNext} live on Up Next, ${await liveTimers()} after three visits`,
  );

  // The finding this block was written for, and it took the third visit to show.
  //
  // Restoring a running clock called `seek`, which moves the position and says nothing
  // about running — and a freshly-mounted clock is stopped. The *first* return still
  // read further on, because `resumeFor` had already advanced it once, so the single
  // round trip below has always passed. The effect that persists the clock then wrote
  // `running: false`, and from that moment the timecode never moved again: a plausible
  // number, frozen, with every reaction landing on it.
  await page.getByRole('link', { name: /^Watch along with / }).first().click();
  await page.waitForTimeout(700);
  const afterVisits = await timecode();
  await page.waitForTimeout(2500);
  const stillRunning = await timecode();
  check(
    'the clock still runs after stepping away more than once',
    asSeconds(stillRunning) > asSeconds(afterVisits),
    `${afterVisits} → ${stillRunning} across three round trips`,
  );

  // And the band: an emoji is visible for four seconds, so what is mounted has to be
  // what is on screen. Retirement used to drop one element every 2.4s whatever had
  // finished, so a slot stayed taken for up to fifty seconds after its emoji had gone —
  // a compositor layer per emoji on a phone, and an arrival refused for every one of
  // those seconds.
  const band = await page.evaluate(() => {
    const stream = document.querySelector('[aria-label="Reactions from other viewers"]');
    const spans = stream ? [...stream.querySelectorAll('span[aria-hidden="true"]')] : [];
    return {
      mounted: spans.length,
      offScreen: spans.filter((s) => s.getBoundingClientRect().right <= 0).length,
    };
  });
  check(
    'nothing is left mounted after it has crossed the screen',
    band.offScreen === 0,
    `${band.mounted} mounted, ${band.offScreen} already gone past`,
  );

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
  // This asked for a *Resume* button and got one, because the restored clock was
  // wrongly stopped — the check was passing on the strength of the bug §6.69 found. A
  // clock that was running comes back running, so the transport offers Pause; what the
  // check was always trying to say is that this is not a fresh start.
  check(
    'and does not offer to start something already under way',
    (await page.getByRole('button', { name: 'Start watching' }).count()) === 0,
  );
  check(
    'and comes back running rather than stopped',
    (await page.getByRole('button', { name: 'Pause the clock' }).count()) > 0,
  );

  // --- Extension auto-sync ---------------------------------------------------
  // Simulate what the extension's content script posts into the page and confirm
  // the clock follows it instead of needing a manual start.
  await page.getByRole('button', { name: 'Leave Watching Mode' }).click();
  await page.getByRole('link', { name: /Up Next/ }).click();
  await page.getByRole('link', { name: /^Watch along with / }).first().click();
  // Already running, not "Start watching": the clock persists since doc 10 §2 and comes
  // back running since §6.69. The extension's reading has to supersede a restored
  // position as much as an absent one — that is the point of what follows.
  await page
    .getByRole('button', { name: /Pause the clock|Resume the clock|Start watching/ })
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
  // `COPY.watchlist.notePlaceholder`, spelled out because this file cannot import it.
  // The web's search row asked its own third question — "Why? e.g. Ana recommended" —
  // which nothing owned; §6.106 moved it onto the owner and this locator with it.
  await page.getByPlaceholder(/Why did you save/).fill('Ana recommended');
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
  // By role, not by class. This read `div.rounded-t-3xl` until §6.89 renamed the corner
  // token and the suite spent thirty seconds waiting for a class that no longer existed —
  // a selector naming a design decision, which breaks the moment the decision changes.
  // The sheet is a dialog and says so; that is the stable name.
  const sheet = await page.getByRole('dialog', { name: /Catch up on/ }).innerText();
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
  /*
   * Closed on arrival, and saying what it is set to.
   *
   * §6.134 gave the notification panel a collapsed state: it used to stand open above the
   * calendar and take the top 470 points of a screen called Upcoming. The collapsed row
   * names the current choice, which is most of what the open panel told you — so the first
   * check is that the setting is legible *without* opening anything.
   */
  const collapsed = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  check('upcoming says what it will tell you about, without opening anything',
    /Tell me about Premieres & finales/.test(collapsed), collapsed.slice(0, 120));
  check('and the options are not standing open',
    !/The moments worth knowing about/.test(collapsed), collapsed.slice(0, 120));
  await audit('Upcoming', 8);

  await page.getByRole('button', { name: /^Tell me about — / }).click();
  await page.waitForSelector('text=The moments worth knowing about', { timeout: 5000 });
  const upcomingText = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  check('upcoming offers notification granularity', /Premieres & finales/.test(upcomingText));
  check('milestones is the default', /The moments worth knowing about/.test(upcomingText));
  await audit('Upcoming, tuning', 9);
  await noGhosts('Upcoming');
  await scaled('Upcoming');
  await page.screenshot({ path: OUT + '10-upcoming.png' });

  // --- Discover --------------------------------------------------------------
  await page.getByRole('link', { name: /Discover/ }).click();
  await page.waitForSelector('text=Nothing you have already watched', { timeout: 5000 });
  await page.waitForTimeout(800);
  // Check the suggested titles specifically, not the whole page: a tracked show
  // legitimately appears in the "Because you watched…" attribution.
  //
  // By the row's accessible name rather than by `li p.font-medium`, which is what this
  // was. `Row` renders its title in a `<span>`, so after the migration the locator
  // matched nothing — and an empty list does not contain "The Long Dark", so the
  // *exclusion* check went green on zero rows while the suggestion check went red. A
  // locator built out of styling classes breaks whenever the styling moves, and this one
  // broke into a pass. The name is what the row promises a reader; it is also stable.
  const suggestedTitles = (await page.getByRole('link', { name: /^Open / }).all()).length
    ? await Promise.all(
        (await page.getByRole('link', { name: /^Open / }).all()).map(async (row) =>
          ((await row.getAttribute('aria-label')) ?? '').replace(/^Open /, ''),
        ),
      )
    : [];
  // Stated before the exclusion, and the exclusion depends on it: "none of these is a
  // show you track" is not a claim you can make about no rows at all (§6.56).
  check('discover suggests something', suggestedTitles.length > 0, `${suggestedTitles.length} suggested`);
  check(
    'discover excludes what you already track',
    suggestedTitles.length > 0 && !suggestedTitles.includes('The Long Dark'),
    suggestedTitles.join(', '),
  );
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
  /**
   * The numbers, not the words above them.
   *
   * This checked for "Watched" and "Episodes", which are the labels printed on the tiles
   * whatever the tiles contain — so a screen showing every total as zero, or as NaN,
   * passed. §6.78 found the same screen naming a day three different ways with nothing
   * to say so; the labels were all correct throughout.
   */
  check(
    'stats show runtime-weighted totals',
    // The comment above said a screen of zeros passed this, and it was right, and the
    // clause was left as it was for two sprints. §6.105 found the phone printing exactly
    // that screen. Read the figure rather than asking whether a digit is present.
    figure(statsText, 'Watched') > 0 && figure(statsText, 'Episodes') > 0,
    statsText.slice(0, 120),
  );
  check('stats list the most-watched title', /The Long Dark/.test(statsText));
  /**
   * And the one sentence on this screen that names a day.
   *
   * It said `4/30/2026` on the web and `2026-04-30` on the phone — and, west of
   * Greenwich, the wrong day entirely, because `new Date('2026-04-30')` is UTC midnight
   * rendered locally. Both go through `formatDay` now, so the shape to insist on is the
   * app's own: "Today", or a weekday, or "Thu, Apr 30". Never a slash, never an ISO key.
   */
  const busiest = statsText.match(/Busiest day was (.+?) with \d+ episodes?\./)?.[1];
  check(
    'the busiest day is written the way this app writes days',
    Boolean(busiest) && !/\//.test(busiest) && !/^\d{4}-\d{2}-\d{2}$/.test(busiest),
    busiest ?? statsText.slice(0, 160),
  );
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
      ? /No lists yet|Could not|Sign in .* to make lists/i.test(listsText)
      : /needs? an account/i.test(listsText),
    listsText.slice(0, 130),
  );
  // Four when there is a session and a create box; the signed-out screen is a sentence
  // and the navigation, which is what it should be rather than a form that cannot work.
  // Signed out, the create box is not there, so there is one fewer control to name.
  await audit('Lists', /Sign in .* to make lists/.test(listsText) ? 6 : 7);
  await noGhosts('Lists');
  await scaled('Lists');
  await page.screenshot({ path: OUT + '08c-lists.png' });

  await viaMore(/Your data/);
  await page.waitForSelector('text=Choose files', { timeout: 5000 });
  // 11, down from 12: §6.133 deleted this screen's People row, which was a second copy of
  // a destination already on More — and the `offers.test.ts` exemption that excused it
  // gave a reason ("the web has no More tab") that had not been true since §6.79.
  await audit('Your data', 11);
  await noGhosts('Your data');
  await scaled('Your data');

  // --- Ratings and poster override -------------------------------------------
  await page.getByRole('link', { name: /Up Next/ }).click();
  await page.locator('li').filter({ hasText: 'The Long Dark' }).first().locator('a').first().click();
  await page.waitForSelector('text=Season 1', { timeout: 8000 });

  await page.getByRole('button', { name: /^Rate .* 4 stars$/ }).first().click();
  await page.waitForTimeout(400);
  const rated = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  check('title can be rated in half stars', /4\.0/.test(rated), rated.slice(0, 80));

  // Tapping the same star again clears it — the escape from a mis-tap.
  await page.getByRole('button', { name: /^Rate .* 4 stars$/ }).first().click();
  await page.waitForTimeout(400);
  const cleared = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  check('tapping the same star clears the rating', !/4\.0/.test(cleared));

  // --- Where to watch ----------------------------------------------------------
  await page.waitForSelector('text=Where to watch', { timeout: 5000 });
  const wtw = await page.locator('section', { hasText: 'Where to watch' }).first().innerText();
  check('where-to-watch lists a service', /Example Streaming/.test(wtw), wtw.replace(/\s+/g, ' ').slice(0, 120));
  /*
   * The credit is owed by a build that used the API, and this one did not — no token, so
   * the fixture provider invented "Example Streaming". Crediting JustWatch for that is a
   * false statement rather than a licence being met, which is the position Settings and
   * More already took and Discover and this block did not. §6.149.
   *
   * So the clause is the other way round now: on a fixtures build the credit must be
   * **absent**. The branch that draws it is asserted in `app/src/ui/attribution.test.ts`,
   * which can pass the flag both ways; a suite that only ever runs one provider cannot.
   */
  check('no JustWatch credit for data JustWatch did not supply', !/JustWatch/.test(wtw), wtw.replace(/\s+/g, ' ').slice(0, 120));

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
  /*
   * The cross-off, and the way back beside it.
   *
   * Asserted here rather than on Up Next because Up Next navigates to the conversation
   * after a mark when there is an account behind it — so a check placed there ran in
   * exactly one of the two builds and was silently absent in the other. This screen marks
   * in place either way.
   *
   * The first version of this component swapped the ring for the undo chip in the same
   * slot, which costs the two things the mark is for: the filled ring is the confirmation
   * just earned, and unmounting the button somebody activated drops focus to the body — a
   * keyboard user returned to the top of the page as a reward for marking an episode.
   */
  // The first *unmarked* ring, found by its name rather than by episode number: S1E1 was
  // marked earlier in this run, so asking for episode 1 asked for a control that no longer
  // exists under that name and waited thirty seconds for it.
  const unmarked = page.getByRole('checkbox', { name: /^Mark season \d+ episode / }).first();
  // The whole name, episode title included. Matching on `episode 5` alone matched two
  // rings, because season 2 has an episode 5 as well — a locator that is unique on the
  // fixture it was written against and not on the screen it runs on.
  const markName = (await unmarked.getAttribute('aria-label')) ?? '';
  const unmarkName = markName.replace(/^Mark /, 'Unmark ').replace(/ watched$/, '');
  await unmarked.click();

  // `Mark episode 5, Whiteout watched` → `Undo marking episode 5, Whiteout watched`.
  const undo = page
    .getByRole('button', { name: `Undo marking ${markName.replace(/^Mark /, '')}` })
    .first();
  await undo.waitFor({ timeout: 5000 });
  // Waited for, not sampled. The undo chip appears in the click's own render and the
  // ring's filled state arrives when the live query re-runs a moment later, so counting
  // immediately after the chip caught the ring mid-flight and called it missing.
  const struck = page.getByRole('checkbox', { name: unmarkName, exact: true });
  await struck.first().waitFor({ timeout: 5000 });
  check(
    'the way back appears beside the ring, not instead of it',
    (await struck.count()) === 1,
    `${markName}: ${await undo.count()} undo, ${await struck.count()} rings`,
  );
  check(
    'and the ring it sits beside is filled',
    (await struck.first().getAttribute('aria-checked')) === 'true',
  );
  check(
    'and focus is still on the ring itself, not on whatever replaced it',
    // The role as well as the name. React reuses a DOM element when the type and position
    // match, so a component that swapped the ring's `<button>` for the undo's could keep
    // focus on the same node while turning it into a different control — which reads as
    // "focus survived" and is not. Only a checkbox is the ring.
    await page.evaluate(() => {
      const el = document.activeElement;
      return (
        el?.getAttribute('role') === 'checkbox' &&
        /^Unmark season \d+ episode /.test(el.getAttribute('aria-label') ?? '')
      );
    }),
    await page.evaluate(
      () =>
        `${document.activeElement?.getAttribute('role') ?? '<none>'} / ${
          document.activeElement?.getAttribute('aria-label') ?? '<body>'
        }`,
    ),
  );
  // Put back, so the screens after this see the library they expect.
  await struck.first().click();
  await page.waitForTimeout(300);

  // Eighteen episodes, each with React, Talk and a ring, plus the stars and the rest.
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
      // Forty, not four: Dexie multiplies its version by ten so it can slot schema
      // changes in between, and what IndexedDB reports is the native number. It was
      // thirty until §6.71 added `rejected` — the check noticing that is the check
      // working, and the number is written out rather than derived so that a schema
      // change has to be a deliberate edit here too.
      version.version === 40 &&
        ['outbox', 'syncState', 'animeIds', 'rejected'].every((n) => version.names.includes(n)),
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
      const now = await loaded.getByRole('checkbox', { name: /^Mark / }).count();
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

    /**
     * The heading, not the tab bar.
     *
     * This read `body.innerText` for a word — and two of the four words it looked for,
     * *Watchlist* and *Discover*, are printed in the tab bar at the bottom of every
     * screen in the app. So both checks passed wherever the browser happened to be, and
     * the `waitForSelector` in front of them returned instantly from that same tab bar,
     * which made the elapsed-time half meaningless too.
     *
     * §6.74 proved it by pointing all four at an address that is not a screen: `stats`
     * and `calendar` failed, as they should have, and these two passed in under a
     * second against the not-found screen.
     *
     * A level-1 heading is what says a screen rendered — the not-found screen's is
     * "Nothing at this address" — which is what the navigation block above this one was
     * already doing correctly.
     */
    for (const [path, heading] of [
      ['stats', /^Stats$/],
      ['calendar', /^Upcoming$/],
      ['watchlist', /^Watchlist$/],
      ['discover', /^Discover$/],
    ]) {
      const startedAt = Date.now();
      await loaded.goto(`${BASE}/${path}`, { waitUntil: 'domcontentloaded' });
      const arrived = await arrivedAt(loaded, heading);
      // Let whatever the screen computes actually finish before stopping the clock.
      await loaded.waitForTimeout(500);
      const ms = Date.now() - startedAt;
      check(`${path} renders against a real library`, arrived && ms < 20000, `${ms}ms`);
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
      // The sentence, not the noun in it: which destination it names is checked exactly
      // by `navigationLabels` in the wiring suite, and pinning the whole phrase here is
      // what turned a copy fix into four smoke failures. §6.78.
      ['lists', /Sign in .* to make lists|Lists need an account/],
      ['people', /Sign in .* to follow people|needs sync configured/],
    ]) {
      await plane.goto(`${BASE}/${path}`, { waitUntil: 'domcontentloaded' });
      await plane.waitForTimeout(1200);
      const body = (await plane.locator('body').innerText()).replace(/\s+/g, ' ');
      check(`/${path} says something true with no network`, expected.test(body), body.slice(0, 130));
    }

    // And it still records what you did.
    await plane.goto(BASE, { waitUntil: 'domcontentloaded' });
    await plane.waitForTimeout(1200);
    await plane.getByRole('checkbox', { name: /^Mark Offline Show/ }).first().click();
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

  // --- 23. Open twice ------------------------------------------------------------
  //
  // Every other check in this file drives one page. The web app is a thing people leave
  // open — a tab from this morning and another opened tonight — and those two share one
  // IndexedDB, one service worker and one outbox. Nothing had ever asked what the second
  // does to the first. §6.64.
  const shared = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const first = await shared.newPage();
  const other = await shared.newPage();
  try {
    await first.goto(BASE, { waitUntil: 'networkidle' });
    await first.evaluate(async () => {
      const open = indexedDB.open('reviewies');
      await new Promise((resolve) => {
        open.onsuccess = resolve;
      });
      const db = open.result;
      const tx = db.transaction(['titles', 'library', 'episodes'], 'readwrite');
      const now = Date.now();
      tx.objectStore('titles').put({
        id: 'tmdb:55',
        kind: 'show',
        name: 'Two Tabs Show',
        year: 2020,
        runtimeMin: 42,
        fetchedAt: now,
      });
      tx.objectStore('library').put({
        titleId: 'tmdb:55',
        kind: 'show',
        status: 'watching',
        addedAt: now,
      });
      for (const number of [1, 2, 3]) {
        tx.objectStore('episodes').put({
          id: `tmdb:ep:55:${number}`,
          seriesId: 'tmdb:55',
          season: 1,
          number,
          name: `Episode ${number}`,
          airDate: `2020-01-0${number}`,
          runtimeMin: 42,
          fetchedAt: now,
        });
      }
      await new Promise((resolve) => {
        tx.oncomplete = resolve;
      });
      db.close();
    });
    await first.reload({ waitUntil: 'networkidle' });
    await first.waitForTimeout(1200);

    await other.goto(BASE, { waitUntil: 'networkidle' });
    await other.waitForTimeout(1200);
    const both = (await other.locator('body').innerText()).replace(/\s+/g, ' ');
    check('a second tab opens on the same library', /Two Tabs Show/.test(both), both.slice(0, 110));

    // The one that matters: a mark in one tab has to reach the other without a reload.
    // Somebody with the app open on two screens marking an episode on one and seeing the
    // other still offering it is being invited to mark it twice.
    await first.getByRole('checkbox', { name: /^Mark Two Tabs Show S1E1/ }).first().click();
    await other.waitForSelector('text=S1E2', { timeout: 15000 }).catch(() => {});
    const moved = (await other.locator('body').innerText()).replace(/\s+/g, ' ');
    check(
      'a watch in one tab moves the other on, with no reload',
      /S1E2/.test(moved) && !/S1E1/.test(moved),
      moved.slice(0, 130),
    );

    const rows = async (page) =>
      page.evaluate(async () => {
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
    const afterOne = await rows(first);
    check(
      'one mark in one tab is one watch and one queued row',
      afterOne.watches === 1 && afterOne.outbox === 1,
      JSON.stringify(afterOne),
    );

    // And the race: both tabs pressing Mark at the same moment. What must not happen is
    // the same episode being recorded twice — a rewatch somebody did not do.
    await first.goto(BASE, { waitUntil: 'networkidle' });
    await first.waitForTimeout(1200);
    await other.goto(BASE, { waitUntil: 'networkidle' });
    await other.waitForTimeout(1200);
    await Promise.all([
      first.getByRole('checkbox', { name: /^Mark Two Tabs Show/ }).first().click(),
      other.getByRole('checkbox', { name: /^Mark Two Tabs Show/ }).first().click(),
    ]);
    await first.waitForTimeout(2000);

    const watched = await first.evaluate(async () => {
      const open = indexedDB.open('reviewies');
      await new Promise((resolve) => {
        open.onsuccess = resolve;
      });
      const db = open.result;
      const request = db.transaction('watches').objectStore('watches').getAll();
      const all = await new Promise((resolve) => {
        request.onsuccess = () => resolve(request.result);
      });
      db.close();
      return all.map((w) => w.targetId);
    });
    check(
      'two tabs racing do not record the same episode twice',
      new Set(watched).size === watched.length,
      watched.join(', '),
    );
    await other.screenshot({ path: OUT + '23-second-tab.png' });
  } finally {
    await shared.close();
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

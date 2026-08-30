/**
 * What a control actually measures, on both platforms, at whatever text size you ask for.
 *
 * ## Why this exists
 *
 * Five throwaway probes in two sprints. §6.180 wrote one to find out whether `truncate` on
 * an `inline-flex` box ellipsizes anything (it does not), and another to compare renderer
 * pairs. §6.181 wrote one to measure the poster monogram at 200% and another to measure a
 * remote key on each platform. Every one was deleted the same hour, and the next sprint
 * rebuilt the same twenty lines: launch the pinned Chromium, open the phone export and the
 * web build, find an element by its accessible name, read a rectangle.
 *
 * That is the shape §6.160 collapsed for `shoot`/`reveal` and gave the argument for: two
 * copies of one act agree only because somebody read both in the same fortnight. Three of
 * those five probes measured a rendered box and each decided for itself what to measure and
 * how to report it, which is how the §6.179 near-miss happened — a 2x capture read as 1x,
 * and a mark filed as 800pt from its row when it was 400.
 *
 * ## What it is for, and what it is not
 *
 * It answers *"how big is this, on each platform, and do they agree"*. That is the question
 * three of the last five findings turned on and the one no source-reading guard can answer:
 * `poster.test.ts` reads text, `mobile/smoke.mjs`'s 200% check measures **controls** and
 * skips `aria-hidden`, and every design shot is taken at 100%.
 *
 * It is not a guard and does not assert. It prints. A number that should hold forever
 * belongs in a `*.test.ts` clause against the table that states it; this is the instrument
 * you use to find out what the number is before you can state it.
 *
 * ## Text scale
 *
 * `--scale 2` does what `mobile/smoke.mjs` does and for the reason recorded there: React
 * Native's styles compile to CSS carrying pixel values and `Dimensions` hardcodes
 * `fontScale: 1`, so asking the browser for larger text changes nothing at all. Every
 * element's computed font size is doubled inline instead, with every other pixel value left
 * where it is — the type grows and the box does not, which is what raising the setting on a
 * device does and what 1.4.4 asks about.
 *
 * Not a substitute for a device. It is a substitute for guessing.
 *
 * ## Using it
 *
 *   node scripts/portFree.mjs 4200 && node scripts/portFree.mjs 4202 &&
 *   node scripts/served.mjs 4200 "npx serve mobile/dist -p 4200 --no-clipboard" \
 *   node scripts/served.mjs 4202 "cd app && npx vite preview --port 4202 --strictPort" \
 *   node design/measure.mjs --name "Up" --name "Select" --at /remote --scale 1 --scale 2
 *
 * `--at` is the phone's route; the web's is `--web-at` when it differs, and `--reveal` names
 * a control to press first for anything behind a drawer or a sheet (`--web-reveal` and
 * `--phone-reveal` when the two platforms reach the state differently, which they often do).
 * Both builds have to exist already — `npm run design:phone` and `design:web` make them —
 * because building them here would make the instrument slower than the thing it replaces.
 *
 * ## The trap, which caught two sprints running
 *
 * **`app/dist` is whatever was built last, and what is in it depends on the environment.**
 * `RemoteDrawer` returns `null` unless `bridgeConfigured()`, which reads two build-time
 * `VITE_` variables; `npm run design:web` sets them and `npm run verify` does not. So a
 * `verify` run leaves a build with no remote in it, and measuring that build reports every
 * key as absent — which looks exactly like a measurement and is not one. Rebuild with the
 * design script's own environment before measuring anything behind a build-time flag.
 *
 * Hence the "could not look" line below: §6.57's distinction, in the instrument. A platform
 * that found none of the requested names is reported as unread rather than as a row of
 * zeroes, because those two are not the same answer and only one of them is about the
 * product.
 */
import { chromium } from 'playwright';
import { chromiumOptions } from '../scripts/browser.mjs';

/** The phone's export and the web's preview, as the design scripts serve them. */
const PHONE = process.env.PHONE_BASE ?? 'http://localhost:4200';
const WEB = process.env.WEB_BASE ?? 'http://localhost:4202';

/**
 * 390x844, because that is the viewport every design pass and both smoke suites use, and a
 * measurement taken at a different width is not comparable to the record.
 */
const VIEWPORT = { width: 390, height: 844 };

function args(argv) {
  const out = {
    name: [], scale: [], at: '/', webAt: null,
    reveal: null, phoneReveal: undefined, webReveal: undefined,
    settle: 2500,
  };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '');
    const value = argv[i + 1];
    if (key === 'name') out.name.push(value);
    else if (key === 'scale') out.scale.push(Number(value));
    else if (key === 'at') out.at = value;
    else if (key === 'web-at') out.webAt = value;
    else if (key === 'reveal') out.reveal = value;
    // Per platform, because the same state is often reached two ways: the phone's remote is
    // a route and the web's is a drawer over every screen, which is §6.176's whole subject.
    else if (key === 'phone-reveal') out.phoneReveal = value;
    else if (key === 'web-reveal') out.webReveal = value;
    else if (key === 'settle') out.settle = Number(value);
  }
  if (!out.scale.length) out.scale = [1];
  return out;
}

/**
 * Scale every computed font size by a factor, keeping the original so it can be put back.
 *
 * Idempotent across calls — the base is stamped once and every later factor is applied to
 * that, so `[1, 2, 3]` measures 1x, 2x and 3x rather than 1x, 2x and 6x. §6.179's lesson
 * about compounding, in the instrument rather than in the reading.
 */
const scaleTo = (page, factor) =>
  page.evaluate((f) => {
    let applied = 0;
    for (const el of document.querySelectorAll('*')) {
      if (!el.hasAttribute('data-measure-base')) {
        const size = parseFloat(getComputedStyle(el).fontSize);
        el.setAttribute('data-measure-base', String(Number.isFinite(size) ? size : 0));
      }
      const base = parseFloat(el.getAttribute('data-measure-base'));
      if (!base) continue;
      el.style.fontSize = `${base * f}px`;
      applied++;
    }
    return applied;
  }, factor);

/**
 * Every element carrying one of these accessible names, with its box and its overflow.
 *
 * The name rather than a selector, because it is the one thing both platforms spell the
 * same way on purpose — `aria-label` on the web, `accessibilityLabel` on the phone, which
 * react-native-web renders as `aria-label`. A CSS selector would need two of them and would
 * be measuring two different questions.
 *
 * `clipped` is the half that matters and the half a rectangle alone does not give you: an
 * element wider than the box that clips it looks fine in `getBoundingClientRect` and is cut
 * on screen. That is exactly how the poster monogram survived: 47pt of mark in a 44pt plate,
 * with `overflow: hidden` doing the damage one level up.
 */
const boxes = (page, names) =>
  page.evaluate((wanted) => {
    const clipper = (el) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const o = getComputedStyle(p);
        if (o.overflow !== 'visible' || o.overflowX !== 'visible' || o.overflowY !== 'visible') return p;
      }
      return null;
    };
    const found = [];
    for (const el of document.querySelectorAll('[aria-label],[role],button,a[href]')) {
      const name = el.getAttribute('aria-label') || el.textContent?.trim() || '';
      if (!wanted.some((w) => name === w)) continue;
      if (found.some((f) => f.name === name)) continue;
      const r = el.getBoundingClientRect();
      const clip = clipper(el);
      const c = clip?.getBoundingClientRect();
      found.push({
        name,
        w: Math.round(r.width),
        h: Math.round(r.height),
        font: Math.round(parseFloat(getComputedStyle(el).fontSize)),
        // Wider than the thing that clips it, which a rectangle alone will not tell you.
        clipped: c ? Math.round(r.right - c.right) > 1 || Math.round(c.left - r.left) > 1 : false,
        clipper: clip ? `${clip.tagName.toLowerCase()} ${Math.round(c.width)}x${Math.round(c.height)}` : null,
      });
    }
    return found;
  }, names);

async function readOne(browser, base, { at, reveal, settle, name, scale }) {
  const page = await browser.newPage({ viewport: VIEWPORT });
  const rows = {};
  try {
    await page.goto(`${base}${at}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(settle);
    if (reveal) {
      await page.getByLabel(reveal).first().click({ timeout: 20000 });
      await page.waitForTimeout(1200);
    }
    for (const factor of scale) {
      const applied = await scaleTo(page, factor);
      await page.waitForTimeout(400);
      // Non-vacuous, for the same reason `mobile/smoke.mjs` counts: a measurement on a page
      // where nothing was scaled is a measurement of the unscaled page wearing a label.
      rows[factor] = { applied, found: await boxes(page, name) };
    }
  } catch (e) {
    rows.error = e instanceof Error ? e.message : String(e);
  }
  await page.close();
  return rows;
}

const opts = args(process.argv.slice(2));
if (!opts.name.length) {
  console.error('Nothing to measure. Pass at least one --name "Accessible name".');
  process.exit(2);
}

const browser = await chromium.launch(chromiumOptions());
const phone = await readOne(browser, PHONE, {
  ...opts,
  reveal: opts.phoneReveal === undefined ? opts.reveal : opts.phoneReveal || null,
});
const web = await readOne(browser, WEB, {
  ...opts,
  at: opts.webAt ?? opts.at,
  reveal: opts.webReveal === undefined ? opts.reveal : opts.webReveal || null,
});
await browser.close();

/*
 * One table, both platforms side by side, because the question is whether they agree and a
 * reader comparing two JSON blobs by eye is the step that goes wrong. §6.181's key finding
 * was 80x80 against 72x60 and it only became obvious written on one line.
 */
const disagree = [];
for (const factor of opts.scale) {
  console.log(`\n=== ${factor * 100}% text ===`);
  const p = phone[factor]?.found ?? [];
  const w = web[factor]?.found ?? [];
  console.log(`  (scaled ${phone[factor]?.applied ?? 0} elements on the phone, ${web[factor]?.applied ?? 0} on the web)`);
  for (const name of opts.name) {
    const a = p.find((x) => x.name === name);
    const b = w.find((x) => x.name === name);
    const show = (x) =>
      x ? `${x.w}x${x.h} @${x.font}pt${x.clipped ? ` CLIPPED by ${x.clipper}` : ''}` : '(not found)';
    const same = a && b && a.w === b.w && a.h === b.h;
    if (a && b && !same) disagree.push(`${name} at ${factor * 100}%: phone ${a.w}x${a.h}, web ${b.w}x${b.h}`);
    console.log(`  ${same ? ' ' : '!'} ${name.padEnd(28)} phone ${show(a).padEnd(34)} web ${show(b)}`);
  }
}

for (const [platform, rows] of [['phone', phone], ['web', web]]) {
  if (rows.error) {
    console.error(`\n${platform} could not be read: ${rows.error}`);
    continue;
  }
  /*
   * Nothing found at all is "I could not look", not "it measures zero" — §6.57, which this
   * repo has now made twice at the wire and once in a screenshot. The likely causes are
   * above: a build missing a feature behind a `VITE_` flag, or a route that did not load.
   */
  const any = opts.scale.some((f) => (rows[f]?.found ?? []).length);
  if (!any) {
    console.error(
      `\n${platform} found none of ${opts.name.length} names. That is not a measurement — ` +
        'check the build has the feature in it and that the route loaded.',
    );
  }
}
if (disagree.length) console.log(`\nDisagreements:\n  ${disagree.join('\n  ')}`);

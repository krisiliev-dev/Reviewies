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
 * `--scale 2` asks for twice the text, and it cannot ask the browser: React Native's styles
 * compile to CSS carrying pixel values and `Dimensions` hardcodes `fontScale: 1`, so raising
 * the page's root size changes nothing at all. Every element's computed font size is doubled
 * inline instead, with every other pixel value left where it is — the type grows and the
 * poster does not, which is what raising the setting on a device does and what 1.4.4 asks
 * about.
 *
 * With one exception, which is this sprint's finding: **the line box is not one of the
 * pixel values that stays put.** React Native scales `lineHeight` with the glyphs on both
 * shipping platforms, and `react-native-web` does not, so a simulation that moves only the
 * font size is a simulation of the export rather than of a phone. `scaleTo` below has the
 * citations and does the scaling. Leaving that out is how §6.183 measured a line box holding
 * at 17 and wrote it down as a fact about React Native.
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
 * `--lines` adds the census underneath: every run of words on the screen against the line box
 * and the tracking it was given, as ratios of the *rendered* size rather than as points. It
 * takes no name, because the question it answers — does a line box answer the reader's text
 * setting — belongs to every run on the screen and to none of them in particular.
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
    settle: 2500, lines: false,
  };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '');
    const value = argv[i + 1];
    // The one flag that takes no value, so it does not consume the next argument.
    if (key === 'lines') { out.lines = true; i -= 1; continue; }
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
 *
 * ## The line box goes with the glyphs on the phone, and does not on the web
 *
 * This is the correction this sprint makes, and the reason it matters is that the uncorrected
 * version is what produced §6.183's wrong conclusion. Doubling only the font size reproduces
 * `react-native-web`'s behaviour, which emits `lineHeight` as a `px` rule and hardcodes
 * `Dimensions.fontScale` to 1 — so the box never moves. **React Native itself does move it**,
 * on both shipping platforms and in the version this repo depends on:
 *
 * - iOS, both renderers: `lineHeight * effectiveFontSizeMultiplier`, the same multiplier that
 *   scales the glyphs (`RCTTextAttributes.mm`, `RCTAttributedTextUtils.mm`).
 * - Android: `toPixelFromSP(lineHeight)` whenever `allowFontScaling` is on, which is the
 *   font-scaled unit (`TextAttributeProps.kt`).
 *
 * So the phone's line box is stamped and scaled with the type, which is what a device does.
 * The web's is left alone because CSS was already right: the ratio recomputes against the
 * rendered size on its own, and setting it here would scale it twice.
 *
 * `letterSpacing` is deliberately left alone on both. It is the one property where the two
 * shipping platforms disagree — Android scales it through the same `toPixelFromSP`, iOS
 * hands it to `NSKernAttributeName` raw — so no single simulation is faithful to both, and a
 * silent choice between them is how a renderer's behaviour gets written down as a
 * platform's. What is left is iOS's.
 */
const scaleTo = (page, factor, native) =>
  page.evaluate(
    ({ f, native }) => {
      let applied = 0;
      for (const el of document.querySelectorAll('*')) {
        if (!el.hasAttribute('data-measure-base')) {
          const cs = getComputedStyle(el);
          const size = parseFloat(cs.fontSize);
          el.setAttribute('data-measure-base', String(Number.isFinite(size) ? size : 0));
          const line = cs.lineHeight === 'normal' ? 0 : parseFloat(cs.lineHeight);
          el.setAttribute('data-measure-line', String(Number.isFinite(line) ? line : 0));
        }
        const base = parseFloat(el.getAttribute('data-measure-base'));
        if (!base) continue;
        el.style.fontSize = `${base * f}px`;
        if (native) {
          const line = parseFloat(el.getAttribute('data-measure-line'));
          if (line) el.style.lineHeight = `${line * f}px`;
        }
        applied++;
      }
      return applied;
    },
    { f: factor, native },
  );

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
 *
 * It read `r.right`/`c.left` only, so it answered about a *width* and said nothing about a
 * descender cut off the bottom of a bar with a fixed height — which is the shape a leading
 * fault takes and is the one this sprint was sent to measure. Both axes now, and the axis is
 * named in the output, because "clipped" without one sent a reader looking sideways at a
 * vertical fault.
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
      const cs = getComputedStyle(el);
      const font = parseFloat(cs.fontSize);
      const line = cs.lineHeight === 'normal' ? null : parseFloat(cs.lineHeight);
      // Past the thing that clips it, which a rectangle alone will not tell you. Named by
      // axis: a bar with a fixed height cuts descenders and never moves a right edge.
      const x = c ? Math.round(r.right - c.right) > 1 || Math.round(c.left - r.left) > 1 : false;
      const y = c ? Math.round(r.bottom - c.bottom) > 1 || Math.round(c.top - r.top) > 1 : false;
      found.push({
        name,
        w: Math.round(r.width),
        h: Math.round(r.height),
        font: Math.round(font),
        /*
         * The line box, and the glyphs' own claim on it. React Native's `lineHeight` is a
         * point value fixed at module load and the web's is a ratio computed against the
         * rendered size, so this is the one number where the two platforms are expected to
         * *disagree* as the scale rises — and the disagreement is the finding, not a fault
         * in the reading.
         */
        line: line === null ? null : Math.round(line * 10) / 10,
        crowded: line !== null && line + 0.5 < font,
        clipped: x || y,
        axis: x && y ? 'xy' : x ? 'x' : y ? 'y' : null,
        clipper: clip ? `${clip.tagName.toLowerCase()} ${Math.round(c.width)}x${Math.round(c.height)}` : null,
      });
    }
    return found;
  }, names);

/**
 * Every word on the screen, against the line box and the tracking it was given.
 *
 * `boxes` above needs to be told what to look for, and a name is only spelled on a control.
 * The leading question is not about controls: it is about *whether a line box answers the
 * reader's text setting*, which is a property of every run of text on the screen and of
 * none of them in particular. Naming them one at a time is how a census turns back into the
 * five throwaway probes this file exists to stop.
 *
 * A leaf with words in it, because that is where `line-height` resolves — react-native-web
 * draws a `<Text>` as a childless `<div dir="auto">` and the web draws a `<p>` or a `<span>`
 * the same way. An ancestor's box is its children's stacking and says nothing about a
 * glyph's own room.
 *
 * Two numbers per run, and both are ratios rather than points on purpose, because a point
 * value at 100% and the same point value at 200% is exactly the fault being looked for and
 * a table of points hides it:
 *
 * - `lead` — the line box over the rendered size. 1.43 is the token; anything below 1.0 is
 *   glyphs taller than the box holding them, which is a collision on any run of two lines
 *   and a clip on any run of one inside a fixed height.
 * - `track` — `letterSpacing` over the rendered size, which is the em figure the token
 *   table stores. `t83` is 0.083; half of that is the caps closing up.
 *
 * And `cut`, which is the vertical half `boxes` above could not give. A line box smaller than
 * its glyphs fails two different ways and only one of them is visible in a rectangle. On a
 * run of two lines or more the lines *collide*, and `rows` says whether there are two. On a
 * run of one line inside something with a fixed height the ascenders and descenders are
 * *cut*, and the element's own rectangle stays exactly the size it was — which is what a tab
 * item measuring 78x51 at 100%, 200% and 300% looks like from the outside.
 *
 * So the glyphs are placed rather than measured: CSS puts the `font-size`-tall content area
 * in the middle of the line box (half-leading above and below), so a 24pt run in a 17pt line
 * reaches 3.5pt past that box at each end. `cut` is how far that content area passes the
 * nearest ancestor that clips, in points. It is a model and it is the right one — the
 * alternative is reading pixels, and a glyph's real ink depends on the face.
 */
const runs = (page) =>
  page.evaluate(() => {
    /*
     * `hidden`, and only when nothing between the words and it can scroll — which is the
     * difference between a finding and a table of noise. A first cut took the nearest
     * ancestor with any non-visible `overflow-y` and reported a note three screens down a
     * scroller as "cut 330pt"; that is not clipping, it is the fold, and every long screen
     * has one. Naming `hidden` alone was not enough either, because react-native-web wraps
     * a `ScrollView`'s scroller in a `hidden` box — so the fold came back through the
     * grandparent. A scroller found first means the reader can reach the rest.
     *
     * From the element itself, because the ordinary way a React Native style clips is to
     * clip its own content: a `height` and an `overflow` on the same box the words are in.
     * Starting at the parent read that case as zero and hid the tab labels for a sprint.
     */
    const clipper = (el) => {
      for (let p = el; p; p = p.parentElement) {
        const o = getComputedStyle(p).overflowY;
        if (o === 'auto' || o === 'scroll') return null;
        if (o === 'hidden') return p;
      }
      return null;
    };
    const out = [];
    for (const el of document.querySelectorAll('*')) {
      if (el.children.length) continue;
      const words = el.textContent?.trim();
      if (!words) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const cs = getComputedStyle(el);
      const font = parseFloat(cs.fontSize);
      if (!font) continue;
      const line = cs.lineHeight === 'normal' ? null : parseFloat(cs.lineHeight);
      const space = cs.letterSpacing === 'normal' ? 0 : parseFloat(cs.letterSpacing) || 0;
      // Half-leading: the content area is `font` tall and sits centred in the line box, so
      // it reaches this far past the rectangle at the top and at the bottom.
      const half = line === null ? 0 : Math.max(0, (font - line) / 2);
      const clip = clipper(el);
      const c = clip?.getBoundingClientRect();
      // A box that clips its own words hides them inside its rectangle, so a rectangle
      // comparison reads zero; `scrollHeight` against `clientHeight` is what says how much.
      const cut = c
        ? Math.round(
            (clip === el
              ? Math.max(el.scrollHeight - el.clientHeight, half)
              : Math.max(c.top - (r.top - half), r.bottom + half - c.bottom)) * 10,
          ) / 10
        : null;
      out.push({
        words: words.replace(/\s+/g, ' ').slice(0, 26),
        font: Math.round(font * 10) / 10,
        line: line === null ? null : Math.round(line * 10) / 10,
        // How many lines the run actually drew, which is what turns a tight box into a
        // collision rather than a clip.
        rows: line ? Math.max(1, Math.round(r.height / line)) : 1,
        lead: line === null ? null : Math.round((line / font) * 1000) / 1000,
        track: Math.round((space / font) * 1000) / 1000,
        cut: cut !== null && cut > 0.5 ? cut : null,
        /*
         * *Why* it clips, which decides whether a cut is a finding. A box told to truncate
         * is doing its job — `numberOfLines` compiles to `-webkit-line-clamp` plus
         * `overflow: hidden` on the web — and reporting it as clipped text is how an
         * instrument turns a feature into a bug report. A box that clips because somebody
         * gave it a height is the other thing.
         */
        why: clip
          ? (() => {
              const o = getComputedStyle(clip);
              if (o.webkitLineClamp && o.webkitLineClamp !== 'none') return 'truncate';
              if (o.textOverflow === 'ellipsis' || o.whiteSpace === 'nowrap') return 'truncate';
              return 'fixed';
            })()
          : null,
        clipper: clip ? `${clip.tagName.toLowerCase()} ${Math.round(c.width)}x${Math.round(c.height)}` : null,
      });
    }
    return out;
  });

async function readOne(browser, base, { at, reveal, settle, name, scale, lines, native }) {
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
      const applied = await scaleTo(page, factor, native);
      await page.waitForTimeout(400);
      // Non-vacuous, for the same reason `mobile/smoke.mjs` counts: a measurement on a page
      // where nothing was scaled is a measurement of the unscaled page wearing a label.
      rows[factor] = { applied, found: await boxes(page, name), runs: lines ? await runs(page) : [] };
    }
  } catch (e) {
    rows.error = e instanceof Error ? e.message : String(e);
  }
  await page.close();
  return rows;
}

const opts = args(process.argv.slice(2));
if (!opts.name.length && !opts.lines) {
  console.error('Nothing to measure. Pass at least one --name "Accessible name", or --lines.');
  process.exit(2);
}

const browser = await chromium.launch(chromiumOptions());
const phone = await readOne(browser, PHONE, {
  ...opts,
  native: true,
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
      x
        ? `${x.w}x${x.h} @${x.font}pt${x.line === null ? '' : `/${x.line}`}` +
          `${x.crowded ? ' CROWDED' : ''}${x.clipped ? ` CLIPPED-${x.axis} by ${x.clipper}` : ''}`
        : '(not found)';
    const same = a && b && a.w === b.w && a.h === b.h;
    if (a && b && !same) disagree.push(`${name} at ${factor * 100}%: phone ${a.w}x${a.h}, web ${b.w}x${b.h}`);
    console.log(`  ${same ? ' ' : '!'} ${name.padEnd(28)} phone ${show(a).padEnd(40)} web ${show(b)}`);
  }
  if (!opts.lines) continue;
  /*
   * The census, summarised rather than dumped: the count of runs whose line box is smaller
   * than the glyphs in it, the two ratios at their extremes, and the worst handful named so
   * the finding can be looked at rather than only counted.
   */
  for (const [platform, rows] of [['phone', phone], ['web', web]]) {
    const all = rows[factor]?.runs ?? [];
    const led = all.filter((x) => x.lead !== null);
    const tracked = all.filter((x) => x.track > 0.001);
    const crowded = led.filter((x) => x.lead < 1);
    const cut = all.filter((x) => x.cut !== null);
    const range = (xs, k) =>
      xs.length ? `${Math.min(...xs.map((x) => x[k]))}–${Math.max(...xs.map((x) => x[k]))}` : '—';
    console.log(
      `  ${platform.padEnd(6)} ${all.length} runs, ${led.length} with a line box: ` +
        `lead ${range(led, 'lead')}, track ${range(tracked, 'track')} (${tracked.length} runs), ` +
        `${crowded.length} crowded, ${cut.length} cut`,
    );
    for (const x of cut.sort((a, b) => b.cut - a.cut).slice(0, 8)) {
      console.log(
        `           "${x.words}" ${x.font}pt in ${x.line}, CUT ${x.cut}pt by ${x.clipper} (${x.why})`,
      );
    }
    for (const x of crowded.sort((a, b) => a.lead - b.lead).slice(0, 8)) {
      console.log(
        `           "${x.words}" ${x.font}pt in ${x.line} (lead ${x.lead}), ` +
          `${x.rows} row${x.rows === 1 ? '' : 's'}` +
          `${x.rows > 1 ? `, lines overlap ${Math.round((x.font - x.line) * 10) / 10}pt` : ''}` +
          `${x.cut !== null ? `, cut ${x.cut}pt by ${x.clipper}` : ''}`,
      );
    }
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
  if (opts.name.length && !any) {
    console.error(
      `\n${platform} found none of ${opts.name.length} names. That is not a measurement — ` +
        'check the build has the feature in it and that the route loaded.',
    );
  }
}
if (disagree.length) console.log(`\nDisagreements:\n  ${disagree.join('\n  ')}`);

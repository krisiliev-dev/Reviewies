/**
 * What the poster's column costs the title page's synopsis, at both photographed widths.
 *
 * ## The finding this exists to make checkable
 *
 * `app/src/screens/TitleDetail.tsx` drew the poster and a `flex-1` column beside it, and
 * put the whole synopsis **inside that column**. On a long overview the poster runs out
 * after three lines and the remaining twelve keep the poster's indent, so the paragraph was
 * set to a measure it never needed. `mobile/app/title/[id].tsx:203` draws the same field on
 * its own line under the row and always has — and the comment on the control beneath it
 * gives the reason in as many words: *"Its own line rather than the column beside the
 * poster … in a column narrowed by a poster and by whatever the system font scale is doing,
 * the last stars fall off the end."* That reason was applied to the rating and to
 * `AddToList`, on one platform, and not to the paragraph.
 *
 * `TitleDetail.tsx`'s own comment already names the shape — *"one field, two platforms,
 * different halves"* — about the `line-clamp-3` it removed from this very paragraph. This
 * is the same field's other half.
 *
 * ## Measured rather than eyeballed, and the alternative photographed rather than described
 *
 * The run reports the paragraph's box as the build draws it and, while the paragraph is
 * still inside the column, moves it out in the live DOM — which is the phone's layout, not
 * an invention — and reports it again. Once the screen draws it on its own line there is no
 * alternative left to simulate and the second reading *is* the layout, which is a better
 * measurement than any simulation of it.
 *
 * ## Every title, not the one the finding came from
 *
 * §6.193 measured One Piece — the longest overview in the snapshot at 583 characters, and
 * the defect is a function of length: a two-line synopsis never reaches past the poster. The
 * brief that acted on it made *"if moving it costs something at 1280 or on any other title,
 * that is the finding"* a stop condition, and a probe that can only look at one title cannot
 * answer that. So it walks all six in `design/real/MANIFEST.json`, at both widths, and
 * carries the row height and the page height beside the paragraph's box so a repair that
 * fixes the measure and lengthens the screen cannot be reported as free.
 *
 * One Piece is still the one photographed, because the pictures are of the case the
 * argument is about.
 *
 * Run, with the snapshot server on the port `app/dist-real` was built against:
 *
 *   npm run build:real --workspace app          # if dist-real is not current
 *   node scripts/served.mjs 4203 "node design/serveSnapshot.mjs 4203" \
 *     node scripts/served.mjs 4472 "cd app && npx vite preview --outDir dist-real --port 4472 --strictPort" \
 *     env BASE=http://localhost:4472 node design/found/measure-title-synopsis.mjs
 */
import { chromium } from 'playwright';
import { chromiumOptions } from '../../scripts/browser.mjs';
import { manifest } from '../realLibrary.mjs';

/** The window the web app is actually opened in, and the one `capture-web-real.mjs` shoots. */
const WIDTHS = [420, 1280];
/** Every title the snapshot holds; the long one is the one that gets photographed. */
const TITLES = manifest.titles.map((t) => ({
  id: `tmdb:${t.kind}:${t.id}`,
  name: t.name,
  shot: t.id === 37854,
}));
const BASE = process.env.BASE ?? 'http://localhost:4471';
const OUT = new URL('./', import.meta.url).pathname;
/**
 * The band `TitleDetail.tsx` cites in the comment that introduced `SCREEN.prose`, and the
 * reason this file can hold a clause rather than only print numbers.
 */
const MEASURE = { low: 45, high: 75 };

/**
 * The synopsis, found by what the renderer does to it rather than by what it says.
 *
 * `TitleDetail.tsx` is the only place in the app that writes `maxWidth` inline on a `<p>` —
 * `SCREEN.prose`, and its own comment says why it is inline: *"the number lives in the core
 * and Tailwind cannot be handed one"*. So that is the needle, and it survives the paragraph
 * moving, which a needle written from one title's opening words would not. §6.107's 2-of-7
 * is what a hand-written control name costs; this one is read off the thing under test.
 *
 * How many matched is returned with it, because *the* paragraph and *a* paragraph are
 * different claims and only one of them is a measurement.
 */
const READ = () => {
  const found = [...document.querySelectorAll('p')].filter((el) => el.style.maxWidth);
  if (found.length !== 1) return { found: found.length };
  const p = found[0];
  const r = p.getBoundingClientRect();
  const cs = getComputedStyle(p);

  /*
   * The measure in characters, taken from the **column** rather than from this paragraph's
   * character count divided by its line count.
   *
   * `583 / 15` is an estimate that is only fair on a long paragraph: the last line of a
   * short one is a fragment, so a two-line synopsis reads as a narrower measure than the
   * column it is actually set in, and a clause built on that would convict a correct screen
   * — the overfiring guard §6.190 corrected three of. The convention's "45–75 characters"
   * is a statement about the column, so this measures the column: the alphabet, set in this
   * paragraph's own computed font, divided by its twenty-six letters.
   */
  const ruler = document.createElement('span');
  Object.assign(ruler.style, {
    font: cs.font,
    letterSpacing: cs.letterSpacing,
    position: 'absolute',
    visibility: 'hidden',
    whiteSpace: 'pre',
  });
  ruler.textContent = 'abcdefghijklmnopqrstuvwxyz';
  p.parentElement.appendChild(ruler);
  const advance = ruler.getBoundingClientRect().width / 26;
  ruler.remove();

  /*
   * Whether it is still inside the poster's column — asked of the **boxes**, because every
   * cheaper spelling of the question answers a different one.
   *
   * `p.closest('.flex')` was the first version and it is wrong in the direction that
   * matters: once the paragraph is on its own line the nearest flex ancestor is the app
   * shell in `App.tsx`, which does contain the poster, so the probe went on reporting
   * "still beside it" and simulated a move to `x 0, 420px` — a reading of a layout that
   * exists nowhere. An instrument that cannot see its own subject being repaired is the
   * §6.153 shape.
   *
   * "Beside the poster" is a claim about geometry, so it is measured as geometry: a poster
   * whose right edge is at or left of this paragraph's left edge, on lines the poster is
   * still level with. Nothing here reads a class name or a component.
   */
  const line = parseFloat(cs.lineHeight);
  const poster = [...document.querySelectorAll('img')]
    .map((el) => el.getBoundingClientRect())
    .find((b) => b.width > 40 && b.right <= r.left + 1 && b.bottom > r.top && b.top < r.top + line);
  const beside = !!poster;
  /*
   * And how far past the poster's foot the paragraph runs, which is the finding's own
   * sentence as a number: *"the poster ends after line 3 and twelve lines keep an indent
   * past nothing"*. A synopsis short enough to sit entirely beside the poster wastes no
   * indent and there is nothing to convict, so this is what the clause is built on rather
   * than on `beside` alone — a rule that overfires costs more than a missing one.
   */
  const pastPoster = poster ? Math.max(0, Math.round(r.bottom - poster.bottom)) : 0;

  return {
    x: Math.round(r.x),
    box: Math.round(r.width),
    lines: Math.round(r.height / parseFloat(cs.lineHeight)),
    height: Math.round(r.height),
    maxWidth: cs.maxWidth,
    chars: p.textContent.length,
    measure: Math.round(r.width / advance),
    beside,
    pastPoster,
    line: Math.round(line),
    /* What the whole screen costs, so a repair that fixes one paragraph and lengthens the
     * page is not reported as free. The page's own scroller, not the window. */
    page: Math.round(document.querySelector('main')?.scrollHeight ?? 0),
    header: Math.round(
      document.querySelector('main .flex')?.getBoundingClientRect().height ?? 0,
    ),
  };
};

const browser = await chromium.launch(chromiumOptions());
const rows = [];
const complaints = [];
for (const width of WIDTHS) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 2 });
  for (const title of TITLES) {
    await page.goto(`${BASE}/title/${encodeURIComponent(title.id)}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    let now = await page.evaluate(READ);
    for (let i = 0; i < 14 && now.found !== undefined; i++) {
      await page.waitForTimeout(500);
      now = await page.evaluate(READ);
    }
    if (now.found !== undefined) {
      complaints.push(
        `${width}, ${title.name}: ${now.found} paragraphs carry an inline measure, so there is no ` +
          'reading of the synopsis here at all',
      );
      continue;
    }
    rows.push({ width, name: title.name, ...now });
    if (title.shot) await page.screenshot({ path: `${OUT}web-title-synopsis-${width}-now.png` });

    if (now.beside) {
      await page.evaluate(() => {
        const p = [...document.querySelectorAll('p')].filter((el) => el.style.maxWidth)[0];
        const row = p.closest('.flex');
        row.parentElement.insertBefore(p, row.nextSibling);
        p.style.marginTop = '0';
        p.style.marginBottom = '20px';
      });
      await page.waitForTimeout(400);
      rows.push({ width, name: title.name, simulated: true, ...(await page.evaluate(READ)) });
      if (title.shot) await page.screenshot({ path: `${OUT}web-title-synopsis-${width}-moved.png` });
    }
  }
  await page.close();
}
await browser.close();

/**
 * One line per reading, with the numbers a repair could quietly spend beside the one it is
 * spending them on. `→ moved` rows are the alternative applied to the live DOM; the rest are
 * the layout as this build draws it.
 */
console.log('  width  title                                x   box  measure  lines  header    page');
for (const r of rows) {
  console.log(
    `  ${String(r.width).padStart(5)}  ${(r.simulated ? '→ moved' : r.name).slice(0, 33).padEnd(33)}` +
      `${String(r.x).padStart(4)}${String(r.box).padStart(6)}` +
      `${String(r.measure).padStart(9)}${String(r.lines).padStart(7)}` +
      `${String(r.header).padStart(8)}${String(r.page).padStart(8)}`,
  );
}

/**
 * And the clause, because a probe that only prints is a probe nobody re-runs.
 *
 * ## What it checks
 *
 * Every title's synopsis, at both photographed widths, set to a measure inside the 45–75
 * band `app/src/screens/TitleDetail.tsx` cites in the comment that introduced
 * `SCREEN.prose`. That cap is only half a rule: it stops the measure being too *wide* at
 * 1280 and says nothing about it being too narrow at 420, which is the whole of the defect
 * §6.193 filed and could not hold anything to.
 *
 * ## Measured rather than imagined
 *
 * Planted by putting the paragraph back inside the poster's column — the layout this build
 * shipped with — and running this file **as it stood before this clause existed**. It
 * printed `420: beside the poster 276px, 15 lines, 343px tall (39 characters a line, cap
 * 460px)` and **exited 0**: the number that is the finding, printed as information, with
 * nothing anywhere objecting to it. With the clause, the same plant fails by name.
 *
 * ## The second clause, which exists because the first one was defeated
 *
 * The band alone is not the finding. Planted a second time — the paragraph left in the
 * poster's column and dropped from `text-s16` to `text-s12`, type-clean, `tsc -b core app
 * mobile` at 0 — the 276px column fits **47** characters and the 420 clause is satisfied
 * with the defect entirely intact: still indented 128px, still running twelve lines past a
 * poster that ends after three. It failed only at 1280, and only by accident: `SCREEN.prose`
 * is a cap in *pixels*, so shrinking the type widened the measure there to 79 and the
 * ceiling caught what the floor had missed. A guard that convicts at the width the defect is
 * not at is a guard that will stop convicting the moment somebody changes the cap.
 *
 * So the finding's own sentence is checked as well: *"the poster ends after line 3 and the
 * remaining twelve keep an indent past nothing"*. A paragraph beside the poster that runs
 * more than a line past the poster's foot is that sentence, measured. A short synopsis that
 * sits entirely beside the poster wastes no indent and is not convicted — §6.190's rule, and
 * the reason this is not simply `beside`.
 *
 * ## What it still cannot see
 *
 * A column of the right measure set in the wrong face, or at a line height that makes the
 * start of the next line hard to find, satisfies both of these exactly — they are about
 * characters to a line and about an indent, and nothing else. And a synopsis moved somewhere
 * absurd but full-width passes: the `header` and `page` columns above are what a reader
 * checks that against. `docs/design/hci.md` refuses Fitts for the same shape of reason — the
 * number that can be checked is the one being claimed, not the one it would be nicer to have
 * — so the limit is written down rather than implied.
 */
for (const r of rows) {
  if (r.simulated) continue;
  if (r.measure < MEASURE.low || r.measure > MEASURE.high) {
    complaints.push(
      `${r.width}, ${r.name}: the synopsis sets ${r.measure} characters to a line in a ${r.box}px ` +
        `column, outside the ${MEASURE.low}–${MEASURE.high} band TitleDetail.tsx cites`,
    );
  }
  if (r.pastPoster > r.line) {
    complaints.push(
      `${r.width}, ${r.name}: the synopsis is set in the poster's column and runs ${r.pastPoster}px ` +
        `past the poster's foot — ${Math.round(r.pastPoster / r.line)} of its ${r.lines} lines keep ` +
        'an indent past nothing',
    );
  }
}
if (complaints.length) {
  console.error(`\nThe title page's synopsis:\n  ${complaints.join('\n  ')}`);
  process.exitCode = 1;
}

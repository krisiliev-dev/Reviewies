import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  EDGE_EXEMPT,
  EMPTY_ALIGN,
  FULL_SCREEN,
  PROSE_CHARACTERS,
  SCREEN,
  WIDE,
} from '@reviewies/core/ui/screen';
import { space } from '@reviewies/core/tokens';

/**
 * The edge of the screen, and the rows that are supposed to cross it.
 *
 * `docs/design/direction.md`'s comparison opens on **full-bleed rows on hairlines**, and
 * `Row.tsx` has said *"Full bleed and ruled, not a card"* since it was written. It was
 * never true: every screen wrapped its rows in its own padding, so the rule stopped short
 * at both ends. The design harness measured **21 rules at `16..374` of 390** across seven
 * screens on the run before this.
 *
 * No source clause could have found it. `Row.tsx` is correct — `border-b` on a block with
 * no horizontal margin is exactly right — and the defect lived entirely in what contained
 * it. That is why the measurement is in `design/capture.mjs`, against
 * `getBoundingClientRect()`, and why this file holds only what a source can actually know.
 *
 * Underneath was the reason it could not be fixed in one place: **the edge had no owner.**
 * The phone wrote the literal `16` in fourteen containers; the web wrote Tailwind's
 * *default* scale at three different values — `p-6` on Up Next, Watchlist, Lists and Not
 * Found, `p-4` on ten screens, `p-3` on Watching Mode. Up Next, the screen this product
 * opens on, had a 24px edge on the web and a 16pt edge on the phone.
 */

const ROOT = resolve(import.meta.dirname, '../../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');
const withoutProse = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/** The screens that are actually routed, read from the route table rather than the folder. */
function routedScreens(): string[] {
  const app = read('app/src/App.tsx');
  const table = app.slice(app.indexOf('const ROUTES'));
  return [...new Set([...table.matchAll(/screen: (\w+)/g)].map((m) => m[1]))];
}

describe('the screen edge', () => {
  it('is one number, and the bleed is exactly its negative', () => {
    /*
     * A bleed that does not match the edge is worse than no bleed: it overhangs, which is
     * a horizontal scrollbar on the web and a clipped rule on the phone. The harness
     * catches an overhang as well as a shortfall for that reason, and this keeps the two
     * numbers from being independently editable in the first place.
     */
    expect(SCREEN.edge).toBe(space.s16);
    expect(SCREEN.bleed).toBe(-SCREEN.edge);
    expect(Object.values(space), 'the edge is off the space scale').toContain(SCREEN.edge);
  });

  it('is what every routed screen insets by, or the screen is named with a reason', () => {
    const wrong: string[] = [];
    const screens = routedScreens();
    expect(screens.length, 'no routes found, so this proved nothing').toBeGreaterThan(10);
    for (const name of screens) {
      if (EDGE_EXEMPT[name]) continue;
      const source = read(`app/src/screens/${name}.tsx`);
      const root = /<div className="([^"]*)"/.exec(source)?.[1] ?? '';
      if (!root) {
        wrong.push(`${name}: no root className to read`);
        continue;
      }
      if (!/\bp-s16\b/.test(root)) wrong.push(`${name}: root is "${root}"`);
    }
    // Read a failure as: this screen picked its own edge, so its rows cross a different
    // line from every other screen's, and the two platforms disagree about where the
    // paper ends.
    expect(wrong).toEqual([]);
  });

  it('is what every phone screen container insets by, from the table not a literal', () => {
    const wrong: string[] = [];
    let seen = 0;
    for (const file of phoneFiles()) {
      for (const m of withoutProse(read(file)).matchAll(/\bcontent: \{ padding: ([^,]+),/g)) {
        seen++;
        if (m[1].trim() !== 'SCREEN.edge') wrong.push(`${file}: content padding is ${m[1]}`);
      }
    }
    expect(seen, 'no phone screen containers were found, so this proved nothing')
      .toBeGreaterThan(12);
    expect(wrong).toEqual([]);
  });

  it('is crossed by the row, on both platforms, using the table', () => {
    /*
     * Code, not prose: both files explain the mechanism in a paragraph that names the
     * classes, so a whole-file `toContain` reads its own explanation. The fourth sprint
     * running that this has mattered.
     */
    const web = withoutProse(read('app/src/ui/Row.tsx'));
    const block = /^const BLOCK =\n\s*'([^']*)';$/m.exec(web)?.[1] ?? '';
    expect(block, 'no BLOCK constant to read').toBeTruthy();
    expect(block, 'the row stopped bleeding').toContain(`-mx-s${SCREEN.edge}`);
    expect(block, 'the row bleeds and never puts its words back').toContain(`px-s${SCREEN.edge}`);

    const phone = withoutProse(read('mobile/src/ui/Row.tsx'));
    expect(phone).toContain('marginHorizontal: SCREEN.bleed');
    expect(phone).toContain('paddingHorizontal: SCREEN.edge');
  });

  it('puts a screen\'s message where its content begins, not in the middle of it', () => {
    /*
     * Three screens centred theirs in a `flex: 1` container while every other screen and
     * the whole of the web top-aligned. `10-lists.png`: the title pinned to the top, some
     * seven hundred points of nothing, and the sentence at 55% of the viewport.
     *
     * The rule turns on whether the screen **has a name**, not on whether it is empty.
     * Those three render a `<Stack.Screen options={{ title }} />` and then centre the
     * message in what is left, so they are half a full-screen state and half a screen.
     * `_layout.tsx` centres and is right to: it replaces the app before the router mounts.
     */
    expect(EMPTY_ALIGN).toBe('top');

    const offenders: string[] = [];
    for (const file of phoneFiles()) {
      const source = withoutProse(read(file));
      const name = file.split('/').pop()?.replace('.tsx', '') ?? '';
      if (FULL_SCREEN[name]) continue;
      // A screen that names itself and then centres a container that fills the rest.
      if (!/<Stack\.Screen/.test(source)) continue;
      for (const m of source.matchAll(/\{[^{}]*flex: 1[^{}]*justifyContent: 'center'[^{}]*\}/g)) {
        offenders.push(`${file}: ${m[0].slice(0, 60)}`);
      }
    }
    expect(offenders).toEqual([]);

    // And the one that is allowed to has no title to be below.
    const layout = withoutProse(read('mobile/app/_layout.tsx'));
    expect(layout, 'the full-screen state grew a title; it is a screen now')
      .not.toMatch(/<Stack\.Screen options=\{\{ title/);
  });

  it('caps the column once, in the shell, and not on the immersive route', () => {
    /*
     * §6.157, and the reason it took this long: **nothing had ever photographed the web app
     * above 420pt wide.** `capture-web.mjs` shoots at 420 and the phone's passes at 390, so
     * the window an ordinary desktop visitor gets had never been looked at by anything.
     *
     * At 1280 the app was the phone layout stretched — rows spanning the whole window, so
     * Up Next put One Piece's title at the far left and its own checkbox at the far right,
     * about 1,100 points apart. #169 was filed over the same failure at 390.
     *
     * The cap lives on `<main>` in the shell. Not per screen, which is fifteen chances to
     * pick a different number, and not inside `<main>`, because the scroll belongs to
     * `<main>` and a cap further in would centre the content while leaving the scrollbar at
     * the window's edge.
     */
    expect(SCREEN.measure, 'the column has no cap').toBeGreaterThan(SCREEN.edge);

    const app = withoutProse(read('app/src/App.tsx'));
    /*
     * The **construct**, not the name. `clauses.test.ts` refused the first version of this
     * for reading a whole file for a needle the file carries twice — `SCREEN.measure` is
     * also in the comment above the cap — which is §6.156's fourth plant caught by a guard
     * instead of by a plant this time.
     *
     * And positions, not presence: the cap has to be applied where the routes render, so it
     * comes after `<main` and before `<Routes`.
     */
    const capped = app.search(/maxWidth: SCREEN\.measure/);
    expect(capped, 'the shell does not read the cap from the table').toBeGreaterThan(-1);
    expect(capped, 'the cap is not applied in the shell').toBeGreaterThan(app.indexOf('<main'));
    expect(app.indexOf('<Routes'), 'the routes render outside the capped column')
      .toBeGreaterThan(capped);

    /*
     * And Watching Mode does not take it, for the same reason `EDGE_EXEMPT` already gives
     * about the other measurement it declines: the frame is given over to the stream.
     */
    expect(app, 'the cap is applied to the immersive route too').toMatch(
      /immersive \? undefined : \{ maxWidth: SCREEN\.measure \}/,
    );
    expect(Object.keys(EDGE_EXEMPT)).toContain('WatchingMode');
  });

  it('gives prose its own measure, narrower than the column of rows', () => {
    /*
     * Two questions that had one answer because there was one number.
     *
     * `SCREEN.measure` was measured for a **row** — the clause above says so, and the table
     * says why: 720 "keeps a row's two ends close enough to belong to each other", which is
     * about one line scanned left to right. The title page's synopsis is the only running
     * prose in the product, and it inherited that number by being in the same column.
     *
     * Measured at 1280 against the real snapshot, counting the browser's own line boxes:
     * every one of the six synopses set between **82 and 89 characters** to a line, against
     * 44 for the same paragraph at 420 and a convention that puts a comfortable measure at
     * 45–75. A paragraph is read line after line and what a wide measure costs is finding
     * the start of the next one — a failure a row cannot have, because a row has no next
     * line. One number could not answer both.
     */
    expect(SCREEN.prose, 'prose is as wide as the column, which is not a decision')
      .toBeLessThan(SCREEN.measure);
    expect(SCREEN.prose, 'prose is narrower than the edge it sits inside')
      .toBeGreaterThan(SCREEN.edge);
    /*
     * And the claim, in the unit the convention is stated in. The width is what a renderer
     * applies; this is what `design/capture-web-real.mjs` measures the rendering against, on
     * every real synopsis at both photographed widths, because how many characters a width
     * holds is a fact about a face and a text size that no arithmetic here can know.
     */
    expect(PROSE_CHARACTERS, 'the ceiling has left the 45–75 band it was taken from')
      .toBeLessThanOrEqual(75);

    /*
     * Read from the table at the one place prose is drawn, not typed. The **construct**
     * rather than the name, for `clauses.test.ts`'s reason: `SCREEN.prose` is also in the
     * paragraph above the line that applies it.
     */
    const title = withoutProse(read('app/src/screens/TitleDetail.tsx'));
    expect(title, 'the synopsis does not take its measure from the table').toMatch(
      /maxWidth: SCREEN\.prose/,
    );
    expect(title, 'the synopsis picks its own width off Tailwind’s scale').not.toMatch(
      /overview[\s\S]{0,200}max-w-/,
    );
    /*
     * And the harness reads the same constant rather than a number beside it — the half
     * that measures and the half that states have to be the same claim, or the pass records
     * a disagreement instead of failing on one.
     */
    const pass = withoutProse(read('design/capture-web-real.mjs'));
    expect(pass, 'the wide pass does not measure the prose at all').toMatch(
      /longest > PROSE_CHARACTERS/,
    );
    expect(pass, 'the wide pass no longer photographs the window this is about').toContain(
      '1280',
    );
  });

  it('gives the navigation the same measure as what it navigates', () => {
    /*
     * §6.159, #194. The web at 1280 scrolls exactly as far as at 420 — the width buys
     * nothing, because there is one column at every size. That is a decision now rather
     * than an absence of one, and `WIDE` carries the reasoning: nine of the ten routes are
     * a single sequence, and a sequence in two columns is read in the wrong order.
     *
     * What was genuinely wrong rather than merely undecided: three widths on one screen.
     * The rule spanned the window, the content column was 720, and the tab items sat in
     * `max-w-lg` — about 460 points, measured off `wide-title-the-bear.png`. The navigation
     * was narrower than the thing it navigates, for no reason anybody chose.
     */
    expect(WIDE.columns, 'a second column landed without the reasoning being rewritten').toBe(1);
    expect(WIDE.navMeasure, 'the navigation and the column disagree').toBe(SCREEN.measure);

    const app = withoutProse(read('app/src/App.tsx'));
    expect(app, 'the tab bar picks its own width off Tailwind\'s scale').not.toMatch(
      /<ul[^>]*max-w-/,
    );
    expect(app, 'the tab bar does not read the measure from the table').toMatch(
      /maxWidth: WIDE\.navMeasure/,
    );
    /*
     * And the rule still crosses the whole window, which is the half that is *not* a
     * mistake: `direction.md`'s first named property is a rule that runs to the paper's
     * edge, and a bar fixed to the bottom of the window has the window for paper.
     */
    expect(app, 'the bar stopped spanning the window').toMatch(/<nav[\s\S]{0,600}inset-x-0/);
  });

  it('lets no screen decide a width of its own', () => {
    /*
     * The drift this exists to prevent is the one the edge itself had: fifteen screens each
     * picking a number off Tailwind's default scale, in the one direction nothing
     * photographs side by side.
     *
     * ## The rule, corrected
     *
     * This read `maxWidth:` and failed on *any* of them, which is a check on the property
     * rather than on the defect — and it duly failed a correct change. The synopsis on the
     * title page needs a measure of its own, because `SCREEN.measure` was measured for a row
     * and a paragraph is not one, and `SCREEN.prose` is that measure: a screen reading a
     * number the table decided is the **opposite** of a screen deciding a number.
     *
     * So the rule is what the paragraph above always meant: **no width a screen chose**.
     * Tailwind's own scale is banned outright, since a class is a number typed in the file;
     * an inline `maxWidth` has to name the table. `App.tsx` still holds the column's cap and
     * the argument against fifteen copies of it — this is about the widths a screen may
     * read at all, not a licence to cap the column again.
     */
    const wrong: string[] = [];
    let seen = 0;
    for (const name of routedScreens()) {
      const path = `app/src/screens/${name}.tsx`;
      let source: string;
      try {
        source = withoutProse(read(path));
      } catch {
        continue;
      }
      seen++;
      if (/\bmax-w-(?!full|none)/.test(source)) wrong.push(`${path}: a width off Tailwind's scale`);
      for (const m of source.matchAll(/maxWidth: ([^,}\n]+)/g)) {
        const value = m[1].trim();
        if (!/^(SCREEN|WIDE)\.\w+$/.test(value)) wrong.push(`${path}: maxWidth: ${value}`);
      }
    }
    expect(seen, 'no screens were read, so this proved nothing').toBeGreaterThan(10);
    expect(wrong, 'a screen caps its own width to a number it chose').toEqual([]);
  });

  it('keeps no exemption for a full-screen state that no longer exists', () => {
    for (const [name, why] of Object.entries(FULL_SCREEN)) {
      expect(() => read(`mobile/app/${name}.tsx`), `${name} is gone; drop its exemption`)
        .not.toThrow();
      expect(why.length, `${name}'s exemption gives no reason`).toBeGreaterThan(40);
    }
  });

  it('keeps no exemption for a screen that no longer exists', () => {
    // §6.41. An excuse outlives the thing it excuses unless something checks.
    const live = new Set(routedScreens());
    expect(Object.keys(EDGE_EXEMPT).filter((name) => !live.has(name))).toEqual([]);
    // And every exemption says why, in a sentence rather than a shrug.
    for (const [name, why] of Object.entries(EDGE_EXEMPT)) {
      expect(why.length, `${name}'s exemption gives no reason`).toBeGreaterThan(30);
    }
  });
});

function phoneFiles(dir = 'mobile', out: string[] = []): string[] {
  for (const entry of readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
    if (['node_modules', 'dist', '.expo', 'android', 'ios'].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) phoneFiles(path, out);
    else if (/\.tsx$/.test(entry.name) && !entry.name.includes('.test.')) out.push(path);
  }
  return out;
}

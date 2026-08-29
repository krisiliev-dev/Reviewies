import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { EDGE_EXEMPT, EMPTY_ALIGN, FULL_SCREEN, SCREEN } from '@reviewies/core/ui/screen';
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

  it('is capped in one place, with no screen deciding its own width', () => {
    // The drift this exists to prevent is the one the edge itself had: fifteen screens
    // each picking a number off Tailwind's default scale, in the one direction nothing
    // photographs side by side.
    const deciding = routedScreens()
      .map((name) => `app/src/screens/${name}.tsx`)
      .filter((path) => {
        try {
          return /\bmax-w-(?!full|none)|maxWidth:/.test(withoutProse(read(path)));
        } catch {
          return false;
        }
      });
    expect(deciding, 'a screen caps its own width instead of the shell').toEqual([]);
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

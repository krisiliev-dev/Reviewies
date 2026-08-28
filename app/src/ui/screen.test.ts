import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { EDGE_EXEMPT, SCREEN } from '@reviewies/core/ui/screen';
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

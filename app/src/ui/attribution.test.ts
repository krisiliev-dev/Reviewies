import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  ATTRIBUTION_ORDER,
  ATTRIBUTION_SEPARATION,
  attributionLines,
} from '@reviewies/core/ui/attribution';
import { JUSTWATCH_ATTRIBUTION, TMDB_ATTRIBUTION } from '@reviewies/core/metadata/provider';

/**
 * Small print, which five sites had each decided for themselves.
 *
 * §6.138 filed the phone's Discover line as reading like a list row. Looking for the
 * second site found four more and a hole: two hand-rolled `styles.attribution` objects on
 * the phone, a `Note level="footnote"` with a margin on the web, a bare `<p>` in Settings —
 * and **no TMDB attribution on the web's Discover at all**, where the phone has one. The
 * same screen, the same data, one platform meeting a licence condition. §6.147.
 */

const ROOT = resolve(import.meta.dirname, '../../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');
const withoutProse = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

function filesUnder(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
    if (['node_modules', 'dist', 'dist-signedin', '.expo'].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) filesUnder(path, out);
    else if (/\.tsx$/.test(entry.name) && !entry.name.includes('.test.')) out.push(path);
  }
  return out;
}

const SCREENS = [...filesUnder('app/src'), ...filesUnder('mobile/app'), ...filesUnder('mobile/src')];

/** The pairs that must agree, because they are the same screen on two platforms. */
const PAIRS = [
  ['tmdb', 'app/src/screens/Discover.tsx', 'mobile/app/(tabs)/discover.tsx'],
  ['justwatch', 'app/src/ui/WhereToWatch.tsx', 'mobile/src/ui/WhereToWatch.tsx'],
] as const;

describe('attribution', () => {
  it('is TMDB first, whatever order a caller names them in', () => {
    expect(ATTRIBUTION_ORDER).toEqual(['tmdb', 'justwatch']);
    expect(attributionLines(['justwatch', 'tmdb'], false)).toEqual([
      TMDB_ATTRIBUTION,
      JUSTWATCH_ATTRIBUTION,
    ]);
    expect(attributionLines(['tmdb'], false)).toEqual([TMDB_ATTRIBUTION]);
    expect(attributionLines([], false)).toEqual([]);
  });

  it('sits further from the list than the list sits from itself', () => {
    /*
     * The whole of the #173 fix. The ink and the size are a footnote's already and the
     * inset is the screen's, so the only thing left to say "this is not another row" is
     * the space — and at the twelve points the phone used it was closer to the last row
     * than the rows are to each other on the web, whose list gap is eight.
     */
    expect(ATTRIBUTION_SEPARATION).toBeGreaterThan(12);
    // And the web renderer spends it. Tailwind's scale is quarter-rem: `mt-6` is 24.
    expect(withoutProse(read('app/src/ui/Attribution.tsx'))).toContain(
      `mt-${ATTRIBUTION_SEPARATION / 4}`,
    );
  });

  it('is owed only by a build that used the API', () => {
    /*
     * `provider.ts`: the disclaimer says *"this product uses the TMDB API"*. A build with
     * no token does not, and crediting a source that supplied nothing is a false statement,
     * not a courtesy.
     *
     * The product already held this on two screens: `usingFixtures()` made Settings and
     * More say "Running on sample data" **instead of** the attributions, while Discover and
     * *Where to watch* printed them regardless — so every screenshot in this project's
     * design record credited TMDB and JustWatch for data neither supplied. §6.149.
     *
     * Both branches asserted here, because the suites only ever run the fixtures one: the
     * real branch is `§6.115`'s shape otherwise — code that ships and never executes.
     */
    expect(attributionLines(ATTRIBUTION_ORDER, true)).toEqual([]);
    expect(attributionLines(ATTRIBUTION_ORDER, false)).toHaveLength(2);

    // And the components ask, rather than each screen deciding again.
    for (const [name, file] of [
      ['web', 'app/src/ui/Attribution.tsx'],
      ['phone', 'mobile/src/ui/Attribution.tsx'],
    ] as const) {
      const source = withoutProse(read(file));
      expect(source, `${name}'s Attribution does not ask`).toContain('usingFixtures()');
      expect(source, `${name}'s Attribution draws an empty block`).toContain('length === 0');
    }
  });

  it('is the only thing that spells the licensed words', () => {
    // `provider.ts` holds the words because the licence fixes them; `attribution.ts` holds
    // the order and the drawing. A screen reaching past both is a screen deciding again.
    for (const file of SCREENS) {
      const source = withoutProse(read(file));
      expect(source, `${file} reaches past the rule for the words`).not.toMatch(
        /\b(?:TMDB|JUSTWATCH)_ATTRIBUTION\b/,
      );
      expect(source, `${file} hand-rolls an attribution style`).not.toMatch(
        /attribution:\s*\{/,
      );
    }
  });

  it('appears on both platforms wherever it appears on one', () => {
    /*
     * The clause that would have caught the hole. Nothing compared the two Discovers, and
     * the phone had credited TMDB under its suggestions since the screen shipped while the
     * web never had.
     */
    for (const [source, web, phone] of PAIRS) {
      for (const file of [web, phone]) {
        expect(withoutProse(read(file)), `${file} does not attribute ${source}`).toContain(
          `<Attribution of={['${source}']} />`,
        );
      }
    }
  });
});

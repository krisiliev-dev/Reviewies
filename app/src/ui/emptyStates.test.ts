import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { COPY } from '@reviewies/core/copy';
import { EMPTY_STATES, NOT_AN_EMPTY_STATE } from '@reviewies/core/ui/emptyStates';

/**
 * Every screen that can be empty is in the register, and every entry says who has looked.
 *
 * `reveals.test.ts` is the sibling and the shape is deliberately the same: a register, a
 * clause that the register is honest, and — the half that matters — a clause that sweeps the
 * source for the shape and fails on anything nobody registered. §6.157's lesson was that a
 * register somebody has to remember to add to goes stale the first sprint anybody is busy.
 *
 * The difference from reveals is what a shot means. A revealed state is always reachable:
 * press the control. An empty state may not be — it depends on the *library*, and the design
 * fixture is seeded full on purpose. So `shot: null` is a legitimate answer here and a
 * missing one is not: an entry without a shot must say what stands in the way, which is
 * §6.146 written as a required field.
 */

const ROOT = resolve(import.meta.dirname, '../../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');
const withoutProse = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

/** Where a shot name has to appear to have been taken. */
const CAPTURES = ['design/capture.mjs', 'design/capture-signedin.mjs', 'design/capture-web.mjs'];

/** The sentence a `COPY` path resolves to, or undefined if the path is wrong. */
function sentence(path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], COPY);
}

describe('a screen with nothing on it', () => {
  it('is registered with the words it says and the screens that say them', () => {
    expect(EMPTY_STATES.length, 'the register is empty').toBeGreaterThan(8);
    for (const state of EMPTY_STATES) {
      expect(sentence(state.copy), `${state.copy} is not a path into COPY`).toBeDefined();
      expect(state.says.length, `${state.copy} does not say what it tells somebody`).toBeGreaterThan(20);
      expect(state.screens.length, `${state.copy} names no screen`).toBe(2);
      for (const screen of state.screens) {
        // The screen exists and actually reads that sentence. A register entry pointing at a
        // file that stopped rendering it is the §6.41 failure with the arrow reversed.
        const key = state.copy.split('.').at(-1)!;
        expect(withoutProse(read(screen)), `${screen} does not read ${state.copy}`).toContain(key);
      }
    }
  });

  it('says who has looked at it, or what stands in the way', () => {
    /*
     * The §6.146 clause. "No shot exists" and "no shot is possible" look identical in a
     * directory listing, and this sprint produced two of the second kind by trying: Discover
     * is not empty on an empty library — it falls back to `Popular right now` — and the
     * matching state is over before a navigation can reach it against the fixture provider.
     * Both are real states of the product that nobody has judged, and a blank is not an
     * acceptable way to record that.
     */
    const scripts = CAPTURES.map(read).join('\n');
    const unphotographed: string[] = [];
    for (const state of EMPTY_STATES) {
      if (state.shot) {
        if (!scripts.includes(state.shot)) unphotographed.push(`${state.copy}: no capture script files ${state.shot}`);
      } else if ((state.why ?? '').length < 60) {
        unphotographed.push(`${state.copy}: unphotographed with no reason worth reading`);
      }
    }
    expect(unphotographed).toEqual([]);
    // And that the register is not simply a list of things nobody has done.
    expect(
      EMPTY_STATES.filter((s) => s.shot).length,
      'nothing in the register is photographed at all',
    ).toBeGreaterThan(3);
  });

  it('has no empty state in copy.ts that the register has never heard of', () => {
    /*
     * The half that matters, and the half that found this sprint's defect.
     *
     * A sentence about absence is recognisable in `copy.ts`: its key says so. Sweeping for
     * the key shape rather than for a hand-kept list is what turns the register from a note
     * into a guard — the same argument `reveals.test.ts` makes about `useState(false)`.
     */
    const found: string[] = [];
    for (const [section, group] of Object.entries(COPY)) {
      if (typeof group !== 'object' || group === null) continue;
      for (const key of Object.keys(group)) {
        // `caughtUp` in any case, because §6.164 added `caughtUpWaiting` — an empty state by
        // every definition here — and the pattern as written did not see it. A sweep that
        // misses the key the sprint just added is the sweep going stale in one sprint, which
        // is the thing it exists to prevent.
        if (/^(empty|.*Empty|.*[Cc]aughtUp.*|sealed)/.test(key)) found.push(`${section}.${key}`);
      }
    }
    expect(found.length, 'the sweep found no empty-state copy at all').toBeGreaterThan(6);

    const registered = new Set(EMPTY_STATES.map((s) => s.copy));
    const unknown = found.filter((p) => !registered.has(p) && !(p in NOT_AN_EMPTY_STATE));
    expect(unknown, 'copy.ts has an empty state the register has never heard of').toEqual([]);
  });

  it('has no empty state written into a screen instead of into copy.ts', () => {
    /*
     * §6.98 gave the words one owner, and `copy.test.ts` compares what the two platforms say
     * — so four literals that **agree** are invisible to it. `<PersonList empty="Nobody yet.
     * Search above to find someone." />` was typed into `app/src/screens/People.tsx` and
     * again into `mobile/app/people.tsx`, with `empty="Nobody yet."` twice more beside it,
     * and stayed that way until this sweep. They are `people.followingEmpty` and
     * `people.followersEmpty` now.
     *
     * So: an `empty=` prop must be a reference, never a string. The empty string is allowed —
     * People's Blocked list passes `empty=""` because the section is only rendered when it
     * has something in it, and a sentence there would be about a state that cannot happen.
     */
    const screens = [
      'app/src/screens/People.tsx',
      'mobile/app/people.tsx',
      'app/src/screens/Lists.tsx',
      'mobile/app/lists.tsx',
    ];
    const literals: string[] = [];
    for (const file of screens) {
      for (const [, text] of withoutProse(read(file)).matchAll(/\bempty="([^"]+)"/g)) {
        literals.push(`${file}: empty="${text}"`);
      }
    }
    expect(literals, 'a screen writes its own empty sentence instead of reading one').toEqual([]);
  });

  it('keeps no excuse for a sentence that no longer exists', () => {
    // §6.41, as `reveals.test.ts` and `screen.test.ts` both do for their exemption tables.
    for (const [path, why] of Object.entries(NOT_AN_EMPTY_STATE)) {
      expect(sentence(path), `${path} is excused and no longer exists`).toBeDefined();
      expect(why.length, `${path} is excused without a reason`).toBeGreaterThan(30);
    }
  });
});

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
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

/** Every screen on both platforms, walked rather than listed. §6.157, §6.175. */
const SCREEN_TREES = ['app/src', 'mobile/app', 'mobile/src'];

function screenFiles(dir?: string, out: string[] = []): string[] {
  if (dir === undefined) {
    for (const tree of SCREEN_TREES) screenFiles(tree, out);
    return out;
  }
  for (const entry of readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
    if (['node_modules', 'dist', 'dist-real', '.expo'].includes(entry.name)) continue;
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) screenFiles(path, out);
    else if (/\.tsx$/.test(entry.name) && !entry.name.includes('.test.')) out.push(path);
  }
  return out;
}

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
     *
     * The file list used to be four paths typed out here, and §6.175 found what that costs.
     * The sealed-comments gate was two literals in a fifth file and a sixth, and this clause
     * — whose name says *no empty state written into a screen* — could not have seen them
     * however hard it looked. That is the §6.157 hole this file's own header describes,
     * inside this file. It is a walk now, so a screen added tomorrow is swept tomorrow.
     *
     * Its sibling in `wiring/copy.test.ts` is the one that catches a sentence written as
     * element text rather than as a prop; between them the prop shape and the prose shape
     * are both covered, and neither is a list somebody has to remember to add to.
     */
    const literals: string[] = [];
    for (const file of screenFiles()) {
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

  /**
   * Discover's blurb describes the shelf, so it is drawn only where there is a shelf.
   *
   * `NOT_AN_EMPTY_STATE` excuses `discover.blurb` in its own words — *"a description of what
   * Discover excludes, drawn above a **full** screen too"* — and that excuse is the whole
   * reason it is not in the register. `00-discover-empty.png` is what it looked like when
   * the renderers did not keep it. Two sentences, in the same treatment, one under the
   * other, on a screen with nothing on it:
   *
   *     Nothing you have already watched or added.
   *     Nothing new to suggest yet. Track a few things and come back.
   *
   * The first is not an empty state, and on that screen it reads as one — a claim about the
   * contents of a shelf that is not there, in front of the sentence that is actually the
   * screen's message. The same `Note` is drawn over *Loading…* for the same reason, which is
   * a claim about a feed that has not arrived. §6.57's distinction, one altitude down: "here
   * is what this list leaves out" and "there is no list" are different sentences and only one
   * of them was asked for.
   *
   * Read by proximity rather than by parsing JSX: the condition has to be within the two
   * hundred characters before the sentence, which is the enclosing expression on both
   * platforms and is stated here so nobody reads it as more than it is.
   */
  it('draws Discover’s blurb only where there is a shelf for it to describe', () => {
    const SHELF = /shownShelf\.length/;
    const missing: string[] = [];
    for (const screen of [
      'app/src/screens/Discover.tsx',
      'mobile/app/(tabs)/discover.tsx',
    ]) {
      const source = withoutProse(read(screen));
      let found = 0;
      for (const m of source.matchAll(/COPY\.discover\.(?:trendingB|b)lurb/g)) {
        found += 1;
        if (!SHELF.test(source.slice(Math.max(0, m.index - 200), m.index))) {
          missing.push(`${screen}: ${source.slice(Math.max(0, m.index - 60), m.index + 30).replace(/\s+/g, ' ').trim()}`);
        }
      }
      // §6.121: every clause here passes against a file that stopped drawing the blurb.
      expect(found, `${screen} no longer draws the blurb at all`).toBeGreaterThan(0);
    }
    expect(
      missing,
      'the blurb is drawn without asking whether the shelf has anything on it — and over an ' +
        'empty one it reads as a second empty state, which is what NOT_AN_EMPTY_STATE excuses ' +
        'it from being',
    ).toEqual([]);
  });
});

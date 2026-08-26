import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PAIRS, ROOT } from './pairs';
import { stripComments } from '@reviewies/core/test/source';

const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

/**
 * What each screen opens on.
 *
 * The fourth axis, and the one the first three could not see. §6.50 compared what a
 * screen offers, §6.51 its words, §6.52 the numbers it passes into the core — and Stats
 * still opened on this year in one app and the last thirty days in the other, because a
 * default window is a string sitting in a `useState` call, which is none of those things.
 * §6.54 found it by accident, through a screen that looked like it had lost somebody's
 * history.
 *
 * A default is a decision. Which period is selected, which filter is on, what starts
 * expanded, how much of the crowd you see before you touch anything — each is an answer
 * to a question about the product, and two platforms answering it differently means
 * nobody answered it.
 *
 * Compared by the name of the state, which is what makes this cheap and also what bounds
 * it: a value only one platform holds is ignored, because a screen legitimately has state
 * the other does not. What it catches is the same named thing opening differently.
 */

/** Defaults that are genuinely one platform's own, one line each saying why. */
const EXEMPT: Record<string, string> = {};

/** One copy, in the core, since §6.72. */
const strip = stripComments;

/** `const [thing, setThing] = useState<T>(initial)` → `thing` → the initial value. */
export function initialState(source: string): Map<string, string> {
  const found = new Map<string, string>();
  const pattern =
    /const\s*\[\s*([A-Za-z_$][\w$]*)\s*,\s*set[\w$]*\s*\]\s*=\s*useState\s*(?:<[^>]*>)?\s*\(([^;]*?)\)\s*;/g;
  for (const match of strip(source).matchAll(pattern)) {
    const value = match[2].replace(/\s+/g, ' ').trim();
    found.set(match[1], value === '' ? '(undefined)' : value);
  }
  return found;
}

function divergences(route: string): string[] {
  const { web, phone } = PAIRS[route];
  const webState = initialState(read(`app/src/screens/${web}`));
  const phoneState = new Map<string, string>();
  for (const file of phone) {
    for (const [name, value] of initialState(read(`mobile/app/${file}`))) phoneState.set(name, value);
  }

  const out: string[] = [];
  for (const [name, value] of webState) {
    const other = phoneState.get(name);
    if (other === undefined || other === value) continue;
    out.push(`${route} ${name}: web ${value} · phone ${other}`);
  }
  return out;
}

describe('what each screen opens on', () => {
  it('opens on the same thing on both platforms', () => {
    const unexplained = Object.keys(PAIRS)
      .flatMap(divergences)
      .filter((d) => !EXEMPT[d]);
    // Read the failure as: this screen starts in one state here and another there, and
    // nobody decided which. Move the default into the core beside what it configures —
    // `DEFAULT_STATS_WINDOW`, `DEFAULT_REACTION_DENSITY` are the pattern — or say in
    // EXEMPT above why one platform should open differently.
    expect(unexplained).toEqual([]);
  });

  it('keeps no exemption that no longer describes a difference', () => {
    const live = new Set(Object.keys(PAIRS).flatMap(divergences));
    expect(Object.keys(EXEMPT).filter((key) => !live.has(key))).toEqual([]);
  });

  it('reads the state rather than comparing two empty maps', () => {
    // Non-vacuity: every assertion above passes if the reader finds nothing, which is
    // what a change in how these screens declare state would cause, silently.
    const watching = initialState(read('app/src/screens/WatchingMode.tsx'));
    expect(watching.get('density')).toBe('DEFAULT_REACTION_DENSITY');
    expect(initialState(read('mobile/app/watching/[targetId].tsx')).get('density')).toBe(
      'DEFAULT_REACTION_DENSITY',
    );
    expect(initialState(read('app/src/screens/Stats.tsx')).get('window')).toBe(
      'DEFAULT_STATS_WINDOW',
    );

    // And that it is reading a useful number of them overall, not one lucky match.
    const total = Object.values(PAIRS).reduce(
      (sum, pair) => sum + initialState(read(`app/src/screens/${pair.web}`)).size,
      0,
    );
    expect(total).toBeGreaterThan(20);
  });
});

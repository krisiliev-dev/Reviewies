import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stripComments } from '@reviewies/core/test/source';
import { PAIRS, ROOT } from './pairs';
import { SCREEN_STATES } from './screenStates';

/**
 * Whether a `never` is true, which nothing asked.
 *
 * `screenStates.ts` files each state of each screen as `suite`, `unit` or `never`, and its
 * header is careful about what the last one means: *"nothing has ever produced it, and here
 * is why"*. `screenStates.test.ts` holds the list against the routes that exist and requires
 * every `never` to carry a `why`. **It does not read the `why`.** A reason is a string, and
 * a string that is wrong is indistinguishable from one that is right.
 *
 * Two were wrong, identically, for the life of the file: `loading` on `/watchlist` and on
 * `/stats`, both `never` because *"Dexie resolves before the first paint locally"*.
 * `useLiveQuery(fn, deps)` with no initial value returns `undefined` on the first render and
 * resolves in a microtask afterwards — it cannot beat the paint — and both screens carry an
 * explicit branch rendering `COPY.waiting.loading` for exactly that. §6.191 measured nine of
 * 24 web interactions painting it, 16–66ms each. The reason was not merely unverified; it was
 * contradicted by the file it was about, four lines from the query it described.
 *
 * ## What this can and cannot check
 *
 * Not "is this prose true" — that is not a question a suite can ask. What it can ask is
 * narrower and is the half that failed: **a state the renderer has an explicit branch for is
 * not a state nothing has ever produced.**
 *
 * Scoped to `loading` deliberately. Most `never`s in that file are `NO_ACCOUNT`, and their
 * reachability is a property of the *environment* — the branch exists, the data cannot be
 * made here, and the reason is true. `loading` is the opposite: nothing outside the renderer
 * decides it, so the renderer settles it alone. Widening this clause to every `never` would
 * make it fail on the entries it has no business judging, which is §6.190's other lesson.
 */

const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

/** How both platforms draw the state. One owner since §6.98, so one needle finds it. */
const DRAWS_LOADING = /COPY\.waiting\.loading/;

/** The files that are a route, from the one list every cross-platform guard reads. */
const filesFor = (route: string): string[] => {
  const pair = PAIRS[route];
  if (!pair) return [];
  return [`app/src/screens/${pair.web}`, ...pair.phone.map((f) => `mobile/app/${f}`)];
};

describe('a state filed as never', () => {
  it('reads a list with entries in it', () => {
    expect(SCREEN_STATES.length).toBeGreaterThan(10);
    expect(SCREEN_STATES.flatMap((s) => s.states).length).toBeGreaterThan(100);
  });

  it('is not one the screen has a branch for', () => {
    const wrong: string[] = [];
    for (const screen of SCREEN_STATES) {
      for (const state of screen.states) {
        if (state.verdict !== 'never' || state.name !== 'loading') continue;
        for (const file of filesFor(screen.route)) {
          if (DRAWS_LOADING.test(stripComments(read(file)))) {
            wrong.push(
              `${screen.platform} ${screen.route} — "loading" is filed never (${state.why}), ` +
                `and ${file} draws COPY.waiting.loading`,
            );
          }
        }
      }
    }
    expect(wrong, 'a never whose screen renders it').toEqual([]);
  });

  /*
   * And the mirror, so the clause cannot pass by the list quietly emptying. `/watchlist` and
   * `/stats` are the two entries §6.191 corrected; both must still be filed, and filed as
   * something other than `never`, or this file is describing a screen that has moved.
   *
   * **`unit` and no longer `suite`, and the change is the screens' rather than the list's.**
   * §6.191 filed them `suite` because a browser rendered the word on every run, which was
   * true and was the defect: `design/between.mjs` measured those renders at 13–44ms, too
   * brief to be read, and `core/src/ui/waiting.ts` now makes every loading branch wait
   * 200ms before it speaks. No end-to-end walk takes that long to read a local table, so
   * nothing in a browser paints it any more and `unit` is what is left — a test renders it,
   * by holding the clock, and `app/src/ui/waiting.test.tsx` is that test.
   *
   * Asserted as an exact pair rather than as "not never", because the interesting failure
   * is the quiet one in the other direction: a screen that goes back to painting the word
   * immediately would make `suite` true again, and a clause that accepted anything except
   * `never` would sit there agreeing with it.
   */
  it('still has the two entries it was written about, now as unit', () => {
    const found = SCREEN_STATES.filter(
      (s) => ['/watchlist', '/stats'].includes(s.route) && s.platform === 'web',
    ).flatMap((s) => s.states.filter((st) => st.name === 'loading').map((st) => st.verdict));
    expect(found.sort()).toEqual(['unit', 'unit']);
  });
});

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { COPY } from '@reviewies/core/copy';

/**
 * A screen with two modes says which one it is in, once, at the top.
 *
 * Discover has two and only ever one at a time: `getSuggestions` builds a feed out of your
 * library and, **only if that comes back empty**, falls back to a trending chart —
 * `if (merged.length > 0) return merged`. So every row is a recommendation or every row is
 * a chart entry, never a mixture.
 *
 * Until §6.169 the screen said `blurb` for both. That sentence — *"Nothing you have already
 * watched or added"* — is true of a chart as well, so nothing on the screen told a person
 * which feed they were reading. And the *rows* carried the difference instead:
 * `narrow-discover-foot.png` shows thirty of them, each with **Popular right now** under its
 * title, in the slot `copy.ts` calls "the line that separates a recommendation from an
 * advert". A sentence repeated on every row it appears on is not what tells them apart.
 *
 * So the mode moved to the top and the rows lost the repetition. §6.104's rule one subject
 * over: "nothing" and "I could not look" are different sentences, and so are "things like
 * what you watch" and "things people are watching".
 *
 * Two halves, and the second is the one that would rot: a screen can quietly go back to
 * putting the mode on the row.
 */

const ROOT = resolve(import.meta.dirname, '../../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');
const withoutProse = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

const DISCOVER = ['app/src/screens/Discover.tsx', 'mobile/app/(tabs)/discover.tsx'];

describe('the two feeds Discover can be showing', () => {
  it('has a different sentence for each, and neither is the other', () => {
    // Non-vacuity, and the thing the defect actually was: one string for two states.
    expect(COPY.discover.trendingBlurb).not.toBe(COPY.discover.blurb);
    expect(COPY.discover.trendingBlurb.length).toBeGreaterThan(20);
  });

  it('picks between them on both platforms, from the feed rather than from a flag', () => {
    for (const file of DISCOVER) {
      const source = withoutProse(read(file));
      expect(source, `${file} says the same thing for both feeds`).toContain(
        'COPY.discover.trendingBlurb',
      );
      // Read off the suggestions themselves. A separate piece of state saying which mode
      // the screen is in is a second answer to a question the feed already answers, and
      // §6.138 is the entry about what happens when two things answer one question.
      expect(source, `${file} decides its mode from something other than the feed`).toMatch(
        /\?\.\[0\]\?\.trending/,
      );
    }
  });

  it('puts nothing on a trending row where the reason goes', () => {
    /*
     * The half that rots. `COPY.discover.trending` still exists — `offers.test.ts` and the
     * suggestion type both know about the flag — and the easy regression is a screen
     * passing it back into `note`, which is where it was.
     */
    const wrong: string[] = [];
    for (const file of DISCOVER) {
      const source = withoutProse(read(file));
      if (/note=\{[^}]*COPY\.discover\.trending\b/.test(source)) {
        wrong.push(`${file} puts the screen's mode back on every row`);
      }
      if (!/trending \? undefined :/.test(source)) {
        wrong.push(`${file} does not leave a trending row's reason empty`);
      }
    }
    expect(wrong).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { BOX, BOX_COLUMNS, boxFacts, boxUnder } from './box.ts';
import { ratio } from '../tokens.ts';
import { COPY } from '../copy.ts';

describe('the browse box', () => {
  it('takes its shape from the ratio rather than from a second number', () => {
    /*
     * `poster.ts` records what happened the one time this repository wrote a poster's two
     * dimensions by hand: 44 x 64 beside a row 66 tall, so every listing row in the app
     * carried two points of dead ground under its artwork. One ratio, read.
     */
    expect(BOX.ratio).toBe(ratio.poster);
  });

  it('is a box on a phone rather than a thumbnail', () => {
    // The finding is "as if a person is in a CD shop looking at the CD boxes". Three across
    // a 390pt frame is 110pt, which is what Discover already had and what it is not.
    expect(BOX_COLUMNS.phone).toBe(2);
    expect(BOX_COLUMNS.wide).toBeGreaterThan(BOX_COLUMNS.phone);
  });

  describe('the line under the title', () => {
    it('is genre then year', () => {
      expect(boxUnder({ genres: ['Drama'], year: 2021 })).toBe('Drama · 2021');
    });

    it('takes the first genre only', () => {
      // The second is almost always a widening of the first and the line wraps for nothing.
      expect(boxUnder({ genres: ['Crime', 'Drama'], year: 2024 })).toBe('Crime · 2024');
    });

    it('leaves no separator where a half is missing', () => {
      /*
       * An imported title has no genres until it is matched, and " · 2019" reads as a line
       * that failed to fill rather than a line with one fact on it.
       */
      expect(boxUnder({ year: 2019 })).toBe('2019');
      expect(boxUnder({ genres: ['Comedy'] })).toBe('Comedy');
      expect(boxUnder({})).toBe('');
    });
  });

  describe('the fact line on the back', () => {
    it('says what it is, always', () => {
      expect(boxFacts({ kind: 'show' })).toBe(COPY.kinds.show);
      expect(boxFacts({ kind: 'film' })).toBe(COPY.kinds.film);
    });

    it('counts seasons for a series and never for a film', () => {
      expect(boxFacts({ kind: 'show', seasonCount: 3 })).toBe(`${COPY.kinds.show} · 3 seasons`);
      expect(boxFacts({ kind: 'show', seasonCount: 1 })).toBe(`${COPY.kinds.show} · 1 season`);
      // A film with a `seasonCount` is a cache that has confused itself; the line must not
      // repeat the confusion back.
      expect(boxFacts({ kind: 'film', seasonCount: 3 })).toBe(COPY.kinds.film);
    });

    it('says the runtime when the cache happens to have one', () => {
      expect(boxFacts({ kind: 'film', runtimeMin: 118 })).toBe(`${COPY.kinds.film} · 118 min`);
      expect(boxFacts({ kind: 'show', seasonCount: 2, runtimeMin: 47 })).toBe(
        `${COPY.kinds.show} · 2 seasons · 47 min`,
      );
    });

    it('says less rather than nothing when the numbers are not cached', () => {
      // `architecture.md`'s second refusal from the other side: a list endpoint carries
      // neither number, which is why they are not filters — and why this must degrade.
      expect(boxFacts({ kind: 'show' })).toBe(COPY.kinds.show);
    });
  });
});

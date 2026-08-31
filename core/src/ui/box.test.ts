import { describe, expect, it } from 'vitest';
import { BOX, BOX_COLUMNS, backLines, boxFacts, boxUnder } from './box.ts';
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

  describe('how much synopsis the back has room for', () => {
    /*
     * The clamp that was `BOX.backLines: 6`, and the three grounds one number had to serve.
     * The readings are `design/capture-real.mjs`'s and `design/capture-web-real.mjs`'s, off
     * a real TMDB snapshot: a 173-point phone box leaves the paragraph 76 points, a 188
     * box at a 420 window leaves 143, and a 221 box at 1280 leaves 193. `NOTE.footnote`
     * draws at a 17-point line box.
     */
    it('is a different number at every width the box is drawn at', () => {
      expect(backLines(76, 17)).toBe(4);
      expect(backLines(143, 17)).toBe(8);
      expect(backLines(193, 17)).toBe(11);
      /*
       * The whole of the finding in one clause: six lines was too many on the phone — it
       * overran the row by 26 points — and too few at both web widths, where it left 40 and
       * 90 points of the panel empty *while truncating*. There is no constant that is right
       * at 76 and at 193, which is why this is a function.
       */
      expect(backLines(76, 17)).toBeLessThan(6);
      expect(backLines(193, 17)).toBeGreaterThan(6);
    });

    it('never asks for a line the ground cannot hold', () => {
      // Exactly a whole number of lines, and one point short of the next.
      expect(backLines(17 * 5, 17)).toBe(5);
      expect(backLines(17 * 5 - 1, 17)).toBe(4);
    });

    it('draws a sentence rather than nothing before its first layout', () => {
      // `onLayout` and `ResizeObserver` both report zero once, and a zero-line paragraph is
      // a box that looks broken for a frame.
      expect(backLines(0, 17)).toBe(1);
      expect(backLines(4, 17)).toBe(1);
    });

    it('answers the reader who has turned the type up', () => {
      /*
       * The line box is the caller's because the two platforms scale it differently — the
       * web's type is in pixels and holds still, React Native multiplies a stored leading by
       * the font scale. The same ground therefore holds fewer lines at 200%, and that is the
       * correct answer rather than a defect: `phoneTextScaling.test.ts` asks for the layout
       * to reflow rather than the type to be capped.
       */
      expect(backLines(143, 34)).toBe(4);
      expect(backLines(143, 34)).toBeLessThan(backLines(143, 17));
    });
  });

  describe('the fact line on the back', () => {
    it('says what it is, always', () => {
      expect(boxFacts({ kind: 'show' })).toBe(COPY.kinds.show);
      expect(boxFacts({ kind: 'film' })).toBe(COPY.kinds.film);
    });

    it('keeps the year the front had, because turning a box over is not losing a fact', () => {
      /*
       * The back said `Series` where the front said `Drama · 2001`: two facts on the face,
       * one on the back, and the one it dropped is the one the synopsis underneath cannot
       * supply. Genre it may drop — the paragraph says what sort of thing this is at length
       * — and `box.ts` argues that half.
       *
       * Every clause in this block before this one passed an object with no `year` in it, so
       * the whole of the loss was invisible to them. That is what the fixture provider did
       * to this file as well as to the screen.
       */
      expect(boxFacts({ kind: 'show', year: 2001 })).toBe(`${COPY.kinds.show} · 2001`);
      expect(boxFacts({ kind: 'film', year: 2022 })).toBe(`${COPY.kinds.film} · 2022`);
      // The pair the front and the search row print, in that order, before the counts.
      expect(boxFacts({ kind: 'show', year: 2001, seasonCount: 3 })).toBe(
        `${COPY.kinds.show} · 2001 · 3 seasons`,
      );
      // And nothing where the half is missing, which is `boxUnder`'s rule one line over.
      expect(boxFacts({ kind: 'show' })).not.toContain('·');
    });

    it('is what a search row prints, rather than a fifth copy of it', () => {
      /*
       * `app/src/screens/Discover.tsx` and `mobile/app/(tabs)/discover.tsx` each composed
       * `kind` and `year` into a `meta` prop by hand, identically — one line, two platforms,
       * punctuated twice. A search result carries neither `seasonCount` nor `runtimeMin`
       * (`architecture.md`'s second refusal), so the string those two call sites wrote *is*
       * this function's output on that shape, and the clause says so rather than trusting it.
       */
      const result = { kind: 'show', year: 2005 } as const;
      expect(boxFacts(result)).toBe(`${COPY.kinds.show} · 2005`);
      expect(boxFacts({ kind: 'film', year: 1999 })).toBe(`${COPY.kinds.film} · 1999`);
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

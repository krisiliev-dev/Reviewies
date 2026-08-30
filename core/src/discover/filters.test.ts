import { describe, expect, it } from 'vitest';
import {
  applyFilters,
  filtering,
  genresOf,
  keeps,
  NO_FILTERS,
  WELL_RATED,
  type Filters,
} from './filters.ts';
import type { SearchResult } from '../metadata/provider.ts';

const row = (over: Partial<SearchResult> = {}): SearchResult => ({
  id: 'tmdb:tv:1',
  kind: 'show',
  name: 'The Long Dark',
  genres: ['Drama'],
  rating: 8.2,
  ...over,
});

const with_ = (over: Partial<Filters>): Filters => ({ ...NO_FILTERS, ...over });

describe('what Discover can be narrowed by', () => {
  it('keeps everything when nothing is chosen', () => {
    const shelf = [row(), row({ id: 'a', kind: 'film', genres: ['Comedy'], rating: 2 })];
    expect(applyFilters(NO_FILTERS, shelf)).toEqual(shelf);
    expect(filtering(NO_FILTERS)).toBe(false);
  });

  it('says it is narrowing as soon as any one of the three is set', () => {
    // All three, separately: a `filtering` that only noticed the first would leave the
    // closed row claiming nothing was on while two of the three were.
    expect(filtering(with_({ kind: 'film' }))).toBe(true);
    expect(filtering(with_({ genre: 'Drama' }))).toBe(true);
    expect(filtering(with_({ standing: 'well-rated' }))).toBe(true);
  });

  it('narrows by kind', () => {
    expect(keeps(with_({ kind: 'show' }), row({ kind: 'show' }))).toBe(true);
    expect(keeps(with_({ kind: 'show' }), row({ kind: 'film' }))).toBe(false);
  });

  it('narrows by genre, and a title can carry more than one', () => {
    const many = row({ genres: ['Crime', 'Drama'] });
    expect(keeps(with_({ genre: 'Crime' }), many)).toBe(true);
    expect(keeps(with_({ genre: 'Drama' }), many)).toBe(true);
    expect(keeps(with_({ genre: 'Comedy' }), many)).toBe(false);
  });

  it('drops a title with no genres rather than quietly keeping it', () => {
    /*
     * The deliberate half, and `filters.ts` says why: an unmatched import has no genres,
     * and keeping it under "Comedy" would be the app inventing a fact about somebody's
     * library. It survives `any` and nothing else.
     */
    const unmatched = row({ genres: undefined });
    expect(keeps(NO_FILTERS, unmatched)).toBe(true);
    expect(keeps(with_({ genre: 'Drama' }), unmatched)).toBe(false);
  });

  it('narrows by standing, on the line and either side of it', () => {
    const well = with_({ standing: 'well-rated' });
    expect(keeps(well, row({ rating: WELL_RATED }))).toBe(true);
    expect(keeps(well, row({ rating: WELL_RATED + 0.1 }))).toBe(true);
    expect(keeps(well, row({ rating: WELL_RATED - 0.1 }))).toBe(false);
  });

  it('drops a title with no score from the well-rated shelf', () => {
    // Not `>= undefined`, which is `false` by luck rather than by decision, and not
    // treated as 0 either — "nobody has voted" is not "the crowd disliked it".
    expect(keeps(with_({ standing: 'well-rated' }), row({ rating: undefined }))).toBe(false);
    expect(keeps(NO_FILTERS, row({ rating: undefined }))).toBe(true);
  });

  it('applies all three at once', () => {
    const shelf = [
      row({ id: 'a', kind: 'show', genres: ['Drama'], rating: 9 }),
      row({ id: 'b', kind: 'film', genres: ['Drama'], rating: 9 }),
      row({ id: 'c', kind: 'show', genres: ['Comedy'], rating: 9 }),
      row({ id: 'd', kind: 'show', genres: ['Drama'], rating: 3 }),
    ];
    const kept = applyFilters(with_({ kind: 'show', genre: 'Drama', standing: 'well-rated' }), shelf);
    expect(kept.map((r) => r.id)).toEqual(['a']);
  });

  it('offers only genres something on the shelf actually carries', () => {
    const shelf = [row({ genres: ['Drama'] }), row({ id: 'b', genres: ['Crime', 'Drama'] })];
    expect(genresOf(shelf)).toEqual(['Crime', 'Drama']);
  });

  it('offers the genres in a fixed order rather than by how common they are', () => {
    /*
     * Frequency order means the chips move between one shelf and the next, and a control
     * whose options reorder under you is one that has to be read every time — §6.140's
     * argument for a fixed tab order, one control down. `Drama` is twice as common here
     * and still comes second.
     */
    const shelf = [row({ genres: ['Drama'] }), row({ id: 'b', genres: ['Drama', 'Comedy'] })];
    expect(genresOf(shelf)).toEqual(['Comedy', 'Drama']);
  });

  it('offers nothing when nothing on the shelf says what it is', () => {
    expect(genresOf([row({ genres: undefined })])).toEqual([]);
  });
});

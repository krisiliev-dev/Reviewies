import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { excludedTitleIds, getSuggestions, mergeSuggestions, seedTitles } from './recommend';
import type { SearchResult } from '../metadata/provider';

const res = (id: string, name = id): SearchResult => ({ id, kind: 'show', name });

beforeEach(async () => {
  await Promise.all([
    db.library.clear(),
    db.watches.clear(),
    db.watchlist.clear(),
    db.titles.clear(),
  ]);
});

describe('exclusion — the whole point of this module', () => {
  it('excludes tracked shows', async () => {
    await db.library.add({ titleId: 'tmdb:tv:1', kind: 'show', status: 'watching', addedAt: 1 });
    expect(await excludedTitleIds()).toContain('tmdb:tv:1');
  });

  it('excludes watched series via their parent', async () => {
    await db.watches.add({
      id: 'w1',
      targetId: 'tmdb:ep:9',
      seriesId: 'tmdb:tv:2',
      watchedAt: 1,
      source: 'manual',
    });
    expect(await excludedTitleIds()).toContain('tmdb:tv:2');
  });

  it('excludes watched films, which have no parent series', async () => {
    await db.watches.add({ id: 'w2', targetId: 'tmdb:movie:4', watchedAt: 1, source: 'manual' });
    expect(await excludedTitleIds()).toContain('tmdb:movie:4');
  });

  it('excludes anything already on the watchlist', async () => {
    // Already decided about; suggesting it again is noise.
    await db.watchlist.add({ titleId: 'tmdb:tv:7', kind: 'show', addedAt: 1 });
    expect(await excludedTitleIds()).toContain('tmdb:tv:7');
  });

  it('never suggests an excluded title', () => {
    const merged = mergeSuggestions(
      [{ seedName: 'seed', results: [res('a'), res('b'), res('c')] }],
      new Set(['b']),
    );
    expect(merged.map((s) => s.id)).toEqual(['a', 'c']);
  });
});

describe('ranking', () => {
  it('ranks a title recommended by several shows above one recommended by one', () => {
    const merged = mergeSuggestions(
      [
        { seedName: 'Show A', results: [res('solo'), res('shared')] },
        { seedName: 'Show B', results: [res('shared')] },
      ],
      new Set(),
    );
    expect(merged[0].id).toBe('shared');
    expect(merged[0].because).toEqual(['Show A', 'Show B']);
  });

  it('weights the top of a list above its tail', () => {
    const merged = mergeSuggestions(
      [{ seedName: 'Show A', results: [res('first'), res('second'), res('third')] }],
      new Set(),
    );
    expect(merged.map((s) => s.id)).toEqual(['first', 'second', 'third']);
  });

  it('does not list the same seed twice in "because"', () => {
    const merged = mergeSuggestions(
      [{ seedName: 'Show A', results: [res('x'), res('x')] }],
      new Set(),
    );
    expect(merged[0].because).toEqual(['Show A']);
  });

  it('respects the limit', () => {
    const many = Array.from({ length: 50 }, (_, i) => res(`t${i}`));
    expect(mergeSuggestions([{ seedName: 's', results: many }], new Set(), 10)).toHaveLength(10);
  });

  it('returns nothing when everything is excluded', () => {
    const merged = mergeSuggestions(
      [{ seedName: 's', results: [res('a'), res('b')] }],
      new Set(['a', 'b']),
    );
    expect(merged).toEqual([]);
  });
});

describe('seeding', () => {
  it('seeds from what you have given the most time to, not the most episodes', async () => {
    await db.titles.bulkPut([
      { id: 'tmdb:tv:drama', kind: 'show', name: 'Drama', fetchedAt: 1 },
      { id: 'tmdb:tv:comedy', kind: 'show', name: 'Comedy', fetchedAt: 1 },
    ]);
    await db.watches.bulkAdd([
      // Ten short episodes versus three long ones: time wins.
      ...Array.from({ length: 10 }, (_, i) => ({
        id: `c${i}`,
        targetId: `tmdb:ep:c${i}`,
        seriesId: 'tmdb:tv:comedy',
        watchedAt: 1,
        runtimeMin: 20,
        source: 'manual' as const,
      })),
      ...Array.from({ length: 3 }, (_, i) => ({
        id: `d${i}`,
        targetId: `tmdb:ep:d${i}`,
        seriesId: 'tmdb:tv:drama',
        watchedAt: 1,
        runtimeMin: 90,
        source: 'manual' as const,
      })),
    ]);

    const seeds = await seedTitles();
    expect(seeds[0].name).toBe('Drama');
  });

  it('returns nothing to seed from an empty library', async () => {
    expect(await seedTitles()).toEqual([]);
  });
});

describe('feed', () => {
  it('falls back to trending for a new user rather than showing nothing', async () => {
    // No watches at all, so there is nothing to recommend from.
    const suggestions = await getSuggestions();
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].because).toEqual(['Trending now']);
  });

  it('still filters the trending fallback against what you have added', async () => {
    await db.library.add({ titleId: 'tmdb:tv:1', kind: 'show', status: 'watching', addedAt: 1 });
    const suggestions = await getSuggestions();
    expect(suggestions.map((s) => s.id)).not.toContain('tmdb:tv:1');
  });
});

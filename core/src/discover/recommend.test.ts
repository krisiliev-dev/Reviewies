import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { db } from '../data/db.ts';
import {
  excludedNames,
  excludedTitleIds,
  getSuggestions,
  mergeSuggestions,
  seedTitles,
} from './recommend.ts';
import type { SearchResult } from '../metadata/provider.ts';

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

  /*
   * The case the ID-based exclusion above cannot see, and the one an actual person hits.
   *
   * A TV Time export carries names and no provider IDs, so an import lands as
   * `local:tv:tvtime-100`. Matching rewrites that on the next visit to Up Next — but a
   * show whose match was ambiguous becomes an *ask*, and an ask nobody answers keeps its
   * local ID for as long as it goes unanswered.
   *
   * Measured in a real browser before any of this was written: import the demo library,
   * go to Discover without returning to Up Next, and it offers all three imported shows
   * back, each captioned "Because you watched" the show it is suggesting. The seeds
   * resolve through `db.titles` by *name* and the exclusion compares *IDs*, so the two
   * halves of one feature disagreed about what identifies a show — and the half that was
   * right made the failure louder.
   */
  it('excludes an imported show that has not been matched yet, by its name', async () => {
    await db.titles.add({
      id: 'local:tv:tvtime-100',
      kind: 'show',
      name: 'Hollow Crown Saga',
      fetchedAt: 1,
    });
    await db.library.add({
      titleId: 'local:tv:tvtime-100',
      kind: 'show',
      status: 'watching',
      addedAt: 1,
    });

    // The ID half cannot help: the provider's copy of this show has a different ID.
    expect(await excludedTitleIds()).not.toContain('tmdb:tv:3');
    expect(await excludedNames()).toContain('hollow crown saga');

    const merged = mergeSuggestions(
      [{ seedName: 'Hollow Crown Saga', results: [res('tmdb:tv:3', 'Hollow Crown Saga'), res('tmdb:tv:9', 'Quiet Harbour')] }],
      await excludedTitleIds(),
      30,
      await excludedNames(),
    );
    expect(merged.map((s) => s.name)).toEqual(['Quiet Harbour']);
  });

  it('matches the name whatever its case and spacing', async () => {
    await db.titles.add({
      id: 'local:tv:tvtime-101',
      kind: 'show',
      name: '  The Long Dark ',
      fetchedAt: 1,
    });
    await db.watches.add({
      id: 'w9',
      targetId: 'local:ep:1',
      seriesId: 'local:tv:tvtime-101',
      watchedAt: 1,
      source: 'import',
    });
    expect(await excludedNames()).toContain('the long dark');
    const merged = mergeSuggestions(
      [{ seedName: 'x', results: [res('tmdb:tv:1', 'THE LONG DARK')] }],
      new Set(),
      30,
      await excludedNames(),
    );
    expect(merged).toEqual([]);
  });

  it('does not exclude by name once a row has a real ID', async () => {
    /*
     * The narrowness is the point, and it is what stops this becoming a name-matcher.
     * Two different shows share a name often enough — remakes, translations, a film and
     * the series of it — and deciding they are the same show is exactly what the
     * ask-flow exists to avoid doing to somebody's history. A matched row has an ID that
     * answers the question properly, so the name is not consulted for it at all.
     */
    await db.titles.add({ id: 'tmdb:tv:5', kind: 'show', name: 'Shared Name', fetchedAt: 1 });
    await db.library.add({ titleId: 'tmdb:tv:5', kind: 'show', status: 'watching', addedAt: 1 });
    expect(await excludedNames()).toEqual(new Set());

    const merged = mergeSuggestions(
      [{ seedName: 'x', results: [res('tmdb:movie:6', 'Shared Name')] }],
      await excludedTitleIds(),
      30,
      await excludedNames(),
    );
    expect(merged.map((s) => s.id)).toEqual(['tmdb:movie:6']);
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

  /*
   * §6.170. `seedTitles` read `db.watches` alone while `excludedTitleIds` reads library,
   * watchlist *and* watches — so Discover excluded everything you tracked and learned from
   * none of it. Somebody who tracks five shows and has not pressed the ring yet got the
   * trending chart, which is the first evening of using this app.
   *
   * Found by asking why every real-data screenshot of Discover was the fallback:
   * `design/realLibrary.mjs` tracks six titles and marks nothing watched.
   */
  it('seeds from a show you track but have not started', async () => {
    await db.library.add({ titleId: 'tmdb:tv:9', kind: 'show', status: 'watching', addedAt: 5 });
    await db.titles.add({ id: 'tmdb:tv:9', kind: 'show', name: 'Tracked', fetchedAt: 0 });

    // `watched: false` is the load-bearing half: the row's sentence turns on it, and
    // "Because you watched Shōgun" about a show with no watches is what §6.170 photographed.
    expect(await seedTitles()).toEqual([
      { titleId: 'tmdb:tv:9', name: 'Tracked', watched: false },
    ]);
  });

  it('puts what you have watched ahead of what you have only tracked', async () => {
    // The order is the argument: time given is the stronger signal, and a stated interest
    // is a real one. Both, in that order, rather than one or the other.
    await db.library.bulkAdd([
      { titleId: 'tmdb:tv:9', kind: 'show', status: 'watching', addedAt: 5 },
      { titleId: 'tmdb:tv:8', kind: 'show', status: 'watching', addedAt: 1 },
    ]);
    await db.titles.bulkAdd([
      { id: 'tmdb:tv:9', kind: 'show', name: 'Newer', fetchedAt: 0 },
      { id: 'tmdb:tv:8', kind: 'show', name: 'Older', fetchedAt: 0 },
      { id: 'tmdb:tv:7', kind: 'show', name: 'Watched', fetchedAt: 0 },
    ]);
    await db.watches.add({
      id: 'w1',
      targetId: 'tmdb:tv:7:s1e1',
      seriesId: 'tmdb:tv:7',
      watchedAt: 1,
      runtimeMin: 60,
      source: 'manual' as const,
    });

    expect((await seedTitles()).map((s) => s.name)).toEqual(['Watched', 'Newer', 'Older']);
  });

  it('does not seed the same title twice when it is both tracked and watched', async () => {
    await db.library.add({ titleId: 'tmdb:tv:7', kind: 'show', status: 'watching', addedAt: 5 });
    await db.titles.add({ id: 'tmdb:tv:7', kind: 'show', name: 'Both', fetchedAt: 0 });
    await db.watches.add({
      id: 'w1',
      targetId: 'tmdb:tv:7:s1e1',
      seriesId: 'tmdb:tv:7',
      watchedAt: 1,
      runtimeMin: 60,
      source: 'manual' as const,
    });

    expect(await seedTitles()).toEqual([{ titleId: 'tmdb:tv:7', name: 'Both', watched: true }]);
  });
});

describe('feed', () => {
  it('falls back to trending for a new user rather than showing nothing', async () => {
    /*
     * No watches at all, so there is nothing to recommend from — and the row says so by
     * carrying **no seed**, rather than the literal `'Trending now'` in the slot where a
     * title goes. That string reached the card as *"Because you watched Trending now"* on
     * every row, and this clause asserted it. §6.152.
     */
    const suggestions = await getSuggestions();
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].trending).toBe(true);
    expect(suggestions[0].because).toEqual([]);
  });

  it('still filters the trending fallback against what you have added', async () => {
    await db.library.add({ titleId: 'tmdb:tv:1', kind: 'show', status: 'watching', addedAt: 1 });
    const suggestions = await getSuggestions();
    expect(suggestions.map((s) => s.id)).not.toContain('tmdb:tv:1');
  });

  /*
   * Through `getSuggestions`, not through `mergeSuggestions`.
   *
   * The first version of the unmatched-import clauses above called the merge directly and
   * handed it `await excludedNames()` by hand — so deleting the argument from the one call
   * site that matters left every one of them green. The plant found it: a clause that
   * builds the wiring itself proves the part, not the product. These two go through the
   * function the screens actually call.
   */
  /** An import as it actually lands: a local title, a library row, and watches. */
  async function unmatchedImport(name = 'The Long Dark') {
    await db.titles.add({ id: 'local:tv:tvtime-1', kind: 'show', name, fetchedAt: 1 });
    await db.library.add({
      titleId: 'local:tv:tvtime-1',
      kind: 'show',
      status: 'watching',
      addedAt: 1,
    });
    // The watches matter: `seedTitles` reads them, and without any the feed falls through
    // to trending — which is a different branch, and the first version of these two tests
    // only ever exercised that one.
    await db.watches.add({
      id: 'w-import-1',
      targetId: 'local:ep:1',
      seriesId: 'local:tv:tvtime-1',
      watchedAt: 1,
      source: 'import',
      runtimeMin: 45,
    });
  }

  it('does not offer back an imported show that has not been matched yet', async () => {
    /*
     * The name is one the provider in this environment actually returns, because a clause
     * that excludes a name nothing was going to suggest proves nothing. The first version
     * used "The Long Dark" — a fixture name this provider has never heard of — and would
     * have passed with the whole fix deleted.
     */
    const before = await getSuggestions();
    const willBeOffered = before[0].name;
    expect(willBeOffered, 'nothing to suggest, so there is nothing to exclude').toBeTruthy();

    await unmatchedImport(willBeOffered);
    const after = await getSuggestions();
    expect(after.length, 'the feed emptied, which is a different bug').toBeGreaterThan(1);
    expect(after.map((s) => s.name)).not.toContain(willBeOffered);
  });

  it('passes the names to every merge, not only the first', () => {
    /*
     * A source clause, because the two branches cannot both be reached here: this module
     * merges once for the seeded feed and again for the trending fallback, and the
     * provider in this environment returns nothing for an imported title's ID, so every
     * behavioural test above lands in the second branch. A fix applied to one call and not
     * the other would be invisible — the plant proved it, passing with `names` deleted
     * from the seeded call.
     *
     * Named for what it measures: every `mergeSuggestions` call inside `getSuggestions`
     * is handed the name set.
     */
    const source = readFileSync(resolve(import.meta.dirname, 'recommend.ts'), 'utf8');
    const body = source.slice(source.indexOf('export async function getSuggestions'));
    const calls = body.split('mergeSuggestions(').slice(1);
    expect(calls.length, 'no merge calls found to check').toBe(2);
    for (const [i, call] of calls.entries()) {
      expect(call.slice(0, call.indexOf(';')), `merge call ${i + 1} drops the names`).toContain(
        'names',
      );
    }
  });

  it('still offers everything else while an import is unmatched', async () => {
    // The narrowness: excluding by name must not empty the feed.
    await unmatchedImport();
    const suggestions = await getSuggestions();
    expect(suggestions.length).toBeGreaterThan(1);
  });
});

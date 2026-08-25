import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { clearMetadataCache } from './index';
import type { CachedEpisode, CachedTitle } from '../domain/types';

const NOW = Date.UTC(2026, 0, 15);

beforeEach(async () => {
  await Promise.all([
    db.titles.clear(),
    db.episodes.clear(),
    db.providers.clear(),
    db.animeIds.clear(),
    db.watches.clear(),
  ]);
});

const title = (id: string, over: Partial<CachedTitle> = {}): CachedTitle => ({
  id,
  kind: 'show',
  name: id,
  fetchedAt: NOW,
  ...over,
});

const episode = (id: string, seriesId: string): CachedEpisode => ({
  id,
  seriesId,
  season: 1,
  number: 1,
  name: 'One',
  fetchedAt: NOW,
});

describe('clearing what belongs to the provider', () => {
  it('drops provider titles, episodes and availability', async () => {
    await db.titles.put(title('tmdb:tv:1'));
    await db.episodes.put(episode('tmdb:ep:1', 'tmdb:tv:1'));
    await db.providers.put({
      id: 'tmdb:tv:1',
      country: 'GB',
      flatrate: ['Netflix'],
      rent: [],
      buy: [],
      fetchedAt: NOW,
    });

    const cleared = await clearMetadataCache();

    expect(cleared).toBe(2);
    expect(await db.titles.toArray()).toEqual([]);
    expect(await db.episodes.toArray()).toEqual([]);
    expect(await db.providers.toArray()).toEqual([]);
  });

  it('keeps the titles a rescued history brought with it', async () => {
    // This is the bug the check found rather than a hypothetical. Both database
    // adapters implemented this by emptying the tables, and the settings screen said
    // "Clearing them never touches your own history" — which stopped being true when
    // imported placeholders started living in `titles`. Pressing it after a TV Time
    // import erased the name of every show TMDB has never heard of.
    await db.titles.bulkPut([
      title('local:tv:tvtime-900', { name: 'Some Obscure Show' }),
      title('tmdb:tv:1'),
    ]);
    await db.episodes.bulkPut([
      episode('local:ep:tvtime-9001', 'local:tv:tvtime-900'),
      episode('tmdb:ep:1', 'tmdb:tv:1'),
    ]);

    await clearMetadataCache();

    expect((await db.titles.toArray()).map((t) => t.id)).toEqual(['local:tv:tvtime-900']);
    expect((await db.episodes.toArray()).map((e) => e.id)).toEqual(['local:ep:tvtime-9001']);
  });

  it('keeps a match already accepted', async () => {
    // `matchedTo` is what stops a re-import asking the same question twice. Losing it
    // is not a cache miss, it is work the person already did being thrown away.
    await db.titles.put(
      title('local:tv:tvtime-900', { name: 'Some Obscure Show', matchedTo: 'tmdb:tv:42' }),
    );

    await clearMetadataCache();

    expect((await db.titles.get('local:tv:tvtime-900'))?.matchedTo).toBe('tmdb:tv:42');
  });

  it('never touches watch history', async () => {
    await db.watches.put({
      id: 'w1',
      targetId: 'tmdb:ep:1',
      watchedAt: NOW,
      source: 'manual',
    });

    await clearMetadataCache();

    expect(await db.watches.count()).toBe(1);
  });
});

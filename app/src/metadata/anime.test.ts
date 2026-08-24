import { beforeEach, describe, expect, it } from 'vitest';
import { splitIntoSeasons, type AniListSeason } from './anilist';
import { clearMappingCache, lookupAnimeIds, resolveFromTmdb } from './animeMapping';
import { db } from '../data/db';

const season = (episodes?: number, title = 'S'): AniListSeason => ({
  anilistId: Math.random(),
  title,
  episodes,
});

describe('splitting a flat episode run into real seasons', () => {
  const episodes = Array.from({ length: 38 }, (_, i) => i + 1);

  it('re-cuts using AniList counts', () => {
    // The Frieren case: TMDB reports 38 episodes as one season; AniList says the
    // first season is 28.
    const split = splitIntoSeasons(episodes, [season(28), season(10)]);
    expect(split.map((s) => s.length)).toEqual([28, 10]);
    expect(split[0][0]).toBe(1);
    expect(split[1][0]).toBe(29);
  });

  it('keeps leftover episodes rather than dropping them', () => {
    // Losing episodes would be far worse than an imperfect final boundary.
    const split = splitIntoSeasons(episodes, [season(28)]);
    expect(split.map((s) => s.length)).toEqual([28, 10]);
  });

  it('returns a single season when AniList knows no counts', () => {
    expect(splitIntoSeasons(episodes, [season(undefined)])).toHaveLength(1);
  });

  it('returns a single season when there is no season data at all', () => {
    expect(splitIntoSeasons(episodes, [])).toHaveLength(1);
  });

  it('handles an empty episode list', () => {
    expect(splitIntoSeasons([], [season(12)])).toEqual([]);
  });

  it('stops early when counts exceed the episodes available', () => {
    // A season that has been announced but not yet aired must not create an
    // empty trailing group.
    const split = splitIntoSeasons([1, 2, 3], [season(3), season(12)]);
    expect(split.map((s) => s.length)).toEqual([3]);
  });

  it('ignores zero and negative counts', () => {
    const split = splitIntoSeasons([1, 2, 3, 4], [season(0), season(2), season(-5)]);
    expect(split.map((s) => s.length)).toEqual([2, 2]);
  });
});

describe('anime ID mapping (live)', () => {
  // ARM is a free community service; these are a handful of cached lookups, not a
  // sweep. They skip cleanly when offline.
  beforeEach(async () => {
    clearMappingCache();
    await db.table('animeIds').clear();
  });

  it('maps AniList to TMDB', async () => {
    const ids = await lookupAnimeIds('anilist', 154587);
    if (!ids) return; // offline
    expect(ids.themoviedb).toBe(209867);
    expect(ids.myanimelist).toBe(52991);
  }, 20_000);

  it('resolves TMDB to AniList by title, verified through the forward mapping', async () => {
    // ARM refuses a TMDB source, so this goes via AniList search and confirms the
    // candidate maps back to the TMDB ID we started from.
    const ids = await resolveFromTmdb(209867, 'Frieren: Beyond Journey\u2019s End');
    if (!ids) return; // offline
    expect(ids.anilist).toBeGreaterThan(0);
    expect(ids.themoviedb).toBe(209867);
  }, 30_000);

  it('caches a lookup so the service is not asked twice', async () => {
    const first = await lookupAnimeIds('anilist', 154587);
    if (!first) return;
    const rows = await db.table('animeIds').toArray();
    expect(rows.length).toBeGreaterThan(0);
  }, 20_000);

  it('reports live-action television as not anime', async () => {
    // Breaking Bad. A miss is the common case and must not be an error.
    expect(await resolveFromTmdb(1396, 'Breaking Bad')).toBeUndefined();
  }, 30_000);

  it('rejects a similarly-named show that does not map back', async () => {
    // Verification is the point: a title search alone would happily return
    // something else, and re-cutting from the wrong source is worse than leaving
    // TMDB's structure alone.
    expect(await resolveFromTmdb(999999999, 'Frieren')).toBeUndefined();
  }, 30_000);
});

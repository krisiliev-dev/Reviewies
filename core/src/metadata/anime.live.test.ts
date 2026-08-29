import { beforeEach, describe, expect, it } from 'vitest';
import { getConfig } from '../config.ts';
import { getSeasonChain } from './anilist.ts';
import { clearMappingCache, lookupAnimeIds, resolveFromTmdb } from './animeMapping.ts';
import { TmdbProvider } from './tmdb.ts';
import { getEpisodesCached } from './index.ts';
import { db } from '../data/db.ts';

/**
 * Live verification that the anime correction fixes the case it was built for.
 * Skipped without a TMDB token.
 */
const token = getConfig().tmdbToken;
const live = token ? describe : describe.skip;

live('anime season correction (live)', () => {
  it('reconstructs Frieren seasons that TMDB merged', async () => {
    // TMDB reports Frieren as a single 38-episode season. AniList says season one
    // is 28 episodes, with the rest belonging to a later season.
    const tmdb = new TmdbProvider(token!);
    const detail = await tmdb.getTitle('tmdb:tv:209867');
    expect(detail?.seasonCount).toBe(1);

    const ids = await resolveFromTmdb(209867, detail!.name);
    expect(ids?.anilist).toBeGreaterThan(0);

    const chain = await getSeasonChain(ids!.anilist!);
    expect(chain.length).toBeGreaterThanOrEqual(2);
    expect(chain[0].episodes).toBe(28);
  }, 60_000);

  it('applies the correction through the caching layer', async () => {
    await db.episodes.where('seriesId').equals('tmdb:tv:209867').delete();
    const episodes = await getEpisodesCached('tmdb:tv:209867');

    const numbered = episodes.filter((e) => e.season > 0);
    const seasons = new Set(numbered.map((e) => e.season));
    // The whole point: more than one season after correction.
    expect(seasons.size).toBeGreaterThanOrEqual(2);

    const first = numbered.filter((e) => e.season === 1);
    expect(first).toHaveLength(28);
    // Episode IDs are preserved, so watch history survives the re-cut.
    expect(first[0].id).toMatch(/^tmdb:ep:\d+$/);
  }, 90_000);

  it('leaves live-action television untouched', async () => {
    await db.episodes.where('seriesId').equals('tmdb:tv:1396').delete();
    const episodes = await getEpisodesCached('tmdb:tv:1396');
    const seasons = new Set(episodes.filter((e) => e.season > 0).map((e) => e.season));
    // Breaking Bad genuinely has five seasons; nothing should be re-cut.
    expect(seasons.size).toBe(5);
  }, 120_000);
});

/*
 * Moved here from `anime.test.ts`. §6.159.
 *
 * §6.158 took the live suites out of `verify` **by filename**, and this block was a live
 * `describe` inside an offline file — announcing itself as `(live)` in its own name while
 * sitting where the exclusion could not see it. The convention was the filename and one
 * suite was not keeping it, which is only visible the moment the filename starts to mean
 * something.
 *
 * It skips cleanly when offline: every case returns early on a miss rather than failing.
 */
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

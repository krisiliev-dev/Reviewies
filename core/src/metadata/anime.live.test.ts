import { describe, expect, it } from 'vitest';
import { getSeasonChain } from './anilist';
import { resolveFromTmdb } from './animeMapping';
import { TmdbProvider } from './tmdb';
import { getEpisodesCached } from './index';
import { db } from '../data/db';

/**
 * Live verification that the anime correction fixes the case it was built for.
 * Skipped without a TMDB token.
 */
const token = import.meta.env?.VITE_TMDB_TOKEN as string | undefined;
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

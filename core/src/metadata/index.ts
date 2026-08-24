import { db } from '../data/db';
import { isStale } from '../domain/types';
import type { CachedEpisode, CachedProviders, CachedTitle } from '../domain/types';
import { FixtureProvider } from './fixtures';
import type { MetadataProvider } from './provider';
import { TmdbProvider } from './tmdb';
import { getSeasonChain, splitIntoSeasons } from './anilist';
import { resolveFromTmdb } from './animeMapping';

/**
 * Picks the provider once, at startup. Without a token the app runs on fixtures
 * rather than failing, so it is always launchable and testable.
 */
function createProvider(): MetadataProvider {
  const token = import.meta.env?.VITE_TMDB_TOKEN as string | undefined;
  return token ? new TmdbProvider(token) : new FixtureProvider();
}

export const provider: MetadataProvider = createProvider();
export const usingFixtures = provider.name === 'fixtures';

/**
 * Read-through cache. Serves from IndexedDB, refetches when past the TTL, and falls
 * back to stale data if the network is unavailable — offline should degrade to
 * slightly-old metadata, never to an error.
 */
export async function getTitleCached(id: string): Promise<CachedTitle | undefined> {
  const cached = await db.titles.get(id);
  if (cached && !isStale(cached.fetchedAt)) return cached;

  try {
    const fresh = await provider.getTitle(id);
    if (fresh) await db.titles.put(fresh);
    return fresh ?? cached;
  } catch {
    return cached;
  }
}

/**
 * Where a title can be watched, in one country.
 *
 * The cache table is keyed by title alone, so a row cached for a different country is
 * treated as a miss rather than served — changing region has to change the answer, or
 * the feature is actively misleading.
 */
export async function getProvidersCached(
  id: string,
  country: string,
): Promise<CachedProviders | undefined> {
  const cached = await db.providers.get(id);
  if (cached && cached.country === country && !isStale(cached.fetchedAt)) return cached;

  try {
    const fresh = await provider.getWatchProviders(id, country);
    if (fresh) {
      await db.providers.put(fresh);
      return fresh;
    }
    // A title genuinely unavailable in this country: cache nothing, and do not fall
    // back to another country's answer.
    return cached?.country === country ? cached : undefined;
  } catch {
    return cached?.country === country ? cached : undefined;
  }
}

export async function getEpisodesCached(seriesId: string): Promise<CachedEpisode[]> {
  const cached = await db.episodes.where('seriesId').equals(seriesId).toArray();
  const fresh = cached.length > 0 && cached.every((e) => !isStale(e.fetchedAt));
  if (fresh) return cached;

  try {
    const fetched = await provider.getEpisodes(seriesId);
    if (!fetched.length) return cached;

    const corrected = await correctAnimeSeasons(seriesId, fetched);
    await db.episodes.bulkPut(corrected);
    return corrected;
  } catch {
    return cached;
  }
}

/**
 * Re-cut anime seasons using AniList when TMDB has merged them.
 *
 * Only runs when the show is in the anime mapping dataset *and* TMDB reports a
 * single suspiciously long season — the case this exists to fix. Everything else is
 * returned untouched, so live-action television costs nothing and the AniList rate
 * limit is spent only where it helps.
 *
 * Episode IDs are preserved exactly. Only the season and episode numbers change, so
 * existing watch history — which is keyed to those IDs, never to positions — survives
 * the correction intact.
 */
async function correctAnimeSeasons(
  seriesId: string,
  episodes: CachedEpisode[],
): Promise<CachedEpisode[]> {
  const numbered = episodes.filter((e) => e.season > 0);
  const specials = episodes.filter((e) => e.season === 0);

  const seasons = new Set(numbered.map((e) => e.season));
  // A genuine single season of ordinary length needs no help.
  if (seasons.size !== 1 || numbered.length < 26) return episodes;

  const tmdbId = Number(seriesId.split(':').pop());
  if (!Number.isFinite(tmdbId)) return episodes;

  // ARM cannot be queried by TMDB ID, so the AniList entry is found by title and
  // then verified back against this TMDB ID before we trust it.
  //
  // The title is fetched if it is not already cached rather than assumed: callers
  // are not required to have loaded the show first, and silently skipping the
  // correction because of call ordering would be a confusing bug to chase.
  const title = (await db.titles.get(seriesId))?.name ?? (await getTitleCached(seriesId))?.name;
  if (!title) return episodes;

  const ids = await resolveFromTmdb(tmdbId, title);
  if (!ids?.anilist) return episodes;

  const chain = await getSeasonChain(ids.anilist);
  if (chain.length < 2) return episodes;

  const ordered = [...numbered].sort((a, b) => a.number - b.number);
  const groups = splitIntoSeasons(ordered, chain);
  if (groups.length < 2) return episodes;

  const recut: CachedEpisode[] = groups.flatMap((group, seasonIndex) =>
    group.map((episode, episodeIndex) => ({
      ...episode,
      season: seasonIndex + 1,
      number: episodeIndex + 1,
    })),
  );

  return [...specials, ...recut];
}

export * from './provider';

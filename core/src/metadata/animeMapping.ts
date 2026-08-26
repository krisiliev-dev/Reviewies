import { db } from '../data/db.ts';
import { searchAnime } from './anilist.ts';

/**
 * Cross-database anime ID mapping.
 *
 * Built on the ARM service, generated from the community-maintained anime-lists
 * dataset and refreshed daily.
 *
 * ARM only accepts anime-native databases as the *source* of a lookup — AniList, MAL,
 * AniDB and Kitsu. It will not take a TMDB or TVDB ID, because those are not unique
 * per anime season: TMDB models a franchise as one show where AniList models each
 * season separately. Going TMDB → AniList therefore has to be done by title search and
 * then *verified* through the forward mapping, which is what resolveFromTmdb does.
 *
 * Results are cached: the mapping changes rarely, and a lookup per screen would be
 * both wasteful and rude to a free community service.
 */

const ARM = 'https://arm.haglund.dev/api/v2/ids';

/** The only sources ARM accepts. Anything else is a 400. */
export type AnimeSource = 'anilist' | 'myanimelist' | 'anidb' | 'kitsu';

export interface AnimeIds {
  anilist?: number;
  myanimelist?: number;
  anidb?: number;
  themoviedb?: number;
  thetvdb?: number;
  imdb?: string;
  /** Which TMDB season this AniList entry corresponds to, when ARM knows. */
  themoviedbSeason?: number;
}

type CacheRow = { id: string; ids: AnimeIds | null; fetchedAt: number };

const MEMORY = new Map<string, AnimeIds | undefined>();
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

function normalise(raw: Record<string, unknown>): AnimeIds {
  const num = (v: unknown) => (typeof v === 'number' ? v : undefined);
  return {
    anilist: num(raw.anilist),
    myanimelist: num(raw.myanimelist),
    anidb: num(raw.anidb),
    themoviedb: num(raw.themoviedb),
    thetvdb: num(raw.thetvdb),
    imdb: typeof raw.imdb === 'string' ? raw.imdb : undefined,
    themoviedbSeason: num(raw['themoviedb-season']),
  };
}

async function readCache(key: string): Promise<CacheRow | undefined> {
  return (await db.table('animeIds').get(key)) as CacheRow | undefined;
}

/**
 * Look up cross-database IDs from an anime-native ID.
 *
 * Returns undefined for anything not in the dataset. ARM answers a miss with HTTP 200
 * and a literal `null` body rather than a 404, which is easy to mistake for success.
 */
export async function lookupAnimeIds(
  source: AnimeSource,
  id: number | string,
  signal?: AbortSignal,
): Promise<AnimeIds | undefined> {
  const key = `${source}:${id}`;
  if (MEMORY.has(key)) return MEMORY.get(key);

  const cached = await readCache(key);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
    const value = cached.ids ?? undefined;
    MEMORY.set(key, value);
    return value;
  }

  try {
    const res = await fetch(`${ARM}?source=${source}&id=${id}`, { signal });
    if (!res.ok) return cached?.ids ?? undefined;

    const body = (await res.json()) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') {
      // A genuine "not in the dataset" answer, cached so we stop asking.
      MEMORY.set(key, undefined);
      await db.table('animeIds').put({ id: key, ids: null, fetchedAt: Date.now() });
      return undefined;
    }

    const ids = normalise(body);
    MEMORY.set(key, ids);
    await db.table('animeIds').put({ id: key, ids, fetchedAt: Date.now() });
    return ids;
  } catch {
    // Offline or the service is down: fall back to whatever we already knew.
    return cached?.ids ?? undefined;
  }
}

/**
 * Find the AniList entry for a TMDB show, by title, verified through ARM.
 *
 * The verification matters: title search alone would happily return a different
 * series with a similar name, and re-cutting a show's seasons from the wrong source
 * would be worse than leaving TMDB's structure alone. A candidate is only accepted if
 * ARM maps it back to the TMDB ID we started from.
 */
export async function resolveFromTmdb(
  tmdbId: number,
  title: string,
  signal?: AbortSignal,
): Promise<AnimeIds | undefined> {
  const key = `themoviedb:${tmdbId}`;
  if (MEMORY.has(key)) return MEMORY.get(key);

  const cached = await readCache(key);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
    const value = cached.ids ?? undefined;
    MEMORY.set(key, value);
    return value;
  }

  const remember = async (ids: AnimeIds | undefined) => {
    MEMORY.set(key, ids);
    await db.table('animeIds').put({ id: key, ids: ids ?? null, fetchedAt: Date.now() });
    return ids;
  };

  try {
    const candidates = await searchAnime(title, signal);
    // Only the closest few are worth checking: each verification is an ARM request,
    // and a match further down the list is unlikely to be the same show.
    for (const candidate of candidates.slice(0, 4)) {
      const ids = await lookupAnimeIds('anilist', candidate.anilistId, signal);
      if (ids?.themoviedb === tmdbId) return remember(ids);
    }
    return remember(undefined);
  } catch {
    return cached?.ids ?? undefined;
  }
}

/** Whether a TMDB show is anime, according to the mapping dataset. */
export async function isAnime(
  tmdbId: number,
  title: string,
  signal?: AbortSignal,
): Promise<boolean> {
  return Boolean((await resolveFromTmdb(tmdbId, title, signal))?.anilist);
}

/** Only used by tests, to keep the in-memory cache from leaking between cases. */
export function clearMappingCache(): void {
  MEMORY.clear();
}

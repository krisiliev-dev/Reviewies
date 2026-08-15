import { db } from '../data/db';
import { isStale } from '../domain/types';
import type { CachedEpisode, CachedTitle } from '../domain/types';
import { FixtureProvider } from './fixtures';
import type { MetadataProvider } from './provider';
import { TmdbProvider } from './tmdb';

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

export async function getEpisodesCached(seriesId: string): Promise<CachedEpisode[]> {
  const cached = await db.episodes.where('seriesId').equals(seriesId).toArray();
  const fresh = cached.length > 0 && cached.every((e) => !isStale(e.fetchedAt));
  if (fresh) return cached;

  try {
    const fetched = await provider.getEpisodes(seriesId);
    if (fetched.length) await db.episodes.bulkPut(fetched);
    return fetched.length ? fetched : cached;
  } catch {
    return cached;
  }
}

export * from './provider';

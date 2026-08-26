import { db } from '../data/db.ts';
import { getConfig } from '../config.ts';
import { isStale } from '../domain/types.ts';
import type { CachedEpisode, CachedProviders, CachedTitle } from '../domain/types.ts';
import { FixtureProvider } from './fixtures.ts';
import type { MetadataProvider } from './provider.ts';
import { TmdbProvider } from './tmdb.ts';
import { getSeasonChain, splitIntoSeasons } from './anilist.ts';
import { resolveFromTmdb } from './animeMapping.ts';

/**
 * Picks the provider once, at startup. Without a token the app runs on fixtures
 * rather than failing, so it is always launchable and testable.
 */
function createProvider(): MetadataProvider {
  const token = getConfig().tmdbToken;
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

/**
 * A series' episodes, from the cache when they are fresh enough.
 *
 * `maxAgeMs` exists for the calendar. The default — TMDB's caching limit — is right for
 * a screen showing a season you are part-way through, and wrong for "what airs next
 * week": a show whose episodes were cached two months ago is well inside the TTL and has
 * had a new season announced since. The calendar's refresh passes a much shorter age, so
 * it fetches; everything else keeps the cheap read.
 */
export async function getEpisodesCached(
  seriesId: string,
  maxAgeMs?: number,
): Promise<CachedEpisode[]> {
  const cached = await db.episodes.where('seriesId').equals(seriesId).toArray();
  const stale = (fetchedAt: number) =>
    maxAgeMs === undefined ? isStale(fetchedAt) : Date.now() - fetchedAt > maxAgeMs;
  const fresh = cached.length > 0 && cached.every((e) => !stale(e.fetchedAt));
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

/**
 * Drop everything derived from the metadata provider.
 *
 * The domain types say the cache is kept in physically separate tables so that this is
 * "a single operation" — and it was not an operation at all until someone went looking:
 * nothing anywhere could clear it. TMDB's terms cap caching at six months, the tables
 * grow without bound as a library does, and a person who wants their device to stop
 * holding third-party data had no way to say so.
 *
 * Titles imported from a rescued history are kept. They live in the same table but they
 * are not the provider's — they are the only record of a show TMDB has never heard of,
 * and dropping them would take the watch history's names with it and undo any matching
 * already accepted.
 *
 * That last part is why this is a function rather than the `db.clearMetadataCache()` it
 * replaces. Both adapters implemented that by emptying the tables, and the web's
 * settings screen has offered it as "Clearing them never touches your own history" —
 * which was true when it was written and stopped being true when imported placeholders
 * started living in `titles`. Pressing it after a TV Time import erased the name of
 * every show TMDB does not have, and every match already accepted with it.
 */
export async function clearMetadataCache(): Promise<number> {
  const titles = await db.titles.toArray();
  const providerTitles = titles.filter((t) => !t.id.startsWith('local:'));

  const episodes = await db.episodes.toArray();
  const providerEpisodes = episodes.filter((e) => !e.id.startsWith('local:'));

  for (const title of providerTitles) await db.titles.delete(title.id);
  for (const episode of providerEpisodes) await db.episodes.delete(episode.id);
  await db.providers.clear();
  await db.animeIds.clear();

  return providerTitles.length + providerEpisodes.length;
}

/**
 * Delete cached metadata that is past its life, rather than merely refusing to serve it.
 *
 * Both settings screens say artwork and episode listings "expire automatically", and
 * until somebody read that sentence back against the code, nothing expired: `isStale` is
 * checked when a row is *read*, so a show looked up once and never opened again sat on
 * the device for as long as the app was installed. TMDB's terms cap caching at six
 * months and the tables only ever grew.
 *
 * Titles carried over from an import are kept, for the same reason `clearMetadataCache`
 * keeps them: they are not the provider's to expire, and they are the only record of a
 * show it has never heard of.
 */
export async function expireMetadata(now = Date.now()): Promise<number> {
  const gone = (fetchedAt: number) => isStale(fetchedAt, now);
  const mine = (id: string) => id.startsWith('local:');

  const titles = (await db.titles.toArray()).filter((t) => !mine(t.id) && gone(t.fetchedAt));
  const episodes = (await db.episodes.toArray()).filter((e) => !mine(e.id) && gone(e.fetchedAt));
  const providers = (await db.providers.toArray()).filter((p) => gone(p.fetchedAt));

  for (const title of titles) await db.titles.delete(title.id);
  for (const episode of episodes) await db.episodes.delete(episode.id);
  for (const row of providers) await db.providers.delete(row.id);

  return titles.length + episodes.length + providers.length;
}

export * from './provider.ts';

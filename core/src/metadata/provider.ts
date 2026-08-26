import type { CachedEpisode, CachedProviders, CachedTitle, MediaKind } from '../domain/types.ts';

/**
 * The boundary that keeps TMDB swappable.
 *
 * No provider response shape may escape this module — components see only these
 * normalised types. Two reasons this matters more than usual here:
 *
 *  - TMDB is non-commercial only. If Reviewies ever earns revenue we need either a
 *    commercial agreement or a different provider, and that must not be a rewrite.
 *  - Anime needs AniList alongside TMDB, because TMDB flattens some series into a
 *    single hundred-episode season.
 */
export interface SearchResult {
  id: string;
  kind: MediaKind;
  name: string;
  year?: number;
  posterUrl?: string;
  overview?: string;
}

export interface MetadataProvider {
  readonly name: string;
  search(query: string, signal?: AbortSignal): Promise<SearchResult[]>;
  getTitle(id: string, signal?: AbortSignal): Promise<CachedTitle | undefined>;
  getEpisodes(seriesId: string, signal?: AbortSignal): Promise<CachedEpisode[]>;
  getWatchProviders(
    id: string,
    country: string,
    signal?: AbortSignal,
  ): Promise<CachedProviders | undefined>;
  /** Titles similar to one the user already likes. */
  getRecommendations(id: string, signal?: AbortSignal): Promise<SearchResult[]>;
  /** Broad popular titles, used to seed discovery for a near-empty library. */
  getTrending(signal?: AbortSignal): Promise<SearchResult[]>;
}

/**
 * Mandatory attribution.
 *
 * TMDB requires this exact disclaimer plus their logo, displayed less prominently
 * than our own branding. Watch-provider data is separately required to be
 * attributed to JustWatch. Both must be visible in the UI — this is a licence
 * condition, not a nicety.
 */
/**
 * How long a search waits before giving up on the provider.
 *
 * A request that hangs never rejects, so without a deadline the only failure people
 * actually meet — a network that has stopped answering — reaches no error state at all
 * and the screen says "Searching…" for ever with nothing to press (doc 10 §6).
 *
 * Ten seconds because a search somebody is waiting on has already failed at three, and
 * because aborting a slow-but-alive request is worse than waiting a moment longer. Here
 * rather than in one screen: the web had it and the phone did not, which is the same
 * decision made once and then not carried across.
 */
export const SEARCH_TIMEOUT_MS = 10_000;

export const TMDB_ATTRIBUTION =
  'This product uses the TMDB API but is not endorsed or certified by TMDB.';
export const JUSTWATCH_ATTRIBUTION = 'Streaming availability data provided by JustWatch.';

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
  /**
   * What it is, in words, for the face of the box and for the genre filter.
   *
   * `docs/design/architecture.md` sections 5 and 6. The browse shelf carries *genre, release date
   * and title* — the three things printed on a spine — and until this sprint the boundary
   * carried the second and third and not the first. Names rather than the provider's ids,
   * because a normalised type is the whole point of this module and an integer that means
   * "Drama" only to TMDB is exactly the response shape that must not escape it.
   *
   * Optional, and the shelf is built for it to be missing: a title that came from an
   * import has no genres and never will until it is matched, and a box with no genre line
   * is a box with two lines rather than a box with a hole.
   */
  genres?: string[];
  /**
   * The crowd's score out of ten, which **filters and is never printed**.
   *
   * `architecture.md`'s third refusal. `direction.md` refused the poster-wall register on
   * the rule that *browsing is reading, not shopping*, and a number in the corner of every
   * box is the fastest way there is to turn a shelf into a shop. Carrying it as a filter is
   * the honest half — it changes what you are shown and never tells you what to think.
   *
   * `app/src/ui/browse.test.ts` is what holds the second half of that sentence.
   */
  rating?: number;
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

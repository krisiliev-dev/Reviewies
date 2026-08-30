/**
 * Core domain types.
 *
 * Two rules drive everything in here, both from the research phase:
 *
 * 1. Progress is stored against stable internal IDs, never against "S3E4" strings.
 *    Upstream databases reorder episodes (this is routine for anime on TMDB), and a
 *    positional key would silently corrupt watch history when they do.
 *
 * 2. Watching something is an *event*, not a boolean. Rewatch counts were one of the
 *    most-requested missing features across r/Letterboxd, r/Simkl and r/Serializd, and
 *    retrofitting them onto a boolean is painful.
 */

export type MediaKind = 'show' | 'film';

/** Which upstream database an ID came from. */
export type ProviderName = 'tmdb' | 'tvdb' | 'anilist' | 'mal' | 'imdb' | 'local';

/**
 * A stable internal ID, formatted `provider:type:id` — e.g. `tmdb:tv:1396`,
 * `tmdb:ep:62085`, `tmdb:movie:550`.
 *
 * Deriving it deterministically from the provider's own ID means we never need a
 * server round-trip to mint one, and the same title resolves to the same ID on every
 * device. Episode IDs use TMDB's per-episode `id`, which is stable across the season
 * and episode renumbering that breaks positional keys.
 */
export type InternalId = string;

export function makeId(provider: ProviderName, type: string, id: string | number): InternalId {
  return `${provider}:${type}:${id}`;
}

export function parseId(id: InternalId): { provider: string; type: string; raw: string } {
  const [provider, type, ...rest] = id.split(':');
  return { provider, type, raw: rest.join(':') };
}

/** Cross-database IDs for one title. Populated lazily; anime needs this most. */
export interface ExternalIds {
  tmdb?: number;
  tvdb?: number;
  imdb?: string;
  anilist?: number;
  mal?: number;
}

// ---------------------------------------------------------------------------
// User data — ours, permanent, fully exportable.
// ---------------------------------------------------------------------------

export type LibraryStatus = 'watching' | 'completed' | 'paused' | 'dropped';

/** A show or film the user is tracking. */
export interface LibraryItem {
  titleId: InternalId;
  kind: MediaKind;
  status: LibraryStatus;
  addedAt: number;
  /** User-supplied poster override — TMDB moderation deleting artwork is a real complaint. */
  posterOverride?: string;
  /** Preferred episode ordering, for anime where TMDB flattens seasons. */
  ordering?: 'aired' | 'absolute';
}

/**
 * One act of watching. Multiple events for the same target = a rewatch.
 * Never collapse these into a boolean.
 */
export interface WatchEvent {
  id: string;
  /** Episode ID for shows, title ID for films. */
  targetId: InternalId;
  /** Parent show, denormalised so "progress in this series" is one indexed query. */
  seriesId?: InternalId;
  watchedAt: number;
  /**
   * Runtime snapshot in minutes, captured at write time.
   * Stats must be runtime-weighted — a 22-minute comedy is not a 60-minute drama —
   * and metadata is a TTL'd cache we cannot rely on being present later.
   */
  runtimeMin?: number;
  source: 'manual' | 'import' | 'extension' | 'bridge';
}

/** Ratings are separate from watches so you can rate without logging, and rewatch without re-rating. */
export interface Rating {
  targetId: InternalId;
  /** 0.5–5 in half-star steps, matching the convention users already know. */
  value: number;
  ratedAt: number;
}

export interface WatchlistItem {
  titleId: InternalId;
  kind: MediaKind;
  addedAt: number;
  /**
   * Why it's on the list. From r/Letterboxd: "The amount of things I have in my wishlist
   * that i have ZERO memory for why they're there."
   */
  note?: string;
}

/** A timestamped reaction during Watching Mode. Append-only. */
export interface Reaction {
  id: string;
  /** Episode or film being watched. */
  targetId: InternalId;
  /** Offset into the media, in milliseconds. */
  tMs: number;
  emoji: string;
  createdAt: number;
  /** False for reactions replayed from other viewers. */
  mine: boolean;
}

// ---------------------------------------------------------------------------
// Metadata cache — not ours. TTL'd, disposable, never exported.
//
// TMDB's terms forbid caching beyond 6 months, so this is kept in physically
// separate tables from user data. That makes "drop everything TMDB-derived" a
// single operation, and keeps the user's export legally clean.
// ---------------------------------------------------------------------------

export interface CachedTitle {
  id: InternalId;
  /**
   * Where an imported placeholder was matched to.
   *
   * Set on the *local* row when reconciliation accepts a match, and it is the only
   * thing that stops a re-import asking the same question twice: the rows come back
   * under the same local ID, and this says where they belong. Never set on a row that
   * came from a provider.
   */
  matchedTo?: InternalId;
  kind: MediaKind;
  name: string;
  year?: number;
  overview?: string;
  posterUrl?: string;
  backdropUrl?: string;
  runtimeMin?: number;
  seasonCount?: number;
  /**
   * What it is, in words. The same field as `SearchResult.genres` and for the same reason:
   * `docs/design/architecture.md` section 5 puts the genre on the face of a browse box, and a box
   * built from a cached title has to be able to say the same three things as one built
   * from a search result.
   */
  genres?: string[];
  /**
   * Whether the show has finished airing. Undefined means unknown, which is treated
   * as "still running" — a show wrongly marked finished silently stops asking for
   * new episodes, which is worse than one that keeps asking.
   */
  ended?: boolean;
  externalIds?: ExternalIds;
  fetchedAt: number;
}

export interface CachedEpisode {
  id: InternalId;
  seriesId: InternalId;
  season: number;
  number: number;
  name: string;
  overview?: string;
  airDate?: string;
  runtimeMin?: number;
  stillUrl?: string;
  fetchedAt: number;
}

/** Where a title can be streamed, per country. Attribution to JustWatch is mandatory. */
export interface CachedProviders {
  id: InternalId;
  country: string;
  flatrate: string[];
  rent: string[];
  buy: string[];
  link?: string;
  fetchedAt: number;
}

/** TMDB's terms cap caching at 6 months. Expire well inside that. */
export const METADATA_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export function isStale(fetchedAt: number, now = Date.now()): boolean {
  return now - fetchedAt > METADATA_TTL_MS;
}

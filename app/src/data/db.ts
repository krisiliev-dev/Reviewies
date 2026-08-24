import Dexie, { type EntityTable } from 'dexie';
import type {
  CachedEpisode,
  CachedProviders,
  CachedTitle,
  LibraryItem,
  Rating,
  Reaction,
  WatchEvent,
  WatchlistItem,
} from '../domain/types';

/**
 * Local-first store. IndexedDB is the source of truth for user data — reads and
 * writes never wait on the network, so marking an episode watched is instant and
 * works offline.
 *
 * The two groups of tables are deliberately separate:
 *
 *   user data      yours, permanent, exported in full
 *   metadata cache TMDB's, TTL'd, disposable, never exported
 *
 * Keeping them apart is what lets us honour TMDB's 6-month caching limit and still
 * promise you a complete export of your own history.
 */
export class ReviewiesDB extends Dexie {
  // User data
  library!: EntityTable<LibraryItem, 'titleId'>;
  watches!: EntityTable<WatchEvent, 'id'>;
  ratings!: EntityTable<Rating, 'targetId'>;
  watchlist!: EntityTable<WatchlistItem, 'titleId'>;
  reactions!: EntityTable<Reaction, 'id'>;

  // Metadata cache
  titles!: EntityTable<CachedTitle, 'id'>;
  episodes!: EntityTable<CachedEpisode, 'id'>;
  providers!: EntityTable<CachedProviders, 'id'>;

  constructor(name = 'reviewies') {
    super(name);
    this.version(1).stores({
      library: 'titleId, kind, status, addedAt',
      // targetId is not unique — repeat entries are rewatches, which is the point.
      watches: 'id, targetId, seriesId, watchedAt',
      ratings: 'targetId, ratedAt',
      watchlist: 'titleId, kind, addedAt',
      reactions: 'id, targetId, tMs, [targetId+tMs]',

      titles: 'id, kind, fetchedAt',
      episodes: 'id, seriesId, [seriesId+season], fetchedAt',
      providers: 'id, fetchedAt',
    });
  }

  /** Drop everything provider-derived. Safe to call at any time; user data is untouched. */
  async clearMetadataCache(): Promise<void> {
    await this.transaction('rw', this.titles, this.episodes, this.providers, async () => {
      await Promise.all([this.titles.clear(), this.episodes.clear(), this.providers.clear()]);
    });
  }
}

/**
 * Namespace the database per test worker.
 *
 * Vitest runs test files across parallel workers that would otherwise share a
 * single IndexedDB, so one file's `clear()` can wipe another file's fixtures
 * mid-test. Files within a worker run sequentially, so per-worker is enough.
 * In the browser this is always plain `reviewies`.
 */
export function databaseName(base: string): string {
  // Reached via globalThis so the app build does not need Node types.
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  const workerId = env?.VITEST_WORKER_ID;
  return workerId ? `${base}-test-${workerId}` : base;
}

export const db = new ReviewiesDB(databaseName('reviewies'));

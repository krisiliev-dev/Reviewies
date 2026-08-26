import Dexie, { type EntityTable } from 'dexie';
import type { Database } from '../store.ts';
import type {
  CachedEpisode,
  CachedProviders,
  CachedTitle,
  LibraryItem,
  Rating,
  Reaction,
  WatchEvent,
  WatchlistItem,
} from '../../domain/types.ts';

/**
 * IndexedDB implementation of the core's `Database`.
 *
 * Dexie satisfies the interface without adaptation, which is not a coincidence: the
 * interface was derived by counting every `db.*` expression in the codebase, and those
 * expressions were written against Dexie. What it buys is that the same call sites now
 * run against SQLite on a phone.
 *
 * The two groups of tables are deliberately separate:
 *
 *   user data      yours, permanent, exported in full
 *   metadata cache TMDB's, TTL'd, disposable, never exported
 *
 * Keeping them apart is what lets us honour TMDB's six-month caching limit and still
 * promise a complete export of your own history.
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
  /** Cross-database anime ID mappings, keyed `source:id`. */
  animeIds!: EntityTable<{ id: string; ids: unknown; fetchedAt: number }, 'id'>;

  // Sync bookkeeping
  outbox!: EntityTable<{ key: string; table: string; updatedAt: number }, 'key'>;
  syncState!: EntityTable<{ key: string; value: number }, 'key'>;
  /** Writes the server refused, kept out of the queue and kept. §6.71. */
  rejected!: EntityTable<{ key: string; table: string; at: number; reason: string }, 'key'>;

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

    // v2 adds the anime ID mapping cache. Dexie applies this to existing databases
    // without touching the tables above.
    this.version(2).stores({
      animeIds: 'id, fetchedAt',
    });

    // v3 folds in the outbox and the sync cursor, which used to be a second Dexie
    // database. Separating them bought nothing — they were always written together —
    // and it made the sync engine depend on a browser database directly, which is
    // exactly what stopped the core running anywhere else.
    this.version(3).stores({
      outbox: 'key, table, updatedAt',
      syncState: 'key',
    });

    /**
     * v4 adds the place a write goes when the server will never accept it.
     *
     * Not the outbox, because an entry that cannot succeed blocks everything behind it
     * (§6.71), and not nothing, because deleting somebody's write to unblock a queue is
     * the worst of the three options. Set aside, kept, and counted where a person can
     * see it.
     */
    this.version(4).stores({
      rejected: 'key, table, at',
    });
  }
}

/**
 * Namespace the database per test worker.
 *
 * Vitest runs test files across parallel workers that would otherwise share a single
 * IndexedDB, so one file's `clear()` can wipe another file's fixtures mid-test. Files
 * within a worker run sequentially, so per-worker is enough. In a browser this is
 * always plain `reviewies`.
 */
export function databaseName(base: string): string {
  // Reached via globalThis so an app build does not need Node types.
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  const workerId = env?.VITEST_WORKER_ID;
  return workerId ? `${base}-test-${workerId}` : base;
}

export function createDexieDatabase(name = 'reviewies'): Database {
  return new ReviewiesDB(databaseName(name)) as unknown as Database;
}

import type {
  CachedEpisode,
  CachedProviders,
  CachedTitle,
  LibraryItem,
  Rating,
  Reaction,
  WatchEvent,
  WatchlistItem,
} from '../domain/types.ts';

/**
 * The database surface the core actually uses.
 *
 * Deliberately derived from the call sites rather than from any library: a count of
 * every `db.*` expression in the codebase produced thirteen distinct operations, and
 * this is those thirteen. That matters in both directions — Dexie satisfies it without
 * adaptation because its API is a superset, and a SQLite implementation only has to
 * provide this much rather than reimplement an ORM.
 *
 * Anything richer belongs in a repository function, not here.
 */

export interface Query<T> {
  toArray(): Promise<T[]>;
  /** Used by the outbox, which drains in batches rather than all at once. */
  limit(count: number): Query<T>;
  /** Newest-first listings. */
  reverse(): Query<T>;
  count(): Promise<number>;
  /** Returns how many rows went. */
  delete(): Promise<number>;
  sortBy(field: string): Promise<T[]>;
}

export interface WhereClause<T> {
  equals(value: string | number): Query<T>;
  /** Exclusive lower bound. Stats windows are the only caller. */
  above(value: string | number): Query<T>;
}

export interface Table<T> {
  get(key: string): Promise<T | undefined>;
  put(value: T): Promise<unknown>;
  add(value: T): Promise<unknown>;
  /** Partial patch by primary key. Returns how many rows matched. */
  update(key: string, changes: Partial<T>): Promise<number>;
  delete(key: string): Promise<void>;
  bulkPut(values: T[]): Promise<unknown>;
  bulkAdd(values: T[]): Promise<unknown>;
  count(): Promise<number>;
  toArray(): Promise<T[]>;
  clear(): Promise<void>;
  where(field: string): WhereClause<T>;
  orderBy(field: string): Query<T>;
}

/** An anime ID mapping, keyed `source:id`. */
export interface AnimeIdRow {
  id: string;
  ids: unknown;
  fetchedAt: number;
}

/** One pending upload, keyed `table:pk` so repeated edits coalesce. */
export interface OutboxRow {
  key: string;
  table: string;
  pk: string;
  row: Record<string, unknown>;
  updatedAt: number;
  deleted: boolean;
  attempts: number;
}

export interface SyncStateRow {
  key: string;
  value: number;
}

/**
 * One upload the server refused for a reason retrying cannot fix.
 *
 * Out of the queue so the rest can drain, and kept so nobody's write is deleted to
 * achieve that. See `sync/engine.ts`. §6.71.
 */
export interface RejectedRow extends OutboxRow {
  /** When it was set aside. */
  at: number;
  /** What the server said, verbatim. */
  reason: string;
}

/**
 * Tables are named and typed rather than generic, so a typo is a compile error and a
 * row's shape is known at every call site. The names match the Dexie schema and the
 * SQLite one, because having them differ would be a bug factory for no benefit.
 */
export interface Database {
  watches: Table<WatchEvent>;
  ratings: Table<Rating>;
  watchlist: Table<WatchlistItem>;
  library: Table<LibraryItem>;
  reactions: Table<Reaction>;
  titles: Table<CachedTitle>;
  episodes: Table<CachedEpisode>;
  providers: Table<CachedProviders>;
  animeIds: Table<AnimeIdRow>;
  outbox: Table<OutboxRow>;
  syncState: Table<SyncStateRow>;
  rejected: Table<RejectedRow>;

  /**
   * Run several writes atomically.
   *
   * The signature mirrors Dexie's because every existing call site uses it, and
   * because the alternative — passing an array of tables — reads worse at the call
   * site for no gain. Implementations may ignore the table list; it exists so Dexie
   * can lock the right stores.
   */
  transaction(mode: 'r' | 'rw', ...args: unknown[]): Promise<unknown>;

  /**
   * Be told once a write has settled, so an observer can correct what it drew.
   *
   * The two stores do not promise a reader the same thing during a write, and §6.135
   * measured it rather than assuming: an outside read during a ten-row write sees **10**
   * on Dexie, which queues it behind the commit, and **1** on SQLite, which answers it
   * through the connection holding the open transaction. When the write then fails, the
   * SQLite reader has been handed a row the store throws away.
   *
   * That is not academic on the phone. `mobile/src/useLive.ts` re-runs its query on
   * expo-sqlite's `addDatabaseChangeListener`, which fires **per statement** — so an
   * import writing hundreds of rows wakes the observer hundreds of times, every wake
   * reading uncommitted state. A **rollback is not a row change**, so nothing woke the
   * observer afterwards and the screen kept whatever it had drawn. This is what wakes it.
   *
   * There is deliberately no companion "is a write open" flag, and there was one for an
   * hour. An observer that skips a wake while a write is open draws **nothing at all**
   * during an import — the import is one long transaction, and §6.127's whole subject is
   * that a long import must be visibly under way. `mobile/smoke.mjs` said so: 202/202
   * without the flag, 201/202 with it, on "the import is visibly under way rather than
   * silent". Showing progress that a failure then takes back is a better screen than
   * showing nothing and snapping to the answer.
   *
   * Optional because Dexie needs it: IndexedDB already gives a reader all of a write or
   * none of it, and a failed write it never showed needs no correction. `DexieDatabase`
   * implements nothing and an observer on it behaves as it always has.
   */
  onSettled?(listener: () => void): () => void;

  /**
   * Reach a table by name.
   *
   * Only for the two places that genuinely do not know it at compile time: the sync
   * engine, which routes a change to whichever table it names, and the anime ID cache.
   * Everywhere else uses the typed properties above, and should.
   */
  table(name: string): Table<Record<string, unknown>>;

  /** Drop cached provider metadata, leaving user data alone. */
}

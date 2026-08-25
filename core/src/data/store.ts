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
   * Reach a table by name.
   *
   * Only for the two places that genuinely do not know it at compile time: the sync
   * engine, which routes a change to whichever table it names, and the anime ID cache.
   * Everywhere else uses the typed properties above, and should.
   */
  table(name: string): Table<Record<string, unknown>>;

  /** Drop cached provider metadata, leaving user data alone. */
}

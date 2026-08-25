import { getSqlJsLoader, type SqlJsLoader } from './sqlWasm';
import { db } from './db';
import { enqueueAll } from '../sync/engine';
import { applyWal } from './sqliteWal';
import { parseDioCache, type DioLibrary } from './diocacheParse';
import { tvtimeEpisodeId, tvtimeMovieId, tvtimeSeriesId } from './tvtimeRescue';
import type {
  CachedEpisode,
  CachedTitle,
  InternalId,
  LibraryItem,
  Rating,
  WatchEvent,
  WatchlistItem,
} from '../domain/types';

/**
 * Recover a TV Time library straight from `DioCache.db`.
 *
 * Doc 8 §3: the GDPR zip is how most people got their data out, and for everyone who
 * missed that window the local cache is the only copy left. The rescue tool that gets
 * recommended requires a desktop, Python, and an iOS backup; this runs in the browser
 * on whatever files the user managed to pull off their phone.
 *
 * The `-wal` sidecar is accepted and merged first. That is the difference between a
 * complete history and one quietly missing its most recent months — see `sqliteWal`.
 */

export interface DioImportReport {
  watches: number;
  rewatches: number;
  watchlist: number;
  ratings: number;
  library: number;
  /** Cached responses that held no library data. Normal, and worth showing. */
  unrecognised: number;
  warnings: string[];
}

let sqlPromise: ReturnType<SqlJsLoader> | undefined;

/**
 * Load SQLite lazily.
 *
 * Both the loader and its WebAssembly are pulled in only when someone actually imports
 * a cache, which is a once-ever act. The app supplies the loader because how the
 * binary is resolved differs per bundler; see `sqlWasm.ts`.
 */
function getSql() {
  sqlPromise ??= getSqlJsLoader()();
  return sqlPromise;
}

/** Pull every decodable JSON payload out of the cache table. */
export async function readDioCache(bytes: Uint8Array): Promise<unknown[]> {
  const SQL = await getSql();
  const database = new SQL.Database(bytes);
  try {
    const [result] = database.exec('select content from cache_dio');
    if (!result) return [];

    const decoder = new TextDecoder();
    const payloads: unknown[] = [];
    for (const [content] of result.values) {
      try {
        const text = content instanceof Uint8Array ? decoder.decode(content) : String(content);
        payloads.push(JSON.parse(text));
      } catch {
        // A half-written response is normal in a cache pulled off a live phone.
        payloads.push(null);
      }
    }
    return payloads;
  } finally {
    database.close();
  }
}

/**
 * Turn a parsed library into our own tables.
 *
 * Kept separate from the SQLite reading so it can be tested without WebAssembly, and
 * so the same conversion serves a GDPR zip that has already been decoded.
 */
export async function importDioLibrary(library: DioLibrary): Promise<DioImportReport> {
  const report: DioImportReport = {
    watches: 0,
    rewatches: 0,
    watchlist: 0,
    ratings: 0,
    library: 0,
    unrecognised: library.unrecognised,
    warnings: [],
  };

  const watches: WatchEvent[] = [];
  const watchlist: WatchlistItem[] = [];
  const ratings: Rating[] = [];
  const libraryItems: LibraryItem[] = [];
  /** Names and library rows implied by the history — see tvtimeRescue for the why. */
  const titles = new Map<InternalId, CachedTitle>();
  const derived = new Map<InternalId, LibraryItem>();
  /** Watched episodes as episodes, so a title page has content and a later match has
   *  season and number to map by — see tvtimeRescue for the full reasoning. */
  const episodes = new Map<InternalId, CachedEpisode>();

  const DAY = 86_400_000;
  const dateOf = (value?: string) => {
    const t = value ? Date.parse(value.replace(' ', 'T')) : NaN;
    return Number.isFinite(t) ? t : Date.now();
  };

  for (const movie of library.movies) {
    const titleId = tvtimeMovieId(movie.title);

    if (movie.watched) {
      const times = Math.max(1, movie.rewatchCount + 1);
      const watchedAt = dateOf(movie.watchedAt);
      for (let i = 0; i < times; i++) {
        watches.push({
          // Deterministic, so re-importing corrects rather than duplicating — and so
          // this agrees with the CSV importer if someone runs both.
          id: `${titleId}#${i}`,
          targetId: titleId,
          watchedAt: watchedAt - i * DAY,
          runtimeMin: movie.runtimeMin,
          source: 'import',
        });
      }
      report.watches += times;
      report.rewatches += times - 1;
    }

    if (movie.watchLater) {
      watchlist.push({ titleId, kind: 'film', addedAt: Date.now() });
      report.watchlist++;
    }

    if (movie.rating && movie.rating > 0) {
      // TV Time rated out of ten; ours is out of five in half steps.
      ratings.push({
        targetId: titleId,
        value: Math.min(5, Math.max(0.5, Math.round(movie.rating / 2 / 0.5) * 0.5)),
        ratedAt: Date.now(),
      });
      report.ratings++;
    }
  }

  for (const show of library.series) {
    const titleId = tvtimeSeriesId(show.id, show.title);
    // fetchedAt of 0 marks this stale from the moment it is written, so the first
    // screen that asks a provider about the show replaces the placeholder.
    titles.set(titleId, { id: titleId, kind: 'show', name: show.title, fetchedAt: 0 });
    libraryItems.push({
      titleId,
      kind: 'show',
      // Archived in TV Time meant "done with this", which is closest to dropped.
      status: show.archived ? 'dropped' : show.upToDate ? 'completed' : 'watching',
      addedAt: Date.now(),
    });
    report.library++;

    if (show.forLater) {
      watchlist.push({ titleId, kind: 'show', addedAt: Date.now() });
      report.watchlist++;
    }
  }

  for (const episode of library.episodes) {
    if (!episode.seen) continue;

    const seriesId = tvtimeSeriesId(episode.showId, episode.show);
    const targetId = tvtimeEpisodeId(
      episode.episodeId,
      episode.show,
      episode.season,
      episode.number,
    );
    const times = Math.max(1, episode.timesWatched);
    const watchedAt = dateOf(episode.seenDate);

    // A cache can hold episodes of a show whose own row did not survive, and without
    // this the history for it lands under an ID with no name and nothing tracking it.
    titles.set(seriesId, { id: seriesId, kind: 'show', name: episode.show, fetchedAt: 0 });
    episodes.set(targetId, {
      id: targetId,
      seriesId,
      season: episode.season,
      number: episode.number,
      name: episode.name?.trim() || `Episode ${episode.number}`,
      fetchedAt: 0,
    });
    derived.set(seriesId, {
      titleId: seriesId,
      kind: 'show',
      // Watching, not completed: the cache says what was seen, never whether the show
      // has finished, and completed would drop a live one out of Up Next for good.
      status: 'watching',
      addedAt: Date.now(),
    });

    for (let i = 0; i < times; i++) {
      watches.push({
        id: `${targetId}#${i}`,
        targetId,
        seriesId,
        // Only the most recent date is known; earlier viewings step back a day each
        // so ordering stays sensible without inventing precision.
        watchedAt: watchedAt - i * DAY,
        source: 'import',
      });
    }
    report.watches += times;
    report.rewatches += times - 1;
  }

  await db.transaction(
    'rw',
    db.watches,
    db.watchlist,
    db.ratings,
    db.library,
    db.titles,
    db.episodes,
    db.outbox,
    async () => {
      if (watches.length) await db.watches.bulkPut(watches);
      if (watchlist.length) await db.watchlist.bulkPut(watchlist);
      if (ratings.length) await db.ratings.bulkPut(ratings);
      // An explicit series row is a statement about status and wins over one derived
      // from a watch.
      if (libraryItems.length) await db.library.bulkPut(libraryItems);

      // Added where absent, never over the top: re-importing must not reset a status
      // somebody has changed, or replace a title a provider has since filled in.
      const missingLibrary: LibraryItem[] = [];
      for (const [titleId, item] of derived) {
        if (libraryItems.some((row) => row.titleId === titleId)) continue;
        if (await db.library.get(titleId)) continue;
        missingLibrary.push(item);
      }
      if (missingLibrary.length) {
        await db.library.bulkPut(missingLibrary);
        report.library += missingLibrary.length;
      }

      const missingTitles: CachedTitle[] = [];
      for (const [id, title] of titles) {
        if (await db.titles.get(id)) continue;
        missingTitles.push(title);
      }
      if (missingTitles.length) await db.titles.bulkPut(missingTitles);

      const missingEpisodes: CachedEpisode[] = [];
      for (const [id, episode] of episodes) {
        if (await db.episodes.get(id)) continue;
        missingEpisodes.push(episode);
      }
      if (missingEpisodes.length) await db.episodes.bulkPut(missingEpisodes);

      // Queued for upload, same as the CSV importer and for the same reason. Titles and
      // episodes stay out of it: a TTL'd cache of somebody else's data is not ours to
      // replicate.
      await enqueueAll('watches', watches as unknown as Array<Record<string, unknown>>);
      await enqueueAll('watchlist', watchlist as unknown as Array<Record<string, unknown>>);
      await enqueueAll('ratings', ratings as unknown as Array<Record<string, unknown>>);
      await enqueueAll('library', [
        ...libraryItems,
        ...missingLibrary,
      ] as unknown as Array<Record<string, unknown>>);
    },
  );

  return report;
}

/**
 * Import a `DioCache.db`, optionally with its write-ahead log.
 *
 * The absence of a `-wal` is called out rather than passed over. Someone who copied
 * only the `.db` has probably lost their most recent months and has no way to know it
 * — that silent partial recovery is the exact failure doc 8 identified in the tool
 * everyone is being pointed at.
 */
export async function importDioCache(
  dbBytes: Uint8Array,
  walBytes?: Uint8Array,
): Promise<DioImportReport> {
  const merged = applyWal(dbBytes, walBytes);

  let payloads: unknown[];
  try {
    payloads = await readDioCache(merged.database);
  } catch (e) {
    return {
      watches: 0,
      rewatches: 0,
      watchlist: 0,
      ratings: 0,
      library: 0,
      unrecognised: 0,
      warnings: [
        `Could not read that as a TV Time cache: ${e instanceof Error ? e.message : 'unknown error'}`,
      ],
    };
  }

  const report = await importDioLibrary(parseDioCache(payloads));
  report.warnings.unshift(...merged.warnings);

  if (!walBytes) {
    report.warnings.push(
      'No DioCache.db-wal was supplied. TV Time ran SQLite in write-ahead mode, so the ' +
        'most recent months often live in that file rather than in DioCache.db. If it ' +
        'exists alongside the database, add it and import again.',
    );
  } else if (merged.pagesApplied > 0) {
    report.warnings.push(
      `Recovered ${merged.pagesApplied} page(s) from the write-ahead log that DioCache.db ` +
        'alone would have missed.',
    );
  }

  if (report.unrecognised > 0) {
    report.warnings.push(
      `${report.unrecognised} cached response(s) held no library data. That is normal — ` +
        'the cache also holds artwork and search results.',
    );
  }

  report.warnings.push(
    'Recovered titles are keyed to TV Time IDs, so they will look like placeholders ' +
      'until they are matched against a metadata provider.',
  );

  return report;
}

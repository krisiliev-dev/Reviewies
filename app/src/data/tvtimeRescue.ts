import { db } from './db';
import { makeId } from '../domain/types';
import { parseCsv } from './transfer';
import type { LibraryItem, Rating, WatchEvent, WatchlistItem } from '../domain/types';

/**
 * Import from the TV Time rescue tool.
 *
 * When TV Time shut down it deleted 26 million watch histories, but the app had
 * cached its data locally in a SQLite file. `Marak123/tvtime-rescue-data` extracts
 * that from an iOS backup — for many people it is the only surviving copy of years of
 * viewing, so this importer is written against its actual output rather than guessed
 * at, and errs toward keeping data it is unsure about.
 *
 * Columns verified against the tool's source (`tvtime_rescue/extract/parse.py`):
 *
 *   episodes.csv  show, season, number, name, seen, seen_date, times_watched,
 *                 air_date, show_id, episode_id
 *   movies.csv    title, year, genres, watched, watch_later, watched_at,
 *                 rewatch_count, rating, runtime_min, imdb_id, overview
 *   series.csv    title, watched_eps, aired_eps, status, progress, up_to_date,
 *                 favorite, archived, for_later, watchedDate
 */

export type RescueFile = 'episodes' | 'movies' | 'series' | 'unknown';

export interface RescueReport {
  file: RescueFile;
  watches: number;
  rewatches: number;
  watchlist: number;
  ratings: number;
  library: number;
  skipped: number;
  warnings: string[];
}

const empty = (file: RescueFile): RescueReport => ({
  file,
  watches: 0,
  rewatches: 0,
  watchlist: 0,
  ratings: 0,
  library: 0,
  skipped: 0,
  warnings: [],
});

/**
 * The tool writes UTF-8 with a BOM (`utf-8-sig`). Left in place it becomes part of the
 * first header name, so every column match against `show` or `title` silently fails
 * and the file looks unrecognisable.
 */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function detectRescueFile(header: string[]): RescueFile {
  const set = new Set(header.map((h) => h.trim().toLowerCase()));
  if (set.has('show') && set.has('season') && set.has('number') && set.has('seen')) {
    return 'episodes';
  }
  if (set.has('title') && set.has('watch_later') && set.has('rewatch_count')) return 'movies';
  if (set.has('title') && set.has('watched_eps') && set.has('aired_eps')) return 'series';
  return 'unknown';
}

/** Python writes booleans as `True`/`False`; be liberal about everything else. */
export function parseBool(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

function parseNumber(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function parseDate(value: string | undefined, fallback = Date.now()): number {
  if (!value?.trim()) return fallback;
  const t = Date.parse(value.trim());
  return Number.isFinite(t) ? t : fallback;
}

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * Import one rescue CSV.
 *
 * Rows are keyed by the tool's own `episode_id` where present, so a re-import updates
 * rather than duplicating. Where TV Time's IDs are unavailable a deterministic local
 * ID is derived instead — the history is preserved with a stable key that a later
 * reconciliation pass can map onto real provider IDs.
 */
export async function importRescueCsv(rawText: string): Promise<RescueReport> {
  const rows = parseCsv(stripBom(rawText));
  if (rows.length < 2) {
    const report = empty('unknown');
    report.warnings.push('That file looks empty.');
    return report;
  }

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const file = detectRescueFile(header);
  const report = empty(file);

  if (file === 'unknown') {
    report.warnings.push(
      `Not a recognised TV Time rescue file. Expected episodes.csv, movies.csv or ` +
        `series.csv; saw columns: ${header.slice(0, 8).join(', ')}.`,
    );
    return report;
  }

  const col = (name: string) => header.indexOf(name);
  const cell = (row: string[], name: string) => {
    const i = col(name);
    return i === -1 ? undefined : row[i];
  };

  const watches: WatchEvent[] = [];
  const watchlist: WatchlistItem[] = [];
  const ratings: Rating[] = [];
  const library: LibraryItem[] = [];

  for (const row of rows.slice(1)) {
    if (file === 'episodes') {
      const show = cell(row, 'show')?.trim();
      if (!show) {
        report.skipped++;
        continue;
      }

      // Unseen episodes are still catalogue, not history — skip rather than
      // inventing a watch.
      if (!parseBool(cell(row, 'seen'))) continue;

      const episodeId = cell(row, 'episode_id')?.trim();
      const showId = cell(row, 'show_id')?.trim();
      const season = parseNumber(cell(row, 'season')) ?? 0;
      const number = parseNumber(cell(row, 'number')) ?? 0;

      const seriesId = showId
        ? makeId('local', 'tv', `tvtime-${showId}`)
        : makeId('local', 'tv', slug(show));
      const targetId = episodeId
        ? makeId('local', 'ep', `tvtime-${episodeId}`)
        : makeId('local', 'ep', `${slug(show)}-s${season}-e${number}`);

      const watchedAt = parseDate(cell(row, 'seen_date'));
      // times_watched carries rewatches. Recording only one would quietly discard
      // exactly the history rewatch counts exist to preserve.
      const times = Math.max(1, parseNumber(cell(row, 'times_watched')) ?? 1);

      for (let i = 0; i < times; i++) {
        watches.push({
          // Deterministic per occurrence, so re-importing updates rather than
          // duplicating.
          id: `${targetId}#${i}`,
          targetId,
          seriesId,
          // Only the most recent date is known; earlier viewings are spaced back a
          // day each so ordering stays sensible without inventing precision.
          watchedAt: watchedAt - i * 86_400_000,
          source: 'import',
        });
      }
      report.watches += times;
      if (times > 1) report.rewatches += times - 1;
    }

    if (file === 'movies') {
      const title = cell(row, 'title')?.trim();
      if (!title) {
        report.skipped++;
        continue;
      }

      const titleId = makeId('local', 'movie', slug(title));
      const runtime = parseNumber(cell(row, 'runtime_min'));

      if (parseBool(cell(row, 'watched'))) {
        const times = Math.max(1, (parseNumber(cell(row, 'rewatch_count')) ?? 0) + 1);
        const watchedAt = parseDate(cell(row, 'watched_at'));
        for (let i = 0; i < times; i++) {
          watches.push({
            id: `${titleId}#${i}`,
            targetId: titleId,
            watchedAt: watchedAt - i * 86_400_000,
            runtimeMin: runtime,
            source: 'import',
          });
        }
        report.watches += times;
        if (times > 1) report.rewatches += times - 1;
      }

      if (parseBool(cell(row, 'watch_later'))) {
        watchlist.push({ titleId, kind: 'film', addedAt: Date.now() });
        report.watchlist++;
      }

      // TV Time rated out of 10; ours is out of 5 in half steps.
      const rating = parseNumber(cell(row, 'rating'));
      if (rating && rating > 0) {
        ratings.push({
          targetId: titleId,
          value: Math.min(5, Math.max(0.5, Math.round((rating / 2) * 2) / 2)),
          ratedAt: Date.now(),
        });
        report.ratings++;
      }
    }

    if (file === 'series') {
      const title = cell(row, 'title')?.trim();
      if (!title) {
        report.skipped++;
        continue;
      }

      const titleId = makeId('local', 'tv', slug(title));
      const archived = parseBool(cell(row, 'archived'));
      const upToDate = parseBool(cell(row, 'up_to_date'));

      library.push({
        titleId,
        kind: 'show',
        // Archived in TV Time meant "done with this", which is closest to dropped;
        // up to date on a finished show is closest to completed.
        status: archived ? 'dropped' : upToDate ? 'completed' : 'watching',
        addedAt: Date.now(),
      });
      report.library++;

      if (parseBool(cell(row, 'for_later'))) {
        watchlist.push({ titleId, kind: 'show', addedAt: Date.now() });
        report.watchlist++;
      }
    }
  }

  await db.transaction('rw', db.watches, db.watchlist, db.ratings, db.library, async () => {
    if (watches.length) await db.watches.bulkPut(watches);
    if (watchlist.length) await db.watchlist.bulkPut(watchlist);
    if (ratings.length) await db.ratings.bulkPut(ratings);
    if (library.length) await db.library.bulkPut(library);
  });

  if (report.skipped) {
    report.warnings.push(`${report.skipped} row(s) had no title and were skipped.`);
  }
  if (file === 'episodes') {
    report.warnings.push(
      'Episodes are keyed to TV Time IDs, so titles will look like placeholders until ' +
        'they are matched against a metadata provider.',
    );
  }

  return report;
}

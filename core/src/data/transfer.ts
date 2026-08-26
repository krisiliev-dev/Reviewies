import { db } from './db.ts';
import { enqueueAll } from '../sync/engine.ts';
import { makeId } from '../domain/types.ts';
import { fetchAccountExport, type AccountExport } from '../social/exportAccount.ts';
import type { MediaKind, WatchEvent } from '../domain/types.ts';

/**
 * Import and export.
 *
 * This is the feature the whole project exists for. TV Time deleted 26 million
 * people's watch histories, and one community explicitly asked whether charging for
 * data export is even GDPR-compliant. So: export is free, complete, unauthenticated,
 * and always available.
 *
 * Exports contain user data only. Provider metadata is deliberately excluded — it is
 * not ours to redistribute, and TMDB's terms forbid it.
 *
 * "Complete" had a hole in it until somebody read the sentence and went looking: lists,
 * the people you follow and every comment you have written live on the server and were
 * in no export at all. They are in `account` now, which is present only when there is an
 * account to read — absent means there was none, empty means there was nothing in it.
 */

/**
 * 2 added `account`. A version 1 file is still read: everything it holds is still
 * here under the same names, and the new field is optional by construction.
 */
export const EXPORT_VERSION = 2;

export interface ExportBundle {
  format: 'reviewies-export';
  version: number;
  exportedAt: string;
  library: unknown[];
  watches: unknown[];
  ratings: unknown[];
  watchlist: unknown[];
  reactions: unknown[];
  /** Absent when signed out. See `fetchAccountExport`. */
  account?: AccountExport;
  /**
   * Set when there was an account and its half could not be read.
   *
   * The distinction matters: `account` absent normally means there was no account, and
   * a person who has one would otherwise get a file that looks complete and quietly is
   * not. The local half is written either way — "no account needed" is the promise, and
   * a slow server must never be able to take the export with it.
   */
  accountUnavailable?: string;
}

/**
 * Everything of yours, in one file.
 *
 * The account fetch is injectable because it is the only part that touches a network:
 * the local half must never be able to fail because a server was slow, and a test of
 * the local half must never depend on one being there.
 */
export async function exportAll(
  options: { account?: () => Promise<AccountExport | undefined> } = {},
): Promise<ExportBundle> {
  const [library, watches, ratings, watchlist, reactions] = await Promise.all([
    db.library.toArray(),
    db.watches.toArray(),
    db.ratings.toArray(),
    db.watchlist.toArray(),
    db.reactions.toArray(),
  ]);

  let account: AccountExport | undefined;
  let accountUnavailable: string | undefined;
  try {
    account = await (options.account ?? fetchAccountExport)();
  } catch (e) {
    accountUnavailable = e instanceof Error ? e.message : 'Could not read your account data';
  }

  return {
    format: 'reviewies-export',
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    library,
    watches,
    ratings,
    watchlist,
    reactions,
    ...(account ? { account } : {}),
    ...(accountUnavailable ? { accountUnavailable } : {}),
  };
}

/** Watch history as CSV, for spreadsheets and for importing into other trackers. */
export async function exportWatchesCsv(): Promise<string> {
  const watches = await db.watches.orderBy('watchedAt').toArray();
  const titles = new Map((await db.titles.toArray()).map((t) => [t.id, t]));
  const episodes = new Map((await db.episodes.toArray()).map((e) => [e.id, e]));

  const rows = [['watched_at', 'series', 'season', 'episode', 'title', 'target_id', 'runtime_min']];

  for (const w of watches) {
    const ep = episodes.get(w.targetId);
    const series = w.seriesId ? titles.get(w.seriesId) : titles.get(w.targetId);
    rows.push([
      new Date(w.watchedAt).toISOString(),
      series?.name ?? '',
      ep ? String(ep.season) : '',
      ep ? String(ep.number) : '',
      ep?.name ?? series?.name ?? '',
      w.targetId,
      w.runtimeMin != null ? String(w.runtimeMin) : '',
    ]);
  }
  return toCsv(rows);
}

export function toCsv(rows: string[][]): string {
  const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return rows.map((r) => r.map(escape).join(',')).join('\n');
}

/** Minimal RFC-4180-ish parser: handles quoted fields, embedded commas and escaped quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }

    if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') field += c;
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

// ---------------------------------------------------------------------------
// Importing
// ---------------------------------------------------------------------------

export interface ImportReport {
  watches: number;
  watchlist: number;
  skipped: number;
  warnings: string[];
  /**
   * The account half of a restored export, handed on rather than consumed.
   *
   * The local import cannot put it back — it needs a network and an account — so it
   * comes out here for the screen to offer as a second step. Without this the data
   * would be sitting in a file the app had just read and thrown away.
   */
  account?: AccountExport;
}

/** Restore a Reviewies export. Additive — existing data is preserved. */
export async function importBundle(bundle: ExportBundle): Promise<ImportReport> {
  if (bundle.format !== 'reviewies-export') {
    throw new Error('Not a Reviewies export file');
  }
  const report: ImportReport = { watches: 0, watchlist: 0, skipped: 0, warnings: [] };

  if (bundle.version > EXPORT_VERSION) {
    report.warnings.push(
      `File was written by a newer version (v${bundle.version}); some fields may be ignored.`,
    );
  }

  await db.transaction(
    'rw',
    db.library,
    db.watches,
    db.ratings,
    db.watchlist,
    db.reactions,
    db.outbox,
    async () => {
      await db.library.bulkPut(bundle.library as never[]);
      await db.watches.bulkPut(bundle.watches as never[]);
      await db.ratings.bulkPut(bundle.ratings as never[]);
      await db.watchlist.bulkPut(bundle.watchlist as never[]);
      await db.reactions.bulkPut(bundle.reactions as never[]);

      // Restoring your own backup is a write like any other. Without this it landed on
      // one device and reached no other, which is a strange thing for a restore to do.
      await enqueueAll('library', bundle.library as Array<Record<string, unknown>>);
      await enqueueAll('watches', bundle.watches as Array<Record<string, unknown>>);
      await enqueueAll('ratings', bundle.ratings as Array<Record<string, unknown>>);
      await enqueueAll('watchlist', bundle.watchlist as Array<Record<string, unknown>>);
      await enqueueAll('reactions', bundle.reactions as Array<Record<string, unknown>>);
    },
  );

  report.watches = bundle.watches.length;
  report.watchlist = bundle.watchlist.length;

  // The account half needs a network and an account, so it cannot happen inside this
  // transaction. Named rather than dropped: `restoreAccount` is the second step, and
  // the screens offer it once this one has landed.
  const account = bundle.account;
  if (account) {
    const carried = [
      account.lists.length && `${account.lists.length} list(s)`,
      account.following.length && `${account.following.length} follow(s)`,
    ].filter(Boolean);
    if (carried.length) {
      report.warnings.push(
        `The file also holds ${carried.join(' and ')} from an account. Sign in and restore them separately.`,
      );
    }
    if (account.comments.length) {
      report.warnings.push(
        `${account.comments.length} comment(s) are kept in the file and are not posted again.`,
      );
    }
    if (account.lists.length || account.following.length) report.account = account;
  }

  return report;
}

/**
 * Import a watch history CSV from another tracker.
 *
 * Column names are sniffed rather than fixed, because the exports we care about are
 * not standardised: the TV Time rescue tool, Trakt, Simkl and Letterboxd all use
 * different headers, and TV Time's own GDPR format changed more than once before the
 * shutdown. Sniffing degrades gracefully — an unrecognised column is reported rather
 * than silently dropped.
 */
export async function importWatchHistoryCsv(text: string): Promise<ImportReport> {
  const rows = parseCsv(text);
  const report: ImportReport = { watches: 0, watchlist: 0, skipped: 0, warnings: [] };
  if (rows.length < 2) {
    report.warnings.push('File appears to be empty.');
    return report;
  }

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => {
    for (const n of names) {
      const i = header.findIndex((h) => h === n || h.replace(/[\s_-]/g, '') === n.replace(/[\s_-]/g, ''));
      if (i !== -1) return i;
    }
    return -1;
  };

  const iSeries = col('series', 'show', 'series_name', 'show_name', 'title', 'name');
  const iSeason = col('season', 'season_number', 'seasonnumber');
  const iEpisode = col('episode', 'episode_number', 'episodenumber');
  const iDate = col('watched_at', 'watched_date', 'date', 'last_watched', 'created_at');
  const iTmdb = col('tmdb_id', 'tmdb', 'themoviedb_id');

  if (iSeries === -1 && iTmdb === -1) {
    report.warnings.push(
      `Could not find a title or TMDB ID column. Saw: ${header.join(', ')}. Nothing was imported.`,
    );
    return report;
  }

  const events: WatchEvent[] = [];

  for (const row of rows.slice(1)) {
    const seriesName = iSeries >= 0 ? row[iSeries]?.trim() : '';
    const tmdbId = iTmdb >= 0 ? row[iTmdb]?.trim() : '';
    if (!seriesName && !tmdbId) {
      report.skipped++;
      continue;
    }

    const watchedAt = parseDate(iDate >= 0 ? row[iDate] : undefined);
    const season = iSeason >= 0 ? Number(row[iSeason]) : undefined;
    const episode = iEpisode >= 0 ? Number(row[iEpisode]) : undefined;

    // Imported rows carry no stable provider episode ID, so they are keyed by a
    // deterministic local ID. A later reconciliation pass can map these onto real
    // provider IDs once the show is matched; until then the history is preserved
    // rather than lost, which is the point.
    const seriesId = tmdbId
      ? makeId('tmdb', 'tv', tmdbId)
      : makeId('local', 'tv', slug(seriesName));

    const targetId =
      Number.isFinite(season) && Number.isFinite(episode)
        ? makeId('local', 'ep', `${slug(seriesName || tmdbId)}-s${season}-e${episode}`)
        : seriesId;

    events.push({
      id: `${targetId}@${watchedAt}`,
      targetId,
      seriesId: targetId === seriesId ? undefined : seriesId,
      watchedAt,
      source: 'import',
    });
  }

  if (events.length) {
    await db.watches.bulkPut(events);
    await enqueueAll('watches', events as unknown as Array<Record<string, unknown>>);
  }
  report.watches = events.length;

  if (report.skipped) {
    report.warnings.push(`${report.skipped} row(s) had no recognisable title and were skipped.`);
  }
  return report;
}

function parseDate(value?: string): number {
  if (!value) return Date.now();
  const t = Date.parse(value.trim());
  return Number.isFinite(t) ? t : Date.now();
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Hand a file to the user.
 *
 * Bound by the app, because "save this file" has no shared implementation: the web
 * makes an object URL and clicks an anchor, a phone writes to the document directory
 * and opens a share sheet. The export itself — which is the part that matters, and the
 * promise the whole product rests on — is platform-agnostic and lives above this.
 */
export type FileSaver = (name: string, content: string, type: string) => void | Promise<void>;

let saver: FileSaver | undefined;

export function setFileSaver(save: FileSaver): void {
  saver = save;
}

export async function downloadFile(name: string, content: string, type: string): Promise<void> {
  if (!saver) {
    throw new Error(
      'This app has not set up file saving. Call setFileSaver() from your entry point.',
    );
  }
  await saver(name, content, type);
}

export async function addWatchlistFromTitles(
  titles: Array<{ id: string; kind: MediaKind; note?: string }>,
): Promise<number> {
  const rows = titles.map((t) => ({
    titleId: t.id,
    kind: t.kind,
    addedAt: Date.now(),
    note: t.note,
  }));
  await db.watchlist.bulkPut(rows);
  await enqueueAll('watchlist', rows as unknown as Array<Record<string, unknown>>);
  return titles.length;
}

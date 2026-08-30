import { unzipSync } from 'fflate';
import { importBundle, importWatchHistoryCsv, parseCsv, type ImportReport } from './transfer.ts';
import { detectRescueFile, importRescueCsv, stripBom } from './tvtimeRescue.ts';
import { importDioCache } from './diocache.ts';
import { whileImporting } from './importing.ts';

/**
 * Import a whole archive: a TV Time GDPR zip, or a folder of recovered files.
 *
 * Doc 8 §3: the GDPR zip is how most people got their data out of TV Time before it
 * shut down, every tracker in the field is judged on it, and most of them import it
 * badly. It was item 4 on doc 4's MVP list and we could not open a zip at all.
 *
 * **Entries are recognised by their contents, never by their names.** No real GDPR zip
 * was available to build this against, and TV Time's export format changed more than
 * once before the shutdown — so matching on filenames would be a guess that fails
 * silently on anyone whose export differs. Sniffing costs nothing and degrades into a
 * list of what could not be placed, which is something the user can act on and report.
 *
 * A `DioCache.db` inside the archive is handled too, with its `-wal` sidecar paired up
 * automatically: the iOS recovery guides circulating on r/tvtime produce exactly that
 * pair, often inside a TAR or zip.
 */

export interface ArchiveReport extends ImportReport {
  /** Every entry, and what was made of it. Shown in full: silence is the failure. */
  files: Array<{ name: string; outcome: string }>;
}

const empty = (): ArchiveReport => ({
  watches: 0,
  watchlist: 0,
  skipped: 0,
  warnings: [],
  files: [],
});

const SQLITE_MAGIC = 'SQLite format 3\0';

/**
 * Compared as bytes rather than decoded to text.
 *
 * This read the first sixteen bytes through `new TextDecoder('latin1')`, which every
 * browser and Node accept and **Hermes does not**: React Native's TextDecoder implements
 * UTF-8 alone, so on a real iPhone the sniff threw `Unknown encoding: latin1` and took
 * every import down with it — zip, CSV and database alike, since this is the first thing
 * any of them runs. It worked in all five suites because all five run on Node.
 *
 * Decoding was never needed. A magic number is bytes; turning them into text to compare
 * them to text is a detour whose only contribution was an encoding to get wrong. The
 * header is ASCII, so a byte is its code unit.
 */
function isSqlite(bytes: Uint8Array): boolean {
  if (bytes.byteLength < SQLITE_MAGIC.length) return false;
  for (let i = 0; i < SQLITE_MAGIC.length; i++) {
    if (bytes[i] !== SQLITE_MAGIC.charCodeAt(i)) return false;
  }
  return true;
}

/** Ignore the noise every archiver adds, so it is not reported as unrecognised. */
function isJunk(name: string): boolean {
  const base = name.split('/').pop() ?? name;
  return (
    name.endsWith('/') ||
    base.startsWith('.') ||
    base === 'Thumbs.db' ||
    name.startsWith('__MACOSX/')
  );
}

/**
 * Import one already-extracted file.
 *
 * Exported so the same routing serves a single file dropped on the settings screen —
 * one code path decides what something is, rather than two that can disagree.
 */
export async function importArchiveEntry(
  name: string,
  bytes: Uint8Array,
  wal?: Uint8Array,
): Promise<{ report: Partial<ImportReport>; outcome: string }> {
  if (isSqlite(bytes)) {
    const dio = await importDioCache(bytes, wal);
    return {
      report: { watches: dio.watches, watchlist: dio.watchlist, warnings: dio.warnings },
      outcome: `TV Time cache — ${dio.watches} watch(es), ${dio.library} show(s)`,
    };
  }

  const text = stripBom(new TextDecoder().decode(bytes));

  if (text.trimStart().startsWith('{')) {
    try {
      const report = await importBundle(JSON.parse(text));
      return { report, outcome: `Reviewies export — ${report.watches} watch(es)` };
    } catch {
      return { report: {}, outcome: 'JSON, but not a format we recognise' };
    }
  }

  const header = parseCsv(text)[0] ?? [];
  const rescue = detectRescueFile(header);
  if (rescue !== 'unknown') {
    const report = await importRescueCsv(text);
    return {
      report: { watches: report.watches, watchlist: report.watchlist, skipped: report.skipped },
      outcome: `TV Time ${rescue}.csv — ${report.watches} watch(es)`,
    };
  }

  if (header.length > 1) {
    const report = await importWatchHistoryCsv(text);
    if (report.watches > 0 || report.watchlist > 0) {
      return { report, outcome: `Watch history — ${report.watches} watch(es)` };
    }
    return { report: {}, outcome: `CSV with no history we could read (${header.slice(0, 4).join(', ')})` };
  }

  return { report: {}, outcome: `Not recognised (${name.split('.').pop() ?? 'no extension'})` };
}

/**
 * Pair a `-wal` with the database it belongs to.
 *
 * SQLite's own convention: the log is the database's name with `-wal` appended. Pairing
 * them here rather than asking the user to is the point — the file is easy to miss, and
 * missing it costs the most recent months of their history.
 */
export function pairWal(names: string[]): Map<string, string> {
  const pairs = new Map<string, string>();
  const present = new Set(names);
  for (const name of names) {
    if (name.endsWith('-wal') && present.has(name.slice(0, -4))) {
      pairs.set(name.slice(0, -4), name);
    }
  }
  return pairs;
}

async function importArchiveNow(zip: Uint8Array): Promise<ArchiveReport> {
  const report = empty();

  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(zip);
  } catch (e) {
    report.warnings.push(
      `Could not open that as a zip: ${e instanceof Error ? e.message : 'unknown error'}`,
    );
    return report;
  }

  const names = Object.keys(entries).filter((n) => !isJunk(n));
  const wals = pairWal(names);
  const walFiles = new Set(wals.values());

  for (const name of names.sort()) {
    // Logs are imported with their database, not on their own.
    if (walFiles.has(name)) continue;

    const { report: partial, outcome } = await importArchiveEntry(
      name,
      entries[name],
      wals.has(name) ? entries[wals.get(name)!] : undefined,
    );

    report.watches += partial.watches ?? 0;
    report.watchlist += partial.watchlist ?? 0;
    report.skipped += partial.skipped ?? 0;
    report.warnings.push(...(partial.warnings ?? []));
    // A zip normally holds one export; if it somehow held two, the first one's lists
    // are the ones offered rather than a silent merge of both.
    report.account ??= partial.account;
    report.files.push({ name, outcome });
  }

  if (report.files.length === 0) {
    report.warnings.push('That zip held nothing we could read.');
  }

  return report;
}

/** Announced while it runs. §6.80. Nested announcements are fine — see `importing.ts`. */
export function importArchive(zip: Uint8Array): Promise<ArchiveReport> {
  return whileImporting('your TV Time archive', () => importArchiveNow(zip));
}

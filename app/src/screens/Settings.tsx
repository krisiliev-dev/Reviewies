import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../data/db';
import { getStats } from '@reviewies/core/data/repo';
import { formatDuration } from '@reviewies/core/stats/compute';
import { downloadFile, exportAll, exportWatchesCsv, type ImportReport } from '@reviewies/core/data/transfer';
import { JUSTWATCH_ATTRIBUTION, TMDB_ATTRIBUTION, usingFixtures } from '@reviewies/core/metadata/index';
import { importArchive, importArchiveEntry, pairWal } from '@reviewies/core/data/archiveImport';
import { Link } from 'react-router-dom';
import { AccountPanel } from './AccountPanel';
import { openCommentsAfterWatch, setOpenCommentsAfterWatch } from '@reviewies/core/data/prefs';

export function Settings() {
  const [report, setReport] = useState<ImportReport>();
  const [error, setError] = useState<string>();
  const [openComments, setOpenComments] = useState(openCommentsAfterWatch);
  const [files, setFiles] = useState<Array<{ name: string; outcome: string }>>();
  const [busy, setBusy] = useState(false);

  const stats = useLiveQuery(() => getStats('all'), [], undefined);
  const counts = useLiveQuery(
    async () => ({
      watches: await db.watches.count(),
      library: await db.library.count(),
      watchlist: await db.watchlist.count(),
      reactions: await db.reactions.count(),
    }),
    [],
    undefined,
  );

  /**
   * Import whatever the user has.
   *
   * One routing decision, made on contents rather than filenames, in
   * `archiveImport` — so a zip, a loose CSV and a recovered `DioCache.db` cannot be
   * treated inconsistently. Multiple files are accepted at once because the SQLite
   * recovery route produces a `DioCache.db` and a `DioCache.db-wal` that only mean
   * something together.
   */
  async function onImport(files: FileList) {
    setError(undefined);
    setReport(undefined);
    setFiles(undefined);
    setBusy(true);

    try {
      const picked = [...files];

      // A zip is the common case: TV Time's GDPR export.
      const zip = picked.find((f) => /\.zip$/i.test(f.name));
      if (zip) {
        const archive = await importArchive(new Uint8Array(await zip.arrayBuffer()));
        setReport(archive);
        setFiles(archive.files);
        return;
      }

      const wals = pairWal(picked.map((f) => f.name));
      const walNames = new Set(wals.values());
      const combined: ImportReport = { watches: 0, watchlist: 0, skipped: 0, warnings: [] };
      const outcomes: Array<{ name: string; outcome: string }> = [];

      for (const file of picked) {
        // A log is imported with its database, never alone.
        if (walNames.has(file.name)) continue;

        const walFile = wals.has(file.name)
          ? picked.find((f) => f.name === wals.get(file.name))
          : undefined;

        const { report: partial, outcome } = await importArchiveEntry(
          file.name,
          new Uint8Array(await file.arrayBuffer()),
          walFile ? new Uint8Array(await walFile.arrayBuffer()) : undefined,
        );

        combined.watches += partial.watches ?? 0;
        combined.watchlist += partial.watchlist ?? 0;
        combined.skipped += partial.skipped ?? 0;
        combined.warnings.push(...(partial.warnings ?? []));
        outcomes.push({ name: file.name, outcome });
      }

      setReport(combined);
      setFiles(outcomes);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that file');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      <h1 className="px-1 text-2xl font-semibold">Your data</h1>

      <AccountPanel />

      {/* People-management lives one level down rather than in the tab bar: the bar
          already carries eight destinations, and simplicity was the loudest single
          demand in the research. */}
      <Link
        to="/people"
        className="flex items-center justify-between rounded-2xl bg-surface px-4 py-3.5"
      >
        <span>
          <span className="font-semibold">People</span>
          <span className="block text-sm text-muted">Your handle, following, blocking</span>
        </span>
        <span aria-hidden className="text-muted">›</span>
      </Link>

      <section className="rounded-2xl bg-surface p-4">
        <p className="text-sm text-muted">
          Everything lives on this device. Nothing here needs an account, and nothing is
          withheld — this is the whole point of the app.
        </p>
        {counts && (
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <Stat label="Watches" value={counts.watches} />
            <Stat label="Tracked" value={counts.library} />
            <Stat label="Watchlist" value={counts.watchlist} />
            <Stat label="Reactions" value={counts.reactions} />
          </dl>
        )}
        {stats && stats.minutes > 0 && (
          <p className="mt-3 text-sm text-muted">
            {/* formatDuration rather than minutes/60: 90 minutes was rendering as
                "1 hours watched", which is wrong twice over. */}
            {formatDuration(stats.minutes)} watched, counted by actual runtime.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="px-1 text-sm font-semibold tracking-wide text-muted uppercase">Export</h2>
        <button
          onClick={async () =>
            downloadFile(
              `reviewies-${new Date().toISOString().slice(0, 10)}.json`,
              JSON.stringify(await exportAll(), null, 2),
              'application/json',
            )
          }
          className="rounded-xl bg-accent px-4 py-3 font-medium text-ink"
        >
          Export everything (JSON)
        </button>
        <button
          onClick={async () =>
            downloadFile(
              `reviewies-watches-${new Date().toISOString().slice(0, 10)}.csv`,
              await exportWatchesCsv(),
              'text/csv',
            )
          }
          className="rounded-xl bg-surface-2 px-4 py-3"
        >
          Export watch history (CSV)
        </button>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="px-1 text-sm font-semibold tracking-wide text-muted uppercase">Import</h2>
        <p className="px-1 text-sm text-muted">
          A TV Time GDPR zip, a Reviewies export, a CSV from the rescue tool, Trakt,
          Simkl or Letterboxd — or a recovered <code>DioCache.db</code> straight off your
          phone. Files are recognised by what is in them, not what they are called, and
          anything we cannot read is listed rather than silently dropped.
        </p>
        {/* The -wal is the difference between a complete history and one quietly
            missing its most recent months, so it has to be asked for by name. */}
        <p className="px-1 text-sm text-muted">
          If you have a <code>DioCache.db</code>, select its <code>DioCache.db-wal</code>{' '}
          at the same time. TV Time wrote its most recent months there, and importing the
          database alone loses them without telling you.
        </p>
        <label className="cursor-pointer rounded-xl bg-surface-2 px-4 py-3 text-center">
          {busy ? 'Reading…' : 'Choose files'}
          <input
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) void onImport(e.target.files);
              e.target.value = '';
            }}
          />
        </label>

        {error && <p className="px-1 text-sm text-accent">{error}</p>}
        {report && (
          <div className="rounded-xl bg-surface p-3 text-sm">
            <p>
              Imported {report.watches} watch{report.watches === 1 ? '' : 'es'}
              {report.watchlist > 0 && `, ${report.watchlist} watchlist items`}.
            </p>
            {files && files.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1">
                {files.map((f) => (
                  <li key={f.name} className="text-xs text-muted">
                    <span className="font-medium">{f.name}</span> — {f.outcome}
                  </li>
                ))}
              </ul>
            )}
            {report.warnings.map((w) => (
              <p key={w} className="mt-1 text-muted">
                {w}
              </p>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="px-1 text-sm font-semibold tracking-wide text-muted uppercase">
          Watching
        </h2>
        <label className="flex items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3.5">
          <span className="min-w-0">
            <span className="block">Open the conversation after marking watched</span>
            {/* Off is offered because anyone working through several episodes wants to
                stay put. Catching up in bulk has its own control, which never moves. */}
            <span className="block text-sm text-muted">How TV Time worked. Needs an account.</span>
          </span>
          <input
            type="checkbox"
            checked={openComments}
            onChange={(e) => {
              setOpenComments(e.target.checked);
              setOpenCommentsAfterWatch(e.target.checked);
            }}
            className="size-5 shrink-0 accent-accent"
          />
        </label>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="px-1 text-sm font-semibold tracking-wide text-muted uppercase">
          Metadata cache
        </h2>
        <p className="px-1 text-sm text-muted">
          Artwork and episode listings are cached from the metadata provider and expire
          automatically. Clearing them never touches your own history.
        </p>
        <button
          onClick={() => db.clearMetadataCache()}
          className="rounded-xl bg-surface-2 px-4 py-3"
        >
          Clear cached metadata
        </button>
      </section>

      <footer className="px-1 pb-4 text-xs leading-relaxed text-muted">
        {usingFixtures ? (
          <p className="mb-2">
            Running on sample data. Set <code>VITE_TMDB_TOKEN</code> to use real metadata.
          </p>
        ) : (
          <>
            <p>{TMDB_ATTRIBUTION}</p>
            <p>{JUSTWATCH_ATTRIBUTION}</p>
          </>
        )}
      </footer>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-surface-2 px-3 py-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../data/db';
import { getStats } from '../data/repo';
import {
  downloadFile,
  exportAll,
  exportWatchesCsv,
  importBundle,
  importWatchHistoryCsv,
  type ImportReport,
} from '../data/transfer';
import { JUSTWATCH_ATTRIBUTION, TMDB_ATTRIBUTION, usingFixtures } from '../metadata';

export function Settings() {
  const [report, setReport] = useState<ImportReport>();
  const [error, setError] = useState<string>();

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

  async function onImport(file: File) {
    setError(undefined);
    setReport(undefined);
    try {
      const text = await file.text();
      // A Reviewies export is JSON; anything else is treated as a CSV from
      // another tracker.
      const result = text.trimStart().startsWith('{')
        ? await importBundle(JSON.parse(text))
        : await importWatchHistoryCsv(text);
      setReport(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that file');
    }
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      <h1 className="px-1 text-2xl font-semibold">Your data</h1>

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
            {Math.round(stats.minutes / 60)} hours watched, counted by actual runtime.
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
          A Reviewies export, or a CSV from the TV Time rescue tool, Trakt, Simkl or
          Letterboxd. Column names are detected rather than assumed, and anything we cannot
          read is reported rather than silently dropped.
        </p>
        <label className="cursor-pointer rounded-xl bg-surface-2 px-4 py-3 text-center">
          Choose a file
          <input
            type="file"
            accept=".json,.csv,text/csv,application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onImport(file);
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

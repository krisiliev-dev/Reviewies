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
import { detectRescueFile, importRescueCsv, stripBom } from '../data/tvtimeRescue';
import { parseCsv } from '../data/transfer';
import { AccountPanel } from './AccountPanel';

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

      if (text.trimStart().startsWith('{')) {
        setReport(await importBundle(JSON.parse(text)));
        return;
      }

      // Recognise the TV Time rescue tool's own files first: they carry richer data
      // than a generic history CSV — rewatch counts, ratings, watchlist flags — and
      // treating them generically would throw most of that away.
      const header = parseCsv(stripBom(text))[0] ?? [];
      if (detectRescueFile(header) !== 'unknown') {
        const rescue = await importRescueCsv(text);
        setReport({
          watches: rescue.watches,
          watchlist: rescue.watchlist,
          skipped: rescue.skipped,
          warnings: [
            `Recognised as TV Time ${rescue.file}.csv.` +
              (rescue.rewatches ? ` ${rescue.rewatches} rewatch(es) preserved.` : '') +
              (rescue.ratings ? ` ${rescue.ratings} rating(s).` : '') +
              (rescue.library ? ` ${rescue.library} show(s) added.` : ''),
            ...rescue.warnings,
          ],
        });
        return;
      }

      setReport(await importWatchHistoryCsv(text));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that file');
    }
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      <h1 className="px-1 text-2xl font-semibold">Your data</h1>

      <AccountPanel />

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
          Letterboxd. The rescue tool's own files — <code>episodes.csv</code>,{' '}
          <code>movies.csv</code>, <code>series.csv</code> — are recognised specifically,
          keeping rewatch counts, ratings and watchlist flags that a generic import would
          discard. Anything we cannot read is reported rather than silently dropped.
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

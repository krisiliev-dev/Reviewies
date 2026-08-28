import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../data/db';
import { getStats } from '@reviewies/core/data/repo';
import { formatDuration } from '@reviewies/core/stats/compute';
import { downloadFile, exportAll, exportWatchesCsv } from '@reviewies/core/data/transfer';
import {
  clearMetadataCache,
  JUSTWATCH_ATTRIBUTION,
  TMDB_ATTRIBUTION,
  usingFixtures,
} from '@reviewies/core/metadata/index';
import { Link } from 'react-router-dom';
import { AccountPanel } from './AccountPanel';
import { ImportFiles, ImportFormats } from '../ui/ImportFiles';
import { openCommentsAfterWatch, setOpenCommentsAfterWatch } from '@reviewies/core/data/prefs';
import { COPY } from '@reviewies/core/copy';
import { todayKey } from '@reviewies/core/time';
import { clockWarning } from '@reviewies/core/sync/clock';
import { Button } from '../ui/Button';

export function Settings() {
  const [openComments, setOpenComments] = useState(openCommentsAfterWatch);
  const [cleared, setCleared] = useState<number>();
  const [exportNote, setExportNote] = useState<string>();

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

  return (
    <div className="flex flex-col gap-6 p-4">
      <h1 className="px-1 text-s24 font-display font-semibold">Your data</h1>

      <AccountPanel />

      {/* People-management lives one level down rather than in the tab bar: the bar
          already carries eight destinations, and simplicity was the loudest single
          demand in the research. */}
      <Link
        to="/people"
        className="flex items-center justify-between rounded-plate bg-ground-raised px-4 py-4"
      >
        <span>
          <span className="font-semibold">People</span>
          <span className="block text-sm text-ink-secondary">Your handle, following, blocking</span>
        </span>
        <span aria-hidden className="text-ink-secondary">›</span>
      </Link>

      <section className="rounded-plate bg-ground-raised p-4">
        <p className="text-sm text-ink-secondary">
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
          <p className="mt-3 text-sm text-ink-secondary">
            {/* formatDuration rather than minutes/60: 90 minutes was rendering as
                "1 hours watched", which is wrong twice over. */}
            {formatDuration(stats.minutes)} watched, counted by actual runtime.
          </p>
        )}
      </section>

      {/* Only ever rendered by a device that is genuinely an hour or more out. Sync
          corrects for it and needs no help; the calendar and "aired today" cannot be
          corrected from here, so the honest thing is to say where the trouble is. §6.67. */}
      {clockWarning() && (
        <p role="status" className="rounded-plate bg-ground-raised px-4 py-3 text-sm text-trouble">
          {clockWarning()}
        </p>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="px-1 text-s12 font-title font-semibold tracking-wide text-ink-secondary uppercase">Export</h2>
        <p className="px-1 text-sm text-ink-secondary">{COPY.settings.exportBlurb}</p>
        <Button
          size="page"
          tone="primary"
          label="Export everything (JSON)"
          name="Export everything as JSON"
          onPress={async () => {
            const bundle = await exportAll();
            // The file is written either way — the local half never depends on a server
            // — but a person with an account would otherwise get something that looks
            // complete and is missing their lists.
            setExportNote(bundle.accountUnavailable);
            downloadFile(
              `reviewies-${todayKey()}.json`,
              JSON.stringify(bundle, null, 2),
              'application/json',
            );
          }}
        />
        {exportNote && (
          <p className="px-1 text-sm text-ink-secondary" role="status">
            Saved, but your lists, follows and comments could not be read: {exportNote}. The
            rest of the file is complete.
          </p>
        )}
        <button
          onClick={async () =>
            downloadFile(
              `reviewies-watches-${todayKey()}.csv`,
              await exportWatchesCsv(),
              'text/csv',
            )
          }
          className="rounded-pill border border-stroke-signal px-4 py-3"
        >
          Export watch history (CSV)
        </button>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="px-1 text-s12 font-title font-semibold tracking-wide text-ink-secondary uppercase">Import</h2>
        <ImportFormats />
        <ImportFiles />

      </section>

      <section className="flex flex-col gap-2">
        <h2 className="px-1 text-s12 font-title font-semibold tracking-wide text-ink-secondary uppercase">
          Watching
        </h2>
        <label className="flex items-center justify-between gap-3 rounded-plate bg-ground-raised px-4 py-4">
          <span className="min-w-0">
            <span className="block">Open the conversation after marking watched</span>
            {/* Off is offered because anyone working through several episodes wants to
                stay put. Catching up in bulk has its own control, which never moves. */}
            <span className="block text-sm text-ink-secondary">How TV Time worked. Needs an account.</span>
          </span>
          <input
            type="checkbox"
            checked={openComments}
            onChange={(e) => {
              setOpenComments(e.target.checked);
              setOpenCommentsAfterWatch(e.target.checked);
            }}
            className="size-5 shrink-0 accent-action-fill"
          />
        </label>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="px-1 text-s12 font-title font-semibold tracking-wide text-ink-secondary uppercase">
          Metadata cache
        </h2>
        <p className="px-1 text-sm text-ink-secondary">
          Artwork and episode listings are cached from the metadata provider and expire
          automatically. Clearing them never touches your own history, and shows carried
          over from an import keep their names.
        </p>
        <button
          onClick={() => void clearMetadataCache().then((n) => setCleared(n))}
          className="rounded-pill border border-stroke-signal px-4 py-3"
        >
          Clear cached metadata
        </button>
        {cleared !== undefined && (
          <p className="px-1 text-sm text-ink-secondary" role="status">
            {cleared === 0 ? 'Nothing cached to clear.' : `Cleared ${cleared} cached records.`}
          </p>
        )}
      </section>

      <footer className="px-1 pb-4 text-xs leading-relaxed text-ink-secondary">
        {usingFixtures() ? (
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
    <div className="rounded-plate bg-ground-well px-3 py-2">
      <dt className="text-xs text-ink-secondary">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

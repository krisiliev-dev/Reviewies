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
import { Section } from '../ui/Section';
import { Data } from '../ui/Data';
import { Note } from '../ui/Note';
import { Masthead } from '../ui/Masthead';

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
      <Masthead level="page" className="px-1">Your data</Masthead>

      <AccountPanel />

      {/* People-management lives one level down rather than in the tab bar: the bar
          already carries eight destinations, and simplicity was the loudest single
          demand in the research. */}
      <Link
        to="/people"
        className="flex items-center justify-between rounded-plate bg-ground-raised px-4 py-4"
      >
        <span>
          <span className="text-s16 font-title font-semibold">People</span>
          <Note as="span" className="block">Your handle, following, blocking</Note>
        </span>
        <Note as="span" aria-hidden>›</Note>
      </Link>

      <section className="rounded-plate bg-ground-raised p-4">
        <Note>
          Everything lives on this device. Nothing here needs an account, and nothing is
          withheld — this is the whole point of the app.
        </Note>
        {counts && (
          <dl className="mt-3 grid grid-cols-2 gap-2 text-s14">
            <Stat label="Watches" value={counts.watches} />
            <Stat label="Tracked" value={counts.library} />
            <Stat label="Watchlist" value={counts.watchlist} />
            <Stat label="Reactions" value={counts.reactions} />
          </dl>
        )}
        {stats && stats.minutes > 0 && (
          <Note className="mt-3">
            {/* formatDuration rather than minutes/60: 90 minutes was rendering as
                "1 hours watched", which is wrong twice over. */}
            {formatDuration(stats.minutes)} watched, counted by actual runtime.
          </Note>
        )}
      </section>

      {/* Only ever rendered by a device that is genuinely an hour or more out. Sync
          corrects for it and needs no help; the calendar and "aired today" cannot be
          corrected from here, so the honest thing is to say where the trouble is. §6.67. */}
      {clockWarning() && (
        <p role="status" className="rounded-plate bg-ground-raised px-4 py-3 text-s14 text-trouble">
          {clockWarning()}
        </p>
      )}

      <section className="flex flex-col gap-2">
        <Section className="px-1">Export</Section>
        <Note className="px-1">{COPY.settings.exportBlurb}</Note>
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
          <Note className="px-1" role="status">
            Saved, but your lists, follows and comments could not be read: {exportNote}. The
            rest of the file is complete.
          </Note>
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
        <Section className="px-1">Import</Section>
        <ImportFormats />
        <ImportFiles />

      </section>

      <section className="flex flex-col gap-2">
        <Section className="px-1">
          Watching
        </Section>
        <label className="flex items-center justify-between gap-3 rounded-plate bg-ground-raised px-4 py-4">
          <span className="min-w-0">
            <span className="block">Open the conversation after marking watched</span>
            {/* Off is offered because anyone working through several episodes wants to
                stay put. Catching up in bulk has its own control, which never moves. */}
            <Note as="span" className="block">How TV Time worked. Needs an account.</Note>
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
        <Section className="px-1">
          Metadata cache
        </Section>
        <Note className="px-1">
          Artwork and episode listings are cached from the metadata provider and expire
          automatically. Clearing them never touches your own history, and shows carried
          over from an import keep their names.
        </Note>
        <button
          onClick={() => void clearMetadataCache().then((n) => setCleared(n))}
          className="rounded-pill border border-stroke-signal px-4 py-3"
        >
          Clear cached metadata
        </button>
        {cleared !== undefined && (
          <Note className="px-1" role="status">
            {cleared === 0 ? 'Nothing cached to clear.' : `Cleared ${cleared} cached records.`}
          </Note>
        )}
      </section>

      <Note level="footnote" as="footer" className="px-1 pb-4">
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
      </Note>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-plate bg-ground-well px-3 py-2">
      <Note level="footnote" as="dt">{label}</Note>
      <dd><Data value={value} size="s20" /></dd>
    </div>
  );
}

import { useState } from 'react';
import { downloadFile, exportAll, exportWatchesCsv } from '@reviewies/core/data/transfer';
import { clearMetadataCache, usingFixtures } from '@reviewies/core/metadata/index';
import { ATTRIBUTION_ORDER, attributionLines } from '@reviewies/core/ui/attribution';
import { AccountPanel } from './AccountPanel';
import { ImportFiles, ImportFormats } from '../ui/ImportFiles';
import { openCommentsAfterWatch, setOpenCommentsAfterWatch } from '@reviewies/core/data/prefs';
import { COPY } from '@reviewies/core/copy';
import { todayKey } from '@reviewies/core/time';
import { clockWarning } from '@reviewies/core/sync/clock';
import { Button } from '../ui/Button';
import { Section } from '../ui/Section';
import { Note } from '../ui/Note';
import { Masthead } from '../ui/Masthead';

export function Settings() {
  const [openComments, setOpenComments] = useState(openCommentsAfterWatch);
  const [cleared, setCleared] = useState<number>();
  const [exportNote, setExportNote] = useState<string>();


  return (
    <div className="flex flex-col gap-6 p-s16">
      <Masthead level="page" className="px-1">Your data</Masthead>

      <AccountPanel />

      {/* People-management lives one level down rather than in the tab bar: the bar
          already carries eight destinations, and simplicity was the loudest single
          demand in the research. */}
      {/* A `Row`, not a hand-drawn card: a title, a line under it and a chevron is
          exactly what `Row` draws, and this was the last screen assembling one itself —
          in a `rounded-plate bg-ground-raised` that §6.122 established is the *card* fill
          and so presses to the colour it is already painted. §6.131. */}
      {/* What was here: a People row and a copy of More's "everything lives on this
          device" summary. Both were duplicates, and §6.131 migrated the first to `Row`
          rather than asking whether it should exist.
          
          The web's More lists five destinations and People is one of them; this screen is
          another of them ("Your data"). A destination that appears on the contents page and
          again inside one of its own entries is navigation in two places, drawn two ways —
          More's carries a chevron at `density="index"` and this one did not.
          
          The summary is the same duplication one level up, and the phone settles it: its
          More has the block once and its `data.tsx` has neither. Web-only drift, found by
          the web's first design pass. The fourth tile — Reactions — moved to More rather
          than being lost with the copy. §6.133. */}

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
        <Button
          size="page"
          onPress={async () =>
            downloadFile(
              `reviewies-watches-${todayKey()}.csv`,
              await exportWatchesCsv(),
              'text/csv',
            )
          }
          label="Export watch history (CSV)"
          name="Export watch history as a CSV file"
        />
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
        <Button
          size="page"
          onPress={() => void clearMetadataCache().then((n) => setCleared(n))}
          label="Clear cached metadata"
          name="Clear cached metadata"
        />
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
          /*
           * The words and their order from the rule; the placement is this screen's own.
           * `Attribution` is for small print *under the data it is about* — here the two
           * lines are part of a build-state footer that already has its spacing, so the
           * component's separation would be wrong and only the list is shared. §6.147.
           */
          attributionLines(ATTRIBUTION_ORDER, usingFixtures()).map((line) => <p key={line}>{line}</p>)
        )}
      </Note>
    </div>
  );
}

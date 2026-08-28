import { useState } from 'react';
import type { ImportReport } from '@reviewies/core/data/transfer';
import { restoreAccount, type RestoreReport } from '@reviewies/core/social/restoreAccount';
import { importArchive, importArchiveEntry, pairWal } from '@reviewies/core/data/archiveImport';

/**
 * Bring a history in from somewhere else.
 *
 * Lifted out of the Data screen because that is not where people arrive. The premise of
 * this app is that TV Time shut down and its users need somewhere to go, and the first
 * thing they saw was "Nothing tracked yet" and a search box — with the one control that
 * would have rescued years of history sitting two taps away behind a word nobody with a
 * zip in their downloads folder would think to open.
 */
export function ImportFiles({
  label = 'Choose files',
  onImported,
  primary = false,
}: {
  label?: string;
  /** Fires after a successful run, so a caller can react to a library appearing. */
  onImported?: (report: ImportReport) => void;
  /**
   * Styled as the main thing to do on the screen.
   *
   * True on first run, where the import *is* the offer, and false on the data screen,
   * where it sits among several equals.
   */
  primary?: boolean;
}) {
  const [report, setReport] = useState<ImportReport>();
  const [restored, setRestored] = useState<RestoreReport>();
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string>();
  const [files, setFiles] = useState<Array<{ name: string; outcome: string }>>();
  const [busy, setBusy] = useState(false);

  /**
   * Import whatever the user has.
   *
   * One routing decision, made on contents rather than filenames, in `archiveImport` —
   * so a zip, a loose CSV and a recovered `DioCache.db` cannot be treated
   * inconsistently. Multiple files are accepted at once because the SQLite recovery
   * route produces a `DioCache.db` and a `DioCache.db-wal` that only mean something
   * together.
   */
  async function onImport(chosen: FileList) {
    setError(undefined);
    setReport(undefined);
    setFiles(undefined);
    setBusy(true);

    try {
      const picked = [...chosen];

      // A zip is the common case: TV Time's GDPR export.
      const zip = picked.find((f) => /\.zip$/i.test(f.name));
      if (zip) {
        const archive = await importArchive(new Uint8Array(await zip.arrayBuffer()));
        setReport(archive);
        setFiles(archive.files);
        onImported?.(archive);
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
        combined.account ??= partial.account;
        outcomes.push({ name: file.name, outcome });
      }

      setReport(combined);
      setFiles(outcomes);
      onImported?.(combined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that file');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <label
        className={`cursor-pointer rounded-pill px-4 py-3 text-center ${
          primary ? 'bg-action-fill text-action-label' : 'border border-stroke-signal'
        }`}
      >
        {busy ? 'Reading…' : label}
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

      {error && <p className="px-1 text-s14 text-trouble">{error}</p>}
      {report && (
        <div className="rounded-plate bg-ground-raised p-3 text-s14">
          <p>
            Imported {report.watches} watch{report.watches === 1 ? '' : 'es'}
            {report.watchlist > 0 && `, ${report.watchlist} watchlist items`}.
          </p>
          {files && files.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1">
              {files.map((f) => (
                <li key={f.name} className="text-s12 text-ink-secondary">
                  <span className="font-data font-medium">{f.name}</span> — {f.outcome}
                </li>
              ))}
            </ul>
          )}
          {report.warnings.map((w) => (
            <p key={w} className="mt-1 text-ink-secondary">
              {w}
            </p>
          ))}

          {/* The second step, offered where the first one landed. It needs an account
              and a network, so it cannot be part of the local import — but a file the
              app has just read and thrown the lists out of is not a restore. */}
          {report.account && !restored && (
            <button
              onClick={async () => {
                setRestoring(true);
                setRestored(await restoreAccount(report.account!));
                setRestoring(false);
              }}
              disabled={restoring}
              className="mt-3 min-h-[44px] w-full rounded-pill border border-stroke-signal px-4 py-3 disabled:opacity-50"
            >
              {restoring ? 'Restoring…' : 'Restore lists and follows'}
            </button>
          )}
          {restored && (
            <div className="mt-3" role="status">
              <p>
                Restored {restored.lists} list{restored.lists === 1 ? '' : 's'} with{' '}
                {restored.listItems} item{restored.listItems === 1 ? '' : 's'}, and{' '}
                {restored.follows} follow{restored.follows === 1 ? '' : 's'}.
              </p>
              {restored.skipped.map((s) => (
                <p key={s} className="mt-1 text-ink-secondary">
                  {s}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

/**
 * What we can read, said plainly.
 *
 * Three different things arrive under the name "my TV Time data" — the GDPR zip, a CSV
 * from the rescue tool, and a `DioCache.db` pulled off a phone — and someone holding one
 * of them needs to see their own case named before they will believe it works.
 */
export function ImportFormats() {
  return (
    <>
      <p className="px-1 text-s14 text-ink-secondary">
        A TV Time GDPR zip, a Reviewies export, a CSV from the rescue tool, Trakt, Simkl
        or Letterboxd — or a recovered <code>DioCache.db</code> straight off your phone.
        Files are recognised by what is in them, not what they are called, and anything we
        cannot read is listed rather than silently dropped.
      </p>
      {/* The -wal is the difference between a complete history and one quietly missing
          its most recent months, so it has to be asked for by name. */}
      <p className="px-1 text-s14 text-ink-secondary">
        If you have a <code>DioCache.db</code>, select its <code>DioCache.db-wal</code> at
        the same time. TV Time wrote its most recent months there, and importing the
        database alone loses them without telling you.
      </p>
    </>
  );
}

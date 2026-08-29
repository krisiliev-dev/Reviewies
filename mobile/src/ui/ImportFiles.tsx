import { SURFACE } from '@reviewies/core/ui/surface';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import type { ImportReport } from '@reviewies/core/data/transfer';
import { importArchive, importArchiveEntry, pairWal } from '@reviewies/core/data/archiveImport';
import { restoreAccount, type RestoreReport } from '@reviewies/core/social/restoreAccount';
import { border, radius, theme } from './theme';
import { Button } from './Button';
import { text, type } from '@reviewies/core/tokens';
import { Data } from './Data';
import { Note } from './Note';
import { COPY } from '@reviewies/core/copy';

/**
 * Bring a history in from somewhere else.
 *
 * Lifted out of the Data screen because that is not where people arrive. This app
 * exists because TV Time shut down, and the first thing it said to someone holding
 * years of history was "Nothing tracked yet" and a search box, with the control that
 * would have rescued all of it behind a tab called Data.
 *
 * Import recognises files by their contents rather than their names, so a GDPR zip, a
 * rescue-tool CSV, our own export, or a raw `DioCache.db` pulled off a phone all land in
 * the same place. Everything it could not read is listed rather than dropped.
 */
export function ImportFiles({
  label = 'Choose files',
  primary = false,
  onImported,
}: {
  label?: string;
  /**
   * Styled as the main thing to do on the screen.
   *
   * True on first run, where the import *is* the offer, and false on the data screen,
   * where it sits among equals.
   */
  primary?: boolean;
  /** Fires after a run, so a caller can react to a library appearing. */
  onImported?: (report: ImportReport) => void;
}) {
  const [report, setReport] = useState<ImportReport>();
  const [files, setFiles] = useState<Array<{ name: string; outcome: string }>>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [restored, setRestored] = useState<RestoreReport>();
  const [restoring, setRestoring] = useState(false);

  async function pickAndImport() {
    setError(undefined);
    setReport(undefined);
    setFiles(undefined);

    // Multiple, because a DioCache.db and its -wal only mean something together.
    const picked = await DocumentPicker.getDocumentAsync({
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (picked.canceled || picked.assets.length === 0) return;

    setBusy(true);
    try {
      const loaded = await Promise.all(
        picked.assets.map(async (asset) => ({
          name: asset.name,
          bytes: new Uint8Array(await (await fetch(asset.uri)).arrayBuffer()),
        })),
      );

      const zip = loaded.find((f) => /\.zip$/i.test(f.name));
      if (zip) {
        const archive = await importArchive(zip.bytes);
        setReport(archive);
        setFiles(archive.files);
        onImported?.(archive);
        return;
      }

      const wals = pairWal(loaded.map((f) => f.name));
      const walNames = new Set(wals.values());
      const combined: ImportReport = { watches: 0, watchlist: 0, skipped: 0, warnings: [] };
      const outcomes: Array<{ name: string; outcome: string }> = [];

      for (const file of loaded) {
        // A log is imported with its database, never alone.
        if (walNames.has(file.name)) continue;
        const wal = wals.has(file.name)
          ? loaded.find((f) => f.name === wals.get(file.name))?.bytes
          : undefined;

        const { report: partial, outcome } = await importArchiveEntry(file.name, file.bytes, wal);
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
      {/* The comment this replaces said "mid-import the label is a spinner and there is
          no text to fall back on" — the second of two places that worked around the same
          decision. `busy` keeps the label and rules under it. */}
      <Button
        onPress={pickAndImport}
        busy={busy}
        disabled={busy}
        tone={primary ? 'primary' : 'secondary'}
        size="page"
        label={label}
        name={label}
      />

      {error && <Text style={styles.error}>{error}</Text>}

      {report && (
        <View style={styles.report}>
          <Text style={styles.reportHead}>
            Imported {report.watches} watch{report.watches === 1 ? '' : 'es'}
            {report.watchlist > 0 ? `, ${report.watchlist} watchlist items` : ''}.
          </Text>
          {files?.map((file) => (
            <Text key={file.name} style={styles.reportLine}>
              <Data value={file.name} size="s12" style={styles.reportName} /> — {file.outcome}
            </Text>
          ))}
          {report.warnings.map((warning) => (
            <Text key={warning} style={styles.reportLine}>
              {warning}
            </Text>
          ))}

          {/* The second step, offered where the first one landed. */}
          {report.account && !restored && (
            <Button
              onPress={async () => {
                setRestoring(true);
                setRestored(await restoreAccount(report.account!));
                setRestoring(false);
              }}
              busy={restoring}
              disabled={restoring}
              tone="secondary"
              label={restoring ? 'Restoring…' : 'Restore lists and follows'}
              name="Restore lists and follows"
            />
          )}
          {restored && (
            <View accessibilityLiveRegion="polite">
              <Text style={styles.reportHead}>
                Restored {restored.lists} list{restored.lists === 1 ? '' : 's'} with{' '}
                {restored.listItems} item{restored.listItems === 1 ? '' : 's'}, and{' '}
                {restored.follows} follow{restored.follows === 1 ? '' : 's'}.
              </Text>
              {restored.skipped.map((line) => (
                <Text key={line} style={styles.reportLine}>
                  {line}
                </Text>
              ))}
            </View>
          )}
        </View>
      )}
    </>
  );
}

/**
 * What we can read, said plainly.
 *
 * Three different things arrive under the name "my TV Time data" — the GDPR zip, a CSV
 * from the rescue tool, and a DioCache.db pulled off a phone — and someone holding one
 * of them needs to see their own case named before they will believe it works.
 */
export function ImportFormats() {
  return (
    <>
      <Note>{COPY.import.formats}</Note>
      {/* A footnote: it applies to one of the seven sources named above. §6.147. */}
      <Note level="footnote">{COPY.import.wal}</Note>
    </>
  );
}

const styles = StyleSheet.create({
  buttonPrimary: { backgroundColor: theme.actionFill },
  buttonPrimaryText: { color: theme.actionLabel },
  button: {
    borderWidth: border.hairline, borderColor: theme.strokeSignal, backgroundColor: 'transparent',
    borderRadius: radius.pill,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonText: { color: theme.ink, fontSize: text.s14, fontFamily: type.family.title.name },
  error: { color: theme.trouble, fontSize: text.s14, fontFamily: type.family.body.name },
  report: { backgroundColor: theme[SURFACE.card], borderRadius: radius.plate, padding: 12, gap: 4 },
  reportHead: { color: theme.ink, fontSize: text.s14, fontFamily: type.family.title.name },
  reportLine: { color: theme.inkSecondary, fontSize: text.s12, fontFamily: type.family.body.name },
  reportName: { color: theme.ink },
  restore: {
    marginTop: 8,
    borderWidth: border.hairline, borderColor: theme.strokeSignal, backgroundColor: 'transparent',
    borderRadius: radius.pill,
    // 44 rather than 24: this is a primary action in a report, not a link beside text.
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  restoreText: { color: theme.ink, fontSize: text.s14, fontFamily: type.family.title.name },
});

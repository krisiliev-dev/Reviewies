import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import type { ImportReport } from '@reviewies/core/data/transfer';
import { importArchive, importArchiveEntry, pairWal } from '@reviewies/core/data/archiveImport';
import { restoreAccount, type RestoreReport } from '@reviewies/core/social/restoreAccount';
import { radius, theme } from './theme';

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
      <Pressable
        style={[styles.button, primary ? styles.buttonPrimary : null]}
        onPress={pickAndImport}
        disabled={busy}
        accessibilityRole="button"
        // Mid-import the label is a spinner and there is no text to fall back on.
        accessibilityLabel={label}
        accessibilityState={{ disabled: busy, busy }}
      >
        {busy ? (
          <ActivityIndicator color={theme.muted} />
        ) : (
          <Text style={[styles.buttonText, primary ? styles.buttonPrimaryText : null]}>{label}</Text>
        )}
      </Pressable>

      {error && <Text style={styles.error}>{error}</Text>}

      {report && (
        <View style={styles.report}>
          <Text style={styles.reportHead}>
            Imported {report.watches} watch{report.watches === 1 ? '' : 'es'}
            {report.watchlist > 0 ? `, ${report.watchlist} watchlist items` : ''}.
          </Text>
          {files?.map((file) => (
            <Text key={file.name} style={styles.reportLine}>
              <Text style={styles.reportName}>{file.name}</Text> — {file.outcome}
            </Text>
          ))}
          {report.warnings.map((warning) => (
            <Text key={warning} style={styles.reportLine}>
              {warning}
            </Text>
          ))}

          {/* The second step, offered where the first one landed. */}
          {report.account && !restored && (
            <Pressable
              style={styles.restore}
              disabled={restoring}
              accessibilityRole="button"
              accessibilityLabel="Restore lists and follows"
              accessibilityState={{ disabled: restoring }}
              onPress={async () => {
                setRestoring(true);
                setRestored(await restoreAccount(report.account!));
                setRestoring(false);
              }}
            >
              <Text style={styles.restoreText}>
                {restoring ? 'Restoring…' : 'Restore lists and follows'}
              </Text>
            </Pressable>
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
      <Text style={styles.blurb}>
        A TV Time GDPR zip, a Reviewies export, a CSV from the rescue tool, Trakt, Simkl
        or Letterboxd — or a recovered DioCache.db straight off your phone. Files are
        recognised by what is in them, not what they are called.
      </Text>
      {/* The -wal is the difference between a complete history and one quietly missing
          its most recent months, so it has to be asked for by name. */}
      <Text style={styles.blurb}>
        If you have a DioCache.db, pick its DioCache.db-wal at the same time. TV Time
        wrote its most recent months there, and importing the database alone loses them
        without telling you.
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  buttonPrimary: { backgroundColor: theme.accent },
  buttonPrimaryText: { color: theme.ink, fontWeight: '700' },
  blurb: { color: theme.muted, fontSize: 14, lineHeight: 20 },
  button: {
    backgroundColor: theme.surface2,
    borderRadius: radius.lg,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: { color: theme.text, fontSize: 15, fontWeight: '600' },
  error: { color: theme.accent, fontSize: 13 },
  report: { backgroundColor: theme.surface, borderRadius: radius.md, padding: 12, gap: 4 },
  reportHead: { color: theme.text, fontSize: 14 },
  reportLine: { color: theme.muted, fontSize: 12 },
  reportName: { color: theme.text },
  restore: {
    marginTop: 8,
    backgroundColor: theme.surface2,
    borderRadius: radius.md,
    // 44 rather than 24: this is a primary action in a report, not a link beside text.
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  restoreText: { color: theme.text, fontSize: 14 },
});

import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Stack } from 'expo-router';
import { pairWal, importArchive, importArchiveEntry } from '@reviewies/core/data/archiveImport';
import { downloadFile, exportAll, exportWatchesCsv } from '@reviewies/core/data/transfer';
import type { ImportReport } from '@reviewies/core/data/transfer';
import { radius, theme } from '../src/ui/theme';

/**
 * Getting your history in, and getting it back out.
 *
 * Export is free, complete and needs no account. That is not a feature so much as the
 * reason this app exists: TV Time deleted 26 million watch histories, and r/Simkl was
 * asking whether paywalling an export is even GDPR-compliant.
 *
 * Import recognises files by their contents rather than their names, so a GDPR zip, a
 * rescue-tool CSV, our own export, or a raw `DioCache.db` pulled off a phone all land
 * in the same place. Everything it could not read is listed rather than dropped.
 */
export default function DataScreen() {
  const [report, setReport] = useState<ImportReport>();
  const [files, setFiles] = useState<Array<{ name: string; outcome: string }>>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

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

  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <Stack.Screen options={{ title: 'Your data' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Section heading="Export">
          <Text style={styles.blurb}>
            Everything, in full, with no account and no upsell. It is yours.
          </Text>
          <Pressable
            style={styles.primary}
            onPress={async () =>
              downloadFile(
                `reviewies-${today}.json`,
                JSON.stringify(await exportAll(), null, 2),
                'application/json',
              )
            }
          >
            <Text style={styles.primaryText}>Export everything (JSON)</Text>
          </Pressable>
          <Pressable
            style={styles.secondary}
            onPress={async () =>
              downloadFile(`reviewies-watches-${today}.csv`, await exportWatchesCsv(), 'text/csv')
            }
          >
            <Text style={styles.secondaryText}>Export watch history (CSV)</Text>
          </Pressable>
        </Section>

        <Section heading="Import">
          <Text style={styles.blurb}>
            A TV Time GDPR zip, a Reviewies export, a CSV from the rescue tool, Trakt,
            Simkl or Letterboxd — or a recovered DioCache.db straight off your phone.
            Files are recognised by what is in them, not what they are called.
          </Text>
          {/* The -wal is the difference between a complete history and one quietly
              missing its most recent months, so it has to be asked for by name. */}
          <Text style={styles.blurb}>
            If you have a DioCache.db, pick its DioCache.db-wal at the same time. TV
            Time wrote its most recent months there, and importing the database alone
            loses them without telling you.
          </Text>
          <Pressable style={styles.secondary} onPress={pickAndImport} disabled={busy}>
            {busy ? (
              <ActivityIndicator color={theme.muted} />
            ) : (
              <Text style={styles.secondaryText}>Choose files</Text>
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
            </View>
          )}
        </Section>
      </ScrollView>
    </>
  );
}

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionHeading}>{heading}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 24, backgroundColor: theme.ink, flexGrow: 1, paddingBottom: 40 },
  section: { gap: 10 },
  sectionHeading: {
    color: theme.muted,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  blurb: { color: theme.muted, fontSize: 13, lineHeight: 19 },
  primary: {
    backgroundColor: theme.accent,
    borderRadius: radius.lg,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: { color: theme.ink, fontWeight: '700', fontSize: 15 },
  secondary: {
    backgroundColor: theme.surface2,
    borderRadius: radius.lg,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryText: { color: theme.text, fontSize: 15 },
  error: { color: theme.accent, fontSize: 13 },

  report: { backgroundColor: theme.surface, borderRadius: radius.lg, padding: 12, gap: 6 },
  reportHead: { color: theme.text, fontSize: 14 },
  reportLine: { color: theme.muted, fontSize: 11, lineHeight: 16 },
  reportName: { color: theme.text, fontWeight: '600' },
});

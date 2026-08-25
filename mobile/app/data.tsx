import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Stack } from 'expo-router';
import { downloadFile, exportAll, exportWatchesCsv } from '@reviewies/core/data/transfer';
import { openCommentsAfterWatch, setOpenCommentsAfterWatch } from '@reviewies/core/data/prefs';
import { ImportFiles, ImportFormats } from '../src/ui/ImportFiles';
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
  // Read once: the preference lives in the key/value store the platform binds at
  // startup, so it is available synchronously and does not need a subscription.
  const [openComments, setOpenComments] = useState(openCommentsAfterWatch);

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
            accessibilityRole="button"
          >
            <Text style={styles.primaryText}>Export everything (JSON)</Text>
          </Pressable>
          <Pressable
            style={styles.secondary}
            onPress={async () =>
              downloadFile(`reviewies-watches-${today}.csv`, await exportWatchesCsv(), 'text/csv')
            }
            accessibilityRole="button"
          >
            <Text style={styles.secondaryText}>Export watch history (CSV)</Text>
          </Pressable>
        </Section>

        <Section heading="Import">
          <ImportFormats />
          <ImportFiles />
        </Section>

        <Section heading="Watching">
          <View style={styles.toggleRow}>
            <View style={styles.toggleText}>
              <Text style={styles.toggleLabel}>Open the conversation after marking watched</Text>
              {/* Off is offered because anyone working through several episodes wants to
                  stay put. Catching up in bulk has its own control, which never moves. */}
              <Text style={styles.toggleHint}>How TV Time worked. Needs an account.</Text>
            </View>
            <Switch
              value={openComments}
              onValueChange={(on) => {
                setOpenComments(on);
                setOpenCommentsAfterWatch(on);
              }}
              accessibilityLabel="Open the conversation after marking watched"
            />
          </View>
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
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.surface,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  toggleText: { flex: 1, minWidth: 0, gap: 2 },
  toggleLabel: { color: theme.text, fontSize: 15 },
  toggleHint: { color: theme.muted, fontSize: 13 },
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

});

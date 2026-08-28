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
import { clearMetadataCache } from '@reviewies/core/metadata/index';
import { ImportFiles, ImportFormats } from '../src/ui/ImportFiles';
import { radius, theme } from '../src/ui/theme';
import { text, weight } from '@reviewies/core/tokens';
import { COPY } from '@reviewies/core/copy';
import { todayKey } from '@reviewies/core/time';
import { clockWarning } from '@reviewies/core/sync/clock';
import { Button } from '../src/ui/Button';

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
  const [cleared, setCleared] = useState<number>();
  const [exportNote, setExportNote] = useState<string>();

  // The person's date, not UTC's. Exporting at 9pm in Los Angeles used to write a file
  // stamped tomorrow, which is a small lie in the one place people go looking for the
  // file they made "yesterday". §6.66.
  const today = todayKey();

  return (
    <>
      <Stack.Screen options={{ title: 'Your data' }} />
      <ScrollView contentContainerStyle={styles.content}>
        {/* Only ever rendered by a device genuinely an hour or more out. §6.67. */}
        {clockWarning() && (
          <Text style={styles.clockWarning} accessibilityLiveRegion="polite">
            {clockWarning()}
          </Text>
        )}

        <Section heading="Export">
          <Text style={styles.blurb}>{COPY.settings.exportBlurb}</Text>
          <Button
            onPress={async () => {
              const bundle = await exportAll();
              // Written either way; a person with an account would otherwise get a file
              // that looks complete and is missing their lists.
              setExportNote(bundle.accountUnavailable);
              await downloadFile(
                `reviewies-${today}.json`,
                JSON.stringify(bundle, null, 2),
                'application/json',
              );
            }}
            tone="primary"
            label="Export everything (JSON)"
            name="Export everything (JSON)"
          />
          {exportNote && (
            <Text style={styles.blurb} accessibilityLiveRegion="polite">
              Saved, but your lists, follows and comments could not be read: {exportNote}. The
              rest of the file is complete.
            </Text>
          )}
          <Button
            onPress={async () =>
              downloadFile(`reviewies-watches-${today}.csv`, await exportWatchesCsv(), 'text/csv')
            }
            tone="secondary"
            label="Export watch history (CSV)"
            name="Export watch history (CSV)"
          />
        </Section>

        <Section heading="Import">
          <ImportFormats />
          <ImportFiles />
        </Section>

        <Section heading="Watching">
          {/* The whole row, not the switch.
              *
              * The switch alone measured 40x20 under react-native-web, below the 24px
              * WCAG 2.5.8 floor, and this is the only Switch in the app — nothing had
              * ever measured it, because §6.40 was the first time anything audited this
              * screen. Whether the native control clears 24 on a device could not be
              * checked from here, so the target was made large rather than argued about.
              *
              * A settings row that toggles when you tap anywhere on it is also what the
              * platform does, and it leaves one control in the reading order instead of
              * a label and a separate unlabelled switch. */}
          <Pressable
            style={styles.toggleRow}
            accessibilityRole="switch"
            accessibilityState={{ checked: openComments }}
            accessibilityLabel="Open the conversation after marking watched"
            accessibilityHint="How TV Time worked. Needs an account."
            onPress={() => {
              const on = !openComments;
              setOpenComments(on);
              setOpenCommentsAfterWatch(on);
            }}
          >
            <View style={styles.toggleText}>
              <Text style={styles.toggleLabel}>Open the conversation after marking watched</Text>
              {/* Off is offered because anyone working through several episodes wants to
                  stay put. Catching up in bulk has its own control, which never moves. */}
              <Text style={styles.toggleHint}>How TV Time worked. Needs an account.</Text>
            </View>
            {/* Presentational: the row above is the control. Hidden from the reading
                order so it is not announced twice, and from the pointer so a tap on it
                is a tap on the row. */}
            <View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none">
              <Switch value={openComments} />
            </View>
          </Pressable>
        </Section>

        {/* The web has offered this since the settings screen existed and the phone
            never has, which is the same shape as everything else found in this pass:
            the core could do it and one platform simply never asked. */}
        <Section heading="Metadata cache">
          <Text style={styles.blurb}>
            Artwork and episode listings are cached from the metadata provider and expire
            automatically. Clearing them never touches your own history, and shows carried
            over from an import keep their names.
          </Text>
          <Button
            onPress={() => void clearMetadataCache().then(setCleared)}
            tone="secondary"
            label="Clear cached metadata"
            name="Clear cached metadata"
          />
          {cleared !== undefined && (
            <Text style={styles.blurb} accessibilityLiveRegion="polite">
              {cleared === 0 ? 'Nothing cached to clear.' : `Cleared ${cleared} cached records.`}
            </Text>
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
  content: { padding: 16, gap: 24, backgroundColor: theme.ground, flexGrow: 1, paddingBottom: 48 },
  section: { gap: 12 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.groundRaised,
    borderRadius: radius.plate,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  toggleText: { flex: 1, minWidth: 0, gap: 2 },
  toggleLabel: { color: theme.ink, fontSize: 15 },
  toggleHint: { color: theme.inkSecondary, fontSize: 13 },
  sectionHeading: {
    color: theme.inkSecondary,
    fontSize: text.s12,
    fontWeight: weight.semibold,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  blurb: { color: theme.inkSecondary, fontSize: 13, lineHeight: 19 },
  clockWarning: { color: theme.trouble, fontSize: 13, lineHeight: 19, marginBottom: 4 },

});

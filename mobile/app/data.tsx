import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack } from 'expo-router';
import { downloadFile, exportAll, exportWatchesCsv } from '@reviewies/core/data/transfer';
import { openCommentsAfterWatch, setOpenCommentsAfterWatch } from '@reviewies/core/data/prefs';
import { clearMetadataCache } from '@reviewies/core/metadata/index';
import { ImportFiles, ImportFormats } from '../src/ui/ImportFiles';
import { Toggle } from '../src/ui/Toggle';
import { toggleState } from '@reviewies/core/ui/toggle';
import { leadingOf, radius, theme } from '../src/ui/theme';
import { SCREEN } from '@reviewies/core/ui/screen';
import { text, type, leading } from '@reviewies/core/tokens';
import { COPY } from '@reviewies/core/copy';
import { todayKey } from '@reviewies/core/time';
import { clockWarning } from '@reviewies/core/sync/clock';
import { Button } from '../src/ui/Button';
import { Block } from '../src/ui/Block';
import { Note } from '../src/ui/Note';

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

        <Block heading="Export">
          <Note>{COPY.settings.exportBlurb}</Note>
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
            <Note accessibilityLiveRegion="polite">
              Saved, but your lists, follows and comments could not be read: {exportNote}. The
              rest of the file is complete.
            </Note>
          )}
          <Button
            onPress={async () =>
              downloadFile(`reviewies-watches-${today}.csv`, await exportWatchesCsv(), 'text/csv')
            }
            tone="secondary"
            label="Export watch history (CSV)"
            name="Export watch history (CSV)"
          />
        </Block>

        <Block heading="Import">
          <ImportFormats />
          <ImportFiles />
        </Block>

        <Block heading="Watching">
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
            {...toggleState(openComments)}
            accessibilityLabel="Open the conversation after marking watched"
            accessibilityHint={COPY.settings.openCommentsHint}
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
              <Note>{COPY.settings.openCommentsHint}</Note>
            </View>
            {/* Presentational: the row above is the control, and `Toggle` hides itself for
                the reason this comment used to give — announced once, and a tap on it is a
                tap on the row. §6.166 moved the hiding into the component so the next call
                site cannot forget it. */}
            <Toggle value={openComments} />
          </Pressable>
        </Block>

        {/* The web has offered this since the settings screen existed and the phone
            never has, which is the same shape as everything else found in this pass:
            the core could do it and one platform simply never asked. */}
        <Block heading="Metadata cache">
          <Note>{COPY.settings.cacheBlurb}</Note>
          <Button
            onPress={() => void clearMetadataCache().then(setCleared)}
            tone="secondary"
            label="Clear cached metadata"
            name="Clear cached metadata"
          />
          {cleared !== undefined && (
            <Note accessibilityLiveRegion="polite">
              {cleared === 0 ? COPY.settings.cacheEmpty : COPY.settings.cacheCleared(cleared)}
            </Note>
          )}
        </Block>
      </ScrollView>
    </>
  );
}


const styles = StyleSheet.create({
  content: { padding: SCREEN.edge, gap: 24, backgroundColor: theme.ground, flexGrow: 1, paddingBottom: 48 },
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
  toggleLabel: { color: theme.ink, fontSize: text.s14, fontFamily: type.family.body.name },
  clockWarning: { color: theme.trouble, fontSize: text.s14, lineHeight: leadingOf(text.s14, leading.l143), marginBottom: 4, fontFamily: type.family.body.name },

});

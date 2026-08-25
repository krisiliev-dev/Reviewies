import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import {
  getPreference,
  getUpcoming,
  groupByDay,
  KIND_LABEL,
  setPreference,
  type NotifyPreference,
  type UpcomingEntry,
} from '@reviewies/core/calendar/upcoming';
import { requestRefresh } from '@reviewies/core/calendar/refresh';
import { radius, theme } from '../src/ui/theme';
import {
  pushSupported,
  registerForPush,
  syncPreference,
  unregisterFromPush,
  whyNotSupported,
} from '../src/notifications';

/**
 * What is coming, and how much you want to hear about it.
 *
 * Notification granularity was the top request on Trakt's roadmap, and milestones is
 * the default because "every episode of everything" is what makes people turn
 * notifications off entirely — after which the feature may as well not exist.
 */
const OPTIONS: Array<{ key: NotifyPreference; label: string; detail: string }> = [
  { key: 'off', label: 'Nothing', detail: 'No notifications at all' },
  {
    key: 'milestones',
    label: 'Premieres & finales',
    detail: 'The moments worth knowing about',
  },
  { key: 'all', label: 'Every episode', detail: 'Everything, as it airs' },
];

export default function CalendarScreen() {
  const [entries, setEntries] = useState<UpcomingEntry[]>();
  const [preference, setPref] = useState<NotifyPreference>(getPreference);
  const [delivery, setDelivery] = useState<string>();
  const [registered, setRegistered] = useState(false);
  const router = useRouter();

  useEffect(() => {
    void getUpcoming().then(setEntries);
    // Opening the calendar is the one moment somebody definitely wants it current.
    // Throttled in the core, so arriving here repeatedly costs nothing; the list is
    // re-read after, because nothing on this platform is watching the table.
    void requestRefresh().then((report) => {
      if (report?.refreshed) void getUpcoming().then(setEntries);
    });
  }, []);

  const days = groupByDay(entries ?? []);

  return (
    <>
      <Stack.Screen options={{ title: 'Upcoming' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionHeading} accessibilityRole="header">
          Tell me about
        </Text>
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel="Tell me about"
          style={styles.options}
        >
          {OPTIONS.map((option) => (
            <Pressable
              key={option.key}
              onPress={() => {
                setPref(option.key);
                // Mirrored to the server, which filters before sending — a stale setting
                // there would cost a delivery, or send one nobody asked for.
                void syncPreference(option.key);
                if (option.key === 'off') void unregisterFromPush();
              }}
              style={[styles.option, preference === option.key && styles.optionOn]}
              // One of three, not three independent buttons: which one is on is the
              // entire content of this control, and a button role cannot say it.
              accessibilityRole="radio"
              accessibilityState={{
                selected: preference === option.key,
                checked: preference === option.key,
              }}
              accessibilityLabel={`${option.label} — ${option.detail}`}
            >
              <View style={styles.optionBody}>
                <Text style={styles.optionLabel}>{option.label}</Text>
                <Text style={styles.optionDetail}>{option.detail}</Text>
              </View>
              {preference === option.key && <Text style={styles.tick}>✓</Text>}
            </Pressable>
          ))}
        </View>

        {/* Choosing a granularity used to be the whole of it: the phone offered the
            same three options as the web and had nothing that could ever act on them,
            which is worse than offering none. This is where that stops being true. */}
        {preference !== 'off' && (
          <View style={styles.delivery}>
            {pushSupported() ? (
              <>
                <Pressable
                  onPress={async () => {
                    const result = await registerForPush();
                    setRegistered(result.ok);
                    setDelivery(
                      result.ok
                        ? 'This device will be notified.'
                        : result.reason,
                    );
                  }}
                  style={[styles.enable, registered && styles.enableOn]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: registered }}
                >
                  <Text style={[styles.enableText, registered && styles.enableTextOn]}>
                    {registered ? 'Notifications on' : 'Notify this device'}
                  </Text>
                </Pressable>
                {delivery && <Text style={styles.deliveryNote}>{delivery}</Text>}
              </>
            ) : (
              // Said plainly rather than left as a control that does nothing. The
              // reason differs — a simulator, the web build, a build with no project
              // id — and each sends someone looking in a different place.
              <Text style={styles.deliveryNote}>
                Nothing can be delivered to this device yet. {whyNotSupported()} Your
                choice above is saved and will apply once it can.
              </Text>
            )}
          </View>
        )}

        <Text style={[styles.sectionHeading, styles.spaced]}>Next 30 days</Text>
        {entries === undefined && <ActivityIndicator color={theme.accent} />}
        {entries?.length === 0 && (
          <Text style={styles.blurb}>
            Nothing scheduled. Track a show that is still airing and it will show up here.
          </Text>
        )}

        {days.map(([day, list]) => (
          <View key={day} style={styles.day}>
            <Text style={styles.dayHeading}>{day}</Text>
            {list.map((entry) => (
              <Pressable
                key={entry.episode.id}
                onPress={() =>
                  router.push(`/title/${encodeURIComponent(entry.seriesId)}`)
                }
                style={styles.entry}
                accessibilityRole="link"
                accessibilityLabel={`Open ${entry.seriesName}`}
              >
                <View style={styles.entryBody}>
                  <Text numberOfLines={1} style={styles.entryName}>
                    {entry.seriesName}
                  </Text>
                  <Text numberOfLines={1} style={styles.entryMeta}>
                    S{entry.episode.season}E{entry.episode.number} · {entry.episode.name}
                  </Text>
                </View>
                {KIND_LABEL[entry.kind] ? (
                  <Text style={styles.kind}>{KIND_LABEL[entry.kind]}</Text>
                ) : null}
              </Pressable>
            ))}
          </View>
        ))}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  delivery: { marginTop: 10, gap: 8 },
  enable: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: theme.surface,
  },
  enableOn: { backgroundColor: theme.accent },
  enableText: { color: theme.text, fontSize: 14 },
  enableTextOn: { color: theme.ink, fontWeight: '600' },
  deliveryNote: { color: theme.muted, fontSize: 13, lineHeight: 19 },
  content: { padding: 16, gap: 8, backgroundColor: theme.ink, flexGrow: 1, paddingBottom: 40 },
  sectionHeading: {
    color: theme.muted,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  spaced: { marginTop: 18 },
  blurb: { color: theme.muted, fontSize: 14, lineHeight: 20 },

  options: { gap: 8 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderRadius: radius.lg,
    padding: 14,
  },
  optionOn: { borderWidth: 1, borderColor: theme.accent },
  optionBody: { flex: 1 },
  optionLabel: { color: theme.text, fontSize: 15, fontWeight: '600' },
  optionDetail: { color: theme.muted, fontSize: 12 },
  tick: { color: theme.accent, fontSize: 18 },

  day: { gap: 6, marginTop: 8 },
  dayHeading: { color: theme.muted, fontSize: 12 },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.surface,
    borderRadius: radius.lg,
    padding: 12,
  },
  entryBody: { flex: 1, minWidth: 0 },
  entryName: { color: theme.text, fontSize: 14, fontWeight: '600' },
  entryMeta: { color: theme.muted, fontSize: 12 },
  kind: { color: theme.accent, fontSize: 11 },
});

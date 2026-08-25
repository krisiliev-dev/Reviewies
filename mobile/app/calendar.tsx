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
import { radius, theme } from '../src/ui/theme';

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
  const router = useRouter();

  useEffect(() => {
    void getUpcoming().then(setEntries);
  }, []);

  const days = groupByDay(entries ?? []);

  return (
    <>
      <Stack.Screen options={{ title: 'Upcoming' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionHeading}>Tell me about</Text>
        {OPTIONS.map((option) => (
          <Pressable
            key={option.key}
            onPress={() => {
              setPref(option.key);
              setPreference(option.key);
            }}
            style={[styles.option, preference === option.key && styles.optionOn]}
          >
            <View style={styles.optionBody}>
              <Text style={styles.optionLabel}>{option.label}</Text>
              <Text style={styles.optionDetail}>{option.detail}</Text>
            </View>
            {preference === option.key && <Text style={styles.tick}>✓</Text>}
          </Pressable>
        ))}

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

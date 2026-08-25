import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import {
  availableYears,
  formatDuration,
  getSummary,
  type StatsSummary,
  type Window,
} from '@reviewies/core/stats/compute';
import { radius, theme } from '../src/ui/theme';

/**
 * Stats, weighted by runtime rather than by episode count.
 *
 * *"Half-hour programs can't compete with 45-60 minute programs"* — r/Serializd. Both
 * the ranking and the bar widths use time, which is the only way a comedy and a drama
 * can sit in the same list honestly.
 *
 * Kept off the tab bar and out of the marking flow on purpose. From doc 8: *"stats
 * stresses me out […] I don't need a reminder that I spent literal months doing this
 * every time I check an episode."* You come here when you want this.
 */
const WINDOWS: Array<{ key: Window; label: string }> = [
  { key: '30d', label: '30 days' },
  { key: 'ytd', label: 'This year' },
  { key: 'all', label: 'All time' },
];

export default function StatsScreen() {
  const [window, setWindow] = useState<Window>('30d');
  const [year, setYear] = useState<number>();
  const [years, setYears] = useState<number[]>([]);
  const [summary, setSummary] = useState<StatsSummary>();

  useEffect(() => {
    void availableYears().then(setYears);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setSummary(undefined);
    void getSummary(window, { year }).then((result) => {
      if (!cancelled) setSummary(result);
    });
    return () => {
      cancelled = true;
    };
  }, [window, year]);

  const longest = summary?.topTitles[0]?.minutes ?? 1;

  return (
    <>
      <Stack.Screen options={{ title: 'Stats' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.chips}>
          {WINDOWS.map((option) => (
            <Chip
              key={option.key}
              label={option.label}
              active={window === option.key && year === undefined}
              onPress={() => {
                setWindow(option.key);
                setYear(undefined);
              }}
            />
          ))}
          {/* TV Time's REWIND was among its most-loved features; this is that. */}
          {years.map((value) => (
            <Chip
              key={value}
              label={String(value)}
              active={year === value}
              onPress={() => {
                setWindow('year');
                setYear(value);
              }}
            />
          ))}
        </View>

        {!summary && <ActivityIndicator color={theme.accent} style={styles.loading} />}

        {summary && (
          <>
            <View style={styles.figures}>
              <Figure label="Watched" value={formatDuration(summary.minutes)} />
              <Figure label="Episodes" value={String(summary.episodes)} />
              <Figure label="Titles" value={String(summary.distinctTitles)} />
              <Figure
                label="Longest streak"
                value={`${summary.longestStreakDays} day${summary.longestStreakDays === 1 ? '' : 's'}`}
              />
            </View>

            {summary.busiestDay && (
              <Text style={styles.note}>
                Busiest day was {summary.busiestDay.date} with {summary.busiestDay.episodes}{' '}
                episode{summary.busiestDay.episodes === 1 ? '' : 's'}.
              </Text>
            )}

            {summary.topTitles.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionHeading}>Most watched</Text>
                {summary.topTitles.map((title) => (
                  <View key={title.titleId} style={styles.tally}>
                    <View style={styles.tallyHead}>
                      <Text numberOfLines={1} style={styles.tallyName}>
                        {title.name}
                      </Text>
                      <Text style={styles.tallyTime}>{formatDuration(title.minutes)}</Text>
                    </View>
                    {/* Width by time, not by episode count — the same rule as the
                        ranking, or the picture would contradict the order. */}
                    <View style={styles.barTrack}>
                      <View
                        style={[styles.barFill, { width: `${(title.minutes / longest) * 100}%` }]}
                      />
                    </View>
                  </View>
                ))}
              </View>
            )}

            {summary.episodes === 0 && (
              <Text style={styles.note}>Nothing watched in this window yet.</Text>
            )}
          </>
        )}
      </ScrollView>
    </>
  );
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipOn]}>
      <Text style={[styles.chipText, active && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.figure}>
      <Text style={styles.figureLabel}>{label}</Text>
      <Text style={styles.figureValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14, backgroundColor: theme.ink, flexGrow: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    backgroundColor: theme.surface2,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  chipOn: { backgroundColor: theme.accent },
  chipText: { color: theme.muted, fontSize: 12 },
  chipTextOn: { color: theme.ink, fontWeight: '600' },
  loading: { marginTop: 32 },

  figures: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  figure: {
    flexGrow: 1,
    minWidth: '45%',
    backgroundColor: theme.surface,
    borderRadius: radius.lg,
    padding: 14,
  },
  figureLabel: { color: theme.muted, fontSize: 12 },
  figureValue: { color: theme.text, fontSize: 22, fontWeight: '700' },
  note: { color: theme.muted, fontSize: 13 },

  section: { gap: 10, marginTop: 6 },
  sectionHeading: {
    color: theme.muted,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  tally: { gap: 5 },
  tallyHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  tallyName: { color: theme.text, fontSize: 14, flex: 1 },
  tallyTime: { color: theme.muted, fontSize: 12 },
  barTrack: { height: 6, backgroundColor: theme.surface2, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: 6, backgroundColor: theme.accent, borderRadius: 3 },
});

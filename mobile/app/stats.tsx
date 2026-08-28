import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import {
  availableYears,
  DEFAULT_STATS_WINDOW,
  formatDuration,
  getSummary,
  type StatsSummary,
  type Window,
} from '@reviewies/core/stats/compute';
import { border, radius, theme } from '../src/ui/theme';
import { COPY } from '@reviewies/core/copy';
import { formatDay } from '@reviewies/core/time';
import { Choice } from '../src/ui/Choice';

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
  const [window, setWindow] = useState<Window>(DEFAULT_STATS_WINDOW);
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
        {/* One group, which is what it always was: a single radiogroup with two hand-built
            chip lists inside it. `Choice` draws being chosen as a rule and a weight step
            rather than the accent fill — the app's one filled shape belongs to the thing
            worth pressing, not the thing already chosen — and it is 44 tall, where these
            chips were not.

            TV Time's REWIND was among its most-loved features; the years are that. */}
        <Choice
          name="Which stretch of time these figures cover"
          options={[
            ...WINDOWS.map((option) => ({ key: option.key as string, label: option.label })),
            ...years.map((value) => ({
              key: String(value),
              label: String(value),
              hint: `your ${value}`,
            })),
          ]}
          value={year === undefined ? window : String(year)}
          onChange={(next) => {
            const asYear = Number(next);
            if (Number.isNaN(asYear)) {
              setWindow(next as Window);
              setYear(undefined);
            } else {
              setWindow('year');
              setYear(asYear);
            }
          }}
        />

        {!summary && <ActivityIndicator color={theme.workingFill} style={styles.loading} />}

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
                {COPY.stats.busiestDay(
                  formatDay(summary.busiestDay.date),
                  summary.busiestDay.episodes,
                )}
              </Text>
            )}

            {summary.topTitles.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionHeading}>Most watched</Text>
                {summary.topTitles.map((title) => (
                  <View key={title.titleId} style={styles.tallyCard}>
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
                        style={[
                          styles.barFill,
                          { width: `${Math.max(4, (title.minutes / longest) * 100)}%` },
                        ]}
                      />
                    </View>
                    {/* The count under the bar, which the web has had since Stats
                        shipped and this did not. A bar with no number beside it is a
                        shape: it says one show beat another and not by how much of what.
                        §6.62 put the two screenshots side by side. */}
                    <Text style={styles.tallyCount}>
                      {title.episodes} {title.episodes === 1 ? 'episode' : 'episodes'}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {summary.episodes === 0 && (
              <View style={styles.emptyBlock}>
                <Text style={styles.note}>{COPY.stats.empty}</Text>
                {/* The web's copy of this, for the same reason: nine year-buttons above
                    an empty period is not an answer somebody reads as one. §6.54. */}
                {years.length > 0 && (window !== 'all' || year !== undefined) && (
                  <Pressable
                    onPress={() => {
                      setYear(undefined);
                      setWindow('all');
                    }}
                    style={styles.allTime}
                    accessibilityRole="button"
                    accessibilityLabel={COPY.stats.showAllTime}
                  >
                    <Text style={styles.allTimeText}>{COPY.stats.showAllTime}</Text>
                  </Pressable>
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </>
  );
}

/*
 * `Chip` was here — a local radio with its own fill, its own text colours and its own box.
 * `Choice` is that control for both platforms; keeping a second one beside it is how the
 * density chips and the calendar's options ended up disagreeing about what a radio is.
 */

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.figure}>
      <Text style={styles.figureLabel}>{label}</Text>
      <Text style={styles.figureValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16, backgroundColor: theme.ground, flexGrow: 1 },
  loading: { marginTop: 32 },

  figures: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  figure: {
    flexGrow: 1,
    minWidth: '45%',
    backgroundColor: theme.groundRaised,
    borderRadius: radius.plate,
    padding: 16,
  },
  figureLabel: { color: theme.inkSecondary, fontSize: 12 },
  figureValue: { color: theme.ink, fontSize: 22, fontWeight: '700' },
  emptyBlock: { gap: 12, alignItems: 'flex-start', marginTop: 8 },
  allTime: {
    borderWidth: border.hairline, borderColor: theme.strokeSignal, backgroundColor: 'transparent',
    borderRadius: radius.pill,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  allTimeText: { color: theme.ink, fontSize: 14, fontWeight: '600' },
  note: { color: theme.inkSecondary, fontSize: 13 },

  section: { gap: 12, marginTop: 6 },
  sectionHeading: {
    color: theme.inkSecondary,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  // A card, like the web's. It was bare text on the page background with a hairline
  // running the full width of the screen under it, which reads as a progress bar rather
  // than as a chart. §6.62.
  tallyCard: {
    gap: 6,
    backgroundColor: theme.groundRaised,
    borderRadius: radius.plate,
    padding: 12,
  },
  tallyCount: { color: theme.inkSecondary, fontSize: 11 },
  tallyHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  tallyName: { color: theme.ink, fontSize: 14, flex: 1 },
  tallyTime: { color: theme.inkSecondary, fontSize: 12 },
  barTrack: { height: 6, backgroundColor: theme.groundWell, borderRadius: radius.pill, overflow: 'hidden' },
  barFill: { height: 6, backgroundColor: theme.workingFill, borderRadius: radius.pill },
});

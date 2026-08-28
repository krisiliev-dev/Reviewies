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
import { border, radius, theme, tracking } from '../src/ui/theme';
import { text, type, track } from '@reviewies/core/tokens';
import { COPY } from '@reviewies/core/copy';
import { formatDay } from '@reviewies/core/time';
import { Choice } from '../src/ui/Choice';
import { Section } from '../src/ui/Section';
import { Data } from '../src/ui/Data';

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
        {/*
         * Two groups since §6.109, because they are two questions — see the web's copy of
         * this screen for the measurements the arrangement was chosen on. "How far back"
         * has three fixed answers; "which year" has as many as the person has history,
         * and a decade of imported TV Time put ten more chips in the same unlabelled
         * group carrying the same weight as the three that matter most.
         *
         * TV Time's REWIND was among its most-loved features; the years are that, and
         * they now say so.
         */}
        <Choice
          name="Which stretch of time these figures cover"
          options={WINDOWS.map((option) => ({ key: option.key as string, label: option.label }))}
          value={year === undefined ? window : ''}
          onChange={(next) => {
            setWindow(next as Window);
            setYear(undefined);
          }}
        />

        {years.length > 0 && (
          <View style={styles.section}>
            <Section>Year in review</Section>
            <Choice
              name="Which year to review"
              scroll
              options={years.map((value) => ({
                key: String(value),
                label: String(value),
                hint: `your ${value}`,
              }))}
              value={year === undefined ? '' : String(year)}
              onChange={(next) => {
                setWindow('year');
                setYear(Number(next));
              }}
            />
          </View>
        )}

        {!summary && <ActivityIndicator color={theme.workingFill} style={styles.loading} />}

        {/*
         * Four zeros, or the sentence — never both, and never the zeros first.
         *
         * Measured on the phone through the route a person takes: an empty period drew
         * "Watched 0m / Episodes 0 / Titles 0 / Longest streak 0 days" at 22px starting
         * at y=156, and "Nothing watched in this period yet." at 13px at y=320 — the
         * claim in the largest type on the screen and the correction 165px below it in
         * the smallest. The web has never done this: it renders the sentence *instead
         * of* the summary. Same screen, same core call, two answers to what an empty
         * period looks like.
         *
         * The zeros are not information; they are the absence of one, asserted. §6.56's
         * rule — an empty state is a claim about somebody's own data — and this screen
         * was already half-agreeing with it, since "Most watched" and the busiest day
         * hide themselves when there is nothing to say.
         */}
        {summary && summary.episodes === 0 ? (
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
        ) : null}

        {summary && summary.episodes > 0 && (
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
                <Section>Most watched</Section>
                {summary.topTitles.map((title) => (
                  <View key={title.titleId} style={styles.tallyCard}>
                    <View style={styles.tallyHead}>
                      <Text numberOfLines={1} style={styles.tallyName}>
                        {title.name}
                      </Text>
                      <Data value={formatDuration(title.minutes)} style={styles.tallyTime} />
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
                    <Data
                      value={`${title.episodes} ${title.episodes === 1 ? 'episode' : 'episodes'}`}
                      size="s12"
                      style={styles.tallyCount}
                    />
                  </View>
                ))}
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
      <Data value={value} size="s20" style={styles.figureValue} />
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
  figureLabel: { color: theme.inkSecondary, fontSize: text.s12, fontFamily: type.family.body.name },
  figureValue: { color: theme.ink },
  emptyBlock: { gap: 12, alignItems: 'flex-start', marginTop: 8 },
  allTime: {
    borderWidth: border.hairline, borderColor: theme.strokeSignal, backgroundColor: 'transparent',
    borderRadius: radius.pill,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  allTimeText: { color: theme.ink, fontSize: text.s14, fontFamily: type.family.title.name },
  // 13 against the web's 14. 13 is one of the two the scale killed.
  note: { color: theme.inkSecondary, fontSize: text.s14, fontFamily: type.family.body.name },

  section: { gap: 12, marginTop: 6 },
  // A card, like the web's. It was bare text on the page background with a hairline
  // running the full width of the screen under it, which reads as a progress bar rather
  // than as a chart. §6.62.
  tallyCard: {
    gap: 6,
    backgroundColor: theme.groundRaised,
    borderRadius: radius.plate,
    padding: 12,
  },
  // 11 against the web's 12, for the same line under the same bar.
  tallyCount: { color: theme.inkSecondary },
  tallyHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  tallyName: { color: theme.ink, fontSize: text.s14, flex: 1, fontFamily: type.family.body.name },
  // 12 against the web's 14, beside a name that is the same size on both.
  tallyTime: { color: theme.inkSecondary },
  barTrack: { height: 6, backgroundColor: theme.groundWell, borderRadius: radius.pill, overflow: 'hidden' },
  barFill: { height: 6, backgroundColor: theme.workingFill, borderRadius: radius.pill },
});

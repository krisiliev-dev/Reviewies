import { StyleSheet, Text, View } from 'react-native';
import { formatDuration, type SpineYear } from '@reviewies/core/stats/compute';
import {
  PLOT_FILL,
  SPINE,
  SPINE_COLOUR,
  spineColumns,
  spinePeak,
  spineScale,
} from '@reviewies/core/ui/spine';
import { COPY } from '@reviewies/core/copy';
import { monthName } from '@reviewies/core/time';
import { text, type } from '@reviewies/core/tokens';
import { space, theme } from './theme';
import { Data } from './Data';
import { Note } from './Note';
import { Section } from './Section';

/**
 * The React Native renderer of `core/src/ui/spine.ts`. The decisions are there, and
 * `docs/design/calm.md` is why this exists at all.
 *
 * ## One row is one image
 *
 * `accessible` with `accessibilityRole="image"` on the row, which is React Native's way of
 * saying what the web says with `role="img"`: collapse everything inside into one element
 * with one name. Twelve blocks announced one at a time is the shape of the data rather than
 * the sense of it, and the sentence — `COPY.stats.spineYear` — carries the one thing the
 * picture says that the figures beside it do not, which is where the weight of the year
 * fell.
 *
 * Without `accessible`, `accessibilityLabel` on a `View` with children is a name on a node
 * VoiceOver walks into anyway, so the row would be read twice: once as the label and once as
 * its contents. The web gets that collapse free from the role.
 *
 * ## Colours through `theme`, geometry through the table
 *
 * `SPINE_COLOUR` holds names and this file resolves them, exactly as `Progress` resolves
 * `PROGRESS_COLOUR` — the phone is pinned to `color.dark` today, and a hex written here is a
 * hex that cannot follow the table on the day it is not.
 */
export function YearSpine({ years }: { years: SpineYear[] }) {
  const busiest = spineScale(years);
  return (
    <View style={styles.spine}>
      <Section>{COPY.stats.yourYears}</Section>
      {years.map((year) => (
        <YearRow key={year.year} year={year} busiest={busiest} />
      ))}
      {/* The caption, once, for the one cell that is open — see the web's copy of this
          component for why it is a fact and not an instruction. */}
      <Note level="footnote">{COPY.stats.openSlot}</Note>
    </View>
  );
}

function YearRow({ year, busiest }: { year: SpineYear; busiest: number }) {
  const columns = spineColumns(year.months, busiest, year.open);
  const peak = spinePeak(year.months);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={
        year.episodes === 0
          ? COPY.stats.spineYearNothing(year.year)
          : COPY.stats.spineYear(
              year.year,
              year.episodes,
              formatDuration(year.minutes),
              monthName(peak),
            )
      }
    >
      <View style={styles.head}>
        <Data value={String(year.year)} style={styles.year} />
        {year.episodes > 0 ? (
          <Text style={styles.figures}>
            {year.episodes} {year.episodes === 1 ? 'episode' : 'episodes'} ·{' '}
            {formatDuration(year.minutes)}
          </Text>
        ) : null}
      </View>

      <View style={styles.plot}>
        {columns.map((column) => (
          <View key={column.month} style={styles.column}>
            {/* The track is a ground, not an outline — `progress.ts` measured what drawing
                it as a border costs on this platform, where Yoga is border-box with no way
                to ask for anything else. */}
            <View style={styles.track} />
            <View style={[styles.mark, { height: column.height }]} />
            {column.open ? (
              <View style={[styles.slot, { bottom: column.height + SPINE.gap }]} />
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  spine: { gap: space.s12 },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.s8 },
  year: { color: theme.ink },
  figures: {
    color: theme.inkSecondary,
    fontSize: text.s14,
    fontFamily: type.family.body.name,
  },
  plot: { flexDirection: 'row', alignItems: 'flex-end', gap: SPINE.gap, height: SPINE.plot },
  column: { flex: 1, height: SPINE.plot },
  track: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: PLOT_FILL,
    backgroundColor: theme[SPINE_COLOUR.track],
  },
  mark: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme[SPINE_COLOUR.mark],
  },
  slot: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: SPINE.slot,
    borderWidth: SPINE.stroke,
    borderColor: theme[SPINE_COLOUR.slot],
  },
});

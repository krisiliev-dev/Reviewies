import { StyleSheet, View } from 'react-native';
import {
  PROGRESS_COLOUR,
  PROGRESS_SIZE,
  progressPercent,
  type ProgressSize,
} from '@reviewies/core/ui/progress';
import { border, theme } from './theme';

/**
 * The React Native renderer of `core/src/ui/progress.ts`. The decisions are there.
 *
 * `workingMark` rather than `workingFill` for the same reason the web uses it, even though
 * this platform is pinned to dark and the two resolve identically today. A rule that only
 * holds because nothing has switched the theme yet is a rule that breaks on the day
 * somebody does.
 */
export function Progress({
  value,
  max,
  label,
  size = 'bar',
}: {
  value: number;
  max: number;
  /** What the bar is measuring. A bar with no name is a shape. */
  label: string;
  size?: ProgressSize;
}) {
  const metrics = PROGRESS_SIZE[size];
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(progressPercent(value, max)) }}
      style={[styles.track, { height: metrics.height, borderRadius: metrics.radius }]}
    >
      <View
        style={[
          styles.done,
          { width: `${progressPercent(value, max)}%`, borderRadius: metrics.radius },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    overflow: 'hidden',
    borderWidth: border.hairline,
    borderColor: theme[PROGRESS_COLOUR.track],
  },
  done: { height: '100%', backgroundColor: theme[PROGRESS_COLOUR.done] },
});

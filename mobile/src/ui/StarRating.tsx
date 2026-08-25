import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from './theme';

/**
 * Half-star ratings.
 *
 * Half stars because whole ones were the most repeated request on r/Letterboxd, and
 * because a five-point scale without them is really a three-point scale in practice.
 *
 * Each star is two touch targets — left half, right half — which is the only way to
 * offer halves on a phone without a slider. Tapping the value you already have clears
 * it; a rating you cannot take back is worse than none, and there is nowhere else to
 * put an undo.
 *
 * Ten targets in a row makes target size the design problem. Sized by the glyph, each
 * half came out nine to fourteen pixels wide, against the 24 CSS pixels WCAG 2.5.8 asks
 * for — small enough that the tap-again-to-clear escape was covering for how often the
 * wrong one was hit. Each half is now at least 24 wide whatever the glyph is doing,
 * which makes the whole control 240 wide, which is why its callers give it a line of
 * its own rather than putting it beside something.
 */
const MIN_HALF = 24;
export function StarRating({
  value,
  onChange,
  size = 28,
}: {
  value?: number;
  onChange: (value: number | undefined) => void;
  size?: number;
}) {
  const set = (next: number) => onChange(next === value ? undefined : next);

  return (
    <View style={styles.row}>
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = (value ?? 0) >= star;
        const half = !filled && (value ?? 0) >= star - 0.5;
        return (
          <View
            key={star}
            style={[styles.star, { width: MIN_HALF * 2, height: Math.max(MIN_HALF, size) }]}
          >
            <Text style={[{ fontSize: size }, styles.glyph, (filled || half) && styles.on]}>
              {filled ? '★' : half ? '⯪' : '☆'}
            </Text>
            <Pressable
              style={styles.half}
              onPress={() => set(star - 0.5)}
              accessibilityRole="button"
              accessibilityLabel={`${star - 0.5} stars`}
            />
            <Pressable
              style={[styles.half, styles.right]}
              onPress={() => set(star)}
              accessibilityRole="button"
              accessibilityLabel={`${star} stars`}
            />
          </View>
        );
      })}
      {value !== undefined && <Text style={styles.value}>{value.toFixed(1)}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  star: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  glyph: { color: theme.surface2 },
  on: { color: theme.accent },
  half: { position: 'absolute', top: 0, bottom: 0, left: 0, width: MIN_HALF },
  right: { left: undefined, right: 0 },
  value: { color: theme.muted, fontSize: 12, marginLeft: 6 },
});

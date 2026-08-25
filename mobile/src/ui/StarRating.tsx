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
 */
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
          <View key={star} style={styles.star}>
            <Text style={[{ fontSize: size }, styles.glyph, (filled || half) && styles.on]}>
              {filled ? '★' : half ? '⯪' : '☆'}
            </Text>
            <Pressable
              style={[styles.half, { width: size / 2, height: size }]}
              onPress={() => set(star - 0.5)}
              accessibilityLabel={`${star - 0.5} stars`}
            />
            <Pressable
              style={[styles.half, styles.right, { width: size / 2, height: size }]}
              onPress={() => set(star)}
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
  star: { position: 'relative' },
  glyph: { color: theme.surface2 },
  on: { color: theme.accent },
  half: { position: 'absolute', top: 0, left: 0 },
  right: { left: undefined, right: 0 },
  value: { color: theme.muted, fontSize: 12, marginLeft: 6 },
});

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { BOX_RADIUS, BUSY, PRESSED, SIZE, TONE, type ButtonContract } from '@reviewies/core/ui/button';
import { border, radius, theme } from './theme';

/**
 * The React Native renderer of `core/src/ui/button.ts`. The decisions are there.
 *
 * The two renderers cannot share code — one is class strings, the other is a StyleSheet —
 * so what they share is the table. `button.test.ts` holds them to it, because "these agree"
 * is otherwise something a person has to notice, which is the failure §6.51 catalogued for
 * words and §6.85 for colour.
 */
interface Props extends ButtonContract {
  onPress?: () => void;
  /**
   * A destination, rather than wrapping this in `<Link asChild>`.
   *
   * Every call site on the phone did the wrapping, and `index.tsx` carries the scar in a
   * comment: `asChild` clones its child and merges props, and an array style through that
   * path reached the DOM as an index-keyed object, which React refuses to set — the export
   * booted to a blank page. This component's style is a function, which would go through
   * the same cloning, so it takes the destination itself and there is nothing to clone.
   */
  to?: string;
  children?: ReactNode;
}

export function Button({
  label,
  name,
  tone = 'secondary',
  size = 'row',
  disabled,
  busy,
  selected,
  onPress,
  to,
  children,
}: Props) {
  const shape = TONE[tone];
  const metrics = SIZE[size];
  const fill = disabled ? shape.disabledFill : shape.fill;
  const stroke = disabled ? shape.disabledStroke : shape.stroke;
  const label_ = disabled ? shape.disabledLabel : shape.label;

  return (
    <Pressable
      onPress={to ? () => router.push(to) : onPress}
      disabled={disabled}
      accessibilityRole={to ? 'link' : 'button'}
      accessibilityLabel={name}
      accessibilityState={{ disabled: !!disabled, busy: !!busy, selected: !!selected }}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: metrics.minHeight,
          paddingHorizontal: metrics.paddingX,
          paddingVertical: metrics.paddingY,
          borderRadius: tone === 'quiet' ? radius.none : BOX_RADIUS,
          backgroundColor: fill ? theme[fill] : 'transparent',
          borderWidth: stroke ? border.hairline : 0,
          borderColor: stroke ? theme[stroke] : 'transparent',
        },
        // Instant, and therefore identical with Reduce Motion on. A thickening plus a
        // ground step, which is press feedback rather than animation.
        pressed && !disabled
          ? { borderWidth: PRESSED.stroke, backgroundColor: theme[PRESSED.fill] }
          : null,
      ]}
    >
      <Text
        style={[
          styles.label,
          // From the table, not from this file. A single size here printed `inline` at
          // fifteen points where the web printed twelve, so a quiet control under a row
          // came out louder than the row's own words.
          { fontSize: metrics.label, color: theme[label_] },
          shape.underline ? styles.underlined : null,
        ]}
      >
        {label}
      </Text>
      {children}
      {/* Busy keeps the label and rules under it — it never replaces the label with a
          spinner, which is what `account.tsx` did and then had to explain in a comment. */}
      {busy ? (
        <View
          accessible={false}
          style={{
            height: BUSY.underline,
            width: metrics.paddingX,
            marginLeft: border.tally,
            backgroundColor: theme[BUSY.colour],
          }}
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  label: { fontWeight: '600' },
  underlined: { textDecorationLine: 'underline' },
});

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import {
  BOX_RADIUS,
  BUSY,
  LABEL_FACE,
  PRESSED,
  SELECTED,
  SIZE,
  TONE,
  type ButtonContract,
} from '@reviewies/core/ui/button';
import { PRESS } from '@reviewies/core/ui/surface';
import { type } from '@reviewies/core/tokens';
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
  lines,
  children,
}: Props) {
  const shape = TONE[tone];
  const metrics = SIZE[size];
  const fill = disabled ? shape.disabledFill : shape.fill;
  const stroke = disabled ? shape.disabledStroke : shape.stroke;
  const label_ = disabled ? shape.disabledLabel : shape.label;
  // On is drawn, not only announced. `SELECTED` is `choice.ts`'s `CHOSEN`: a rule and a
  // weight step, never a fill — the same "on" a radio draws, so the two controls do not
  // spell the same state two ways, and so the one filled shape in the app keeps meaning
  // "the thing worth pressing" rather than "the thing already chosen".
  // Boxed tones only: `quiet` has no box, so it has no box's rule to thicken. Nothing asks
  // for a quiet toggle today and the branch would be one nothing runs.
  const on = !!selected && !disabled && tone !== 'quiet';

  return (
    <Pressable
      onPress={to ? () => router.push(to) : onPress}
      disabled={disabled}
      accessibilityRole={to ? 'link' : 'button'}
      accessibilityLabel={name}
      aria-disabled={!!disabled} aria-busy={!!busy} aria-selected={!!selected}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: metrics.minHeight,
          paddingHorizontal: metrics.paddingX,
          paddingVertical: metrics.paddingY,
          borderRadius: tone === 'quiet' ? radius.none : BOX_RADIUS,
          backgroundColor: fill ? theme[fill] : 'transparent',
          borderWidth: on ? SELECTED.rule : stroke ? border.hairline : 0,
          borderColor: on ? theme[SELECTED.colour] : stroke ? theme[stroke] : 'transparent',
        },
        // Instant, and therefore identical with Reduce Motion on. A thickening plus a
        // ground step, which is press feedback rather than animation.
        pressed && !disabled
          ? { borderWidth: PRESSED.stroke, backgroundColor: theme[PRESS] }
          : null,
      ]}
    >
      <Text
        /*
         * Unset is unlimited, which is `Text`'s own default and is what a label wants: a
         * button is a target, and clipping its words at 200% text is a worse defect than
         * a tall pill. `LABEL_LINES` in the core says where the number comes from and why
         * the one call site with somebody else's text asks for it.
         */
        numberOfLines={lines}
        style={[
          styles.label,
          // From the table, not from this file. A single size here printed `inline` at
          // fifteen points where the web printed twelve, so a quiet control under a row
          // came out louder than the row's own words.
          { fontSize: metrics.label, color: theme[on ? SELECTED.label.on : label_] },
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
  label: { fontFamily: type.family[LABEL_FACE].name },
  underlined: { textDecorationLine: 'underline' },
});

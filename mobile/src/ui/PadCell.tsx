import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PAD, padName } from '@reviewies/core/ui/padCell';
import { PRESS, SURFACE_OFF } from '@reviewies/core/ui/surface';
import { radius, theme } from './theme';
import { text, type } from '@reviewies/core/tokens';

/**
 * The React Native renderer of `core/src/ui/padCell.ts`. The decisions are there.
 *
 * The emoji is hidden from the reading order and the label is the whole spoken name, which
 * is what this screen already did by hand at one of its two call sites; the web's did the
 * same thing in different words. `padName` owns it now.
 */
export function PadCell({
  emoji,
  label,
  disabled,
  onPress,
}: {
  emoji: string;
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    // The slot is the column and the plate is the cell: the gap lives in the slot's
    // padding, so the four columns are exactly a quarter of the row each. See `styles`.
    <View style={styles.slot}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={padName(label)}
        aria-disabled={!!disabled}
        style={({ pressed }) => [
          styles.cell,
          disabled && styles.off,
          pressed && !disabled ? styles.pressed : null,
        ]}
      >
        <Text aria-hidden style={styles.glyph}>{emoji}</Text>
        <Text style={[styles.label, disabled && styles.labelOff]}>{label}</Text>
      </Pressable>
    </View>
  );
}

/** The grid the cells sit in, so no screen decides the column count twice. */
export function PadGrid({ children }: { children: React.ReactNode }) {
  return <View style={styles.grid}>{children}</View>;
}

/**
 * Four columns of exactly `100 / PAD.columns` percent, with the gap inside each column.
 *
 * This was `width: '23%'` on the plate and `gap: PAD.gap` on the row, under a comment
 * claiming *"a percentage rather than a computed width: four across with three gaps
 * between them, which is what `PAD.columns` and `PAD.gap` describe and what
 * `padCell.test.ts` checks the two platforms agree about"*. Both halves were false. No
 * clause in that file ever read `23%` — it checked that this file contains the string
 * `gap: PAD.gap` — and 23% is not what the table describes: four of them plus three 8pt
 * gaps want a row of 300pt, and the narrowest phone this app supports gives 296 (320 less
 * the watching screen's own 12pt gutter each side). Measured in the export at 320: cells
 * 68.08pt wide and **three** to a row — seven rows of three where the design is five of
 * four, in a pad that has to be scrolled to reach the last of them. That is the exact
 * failure `core/src/ui/padCell.ts` says the count exists to avoid — twenty reactions
 * reachable in the dark without scrolling — lost to 0.32pt.
 *
 * A percentage cannot pay for a gap. Yoga and CSS both lay `gap` out *beside* the width,
 * so any percentage that fits at 390 (23% left 5.3pt of slack there, which is how this
 * survived every design pass) overflows at some narrower width. So the gap moves into the
 * column as padding, half a gap on each side of the plate, and the row takes that half
 * back at its own two edges. Four columns of a quarter each always fill the row exactly.
 * Measured after the repair, in both exports, at both widths: 68.0pt plates four to a row
 * at 320 and 85.5 at 390, on the phone and on the web alike — where before the phone
 * agreed with the web on one device and by luck.
 *
 * `PAD.columns` and `PAD.gap` are the only place the count and the gap are stated.
 */
const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', margin: -PAD.gap / 2 },
  slot: { width: `${100 / PAD.columns}%`, padding: PAD.gap / 2 },
  cell: {
    width: '100%',
    aspectRatio: PAD.ratio,
    backgroundColor: theme.groundRaised,
    borderRadius: radius.plate,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  off: {
    backgroundColor: 'transparent',
    borderWidth: SURFACE_OFF.rule,
    borderColor: theme[SURFACE_OFF.colour],
  },
  pressed: { backgroundColor: theme[PRESS], transform: [{ scale: 0.94 }] },
  glyph: { fontSize: PAD.glyph },
  label: {
    color: theme.inkSecondary,
    fontSize: text.s12,
    textAlign: 'center',
    fontFamily: type.family.title.name,
  },
  labelOff: { color: theme[SURFACE_OFF.ink] },
});

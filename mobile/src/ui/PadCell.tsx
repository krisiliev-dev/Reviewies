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
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={padName(label)}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.cell,
        disabled && styles.off,
        pressed && !disabled ? styles.pressed : null,
      ]}
    >
      <Text aria-hidden style={styles.glyph}>{emoji}</Text>
      <Text style={[styles.label, disabled && styles.labelOff]}>{label}</Text>
    </Pressable>
  );
}

/** The grid the cells sit in, so no screen decides the column count twice. */
export function PadGrid({ children }: { children: React.ReactNode }) {
  return <View style={styles.grid}>{children}</View>;
}

const styles = StyleSheet.create({
  // A percentage rather than a computed width: four across with three gaps between them,
  // which is what `PAD.columns` and `PAD.gap` describe and what `padCell.test.ts` checks
  // the two platforms agree about.
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: PAD.gap },
  cell: {
    width: '23%',
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

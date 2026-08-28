import { Pressable, StyleSheet, Text } from 'react-native';
import { KEY_DISABLED, KEY_HEIGHT, type KeyContract } from '@reviewies/core/ui/key';
import { radius, space, theme } from './theme';
import { PRESS } from '@reviewies/core/ui/surface';
import { text, type } from '@reviewies/core/tokens';

/**
 * The React Native renderer of `core/src/ui/key.ts`. The decisions are there.
 *
 * Disabled is a rule and a step in the ink, never an opacity — the fascia this replaces
 * had no disabled state at all, so every key sat pressable with no television attached,
 * doing nothing and saying nothing about it.
 */
export function Key({ spec, disabled, onPress }: KeyContract) {
  return (
    <Pressable
      onPress={() => onPress(spec.command, spec.repeat ?? 1)}
      disabled={disabled}
      accessibilityRole="button"
      // "▲" read aloud is "up-pointing triangle", and "OK" is not obviously a button that
      // selects. Every key on the fascia carries a spoken name for that reason.
      accessibilityLabel={spec.name}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.key,
        spec.size === 'wide' && styles.wide,
        spec.size === 'centre' && !disabled && styles.centre,
        disabled && styles.off,
        // Instant, like every other press in this build: feedback that was never motion
        // is feedback Reduce Motion has nothing to substitute for.
        pressed && !disabled ? styles.pressed : null,
      ]}
    >
      <Text
        style={[
          styles.legend,
          spec.size === 'centre' && !disabled && styles.legendCentre,
          disabled && styles.legendOff,
        ]}
      >
        {spec.legend}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  key: {
    minWidth: 72,
    minHeight: KEY_HEIGHT,
    backgroundColor: theme.groundRaised,
    borderRadius: radius.plate,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.s8,
  },
  wide: { flex: 1 },
  centre: { backgroundColor: theme.actionFill },
  off: {
    backgroundColor: 'transparent',
    borderWidth: KEY_DISABLED.rule,
    borderColor: theme[KEY_DISABLED.colour],
  },
  pressed: { backgroundColor: theme[PRESS] },
  legend: { color: theme.ink, fontSize: text.s16, fontFamily: type.family.title.name },
  legendCentre: { color: theme.actionLabel },
  legendOff: { color: theme[KEY_DISABLED.ink] },
});

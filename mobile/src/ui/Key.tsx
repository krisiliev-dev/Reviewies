import { Pressable, StyleSheet, Text } from 'react-native';
import { KEY_BOX, KEY_HEIGHT, type KeyContract } from '@reviewies/core/ui/key';
import { SURFACE_OFF } from '@reviewies/core/ui/surface';
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
      aria-disabled={!!disabled}
      style={({ pressed }) => [
        styles.key,
        // From the table, not from this file. `minWidth: 72` was written here and again in
        // `RemotePanel`'s `dpadGap` to keep the grid's empty cells in line — a number
        // nowhere in the repository, holding the d-pad together by hand, and the reason
        // the same arrow is a square on the web and a rectangle here. §6.181.
        KEY_BOX[spec.size].square && styles.square,
        KEY_BOX[spec.size].spans && styles.spans,
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
    // Never narrower than it is tall, so the smallest key any surface can produce is a
    // square at the height `key.ts` argues for. The width above that is the surface's.
    minWidth: KEY_HEIGHT,
    minHeight: KEY_HEIGHT,
    backgroundColor: theme.groundRaised,
    borderRadius: radius.plate,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.s8,
  },
  square: { aspectRatio: 1 },
  spans: { flex: 1 },
  centre: { backgroundColor: theme.actionFill },
  off: {
    backgroundColor: 'transparent',
    borderWidth: SURFACE_OFF.rule,
    borderColor: theme[SURFACE_OFF.colour],
  },
  pressed: { backgroundColor: theme[PRESS] },
  legend: { color: theme.ink, fontSize: text.s16, fontFamily: type.family.title.name },
  legendCentre: { color: theme.actionLabel },
  legendOff: { color: theme[SURFACE_OFF.ink] },
});

import { StyleSheet, View } from 'react-native';
import { TOGGLE, type ToggleContract } from '@reviewies/core/ui/toggle';
import { radius, theme } from './theme';
import { Tick } from './Mark';

/**
 * The React Native renderer of `core/src/ui/toggle.ts`. The decisions are there.
 *
 * What this replaces is one line — `<Switch value={openComments} />` — and what was wrong
 * with it is that the line was the whole of it: no `trackColor`, no `thumbColor`, so
 * react-native-web painted a **teal** sliding switch on a product whose accent is amber and
 * which uses teal nowhere else. §6.165 photographed it in `13-data.png`.
 *
 * Presentational, as the `Switch` it replaces already was: the row around it is the control,
 * and `data.tsx` has the reasoning at the call site. Hidden from the reading order so the
 * setting is announced once, and from the pointer so a tap here is a tap on the row.
 *
 * The shape is `CrossOff`'s, on purpose rather than by copying: the same `size.target` box,
 * the same `Tick` path, the same `working` fill. A preference is not a watched episode, so it
 * is not that component — but it is the same alphabet, which is the point of having one.
 */
export function Toggle({ value, disabled }: ToggleContract) {
  return (
    <View
      // `aria-hidden` alone: `View` expands it into the two React Native props on a
      // device, and it is the only spelling the web export reads. §6.173.
      aria-hidden
      pointerEvents="none"
      style={[
        styles.box,
        {
          borderWidth: TOGGLE.stroke,
          borderColor: disabled
            ? theme[TOGGLE.unavailable]
            : theme[value ? TOGGLE.on.border : TOGGLE.off.border],
          backgroundColor: value && !disabled ? theme[TOGGLE.on.fill] : 'transparent',
        },
      ]}
    >
      {value ? (
        <Tick color={theme[disabled ? 'dimInk' : TOGGLE.on.mark]} size={TOGGLE.mark} />
      ) : null}
    </View>
  );
}

/**
 * The mark's box is `size.target` even though the row is the target.
 *
 * Not belt and braces: the row can be short — a setting with no hint under it is one line —
 * and a mark that is only as big as its tick would leave the visible thing smaller than the
 * thing you press. §6.95 is the entry about a control that was a fingernail inside its target.
 */
const styles = StyleSheet.create({
  box: {
    width: TOGGLE.size,
    height: TOGGLE.size,
    borderRadius: radius.plate,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

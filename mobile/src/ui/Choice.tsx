import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  CHOICE_SIZE,
  CHOSEN,
  announce,
  type ChoiceContract,
} from '@reviewies/core/ui/choice';
import { border, radius, theme } from './theme';
import { weight } from '@reviewies/core/tokens';

/**
 * The React Native renderer of `core/src/ui/choice.ts`. The decisions are there.
 *
 * `radiogroup` and `radio`, on every one of the five controls this replaces. Watching
 * Mode's density chips were `button` + `selected` at 26×24; the calendar's options were
 * already right. One of those was going to win and it should be the correct one.
 */
export function Choice<T extends string | number>({
  name,
  options,
  value,
  onChange,
  density = 'chips',
}: ChoiceContract<T>) {
  const metrics = CHOICE_SIZE[density];
  const rows = density === 'rows';

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={name}
      style={[
        rows ? styles.rows : styles.chips,
        { gap: rows ? metrics.gap : CHOICE_SIZE.chips.gap },
      ]}
    >
      {options.map((option) => {
        const on = option.key === value;
        return (
          <Pressable
            key={String(option.key)}
            onPress={() => onChange(option.key)}
            accessibilityRole="radio"
            accessibilityLabel={announce(option)}
            accessibilityState={{ checked: on, selected: on }}
            style={({ pressed }) => [
              {
                minHeight: metrics.minHeight,
                minWidth: metrics.minWidth,
                paddingHorizontal: metrics.paddingX,
                justifyContent: 'center',
                // A row lays its body and its tick side by side. Without this the tick
                // stacks under the hint, which the screenshots showed and nothing else
                // would have: it is named, reachable, big enough and in the wrong place.
                ...(rows
                  ? { flexDirection: 'row' as const, alignItems: 'center' as const, gap: metrics.gap }
                  : null),
                borderRadius: rows ? radius.none : radius.plate,
                borderWidth: rows ? 0 : border.hairline,
                borderColor: theme.strokeSignal,
                // Selection is a rule, never a fill. Under the label on a chip, down the
                // leading edge on a row — the same 3pt token either way.
                borderBottomWidth: on && !rows ? CHOSEN.rule : rows ? 0 : border.hairline,
                borderLeftWidth: on && rows ? CHOSEN.rule : 0,
                borderBottomColor: on && !rows ? theme[CHOSEN.colour] : theme.strokeSignal,
                borderLeftColor: on && rows ? theme[CHOSEN.colour] : 'transparent',
              },
              // Instant, so Reduce Motion changes nothing. Same reasoning as `Button`.
              pressed ? { backgroundColor: theme.groundRaised } : null,
            ]}
          >
            <View style={rows ? styles.rowBody : undefined}>
              <Text
                style={[
                  styles.label,
                  { color: theme[on ? CHOSEN.label.on : CHOSEN.label.off] },
                  on ? styles.on : null,
                ]}
              >
                {option.label}
              </Text>
              {rows && option.hint ? <Text style={styles.hint}>{option.hint}</Text> : null}
            </View>
            {/* A mono tick, on rows only, and aria-hidden: the state is already in
                `accessibilityState`, and announcing it twice is how a reader ends up
                hearing "selected, tick, selected". */}
            {rows && on ? (
              <Text accessible={false} style={styles.tick}>
                ✓
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  rows: { flexDirection: 'column' },
  rowBody: { flex: 1 },
  // From `CHOICE_SIZE` in the core, which is where the web reads them too — the two were
  // 14 here and an inherited 16 there.
  label: { fontSize: CHOICE_SIZE.chips.label },
  on: { fontWeight: weight.semibold },
  hint: { color: theme.inkSecondary, fontSize: CHOICE_SIZE.chips.hint, lineHeight: 17 },
  tick: { color: theme.workingMark, fontSize: CHOICE_SIZE.chips.label },
});

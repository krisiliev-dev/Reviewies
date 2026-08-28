import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import { DATA_FACE, DATA_UNIT_FACE, splitFigure } from '@reviewies/core/ui/data';
import { text, type } from '@reviewies/core/tokens';

/**
 * The React Native renderer of `core/src/ui/data.ts`. The decisions are there.
 *
 * Thirteen styles across nine files were this, and only two of them set
 * `fontVariant: ['tabular-nums']` — so eleven number sites were in a mono face without the
 * one property that makes mono worth having. Nested `Text` rather than two siblings,
 * because RN lays nested text inline and siblings in a row that wraps on its own terms.
 */
export function Data({
  value,
  size = 's14',
  style,
}: {
  value: string | number;
  size?: keyof typeof text;
  /** Colour and spacing only — the face, weight and tabular belong to the component. */
  style?: StyleProp<TextStyle>;
}) {
  const { figure, unit } = splitFigure(String(value));
  return (
    <Text style={[{ fontSize: text[size] }, style]}>
      {figure ? <Text style={styles.figure}>{figure}</Text> : null}
      {/* The unit in the body face at the figure's size — `7  days` is what mono does to
          a word, and it is the defect this component was extracted from. */}
      {unit ? <Text style={styles.unit}>{figure ? ' ' : ''}{unit}</Text> : null}
    </Text>
  );
}

const styles = StyleSheet.create({
  figure: {
    fontFamily: type.family[DATA_FACE].name,
    fontVariant: ['tabular-nums'],
  },
  unit: { fontFamily: type.family[DATA_UNIT_FACE].name },
});

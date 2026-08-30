import type { ReactNode } from 'react';
import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import { NOTE, NOTE_INK, type NoteLevel } from '@reviewies/core/ui/note';
import { type } from '@reviewies/core/tokens';
import { leadingOf, theme } from './theme';

/**
 * The React Native renderer of `core/src/ui/note.ts`. The decisions are there.
 *
 * `leadingOf` rather than a stored point value, for **derivability**. Six different literals
 * were what this component was extracted from, and one derived number is the right answer to
 * that — which is the whole of the reason, and two earlier versions of this comment each gave
 * a different wrong one.
 *
 * The first claimed a literal 20 collides at 200% and `leadingOf` escapes it; §6.183 showed
 * both arguments are constants, so the two are the same number. The second, drawn from that,
 * said a point value cannot answer the reader's setting at all; the line box holds still only
 * in `react-native-web`, and React Native scales a stored `lineHeight` with the glyphs on both
 * shipping platforms. `theme.ts` has the citations. Nothing here changes either way — which is
 * what a fact stated in the right place buys.
 */
export function Note({
  children,
  level = 'note',
  style,
  ...rest
}: {
  children: ReactNode;
  level?: NoteLevel;
  /** Margins and layout only — the type and the ink belong to the table. */
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  accessibilityLiveRegion?: 'none' | 'polite' | 'assertive';
}) {
  return (
    <Text style={[level === 'footnote' ? styles.footnote : styles.note, style]} {...rest}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  note: {
    color: theme[NOTE_INK],
    fontSize: NOTE.note.size,
    lineHeight: leadingOf(NOTE.note.size, NOTE.note.leading),
    fontFamily: type.family.body.name,
  },
  footnote: {
    color: theme[NOTE_INK],
    fontSize: NOTE.footnote.size,
    lineHeight: leadingOf(NOTE.footnote.size, NOTE.footnote.leading),
    fontFamily: type.family.body.name,
  },
});

import type { ReactNode } from 'react';
import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import { NOTE, NOTE_INK, type NoteLevel } from '@reviewies/core/ui/note';
import { type } from '@reviewies/core/tokens';
import { leadingOf, theme } from './theme';

/**
 * The React Native renderer of `core/src/ui/note.ts`. The decisions are there.
 *
 * `leadingOf` rather than a stored point value, for **derivability** and not for the reason
 * this comment used to give. It claimed a literal 20 "holds still while the glyphs double at
 * 200% Dynamic Type and the lines collide", with `leadingOf` as the escape; `theme.ts` has
 * the measurement showing the line box holds still either way, because both arguments are
 * constants. Six different literals were what this component was extracted from, and one
 * derived number is still the right answer — just not for that reason. §6.183.
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

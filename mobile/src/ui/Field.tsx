import { useState } from 'react';
import { StyleSheet, TextInput, type StyleProp, type ViewStyle } from 'react-native';
import { FIELD_BOX, FIELD_LINES, FIELD_SIZE, type FieldSize } from '@reviewies/core/ui/field';
import { leading, type } from '@reviewies/core/tokens';
import { leadingOf, theme } from './theme';

/**
 * The React Native renderer of `core/src/ui/field.ts`. The decisions are there.
 *
 * The focus state is drawn here rather than inherited: React Native has no `:focus-visible`,
 * so a focused field would be indistinguishable from an unfocused one but for the caret.
 * It thickens to `border.mark` in the focus colour — the same two channels the web's ring
 * uses, and the same thickening `Button` uses for a press.
 */
export function Field({
  value,
  onChange,
  label,
  placeholder,
  size = 'page',
  multiline = false,
  style,
  ...rest
}: {
  value: string;
  onChange: (value: string) => void;
  /** Announced name. A field with no label is a field only sighted users can fill in. */
  label: string;
  placeholder?: string;
  size?: FieldSize;
  multiline?: boolean;
  /** Layout only — the box and the type belong to the table. */
  style?: StyleProp<ViewStyle>;
  autoFocus?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoCorrect?: boolean;
  keyboardType?: 'default' | 'email-address' | 'url';
  secureTextEntry?: boolean;
  onSubmitEditing?: () => void;
  returnKeyType?: 'done' | 'go' | 'search' | 'send';
  maxLength?: number;
}) {
  const [focused, setFocused] = useState(false);
  const metrics = FIELD_SIZE[size];
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      accessibilityLabel={label}
      placeholder={placeholder}
      placeholderTextColor={theme[FIELD_BOX.placeholder]}
      multiline={multiline}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[
        styles.box,
        {
          minHeight: multiline ? metrics.minHeight * FIELD_LINES : metrics.minHeight,
          paddingHorizontal: metrics.paddingX,
          paddingVertical: metrics.paddingY,
          fontSize: metrics.label,
          lineHeight: leadingOf(metrics.label, leading.l143),
        },
        focused ? styles.focused : null,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: FIELD_BOX.radius,
    borderWidth: FIELD_BOX.stroke,
    borderColor: theme[FIELD_BOX.colour],
    backgroundColor: 'transparent',
    color: theme[FIELD_BOX.ink],
    fontFamily: type.family.body.name,
    textAlignVertical: 'top',
  },
  focused: { borderWidth: FIELD_BOX.strokeFocused, borderColor: theme[FIELD_BOX.colourFocused] },
});

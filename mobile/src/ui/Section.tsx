import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SECTION, SECTION_FACE, SECTION_RULE, type SectionLevel } from '@reviewies/core/ui/section';
import { track, type } from '@reviewies/core/tokens';
import { space, theme, tracking } from './theme';

/**
 * The React Native renderer of `core/src/ui/section.ts`. The decisions are there.
 *
 * Nine styles in six files were this component, five properties at a time. Two of them —
 * the calendar's `sectionHeading` and its `dayHeading` — were byte-identical, which is
 * task #156 and the reason the table has two levels rather than one.
 *
 * `tracking()` rather than a stored point value, for derivability — not, as this comment
 * used to say, because a literal "holds still while the glyphs double at 200% Dynamic Type".
 * So does the computed one: it is a module-load constant. `theme.ts` has the measurement.
 */
export function Section({
  children,
  level = 'section',
}: {
  children: ReactNode;
  level?: SectionLevel;
}) {
  /*
   * `header`, always, and the component is why it is always. The web gets this free from
   * `<h2>`; React Native has no such thing, so before this it was a prop somebody had to
   * remember — one of the nine sites had it and eight did not, which means eight section
   * labels were announced as ordinary text by a screen reader.
   *
   * And the *level*, which the role does not carry. Without it react-native-web falls back
   * to `<h1>`, so every one of these was a top-level heading on the export: `/data` had six
   * `<h1>`s and no structure at all. The number comes from the table, so the two platforms
   * cannot disagree about how deep a section is.
   */
  const label = (
    <Text
      accessibilityRole="header"
      aria-level={SECTION[level].depth}
      style={level === 'group' ? styles.group : styles.section}
    >
      {children}
    </Text>
  );
  if (!SECTION[level].rule) return <View style={styles.blockSection}>{label}</View>;
  return (
    <View style={[styles.blockGroup, styles.ruled]}>
      {label}
      {/* The rule to the right edge — the dateline's half of the printed-matter argument. */}
      <View style={styles.rule} />
    </View>
  );
}

const styles = StyleSheet.create({
  blockSection: { marginBottom: SECTION.section.gapBelow },
  blockGroup: { marginBottom: SECTION.group.gapBelow },
  ruled: { flexDirection: 'row', alignItems: 'center', gap: space.s8 },
  section: {
    color: theme[SECTION.section.ink],
    fontSize: SECTION.section.size,
    fontFamily: type.family[SECTION_FACE].name,
    letterSpacing: tracking(SECTION.section.size, track.t83),
    textTransform: 'uppercase',
  },
  group: {
    color: theme[SECTION.group.ink],
    fontSize: SECTION.group.size,
    fontFamily: type.family[SECTION_FACE].name,
  },
  rule: { flex: 1, height: SECTION_RULE, backgroundColor: theme.strokeHairline },
});

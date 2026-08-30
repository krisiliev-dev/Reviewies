import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SECTION, SECTION_FACE, SECTION_RULE, type SectionLevel } from '@reviewies/core/ui/section';
import { type } from '@reviewies/core/tokens';
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
 * So does the computed one: it is a module-load constant.
 *
 * These two eyebrows are the sites where that actually costs something, and the cost is one
 * platform's. Android scales a stored `letterSpacing` with the glyphs; iOS does not, so the
 * eyebrows here tighten from 0.083em to 0.042 at 200%. Measured, argued and left alone in
 * `core/src/tokens.ts` under `track`, because the unconditional repair breaks Android.
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
  /*
   * Every channel from the table, including the two that used to be spelled here.
   *
   * `tracking(size, track.t83)` and `textTransform: 'uppercase'` were literals that
   * *happened* to equal `SECTION.section.track` and to agree with `SECTION.section.caps`.
   * The table stated both for both levels and nothing read either one — the only consumer
   * was the channel-counter in `section.test.ts`, which compares `caps` and `track` to each
   * other and so is satisfied by any two values that differ. Case and tracking are two of
   * the four channels that keep a dateline tellable from the section containing it, and
   * both were held by hand-copy at exactly the point where the component was supposed to
   * end hand-copy.
   *
   * `group` states them too, at their off values, rather than omitting them. Tracking
   * left off and tracking derived from `track.t0` render identically, and only the second
   * can be compared to `SECTION.group.track`; the same goes for `'none'` against no
   * `textTransform` at all. Absence is not a value the table can be held to.
   */
  section: {
    color: theme[SECTION.section.ink],
    fontSize: SECTION.section.size,
    fontFamily: type.family[SECTION_FACE].name,
    letterSpacing: tracking(SECTION.section.size, SECTION.section.track),
    textTransform: SECTION.section.caps ? 'uppercase' : 'none',
  },
  group: {
    color: theme[SECTION.group.ink],
    fontSize: SECTION.group.size,
    fontFamily: type.family[SECTION_FACE].name,
    letterSpacing: tracking(SECTION.group.size, SECTION.group.track),
    textTransform: SECTION.group.caps ? 'uppercase' : 'none',
  },
  rule: { flex: 1, height: SECTION_RULE, backgroundColor: theme.strokeHairline },
});

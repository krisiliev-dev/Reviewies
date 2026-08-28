/**
 * The label above a group of things, at two levels that have to be tellable apart.
 *
 * Fourteen sites on the web and nine on the phone write this by hand. On the web it is
 * `text-s12 font-title font-semibold tracking-t83 text-ink-secondary uppercase`, copied
 * verbatim into nine files; on the phone it is the same five properties in a StyleSheet,
 * copied into six. That is a component that already exists and has no name.
 *
 * ## Why it is two levels rather than one
 *
 * task #156 — the calendar's section heading and its day heading are byte-identical on the
 * phone. Not similar: the same five properties, in the same order, in the same file:
 *
 *     sectionHeading: { color: inkSecondary, s12, t83, title, uppercase }
 *     dayHeading:     { color: inkSecondary, s12, t83, title, uppercase }
 *
 * So `NEXT TWO MONTHS` and `TODAY` are the same size, weight, face, colour and tracking,
 * with `TODAY` nested inside what `NEXT TWO MONTHS` opens. A reader has no way to tell
 * which is the container. That happened because both were hand-copied from the same
 * string, and it is exactly what a component stops — not by being tidier, but because two
 * levels in one table have to be given different values on purpose.
 *
 * ## What separates them
 *
 * Three channels, not one, because a single-channel difference is the one that gets
 * flattened again by the next person tuning a value:
 *
 * | | `section` | `group` |
 * |---|---|---|
 * | case | uppercase | as written |
 * | tracking | `t83` | none |
 * | ink | secondary | full |
 * | rule | none | hairline, to the right edge |
 *
 * The rule is the direction's, not an invention. `docs/design/tokens.md` §4: *"The rule
 * running to the right edge — the part that actually does the printed-matter work — is
 * geometry, not type, and costs nothing."* It is the thing a dateline in printed matter
 * has always had, and it is what makes the nesting legible at a glance rather than by
 * comparing two greys.
 *
 * Same size on both, deliberately. A step down from `s12` does not exist any more, and a
 * step up would make the subordinate heading the louder one.
 */
import { border, space, text, track } from '../tokens.ts';

export type SectionLevel = 'section' | 'group';

export const SECTION = {
  /** The eyebrow. What all twenty-three existing sites are. */
  section: {
    size: text.s12,
    caps: true,
    track: track.t83,
    ink: 'inkSecondary',
    rule: false,
    gapBelow: space.s8,
    depth: 2,
  },
  /** A dateline inside a section: same size, three channels apart. */
  group: {
    size: text.s12,
    caps: false,
    track: track.t0,
    ink: 'ink',
    rule: true,
    gapBelow: space.s6,
    depth: 3,
  },
} as const satisfies Record<
  SectionLevel,
  {
    size: number;
    caps: boolean;
    track: number;
    ink: 'ink' | 'inkSecondary';
    rule: boolean;
    gapBelow: number;
    depth: HeadingDepth;
  }
>;

/**
 * How deep in the document a section sits, which is the property a screen reader
 * navigates by and the one this component did not own.
 *
 * Every other decision here had a single owner and this one had two wrong ones. The web
 * defaulted **both** levels to `h2`, so a dateline was a sibling of the section it sits
 * inside rather than a child of it. The phone was worse and quieter: it set
 * `accessibilityRole="header"` and nothing else, and react-native-web reads
 * `props.accessibilityLevel || props['aria-level']` and falls back to **`h1`** — so on
 * the phone's export every section label, every dateline and every screen title were all
 * `<h1>`. `/data` rendered six of them.
 *
 * Both platforms' source looked right, which is why no source-level guard had ever
 * objected: one says `h2`, the other says `header`, and only the rendered document shows
 * they are not the same claim. §6.87's rule — emitted is not rendered — reached by
 * opening the export and reading the outline.
 */
export type HeadingDepth = 1 | 2 | 3;

/** The face and weight are the same at both levels — the file is one file. */
export const SECTION_FACE = 'title';

/** The rule's thickness, when there is one. */
export const SECTION_RULE = border.hairline;

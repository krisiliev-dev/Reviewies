/**
 * One of several, decided once for both platforms.
 *
 * Five controls in this build are the same thing wearing different clothes: Stats' period
 * chips, the comment effort levels, Watching Mode's reaction density, WhereToWatch's
 * regions, and the calendar's notification options. Four of the five already take their
 * option data from `core` — this consumes it rather than adding a sixth copy.
 *
 * **They do not agree on what they are.** `calendar.tsx` is exemplary: `radiogroup`,
 * `radio`, `accessibilityState={{ checked, selected }}`, and a label that reads
 * "Premieres and finales — the moments worth knowing about". Watching Mode's density chips
 * are `accessibilityRole="button"` carrying `accessibilityState={{ selected }}` at
 * `minWidth: 26, minHeight: 24` — a radio wearing a button's role at *half* the target
 * size, on the flagship screen. Both were written by the same hand a fortnight apart.
 *
 * A button says "this does something". A radio says "this is one of several and it is the
 * one that is on", which is the entire content of the control. Only one of those is true
 * here, and it is the same one on all five screens.
 */
import { border, size, space, text } from '../tokens.ts';

export type ChoiceDensity = 'chips' | 'rows';

export interface ChoiceOption<T extends string | number> {
  key: T;
  label: string;
  /** The second line on a `rows` choice, and part of the announced name on both. */
  hint?: string;
}

/**
 * Selection is a rule and a step in the ink, never a fill and never a third mark.
 *
 * A filled chip on a ruled page is the last card left in the app — §6.90 spent 822 sites
 * turning fills into rules and this is the one control that would have quietly kept one.
 * Two channels rather than colour alone, which also means it survives being read by
 * somebody who cannot separate the two greys (§6.91's argument for the tab bar, one
 * control down).
 *
 * **A rule and an *ink* step, not a weight step**, which is what this said until §6.134.
 * The weight went in §6.113 for the reason `LABEL_FACE` gives: the phone cannot thicken a
 * named family, so a state carried by weight is a state the phone loses. The table below
 * has been an ink step ever since and the sentence above it had not caught up — §6.120's
 * shape, a comment describing a mechanism the code no longer has.
 *
 * ## And two channels means two, at both densities
 *
 * `rows` drew a third: an amber ✓ at the far end of the row, `aria-hidden` and decorative,
 * on both platforms. It was defensible one control at a time — the rule is a 2pt border at
 * the far left of a 390pt row — and it is exactly the drift this constant exists to stop:
 * a signal that appears at one density and not the other. §6.95's own finding was that
 * "the density chips and the calendar's options ended up disagreeing", and the tick was
 * the last way they still did. `dark-05-calendar.png` is what it looked like: the same
 * state announced at both ends of one row, seven hundred points apart.
 */
export const CHOSEN = {
  rule: border.tally,
  colour: 'workingMark',
  /** Unselected → selected. The label steps up as well as gaining the rule. */
  label: { off: 'inkSecondary', on: 'ink' },
} as const;

/**
 * The box, in absolute pixels, and never below the target floor.
 *
 * `minWidth: 26, minHeight: 24` is what the density chips are today: WCAG 2.5.8's 24pt
 * minimum, on a control the size of a fingernail, on the screen this product exists for.
 * 44 is the house standard and there is no reason for a chip to be the exception.
 */
export const CHOICE_SIZE = {
  chips: {
    minHeight: size.target, minWidth: size.target, paddingX: space.s12, gap: space.s8,
    label: text.s14, hint: text.s12,
  },
  rows: {
    minHeight: size.target, minWidth: 0, paddingX: space.s16, gap: space.s2,
    label: text.s14, hint: text.s12,
  },
} as const satisfies Record<
  ChoiceDensity,
  { minHeight: number; minWidth: number; paddingX: number; gap: number; label: number; hint: number }
>;

/**
 * What a screen reader is told, on both platforms.
 *
 * Taken from `calendar.tsx`, which had it right: the hint is part of the *name*, not a
 * second node to arrow past. A chip labelled "24" announces "24 — about six a minute"
 * rather than a bare number beside two other bare numbers.
 */
export function announce<T extends string | number>(option: ChoiceOption<T>): string {
  return option.hint ? `${option.label} — ${option.hint}` : option.label;
}

export interface ChoiceContract<T extends string | number> {
  /** The group's own name. Required: a radiogroup with no name is a list of unknowns. */
  name: string;
  options: readonly ChoiceOption<T>[];
  value: T;
  onChange(next: T): void;
  density?: ChoiceDensity;
  /**
   * One line that scrolls sideways, rather than as many rows as it takes.
   *
   * For a group whose length is the person's data rather than the product's. Stats offers
   * one chip per year with a watch in it, so somebody arriving from ten years of TV Time
   * meets thirteen chips in three rows — measured at 148px of control with the first
   * figure a third of the way down an 844px screen, and the ten year buttons carrying
   * exactly the weight of the three period ones.
   *
   * Measured against the alternatives rather than argued: wrapping in a second labelled
   * group came to 140px and pushed the figures *lower*; this comes to 88 and lifts them.
   * What it costs is that the earliest years start off-screen — checked, and focus scrolls
   * them into view, so a keyboard and a screen reader still reach all thirteen.
   *
   * Only for a group that is genuinely a list. A group of three fixed options that
   * scrolled would be hiding a choice for no reason.
   */
  scroll?: boolean;
}

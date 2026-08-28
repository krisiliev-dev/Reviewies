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
 * Selection is a rule and a weight, never a fill.
 *
 * A filled chip on a ruled page is the last card left in the app — §6.90 spent 822 sites
 * turning fills into rules and this is the one control that would have quietly kept one.
 * A rule plus a weight step is two channels rather than colour alone, which also means it
 * survives being read by somebody who cannot separate the two greys (§6.91's argument for
 * the tab bar, one control down).
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
}

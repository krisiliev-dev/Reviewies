/**
 * What a button is, decided once for both platforms.
 *
 * The build this replaces has **45 button styles** across 25 files — `cta`, `ctaQuiet`,
 * `primary`, `secondary`, `retry`, `retryQuiet`, `enable`, `allTime`, `small`, `link`,
 * `toggle`, `vote`, `add`, `restore`, `skip`, `done`, `mark`, `react`, `posterSave` — and
 * no two screens agree on what "secondary" means. They reduce to four tones and three
 * sizes, and nothing here is a class name or a StyleSheet: `app/src/ui/Button.tsx` and
 * `mobile/src/ui/Button.tsx` are two renderers of this one table.
 *
 * No imports beyond the tokens, deliberately. This is read by both apps and by the guard
 * that keeps them from drifting, and a contract that pulls in a renderer is one nothing
 * can check.
 */
import { border, color, radius, size, space, text } from '../tokens.ts';

export type ButtonTone = 'primary' | 'secondary' | 'quiet' | 'destructive';
export type ButtonSize = 'page' | 'row' | 'inline';

/**
 * The four tones, as roles rather than colours.
 *
 * `secondary` is the one that matters and the reason this exists. Discover shipped a grey
 * `Watchlist` button beside a filled `Track` button, and every design review independently
 * read the grey one as disabled — it was the single most-repeated observation across three
 * reviews. Outlined in a stroke that clears 3:1 reads as available. §6.90 made that change
 * across the app; this is where it stops being a migration and becomes a rule.
 *
 * `destructive` is never a fill, so red only ever means trouble and never competes with the
 * one thing on a screen worth pressing.
 */
export const TONE = {
  primary: {
    fill: 'actionFill',
    label: 'actionLabel',
    stroke: null,
    underline: false,
    /** Never a fade — see the note on `ButtonContract` below. */
    disabledFill: null,
    disabledStroke: 'strokeHairline',
    disabledLabel: 'inkTertiary',
  },
  secondary: {
    fill: null,
    label: 'ink',
    stroke: 'strokeSignal',
    underline: false,
    disabledFill: null,
    disabledStroke: 'strokeHairline',
    disabledLabel: 'inkTertiary',
  },
  quiet: {
    fill: null,
    label: 'inkSecondary',
    stroke: null,
    underline: true,
    disabledFill: null,
    disabledStroke: null,
    disabledLabel: 'inkTertiary',
  },
  destructive: {
    fill: null,
    label: 'trouble',
    stroke: 'trouble',
    underline: false,
    disabledFill: null,
    disabledStroke: 'strokeHairline',
    disabledLabel: 'inkTertiary',
  },
} as const satisfies Record<ButtonTone, ButtonShape>;

interface ButtonShape {
  fill: keyof typeof color.dark | null;
  label: keyof typeof color.dark;
  stroke: keyof typeof color.dark | null;
  underline: boolean;
  disabledFill: keyof typeof color.dark | null;
  disabledStroke: keyof typeof color.dark | null;
  disabledLabel: keyof typeof color.dark;
}

/**
 * The box, in absolute device-independent pixels. The *label* scales with the reader's
 * setting; the box does not, because 44 is a thumb and a thumb is not a font size.
 *
 * `phoneTextScaling.test.ts` exists because the web's floor was once written in rem and
 * doubled along with the text.
 */
/*
 * `label` is here because the phone did not have it. The web's three sizes carried three
 * text sizes — `text-base`, `text-sm`, `text-xs` — and the phone's renderer had a single
 * `fontSize: 15` for all three, so `size="inline"` printed at fifteen points there and at
 * twelve on the web. Found by looking at a screenshot: Up Next's two `under` controls came
 * out larger than the row's own meta line and louder than the title beside them.
 *
 * The numbers are Tailwind's, because the web's are and the point is that they agree; the
 * web still writes its class names out, for the reason `Button.tsx` gives, and
 * `button.test.ts` holds the two spellings to each other.
 */
/**
 * A button label is the title face, on both platforms, in every state.
 *
 * Not a weight. React Native ignores `fontWeight` once `fontFamily` is set, so a weight is
 * a file — and the only semibold in the bundle is Archivo Narrow, which is the title face.
 * The web was writing `font-medium` and thickening to `font-semibold` when selected; the
 * phone was writing 600 and thickening to 700. Neither number could survive the face, and
 * the selected state does not need them: it already carries a tally-width border in the
 * working colour and a step in ink. Three signals were four.
 */
export const LABEL_FACE = 'title';

export const SIZE = {
  page: { minHeight: 48, paddingX: space.s20, paddingY: space.s12, label: text.s16 },
  row: { minHeight: size.target, paddingX: space.s16, paddingY: space.s8, label: text.s14 },
  inline: { minHeight: size.target, paddingX: space.s8, paddingY: space.s4, label: text.s12 },
} as const satisfies Record<
  ButtonSize,
  { minHeight: number; paddingX: number; paddingY: number; label: number }
>;

/**
 * Press is a thickening and a ground step, applied instantly.
 *
 * Not an animation. §6.59's rule is that Reduce Motion substitutes rather than removes,
 * and the cleanest way to honour it is for the feedback never to have been motion: at 0ms
 * the app feels identical either way, and there is no `reduced ? … : …` for `motion.test.ts`
 * to find.
 */
export const PRESSED = { stroke: border.mark, fill: 'groundRaised' } as const;

/**
 * `busy` keeps the label and adds a rule under it.
 *
 * It never swaps the label for a spinner. `account.tsx` did exactly that and needed an
 * `accessibilityLabel` workaround written beside it explaining that "while busy the label
 * is a spinner, which has no text to read" — a workaround for a decision, rather than the
 * decision being wrong.
 */
export const BUSY = { underline: border.mark, colour: 'workingFill' } as const;


/** The shape both renderers take, minus the platform's own press/press-in plumbing. */
export interface ButtonContract {
  /** Printed. From `COPY` when the sentence exists on both platforms. */
  label: string;
  /**
   * What is announced. Required, and never defaulted to `label`.
   *
   * Every mis-named control this codebase has found — "Watchlist", "Follow", "Remove",
   * "Yes", "No", "React", "Talk", "−5s", "Close" — was one where the printed word and the
   * announced word had to differ and only one of them was written. Each was found by a
   * person reading. Requiring both moves that whole class to the compiler.
   */
  name: string;
  tone?: ButtonTone;
  size?: ButtonSize;
  /**
   * Drops the fill for the outline. It never fades.
   *
   * `appearance.test.ts` bans `disabled:opacity` on a filled action on the web and records
   * why: it "gave a maroon block with dark red lettering — it read as broken rather than
   * as waiting". The phone had eight of these and no guard. Dropping the fill and stepping
   * the label to the tertiary ink holds 4.87:1, which an opacity cannot promise. Both
   * renderers are held to it by `app/src/ui/button.test.ts`.
   */
  disabled?: boolean;
  busy?: boolean;
  selected?: boolean;
}

/**
 * On, when a button is a toggle — and it is the same "on" a `Choice` draws.
 *
 * `selected` was in this contract from the start and both renderers announced it —
 * `aria-pressed`, `accessibilityState.selected` — and neither *drew* it. A control whose
 * state is spoken and not shown is a control that looks identical held and unheld, which
 * is how Watching Mode's Hold button worked until sprint 15 came to migrate it.
 *
 * It reuses `CHOSEN` rather than inventing a second spelling. `choice.ts` argues the case
 * at length and the argument does not change for a toggle: selection is a rule and a
 * weight step, never a fill — two channels rather than colour alone, so it survives being
 * read by somebody who cannot separate the two greys, and it keeps the app's one filled
 * shape meaning "the thing on this screen worth pressing".
 *
 * Which is also why this is the sprint that could delete the accent fill from twenty-six
 * call sites: half of them were fills standing in for exactly this.
 */
export { CHOSEN as SELECTED } from './choice.ts';

/** Boxed tones are pills; `quiet` has no box, so this does not reach it. */
export const BOX_RADIUS = radius.pill;

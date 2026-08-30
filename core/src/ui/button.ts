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
 * Press is a thickening; the ground step is `PRESS` in `surface.ts`.
 *
 * Not an animation. §6.59's rule is that Reduce Motion substitutes rather than removes,
 * and the cleanest way to honour it is for the feedback never to have been motion: at 0ms
 * the app feels identical either way, and there is no `reduced ? … : …` for `motion.test.ts`
 * to find. §6.184 removed the last two transforms in the build for the same reason.
 *
 * ## The fill that used to be here, and which way a press goes
 *
 * This carried `fill: 'groundRaised'` until §6.184, while `surface.ts` carries
 * `PRESS = elevation.sunken`. Those are opposite directions: in the dark palette
 * `groundRaised` is `#1C191E` against a `#131114` base and `groundWell` is `#0C0B0D`, so one
 * says a pressed control comes **up** and the other says it goes **down**.
 *
 * Both were live. The web's button reads `active:bg-ground-well`, and the rule really is in
 * the built stylesheet — checked, because §6.180 found a class that was inert where it was
 * written. The phone's read this constant, and a held button measured `rgb(28, 25, 30)` in
 * the export, which is `groundRaised` exactly. **The same control moved in opposite
 * directions on the two platforms.** `button.test.ts` asserted both — the web against
 * `PRESS`, the table against `'groundRaised'` — so the one guard looking at it pinned the
 * disagreement rather than failing on it.
 *
 * `PRESS` wins, and not narrowly: eight pressable controls read it — `Button`, `Choice`,
 * `Row`, `Key` and `PadCell`, across both platforms — against the phone's `Button` alone.
 * It is also the only one of the two that is a metaphor for anything.
 *
 * The thickening stays here because it is a second channel rather than a second opinion, and
 * `field.ts` names it as the pair to a focus ring.
 */
export const PRESSED = { stroke: border.mark } as const;

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
  /**
   * A line budget for the label. Unset means unlimited, which is what a label wants.
   *
   * Pass `LABEL_LINES` where the label is somebody's own text rather than the app's — see
   * the note there for why this is asked for rather than assumed.
   *
   * One or two, and not `number`, because the web can only spell the budgets Tailwind has
   * generated: a class built from an arbitrary integer is a class that does not exist, and
   * a wider type here would turn that into a blank `className` at runtime instead of an
   * error at build time. `app/src/ui/clamp.ts` is the map, and it has these two.
   */
  lines?: 1 | 2;
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

/**
 * How many lines a label is allowed, when the label is not the app's own words.
 *
 * Every other label in the product is authored — `COPY.controls.track`, "Add", "Cancel" —
 * and short enough that the question never comes up. Two are somebody's own text: the list
 * picker's rows are `list.name`, which `Field`'s `maxLength` caps at a hundred and twenty
 * characters. That is the case this number is for.
 *
 * ## Why it is not the default
 *
 * `lines` is optional and unset means unlimited, which is deliberate and is the opposite of
 * what `ROW_LINES` does one component over. A row is a line in a list and a list that does
 * not align scans worse; a **button is a target**, and a target whose words are clipped at
 * 200% text is `phoneTextScaling.test.ts`'s subject and WCAG 1.4.4's. Clamping every label
 * would trade the defect below for a worse one, so the clamp is asked for at the one call
 * site that has unbounded text rather than imposed on the forty that do not.
 *
 * ## What it fixes
 *
 * Neither platform stated this, so the two renderers had drifted and neither was right.
 * The phone wrote nothing, so a long list name **wrapped** and the pill grew to fit it. The
 * web wrote `truncate` — on the `<button>`, which is `inline-flex`, and whose label is a
 * `<span>` flex item. Measured in Chromium rather than reasoned about: `truncate` there
 * renders **byte-identically** to `overflow:hidden; white-space:nowrap` with no
 * `text-overflow` at all, because a flex item is blockified and a flex container has no
 * inline content of its own for an ellipsis to trim. The span stayed 290pt wide inside a
 * 176pt button and the name was cut mid-word — `Films I keep meaning to finish one of t` —
 * with no ellipsis to say so. Moving the same class onto the span changes the pixels,
 * which is the proof that it does something there and did nothing where it was.
 *
 * So: the number here, `numberOfLines` on the phone, and the clamp on the **label element**
 * on the web. `button.test.ts` holds all three together.
 */
export const LABEL_LINES = 1;

/** Boxed tones are pills; `quiet` has no box, so this does not reach it. */
export const BOX_RADIUS = radius.pill;

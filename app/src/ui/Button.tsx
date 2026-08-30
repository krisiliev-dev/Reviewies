import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BUSY, boxed, type ButtonContract } from '@reviewies/core/ui/button';
import { CLAMP } from './clamp';

/**
 * The DOM renderer of `core/src/ui/button.ts`. The decisions are there; this is Tailwind.
 *
 * Class strings rather than inline styles, so `legible()` can read the computed colour off
 * a rendered element and `colourNames.test.ts` can read the name off the source. An inline
 * style would satisfy neither.
 */
interface Props extends ButtonContract {
  onPress?: () => void;
  /**
   * Submits the form it is inside. Web-only, because React Native has no forms.
   *
   * `components.md` already lists this kind of thing — focus versus press, `inert`,
   * `aria-checked` versus `accessibilityState` — as documented divergence rather than
   * shared code. A `type="button"` inside a `<form>` silently stops submitting it, which
   * is the sort of change a migration makes without anything noticing.
   */
  submit?: boolean;
  to?: string;
  className?: string;
  children?: ReactNode;
}

/** Written out rather than interpolated, because Tailwind's scanner reads source text. */
const TONE_CLASS = {
  primary: 'bg-action-fill text-action-label',
  secondary: 'border border-stroke-signal text-ink',
  quiet: 'text-ink-secondary underline underline-offset-4',
  destructive: 'border border-trouble text-trouble',
} as const;

/**
 * Where each tone goes while it is held, keyed by tone rather than written once for all four.
 *
 * `surface.ts`: a press steps the control's **own surface**. Three of these tones have no
 * fill, so their surface is the ground and they step it. `primary` is a plate, and a plate
 * stepping the ground under it repaints the box and leaves `text-action-label` in place —
 * near-black on `ground-well`, measured at 1.05:1 in the export. §6.185.
 *
 * Written out for the same reason `TONE_CLASS` is: Tailwind's scanner reads source text and
 * a class built from a constant never reaches it. `button.test.ts` derives both strings from
 * `PRESS` and `PRESS_FILL` and compares, since the compiler cannot.
 */
const PRESS_CLASS = {
  primary: 'active:bg-action-fill-pressed',
  secondary: 'active:bg-ground-well',
  quiet: 'active:bg-ground-well',
  destructive: 'active:bg-ground-well',
} as const;

/**
 * Disabled drops the fill for the outline and never fades.
 *
 * `appearance.test.ts` bans `disabled:opacity` on a filled action and says why: it gave a
 * maroon block with dark red lettering, which reads as broken rather than as waiting. The
 * tertiary ink holds 4.87:1; an opacity holds nothing in particular.
 */
const DISABLED_CLASS = 'border border-stroke-hairline bg-transparent text-ink-tertiary';

/**
 * `SELECTED.rule` in `border-tally`, `SELECTED.colour` in `working-mark`, and the ink step.
 *
 * The weight that used to be here is gone, and `LABEL_FACE` in the core says why: the phone
 * cannot thicken a named family, so a state carried by weight is a state the phone loses.
 * Three signals remain, which is two more than the state needs.
 */
const SELECTED_CLASS = 'border-tally border-working-mark text-ink';

/*
 * The label sizes are `SIZE[size].label` in the core — 16, 14, 12, which are three steps of
 * the scale — and they are spelled out here because Tailwind v4 reads source text and
 * cannot be handed a number. `type.test.ts` holds the two together.
 */
/*
 * The vertical padding is `py-s12`/`py-s8`/`py-s4` rather than Tailwind's own `py-3`/`py-2`/
 * `py-1`, and it is the same correction the floors above got.
 *
 * Tailwind's numeric steps are `rem`: `--spacing` is `0.25rem`, so `py-3` compiles to
 * `calc(var(--spacing) * 3)` and is 12 at the default text size and 24 at 200%. The core's
 * header says the opposite in as many words — *"The box, in absolute device-independent
 * pixels. The label scales with the reader's setting; the box does not"* — and the phone,
 * which reads `SIZE[size].paddingY` straight, has always been absolute. So the two renderers
 * disagreed about the box at every text size but the default, in both axes, and the clause
 * that caught it for `min-h` did not look at the padding. `--spacing-s12` and its neighbours
 * are plain pixels.
 */
const SIZE_CLASS = {
  page: 'min-h-s48 py-s12 text-s16',
  row: 'min-h-target py-s8 text-s14',
  inline: 'min-h-target py-s4 text-s12',
} as const;

/**
 * The horizontal padding, on its own, because a boxless tone gets none of it.
 *
 * It cannot stay in `SIZE_CLASS` with a `px-0` appended after it for `quiet`. Tailwind emits
 * by its own order rather than by the order of a class string, so `px-2 px-0` on one element
 * draws at whichever it emitted last — the trap `button.test.ts` already names over
 * `min-h-target min-h-11` and over `size-5` behind `h-[1em]`. A conditional that appends
 * would look exactly like the fix and do nothing.
 *
 * `MIN_WIDTH` in the core is what a boxless tone takes instead, and it says why.
 */
const PAD_X = { page: 'px-s20', row: 'px-s16', inline: 'px-s8' } as const;

export function Button({
  label,
  name,
  tone = 'secondary',
  size = 'row',
  disabled,
  busy,
  selected,
  onPress,
  submit,
  to,
  lines,
  className = '',
  children,
}: Props) {
  const box = boxed(tone);
  // On is drawn, not only announced. `aria-pressed` was here from the start and nothing
  // ever painted it, so a toggle looked identical held and unheld. The spelling is
  // `Choice`'s — `SELECTED` is its `CHOSEN` — because a rule and a weight step is how this
  // app says "this one is on", and saying it twice two ways is how the density chips and
  // the calendar's options ended up disagreeing (§6.95).
  //
  // Written out rather than interpolated from the table, for the reason at the top of this
  // file: Tailwind's scanner reads source text — so `SELECTED` is not imported here, and
  // `button.test.ts` holds the written form and the table to each other instead.
  //
  // Boxed tones only. `quiet` has no box, so it has no box's rule to thicken; nothing asks
  // for a quiet toggle today and writing the branch anyway would be a branch nothing runs.
  const on = selected && !disabled && box;
  const classes = [
    // `font-title` is `LABEL_FACE` in the core, spelled out because Tailwind reads source
    // text. It carries the weight now — Archivo Narrow SemiBold is one file, not a slider.
    //
    // The centring is not here. It belongs to the boxed branch below: a boxless tone is
    // `MIN_WIDTH` wide with no padding, so centring 19pt of ink in a 44pt box would put the
    // words back 12pt in — the indent again, bought a second way.
    'inline-flex items-center gap-2 text-center font-title',
    // A box, its inset, and its centre are one decision; `MIN_WIDTH` in the core is what a
    // tone with no box takes instead of the inset, and the note there measures why.
    box ? `rounded-pill justify-center ${PAD_X[size]}` : 'min-w-target',
    SIZE_CLASS[size],
    disabled ? DISABLED_CLASS : TONE_CLASS[tone],
    on ? SELECTED_CLASS : '',
    // Press is a thickening and a step down, at 0ms. Never a transition, so the app is
    // identical with motion reduced and `motion.test.ts` has no ternary to find.
    disabled ? '' : `active:border-2 ${PRESS_CLASS[tone]}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  /*
   * The clamp goes on the label, never on the box.
   *
   * `AddToList` wrote `className="w-full truncate"` on the button itself and it did nothing
   * — measured, not assumed: on an `inline-flex` container `truncate` renders identically
   * to `overflow:hidden; white-space:nowrap` with no `text-overflow`, because the label is
   * a blockified flex item and the container has no inline content of its own to trim. The
   * name was cut mid-word with no ellipsis. On the span the same class changes the pixels.
   * `LABEL_LINES` in the core carries the argument; this is the one line that acts on it.
   */
  const clamp = lines ? CLAMP[lines] : '';

  const inside = (
    <>
      <span className={clamp}>{label}</span>
      {children}
      {/* Busy keeps the label and rules under it. It never becomes a spinner: a spinner
          has no text to read, which `account.tsx` worked around rather than avoided. */}
      {busy ? (
        <span
          aria-hidden="true"
          className="ml-2 w-s16 self-end border-t-mark border-working-mark"
          style={{ height: BUSY.underline }}
        />
      ) : null}
    </>
  );

  if (to && !disabled) {
    return (
      <Link to={to} aria-label={name} className={classes}>
        {inside}
      </Link>
    );
  }
  return (
    <button
      type={submit ? 'submit' : 'button'}
      onClick={onPress}
      aria-label={name}
      aria-busy={busy || undefined}
      aria-pressed={selected}
      disabled={disabled}
      className={classes}
    >
      {inside}
    </button>
  );
}


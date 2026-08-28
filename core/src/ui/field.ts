/**
 * A place to type, decided once for both platforms.
 *
 * Eleven inputs on the web wearing **eight** different treatments and twelve on the phone
 * wearing five, and the disagreements are not subtle:
 *
 * | | web | phone |
 * |---|---|---|
 * | ground | `raised` ×5, `well` ×1, none-with-a-border ×4 | `raised` ×7, `well` ×5 |
 * | padding | `px-3 py-1.5`, `px-3 py-2`, `px-3 py-3`, `px-4 py-3` | 12/12, 12/16, 16/12, 16/16 |
 * | size | `s14` ×5, `s16` ×2, inherited ×4 | `s14` ×9, `s16` ×3 |
 *
 * ## The one that matters
 *
 * **Every web input carries `outline-none`** — seventeen across the app — and nothing puts a
 * ring back at any of them. `index.css` draws a careful two-ring `:focus-visible` for exactly
 * this, with the inner ring in the ground because a near-white ring around a near-white fill
 * is 1.00:1; the inputs switch it off. A keyboard user tabbing through search, sign-in, list
 * names or a comment box has nothing showing where they are.
 *
 * That is not a thing to sweep — it is a thing to make impossible, which is what a component
 * is for. `Field` never writes `outline-none`, and `field.test.ts` fails on the next one.
 *
 * ## A field is a ruled box, not a filled one
 *
 * `docs/design/direction.md`'s refusal, and §6.90 spent 822 sites on it: fills become rules.
 * The direction lists the search field's border among the strokes that *mean* something, so
 * it is `stroke.signal` — the tertiary ink at 4.87:1 — rather than `stroke.hairline` at 1.42,
 * which WCAG 1.4.11 does not consider to exist. Two grounds and a border was three answers to
 * a question with one.
 */
import { border, radius, size, space, text } from '../tokens.ts';

export type FieldSize = 'page' | 'row';

/**
 * Two densities, the same split `Button` has and for the same reason: a screen's own input
 * against one sitting inside a row. The four paddings and three sizes in the census were not
 * two densities badly spelled — they were nobody choosing.
 */
export const FIELD_SIZE = {
  page: { minHeight: size.target, paddingX: space.s16, paddingY: space.s12, label: text.s16 },
  row: { minHeight: size.target, paddingX: space.s12, paddingY: space.s8, label: text.s14 },
} as const satisfies Record<
  FieldSize,
  { minHeight: number; paddingX: number; paddingY: number; label: number }
>;

/** The box. One ground — none — and one stroke, which is the one that means something. */
export const FIELD_BOX = {
  radius: radius.none,
  stroke: border.hairline,
  /** On focus, and it thickens rather than changing hue: the pair to `PRESSED` on a button. */
  strokeFocused: border.mark,
  colour: 'strokeSignal',
  colourFocused: 'focusRing',
  ink: 'ink',
  placeholder: 'inkSecondary',
} as const;

/** A multi-line field starts at four lines and grows. The comment box was 80pt by hand. */
export const FIELD_LINES = 4;

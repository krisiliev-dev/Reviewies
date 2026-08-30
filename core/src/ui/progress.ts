/**
 * How much of something is done, drawn as a bar.
 *
 * Three sites — the Stats tally bars on both platforms and the remote's playback position —
 * each with its own height, radius and colour, and one of them is a live contrast failure.
 *
 * ## Amber has one job, and a bar is not it
 *
 * `docs/design/tokens.md` §3, measured: **`working.fill` on paper is 1.77:1.** It fails 3:1
 * as a non-text UI component, not merely as text. The rule the document draws is precise and
 * this is the component that has to keep it:
 *
 * > in light, `working.fill` is only ever a filled area with dark ink on it — never a stroke,
 * > never a tick, never a progress fill, never a word.
 *
 * A progress bar is a filled area with **nothing on it**. The ink is what makes the cross-off
 * ring legible at 9.34:1; a bar has no ink, so it is a *mark* and takes `working.mark` —
 * `#8A5A08` in light, 5.22:1 on the page. In dark both resolve to the same amber, which is
 * exactly why nobody noticed: the failure only exists under `data-theme="light"`, which no
 * screenshot in `design/screens` is taken in.
 *
 * The phone is unaffected today for a reason worth writing down rather than relying on:
 * `mobile/src/ui/theme.ts` is `color.dark` and nothing switches it. The day the phone gains a
 * light mode, every one of its thirteen amber spinners inherits this problem — so the rule
 * lives in the table rather than in the web's stylesheet.
 *
 * ## The track is a colour, and it had been drawn as an outline
 *
 * Both renderers drew the track as a **1pt border** — `border border-stroke-hairline` on the
 * web, `borderWidth: border.hairline` on the phone — while this file states a height and a
 * colour and says nothing about a stroke. Preflight sets `box-sizing: border-box` and Yoga is
 * border-box with no way to ask for anything else, so the fill's `h-full` / `height: '100%'`
 * resolved against the track's *content* box: the stated height, less two hairlines.
 *
 * Measured rather than reasoned about, on both platforms, with the instrument in
 * `design/measure.mjs`'s spirit — the fill's `getBoundingClientRect().height` inside the
 * track that carries the accessible name:
 *
 * - the web on `/stats`, three tally bars at 100%, 34% and 9%: track 6.0pt outer, borders
 *   1px top and bottom, **fill 4.0pt**. `bar` is 6 because §6.90 wanted a shape you can
 *   compare down a column; it was drawing four.
 * - the phone's export on `/remote` mid-scan: track 2.0pt, the same two hairlines, **fill
 *   0.0pt** — and 33.8pt *wide*, so the one thing on screen that says a scan is getting
 *   somewhere was a static hairline at every percentage. `rule` has exactly one call site,
 *   `mobile/src/devices/RemotePanel.tsx`, and it had never drawn a pixel of progress.
 *
 * The other answer was to add the border back into the numbers — `rule` at 4pt to draw 2.
 * That is the defect, not the repair: `PROGRESS_SIZE` would state one number while the box
 * on screen was another, which is the whole class of thing the last five sprints have been
 * about. So the table keeps its heights and the renderers stop insetting them. The track's
 * colour was never a stroke in the first place — this file has only ever said `strokeHairline`,
 * and `stroke` there names the *token family*, not a drawing instruction. It is now the
 * ground the fill sits on, which is also what makes a partly-filled bar legible: the unfilled
 * part is a colour rather than an outline around a gap. `app/src/ui/progress.test.ts` holds
 * both renderers to it — the fill fills the track, the track insets nothing, and the height
 * the web's class asks for is the height this table states.
 */
import { radius, space } from '../tokens.ts';

export type ProgressSize = 'bar' | 'rule';

/**
 * Two heights, both on the space scale. `bar` is the Stats tally — a shape you compare down a
 * column, so it needs enough body to be comparable. `rule` is the remote's playback position,
 * which sits under a title and is a position rather than a quantity.
 *
 * The remote's was 3pt, which is `border.tally` and not a spacing step. A bar is a *fill*
 * rather than a stroke, so it belongs on the space scale — §6.90's note that "a stroke scale
 * that quietly contains fills is a scale that will grow a 96 next", in the other direction.
 */
export const PROGRESS_SIZE = {
  bar: { height: space.s6, radius: radius.pill },
  rule: { height: space.s2, radius: radius.none },
} as const satisfies Record<ProgressSize, { height: number; radius: number }>;

/**
 * The filled part is a **mark**, and the track is the hairline *colour*.
 *
 * Not `working.fill`. See above — this is the whole point of the component.
 *
 * Both are grounds: the fill is painted over the track, and neither is a stroke. Drawing
 * the track as one is what left `rule` with a fill nothing tall, also above.
 */
export const PROGRESS_COLOUR = { done: 'workingMark', track: 'strokeHairline' } as const;

/**
 * A small-but-nonzero bar still reads as "started", not as "empty".
 *
 * The floor applies *above* zero only. The first version clamped everything, so a bar
 * measuring nothing drew 4% — and "barely any" and "none" are different facts, which is the
 * distinction §6.104 spent a sprint on one layer up.
 */
export const PROGRESS_FLOOR = 4;

/** `value` and `max` in, a percentage out, clamped so a bad ratio cannot draw off the end. */
export function progressPercent(value: number, max: number): number {
  if (!(max > 0) || value <= 0) return 0;
  return Math.min(100, Math.max(PROGRESS_FLOOR, (value / max) * 100));
}

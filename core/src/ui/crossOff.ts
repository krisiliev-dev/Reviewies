/**
 * The signature move: an open ring you fill.
 *
 * This is the most-repeated action in the product — the whole reason somebody opens it on
 * a weeknight — and it was three different controls. Up Next had a `watched` pill with an
 * undo banner two hundred points away; the title page had a `mark` pill with
 * `accessibilityState={{ checked }}` on `accessibilityRole="button"`; the web had its own
 * pair, announcing `aria-pressed`. §6.95 was about exactly that confusion one control
 * down, on the density chips.
 *
 * **It is a checkbox.** An open circle you fill is the thing `aria-checked` was invented
 * for. `checked` on a button announces a state through a role that has no way to carry it,
 * and `aria-pressed` says "a toggle button" rather than "a thing that is or is not done".
 *
 * **There is no loading state, deliberately.** `markWatched` writes to SQLite and the
 * change listener re-runs the query; `index.tsx` says it in a comment already —
 * "optimistic by construction; nothing waits on a network round-trip". A spinner here
 * would claim the app is asking somebody's permission, which is the opposite of what
 * local-first means. Nobody should add one.
 *
 * **Undo belongs beside the ring.** `unwatchLatest` existed and was surfaced as a banner
 * on Up Next roughly two hundred points from the tap that caused it, and on the title page
 * not at all. Six seconds within reach of the thumb that made the mark is the fix.
 *
 * *Beside*, not *instead of*, which is where the first version of this went wrong: taking
 * the ring's own slot hides the filled ring somebody just earned, and on the web unmounting
 * the button that was just activated drops focus to the body — a keyboard user returned to
 * the top of the page as a reward for marking an episode.
 */
import { border, linger, size } from '../tokens.ts';

/**
 * The ring, at the house target. Not a pill with a word in it.
 *
 * 44 is the whole control: a circle the width of a thumb, at the row's trailing edge,
 * in the same place on every row of every list. `border.icon` is the drawn stroke weight
 * §6.85 chose over the direction's 1.75 because 1.75 lands on 3.5px at 2× and is fuzzy on
 * exactly the glyphs it is meant to sharpen.
 */
export const RING = {
  size: size.target,
  stroke: border.icon,
  /** The mark, once it is made. */
  fill: 'workingFill',
  tick: 'workingOnFill',
  /** Unaired. A ring in the hairline reads as "not yet", where a fade reads as broken. */
  unavailable: 'strokeHairline',
} as const;

/**
 * What the row does when it is struck through, and the three channels that say so.
 *
 * The stroke is never the only signal. §6.85's rule for the pen — "the ring's filled/tick
 * state and the ink step from `ink` to `ink.secondary` carry it independently" — matters
 * because a line through text is invisible to a screen reader and hard to see at a glance
 * on a moving bus.
 */
export const STRUCK = {
  pen: 'markCrossOff',
  text: { off: 'ink', on: 'inkSecondary' },
} as const;

/*
 * `draw: duration.crossOff` was here, and is not, because neither renderer draws the
 * stroke — both set the line and the ink step at once. A duration nothing reads is a
 * number that looks decided and is not, which is the shape this codebase keeps finding in
 * its own tables. `duration.crossOff` (220ms, and 0 under `reduced`) is still in
 * `tokens.ts` for whichever renderer grows a stroke that travels; it comes back here when
 * something asks for it.
 */

/**
 * Six seconds, from the table rather than typed here.
 *
 * `linger.undo` is the same number the Up Next banner uses, which is the point: the window
 * does not change because the control moved.
 */
export const UNDO_MS = linger.undo;

export interface CrossOffContract {
  watched: boolean;
  /** Unaired. Not the same as "busy", which this control does not have. */
  disabled?: boolean;
  /**
   * Required, and it changes with the state: "Mark Andor S02E07 watched" becomes
   * "Unmark …". A checkbox whose name does not say what pressing it does leaves the
   * reader to infer it from `checked`, which is a different sentence in every language.
   */
  name: string;
  onChange(next: boolean): void;
  /** Omit and the slot stays empty — the window is a feature of the screen, not the ring. */
  onUndo?: () => void;
  /** The name of the second control, when there is one. */
  undoName?: string;
}

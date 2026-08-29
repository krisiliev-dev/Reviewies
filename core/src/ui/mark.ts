/**
 * The small marks a control draws, as paths, for both platforms.
 *
 * `tabIcon.ts` did this for the tab bar and `star.ts` for the rating. §6.143's sweep found
 * the rest, and they are worse than the tab bar was, because in every case **the two
 * platforms had reached different answers independently**:
 *
 * | control | web | phone |
 * | --- | --- | --- |
 * | the remote drawer's handle | `⇤` — an arrow | `⌇` — a drag grip |
 * | a list, collapsed | `▾` (down) | `›` (**right**) |
 * | a list, expanded | `▴` (up) | `⌄` (down) |
 * | a cross-off's tick | `✓` | `✓` |
 *
 * The drawer is the clearest: an arrow is a *direction* and a wavy line is *drag me*, and
 * the drawer opens on a tap. One of those two marks is describing a gesture the control
 * does not have.
 *
 * The lists are the subtler one. Both platforms use a pair, and the pairs run **opposite
 * ways**: the web's collapsed chevron points down and its expanded one points up; the
 * phone's collapsed points right and its expanded points down. Neither is wrong on its own
 * — pointing at what will happen and pointing at what is open are both conventions — but
 * they are not the same product.
 *
 * ## One chevron, and a rotation
 *
 * So there is one chevron here, drawn pointing **right**, and a direction is a rotation of
 * it. That is the decision rather than a convenience: a build with four chevron glyphs has
 * four things to keep in step and a build with one path has none, and it is what let the
 * drawer's handle and a list's disclosure stop being separate questions.
 *
 * The convention this settles on is **the web's**: collapsed points at what is below,
 * expanded points back at what you came from. It reads as a hinge rather than as a
 * signpost, which suits a row that opens in place.
 */

/** The square every path below is drawn inside. */
export const MARK_BOX = 24;

/** A chevron, pointing right. Every other direction is this, rotated. */
export const CHEVRON_PATH = 'M9 5l7 7-7 7';

/** A tick, for a cross-off's ring. */
export const TICK_PATH = 'M5 12.5l5 5 9-11';

/**
 * Degrees to rotate `CHEVRON_PATH` so it points where you mean.
 *
 * Named rather than numbered at the call site, because "the chevron, rotated 270°" is a
 * drawing instruction and "the chevron, pointing up" is what the screen is trying to say.
 */
export const CHEVRON_TURN = { right: 0, down: 90, left: 180, up: 270 } as const;

export type ChevronDirection = keyof typeof CHEVRON_TURN;

/**
 * Which way a disclosure chevron points, given whether the thing is open.
 *
 * One function so the two platforms cannot pick opposite conventions again, which is
 * exactly what they had done: the web ran down/up and the phone ran right/down.
 */
export const disclosure = (open: boolean): ChevronDirection => (open ? 'up' : 'down');

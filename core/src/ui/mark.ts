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
import { border, text } from '../tokens.ts';

/** The square every path below is drawn inside. */
export const MARK_BOX = 24;

/**
 * How big a chevron in a row is drawn.
 *
 * §6.184. `text.s16` rather than a bare 16, because the size *is* the row's text size. The web
 * draws the mark `1em` square inside a `text-s16` box, so on that platform it already takes
 * the size of the words beside it and no number was ever written. React Native has neither
 * `em` nor an inherited font on an `Svg`, so the phone has to be told — and a number the
 * phone is told by hand is a number that drifts. `mobile/app/lists.tsx` was drawing its
 * disclosure chevron at **20** against the web's 16 while the other three pairs — season,
 * calendar, more — all agreed at 16. Three-quarters agreement with no argument anywhere is
 * what a slip looks like from the outside.
 *
 * `TAB_ICON_SIZE` argues the opposite way for the tab bar, and both are right. A tab icon is
 * not beside text: the label sits under it and five of them cross a phone, so it is pinned
 * at 22 and stays out of the label's room. A row's chevron is on the line it belongs to, so
 * it takes that line's size, and if the type scale moves both platforms move with it.
 *
 * The one chevron this does not cover is the remote drawer's handle, which is not in a row —
 * it is a tap target of its own, drawn at `text-s20`, and the phone has no counterpart. A
 * number only one platform writes is a number nothing can disagree with. The day the phone
 * grows a handle, it belongs here.
 */
export const CHEVRON_SIZE = text.s16;

/**
 * The weight every mark here is stroked at — one weight, not one per mark per platform.
 *
 * §6.184. `border.mark` is the token named for exactly this, and the chevron was already on it by
 * coincidence: both renderers typed a bare `2`. The tick typed **2.5**, once per platform
 * and stated nowhere — grep either tree and that value appears at those two lines and
 * nowhere else. `tokens.ts` builds its scales by killing the members that carry no
 * distinction (13 and 15, one point either side of 14, went for this reason), and 2.5 sits
 * between `mark` and `tally` carrying none that anybody wrote down.
 *
 * It was not buying the difference it looks like it was buying, either. Both marks are drawn
 * in the same `MARK_BOX` and the tick is *rendered* larger than the chevron — 20 against 16
 * in `CrossOff` — so at one weight the tick already lands heavier on the glass: 2/24 x 20 =
 * 1.67px against 2/24 x 16 = 1.33px. The extra half point was a second helping of a
 * difference the sizes had already made. Folding it onto the scale takes 0.4px off the
 * tick's stroke and puts the last unowned number in this file on a token.
 */
export const MARK_STROKE = border.mark;

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

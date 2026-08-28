import { color } from '@reviewies/core/tokens';

/**
 * The palette the phone draws from, which is the dark half of the token table.
 *
 * This used to be seven hand-written hexes with a comment saying they were "carried over
 * from the web app so the two do not drift apart" — while six of the seven had drifted.
 * §6.86 made the web generate its stylesheet from `core/src/tokens.ts`; §6.90 does the
 * same thing for the phone, in the only form React Native accepts: one flat object of
 * resolved values, because RN has no custom properties and no cascade.
 *
 * `color.dark` and not a theme choice. The app is dark by decision — the premise of
 * Watching Mode is a dark room with the television on — and §6.87 removed the
 * `prefers-color-scheme` block that had briefly made that a preference. The light table
 * exists, is measured, and is consumed by nothing.
 *
 * The rename was not mechanical, and one pair is worth stating because it inverts:
 * legacy `theme.ink` was the *page background* and legacy `theme.text` was the writing on
 * it. In the token table `ink` is the writing. Every call site was rewritten in a single
 * pass for that reason — a sequential find-and-replace would have turned every page
 * background into near-white and every word into near-black.
 */
export const theme = color.dark;


/**
 * The token layer, re-exported so a screen can reach it without a second import path.
 *
 * The four legacy radii were here too and are gone: §6.89 migrated all 99 of their sites
 * to `radius.none|plate|pill` in the same commit as the guard, so the export had nothing
 * left reading it. That is what "a bridge with a visible end" looked like when the end
 * arrived — the names were deleted rather than deprecated, because a legacy export that
 * survives its last call site is the next thing somebody reaches for by habit.
 *
 * The seven colours went the same way in §6.90, and `palette.test.ts` — whose own header
 * said "this whole file goes when the last of them does" — went with them. `theme` above
 * is now the token table itself rather than a copy of anything.
 */
export {
  color,
  radius,
  label,
  space,
  size,
  ratio,
  track,
  leading,
  border,
  elevation,
  duration,
  reduced,
  stagger,
  reducedStagger,
  linger,
  easing,
  z,
} from '@reviewies/core/tokens';

/**
 * The minimum a control can be and still be a target.
 *
 * WCAG 2.5.8 asks for 24x24 CSS pixels. Several controls here are a line of text and
 * nothing else — "Caught up further?", "Remove", "Use a different poster" — and came out
 * fourteen to seventeen pixels tall. `hitSlop` was doing the work, which is real on a
 * device and invisible to layout: two hitSlop targets next to each other overlap, and
 * nothing can measure them. This gives them the height for real, and keeps the hitSlop
 * on top of it.
 */
export const tap = { minHeight: 24, justifyContent: 'center' } as const;

/**
 * Tracking, in points, from tracking in em.
 *
 * The one RN-specific derivation the token layer cannot do for itself. `letterSpacing` on
 * React Native is points, so a stored `1` holds still while the glyphs double at 200%
 * Dynamic Type and the tracked caps close into a block; stored in em and multiplied here,
 * it grows with them. CSS takes em directly, so the web never calls this.
 *
 * Always `tracking(text.sNN, track.tNN)` at the site, never a number: the pair is what
 * makes it derivable, and a lone product is a literal again.
 */
export function tracking(size: number, em: number): number {
  return size * em;
}

/**
 * Line height, in points, from a ratio.
 *
 * The pair to `tracking()`, for the same reason: React Native's `lineHeight` is points, so a
 * stored 20 holds while the glyphs double at 200% Dynamic Type and the lines run into each
 * other. Rounded, because a fractional line height on a device is a fractional baseline.
 *
 * Always `leadingOf(text.sNN, leading.lNNN)` at the site — the pair is what makes it
 * derivable, and a lone product is a literal again.
 */
export function leadingOf(size: number, ratio: number): number {
  return Math.round(size * ratio);
}

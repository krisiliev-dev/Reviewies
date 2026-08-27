/**
 * The palette, carried over from the web app so the two do not drift apart.
 *
 * Dark by default and not as a preference: this app gets used in a dark room with the
 * television on, which is the whole premise of Watching Mode.
 *
 * They had drifted anyway — six of the seven differed by a shade or two, and the
 * phone's muted grey came out a full contrast step behind the web's. These are now the
 * web's values exactly, and app/src/ui/palette.test.ts fails if they part again or if
 * any pair of them drops below WCAG AA.
 */
export const theme = {
  ink: '#0b0b0f',
  surface: '#15151d',
  surface2: '#1f1f2b',
  edge: '#2b2b3a',
  text: '#f2f2f7',
  muted: '#9a9ab0',
  accent: '#ff5c7a',
} as const;


/**
 * The token layer, re-exported so a screen can reach it without a second import path.
 *
 * The four legacy radii were here too and are gone: §6.89 migrated all 99 of their sites
 * to `radius.none|plate|pill` in the same commit as the guard, so the export had nothing
 * left reading it. That is what "a bridge with a visible end" looked like when the end
 * arrived — the names were deleted rather than deprecated, because a legacy export that
 * survives its last call site is the next thing somebody reaches for by habit.
 *
 * The seven colours above are the OLD system and are still what most of this app is
 * drawn from; they go with the colour migration. New work reads `tokens`, and
 * `palette.test.ts` holds the seven to their measured ratios until then.
 */
export {
  color,
  radius,
  label,
  space,
  size,
  ratio,
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

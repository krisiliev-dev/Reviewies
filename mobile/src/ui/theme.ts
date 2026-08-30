import { color, size } from '@reviewies/core/tokens';

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
 * nothing else — "Catch up", "Remove", "Use a different poster" — and came out
 * fourteen to seventeen pixels tall. `hitSlop` was doing the work, which is real on a
 * device and invisible to layout: two hitSlop targets next to each other overlap, and
 * nothing can measure them. This gives them the height for real, and keeps the hitSlop
 * on top of it.
 */
export const tap = { minHeight: size.tap, justifyContent: 'center' } as const;

/**
 * How far past its edge a `tap` affordance can still be pressed, in points.
 *
 * The paragraph above says the slop sits on top of the height and stops there — it never
 * said **how much**, so nineteen call sites each carried a bare number and agreed by
 * accident. §6.180 counted them: eighteen `hitSlop={8}` and one `hitSlop={12}`, and
 * nothing in the repository could tell whether the odd one out was a decision or a slip.
 *
 * It is a decision, and this is where it gets written down. `dark` is Watching Mode's
 * *Leave* control: pressed mid-episode, in a dark room, by somebody who is not looking at
 * the screen. Everything else is `inline`.
 *
 * ## Why there is no web half of this
 *
 * `hitSlop` is a React Native mechanism with no CSS equivalent, and the web does not need
 * one: its inline affordances carry `min-h-11` in the class, so the reach *is* the box and
 * layout can see it. On a device the slop is real and invisible — two slopped targets side
 * by side overlap and nothing can measure the result — which is the argument the paragraph
 * above makes for giving them the height for real first. This number is what sits on top.
 *
 * `react-native-web`'s `Pressable` ignores `hitSlop` entirely (its `Touchable` reads it,
 * and nothing here uses `Touchable`), so the export the smoke suite measures sees the
 * unslopped 24 — which is the number that has to clear WCAG 2.5.8, and does.
 */
export const REACH = { inline: 8, dark: 12 } as const;

/**
 * Tracking, in points, from tracking in em.
 *
 * The one RN-specific derivation the token layer cannot do for itself. `letterSpacing` on
 * React Native is points, and the sentence that used to be here said storing em and
 * multiplying at the call site makes the tracking "grow with them" at 200% Dynamic Type. It
 * does not, for the reason set out under `leadingOf` below: `tracking(text.s12, track.t83)`
 * is the constant 0.996, fixed at module load, and a point value does not answer `fontScale`.
 *
 * What it buys is derivability — one em figure in the token layer rather than a point value
 * per size — and the paragraph below says so correctly. CSS takes em directly, so the web
 * never calls this and the web's tracking really does scale.
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
 * The pair to `tracking()` — and the reason given here was **wrong**, measured in the export
 * at 200%: a tab label's glyphs go from 12 to 24 and its line box stays at 17, which is
 * `leadingOf(text.s12, leading.l143)`. That is the collision the sentence claimed this
 * function avoids.
 *
 * Both arguments are token constants and the call sits inside a `StyleSheet.create` object
 * literal, so it is evaluated once at module load: `leadingOf(14, 1.43)` **is** the stored 20
 * it was offered as the alternative to, byte for byte at runtime. React Native's `lineHeight`
 * is a fixed point value and does not answer `fontScale` however it was computed.
 *
 * What it does buy is the paragraph below, which was right all along: derivability. Change
 * `text.s14` and every line height follows at build time. That is worth having and it is not
 * what the old sentence said. §6.183 has the measurement and the decision that is still open.
 *
 * Rounded, because a fractional line height on a device is a fractional baseline.
 *
 * Always `leadingOf(text.sNN, leading.lNNN)` at the site — the pair is what makes it
 * derivable, and a lone product is a literal again.
 */
export function leadingOf(size: number, ratio: number): number {
  return Math.round(size * ratio);
}

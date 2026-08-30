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
 * The one RN-specific derivation the token layer cannot do for itself, and what it buys is
 * **derivability** — one em figure in the table rather than a point value per size. CSS takes
 * em directly, so the web never calls this.
 *
 * Whether the point value it produces answers the reader's setting is a question with two
 * answers, which is why it is not the same paragraph as `leadingOf` below. Android converts
 * `letterSpacing` with `toPixelFromSP`, the font-scaled unit, so it does. iOS hands it to
 * `NSKernAttributeName` untouched, so it does not: 0.996 stays 0.996 while the caps double,
 * and the tracking falls from 0.083em to 0.042 at 200% and 0.028 at 300% — measured in the
 * export, which happens to draw iOS's version of this.
 *
 * Not repaired here, and `core/src/tokens.ts`'s `track` has the argument: an unconditional
 * `* fontScale` would correct iOS and double Android. `phoneTextScaling.test.ts` allows the
 * repair under an explicit `Platform.OS === 'ios'` and forbids it without one.
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
 * The pair to `tracking()`, and the paragraph here has now been wrong in two directions.
 *
 * It first said a stored 20 collides at 200% and this function is the escape. §6.183 measured
 * the export and refuted it: both arguments are token constants and the call sits inside a
 * `StyleSheet.create` literal, so `leadingOf(14, 1.43)` **is** the stored 20, byte for byte —
 * and the export's line box duly held at 17 while a tab label's glyphs went 12 → 24.
 *
 * That arithmetic is still right. The conclusion drawn from it — that React Native does not
 * answer `fontScale` however the value was arrived at — was a fact about `react-native-web`
 * written down as a fact about React Native. Reading the text layer of the version this app
 * actually depends on settles it:
 *
 * - iOS, both renderers: `lineHeight * effectiveFontSizeMultiplier`, the same multiplier
 *   applied to the glyphs (`Libraries/Text/RCTTextAttributes.mm:141`, and Fabric's
 *   `RCTAttributedTextUtils.mm:230`).
 * - Android: `toPixelFromSP(lineHeight)` while `allowFontScaling` is on
 *   (`TextAttributeProps.kt`), the same conversion `fontSize` gets.
 *
 * So the stored 20 **is** 40 at 200% on a device, and the phone's leading already answers the
 * reader's setting. What does not is `react-native-web`, which emits `px` and pins
 * `Dimensions.fontScale` to 1 — the renderer every suite and every design pass here drives.
 * `design/measure.mjs` scales the line box with the type for that reason, and with it the
 * phone's leading holds at 1.417–1.429 through 100%, 200% and 300% exactly as the web's does.
 *
 * The consequence for a call site is the opposite of the fix that was being considered:
 * multiplying by `useWindowDimensions().fontScale` here would scale the box **twice**, to
 * 80 around 28pt glyphs, and would look correct in every check this repo can run.
 * `phoneTextScaling.test.ts` forbids it.
 *
 * What this function buys remains derivability: change `text.s14` and every line height
 * follows at build time.
 *
 * Rounded, because a fractional line height on a device is a fractional baseline.
 *
 * Always `leadingOf(text.sNN, leading.lNNN)` at the site — the pair is what makes it
 * derivable, and a lone product is a literal again.
 */
export function leadingOf(size: number, ratio: number): number {
  return Math.round(size * ratio);
}

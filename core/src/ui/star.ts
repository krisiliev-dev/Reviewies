/**
 * The star, as a drawing, for both platforms — and the last typed mark in the product.
 *
 * §6.140 took the tab bar's glyphs away for a measured reason: **a glyph's appearance
 * belongs to whatever font the device happens to have.** `▶` and `⚙` drew in full colour
 * because they have emoji presentation variants, `❏` as an empty square, `◔` as a sliver
 * two pixels tall — and every property a check can read was fine on all of them.
 *
 * `StarRating` was still typing, and worse than the tab bar had been, because the two
 * platforms had reached different answers:
 *
 * | | phone | web |
 * | --- | --- | --- |
 * | full | `★` in the mark colour | `★` in the mark colour |
 * | empty | `☆` — a **hollow** glyph | `★` in the stroke colour — a **filled** one |
 * | half | `⯪` (U+2BEA) | a full `★` clipped to its left half over an empty one |
 *
 * So an unrated episode is a hollow outline on one platform and a solid grey star on the
 * other, and a half rating is a character with thin font coverage against a composition
 * that always works. `15-title-foot.png` is sixty of them down one screen, which is the
 * scale that makes it worth the same fix `key.ts` and `tabIcon.ts` had.
 *
 * ## One path, filled by a fraction
 *
 * The drawing is a path; the state is how much of it is painted. That removes the half-star
 * problem rather than solving it twice: there is no half glyph, there is a clip at 50% —
 * and the same mechanism would give quarters if the scale ever changed, which two glyph
 * tables could not.
 */

/** The square the path below is drawn inside. */
export const STAR_BOX = 24;

/** A five-pointed star, filled, drawn in `STAR_BOX`. */
export const STAR_PATH =
  'M12 2.5l2.94 6.16 6.56.9-4.78 4.55 1.2 6.66L12 17.6l-5.92 3.17 1.2-6.66L2.5 9.56l6.56-.9z';

/**
 * How much of the star is painted, for a value and a position in the row.
 *
 * Returns 0, 0.5 or 1 — the three states the half-star scale has. A caller clips the
 * filled path to this fraction of the box and draws the outline underneath, which is why
 * this is a number rather than a name: the renderer needs a width, not a state.
 */
export function starFill(value: number | undefined, star: number): number {
  const given = value ?? 0;
  if (given >= star) return 1;
  if (given >= star - 0.5) return 0.5;
  return 0;
}

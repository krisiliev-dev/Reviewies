/**
 * Artwork, at the two sizes the app shows it, derived from the ratio rather than typed twice.
 *
 * `Poster` existed on both platforms and decided nothing: every call site passed its own
 * width and height. Seven web sites wrote `h-16 w-11`, one wrote `h-36 w-24`; six phone sites
 * passed `ROW.lead` and one passed `96 / 144`. The two platforms agreed, which is why nothing
 * had ever complained — and both were wrong in the same place.
 *
 * ## `ratio.poster` had no consumers, and the row proves why that matters
 *
 * A poster is 2:3. `ratio.poster` has said so since the token file was written and **nothing
 * has ever read it**. So:
 *
 * - the detail poster is 96 x 144, which is exactly 2:3;
 * - the row poster is 44 x **64**, which is not. 2:3 of 44 is **66**.
 *
 * And `ROW.minHeight.listing` is 66. Somebody wrote the row's height from the ratio and the
 * poster's by eye, two lines apart, so **every listing row in the app has had a two-point
 * strip of dead ground under its artwork** — on Up Next, the watchlist, search, discover, the
 * calendar and every list. Small enough to look like a rendering artefact, which is exactly
 * the kind of thing an unread token is for.
 *
 * Both heights are computed here now. A width is the only number a size names.
 */
import { radius, ratio, space, text } from '../tokens.ts';

export type PosterSize = 'row' | 'detail';

/** Width in points; the height follows from the ratio and cannot disagree with it. */
const WIDTH = { row: 44, detail: 96 } as const satisfies Record<PosterSize, number>;

export const POSTER_SIZE = {
  row: { width: WIDTH.row, height: Math.round(WIDTH.row / ratio.poster) },
  detail: { width: WIDTH.detail, height: Math.round(WIDTH.detail / ratio.poster) },
} as const satisfies Record<PosterSize, { width: number; height: number }>;

/**
 * The plate, and the band along its foot.
 *
 * `docs/design/direction.md`: printed images have square corners and a plate is a printed
 * thing, so `radius.plate` rather than a rounded card. The band is the direction's — a 4pt
 * strip in the ground at the bottom edge, which is what makes a poster read as something
 * mounted rather than something floating, and it is a *fill* so it takes a space step.
 */
export const POSTER_PLATE = { radius: radius.plate, band: space.s4 } as const;

/**
 * What a plate with no artwork shows: a monogram, not the title.
 *
 * ## The title was already there, twice, and the second copy was broken
 *
 * Every one of the seventeen call sites puts a poster beside the words it repeats — as a
 * `Row`'s `lead`, or next to the heading on a title page — and the web's fallback is
 * `aria-hidden`, so the text in the plate is decoration that duplicates readable text
 * twelve points to its right.
 *
 * It duplicated it *badly*. A 44pt plate is about 40pt of line after the padding, which at
 * `s12` in the condensed face holds one short word. §6.135's design pass photographed the
 * result on Up Next: **"Kitchen Nightshi / ft"**, broken inside the word. "The Long Dark"
 * fits, which is why it had never been caught — the defect is invisible until a title is
 * long, and it is *every* row for somebody who has just imported from TV Time and matched
 * nothing.
 *
 * §6.113 already tried to fix this, and its comment is still in both renderers: the face
 * was moved to Archivo Narrow because "a 44pt plate at `s12` in Archivo broke inside the
 * word". A third more characters per line is not the difference between ten letters and
 * five, so the change bought less than the sentence claims and the sentence stayed. §6.120's
 * shape — a comment describing a fix the screen does not show.
 *
 * ## So: initials, which cannot break
 *
 * A monogram is a stand-in that reads as deliberate rather than as a failed render, it is
 * the same shape at both sizes, and down a column of twenty unmatched imports the letters
 * differ enough to give the eye something to track — which twenty truncated copies of text
 * that is already on the row do not.
 *
 * A leading article is dropped because it is the least distinguishing glyph available:
 * *The Long Dark* is `LD`, not `TL`, and a library of English titles is otherwise a column
 * of `T`s.
 *
 * **Always two glyphs, never one.** The first cut took one letter per word and stopped at
 * two, and a probe on real titles is what rejected it: *Andor* became `A` and *The 100*
 * became `1`, which is a mark so thin it reads as a rendering fault rather than a stand-in.
 * A single-word title takes its first two characters instead — `AN`, `10` — which is also
 * the right answer for a script that does not put spaces between words: 攻殻機動隊 is 攻殻.
 * A title with nothing alphanumeric in it gets an empty plate, which is what the detail
 * screen wants while it is still loading its title.
 */
export function posterInitials(name: string): string {
  const words = name
    .replace(/^(the|a|an)\s+/i, '')
    .split(/[\s:–—·-]+/)
    .filter((word) => /\p{L}|\p{N}/u.test(word));
  if (words.length === 0) return '';
  const glyphs =
    words.length === 1
      ? [...words[0]].slice(0, 2)
      : words.slice(0, 2).map((word) => [...word][0]);
  return glyphs.join('').toLocaleUpperCase();
}

/**
 * The monogram's size at each plate size, derived rather than chosen twice.
 *
 * Two letters in the condensed face at `s20` occupy roughly half of a 44pt plate, which is
 * a mark on a ground rather than a label filling it. The detail plate is 96 wide — the same
 * proportion would be `s44`, and the scale stops at `s30`, so it takes the top of the scale
 * instead. A step off a named scale beats a number invented for one component (§6.113).
 */
export const POSTER_GLYPH = { row: text.s20, detail: text.s30 } as const satisfies Record<
  PosterSize,
  number
>;

/**
 * The monogram does **not** grow with the reader's text setting, and the plate is why.
 *
 * Every other size in this file is fixed — a poster is 44 or 96 wide because that is what
 * fits beside a row, and `mobile/smoke.mjs` states the rule the other way round: *"the type
 * grows and the poster does not"*. A mark sized as a proportion of a box that cannot grow
 * has exactly one outcome, and §6.181 measured it in the export rather than arguing about
 * it: at 200% the `KN` in a 44x66 plate is **47pt wide**, at 300% it is **70**, and the
 * plate's `overflow: hidden` takes the stems off both letters. The photographs are in the
 * entry. At three hundred percent it is two vertical strokes.
 *
 * Which is the failure this whole fallback was built to end. §6.137 replaced the title with
 * a monogram because the title broke inside the word and *"a mark so thin it reads as a
 * rendering fault rather than a stand-in"* is the thing to avoid — and a clipped `KN` is
 * that mark, arrived at down a different road.
 *
 * ## Why not scaling is the right answer rather than a dodge
 *
 * This is a stand-in for **artwork**, and artwork does not grow with a text setting. It is
 * `aria-hidden` on both platforms because the title it abbreviates is already on the row
 * twelve points to its right, in a `Text` that scales normally — so nothing a reader needs
 * is being held still. WCAG 1.4.4 asks that content be readable at 200%; the content here
 * is the row, and the row is fine. The alternative on offer is not "bigger initials", it is
 * "no legible initials at all".
 *
 * The web needs no counterpart: its type is in `px` and does not respond to the browser's
 * font-size setting either, so it has always behaved this way. Stating it here is what makes
 * the two platforms agree on purpose rather than by accident.
 */
export const POSTER_GLYPH_SCALES = false;

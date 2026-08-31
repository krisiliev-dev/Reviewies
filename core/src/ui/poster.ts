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

/**
 * Width in points; the height follows from the ratio and cannot disagree with it.
 *
 * ## 96, which this file used to admit it had only inherited
 *
 * The header above says where the two numbers came from — *"one [call site] passed 96 /
 * 144"* — and that is an account of a provenance, not an argument. The first reading with
 * real artwork asked the obvious question of it: the browse shelf draws the **same** poster
 * at 173 points on a phone, 188 at a 420 window and 221 at 1280, and `box.ts` argues in its
 * own words that *"three across is 110pt, which is a thumbnail, and a thumbnail is what
 * Discover already had"*. So the title page draws a title's artwork below the size the
 * shelf refused, and the page is the place you went to *look at it*.
 *
 * ## Refused, and refused on a measurement rather than on taste
 *
 * Two things are wrong with that reading, and the second is the one that settles it.
 *
 * The first is that 110 is a floor for a **shelf**, not for artwork. `box.ts`'s sentence is
 * about how large a box has to be before looking along a row of them is browsing rather
 * than scanning a contact sheet; the same file's `row` poster is 44 and nobody calls that a
 * defect, because a row's lead is a lead. `direction.md` refuses the poster-wall register
 * outright and keeps *"browsing is reading, not shopping"* as the rule that survives — the
 * shelf's large artwork is the one argued exception, and the exception does not generalise
 * back over the page it leads to.
 *
 * The second is what a larger plate costs, which is not space in general but **the measure
 * of the one paragraph this product sets**. On the title page the synopsis sits in the
 * column beside this plate, so every point the plate takes comes off the line length of the
 * only running prose in the app — and `SCREEN.prose` has already measured that this page is
 * the tight one: the convention puts a comfortable measure at 45–75 characters and at 420
 * it is *below* the band. Three candidates, built and photographed, all six titles in the
 * snapshot, characters counted off the browser's own line boxes:
 *
 * ```
 *                          plate      420pt window     1280pt window
 * detail: 96  (today)      96x144     39–44 chars      63–71 chars
 * detail: 128              128x192    35–37            63–71
 * detail: 173 (the shelf)  173x260    29–32            63–71
 * ```
 *
 * The wide column is flat because `SCREEN.prose` caps the paragraph at 460 before the plate
 * can reach it. The narrow one is the whole answer: the page is already 39–44 and every
 * enlargement moves it further from the band, in the direction it is already failing. A
 * plate the size of a shelf box buys a bigger picture on the screen whose subject is a
 * paragraph, an episode list and where to watch it, and pays for it in the only place this
 * product asks anybody to read.
 *
 * ## What it does not settle
 *
 * The phone draws its synopsis full-width **below** the header rather than in the column
 * beside the plate, so on that platform the trade above does not exist and this number is
 * unopposed. Freeing the web's paragraph the same way would take its 420 measure from
 * 39–44 into the band and leave the plate free to grow — a real improvement, on a screen
 * §6.174 laid out deliberately one sprint ago, and a decision about *the synopsis* rather
 * than about this table. It is written down here rather than taken, because a poster size
 * is not the altitude to re-lay-out a page from.
 */
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

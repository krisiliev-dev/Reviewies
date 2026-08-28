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
import { radius, ratio, space } from '../tokens.ts';

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

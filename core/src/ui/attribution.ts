import { JUSTWATCH_ATTRIBUTION, TMDB_ATTRIBUTION } from '../metadata/provider.ts';

/**
 * Small print the product owes, drawn the same way wherever it is owed.
 *
 * TMDB's disclaimer and JustWatch's credit are licence conditions — the words are fixed by
 * somebody else and `provider.ts` holds them. What is *ours* is how they are drawn and
 * where, and that had been decided five times:
 *
 * | site                              | drawn as                                   |
 * | --------------------------------- | ------------------------------------------ |
 * | `app/.../WhereToWatch.tsx`        | `Note level="footnote"` + `mt-2`           |
 * | `app/.../Settings.tsx`            | bare `<p>` inside a footnote block         |
 * | `mobile/.../more.tsx`             | `Note level="footnote"`                    |
 * | `mobile/.../WhereToWatch.tsx`     | a hand-rolled `styles.attribution`         |
 * | `mobile/(tabs)/discover.tsx`      | a *second* hand-rolled `styles.attribution`|
 *
 * — and on the web's Discover it had not been decided at all: the phone credits TMDB under
 * its suggestions and the web does not. §6.147.
 *
 * §6.138 filed the phone's as a design defect — the line sits at the list's inset, in the
 * list's ink, directly under the last row's hairline, so on a one-result screen it reads as
 * a second suggestion with no poster. It is not a row and it is not a note in the flow; it
 * is small print under the thing it is about, and `SEPARATION` is what says so.
 */

export type AttributedSource = 'tmdb' | 'justwatch';

/**
 * TMDB first.
 *
 * Fixed here rather than at the call sites, so a screen owing both cannot print them the
 * other way round from the screen next to it — `Settings` and `more.tsx` happened to agree
 * and nothing was holding them to it.
 */
export const ATTRIBUTION_ORDER: readonly AttributedSource[] = ['tmdb', 'justwatch'];

const WORDS: Record<AttributedSource, string> = {
  tmdb: TMDB_ATTRIBUTION,
  justwatch: JUSTWATCH_ATTRIBUTION,
};

/**
 * The space above, which is the whole of what tells this apart from a row.
 *
 * `s24`, against the `s12` the phone's Discover used and the eight points a list puts
 * between its rows: the gap has to be larger than any gap *inside* the list, or the last
 * hairline reads as this line's own top border. It is the only signal available — the ink
 * and the size are already a footnote's, and the inset is the screen's.
 */
export const ATTRIBUTION_SEPARATION = 24;

/**
 * The lines a slot owes, in the fixed order, whatever order the caller names them in.
 *
 * `fixtures` is whether this build is running on the offline provider, and it makes the
 * answer **nothing**. The licence text in `provider.ts` says why: the disclaimer is owed
 * *"this product uses the TMDB API"* — a build with no token does not, and crediting a
 * source that supplied nothing is a false statement rather than a courtesy.
 *
 * The product already held that position on two screens and not the other two: `usingFixtures()`
 * made Settings and More say "Running on sample data" **instead of** the attributions,
 * while Discover and *Where to watch* printed them regardless. So every screenshot in this
 * project's design record credits TMDB and JustWatch for data neither supplied, and the
 * four screens answered "is this real?" two ways. §6.147 fixed the drawing and left the
 * condition; this is the condition. §6.149.
 */
export function attributionLines(
  sources: readonly AttributedSource[],
  fixtures: boolean,
): string[] {
  if (fixtures) return [];
  return ATTRIBUTION_ORDER.filter((source) => sources.includes(source)).map((s) => WORDS[s]);
}

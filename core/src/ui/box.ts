/**
 * The browse box: a shelf of CD boxes you look along, and turn over.
 *
 * `docs/design/architecture.md` section 5. Discover was a list of rows with two buttons on each —
 * *"a list of shows with buttons"* — which is the right shape for **results** and the wrong
 * shape for **browsing**. The finding, verbatim: *"as if a person is in a CD shop looking at
 * the CD boxes"*. So the shelf is boxes and the list is the list, on one surface, and each
 * shape does the job it is right for.
 *
 * ## The three things on the front, and why they are those three
 *
 * Title, genre, year. That is what is printed on a spine and on the back of a case, and it
 * is the smallest set that lets somebody skip a box without opening it: *what it is called*,
 * *what sort of thing it is*, *when it is from*. Nothing else goes on the front — and in
 * particular no score, which `docs/design/architecture.md`'s third refusal covers and
 * `app/src/ui/browse.test.ts` enforces: the crowd's number narrows the shelf and is never
 * drawn, because a number in the corner of every box is the fastest way there is to turn a
 * shelf into a shop, and `direction.md` refused the shopping register outright.
 *
 * ## Why the actions are on the back
 *
 * `row.ts`'s contract says a row is *at most one navigation target and one action*, and it
 * says why: a screen of rows is the same two words repeated down the page. A shelf of twenty
 * boxes each carrying **Track** and **Watchlist** is that failure squared — forty controls
 * with two names between them. A box is **one** control with two faces: press the front and
 * it turns over, and the decision is made on the back, where the synopsis you need in order
 * to make it also is. That is the finding's own shape — *"tapping one turns the box over for
 * the synopsis, more information"* — and it happens to be the accessible arrangement too.
 *
 * ## What the back does not have
 *
 * A trailer. Asked for by name and refused for now, with the reason in `architecture.md`
 * refusal 1: no method on `MetadataProvider` returns a video, so it is a new endpoint implemented
 * three times plus a licence question this build has not asked, and a control that is dark
 * against the fixture provider — which is what every test and every design pass in this
 * repository runs against — is a photograph of an affordance nobody can press. The back is
 * laid out with room for it.
 */
import { ratio, space, text } from '../tokens.ts';
import { COPY } from '../copy.ts';
import type { MediaKind } from '../domain/types.ts';

/**
 * How many boxes across.
 *
 * Two on a phone, and that is the number the finding names rather than a number that fits:
 * a 390pt frame less two 16pt edges and one 12pt gap is 173pt a box, which at 2:3 is a 260pt
 * plate — a *box*, the size of a hand. Three across is 110pt, which is a thumbnail, and a
 * thumbnail is what Discover already had.
 *
 * Three on a wide window because `SCREEN.measure` caps the column at 720 and two boxes of
 * 348 are posters the size of a paperback. The breakpoint is the web's own; the phone never
 * reaches it.
 */
export const BOX_COLUMNS = { phone: 2, wide: 3 } as const;

/**
 * The box, as measurements.
 *
 * The plate's height follows from `ratio.poster` exactly as `POSTER_SIZE`'s does — one
 * ratio, read, rather than a second number typed by eye. `poster.ts` records what happened
 * the one time this repository wrote both by hand: every listing row in the app carried a
 * two-point strip of dead ground under its artwork for as long as the row has existed.
 */
export const BOX = {
  gap: space.s12,
  ratio: ratio.poster,
  /**
   * Title, then the one line under it. Both clamped, because a shelf is a grid.
   *
   * Here rather than at the two call sites for `ROW_LINES`' reason: a box's height is its
   * neighbours', so how many lines each part may take is a property of the grid rather than
   * of one renderer. `browse.test.ts` binds the web's `line-clamp-n` classes to these — the
   * web cannot interpolate a Tailwind class, so the numbers have to be checked rather than
   * read.
   *
   * These two **are** constants, and the synopsis on the back is not — `backLines` below
   * says why the difference is real rather than an inconsistency. A title and the line
   * under it are clamped so that a box cannot be made taller by a long name; the synopsis
   * is clamped so that it fills the ground the box has and no more, and that ground is a
   * different number at every width.
   *
   * The type *sizes* are deliberately not in this table. A box's title is `s14` and its
   * second line `s12` because that is what every listing row in the app is — `ROW`'s own
   * numbers — and a second table stating them would be a second answer to a question
   * `tokens.ts` already answers.
   */
  lines: { title: 2, under: 1 },
  /**
   * The monogram on a box with no artwork.
   *
   * `POSTER_GLYPH` is `Record<PosterSize, number>` and a box is not a `PosterSize` — every
   * size in that table is a *fixed width*, and a box is as wide as its column. So the mark's
   * size lives here with the rest of the box's measurements rather than forcing a third
   * entry into a table whose entries all mean something this does not.
   *
   * `s30` is the top of the scale, which is what `poster.ts` reasons its way to for the
   * detail plate: two letters in the condensed face at the top step occupy about half a
   * plate, which is a mark on a ground rather than a label filling it.
   */
  monogram: text.s30,
} as const;

/**
 * How many lines of synopsis the back has room for — the ground, not a number.
 *
 * ## What the constant was, and why a constant could not be right
 *
 * This was `BOX.backLines: 6`, justified as *"a box in a grid whose height is its
 * neighbours' cannot take a paragraph of any length"*. That argument is correct and it
 * survives; what did not survive is spelling it as one number. **The height it clamps into
 * is not a constant.** A box is as wide as its column, its plate's height is that width
 * over `BOX.ratio`, and the panel is exactly as tall as the front it replaced — so the
 * ground left over after the title, the fact line and the four controls is a different
 * number at every width the product is drawn at.
 *
 * Six was invisible until the first reading with real artwork, because `FixtureProvider`'s
 * overviews are one sentence and never reached six lines. Measured against a snapshot of
 * TMDB, one constant was wrong in **both** directions at once:
 *
 * | | box | panel | ground | six lines |
 * | --- | --- | --- | --- | --- |
 * | phone, 390pt frame | 173 | 304pt | 76pt — **4 lines** | overruns by 26pt |
 * | web, 420pt window | 188 | 333pt | 143pt — 8 lines | leaves 40pt empty |
 * | web, 1280pt window | 221 | 383pt | 193pt — 11 lines | leaves 90pt empty |
 *
 * The phone's six lines were never free: they were twenty-six points borrowed from the row,
 * which is `mobile/src/ui/Browse.tsx`'s own jumping-shelf defect arriving from the other
 * side. The web's six left a third of the panel empty *while truncating*. One number cannot
 * be generous at 221 and safe at 173, and the fact that it was neither is the finding.
 *
 * ## So the clamp is the ground
 *
 * The renderer measures the room its own layout gave the paragraph — the web a
 * `ResizeObserver` on the flex child, the phone that child's `onLayout` — and this turns a
 * height into a line count. Nothing here guesses the furniture above and below it: whether
 * two verbs sit side by side or stack, and how far the reader has turned the type up, are
 * facts only the laid-out screen has, and both change the answer.
 *
 * `lineHeight` is passed rather than read off `NOTE.footnote` here, because the two
 * platforms scale it differently and only the caller knows which it is: the web's type is
 * in pixels and holds still, and React Native multiplies a stored leading by the reader's
 * font scale. Reading it here would make this function quietly wrong on one of them.
 *
 * At least one line, so a panel measured before its first layout — zero — still draws a
 * sentence rather than nothing.
 */
export function backLines(ground: number, lineHeight: number): number {
  return Math.max(1, Math.floor(ground / lineHeight));
}

/**
 * The line under the title on the front: genre, then year.
 *
 * One genre, not all of them. TMDB gives a title up to four and the second one is almost
 * always a widening of the first — *Drama, Action & Adventure, Sci-Fi & Fantasy* — so the
 * second chip buys nothing and the line wraps. The first is the one the provider ranks
 * highest, which is the one somebody would say if you asked what it was.
 *
 * A middot between them and nothing where a half is missing: an imported title has no
 * genres and never will until it is matched, and *" · 2019"* is a line that failed to fill
 * rather than a line with one fact on it.
 */
export function boxUnder(of: { genres?: readonly string[]; year?: number }): string {
  return [of.genres?.[0], of.year ? String(of.year) : undefined].filter(Boolean).join(' · ');
}

/**
 * The fact line on the back, and on a search row: what it is, when it is from, and how much
 * of it there is.
 *
 * `seasonCount` and `runtimeMin` are on `CachedTitle` and not on a search result, so this is
 * written to say less rather than to say nothing — which is also `architecture.md`'s second
 * refusal from the other side. The same two numbers are refused as *filters* precisely
 * because a list endpoint does not carry them; showing them where they happen to be cached
 * costs no request at all.
 *
 * ## The year, which turning a box over used to lose
 *
 * This said `Series` where the front said `Drama · 2001`, so a box carried two facts on the
 * face and one on the back, and the one it dropped was the one the synopsis cannot supply.
 * Genre it may drop and does: the back's whole middle is a paragraph saying what sort of
 * thing this is at length, and a one-word summary of a paragraph six lines below it is the
 * §6.169 defect at a smaller altitude. The year is not in the paragraph, is not on the
 * back anywhere else, and on a real case is the one thing the back never loses. It is here
 * now, second, so that `Series · 2001` reads as the same pair the front and the search row
 * already print.
 *
 * ## And this is what a search row says, rather than a fifth composition of it
 *
 * `app/src/screens/Discover.tsx` and `mobile/app/(tabs)/discover.tsx` each wrote
 * `` `${kind}${year ? ` · ${year}` : ''}` `` into a `meta` prop by hand, which is the defect
 * `boxUnder` exists to prevent — one line, two platforms, punctuated twice — sitting
 * unnoticed because the two copies happened to agree. A search result carries neither
 * number this line's tail is made of, so `boxFacts(result)` **is** that string, and the two
 * call sites read it now.
 *
 * ## The four surfaces, and which of their differences are decisions
 *
 * The same title reads four ways, and three of the four are right:
 *
 * - **shelf front** `Drama · 2001` (`boxUnder`) — the three things printed on a spine, and
 *   the only place genre appears, because the front is the only one of the four with no
 *   sentence on it.
 * - **shelf back** `Series · 2001` (here) — what it is and when, over the paragraph that
 *   says the rest.
 * - **search row** `Series · 2001` (here, from the same function) — a result list answers
 *   *is this the one I meant*, and kind and year are what separate a remake from what it
 *   is a remake of. Genre in a row is a word the three controls under it do not need.
 * - **title page** `2001` alone — the only one of the four that draws the synopsis whole,
 *   so the sentence that says what sort of thing it is is already on the screen; and the
 *   line under the name there is a `Data`, tabular mono, which is a figure and not a
 *   phrase. `CachedTitle.genres`' own comment asks that *a box* built from a cached title
 *   say the same three things as one built from a search result, and the title page does
 *   not build a box.
 */
export function boxFacts(of: {
  kind: MediaKind;
  year?: number;
  seasonCount?: number;
  runtimeMin?: number;
}): string {
  const parts: string[] = [of.kind === 'show' ? COPY.kinds.show : COPY.kinds.film];
  if (of.year) parts.push(String(of.year));
  if (of.kind === 'show' && of.seasonCount) {
    parts.push(`${of.seasonCount} season${of.seasonCount === 1 ? '' : 's'}`);
  }
  if (of.runtimeMin) parts.push(`${of.runtimeMin} min`);
  return parts.join(' · ');
}

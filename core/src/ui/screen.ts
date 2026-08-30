/**
 * The edge of the screen, which is the one measurement every screen makes and nothing owned.
 *
 * `docs/design/direction.md` chooses LATE EDITION, and the first property its comparison
 * names is **full-bleed rows on hairlines** — a printed artefact you mark up, where the rule
 * runs to the paper's edge and only the words are inset. `mobile/src/ui/Row.tsx` says the
 * same thing in a comment of its own: *"Full bleed and ruled, not a card."*
 *
 * It has never been true, and it could not have been. Every screen wraps its rows in its own
 * padding, so the rule stops short at both ends and the row reads as a card with three sides
 * missing. The design harness measures it now: **21 rules across seven screens, every one of
 * them 16..374 of 390.** The component's claim and its container disagreed, and no clause
 * reading `Row.tsx` could ever have seen it, because `Row.tsx` is correct.
 *
 * ## What the measurement found underneath
 *
 * The edge is a raw number, and the two platforms do not agree on it:
 *
 * - the phone writes the literal `16` in **fourteen** screen containers — uniform, but by
 *   coincidence rather than by decision, and `space.s16` sat unread beside it;
 * - the web writes Tailwind's **default** scale, off the token namespace entirely, at
 *   **three different values**: `p-6` (24px) on Up Next, Watchlist, Lists and Not Found,
 *   `p-4` (16px) on ten screens, `p-3` on Watching Mode.
 *
 * So Up Next — the screen this product opens on — has a 24px edge on the web and a 16pt edge
 * on the phone. Every other layer in this system got an owner sprints ago: space, radius,
 * type, colour, tracking, leading, heading depth. The measurement every single screen makes
 * had none, which is why it drifted in the one direction nobody photographs side by side.
 */
import { space } from '../tokens.ts';

/**
 * One edge, and the row's escape from it.
 *
 * `edge` is what a screen insets its content by. `bleed` is the negative of it, which is how
 * a row reaches the paper's edge while its words stay in the column: the row cancels the
 * container's padding on both sides and re-applies it to itself. That is the whole mechanism,
 * and it lives here rather than in each renderer so the two numbers cannot come apart — a
 * bleed that does not match the edge is a row that either falls short or overhangs, and
 * overhang is a horizontal scrollbar on the web and a clipped rule on the phone.
 */
export const SCREEN = {
  edge: space.s16,
  bleed: -space.s16,
  /**
   * The widest a column of rows may become. §6.157.
   *
   * The phone cannot need this — its window is the device — and the web had never been
   * photographed above 420pt wide by anything, so nothing had ever asked. At 1280, which is
   * what an ordinary desktop visitor gets, the app is the phone layout stretched: rows span
   * the whole window, so on Up Next **One Piece's title sits at the far left and its own
   * checkbox at the far right, about 1,100 points apart**. Marking an episode watched means
   * reading one edge of the window and clicking the other, and the row stops reading as one
   * thing at all.
   *
   * That is a defect by this product's own standard. #169 was filed over a state announced
   * at both ends of a **390**-point row, seven hundred points apart in the photograph; this
   * is the same failure with half the window again between the two halves.
   *
   * 720, measured rather than picked: the longest line the real library produces is One
   * Piece's `S1E1 · I'm Luffy! The Man Who Will Become the Pirate King!`, which sets in
   * roughly 600 points beside a 72-point poster. 720 holds the worst case the snapshot has
   * with room to spare, and keeps a row's two ends close enough to belong to each other.
   *
   * What this does **not** do is give the web a desktop layout. It stops the phone layout
   * being stretched; a second column, or anything that uses the width rather than declining
   * it, is a design question and is filed rather than guessed at.
   */
  measure: 720,
  /**
   * The widest a run of **prose** may set, which is not the same question as the one above.
   *
   * ## Why one number could not answer both
   *
   * `measure` was measured for a *row*: the note above it says so — the longest line the
   * real library produces sets in roughly 600 points, and 720 "keeps a row's two ends close
   * enough to belong to each other". That is a question about one line scanned left to
   * right, and the answer to it is as wide as the row's own content.
   *
   * Prose asks the opposite question. A paragraph is read line after line, and what a long
   * measure costs is the *return sweep* — finding the start of the next line. A row has no
   * next line, so the failure `measure` guards against and the failure this guards against
   * do not overlap at any width, and 720 inherited the second job by being the only number
   * in the file.
   *
   * ## What that cost, measured
   *
   * The title page's synopsis is the one piece of running prose the product draws, and it
   * is the only element in the app whose *reading* depends on the window. Measured against
   * the real snapshot, counting the characters the browser actually put on each line rather
   * than estimating from an em:
   *
   * - at **420** — the width every design pass had ever photographed — Shōgun's synopsis
   *   sets in 276pt, seven lines, longest **44 characters**;
   * - at **1280**, the window an ordinary desktop visitor gets, the same paragraph sets in
   *   576pt, three lines, longest **89**.
   *
   * The convention puts a comfortable measure at 45–75 characters. One build of one app,
   * one paragraph, doubling its measure between two widths, with the wide one outside the
   * band and the narrow one at the bottom of it.
   *
   * ## 460, measured rather than picked — and measured on **all six**
   *
   * Every synopsis in the snapshot, capped at each candidate and re-counted at 1280. The
   * longest line each one drew:
   *
   * ```
   *                                     none  400  420  440  460  480  500
   * It's Always Sunny in Philadelphia     85   60   63   66   68   69   73
   * One Piece                             89   61   66   69   71   76   79
   * Severance                             83   60   63   66   69   69   77
   * The Bear                              82   59   60   65   66   70   73
   * Shōgun                                89   61   64   69   69   72   76
   * Everything Everywhere All at Once     86   61   60   63   63   72   72
   * ```
   *
   * 460 is the widest round number that keeps **every** one of them at or under 75, with
   * four characters in hand. The first version of this number was 480, chosen off two
   * paragraphs — Shōgun's and It's Always Sunny's, which are the longest — and the harness
   * below caught it on the third: One Piece sets 76 at 480. A worst case picked by reading
   * is not the worst case, which is the argument for measuring the set rather than the
   * example.
   *
   * The rows are not monotonic — *Everything Everywhere* draws a longer line at 400 than at
   * 420 — because where a line breaks is a fact about that paragraph's words. That is why
   * the ceiling is a measurement over the whole set and not an arithmetic conversion from
   * points.
   *
   * `PROSE_CHARACTERS` below is the claim this number exists to satisfy, so the harness can
   * check the rendering rather than the arithmetic.
   *
   * The phone does not take it, for the reason `WIDE` gives about `measure`: its window is
   * the device, and at 390 the same paragraph sets at 44.
   */
  prose: 460,
} as const;

/**
 * The claim `SCREEN.prose` is for, in the unit the claim is actually made in.
 *
 * A width in points is not checkable against a convention — the convention is about
 * characters, and how many characters a width holds depends on the face and the text size.
 * So the number above is what the renderers apply and this is what the design pass measures
 * against, on real synopses at both photographed widths, in `design/capture-web-real.mjs`.
 *
 * 75 rather than 66: the band is 45–75 and the top of it is the honest ceiling for a
 * *paragraph* of three to seven lines. A page of body text would want the middle of the
 * band; this product has no page of body text.
 */
export const PROSE_CHARACTERS = 75;

/**
 * What the web does with a window wider than the column. §6.159, #194.
 *
 * ## The measurement
 *
 * §6.157 gave the web a real-data pass at 420 **and** 1280, and the two scroll the same
 * distance: discover 2179 against 2162, calendar 1002 against 1002, The Bear's title page
 * 1248 against 1213. The extra 860 points of width buy nothing, because there is one column
 * at every size. `SCREEN.measure` stopped that column being stretched; it did not decide
 * what the width is *for*.
 *
 * ## One column, on purpose
 *
 * A second column was the obvious candidate and the screens refuse it. Nine of the ten web
 * routes are a single sequence — Up Next, Search, Watchlist, Discover, the calendar, the
 * lists, the people, the two settings screens — and a sequence split into two columns is
 * read in the wrong order or not read at all. The **one** screen with two genuinely
 * separate things is the title page: its metadata block and its episode list. Reshaping the
 * grammar of ten screens to improve one is not a trade this design makes, and
 * `docs/design/direction.md`'s choice is a printed artefact you mark up — a column of ruled
 * rows — rather than a dashboard.
 *
 * So the width is declined, deliberately, and the reason is written down rather than left
 * as the absence of a decision. What the window gains is margin.
 *
 * ## And the navigation takes the column's measure
 *
 * That left one thing genuinely wrong rather than merely undecided. The tab bar's items sat
 * in `max-w-lg` — **about 460 points, measured off `wide-title-the-bear.png`** — while the
 * content column is 720 and the bar's rule spans the whole window. Three widths on one
 * screen, none of them matching: the navigation was narrower than the thing it navigates,
 * for no reason anybody chose.
 *
 * The rule stays full-bleed, because the direction's first named property is a rule that
 * runs to the paper's edge. The items take `SCREEN.measure`, because they belong to the
 * column.
 */
export const WIDE = {
  /** One column at every width. A second is refused; the reasoning is above. */
  columns: 1,
  /** The navigation is as wide as what it navigates. */
  navMeasure: 720,
} as const;

/**
 * Where a screen's message goes when the screen has nothing else in it.
 *
 * Three screens centred theirs — `lists.tsx`, `people.tsx` and `account.tsx` — in a
 * container that is `flex: 1` with `justifyContent: 'center'`, while every other screen
 * top-aligned. `10-lists.png` is what that looks like: the title "Lists" pinned to the top,
 * roughly seven hundred points of nothing, and then "Lists need an account" floating at
 * 55% of the viewport with the tab bar below it.
 *
 * The distinction that settles it is not empty-versus-gated, it is **whether the screen
 * has a name**. Those three render `<Stack.Screen options={{ title }} />` and then centre
 * the message in what is left, so they are half a full-screen state and half an ordinary
 * screen and read as neither. `_layout.tsx` centres too and is *right* to: it replaces the
 * entire app before the router mounts, with no title and no tab bar, which is what a
 * full-screen state actually is.
 *
 * So: **a screen with a title is a screen, and its message is content.** It begins where
 * its content would have begun. That is what the web has always done — it centres nothing
 * — and what the phone's own data, stats and calendar screens do.
 *
 * `top`, not a token: this is a rule about alignment, and the space above the message is
 * already `MASTHEAD`'s `gapBelow` and the screen's own edge. A second number here would be
 * a third opinion about the same gap.
 */
export const EMPTY_ALIGN = 'top' as const;

/**
 * The one place a centred, full-height state is correct, and why.
 *
 * `_layout.tsx` before the router mounts: no title, no tab bar, nothing else on the
 * screen. Named here rather than left as a difference somebody notices later, and
 * `screen.test.ts` fails if the entry outlives the file — the §6.41 rule applied before
 * the excuse has had time to go stale.
 */
export const FULL_SCREEN: Record<string, string> = {
  '_layout': 'Replaces the whole app before the router mounts: no title, no tab bar, nothing to be content inside of.',
};

/**
 * Screens that do not take the standard edge, and why.
 *
 * Watching Mode only. It is the one immersive route — no tab bar, no masthead, the frame
 * given over to the stream — and `docs/design/direction.md`'s refusal 6 is about exactly this
 * kind of screen running out of width. It is not a page of rows and has none to bleed.
 *
 * Named here rather than left as a difference somebody notices later, and `screen.test.ts`
 * fails if the list outlives the screen it excuses — the §6.41 rule, applied before the
 * excuse has had time to go stale.
 */
export const EDGE_EXEMPT: Record<string, string> = {
  WatchingMode: 'Immersive: no tab bar, no masthead, and no rows to bleed to the edge.',
};

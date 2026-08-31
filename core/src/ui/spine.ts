/**
 * The year spine, and the one cell on it that is still open.
 *
 * `docs/design/direction.md` graft 2 takes TEST CARD's record-as-object and cuts it down to
 * one row per year — twelve month-blocks, drawn from **counts**, which is the half of the
 * import that actually arrives (`core/src/data/diocache.ts` pushes `watches` and no ratings
 * for television at all). Graft 3 is the part it calls *"the best single idea in the set"*:
 * the current month's block carries one hairline-outlined open cell waiting for tonight, and
 * marking an episode strikes into it.
 *
 * `docs/design/calm.md` is why it is built now rather than later, and the argument is one
 * sentence long: **this is the reward system that replaces streaks.** TV Time ran on streaks
 * and badges; every tracker in doc 08's field of fifteen has some version of them. Deci and
 * Ryan's cognitive evaluation theory splits feedback into the *informational* — which
 * supports competence and leaves the locus of causality inside the person — and the
 * *controlling*, which moves it outside. A streak is controlling by construction: it is a
 * live number you can lose, so the app is asking for tomorrow. The spine is informational by
 * construction: it is a true fact about a year that already happened, it cannot be gamed, it
 * has no state in which it accuses you of anything, and the only thing it ever asks for is
 * the episode you were going to watch anyway.
 *
 * ## The open cell is the whole of it, and it is one View
 *
 * The record is *visibly unfinished*. Not "you are 3 days from a badge" — one empty box, the
 * size of a mark, sitting where the next mark will land. It never says you are behind,
 * because there is no target for you to be behind of; it never resets, because there is
 * nothing to reset; and it does not exist on the screen where you mark, so it cannot be a
 * prompt. You find it when you come looking, which is the difference between a record and a
 * nag.
 *
 * ## Three numbers, and the reason each is what it is
 *
 * `plot` is the column's whole height. `slot` is the open cell. `gap` sits between the fill
 * and the cell, so a full month does not weld itself to the thing waiting above it. The
 * arithmetic that matters is `PLOT_FILL` below: **the fill is scaled to what is left after
 * the slot is taken out**, which is what stops the busiest month in a decade from drawing
 * over the one object this whole component exists for. A column that fills its plot is a
 * column with nowhere to put tonight.
 *
 * ## The floor applies above zero only
 *
 * `core/src/ui/progress.ts` got this wrong once and says so at `PROGRESS_FLOOR`: clamping
 * everything made a bar measuring nothing draw 4%, and *"barely any"* and *"none"* are
 * different facts. A month you watched nothing in is a month you watched nothing in, and on
 * an almanac that is information — the gap in the year is the shape of the year. So a
 * nonzero month never draws less than `floor` and a zero month draws nothing at all.
 *
 * ## Measured, on a browser, rather than reasoned about
 *
 * Built, served at 390x844 and read off the rendered boxes, because none of the above is
 * visible to a source clause — `progress.ts` is one directory away and is the record of what
 * happens when a table and a renderer are only ever compared to each other.
 *
 * Twelve columns of 28.0 x 32.0 on a 390pt frame. A decade seeded at 40 episodes in one
 * month drew that month at **24.0pt** — `PLOT_FILL` exactly, the ceiling — with the open
 * cell still on screen above it. The cell measured 6.0pt tall with a 1px border in
 * `rgb(138, 128, 121)` (`strokeSignal`, dark) and `rgb(110, 100, 86)` (light), sitting
 * **5pt** above its column's floor in a month with three points of fill: 3 + `gap`, which is
 * the cell riding the mark rather than parked at the top. On an empty library the same cell
 * sat 2pt up — `gap` and nothing else — which is the first-run picture.
 *
 * ## Colour is never the only encoding
 *
 * Height carries the count; the mark colour carries only *marked at all*. The spine is
 * readable in greyscale and at any colour vision, which is the property TEST CARD's own
 * document names as what makes its record defensible, and it is free here because there is
 * one mark colour rather than eight.
 *
 * The mark is `markCrossOff` — the pen. The cross-off strikes a row and the same ink
 * accumulates here, which is `direction.md`'s marked-up almanac rendered rather than
 * described. The track is `strokeHairline` as a **ground**, exactly as `progress.ts` paints
 * its track and for the reason stated there: the unfilled part is a colour rather than an
 * outline around a gap. The open cell is `strokeSignal`, which `core/src/tokens.ts` names
 * *"the empty-slot outline"* as the first of the five state-bearing marks it was aliased to
 * `inkTertiary` for — 4.51:1, where the hairline it was specified in is 1.42 and does not
 * exist as far as WCAG 1.4.11 is concerned.
 */
import { border, space } from '../tokens.ts';

/** Twelve, and it is the calendar's twelve rather than a choice. */
export const SPINE_MONTHS = 12;

export const SPINE = {
  /** The column's full height, slot included. */
  plot: space.s32,
  /** The open cell: one mark's worth of room, always the same size, never a quantity. */
  slot: space.s6,
  /** Between the fill and the cell above it, and between one column and the next. */
  gap: space.s2,
  stroke: border.hairline,
  /**
   * The shortest a month with anything in it may draw.
   *
   * `space.s2` rather than a bare 2: a mark is a fill, so it is on the space scale, which
   * is `progress.ts`'s note about a stroke scale that quietly contains fills, in the other
   * direction.
   */
  floor: space.s2,
} as const;

/**
 * What the fill is scaled against — the plot, less the cell and its gap.
 *
 * Derived here rather than at two call sites. Both renderers drawing this subtraction for
 * themselves is how `progress.ts` ended up with a fill 2pt shorter than the height its own
 * table stated, on both platforms at once.
 */
export const PLOT_FILL = SPINE.plot - SPINE.slot - SPINE.gap;

/**
 * The pen, the paper, and the box waiting for tonight.
 *
 * Names, not values, for the same reason `PROGRESS_COLOUR` holds names: the web resolves
 * them through the generated stylesheet and the phone through `theme`, and a hex written in
 * a component is a hex that cannot follow the table.
 */
export const SPINE_COLOUR = {
  mark: 'markCrossOff',
  track: 'strokeHairline',
  slot: 'strokeSignal',
} as const;

export interface SpineColumn {
  /** 0–11, January first. */
  month: number;
  episodes: number;
  /** Points of fill, bottom-anchored. Zero for a month with nothing in it. */
  height: number;
  /** The one cell waiting for tonight. True on exactly one column in the whole spine. */
  open: boolean;
}

/**
 * The busiest month anywhere on the spine, which is what every row is drawn against.
 *
 * Across all years, not per year, and that is the decision. Per-year scaling makes a year
 * with four watches look like a year with four hundred — every row normalised to its own
 * maximum draws the same picture, which is the one thing an almanac must not do. The cost is
 * that a single enormous month flattens every other row, and it is paid: a decade in which
 * one month was ten times the rest is a decade that looked like that.
 *
 * Zero when there is nothing yet, and callers hand that straight to `spineColumns`, where a
 * zero scale draws every month at nothing — which is correct, and is the first-run picture:
 * an empty almanac with one cell open in it.
 */
export function spineScale(years: readonly { months: readonly number[] }[]): number {
  let most = 0;
  for (const year of years) for (const count of year.months) if (count > most) most = count;
  return most;
}

/**
 * Twelve counts in, twelve columns out.
 *
 * `openMonth` is the month the open cell belongs to, or `undefined` on every row that is not
 * the current year. It is passed in rather than derived from `now` here because *which row
 * is the current year* is a fact about the spine and not about a column, and deriving it
 * twice is how two renderers come to disagree about which year tonight belongs to.
 */
export function spineColumns(
  months: readonly number[],
  busiest: number,
  openMonth?: number,
): SpineColumn[] {
  return Array.from({ length: SPINE_MONTHS }, (_, month) => {
    const episodes = months[month] ?? 0;
    return {
      month,
      episodes,
      height: fillHeight(episodes, busiest),
      open: month === openMonth,
    };
  });
}

/**
 * Points of ink for one month.
 *
 * Rounded, because a fractional point is a blurred edge on the one shape whose whole job is
 * to be a crisp mark, and `border.icon` carries the same argument at 1.5 against 1.75.
 */
function fillHeight(episodes: number, busiest: number): number {
  if (episodes <= 0 || busiest <= 0) return 0;
  const scaled = Math.round((episodes / busiest) * PLOT_FILL);
  return Math.min(PLOT_FILL, Math.max(SPINE.floor, scaled));
}

/**
 * Which month a year is remembered by — the tallest block, ties to the earliest.
 *
 * The one thing the picture says that the figures beside it do not, and therefore the one
 * thing the row's alt text has to carry (`COPY.stats.spineYear`). It is here rather than at
 * two call sites for the reason `spineColumns` is: `indexOf(Math.max(...))` resolves a tie
 * to the earliest month and `reduce` written the other way resolves it to the latest, and a
 * year with two identical months would then be announced differently on the two platforms
 * with neither side wrong.
 *
 * `-1` when nothing was watched, which is the caller's cue to use `spineYearNothing`
 * instead — a year with no peak is not a year whose peak is January.
 */
export function spinePeak(months: readonly number[]): number {
  let peak = -1;
  let most = 0;
  for (let month = 0; month < SPINE_MONTHS; month++) {
    const count = months[month] ?? 0;
    if (count > most) {
      most = count;
      peak = month;
    }
  }
  return peak;
}

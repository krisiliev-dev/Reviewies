/**
 * What Discover can be narrowed by, decided once for both platforms.
 *
 * `docs/design/architecture.md` section 6. The finding was *"both need filters — genre, runtime,
 * seasons, rating, anything"*, and the honest answer is not "anything": it is whatever the
 * metadata boundary actually carries for a row on a *list*. Two of the four named are
 * refused on a measurement and the refusal is written down (`architecture.md` section 7.2), which
 * is the difference between a filter that is missing and a filter that was decided against.
 *
 * ## Why this is in the core rather than on the screen
 *
 * The same reason `choice.ts` is. Two platforms draw the same three controls, and a
 * predicate typed out twice is two predicates: the phone and the web would agree about the
 * chips and disagree about what pressing one does, which is precisely the class of drift
 * `offers.test.ts` was written after four screens had already done it.
 *
 * ## What is deliberately not here
 *
 * The **sort**. A shelf is browsed in the order the provider thinks is interesting, and a
 * sort control is a second dimension on a surface whose finding was that it had too many
 * already. The filter says what is on the shelf; nothing says what order it is in.
 */
import type { SearchResult } from '../metadata/provider.ts';

/**
 * The line between "well rated" and everything else, out of ten.
 *
 * 7.5 rather than 7 or 8, measured against what the provider actually returns: TMDB's
 * `vote_average` clusters hard between 6.5 and 8.0 for anything with enough votes to have
 * an average at all, so 7 keeps almost everything and 8 keeps almost nothing. A filter that
 * changes nothing and a filter that empties the screen are the same useless control.
 *
 * The fixture set is spread across it on purpose — three above, two below — so the design
 * harness can photograph the control doing something.
 */
export const WELL_RATED = 7.5;

/** The kinds a shelf can be narrowed to. `any` is the resting state, not a value. */
export type KindFilter = 'any' | 'show' | 'film';

/** How highly the crowd thinks of it. Two values, because a slider is a fifth control. */
export type StandingFilter = 'any' | 'well-rated';

export interface Filters {
  kind: KindFilter;
  /**
   * A genre name, or `any`. One at a time.
   *
   * Single rather than multiple, and `choice.ts` is the reason: selection there is a rule
   * and a step in the ink — a radio — and a multi-select wearing that shape would be the
   * §6.95 confusion the whole component exists to have stopped. One genre answers the
   * question somebody actually arrives with ("something funny"), and the second genre is
   * how a filter row becomes a query builder.
   */
  genre: string;
  standing: StandingFilter;
}

/** Nothing narrowed. The state the screen opens in and the state "Clear" returns it to. */
export const NO_FILTERS: Filters = { kind: 'any', genre: 'any', standing: 'any' };

/** Whether anything is narrowed, which is what decides if the row says so when shut. */
export function filtering(filters: Filters): boolean {
  return filters.kind !== 'any' || filters.genre !== 'any' || filters.standing !== 'any';
}

/**
 * The genres on offer, taken from what is actually on the shelf.
 *
 * Not a fixed list. TMDB's genre table has forty rows and a shelf of twenty titles uses
 * six of them, so a fixed list is thirty-four chips that empty the screen — the failure
 * mode `WELL_RATED` names above, thirty-four times over. Derived from the rows in hand, so
 * every chip on screen has something behind it.
 *
 * Sorted by name rather than by how many rows carry it: frequency order means the chips
 * move between one shelf and the next, and a control whose options reorder under you is
 * one you have to read every time. §6.140's argument for a fixed tab order, one control
 * down.
 */
export function genresOf(results: readonly SearchResult[]): string[] {
  const found = new Set<string>();
  for (const result of results) for (const genre of result.genres ?? []) found.add(genre);
  return [...found].sort((a, b) => a.localeCompare(b));
}

/**
 * Whether one row survives the filter.
 *
 * A row with **no** genres survives a genre filter only when the filter is `any`. That is
 * the deliberate half: an unmatched import has no genres and never will until it is
 * matched, and quietly keeping it under "Comedy" would be the app inventing a fact about
 * somebody's library. It drops out, and the empty state says the filter is why.
 */
export function keeps(filters: Filters, result: SearchResult): boolean {
  if (filters.kind !== 'any' && result.kind !== filters.kind) return false;
  if (filters.genre !== 'any' && !(result.genres ?? []).includes(filters.genre)) return false;
  if (filters.standing === 'well-rated' && !(result.rating !== undefined && result.rating >= WELL_RATED)) {
    return false;
  }
  return true;
}

/** The whole shelf, narrowed. */
export function applyFilters<T extends SearchResult>(filters: Filters, rows: readonly T[]): T[] {
  return rows.filter((row) => keeps(filters, row));
}

/**
 * The listing row: full bleed, ruled, one target and one action.
 *
 * Nine routes carry ten of these and the web carries its own copies, all built the same
 * way and none of them agreeing: a rounded fill in `ground.raised` with a gutter round it,
 * a poster, a title, a meta line, and however many controls the screen felt like. The
 * direction's objection is that **every card in this build is a rounded fill doing a
 * rule's job** — thirty-nine `backgroundColor` declarations that exist to separate one row
 * from the next, which is what a one-point rule is for.
 *
 * **The accessibility contract is the load-bearing part, and it is not a style rule.**
 * A row is not one control. It exposes *at most one navigation target and one action*, and
 * every name carries what tells that row from its neighbours — because a screen of rows is
 * the same two words repeated down the page, and a screen reader reads the control, not
 * what is above it. The codebase learned this three separate times in comments before
 * anything enforced it, and §6.96's name-collision clause then found four live violations
 * in a single run. `calendar.tsx` is the one the design doc named and it is still wrong
 * today: the whole entry is a single `Pressable` labelled `Open {name}`, so the episode
 * code and the episode name are announced twice or not at all.
 *
 * So `open.name` is a required string, and a row with no `open` is not pressable at all —
 * a card that navigates without saying where is worse than a card that does not navigate.
 */
import { border, size, space } from '../tokens.ts';

/**
 * `listing` is the full-bleed row; `index` is the More screen's contents line.
 *
 * Two, not five: the shapes that differ are the ones with a poster and the ones without,
 * and `lead` already says which of those a row is.
 */
export type RowDensity = 'listing' | 'index';

/**
 * The rule, and the two heights.
 *
 * 66 with a poster because that is the poster (64 tall at the row size) plus the hairline;
 * `size.target` without one, because a row you can press is a control and 44 is the floor.
 * The rule is on the *bottom*, so a list ends on one and a screen does not need to know
 * whether a row is the last.
 */
export const ROW = {
  rule: border.hairline,
  colour: 'strokeHairline',
  minHeight: { listing: 66, index: size.target },
  padY: space.s8,
  gap: space.s12,
  /**
   * The lead's box comes from `POSTER_SIZE.row` now, not from here.
   *
   * It said 44 x 64 while `minHeight.listing` two lines above says 66 — which is the 2:3 of
   * 44 that `ratio.poster` has specified all along and that nothing had ever read. So every
   * listing row in the app carried a two-point strip of dead ground under its artwork.
   */
} as const;

/**
 * The ink, in one place, so the twenty rows stop each picking their own.
 *
 * `struck` is the *result* of a cross-off, not the control: the title page shows struck
 * rows for episodes marked on another device, with no animation and no undo window.
 * `CrossOff` owns the control and exports the ink step; a row that spelled out its own
 * would be free to pick a different colour, which `crossOff.test.ts` already forbids.
 */
export const ROW_INK = {
  title: 'ink',
  meta: 'inkSecondary',
  tag: 'inkSecondary',
  /** Unaired, unavailable, not yet. Never a fade — see `Button` and `Key`. */
  disabled: 'inkTertiary',
} as const;

/**
 * Where the row goes, or what it does — and what to call it.
 *
 * The *name* is required: a navigation target with no name is the `calendar.tsx` defect,
 * and a name without what distinguishes the row is the §6.96 collision — "Open Andor"
 * twice on one screen, once for the poster and once for the words.
 *
 * **`to` or `run`, never both and never neither.** That union is the whole of it: `to` is
 * a destination and the row is a link; `run` is a callback and the row is a button. Both
 * renderers read the role off which field is set, so the same row is announced the same
 * way on both platforms, and a row that goes nowhere and does nothing is a compile error
 * rather than a dead row.
 *
 * ## This replaced a second way of saying it, which disagreed with the first
 *
 * The union lived in `app/src/ui/Row.tsx` and the phone had a separate `does?: 'navigate'
 * | 'act'` here, defaulting to `navigate`. The phone's `open` only ever carried `run`, for
 * both meanings — eight call sites passed `run: () => router.push(…)` — so it could not
 * tell them apart and needed the flag; the web could, and ignored it.
 *
 * Two fields for one fact, read by different halves of the product: **a row with `run`
 * and no `does` was a button on the web and a link on the phone**, and §6.134 hit exactly
 * that on the calendar, where the phone announced the notification panel as somewhere to
 * go. Adding the flag fixed that row. #170 asked whether the flag should exist, and the
 * answer was in the eight call sites: a route pushed inside a closure is a **destination
 * hidden in a callback**. Handing the route to the contract as data lets the shared type
 * carry the distinction the way the web always did, and the flag has nothing left to say.
 *
 * What each platform does with `to` is still the platform's own: React Native pushes the
 * route, the DOM renders a real `<a href>` so that middle-click, copy-link and
 * open-in-new-tab keep working — a router push behind an `onClick` silently takes all
 * three away.
 */
export type RowOpen = { name: string } & (
  | { to: string; run?: never }
  | { run(): void; to?: never }
);

/**
 * How a tag is drawn, which is `Section`'s rule and was not being applied here.
 *
 * `section.ts` states it in a table — *case: uppercase, tracking: `t83`* against *case: as
 * written, tracking: none* — and gives the reason: "a single-channel difference is the one
 * that gets flattened again by the next person tuning a value". The two go together.
 *
 * `Row`'s tag takes `t83` on both platforms and left the case to the caller, so the
 * calendar's chips were tracked sentence case: the exact pairing that table rules out,
 * photographed for the first time in §6.146 when a milestone finally reached the screen.
 *
 * Applied in the component rather than asked of the caller, because "shout it yourself"
 * is what the four hand-typed sites were already doing and the fifth and sixth did not.
 */
export function rowTag(value: string | undefined): string | undefined {
  return value ? value.toUpperCase() : undefined;
}

export interface RowContract {
  title: string;
  /** `S02·E07`, or a year. Set through `Data` once that exists. */
  code?: string;
  /** The episode name, or `Series · 2021`. */
  meta?: string;
  /**
   * The row's own third line, in words: `17 more episodes`, `Last one`.
   *
   * It exists because of what happened without it. Sprint 14 moved Up Next's remaining
   * count into `tag`, where it had to become `17 MORE` to fit — a number with its unit
   * shortened away, which is exactly the vague badge the count was written to replace
   * ("a count, not a vague NEW badge" is the oldest comment on that line, and the most
   * repeated complaint on Trakt's roadmap). The slot a sentence does not fit in is not
   * the slot for it, and a migration is not licence to rewrite what a screen says.
   */
  count?: string;
  /**
   * `Airs Fri`, `Season finale`. Two words at most, and never a shortened sentence.
   *
   * Written as it reads and **drawn** in upper case — `rowTag` below, applied by the
   * component. Six call sites decided the case for themselves before that: four typed
   * `'SERIES'`, `'FILM'`, `'NOT YET'` by hand and the two calendars passed
   * `KIND_LABEL[kind]`, which is sentence case because those words are also a sentence
   * elsewhere. So the chip read *Season finale* on one screen and *SERIES* on another.
   * §6.148.
   */
  tag?: string;
  /** The watchlist's "why you saved it" — somebody's own words, and set in italic to say so. */
  note?: string;
  /** At most one. Omit and the row is text, not a control. */
  open?: RowOpen;
  struck?: boolean;
  /** Unaired. Tertiary ink and a tag, never an opacity. */
  disabled?: boolean;
  density?: RowDensity;
}

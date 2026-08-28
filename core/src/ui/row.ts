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
 * That the row goes somewhere, and what to call it.
 *
 * The *name* is the shared rule and it is required: a navigation target with no name is
 * the `calendar.tsx` defect, and a name without what distinguishes the row is the §6.96
 * collision — "Open Andor" twice on one screen, once for the poster and once for the
 * words.
 *
 * *How* it navigates is not shared, and pretending otherwise put a no-op `run` in the
 * first web call site to satisfy a field the renderer never called. React Native pushes a
 * route; the DOM wants a real `<a href>` so that middle-click, copy-link and
 * open-in-new-tab keep working — a router push behind an `onClick` silently takes all
 * three away. So each renderer extends this with its own, and the type makes leaving it
 * out a compile error rather than a dead row.
 */
export interface RowOpen {
  name: string;
  /**
   * Whether pressing the row goes to that thing or does something to it.
   *
   * Almost every row navigates, so that is the default. `act` is for the row that is a
   * choice: MatchImports offers three candidate posters for an imported show and pressing
   * one *is* the answer — nothing is opened. The web already told these apart by accident,
   * because a row with no URL is a `<button>` there either way; the phone did not, and
   * would have announced "link" for the control that resolves an import.
   *
   * It lives in the shared contract rather than in each renderer because it is a fact
   * about the row, not about a platform: the same press means the same thing on both.
   */
  does?: 'navigate' | 'act';
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
  /** `AIRS FRI`, `SEASON FINALE`. Two words at most, and never a shortened sentence. */
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

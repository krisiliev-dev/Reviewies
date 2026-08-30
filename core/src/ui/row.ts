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
import { border, leading, size, space } from '../tokens.ts';

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

/**
 * And it is **not drawn in a box**, which is the other half of the same rule.
 *
 * Both renderers wrapped the tag in `rounded-plate` and a `strokeHairline` rule, so
 * `SEASON FINALE` on the calendar was a hairline-outlined chip — the same shape as
 * `Choice`'s unselected option and the same shape as a `secondary` `Button`. One drawn
 * form for three different things: a **fact** about the row, a **choice** you can make,
 * and an **action** you can take. What told them apart was `strokeHairline` against
 * `strokeSignal`: one token, at 12px, in caps.
 *
 * That is precisely the failure the paragraph above quotes `section.ts` for — *"a
 * single-channel difference is the one that gets flattened again by the next person tuning
 * a value"* — with this file relying on the thing it cites as unreliable. §6.167 had
 * already settled the principle one screen over, taking the box off a streaming service's
 * name: **no box means no shape to be misread as a control**, because a box is `Choice`'s
 * and `Button`'s. `light-05-calendar.png` is the picture that found the second instance.
 *
 * Nothing is lost by removing it. Upper case and `t83` already say "label, not prose" —
 * that is what `rowTag` is for, and what `NEXT TWO MONTHS` and `MOST WATCHED` on the same
 * two screens are drawn as, unboxed, and read perfectly well.
 */
export const ROW_TAG = {
  /** Upper case and tracked, as `rowTag` applies. */
  tracking: 't83',
  ink: 'inkSecondary',
  /** Written as an absence, the way `TOGGLE.off` is, so nobody re-adds it by accident. */
  rule: null,
} as const;

/**
 * How many lines each of a row's four text slots gets before it truncates.
 *
 * §6.179 found the two renderers disagreeing about exactly one of them: the phone gave
 * `note` `numberOfLines={2}` and the web gave it Tailwind's `truncate`, which is one line
 * with no argument about it. Every other slot agreed at one — by accident rather than by a
 * table, because nothing said what the numbers were, so nothing could notice that one had
 * come apart.
 *
 * ## Why `note` is the one that gets two
 *
 * It is the only slot holding a **sentence**. The title is a name, the meta is
 * `Series · 2005`, the count is a number; those are labels, and a label that wraps makes a
 * list of rows scan worse. `note` is Discover's *"Because you track It's Always Sunny in
 * Philadelphia"* and the watchlist's *"why you saved it"* — prose, in italic, and often the
 * reason the row is there at all. §6.51 gives it to the phone's version.
 *
 * ## What no photograph shows
 *
 * The difference is invisible in the design record: the longest `because` sentence the real
 * library produces fits on one line at 390, so `r4-discover.png` looks the same either way.
 * Found by reading the two renderers side by side rather than by looking at them, which is
 * the argument for the table rather than for another screenshot.
 */
export const ROW_LINES = {
  title: 1,
  meta: 1,
  count: 1,
  note: 2,
} as const;

/**
 * The one slot that states its own line box, and the measurement that says why.
 *
 * Every text in a row used to take whatever line height its **face** declares, because
 * neither renderer said anything: the phone set no `lineHeight` at all and the web set no
 * `leading-`. That is not "no line box" — `normal` is the font's own, ascent plus descent
 * plus line gap — so the answer was being given four times over by four foundries. Measured
 * out of the six `.ttf`s this app bundles, as a fraction of the em:
 *
 * | face | slot | its own line box |
 * | --- | --- | --- |
 * | Archivo Narrow SemiBold | `title`, `tag` | 1.347 em |
 * | Archivo Regular | `meta`, `count` | 1.088 em |
 * | Newsreader Italic | `note` | **1.000 em** |
 * | IBM Plex Mono Medium | — | 1.300 em |
 *
 * For a slot `ROW_LINES` gives **one** line that is fine and this table deliberately says
 * nothing about it: a one-line box only has to hold one line's glyphs, and all four faces
 * do, with room. Measured in `design/measure.mjs`'s census on the export at 100% and at
 * 357.1% — iOS's largest Dynamic Type step, `RCTAccessibilityManager.mm`'s 3.571 — where a
 * title's ink clears the bottom of its box by 2.0pt and 10.0pt respectively (0.14 and 0.20
 * em), and where nothing a row draws passes its box at either end. Read straight out of the
 * font tables it is stronger still: **not one** of Archivo Narrow SemiBold's 657 mapped
 * glyphs reaches below its own box, and not one of Newsreader Italic's 564.
 *
 * `note` is the exception because `ROW_LINES` gives it **two**, and a two-line box has a
 * second job: keeping line 2's ascenders off line 1's descenders. Newsreader's box is
 * exactly 1.000 em — 1470 up and 530 down on a 2000 unit em, which sums to the em itself —
 * and its Latin-1 ink spans 1.1845 em from the top of `ĺ` to the foot of `f`. Set solid,
 * consecutive lines overlap by up to **0.185 em**: 2.2pt at `s12`, and 7.9pt for a reader at
 * the largest step, where it is the width of a stroke. It is the only multi-line run in
 * either app with no leading of its own, and it is the slot that holds a **sentence** —
 * Discover's *"Because you track…"*, the watchlist's *"why you saved it"* — which is exactly
 * where two lines are ordinary rather than rare.
 *
 * ## Why a table and not a number at each site
 *
 * The same reason `ROW_LINES` above is one. The web inherited a leading of about 1.5 from
 * the document and the phone inherited 1.000 from the face, so the identical italic sentence
 * was set two different ways in one component and **nothing could notice**, because nothing
 * said what the number was. That is §6.179's finding one property along from the one it
 * fixed, and this is the statement that lets a clause hold the two renderers to it.
 *
 * ## And it may never go below the face's own box
 *
 * `l143` is above all four boxes above, which matters more than it looks. React Native sets
 * `paragraphStyle.minimumLineHeight` **and** `maximumLineHeight` to the stated value
 * (`RCTTextAttributes.mm:140–143`), so a leading *below* a face's own box does not loosen or
 * tighten the setting — it clamps the line and iOS crops the glyphs that no longer fit,
 * bottom first, by a fraction of the em that grows with the point size. `react-native-web`
 * emits a CSS `line-height` and lets the glyphs overflow in plain sight, so the export every
 * suite here drives cannot show it. `app/src/ui/lineBox.test.ts` is what does.
 */
export const ROW_LEADING = {
  note: 'l143',
} as const satisfies Record<string, keyof typeof leading>;

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

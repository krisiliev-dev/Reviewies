/**
 * Every value the interface is drawn from, in one place.
 *
 * `copy.ts` owns the words for the same reason this owns the numbers: a screen exists
 * twice, so anything not owned drifts. The colour half already proved it — `theme.ts`
 * says it is "carried over from the web app so the two do not drift apart" and six of
 * its seven values had drifted anyway, which is what `palette.test.ts` was written to
 * notice. Noticing drift is weaker than not having two copies.
 *
 * Below the colour layer there was nothing at all. A census of the phone found 222
 * `fontSize` literals (82 of them 14 or 15, one point apart and carrying no distinction),
 * 324 spacing literals across twenty values, three `zIndex` numbers, and no `fontFamily`
 * anywhere. The type layer did not exist; the space layer existed as folklore.
 *
 * ## No imports, deliberately
 *
 * Same rule as `copy.ts`. Guards read this file as text as well as importing it, and a
 * token file that can reach the database is a token file that will one day be asked to.
 * Where a value must agree with one held elsewhere — `linger.reaction` against
 * `REACTION_VISIBLE_MS` — a guard checks the two are equal rather than one importing the
 * other.
 *
 * ## Names are magnitudes, not uses
 *
 * `space.s12`, not `space.gutter`. This codebase has been bitten twice by a semantic
 * name that stopped being true: `signInToMake('Data tab')` outlived the Data tab by two
 * sprints, and `theme.ts`'s own header outlived its accuracy. A name that describes size
 * cannot become a lie.
 *
 * Specified in `docs/design/tokens.md`, which carries the reasoning and every computed
 * contrast ratio. Change that document first.
 */

/*
 * Watching Mode pins to `dark` whatever the theme is — the direction is explicit that
 * the phone stops being a lit rectangle in your peripheral vision while the television
 * is on. Expressed as a lookup rather than left to inheritance.
 *
 * There was a `Theme` union here and nothing reached it, so it is gone until something
 * does: `coreWiring` refuses an export with no caller, and a type exported in
 * anticipation is the same debt as a function.
 */

const dark = {
  ground: '#131114',
  groundRaised: '#1C191E',
  groundWell: '#0C0B0D',

  ink: '#F4EFE7',
  inkSecondary: '#B3A9A0',
  inkTertiary: '#8A8079',

  /**
   * Separators, never meaning. Both sit far below 3:1 on purpose — they are the depth
   * system, and depth is decoration.
   */
  strokeHairline: '#332E36',
  strokeEmphasis: '#4A434E',
  /**
   * The stroke that identifies a control or a state, aliased to the tertiary ink so it
   * clears WCAG 1.4.11 at 4.51 in the worst case.
   *
   * A correction to the direction rather than a transcription of it. Five state-bearing
   * marks were specified in the hairline colour — the empty-slot outline, the crosshair,
   * the NO SIGNAL hatch, the outlined Watchlist button, the search field's border — and
   * at 1.42:1 none of them exists as far as the standard is concerned. Two live defects
   * are the same mistake: `RemoteDrawer.tsx` drew its handle at 1.21:1, which is why a
   * 24pt handle has been on screen for sprints and every reviewer reported the drawer as
   * having no affordance; the tab bar's top rule was 1.41:1.
   */
  strokeSignal: '#8A8079',

  /** The one most consequential action on a screen. Maximum one. */
  actionFill: '#F4EFE7',
  actionLabel: '#131114',

  /** Amber, and its one job: this is happening, or you did this. */
  workingFill: '#F0A93B',
  workingOnFill: '#131114',
  workingMark: '#F0A93B',

  /** Failure and destructive only, so red always means something. */
  trouble: '#F2585C',
  troubleOn: '#131114',

  /** The pen. Pencil in dark, biro in light. */
  markCrossOff: '#8A8079',

  /**
   * Watching Mode's auto-dim, as a palette rather than an opacity.
   *
   * An `opacity: 0.75` is invisible to a contrast test for ever; a named colour is not.
   * There is deliberately no tertiary and no trouble here — at 75% they come out at 3.34
   * and 3.75, and 80% does not rescue them either. Those two roles hold at full strength
   * or they are not on that screen.
   */
  dimInk: '#BAB6B1',
  dimInkSecondary: '#89827B',
  dimWorking: '#B78230',

  /**
   * Two rings, because one does not work. A near-white ring around a near-white pill is
   * 1.00:1; a 2pt inner ring in the ground restores it to 16.41.
   */
  focusRing: '#F4EFE7',
  focusInset: '#131114',
} as const;

const light = {
  ground: '#F5F0E8',
  groundRaised: '#FFFDF8',
  groundWell: '#E9E2D6',

  ink: '#191419',
  inkSecondary: '#5C5349',
  inkTertiary: '#6E6456',

  strokeHairline: '#D6CCBC',
  strokeEmphasis: '#A99C88',
  strokeSignal: '#6E6456',

  actionFill: '#191419',
  actionLabel: '#F5F0E8',

  workingFill: '#F0A93B',
  workingOnFill: '#191419',
  /**
   * Amber holds as a fill in light and fails as a *mark*: #F0A93B on #F5F0E8 is 1.77:1.
   * The split is not cosmetic, and a guard checks the reason for it as well as the fact
   * of it, so it cannot be quietly collapsed once somebody forgets why it is here.
   */
  workingMark: '#8A5A08',

  trouble: '#B3272B',
  troubleOn: '#F5F0E8',

  markCrossOff: '#2F3F86',

  dimInk: '#BAB6B1',
  dimInkSecondary: '#89827B',
  dimWorking: '#B78230',

  focusRing: '#191419',
  focusInset: '#F5F0E8',
} as const;

/**
 * Eight, hash-indexed by title id — `label[hash(titleId) % 8]`, no runtime colour maths.
 *
 * Quoted in the direction against `ground`; a spine's band sits on `raised`, which is the
 * tighter test and the one the guard uses. The floor is blue at 3.47 in dark and yellow
 * at 3.54 on `well` in light. Never text: three of them do not clear 4.5.
 */
const labelDark = [
  '#D9A521', '#3E9EA8', '#4F8F55', '#B65C93',
  '#C24A45', '#4A6FB0', '#C97A3E', '#77808C',
] as const;

const labelLight = [
  '#9A6E10', '#26707A', '#37693C', '#8E3F70',
  '#A93B37', '#3A568C', '#9C5A26', '#5A6470',
] as const;

export const color = { dark, light } as const;
export const label = { dark: labelDark, light: labelLight } as const;

/**
 * Ten steps on a 2pt base.
 *
 * Covers what the build already uses most — 8 (62 sites), 12 (55), 16 (42), 6 (24) — and
 * kills the four that carry no distinction: 10 (47), 14 (36), 18 (7), 40 (6).
 */
export const space = {
  s2: 2, s4: 4, s6: 6, s8: 8, s12: 12,
  s16: 16, s20: 20, s24: 24, s32: 32, s48: 48,
} as const;

/**
 * Seven steps, chosen the way `space` was: cover what the build already uses most and
 * kill the ones carrying no distinction.
 *
 * The census, both platforms together — the phone's `fontSize` literals and the web's
 * `text-*` classes resolved to pixels:
 *
 *   14  158 sites      16   12          26   1
 *   12  102            18   10          22   3
 *   13   25            30    9          17   3
 *   24   21             8    8 (10px)    9   2
 *   15   19            20    7
 *   11   17
 *
 * Fifteen sizes. What goes: **13 and 15**, which sit one point either side of 14 and
 * account for 44 sites between them — this file's own header has complained about that
 * pair since the day it was written. Then 17 (beside 16), 18 and 22 (beside 20), 26
 * (beside 24), and 10 and 9, which fold up into 11 rather than down out of legibility.
 *
 * What stays is what the two platforms already agree on: 12 and 14 are most of the app,
 * 24 is every screen title on the web and 30 is every screen title on the phone — which
 * is the first thing this layer is for. Same role, six points and a weight apart, and
 * until now nothing could even state that they were the same role.
 *
 * Magnitudes, not uses, for the reason in the header: `text.s14`, never `text.body`.
 */
export const text = {
  s11: 11, s12: 12, s14: 14, s16: 16, s20: 20, s24: 24, s30: 30,
} as const;

/**
 * Four, which is what the build uses: 500 once, 600 forty-five times, 700 eighteen, and
 * 400 wherever nothing was said.
 *
 * Strings because React Native's `fontWeight` is a string union and CSS takes either;
 * one spelling that works in both places beats two that agree by hand.
 */
export const weight = {
  regular: '400', medium: '500', semibold: '600', bold: '700',
} as const;

/** Floors, not rhythm, which is why they sit outside the scale. */
export const size = { target: 44, tap: 24 } as const;

export const ratio = { poster: 2 / 3, still: 16 / 9 } as const;

/**
 * Three. Printed images have square corners; every card in the shipping build is a
 * rounded fill doing a rule's job.
 */
export const radius = { none: 0, plate: 2, pill: 999 } as const;

/**
 * `hairline` is the whole depth system. `icon` is 1.5 rather than the direction's 1.75,
 * which lands on 3.5px at 2x and 5.25px at 3x — both non-integer, both fuzzy on exactly
 * the 24pt glyphs it is meant to sharpen. Named as a deviation rather than smuggled.
 */
export const border = { hairline: 1, mark: 2, tally: 3, icon: 1.5 } as const;

/**
 * There are no elevation tokens, and that is the token.
 *
 * Three ground steps and a hairline. On a near-black ground a drop shadow is invisible
 * and the fill is pure cost. The build already agrees — zero shadow props exist today —
 * so this is the one layer whose guard protects a property the code has rather than one
 * it must acquire.
 */
export const elevation = { sunken: 'groundWell', base: 'ground', raised: 'groundRaised' } as const;

export const duration = {
  instant: 0, tick: 100, rule: 160, spine: 180, drawer: 200, crossOff: 220,
} as const;

/**
 * A parallel table with the same keys, never a ternary at the call site.
 *
 * `RemoteDrawer.tsx` wrote `duration: reduced ? 0 : 200`, which puts the accessibility
 * decision in every component and makes forgetting it invisible until somebody with the
 * setting on opens that screen — the identical failure `phoneTextScaling.test.ts` exists
 * for. A guard asserts every key here has a key there.
 *
 * `spine` is 100 rather than 0: a cross-fade is not travel. Reduced motion removes
 * travel, never information.
 */
export const reduced = {
  instant: 0, tick: 100, rule: 0, spine: 100, drawer: 0, crossOff: 0,
} as const;

export const stagger = { rule: 40 } as const;
export const reducedStagger = { rule: 0 } as const;

/**
 * Not motion, and deliberately without a reduced counterpart.
 *
 * The undo window and the prompt dismissal are WCAG 2.2.1 timing, not 2.3.3 animation.
 * Shortening them under Reduce Motion would take the safety net away from the people
 * most likely to need it. A guard asserts no key here appears in `reduced`.
 *
 * `reaction` must equal `REACTION_VISIBLE_MS` in `core/src/watching/reactions.ts`. Not
 * imported — checked, the same shape as the copy guard checking `UPCOMING_DAYS` against
 * the words "two months".
 */
export const linger = {
  undo: 6000, promptDismiss: 6000, dimAfter: 8000, reaction: 4000,
} as const;

export const easing = {
  /** No overshoot, so it never reads like glass. */
  paper: 'cubic-bezier(0,0,.2,1)',
  /** Linear, where the argument is physical: a reaction drifting past, not at, you. */
  tape: 'linear',
} as const;

/**
 * 40, 45 and 50 are lifted verbatim from `RemoteDrawer.tsx` — handle, scrim, drawer, in
 * that order, already correct. The rest names layers the app has and never numbered.
 *
 * `undo` sits above `drawer` because the six-second chip has to be reachable from inside
 * Watching Mode with the drawer open; `banner` on top because it is the thing that says
 * the app could not do what you asked.
 */
export const z = {
  base: 0, sticky: 10, tabBar: 20, sheet: 30,
  drawerHandle: 40, drawerScrim: 45, drawer: 50,
  undo: 60, dialog: 70, banner: 80,
  /**
   * Above the banner, and only ever while focused. If a skip link can be covered then
   * a keyboard user cannot see where focus went, which is the one thing it exists for.
   */
  skipLink: 90,
} as const;

/*
 * There is deliberately no aggregate `tokens` object. One was written and nothing
 * imported it — every caller wants two or three names, not the bag — and `coreWiring`
 * refuses an export nothing reaches. Two ways to ask for the same thing is how a second
 * one drifts.
 */

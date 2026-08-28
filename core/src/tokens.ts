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
  s12: 12, s14: 14, s16: 16, s20: 20, s24: 24, s30: 30,
} as const;

/*
 * Six, not the seven this started as. `s11` went when the last site that could have wanted
 * it — the tab bar's own label, at 10 — folded to `s12` instead: 11 had no call site, and
 * Tailwind v4 is JIT, so a step nothing names is a utility that does not exist in the
 * stylesheet. A scale is what the interface is drawn from, not a range somebody might need.
 */

/**
 * Six families, and the eight files behind them.
 *
 * `docs/design/direction.md` chose them and `docs/design/tokens.md` costed them; this is
 * where they become real. Two things in those documents did not survive contact:
 *
 * **Archivo Expanded is not a face.** The direction's own refusal 2 says so — it is a named
 * instance of a variable font, React Native cannot set variable axes, and instancing it out
 * needs a build step this repo does not have. `display` is Archivo Narrow 700 tracked out,
 * which is what the refusal prescribes.
 *
 * **The Japanese faces cost 4.36 MB of a 4.94 MB set.** Measured, after fetching all eight:
 * the two IBM Plex Sans JP files are 88% of the weight, and either one alone is larger than
 * the spec's estimate for the whole set (1.2–1.8 MB). So `jp` resolves to the platform's own
 * Japanese face rather than bundling one. The direction's argument for bundling is that "a
 * font over the network is a font that fails on a plane" — a *system* font fails on no
 * plane, and the six Latin faces bundle at 587 KB. What is given up is the exact match with
 * Archivo Narrow that graft 8 asked for; what is bought is not shipping four and a third
 * megabytes of Japanese to somebody whose library is in English. Reversible: put the two
 * files back and change this table.
 *
 * A weight is a file. React Native will not synthesise one for a named family, and once
 * `fontFamily` is set `fontWeight` is ignored on Android and faux-synthesised on iOS — so
 * Narrow 600 and Narrow 700 are two families here, not one family and two weights.
 *
 * ## The weight belongs to the face, which is why it is written here
 *
 * Each entry carries the weight of its own file, and that has consequences on both sides.
 *
 * **The phone must not say it.** A `fontWeight` beside a `fontFamily` is ignored on Android
 * and, on iOS, asks the system to synthesise a weight on top of a file that already has one
 * — a smeared heading that no simulator screenshot on a Mac would show as wrong. Sixteen
 * sprints of migrated styles carried the pair; they do not any more, and `faces.test.ts`
 * fails on the next one.
 *
 * **The web must say it, and must say this one.** A browser has no such excuse but it does
 * have inheritance: `font-title` on a bare `<h2>` inherits the user-agent's 700 and picks
 * `ArchivoNarrow-Bold` out of the same stack, which is the wrong file with nothing to show
 * for it. So a face class is only ever written with the weight named here, and `font-body
 * font-semibold` — a 600 Archivo that is not in the bundle, drawn as a browser's fake bold
 * — is a build failure rather than something to notice in a screenshot.
 */
export const type = {
  family: {
    /** Mastheads. Archivo Narrow 700, tracked out — the direction's refusal 2. */
    display: { name: 'ArchivoNarrow-Bold', weight: '700', stack: "'Archivo Narrow', Archivo, ui-sans-serif, system-ui" },
    /** Section heads and metadata, the tracked caps this design is made of. */
    title: { name: 'ArchivoNarrow-SemiBold', weight: '600', stack: "'Archivo Narrow', Archivo, ui-sans-serif, system-ui" },
    body: { name: 'Archivo-Regular', weight: '400', stack: 'Archivo, ui-sans-serif, system-ui' },
    /** Every number, tabular: predictable column widths are what stop S02E07 wrapping. */
    data: { name: 'IBMPlexMono-Medium', weight: '500', stack: "'IBM Plex Mono', SFMono-Regular, ui-monospace" },
    prose: { name: 'Newsreader-Regular', weight: '400', stack: "Newsreader, 'New York', ui-serif" },
    /** Its own family rather than `fontStyle: 'italic'`, for the same reason as the weights. */
    proseItalic: { name: 'Newsreader-Italic', weight: '400', stack: "Newsreader, 'New York', ui-serif" },
    /** Not bundled — see above. The stack names real system faces, not a generic. */
    jp: { name: null, weight: '400', stack: "'Hiragino Sans', 'Noto Sans CJK JP', 'Yu Gothic', sans-serif" },
  },
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

/**
 * Line height, as a ratio of the size.
 *
 * The fifth fact about a type site, and the last one nothing owned. A census of the phone
 * found **nine different (size, line-height) pairs across four sizes** — ratios from 1.10 to
 * 1.57 for what is mostly one role — while the web set no line-height at all and inherited
 * whatever the body had. Nobody chose any of it.
 *
 * `l143` is extracted, not invented: 1.43 is the mode, held by fifteen sites at `s14` where
 * `lineHeight: 20` is written out. It reproduces 20 at 14 and 17 at 12 exactly, which is the
 * most common value at each size. `l120` is the tight setting for a heading or a single-line
 * label, where a reading measure would look loose.
 *
 * A ratio rather than a number, for the same reason tracking is em rather than points: React
 * Native's `lineHeight` is points, so a stored 20 stays 20 while the glyphs double at 200%
 * Dynamic Type and the lines collide. The phone multiplies at the call site; the web emits
 * the ratio and lets CSS do it.
 */
export const leading = { l100: 1, l120: 1.2, l143: 1.43 } as const;

/*
 * Three, and `l100` is not a rounding of the other two. A single glyph — a tick, a play
 * mark, a chevron — has no line box worth the name, and giving it one pushes it off the
 * centre of whatever it is sitting in. The build already knew: five sites wrote Tailwind's
 * `leading-none` and every one of them is a glyph. It is a token now so the *next* one
 * cannot be `leading-tight` instead, which is what three of the other four were.
 */

/**
 * Tracking, in thousandths of an em.
 *
 * The fourth fact about a type site, and the last one nothing owned. The phone writes
 * `letterSpacing: 1` at size 12 in six files — 0.083em, byte-identical, which is where
 * `t83` comes from. The web writes `tracking-wide` at the same eyebrows: Tailwind's own
 * 0.025em, a third of it. Two platforms, one role, three times apart, and no test could
 * see it because neither number had a name.
 *
 * Em, never points, and this is the whole reason the token exists rather than a constant.
 * React Native's `letterSpacing` is points: stored as 1, tracking stays fixed while the
 * glyphs double at 200% Dynamic Type and the caps close into a block. So the phone
 * derives `size x track` at the call site — `tracking(text.s12, track.t83)` — and the web
 * emits em directly, which is what CSS already wanted.
 *
 * Magnitudes, not uses, like everything else here: `t83`, not `t.eyebrow`.
 */
export const track = { t0: 0, t20: 0.02, t83: 0.083 } as const;

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

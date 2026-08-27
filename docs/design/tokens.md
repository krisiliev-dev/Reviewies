# The token layer

One owner for every value the interface uses. Read `docs/design/direction.md` first
for the direction these values express.

I have everything I need: all three directions read in full, all 14 screenshots looked at, the seven tokens, both guards, the copy file, and a census of what the phone actually contains today. Every ratio below I computed myself.

---

# The token layer for Reviewies — Late Edition + the ten grafts

## 0. What the census actually found

Numbers I measured, not repeated:

| | |
|---|---|
| `fontSize:` literals in `mobile/{app,src}/**/*.tsx` | **222** (the brief said 218; no test files are involved, so 222 is the number) |
| …that are 14 or 15 | **82** — exactly as briefed |
| size distribution | 12→50, 14→55, 13→30, 15→27, 11→18, 16→14, 30→6, 10→5, 17/18/20→4 each, 22→3, 9→1, 26→1 |
| spacing literals (`padding*`/`margin*`/`gap`) | **324**, across 20 distinct values: 8→62, 12→55, 10→47, 16→42, 14→36, 6→24, 20→9, 4→8, 18→7, 2→7, 24→6, 40→6, then 3,5,7,9,11,32,48,52 |
| `radius.*` token uses | md→34, lg→24, xl→12, sm→11; plus raw `999`→13, raw `2`→2, raw `3`→3 |
| `lineHeight` | 20→16, 19→8, 22→3, 16→2, 15→2, 17→1, 18→1 |
| `fontWeight` | '600'→48, '700'→24, '500'→1, '400'→1 |
| `letterSpacing` | 9 sites; `1`→6, `0.6`→3 |
| `borderWidth` | 3 sites, all `1` |
| shadow / elevation props | **zero** |
| `zIndex` | 3 sites, all in `RemoteDrawer.tsx`: 40, 45, 50 |
| `fontFamily` anywhere | **zero**. No `expo-font` in `mobile/package.json`. No font-family on the web. |

So: the colour layer half-exists, the space and radius layers exist as folklore, the type layer does not exist at all, and the motion layer is three hardcoded numbers.

---

## 1. One owner

**`/home/user/Reviewies/core/src/tokens.ts`** — a sibling of `copy.ts`, under the same rule it states in its own header: *no imports, deliberately*, so the guards can read it as text and so a token file can never pull in the database. `core/package.json` already exports `"./*": "./src/*.ts"`, and both `app` and `mobile` already depend on `@reviewies/core`, so `import { tokens } from '@reviewies/core/tokens'` works on both sides on the day it lands.

**The phone** consumes it directly. `/home/user/Reviewies/mobile/src/ui/theme.ts` stays at its path and becomes a re-export plus the two RN-specific derivations (tracking em→pt, family-name selection for CJK), so the ~30 files that already `import { theme, radius } from './theme'` do not churn. A guard asserts `theme.ts` contains no hex literal of its own.

**The web** cannot import TypeScript into Tailwind's `@theme` block, and today's `palette.test.ts` papers over that by *comparing* two hand-maintained copies. That is a weaker contract than one owner. Replace it: `/home/user/Reviewies/scripts/tokens-to-css.mjs` emits `/home/user/Reviewies/app/src/tokens.generated.css`, which `index.css` `@import`s above `@import 'tailwindcss'`. It emits three things:

- `:root { --ground: #131114; … }` and a light override block (`:root[data-theme="light"]`, plus the `prefers-color-scheme` fallback) — because Tailwind v4's `@theme` is a single set and cannot itself hold two themes;
- `@theme { --color-ground: var(--ground); --text-body: 0.9375rem; --text-body--line-height: 1.375rem; --spacing-s8: 8px; --radius-plate: 2px; --ease-paper: cubic-bezier(0,0,.2,1); … }` — Tailwind's own namespaces, so `text-body`, `bg-ground-raised`, `p-s8`, `rounded-plate` are generated utilities;
- plain custom properties for what Tailwind has no namespace for: motion durations and z-order.

The generated file is checked in and byte-compared against a fresh in-memory generation by a guard. It cannot drift because nothing maintains it.

One casualty worth naming: the current test's `name.replace('-', '')` trick (which turns `--color-surface-2` into `surface2`) does not survive names like `--color-ink-secondary`. The generator owns the naming both ways, so the hack dies with the test that needed it.

---

## 2. Extraction ledger

**Promoted verbatim** (the value already exists, byte-identical, in the places named):

| token | promoted from | sites |
|---|---|---|
| `type.eyebrow` = 12 / '600' / letterSpacing 1 / uppercase / muted | `RemotePanel.tsx:166`, `stats.tsx:238`, `people.tsx:400`, `title/[id].tsx:364`, `data.tsx:186`, `calendar.tsx:218` | **6, byte-identical** |
| `type.masthead` = 30 / '700' | `(tabs)/index.tsx:329`, `watchlist.tsx:159`, `search.tsx:256`, `more.tsx:116`, `discover.tsx:184` | **5, byte-identical** |
| `type.body` = 15 / lh 22 | 27 uses of 15, 3 of lh 22 | |
| `type.bodySmall` = 13 / lh 18 | 30 uses of 13 | |
| `type.rowTitle` = 17 / lh 20 / '600' | 4 uses of 17; lh 20 is the single most common line-height (16) | |
| `type.caption` = 11 | 18 uses | |
| `type.tabLabel` = 10 | `(tabs)/_layout.tsx:28` and 4 more | |
| `type.emoji.stream` = 26 | `ReactionStream.tsx:208` | |
| `size.tap` = 24 | `theme.ts:34`, `index.css:35` — already a token on both sides | |
| `z.drawerHandle/Scrim/Drawer` = 40 / 45 / 50 | `RemoteDrawer.tsx:126,136,147` | |
| `motion.duration.drawer` = 200 | `RemoteDrawer.tsx:36` | |
| `motion.easing.paper` = `Easing.out(Easing.cubic)` | `RemoteDrawer.tsx:37` | |
| `motion.easing.tape` = `Easing.linear` | `ReactionStream.tsx:164` | |
| `motion.linger.reaction` = 4000 | `core/src/watching/reactions.ts:29` | |
| `border.hairline` = 1 | the only borderWidth in the build (3 sites) | |

**Invented, and each has to earn it:** the six font families (nothing exists to promote); `type.timecode` 34 and `type.prose` 17/26 (Late Edition inverts the Watching Mode hierarchy and adds a book face); `type.emoji.pad` 40 (replaces 9pt labels + 30pt emoji, the worst type decision in the build); the dim palette; `stroke.signal`; the focus pair; `space` step 20 (9 uses today, kept as the section rhythm).

**Killed:** the seven colour names (`accent` above all — graft 4 takes the pink out of the primary action), `radius.sm/md/lg/xl`, sizes 9/14/16/18/22/26, spacing 3/5/7/9/10/11/14/18/40/52.

---

## 3. Colour — roles, with every ratio computed

Two complete tables. Watching Mode pins to `dark` regardless of theme (Late Edition states this deliberately; the token layer makes it a lookup, not an inheritance accident).

### Grounds
| role | dark | light |
|---|---|---|
| `ground` | `#131114` | `#F5F0E8` |
| `ground.raised` | `#1C191E` | `#FFFDF8` |
| `ground.well` | `#0C0B0D` | `#E9E2D6` |

### Ink — every value on every ground it can land on
| role | dark | ground / raised / well | light | page / column / well |
|---|---|---|---|---|
| `ink` | `#F4EFE7` | **16.41 · 15.20 · 17.16** | `#191419` | **16.02 · 17.88 · 14.12** |
| `ink.secondary` | `#B3A9A0` | **8.14 · 7.54 · 8.51** | `#5C5349` | **6.64 · 7.41 · 5.85** |
| `ink.tertiary` | `#8A8079` | **4.87 · 4.51 · 5.09** | `#6E6456` | **5.11 · 5.71 · 4.51** |

Late Edition's dark and light ink numbers are all correct; I re-derived every one. Note the true floor of the system is **4.51** — `ink.tertiary` on `raised` in dark and on `well` in light. There is no headroom there, which is a fact the guard should hold rather than a thing to nudge.

### Strokes — and the split Late Edition does not make
| role | dark | ratios | light | ratios |
|---|---|---|---|---|
| `stroke.hairline` | `#332E36` | 1.42 · 1.31 · 1.48 | `#D6CCBC` | 1.40 · 1.56 · 1.23 |
| `stroke.emphasis` | `#4A434E` | 1.97 · 1.83 · 2.06 | `#A99C88` | 2.37 · 2.65 · 2.09 |
| `stroke.signal` **= `ink.tertiary`** | `#8A8079` | **4.87 · 4.51 · 5.09** | `#6E6456` | **5.11 · 5.71 · 4.51** |

**This is a correction to the direction, and it is load-bearing.** Late Edition draws five *state-bearing* things in `rule` colour: the empty-slot outline (graft 3), the test-card-at-rest crosshair, the NO SIGNAL hatch, the outlined `WATCHLIST` button, and the search field's border. At 1.42:1 none of those exists as far as WCAG 1.4.11 is concerned — a 3:1 floor applies to anything that identifies a control or a state. Decoration is exempt; these are not decoration.

The fix costs zero new colours: **the stroke that means something is drawn in the tertiary ink.** `#8A8079` is already Late Edition's pencil cross-off stroke, so this collapses two tokens into one and the worst case is 4.51 — comfortably past 3.0 in every theme on every ground. `stroke.hairline` and `stroke.emphasis` stay exactly as specified and stay honestly labelled: separators, never meaning.

Two things in the shipping build are the same defect and are fixed by the same token. The drawer handle at `RemoteDrawer.tsx:121` is `surface2` on `ink` — **1.21:1**, which is why all three directions independently reported "a drawer with no affordance" when a 24pt handle has been there all along. And the tab bar's top rule is `edge` on `ink` — **1.41:1**, the "near-invisible" line TEST CARD names. Both become `stroke.signal`.

### Action — graft 4's near-white/near-black pill
| role | dark | light |
|---|---|---|
| `action.fill` | `#F4EFE7` (**= `ink`**) | `#191419` (**= `ink`**) |
| `action.label` | `#131114` (= `ground`) | `#F5F0E8` (= `ground`) |
| `action.quiet` | transparent, `stroke.signal` border, `ink` label | same |

Computed: **16.41:1** dark, **16.02:1** light. The director's "17.17:1 either way" is TEST CARD's `#F2F0EA` measured against TEST CARD's `#0B0C0E`; on Late Edition's grounds it is 16.41/16.02, which is the same argument with the right arithmetic. I also drop `#F2F0EA` and reuse `ink` as the fill — the graft asks for "solid near-white/near-black", and the app already has a near-white and a near-black. One fewer hex, and the symmetry is exact.

`action.quiet` matters more than it looks: 05-discover shows a grey `Watchlist` pill next to a pink `Track` pill and the grey one reads as disabled. Outlined-in-`stroke.signal` reads as available.

### Working — amber, and its one job
| role | dark | light |
|---|---|---|
| `working.fill` | `#F0A93B` | `#F0A93B` |
| `working.onFill` | `#131114` — **9.34:1** | `#191419` — **9.04:1** |
| `working.mark` | `#F0A93B` — **9.34 ground / 9.77 well** | `#8A5A08` — **5.22 page / 5.82 column / 4.60 well** |

Two corrections here.

Late Edition states light-mode amber-on-ink as 9.34:1. It is **9.04:1**. Passing either way, but it is a number copied from the dark row — precisely the class of drift `palette.test.ts` exists to catch, arriving in the document that proposes extending it.

The bigger one: Late Edition's rule is "amber is a fill only in light mode; amber-as-text substitutes `#8A5A08`." Graft 4 then gives amber the `working` job, which includes *marks* — the determinate import bar, the 3-of-12 chip, the searching indicator, the heat-rule tick. `#F0A93B` on paper is **1.77:1**. It fails 3:1 as a non-text UI component, not merely as text. So the light-mode rule is stronger than stated and must be a token, not a footnote: **in light, `working.fill` is only ever a filled area with dark ink on it — never a stroke, never a tick, never a progress fill, never a word.** Any light-mode amber *mark* is `working.mark` = `#8A5A08` at 4.60 worst case. Nowhere in the three documents is this said.

`crossOff.ringFill` is an alias of `working.fill`, with `color.label.green` named in the file as the alternative. Graft 4 calls this the graft it is least sure of and the first thing to test on a device; making it a one-line alias is what makes that test cheap.

### Trouble — red, and its one job
`trouble` = `#F2585C` dark (**5.66 / 5.24 / 5.92**) · `#B3282C` light (**5.68 / 6.34 / 5.01**). Error, "I could not look", destructive. Never a primary action, so red always means something. Amber and red are an orange/red pair and unsafe as a sole signal under protanopia, so `trouble` never renders without a word beside it — which `copy.ts` already guarantees it has one of (`whereToWatch.failed`, `lists.itemsFailed`, `title.loadFailed`).

### Marks — the pen
`mark.crossOff` = `#8A8079` dark (pencil; 4.51 on `raised`, which is the ground a listing row sits on) · `#2F3F86` light (biro; **8.51 page / 9.49 column / 7.50 well**). The stroke is never the only signal — the ring's filled/tick state and the ink step from `ink` to `ink.secondary` carry it independently.

### Label set — eight, hash-indexed (graft 7)
Dark: yellow `#D9A521` · cyan `#3E9EA8` · green `#4F8F55` · magenta `#B65C93` · red `#C24A45` · blue `#4A6FB0` · orange `#C97A3E` · slate `#77808C`
Light: `#9A6E10` · `#26707A` · `#37693C` · `#8E3F70` · `#A93B37` · `#3A568C` · `#9C5A26` · `#5A6470`

Late Edition quotes these against `ground`. **A spine's band sits on `raised`**, which is the tighter test, and it never checked it. Computed on `raised`: yellow 7.75, cyan 5.52, orange 5.25, green 4.47, slate 4.35, magenta 4.09, red 3.61, **blue 3.47** — the floor. Light on `well`: **yellow 3.54** is the floor. Both clear 3:1 as non-text components. The guard tests against the tight ground, not the flattering one.

**Graft 7 needs no runtime OKLCH.** Read it precisely: it displaces "Late Edition's unstated method for picking *which of its eight label colours* a spine gets." So it is `label[hash(titleId) % 8]` — no colour module, no clamp at render, no sampling. The OKLCH clamp belongs at design time, where it becomes a guard instead of a dependency. I measured the box the eight already occupy:

- dark: **L 0.544–0.751, C 0.021–0.155**
- light: **L 0.458–0.569, C 0.023–0.145**

so the guard asserts dark ∈ L[0.53, 0.77] / C ≤ 0.16 and light ∈ L[0.44, 0.59] / C ≤ 0.16. That is "print saturation, never neon" made checkable for free.

I also measured hue spacing, because a hash into eight colours is only navigable-by-memory if the eight are distinguishable. Dark hues sorted: 26, 56, 84, 146, 205, 256, 261, 344. Blue (261) and slate (256) are **5° apart** — but slate's chroma is 0.021, i.e. it is grey and its hue is noise. Excluding it, the minimum gap is **28°**. So the rule is: *any two labels with C ≥ 0.05 sit ≥25° apart*. That is a real property of the set, discovered by measuring it, and it is the guard that stops someone "improving" orange into yellow's neighbourhood.

### Dim — Watching Mode auto-dim (graft 9), and why it is a palette
Graft 9 raises Bias Light's dim from 55% to 75% on the strength of numbers computed over `#000000` with *Bias Light's* colours. Late Edition's Watching Mode ground is `ground.well` = `#0C0B0D`. Recomputed against the palette that will actually ship:

| at | `ink` | `ink.secondary` | `ink.tertiary` | `working` | `trouble` |
|---|---|---|---|---|---|
| 55% | 5.59 | 3.27 | 2.29 | 3.59 | 2.49 |
| 70% | 8.58 | 4.65 | 3.04 | 5.21 | 3.38 |
| **75%** | **9.74** | **5.18** | **3.34** | **5.84** | **3.75** |
| 80% | 10.99 | 5.73 | 3.65 | 6.47 | 4.12 |

75% is right for `ink`, `ink.secondary` and `working`. It is **wrong for `ink.tertiary` (3.34) and `trouble` (3.75)**, and 80% does not rescue them either. The graft half-anticipates this — "or dim only the primary-text elements" — and now there is a number behind the instinct.

The token-layer answer is stronger than picking an opacity: **the dim is a palette, not an opacity.** An `opacity: 0.75` is invisible to a contrast test forever; a named colour is not.

`dim.ink` `#BAB6B1` (**9.74**) · `dim.ink.secondary` `#89827B` (**5.18**) · `dim.working` `#B78230` (**5.84**)

There is deliberately **no** `dim.tertiary` and **no** `dim.trouble`. Those two roles do not dim — they either hold at full strength or they are not on that screen. The guard asserts both: every `dim.*` clears 4.5 on `well`, and no key exists for the two that cannot.

### Focus — which nobody wrote down
`index.css:50` sets `:focus-visible { outline: 2px solid var(--color-accent) }`. Graft 4 deletes `accent`. So focus is a required consequence of the chosen direction and not one of the three documents mentions it.

`focus.ring` = `ink` · `focus.inset` = `ground` · `focus.width` = `border.mark` (2) · `focus.offset` = `space.s2` (2)

The inset is not decoration. A near-white ring around an `action.fill` pill is **1.00:1** — the ring and the fill are the same colour. Around `working.fill` it is **1.76:1**. A 1pt inner ring in `ground` restores it: **16.41:1** against the near-white pill, **9.34:1** against amber. Two rings, one token pair, works on every surface in the app.

---

## 4. Type

### Families, and the React Native problem stated honestly
Graft 8 names the trap: RN's `fontFamily` takes **one string with no fallback list**. So a family token cannot be a single value shared by both platforms. Each carries a concrete registered name *and* a web stack:

| token | phone family (registered) | web stack |
|---|---|---|
| `family.display` | `Archivo Expanded` | `'Archivo Expanded', Archivo, ui-sans-serif, system-ui` |
| `family.title` | `Archivo Narrow` | `'Archivo Narrow', Archivo, ui-sans-serif, system-ui` |
| `family.body` | `Archivo` | `Archivo, ui-sans-serif, system-ui` |
| `family.data` | `IBM Plex Mono` | `'IBM Plex Mono', ui-monospace, SFMono-Regular` |
| `family.prose` | `Newsreader` | `Newsreader, ui-serif, 'New York'` |
| `family.jp` | `IBM Plex Sans JP` | `'IBM Plex Sans JP', 'Hiragino Sans', sans-serif` |

The CJK selection has to have one owner too, or graft 8's "per-string script detection at the call site" becomes 222 call sites. `tokens.ts` ships `pickFamily(text, role)` beside the table: one regex over CJK ranges, one place. Guard: no raw `fontFamily:` literal anywhere in `mobile/{app,src}` outside the font module.

**The cost nobody costed.** RN will not synthesise a weight for a named family, so every weight is its own file: Archivo-Expanded-700, ArchivoNarrow-600, ArchivoNarrow-700, Archivo-400, IBMPlexMono-500, Newsreader-400, Newsreader-400-Italic, IBMPlexSansJP-400, IBMPlexSansJP-700 — **nine faces**, roughly 1.2–1.8 MB bundled, and `expo-font` is not currently a dependency of `mobile`. This is real work the direction assumes away, and it is load-bearing for "fully offline": a font over the network is a font that fails on a plane, so all nine bundle or the direction is not what shipped.

### The scale — twelve tokens

Tracking is stored in **em, never points**. The six existing sites write `letterSpacing: 1` at size 12; stored as points, tracking stays fixed while the glyphs double at 200%, and the caps blur into a block. Stored as `0.083em` the phone derives `round(size × track × fontScale)` at render and it scales correctly. That decision is not in any of the three documents.

| token | size / lh | wt | track | family | Dynamic Type | origin |
|---|---|---|---|---|---|---|
| `masthead` | 30 / 32 | 700 | +0.02em, caps | display | largeTitle | **extracted ×5** |
| `headline` | 20 / 26 | 700 | 0 | title | title3 | **extracted ×4** ("Bring your history with you", 01/02) |
| `rowTitle` | 17 / 20 | 600 | 0 | title | body | **extracted** |
| `prose` | 17 / 26 | 400 | 0 | prose | body | invented — the Letterboxd half |
| `body` | 15 / 22 | 400 | 0 | body | subheadline | **extracted ×27** |
| `bodySmall` | 13 / 18 | 400 | 0 | body | footnote | **extracted ×30** |
| `data` | 13 / 16 | 500 | 0, tnum | data | footnote | size extracted, family new |
| `eyebrow` | 12 / 16 | 600 | +0.083em, caps | title | caption1 | **extracted ×6, byte-identical** |
| `caption` | 11 / 15 | 400 | 0 | body | caption2 | **extracted ×18** |
| `padLabel` | 11 / 14 | 700 | +0.08em, caps | title | caption2 | replaces the 9pt label |
| `tabLabel` | 10 / 12 | 700 | +0.08em, caps | title | caption2 | **extracted** |
| `timecode` | 34 / 36 | 500 | 0, tnum | data | largeTitle | invented — the hero inversion |
| `emoji.pad` | 40 | — | — | — | — | replaces 30 |
| `emoji.stream` | 26 | — | — | — | — | **extracted** (`ReactionStream.tsx:208`) |

**Deliberately keeping the shipped eyebrow over the document's.** Late Edition specifies the section label at 11/12 with +0.12em. The build has 12 with letterSpacing 1 in six files, byte-identical, and it is legible in 09-calendar, 13-data and 14-remote. Extraction beats invention, and 11pt tracked caps in a dark room is a downgrade. The rule running to the right edge — the part that actually does the printed-matter work — is geometry, not type, and costs nothing.

**Where 14 dies, and what it costs.** 55 uses of 14 and 27 of 15 — one point apart, carrying no role distinction: 14 splits muted-20 / text-19, and 15 splits text-13 / muted-5. Two sizes doing one job is the exact drift `palette.test.ts` was written to stop, in the type layer instead of the colour layer. `body` 15 and `bodySmall` 13 replace both. This is **not** a sed: it is 69 judgement calls (55 at 14, 14 at 16), one per site, deciding whether that line is a sentence or a subtitle. Anyone who plans it as a mechanical swap will get it wrong.

**200% Dynamic Type.** No token carries a clamp. `maxFontSizeMultiplier` is banned outright by a guard, which is the exact pair to the existing `allowFontScaling` guard in `phoneTextScaling.test.ts` — that test remembers a component silently opting out of scaling; this one remembers a component silently capping it, the same defect one line further on. Geometry reflows instead, which is what Late Edition's equal-width transport cells (4 across → 2×2) and TEST CARD's two-row control bar are both for. On the web, sizes emit as `rem` and `appearance.test.ts` already fails the build on `text-[Npx]`.

---

## 5. Space

Ten steps on a 2pt base: **`s2 s4 s6 s8 s12 s16 s20 s24 s32 s48`**.

Named by magnitude, not by use, on purpose. This codebase has been bitten twice by a semantic name that stopped being true — `lists.signInToMake` pointed at "the Data tab" after §6.79 deleted it, and `theme.ts` says it is "carried over from the web app so the two do not drift apart" while six of its seven values had drifted. `space.s12` cannot become a lie.

Covered by the existing distribution: 8 (62), 12 (55), 16 (42), 6 (24), 20 (9), 4 (8), 2 (7), 24 (6), 32 (2), 48 (1). Killed: **10 (47), 14 (36), 18 (7), 40 (6)**, plus the singletons 3, 5, 7, 9, 11, 52 — **~99 sites to migrate.**

No allowlist, and this needs saying plainly. The obvious way to land a guard against 99 existing violations is a shrinking exception list. §6.59 is the entry in this codebase's own history about exactly that: "the swallowed-failure guard carried a written excuse for it, and it stayed that way until somebody read the excuse back." So the guard lands *with* the migration or it does not land. A guard with an excuse in it is not a guard.

Separately: `size.target = 44` (the house standard) and `size.tap = 24` (WCAG 2.5.8 — already a token on both platforms, `theme.ts:34` and `index.css:35`, promoted unchanged). These are exempt from the space scale because they are floors, not rhythm. Also `ratio.poster = 2/3` and `ratio.still = 16/9`. Component dimensions — the 34×150 spine, the 108pt pad cell, the 96pt stream band — stay in their components; putting them here would make this a component library instead of a token table.

---

## 6. Radius

**`none 0 · plate 2 · pill 999`.** Three.

Late Edition: "Every card in the current build is a rounded fill doing a rule's job… printed images have square corners." So `0` for structure (full-bleed rows, fields, transport cells, bands), `2` for anything printed (plates, spines, chips), `999` for the two round things that remain — the `action.fill` pill from graft 4 and the 44pt cross-off ring. `sm/md/lg/xl` and their 81 uses go, along with the 13 raw `999`s and the raw 2s and 3s: **~84 sites.**

---

## 7. Border

**`hairline 1 · mark 2 · tally 3 · icon 1.5`**

`hairline` is the whole depth system. `mark` is press feedback (1→2 thickening, applied instantly), the focus ring width, and the timeline playhead. `tally` is the active tab's rule and the shelf rule. `icon` is the drawn 24pt line marks.

Late Edition says 1.75pt icon stroke. **1.5** instead: 1.75 lands on 3.5px at 2× and 5.25px at 3×, both non-integer, both fuzzy on the exact 24pt glyphs the direction is replacing badly-rendered font glyphs with. TEST CARD independently chose 1.5. Named as a deviation rather than smuggled.

Band thicknesses — the poster's 4pt bottom band, the spine's 6pt top band — are `space.s4` and `space.s6`. They are fills, not strokes, and a stroke scale that quietly contains fills is a scale that will grow a 96 next.

---

## 8. Elevation

**There are no elevation tokens, and that is the token.**

`elevation = { sunken: ground.well, base: ground, raised: ground.raised }` — three ground steps and a hairline, nothing else. Late Edition: "Depth is carried by 1pt rules and ground steps only… on a `#0b0b0f` ground a drop shadow is invisible anyway, so the fills are pure cost."

The build already agrees: **zero** shadow or elevation props exist today. So this is the one layer where the guard protects a property the code currently has, rather than one it needs to acquire — which makes it the cheapest guard in the set and the one most likely to be worth having in a year.

---

## 9. Motion

```
duration  instant 0 · tick 100 · rule 160 · spine 180 · drawer 200 · crossOff 220
stagger   rule 40
easing    paper = Easing.out(Easing.cubic) / cubic-bezier(0,0,.2,1)
          tape  = Easing.linear
reduced   tick 100 · rule 0 · spine 100 · drawer 0 · crossOff 0 · stagger.rule 0
linger    undo 6000 · promptDismiss 6000 · dimAfter 8000 · reaction 4000
```

**Reduced motion is a parallel table with the same keys, not a ternary.** `RemoteDrawer.tsx:36` currently writes `duration: reduced ? 0 : 200`, which puts the accessibility decision at every call site — and a site that forgets it is invisible until someone with the setting on opens that screen, which is the identical failure mode `phoneTextScaling.test.ts` was written for. A parallel table plus a `useMotion()` that returns the right one makes forgetting impossible. The guard asserts every key in `duration` has a key in `reduced`.

Note what the reduced column preserves: `spine` is 100, not 0 — the spine cross-fades without tipping, per the direction. `tick` is 100 unchanged, because a cross-fade is not travel. Reduced motion removes travel, never information.

**`linger` is not motion and never gets a reduced value.** The 6-second undo window and the 6-second prompt dismissal (graft 10) are WCAG 2.2.1 timing concerns, not 2.3.3 animation concerns; shortening them under Reduce Motion would take the safety net away from the people most likely to need it. The guard asserts `linger` has no counterpart in `reduced`. Both are dismissible by hand and neither blocks the loop — graft 10 is explicit that the write lands first and the card is decoration over a completed action.

`linger.reaction` mirrors `REACTION_VISIBLE_MS` from `core/src/watching/reactions.ts:29`. `tokens.ts` does not import it — same rule as `copy.ts` — so the guard *checks* the two are equal, which is exactly the shape of the existing copy guard checking `UPCOMING_DAYS` against the words "two months".

One deviation stated out loud: Late Edition asks for the drawer at **200ms linear**. I keep the shipped `Easing.out(Easing.cubic)` at 200ms. It has no overshoot, so it does not violate "never like glass", and extraction beats relitigating a drawer. `tape` (linear) stays where the direction's argument is physical — the reaction drift, where linear is already correct in `ReactionStream.tsx:164` and where ease-in-out would make each reaction look animated *at* you rather than passing by.

Press feedback is not in this table because it is not animation: a 1→2pt rule thickening plus a ground step, applied at `duration.instant`.

---

## 10. Z-order

```
base 0 · sticky 10 · tabBar 20 · sheet 30 · drawerHandle 40 · drawerScrim 45 · drawer 50 · undo 60 · dialog 70 · banner 80
```

40 / 45 / 50 are lifted verbatim from `RemoteDrawer.tsx:126, 136, 147` — handle, scrim, drawer, in that order, already correct. The rest fills in the layers the app has but never numbered. `undo` above `drawer` because graft 10's inline prompt and the 6-second undo chip must be reachable from inside Watching Mode with the drawer open; `banner` on top because `FailureBanner` is the thing that says the app could not do what you asked.

---

## 11. Guards — each with what it asserts and what would prove it works

Thirteen. All in the house style: source-level, non-vacuous preamble first, a comment naming the specific defect each one remembers.

**G1 · the CSS is generated, not maintained** — `app/src/ui/tokens.generated.test.ts`
Regenerates the `@theme` block from `core/src/tokens.ts` in memory and byte-compares to `app/src/tokens.generated.css`.
*Planted:* hand-edit `--ground` in the CSS to `#131115`. This replaces the "is the same on both platforms" half of `palette.test.ts` with something that cannot drift rather than something that notices drift.

**G2 · every ratio, against every ground it can land on** — `app/src/ui/contrast.test.ts`
For both themes: every `ink.*`, `action.label`, `working.onFill`, `mark.*` at ≥4.5 on every ground that role can appear on; every `stroke.signal`, `label[*]`, `working.mark`, `focus.ring` at ≥3.0 on the *tightest* ground (`raised` in dark, `well` in light), not the flattering one. Keeps `palette.test.ts`'s third test — the one that checks the arithmetic itself against `#777777` on white = 4.48 — verbatim, because a contrast guard is only worth having if its maths is right.
*Planted:* set dark `ink.tertiary` to `#7F7670` — 4.13 on `ground`, **3.83 on `raised`**. A guard that only tests `ground` passes it; this one fails on the ground the text actually sits on.

**G3 · amber in light mode** — same file
Asserts `working.mark.light !== working.fill`, and that `contrast(working.fill, ground.light) < 3` — i.e. the reason for the split is itself checked, so the rule cannot be quietly relaxed once someone forgets why it exists.
*Planted:* set `working.mark.light = '#F0A93B'`. **1.77:1**, fails.

**G4 · the dim is a palette** — `app/src/ui/watchingDim.test.ts`
(a) every `dim.*` clears 4.5 against `ground.well.dark`; (b) `dim` has no key named `tertiary` or `trouble`; (c) no `opacity:` literal between 0.5 and 0.95 appears anywhere under `mobile/app/watching/`.
*Planted:* add `dim.tertiary = '#6B635E'` — **3.34**, fails (a). Or re-implement the dim as `style={{ opacity: 0.75 }}` on the header — fails (c), which is the one that matters, because an opacity would slip past (a) forever.

**G5 · the label set stays print-saturated and stays distinguishable** — `app/src/ui/labelSet.test.ts`
Converts each of the sixteen to OKLCH and asserts dark ∈ L[0.53, 0.77] / C ≤ 0.16, light ∈ L[0.44, 0.59] / C ≤ 0.16; and that any two with C ≥ 0.05 sit ≥25° apart in hue.
*Planted:* swap dark blue to `#3355FF` (C ≈ 0.24) — chroma fails, "brought down to print saturation" is enforced instead of asserted. Or move `orange` to H 84 — spacing fails at 0°, and a hash into eight colours that are really seven is caught.

**G6 · no raw type sizes** — `app/src/ui/typeScale.test.ts`
No `fontSize:` numeric literal in `mobile/{app,src}/**/*.tsx`; no arbitrary `text-[…]` on the web. Non-vacuous preamble asserting the glob found >15 files and that at least one `<Text` exists, copied from `phoneTextScaling.test.ts`.
*Planted:* put `fontSize: 14` back into `mobile/app/(tabs)/discover.tsx:185`. This is the guard that keeps 82 from becoming 83.

**G7 · text scaling is never capped** — extends `app/src/ui/phoneTextScaling.test.ts`
`maxFontSizeMultiplier` appears nowhere in `mobile/{app,src}`. Sits directly beside the existing `allowFontScaling={false}` check, which it is the sequel to.
*Planted:* `maxFontSizeMultiplier={1.4}` on the masthead in `(tabs)/index.tsx`. Fails, and the 200% standard survives the one change most likely to be made in good faith to stop a heading wrapping.

**G8 · tracking is relative** — same file
Every `track` in the type table is ≤ 0.2 (an em, not a point); no raw `letterSpacing:` literal in `mobile/{app,src}`.
*Planted:* `letterSpacing: 1` back into `mobile/app/stats.tsx:242` — the very line this token was extracted from, which is why that is the right place to plant it.

**G9 · the space scale** — `app/src/ui/space.test.ts`
Every numeric literal assigned to a `padding*`/`margin*`/`gap`/`inset` key on either platform is a member of `space`, or 44, or 24.
*Planted:* `padding: 10` in `mobile/app/(tabs)/more.tsx` — the single most common off-scale value in the build today (47 uses), so the planted violation is literally the current state.

**G10 · flat** — `app/src/ui/flat.test.ts`
No `shadowColor|shadowOpacity|shadowRadius|shadowOffset|elevation:` in `mobile`; no `shadow-*|drop-shadow|backdrop-blur|blur-*` class on the web; no `borderRadius:` numeric literal outside the radius token.
*Planted:* `elevation: 4` on the Up Next listing row, or `backdrop-blur-sm` on the web tab bar. The second is the one worth having: Bias Light's refusal argument is the correct one and applies here too — *a blurred surface makes contrast depend on whatever is scrolling behind it, so G2 can no longer check it, and a rule you cannot check is a rule you do not have.*

**G11 · motion** — `app/src/ui/motion.test.ts`
(a) `Object.keys(duration)` ⊆ `Object.keys(reduced)`; (b) no `reduced ? … : …` ternary wrapping a numeric duration outside `tokens.ts`; (c) no key of `linger` appears in `reduced`; (d) `linger.reaction === REACTION_VISIBLE_MS`, read from `core/src/watching/reactions.ts`.
*Planted:* add `duration.heat = 300` for the heat-rule tick without adding `reduced.heat` — fails (a), and the new moving thing cannot ship without an answer for Reduce Motion. Or restore `duration: reduced ? 0 : 200` in `RemoteDrawer.tsx:36` — fails (b). Or change `REACTION_VISIBLE_MS` to 5000 — fails (d), which is the drift the copy guard's `UPCOMING_DAYS` check was invented to catch, one layer down.

**G12 · the font bundle matches the token table** — `app/src/ui/fontBundle.test.ts`
The set of family names in `tokens.type.family` equals the set of faces in `mobile/src/ui/fonts.ts`'s `useFonts` map, equals the set of `@font-face` families in the generated CSS; every family's `stack` ends in a generic (`ui-sans-serif`/`ui-serif`/`ui-monospace`); and no raw `fontFamily:` literal exists in `mobile/{app,src}` outside `fonts.ts`.
*Planted:* add `family.mono2 = 'JetBrains Mono'` to the tokens without shipping the TTF — the three sets diverge and the phone silently falls back to system, which is the one type failure that looks fine in the simulator and wrong on a device. Or type `fontFamily: 'Archivo'` into `Poster.tsx`, bypassing `pickFamily` and rendering a Japanese title in a face that has no Japanese in it.

**G13 · z-order** — `app/src/ui/zOrder.test.ts`
No raw `zIndex:` numeric literal outside `tokens.ts`; every value in `z` distinct and monotonically ordered by declaration.
*Planted:* `zIndex: 45` typed onto the Watching Mode stream band — collides with `drawerScrim`, and the remote drawer opens *behind* the reactions in the flagship feature.

---

## 12. What I found wrong on the way through

1. `stroke` at 1.42:1 cannot carry the empty slot, the crosshair, the hatch, the outlined button or the field border — five state-bearing marks below the 3:1 floor. Fixed by aliasing the signal stroke to `ink.tertiary`, at zero new colours.
2. Light-mode amber fails as a **mark** (1.77:1), not only as text, so graft 4's `working` job needs a separate light value. Not stated anywhere in the three documents.
3. The 75% auto-dim breaks `ink.tertiary` (3.34) and `trouble` (3.75) against Late Edition's actual Watching Mode ground. The graft's numbers are Bias Light's palette over `#000000`.
4. The label set was checked against `ground`; spines sit on `raised`, where the floor is blue at **3.47** — still passing, but by less than advertised.
5. Light amber-on-ink is **9.04:1**, not the 9.34 Late Edition prints (that is the dark row's number).
6. "17.17:1 either way" for the action pill is TEST CARD's hex on TEST CARD's ink. On Late Edition's grounds: 16.41 / 16.02.
7. Deleting `accent` deletes the only focus ring in the app (`index.css:50`), and a near-white ring on a near-white pill is 1.00:1. Nobody mentioned focus.
8. Graft 7 needs no runtime OKLCH at all. Reading it as a design-time constraint turns a dependency into a guard.
9. Late Edition says the remote drawer has "no affordance". `RemoteDrawer.tsx:113` has a 24pt handle. It is `surface2` on `ink` — **1.21:1**. The complaint is right and the diagnosis is wrong, and the fix is a token, not a component.

## 13. The costs, unhedged

- **~99 spacing sites, ~84 radius sites, ~69 type sites** to migrate, and the type ones are judgement calls rather than substitutions. No allowlist — §6.59 is this codebase's own argument against one.
- **Nine font faces, ~1.2–1.8 MB, and `expo-font` is a new dependency.** All nine bundle or "fully offline" is not true.
- **The light theme is the big one.** Late Edition specifies two complete themes; the phone bakes `theme.ink` into module-level `StyleSheet.create` in ~30 files, so a runtime theme switch is an architectural change, not a token change. My recommendation: land `tokens.color` with **both** tables and have the phone consume `dark` only, with `theme` kept as a frozen alias so nothing breaks on day one. G2 runs on the data, not on the usage, so it checks the light table from the moment it exists — the light theme cannot rot in the months before it is wired. The StyleSheet migration is named debt with a date, not a sleeping test.
- **`palette.test.ts` is replaced, not extended.** Its seven-name assertion, its `.replace('-','')` parser and its hand-maintained cross-platform comparison all go. Its contrast arithmetic — including the `#777777`-on-white sanity check — is the one part that carries forward unchanged, because it is the part that was right.

---

**Files this touches:** `/home/user/Reviewies/core/src/tokens.ts` (new, the owner) · `/home/user/Reviewies/scripts/tokens-to-css.mjs` (new) · `/home/user/Reviewies/app/src/tokens.generated.css` (new, generated) · `/home/user/Reviewies/app/src/index.css` (imports it; loses the accent focus ring) · `/home/user/Reviewies/mobile/src/ui/theme.ts` (becomes a re-export) · `/home/user/Reviewies/mobile/src/ui/fonts.ts` (new) · `/home/user/Reviewies/app/src/ui/palette.test.ts` (replaced by G1–G3) · `/home/user/Reviewies/app/src/ui/phoneTextScaling.test.ts` (extended by G7, G8) · `/home/user/Reviewies/app/src/ui/appearance.test.ts` (its `text-[Npx]` ban becomes part of G6) · plus new guards G4, G5, G9, G10, G11, G12, G13 alongside them in `/home/user/Reviewies/app/src/ui/`.
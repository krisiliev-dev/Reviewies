# Late Edition

One of three visual directions commissioned for Reviewies, each generated from a
different starting point and written without sight of the others.

## The idea

Every other tracker looks like a streaming service — a wall of posters, because a streaming service's job is to sell you the next thing. A tracker's job is the opposite: it is *your record of what you already watched*, and the real-world objects that did that job were printed. The listings page you circled with a biro. The VHS spine you labelled by hand because the box was long gone. The test card that ran when there was nothing to transmit. The box set on the shelf with eight spines in a row and one pulled out. Late Edition builds the app out of those: full-bleed listing rows separated by hairline rules instead of floating rounded cards; a warm newsprint paper ground in light and a warm press-black in dark; section headings that are small condensed caps with a rule running off to the right edge; every number in the app — S02E07, 44m, 21:00, 5.5 days, the Watching Mode timecode — set in a monospaced broadcast face with tabular figures, so the app's personality lives in the one thing a data-dense tracker has most of and columns align for free. Nothing blurs, nothing glows, nothing lifts on press. Marking an episode watched crosses it off the listing. A show with no poster gets a hand-labelled tape spine instead of a grey box, which turns the app's ugliest technical reality — an imported library full of unmatched titles — into its best image. It is warm, it is dense, it is legible at 200% text, and it looks like nothing else in the App Store because everything else in the App Store is trying to look like Netflix.

## The signature move

**The Cross-Off.** Every episode in a listing row has, at its right edge, a 44pt open ring — an empty circle, the way an unwatched programme sits on a printed page. Tap it and a stroke draws left-to-right across the row's episode title over 220ms in pencil (#8A8079 dark) or biro blue (#2F3F86 light), the ring fills amber and takes a tick, the row's text steps down from primary to secondary, and the row settles 2pt. The existing light haptic fires. It is exactly the gesture of crossing a programme off the TV guide with the pen you kept by the sofa, and it is attached to the single most repeated action in the entire product — the "what do I watch next, mark it, next" loop that the research says is the whole reason people used TV Time.

It compounds, which is the part people describe to a friend: open a season on a title page and you see the whole season's listing with S1 struck through top to bottom, S2 struck to episode 7, and the rest open. Your progress through a show is not a percentage bar — it is a page you have visibly worked your way down. On Stats, "this year" renders as twelve month-blocks of struck-through rules, so a year of watching looks like a marked-up almanac.

Two things make it honest rather than decorative. First, the stroke is *undoable at the point of the mistake*: for 6 seconds the ring's position holds a mono `UNDO` chip. The app already has `unwatchLatest` in the repo but nothing surfaces it where the error happens, so a mis-tap currently costs a trip into the title screen. Second, reduced motion: no draw, no settle — the stroke, the fill and the tick appear in one frame, the haptic stays, and nothing about the meaning is lost. The stroke is never the only signal either; the ring's filled/tick state and the text colour step carry it for anyone who cannot perceive a 1pt line.

## Palette

Two grounds, two accents, and a label set. The current palette (#0b0b0f ink, #ff5c7a accent) is generic dark-plus-pink; every value below is warm-biased so the ground reads as ink and paper rather than screen-black and screen-white. All ratios computed, not eyeballed.

DARK — "After Transmission" (default; the app is used in a dark room with the TV on)
- ground/page #131114 · raised/column #1C191E · well/sunken #0C0B0D
- rule (hairline) #332E36 · rule-strong #4A434E (decorative separators only, never text)
- text primary #F4EFE7 (16.41:1 on ground, 15.20:1 on raised, 17.16:1 on well)
- text secondary #B3A9A0 (8.14:1) · text tertiary #8A8079 (4.87:1 on ground, 4.51:1 on raised — AA floor held even on the raised ground, which the current #9a9ab0 does not do consistently)
- ACCENT 1 — Highlighter Amber #F0A93B. The biro circle round tonight's programme. As text on ground 9.34:1; as a fill with #131114 ink on it 9.34:1. This replaces #ff5c7a as the primary action colour.
- ACCENT 2 — Transmission Red #F2585C (5.66:1). Live, destructive, error only. Never a primary action, so red always means something.
- Cross-off stroke: pencil #8A8079 (4.51:1 on raised)

LIGHT — "Newsstand"
- page #F5F0E8 (newsprint, not white) · column/raised #FFFDF8 · well/sunken #E9E2D6
- rule #D6CCBC · rule-strong #A99C88
- text primary #191419 (16.02:1 on page, 17.88:1 on column) · secondary #5C5349 (6.64:1) · tertiary #6E6456 (5.11:1 on page, 4.51:1 on the sunken well)
- Amber is a FILL ONLY in light mode (#F0A93B with #191419 on it = 9.34:1). Amber-as-text substitutes amber-ink #8A5A08 (5.22:1). This is the one rule people get wrong; state it in the tokens.
- Transmission Red text #B3282C (5.68:1)
- Cross-off stroke: biro blue #2F3F86 (8.51:1). The light theme literally gets a ballpoint; the dark theme gets a pencil.

LABEL SET (8) — the SMPTE test-card bars, brought down to print saturation. Used for: the band on a tape spine, the band under a poster plate, and as the categorical series colours on Stats. Never the sole carrier of meaning and never the field text sits on — a spine's text sits on the raised/column ground, the colour is a 6pt band. So these only need 3:1 as UI components (WCAG 1.4.11), which they clear.
- Dark theme: yellow #D9A521 (8.37:1) · cyan #3E9EA8 (5.96) · green #4F8F55 (4.82) · magenta #B65C93 (4.42) · red #C24A45 (3.90) · blue #4A6FB0 (3.75) · orange #C97A3E (5.67) · slate #77808C (4.70)
- Light theme (darkened, all ≥4:1 on paper, all take #FFFDF8 text at ≥4.48:1 if ever needed): yellow #9A6E10 · cyan #26707A · green #37693C · magenta #8E3F70 · red #A93B37 · blue #3A568C · orange #9C5A26 · slate #5A6470

Extend `app/src/ui/palette.test.ts` (the existing guard that fails when web and phone drift) to assert: every text token ≥4.5:1 on every ground it can land on, every label colour ≥3:1 on its theme's ground, and amber never used as a text token in light mode.

## Typography

Three faces, three jobs. All bundled with the app, not fetched — this is local-first and a font over the network is a font that fails on a plane. System SF Pro is the declared fallback for every role.

1. ARCHIVO (Google Fonts, Omnibus-Type) — the structural voice. One superfamily with real width axes, so the app has range without a second family. 
   - Archivo Expanded 700 for screen mastheads, caps, tracking +0.02em. "UP NEXT" set expanded reads like a channel ident.
   - Archivo Narrow 600/700 for title names in rows and on spines — condensed is what listings pages and spine labels are set in, and it buys ~18% more characters per line in a dense list.
   - Archivo (normal) 400 for body.
2. IBM PLEX MONO 500 — **this is where the personality lives**, and it is the load-bearing choice. Every number in the app goes here with `fontVariant: ['tabular-nums']`: S02·E07, 44m, 21:00, 264 WATCHES, 5.5 DAYS, the Watching Mode timecode, the density chips, the More screen's index numbers. It reads like a transmission log from 1979 without being a novelty face, and — the functional half — tabular mono means episode codes and durations align into columns down a list, and column widths are predictable, which is what makes a data-dense list survive 200% text without S02E07 wrapping to two lines.
3. NEWSREADER (Google Fonts, Production Type) 400/400-italic — reviews, your written notes, list descriptions, the "why you saved it" on Watchlist. The Letterboxd half of the product. Your writing should look like writing, not like UI. Real italics matter here; a two-line review set in Newsreader reads as a printed notice, which is the whole emotional point of writing one.

SCALE (at 100% Dynamic Type; every step maps to a Dynamic Type ramp and scales)
- Masthead 30/32 Archivo Expanded 700 caps +0.02em
- Section rule label 11/12 Archivo Narrow 700 caps +0.12em — the existing "TELL ME ABOUT" / "NEXT TWO MONTHS" style, kept, but now with a 1pt rule running from the last word to the right edge. That device alone does most of the work of making the app look printed.
- Row title 17/20 Archivo Narrow 600
- Body 15/22 Archivo 400
- Review 17/26 Newsreader 400
- Data 13/16 IBM Plex Mono 500 tabular
- Timecode 34/36 IBM Plex Mono 500 tabular (Watching Mode only)
- Caption / colophon 11/15 Archivo 400, or Plex Mono for anything numeric

Personality summary in one line: the app is set in a condensed news face, the numbers are set in a machine face, and what you write is set in a book face.

## The poster slot

`mobile/src/ui/Poster.tsx` currently renders a `surface2` rounded rectangle with the title at 10pt in muted grey, centred, up to three lines. Screenshot 05 shows what that does at 64×96: four identical grey boxes with unreadable grey type, and it is the single weakest element in the build. It treats a missing poster as a failure to apologise for.

FOUR STATES, VISUALLY DISTINCT, one component:

1. **Has artwork — the tipped-in plate.** 2:3 always. Corner radius drops from 12 to **2pt**, because printed images have square corners, and a 1pt `rule`-coloured border goes round it so a dark poster on a dark ground still has an edge (right now a black poster dissolves into the page). A 4pt band in the title's label colour runs along the bottom edge. Nothing else — no shadow, no gradient scrim, no rounded mask.

2. **No artwork — the spine.** Not a fallback: the primary treatment for an unmatched title, and the thing the direction is named after. Same 2:3 box, raised ground, and:
   - a 6pt label-colour band across the top (the coloured header strip on a VHS spine label),
   - the title in Archivo Narrow 700 **caps**, left-aligned, 8pt margin, in **primary text colour, not muted grey** — a title is content, not chrome — auto-fitting from 15pt down to 10pt across as many lines as fit,
   - a mono line pinned to the bottom: `SERIES · 2019` or `FILM · 2024`,
   - a faint 1pt inner rule inset 4pt, which is the printed border of the label.
   A library imported from a TV Time GDPR zip is *mostly* this state for the first few minutes, and the research says most competitors' imports leave titles permanently unmatched. In Late Edition that library looks like a shelf of hand-labelled tapes — which is precisely, truthfully, what it is.

3. **Still fetching — the test card at rest.** A 1pt circle-and-crosshair centred in `rule` colour on the raised ground. No shimmer, no skeleton pulse. Still, quiet, and unmistakably not the other two.

4. **Could not look — no signal.** A 45° 1pt hatch across the box in `rule` colour, plus a mono `NO SIGNAL` chip and the existing retry control where one exists. This is the state the current component cannot express at all: a fetch failure and a title that simply has no artwork look identical today, which is exactly the distinction the house standard says the app must keep.

Accessibility: one label shape across all four — "Poster for {name}", "…, no artwork", "…, loading", "…, could not load" — so a screen reader gets the same three-way distinction the eye does. Sizes: 44×66 in listing rows, 64×96 in Discover, 96×144 on the title page, 34×150 as a spine on the shelf.

## The screens

TAB BAR — "the channel strip". Now: five glyphs pulled from a text font (▶ ⌕ ✦ ☰ ⋯) at 18pt over a plain bar, active state carried by pink tint alone. ☰ for Watchlist reads "menu" and ⋯ for More reads "overflow", so two of five are semantically wrong. Becomes: well-coloured ground (#0C0B0D / #E9E2D6), 1pt rule on top, and the active tab marked by a **3pt amber rule under it, full tab width** — the "you are here" mark from a printed index. Labels in Archivo Narrow 700 caps 10/12 +0.08em; active label goes to primary text, inactive to tertiary, so active state has two channels (rule + colour weight), not one. Icons become drawn 24pt line marks at 1.75pt stroke, each an artefact: Up Next = a listing row with a tick; Search = a magnifier over a page; Discover = the test-card circle-and-cross; Watchlist = three tape spines of unequal height with top bands; More = a contents mark. Up Next gains a **mono count badge** when episodes are waiting — the app's central question currently gets no answer on the bar at all.

1. UP NEXT → the listings page. Now (screens 01/03): a title, one paragraph, one pink pill, and ~1,100pt of empty black; the import progress state occupies 12% of the screen. Becomes: under the masthead, a mono **transmission line** — `264 WATCHES · 12 TRACKED · 5.5 DAYS` — which is data that currently only exists buried on the More screen, moved to where the person actually is. Then full-bleed listing rows, no cards, 1pt rules between: 44×66 plate | series name (Archivo Narrow 600) / mono `S02·E07 · 44m` / episode title / optional mono `AIRS FRI` tag | 44pt cross-off ring. Rows group under section rules — `TONIGHT`, `NEW EPISODE`, `NEARLY DONE`, `WAITING SINCE JULY` — where today there is no grouping whatsoever and a returning user cannot tell a show they abandoned from one that aired last night. Empty and importing states keep the existing copy word for word (it is good and it is honest) but sit inside a 3:4 test-card frame with the mono progress `MATCHING 3/12` and a determinate bar beneath, so an empty screen has an object on it instead of a void.

2. SEARCH. Now (screen 04): a rounded field with a 2pt near-white outline — the highest-contrast element on the entire screen is an empty input — and then 1,400pt of black. Becomes: the field loses the loud outline for a 1pt rule on a sunken well ground. Below it, with nothing typed: `RECENTLY LOOKED UP`, then `ON YOUR SHELF` as a horizontal strip of spines from your own library (a large share of searches in a tracker are for something you already track — making people type to reach their own library is pure friction), then `BROWSE BY` chips: Anime, Airing now, Films, Finished. Results use the identical listing row from Up Next, so the row is learned once and works everywhere.

3. DISCOVER. Now (screen 05): four stacked identical cards each repeating "Because you watched Dark and Andor" — the same sentence four times is the loudest thing on the screen — with a grey poster box and a grey "Watchlist" button that reads as disabled. Becomes: **the reason is promoted to a section rule**, printed once — `BECAUSE YOU WATCHED DARK AND ANDOR` with the rule running to the edge — and the titles list beneath it as rows. That deletes three redundant lines and creates the hierarchy that is currently absent. Multiple reason sections stack down the page (`FINISHING SOON`, `RATED BY PEOPLE YOU FOLLOW`, `ANIME AIRING THIS SEASON`). Actions become amber-filled `TRACK` and rule-outlined `WATCHLIST` — outlined reads as available where grey-on-grey reads as off. The TMDB attribution moves to the page foot under a rule in mono 10pt, where a colophon belongs.

4. WATCHLIST → the shelf. Now (screen 06): two sentences and a pink pill on black. Becomes: spines, 34pt wide × 150pt tall, laid edge to edge on a 3pt shelf rule, ~8 per row. Titles you are mid-way through sit 8pt proud of the rest, so the shelf answers "what am I part-way through" at a glance. Long-press drags to reorder. A mono `SHELF / LIST` toggle in the header — the shelf is the delight, the list is faster to scan and is what 200% text needs, and offering both is cheaper than compromising. Empty state: an empty shelf rule with a printed card leaning against it carrying the existing copy. Emptiness gets an object rather than a void.

5. MORE → the index. Now (screen 07): eight identical rounded cards with chevrons, i.e. a settings app, and it scrolls. Becomes the contents page of the magazine: mono two-digit index numbers `01`–`08` in a left column, name in Archivo Narrow 600, existing subtitle in body grey, a leader of dots to the right edge, chevron. 1pt rules, no card fills. Denser — all eight fit without scrolling — faster to scan, and unmistakably printed matter. The stat block at the top becomes the same unboxed mono transmission line used on Up Next.

One level down, the direction carries: Stats (screen 08) charts in the test-card label set with mono figures; Calendar (screen 09) as a week grid with times down the left in mono; Remote (screen 14) as a printed remote fascia — mono legends, the D-pad as one ruled cross, transport in amber — identical to the drawer inside Watching Mode, so the two are visibly one object rather than two implementations.

## Motion

Governing rule: things move like paper and tape, never like glass. No blur, no scale-from-centre, no spring bounce, no parallax. Five things move and nothing else. (1) The cross-off, 220ms ease-out: stroke draws left-to-right, ring fills amber, row text steps down a level, row settles 2pt — a pen crossing a line. (2) Pulling a spine off the shelf, 180ms: translate up 8pt, tip 6°, shared-element push into the title page's poster position. (3) The reaction stream keeps its right-to-left drift but changes to linear easing — tape runs at constant speed, and ease-in-out makes each reaction look animated *at* you instead of passing by. (4) Section rules draw in left-to-right, 160ms, staggered 40ms down the page — the page setting itself. (5) The remote drawer slides on its axis, 200ms linear, no overshoot. Press feedback is not animation: a 1pt→2pt rule thickening plus a ground step, applied instantly, so the app feels equally responsive with motion reduced. Reduced motion: the cross-off appears in one frame with the haptic intact; the spine cross-fades without tipping; reactions do not translate at all — they appear in lane, hold for REACTION_VISIBLE_MS, and go; rules are simply present. Nobody on that setting gets a duller product, they get the same product without the pen stroke. The existing WCAG 2.2.2 affordances are promoted rather than replaced: Hold stops the only thing that moves for more than five seconds, density thins it, and both keep working while the clock runs. This direction adds no second continuously-moving element anywhere in the app.

## Watching Mode

This screen is always dark, in both themes, on the well ground #0C0B0D — and that is stated as a deliberate decision rather than left to inherit, because it is used in a dark room with the TV on. In Late Edition it is **the transmission log**.

- **The timecode becomes the hero.** IBM Plex Mono 500 at 34pt tabular, centred at the top, with `S02E07` in Archivo Narrow caps above it and the series name in mono 11pt caps above that. Today the timecode is 15pt and third in the header hierarchy behind the series name — but you already know what you are watching; the number you glance down at is the one that tells you whether you are still in sync. Invert the hierarchy to match the actual question.
- **The drift nudge moves up under the timecode**, as a 1pt amber-ruled strip: `YOU LOOK 4s BEHIND THE CROWD — TAP TO CORRECT`. It currently renders below `ListenSync`, far from the number it corrects, which makes a one-tap fix read as an unrelated notice.
- **The stream becomes a ruled transmission strip**: a fixed 4-lane band 96pt tall, bounded top and bottom by 1pt rules, with a hairline timeline along the bottom. Each reaction rides its lane as a 26pt emoji with a **6pt tick mark on the timeline beneath it**, so you see the moment as well as the feeling. Reactions from people you follow carry a label-colour dot. The rules are what turn it from a chat into a log — which is the truth of the feature, since it is a replay of history and not a live room.
- **Empty stream, said plainly**: if nobody has ever reacted to this episode, the strip shows the bare timeline and mono `NO REACTIONS RECORDED — YOURS WILL BE THE FIRST`. Doc 8 §2 says comment density is literally the number people rank trackers by; a band that is empty because the episode is new must not look like a band that is empty because something failed.
- **The pad is the screen.** A 3-column grid of 108pt-tall cells filling everything below the transport row: raised ground, cells sharing 1pt rules with no gaps between them (a form, not a set of floating buttons), emoji at 40pt, label in Archivo Narrow 700 caps 11pt in primary text colour. Today the labels are 10pt muted grey, which is unreadable in a dark room at arm's length — the exact condition the screen was designed for.
- **The transport row is rebuilt to survive 200% text.** It currently wraps five pill controls plus a density picker into an unpredictable mess (the code comments admit the row measured 690px in a 390px viewport). Becomes two fixed rows above the pad: row 1 is `PAUSE` · `HOLD` · `−5s` · `+5s` as four equal-width 48pt cells sharing rules; row 2 is the density selector under a mono `REACTIONS SHOWN` label. Equal cells reflow to 2×2 at 200% instead of pushing controls off the edge.
- **Search** stays at the bottom, one line, mono placeholder `SEARCH ANY EMOJI`, and it pushes the pad up rather than covering it.
- **The remote drawer finally gets a handle**: a 12pt vertical tab on the right edge carrying `REMOTE` in rotated mono caps. Right now it is a drawer with no affordance, which is a flagship feature nobody will find. Inside, the printed remote fascia — mono legends, ruled D-pad cross, amber transport — identical to the Remote screen, so opening the drawer feels like reaching for the same object rather than arriving somewhere new.

## What this direction refuses to do

- No poster wall. Discover, Search, Up Next and Lists are never a grid of artwork — posters are 44-64pt plates inside text rows, and browsing is reading, not shopping. Two reasons, one emotional and one factual: this is a record of what you watched rather than a shop front, and the library the app actually holds after a TV Time import is full of titles with no artwork at all, so a design that depends on artwork is a design that is broken for the first hour and permanently broken for the long tail. The moment the answer to a layout problem is 'make the posters bigger', the direction has failed.
- No glass, no shadow, no gradient, no glow. Depth is carried by 1pt rules and ground steps only. Every card in the current build is a rounded fill doing a rule's job — and on a #0b0b0f ground a drop shadow is invisible anyway, so the fills are pure cost: they eat 16pt of horizontal space per side, they force gaps between rows that a rule does not need, and they make eight settings entries scroll when eight index lines would not. Rules are cheaper, denser, and they are what printed matter actually uses.
- No gamified chrome. Stats keeps 'Longest streak' because it is a true fact about your year, but nothing anywhere gets a flame, a badge, a level, a ring to close, a rank, or a notification that you are falling behind. The research is unambiguous that people left for simplicity and stayed for the record; an app that starts asking for daily engagement becomes the thing they were trying to leave. Notifications stay exactly as screen 09 already has them — Nothing / Premieres & finales / Every episode, with 'Premieres & finales' as the default — and the design never invents a reason to add a fourth, louder option.

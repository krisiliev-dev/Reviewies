# The design direction

Produced by a twenty-one agent design review of the shipping iPhone build, run over
fourteen screenshots captured from a real imported library (`design/capture.mjs`).
Seven independent lenses — visual, Nielsen heuristics, iOS platform, information
architecture, journey friction, category strategy, brand feel — each adversarially
reviewed by a design director who looked at the screenshots independently and separated
real findings from generic review filler. Then competing visual directions from
different starting points, three judges scoring on different criteria, and this
synthesis.

**This document has one owner, the way `core/src/copy.ts` owns the words.** A change to
the design system goes here first and into `mobile/src/ui/theme.ts` second.

A note on one path that reads two ways: `app/` is the **web** workspace, while the
phone's expo-router directory is `mobile/app/`. The review wrote a bare `_layout.tsx`
under the first and meant the second; `app/src/wiring/docsReferences.test.ts` caught it,
since it requires every cited path to exist. The rule that follows from that — and it
caught this sentence too on its first draft — is that a path being *reported* as wrong
must not be written as though it were a citation.

## An honest note on how much material this rests on

Three visual directions were commissioned. One arrived complete, one arrived as a
truncated paragraph, and one arrived empty — the judges could only score two. The
director said so rather than presenting a three-way synthesis that did not happen. The
chosen direction is therefore a graft of one-and-a-half briefs. It is strong, and it is
less triangulated than the process was designed to produce.

## The verdict

Reviewies is not badly designed, it is undesigned: fourteen screens assembled from the same six primitives with no shared scale, so a card on More and a card on Stats are genuinely different objects, the identical sentence "Find something to watch" is a loud pink button on Up Next and a quiet grey one on Upcoming, and the app changes typeface halfway down the More menu. The engineering underneath is better than most shipping apps — three-state empty handling, a contrast test that fails the build, copy with one owner and real reasoning attached — but it has all been spent on screens that show almost nothing: five of the fourteen captures are 80% empty black while 264 imported watches and 12 tracked titles sit in a database with no route that can display them, and 02-import-done promises "your library" by name. The two features nothing else has are the worst-served of all: Watching Mode contains no call to markWatched anywhere in the file, so the one screen where the app is certain you watched the thing cannot record it, and the Remote renders eleven full-strength keys that fire a haptic and then silently discard every press while hiding "Scan Wi-Fi" — the only control on the screen that could ever make them work — as 17pt text on an eyebrow row.


## The direction: Late Edition

Every other tracker looks like a streaming service — a wall of posters — because a streaming service's job is to sell you the next thing. A tracker's job is the opposite: it is your record of what you already watched, and the real-world objects that did that job were printed. The listings page circled with a biro. The VHS spine labelled by hand because the box was long gone. The test card that ran when there was nothing to transmit. Late Edition builds the app out of those: full-bleed listing rows separated by hairline rules instead of floating rounded cards; section headings that are small caps with a rule running off to the right edge; every number in the app — S02E07, 44m, 21:00, 5.5 days, the Watching Mode timecode — set in a monospaced broadcast face with tabular figures, so the app's personality lives in the one thing a data-dense tracker has most of and columns align for free. Nothing blurs, nothing glows, nothing lifts on press. Marking an episode watched crosses it off the listing. A show with no poster gets a hand-labelled tape spine instead of a grey box — which turns the app's ugliest technical reality, an imported library full of titles that never matched a provider, into its best image. It is warm, dense, legible at 200% text, and it looks like nothing else in the App Store because everything else in the App Store is trying to look like Netflix.


## The signature move

THE CROSS-OFF. Both judges named it the strongest idea in the pile and I agree. Every episode in a listing row carries a 44pt open ring at its right edge — an unwatched programme on a printed page. Tap it and a stroke draws left-to-right across the episode title over 220ms in pencil grey, the ring fills amber and takes a tick, the row's text steps from primary to secondary, and the row settles 2pt. The existing light haptic fires.

It is the gesture of crossing a programme off the TV guide with the pen kept by the sofa, and it is attached to the single most repeated action in the product — the "what do I watch next, mark it, next" loop that research doc 03 identifies as the entire reason people used TV Time. Every competitor doc 08 lists marks an episode with a checkmark or a progress ring; none of them make the act feel like anything.

It compounds, which is the part a person describes to a friend. Open a season on a title page and you see S1 struck through top to bottom, S2 struck to episode 7, and the rest open — your progress through a show is not a percentage bar, it is a page you have visibly worked your way down. On Stats, a year renders as twelve month-blocks of struck-through rules: a marked-up almanac.

Two things make it honest rather than decorative. First, it is undoable at the point of the mistake: for six seconds the ring's own position holds a mono UNDO chip. `unwatchLatest` already exists at core/src/data/repo.ts:172 and nothing currently surfaces it where the error happens, so a mis-tap costs a trip into the title screen. Second, reduced motion: no draw, no settle — stroke, fill and tick appear in one frame, the haptic stays, and nothing of the meaning is lost. The stroke is never the only signal either: the ring's filled/tick state and the text-colour step carry it for anyone who cannot perceive a 1pt line.


## What was grafted in, and what was overruled

Honest note first: only two directions reached me. Late Edition arrived complete; Bias Light arrived as a truncated idea paragraph; the third arrived as nothing at all and the judges could not score it. So this is a graft from one-and-a-half briefs, not three, and I am saying so rather than pretending to a synthesis I did not have the material for.

Late Edition wins outright — 9 on originality, 8 on craft, and it is the only direction specified concretely enough to build. But it loses its argument on three counts and I am overruling it, and Bias Light wins the one argument that matters most.

GRAFT 1 — Bias Light's premise replaces Late Edition's ground. Bias Light's insight is the single most accurate sentence anyone wrote about this product: the phone is the second screen in your hand while the real screen is across the room, and the app is used in the dark. That is not a mood, it is a fact about when the app is opened, and it settles a question Late Edition got wrong. Late Edition shipped two full themes including a newsprint-paper light mode. I am cutting the light theme entirely. Reasons, in order: theme.ts already states dark-only as a product decision for exactly this reason and I will not overrule the codebase's own considered call on a stylistic whim; a newsprint-white app is the wrong object for a dark room; and the two-theme token set would force a restructure of app/src/ui/palette.test.ts, which asserts exactly seven token names and phone === web, costing a day or two the direction never budgeted. So: Late Edition's printed STRUCTURE survives — rules, listings, spines, tabular figures, the section rule running to the edge. Late Edition's printed PAPER does not. Warm ink ground, not warm paper.

GRAFT 2 — Bias Light's light source, defused. Bias Light said light comes only off artwork. That is fatal here and the originality judge caught exactly why: it makes artwork structurally load-bearing in an app whose defining reality is missing artwork, so it has no design at all for the first hour after an import and a permanently degraded one for the unmatched long tail. But the instinct underneath is right — a well-matched library should be rewarded with something. So I take it and confine it: ONE screen, the title page, draws a single tint sampled from the poster into its header. Nowhere else. Where artwork exists it casts light; where it does not, the tape spine carries the screen. The reward exists and nothing depends on it.

GRAFT 3 — Bias Light's double meaning, made literal. "A review is the light you cast on a thing" is the best line in either brief. It lands on the rating moment: the star row and the review sheet are the one place amber is allowed to be large and warm, which also gives the Letterboxd half of this product a visual moment it currently does not have anywhere.

What I am cutting from Late Edition itself, on the craft judge's evidence:
- Three typefaces become two. Newsreader and Archivo Expanded are both dropped. RN cannot address variable width axes so every width is a separate file, and RN on Android silently drops fontWeight once fontFamily is set — seven font files plus a splash gate is how this plan ships broken. Four files: Archivo Narrow 600/700, Archivo 400/500, Plex Mono 500.
- The 34pt shelf spine and the 12pt drawer handle are overruled to 44pt real layout. The house standard is not negotiable by a visual direction.
- The spine's auto-fit from 15pt down to 10pt is deleted. Shrinking text on someone who asked for bigger text is the inverse of what Dynamic Type is for. Fixed token size, wrap, then truncate — a long title truncating is honest.
- The caps are cut back hard. Late Edition put caps plus 0.12em tracking on section rules, spine titles, pad labels AND tab labels; caps + tracking + condensed is the worst combination available for low-vision reading. Caps survive on the eyebrow only, which is already caps in the shipping build ("TELL ME ABOUT", "NEXT TWO MONTHS", "DEVICE", "EXPORT"). Everything else is sentence case.


## The design system

DARK ONLY. One theme. theme.ts already states the reason ("this app gets used in a dark room with the television on, which is the whole premise of Watching Mode") and I am not overruling it. Every ratio below is computed with the WCAG 2.1 formula, not estimated.

PALETTE — grounds
  ground.page      #131114   (replaces ink #0b0b0f — warm-biased so it reads as ink, not screen-black)
  ground.raised    #1C191E   (replaces surface)
  ground.well      #0C0B0D   (tab bar, sunken fields, Watching Mode)
  ground.selected  #2A2118   (amber-tinted; "you chose this" ground)

PALETTE — rules (decorative separators only, NEVER text)
  rule             #332E36   (1.42:1 on page)
  rule.strong      #4A434E   (1.97:1 on page)

PALETTE — text  [page / raised / well]
  text             #F4EFE7   16.41 / 15.20 / 17.16
  text.secondary   #B3A9A0   8.14 / 7.54 / 8.51
  text.tertiary    #918780   5.35 / 4.95 / 5.59
  text.disabled    #756C67   3.39 on raised — disabled controls only, never content

PALETTE — the two chromatic roles
  accent  #F0A93B  amber   9.34 / 8.65 / 9.77.  Ink-on-amber = 9.34:1, so amber-filled buttons take page-ink labels.
  signal  #F2585C  red     5.66 / 5.24 / 5.92.

THE COLOUR LAW (this is the part that is currently missing, not the hues)
  amber FILLED   = the one most consequential action on this screen. Maximum one per screen.
  amber OUTLINED = the current selection (chips, radio rows, the paired device). Selection is an outline, never a fill — that is what stops "you chose this" reading as "tap this".
  amber MARK     = you did this (cross-off ring, stars, the 3pt active-tab rule).
  signal red     = failure and destructive. Never a primary action, so red always means something.
  label set      = categorical only. Never the sole carrier of meaning, never text.
  Every Switch passes explicit trackColor/thumbColor. The teal on 13-data is a bug, not a choice.
  This is two hues doing four jobs with a rule, replacing one hue doing five jobs with none. #ff5c7a currently has 66 uses of which 14 are failure styles — failure is rendered in the happy colour, and on 14-remote a pink "Scan Wi-Fi" and a pink "could not reach it" would occupy the same 40pt.

LABEL SET (8) — SMPTE test-card bars pulled to print saturation. Spine header bands, poster foot bands, chart series. [page / raised]
  yellow #D9A521 8.37/7.75 · cyan #3E9EA8 5.96/5.52 · green #4F8F55 4.82/4.47 · orange #C97A3E 5.67/5.25 · slate #77808C 4.70/4.35 · magenta #B65C93 4.42/4.09 · red #C24A45 3.90/3.61 · blue #4A6FB0 3.75/3.47
  All clear 3:1 on both grounds as UI components (WCAG 1.4.11). The last three do not clear 4.5:1 — hence "never text". Assigned by a deterministic hash of the title id so a shelf of unmatched imports reads as varied spines, not uniform sludge.

TYPE — two families, four files, eleven tokens
  Archivo Narrow 600/700 · Archivo 400/500 · IBM Plex Mono 500. Bundled, not fetched — local-first means a font over the network is a font that fails on a plane. SF Pro is the declared fallback for every role.
  RN GOTCHA, state it in the tokens: React Native cannot address variable width axes, so each width ships as a separate static file; and RN on Android drops fontWeight once fontFamily is set, so register one family name per weight ("ArchivoNarrow-Bold", not family+weight). This is the classic way this exact plan ships broken.

  display     30/34  Archivo Narrow 700          screen title (already exists byte-identical in 5 files)
  title       20/26  Archivo Narrow 700          section heading within a screen
  row         17/22  Archivo Narrow 600          title names in listing rows
  body        15/22  Archivo 400                 prose (collapses 55x fontSize:14 + 27x fontSize:15)
  bodyStrong  15/22  Archivo 500
  label       13/18  Archivo 500                 control labels
  eyebrow     11/14  Archivo 700 caps +0.10em    THE ONLY CAPS IN THE APP
  data        13/16  Plex Mono 500 tabular       every number
  dataLarge   20/24  Plex Mono 500 tabular       stat tile figures
  timecode    34/36  Plex Mono 500 tabular       Watching Mode only
  caption     11/15  Archivo 400                 legal, colophon
  Eleven tokens replace 14 raw fontSize values. Every step maps to a Dynamic Type ramp and scales. Test fails on any raw numeric fontSize outside the set.
  Mono is load-bearing, not decorative: tabular figures stop "S02E07" reflowing and make column widths predictable, which is the actual mechanism by which a dense list survives 200% text. fontVariant:['tabular-nums'] is already proven in this codebase on the Watching Mode clock.

SPACE — 4 / 8 / 12 / 16 / 24 / 32, and nothing else.
  Kills paddingVertical 7 (stats chips), 9 (people), gap 5 (tallyCard), and the 10 vs 14 vs 18 disagreement between sibling screens. Screen gutter is 16 everywhere, including the three dead-end screens currently at 24.

RADII — three, semantic
  pill  999  buttons, chips, keys
  card   12  cards, sheets, rows
  plate   2  artwork and spines only — printed images have square corners
  Delete radius.lg (16) and radius.xl (24).

ELEVATION — three levels, NO SHADOWS
  L0 page   ground.page
  L1 card   ground.raised + 1px top inner highlight rgba(255,255,255,0.05) + 1px rule border
  L2 sheet  ground.raised + rule.strong border; active rows take a 2px amber left edge
  No drop shadows anywhere: they are invisible on this ground, and RN shadow/elevation parity across iOS and Android is a standing problem that buys nothing here. Depth is carried by rules and ground steps.

MOTION — five tokens, and nothing else moves
  instant  0ms                  press feedback: rule 1->2px + one ground step. Never animated, so the app feels equally responsive with motion reduced.
  quick    160ms ease-out       section rules drawing in, chips
  mark     220ms ease-out       the cross-off
  sheet    200ms linear         remote drawer, no overshoot
  drift    linear, constant     reaction stream ONLY — tape runs at constant speed; ease-in-out makes each reaction look animated at you instead of passing by
  Reduced motion: every token collapses to a single frame, haptics survive, the drift becomes appear-in-lane / hold REACTION_VISIBLE_MS / vanish. useReducedMotion.ts already exists and ReactionStream already consumes it, so this is one conditional per site. This system adds no second continuously-moving element anywhere in the app.

TARGETS — 44pt minimum as REAL LAYOUT HEIGHT, hitSlop on top, no exceptions. That includes the drawer handle and the shelf spines, both of which the source direction specified below 44 and both of which I am overruling. theme.ts's existing note about hitSlop being invisible to layout is right and applies here.


## The five changes that most change how it feels

1. GLOBAL (mobile/src/ui/theme.ts) — Add `type` and `space` by EXTRACTING what is already there, not inventing a ramp. The eyebrow (12/600/ls1/uppercase/muted) is byte-identical in stats, people, data, calendar, title/[id] and RemotePanel; the 30/700 display is byte-identical in index, search, discover, watchlist and more. Promote both, add title/row/body/bodyStrong/label/data/caption with explicit lineHeights, collapse 14 and 15 (82 of the 218 fontSize uses) into one body token, and fix space at 4/8/12/16/24/32 — which kills paddingVertical 7 (stats chips), 9 (people), gap 5 (tallyCard) and the 10/14/18 gap disagreement between sibling screens. Add a test in the spirit of palette.test.ts that fails on any raw fontSize outside the set. Why: this is first because it is cheap now and expensive in a month — the values have not drifted yet, so this is an extraction, not a migration. Every other change on this list gets hand-typed six times if it lands second.

2. GLOBAL, 7 pushed screens (08-stats, 09-calendar, 10-lists, 11-people, 12-account, 13-data, 14-remote) — Set headerShown:false on the Stack in `mobile/app/_layout.tsx` and give every screen one shared `<ScreenTitle>` at type.display on the 16pt gutter, with a 44x44 back control on pushed routes and an optional right-hand action slot. Why: right now 'More' is 30/700 in the body face at the 16pt gutter and 'Stats' is ~20pt in a visibly different face at a different inset — compare the 'a' and 't' of 'Stats' against 'Watchlist'. Seven screens in one voice and seven in another, and the switch happens on a plain push from More. It is the single loudest 'two apps' signal in the fourteen captures, and it is a small fix.

3. UP NEXT (03) and the title page — Replace the mark-watched control with the Cross-Off: a 44pt open ring at the row's right edge; on tap a stroke draws left-to-right across the episode title in 220ms, the ring fills amber and takes a tick, the row's text steps from primary to secondary, and a 6-second mono UNDO chip holds the ring's own position. Why: this is the loop the entire product exists for — research doc 03 says the 'what next, mark it, next' cycle is why people used TV Time — and today it is a control with no character attached to it. It also fixes a real defect for free: `unwatchLatest` exists in core/src/data/repo.ts:172 and nothing surfaces it at the point where the mistake happens. And it compounds: a season page shows S1 struck top to bottom and S2 struck to episode 7, so progress becomes a page you have visibly worked down instead of a percentage.

4. GLOBAL — Poster.tsx becomes a four-state title card with a locked API. Verified: it is currently two branches — `if (!url)` gives surface2 + fontSize 10 + `muted` + numberOfLines 3, otherwise a bare `<Image>` with no onLoad and no onError. States: (1) has artwork, 2:3, radius 2pt with a 1pt rule border so a dark poster still has an edge; (2) no artwork — the tape spine: 6pt label-colour band across the top keyed to a hash of the title id, title in Archivo Narrow 700 at type.label in PRIMARY text colour, kind/year in mono at the foot; (3) loading — a still 1pt circle-and-crosshair, no shimmer; (4) failed — 45-degree 1pt hatch plus a mono NO SIGNAL chip and retry. Replace free width/height with size ('sm'40|'md'64|'lg'96|'xl'128) and aspect ('2:3'|'16:9'), height always computed. Why: callers currently pass 64x96, 96x144, 44x64 and 40x56, so the same object is a different shape on Calendar than in the library. And an imported TV Time library is mostly state 2 permanently — this is the app's most repeated visual element and its ugliest reality, and the spine turns it into the best image in the product. It is also the one place the app breaks its own honesty rule: a downloading poster, a 404 and a genuinely artwork-less title are the identical grey box.

5. GLOBAL — One `<Button>` (variant primary|quiet|danger, width full|hug, one padding/type pairing) and one colour law: amber filled = the single most consequential action on the screen, max one per screen; amber outlined = current selection; amber mark = you did this; red = failure and destructive only. Why: index.tsx:335 defines `cta` as accent-filled/16/hug and calendar.tsx:226 defines `cta` — same style name, same label 'Find something to watch' — as surface2-filled/15/hug, so the identical sentence is a loud pink button on 03 and a quiet grey one on 09. Five screens, four button geometries. Nobody can learn what pink means because it does not mean anything, and the varying width puts each screen's action area in a different place.


## Missing information and functionality

1. NEW ROUTE + TAB — Add Library as a sixth destination and give it the tab slot currently held by Discover; Discover moves to a row on More. Poster grid over db.library, segmented Watching / Completed / Films / Unmatched, sorted by last watched, with a local filter field. Why: routes are exactly (tabs) index/search/discover/watchlist/more plus account, calendar, comments/[targetId], data, lists, people, remote, stats, title/[id], watching/[targetId] — there is no library route. 07-more counts 264 watches and 12 tracked titles and every one of them is unreachable unless it happens to have an unwatched next episode. This is the largest missing thing in the product.

2. SEARCH (04) — Query db.library first and render results under 'In your library' above 'Everywhere else'. Why: search.tsx calls `getProvider().search(q, controller.signal)` and nothing else — no db.library, no db.titles — so a title imported under the name your export carried and never matched to a provider is unfindable by that name. A large share of searches in a tracker are for something you already track; making people type to reach their own library is pure friction.

3. WATCHING MODE (mobile/app/watching/[targetId].tsx) — Add a persistent 'Watched' control in the header opposite Close. On press: markWatched({targetId, seriesId, runtimeMin}), honour openCommentsAfterWatch(), raise the same COPY.upNext.justMarked + Undo row that Up Next raises. When clock.positionMs passes ~90% of runtime, promote it to a full-width confirm at the foot of the pad; relabel Close to 'Leave without marking' once the clock has run and the episode is unmarked. Why: verified — `markWatched` appears zero times in that file. The screen has Close, Pause/Resume, Hold, −5s, +5s, a density radiogroup, the emoji pad, emoji search and drift-correct, and no completion. The one screen where the app is certain you watched the thing is the only screen that cannot record it. The flagship feature ends in a dead end and the fix is one button.

4. UP NEXT (03) — Move the transmission line (264 watches · 12 tracked · 5.5 days) from More to under the Up Next masthead, set in mono tabular. Why: it is the person's own record and it currently exists only three taps away on a settings menu. It also puts an object on a screen that is otherwise 80% black during the empty and importing states.

5. UP NEXT (03) — When libraryCount > 0 && entries.length === 0, the primary becomes 'Browse your library (12 shows)' and 'Find something to watch' drops to secondary. Why: today a person with 12 tracked shows and no unwatched episode is offered only 'go and find more', which is the wrong answer to 'what did I already have'.

6. TAB BAR — Give Up Next a mono count badge when episodes are waiting. Why: the app's central question gets no answer on the bar at all, so the person has to open the tab to find out whether there is anything to open it for.

7. REMOTE (14) — Add a persistent paired banner above the keys carrying device name and address plus a 'Not this one?' escape, and a 'Find my TV' primary replacing the transport row while unpaired. Why: there is currently no way to see what you are connected to or to change it, and no way to tell the paired state from the unpaired one except by whether the keys do anything.

8. DISCOVER (05) — Rank and vary the seed so a feed of four cards does not carry one sentence four times. Do NOT truncate: copy.ts:160 already does `because.slice(0,2).join(' and ')` and recommend.ts:93 already sorts by `because.length`. The real cause is that two seeds dominate every suggestion. Why: the capture shows four cards all reading 'Because you watched Dark and Andor' — the same sentence four times is the loudest thing on the screen and it makes the recommendation feel mechanical.

9. 10-LISTS, 11-PEOPLE, 12-ACCOUNT — Delete the `centre: {flex:1, padding:24, justifyContent:'center'}` block that lists.tsx:304, people.tsx:390 and account.tsx:201 each carry and replace it with a shared `<Unavailable>` at the top of the normal 16pt flow: a type.title heading, the body explanation, one filled primary, one quiet secondary, and the honest 'not configured on this build' line in caption underneath. Lists and People point at /account; Account points at Your data as the honest local alternative. Note: `lists.signInAt(where)` does not exist — the parameterised sentence is `people.signInToFollow(where)`, already called in one branch of people.tsx:85, so the pattern exists and only lists.tsx:84 is missing it. Rewrite 'Sync is not configured on this build' as a fact about the app, not about the build. Do NOT render plausible-looking fake list cards at 40% opacity behind it. Why: three of More's seven rows resolve to one grey paragraph floating at 52% screen height at a gutter the rest of the app does not use, with no heading and no control. They read as error pages.

10. WATCHING MODE — The empty reaction stream needs its own state: the bare timeline plus mono 'No reactions recorded — yours will be the first.' Why: doc 08 says comment density is literally the number people rank trackers by. A band empty because the episode is new must not look like a band empty because something failed, and today they are the same nothing.

11. 06-WATCHLIST — Replace the two-sentence empty state with a 2-column grid of your own recently-finished titles under a 'Watch something again?' rule. Why: the screen is a title, two lines, a hug-width button and then void, on an app that already holds 264 watches. Emptiness should get an object, not a paragraph.


## Friction to remove

1. JOURNEY 'my export is on my phone' — 02-import-done: 'Later' is a 14pt muted underlined text link, the only underline in the app, and it is the fork away from matching 264 watches. Make it the quiet Button variant at the same width and rhythm as the primary above it. Why: the person who does not want to match right now has to find the least-designed element on the screen, and underline-as-link is a web idiom that reads as broken on iOS.

2. JOURNEY 'my export is on my phone' — 03-upnext during matching: no progress bar, no stop, and the only button on screen navigates away from the operation it is reporting on. Add the determinate bar (reuse RemotePanel's existing progressTrack/progressFill), a Stop that keeps what has matched, and make the run resumable. Why: MatchImports.tsx:105-106 renders progress as a text line while RemotePanel spends a real progress bar on a two-second Wi-Fi scan. The app owns the pattern and spends it on the trivial operation while the multi-minute one that decides whether the migration succeeded gets a sentence that changes every few seconds.

3. JOURNEY 'my export is on my phone' — after matching, there is nowhere to land. 02-import-done says in so many words 'They are in your library under the names your export carried' and there is no library route. Why: the app names a destination that does not exist, at the exact moment the person most wants to see that their history survived. This is the same defect as the Library item under (b) but it is worth naming as friction because it is where the onboarding journey terminates.

4. JOURNEY 'what do I watch tonight' — 03-upnext has no grouping whatsoever, so a show abandoned in July is visually identical to one that aired last night. Group rows under section rules: Tonight / New episode / Nearly done / Waiting since July. Why: the returning user's actual question is not 'what is unwatched' but 'what is worth starting now', and an ungrouped list cannot answer it. This is pure information gain from data already held.

5. JOURNEY 'mark it watched' — 05-discover: Track writes to the library and the card unmounts on the same frame. Verified: `track()` runs cache/addToLibrary/getEpisodesCached/setAdded/onActed, and onActed increments `round`, which re-runs getSuggestions, which excludes the library. Hold the card in place in a 'Tracking · Undo' state using the same component and the same copy.ts wording as the Up Next undo row, and drop it on the next natural refresh. Why: two buttons 8pt apart on fast-scrolled cards is where mis-taps happen, and the mistake erases the title's name from the screen so the person cannot even say what they just added. The app already built undo for a write of identical weight one tab over.

6. JOURNEY 'find something' — 04-search has no idle state and no no-results state; a search that matched nothing is byte-identical to a search never typed. Add a COPY.search block owning three states: idle (recent searches, then a strip of your own library, then browse-by chips), no results ('Nothing matched "{q}". Check the spelling, or try the original-language title — anime often has several names.'), and the existing error state, which is already well built. Why: this breaks the house honesty rule in the plainest way available — 'nothing found' and 'you have not asked yet' render the same 700pt of black. Anime makes it worse, because alternate-title misses are the normal failure mode and the screen gives no hint that a different name might work. It is also the only screen in the app with no owned copy: grep of core/src/copy.ts returns sync, app, upNext, watchlist, discover, lists, stats, calendar, watching, title, whereToWatch, comments, people, settings — and no search.

7. JOURNEY 'connect my TV' — 14-remote hides the only door. 'Scan Wi-Fi' is 17pt pink text right-aligned on the DEVICE eyebrow row, the smallest interactive element on the screen, while eleven inert keys render at full strength with two of them (⏯ and OK) in accent pink competing for primary. Make Scan the screen's primary action at full button weight, disable the keys with accessibilityState while unpaired, and give ⏯ the only accent in the transport cluster. Why: the person's entire job on this screen is 'connect to my TV' and every pixel of prominence is spent on controls that cannot work yet.

8. JOURNEY 'connect my TV' — the phone confirms keypresses it then discards. Verified: RemotePanel.tsx `press` fires `Haptics.impactAsync` unconditionally and first, then loops `remote.send`; useRemote.ts `send` opens with a bare `if (!device) return;` — no error, no state change. '⏪ 15s' is `press('back', 3)`, so it buzzes and drops three commands. Move the haptic to after a successful `adapter.send`. Why: a haptic is a promise that the television heard you, and unpaired is the default state every new user meets first.

9. JOURNEY 'look at my year' — 08-stats opens on 'This year' and reports Watched 0m / Episodes 0 / Titles 0 / Longest streak 0 days, one tap after 07-more says 264 watches and 5.5 days. Open on the widest window that has data (core/src/stats/compute.ts:34, DEFAULT_STATS_WINDOW='ytd') and set the chip to match; keep the existing 'Show all time' recovery for windows chosen deliberately. Why: this is not a fixture artefact — anyone importing years of history in January sees it. For a product whose pitch is 'your history survived TV Time', a stats screen reading as though it did not is the worst first impression available, and the fix is three lines.

10. JOURNEY 'go back' — 10-lists, 11-people and 12-account render with neither a back control nor a tab bar in these captures. VERIFY ON DEVICE FIRST: this may be an artefact of the capture route rather than the build. If it is real it is the highest-severity navigation defect in the app, because these are the three screens a curious person reaches first from More and there is no way out of any of them.


## Everything else worth doing

1. 08-STATS — Replace `figure: {flexGrow:1, minWidth:'45%'}` at stats.tsx:220 with a fixed two-column layout (width '48%', gap 12). Why: because the tiles are content-sized inside a wrapping row, the split between Watched/Episodes lands about 11pt away from the split between Titles/Longest streak. Four numbers meant to be read as a set sit on a grid that visibly bends. It is the most obvious alignment error in the fourteen captures and it is a two-line fix.

2. 13-DATA — Pass explicit `trackColor={{true: accent, false: ground.raised}}` and `thumbColor={text}` to the Switch. Why: no trackColor is passed, so it renders iOS system teal — a hue that belongs to no palette in this app and is the most saturated non-emoji pixel on the screen.

3. 13-DATA — Give 'Clear cached metadata' the danger variant: signal-tinted label on a level-1 surface, not a filled red button. Why: 'Export watch history (CSV)', 'Choose files' and 'Clear cached metadata' are three identical full-width grey pills with identical type, and one of them throws data away. The copy underneath does the honest work; the control gives the eye nothing.

4. GLOBAL (StarRating.tsx:45) — `⯪` (U+2BEA) is used for the half star and has poor coverage in iOS system fonts. Check on a device immediately; replace with a drawn half-star in the icon set. Why: a live tofu risk on the rating control, which is the Letterboxd half of the product's identity.

5. GLOBAL — Adopt one drawn icon set as an in-repo SVG sprite (no runtime dependency) on a 24pt grid at 1.5pt stroke, filled only when active. Replace the five tab glyphs in (tabs)/_layout.tsx:32-36, the six remote glyphs in RemotePanel.tsx:87-102, the calendar tick at calendar.tsx:94 and the stars. Watchlist becomes a bookmark, not `☰`, which is the universal sign for 'menu' — which is what the tab next to it actually is. Keep the existing accessible names; they are already correct. Why: `⌕` has roughly half the optical mass of `☰`, so the tab bar visibly wobbles between 04 and 06.

6. 14-REMOTE — `⏪` and `⏩` render as full-colour Apple emoji: two bright orange glyphs inside the largest control cluster in the app, next to a monochrome `⏯` on pink and geometric triangles at two different sizes. Three rendering modes in one 400pt cluster. Why: this, not the teal Switch, is the biggest colour incident in the build.

7. 14-REMOTE — Unify the three clusters onto one column grid: transport as full-width thirds, D-pad as centred narrow keys, Home/Vol−/Vol+ as full-width thirds. Why: three different column widths currently stack inside 600pt, so nothing lines up vertically down the screen.

8. WATCHING MODE — Rebuild the transport row as two fixed rows above the pad: row 1 is Pause · Hold · −5s · +5s as four equal 48pt cells sharing rules; row 2 is the density selector under a 'Reactions shown' label. Why: the file's own comment at watching/[targetId].tsx:365 records the row measuring 690px in a 390px viewport. Equal cells reflow to 2x2 at 200% instead of pushing controls off the edge.

9. WATCHING MODE — `padLabel` is fontSize 9. Move it to type.label (13/18) in primary text colour. Why: 9pt muted grey is unreadable in a dark room at arm's length, which is the exact and only condition this screen was designed for.

10. WATCHING MODE — Invert the header hierarchy: timecode to 34pt mono tabular as the hero, S02E07 above it, series name smallest. Move the drift-correct nudge directly under the timecode as a 1pt amber-ruled strip. Why: you already know what you are watching; the number you glance down for is the one telling you whether you are still in sync. The one-tap correction currently renders far from the number it corrects, so it reads as an unrelated notice.

11. WATCHING MODE — Give the remote drawer a handle: a vertical tab on the right edge, 44pt wide as real layout, carrying 'Remote'. Why: it is currently a drawer with no affordance, which means a flagship feature nobody will find.

12. 05-DISCOVER — Promote the reason to a section rule printed once ('BECAUSE YOU WATCHED DARK AND ANDOR' with the rule running to the right edge) and list the titles beneath it as rows. Move the TMDB attribution to the page foot under a rule in mono 11pt. Why: this deletes three redundant lines and creates the hierarchy that is currently absent, and a colophon belongs at the foot.

13. 05-DISCOVER — The 'Watchlist' button is grey-on-grey and reads as disabled. Give it the quiet variant with a rule outline. Why: outlined reads as available; grey-on-grey reads as off, so half the actions on the screen look broken.

14. GLOBAL — Delete radius.xl (24) and radius.lg (16). Why: more.tsx, people.tsx, account.tsx and comments use 24 for a card while stats.tsx and calendar.tsx use 16 for the same object, so a card on More and a card on Stats are different objects with no reason.

15. GLOBAL — Extend app/src/ui/palette.test.ts to the new roles: every text token clears 4.5:1 on every ground it can land on, every label-set colour clears 3:1 on both grounds, and the label set is never used as a text token. Why: the existing test is the reason this codebase's palette is trustworthy; adding tokens without extending it is how it stops being.


## The first sprint

ONE SPRINT: "One voice, one law, one loop." Sequenced so nothing gets typed twice.

DAYS 1–2 — TOKENS FIRST, NOTHING ELSE.
Add type, space, radius, elevation and motion to mobile/src/ui/theme.ts, plus the two chromatic roles and the label set. This is an EXTRACTION, not an invention: the eyebrow is byte-identical in six files and the 30/700 display is byte-identical in five, so the ramp already exists and is being promoted, not designed. Add the lint test that fails on a raw fontSize outside the set, and extend app/src/ui/palette.test.ts to cover the new roles. This is first because it is cheap today and expensive in a month — the values have not drifted yet, and the app is one careless edit away from six different eyebrows. Everything below gets hand-typed six times if it lands second.

DAYS 2–3 — ONE VOICE, ONE LAW.
`<ScreenTitle>` + headerShown:false on the Stack + a 44x44 back control on all seven pushed routes. The second typeface disappears; the app stops reading as two apps. Then `<Button>` with three variants and two widths, applied everywhere, and the colour law landed with it: Switch gets explicit trackColor, "Clear cached metadata" gets danger, "Scan Wi-Fi" becomes the Remote's primary at full button weight with the keys disabled while unpaired, "Later" on 02 becomes a quiet button instead of an underlined web link. Five screens currently carry four button geometries for the same sentence; after this they carry one.

DAYS 3–4 — THE POSTER.
Poster.tsx becomes the four-state title card with the locked size+aspect API. This is the highest-leverage single component in the build: it appears on 03, 04, 05, 06, 09, the title page and MatchImports, it is currently the same grey box whether the image is downloading, 404, or genuinely absent, and it is the one place the app breaks its own honesty rule. After this the app has an image on every screen that has data, and the tape spine turns an unmatched import from an apology into the product's best picture.

DAY 4 — THE THREE CHEAP LIES.
Stats opens on the widest window with data (three lines in core/src/stats/compute.ts) so More and Stats stop contradicting each other. The stats tile grid stops bending (two lines in stats.tsx:220). Discover's reason is promoted to one section rule printed once instead of the same sentence four times, and the TMDB attribution moves to the foot. Half a day, and it removes the app's worst first impression: a stats screen reading as though your history did not survive.

DAY 5 — THE LOOP.
The Cross-Off on Up Next rows, with the six-second UNDO chip surfacing the `unwatchLatest` that already exists. Reduced-motion branch included from the first commit, not retrofitted — useReducedMotion.ts is already there.

WHY THIS AND NOT SOMETHING ELSE. Days 1–4 touch all fourteen screens: every title, every button, every poster, every number. Day 5 touches one screen but it is the screen the app is for, and the owner needs to see the concept rather than only the cleanup. That combination is what turns "installed it and it needs a massive overhaul" into "this is a different app."

WHAT I AM DELIBERATELY NOT DOING IN SPRINT 1, and why. The Library route is the largest missing thing in the product and it is sprint 2's headline — it needs a real screen, a segmented control and local search over db.library, and it will consume a sprint on its own. Watching Mode's rebuild (the Watched button, the 690px transport row, the 9pt pad labels) is sprint 2 as well; the Watched button alone is a one-day fix and if anything slips from sprint 1 I would trade Day 4's Discover work for it, because a flagship feature that cannot record a completion is worse than a redundant sentence. The icon set is drawn during sprint 2 and landed in one commit — it is the loudest remaining "assembled, not designed" signal after the type scale, but it is a day of drawing and nothing else blocks on it.

ONE THING TO VERIFY ON DEVICE BEFORE DAY 1: whether 10-lists, 11-people and 12-account genuinely render with neither a back control nor a tab bar, and whether `⯪` (U+2BEA) renders or tofus on the rating control. Both are five-minute checks and both change what Day 2 has to fix.


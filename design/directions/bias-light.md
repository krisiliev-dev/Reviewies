# Bias Light

One of three visual directions commissioned for Reviewies, each generated from a
different starting point and written without sight of the others.

## The idea

A "bias light" is the strip of light people put behind a television so the room isn't a black hole around a bright rectangle. It is also, conveniently, what a review is: the light you cast on a thing. Bias Light treats the app as the dark room rather than as a document — the phone is the second screen in your hand while the real screen is across the room. Nothing in the interface glows on its own; light only comes off artwork. Every poster and still casts its own clamped colour into the space around it, so the app takes on the tone of what you are actually watching instead of wearing one house accent everywhere. Structure comes from the two things cinema is physically made of: the matte black bar and the frame. The tab bar is the bottom letterbox band, opaque and black in both themes, because it is the frame and not the picture. Personality comes from the two typographic artefacts nobody mistakes for anything else — the title card and the billing block. And the whole thing is organised around one moment the current build has no design for at all: the cut to black at the end of an episode, when you turn to the person next to you and say something. The current app has 264 watches in it and no place where saying something is the natural next thing. That moment is the product.

## The signature move

THE CUT TO BLACK.

You mark an episode watched. The write lands first, silently, in the local database — the ritual is decoration over a completed action and can never delay or block it. Then the entire screen cuts to black. Not a fade: a hard cut, 0ms, the way a cold open ends. It holds for 400ms of real nothing. Then a title card fades up over 240ms, lit by that episode's bias light: the episode name in Instrument Serif 28 centred, `S2 · E7 · 48 MIN` in tracked condensed caps beneath a hairline rule, and one line — "Say something?" — with the six reaction emoji in a row and a text field already focused. Type nothing and it dismisses itself in six seconds back to Up Next with the next episode already in place. Type something and it is a review, attached to that episode, at the only moment you actually have an opinion.

That is the thing somebody describes to a friend: "it does the credits thing, and then it asks you what you thought." And it is not decoration — it is the fix for the structural hole in the product. This app is TV Time plus Letterboxd, and right now marking an episode watched is a checkbox with no exit into saying anything. The credits are where people talk. The app should be there.

Restraint, because doing this on every mark during a six-episode binge would be intolerable: the full cut fires on the first mark of a sitting and on every season and series finale. Subsequent marks in the same sitting get a 120ms flicker — one frame's dip in luminance, the projector stutter — and a compact inline card in the row you just marked. Off entirely in More, one switch, no nagging.

Reduced motion: no black hold at all (a 400ms full-screen luminance change is well under any flash threshold but it is still motion someone asked not to have). The card simply is there, already up, no cut and no fade. The prompt, the emoji and the field are identical. Nothing is lost, which is the standard this codebase already holds for the reaction stream.

Secondary, and the one people notice on the second day: THE HEAT RULE. In Watching Mode, every reaction that drifts past leaves a 1pt amber tick on a rule at the bottom of the stream band. Over forty minutes that rule fills in as a map of the moments everyone reacted to — you can see a punchline coming three seconds out. It costs nothing, it is the danmaku turned into a shape, and it is honest: it is history, not a live crowd.

## Palette

Two fixed palettes, plus one derived colour that is never allowed to carry meaning.

DARK — "The Room" (default; this is an app used with the lights off)
- room  #0A0A0C — page. Deeper and less blue than the current #0b0b0f.
- riser  #16161A — cards, rows, fields (replaces #15151d)
- riser2 #212127 — pressed/selected fill, chips (replaces #1f1f2b)
- edge  #33333C — 1px hairlines only, never a fill
- text  #F4F3F0 — warm off-white, "projector white" not blue-white. 17.9:1 on room, 16.7:1 on riser.
- muted #9E9EAA — 7.5:1 on room, 7.0:1 on riser. Safe for 11pt labels.
- amber #FFB454 — the house light / the on-air glow. 11.2:1 on room, 10.5:1 on riser. Text on amber is room #0A0A0C at 11.2:1.
- amberDim #8A6428 — idle borders, unfilled progress rules
- cyan  #79D2E4 — links, "where to watch", informational. 11.5:1 on room.
- coral #FF7A6B — failure and destructive only. 8.1:1 on room.
- true black #000000 — Watching Mode background and the tab-bar band only.

LIGHT — "House Lights" (paper, not white — the colour of a cinema programme)
- room  #F6F3EC
- riser  #FFFFFF
- riser2 #EDE8DE
- edge  #D8D2C6
- text  #141317 — 16.9:1 on room
- muted #5B5860 — 6.3:1 on room
- amberInk #7A4A00 — 6.5:1. Used when amber has to be a *word*.
- cyanInk  #0F5C6B — 6.6:1
- coralInk #9A2A1E — 6.7:1

The inversion that makes light mode a real design rather than a chore: in the dark, light is the accent — the primary button is a solid amber pill with room-black text. In the light, dark is the accent — the primary button is a solid #141317 pill with paper text, and amber demotes to a 3pt marker rule under the label, like a highlighter. Amber at #FFB454 on paper is 1.7:1 and is therefore forbidden as a text or icon colour in light mode; it survives only as a filled rule, a fill behind ink text, or a progress edge. That rule is enforceable in a lint test the same way palette.test.ts already enforces the pairs.

THE DERIVED COLOUR (bias light) — the rules that stop it becoming mud
Sample the poster or still, convert to OKLCH, clamp chroma to <= 0.09 and lightness into L 0.28–0.42 (dark) / L 0.80–0.90 (light), then render it as a vertical gradient at 14% alpha behind the top of the screen. It is never a text colour, never an icon colour, never a state. It never sits directly behind body copy — any text block is on an opaque riser composited over it. It has an off switch in More, and it snaps rather than crossfades under reduced motion. Because it is clamped, a neon anime key art and a grey prestige drama both land in the same narrow band of plausible room light, which is exactly the point: it tints the room, it does not repaint the app.

Colour-blind safety: amber and coral are an orange/red pair and are unsafe as the sole signal for anyone with protanopia. Coral therefore never appears without an icon and a word ("Couldn't reach TMDB"), and amber never appears without a shape — the watched mark is a filled dot plus the rule, not the colour alone.

## Typography

Three families: one voice, one workhorse, one label. All available free (Google Fonts) so the phone and the web can use the identical stack, which matters given copy already has one owner.

- Instrument Serif (Regular + Italic) — the personality. High contrast, ball terminals, slightly eccentric; it is a film title card. Used only large and only for names: screen titles, the episode title on the Up Next hero, the title card that appears after a mark, the no-poster plate, and a saved-reason or review pull-quote in Italic. Never below 20pt, never for UI chrome, never for a number.
- Inter (Regular / Medium / SemiBold) — everything functional: body, buttons, rows, results. Chosen over SF because the web app has to match it exactly, and because its tabular figures are switched on globally for numerals — this app is full of S2E7, 00:14:22, "3 of 12", 48 MIN, and today those all jitter.
- Archivo Narrow (Medium, uppercase, +0.08em tracking) — the billing block. Every section header, every metadata string, every tab label, every chip. This is the single move that makes the app read as film rather than as a generic tracker: the condensed tracked caps under a poster is the most recognisable typographic artefact in cinema, and it happens to be the densest way to fit "SERIES · 2021 · 3 SEASONS" on a 390pt phone. It replaces the current all-caps Inter labels ("TELL ME ABOUT", "DEVICE", "NEXT TWO MONTHS") which are correct in intent and characterless in execution.

Fallbacks: Instrument Serif → New York, ui-serif. Inter → SF Pro, system-ui. Archivo Narrow → Avenir Next Condensed, ui-sans-serif.

SCALE (4pt baseline, 390pt frame)
- Title card    Instrument Serif 40/40, -0.01em — every screen title
- Display       Instrument Serif 28/32 — hero episode title, plate titles
- Heading       Inter SemiBold 20/26
- Body          Inter Regular 16/24
- Body small    Inter Regular 14/20
- Credit label  Archivo Narrow Medium 12/16 caps +0.08em
- Micro/clock   Inter Medium 13/16 tnum

Fixes this scale forces: the current build has two different title treatments — tab screens use ~48pt system Bold ("Up Next", "Discover") and pushed screens use ~34pt Light ("Remote", "Lists", "People"). Both become the one Title card. The 9pt emoji-pad label and the 10pt poster-fallback text in Watching Mode and Poster.tsx are the worst numbers in the build — unreadable in a dark room at arm's length — and both go to the 12pt credit label.

At 200% Dynamic Type: everything scales, nothing is a fixed-height header, and every screen title is allowed to wrap to three lines. Above ~150% the Title card swaps from Instrument Serif to Inter SemiBold, because a high-contrast serif at 80pt in a 358pt column loses its thin strokes and its counters close up. That is a substitution, not a downgrade, and it keeps the 200% pass the house already holds.

## The poster slot

Today Poster.tsx is one component doing one job: a 64x96 box, radius 12, filled #1f1f2b, with the title at 10pt muted centred over three lines. In Discover it renders at ~145x200 and reads as a hole in the card. It splits into two and both get treated as printed objects lit on a dark wall.

TWO SHAPES, NOT ONE
- Poster, 2:3, radius 6 (not 12 — sharp-ish corners read as a card, not an app widget). For titles: search results 56x84, watchlist grid 3-up ~112x168, discover grid 2-up 168x252.
- Still, 16:9, radius 6. For episodes. This is missing today and it is a real gap: Up Next is a question about an *episode*, and it is currently answered with a series poster.

Both get a 1px inset hairline at 12% white (dark) / 10% black (light) so a dark poster does not dissolve into the room, and a 6pt soft shadow beneath. Lit object, dark wall.

THE BOTTOM EDGE IS THE PROGRESS BAR
A 2pt rule along the full bottom edge of every poster: amber filled to the fraction of the season or series you have watched, amberDim for the rest. Full-width solid amber means finished. This kills the separate progress row that every card in a tracker otherwise needs, and it is readable at 112pt wide from a metre away. Never colour alone: a finished title also carries a 10pt filled dot in the top-right corner, and the accessible label says "7 of 10 episodes watched".

NO POSTER — THE PLATE
This is the important one, because a real imported library from a TV Time GDPR zip is full of titles that never matched a provider. A missing poster becomes a designed minimal poster, not a failure box.

The plate is a solid fill whose colour is derived deterministically from a hash of the title, run through the same OKLCH clamp as the bias light — so it is always a plausible film colour, never neon, and the same show is always the same colour, which makes a grid of unmatched titles navigable by memory. The title sets in Instrument Serif, left-aligned, bottom-aligned, with a hairline rule above it and the year in Archivo Narrow caps beneath. It looks like something someone designed. Below ~90pt wide it drops the year; below ~56pt it drops to the initials plus the rule; below 40pt it is the plate colour and the hairline only. Text truncates to three lines with a real ellipsis and the full name is always on the accessible label.

THREE STATES, VISIBLY DIFFERENT — the house honesty standard applied to an image slot
- Still working: plate plus a slow 1.2s diagonal shimmer, accessible name "Loading artwork". Stopped dead under reduced motion, replaced by a static hairline pulse-free tag reading LOADING.
- Nothing there: static plate, no shimmer, no tag in lists (too noisy at 40 per screen), and one small Archivo Narrow caps tag "NO ARTWORK" in the corner on the title detail screen only, next to the existing "Use a different poster" control.
- Could not look: static plate with a 1px dashed edge and the tag "ARTWORK UNAVAILABLE OFFLINE". This is the state the app currently cannot express at all, and it is the difference between "this show has no poster" and "you are on a train".

SPOILER RULE
For an episode you have not watched, the still is replaced by the plate and the episode name is masked to `S2 · E7` until you tap it. Episode-specific artwork appears only once the episode is watched. The Up Next hero therefore uses series key art or a season still, never the still from the unwatched episode.

## The screens

TAB BAR
Currently five font glyphs (▶ ⌕ ✦ ☰ ⋯) at 18pt with 10pt labels and a pink tint. ⌕ renders thin and undersized, and ☰ means "menu" everywhere on earth, not "watchlist". Replace with a 24pt icon set (SF Symbols on iOS, matching SVGs on web): play.rectangle / magnifyingglass / sparkles / bookmark / ellipsis.circle. Filled when active, stroked when not. Watchlist becoming a bookmark is a genuine comprehension fix, not a restyle.

The bar sits on a matte band — #000000 in dark, #141317 in light — with an edge hairline above it. It stays dark in both themes because it is the bottom letterbox bar of the frame, not part of the picture. That constant is the most recognisable thing about the app in a screenshot. Active state is amber tint plus a 4x2pt amber rule directly beneath the icon — the light under a door — so active is never colour-only. Labels in Archivo Narrow 11 caps. At 200% text labels drop and icons go to 28pt with the accessible name intact, per platform behaviour. Opaque, no blur.

1 — UP NEXT (390x844, currently: a title, a paragraph, one pink pill, and 900px of nothing)
- The Strip: top 44% is one edge-to-edge 16:9 still for the single episode you are most likely to watch now. Bias light from it bleeds down over the whole screen. Bottom-left over the still: series name in Archivo Narrow caps 12, episode title in Instrument Serif 28, then `S2 · E7 · 48 MIN · NETFLIX` in the credit label. Two controls: a full-width amber "Watched" pill and a ghost "Watching Mode" pill beside it.
- Runtime and streaming service on that line are new and they are the point. The single most common real question is "I have twenty minutes before bed" and the app currently cannot answer it. WhereToWatch.tsx exists in the codebase and never appears on the screen where the decision is made.
- Below the Strip: `TONIGHT` — a horizontal rail of 16:9 stills, one per tracked show, each with the bottom-edge progress rule and `3 LEFT THIS SEASON` beneath. Then `STILL GOING` and `WAITING ON YOU` as separate credit-label sections. There is no sectioning at all today.
- Import progress: "Matching… 3 of 12, 0 matched so far" is currently a paragraph in the middle of an empty screen. It becomes a 2pt determinate bar pinned under the title with `MATCHING 3 OF 12 · STILL WORKING` and a Stop control — determinate because the count is known, and it keeps saying "still working" rather than implying a settled state.

2 — SEARCH (currently one field on a void)
- 44pt field on riser with a leading magnifier and a clear button.
- The screen is never empty: `RECENT` (last 8 queries, one tap to rerun, stored locally) then `BROWSE` — a 2-column grid of Instrument Serif plates: Anime, Films, Ongoing, Ended, By Decade. A search screen with nothing on it teaches you nothing about what the app knows.
- Result rows: 56x84 poster, title Inter 16, `SERIES · 2021 · 3 SEASONS` credit label, and a 44pt trailing + that opens Track / Watchlist. Each row states what you already have: `TRACKING`, `ON YOUR WATCHLIST`, `WATCHED 2019`. Missing today, and it is what prevents adding the same show twice.

3 — DISCOVER (currently four identical stacked cards with a 145x200 grey hole on the left, and the same sentence on all four: "Because you watched Dark and Andor")
- Poster-forward: 2-column grid of full-bleed 2:3 posters at 168pt, each cell bias-lit, title in Inter 16 beneath, reason in the credit label.
- The reason has to be per-item and true. `BECAUSE OF DARK` when the engine actually has a link; `POPULAR THIS WEEK` or `SHARES A GENRE WITH YOUR WATCHLIST` when it does not. Repeating one generic sentence on every row is the fastest way to teach someone the recommendations are noise.
- Track stays a real 44pt corner button on each cell — nothing important is gesture-only.
- The TMDB attribution currently floats orphaned in the middle of the page; it pins to the section foot at 11pt muted.

4 — WATCHLIST (currently one sentence and a pill)
- The shelf: 3-column poster grid with the bottom-edge rule. Segmented control in credit caps: `ALL · FILMS · SERIES · ANIME`.
- Sort by runtime is a first-class option alongside date added and title. Same reason as Up Next: time available is how people actually pick.
- The saved reason — the copy already says "Add something from Search, then say why you saved it", which is good — renders as one line of Instrument Serif Italic under the poster. That italic note is the Letterboxd half of the product finally showing up on a daily surface instead of only inside a detail screen.
- The empty state keeps its honest sentence but gains three plates: Popular now, From people you follow, Browse anime. Empty is a place to start, not a dead end.

5 — MORE (currently eight identical grey slabs, ~1500pt of scroll)
- The Ledger at the top: `264 WATCHES · 12 TRACKED · 0 SAVED · 5.5 DAYS` set as an end-credit block — labels left in Archivo Narrow caps, numbers right in Inter tabular, hairline rules between. Replaces three nested cards inside a card.
- The eight destinations become one grouped list with hairlines and 24pt leading icons. Dropping the card chrome recovers roughly 200pt of vertical space and makes the list scannable in one pass instead of two.
- "Running on sample data. Set a TMDB token to use real metadata." currently collides with the tab bar; it moves into a proper footer with 24pt clearance.

Also worth naming: Lists and People are currently a title at the top and a paragraph floating at 52% of the screen height with nothing between — a layout accident. Both get the plate treatment: title card, then the honest sentence in a bordered riser at the top of the content area, then a preview of what the feature looks like when it works. Stats keeps its four tiles but sets the numbers in the Ledger style and drops "Longest streak" from the default view — a streak counter in a tracker is pressure, and pressure is why people quit trackers.

## Motion

Five things move. Everything else is instant.

1. THE CUT — mark watched. Hard cut to black, 0ms, hold 400ms, title card fades up 240ms. Meaning: an episode ended. Repeat marks in the same sitting get the 120ms flicker instead — a single frame's luminance dip, the projector stutter.
2. THE BIAS LIGHT — 600ms ease-in-out crossfade when the focused artwork changes. Slow enough to read as a room light changing rather than as a UI transition. It is the only ambient motion in the app.
3. THE DRIFT — Watching Mode reactions, right-to-left, linear, 6 seconds, four lanes. Linear on purpose: danmaku has to be predictable to be readable. This already exists and is already correct.
4. RISE — sheets, the remote drawer, the emoji search expansion. 280ms on cubic-bezier(0.2, 0, 0, 1) — the house-lights curve, fast off the mark and a long settle.
5. PRESS — 0.96 scale over 90ms, plus the light haptic already wired on every state-changing tap.

Nothing loops. No indeterminate spinner anywhere a count exists — the import knows it is on 3 of 12 and shows a determinate bar. Where the count genuinely is not known, a three-dot pulse with the word "Still working" beside it, never the bare animation, because the animation alone cannot distinguish working from stuck.

REDUCED MOTION — every one of these is a substitution, never a removal:
- The Cut: no black hold at all, no fade. The card is simply already there. Same prompt, same emoji, same field.
- The bias light: snaps at the moment of change instead of crossfading.
- The drift: falls back to the static spread placement already implemented in ReactionStream's `still` branch — every reaction still visible, none of them travelling. Keep this exactly as it is; it is the best piece of reduced-motion work in the build.
- Rise: 0ms position change, 120ms opacity only.
- Press: opacity step to 0.7 rather than scale.
- The poster shimmer: replaced by a static LOADING tag.
And independently of the OS setting, the Hold control in Watching Mode still stops the stream dead, because WCAG 2.2.2 wants a manual stop for anything that moves for more than five seconds and an episode is forty minutes.

## Watching Mode

The flagship, and today the most crowded screen in the app: a two-line centred header fighting a timecode, an unmarked stream gap, a control row of five buttons plus a three-chip density picker that wraps, a drift banner, a 4-across emoji pad with 9pt labels, a search field, and an invisible drawer. Six decisions in a room where you cannot read.

THE ROOM
Background goes to true #000000, not room #0A0A0C. On OLED this means the phone stops being a lit rectangle in your peripheral vision while you watch the television — a real physical reason, not a style choice, and the one screen in the app that earns pure black.

AUTO-DIM. After eight seconds without a touch, the header, controls and stream band drop to 55% opacity and the pad's labels fade out; the emoji themselves stay at 100%. The phone recedes and the TV is the only thing in the room again. Any touch restores everything instantly. The dim never takes anything below AA against black, and under reduced motion it is a step rather than a fade.

THE HEADER — one letterbox bar, one line
`Close` left in Inter 15, series name centre in Archivo Narrow caps 11, timecode right in Inter tabular 15. The episode title moves out of the header entirely — you know what you are watching. When drift is detected, the bar's centre becomes `2S BEHIND · TAP TO FIX` in amber caps, replacing the separate drift card that currently sits mid-screen.

THE STREAM — a defined band, not an unmarked gap
136pt tall, hairline underneath, so it is visibly the feature rather than black space that occasionally has emoji in it. The existing resting sentence stays inside it. Reactions drift as they do now. New: the HEAT RULE along the band's bottom edge — every reaction that passes leaves a 1pt amber tick, and over the episode the rule fills in as a map of the moments people reacted to. You can see a laugh coming. It is a shape made of history, which is exactly what this feature is and what makes it work on day one when a live chat would be empty.

THE PAD — this is the screen
3 columns, not 4. Each button 118pt square on riser, emoji at 44pt, label in Archivo Narrow caps 12 beneath. Today it is 4 across at 23% width with a 30pt emoji and a 9pt label — roughly 90pt targets carrying text nobody can read in the dark. Three across gives targets you can hit without looking down for more than a moment, which is the entire premise.

THE CONTROLS — collapsed to what you need mid-episode
Pause/Resume and −5s/+5s stay on screen as three large controls. Hold, reaction density and the drift correction move behind one `Adjust` control opening a sheet. Hold remains reachable in one tap from that sheet and keeps its own accessible name; nothing loses its label or its role, it loses its permanent square footage. Emoji search collapses to a 44pt "Any emoji" button that expands the field on tap, giving the pad back two rows of height.

THE DRAWER — currently invisible until you already know it exists
This is the biggest discoverability failure in the build: a remote control drawer parked off-screen at translateX(300) with no affordance at all. It gets a 3pt amber vertical rule on the right edge of the screen, 120pt tall, vertically centred, always present — the light under a door. Tap it or drag it. The drawer itself is a matte black panel with four large controls; the orange ⏪ and ⏩ emoji currently used as button glyphs are replaced with proper icons, because a multicolour emoji inside a control is off-palette, renders at whatever size the font decides, and is unreadable at a glance in a dark room.

WHAT DOES NOT CHANGE
The screen-reader summary — collecting a burst and speaking "four laughing" once rather than twenty-four interruptions a minute — stays exactly as built. The Hold control stays a separate concept from the clock's Pause. The static-spread reduced-motion fallback stays. Those three are the best decisions in the current code and the redesign is built around them, not over them.

## What this direction refuses to do

- Refuses to show artwork or episode titles for episodes you have not watched. Episode stills and names are the single largest spoiler vector in a tracker and every competitor gets it wrong. An unwatched episode shows the title-card plate and 'S2 · E7' until you tap to reveal; the Up Next hero uses series key art or a season still, never the unwatched episode's own frame. This costs real beauty — screenshots of Up Next would look better with the actual still — and it is worth it, because the app's job is to get you to the episode, not to show it to you first.
- Refuses to put a public score anywhere in the main flow. No aggregate rating on a poster, no '87% liked this', no community average shown before you have rated something yourself. The ratings you see are the ones from people you actually follow, or none. The moment a crowd's number is on the card, your opinion stops forming and starts agreeing — and this product's whole reason to exist is that it is your history and your taste. This forfeits an easy engagement surface and a cheap sorting axis.
- Refuses translucency and backdrop blur entirely — including the tab bar, the remote drawer and every sheet. Every surface is opaque and sits on the black. Partly because blurred chrome is a costume, but mainly because it makes text contrast depend on whatever happens to be scrolling behind it, which means the contrast can no longer be tested. This codebase has a palette test that fails when any pair drops below AA. A blurred surface cannot be checked by that test, and a rule you cannot check is a rule you do not have.

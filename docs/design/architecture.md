# The information architecture

**The finding is not a defect in any screen.** Every screen in this build has been
reviewed, photographed, measured for contrast and target size, and repaired. The app then
went on a real iPhone, and what came back was that the *shape* is wrong: this is a
tracking app whose navigation does not do what a tracking app is expected to do. A screen
can be right and still be in the wrong place, and no per-screen pass can see that —
`direction.md` decided what the product looks like, and nothing has ever decided what it
*is a map of*.

So this document is the map. What each surface is **for**, in one sentence; what the tab
bar becomes; what moves; and — the part that makes it a decision rather than a wish list —
what is refused.

---

## 1. What each surface is for

One sentence each, and the sentence is a **question a person arrives with**, not a noun.
A surface that cannot be named by the question it answers is a surface that will be
confused with its neighbour, which is precisely the report this document exists because of:

> *"I am unsure what the difference between the Watchlist and Upcoming is."*

From the source the two are genuinely different — `mobile/app/(tabs)/watchlist.tsx` is
*things you mean to watch, with a note saying why*, `mobile/app/calendar.tsx` is *what is
airing next, plus how loudly to be told about it*. **A distinction only legible in the code
is not one the user has.** The answer is not a better label on Upcoming. It is that Upcoming
was never a destination: what is airing is a fact about the shows you are already watching,
so it belongs on the screen about the shows you are already watching.

| Surface | The question | Where it lives |
|---|---|---|
| **Up Next** | *What do I watch tonight, what have I just watched, and what is coming?* | tab 1, `/` |
| **Discover** | *What is there, and where is that one thing I am looking for?* | tab 2, `/discover` |
| **Watchlist** | *What did I mean to watch, and why did I save it?* | tab 3, `/watchlist` |
| **More** | *Everything not done daily.* | tab 4, `/more` |

The three content surfaces are now **your history / everything else / your intentions**.
Those are three different relationships to a title and nobody has to be told which is
which.

## 2. The tab bar becomes four

`upnext · discover · watchlist · more`.

Five was a **cap**, not a target — iOS collapses a sixth into "More" and the loudest
finding in the research was that people want this simple. Two tabs merge into one
(`Search` into `Discover`) and one row leaves More entirely (`Upcoming` into Up Next), so
the bar loses a tab and the product loses a destination.

**A fifth tab invented to fill the bar is the exact defect this pass removes**, and it is
worth saying because there is an obvious candidate — `direction.md`'s graft 1 wants
Library as a tab. That graft is not refused; it is **not started**, and the bar has room
for it when it is built. It is not going in as a placeholder.

`TAB_ICON_PATHS` keeps `search` and `upcoming` after the bar stops offering them, for the
reason it already keeps `lists`, `stats` and `data`: the table is the drawings for the
product's *surfaces*, not for the five slots of one control, and `tabIcon.test.ts` has
required `paths ≥ tabs` rather than `paths = tabs` since it was written.

## 3. Up Next gets a past

**The one bullet with the highest daily value, and the one built first.**

Up Next was forward-only. Every tracking app people came here from puts what you have
already watched **above** the current position, so scrolling up walks backwards through
your evening — and this one, whose whole subject is a record of attention already spent,
had no past at all. `db.watches` has been carrying it since the first commit; nothing had
ever drawn it.

- Watched episodes render **above** the list, most recent nearest the fold, so scrolling up
  goes further back in time. Same `Row`, same poster, `struck` — already crossed off,
  because they are.
- The order is **the order you watched them**, `watchedAt` descending, which is not the
  order they aired and not the order the shows sort in. A rewatch appears twice, because it
  happened twice.
- Each row's cross-off is filled and reversible, so the mis-tap you noticed a minute later
  has a way back that is not "find the show, find the season, find the episode".
- The history carries its own heading, so the fold is legible: the words above the rule say
  what is above it, and Up Next's own masthead says what is below.
- **The screen still arrives at the present.** Both requirements are real and they are not
  in conflict. The most forcefully stated finding in the research is that the app *"opens
  directly to the page where I can see and mark the next episodes"*; this section's finding
  is that the past should be *up*. So the past is laid out above and the screen scrolls past
  it once, on arrival — the arrangement of a transcript, which is what an evening's watching
  is. Once, and guarded by a ref rather than by a dependency list: marking an episode is a
  write, every write re-runs the queries, and a scroll that re-fired would yank the page
  back on the one action the product exists for.

## 4. Up Next gets a second tab: what is coming

`Upcoming` is not a destination any more. Up Next carries a two-option `Choice` —
**Watching** and **Coming** — and the second is the calendar: what airs next, grouped by
day, with the notification granularity behind its existing reveal.

This is one screen with two tabs, not two screens: the same masthead, the same tab
highlighted, the same place in the app. The segment is in the address (`?on=coming`) so a
deep link and the design harness can both reach it, which is a property of *this screen's
state*, not a second destination — the tab bar does not move and the More index no longer
names it.

**`/calendar` and `mobile/app/calendar.tsx` are deleted.** Their content lives in a
component pair, `app/src/ui/Coming.tsx` and `mobile/src/ui/Coming.tsx`, which `pairs.ts`
compares to each other the way it compares every other pair — so the two platforms cannot
drift apart on the way through this move.

## 5. Search and Discover become one surface

Two tabs answered one question — *find me something* — and split it by **how you were
going to find it**, which is a distinction about the app rather than about the person.
They are one surface now, called **Discover**, with the search field at the top of it.

**Discover is for discovering, not for adding.** What it was: a list of rows with two
buttons on each. What it is: a shelf you look along. Large boxes, two across on a phone,
each carrying **title, genre and year** — *as if a person is in a CD shop looking at the CD
boxes* — grouped under the section head that says why they are there. Tapping a box
**turns it over**: the synopsis, what it is, how long it runs, and the two actions, on the
back where they belong. The front of the box sells nothing; the back is where you decide.

**Search is the list.** The compact row layout Discover used to have is the right shape for
results and the wrong shape for browsing — that is the whole finding, and it is answered by
giving each shape the job it is right for on one surface. Type, and the boxes are replaced
by the list; clear the field, and the shelf comes back.

## 6. Both halves take filters

One filter row, revealed rather than resident (`compose.ts`'s rule, sixth application),
applying to whichever half is showing. Three `Choice` groups over facts the metadata
boundary actually carries:

- **kind** — series or film
- **genre** — from the provider, new to `SearchResult` and `CachedTitle` this sprint
- **standing** — well-rated or not, filtered on the crowd score and never printing it

## 7. What is refused

Eight refusals. A redesign with no refusals has not made a decision.

1. **THE TRAILER ON THE BACK OF THE BOX.** Asked for by name, and **not started** rather
   than half-built. It is not a layout problem: no method on `MetadataProvider` returns a
   video, so it is a new endpoint on the boundary, implemented three times (TMDB, AniList,
   fixtures), plus a cache table, plus a licence question about embedding a player that
   this build has not asked. A `Trailer` control that is dark on the fixture provider —
   which is what every design pass and every test in this repo runs against — would be a
   photograph of an affordance nobody can press. The back of the box is built with room
   for it and the room is left empty on purpose.

2. **A RUNTIME FILTER AND A SEASONS FILTER.** Asked for by name, refused on a measurement:
   `/search/multi` and `/trending` return neither `runtime` nor `number_of_seasons` —
   only `/tv/{id}` and `/movie/{id}` do. Filtering twenty browse results by runtime means
   twenty detail requests per screen, on a provider this product is a non-commercial guest
   of. `runtimeMin` and `seasonCount` are on `CachedTitle` and are shown on the back of the
   box for anything already cached; they are not a filter.

3. **PRINTING THE CROWD SCORE.** The score filters and never appears. `direction.md`
   refused Bias Light's whole poster-wall register on the rule that *browsing is reading,
   not shopping*, and a number in the corner of every box is the single fastest way to turn
   a shelf into a shop. Keeping it as a filter is the honest half: it changes what you are
   shown and never tells you what to think of it.

4. **KEEPING `/search` AS AN ALIAS.** A URL that answers but is named nowhere is a
   destination the interface denies having. Deleted, and the call sites that sent people to
   it now send them to Discover.

5. **UPCOMING AS A ROW IN MORE *AND* A TAB ON UP NEXT.** Considered, because it is the
   cheap way to avoid breaking a bookmark. Refused: the finding was that two surfaces
   could not be told apart, and leaving one of them reachable by two routes under two
   framings is that finding kept alive for the convenience of the harness.

6. **A FIFTH TAB TO FILL THE BAR.** Section 2.

7. **AN INFINITE HISTORY ON UP NEXT.** The past is capped. A library of 3,000 watches
   rendered above the fold is a screen that cannot open, and §6.156 measured what walking
   1,220 episodes costs. The cap is a constant with a reason next to it, and the answer to
   "where is the thing I watched in 2019" stays Stats until `direction.md`'s Library graft
   is built — which is the hole that document already admits to and this one does not close.

8. **A SEPARATE "HISTORY" SCREEN.** The obvious alternative to putting the past above the
   present, and the wrong one: it is a third destination for a relationship the person
   already has to the same list, and this whole document is about having fewer of those.

## 8. What looking found

Two defects in this work were invisible to every guard in the repository and were found by
serving the two builds and reading a number off them. `design/look.mjs` and
`design/lookPhone.mjs` are that walk, kept because they are the only thing here that has
*seen* the new architecture; they take their address as an argument so they can run beside
another pass without either taking the other's port.

1. **The scroll-to-present did nothing on the phone, and the first fix did nothing either.**
   `onLayout`'s `y` is the view's position on a device and is **always 0** on
   `react-native-web`, which reports a `ResizeObserver` entry's `contentRect` — a padding
   offset, not a position. Replaced with `measureLayout`, which means the same thing on both.
   That still did nothing, for the second half of the same reason: `onLayout` on the web is a
   *resize* observer, and this wrapper does not resize when the past appears above it — it
   only moves. The measurement now runs from an effect, which is what the web's twin had
   always done.

2. **A harness step that pressed a control that had moved.** `capture.mjs` empties Discover
   by parking a film on the watchlist, and that verb is on the back of a box now. It reported
   itself by name rather than filing a shot of a screen that was not empty, which is what the
   `unshot` list is for — but it would have reported it every run until somebody looked.

Neither is a criticism of the guards. A source guard can say that a rule is stated and a
type-check can say that a call compiles; neither can say that a screen arrived where it
meant to. `docs/design/on-a-device.md` opens with *"'It looked fine' is not an answer"*, and
the answer here was a number: ~~`scrollTop 450` on the web, and on the phone the same number
the export had been reporting as 0.~~

**RETRACTED, and by the sentence immediately above it.** `scrollTop 450` was written down as
proof that Up Next reaches the present. The reading pass measured the other number: **`maxScroll`
is also 450.** The column cannot scroll further, so 450 is exactly what a screen that ignored the
request entirely would have produced. A figure that happened to be positive was read as a
measurement, and the clause that read it could not have failed — the same defect this section is
about, one layer up, in the paragraph claiming to have fixed it.

What is actually true: `scrollIntoView({ block: 'start' })` is honoured only while a frame of
content remains *below* the target, and Up Next's present is a few rows. The first live row sits
**615pt down an 844pt frame**, under seven struck ones. On the phone the caught-up arrival lands
47pt short of its own bottom and clips "Find something to watch" under the tab bar.

The repair is a screenful of trailing room under the present, which is a decision about the bottom
of the longest screen in the product — and §9 below already names that as the thing to watch, so
it is taken there rather than here. ~~`design/look.mjs` reports both numbers now and **fails on the
clamp rather than passing on it**; it currently exits 1 with exactly this one problem, which is the
honest state of this section.~~ **Made.** §9 carries the decision and what it costs; the readings
after it, each with the bound it is compared against:

| | before | after |
| --- | --- | --- |
| web, `scrollTop` of its own maximum | 450 of 450 | 1065 of 1161 |
| web, where the present begins in an 844pt frame | 615pt | **0pt**, bound 133pt (one row) |
| phone, `scrollTop` of its own maximum | 359 of 359 | 994 of 1010 |
| phone, where the present begins in a 784pt frame | not measured | **19pt**, bound 83pt (one row) |

3. **And the phone's half of this section never got the retraction.** The paragraph above was
written about `look.mjs` and `lookPhone.mjs` had the identical clause — `scrollTop > 0` — which is
why the phone number in the row above reads *not measured*. Run at HEAD against the defect this
section describes, it printed `arrived at scrollTop 359` and **exited 0**: on a screen with a past
above it, any scroll at all is positive, so that clause returned the same answer for an arrival and
for an end-stop and could not have failed. A retraction that repairs one of two identical clauses
is half a retraction. Both now read where the present *landed* against a bound measured off the
screen's own rows, and both name the file they are complaining about.

Two further plants sized what those clauses can and cannot see, because a guard's width is a
measurement rather than an assumption:

- With the marker moved 300pt above the row it names — the screen scrolls, and stops short with
  room to spare — the *previous* clause printed `the present begins 300pt down a 844pt frame` and
  exited 0. It asked whether the column had run out, which is a question about the **cause**; the
  claim being made is about the **position**.
- With the `arrived` ref removed, so the scroll re-fires on every write, the new clause found
  nothing: arrival is correct in that build and what breaks is what happens afterwards. That gap
  is closed by a second clause, which reads the past from the top, takes a mark back from there,
  and requires the column not to move — 0pt on a correct build against 974pt planted. Its first
  version asked for `scrollTop` unchanged *at the arrival* and failed on a correct build, because
  Chromium scroll-anchors a row inserted above the fold; `scrollTop` is the reader's position plus
  whatever the browser did to preserve it, and the two are not the same number.

## 9. What this costs, said plainly

Up Next now carries three jobs — the past, the present, and what is coming — and it was
already the longest screen in the product. If it becomes the screen everything is on, that
is this document's failure and the place to look first. The mitigation is that only one of
the three is ever unbounded, and it is capped; the risk that remains is judgement, not
arithmetic, and only a device can settle it.

### 9.1 The bottom of it: a floor under the present, not a spacer after it

§8 filed one decision here, and this is it. `scrollIntoView` and `scrollTo` are both
*requests* — one is refused past the end of the column and the other clamps at it — so the
screen arriving at the present requires a screenful of room underneath the present for it to
be scrolled to the top *of*. There are two ways to spell that, and the difference is the
whole of this section's subject.

A trailing **spacer** — an empty screen after the last row — is the obvious one, and it adds
a screenful to Up Next in every state, including the fifty-row state this section names as
the thing to watch. It makes the longest screen in the product longer to fix a problem that
screen does not have.

A **floor** — the present is at least as tall as the frame — is the same repair where it is
needed and inert where it is not. What it costs, in the three states:

| state | what the floor does | what it costs |
| --- | --- | --- |
| **many live rows** | nothing; the present is already taller than the frame | nothing. The screen §9 is about is untouched |
| **one live row** | the row lands at the top, about a screen of quiet under it | that quiet. Bought against the row sitting two thirds down under a wall of things already crossed off |
| **caught up** | the sentence and its button land at the top | nothing — it is a repair. This state used to arrive 47pt short of its own bottom and clip *Find something to watch* under the tab bar |

And where there is **no past** there is no floor, because there is no arrival to make room
for: an unconditional floor would make a short screen scrollable for nothing. The room exists
exactly when the thing it exists for does.

The two renderers spell it in the units each has — `min-h-dvh` on the web, and on the phone
the `ScrollView`'s own measured height, because the tab bar, the header and both safe areas
are outside it and the window is not the column. Neither is a guess: `design/look.mjs` and
`design/lookPhone.mjs` read the result back off a browser, with the bound beside it.

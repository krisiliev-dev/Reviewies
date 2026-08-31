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
it is filed there rather than taken here. `design/look.mjs` reports both numbers now and **fails
on the clamp rather than passing on it**; it currently exits 1 with exactly this one problem, which
is the honest state of this section.

## 8b. Two things this document did not decide, found by pricing a task

Section 8 is about what *looking* found. This is about what **counting** found, which is a
different instrument: `design/cost.mjs` walks a task on both builds and prints the presses,
the distances, the target sizes and a modelled time. Neither of the two below is visible in
a screenshot — both screens photograph correctly — and neither was visible to any guard in
the repository, for a reason worth stating: the closest check, `app/src/wiring/offers.test.ts`,
compares the two platforms against each other, and **both platforms were missing the same
thing**. A parity guard is silent when the sides agree, and this product is built to make
them agree.

### The title page could not track the show it was describing

`Track`, `addToLibrary` and `watchlist` appeared in neither `app/src/screens/TitleDetail.tsx`
nor `mobile/app/title/[id].tsx`. Everything that would change your mind was on that page —
the synopsis, the seasons, where to watch it, its content warnings — and the only way to act
on it was to go back to the row you came from. `findAndTrackViaTitle` against `findAndTrack`:

| | presses | typed | modelled |
|---|---|---|---|
| phone, from the search row | 3 | 4 | 6.04s |
| phone, via the page — before | 5 | 4 | 9.19s (**+3.16s**) |
| phone, via the page — after | 4 | 4 | 7.40s (**+1.37s**) |
| web, from the search row | 3 | 4 | 9.94s |
| web, via the page — before | 6 + 1 unpriced | 8 | 18.47s (**+8.53s**) |
| web, via the page — after | 4 | 4 | 12.48s (**+2.54s**) |

What is left of the detour is one press and one deliberation on each platform, and that
press is the row that opens the page — which is not a cost of the route, it *is* the route.
The web keeps a larger residue than the phone for a reason the model is explicit about and
this table should not be read as hiding: a `P` is charged Kieras's `BB` and a homing
operator a finger is not, so the two columns are not the same kind of number. The
comparison that means something is each platform against itself.

The web is worse than the phone by more than the platform's own constants explain, and the
reason is a second finding inside the first: **going back on the web loses the query.**
`Discover.tsx` holds it in `useState`, so a back navigation remounts the screen on the shelf
and the search is typed again; `expo-router` keeps the phone's results screen in the stack.
The seventh press is the browser's own Back, above the viewport — counted and deliberately
not priced, because its size and distance are not properties of this build.

The repair is the search row's own two controls, moved onto the page: same tones, same
labels, same announced names, same `shelf` conditional. Nothing is invented, so there is
nothing new to keep in step. It sits under the synopsis and above the rating, which is the
back of a browse box's own order.

**Refused: a third control, and a *stop tracking*.** §6.178 is a row that grew to eight, and
this screen already carries a rating, a poster override, Add to list, Where to watch, content
warnings and a season list. `repo.ts` has no writer that removes a library row, and inventing
one on the screen that would have to explain what becomes of your watch history is a larger
decision than this one.

### The shelf was a dead end, and this document never said it should be

Before section 5's rework a Discover row was `open={{ name: 'Open …', to: '/title/…' }}` plus
Track and Watchlist — `e09ac85^:app/src/screens/Discover.tsx:143`. Two of those three came
over to the back of the box; the third did not. **That was dropped, not decided.** The
evidence, since the question is exactly the sort this document exists to answer:

- `core/src/ui/box.ts`'s argument is *"a shelf of twenty boxes each carrying Track and
  Watchlist is forty controls with two names between them"* — a rule about how many **verbs**
  a shelf may repeat. A destination is not a verb, and the back already carries three
  controls, so the "one control with two faces" line describes the *front*.
- Section 7's eight refusals do not contain it, and a redesign with no refusals has not made
  a decision — the corollary being that something refused nowhere was not refused.
- `e09ac85`'s own message does not mention it.
- The search half of the same screen kept its route the whole time, so the same title was
  one press from its page as a result and unreachable as a box.
- The only place in the repository where the removal was written down at all was a comment
  in `app/smoke.mjs` explaining an audit count, which read *"the shelf offers fewer controls
  on purpose"* — an inference about a decision nobody had made, and now corrected in place.

So it is back, drawn `Details` and announced `Open {name}` — the sentence every other route
to that page already announces — beside `Done` at the bottom of the back, in the same quiet
inline register. The shelf's front-facing control count is unchanged, because a back is not
drawn until a box is turned over.

### What holds them now

`app/src/wiring/decide.test.ts` states three rules absolutely rather than comparatively:
every control announced `Track {name}` is wired through its `onPress` to a writer that
tracks; the title page carries one; and every surface that carries one offers `/title` or is
it. A source guard cannot evaluate a render condition — a plant that draws the control only
for a title you already track passes all three — so `app/smoke.mjs` walks the whole route in
a browser: the shelf, the back of a box, `Details`, the page, `Track`, and the label
changing. That last step is the only one of the six that a file-reading check could not have
made.

## 9. What this costs, said plainly

Up Next now carries three jobs — the past, the present, and what is coming — and it was
already the longest screen in the product. If it becomes the screen everything is on, that
is this document's failure and the place to look first. The mitigation is that only one of
the three is ever unbounded, and it is capped; the risk that remains is judgement, not
arithmetic, and only a device can settle it.

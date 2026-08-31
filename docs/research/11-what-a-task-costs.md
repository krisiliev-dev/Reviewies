# 11 — What a task costs

This repository measures obsessively. Contrast ratios to two decimals, target sizes against a
44pt floor, line boxes read out of the font's own tables, press colours held under a pointer at
three text scales. In thirty-odd sprints it had **never measured an interaction**. Nobody knew
how many actions "mark tonight's episode watched" costs, or what the alternative it replaced
cost, or which of the four tabs is expensive to reach from which — and `docs/design/direction.md`
chose the whole design on the claim that the first one is cheap.

A target size is a property of a control. A **cost** is a property of a task, and the 44pt floor
is one term of it. Fitts's law has a second term, distance, and nothing here had looked at it.

`design/cost.mjs` is the instrument, written in `design/measure.mjs`'s register and for its
reason: five throwaway probes in two sprints is why that file exists, and this should not become
the sixth. It takes a **task** rather than a control, walks it on the phone's export and the
web's build at 390x844, and prints the actions, the size and distance of what each one lands on,
and a modelled time with its operators named. Everything below came out of it.

---

## 1. The models, and what they are allowed to say

| | | |
|---|---|---|
| Pointing, touch | `MT = ID / 6.95 bit/s` | MacKenzie 2015, HCII, LNCS 9170 pp.238–249 — 16 participants, direct touch, LG Nexus 4; grand mean throughput 6.95 bit/s (7.52 1-D, 6.39 2-D) |
| Pointing, mouse | `MT = 1.030 + 0.096·ID s` | Card, English & Burr 1978, as tabulated by MacKenzie 1992 |
| Index of difficulty | `ID = log₂(A/W + 1)` bits | The Shannon form (MacKenzie 1992). `W` as `min(w,h)` for the headline and as the extent along the approach for the bracket — MacKenzie & Buxton, CHI 1992 |
| `M`, think | 1.2 s | Kieras 1993 p.2, on Olson & Olson 1989. CMN's own range is 0.6–1.35 and every total below carries it |
| `H`, home | 0.4 s, web only | Kieras 1993 p.2. A finger does its own homing; charging the phone an `H` would be charging it for the web's hardware |
| `K`, type | 0.332 s phone / 0.28 s web | Palin, Feit, Kim, Kristensson & Oulasvirta, MobileHCI 2019, n=37,370, 36.2 wpm mean; Kieras 1993's 40 wpm design point |
| `BB`, click | 0.2 s, web only | Kieras 1993 p.2. Contact *is* selection on touch, and MacKenzie's throughput is measured to selection |

Two consistency checks worth having in writing. The mouse line at `ID = 0.73` bits gives 1.10 s,
which is exactly KLM's distance-free `P` operator — two published numbers agreeing. And the
44pt floor is **7.3 mm** on the device this viewport describes (390 pt across a 64.6 mm display),
against the 14.0 mm mean finger width MacKenzie measured; the floor is not a finger wide and was
never claimed to be.

**What none of this says.** KLM predicts expert, error-free time and nothing else — Card, Moran &
Newell report 21% RMS error against observed times, and the model "assumes the user is an expert
and does not account for user errors" (Al-Megren, Khabti & Al-Khalifa 2018 §2). Fitts was derived
for pointing, and touch is not pointing: no cursor, the finger occludes the target, and MacKenzie
2015 measured error rates 4.6× higher on small targets (12.2% against 2.7%). Fitts models the
*successful* movement; the errors it does not model are why the floor exists. And a modelled
second is not a felt second — nothing below was timed on a person or a device.

**Read the counts and the geometry as measurements. Read the seconds as a model.**

### Where Hick's law is not used, which is everywhere

Liu, Gori, Rioul, Beaudouin-Lafon & Guiard (CHI 2020, *How Relevant is Hick's Law for HCI?*)
rules it out three separate ways. It is a law about choice reaction under a *learned
stimulus-response mapping*; wanting the Watchlist is not that. Its slope collapses with S-R
compatibility, and re-analysing two command-selection studies they measure **4, 8 and 32 ms/bit**
against the 150+ of Hick's own apparatus — so at the worst of those the entire difference between
a two-tab bar and a four-tab bar is 32 ms, one twentieth of a single tap. And logarithmic time is
not evidence of Hick's law: "visual search in a hierarchical structure is logarithmic, as shown
by Landauer and Nachbar… anything that involves a divide and conquer strategy can be logarithmic.
In many cases, this has nothing to do with Hick's law." Finding a row in the More index is visual
search, and search is priced here as an `M`. **Nothing in this document argues from option
count.** `mobile/app/(tabs)/_layout.tsx` does not either — it cites the iOS convention, which is
the honest reason.

### Where the steering law is not used, which is also everywhere

Accot & Zhai (CHI 1997) give `MT = a + b·(A/W)` for steering through a constrained path. **This
product has no steering task.** The only drags in the build are `ScrollView` flicks; a flick is
ballistic, nothing constrains the path, and overshooting costs nothing. `RemoteDrawer` opens on a
press. `CrossOff`'s stroke is drawn by the app, not by the hand. Recorded as an absence because
"no steering task" is an answer and silence is not.

---

## 2. The four tabs, from each of the others

One press either way, so the whole finding is geometry. Tab item **98x51pt on the phone**,
**98x63pt on the web**; four across 390.

| From → to | Distance | ID | phone | web |
|---|---|---|---|---|
| adjacent (six pairs each way) | 98pt | 1.54 / 1.35 bits | 0.22s | 1.16s |
| one apart | 195pt | 2.27 / 2.03 bits | 0.33s | 1.23s |
| Up Next ↔ More | 293pt | 2.75 / 2.50 bits | 0.40s | 1.27s |

**The finding is that there is no finding.** The dearest pair costs **0.17s more than the
cheapest on the phone and 0.11s on the web**. Up Next ↔ More is the far pair and is plausibly
the most-travelled one, so a Fitts argument for reordering `TAB_BAR` exists — and it is worth
under a fifth of a second, against the 1.57s that separates two routes to marking an episode and
the 8.53s the web charges for looking at a show before tracking it. **The tab bar is not where
cost lives, and this is the number that stops a later sprint reordering it on a theory.**

---

## 3. Mark tonight's episode watched

The highest-frequency action in the product; three routes to it.

| Route | phone | web |
|---|---|---|
| the ring on the Up Next row | **1 press, 1 M — 1.63s** | **1 press, 1 M — 2.72s** |
| the catch-up sheet | 1 press, 2 M — 2.80s | 1 press, 2 M — 3.90s |
| through the show's page | 2 presses, 2 M, 1 scroll — 3.20s | 2 presses, 2 M, 1 scroll — 5.42s |

The ring is 44x44pt (7.3 mm), **301pt from the stated thumb rest on the phone and 325pt on the
web**, `ID` 2.97 and 3.07 bits. `direction.md`'s bet is sound: the cheapest route to the
product's core action is one press and one act of finding, and it is the route the home screen
opens on.

Taking it back — the claim `direction.md` makes for the ring is that the way back is *beside* it
rather than a screen away — is **2 presses, 2 M: 3.05s on the phone and 5.31s on the web**, with
Undo 51x44pt and only **83pt** from the ring (`ID` 1.53 bits, 0.22s). All of it inside
`linger.undo`'s six seconds with room to spare, on both platforms, at the pessimistic end of
CMN's `M` range. The design record's claim survives measurement.

The show's-page route needs a **1,050pt scroll on the phone and 914pt on the web** to reach the
episode's ring. Scrolls are counted and deliberately not priced; see §6.

---

## 4. Find a specific show and start tracking it

| Route | phone | web |
|---|---|---|
| Track on the search row | **3 presses, 4 chars, 3 M — 6.04s** | **3 presses, 4 chars, 3 M — 9.94s** |
| looking at the page first | 5 presses, 4 chars, 5 M — 9.19s | 6 presses, **8 chars**, 6 M — 18.47s + one unpriced press |

Three findings sit inside that second row, and all three are filed in §7.

Recording a film you have already seen, from the search row without opening the page — doc 4
§2.2's requirement — is **2 presses, 5 chars, 2 M: 4.99s on the phone, 7.69s on the web**. The
cheapest complete task in the product after marking an episode.

---

## 5. Record what you thought of something you just watched

| Route | phone | web |
|---|---|---|
| the star rating on the episode row | 3 presses, 3 M — 4.53s | 3 presses, 3 M — 7.82s |
| the comment composer | **could not reach** | **could not reach** |

The rating is two presses by design, not by accident: `RATING_OPEN = false`, and `rating.ts` has
the argument — a row shows what it knows and the five stars appear when asked for, because sixty
empty star outlines down one screen say nothing. The cost of that decision is one press and one
`M`, which is a fair price for the thing it bought.

The composer route stops on both platforms, and the instrument says why rather than only that:
`/comments/tmdb:ep:2-1-1` reads *"Comments need an account. Sync is not configured on this
build."* Filed in §7.

The star targets are the smallest in either build — **24x28pt on the phone, 24x24pt on the web,
4 mm on a side** — and there are ten of them edge to edge. Filed in §7.

---

## 6. What the instrument could not answer

Four gaps, each stated rather than filled with an invented number.

**A scroll has no operator.** KLM's set is K, P, H, M, D, R and none of them is a scroll. The
touch extensions add one — Rice & Lartigue's TLM (ACM SE 2014) introduces `Swipe`; Al-Megren et
al. 2018 collate "Swipe/slide" and "Scroll" across the fifty-four extensions they survey — but
the unit times are per-study, per-device and per-gesture, and none published one that could be
applied here without inventing it. The steering law does not fill the gap: a flick is ballistic,
not steered. **So scrolls are counted, their distance is measured, and the totals say `+ the
scrolls, unpriced`.**

**A press outside the page cannot be measured.** The web's back is the browser's own button,
above the viewport. Counted as an action, left out of the seconds.

**The origin of the first press is an assumption.** Fitts needs a starting point and the first
press of a task has no previous contact. `THUMB_REST` is the bottom centre of the viewport;
exactly one hop per task depends on it, every such hop is printed `(assumed origin)`, and
`--origin centre` re-runs against the middle of the screen so the assumption can be priced.

**A modelled second is not a felt second, and the phone-against-web column is the weakest
comparison in this document.** The two pointing constants come from different studies, different
decades and different hardware, so a phone/web *difference* in seconds is largely a difference
between two papers. The comparison this instrument can make honestly is **within** a platform:
route A against route B, tab i against tab j, this sprint against the next. The `K` line is
weaker still — 0.332 s is a *mean over 37,370 people* and 0.28 s is a *design point for an
expert*, which are not the same kind of number, so a typing-heavy task compared across platforms
should be read as action counts only.

---

## 7. Filed

### 7.1 The title page cannot track anything, on either platform

`mobile/app/title/[id].tsx` offers a rating, a poster override and per-episode React / Talk /
Rate. `Track` appears nowhere in it. `app/src/screens/TitleDetail.tsx` has no `Track`,
`addToLibrary` or `watchlist` either. **The page you open to decide whether to keep something has
no way to keep it.** Read from the files, not inferred: the walk stopped on both builds with "no
control on this screen carries that name".

The cost, measured: looking before committing is **9.19s against 6.04s on the phone (+3.16s, two
extra presses) and 18.47s against 9.94s on the web (+8.53s, three extra presses and a second
search)**. Needs a design decision — where the control goes and what it displaces — so it is
filed rather than made.

### 7.2 The web loses your search when you come back from a title

Both platforms hold the query in `useState` — `app/src/screens/Discover.tsx:54` and
`mobile/app/(tabs)/discover.tsx:52` are the same line. The difference is the navigator: expo-router
keeps the tab screen mounted underneath the pushed title, and react-router unmounts it, so on the
web a back navigation remounts Discover with an empty field and the *shelf* where the results
were. Measured, that difference is **four characters, one extra press and one extra `M`** — most
of the 8.53s above.

So the phone is right by accident rather than by design, and the durable fix is the same on both:
the query belongs in the address, the way `segments.ts` already puts Up Next's view there for
exactly this reason (§6.157 — "a state reachable only by pressing is a state the design record
loses"). It is also the one that survives a deep link and a reload, which the phone's version does
not. **`app/src/screens` is owned by another agent this sprint**, so it is filed.

### 7.3 The phone's back control is 30x30pt and announces itself as "(tabs), back"

Measured on the export: `<a role="link" href="/">` at 30x30 points — **5.0 mm**, against a 44pt
floor this repository refuses a 34pt shelf spine over (`docs/design/direction.md`, refusal 3:
"Spines go to 44pt minimum"). It is React Navigation's default header back, configured by
`mobile/app/_layout.tsx`'s `Stack`.

Two halves, and they need separating. **The size is an export measurement and does not settle the
device** — iOS's native header back button has a touch target larger than its glyph, and nothing
here has run on a phone. **The name does not depend on the renderer.** React Navigation builds it
as `${previous title}, back`, and the previous route is the tab group, which is declared as
`<Stack.Screen name="(tabs)" options={{ headerShown: false }} />` with no `title` — so the router's
own directory name is what a screen reader says. That is `§6.57`'s shape one layer down: a
filesystem convention leaking into speech.

Both live in a navigation file owned by another agent this sprint. Filed. The name looks like a
one-line `title` on that `Screen`; the size wants a device answer first.

### 7.4 The ten star targets are 4 mm on a side, edge to edge

24x28pt on the phone and 24x24pt on the web, spaced 24 / 26 / 24. WCAG 2.5.8's 24 CSS pixels is
met exactly, and the components' own headers say so and say why. But this is the same repository
that refused a 34pt spine on the argument that "two hitSlop targets next to each other overlap,
and nothing can measure them" (`mobile/src/ui/theme.ts`), and these ten are half that spine's
width with no slop possible between them. MacKenzie 2015 is the relevant number: at a mean finger
width of 14.0 mm, targets at 4 mm are where his error rate went from 2.7% to 12.2%. The escape —
tap the value again to clear it — is already in the component *because* mis-taps were common.

Fitts prices the successful movement at 0.28s and says nothing about the other 12%. Needs a
design decision (the control is 240pt wide already, so making the halves bigger means changing
its shape), so it is filed.

### 7.5 Comments need an account, and the design record says the local review does not

The composer route ends at *"Comments need an account. Sync is not configured on this build."*
`direction.md`'s graft 10 specifies the prompt after marking as "six emoji, a focused field,
six-second self-dismissal, in the row you just crossed off", and states plainly that it "writes
a local review and needs no account". **That is a declared design, not the build**, and the only
route to recording a sentence about an episode today goes through sync. Filed as the gap between
the two, with the number attached: for the default user the second route in §5 does not exist.

### 7.6 The tab item disagrees by 12 points, and `_layout.tsx`'s own note is stale

98x51pt on the phone against 98x63pt on the web — `measure.mjs`'s class of finding, in the
most-pressed control in the product. `mobile/app/(tabs)/_layout.tsx` already records a
measurement here and it reads **"78x51 … against the web's 78x63"**: the widths are from when
there were five tabs. `TAB_BAR` has four, and 390/4 is 97.5. The heights are still right. A stale
number in a header that is otherwise the best explanation of that file is worth one line to
correct, and the file is a navigation file owned by another agent this sprint. Filed.

---

## 8. Repaired

### The phone export's half-star targets were drawn on top of each other

`design/cost.mjs`'s `halfStarTargets` walk reads the gap between a half star and the whole star
beside it. It should be 24 points — `MIN_HALF`, the width of each target.

- **web: 24 / 26 / 24.**
- **phone, before: 0 / 50 / 0.** Two different controls at one rectangle.

`mobile/src/ui/StarRating.tsx` positioned the second half by cancelling the first's offset —
`right: { left: undefined, right: 0 }` over `half: { …, left: 0, width: MIN_HALF }`. On a device
that is correct: React Native flattens the array, `left` becomes `undefined`, and Yoga reads an
undefined edge as unset. **`react-native-web` has no such step** — it compiles each style object
to atomic CSS and omits any declaration whose value is `undefined`, so `left: 0` survived and the
box ended up `left: 0; right: 0; width: 24`, which CSS resolves against `right`. The later button
in the document won every tap, so on that build the half values — the reason the component exists,
"the most repeated request on r/Letterboxd" — could not be pressed at all.

The repair is `right: { left: MIN_HALF }`: an explicit offset, which means the same thing to Yoga
and to CSS and depends on no renderer's treatment of `undefined`. **After: 24 / 26 / 24 on both
platforms, identical.**

`app/src/ui/phoneStyleUnset.test.ts` holds the rule rather than the line — no property inside a
phone `StyleSheet` or inline style prop may take the literal `undefined` — because the shape
recurs and this repository has paid for it four times already (`onLayout` firing on resize rather
than on move, `layout.y` always 0, `allowFontScaling` not surviving into the DOM). It caught two
plants: the original spelling restored, and a fresh `marginLeft: undefined` in `CrossOff`. It
also failed twice on *correct* code before it was right — once on `styles.rowBody : undefined`
inside a ternary, once on the repaired file's own comment quoting the line it replaced — and both
times the rule was fixed rather than the file.

This does not say the shipping phone app is broken; on iOS and Android the layout is correct. It
says **the export is**, and the export is the only phone this build has ever been looked at
through: `design/capture.mjs`, `mobile/smoke.mjs`, `design/measure.mjs` and `design/cost.mjs` all
drive it. A control that overlaps itself there is a control every measurement in the record has
been taken of wrongly.

---

## 9. For the record

The instrument found its own defects faster than it found the product's, and that is the part
worth keeping. Its first run reported every tab as 776 points from every other, because four of
the tab bar's words are also four screen titles and an `<h1>` answered to a tab's name; its second
priced an episode's ring as a single 1,687-point movement, which is a screen and a half below the
fold and no hand travels it; its third walked the phone to one show and the web to another and
printed the difference as a platform finding. Each of those printed exactly like a measurement,
which is the failure this repository keeps meeting from a new direction and the reason the file
now says `could not reach` with the screen's own sentence underneath, counts a scroll without
pricing it, and marks the one hop per task that rests on an assumption. What the corrected
instrument then found is smaller than what the sprint expected and more useful: the tab bar,
which is the thing a design review argues about, is worth a sixth of a second end to end, while
the two places nobody had looked — a title page that cannot track the show it is describing, and
a web build that forgets your search the moment you look at a result — are worth three and eight
and a half. The one repair is a style property that meant "unset" to Yoga and nothing at all to
`react-native-web`, so five pairs of touch targets sat on top of one another in every screenshot,
smoke check and measurement this project has ever taken of its own rating control. That is the
fifth renderer difference in this file's short list, and the first to have been found by asking
what something costs rather than what it looks like.

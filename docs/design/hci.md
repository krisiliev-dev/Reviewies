# What this product is answerable to

`direction.md` decided what it looks like. `architecture.md` decided what it is a picture
of. `tokens.md` and `components.md` are the system that draws it. **Nothing had ever asked
how it is used**, and nothing had said which frameworks it is answerable to when somebody
does.

So this document is an evaluation, not a reading list. Every claim in it names a file, a
number, or a run of the harness, and every finding says what would falsify it. Two of the
frameworks below found nothing, and that is written down too, because a frame that is only
ever cited when it agrees with you has not been applied.

One finding was repaired in this pass, by this repository's method — the defect was planted
(it was already shipping), the old guards were watched to pass, the new guard was watched to
fail with the defect still in place, and only then was it fixed. Section 5 has the plants.

---

## 0. What the repository knew about this already

A census, because the brief said the HCI grounding here was "scattered across nine files"
and it is worth knowing whether that is true before writing a tenth.

| Term | Occurrences outside `node_modules` |
|---|---|
| `Fitts` (any spelling) | **0** |
| `Nielsen`, `Norman`, `Weiser`, `Kahneman`, `Deci`, `signifier`, `gulf of` | **0** |
| `heuristic` | 4, and all four mean *a guess made by a script* — `choice.test.ts:306`, "a guard that guesses at intent fails on correct code" |
| `affordance` | 16 files |

So there is no scattered grounding to gather. There is **one borrowed word**, and it is used
wrongly in all sixteen places. Every occurrence means *a visible control*: "hid the drawer's
only affordance" (`app/src/remote/RemoteDrawer.tsx:67`), "a photograph of an affordance
nobody can press" (`core/src/ui/box.ts:36`), "one feature, two affordances"
(`core/src/ui/moreIndex.ts:38`), "the failure mode is a dead affordance"
(`mobile/smoke.mjs:1082`).

Norman spent twenty years trying to stop people doing exactly that, and in 2008 gave up and
coined a second word for what they meant. *Signifiers, not affordances* (Norman, D. A.,
**Interactions** 15(6), 2008): **affordances determine what actions are possible; signifiers
communicate where the action should take place.** A drawer parked at `translateX(300)` still
affords being dragged; what it lacked was a signifier. That is not pedantry here, because it
changes the fix: three design directions independently proposed replacing a *signifier* that
existed with a narrower one, and `direction.md`'s refusal 3 had to catch all three.

**The vocabulary correction is the cheapest thing in this document.** When this repository
means "a thing you can see and press", the word is *signifier*.

---

## 1. The frameworks, and the ones refused

Five chosen. Four refused. A document that applies twelve frameworks has applied none, and a
document with no refusals has not chosen.

### Chosen

**1. Norman's gulfs of execution and evaluation.** Introduced in Norman, D. A., *Cognitive
Engineering*, in Norman & Draper (eds.), **User Centered System Design** (1986); popularised
in **The Design of Everyday Things** (1988, revised 2013). The seven stages of action are
*goal, plan, specify, perform, perceive, interpret, compare*; **plan/specify/perform bridge
the gulf of execution, and perceive/interpret/compare bridge the gulf of evaluation.** The
gulf of evaluation is the distance between the actual state of the system and the person's
understanding of it.

*Why it earns its place:* this product has three subsystems that do consequential work with
no representation on screen — a sync outbox that sets writes aside permanently
(`core/src/sync/engine.ts`), a matcher that rewrites somebody's history onto different
identifiers (`core/src/data/reconcile.ts`), and a fingerprinter that opens the microphone
(`core/src/fingerprint/continuous.ts`). All three are evaluation-side. Three of the six
findings below are gulf-of-evaluation findings and could not have been named as sharply by
anything else.

**2. Cognitive Dimensions of Notations.** Green, T. R. G. & Petre, M., *Usability analysis of
visual programming environments: a 'cognitive dimensions' framework*, **Journal of Visual
Languages and Computing** 7(2), 1996, 131–174; and the tutorial version, Blackwell, A. F. &
Green, T. R. G., *Cognitive Dimensions of Notations: Design Tools for Cognitive Technology*
(2001, LNCS 2117, 325–341). The fourteen dimensions are **abstraction gradient, closeness of
mapping, consistency, diffuseness, error-proneness, hard mental operations, hidden
dependencies, premature commitment, progressive evaluation, provisionality,
role-expressiveness, secondary notation, viscosity, visibility.** The framework's own
stipulation matters as much as the list: *a dimension is not a metric to be maximised, and
improving one usually costs another.*

*Why it earns its place:* a tracker is a notation. A person using this app is **writing
something down** — an episode, a rating, a note, a reaction at a timecode — and the thing
they write is read back for years. Four dimensions bite here and are named in the findings:
**viscosity** (finding 4), **premature commitment** and **provisionality** (finding 2),
**progressive evaluation** (finding 3). Ten do not bite, and are not stretched to.

**3. Calm technology.** Weiser, M. & Brown, J. S., *The Coming Age of Calm Technology*
(1996). Their definition of the periphery is the load-bearing part: **"what we are attuned to
without attending to explicitly"** — the engine noise while you drive — and *"a calm
technology will move easily from the periphery of our attention, to the center, and back."*
Amber Case's eight principles (**Calm Technology: Principles and Patterns for Non-Intrusive
Design**, O'Reilly, 2015) are the operational form: (1) technology should require the
smallest possible amount of attention; (2) it should inform and create calm; (3) it should
make use of the periphery; (4) it should amplify the best of technology and the best of
humanity; (5) it can communicate, but doesn't need to speak; (6) it should work even when it
fails; (7) the right amount of technology is the minimum needed to solve the problem; (8) it
should respect social norms.

*Why it earns its place:* this is the most apt frame the product has and nobody had opened
it. `mobile/src/ui/theme.ts` says the app "gets used in a dark room with the television on";
`direction.md`'s whole case is that the record is of *attention already spent elsewhere*. The
app is meant to be used **in the credits**, not all evening. Principle 6 — *work even when it
fails* — is also the only framework clause in this document that the build already satisfies
better than most shipping software, and finding 3 is where it stops satisfying it.

**4. The peak–end rule.** Kahneman, D., Fredrickson, B. L., Schreiber, C. A. & Redelmeier,
D. A., *When More Pain Is Preferred to Less: Adding a Better End*, **Psychological Science**
4(6), 1993, 401–405. The cold-pressor study: a 60-second immersion at 14 °C, versus the same
60 seconds plus 30 more while the water was raised to 15 °C — still painful, distinctly less
so. **69% of subjects chose to repeat the longer, objectively worse trial.** The claim is
that retrospective evaluation of an extended episode is predicted almost entirely by two
points, the peak intensity and the intensity at the end, and that **duration is largely
neglected**.

*Why it earns its place:* the memory of a season is not the sum of its episodes, and this
build has exactly two artefacts that are candidates for peak and end — the cross-off, and
Year in Review. One of them was broken on the primary platform, which is finding 1. This is
the frame that ranks it first.

**5. Self-determination theory.** Deci, E. L. & Ryan, R. M., **Intrinsic Motivation and
Self-Determination in Human Behavior** (1985); Ryan, R. M. & Deci, E. L., *Self-determination
theory and the facilitation of intrinsic motivation, social development, and well-being*,
**American Psychologist** 55(1), 2000, 68–78. Three basic psychological needs: **autonomy**
(acting with a full sense of volition), **competence** (mastery and efficacy), **relatedness**
(feeling meaningfully connected to others).

*Why it earns its place:* TV Time ran on streaks and badges, the research documents record
people saying so, and both `direction.md` and `docs/research/08` refuse that register — but
**nothing had checked whether the refusal held in the build.** SDT is how you check without
arguing from taste. The answer, in section 3, is that it holds almost everywhere and there is
one exact place it does not.

### Refused

**Nielsen's ten usability heuristics, as a frame.** Nielsen, J. & Molich, R., *Heuristic
evaluation of user interfaces*, **CHI '90**, 249–256; the ten in their current wording are
visibility of system status; match between the system and the real world; user control and
freedom; consistency and standards; error prevention; recognition rather than recall;
flexibility and efficiency of use; aesthetic and minimalist design; help users recognise,
diagnose and recover from errors; help and documentation.

Refused for a reason the method's own authors published: in the CHI '90 study **individual
evaluators found between 20% and 51% of the usability problems in the interfaces they
evaluated**, and the technique's yield comes from *aggregating three to five independent
evaluators*. This document has one evaluator. A single-evaluator heuristic walk produces a
list with the authority of a checklist and the coverage of a coin toss, and this repository's
standing rule is that a claim you cannot check is a claim not worth writing.

**Kept as vocabulary, not as method.** Where a finding below is a *visibility of system
status* problem, it says so, because that is the shortest name for it and everybody knows it.
It is never the reason the finding is here; the evidence is.

**Fitts's law.** Fitts, P. M., **Journal of Experimental Psychology** 47(6), 1954, 381–391:
`MT = a + b · ID`, with `ID = log₂(2A/W)` (the Shannon form in HCI since MacKenzie 1992 is
`ID = log₂(A/W + 1)`). Refused, and this is the refusal most worth stating, because *Fitts*
is the name people reach for when they mean "make it bigger".

Fitts's law predicts **movement time**. Nothing in this repository can measure movement time —
there is no device study, no stopwatch, no participant. What the repository actually enforces
is a **44pt minimum target**, and that floor comes from the Apple HIG and WCAG 2.5.5 Target
Size, not from Fitts: no value of `a` or `b` falls out of Fitts's equation as a threshold.
`core/src/ui/crossOff.ts` has this exactly right without citing anybody — "44 is the whole
control: a circle the width of a thumb, at the row's trailing edge, **in the same place on
every row of every list**" — and the second clause is the one that would matter if this were
a Fitts argument, because holding `A` constant across a list is worth more than growing `W`.
Citing Fitts for a 44pt rule would be the half-remembered citation this document exists to
stop. Measured instead, in section 2.

**Slow technology.** Hallnäs, L. & Redström, J., *Slow Technology – Designing for
Reflection*, **Personal and Ubiquitous Computing** 5(3), 2001, 201–212. Genuinely the closest
frame to what Letterboxd is for, and refused anyway: its unit of analysis is an artefact's
presence in a life over years, and its method is design exemplars rather than evaluation. It
would produce assertions about this build that no reader could check, which is the one thing
this document must not contain. Everything it would say here about reflection, calm
technology says with a clause you can run.

**Anything predictive — GOMS, KLM, the model human processor.** Refused on the same ground as
Fitts, and more so: they need a task model and a validated device, and this product's central
task takes one tap.

---

## 2. The walk

`npm run design` produces the shots; both smoke suites drive real builds; `design/measure.mjs`
measures a named control on either platform at any text scale. All of it was run, on ports
4370 and 4371 rather than the harness's own, so this pass could run beside three others.

- **`design/look.mjs` against a fresh `app` build.** The tab bar is `Up Next · Discover ·
  Watchlist · More`; the coming half has one `h1`; a box turns over and offers Track; the
  filter row opens with genre and standing chips; after ten marks the past drew ten reversible
  rings and the screen **arrived at `scrollTop 450`**. `/search` and `/calendar` are the
  not-found screen. *The walk found nothing to report.* Everything `architecture.md` claimed
  it built, it built.
- **`design/measure.mjs --at / --scale 1 --scale 2` on both platforms.** The Up Next segment
  holds the floor at twice the text: `Out now` phone 70×44 → 115×**44**, web 71×44 → 116×46;
  `Upcoming` phone 80×44 → 135×**44**. The height never moves. This is the one measurement in
  this document that would have been a Fitts argument if Fitts had anything to say about it,
  and it passes.
- **A seeded library on both platforms**, imported through the app the way a person does —
  `design/library.mjs`'s CSV, 122 watches across three years — then Stats read back off the
  screen at every period the picker offers. That is finding 1.

### One number in the instrument that is not a finding

`measure.mjs` reports `Import from TV Time` on the phone at 200% text as
`358x67 @27pt CLIPPED-y by div 390x784`. It is **not clipped.** The instrument's `clipper()`
(`design/measure.mjs:222-228`) walks up to the first ancestor whose overflow is not `visible`,
and a `ScrollView` qualifies. Measured directly: that ancestor is `overflowY: auto` with
`scrollHeight 1459` against `clientHeight 784`, and the button's bottom edge is at 1237. It is
below the fold of a scroller, which is what "below the fold" means.

Reading that line as a defect would be §6.179's near-miss one flag along, and the file warns
about the neighbouring case at length (`POSTER_GLYPH_SCALES`). It is filed as finding 6 rather
than fixed, because the fix has a shape worth deciding rather than guessing: a scroller with
room to scroll is not a clipper, but a scroller with `overflow: hidden` is, and telling those
apart in `boxes()` also changes `runs()`, which is the same decision in a second place.

---

## 3. Findings

Ranked by what would make somebody distrust the product, which is not the same as ranked by
size. Each names the file and the observation, and each says what would falsify it.

### 1. Year in Review answered the wrong year, on the platform this product is

**Fixed in this pass.** `core/src/stats/compute.ts`.

The phone's Stats screen called `getSummary(window, { year })`; `windowStart`/`windowEnd`
honoured `year` **only** when `window === 'year'`, and the phone never passed `'year'` — the
year sat beside whichever window chip had last been pressed and was dropped. The web called
`getSummary('year', { year })` and was correct. So the two platforms answered the same
question differently, and one of them answered a different question without saying so.

Measured, on both builds, through the app, with the same 122-watch library:

| Year picked | phone, before | web | phone, after |
|---|---|---|---|
| 2026 | Episodes **50** | Episodes 50 | Episodes 50 |
| 2025 | Episodes **50** | Episodes 66 | Episodes 66 |
| 2024 | Episodes **50** | Episodes 6 | Episodes 6 |

The heading changed each time and the four figures under it did not. `COPY.stats.yourYear`
printed **Your 2025** and **Your 2024** in the largest type on the screen, over 2026's
numbers; the busiest day stayed *Tue, May 5* through all three; the chip reported
`aria-checked="true"` each time. Every channel the screen has said the year had changed
except the only one that carried the answer.

**Why this is first.** It is the clean case of Norman's gulf of evaluation: the person
performs the action, the system *displays a state change*, and the state did not change. The
worst available outcome is not "nothing happened" — it is "something happened and it was a
lie", because the person has no way to perceive the difference. And under the peak–end rule
this is the *end*: Year in Review is TV Time's REWIND, the thing `app/src/screens/Stats.tsx`
and `mobile/app/stats.tsx` both name in their headers as the most-loved feature of the app
this product exists to replace. A decade of imported history has exactly one surface that
turns it into a memory, and on the phone it returned this year, three times, under three
names.

*Falsified by:* running `design/measure.mjs`'s sibling walk against `mobile/dist` with a
multi-year library and finding the figures change with the chip. They now do.

### 2. The one irreversible write in the product reports nothing, and has no way back

`core/src/data/reconcile.ts`, `app/src/ui/MatchImports.tsx`, `mobile/src/ui/MatchImports.tsx`.

`acceptMatch` moves a history from a local ID onto a matched one: it rewrites every watch's
ID, migrates ratings, library and watchlist rows, enqueues a tombstone **and** an upsert for
each, and deletes the placeholder episodes. Its own header states the standard: *"A watch
whose episode the provider does not list is left where it is rather than dropped or guessed
at… losing the record silently would be the worst outcome available, **and the report says
how many**."*

Two things are true about that report.

- **`MigrationReport` is returned and read by nobody.** Grep the whole tree outside
  `node_modules`: `orphanedWatches` appears at `reconcile.ts:194` where it is declared,
  `:238` where it is initialised and `:273` where it is incremented, and **nowhere else**.
  The call site is `await accept(proposal.localId, providerId)` — the return value is
  discarded on both platforms. The count of watches that could not be carried across is
  computed correctly and thrown away. The prose standard is kept scrupulously and broken in
  the pixels, which is the same shape `direction.md` found in the poster slot.
- **There is no inverse.** No `unmatch`, no `undoMatch`, no re-match. Grep returns nothing.
  Every episode of the local title has been deleted; the tombstones are already in the outbox.

In Cognitive Dimensions this is **premature commitment** on top of **zero provisionality**,
and the ordering makes it worse than either alone. Matching *starts itself* — `startedThisSession`
in `MatchImports.tsx`, correctly, because doc 10 §4 found the button was a chore — so the
questions arrive on the person's **first minute**, before they have seen the library the
answers will rewrite, and each answer is final. The component's own comment states the
asymmetry precisely: *"an unmatched row is visibly unfinished and costs nothing; a wrong match
silently moves somebody's history onto the wrong show, and there is no way for them to notice."*
That sentence is a specification for a report and an undo, and it was written as an argument
for neither.

Nielsen's third heuristic is the short name — a clearly marked emergency exit — and it is a
weaker statement than the CD reading, because "add an undo" is not obviously the answer:
`acceptMatch` is an eight-table transaction with replication, and the honest fix may be to
make the *decision* provisional rather than the write reversible.

*Falsified by:* any screen rendering a field of `MigrationReport`, or any function that
reverses a match. Neither exists.

### 3. The queue that must be "said out loud" is said on one screen out of thirteen

`core/src/sync/engine.ts`, `core/src/sync/driver.ts`, `app/src/screens/AccountPanel.tsx:146`,
`mobile/app/account.tsx:108`.

`RejectedEntry` exists because §6.71 found that a write the server would never accept jammed
every later write for ever with nothing on screen to say so. Its header states the standard
in three words: the row leaves the queue *"and it is still here, **counted, and said out
loud**"*.

It is said out loud in exactly two files, which are the same screen on two platforms. There
are thirteen screens in `app/src/screens`. `driver.ts` broadcasts `rejected` to every
subscriber through `onSyncStatus`, and `useSync` is consumed by three screens — but
`Lists.tsx:35` and `People.tsx:34` destructure `session` and nothing else, so **one screen in
the product reads `rejected` at all**. On the web the account panel lives inside `/settings`, which `MORE_INDEX` reaches as
*Your data* — so a person whose changes have been permanently set aside learns about it after
**Up Next → More → Your data → scroll**, on a screen they had no reason to open.

This is Nielsen 1 in the shortest form, but the sharper reading is calm technology's sixth
principle, **work even when it fails**, together with Weiser and Brown's periphery: *"what we
are attuned to without attending to explicitly"*, and *"a calm technology will move easily
from the periphery of our attention, to the center, and back."* The set-aside queue is the
textbook case for the periphery — it should be quiet, present, and able to come to the centre
— and instead it is not in the room at all.

The cheap part: **the mechanism already exists and is already mounted.** `FailureBanner` is
attached at module scope in both roots (`app/src/App.tsx:87`, `mobile/app/_layout.tsx:158`),
is dismissible, blocks nothing, and already carries one message that has an answer instead of
a shrug. `COPY.sync.rejected` and `COPY.sync.retryRejected` are already written and already
correct.

*Falsified by:* any surface outside `AccountPanel.tsx`/`account.tsx` that reads
`SyncStatus.rejected`. There is none.

### 4. Stats still opens on a window the arriving library is mostly not in

`core/src/stats/compute.ts:34` — `DEFAULT_STATS_WINDOW: Window = 'ytd'`.

`design/OBSERVED.md` named this at the top of its list, and the repair that landed was the
*empty* case: a **Show all time** button when the window has nothing in it (`§6.54`). The
**non-empty and wrong** case was never touched, and it is the common one. Measured this pass:
importing `design/library.mjs`'s CSV puts **122 watches** in, and both platforms open Stats at
**Episodes 50**. Fifty-nine per cent of the person's history is off screen with nothing saying
so, on the screen whose whole job is to say how much there is.

Two frames converge on this and disagree about the fix, which is why it is worth stating as a
finding rather than a preference.

- **Peak–end:** the import is the product's first extended episode, and this is its final
  moment. Kahneman's result is that duration is neglected and the end dominates; the end here
  is a number 59% smaller than the truth.
- **SDT, competence:** the need is for *mastery and efficacy*, and the honest form of it in a
  tracker is a true fact about what you have done. `08-stats.png` recorded the extreme case —
  `Watched 0m · Episodes 0 · Titles 0` over a decade of history.

`OBSERVED.md` already has the argument: *"this default was chosen for somebody who has been
using the app for a year, not for somebody on their first day, and the first day is the one
that decides whether there is a second."* The one thing this frame adds is that a *constant*
is the wrong instrument — a default that is right on day 1 and wrong on day 400 is the same
defect with the sign flipped — and `availableYears()` already returns exactly what is needed
to choose. This is filed rather than fixed because it is a decision, not a defect.

*Falsified by:* a library whose watches are mostly in the current year, which is every library
except the ones this product is built to receive.

### 5. Correcting a mis-mark gets very hard very suddenly, at 40

`core/src/data/repo.ts:371` — `HISTORY_LIMIT = 40`.

The cross-off is the best-built control in the product and I want to say so before criticising
what surrounds it. `core/src/ui/crossOff.ts` gets four separate things right that most
software gets wrong: it is a **checkbox**, not a button wearing `aria-pressed`; it is 44pt in
the same place on every row; it has **no loading state**, deliberately, because a spinner
would claim the app is asking permission; and undo sits *beside* the ring for six seconds
(`linger.undo = 6000`) rather than in a banner two hundred points away — and *beside*, not
*instead of*, because taking the ring's slot would hide the mark just earned and drop keyboard
focus to the body.

Past six seconds, `architecture.md` §3's past takes over: the last 40 watches render above the
present with live, reversible rings, and the walk confirmed ten of them. Past **forty**, the
route back is "find the show, find the season, find the episode".

In Cognitive Dimensions that is **viscosity** — resistance to change — and its shape here is
the interesting part: it is not a gradient, it is a cliff. Correcting watch 40 costs one tap;
correcting watch 41 costs a search, a season, and a scroll. `architecture.md`'s seventh
refusal states the cap and its reason honestly (a 3,000-row library is a screen that cannot
open, and §6.156 measured it) and then points at Stats as the answer for "where is the thing I
watched in 2019" — which is the same Stats that, until this pass, answered with the wrong year
on the phone. The two findings are one hole seen from two sides, and `direction.md`'s Library
graft is the thing that closes it.

*Falsified by:* any route from a watch older than the 40th to its own row. There is one — the
title page — and it requires knowing which title, which is precisely what somebody correcting
a mis-tap does not.

### 6. Nothing in the product marks the end of anything smaller than a year

Grep `core/src/copy.ts` for a sentence fired by finishing a season or a series: there is none.
The nearest is `upNext.allCaughtUp` — *"All caught up — nothing has aired that you have not
seen."* — which is an **empty state**, fires for the whole library rather than for one show,
and is registered as such in `core/src/ui/emptyStates.ts:95`. Marking the last episode of a
season is byte-for-byte the same event as marking the third episode of a season.

This is the peak–end rule's other half and the only finding here that is about something
absent rather than something wrong. The build has a very good **peak** — the cross-off, which
`direction.md` chose precisely because it fires on the highest-frequency action forever — and
no **end** at any scale a person actually experiences. A season is the unit people talk about.
`direction.md`'s graft 3 (the empty slot on the year spine) and graft 10 (the inline prompt
after marking) are both ends in this sense, and neither is started.

One correction to `direction.md`'s framing of graft 10 while I am here, since this document's
own rule is that a claim about the build names the file it was read from. The *"Open the
conversation after marking watched"* toggle is **not** wired to nothing: `app/src/screens/UpNext.tsx:463`
and `mobile/app/(tabs)/index.tsx:492` both navigate to `/comments/:id` after a mark, gated on
`openCommentsAfterWatch() && syncConfigured()`. The behaviour exists; what is missing is the
*design*, and the gate is the finding. On the default build there is no Supabase
configuration, so `syncConfigured()` is false and the one end-moment in the product **never
fires for the person the product is built for** — the local-first arrival with no account,
whom `COPY.app.localFirst` promises nothing is withheld from. The comment beside the gate is
right that an empty conversation would be a dead end; graft 10's answer — a local review in
the row you just crossed off, needing no account — is the one that reaches that person, and
it is why the toggle's subtitle (*"Needs an account"*) has to change with it.

Filed, not fixed. It needs a decision about what the end **is**, and the decision is
constrained by calm technology's first principle (*the smallest possible amount of attention*)
and by `direction.md`'s explicit refusal of Bias Light's Cut to Black — *"atmosphere billed at
the rate of the core loop, on the one action that most needs to feel instant, in a dark room."*
Any answer here that costs more than a rule redrawing has already lost.

*Falsified by:* a copy string or component that fires on completing a season and not on
completing anything else.

### 7. The instrument reports a scroll as a clip

`design/measure.mjs:222-228`. Section 2 has the measurement. Filed rather than fixed because
the fix changes `runs()` as well as `boxes()`, and this repository's rule is that a rule fixed
in one of two places is a rule that will disagree with itself.

---

## 4. Where the frameworks found nothing, and that is the finding

**Calm technology, on the microphone.** `app/src/watching/ListenSync.tsx` is opt-in per use,
says `Listening…` while the microphone is open (`COPY.waiting.listening`, commented as *"the
only one that costs battery"*), distinguishes *"nobody has mapped this episode yet"* from
*"could not check for a timeline"* — §6.57's distinction, kept — and explains what is and is
not sent before asking. Principle 5, *technology can communicate but doesn't need to speak*,
and principle 8, *respect social norms*: the file's own header says *"'this app listens to
your room' is exactly the kind of feature that deserves to be refused if it is not explained
properly."* The brief expected the fingerprinter to be a gulf-of-evaluation finding. It is
the opposite: it is the best-signified subsystem in the product.

**Calm technology, on notification volume.** `core/src/calendar/upcoming.ts:236` defaults to
`'milestones'` with the reason written beside it — *"useful without being the thing people
complain about"* — and `mobile/src/notifications.ts:43` sets `shouldSetBadge: false`. Nothing
in `copy.ts` nags. Principle 1 holds.

**Calm technology, on the one thing that moves.** Watching Mode's reaction stream runs
continuously — which WCAG 2.2.2 asks about, and which principle 3 (*make use of the
periphery*) says is right for a stream you are not reading. It is stoppable (`Hold`,
independent of the clock, so the timecode keeps running), thinnable (`DEFAULT_REACTION_DENSITY
= 24`), each reaction lives `REACTION_VISIBLE_MS = 4000`, and reduced motion is decided in one
place (`useReducedMotion`, guarded by `motion.test.ts`: *"nobody decides Reduce Motion at a
call site"*). Three separate controls over one moving element, none of which stops the app
working.

**SDT, on the streak.** The build prints `Longest streak` (`COPY.stats.longestStreak`) and
that is the *only* streak in it: case-insensitive grep outside tests returns nine
occurrences, and every one of them is either the computation in `core/src/stats/compute.ts`
or the two Stats screens reading it. It is **retrospective** — the longest run you have ever
had — not a live counter you can break, and
Stats is deliberately kept off the tab bar and out of the marking flow, with the reason quoted
from research in `mobile/app/stats.tsx:32`: *"stats stresses me out […] I don't need a reminder
that I spent literal months doing this every time I check an episode."* That is the
non-manipulative form of a streak, and it is the difference between competence (a true fact
about you) and controlled motivation (a thing you will lose). The refusal held. **It is the
only place in this evaluation where a stated design intent was checked against the build and
found intact without qualification.**

The one qualification worth carrying: a streak is only a fact about you if it is computed over
the right period, and until this pass the phone computed it over the wrong one. `Longest
streak 2 days` was reported for 2026, 2025 and 2024 alike.

**SDT, on relatedness.** Reactions write locally and work signed out (`addReaction`), and
`COPY.app.localFirst` states the product's stance on the screen where somebody goes looking
for the catch: *"nothing here needs an account, and nothing is withheld."* Autonomy, in the
volitional sense, is the load-bearing claim of the whole architecture and it is kept.

---

## 5. What was fixed here, with its plants

**Finding 1 only.** Cheap, isolated, certain, and demonstrated on a real build before and
after.

**The plant.** The defect was already shipping, so the plant is the build itself. The
measurement of what the existing guards were worth against it:

- `npx vitest run --root core src/stats` — **41 clauses, all green**, including
  `'a year begins at local midnight on the first of January'` and `'scopes a specific year'`,
  both of which pass `'year'` explicitly and therefore could never see this.
- `npx vitest run --root app src/wiring/offers.test.ts src/wiring/copy.test.ts
  src/wiring/screenStates.test.ts` — **27 clauses, all green.** These are the three guards
  whose job is that the two platforms offer the same things, say the same words, and reach the
  same states. `PAIRS` maps `/stats` to `Stats.tsx` and `stats.tsx`. All three passed while
  the two screens answered different questions.

Sixty-eight clauses, and vacuous against this. That is a measurement, not an adjective.

**The new guard, watched to fail with the defect still in place.**
`core/src/stats/compute.test.ts` gained three clauses, and before any repair they reported:

```
FAIL  windows > answers the year it was given, whatever window sits beside it
AssertionError: 30d with a year: expected 1778932800000 to be 1735689600000
FAIL  against the database > scopes a year handed to it beside a window, which is how the phone asks
AssertionError: expected 2 to be 1
```

That is the output with the repair reverted and the guard left in place, run after the
repair rather than only before it — because "the guard fails on the defect" is a claim about
the guard, and a guard only tested against the state it was written in has been tested once.

The second is written as the phone's call site writes it — `getSummary('ytd', { year })` —
because the defect was only ever visible from that shape. The first sweeps **all four**
windows, not the one that was wrong, since a clause naming `'ytd'` would pass again the moment
the phone's default changed.

**The repair.** `core/src/stats/compute.ts` gains `askedFor(window, year)`: a year given is a
year meant, whatever window sits beside it. It is applied inside `windowStart` and `windowEnd`
rather than at either call site, because the call site is two files and the next one will be a
third, and because there is no reading of this product under which the honest answer to "give
me 2019" is a different year, silently.

**No screen was edited.** `app/src/screens` and both navigation files belong to another pass
this sprint; the repair is in `core` and both platforms inherit it. That is also the better
fix on its own merits.

**Restored, and confirmed on the build rather than in a test.** `npm run export --workspace
mobile` rebuilt the phone, and the same instrument that found the defect was re-run against it:
2026 → 50, 2025 → **66**, 2024 → **6**, identical to the web. `npx vitest run --root core
src/stats` — 44 clauses, green. A core clause can say a range was computed; only the export
can say the screen printed it.

**One red in `verify` that is not this, and is not the code.** `app/src/wiring/assertions.test.ts`
times out at its 5,000 ms limit under a full-suite run on this machine — *asserts something*
at 5,110 ms and 8,160 ms across two runs, *keeps no exemption* at 5,195 ms and 6,313 ms. Run
alone the file passes in 4.30 s of test time, which is the cliff. Established as pre-existing
the only way that settles it: the changes above were stashed, the suite was run at `HEAD`, and
both clauses failed there too — worse, in fact. `core` is 955 green, `relay` 24, `bridge` 24,
`extension` 32, `tokens:check` current, both builds clean. The red is four worktrees sharing a
machine, and it is filed here rather than repaired because a timeout raised by load is a
finding about the runner and this pass has no claim on that file.

---

## 6. What this frame says to do next

Ordered, and each is one of the findings above rather than a new wish.

1. **Read the report you already compute.** `acceptMatch` returns `MigrationReport`;
   `MatchImports` should say *"Moved 41 watches; 3 episodes this provider does not list stayed
   where they were."* One sentence, on the screen where the irreversible act happened. This is
   the smallest possible closing of the largest gulf of evaluation in the product, and the data
   is already in the return value. (Finding 2.)
2. **Give the set-aside queue the periphery.** `FailureBanner` is mounted at both roots and
   `COPY.sync.rejected` is written. Subscribe it to `onSyncStatus` and let a permanently
   rejected write raise itself once, quietly, dismissibly, anywhere in the app. Calm technology
   principle 6, at the cost of one subscription. (Finding 3.)
3. **Make a match provisional before making it reversible.** The cheaper half of finding 2:
   the questions arrive in the person's first minute, and CD's answer to premature commitment
   is not always undo — it is *deferral*. `skip()` already leaves a title unmatched with no
   penalty; what is missing is a way to say "these look right, show me what they did" before
   the eight-table transaction runs.
4. **Choose the Stats default from the library rather than from a constant.**
   `availableYears()` already returns what is needed. A person whose history spans three years
   should not open on the third of it. (Finding 4.)
5. **Decide what the end of a season is, cheaply.** `direction.md`'s graft 3 is the candidate
   already argued for and already costed at one `View`. The peak exists; the end does not.
   (Finding 6.)
6. **Teach `measure.mjs` that a scroller is not a clipper** — in `boxes()` and `runs()`
   together. (Finding 7.)

## 7. What this frame says to stop doing

1. **Stop saying "affordance" when you mean a control you can see.** Sixteen files. The word
   is *signifier* (Norman 2008), and the distinction is the reason `direction.md` had to refuse
   three separate proposals to replace a 24pt labelled tab with something narrower.
2. **Stop citing a framework the repository has never opened.** There is no `Fitts` in this
   tree and there should not be one added: the 44pt floor is WCAG 2.5.5 and the Apple HIG, and
   naming Fitts for it would be a citation nobody could check — which is the same defect as an
   unchecked claim about a file, one discipline over.
3. **Stop letting a control announce a state the system did not enter.** Finding 1 is fixed;
   the class is not. A `Choice` whose `aria-checked` moves and whose figures do not is worse
   than a control that visibly fails, and no source guard in this repository can see it. The
   walks (`look.mjs`, `lookPhone.mjs`) are the only instrument that can, and they do not yet
   visit Stats.
4. **Stop computing a fact about somebody and discarding it.** `MigrationReport` and
   `SyncStatus.rejected` are the two live instances. Both were computed by somebody who wrote
   a paragraph about why the number mattered.
5. **Do not add a streak, a badge, a nudge or a target.** The refusal is holding, it is the
   product's clearest SDT position, and it is one product-review meeting away from being lost.
   `Longest streak` on Stats is retrospective and is the boundary: anything that can be
   *broken* is on the other side of it.

---

## 8. What did not survive contact

- **"The HCI grounding is scattered across nine files as passing mentions — Fitts, an
  affordance, a heuristic."** Fitts: zero. A heuristic in Nielsen's sense: zero — the four
  occurrences of the word all mean a guess made by a script. `affordance`: sixteen files, all
  sixteen using it for something Norman would call a signifier. There was nothing to gather;
  there was a vocabulary to correct.
- **"A sync outbox, a matcher and a fingerprinter that all do invisible work."** Two of three.
  The **fingerprinter is the counter-example** — opt-in per use, states what it sends, says
  `Listening…` while the microphone is open, and distinguishes "could not look" from "nothing
  there". Section 4 has it. The frame was pointed at three subsystems and found the third one
  exemplary, which is the only reason to trust it about the other two.
- **"Nielsen's most under-used clause here is likely visibility of system status."** True of
  findings 1, 2 and 3 — and Nielsen is refused as the *frame* for all three anyway, on the
  method's own published grounds (one evaluator: 20–51%). The clause is the right diagnosis
  arrived at by the wrong instrument, which is worth distinguishing in a repository whose whole
  character is that the instrument has to be able to be checked.
- **"TV Time used streaks and badges. Is this product accidentally doing the manipulative
  thing anywhere?"** No. This was the framework I most expected to catch something and it
  caught nothing, and the honest report is that the refusal is deliberate, argued in three
  places, and intact in the build.
- **"Marking watched currently dead-ends."** `direction.md` graft 10's premise, and it is
  half wrong — the same shape as the remote-drawer error that document itself diagnosed. The
  post-mark navigation is built on both platforms and the toggle drives it; what it lacks is a
  design and an account-free path. Finding 6 has the lines. A document that mis-describes what
  it is replacing will mis-price it, which is `direction.md`'s own refusal 4, applied to
  `direction.md`.
- **The auto-dim is not an unexamined calm-technology gap.** `core/src/tokens.ts:106-120` and
  `:471` already record that auto-dim was never built, that its three palette roles and
  `linger.dimAfter` were deleted for being decided and unread, and why. It stays the strongest
  unbuilt calm-technology item in the product — principle 1, and the best sofa reasoning in the
  three directions — but it is a known hole, not a find.

---

*Six findings, one repaired. The frameworks that earned their place did so by being wrong at
least once: calm technology was brought in to convict the fingerprinter and acquitted it,
self-determination theory was brought in to find the manipulation and found none, and the two
that convicted — Norman's gulf of evaluation and the peak–end rule — did it on the same screen,
which nobody had looked at since it was built. The evaluation that mattered was not the
literature. It was that Stats had never been walked with a library in it that spanned more than
one year, and the moment it was, it said `Your 2025` over 2026's numbers and kept saying it
until somebody read the figures underneath the heading rather than the heading.*

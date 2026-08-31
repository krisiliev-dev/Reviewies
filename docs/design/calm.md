# What this app is for in a week, and what it refuses

`direction.md` decided what the product looks like. `architecture.md` decided what it is a
map of. Neither decided **how much of a person's attention it is entitled to**, and that is
the decision every commercial tracker in this field has already made in the other direction,
because engagement is the thing they sell.

This product does not sell it. There are no ads — doc 08 §4 records *"an incredibly annoying
bar permanently present over the interface"* as a live complaint about a competitor — no
paywalled stats, no VIP log limits, and no number anybody has to report to anybody. So the
refusal is **available here and nowhere else in the field of fifteen**, and a refusal that is
available and not taken is a decision made by default.

---

## 1. The frame: calm technology

Mark Weiser and John Seely Brown, *The Coming Age of Calm Technology* (1996):

> Calm technology engages both the center and the periphery of our attention, and in fact
> moves back and forth between the two.

with the periphery defined as *"what we are attuned to without attending to explicitly"*, and
the aim stated as *"to put us at home, in a familiar place."* Amber Case's eight principles
put the operative half in one line: **technology should require the smallest possible amount
of attention**, and **the right amount of technology is the minimum needed to solve the
problem.**

It is the apt frame because the research is already a demand for it, in the user's own words,
and doc 03 §2.2 records it as the *aggressively stated* top-line demand:

> I just want to open the app, mark the episode i watched, read the comments, close the app.

> The ~~most~~ **only** important thing in an app is that it opens directly to the page where
> I can see and mark the next episodes of my shows.

**Where the frame does not fit, said before it is used.** Weiser and Brown's periphery is
ambient: dangling string, ubiquitous sensing, information in a room. This product is one
screen held deliberately by one person, and there is no periphery to move anything into — the
phone is in your hand or it is in your pocket. So Case's third principle, *use the periphery*,
does not translate, and refusal 8 below is what follows from admitting that rather than
building a widget to satisfy a category. What translates is the attention budget: C1 and C7,
the smallest amount, the minimum needed.

---

## 2. The other three frames, and what each earned

A frame that survives unexamined is decoration. Each of these was taken seriously and two of
them are cut.

### 2.1 Self-determination theory — **accepted in one half, refused in the other**

The useful part is not the three needs. It is **cognitive evaluation theory**, Deci and
Ryan's account of *why* a reward can make somebody want a thing less: the **informational**
aspect of feedback supports perceived competence and keeps the perceived locus of causality
inside the person, while the **controlling** aspect moves it outside. The undermining effect
is strongest, in their own summary, when a reward is **expected, tangible and contingent on
task engagement**.

That gives a test rather than a taste, and it is the one this document runs everything past:

> **Is this a fact about what happened, or a response to what you did?**

A streak is expected, contingent and losable — all three conditions at once, in one figure.
A record of what you watched is none of them. TV Time ran on the first; this build's answer
is the second, and §4 is what got built to make that answer a shape instead of an argument.

**Refused from SDT: the three needs as a design checklist.** A needs list justifies almost
anything — badges satisfy "competence", leaderboards satisfy "relatedness" — which is exactly
why gamification vendors cite it. A theory that licenses both sides of a decision has not
helped make one.

**Refused specifically: relatedness as a mandate.** Every tracker in doc 08's field turns
relatedness into a follower count and a like, and r/serializd documented a ring of fake
accounts inflating precisely those two numbers. This build already exposes no public follower
count. Relatedness here is the reaction stream and the per-episode comments — other people in
the same minute of the same episode — and it is never an audience with a score.

### 2.2 The peak–end rule — **accepted as a description, refused as a prescription**

Kahneman and colleagues: a retrospective evaluation approximates the average of the emotional
peak and the end, and the total duration of the experience has almost no effect on it
(*duration neglect*). The remembering self keeps the score; the experiencing self does the
watching.

What it earns is one real design consequence: **a year is better drawn than totalled.** Nobody
remembers 412 episodes. They remember the month they watched everything, and how it ended. So
the year spine's alt text names the **busiest month** — the peak — and the rows run **newest
first**, so the end is nearest. Duration neglect earns a second: *"5.5 days watched"* is the
one quantity the theory says nobody relates to, and it is currently the headline figure on
Stats. It stays, because it is true and somebody asked for it, but it is not the thing to lead
a screen with, and the spine now does.

What it does **not** earn is its prescriptive form, and the prescription is right there in the
title of the 1993 paper — *When More Pain Is Preferred to Less: Adding a Better End*. A
product that manufactures a peak, or engineers an end onto your evening, is editing your
memory of your own life. Bias Light's cut-to-black title card was exactly that, and
`direction.md` graft 10 already refused it — *"atmosphere billed at the rate of the core loop,
on the one action that most needs to feel instant, in a dark room."* Same refusal, now with
the reason it generalises: **peak–end tells you how a record will be read; it is not a licence
to write one.**

### 2.3 Slow technology — **refused for the loop, admitted for the artefact**

Hallnäs and Redström (2001) define it as a design agenda aimed at reflection and moments of
mental rest rather than efficiency in performance — technology whose *presence as a temporal
structure* is amplified, which in practice means deliberate slowness, ambiguity, and things
that reveal themselves over time.

**It is refused for the core loop, and the reason is the loudest sentence in the research**
(§1 above): the app must open directly onto the thing you mark. Slow technology's method
applied to marking an episode watched is a designed delay on the highest-frequency action in
the product, in a dark room, at the moment somebody is trying to put the phone down. This
repository has already refused that exact thing once by another name.

There is a real distinction inside the theory that saves the useful half. Hallnäs and Redström
separate slowness in *interaction* from an artefact whose value **accrues over time**. The
first is refused. The second is what this product already is: a record that gets better the
longer you keep it, which is `direction.md`'s *"left for simplicity, stayed for the record"*
thesis and needs no delay anywhere to be true.

Worth naming the divergence, because it is the one place two of these frames pull opposite
ways: **calm asks for less attention per interaction; slow asks for more attention, more
deliberately spent.** Letterboxd's actual appeal is the second. That is what a writing surface
is for, and the way to have both is to make the route to it fast — a slow room at the end of a
quick corridor, never a slow corridor.

---

## 3. What this product is for, in a person's week

Three occasions, and no fourth.

1. **In the credits, for eight seconds.** Open, mark, close. Most sessions, and the only one
   that has to be fast.
2. **Before you choose, for a minute.** What is on, what aired, what you left half-finished.
3. **Once in a while, on purpose.** The record: Stats, the year spine, Year in Review. Nobody
   is sent here. You come.

The job is to make (1) instant, (2) honest, and (3) worth arriving at — and never to convert
one into another. **A record that reaches into occasion (1) is a stat block at the moment of
marking**, which doc 08 records a person calling a *"watch time nag"*. **A prompt that turns
occasion (3) into a habit is a streak.** Both conversions are refused below.

---

## 4. The refusals

Eight. Each with what it costs, because a refusal with no cost is a preference wearing a
decision's clothes.

Five of them are already held somewhere — the spine's placement by `yearSpine.test.ts`, the
crowd score by `browse.test.ts`, the capped past by `architecture.md`'s own clause. The three
that were held by nothing at all are 1, 3 and 6, and `app/src/ui/calm.test.ts` is what holds
them now: a refusal nothing checks is a wish, and this repository has spent four sprints
finding out what happens to those.

**1. No streak that is still running.**
Not "no streaks" — the distinction is the decision. `stats.longestStreak` stays, on
`direction.md`'s own grounds that it is a true fact about a year that already happened: it is
retrospective, it is nowhere near the marking action, and within its window it never goes
down. What is refused permanently is any **current** streak — a number that is live, losable,
and visible at the moment of the decision. That is CET's three conditions in one figure, and
it is the thing TV Time ran on.
*Cost:* a live streak is the single most reliable retention device in this category, and we
are declining it. The honest expectation is fewer daily opens by somebody who would have
opened out of obligation, and no daily-active number to point at.
*The leak, named rather than hidden:* in the `30d` window `longestStreakDays` **can** fall,
because the window moves under it — a live-and-losable number wearing a retrospective name.
Not fixed this sprint. It is the first place to look if that figure ever starts reading as a
target.

**2. No badges, levels, trophies, or completion as a reward.**
The spine and its open cell are the entire reward system. A percentage through a season stays
where it is a *navigational* fact — how much is left — and never becomes a thing to complete.
*Cost:* the App Store screenshot is weaker. Badges photograph; an empty box does not.
`direction.md` accepted the same trade about the poster wall with its eyes open.

**3. No notification whose purpose is to reopen the app.**
Notifications stay exactly as the calendar has them — Nothing / Premieres & finales / Every
episode, with Premieres & finales the default — and every one of them is **news about the
world**: a thing aired. Nothing is ever sent about the person's own behaviour. No *"you have
not watched in five days"*, no *"your streak"*, no *"you left this half-finished"*.
*Cost:* the re-engagement push is the second most reliable device after the streak. It also
means the app has no voice for telling anybody about a new feature, and will not grow one.

**4. No infinite feed, and every list ends.**
Up Next's past is capped (`architecture.md` refusal 7), Discover is a shelf you reach the end
of, and the reaction stream is bounded by the episode. A surface that cannot be finished is a
surface that decides when you leave.
*Cost:* *"where is the thing I watched in 2019"* is answered worse than an endless history
would answer it. That hole is `direction.md`'s own admitted one and stays open until the
Library tab lands; the spine narrows it and does not close it.

**5. No public score on a title page.**
Kept from `architecture.md` refusal 3 and restated here because it is a calm refusal as well
as an aesthetic one: a number in the corner of every box turns looking into shopping, and
hands you a comparison you did not ask for before you have had your own reaction.
*Cost:* people really do use scores to decide, and we make them decide with less. A filter
over a number you cannot see is also harder to trust than one you can.

**6. No "you are behind."**
No red debt count, no *"3 episodes behind"*, no framing that measures a person against a
broadcast schedule they did not agree to. `ui/row.ts` already argues the narrow version of
this — *"a count, not a vague NEW badge"* — and this is the general rule. The open cell is the
crisp case: it says **the next one goes here**, and never *you have not done this*.
*Cost:* *"you are twelve behind on Andor"* is genuinely useful when you are choosing. We ship
the weaker sentence — twelve unwatched — which carries less urgency. That is both the point
and the loss.

**7. No stats at the moment of marking.**
Doc 08 §4: *"stats stresses me out […] I don't need a reminder that I spent literal months
doing this every time I check an episode"*, and *"watch time nag when you try to mark
something as watched."* Marking shows the mark. This was true by accident — doc 08 files it
as *"aligned by accident"* — and it is a rule now, held by a clause: `yearSpine.test.ts`
fails if the spine appears on either Up Next.
*Cost:* the moment after marking is the moment of highest attention and the natural home for a
reward. We spend nothing there deliberately; the cross-off's own 220ms is the whole
celebration.

**8. No ambient display invented to satisfy the frame.**
Case's third principle asks for the periphery and this product does not have one (§1). Building
a widget or a live activity *because a theory names the category* would be the frame deciding
the product. Widgets are a real request — doc 03 §3.4 records them as a loved TV Time feature
a PWA cannot provide — and they are worth building **as a shortcut to occasion (1)**, never as
an ambient display looking for something to say.
*Cost:* this is the one place the canonical form of calm technology actually lives, and we are
declining it. If the frame is right about anything, it is right about that.

---

## 5. What the frame finds in the build as it stands

**Watching Mode is not calm, and that is correct.** It is a lit phone, held, during an
episode — precisely what Weiser and Brown would call the failure. The frame is overruled here
on purpose, because Watching Mode is the product's thesis and doc 03 §4 is unambiguous that it
is the one thing nobody else has. The mitigation is physical rather than rhetorical:
`direction.md` graft 9's auto-dim at 75%, and `tokens.ts` has already recorded that the
dim-by-palette version of it does not work and why. Written down here so that nobody later
"fixes" the flagship by making it quieter.

**The calm instrument already in the build is the density cap.** `watching.densityChoice` —
*show at most N reactions on screen at once* — is Bilibili's own lesson and Case's first
principle in one control, and it was built before anybody had the words for it.

**Is this build accidentally doing the manipulative thing anywhere?** Swept for it, and the
answer is no, once: there is no live, losable, behaviour-contingent figure anywhere in the
product. The only candidate is the `30d` streak window named in refusal 1, and it is a leak
rather than a device. That is worth recording as a *pass* rather than assuming a finding — the
question was asked and the answer was not the flattering one by accident.

---

## 6. What was built against this document

**The year spine, with the open cell** — `direction.md` grafts 2 and 3, the second of which
that document calls *"the best single idea in the set"* and *"the whole reward system"*. It is
built because it is the thing refusal 1 exists **instead of**: taking away the streak without
putting the record in its place is a subtraction, not a decision.

- `core/src/ui/spine.ts` — the drawing table, and the arithmetic that keeps the open cell on
  screen: the plot is the fill area plus the gap plus the cell, exactly, so the busiest month
  in a decade cannot draw over the one object the component exists for.
- `core/src/stats/compute.ts` — `spineYears`, one row per year of twelve counts. Counts and
  not ratings, because `diocache.ts` deposits no television ratings at all and a strip keyed
  to rating is flat grey on the day a decade arrives.
- `app/src/ui/YearSpine.tsx` and `mobile/src/ui/YearSpine.tsx`, on both Stats screens.
- `app/src/ui/calm.test.ts` — refusals 1, 3 and 6, swept. Its own first draft fired on
  `discover.empty` — *"Track a few things and come back"* — which is an empty state naming
  the way out of itself, not a summons. The rule was fixed rather than the copy; the
  clause says so at the line.
- `core/src/copy.ts` — four sentences, one owner. The load-bearing one is the caption: *"One
  space still open this month. The next episode you mark goes here."* It is a fact, not an
  offer. *"Mark an episode to fill it"* is the same box asking, and the difference between
  those two sentences is this whole document in one clause.

**It was looked at, not only type-checked.** Built, served at 390x844, seeded with a decade
and read off the rendered boxes: twelve columns of 28.0 x 32.0; the busiest month drawing
24.0pt, which is the ceiling exactly, with the open cell still on screen above it; the cell
6.0pt tall with a 1px border in `rgb(138, 128, 121)` in dark and `rgb(110, 100, 86)` in light,
sitting 5pt above its column floor in a month with 3pt of fill — riding the mark, not parked
at the top. In light the marks come out biro blue on cream, which is `direction.md`'s
marked-up almanac arriving without anybody drawing it. The measurements are in
`core/src/ui/spine.ts`; the walk was a throwaway, because `design/look.mjs` is the instrument
this repository keeps and one more capture script would have been surface nobody asked for.

**Three properties it has that a streak does not**, each held by a clause rather than by this
paragraph:

- **It cannot be lost.** Nothing on it ever decreases. There is no state in which it accuses
  anybody of anything.
- **It is on the year you are in, not the last year you watched anything.** Somebody returning
  after two years away gets the open cell in *this* year — an empty almanac waiting — rather
  than in 2024, which would be the app pointing at where they stopped. That is refusal 6 in
  one array index, and `spine.test.ts` plants it.
- **It is not where you mark.** It grows where you go to look at it. A reward that arrives
  under your thumb every time you act is a response to behaviour however handsome it is, which
  is CET's controlling half; a record you find when you come looking is the informational one.

**What that placement costs, stated plainly.** `direction.md` promises the empty slot *"makes
the highest-frequency action in the product grow a visible object every time"* — and today it
does not, because the object is on Stats and the marking is on Up Next. You grow it and see it
later. That is a real reduction in the graft as sold, and it is taken deliberately for the
reason above, not because the animation was hard. The mitigation is that the object's proper
home is the **Library** tab, which `architecture.md` §2 says is *not started* rather than
refused; when it lands, the spine goes there too, and the person who marks and then browses
their library sees it that evening.

**What was not built, and why not.**

- **The Library tab.** The right home for the spine, and out of scope for one sprint: it is a
  new tab, two navigation files, and a screen — contested territory this sprint, and
  `architecture.md` explicitly refuses putting a placeholder in the bar.
- **The strike animation into the cell.** Nothing here animates. It is worth almost nothing
  until the spine is on the screen where marking happens — a motion nobody is present for —
  and `tokens.ts`'s `duration.spine` is **not** the number for it when it comes: that entry is
  the tape spine's cross-fade on a poster, and reaching for it because the two share a word
  would be the exact class of mistake `duration.crossOff` was deleted from `crossOff.ts` for.
  A stroke that travels gets its own number, or it gets `crossOff`'s.
- **The reflective half — what did I think of this.** Named here because it is the largest
  remaining hole and this document is where the case for it lives: Letterboxd's appeal is
  §2.3's slow room, `direction.md` graft 10 already designed the inline prompt after marking,
  and `13-data.png` already ships a toggle for it whose subtitle is wrong. That is a sprint of
  its own and it is the one I would take next.

---

## 7. What this costs, said plainly

This product is choosing to be **forgettable on purpose**, and the risk in that sentence is
real: an app nobody is reminded of is an app somebody can stop opening. Every device this
document refuses works. They are not refused because they fail; they are refused because what
they buy is attention the product has no honest use for, from people who said, in the plainest
language in the whole research record, that being asked for it is why they left the last one.

The bet is that the record is the retention — that a decade of marked-up months is a reason to
keep an app that never asks for anything, and that the open cell is a better argument for
tonight than a number you are about to lose. It is a bet, and this is the document that will
be wrong if it does not come off.

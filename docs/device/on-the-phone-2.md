# The second brief, built from the open list rather than from the interesting list

A brief for a local agent with a Mac, Xcode and a physical iPhone. It assumes
`docs/device/on-the-phone.md` has been done — three of its eleven questions are answered in
`docs/device/findings.md` and eight are still marked `NOT YET CHECKED`.

## Why there is a second one, which is itself a finding

The first brief was written from the list of **known asymmetries**: places where the phone and the
react-native-web export are understood to render differently. That is a good list and it produced
the single best return this project has had from a device — question 2 found text *clipped* where
sixteen sprints of export work had been predicting text *overflowing*, and the prediction it
falsified had been written from the export.

But it is the wrong list to have written a brief from, and §7 says so now. The right list is the
**open §7 items** — the things this record has been carrying as unknown, some of them for a
fortnight. Those two lists overlap and are not the same, and the gap between them cost a question:
Stats' year scroller has been filed since §6.109 as a gesture conflict nobody has felt, it is the
kind of thing only a finger can answer, and it was not among the eleven asked, because a nested
scroller is not a *rendering* difference. It is a difference in what the export can be asked to
do at all.

So this brief is organised by **which §7 entry each answer closes**, and every question below names
one. If a question here cannot be traced to an open entry, it should not be here.

## How to record what you find

Same as before, and the rule that matters most is the same one: append to
`docs/device/findings.md`, one heading per question, **and leave the ones you did not do marked
`NOT YET CHECKED`**. §6.57's distinction between *nothing* and *I could not look* is a rule this
project has broken three times now. A heading left unanswered is a true statement. A heading
quietly deleted is a lie that reads like progress.

Where there is a number, write the number. Photographs to `docs/device/shots/`, named for the
question. If something is wrong, **say it plainly rather than fixing it** — except where a question
below explicitly asks for a fix, and none do.

---

## A. THE ONE PHOTOGRAPH. What is clipped on More at maximum Dynamic Type

**Closes:** the §6.187 / question-2 residue, which is the largest open thing on the list.

Set text to the largest non-accessibility size, open **More**, photograph it.

The question is exactly one thing: **is the cropped text the row's own words, or the tab bar's
labels underneath them?** And if the row's — the *title* line or the *detail* line?

Everything else has been eliminated from here. A sprint read all six bundled font files and
measured every mapped glyph against its own box: in Archivo Narrow SemiBold (a row's title) **0 of
657** glyphs reach below the box, and in Newsreader Italic (a row's note) **0 of 564**. The export
agrees at 100%, 135.3%, 214.3% and 357.1% — the real iOS ladder — where a title's ink clears the
bottom of its box by 2, 4, 5 and 10 points and never once crosses. So `numberOfLines` cropping
against TextKit's used rect **cannot** be what was seen, and the defect is not in `Row.tsx`.

The tab bar is the only piece of navigation present on both screens the first report named, it is
at `TAB_BAR_HEIGHT` 60, and it is the one thing here that cannot be run outside a device. It is
the leading candidate by elimination and one photograph either confirms it or sends this back to
the drawing board.

## B. Does the leading actually grow

**Closes:** §6.187, which retracted §6.183 and is the second time in a fortnight a fact about a
renderer was written down as a fact about the product.

React Native 0.86 multiplies a stored `lineHeight` by the reader's scale — iOS in both renderers
(`RCTTextAttributes.mm`, `RCTAttributedTextUtils.mm`), Android through `toPixelFromSP`. So
`leadingOf(14, 1.43)`'s 20 points should be **40** at 200%. `react-native-web` emits it as `px`
and pins `Dimensions.fontScale` to 1, which is why every check here sees 17 and holds.

That is a reading of the source, not an observation. **On an Up Next row at 100% and again at
maximum, does the space between two lines of a wrapped title grow roughly in proportion to the
glyphs, or does the type grow inside a line box that stays put?** Proportional is the source being
right. Static is the source being wrong, and would mean the collision three files promised immunity
from is available after all.

## C. Does the tracking survive, and how bad is it

**Closes:** the deliberately-unrepaired residue in the same entry.

iOS hands `letterSpacing` to `NSKernAttributeName` raw where Android scales it, so a tracked
eyebrow should fall from 0.083em to about 0.042 at 200% and 0.028 at 300% — the letters stay the
same distance apart while the glyphs double, so the spacing *looks* like it closes up. The repair
was declined deliberately because the unconditional version doubles it on the platform that
already scales.

**At maximum, does an eyebrow — the small tracked capitals above a section — look tight,
crowded, or fine?** This is a judgement and should be recorded as one. "Looks fine to me" is a
usable answer to this specific question and to almost none of the others.

## D. The years scroller, which is the question the first brief missed

**Closes:** the §6.109 entry that has been open since the period control was settled.

Open **Stats** on a library with several years of history. The second row is a horizontal
scroller of years on a screen that also scrolls vertically.

Two gestures, in this order:

1. Swipe the years **sideways**. Do they move? Does the page move with them?
2. Put a finger **on the years row** and swipe **down**. Does the page scroll, or does nothing
   happen because the row swallowed it?

§6.109 measured that this arrangement is 88px against the 148px of the alternative and puts the
figures 14 points higher, and chose it on that. The cost was never felt. `scroll` is off for the
other four `Choice` call sites, so whatever you find is scoped to this one control.

## E. Haptics, and what the design is leaning on

**Closes:** the fourth of the four export-versus-device entries, and it is load-bearing for the
colour system.

`core/src/ui/surface.ts` accepts a press contrast of 1.046 against the rise's 1.080 — a weaker
step than the system uses anywhere else — **in writing, on the argument that a haptic carries the
confirmation the eye is not getting**. `expo-haptics` is in this build at five call sites. Every
one of them fires on an *action completing*: a watch marked, a season caught up, a remote command
sent. Not one fires on a control being *held*. No shared control's press path touches it.

So: **press and hold a button — "Export everything (JSON)" on Your Data is the biggest one — and
say whether anything buzzes.** Then mark an episode watched and say whether *that* buzzes.

If holding does not buzz, the sink's written argument is leaning on a channel that is real on the
phone, wired to a different event, and inert everywhere any suite can look — and the contrast
decision has to be retaken rather than re-explained.

## F. The press step on real glass

**Closes:** the same entry, the visual half.

While holding that button: **is the label still readable against the sunk fill?** The arithmetic
says yes — `contrast(ink, own) >= 4.5` is checked in the design pass for every pressed control —
but the arithmetic is computed off a Chromium screenshot at whatever brightness the container
renders at. A phone at 20% brightness in a dark room is a different instrument.

## G. hitSlop, which nothing anywhere else can observe

**Closes:** §6.180, which is the purest example on the list of a guard that can only ever state a
number.

`react-native-web`'s `Pressable` ignores `hitSlop` **entirely** — only its `Touchable` reads the
prop, and nothing in this app uses `Touchable`. So the nineteen slopped controls the phone ships
reach eight points further than their box on a device (twelve, for the one on a dark overlay) and
not one pixel further in the export
every suite here drives. `REACH = { inline: 8, dark: 12 }` in `mobile/src/ui/theme.ts` states the
numbers and `app/src/ui/space.test.ts` holds every call site to them — eighteen at 8 and one at 12
— which is as far as a statement can get.

**Tap just outside the visible edge of a small control** — the chevron that expands a season on a
title page is the clearest one. Does it fire from a few points outside the box, or only from
inside it?

## H. Deep-link a title

**Closes:** §6.130, which established that a dynamic route cannot be deep-linked in the phone's
web export, and shaped the design harness's whole walk order around it.

From Safari or a terminal, open `reviewies://title/<some id>` — or whatever scheme
`app.json` declares — for a title already in the library. Does it land on that title's page?

The harness works around this by clicking its way to Watching Mode from Up Next rather than
deep-linking, and a comment in `design/capture.mjs` says a step added in the middle of that
sequence is how you find out it meant it. If expo-router routes fine on a device, that constraint
is the export's alone and should be written down as such.

## I. The image picker's native branch

**Closes:** the entry naming it as code that ships and has never executed.

Attach an image to a comment. The web export takes the other branch of that code, so the native
one has never run anywhere.

## J. The unmatched route

**Closes:** the same entry's last clause.

Ask the app for an address that does not exist. In the suite this screen is reached **by its own
address**, because the static server answers an unknown path before the app boots — so what is
under test is the screen, never the routing to it. On a device, expo-router should route to it.
Does it?

## K. Watching Mode with the screen locked

**Still open from brief 1, question 5.** Five minutes locked. Still listening on unlock? Position
kept up? Or did it die silently, which is the answer that matters?

## L. Sign in, and the outbox

**Still open from brief 1, question 8, and it closes more than one entry.** Create an account. Mark
two things watched in airplane mode. Reconnect. Do both arrive?

Then post a comment with an image, and check it from the web app signed in as the same person.
Nothing in this repository has ever been signed in on either platform.

## M. Notifications

**Still open from brief 1, question 9.** Does iOS prompt? Does a push token come back, or an error?
`getExpoPushTokenAsync` has never executed anywhere.

## N. wa-sqlite's transactions, on the real store

**Closes:** §6.135's entry — nested transactions and the settle signal have only ever run on
sql.js.

Import a large TV Time CSV on the device. Two things: does the progress state say anything while
it runs, and if you background the app mid-import and come back, is the library consistent — no
half-written show, no duplicate?

## O. Anything that simply looks wrong

Kept from brief 1 because it is the question that found the information-architecture report, which
is worth more than most of the specific ones above.

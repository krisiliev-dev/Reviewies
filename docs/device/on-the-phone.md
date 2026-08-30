# What to find out with the app in your hand

A brief for a local agent with a Mac, Xcode and a physical iPhone.

Everything in this document is a question **no check in this repository can answer**, because every
instrument here reads files in this repository. §6.186 is the entry that made that explicit: the
record spent several sprints asserting "no native build has ever been made" as a fact about the
world when it was only ever a fact about a container. A device ran the app; nobody wrote down what
it showed. That is the gap this brief exists to close, and **the recording matters as much as the
observing** — an observation that stays in your head is one this project cannot use.

## Before you start

```
git clone <this repo> && cd Reviewies && npm install
npx expo prebuild --clean --workspace mobile     # generates mobile/ios, which is gitignored
open mobile/ios/*.xcworkspace
```

Sign with a personal team (any Apple ID gives one), build to the device, launch. If any of that
fails, **that is finding zero** and the most valuable thing in this document — write down exactly
where it stopped and what it said.

## How to record what you find

Append to `docs/device/findings.md`, one heading per question below, and **commit and push**.

For each one write: what you did, what you saw, and — where there is a number — the number. A
finding of the form "seems fine" is not usable. A finding of the form "did not check" **is**
usable and must be written down as such: §6.57's distinction between *nothing* and *I could not
look* is a rule this project has broken twice at the wire and once in a screenshot, and half the
value of this exercise is knowing which questions are still open afterwards.

Photographs are welcome. Put them in `docs/device/shots/` and name them for the question.

If something is wrong, **say it plainly rather than fixing it**. A fix from a device with no
guard behind it is exactly the drift this repo spends its sprints undoing.

---

## 1. Does it launch, and what does it cost

Cold start to Up Next being usable, in seconds. Whether the first paint is the app or a white
flash. `useFonts` gates the first paint on the phone and is dead code in the web export, so this
is the first time that gate has ever executed.

## 2. Dynamic Type — the one with a predicted answer

Settings → Accessibility → Display & Text Size → Larger Text, drag to maximum.

Predicted: **type grows, the poster plate does not.** `core/src/ui/poster.ts` states
`POSTER_GLYPH_SCALES = false` and the phone sets `allowFontScaling={false}` on the monogram,
because at 200% in the browser export a 44x66 plate held 47pt of `KN` and clipped the stems off
both letters.

- Up Next rows: does the title wrap or clip? Does the poster stay 44pt wide?
- The tab bar: labels are budgeted one line at `TAB_BAR_HEIGHT` 60. Do they clip or overlap the rule?
- Watching Mode's emoji pad: it reflows to fewer columns. Does it?
- **The monogram specifically:** does it stay the size it was?

`allowFontScaling` is react-native-web-tested only. Whether iOS honours it the same way is
unknown and is the single most valuable line in this section.

## 3. hitSlop, which cannot be observed anywhere else at all

`react-native-web`'s `Pressable` **ignores `hitSlop` entirely** — only `Touchable` reads it, and
nothing here uses `Touchable`. So nineteen controls claim eight points of extra reach that no
suite in this repository has ever been able to see, in either direction.

Find a small control — the "Add to list" link on a title page, the undo chip after marking
watched — and deliberately tap just *outside* its visible edge, twice. Does it fire?

## 4. The faces

Six font files ship. On screen: is the section-head face condensed (Archivo Narrow) and the body
face not? Do the figures line up in columns on Stats — they are meant to be tabular mono?

Then the one that matters: **does any text look too heavy or smeared?** The phone must never set
`fontWeight` on top of a face that already has one, because iOS synthesises a weight over it. The
rule is right by Apple's documented behaviour and has never been watched being right.

## 5. Watching Mode with the screen locked

The flagship. Start it on an episode, lock the phone, leave it five minutes, unlock.

`UIBackgroundModes: ["audio"]` is present, which is necessary and not sufficient — iOS suspends a
recording session under conditions no one here can reproduce. Was it still listening? Did the
position keep up? Did it die silently, or say something?

## 6. Haptics

They are wired at five call sites and **every one fires on an action completing** — a watch
marked, a season caught up, a remote command sent — not on a control being held.

`core/src/ui/surface.ts` leans on that in writing: it accepts a *weaker* press step (1.046
against a rejected 1.080) on the argument that "on the phone the haptic carries the confirmation
and this is the corroboration". If no haptic fires when you press a button, that argument is
paying for something that does not happen, and the press step should probably be the stronger one.

So: press a button and hold. Mark something watched. Which of those buzzes?

## 7. The press step, now that it is worth looking at

Just fixed, and never seen on a real screen. A `primary` button — "Export everything (JSON)" on
the Your Data screen — used to press to a near-black ground with near-black lettering, measured at
**1.05:1**. It now steps its own fill instead.

Hold it. Can you read the label while your finger is down? Is the step visible at all, or too
subtle to notice in daylight? Compare with an ordinary row press, which steps the ground.

## 8. Sign in, which may never have happened

Make an account on the phone. Then:

- Mark two episodes watched **with airplane mode on**, so they queue in the outbox.
- Turn the network back on. Do they arrive? Does anything tell you they did?
- Post a comment on an episode. Attach an image — the native image-picker branch has never
  executed anywhere.
- Sign out and back in. Is your history still there?

The schema is deployed with row-level security and round-trips against Postgres in tests. What has
never happened is a real session from a real client.

## 9. Notifications

`getExpoPushTokenAsync` has never executed. Turn on episode notifications in Upcoming. Does iOS
prompt? Does a token come back, or an error? Do not expect a delivered notification — the edge
functions have never been typechecked, and they are Deno, which is not installed here.

## 10. Anything that simply looks wrong

The last four sprints of design work were judged in a desktop Chromium at 390x844 with a fake
device pixel ratio. You are the first person to see it on glass. Trust that over anything in the
record — including anything this document just predicted.

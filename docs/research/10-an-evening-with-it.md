# An evening with it

Nobody had used this app. Ten sprints have asked structural questions of the repository —
which states nothing renders, what is reported green that nothing runs, what has never been
started — and every one found something real. But the questions were about the code, and the
last three found documentation and configuration. That is a seam running out.

So this is one continuous session instead: arrive with a TV Time export, import it, resolve
what did not match, watch two episodes with Watching Mode running, react, step away, come
back, catch up a season, rate something, and look at Stats to see whether the evening is
legible in it. Judged as a product, not as a test.

Ordered by what would make somebody stop using it, not by what is easy. Seven of the eight
are fixed — §6.47 took the first two, §6.48 the next four, §6.49 the last of them. What is
left is §7, which is a design judgement rather than a defect.

---

## 1. The provider was chosen before the app was configured — so it was always fixtures

**Fixed in §6.47.** The web app has run on the four-show fixture catalogue for its
entire life, whatever `VITE_TMDB_TOKEN` held.

`core/src/metadata/index.ts` had `export const provider = createProvider()` at module scope,
and `createProvider` reads `getConfig()`. ES modules evaluate every import before the first
statement of the importing module runs, so `main.tsx`'s

```js
import App from './App.tsx';                 // reaches metadata/index.ts, which resolves now
import { bindWebPlatform } from './data/platform';
bindWebPlatform();                           // sets the config — too late
```

chose the fixture provider every time. The comment above that call said "Before anything
renders", which is true of rendering and irrelevant to module evaluation.

Nothing caught it because every test that searches searches for a fixture: the smoke suite
looks for *The Long Dark* and *Quiet Harbour*, which are fixture names, and the live TMDB
suites run in Node where the test setup binds the config first. A hundred and sixty-eight
browser checks pass against a catalogue of four shows.

Now lazy — `getProvider()` resolves on first use — and `app/src/wiring/injection.test.ts`
fails any core module that reads injected config while it is being evaluated, including one
call away, which is the shape this had.

## 2. Coming back to an episode loses your place

**Fixed in §6.47.** The sharpest thing in the evening. Start Watching Mode, get three seconds in, leave —
and come back to `0:00` and *Start watching*.

`usePlaybackClock` keeps its position in React state and nothing else. The one screen whose
entire job is knowing where you are in an episode forgets the moment it unmounts.

For a second-screen app, stepping away is not an edge case, it *is* the case: a phone call,
a text, checking who the actor is. What should happen is obvious once you have felt it —
coming back to a clock that was running should show you further on, because the episode kept
playing while you were away.

## 3. A reaction gives you nothing back

**Fixed in §6.48.** Your own reaction flies immediately, whatever the density says and whether or not the stream is held — thinning the crowd is about other people, holding it still is about the drift, and yours is the one you asked for.


Tapping an emoji sends it and the screen does not change: no count, no mark, nothing joins
the stream at the top. Your own reaction is indistinguishable from a tap that missed, in the
feature the whole product is built around.

The reaction stream renders other people's. Yours should be the one thing you are certain
landed.

## 4. After an import, the app hands you a chore

**Fixed in §6.48.** Matching follows the import without being asked, once per session, and Up Next says what is happening instead of what is missing.


The most important moment in this product is the one where somebody arrives with years of
TV Time history. What they get is:

> **Nothing here yet.** 4 shows came from an import and have no episode lists until they are
> matched.  \[Match imported shows]

An empty screen and a task, when the app has everything it needs to start. Matching runs in
the background afterwards and shows appear in Up Next one at a time with nothing saying it is
still working — during this session *Hollow Crown Saga* appeared several interactions later,
silently.

The import is already a deliberate act. Matching should follow it without being asked, and
only what genuinely cannot be resolved should ever become a question.

## 5. "More than one show could be this" — with nothing to choose from

**Fixed in §6.48.** An empty candidate list says so and offers a search box, since the person knows what the show is.


When the matcher cannot resolve a title it renders the ask-flow: the show's name, the
sentence *"More than one show could be this. Picking the wrong one would move your history
onto it"*, and a list of candidates. When the candidate list is empty — which is what happens
to a show the provider has never heard of — the sentence stays and the list is nothing. The
only control is **None of these**.

So the screen says the opposite of the truth, and the only possible action is to give up. On
a credential-free build, that is every unmatched show.

## 6. Search says "Searching…" for ever

**Fixed in §6.48.** Ten seconds, then a sentence and a Try again.


A request that hangs never becomes an error. `Search.tsx` has an error state and no timeout,
so a slow or unreachable provider leaves the word *Searching…* on screen indefinitely. This
was measured here on a container with no route to TMDB, which is not a real user's situation
— but "the network is being strange" is, and the app has no answer for it.

## 7. Watching Mode is busier than the brief asked for

The brief: *"most of the screen will be preselected big buttons of emojis"*. What is on
screen while an episode plays: Close, the title, the timecode, Pause, −5s, +5s, Hold,
Density, "Sync by listening", "Help map this episode", and a three-line paragraph about what
the microphone does and does not send — above the emoji.

Every one of those is defensible on its own and the microphone copy is there for a good
reason. Together they are a control panel with a reaction pad underneath it.

## 8. Upcoming has no answer, and offers no alternative

**Fixed in §6.49**, with the phone's better sentence and a way through to Discover.


*"Nothing airing in the next two months from the shows you are watching."* True, and a dead
end: the screen that exists to answer "what shall I watch tonight" says nothing is on and
does not suggest looking anywhere else, with a Discover tab one tap away.

---

## What was good

Worth saying, because a list of faults is not a judgement.

The first screen is right. Somebody arriving from TV Time sees the import and the three
formats it reads, not a sign-up — and the app works completely with no account, which is the
product's whole position and it is kept everywhere.

The catch-up sheet is genuinely well made: *"Nothing here shows episode names, so you cannot
be spoiled by catching up"*, then a row of episode numbers. It solves a real problem the way
somebody who has been spoiled would want it solved.

Marking an episode watched is one tap from the list, the remaining count moves immediately,
and the next episode takes its place. The core loop is fast and does not argue.

And Up Next after matching is exactly what it should be: three shows, the next episode of
each, and how many are left.

---

## What could not be judged from here

The container has no route to TMDB from a browser — Node reaches it, Chromium does not, with
or without the proxy — so everything above was driven on the fixture catalogue. Real-world
matching quality, search results and where-to-watch could not be exercised in the app. The
live suites cover the matcher itself in Node, and §6.47's fix means the app would now use it.

---

# A second evening, on the phone

The first evening was the web app. The phone is what this product pivoted to *be*, and
nobody had sat with it that way either — its suite drives it screen by screen, which is
not the same thing, and §6.47 is the standing proof of that distinction.

Same session, against the react-native-web export. One thing could not be done: the
phone's import goes through the system document picker, which the export cannot drive, so
this started from search rather than from an import.

## What had already reached it

Worth checking rather than assuming, since two of the six fixes above live in code the
phone does not share.

- **The resume works.** Left an episode at 0:06, came back at 0:09, with *Resume* rather
  than *Start watching*. That one is in the core and both screens call it, so it reached
  the phone by construction — and now by measurement.
- **Reactions are visible.** The phone's stream is a separate implementation and does not
  have the web's bug: it renders everything within a window *behind* the current position
  rather than between ticks, so a reaction stamped at now appears at once. Tapping 👍 put
  it on screen beside the timecode.

## 1. Watching Mode was not reachable from Up Next

**Fixed.** The differentiator of the product, on the platform the product is now for, had
no entry point on the screen you land on. The web has offered *Watch along* in the Up Next
row since it shipped; on the phone the only route in was to open a show, find the episode
in the season list, and tap it there. Three taps and a scroll, for the feature everything
else is arranged around.

Nothing said so, because the parity audit of §6.10 compared screens and the wiring audit of
§6.27 compared exports — and both platforms have the screen and both call the same code.
What differed was the offer.

## 2. The remote drawer explained itself instead of working

**Fixed.** Opening the remote mid-episode showed the keys and then a paragraph:

> Every device type is its own adapter — there is no vendor-neutral protocol to use
> instead, which is why every universal remote is a pile of them behind one set of
> buttons. Cast and AirPlay need their vendors' SDKs and are not built; Bluetooth is not a
> way to control a television at all.

All true, all reasoning about the implementation, in a drawer somebody opened to press
pause. It now says what works and what does not, in two lines, and the reasons stay in
doc 6 §2 and doc 9 §1.2 where somebody looking for them will find them.

## 3. The same states say different things on each platform

Measured across four:

| State | Web | Phone |
|---|---|---|
| Stats, nothing in range | "Nothing watched in this **period** yet." | "Nothing watched in this **window** yet." |
| Upcoming, empty | "Nothing airing in the next two months from the shows you are watching." | "Nothing scheduled. Track a show that is still airing and it will show up here." |
| Watching Mode, before starting | "Tap the moment you press play. You can nudge the timing at any point." | "Press start when the episode starts. You can nudge the clock any time." |
| Watchlist, empty | "Nothing saved yet." | "Nothing saved yet. Add something from Search, then say why you saved it." |

The interesting part is that the phone is *better* in two of the four: it says what to do
about the emptiness where the web only describes it. So the answer is not "make the phone
match the web", it is "one of these is better and both should have it".

Two are fixed here, chosen because one side was plainly worse rather than merely
different. The phone's start line was circular — *press start when the episode starts* —
and now says what the web says. And the web's empty Upcoming was a dead end with Discover
one tap away, which is doc 10 §8 above; it now carries the phone's sentence and a way
through, and §8 is closed with it.

The other two are noted rather than churned. A repository where the same state has two
sentences will keep growing them, and the fix for that is a decision about who owns the
words, not four more edits.

## 4. Still open, from the phone

- The import cannot be exercised at all from here, so the phone's migration path — the
  thing the product exists for — has never been driven end to end on the platform it is
  for. That is §7's "nothing has run on a physical device" with a sharper edge.
- Watching Mode's controls read *Pause Hold −5s +5s Density 8 24 60*. Three bare numbers
  with no unit, for a control the web labels. Small, and the same family as doc 10 §7's
  judgement about how much chrome that screen carries.

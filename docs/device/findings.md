# What the phone actually showed

Answers to `docs/device/on-the-phone.md`. One heading per question, in order.

**Every heading below starts as `NOT YET CHECKED` and that is deliberate.** §6.57's rule is that
*nothing* and *I could not look* are different answers and only one of them is about the product;
§6.186 exists because a device ran this app and the observations were never written down. A
heading left as `NOT YET CHECKED` is a true and useful statement. A heading quietly deleted is
how this went wrong last time.

**A sprint's worth of direction is sitting in question 10** — the information architecture
notes, from the person holding the phone. It is not a device defect and not actionable as a
bug; it is what the next design sprint should read first.

Replace a status line when you have an answer. Say what you did, what you saw, and the number
where there is one. Photographs go in `docs/device/shots/`, named for the question.

---

## 0. Did it build and launch at all

**Yes.** `** BUILD SUCCEEDED **` at 34,978 lines; installed over USB with `devicectl` and
launched.

Second time. The first needed six blockers cleared (6.82–6.84); this time nothing had to be
fixed first. Every one of those fixes survived 127 commits of other people's work and applied
on its own:

- both `postinstall` patches re-applied on `npm install` — `expo-modules-jsi`'s
  `RuntimeScheduler.h`, and `expo-network`'s `en0` read
- `react-native-reanimated 4.5.1` / `react-native-worklets 0.10.1` still pinned by the root
  `overrides`
- `Reviewies.entitlements` still an empty `<dict/>` under `REVIEWIES_PERSONAL_TEAM=1`, so a free
  personal team can still sign it

Worth stating because no guard can: the guards fire on `npm install`, but nothing proves the
result still *compiles* until it compiles.

51 MB. All six faces reach the device at `Reviewies.app/assets/_assets/fonts/`, so question 4 has
real faces to look at rather than a system fallback.

Device: iPhone 13 Pro Max (iPhone14,3), iOS 26.5.2. Mac: macOS 26.1, Xcode 26.3 (Swift 6.2.4,
iOS 26.2 SDK). Build `Release`, personal team `5F87J4VA23`.

### One warning, which question 1 should be read against

```
» ios: userInterfaceStyle: The existing `userInterfaceStyle` property is preventing
  splash screen from working properly. Remove it or disable dark mode splash screens.
```

`app.json` sets `userInterfaceStyle: "dark"`. It looked capable of causing exactly the white
flash question 1 asks about. It did not — see below. Left unfixed: a one-line change with no
guard behind it is the drift the brief says not to introduce, and it is now known not to matter
for this symptom.

## 1. Cold start, and what the first paint is

**No white flash. The app is on Up Next instantly.**

**No number.** Reported as immediate rather than timed — no stopwatch was used, so the "seconds"
half of this question is still open and should not be read as "fast enough".

What the question was really asking is answered: the first paint is the app, not a blank screen.
`useFonts` gating a first paint has now executed on a device and costs nothing visible.

## 2. Dynamic Type at maximum

**A defect, and it is not the one predicted.**

> **Text is clipped at the bottom** — in Up Next rows, and in the More menu's navigation.

The prediction was about *scaling*: type grows, the plate does not. What was found is *clipping*.
Cut off at the bottom specifically is a fixed-height or line-height problem rather than a
wrapping one — the glyphs are drawn and then cropped by a container that did not grow with them,
which takes descenders and the last line first.

It appears in a list row and in a navigation row, two unrelated screens, which points at shared
components rather than at either screen.

**Still NOT YET CHECKED, and not implied by the above:**

- **The monogram — probably held, but this is not a clean observation.** Asked directly, the
  answer was *"I am unsure which monogram you mean, but I only see text growing so I think the
  answer is yes."*

  Recorded as qualified rather than as a pass, for two reasons. It is an inference from not
  noticing a change, not a check of the plate's width. And the monogram is the two-letter
  stand-in shown **only where poster artwork is missing** — so a library with artwork
  everywhere puts none on screen, and the question cannot be answered from that view at all.

  What would settle it: find an Up Next row showing two letters instead of a poster, then set
  text to maximum and watch that plate. If `POSTER_GLYPH_SCALES = false` is doing its job the
  letters stay put while the title beside them grows. Failure looks like two enormous letters
  with their stems cut off — which is what the browser export did at 200% before the flag
  existed, and the reason the flag exists.
- **The tab bar** at `TAB_BAR_HEIGHT` 60 — do labels clip or overlap the rule?
- **Watching Mode's emoji pad** — does it reflow to fewer columns?
- Whether Up Next titles *wrap*, as distinct from clip.

## 3. hitSlop, which nothing else can observe

**NOT YET CHECKED** — tap just outside a small control's visible edge. Does it fire?

## 4. The six faces

**NOT YET CHECKED** — condensed where it should be, tabular figures on Stats, and whether any
text looks too heavy or smeared (iOS synthesising a weight over a face that has one).

## 5. Watching Mode with the screen locked

**NOT YET CHECKED** — five minutes locked. Still listening? Position kept up? Died silently?

## 6. Haptics

**NOT YET CHECKED** — press and hold a button; separately, mark something watched. Which buzzes?
The press design takes a weaker contrast step in exchange for a haptic that may not exist.

## 7. The press step on real glass

**NOT YET CHECKED** — hold "Export everything (JSON)" on Your Data. Readable while held? Is the
step visible at all in daylight? Compare with an ordinary row press.

## 8. Signing in, and the outbox

**NOT YET CHECKED** — account, two watches in airplane mode, reconnect, comment with an image,
sign out and back in.

## 9. Notifications

**NOT YET CHECKED** — does iOS prompt, does a push token come back or an error.

## 10. Anything that simply looks wrong

### Buttons are off centre

Reported plainly, with no screen named and no photograph. Not reproduced against a component, so
it is not known whether this is one shared button or several screens. Next session should
photograph it and name the component — until then this is a real observation and an unactionable
one.

### The information architecture does not match what a tracking app is expected to be

The largest finding of the session, and not a defect in any one screen. In the words of the
person holding the phone:

- **Up Next should imitate what tracking apps actually do.** Previous episodes should live
  *above* the current position, so scrolling up reveals what you have already watched, in the
  order you watched it, already checked off. Up Next is currently forward-only and has no past.
- **Future releases should be a tab on that same surface**, not a separate destination.
- **"I am unsure what the difference between the Watchlist and Upcoming is."**

  From the source they are genuinely different — `watchlist.tsx` is *things you mean to watch,
  with a note saying why you added them*; `calendar.tsx` is *what is airing next, plus the
  notification granularity control*. The finding stands anyway: one is a tab, one is under More,
  and the difference is not recoverable from the interface. A distinction only legible in the
  code is not one the user has.
- **Search and Discover should be one page**, with the search field moved into Discover.
- **Discover should be for discovering, not adding.** It is a list of shows with buttons. What is
  wanted is browsable — large thumbnails carrying genre, release date and title, *"as if a person
  is in a CD shop looking at the CD boxes"* — and tapping one turns the box over for the synopsis,
  more information, and a trailer.
- **Search should be the list.** The compact layout Discover has now is the right shape for
  results and the wrong shape for browsing.
- **Both need filters** — genre, runtime, seasons, rating, anything.

Not built. The brief says to say it plainly rather than fix it, and this is a direction for a
sprint rather than a device finding.

---

# Not a question in the brief

## `npm run verify` is red at this tip, for three reasons, none of them the phone

Found before any of the above, and worth more than several of them. Checked out at `59b5d8d` on
a Mac, `npm run verify` exits 1. **All the failures are environment, not code** — each passes on
the machine that wrote it and fails here, which is the same shape as the entry that prompted this
brief: a fact about a container recorded as a fact about the world.

Confirmed pre-existing by stashing this file and re-running.

The sequence is the evidence: **four** failures on a cold checkout; after
`npm run build --workspace app`, **two**. Each diagnosis below predicted which side of that line
its failure would fall on.

### 1. Two icon clauses that need a build `verify` has not run yet

```
points every icon at a file that is actually in the build
  expected [ 'icon-192.png', 'icon-512.png' ] to deeply equal []
paints its splash and its tint out of the token table
  expected [ '#0B0B0F' ] to deeply equal []
```

`shipping.test.ts` reads the *built* web manifest from `app/dist` and says so in its own failure
message — "run `npm run build --workspace app` first". But `verify` runs `test` before `build`,
so on any checkout whose `dist` is absent or stale these fail, and on a machine that happened to
build recently they pass.

Verified: `npm run build --workspace app`, then the same file, **6 passed**. Nothing was wrong
with the code at any point. The clause is right to read the build rather than the config — the
plugin is what writes the file a phone fetches. The ordering inside `verify` is what makes it
unreproducible.

### 2. A date that is only correct in UTC

```
Kitchen Nightshift episode 1: expected '2025-11-23' to be '2025-11-22'
```

Off by one day. This Mac is `Europe/Sofia`, `EEST +0300`; the container is UTC.
`designLibrary.test.ts` builds an expected day key from `today` minus a number of days, and at
+0300 that lands the other side of a boundary.

The repository takes this class seriously enough to run a whole suite for it — `test:tz`, 877
cases, which passes. This clause sits outside it.

### 3. A directory the record reads and git has never held

```
ENOENT: no such file or directory, scandir '.../design/screens'
```

`design/unread.mjs` scans `design/screens` for `.png` files so `docsReferences.test.ts` can
report how much of the design record is unread. `git ls-files design/screens` returns **nothing**
— the directory exists only where the capture scripts have run. Anyone else gets a thrown
`ENOENT` rather than a count.

The record already named this defect once, in the commit saying `behaviour.mjs` was never
committed. It recurred in a different file within the same sprint block.

### What this file fixed on the way

`docsReferences > names only paths that exist` failed at this tip because `on-the-phone.md` names
`docs/device/findings.md` and nothing had written it — a brief referencing its own output. The
skeleton this file was merged into closes that.

## An App Store app's data cannot be read off an iPhone without a backup

Tested rather than assumed, because it bears on the `DioCache.db` importer that
`docs/research/08-second-reddit-sweep.md` calls the highest-value feature in the field.

`devicectl` lists exactly one app on a connected, developer-mode iPhone:

```
Name        Bundle Identifier         Version   Bundle Version
Reviewies   dev.krisiliev.reviewies   0.1.0     1
```

One. The development-signed one. iOS exposes a container to tooling only for apps you could
attach a debugger to, so TV Time — App Store signed — is not addressable at all: not by
`devicectl`, not by Xcode's container download, not by anything short of a backup.

That is worth writing into the record because the importer's own comment says it runs on
"whatever files the user managed to pull off their phone", which reads as though pulling them is
the easy part. It is the hard part, and it has exactly one route: a full local backup, then
extraction from it. Every published rescue tool works this way for the same reason.

TV Time shut down in **July 2026**, so the on-device cache is now the only copy that exists. The
practical consequence for anyone reading this: the file is only recoverable while the app remains
installed and the phone has not been reset.

**An iCloud backup is not a way round it.** Apple exposes no supported way to browse or download
a device backup from iCloud — iCloud.com offers photos, contacts and Drive, not app containers.
The tools that claim to do it authenticate against Apple's private backup API with an Apple ID
password and a 2FA code, which is an unofficial endpoint and a credential worth more than the
data being recovered.

**The local backup is smaller than people expect, which is the useful half of this.** Apple
documents that a computer backup excludes anything already synced to iCloud — iCloud Photos,
iMessages, SMS and MMS — along with App Store content. For a phone with iCloud Photos on, the
bulk of "storage used" is exactly the part that will not be copied, so the backup is largely app
data and settings. Someone refusing the backup for want of disk space is usually estimating from
the wrong number.

## The phone cannot read a database at all, and the record said it never needed to

Third failure of the same import, after the encoding fix cleared the second. The screen was
honest about it:

> **DioCache.db — TV Time cache — 0 watch(es), 0 show(s)**
> Could not read that as a TV Time cache: Reading a TV Time cache needs SQLite, which this
> app has not set up. Call `setSqlJsLoader()` from your entry point.

Nothing in `mobile/` calls `setSqlJsLoader`. The web binds it in `app/src/data/platform.ts`
and the node suites bind it in their setup files, so every context that has ever run this
code had a loader and the phone has never had one.

### The part that matters more than the bug

`coreWiring.test.ts` keeps a written reason for every export one app uses and the other does
not — the mechanism exists so an asymmetry is a decision rather than an accident. The reason
recorded for this one read:

> The phone has expo-sqlite compiled in and **never asks for one**.

It asks. It asked the first time anybody tried, and the error names the exact function the
explanation was excusing. The guard was working perfectly: it required an explanation, got
one, and the explanation was false. A justification nobody can check is a comment with a
test around it.

That entry now says what happened instead. It is the cheapest half of this finding and the
only half a machine here could have carried.

### Why the fix is not in this commit

`sql.js` is WebAssembly, and the phone's own engine has none — so the answer is not to bind
the web's loader but to write a different one over `expo-sqlite`, which is already a
dependency and does expose the synchronous surface this interface needs
(`openDatabaseSync`, `getAllSync`, `execSync`). Perhaps sixty lines, in
`mobile/src/platform.ts`.

What stops it being written here is that **no guard for it can run here.** The thing it binds
exists only on a device; a node suite would be testing a mock of the thing that broke. That
is the exact shape the brief warns about, and the third finding in a row where the instrument
could not reach the defect — the fixtures had a shape real data does not, the suites run on a
JS engine the app does not use, and now the binding only exists somewhere no suite runs.

### So the import still has not happened on the phone

Web: 235 titles, 115 watches, 2 watchlist items. Phone: nothing, three times, for three
unrelated reasons. Two are fixed. The third is understood and open.

## Every import was broken on the phone, and no suite here could see it

The import failed on the device with:

> **Unknown encoding: latin1 (normalized: latin1)**

`core/src/data/archiveImport.ts` decided whether a dropped file was a database by decoding
its first sixteen bytes:

```js
new TextDecoder('latin1').decode(bytes.subarray(0, 16)) === SQLITE_MAGIC
```

Every browser accepts `latin1`. Node accepts it. **Hermes implements UTF-8 and nothing
else.**

That sniff is the first thing *every* import runs, so this was not a `DioCache.db` problem:
zip, CSV, Reviewies export and database alike failed on the phone and passed everywhere the
suites look, because all five suites run on Node.

This is the sharpest example this record has of the thing the brief was written about. The
code was exercised, by tests, on real inputs, and the tests were run on a JS engine the
application does not use.

### The fix, and why a behavioural test cannot hold it

Comparing bytes. A magic number *is* bytes; decoding them to text to compare them to text
was a detour whose only contribution was an encoding to get wrong.

A behavioural guard is useless here — Node decodes `latin1` happily, so the broken version
passes on the machine running the test. The guard reads the source instead, and scans **all
of `core/`** rather than the one file that got it wrong, because the constraint belongs to
Hermes and therefore to everything shipped to the phone. Planting the exact original back
fails it, alone:

```
expected [ 'data/archiveImport.ts: latin1' ] to deeply equal []
```

### What is still not covered

The guard catches `TextDecoder`. It does not catch the general case — any Web or Node API
that a browser and Node implement more fully than Hermes does. `Intl`, `RegExp` flags and
`toLocaleString` are the usual next offenders. Nothing here knows which of those the code
already leans on, and finding out needs a device, not a scan.

## The DioCache importer silently drops every series

Found by importing a **real** `DioCache.db`, recovered from a phone — the first time that
code has run on anything but fixtures. `docs/research/08-second-reddit-sweep.md` calls
accepting this file "the highest-value unbuilt feature we have found". It works for films
and loses the television.

### The numbers

| | in the cache | after `parseDioCache` | landed in the app |
|---|---|---|---|
| series | **235** | **0** | 6 (only those an episode mentioned) |
| movies | 125 | 125 | 85 watches (the ones marked watched) |
| episodes | — | 83 | 30 |

The screen said **"Imported 115 watches."** Nothing said that 235 shows had been read and
skipped.

### Why

`parseDioCache` reads the two kinds from two different places:

- **movies** — `data.objects[]` where `entity_type === 'movie'`
- **series** — a top-level `payload.shows` array, from TV Time's progress endpoint

This cache contains **0** payloads with a `shows` array and **940** objects (235 distinct)
with `entity_type === 'series'`, sitting in `data.objects` right beside the movies the
parser does read. The series branch is looking at an endpoint this cache never held.

A real one, keys intact:

```
{ uuid, type: 'follow', entity_type: 'series', created_at, updated_at,
  meta: { id, name: 'Elite', country, day_of_week, is_ended, images, … },
  extended: { rating, rating_count, follower_count, comment_count },
  filter: ['all', 'stopped'] }
```

`meta.id` and `meta.name` are exactly what `DioSeries` wants. Nothing is missing from the
data; the branch that would read it does not exist.

### Why no count reports it

`unrecognised` counts *payloads* that yielded nothing, not entities that were skipped. The
payload holding those 940 series objects also holds movies, so the movie branch sets
`used = true` and the payload is counted as recognised. A library that is 65% series comes
back as films only, and every number on the screen agrees that it went well.

That is this record's oldest theme, in the feature that most depends on not having it: a
confident report over a partial result, with nothing able to say which.

### Fixed, guard first

Six cases in `diocacheParse.test.ts`, from a fixture with the real cache's keys and
invented names, so nobody's library goes into the repository. All six fail on the old
parser — the first as `expected [] to deeply equal [ 'Quiet Harbour: The Series', … ]` —
and pass on the new one. The change is one loop beside the movie loop, reading
`entity_type === 'series'` out of `data.objects`.

Two decisions worth stating, because both could have been made carelessly:

- **`watchedEpisodes: 0` means "not stated", not "none watched".** A follow object carries
  no progress. The importer only reads `archived`, `upToDate` and `forLater` for a show's
  status, so nothing downstream reads those zeros as a claim — but the next person to touch
  it should know they are absence rather than measurement.
- **The progress endpoint still wins where a cache has one.** Some caches hold both shapes;
  the listing knows less than the endpoint that counts episodes, so a count already found is
  never lowered.

Measured on the real cache, before and after, through the actual import UI rather than the
parser alone:

| | before | after |
|---|---|---|
| series parsed | 0 | **235** |
| titles in the library | 6 | **235** |
| library items | 6 | **235** |
| watches | 115 | 115 |
| watchlist | 0 | 2 |

### Still open, and deliberately not done here

**A skipped entity is still invisible.** `unrecognised` counts payloads that yielded
nothing, so a payload whose movies parsed and whose series did not was counted as fine.
That is what let this hide. The fix makes the series parse; it does not make a future
mismatch announce itself. Whatever reads these shapes should be able to say how many
objects it saw and could not use — that is a separate change with its own guard.

**`not_started_yet` lands as `watching`.** The real filter values across this cache were
`all` (940), `up_to_date` (528), `not_started_yet` (292), `continuing` (108), `watch_later`
(8) and `stopped` (4). Only `up_to_date` and `watch_later` map to anything the importer
reads, so roughly 73 shows the owner has never begun are filed as in progress. Arguably
they belong on the watchlist. That is a product decision about what a followed-but-unstarted
show *is*, not a bug, and a device session is the wrong place to settle it.

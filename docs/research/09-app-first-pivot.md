# 09 — Going app-first

The brief changed: the app is the product now, and the browser version is a bonus.

Doc 1 §5 chose a PWA on a specific premise — that it "gets you a real home-screen app
with push for $0", and that the only thing genuinely out of reach was home-screen
widgets. That premise was accurate about *distribution*. It was wrong about *capability*,
in a way that only became visible once docs 4–6 worked out what Watching Mode actually
needs.

This document records what the pivot buys, what it costs, and what it deletes.

---

## 1. The pivot removes the three hardest constraints in the product

Not packaging problems. Design constraints that shaped whole subsystems.

### 1.1 The bridge and relay exist only because a PWA cannot reach a LAN

This is the ugliest architecture in the repository and it is worth being blunt about
why it exists. A page served over HTTPS cannot open a connection to `192.168.1.42`
(mixed content), cannot do mDNS discovery, and cannot be granted local network
permission. Doc 5 worked around that by **inverting the direction of discovery**: a
companion process runs on the user's own machine and dials *outward* to a WebSocket
relay we host, and the app talks to the relay.

That is three moving parts — bridge, relay, pairing token — to accomplish "send a pause
command to a Roku on the same Wi-Fi". A native app with the local network entitlement
does it with one HTTP POST:

```
POST http://192.168.1.42:8060/keypress/Play
```

Roku ECP is plain HTTP on the LAN. So is discovery, via SSDP/mDNS. **For the TV case,
the entire bridge-and-relay subsystem collapses into a direct call.** The bridge stays
useful for controlling a *laptop* (MPRIS/D-Bus has no network protocol), but it stops
being the only way to reach a television.

### 1.2 Cast and AirPlay become available at all

Doc 6 concluded these were closed to us: the Cast sender SDK is Chrome-desktop-only on
the web, and AirPlay exposes nothing to a web page beyond `<video>` playback. Both have
first-party native SDKs — `AVRoutePickerView` on iOS, the Cast SDK on both platforms.
This is the difference between "cannot" and "can".

### 1.3 Fingerprinting can listen in the background

Doc 6's audio fingerprinting assumed a foreground tab with the screen on, because
`getUserMedia` in a backgrounded web app is suspended. A native app can hold a
background audio session. That turns "sync by listening once, then dead-reckon and hope"
into continuous drift correction — which is what the feature actually wanted.

### 1.4 And the storage anxiety goes away

Doc 1 spent a paragraph on Safari's seven-day eviction of script-writable storage and
why home-screen installation exempts you from it. Native storage is simply not
evictable. The whole consideration disappears, along with the onboarding walkthrough
that existed to talk people into installing.

---

## 2. Expo, not Capacitor — and doc 1 §5 recommended the wrong one

Doc 1 named Capacitor as the eventual native path, on the grounds that it "reuses
essentially all the code". That is true and it is the wrong trade for what was actually
asked for.

Capacitor ships the existing web app inside a webview. It solves App Store presence,
native push, and storage eviction. It does not make the app feel native, and it inverts
the stated priority: it makes the *web* app the primary artifact and the native app a
shell around it. "App-first, browser as a bonus" is the opposite arrangement.

**Expo (React Native)** is the right fit:

- The non-UI TypeScript — roughly 6,200 lines covering the domain model, the repository,
  metadata providers, the sync engine, stats, discovery, the fingerprint algorithm, the
  importers and the social modules — moves across unchanged.
- The UI is genuinely rewritten: about 3,700 lines across 22 components. This is the
  real cost and it should not be dressed up as a port.
- `expo export --platform web` produces the browser version from the same source, so
  the "nice bonus" falls out of the build rather than being a second codebase.
- EAS Build compiles iOS without a Mac, which matters in this environment.

### What actually has to change

| Layer | Web | Native | Size of change |
|---|---|---|---|
| Domain, stats, discovery, fingerprint algorithm, importers | — | unchanged | none |
| Metadata providers, sync engine, social modules | — | unchanged | none |
| Data layer | Dexie / IndexedDB | expo-sqlite | **the big one** |
| Preferences | `localStorage` | AsyncStorage | trivial, one file |
| Export a file | `<a download>` | expo-file-system + Sharing | one function |
| Microphone | `getUserMedia` | expo-audio | one file |
| Push | service worker + VAPID | expo-notifications + APNs | one file, plus the queue's sender |
| Screens, navigation | react-router + Tailwind | expo-router + NativeWind | 22 components |

**Dexie is reached from nineteen files, eight of which are screens** that are being
rewritten regardless. The remaining eleven use a narrow slice of the API — `get`, `put`,
`bulkPut`, `count`, `where().equals().toArray()`, `transaction`. So the migration is a
SQLite-backed adapter exposing those same methods, not a rewrite of every call site.
That keeps the 5,200 lines of existing tests as the acceptance criteria for the port,
which is the strongest reason to do it that way.

---

## 3. What this costs

**The Apple Developer Program is $99/year.** This was the original reason for choosing a
PWA — "since making this an actual app to put on my iPhone costs money" — and nothing
about that has changed. It is required for TestFlight and for the App Store. Free
alternatives, for completeness:

- **Sideloading with a free Apple ID** puts a build on your own device, but it expires
  after seven days and needs a Mac with Xcode to re-sign.
- **Android** is $25, one-time, and needs no Mac at all.

There is no route to a permanently-installed iOS app without the $99. That is Apple's
rule, not a limitation of the approach.

**The web version becomes a second-class citizen.** React Native Web is good, but it is
not the same as a hand-built web UI: layout is flexbox-only, some CSS has no equivalent,
and the result will be a phone-shaped app in a browser window rather than a responsive
web page. That is the correct trade given "nice bonus", but it is a real downgrade from
what exists today, and worth naming rather than discovering later.

**The browser extension is unaffected.** It talks to the backend, not to the app.

---

## 4. What gets deleted, eventually

Not immediately — the current PWA keeps working throughout — but the pivot makes these
redundant:

- **The relay server** (19 tests), once the TV case goes direct. The bridge survives for
  laptop control.
- **The install-me onboarding**, and the storage-eviction defences around it.
- **Web Push and VAPID**, replaced by APNs/FCM through Expo's push service. The
  `notification_queue` table and its granularity rules are unaffected; only the sender
  changes.

Nothing is deleted in the same change that adds its replacement. Doc 7's rule stands:
where the research turned out to be wrong, say so and show the reversal, rather than
quietly rewriting history.

> **Nothing on this list was deleted, and the reasoning was wrong in all three cases.**
> Applying the rule above to the section that states it — see §6.13, written once the
> work was done rather than predicted.

---

## 5. Order of work

1. Extract the platform-agnostic core so both apps import one copy, and prove it still
   passes its tests unchanged.
2. Put the data layer behind an interface, with the Dexie implementation as the first
   one and the existing tests as the contract.
3. Scaffold the Expo app; add the SQLite implementation; run the same tests against it.
4. Port the screens, starting with Up Next — the screen the product is judged on.
5. Watching Mode with a background audio session.
6. Direct device control, replacing the relay hop for TVs.
7. Web export, to keep the browser version alive.

Steps 1 and 2 are worth doing regardless of what happens next: they are what makes the
core testable independently of any UI, and they are reversible.

---

## 6. Where it got to

**Steps 1–6 are done. The port is complete**, and the thesis holds.

`@reviewies/core` is 6,200 lines with no DOM, no React, and no `import.meta.env`. Its
386 tests run against **both** database implementations — Dexie and SQLite — and pass
identically. Since every assertion was written against Dexie's semantics, that is the
port being proven rather than asserted.

The Expo app boots, opens SQLite in WAL mode, and runs the loop the product is judged
on: search, track, Up Next with a remaining count, mark watched, and the count moves.
Eleven checks drive it through react-native-web on every change. What that cannot see
is a device — haptics, the local-network entitlement, how any of it feels — and those
are the next thing to find out.

Two things worth recording because they were the parts that actually bit:

- **Metro needs teaching about a workspace.** It does not follow symlinks out of the
  project directory on its own, and it does not treat `.wasm` as an asset — which
  expo-sqlite's web build imports directly. Both are one line in `metro.config.js` and
  neither is discoverable from the error message.
- **The screens are the real cost, and the estimate held.** Up Next and Search came to
  roughly 350 lines of React Native against 3,700 lines of web UI still to port. The
  logic behind them — `getUpNext`, `markWatched`, the metadata cache, the ID scheme —
  was imported, not rewritten.

### 6.1 §1.1 is done, and it cost less than the workaround it replaces

The app talks to a Roku directly. The Roku adapter moved into the core unchanged — it
was already written against a transport interface — so the bridge and the app now run
one implementation rather than two.

The part that needed thought was discovery. SSDP is a UDP multicast, which needs a raw
socket, which needs a native module, which needs a custom development build: the
feature would not work in Expo Go and would not work on the web at all. But ECP is
plain HTTP on port 8060, so instead of asking the network who is there, the app asks
every address on it. A /24 is 254 probes that either answer in milliseconds or fail on
connect.

That is not strictly better than SSDP and the code says so: it only handles /24
subnets, it finds devices that answer on a known port rather than devices that
announce themselves, and it puts 254 connection attempts in a router's log. What it
buys is that it works today, with no native module, using the adapter that already
existed.

The relay is not deleted. It still earns its place for controlling a **laptop**, where
MPRIS is a D-Bus interface with no network protocol at all — there is nothing for an
app to connect to, with or without an entitlement. What has changed is that it is no
longer the only way to reach a television, which was the thing that made it feel like
an apology for the platform.

### 6.2 §1.3 is done, and end-to-end testing found a real bug in the matcher

The app listens continuously. `useAudioStream` from expo-audio delivers raw PCM
buffers, `setAudioModeAsync({ shouldPlayInBackground: true })` keeps the session alive
when the screen goes away, and the expo-audio config plugin adds what neither of those
can add from JavaScript: `UIBackgroundModes: ["audio"]` on iOS, and on Android a
microphone foreground service with the permissions it needs. That is verified against
`expo config --type introspect` rather than asserted — the plugin's options are easy to
set wrongly and produce a build that simply stops recording when backgrounded.

The plugin also offers `enableBackgroundPlayback`, on by default, which adds a
media-playback foreground service. Nothing here plays audio, so it is turned off. It
would have been free to leave on, and it would have meant shipping a permission the app
has no use for.

Three pieces of the pipeline had no web equivalent and are new in the core:

- **`spectrogram.ts`** — an FFT, a Hann window, and framing. The web got all of this
  free from `AnalyserNode.getFloatFrequencyData`. It reproduces that function's shifted
  decibel scale exactly, because a reference built on one scale and a sample taken on
  another do not fail loudly; they simply never match.
- **`stream.ts`** — downmix, resample, and overlapped framing, all written to be fed in
  pieces. Microphones deliver 48kHz when you ask for 22.05kHz, in buffers whose length
  has nothing to do with the FFT size, so every stage carries state across boundaries.
  The resampler's fractional read position is the part that matters: resetting it per
  buffer, which is the obvious way to write it, puts a timing discontinuity at every
  boundary dozens of times a second and smears the peaks the fingerprint depends on.
- **`continuous.ts`** — a sliding window that reports a position every few seconds, plus
  the rule for whether a reported position is worth acting on at all.

#### The bug: confidence fell as the reference got longer

Doc 6's matcher scored an offset by voting and reported confidence as *the winning
votes as a share of all votes cast*. Feeding it a whole synthetic episode showed why
that is wrong. A hash that recurs through an episode votes once per place it occurs, so
the denominator grows with the reference's length while the numerator does not. The same
six seconds of audio read as a confident match against a five-minute reference and as
noise against a forty-minute one — which is length-sensitivity wearing uncertainty's
clothes, and it would have made continuous matching against full episodes fail
constantly and for no visible reason.

Confidence is now the share of *matched landmarks* that agreed on one offset. A sample
hash can only ever vote once for a given offset, so it stays a genuine fraction, and it
no longer moves with the length of the thing being searched.

That bug survived 41 passing tests because every one of them built its sample by
slicing the reference **spectrogram**. Frame-aligned, identical values, no analysis
involved. Nothing had ever taken audio, analysed it independently, and matched the
result — which is the only thing a microphone ever does. The new tests do that: they
generate an episode, build a reference at 22.05kHz, then generate the *same signal* at
48kHz, cut a slice, and push it through the resampler and the FFT in irregular chunks.
The lesson generalises past this feature: a test that slices the intermediate
representation tests the second half of a pipeline twice and the first half never.

#### Two things the design does not pretend about

**A match describes the past.** It says where playback was when the window closed, and
an attempt fires part-way through a buffer. Applying the raw position would set the
clock slightly slow *every single time it fired* — a drift correction that introduces
drift. `positionNow` ages a match forward by the frames that have arrived since, in
frames rather than milliseconds, because frames only exist if the audio arrived and so
they keep counting correctly through a backgrounded app whose timers are throttled.

**A large jump is usually real.** `shouldCorrect` ignores anything under 1.5 seconds,
because correcting agreement only jitters the timecode. Its upper bound is fifteen
minutes, which is deliberately loose: skipping a recap and scrubbing back to rewatch a
scene are both large, legitimate jumps, and refusing to follow one would break the
feature exactly when it is most wanted.

#### The honest limits

`UIBackgroundModes: ["audio"]` for a microphone that runs while the app is backgrounded
is the kind of thing App Review reads closely, and rightly. The permission copy was
rewritten for it — the old string said "listens for a few seconds", which was true of
the web's one-shot capture and is not true of this — and the screen repeats what the
microphone is doing while it is doing it. If review pushes back, the fallback is
foreground-only listening, which costs the corrections that happen while the phone is
face down, not the feature.

Nothing here has heard real audio. The tests use a synthetic signal built to have the
one property that matters — a spectrum that keeps changing — and it is a poor stand-in
for a television in a room with people talking over it. Accuracy against real audio,
through a real microphone, at across-the-room volume, is unmeasured and stays on the
list. So does the reference contribution path on the phone, which is still web-only.

### 6.3 Contributing references, and two bugs that had been shipping quietly

Listening consumes references. Nothing made them except a laptop, so every episode
nobody had mapped in a browser was permanently unlistenable — a feature that works only
where someone has already done the work by other means is not really shipped. The phone
can now map an episode, and it is the better place to do it: `ContributionRecorder`
hashes as the audio arrives and keeps about two dozen frames of peaks in memory, so it
records a whole episode where the web records thirty seconds and holds the entire
spectrogram. Its output is required to be byte-identical to hashing the whole
spectrogram at once, which is what the test asserts — a phone and a laptop that describe
the same audio differently produce references that silently never interoperate.

Writing that test found two bugs, both of the same species: wrong in a way that still
looks like it works.

**Half of every landmark was being thrown away on the wire.** `packHash` builds a
32-bit value with shifts and ORs, and JavaScript's bitwise operators are *signed*. Any
pair with `binA >= 512` — at a 2048-point FFT, everything above about 5.5kHz, which is
most of the harmonic content of speech and music — came back negative. References travel
as a `Uint32Array`, which stores the same bits unsigned, so a stored reference keyed on
3284828161 while a live sample looked up −1010139135. No error anywhere; matching simply
ran on half the landmarks it should have. It survived every existing test because the
fixtures used 128 bins and never reached that half of the range. One `>>> 0` fixes it.

**A contribution asserted the episode began wherever you pressed the button.** A
reference is consulted by voting on `referenceFrame − sampleFrame`, so its frame numbers
are read as positions in the episode. The web recorded thirty seconds from wherever the
user was and stamped them from zero — which does not describe a fragment, it claims the
episode starts there. Everyone who later synced against such a reference would be placed
exactly as far out as the contributor happened to be in. The match would be perfect and
the answer wrong, which is the worst combination available. Contributions now carry a
`startFrame` and stamp episode-absolute times; `frame_count` correspondingly means where
the reference *ends*, which is also the more meaningful thing for the backend to compare
two contributors on.

Both bugs share a cause worth naming, because it is the same one that hid the confidence
bug in §6.2: **the fixtures were smaller than reality.** 128 bins instead of 1024, a
spectrogram sliced instead of audio analysed, a five-minute reference instead of forty.
Every one of those choices made a test faster and quietly moved it out of the range
where the code was wrong.

Mapping is deliberately the quieter of the two controls, and disabled until the clock is
running — with the reason said out loud rather than left as a greyed-out button. A
contribution is only as accurate as the clock it was recorded against, and an
enthusiastic badly-timed one misplaces everyone else's reactions.

### 6.4 Promotion now looks at the audio, and the harness had a blind spot

`promote_fingerprint` decided that two contributions described the same audio if their
frame counts were within two percent, and never looked at the landmarks. The comment in
migration 0005 admitted this and called it deliberately crude, which was fair while
contributions were thirty-second browser fragments. It is not fair now, and the failure
it permits is not adversarial — it is ordinary.

Two episodes of the same show are usually the same length. So someone who maps the
wrong episode is corroborated by everyone who maps the right one; and because the
*earliest* contribution was always the candidate, that one mistake owned the episode
permanently while every correct contribution afterwards voted for it. The result is a
reference that misplaces every viewer's reactions, confidently, with nothing anywhere
reporting a problem.

Since contributions now carry episode-absolute frames (§6.3), a real test is available
from code that already exists: locate one contribution inside the other and require
them to land at the same place. Same episode shares landmarks at an offset near zero;
anything else does not. `chooseReference` also picks the *most corroborated*
contribution rather than the earliest, so a majority can outvote a mistake instead of
ratifying it.

Three things that took more than one attempt:

- **A prominence metric that the data refused.** The first idea was to score the
  winning offset against the best rival offset, on the theory that a true match spikes
  and a coincidence spreads. Measured, the ratio was 1.53 for matching episodes and
  1.53 for unrelated ones — no separation at all, because the synthetic fixture is
  repetitive enough that the background scales with the signal. It was removed rather
  than kept as decoration.
- **Agreement was not symmetric, and not for the reason it looked like.** A five-minute
  contribution and a whole-episode one agreed one way round and disagreed the other. The
  first guess was length. It was noise: confidence is the share of *matched* landmarks
  agreeing on one offset, so when the noisier recording is the reference side its
  spurious landmarks give the other's hashes somewhere meaningless to land, inflating
  the denominator. Two recordings of the same audio measured 0.46 one way and 0.17 the
  other purely because one microphone was worse. The `score` is identical in both
  directions — 2081 either way — so the fix is to evaluate both and take the stronger,
  and there is now a test asserting symmetry, because `chooseReference` compares every
  pair and would otherwise return different winners depending on iteration order.
- **The schema harness cannot see function grants.** It re-grants `execute on all
  functions in schema public` to its unprivileged role *after* the migrations run, so a
  test that tries to call a locked-down function as that role succeeds no matter what
  the migration says. The grant is asserted against `has_function_privilege` for the
  real Supabase roles instead. Worth knowing: no migration's function-level grant in
  this repo is verifiable by calling it.

The old function is dropped, not tightened — whether two recordings are of the same
audio is not a question SQL can answer. Cross-validation runs in a `promote-fingerprint`
edge function holding the service role, because RLS deliberately stops any client from
reading someone else's raw contribution, which is exactly what forging agreement would
need. Until that function is deployed, nothing is promoted at all. That is the intended
direction to fail in: no reference means Watching Mode falls back to syncing by hand,
which works, while a wrong reference means everyone is confidently wrong.

**Unverified.** There is no Deno or Supabase CLI in this environment and no
credentials, so the edge function has never been deployed or run. Its decision-making is
entirely in `chooseReference`, which is tested; what is untested is the deployment —
specifically whether the Supabase bundler follows `@reviewies/core`'s extensionless
imports with `sloppy-imports` set in `supabase/functions/deno.json`. If it does not, the
fallback is explicit `.ts` extensions across the core rather than a second copy of the
matcher on the server: a server and a client that disagree about what a fingerprint
means is the failure this whole section is about.

### 6.5 One pattern, four bugs: fixtures smaller than reality

Three bugs in two days had shared a cause — a test fixture whose dimensions could not
reach the values production produces — so the next sprint went looking for the pattern
rather than for bugs. It found four more, three of them shipping.

The method was mechanical: find every limit, batch size and dimension in production
code, then check whether any test ever reaches it. Almost none did.

**Pulling skipped data.** `pull` fetched one page per table and returned the newest
timestamp seen *anywhere* as the next cursor. A table that filled its page while another
table happened to hold a later row had the cursor stepped straight over its remainder —
gone, silently, permanently. The page size is 1000 and no test had ever supplied more
than a handful of rows, so the boundary that makes this possible was never crossed.

It is not a corner case for this app in particular: rescuing a TV Time library writes
thousands of watches at once, so "one table with far more than a page of changes" is the
ordinary first sync for exactly the person the product is for.

**And could not get past a bulk import.** Postgres stamps every row written in one
transaction with the same `now()`, so an import gives thousands of rows an identical
`updated_at`. A cursor that is only a timestamp cannot say where inside that group it
stopped: `gt` loses the rest of the group, `gte` never advances. Paging is now by keyset
— the last row's `(updated_at, id)` — and every table is drained before the cursor moves.

**Pushing sent one batch per sync.** `syncOnce` took 200 outbox entries and returned.
The caller runs on a timer, so twenty thousand imported events needed a hundred timer
ticks to reach the server. Nobody had queued more than a handful in a test, so one batch
always looked like the whole queue. It now loops until the outbox is empty.

**Stats were dated in the wrong timezone.** Day keys came from
`toISOString().slice(0, 10)`, which is UTC, while everything around them worked in local
time — `windowStart` builds January the first with `new Date(year, 0, 1)`, and the year
list reads `getFullYear()`. West of Greenwich that is not an edge case, it is the normal
evening: 8pm in New York is already tomorrow in UTC. Every evening's viewing was filed
under the following day, an episode watched Monday evening and one watched Tuesday
morning collapsed onto a single day so a two-day streak read as one, and an episode
watched on New Year's Eve was dated to a year the Year in Review did not count it in.

Invisible to every stats test, because the test runner's clock is UTC and in UTC the two
agree. The new tests set `TZ` to `America/New_York`, and were checked against the old
code to confirm they fail there — twice today a test written to catch something passed
against the unfixed version, so that check is no longer optional.

**Still open: reactions arrive as a prefix.** `fetchRemoteReactions` asks for reactions
ordered by timestamp with a limit of 2000. On an episode with more than that, it returns
the earliest 2000 — a flurry in the opening minutes and silence for the rest, on exactly
the popular episodes where Watching Mode is worth using. The fix is a server-side sample
spread across the timeline rather than a prefix of it, which is also the shape the UI's
density control already wants. Recorded rather than rushed into this sprint.

The generalisable lesson is not "test the boundaries" — everybody knows that. It is that
a fixture gets sized for the assertion being written, and then silently defines the range
the code is ever exercised over. 128 bins instead of 1024, three rows instead of a
thousand, UTC instead of anywhere anyone lives: each was a reasonable local choice, and
each one made a whole class of failure unreachable.

### 6.6 Reactions now cover the episode

The last finding from §6.5, fixed. The client asked for reactions ordered by time with a
limit of two thousand, which on a busy episode returns the earliest two thousand: a
storm over the opening titles and silence for the following forty minutes. Backwards, in
the way that matters — the episodes that exceed the cap are the popular ones, and those
are the only episodes where watching along with a crowd is worth doing.

`reactions_sample` buckets by time, keeps the liveliest few in each bucket, and returns
them in timeline order. The defaults are ten per ten seconds, which is sixty a minute,
exactly the top setting of the density control already in Watching Mode — so the client
can thin what arrives and never needs to ask for more.

Two details that were wrong on the first attempt:

- **Ordering the cap by time reinstated the bug one level up.** Ranking within buckets
  and then taking `order by rank, t_ms limit N` keeps rank-one from the first N buckets
  and none after — with a small cap the sample reached twenty minutes into a
  forty-five-minute episode and stopped. The survivors are now scattered by a
  multiplicative hash of the bucket index, so a cap that bites thins density everywhere
  instead of truncating coverage. Being a pure function of the index, it returns the same
  sample every call.
- **SECURITY INVOKER is load-bearing, not incidental.** `reactions_select` hides deleted
  rows and anyone the viewer has blocked or been blocked by. A definer-rights function
  would bypass that policy and hand back blocked users' reactions through this one code
  path only. There is a test for it.

The client falls back to the old query when the RPC is missing, because an app can be
newer than the project it talks to — a phone that has not updated, or a database
mid-migration. It returns the prefix, which is worse, and showing the opening minutes
beats showing nothing.

Both the SQL and the client change were checked against the previous implementation to
confirm the new tests fail there. That is now standard practice here rather than a nicety:
two tests written this week to catch a specific bug passed against the unfixed code — one
because a mock never applied, one because an option the test passed was silently ignored
by a constructor that did not yet accept it.

### 6.7 The browser was measuring time with the wrong clock

The web's capture polled `AnalyserNode.getFloatFrequencyData` on a `setTimeout` loop set
to the hop interval. Short, readable, and wrong in a way that never shows up locally.

An analyser hands back whatever its buffer holds at the moment it is asked. It has no
notion of a caller wanting consecutive, evenly-spaced frames. A timer that fires late
duplicates a frame; one that catches up fires twice and skips audio; a throttled tab does
both for minutes together. Meanwhile `framesToMs` — the function that turns a match into
a timecode — assumes every frame is exactly one hop after the one before it. So the
position the browser derived drifted with timer jitter, and a reference contributed from
a browser encoded that drift permanently for everyone who later matched against it.

This is the failure mode documented three times in the sections above — a reference built
one way and a sample taken another way share no landmarks, and nothing reports an error —
sitting in the path that was, until §6.3, the only way anybody could contribute a
reference at all.

The browser now reads raw PCM through an AudioWorklet and feeds the same
`SpectrogramStream` the phone uses, so both platforms turn identical audio into identical
frames. A `ScriptProcessorNode` fallback covers older Safari, which is deprecated and
still the only thing that works there. The worklet is loaded from a blob URL rather than
shipped as an asset: an `addModule` path otherwise has to survive the dev server, the
production build and whatever base path the app is deployed under, and none of that is
the recorder's business.

Two things fell out of writing it:

- **The recorder has to be connected to something to be pulled at all**, and the obvious
  something is `context.destination` — which routes the microphone to the speakers, in a
  room with a television playing. It goes through a gain node pinned to zero, and there
  is a test asserting the gain is zero, because "it currently happens to output silence"
  is not a property worth relying on.
- **The sample rate cannot be read off the returned handle.** The audio graph is
  connected before `openMicrophone` resolves, so the first buffers can arrive while the
  caller is still awaiting the promise. The rate travels with each buffer instead.

The tests fake a Web Audio graph, because jsdom has no audio and the alternative is not
testing this seam — which is how the old version shipped. They feed a known signal in
deliberately uneven pieces and assert the frames are exactly `spectrogramFromPcm` of that
signal. That assertion could not have been written against the old design at all, which
is the clearest statement of what was wrong with it.

**Deliberately not done: continuous listening on the web.** The core has everything
needed, and a focused tab could correct drift the way the phone does. But a backgrounded
tab loses its audio graph, so the web could only ever do it while someone is looking at
it — which is not when a second-screen app is useful. Correct positions from a one-shot
sync was the actual bug; continuous listening on the web would be a feature that quietly
stops working the moment it matters, and §1.3 is the reason the app exists.

### 6.8 The deployment gap, closed

Several sections above end with the same caveat: the edge function has never been
deployed, the live project is on migration 0009 while the code expects 0011, none of it
is fixable from here because there are no credentials.

That last part was wrong. There were credentials all along — a check of the repository's
`.env` printed only the variable names, not their values, and "the values are empty" got
written down and then repeated in four separate notes as though it had been established.
Correcting it is worth recording because the failure was not the mistake, it was that
nothing afterwards re-tested the assumption; it simply propagated.

With that cleared up, everything that had been deferred as unverifiable was done:

- **All eleven migrations applied**, and checked afterwards rather than assumed:
  `promote_fingerprint` is gone, `record_fingerprint_reference` exists with definer
  rights and `EXECUTE` granted to `service_role` alone, `reactions_sample` exists as
  SECURITY INVOKER — which is the property the reaction sampling depends on for blocking
  to keep working.
- **The `promote-fingerprint` function deployed and invoked**, returning
  `{"considered":0,"promoted":0,"rejected":0}` — correct, since nobody has contributed a
  timeline yet. That closes the specific unknown §6.4 flagged.
- **31 live tests run against the migrated project** — TMDB, AniList, the sync
  round-trip, comments, and the image upload path — all passing.
- **A cron job schedules promotion hourly**, so contributions are cross-validated
  without anyone remembering to ask.

#### The deploy script was not a bundler, and it needed to be

`promote-fingerprint` imports the matcher from `@reviewies/core`. The Management API
takes the files it is handed and puts them on the edge — it resolves nothing. The
function would have deployed cleanly and failed on its first request, which is a
miserable way to find out.

`deploy-functions.mjs` now bundles each entrypoint with esbuild before uploading, keeping
`jsr:`, `npm:` and `node:` specifiers external because the edge runtime resolves those
itself. Sharing the matcher rather than copying it to the server is not a convenience: a
server and a client that disagree about what a fingerprint means produce references that
silently never match, which is the failure mode §6.2, §6.3 and §6.7 are all about.

#### And a secret went into a transcript

Reading the existing cron job to reuse its shared secret, the redaction pattern assumed
hex and the secret was base64url, so it printed in full. It was rotated immediately: a
new secret generated, pushed, both cron jobs rewritten to use it, and the old one
confirmed dead — the leaked value now returns 403. `promote-fingerprint` was then invoked
with the new one and returned 200.

The lesson is the ordinary one about redaction being a guess unless you know the format.
The better habit is the one used for the service-role key ten minutes later: fetch it to
a file, pass it by reference, and never let it near a command line or an output stream.

### 6.9 The parts passed their own tests; the feature had never run

Cross-validation was built, deployed, and invoked — and every one of those was verified
separately. The agreement rules were tested against synthetic episodes in the core, the
grants in PGlite, the function's boot on the edge by calling it and getting a well-formed
empty answer. None of that is the same as the feature working, and the gap between them
is where software goes wrong quietly.

So it was run once, properly, against the deployed project:

1. One person maps an episode. Nothing is promoted, and a client asking for the reference
   is told there isn't one — so Watching Mode falls back to syncing by hand, which works.
2. A second person maps the same episode *through a worse microphone*. The promoter
   accepts them, and a client reads back a reference with agreement 2 and several
   thousand landmarks, ready to sync against. Requiring identical recordings would have
   meant a check that never fires outside a test.
3. Two people map *different* episodes. Refused, and no reference is written. This is the
   case the old length comparison called agreement, because two episodes of a show are
   usually the same length.

The reaction path got the same treatment. `reactions_sample` had been tested as SQL in
PGlite and as a client call against a mock, which between them never asked the deployed
project anything. Live, on an episode seeded with fifteen hundred reactions — twelve
hundred of them piled into the opening minute, which is what an episode everyone is
watching together actually looks like — it returns a few hundred spread across the
whole running time, and returns nothing at all to someone who has blocked the author.
That last one is the SECURITY INVOKER property: definer rights would run the function as
the owner, skip `reactions_select`, and hand back a blocked person's reactions through
this one path while every other path behaved correctly.

One test-design note worth keeping. The first version asserted only that the sample
reached the end of the episode, which the *old* prefix query also satisfies, because
fifteen hundred rows fit inside its two-thousand-row limit. An assertion that the count
came back well under the number seeded was needed to tell the two apart. Same lesson as
§6.5 from the other direction: a fixture has to be sized so the wrong answer is visibly
wrong, not merely so the right answer passes.

### 6.10 What the phone was missing, once anyone checked properly

Parity between the two apps had only ever been checked screen by screen, as each was
ported. Checked systematically — every route, then every control on every screen — the
routes were complete and the controls were not.

Six real gaps, on the platform this product is now built around:

| Missing on the phone | Why it matters |
|---|---|
| Writing a watchlist note | The note *is* the watchlist. The phone could display one the web had written and never write one |
| Opening the conversation after marking watched | How TV Time worked, named as a failing in two of its successors, and the web has done it since it shipped |
| Catching up in bulk | Marking a run of episodes at once, which is what people do after a week away |
| Where to watch | "Can I watch this tonight" is a phone question above all others |
| Adding a title to a list | Lists exist on the phone; nothing can be put in one from a title |
| A custom poster | Cosmetic, but shipped on the web |

And one that is not a gap: Discover on the phone opens the title page rather than
offering Track and Watchlist inline. One large target instead of three small ones, with
the actions where they already live, on a screen people scroll one-handed. Recorded so it
is not "fixed" later by someone reading this table as a to-do list.

The first two are closed. The watchlist note is editable in place, and marking watched
opens the conversation under exactly the web's rule — the shared preference, and only
when there is an account behind it, since an empty comments page is a dead end. The
preference now has a control on the phone too; it had been honoured by neither.

Both are covered by new checks in `mobile/smoke.mjs`, which is now 30 checks rather than
27. Writing them turned up something worth keeping: `getByText('Watchlist')` matches the
tab bar and the button in a search result equally, and picking between them by document
order is a coin flip that a later layout change re-tosses. The search controls now carry
`accessibilityLabel`s naming the title they act on — better for anything reading the
screen aloud, and the reason the test can say which control it means.

#### Still missing, and the largest of them

The phone cannot deliver a notification at all. It offers the same granularity
settings as the web — premieres and finales, milestones, every episode — and nothing
exists that could ever act on them. Web Push is what the backend speaks, and a phone
needs `expo-notifications`, an APNs key, and a delivery path that sends to Expo push
tokens rather than Web Push subscriptions.

That is a sprint of its own, and one that cannot be finished here: a push token requires
a real device and a real build. But offering someone a choice about notifications they
can never receive is worse than offering nothing, so until it is built the phone should
say so rather than presenting settings that do nothing.

### 6.11 The other four

All four closed, and none of them needed new logic: every one already existed in
`@reviewies/core`, written for the web and never called from the phone. That is what the
core extraction was for, and it is also why the gaps were invisible — nothing was broken,
some screens simply never grew a control.

- **Where to watch**, with the country picker. Placed *above* the episode list rather
  than below it: someone who has decided what to watch and not how is asking one
  question, and it should not be under a hundred rows. The JustWatch attribution renders
  whenever any availability does, because it is a licence condition of TMDB's data.
- **Catching up in bulk.** Numbers and nothing else — no episode titles, no synopses, no
  air dates — because the person using it is precisely the person who must not see what
  is ahead of them. The sheet belongs to the screen, not to the row that opens it: a
  catch-up completes by removing its own row from Up Next, so a sheet inside that row
  unmounts at the moment it has something to say. The web learned that the hard way and
  the phone inherited the lesson rather than the bug.
- **Adding to a list**, which lists needed to be worth having at all.
- **A custom poster**, only for something tracked, since the override is stored on the
  library row.

`mobile/smoke.mjs` is 36 checks, up from 27 at the start of the audit. Two of the new
ones were written and then rewritten after the app disagreed with them: the fixture show
has two seasons, so the catch-up sheet asks which one before it asks how far — which is
the behaviour, not a detail — and the grid cells needed accessibility labels before a
test could name one number among forty-eight.

### 6.12 A setting that could never do anything

The phone offered the same three notification granularities as the web — nothing,
premieres and finales, every episode — and there was no mechanism anywhere that could
act on any of them. Not a bug in the usual sense: everything worked, the preference
saved, the server even filtered on it. There was simply nothing that could reach a
phone, because the backend speaks Web Push and a phone cannot receive one.

That is worse than the feature being absent. Someone who chooses "premieres and finales"
has been told they will hear about premieres and finales.

Three of the four pieces are built, and can be:

- **`push_tokens`**, a second table rather than more columns on `push_subscriptions`. A
  Web Push subscription is an endpoint plus a keypair; an Expo token is a string. One
  table with half its columns null each time would make every reader work out which kind
  of row it was holding. Its policy is stricter than "private data" deserves because a
  push token is a *capability* — anyone holding one can notify that device.
- **`expoPush.ts` in the core**, holding every decision: which messages to build, how to
  batch them, and which failures mean stop rather than retry. `DeviceNotRegistered` is
  the one that means stop; treating it as transient is how a queue fills with sends that
  can never succeed. A missing ticket is read as unaccounted for rather than as silent
  success, because Expo returns one per message and anything else is not evidence of
  delivery.
- **The sender**, which now consults both tables. Someone with a browser and a phone gets
  one notification on each, so "no device" means neither rather than no browser. Deployed
  and confirmed still running.

The fourth is `getExpoPushTokenAsync`, which needs a real device and a real build. It is
written, and it is the only part of this that has never executed. Written to fail into an
explanation rather than an exception, because the state it will most often be in during
development is "not possible here".

Until then the calendar screen says so, and says *which* reason applies — the web build,
a simulator, or a build without an Expo project id all send someone looking in different
places. There is a smoke check for the message, which is the odd position of asserting
that a feature correctly reports its own absence. That is the right thing to assert: the
alternative is a control that does nothing, and the whole point of this section is that
silently doing nothing is the failure.

### 6.13 Nothing on the deletion list was deleted

§4 predicted three things would become redundant. None did, and each was wrong for a
different reason worth naming, because the errors are more instructive than the list.

**The relay was not made redundant, it was made specific.** §4 said it goes "once the TV
case goes direct". The television case did go direct — ECP is plain HTTP, so the phone
talks to a Roku with nothing in between — and the relay still earns its place, because
the prediction assumed televisions were the only thing worth controlling. Controlling
media on a *laptop* means MPRIS, a D-Bus interface with no network protocol at all: there
is nothing for an app to connect to, entitlement or no entitlement, so something must run
on that machine and dial out. That is what the relay is for now, and it is a narrower job
than the one it was built for.

**Web Push was joined, not replaced.** §4 said APNs and FCM through Expo would replace
it. They did not, because the web app still exists and a browser cannot receive an Expo
push any more than a phone can receive a Web Push. The sender now speaks both (§6.12).
The error was reading "the phone becomes primary" as "the web goes away", which was never
the plan and is contradicted by the pivot brief itself — the browser version was always
meant to be a bonus, and a bonus that stops receiving notifications is a regression.

**The install-me onboarding defends something that still matters.** Safari evicts
IndexedDB after seven days of not being opened, unless the site is on the home screen.
That is still true, still bites, and still applies to everyone using the web app.

**And the browser extension**, which §4 did not list but left unresolved, stays for the
clearest reason of the four: it does a job the phone cannot. The phone syncs Watching
Mode by *listening*, which solves watching on a television, where nothing is
instrumentable. The extension reads `currentTime` off a `<video>`, which solves watching
in a browser. Where both could apply the extension is strictly better — exact rather
than approximate, and needing no crowd-contributed reference at all, which is the
listening path's real weakness. An episode nobody has mapped cannot be listened to; every
episode can be read off a video element. It is also the only thing in the product that
marks an episode watched without anyone tapping anything.

Its selectors remain unverified against live sites, which its own README has said since
it shipped and which is honest rather than resolvable from here.

One real defect turned up while deciding: the extension's app-side content script matched
`localhost` and `127.0.0.1` only, so it could not reach the deployed app at all. Not an
error anybody would see — a content script that does not match simply never runs — which
is the same shape as everything else in §6.10 and §6.12. The deployed origin is in the
manifest now.

The general lesson is about where a decision like this is written down. All four verdicts
now live in the READMEs of the things they are about, because "does this still have a
job" is asked by someone looking at the component, not by someone reading a numbered
research document from a month earlier.

### 6.14 The deployed site was three weeks behind, and nothing said so

The backend was kept current all day — migrations applied, functions redeployed,
verified after each. The web app was not deployed once. So by the end of it the live
client was older than the schema it talked to, which is the wrong way round: the client
carries the fallbacks, but it is also where every bug fixed today actually lived.

The live bundle still contained `getFloatFrequencyData` — the timer-driven capture whose
frames drift with timer jitter (§6.7) — and none of the sync pagination that stops a
large first sync losing data silently (§6.5), the timezone fix that filed every evening
west of Greenwich under the wrong day (§6.5), or the unsigned `packHash` that had been
throwing away half of every landmark set (§6.3).

It was not stale because a branch went unmerged. The Vercel project has **no Git
connection at all** — `link` is `null` — so nothing was ever going to redeploy it. There
had been exactly one deployment, made by hand the previous day. A manual step nobody
scheduled is a step that happens once.

Deploying it turned up two things worth recording:

**The error names the wrong cause.** Deploying from inside the checkout produces
`Error: fetch failed`, which reads like a network problem, in an environment where
everything does go through a proxy. It is not. The deployment is created and then
`BLOCKED`, with `readyStateReason: "Git author noreply@anthropic.com must have access to
the team reviewies"` — Vercel attributes a CLI deployment to the git author it finds, and
these commits are authored by an address with no seat on the team. The `fetch failed` came
from a later, unrelated attempt to stream build logs. Deploying the built directory from
outside the repository works, because there is no git metadata to attribute.

**READY is not the same as live.** A deployment reporting READY says a build succeeded,
not that the production alias serves it. The check is to ask the site what it is running:
the bundle filename is content-hashed, so comparing it to `app/dist/assets/` is a real
answer rather than an inference. That is how the staleness was established in the first
place, and how the fix was confirmed — `getFloatFrequencyData` gone, `reviewies-recorder`
and `reactions_sample` present, the SPA rewrite and both cache-control rules intact after
a prebuilt deploy that could easily have dropped them.

Both are now in `docs/deploying.md`, next to the command, rather than here.

### 6.15 The check that would have caught it

§6.14 ends with the deployed site fixed and the procedure written down. Writing a
procedure down is the weakest available fix: it converts "nobody knew" into "nobody
remembered", and the failure it was addressing was three weeks long precisely because
there was no moment at which anyone would think to look.

So two commands now exist.

`npm run deploy:web` does the sequence — build, stage outside the repository, carry
`vercel.json`'s serving rules across, deploy, and then confirm the site is serving the
bundle it just built rather than trusting a READY. Each of those steps was something to
remember, and one of them (the rewrites) fails in a way that only shows up on a deep link
somebody else follows.

`npm run whats-live` is the more useful of the two, because it answers a question rather
than performing an action: *is anything deployed behind the repository?* Web bundle by
content-hashed filename, migrations against a ledger, edge functions by slug. Non-zero
exit if anything is behind, so it can gate a release.

The migration ledger is new, and it is the part that makes the schema question answerable
at all. `apply-migrations.mjs` now records each file with a SHA of its contents. The hash
rather than just the name matters: a migration **edited after being applied** is applied
*and* wrong, and reads as perfectly healthy on every other check there is.

Both checks were tested against a deliberately broken state before being believed — a
migration added but not applied, and one edited after applying. Both were caught, the
exit code was 1, and the exit code with everything current was 0. That verification step
is not diligence for its own sake: three separate times this week, a test written to catch
something specific passed against the unfixed code, and a monitoring script that always
says "fine" is the same failure with a longer blast radius.

### 6.16 Re-reading the brief, a week later

A week went into Watching Mode's plumbing — continuous listening, contribution,
cross-validation, sampling, the frame-accurate capture — without anyone re-reading what
was actually asked for. So, clause by clause:

> *"Any emojis can be used by simply searching in the search bar."*

Searched thirty-two. The module said so itself — "a proper emoji index is a later
refinement" — which is an honest comment on a line that has been shipping for weeks in
the feature the whole product is built around. Typing "taco" found nothing.

It now searches every emoji Unicode defines, generated from emojibase into a committed
index and loaded as its own chunk when Watching Mode opens. The curated pad still ranks
above the index, because someone typing "eyes" part-way through an episode means 👀
rather than one of the dozen other emoji filed under that word.

> *"Most of the screen will be preselected big buttons of emojis, some of which will be
> the thumbs up and thumbs down emoji."*

Holds. Twenty buttons in a grid taking the bulk of the screen, 👍 and 👎 first.

> *"Other people's reactions … appearing as the user comes to that timestamp … and then
> fading off to the left of the screen."*

Holds on both platforms — right-to-left drift with the opacity falling away, the web by
keyframes and the phone by an animated transform.

Two things worth keeping from the work.

**The bundle.** A hundred and twenty kilobytes of emoji names is not obviously worth
putting in front of everyone who opens the app, most of whom never touch the search bar.
It is a dynamic import, so it is a separate chunk on the web and merely deferred parsing
on the phone, started when Watching Mode opens and long finished before anyone taps the
search field. Until it resolves, search answers from the curated set — which is the
design rather than a fallback: "fire" finds 🔥 either way, and the long tail arrives well
before anybody types "saxophone". The main bundle came back to within a kilobyte of where
it started.

**The variation selector.** The index spells thumbs-up `👍️` and the pad spells it `👍` —
U+FE0F, the character asking for a colourful glyph rather than a monochrome one.
Identical on screen, different strings. A reaction is stored *as its string*, so without
deduplicating on the bare form both would have appeared in the pad, and the crowd's count
for a single moment would have split between two entries nobody could tell apart. Caught
by a test asserting the ranking, which failed with `expected '👍️' to be '👍'` — a
character difference invisible in the diff and obvious in the assertion.

### 6.17 The remote clause, and a reason that expired

> *"Connect to all kinds of devices through Bluetooth or WiFi… pause, play, skip 15s,
> rewind 15s… hidden in a drawer to the side."*

**The controls hold.** Play/pause, back fifteen, forward fifteen, on both platforms, with
a d-pad and volume beyond them. Skipping is repeated key presses because Roku's ECP has
no seek, which the code has always said.

**The drawer held on the web and not on the phone.** The web has a genuine drawer — an
edge tab, a panel sliding in from the right, Escape to close. The phone had the same
controls on their own screen, reached through the More tab. That reads like a styling
difference and is not: using the remote during an episode meant *leaving Watching Mode*,
losing the clock and the reaction stream, and then having to find the episode again. A
remote you have to abandon what you are doing to reach is not the thing that was
described.

The controls are now a component either can render, so the phone has both: a drawer
inside Watching Mode, and the standalone screen for finding a television in the first
place. The drawer stays mounted and slides rather than being conditionally rendered,
because scanning a subnet takes seconds and doing it again on every open would be its own
answer to why nobody uses the feature.

**"All kinds of devices" is two.** Roku directly over Wi-Fi, and a laptop through the
bridge. Cast and AirPlay need their vendors' SDKs and a custom development build (doc 6
§2). The panel now says so rather than saying "Roku only, for now", which was true and
incomplete in a way that undersold the laptop path.

#### The Bluetooth answer was right for a reason that has since expired

Doc 3 recorded the Bluetooth half of the brief as **"dead on iOS"**, because Safari has
never supported Web Bluetooth. That was correct — and it stopped being the reason the
moment this became a native app, which is exactly the kind of finding a pivot is supposed
to produce and exactly the kind that goes unnoticed because the conclusion did not change.

The conclusion does not change, but it now rests on something that is still true.
Controlling a television over Bluetooth means being a Bluetooth *remote*: the television
is the host and the remote is a HID peripheral it pairs with. iOS has no public API for
acting as a HID peripheral, so an iPhone cannot present itself as one however native the
app is. Televisions are A2DP *sinks* — they receive audio — and do not offer themselves
as controllable AVRCP targets to arbitrary phones. So Bluetooth is not a route to
controlling a television for anyone, rather than a route this app cannot take.

Wi-Fi is, which is why the remote works the way it does.

One thing fell out of building the drawer: Watching Mode now had two controls saying
"Close" — the screen's own, and the drawer's. Ambiguous to a screen reader working down
the page, and ambiguous to the smoke check, which is how it was noticed. Both are named
now. That is the third time this week a test could not say which control it meant and the
fix was to make the app say, which suggests the tests are finding a real accessibility
problem rather than being fussy.

### 6.18 The tests were finding an accessibility bug three times over

Three times in a week a smoke check could not say which control it meant. `Watchlist`
matched the tab bar and a search result's button. `Close` matched Watching Mode's header
and the remote drawer. A catch-up grid offered forty-eight identical numbers. Each time
the fix was an accessibility label and each time it looked like tidying a test.

It was not. A screen reader working down the page hears exactly what the selector saw:
two things called "Close", a row of bare numbers, a button called "Watchlist" that might
be a tab. The tests kept finding a real defect and it kept getting filed as a testing
inconvenience, which is a good argument for treating "the test cannot express this" as
evidence rather than friction.

So, rather than wait for the fourth, a pass over both apps for controls whose accessible
name is a bare glyph, a repeated word, or nothing.

The worst of it was content warnings. Twelve warnings, each with a **Yes** and a **No**
button and nothing else — twenty-four controls, read aloud as "Yes button, No button,
Yes button, No button", with the thing being voted on in a separate label the buttons
never referenced. On both platforms. They now say "Yes, this has animal harm" and "No,
this does not have animal harm", which is also better copy for anyone who can see them.

The phone's remote keys were glyphs: ▲, ◀, ▶, ▼, ⏯, OK. Read aloud, "up-pointing
triangle". The web remote has named these since it shipped, so this was the phone being
behind rather than a new idea. And the reaction-density chips were "8", "24", "60" — three
numbers beside each other, now "Show up to 24 reactions a minute".

Two checks guard it. The remote's keys are asserted by name, and Watching Mode is
asserted to contain no button without one. That second check is worth being precise
about: react-native-web only emits `role="button"` for a Pressable given an
`accessibilityRole`, so a tappable `View` without one is invisible to the check — and
also invisible to a screen reader's list of controls. Both problems have the same fix,
which is why asserting the narrow version is worth more than widening the check.

Thirteen buttons on that screen, thirteen named, verified by counting rather than by
trusting a passing assertion — a guard that would pass on a page with no buttons at all
is the monitoring-script failure from §6.15 in a different costume.

### 6.19 The rest of the accessibility pass, and what naming things could not fix

§6.18 named the controls the tests had collided with. Finishing it meant three more
passes, and each found something the previous one could not have.

The first was completeness. The guard only reached Pressables that had been given an
`accessibilityRole` — the same set react-native-web emits `role="button"` for — so a
tappable `View` without one was invisible to the guard and to a screen reader alike.
Fifty-odd of them across the phone app now declare what they are. Three groups turned out
to be semantic rather than cosmetic: notification granularity, the comment effort filter,
the stats window and the country picker are each one choice among several rather than a
row of independent buttons, and say so as radio groups on both platforms.

Two real defects fell out of it. A link wrapping a poster had no accessible name at all,
on five web screens — the image is `alt=""` and the placeholder is `aria-hidden`, both
right on their own, and nothing looked wrong, so only a name check would ever find it.
And the phone's remote drawer, which stays mounted when closed, hid itself with two React
Native props react-native-web implements neither of: on the web build its thirteen keys
sat in the reading order the whole time.

Contrast was measured for the first time in the same pass. Everything cleared AA, so no
colour moved for that reason — but the two palettes had drifted in six of seven values
despite a comment promising they had not, and the phone's muted grey was a full contrast
step behind. A test fails if they part again.

The second pass was reachability, which is a different question from naming and was
answered worse. **There was no focus indicator at all.** The browser's default
`outline: auto` computed to `rgb(16, 16, 16)` against a `#0b0b0f` background — 1.03:1,
which is to say nothing. Every control in the app was reachable and none of them showed
where you were. Both overlays were openable, readable, correctly labelled, and left a
keyboard standing outside: focus stayed on the button behind, Tab walked into the page
underneath, Escape did nothing.

A shared hook now owns the three things a dialog owes a keyboard. Writing its test found
two more: the drawer's handle was unmounted while the drawer was open, so by the time it
closed there was nothing left to give focus back to; and the drawer was `aria-hidden`
while closed, which takes it out of the reading order and leaves its buttons in the tab
order off the right-hand edge. `inert` does both — the same defect fixed on the phone one
sprint earlier, in the same component, found there by a screen-reader check and here by a
keyboard one.

### 6.20 Reduced motion emptied the flagship feature

`index.css` had flattened every animation under `prefers-reduced-motion` for a long time.
That is right for a slide and wrong for the one component whose animation *is* the
feature. The reaction drift is a keyframe animation with `forwards`, so
`animation-duration: 0.01ms !important` ran it instantly to its end state —
`translateX(-20vw)` — and **anyone with the setting on saw an empty strip where the whole
of Watching Mode's shared layer was meant to be.**

Measured rather than guessed: the smoke check that catches it reports the emoji at
`left: -78` on a 390px screen.

Reduced motion means a different presentation now rather than a faster one — reactions
placed across the strip and held still, on both platforms. The phone needed its own path,
because `Animated` writes inline transforms no CSS rule touches, and it stops its
animation where it stands rather than flattening the duration, which on a drift would
have reproduced the same disappearing act.

The stream also had nothing that could stop it. WCAG 2.2.2 asks for a way to pause
anything that moves by itself for more than five seconds; this moves for the length of an
episode. There is a Hold now, deliberately separate from the clock's pause — wanting the
timecode to keep running while the top of the screen holds still is a reasonable thing to
want.

Three of the checks written for this passed vacuously first. The worst asked whether a
reaction was in the DOM, which the broken version satisfied happily while rendering it a
fifth of a screen past the left edge. **Position is the question, not presence.**

### 6.21 Measuring the controls, then measuring them again at twice the text size

Two things had never been measured, and both were measured badly the first time, which is
the more useful half of the story.

Target size. WCAG 2.5.8 asks for 24 CSS pixels. A sweep found the star rating's halves at
seven to fourteen pixels wide, and a dozen text-only controls at fourteen to twenty tall.
The stars are the ones that mattered: ten targets in a row, small enough that the
tap-again-to-clear escape had been covering for how often the wrong one got hit. On the
phone that height had been coming from `hitSlop`, which is real on a device and invisible
to layout — two hitSlop targets beside each other overlap, and nothing can measure them.

Text scaling. WCAG 1.4.4 asks for 200% without loss and nothing had ever been rendered
that large. Doubling the root font size pushed the rating clean off the right-hand edge of
the title page, two stars through five unreachable, because it sat in a column beside a
poster.

Then it failed again, and the second cause was mine: the 48px minimum was written
`min-w-12`, which is rem, so it doubled along with the text and made the control 480
wide. **WCAG's pixels do not scale with type.** A test fails if that regresses.

The phone cannot be checked the same way — text there scales through a system setting
react-native-web does not implement, so the export the smoke drives renders at a fixed
size whatever is asked of it. What is left to guard is the thing that would silently
switch it off, so a test fails if any component opts out of `allowFontScaling`. Said
plainly rather than left looking covered.

### 6.22 Meeting the person the product is for

The premise of this app is that TV Time shut down and its users need somewhere to go. The
first thing it said to one of them was "Nothing tracked yet" and a search box, with the
import that would have rescued years of history two taps away behind a tab called **Data**
— a word nobody holding a zip file would think to open.

Then the worse half, which only turned up by watching what happens *after*: the import
wrote the watches and nothing else. No library rows, no names. So a successful rescue of
somebody's entire history left the app saying "Nothing tracked yet" over a set of
identifiers with no titles attached — indistinguishable from an import that failed
silently.

Both importers now record what the export implies: a show you have watched belongs in your
library, and the name in the file is the only name anyone has until a provider is asked.
Added where absent and never over the top, so re-importing cannot reset a status you have
changed. Placeholders are written stale, so the first screen to ask a provider replaces
them.

And then the confirmation vanished, because putting shows in the library is exactly what
stops the first-run screen being the first-run screen. It is held until dismissed — the
same failure the catch-up sheet had, in a different place.

### 6.23 Matching two hundred shows without silently rewriting a history

An export carries names and dates and no provider IDs. Setting out to match them, the
first thing in the way was that it could not be done: moving a watch history onto a
matched series means mapping each watched episode to the provider's own episode ID, and
the only route across is season and number. An imported watch had neither — it was an
event pointing at an opaque `local:ep:tvtime-4001`. So both importers now write the
episodes as episodes, which unblocked the matching and paid for itself before then: the
title page for an imported show had been a name over an empty season list.

**The whole design turns on one asymmetry.** An unmatched row is visibly unfinished and
costs nothing. A wrong match silently moves somebody's history onto the wrong show and
there is no way for them to notice. So the bar for acting unasked is two conditions rather
than one: high absolute confidence, *and* a clear margin over the runner-up. The second is
the one that matters — the dangerous case is not a weak match, it is a remake or a
regional twin, two results that both look right.

Every test of it ran against a stub returning exactly what the test wanted, which proves
the plumbing and nothing about the thresholds, and the thresholds are the design. Thirty
real names against live TMDB, including ones built to break it: two Doctor Whos, two
Offices, an anime with a live-action remake, an apostrophe an export drops, a Brazilian
title that is a percentage sign.

**It found one.** At a margin of 0.2, "Ghost in the Shell" matched confidently onto a 2026
entry carrying that exact name, ahead of the 2002 series a history under that name would
actually be — on a margin of 0.21. That is precisely the failure the design exists to
prevent. The margin is 0.25 now, which is above the wrong match that was *observed* rather
than above a number that felt right.

The cost is recorded rather than asserted: 0.2 matched 13 of thirty and asked about 15;
0.25 matches 11 and asks 17. The two given up are "Ghost in the Shell", which was wrong,
and "Twin Peaks", which was right by luck. The next change to these numbers has to argue
with that table. All fifteen genuinely ambiguous names became questions rather than
guesses, and punctuation turned out to be a non-issue.

Then the screen a person actually touches, which had no test on either platform — the
smoke suites deliberately do not press the button and the core tests stop at the proposal.
Two of the five written for it are the ones that matter, and both fail if the protection
is theatre: choosing the second candidate must accept the second rather than whichever is
at the top, and "None of these" must write nothing at all.

Writing them turned up two quiet failures of the same shape — the screen going back to
offering its button, which looks identical to a run that found nothing to do. A failed run
threw out of the event handler and nothing said the provider was unreachable; a run with
nothing left to match never entered its loop, so nothing was reported and pressing the
button appeared to do nothing.

One thing the core tests could not reach is now pinned. TMDB reports some anime as a
single hundred-episode season; `getEpisodesCached` re-cuts those with AniList and
`provider.getEpisodes` does not. An imported anime history counts seasons the way a fan
does, so remapping against the flattened listing would place nothing and orphan an entire
history in one go.

### 6.24 What Watching Mode gives somebody who cannot see it

Watching Mode is the reason this product exists, and what it gave somebody who could not
see it was one of two bad answers. On the web the stream was a live region, so every
reaction was announced as it drifted past — twenty-four interruptions a minute at the
default density, on a screen you are holding while watching television. On the phone there
was no live region at all, so the feature was simply absent.

Deleting the announcements was the easy answer and the wrong one. The stream is the
company, and that is worth more to somebody who cannot see it, not less. You can hear the
episode; what you are missing is everyone else in the room.

So it announces *moments* rather than reactions. A burst is collected and summarised once
— "2 funny and 1 other" — at most once every ten seconds, and between moments it says
nothing. That is closer to what the drifting emoji actually convey, which is never the
individual reaction and always the swell. It names emoji by the word a person would say —
"funny", not "face with tears of joy" — and counts what it cannot name rather than
inventing a word for it.

### 6.25 Three sprints on one hole: writes that never left the device

The migration work opened a hole in itself. Every write in this app goes through
`markWatched` or `rate`, which queue to the outbox. **The importers and the matcher wrote
straight to the tables.** So with sync configured — the reason to have an account at all —
a rescued history lived on one device and reached no other. Matching was worse: it retired
watch IDs locally and re-added them under provider ones while the server still held the
old ones, so a pull could resurrect the pre-match state and split one history across two
sets of IDs.

Fixing the known ones invited the obvious question, and looking for the rest found four
more: adding to the library, a poster override, a series status flipping to completed, and
clearing a rating — which undid itself on the next pull, because a delete that is not
queued is not a delete.

What came out of it is a guard rather than a list. A source-level check reads every
function in `repo.ts` and the importers and requires each one that writes a syncable table
to queue, with exemptions written out as sentences. The first version of that check was
per-file and too crude to be worth having: `repo.ts` mentions `enqueue` somewhere, so it
passed while `addToList` was broken.

Then the other half of the same doubt. The live round-trip suite covered watches and
watchlist and nothing else; library had never been pushed by the app at all, so its
columns, policy and mapping were unproven. It now round-trips all five with the shapes
that differ — a library row with both optional columns set, a watchlist row with its note
deliberately absent, a watch with no `seriesId`, which is what a film is.

That suite could not be run: it makes and unmakes its own user through the admin API and
this checkout has no service key. Signing up through the public endpoint is not a
substitute — the project rejects disposable addresses and the account could not be cleaned
up afterwards, and **creating an account nobody can delete on a live project to satisfy a
test is not a trade worth making.** So it ships opt-in and unrun, and what could be
checked without credentials was checked instead: `toRemote` skips any field it has no
column for, so a missing entry is not an error anywhere — the value simply never leaves
the device. The mapping is now checked against the migration SQL in both directions.

### 6.26 Nothing on the phone ever synced

The largest finding of the week, and it had been true since the phone app existed.

**Nothing in `mobile/` imported the sync engine.** You could sign in, read "an account
adds sync across devices" on the account screen, and never have one row pushed or pulled.
The same broken promise the notification settings made before §6.12.

The web was barely better. The loop lived in `useSync`, a hook, and a hook runs for as
long as its component is mounted — which was the account panel and the people screen. The
queue drained only while somebody was looking at one of two screens they have no reason to
sit on, and every write in the app happens somewhere else. That is also why three sprints
of sync bugs went unnoticed: the queue they fed was barely being drained.

There is a driver in core now, started once at the root on both platforms, triggered on
sign-in, on a settled write, on foreground, on reconnect and on a timer, with overlapping
reasons coalesced into one round trip. The phone's account screen says how many changes
are waiting rather than implying it is all fine.

One bug shipped in the process and the smoke suite caught it before the commit. The driver
was notified from inside `enqueue`, and every bulk writer queues inside a Dexie
transaction — Dexie binds promises to the transaction's zone, so the listener's read joined
the caller's transaction and hung it, and a GDPR zip import stopped part-way through with
no error at all. It notifies from outside now. **The unit test written for it was thrown
away**, because fake-indexeddb does not reproduce the zone binding and it passed with the
fix removed; a guard that cannot fail is worse than none, and a comment records that the
smoke's import step is what catches it.

### 6.27 Three questions asked systematically, and what each one found

The three sprints after that did not start from a bug report. Each started from a question
about the codebase as a whole, and each found real defects. That is worth recording as a
method and not only as three sets of results.

**"What does core export that nothing calls?"** Sync existed in core and the phone simply
never called it, and the screen advertised it anyway. That is a shape rather than a
one-off, and the parity audit of §6.10 had compared screens rather than wiring. So: every
symbol core exports, against what each app actually imports.

Five things came back. The calendar read a cache only screens ever filled — nothing
refreshed a show you were merely watching, so a season announced after you added it never
appeared, on either platform, and the 90-day TTL did not help because a TTL only applies to
a fetch somebody makes. `db.clearMetadataCache()` emptied the titles table, and the web has
offered it as "Clearing them never touches your own history" since before imported
placeholders started living there — pressing it after a TV Time import erased the name of
every show TMDB has never heard of. The outbox and pull cursor had no owner, so signing out
on a shared device and in as someone else pushed whatever the previous person had not
uploaded into the new account. `deleteComment` had been in core since comments existed and
neither platform offered it. And `shouldNotify` sat in core with a test and no callers
while the edge function restated the same rule by hand.

**"What does the interface claim out loud?"** Two bugs in two sprints had been found by
reading a sentence rather than the code. Both were true when written; neither had anything
holding them true. So: follow every assertion in the user-visible copy to the thing that
makes it true, or find that nothing does.

Three were false. *"Everything, in full, with no account and no upsell. It is yours."* — the
export held the five local tables and nothing else, so lists, follows and every comment
written lived only on the server and were in no export at all. *"Artwork and episode
listings expire automatically."* — nothing expired anything; `isStale` is checked when a row
is read, so a show looked up once and never opened again sat on the device indefinitely,
past the six months TMDB's terms allow. *"Following needs sync configured. Everything else
works without it."* — comments and shared reactions need it too.

Three were true and are now pinned, since the ones that would hurt are the ones nothing was
holding: the export is checked against the schema rather than a hand-written list, so a new
user-data table that is not exported fails; the fingerprint upload's payload keys are
asserted exhaustively, so a field added later has to be looked at; and the catch-up sheet is
rendered with episode names, synopses and air dates in the database and checked to leak
none of them.

**"What columns does the client name?"** The account export and restore added reads and
writes across five tables the client had barely touched, none of it ever run against the
real project. supabase-js does not throw on a bad column — it answers `{ data: null,
error }`, and nearly every read falls back to an empty array, which is right for a network
blip and indistinguishable from "you have no lists". A misspelled column, a renamed table
or a missing policy all produce an export that looks complete and is empty, which is
exactly what the export exists to prevent.

So every `.from(...)` in core is now checked against the migrations: the table exists, every
column named in a select, filter, order or write exists on that table, and every embed names
a foreign key Postgres would really have derived. Then the same question for row-level
security, which fails the same silent way — a secured table with no policy for an operation
is not an error, it is zero rows.

One thing changed in the code because of it. The follows embed was assembled at runtime,
`profiles!follows_${other}_fkey`, and a name built that way cannot be checked by anything.
Both are written out now. The first version of the join scan only looked inside the
`.from` chain, found nothing there, and passed — the worst outcome for a check whose whole
job is those two names.

### 6.28 The export was not complete, so it was made complete

Following the promise audit rather than stopping at it. Lists, the people you follow and
every comment written live on the server, and the file carries them now under `account`,
present only when there is an account to read. The local half never waits on a server and
never fails because one is slow; if the account half cannot be read the file is still
written and both screens say what is missing from it.

Then the other half, because a file with your lists in it and no way to put them back is
half a feature: `restoreAccount` is a second step the import screens offer once the local
half has landed. Three things that would have gone wrong quietly are covered by tests. Run
twice and you would have had two of everything — a restored list is a new row with a new
ID, so the name is the only thing the two copies share. `addToList` sets no rank, so item
order falls back to `added_at`, which reproduces the original order *only* if the inserts
happen in it; doing them concurrently would be faster and would shuffle everybody's lists.
And follows resolve through an exact-handle lookup rather than `searchPeople`, which is a
substring match where "ana" matches "ana", "anastasia" and "banana".

Comments stay unrestored, deliberately. Re-posting them would drop old text into other
people's episode threads with today's timestamps; the file keeps them for the person who
owns them.

### 6.29 The phone could look at screenshots and not post one

The wiring audit's last open finding. `uploadCommentImage` was imported by the web and by
nothing in `mobile/`, so the phone rendered other people's screenshots and had no way to
attach one — the half the research cares about, since screenshots were core to TV Time's
comment culture and the effort filter deliberately exempts a post carrying one.

The reason it had never been done was real rather than an oversight: the function took a
`File` and React Native has none. Its `FormData` takes `{ uri, name, type }` and reads the
bytes off disk itself, so the part and its metadata cannot be derived from each other. Core
takes them separately now.

That shape is the trap, and it is the one thing no browser run can catch: on the web export
the picker hands back a real `File`, so the smoke never takes the branch a phone takes, and
a plain object appended to a browser `FormData` goes out as the string `"[object Object]"`.
The passthrough is asserted at `append` rather than by reading the entry back, because jsdom
stringifies on the way in and there would be nothing left to recognise.

### 6.30 Nobody had ever looked at it

Everything known about this app was known from assertions. Every screen had been queried
for roles, names, target sizes and contrast ratios; not one had been looked at. Those are
different questions, and the difference is the whole of this section: a control can be 24
pixels, correctly named and 4.5:1 against its background while being illegible,
meaningless, or the wrong shape entirely.

Screenshots of every screen, at a phone width and again at twice the text size, examined
rather than asserted on. Four things, none of which any existing check could express.

**The tab bar was a row of Unicode characters**, and what they actually looked like was
nothing like what they were meant to be. `▶` and `⚙` have emoji presentation variants, so
Chromium drew them in full colour — an orange play button and a blue gear — beside five
flat grey glyphs. `❏` for Lists came out as an empty square, which is indistinguishable
from a missing glyph. `▦` for Upcoming was a dense grey block. `◔` for Stats rendered as a
sliver two pixels tall and was, in practice, invisible. They are drawn paths now: the same
everywhere, inheriting `currentColor` so the active tab still tints.

**The tab labels ignored the reader's text setting entirely.** `text-[10px]` is a pixel
size, and the icons beside them were in `em` — so at 200% the icons doubled and the labels
did not. Exactly inverted, and the one piece of text in the app that could not respond to
1.4.4 at all. The check written for it found five more sites nobody had spotted: the poster
placeholder, the calendar's kind badge, a list label, the emoji pad's captions and the
listen-sync notes.

**The first-run hierarchy was backwards.** §6.22 moved the migration to the front of the
app and said searching was the alternative. Visually it was the reverse: "Import from TV
Time" was a muted grey box and "Find something to watch" was the bright accent button. On
both platforms. Both were named, both reachable, both large enough — every property a test
had been aimed at was correct, and the screen said the opposite of what it meant.

**A disabled primary button looked broken rather than disabled.** `bg-accent` with
`disabled:opacity-40` gives a maroon block with dark red lettering. Disabled controls are
exempt from the contrast rules, which is a reason they are allowed to be quiet and not a
reason to make them illegible. Six of them across the app.

Two things are worth recording about the method rather than the results.

The first is that the fix for the labels was wrong once. Letting them scale meant eight
tabs no longer fit a phone at 200%, and the first answer — a horizontally scrolling bar —
satisfies 1.4.4 to the letter while putting half the navigation somewhere nobody knows to
look. **The smoke suite's own 200% check said so**, by finding four tabs off the right-hand
edge. It wraps now, and all eight stay on screen; the content's bottom padding follows the
bar's measured height, because a bar that wraps to three rows cannot be allowed for by a
constant.

The second is that fixing the phone's half of the hierarchy broke its web export outright.
`<Link asChild>` clones its child and merges props, and an array style through that path
reaches the DOM as an index-keyed object, which React refuses to set — the export booted to
a blank page. The phone's smoke suite caught it immediately. Worth saying plainly because
the first suspicion was worse and wrong: that the suite had been passing against a stale
`dist` for several sprints. It had not — exporting the tree without this sprint's changes
gave 101/101, which is how the real cause was found.

What is guarded is the cause, not the appearance — the same trade §6.21 made when it pinned
`min-w-[48px]` rather than trying to assert that a control looked right. No text sized in
pixels; no tab icon that is a character; no filled button disabled by fading. What is not
guarded is everything else in this section, and that is worth being plain about: three of
these four were found by looking, and nothing here means the next one will not be.

 ### 6.31 The same again, with something on the screen

§6.30 looked at the app and found four things. It looked almost entirely at *empty*
screens, which is the easy half: nothing wraps, nothing overflows, no grid has to decide
how many columns it has. `app/smoke.mjs` already drives a populated profile and already
writes screenshots; looking at those was most of this.

**The 200% check was measuring the wrong thing.** It asked whether a control was
*entirely* off screen — `left > innerWidth || right < 0` — and everything actually broken
was half off. A Watched button with its right edge past the viewport is as untappable as
one that is not there, and it looked like a pass. It also only examined buttons and links,
so the country picker on the title page, which is a native `select`, was never looked at.

Tightened to "any part past either edge", and widened to selects and inputs, it named four
screens at once: the Up Next row's Watched and Watch along, the catch-up sheet behind it,
Discover's Track and Add, and Watching Mode's Hold. One cause behind all of them — a row
of controls with `flex-nowrap` and nowhere to go when the text doubles. They wrap now.

Two things it still could not see, both found by looking:

The **country picker escaped its card** rather than the viewport. "United Kingdom" sat
beside a heading that takes three lines at 200%, with `shrink-0` on it, and came out
through the side of the panel — wrong in a way no viewport measurement can express,
because nothing crossed the edge of the screen.

**Watching Mode's header gave up on saying what you were watching.** "The L…" and
"S1E2 · …", from a `truncate` on a nowrap row of Close, title and timecode. Truncation is
content loss, and this is the flagship screen. It wraps, and the title gets two lines
before it gives up.

And the tab bar took three attempts, which is the part worth recording. §6.30 replaced
pixel-sized labels with rem ones; that made eight tabs stop fitting a phone, and the first
answer — scrolling — hid half the navigation. Wrapping fixed 200% and broke the default
size, because a fixed minimum width wraps when there is no need to. What works is neither:
`flex-1` so the eight share the row evenly, no `whitespace-nowrap` so a label may use two
lines inside its own tab, and `break-words` so a single long word can still give. One row
at 58px normally, two rows at 183px at 200%, nothing overflowing at either — measured
rather than eyeballed.

The honest note on that: eight tabs on a 390px phone is too many, and the phone app already
knows it — five, with a More. Fixing the web's navigation properly is a decision about the
product, not a layout bug to fix while passing, so it is written down here rather than done
in a commit about wrapping.

Two things looked wrong and were not, which is worth as much as the four that were. The
emoji pad appeared to be clipped by the search field beneath it; it is a scroll container
meeting its own edge. And the tab bar's translucency looked like a rendering fault at 200%
— it was `bg-ink/95`, and five per cent of a screen's worth of text behind a bar that
covers half the display is legible. That one *was* a defect, and it is opaque now.

### 6.32 Five tabs, which the phone had all along

§6.31 measured the tab bar and left it alone: eight tabs across a phone-width bar wraps
to two rows and takes 183 of 844 pixels once the labels are allowed to respond to the
reader's text setting. How many tabs a product has is a decision about the product rather
than a layout bug to fix while passing a check, so it was written down and not done.

Doing it turned out not to be a decision at all. The phone has had five since it was
built — Up Next, Search, Discover, Watchlist, More — and the web simply never followed.
The web's More screen lists what the phone's does, in the phone's order, minus the two
destinations the web has no route for: Upcoming, Lists, People, Stats, Your data.

Measured rather than assumed, which is the whole reason for the change:

| | rows at 100% | height | rows at 200% | height |
|---|---|---|---|---|
| eight tabs | 1 | 58px | 2 | 183px |
| five tabs | 1 | 58px | **1** | 117px |

Nothing moved URL. `/calendar`, `/lists`, `/people`, `/stats` and `/settings` are where
they were, which is what in-app links, the skip link and anybody's bookmark rely on — only
what the bar offers changed.

The smoke suite needed the same change, and that is the part worth keeping. It reached
five of those screens by clicking their tab, and the honest fix was not to navigate
straight to the address: it takes the route a person takes, through More, in a helper that
says so. A suite that jumps to a URL the navigation no longer offers is testing that the
router still works and nothing else.

### 6.33 A failure that renders as absence

Every screen had been examined happy and empty. None had been examined broken — and this
codebase had already been caught at the same thing twice. §6.23's match-imports screen
went back to offering its button when a run failed, which looks identical to a run that
found nothing to do. §6.27 found that supabase-js answers a bad column with an empty
result, so a broken query and an empty account render the same screen.

That is a pattern rather than two incidents, and the shape is always
`if (error || !data) return []`. Two opposite facts — "there are none" and "we could not
ask" — collapse into one value, and every caller downstream reads the first.

The worst of them was **content warnings**. The screen said *"Nobody has flagged anything
yet"* when the query failed, and somebody avoiding a trigger reads that as an answer. The
whole feature exists so people can avoid things, and its failure mode was to say
confidently that there was nothing to avoid.

The most expensive was **`fetchLists`**, and it is not a presentation bug. `restoreAccount`
reads it to know what is already there, so a failed read looked like an empty account —
and a restore would have made a second copy of every list somebody owns. Doing nothing is
recoverable; that is not. It stops and says why now, and the list index and each list's
contents both distinguish their two empties.

What is left behind is the exemption list, which is the interesting half. A read whose
emptiness a person or a decision depends on has to say which kind of empty it is;
everything else has to have a written reason, and there are five. Two of them say the
read is wrong and unfinished rather than deliberate — `searchPeople`, where a failed
search reads as "no such person", and `findByHandle`, where a failed lookup makes the
restore report a wrong statement about somebody else's account. Naming those is better
than a list that implies every entry was a good decision.

`fetchComments` is worth naming for the opposite reason. It has always distinguished its
two empties — `gated` says whether the server withheld the comments or there were none —
and it is the shape everything else is being brought to. It was written that way from the
start.

### 6.34 Finishing it, and finding two more on the way out

§6.33 left an exemption list with two entries saying, in as many words, that the read was
wrong and unfinished. That is honest and it is debt, so it was paid: `searchPeople` no
longer reads as "no such person" when the search failed, and `findByHandle` no longer
makes `restoreAccount` say "@name could not be found" — a statement about somebody else's
account, and the wrong one to make because a request did not arrive. Removing their
entries from the list is what finishing them looked like, which is the staleness check
earning its place.

Widening the guard past `social/` found two more of the same shape.

**"Nobody has mapped this episode yet"** was said when the timeline fetch failed. Worse
than the usual version of this: it sends somebody off to spend a whole episode recording
a timeline that may already exist. And a corrupt stored payload was treated as an absence
too, when there *is* a timeline and it is unreadable — a different sentence again.

**"Nothing new to suggest yet. Track a few things and come back."** was shown when the
provider was unreachable. Not only the wrong sentence but the wrong instruction: tracking
more will not help. Both Discover screens already had an error slot and had never been
given anything to put in it, because the last-resort fetch swallowed its failure. It
throws now, and only at the point where there is nothing left — a seed that fails earlier
is one of several and the rest still make a suggestion.

The widening itself is the part worth recording. The pattern is not written the same way
everywhere: `social/` checks supabase-js's `error` and returns, and everything else
catches and returns. Extending the glob without extending the pattern would have matched
almost nothing outside `social/` and read as a clean sweep. So the check now asserts, per
directory, that it found something there at all — and it was verified by removing one
exemption and by adding a swallowed failure to `stats/`, which had none.

Most of what widening found is correct and now says why. The metadata cache falling back
to stale data on a network error is the design and is documented as such: offline should
degrade to slightly-old artwork, never to an error. A television that does not answer and
a network with none on it are the same empty list to look at. The keys in that list are
the function the *parser* reports rather than the name a person guessed, because a
hand-written name and a found one drift apart and the list stops describing the code it
claims to — which had already happened to four entries by the time this was checked.

### 6.35 The app had no answer for a failure nobody caught

The sweep of §6.33 and §6.34 covered `core/`. Asking the same question one layer up
started with a check rather than a fix: does either smoke suite even *notice* an
unhandled promise rejection? Playwright's `pageerror` catches uncaught exceptions, and a
rejection is a different event. Fired one at a running build and it does — both suites
would see it, so there was nothing to fix there. Worth the two minutes: the alternative
was rebuilding something that already worked.

What the survey found instead was larger. **There was no error boundary anywhere, on
either platform, and no global rejection handler.** Fifty-odd places start async work
without catching, which is mostly harmless because the core functions they call cannot
reject — but a thrown error in any component unmounted the whole React tree to a blank
page. No message, no navigation, no way back but a reload, on an app whose entire premise
is that your history is safe on this device.

A bus rather than a wrapper at every call site. Wrapping fifty call sites would be a
large diff to make a rare failure visible and would still miss the next one; one place
that hears everything nobody else did is smaller and catches more. The web reports into
it from `unhandledrejection` and `error`, and shows a dismissible banner. The phone uses
expo-router's boundary, exported from the root layout so it covers everything below.

Both were proven against a real build rather than a test double: a screen made to throw
shows the message, the five tabs survive it, and navigating away recovers — the boundary
clears when its children change, because one that latches forever turns a broken screen
into a permanently broken tab. A rejection fired at the running app raises the banner
with its message in it.

The phone half was claimed before it was checked, and checking it found something. Its
boundary sits at the root layout, so it replaces the navigation along with the screen,
where the web's sits inside the tab bar and leaves it standing — which makes "Try again"
the only way out, and a loop with no exit for a screen that throws every time. There is a
way home beside it now. Worth recording as a method note rather than a fix: the claim
went into a commit message a step ahead of the evidence, and going back to get the
evidence is what turned it up.

Two things this does **not** do, said plainly. An unhandled rejection on a device is not
caught: React Native's promise implementation does not surface those the way a browser
does, and the ways to hook it are internal to the runtime and change between versions.
The web export gets them through the same listener the web app uses; a device does not.
**[Corrected in §6.36: that was wrong, and the phone hears them now.]**
And the guard from §6.34 was not extended to `app/src` — the shape there is an unhandled
promise rather than a returned empty, and there is no useful mechanical check for it that
would fail on anything real. Saying so is the same call §6.26 made when it threw away a
test that could not fail.

The wiring check from §6.27 caught the new module before the tests did — `resetFailures`
reached by nothing, and `onFailure` imported by one app and not the other. Both are
explained now rather than quietly exempted: the phone reports *into* the bus and never
reads back out of it, because expo-router hands its boundary the error directly.

### 6.36 Breaking every screen, and a caveat that turned out to be wrong

§6.35's boundaries were each checked on one screen. Doing that to a phone screen is what
found it stranding people, so this did it to all of them — behind a query parameter
(`?break=render`, `?break=effect`) wired at the routing layer of both apps rather than
edited into a screen at a time. It ships, because a harness that only exists while
somebody is testing has to be re-added every time, and the last three things found here
were found by pointing it somewhere nobody had pointed it.

Thirteen web routes, two ways to break, and three findings.

**Watching Mode stranded people on the web too.** It is the one immersive route, so it
hides the tab bar — and the boundary's message said "Try another section below" with
nothing below it. Exactly what the phone did, on the one route that checking two screens
would never have shown. The way home is offered always now, which costs a line on the
twelve that do not need it.

**The failure bus dropped anything reported before somebody subscribed.** A render error
on first load reaches `componentDidCatch` during the commit that renders the fallback,
which is before the banner's effect has registered its listener — so the report went to
an empty set and vanished. The bus keeps the last failure for a late subscriber now, and
the listeners are attached at module load rather than in an effect. That second half
matters more than the first: the phone's root layout renders a spinner until the platform
is bound, so *nothing* of the app is listening during startup, which is precisely when a
binding failure would happen.

**A render error raised two messages saying the same thing** — a full-screen explanation
with a banner on top of it repeating the sentence. The boundary no longer reports into
the bus. That bus drives a way of telling somebody rather than a log, and a failure this
component has already explained does not need telling twice.

And the caveat from §6.35 was wrong. It said an unhandled rejection on a device could not
be caught, because React Native does not surface them like a browser and the hooks are
runtime internals. Breaking a screen in an effect and watching the phone show nothing at
all was worth a second look rather than a note — and React Native bundles `promise`,
whose rejection tracking is that package's own documented interface. React Native's own
`promiseRejectionTrackingOptions` imports the same `enable`. It is what the development
red box already uses. The phone hears them now, and the two platforms behave identically
under both kinds of break: a boundary and a way out for a render error, a banner for one
that escapes an effect.

Written down as a correction rather than quietly fixed, because the caveat had already
gone into the record as a limit of the platform when it was a limit of how hard I looked.

### 6.37 Reading the record back, and checking it

Two sprints running had found something written here was wrong. §6.35 recorded a limit of
React Native that turned out to be a limit of how hard I looked, and a commit said both
error boundaries were proven against a real build when one of them had not been. So this
is §6.27's question — what does this claim out loud — pointed at the record instead of
the app's copy.

Seven checkable, load-bearing claims, run rather than reasoned about. All seven held.

- **"Fifty-odd places start async work without catching"** (§6.35). Fifty-three, by the
  same grep that produced the original number. A looser one says seventy, which is worth
  noting only because a re-count with a different query is not a check.
- **"The phone's comments screen reaches its sealed state in the smoke, so the composer
  has never rendered there"** (§6.29). The suite mentions the sealed state once and the
  attach control not at all.
- **"Text on the phone export renders at a fixed size whatever is asked of it"** (§6.21).
  The one worth the most, because it is a platform limit that excuses a missing
  accessibility test — the same shape as the caveat §6.36 had to correct. Measured: a
  heading is 30px with the root font at 16px and 30px with it at 32px. React Native's
  styles compile to a class with a pixel value, and nothing reaches them.
- **"A plain object appended to a browser FormData goes out as the string
  `[object Object]`"** (§6.29). It does, exactly.
- **"The extension's site selectors have never met a real streaming site"** (§7). They are
  still there to have not met one — `adapters.ts` and `content.ts` both still query the
  document.
- **"The live suites need a service key this checkout has none of"** (§7), and **"the
  deploy needs a Vercel token that is not in this container"**. Neither is in `.env`, and
  `npm run whats-live` reports the site still serving an older bundle.

One claim in §6.17 was **not** checked and should not be read as though it were: that iOS
has no public API for acting as a Bluetooth HID peripheral, which is the reason the remote
works over Wi-Fi. It is a statement about Apple's platform that cannot be settled from
inside this container, and it is load-bearing for a whole subsystem's design. Named here
so the next person knows which of these is reasoning and which is measurement.

Nothing needed correcting, which is a different result from the last two sprints and is
worth recording as such rather than turning into a finding. What the exercise is for is
the ratio: seven checks, seven held, one honestly unverifiable — and the two that failed
last time were both found the same way, by running the thing rather than re-reading it.

### 6.38 The phone at twice the text size, for the first time

§6.37 verified §6.21's claim that the phone export ignores the browser's text setting, and
verifying it is what made the gap obvious: a true statement had been standing in for a
test since §6.21. WCAG 1.4.4 applies to the phone as much as the web, the web's version of
this check found the rating pushed off the right-hand edge and a 48px minimum written in
rem — and the phone had never been rendered large at all.

Three routes, and the first two are dead for reasons worth writing down. React Native
scales text through `PixelRatio.getFontScale()`; react-native-web reads that from
`Dimensions`, which **hardcodes `fontScale: 1`**, and nothing in `Text` or `StyleSheet`
consumes it anyway. So it cannot be driven from the page. Shrinking the viewport instead
approximates the stress but over-states it: on the phone the poster and the padding are
pixels too, so halving the viewport doubles their relative size along with the type, which
raising the text setting does not do.

The third works and is closer to the real thing than either: read every element's computed
font size and double it inline, leaving every other pixel value alone. That is exactly
what a device does when somebody raises the text size — the type grows, the poster does
not — and it is the property 1.4.4 actually asks about. A companion check counts how many
elements were scaled, because a pass on a screen where nothing grew proves nothing.

Seven screens, and it found two things on the first run.

**Watching Mode's transport row was 690 pixels wide in a 390 viewport**, with all three
density chips off the edge. The web's copy of that row was fixed the same way in §6.31 and
the phone kept it, because nothing had ever rendered the phone large.

**The closed remote drawer could be scrolled to.** It is 300 wide, absolute, parked at
`translateX(300)` while shut — and nothing clipped it, so the page measured 690 and could
be dragged sideways to reveal a drawer that is supposed to be closed. True at any text
size; the 200% check is simply what looked. Finding it took following the number rather
than the failing control: no element was past the edge, so the overflow had to be
something positioned outside on purpose.

Both fixed, both verified by putting the fault back and watching the check go red. And the
drawer's own contents are now scaled too — clipping the page hides them from the page
measurement, which would have left the thing behind the clip untested.

### 6.39 Looking for the rest of the ghosts, and finding none

§6.38's parked drawer was worth treating as a pattern rather than a one-off, because the
phone has several things positioned off-screen on purpose and each is fine while clipped
and a scrollable ghost while not.

The first attempt found nothing, and the reason is the useful part. A probe over cold URLs
— every screen on both platforms, both axes — came back clean everywhere. The fault needs
the overlay *mounted and closed*, and on a cold load the drawer does not render at all.
A check that cannot reach the state the bug lives in is a check that passes.

So it went into both suites instead, at every point they already audit a screen: twelve
screens on the phone, ten on the web, in whatever state the suite has walked itself into.
That is where the drawer showed. Everything passes — the phone because §6.38 fixed the one
it had, the web because it genuinely has none, which is now measured rather than reasoned
from `inert` and a couple of overflow containers.

The guard was proved by putting the drawer's fault back: 690x844 in 390x844, red on the
screen that had it and nowhere else.

One thing checked rather than assumed, because the phrasing would have implied cover it
might not have: the vertical half. An element parked at `top: 2000px` inside the app's own
scroll container takes `documentElement.scrollHeight` from 844 to 2300 — an absolutely
positioned thing resolves against the nearest *positioned* ancestor, and the scroll
container is not one, so it escapes to the document exactly as the drawer escaped
sideways. The check sees it. Had it not, "both axes" would have been a sentence doing more
work than the code behind it.

### 6.40 The states nothing had ever rendered

§6.39's lesson — a check that cannot reach the state a bug lives in is a check that
passes — is only useful if somebody asks which states are reachable. So: every screen on
both platforms, every visibly different branch it has, and which of them anything had
ever produced. Not to reach them all. To have the list.

The list is checked in, at `app/src/wiring/screenStates.ts`, with three verdicts per
state — driven by a suite, covered only by a unit test, or never rendered by anything,
with the reason beside it. Its guard does the part that rots: every route the two routers
actually have must appear, and no entry may name a route that has been deleted, so adding
a screen and forgetting to say what has looked at it is a failing test rather than a
silence. What it deliberately does not do is check that "the catch-up sheet, open" really
is driven every run; nothing mechanical can, which is why the reasons are required
instead of optional.

Five things fell out of writing it.

**The app's build had been failing for eleven commits, and the record said otherwise.**
`app/src/wiring/coreWiring.ts` reads the repository off disk and out of git, so it imports
`node:fs` and `node:child_process`; it does not end in `.test.ts`, so `tsconfig.app.json`
compiled it as shipped source with no Node types. `npm run build` has exited 2 since §6.27
introduced it, sixteen commits ago, and every sprint since has signed off with the build
among the things reported green. The tempting explanation — that an incremental `tsc -b`
skipped the file — is wrong: running it twice with nothing touched reports the error both
times. The account that survives checking is that the build was reported clean without
being run, and nothing in this repository would have said otherwise, because nothing runs
it but a person deciding to. The exclusion is now keyed on the directory rather than the
filename, because the filename is what misled.

The second half of that fix is `npm run verify`, which runs both core configurations, all
five workspaces' tests, the app's build, the phone's typecheck and the linter in one
command that exits non-zero. §6.15 made deploying one command for the same reason: a
procedure somebody has to remember is a procedure that eventually is not followed, and the
evidence that it was not is a build nobody ran for sixteen commits.

**An unknown URL rendered a blank page — and the web's own suite was reading it.** There
was no catch-all route, so `<Routes>` matched nothing: tab bar, skip link, empty `<main>`,
no message. Nothing had ever loaded an address the app does not have. The suite had,
though, without noticing: to decide whether the build carried Supabase credentials it
asked for `/account` — a route the phone has and the web does not — and an empty body does
not contain "not configured on this build", so the answer was "configured", every run,
unconditionally. Three checks branch on that answer. This checkout has a root `.env`, so
the right branch happened to be taken; on a credential-free build all three would have
asserted the wrong half and failed a correct app, which is exactly what the comment above
that probe says it exists to prevent. Both halves are fixed — a real not-found screen with
two ways out, and a probe that now asserts it is reading the account panel before
believing what it reads. Proved by pointing it back at `/account`: it fails.

**Two controls had never been measured, because nothing had ever stopped on their
screens.** The conversation's Back was 31x20, under the 24px floor of WCAG 2.5.8, since
the screen shipped — the suite arrived at `/comments/…`, read the URL to confirm marking
watched had opened it, and left. The phone's only `Switch` measured 40x20; whether the
native control clears 24 on a device cannot be checked from here, so rather than argue
about it the whole settings row became the control, which is what the platform does anyway
and leaves one thing in the reading order instead of a label and an unlabelled switch.

**A developer route was in the production export.** `/_sitemap`, which expo-router adds,
listing every screen by source filename plus a build-information panel, at a public URL.
Off in `app.json`, and asserted.

**Empty states, for the first time.** Three screens on each platform had never been
rendered while the database held nothing — the suites track a show early and never look
back. That is the entire screen for somebody who has just arrived, which is who this
product is for. Both suites now do it in the one moment they can.

What the list says is not covered is the more useful half, and most of it has one cause:
nothing here can be signed in. Comments by other people, a list with items in it, a
profile being edited, following and blocking, the phone's composer and its attach control
— all of them need a session, and this checkout has no service key to make and unmake a
test user with. That was already in §7 as one line about the live suites; it is now
enumerated state by state, so the next person can tell the difference between a feature
that works and a feature nothing has ever looked at.

The suites went from 124 to 166 checks on the web and 129 to 153 on the phone. Every new
one was proved non-vacuous by breaking what it watches: reverting the catch-all route
turns the not-found checks red and reports 6 controls, which is the tab bar and the skip
link — the blank page, measured.

### 6.41 What else was reported green that nothing ran

§6.40's build had been broken for sixteen commits, and the reason was not the tsconfig —
it was that nothing ran the build except a person deciding to. So the same question,
asked of the whole verification surface: which checks exist in this repository, and which
of them does no routine execute? Enumerated from disk rather than memory.

**Three directories were outside every routine.** `scripts/`, `supabase/functions/` and
`extension/` were not workspaces, so `npm run test --workspaces` had never seen them, and
none had a typecheck of its own.

**The extension had never been typechecked, and the first attempt found something.** Its
build is esbuild with `bundle: true`, which strips types without reading them, so no
compiler had ever looked at the directory. `options.ts` has no import or export, so
TypeScript reads it as a global script — and its `const status = document.getElementById(
'status')` is then a redeclaration of `window.status`, with `status.textContent` a
property access on a string. The runtime was never wrong: esbuild emits each entry as
ESM, so the name is the module's own. The right fix is therefore `moduleDetection: force`,
which makes the typechecker model what the bundler actually does, and it clears the error
on its own — which is also the evidence for that diagnosis rather than a guess at it. The
extension is now a workspace with `tsc --noEmit`, and both its typecheck and its build are
in `verify`.

**Thirty-four skipped tests, and nothing anywhere said which.** A core run reports "639
passed | 34 skipped" every sprint. Thirty-four could be nine live suites waiting on
credentials or eight of them plus somebody's `it.skip` from a debugging session, and the
total reads the same either way. `core/src/data/skips.test.ts` now names all nine, each
with the environment variable it needs and one line on what it covers that nothing else
can; a skip outside the list fails, and so does an entry naming a variable nothing reads.
That last check earned itself immediately: the first draft said `TMDB_TOKEN` and the
variable is `VITE_TMDB_TOKEN`, arriving through `setConfig` in the test setup rather than
being read in the suite at all.

**The edge functions and the deploy scripts are read by nothing.** There is no Deno in
this container, so `supabase/functions/` cannot be typechecked here and that stays in §7.
What can be checked is what actually breaks them. They parse — through TypeScript's own
parser, not a compiler that would fail on `jsr:` specifiers for the wrong reason — and
every relative import they make into `core/` still resolves. That second one is the point:
the functions reach into core by relative path deliberately, so that a server and a client
cannot come to disagree about what a fingerprint means, and the price of that decision is
that moving a file in core breaks a deployment nobody will run for weeks. Nothing else in
this repository would have noticed. Proved by pointing one at `wireX.ts`: it fails, naming
the function and the import.

**Two typechecks existed and were never invoked, and one did not exist at all.** `relay`
and `bridge` each had a `typecheck` script no command called; `core` — the package both
apps are built on — had none. All three pass, which is the boring outcome and still worth
knowing rather than assuming. `verify` now runs typechecks across every workspace, both
builds, both core database configurations, every workspace's tests and the linter.

**And the smoke suites had no single command.** The phone had one; the web had none at
all, so its suite was a build, a preview server and a node invocation somebody remembered
in that order. `npm run smoke` runs both.

The shape across §6.40 and §6.41 is the same one, twice: work that is only performed when
somebody remembers to perform it is work that eventually is not performed, and the record
of it says green either way. The answer both times was a command that exits non-zero.

### 6.42 The extension, run for the first time

§6.41 made the extension a workspace and typechecked it. Typechecking a directory is not
reading it, and none of `content.ts`, `background.ts` or `inject.ts` had ever been
executed by anything — only the pure functions in `parse.ts` and `adapters.ts` were
covered, from the app package.

It runs now. `extension/smoke.mjs` loads the built extension into the pinned Chromium and
drives it: a fixture player page served on `https://www.netflix.com`, so the manifest's
own match patterns decide whether the content script runs rather than the test injecting
it by hand, and a real `<video>` — a generated WAV of silence, three and a half minutes
of it, because `findVideo` requires a finite duration over 120 seconds and a property
defined on the page's wrapper is invisible to a content script's isolated world anyway.
Twenty checks, following one reading from the DOM through the service worker to the app
page.

**Automatic scrobbling had never worked, and could not have.** The extension has computed
`isWatched` since it shipped and POSTed the result to a URL configured on an options page:
`https://your-reviewies-instance/api/playback`. No Reviewies instance serves that path.
The app is a static site, and on the deployed origin the SPA rewrite in `vercel.json`
answers `/(.*)` with `index.html` — so the POST returned 200, the `fetch` resolved, and
nothing was recorded. Not a 404, not an error, not a swallowed exception: a success. The
README called it "the only thing in the product that marks an episode watched without
anybody tapping anything", and `WatchEvent['source']` has had `'extension'` in its union
since the data model was written with nothing anywhere writing it.

It works now, over the channel that already worked. The watch travels on the same
`postMessage` as the position, and `core/src/watching/scrobble.ts` decides what to do
with it — deliberately unwilling, because a scrobble is a show *name* scraped off a
streaming page and marking the wrong episode watched silently corrupts the history this
product exists to protect:

- only titles already in the library are considered. Nothing is added and nothing is
  looked up: a page title must not be able to start tracking something on your behalf.
- the name has to match closely *and* beat the runner-up clearly. Two similar names is
  exactly when a confident wrong answer costs most, so it is declined instead.
- an episode already watched is left alone, so a heartbeat arriving twice is not a
  rewatch.

The web suite proved the app is actually listening, which is the §6.26 question and not
the same as the rules being right: a scrobble took Up Next from 16 remaining to 15, and a
show nobody tracks changed nothing. The catch-up section then had to move from "Marked 11
episodes" to "Marked 10" — which is not an adjustment to make a test pass but the
evidence that catching up skipped the scrobbled episode instead of re-marking it.

**The staleness guard was defeated by the extension itself.** The app ignores readings
older than fifteen seconds so a crashed extension cannot freeze the clock at its last
known position. `inject.ts` polled the worker every second and stamped `at: Date.now()`
on whatever it got back — so a stored reading never aged, and a stream that had stopped
looked exactly like a paused one still being observed. Closing the streaming tab left
Watching Mode following a dead position indefinitely. It forwards the worker's own
`updatedAt` now. Proved by putting the bug back: the timestamps start advancing again and
two checks go red.

**Two things that were describing a product nobody had.** `alarms` was in the manifest and
no code has ever called `chrome.alarms` — measured off the running extension rather than
read off the file, so what is asserted is what Chrome granted. And `background.ts` had an
`onMessageExternal` listener for the app to call directly; a page can only message an
extension that names its origin under `externally_connectable`, which this manifest has
never had, so that listener could not fire. The app's own bridge documented it as one of
two supported paths and implemented the other one. Both are gone, along with the options
page whose only field configured the endpoint that did not exist.

Two things about the harness worth writing down, because each looks exactly like a bug in
the extension. `route.fulfill` answers with a plain 200 and no `Accept-Ranges`, so
Chromium reports the media as unseekable and `currentTime = 190` is silently refused —
the route handler answers range requests itself now. Serving the media from a local HTTP
server instead does not work either: the page is https and the server is not, so it is
blocked as mixed content.

What this still does not prove is the selectors. The fixture was written from the same
assumptions as the adapter, so a passing run says the two agree with each other, which is
not evidence that either is right about Netflix. That stays in §7 where it was.

---

## 7. What is still not known

Unchanged from §6 and worth restating in one place, because the list has not shortened.
Every item below was checked rather than carried forward — see §6.37 for what that meant
and which single claim in this document could not be checked at all:

- **Nothing has run on a physical device.** The phone's smoke suite drives the
  react-native-web export, which is a real build and not a real phone. Its 200% text
  check (§6.38) doubles every computed font size rather than using the system setting,
  which is the same property and not the same mechanism. `getExpoPushTokenAsync`
  has never executed. The image picker's native branch has never run — the web export takes
  the other one. The phone's comments screen reaches its sealed state in the smoke, so the
  composer and its new attach control have never rendered there. Its unmatched-route
  screen is reached in the suite by its own address rather than by asking for a wrong one,
  because the static server answers an unknown path before the app boots; that expo-router
  routes to it on a device is the framework's business and is not under test here.
- **The fingerprinter has never heard real audio through a real microphone.**
- **The Roku and MPRIS adapters have never spoken to hardware.**
- **The extension's site selectors have never met a real streaming site.** §6.42 runs the
  whole extension in a real browser against a fixture player page, which is the first time
  any of `content.ts`, `background.ts` or `inject.ts` has executed — but that fixture was
  written from the same assumptions as `adapters.ts`, so it shows the two agree with each
  other and nothing about whether either is right. Netflix, Prime Video, Disney+, Max,
  Crunchyroll and YouTube have never been opened. The fallback to the page title, which is
  what makes a stale selector cost precision rather than function, is likewise only
  exercised against a fixture.
- **The edge functions have never been typechecked.** They are Deno, and there is no Deno
  in this container. `app/src/wiring/runnable.test.ts` checks the two things that actually
  break them — that they parse, and that their relative imports into `core/` still exist —
  and `backendQueries.test.ts` covers what the migrations promise. Their behaviour has been
  exercised live only through the deployments recorded in §6.8 and §6.20.
- **The deploy scripts have never been run in this container** beyond `whats-live`.
  `deploy-web.mjs` needs a Vercel token; `apply-migrations.mjs` and `deploy-functions.mjs`
  need a Supabase one. All five parse, which is all that can be established without
  credentials.
- **Nothing has ever been signed in, on either platform.** The live Supabase suites —
  `supabase.live.test.ts` and `account.live.test.ts` — both need a service key to make and
  unmake their own user, and this checkout has none. What that costs is no longer one line:
  §6.40's inventory at `app/src/wiring/screenStates.ts` names every screen state that needs
  a session and has therefore never rendered — other people's comments, a list with items
  in it, a profile being edited, following and blocking, the phone's comment composer. What
  could be established by reading the migrations has been, and is recorded in
  `backendQueries.test.ts` rather than left to be worked out again.
- **The deployed site is behind.** `npm run deploy:web` needs a Vercel token that is not in
  this container, so everything since §6.14 is in the repository and not on the web.

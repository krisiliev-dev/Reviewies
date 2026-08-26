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

### 6.43 The remote had never connected

§6.42's extension POSTed watches to a path nothing serves and got a 200 back, because the
SPA rewrite answers everything. That is a distinct failure from the ones before it — not a
swallowed exception, not an unreached state, but a delivery into nothing that reports
success. So: every outbound call in the product, and for each, what proves the far end
received it rather than that the call returned.

Most of them came back clean, and some of them are careful in ways worth noticing. The
AniList client reads the GraphQL `errors` array, which is the classic 200-with-a-body-full-
of-failure. `lookupAnimeIds` documents that ARM answers a miss with 200 and a literal
`null`. Roku discovery checks the XML actually contains `<device-info>` rather than
trusting a 200 from whatever answered on port 8060. The comment upload asserts a URL comes
back rather than that the invoke resolved. The push sender reads Expo's tickets. Nothing
else in the product points at a path under the app's own origin now that the extension's
POST is gone, which was the specific question the rewrite raised.

**But the remote control had never connected at all.** Not "sent into nothing" — refused,
every time, before a byte moved.

The relay identifies a connection entirely from its query string: `role` says which half
of the pair you are, `token` says which pair. Anything without both is closed with 1008.
The app opened `new WebSocket(VITE_BRIDGE_RELAY)` — a bare address — and then sent a
`hello` message carrying the token. The bridge opened `new WebSocket(REVIEWIES_RELAY)` and
sent a `welcome`. Neither message was ever read by anything, because the socket was already
shut.

Three documents each described a different URL. The relay's README had the query form. The
bridge's README and its own header comment said `wss://your-relay/bridge` — a path, which
the parser does not look at. The deployment table said "Your relay, if you run one". And
the one thing none of them could describe is that the two halves need *different* URLs,
because the role differs, so a single environment variable on each side cannot be the whole
address.

Measured rather than reasoned: the relay was started and dialled three ways.

```
app, as the app dials today (bare URL):   closed 1008 role must be app or bridge
bridge, as its README says (/bridge):     closed 1008 role must be app or bridge
with the query the relay documents:       open, still open after 500ms
```

Why nothing knew: `relay/src/relay.test.ts` covers the pairing class, and covers the URL
parser, and both are correct. Nineteen tests, none of which dials a server. It is §6.27's
shape exactly — each side individually right, and the join between them never made.

Fixed at the only place that knows both the address and its own role: `relayConnectionUrl`
in the core, used by the app and the bridge. `relay/src/pairing.test.ts` now stands up the
real server and pairs two real clients — a bare URL is refused, a built one is accepted, a
command crosses from app to bridge, a sender with nobody on the other side is told so, and
two different tokens do not pair. Beside it, a cheap source guard: every `new WebSocket` in
the product goes through the helper or explains itself, and the exemption list is empty on
purpose.

**And the reason was there the whole time.** A refused connection closes with 1008 *and a
reason*, and both clients threw it away — the app set "disconnected" and retried every few
seconds forever, the bridge printed the same sentence to a console nobody was reading. Both
say why now, for any close that is not an ordinary one. Two consequences of the same habit:
the information needed to fix this was travelling on every failed attempt for as long as the
feature has existed.

One smaller thing in the same family, found on the way past: `mobile/src/platform.ts` read
`vapidPublicKey`, `bridgeRelay` and `bridgeToken` out of the Expo manifest. `extra` in
`app.json` has never contained any of the three, and nothing on the phone consumes them —
web push is a browser mechanism and this app uses Expo's, and the phone reaches a television
directly, which is what §1.1 was about. Three keys read from a place they can never arrive.

### 6.44 The bridge had never started

§6.43 got a message across the relay. The next hop had never been taken: no command this
product has sent has ever reached a device, and §7 has said since they were written that
the Roku and MPRIS adapters have never spoken to hardware.

There is no Roku here, but a Roku's External Control Protocol is why it is the first
adapter rather than the third — plain HTTP on port 8060, no authentication, no pairing. So
a fake is a small server answering `/query/device-info`, `/query/media-player` and
`/keypress/*`, recording what it was asked for. Discovery turned out to be real too, which
was not obvious: the bridge sends an SSDP M-SEARCH to 239.255.255.250, multicast loops back
inside this container, and a responder here answers it. That makes every box in the chain
real but the last one.

**The bridge could not start.** `node src/index.ts` — the command in its own README — died
on the first import:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/home/user/Reviewies/bridge/src/mpris'
```

Node's ESM resolver does not guess extensions. `import { MprisAdapter } from './mpris'` is
an error, not a hint. Fixing those three imports moved the failure one layer down into
`core/src/devices/roku.ts` importing `'./types'` — and core is written extensionless
throughout, 277 specifiers across 102 files, because Vite, Metro and Vitest all resolve
that form. The bridge's 24 unit tests pass and always did, because Vitest resolves what
Node will not.

Two consumers were paying for it. The bridge could not run at all. And `supabase/functions/
deno.json` carries an unstable `sloppy-imports` flag whose stated reason is exactly this —
"lets Deno follow the extensionless relative imports inside @reviewies/core".

So core spells them out now, mechanically, and `mobile` and `bridge` gained
`allowImportingTsExtensions` to match what `app`, `core` and `relay` already had. Package
specifiers are untouched: `@reviewies/core/devices/roku` goes through the exports map,
which resolves to a file, and adding an extension there produces `roku.ts.ts`. The Deno
flag is left in place with a note, because there is no Deno in this container to prove it
redundant with and finding out by breaking a deploy is not a plan.

**Then the chain ran, and it works.** Twenty-one checks in `bridge/e2e.mjs`: the app
reaches the bridge through the relay, the bridge answers the handshake, discovery finds the
fake by asking the network and describes it in the shape the drawer's `RemoteDevice`
declares, a pause pressed by the app arrives at the device as `POST /keypress/Play` — which
is the ECP key the adapter documents, because ECP has no separate pause and Play toggles —
position polling reports 754 of 2700 seconds with the title and the app it is playing in,
the position follows when the device moves, unsubscribing stops the polling, and a command
for a device that is not there comes back as `no-device` rather than vanishing.

The one specifically hunted for came back clean: a device that stops answering is reported
as `playbackEnded` rather than leaving the drawer following a position that has stopped
moving. That is §6.42's staleness bug in a different costume, and here the poll already
does the right thing — the adapter returns `undefined` when the device goes away and the
bridge says so.

Two harness notes worth keeping, because each looked like a product bug. The bridge retries
every five seconds, so spawning it before the relay is listening produces a five-second
hole that is indistinguishable from a bridge that cannot connect — the suite now waits for
each process to say it is up rather than sleeping. And the fake video's bytes are served
with range support by hand for the same class of reason as §6.42's.

**MPRIS, as far as it goes.** `gdbus`, `busctl` and `dbus-daemon` are all present here, so
the suite starts a session bus with `dbus-run-session` and runs itself inside it. What that
proves is the half nothing had touched: the `gdbus` command line the transport builds is
accepted by a real `gdbus` against a real bus, and its output parses — an empty bus comes
back as no players rather than as a throw. Registering an actual MPRIS player needs a D-Bus
binding, and there is none installable here, so no media player has ever been driven. That
stays in §7 rather than letting the Roku result stand in for it.

### 6.45 Starting everything

Three sprints in a row found a whole component nobody had ever executed — the extension
(§6.42), the relay connection (§6.43), the bridge (§6.44) — and every time the unit tests
were correct. So the question stopped being "is it tested" and became "has it ever been
started". Every entry point in the repository, enumerated from disk and run.

Most of it was boring, which is the outcome to hope for. `npm run dev` serves and
transforms. `expo start --web` bundles 1,140 modules and answers 200. `npm start` works in
the relay and, since §6.44, in the bridge. The extension builds. `build-emoji-index.mjs`
regenerates `core/src/watching/emojiIndex.ts` byte for byte identical to what is committed,
which is the useful thing to know about a generated file nobody has regenerated in weeks.
All four suites pass.

**What was wrong was the documentation, in exactly the §6.44 shape.** Not one command in
five READMEs works where the reader is standing:

- the root README's testing block says `cd app && npm run build`, and then eight lines
  later `cd mobile` — which, run as written, fails, because the shell is inside `app`.
- `mobile/README.md` runs `npm run export:web` and `node smoke.mjs` with no `cd mobile` at
  all, so from the root the first is an unknown script and the second an unknown file.
- `supabase/README.md` invokes `node ../scripts/apply-migrations.mjs` three times, which
  only resolves from inside `supabase/`, and never says to go there.
- `relay/README.md` and `bridge/README.md` both document `npm run typecheck` in a block
  with no `cd`. At the root there is no such script.

None of these is interesting on its own. What is interesting is that a repository whose
tests check the accessible name of every control on every screen had nothing at all
checking whether its own instructions name a file that exists — and §6.44 was precisely a
documented command that could not run. So `app/src/wiring/commands.test.ts` reads every
fenced block in every README and doc, tracks the directory the block has walked itself
into, and asserts that every `node <path>` names a file that is there, every `npm run
<script>` names a script that workspace actually has, and every `--workspace <name>` names
a workspace that exists. It does not run anything — running them was this sprint — but it
holds the cheap half that rots on its own.

**A correction, before it went into the record.** The first measurement of the four scripts
under `scripts/` said all of them exit 0 when refusing for want of credentials, which would
have made `npm run deploy:web && …` report success having deployed nothing. That was wrong:
`PIPESTATUS` was read inside a subshell and reported the wrong process. Measured properly
they exit 2, 1, 2, 2, and `whats-live`'s documented promise — "exits non-zero when anything
is behind, so it can gate a release" — holds, which is how it reported the deployed site as
stale. All four also refuse with a sentence naming the variable they want rather than a
stack trace. Worth writing down because the false version was exactly the sort of finding
this week has been full of, and acting on it would have meant "fixing" four scripts that
were already right.

**And one thing that is now smaller than it was.** The bridge had no `start` script,
although its README documented `node src/index.ts` — which is the command §6.44 found could
not run at all. It has one now, and refusing without `REVIEWIES_RELAY` prints one line and
exits 2.

### 6.46 Following the README as a stranger

§6.45 checked that every documented command names a file that exists, and ran those
commands in a container where everything was installed, built and warm. That is not what a
person does. A person clones the repository and reads the README from the top.

So: `git clone` into a scratch directory, and follow it literally, typing only what is
written.

Most of it held. `npm install` at the root is genuinely enough — 1,010 packages, 52
seconds, and every workspace works afterwards including the extension, which only became
one in §6.41. `npm run dev --workspace app` serves. The app boots with **no `.env` at all**
and no page errors, opening on the migration screen rather than a sign-up, and the account
panel names the two variables it would want rather than saying "error". `npm test` passes.
`npm run build` builds. `cd extension && npm install && npm run build` works from a fresh
clone.

Four things did not.

**The smoke suites cannot be run by anyone outside this container.** All three browser
suites hardcoded `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, the pinned build
this environment ships. Anywhere else the run dies with an uncaught
`browserType.launch: Failed to launch chromium because executable doesn't exist at
/opt/pw-browsers/…` — a directory the reader has never heard of, from a command the README
hands them without warning. `scripts/browser.mjs` now uses the pinned build when it is
actually there and otherwise says nothing, letting Playwright resolve the browser it
downloaded, whose own error message is the useful one. An explicitly set `CHROMIUM_PATH`
that does not exist is refused by name instead, because silently ignoring what somebody
asked for is worse than failing. The README gained `npx playwright install chromium`.

**The root README's server commands do not pin their ports.** `npx serve dist &` with no
`-p 4200` serves on 3000 while the phone suite dials 4200; `npx vite preview &` picks a free
port if 4173 is taken and the web suite dials 4173 regardless. `mobile/README.md` had the
port and the root did not — the two had drifted apart, and following the root one produces
a connection error rather than a failing check. Both are pinned now, and `npm run smoke`
is offered first as the command that does the whole thing.

**`extension/smoke.mjs` imports `playwright` and the extension declared no such
dependency.** It works here because npm hoists the app's copy to the root, which is a
coincidence of layout rather than a fact anybody can rely on.

**`app/README.md` was Vite's scaffold.** Untouched: "This template provides a minimal
setup…", the React Compiler paragraph, the boilerplate advice about editing an
`.oxlintrc.json` that this repository has already configured. Every other README here is
written for this project. A stranger opening the one for the web app — the largest package
in the repository — learned about `@vitejs/plugin-react-swc`. It says what `app/` is now,
including what `src/wiring/` is for, since that directory is the least self-explanatory
thing in the tree and exists entirely because of the last ten sprints.

**One number worth knowing.** A clean clone reports `644 passed | 48 skipped` in core where
this checkout reports `658 passed | 34 skipped`. Nothing is wrong: the difference is the
root `.env`, whose TMDB token lets `tmdb.live.test.ts` and `anime.live.test.ts` run. The
counts quoted in these notes are a credentialed checkout's. Somebody cloning this should
expect fourteen fewer, and §6.41's `skips.test.ts` names every suite that can make that
difference.

### 6.47 Using it, and finding it had never used TMDB

Ten sprints of structural questions, and the last three found documentation and
configuration. So this one stopped auditing and used the app: arrive with a TV Time
export, import it, resolve what did not match, watch with Watching Mode running, react,
step away, come back, catch up, rate something, look at Stats.

The findings are a prioritised list in [doc 10](10-an-evening-with-it.md), written as a
judgement about the product rather than a record of what was easy to fix. Two are fixed
here. What follows is the one that matters most, because it is a lesson about the tests as
much as the code.

**The web app has never used TMDB.** `core/src/metadata/index.ts` had

```ts
export const provider = createProvider();   // module scope
```

and `createProvider` reads `getConfig().tmdbToken`. ES modules evaluate every import
before the first statement of the importing module runs, so `main.tsx`'s
`import App from './App.tsx'` reached this file — and resolved the provider — before
`bindWebPlatform()` on the line below had bound anything. The comment above that call said
"Before anything renders", which is true of rendering and irrelevant to module evaluation.
The app ran on the four-show fixture catalogue for its entire life, whatever
`VITE_TMDB_TOKEN` held.

What makes it worth a section rather than a line is why nothing caught it. Every test that
searches searches for a fixture: the browser suite looks for *The Long Dark* and *Quiet
Harbour*, which are fixture names, and the live TMDB suites run in Node where the setup
binds the config before anything asks. A hundred and sixty-eight browser checks passed
against a catalogue of four shows, and would have passed identically if TMDB had never
existed. §6.40's inventory asked which *states* nothing rendered; it did not think to ask
which *data* nothing had ever seen.

`getProvider()` is lazy now, and `app/src/wiring/injection.test.ts` fails any core module
that reads injected config while it is being evaluated — including one call away, which is
the shape this had. Proved by putting the shape back: it names the line and the function.

The suite's fixture assumption is now arranged rather than accidental: `npm run smoke`
builds the app with no token, because that suite asserts on eighteen episodes of a show
TMDB does not have.

**And the clock forgot where you were.** Leaving Watching Mode for a moment came back to
0:00 and *Start watching* — the position lived in React state and nowhere else. For a
second-screen app, stepping away is the case rather than an edge case. `core/src/watching/
resume.ts` keeps it per episode, and restores a clock that was running *advanced by the
time that passed*, because the episode did not stop when you looked away. The suite checks
the advance rather than the number: 0:06 out, 0:09 back, and a Resume button where a Start
was.

One consequence worth recording. With the provider fixed, a credentialed build genuinely
calls TMDB — and Chromium in this container has no route to it, with or without the agent
proxy, while Node does. So the browser suites can only be run against a credential-free
build from here, and real-world search, matching and where-to-watch quality could not be
judged in the app at all. That is in §7 rather than glossed.

### 6.48 Four of doc 10, in the order that mattered

§6.47 fixed the two worst things the evening found. These are the next four, taken in the
order the list gives — what would make somebody stop using it, rather than what was easy.

**The import no longer hands you a chore.** After importing years of TV Time history the
app said *"Nothing here yet. 4 shows came from an import and have no episode lists until
they are matched"* and gave you a button. An empty screen and a task, at the single most
important moment in the product. Matching now follows the import without being asked —
once per session, because Up Next mounts the panel on every visit and matching is a
request per show — and the screen says what is happening rather than what is missing:
*"Bringing in 4 shows from your import. Episodes appear as each one is found."*

The panel shown immediately after an import deliberately does *not* auto-start: it has
just finished explaining what matching is for, and starting underneath that explanation
would be talking over itself.

**And an ask with nothing to choose from says so.** When the matcher had no candidates at
all the screen still read *"More than one show could be this. Picking the wrong one would
move your history onto it"* above an empty list, with **None of these** as the only
control. The opposite of the truth, and an offer to give up. It now says the name came
back with nothing and gives a search box seeded with it, because the person knows what
they watched and the matcher only had a string from an export. Choosing from that search
writes the same match as choosing a candidate, so the safety property is unchanged: no
guess is ever made on somebody's behalf.

**Your own reaction is visible.** The stream shows reactions whose timestamp falls in
`(last tick, now]`, and a reaction you have just left is stamped at exactly `now` — so by
the next tick the window has moved past it and it never flew. Tapping an emoji stored a
reaction and changed nothing, which is indistinguishable from a tap that missed, in the
feature the product is built on. Yours flies immediately now, not subject to density and
not held by the pause: thinning the crowd is about other people and holding the stream
still is about the drift. Two things that had to be got right with it — everything already
on screen when you arrive is primed as history, or re-entering an episode would empty
every past reaction of yours across it at once; and the window path skips anything the own
path has already flown, or the same reaction crosses twice.

**Search gives up rather than saying "Searching…" for ever.** A request that hangs never
rejects, so the error state below it could not be reached by the failure people actually
meet. Ten seconds, then a sentence and a **Try again** — because a message with no action
is only a nicer way of being stuck. An abort the app asked for is told apart from an abort
caused by somebody typing again, which is not a failure and says nothing.

Left alone on purpose: doc 10 §7, that Watching Mode carries more chrome than the brief
asked for. That is a design judgement about the screen rather than a defect in it, and
patching it piecemeal would be worse than deciding it properly.

Two suite checks changed rather than being made to pass. The web smoke asserted the old
copy and the presence of the button; it now asserts the new sentence and the button's
*absence*, because "gets on with it" is the behaviour. And the matching component's tests
gained a `resetAutoMatch()` between cases — a once-per-session guard that a suite does not
reset is a second test silently never starting a run.

### 6.49 A second evening, on the phone

Doc 10 was an evening with the web app. The phone is what this product pivoted to *be*,
and nobody had sat with it that way — its suite drives it screen by screen, which §6.47
is the standing proof of not being the same thing. The findings are the second half of
[doc 10](10-an-evening-with-it.md); three are fixed here.

Two things were checked rather than assumed, because half the fixes above live in code the
phone does not share. **The resume reached it** — 0:06 out, 0:09 back, *Resume* offered —
which it should have, being in the core, and now has been seen. **Reactions are visible**,
because the phone's stream is a different implementation that renders a window *behind* the
position rather than between ticks, so a reaction stamped at now appears at once. The web's
bug never existed here.

**Watching Mode had no entry point on Up Next.** The differentiator of the product, on the
platform the product is now for, was reachable only by opening a show, finding the episode
in its season list and tapping there. Three taps and a scroll. The web has offered *Watch
along* in that row since it shipped.

What is worth noticing is why no audit caught it. §6.10 compared the two platforms screen
by screen and both have the screen. §6.27 compared what each app imports from the core and
both reach the same code. The difference was neither a screen nor a symbol — it was an
*offer*, and nothing in this repository looks at those.

**The remote drawer explained itself instead of working.** Opened mid-episode, under the
keys, a paragraph about how every device type is its own adapter, that there is no
vendor-neutral protocol, that Cast and AirPlay need their vendors' SDKs. All true, all
reasoning about the implementation, in a control surface somebody opened to press pause.
Two lines now — what works, what does not — and the reasons stay in doc 6 §2 and doc 9
§1.2.

**And the same states say different things on each platform.** Measured across four: Stats
says "in this period" on one and "in this window" on the other; the empty Upcoming, the
Watching Mode start line and the empty Watchlist each have two versions. The useful part is
that the phone is *better* in two of the four — it says what to do about the emptiness
where the web only describes it — so the answer is not "make the phone match the web".

Two are fixed, chosen because one side was plainly worse rather than merely different: the
phone's start line was circular ("press start when the episode starts"), and the web's empty
Upcoming was a dead end with Discover one tap away, which is doc 10 §8 and is closed with
it. The other two are recorded rather than churned — a repository where one state has two
sentences will keep growing them, and the fix is a decision about who owns the words.

### 6.50 What each platform *offers*, rather than what each one has

§6.49 ended on a sentence worth acting on: the thing no audit had caught was neither a
screen nor a symbol but an **offer**, and nothing in this repository looks at those. Two
parity audits (§6.10, §6.27) had both come back clean while the phone's Discover was a
list of links — present, named, and unable to do the one thing the screen exists for.

So the question this time was per screen: *where can you go from here, and what can you
change from here.* Both are readable from the source. A screen's destinations are its
`<Link to>`/`navigate()` on the web and `<Link href>`/`router.push()` on the phone,
reduced to a first segment so `/title/${id}` and `/title/:id` are one place. Its writes
are the functions it imports from `@reviewies/core` whose names begin like verbs that
change something. Thirteen pairs of screens, two sets each, compared.

Six differences, every one of them web-only:

```
/search      markWatched()
/watchlist   →/search
/discover    addToLibrary()  addToWatchlist()
/calendar    →/discover
/lists       →/title
/settings    →/people
```

Four are real, and each is a screen that cannot do its own job on the phone:

- **A list could not be opened.** The phone's Lists screen rendered each item's name as
  plain text with a Remove button beside it. Every other list of titles in the app takes
  you to the title; the one screen whose entire content is titles somebody deliberately
  chose was the one screen you could not get out of.
- **Search would not log a film you had already seen.** Doc 4 §2.2 is a person saying
  they avoid title pages to avoid the ratings on them; the web has had *Seen it* in the
  results row since Search shipped, and on the phone the only way to log a film was to
  open its page.
- **Discover offered a link and nothing else** — fixed as part of this, and described in
  §6.49.
- **`/calendar →/discover`** was the web half of doc 10 §8, already closed.

`/settings →/people` is the one difference that is right: the phone reaches People from
its More tab, where its whole second tier lives, and the web has no More tab.

**Closing the first four exposed two more.** With Search, Discover and Lists fixed, the
same comparison found the phone's empty Watchlist and empty Calendar naming the way out
without offering it — *"Add something from Search"*, *"track a show that is still
airing"* — which is exactly the dead end doc 10 §8 found on the web's Calendar and fixed
*there*. The web's empty watchlist has had a **Find something** button since it shipped.
Both now have one, and the phone's suite checks for them rather than only for the
sentence, which is what let two dead ends sit under a passing empty-state check.

The comparison is kept, as `app/src/wiring/offers.test.ts`, beside the other source-level
guards. Same shape as the rest: the pairing is data, every screen file on both sides is
either half of a pair or has a written reason not to be, and a difference has to be
explained in a sentence in `EXEMPT` or the suite fails. Two exemptions today — People
above, and the phone's calendar reaching `setPreference` through `syncPreference`, one
hop further out than a single-file read can see. Stale exemptions fail too: an exemption
describing a difference that has since been closed is worse than none, because it is a
written claim that the gap is deliberate.

Reading the guard's own limits honestly: it is single-file by choice. Following imports
into shared components would make the two sides incomparable — the web's `AddToList` has
no phone twin as a file — and every difference that has actually mattered was in the
screen itself. It also names writers by prefix, which is a heuristic; a reader whose name
starts with `set` would be a false positive, and would cost one line in `EXEMPT` rather
than a wrong pass. Both are cheap failure modes on purpose.

The method is the finding. "Do both platforms have this screen" is a question that
answers itself in the affirmative for a screen that has been quietly gutted. "Can both
platforms *do* this from here" is the question that found four.

### 6.51 One owner for the words

§6.49 measured four states whose wording had drifted between the platforms, fixed two,
and parked the rest with a sentence rather than a change: *the fix is a decision about
who owns the words.* §6.50 then demonstrated the cost of nobody owning a comparison —
the empty Calendar was found to be a dead end on the web, fixed there, and left a dead
end on the phone for two sprints.

So the same extraction, aimed at prose this time: pull the sentences a person reads out
of each pair of screens — JSX text, placeholders, the labels a screen reader says — and
report the pairs that are *nearly* the same. Nearly, not different: two screens saying
unrelated things is normal, and drift is specifically the recognisable case of one
sentence written twice. Eleven pairs, across eight screens:

```
/watchlist  Nothing saved yet.                     · Nothing saved yet. Add something from Search…
/watchlist  Why is this here?                      · Why did you save this?
/discover   …already watched or added.             · …already watched.
/discover   Nothing new to suggest yet…            · Track something first and suggestions will follow.
/lists      Lists need an account. Sync is not…    · Lists need an account — they are meaningful…
/lists      No lists yet.                          · No lists yet. Make one above…
/lists      Nothing on this list yet.              · Empty so far.
/stats      …in this period yet.                   · …in this window yet.
/calendar   No alerts at all.                      · No notifications at all
/calendar   The moments worth knowing about, wi…   · The moments worth knowing about
/comments   Add a screenshot                       · Attach a screenshot
```

Each was decided on merit rather than by platform, which is the part that cannot be
automated. The phone's empty states won most of them, because they say what to do about
the emptiness and the web's only described it. The web won `/discover`, because *"nothing
you have already watched"* is a promise the screen over-keeps — a title on your watchlist
is excluded too, and somebody wondering why their watchlist is not being suggested
deserves the true sentence. `/stats` went to *period* over *window* for a reason neither
platform had thought about: the control offers **All time**, and all time is not a
window.

**Two of the eleven turned out not to be copy at all.**

The calendar's empty state read differently because the two screens were *looking at
different amounts of the future*: `getUpcoming(60)` on the web against the core's default
of 30 on the phone. The same screen, the same purpose, two months of it on one platform
and one month on the other — and nothing could see it, because each side passed its own
number at the call site. `UPCOMING_DAYS = 60` now lives beside `getUpcoming`, and the
sentence that says "the next two months" is checked against it.

The second is worse. The phone's comments screen showed *"Nothing here yet."* in the
**sealed** state — the one where you have marked the episode watched, the server has not
received that yet, and the spoiler gate is therefore still closed. It was telling people
a conversation was empty when it was in fact hidden, which is the identical mistake the
Lists screen made when it showed "No lists yet" for a failed fetch. The web had the right
sentence and the phone had never been given it.

`core/src/copy.ts` is the owner now: a sentence is there when a person meets it on both
platforms, with the reasoning for the wording beside it. `COPY.people.signInToFollow` is
a function rather than a string, because that sentence's destination genuinely has two
names — the Data tab on the web, the Account screen on the phone — and only the noun
should differ. The notification options moved into `core/calendar/upcoming.ts` beside the
type they describe, because both screens had their own copy of the list and all three
hints had drifted.

`app/src/wiring/copy.test.ts` keeps it. It nearly shipped with a hole worth recording:
once a sentence moves into `COPY`, the screen has no literal left, so the *other*
platform could keep — or grow — its own version and the comparison would see nothing on
one side and pass. I caught it by planting the case rather than by reading the code:
reverting one phone screen to its old wording did not fail the guard. The extractor
resolves `COPY.x.y` to its value as well as reading literals, and the planted revert
fails it now.

The threshold was measured rather than picked. Every real divergence above scored 0.60 or
higher on word overlap; the highest-scoring false positive — two unrelated Watching Mode
controls that both mention the clock — scored 0.44. 0.45, with a comfortable gap either
side, because reworded copy keeps most of its nouns.

Both platform guards now read one pairing list, `app/src/wiring/pairs.ts`. Two lists of
which screen is which would be precisely the failure these guards exist to catch.

### 6.52 The numbers, which nobody had compared

Twice running the finding worth having arrived in disguise. §6.51 was a sweep for
divergent wording and turned up a calendar that looked sixty days ahead on the web and
thirty on the phone; §6.50 was a sweep for missing controls and turned up a screen that
could not do its job. Both times the interesting thing was a behaviour difference wearing
something cosmetic. So: look for the behaviour differences directly.

Two readings, both about one decision made twice. What numbers does each app pass into
the same core function, and what tuning constants does each app keep of its own.

**The reaction lifetime.** `TRAVEL_MS = 7000` on the web against `LIFETIME_MS = 4000` on
the phone — how long a stranger's reaction stays readable, in the feature the product is
built around, differing by three seconds because the two streams were written months
apart and named their constant differently. Neither number had a comment. The phone's had
the better provenance: the paragraph above it is about danmaku, and four seconds is
roughly Niconico's own figure, which is a reason rather than a preference. `REACTION_VISIBLE_MS`
lives in the core now. The web's traverse is derived from it — the keyframe covers 120vw
of which 100vw is on screen, so `TRAVEL_MS = REACTION_VISIBLE_MS × 1.2` puts a reaction in
front of you for the same four seconds on both.

**The contributed reference.** The phone refused any recording under twenty seconds. The
web recorded a fixed thirty and checked nothing — so a capture cut short by a lost
microphone went to the server as a reference *everybody else would then be matched
against*. Two numbers, two places, one of them not enforced at all. `MIN_REFERENCE_MS` and
`CONTRIBUTION_MS` are in the core beside `contributeReference`, and the floor is enforced
inside it, where every caller passes through rather than in whichever screen remembered.

Enforcing it there broke a test, which is the part worth reporting: *"Audio never leaves
this device"* contributed a three-frame recording to prove that only hashes are uploaded,
and the new floor refused it before it reached the fake client. The test was right and
still is — it now contributes twenty-one seconds' worth. A guard that makes an old test
fail for the right reason is the cheapest evidence that it does something.

**The phone's search had no deadline.** The web got a ten-second give-up in doc 10 §6,
because a hanging request never rejects and *"Searching…"* otherwise stays on screen for
ever with nothing to press. The phone — the platform far more likely to be on a bad
connection — kept spinning indefinitely. It has the same deadline now, from the same
`SEARCH_TIMEOUT_MS` in the core, and the same **Try again**.

`app/src/wiring/numbers.test.ts` keeps both readings. Every module-scope `const NAME = <number>`
in either app must now be imported from the core or named in `PLATFORM_NUMBERS` with a line
saying why it is one platform's own — six are, and each says so: a wire protocol version,
a socket's reconnect delay, how many lanes of emoji fit above the controls, how stale an
extension's position may be, the smallest half-star target on a native control. And where
both apps call the same core function, the numbers they pass must match, `getUpcoming(60)`
against `getUpcoming()` being exactly the shape that got past everything else.

Both halves were proved by planting rather than by reading — the standing method since
§6.51's guard nearly shipped with a hole. Restoring `getUpcoming(60)` fails the argument
check; putting `LIFETIME_MS` back into the phone's stream fails the constant check.

What the guard cannot see is the same decision under two different names, which is how
the reaction lifetime hid in the first place: `TRAVEL_MS` and `LIFETIME_MS` are unrelated
identifiers holding one product decision. Only reading finds those. The exemption list is
where that reading gets written down, so the next person reads six explained lines instead
of the whole tree.

### 6.53 Opening a database an older build wrote

Every suite in this repository starts from an empty store. That is the one thing no real
install ever does: a person's second launch opens the database their previous version
wrote, and their history is in it. That path had never been executed here on either
store — and on one of them there was nothing to execute.

**The phone had no upgrade path at all.** `SqliteDatabase.open` issued
`CREATE TABLE IF NOT EXISTS` and stopped. A new *table* therefore appeared on an existing
install, which is how `animeIds`, `outbox` and `syncState` arrived without anybody
noticing the gap. A new **column** never did — and the columns in this schema are exactly
the fields something filters or sorts by, lifted out of the JSON document beside them. So
the first time a field was promoted to a column, every upgraded phone would have met
`no such column: status` on the query Up Next makes, which is the first thing the app
does. Not a crash in a corner: the home screen, for everyone who already had the app.

Nothing could have caught it. The SQLite suite is the core's own suite pointed at a fresh
sql.js database, so it creates every table from the current spec, every time.

`open()` now does three steps per table, and the order is the point: create the table,
add any column a later version introduced — backfilling it from the document, where the
value has been all along — and only then build the indexes, because an index cannot be
built on a column that does not exist. The backfill is `WHERE <column> IS NULL` rather
than unconditional, because this runs on every launch and a value written since the
upgrade must not be overwritten by whatever the document said when it was stored.

`sqliteUpgrade.test.ts` builds the old file by hand — the tables as an early build
declared them, with rows in them — and checks three things: the rows survive, every field
the current code queries is a real column afterwards, and running `open()` three times in
a row changes nothing. The second of those walks the whole schema rather than the one
column that prompted it, so the next field lifted out of a document is covered without
anybody remembering to add a case.

**The browser store was fine, and is now checked.** Dexie migrates declaratively and did
the right thing, but "lower risk" had never been distinguished from "no risk". Three cases
in `dexieUpgrade.test.ts`: a version 1 database keeps every row, the later versions' tables
and indexes exist afterwards, and the two queries the screens actually make — Up Next's
`where('status')` and Watching Mode's compound `[targetId+tMs]` — still answer.

And once in the browser itself. The web smoke now hand-builds the version 1 IndexedDB
before any script runs — the stores and indexes as the first release declared them, with a
tracked show in them — then loads the app, which opens it, upgrades it, and has to render
what was there. It does: *Older Build Show*, with its next episode, rather than the
first-run screen. That last check is the one worth having, because "the rows are still
there" and "the person sees their shows" are different claims, and an upgrade that lost
the library would land somebody who has been using the app for months back on *Bring your
history with you*.

Two smaller things fell out of it. Dexie reports version 30, not 3 — it multiplies by ten
so schema changes can be slotted between versions — which the smoke's first attempt at the
check got wrong and the run said so. And the new Dexie suite skips itself under
`npm run test:sqlite`, where there is no IndexedDB; the skip guard from §6.41 immediately
demanded a written reason for it, which is exactly what that guard is for.

### 6.54 A library somebody has actually used

The pitch is to people leaving a tracker they had used for years. Every suite in this
repository runs against a handful of rows. `platform.ts` says write-ahead logging *"is
what makes marking an episode feel instant"* — a claim about a database with ten things
in it.

So: a hundred and twenty shows, five thousand seven hundred episodes, three and a half
thousand watch events spread across a decade, two thousand reactions on one episode. The
same suite runs on both stores, because `npm test` and `npm run test:sqlite` are the same
tests pointed at different implementations, and the SQLite one falls back to
`json_extract` for any sort on a field that is not a real column — a table scan nobody had
timed.

The core came out of it well. Nothing is superlinear: at five times the data, `getUpNext`
went from 87ms to 420ms, which is the ratio you want. On Dexie, at the size above:

```
getUpNext 89ms   getSummary(all) 17ms   getUpcoming 40ms   markWatched 17ms
excludedTitleIds 13ms   reactions for one episode 16ms   enqueueAll (3000 rows) 1058ms
```

SQLite is faster on all of them. The one number worth keeping an eye on is the last:
`enqueueAll` is deliberately sequential — each row reads the existing outbox entry so a
stale write cannot clobber a newer one — so an import of a few thousand watches spends a
second in the queue. Sequential is not quadratic, and the budget is what keeps it that
way.

**Then the screens, which is where the finding was.** The web smoke now seeds a hundred
and fifty shows straight into IndexedDB and opens the app on top of them. The home screen
comes up in 1.6 seconds with all hundred and fifty rows — but Stats sat on *Loading…*, and
the first version of the check accepted that as a pass, because it was written as *"does
it not say it is empty"*. Pressing on the wrong-looking pass is what found the real thing.

**Stats opens on this year, and tells somebody with ten years of history that they have
watched nothing.** Not a bug in the query — the window genuinely was empty for that
fixture — but the screen's answer to it was a flat sentence with nine year-buttons sitting
above it, which reads as an app that has lost your history rather than a period that
happens to be quiet. Somebody who imports a decade in January meets exactly this. The
empty state now offers **Show all time**, which is the same rule as §6.50: a screen that
knows what you should do next should not make you find it.

It also turned out the two platforms opened on *different windows* — `ytd` on the web,
`30d` on the phone. §6.52's guard could not see it: it is a string, not a number.
`DEFAULT_STATS_WINDOW` is in the core now, set to this year, because the year is the period
people think in about what they have watched and Year in Review is built on it.

Two things in the fixture were wrong before they were right, and both are worth recording
because they are the failure mode of this kind of test. The first counted the Up Next rows
at first paint and found nineteen — React yields part way through a hundred and fifty rows
— so the check now waits for the list to settle and reports when the last row arrived. The
second skewed each show's air dates *forward* by an hour per show, which made every next
episode unaired, so Up Next correctly showed almost nothing and the check looked like a
missing list. A fixture that is wrong in the direction of "the app is broken" is the
expensive kind, and neither of those was visible without reading what the numbers meant.

### 6.55 What each screen opens on

Three sweeps have now compared the platforms: what a screen offers (§6.50), what it says
(§6.51), what numbers it passes into the core (§6.52). Stats still opened on *this year*
in one app and *the last thirty days* in the other, and none of the three could see it —
a default window is a string sitting in a `useState` call. §6.54 found it sideways, while
looking at something else.

A default is a decision. Which period is selected, which filter is on, what starts
expanded, how much of the crowd you see before you touch anything: each is an answer to a
question about the product, and two platforms answering differently means nobody answered.
So the fourth sweep reads the initial state out of each pair of screens and compares it by
name.

**"Density" meant two different things.** Watching Mode has a density control on both
platforms, and they did not agree on what it was:

- the web, a slider from a quarter to all, applied as `Math.random() < density` — a
  *proportion* of the reactions due;
- the phone, three chips of 8, 24 and 60, applied as `.slice(0, density)` — a *cap* on
  how many are on screen.

The same word, the same screen, the flagship feature, two mental models. And a proportion
is not something anybody can act on: a quarter of a quiet episode is nothing, all of a busy
one is a wall, and the reader cannot tell which they are about to get. A cap is the same
experience on every episode. `REACTION_DENSITY_CHOICES` and `DEFAULT_REACTION_DENSITY` are
in the core now; the web's slider is three chips, and its stream fills up to the cap
instead of sampling.

**And the phone's label was a promise the code did not keep.** *"Show up to 24 reactions a
minute"* — while the code capped how many were on screen inside a four-second window,
which is up to three hundred and sixty a minute. Doc 9 §6.13 is the standing rule about
checking what the interface says out loud; this was the same mistake sitting in the
product's centrepiece. Both platforms now say *"Show at most 24 reactions on screen at
once"*, from the core, which is what both now do.

One smaller thing: the calendar read its stored notification preference on every render on
the web (`useState(getPreference())`) and lazily on the phone (`useState(getPreference)`).
The same decision, two idioms; the lazy one is right, and matching them is one character.

Fixing the density default then broke a test, in the way that is worth having: the stream's
own suite renders it without a density prop, and the component's fallback was `1` — which
under the old meaning was "all of them" and under the new one is "one at a time". The
summary that should have read *"2 funny and 1 other"* read *"1 funny"*. The fallback is
`DEFAULT_REACTION_DENSITY` now. A default that changes meaning while keeping its value is
exactly what an old test is for.

`app/src/wiring/openState.test.ts` keeps it, beside the other three, reading the same
pairing list. Its bound is worth stating: it compares state by *name*, so a value only one
platform holds is ignored — a screen legitimately has state its twin does not. What it
catches is the same named thing opening differently, which is what all four of these
sweeps have found each time. Proved by planting the `ytd`/`30d` split back, which fails it.

### 6.56 With the network off

The sentence on the More screen is *"Everything lives on this device. Nothing here needs
an account, and nothing is withheld."* Nothing had ever tested it. Every check in this
repository has had a working localhost and a fixture provider that always answers.

So: Playwright's offline switch, both apps, cold and warm.

**The app is genuinely local-first, and that part is now proved rather than asserted.** A
cold launch with no network at all comes up from the service worker's precache with
somebody's shows on it; every screen renders; marking an episode watched writes the watch
and queues the outbox row; coming back online does not duplicate it. Those are eleven new
checks in the web run and four in the phone's.

**The finding was on the Lists screen, and it was not really about the network.** Offline,
signed out, on a build that has sync configured, it said:

> No lists yet. Make one above, then add titles to it.

— over a Create box whose button did nothing at all. `createList` returns `undefined`
without a session, and the screen ignored the return, cleared the input and reloaded an
unchanged list. Two failures wearing the clothes of ordinary emptiness: *you have no
lists* for *nobody is signed in*, and a form that silently discards what you typed.

The screen gated on `syncConfigured()` — a fact about the **build** — where People has
gated on the **session** since it shipped. Lists now has both gates and says *"Sign in on
the Data tab to make lists. Everything else on this device works either way"*, and a
create that fails says so instead of resetting. Both platforms, from the core's copy.

That is the third time in seven sprints that the bug has been a failure rendering as
emptiness: §6.33 separated "no lists" from "could not ask", doc 10 §6 found a search that
said *Searching…* for ever, §6.50 found empty screens that named a way out without
offering one. It is worth naming as a class. **An empty state is a claim about the user's
own data, and code that cannot tell "nothing" from "I could not look" makes that claim
falsely.**

Two limits, both recorded in §7 rather than papered over. The phone's offline checks
navigate by tapping rather than by loading a URL, because the static web export has no
service worker and a fresh document fetch offline is the browser's error page — on a
device the bundle is local, so what is testable here is the aeroplane case: already
running, network gone. And offline-as-a-switch is not the connection people actually have.
A captive portal, or a request that hangs rather than fails, is a different failure, and
the deadline §6.52 put in the core for exactly that has still never met one.

One check in this sprint was written badly enough to be worth recording: the phone's first
offline assertions matched on the words *Watchlist* and *Discover*, both of which are
printed on the tab bar — so a tap that navigated nowhere would have passed. They match on
something only the destination says now. That is the same mistake §6.54 caught a sprint
ago, made again, which is a fair argument for reading every new check as though it were
somebody else's.

### 6.57 Telling "nothing" apart from "I could not look"

§6.56 named the class after meeting it a third time. This sprint went looking for the
rest of it, and the answer was: seven functions in the core could not have reported a
failure even if every screen had wanted them to.

`removeFromList`, `setListVisibility`, `unfollow`, `blockPerson`, `unblockPerson`,
`deleteComment` and `clearContentWarningVote` all returned `Promise<void>` and threw the
Supabase error away. Each sits beside a sibling that reports properly — `addToList`,
`follow`, `voteContentWarning` — which is what made it invisible: the module looks
consistent until you read the return types.

What that cost, in the screens:

- **A removed list item vanished whether or not the server agreed**, and came back the
  next time anybody opened the list.
- **Unfollow removed somebody from the list until the next load put them back.** Block was
  the same, and worse: `blockPerson` writes twice, and a block that landed while the
  follow edges survived is a block that half worked — their activity still plumbed into a
  feed the block was meant to end.
- **A delete that failed looked exactly like one that worked.** For a comment somebody
  wanted taken down, that is the worst available way to be wrong.

All seven report now. `signOut` and `ensureProfile` throw instead, like their neighbours
in `auth.ts`, because an account with no profile row is one nobody can find or follow.

One read had the same shape: `fetchListItems` returns `{ items, failed }` and all three
call sites destructured `items` and dropped `failed`, so a list whose contents could not
be fetched rendered as *"Nothing on this list yet."* — the screen telling somebody their
own work is gone because a request came back empty-handed.

`app/src/wiring/failureShown.test.ts` guards both halves of the path, and both halves
matter:

- a core function that calls `getClient()` may not return `Promise<void>` unless it
  throws — throwing is reporting, which is what `signIn` and `postComment` do;
- a screen that calls a function which reports must bind the result, because a result
  nobody looks at is the same as no result.

The second half is decided by reading backwards from the call over whitespace: an
assignment, an argument, a return or a ternary catches the result, and a bare statement
does not. My first attempt at that used a regex with a lookbehind and passed twelve calls
that were all perfectly bound — a guard reporting false positives is on its way to being
deleted, so it is worth getting the cheap part right. Both halves were then proved by
planting the original bugs: a `Promise<void>` write and a call whose result is discarded.

The guard says what it cannot see, which is the important part: **whether a bound result is
ever rendered.** `const result = await …` followed by silence passes this and fails a
reader. That is where a source-level check stops and §6.56's offline browser runs take
over.

Four sprints, four sightings of one bug. It is worth stating plainly, because it is the
kind of thing that reads as a triviality in a diff and as a betrayal on a screen: **an
empty state is a claim about somebody's own data.** Making it because a request failed is
not a cosmetic error.

### 6.58 Making the provider fail, in a browser

§6.57's guard says in its own doc comment what it cannot see: that a bound failure is
ever *rendered*. `const result = await …` followed by silence passes it and fails a
reader. The provider is the one dependency reachable without an account, so that is where
the other half starts.

`app/failures.mjs` builds the web app **with** the TMDB token — the ordinary smoke run
blanks it on purpose — and then makes every request to `api.themoviedb.org` fail three
ways: refused, answered with a 500, and left hanging with no answer at all. No network is
needed, because interception happens before the request leaves the browser; what is under
test is the app, not TMDB.

The three are three different bugs. **A hang does not reject**, so nothing in the app's
error handling can see it; only a deadline can. That case is now driven end to end:
*Searching…* for ten seconds, then *"That took too long. Check your connection and try
again"* with a button. §7 has recorded that deadline as untested since it was written in
doc 10 §6.

Search, Discover and the calendar all came through honestly. The title page did not.

**It said "Loading…" for ever.** `getTitleCached` and `getEpisodesCached` were awaited
without a catch, so a provider that could not be reached left the effect rejected
part-way: `loading` stayed true and the heading stayed on its placeholder. Both platforms,
same shape. It says what happened now, and offers **Try again** — which re-runs the fetch
rather than reloading the page.

**And underneath it, a worse one.** The page also said:

> Not on any service in United States that we can see.

That is a statement about the world, and it was made from a network error.
`getProvidersCached` caught the failure and returned `undefined` — the same value it
returns for a title genuinely streaming nowhere. It returns `{ providers, failed }` now,
and the screens say *"Could not check where this is streaming just now"* instead.

The part worth recording is what happened next. Removing the swallow broke
`core/src/data/failures.test.ts` — the guard from §6.29 that lists every read which
answers a failure with emptiness, each with a written reason — because
`getProvidersCached` was **on that list, with a reason**:

> Same, with one extra rule — a row cached for a different country is a miss rather than a
> wrong answer.

The reason was true of its neighbours and wrong about it. Falling back to stale *metadata*
degrades gracefully: you get last week's episode titles instead of an error. Falling back
to "no providers" is not old data at all — it is a claim of absence. Two sprints ago that
distinction had a name (§6.56); when the entry was written, it did not, and the excuse
read as reasonable beside four that were.

So the guard's stale-entry check is what finally deleted the excuse — the mechanism
working exactly as intended, one sprint late, against the person who wrote the entry. That
is the argument for stale-exemption checks in general: an exemption list without one is a
place where wrong reasons go to be safe.

My own first version of the title-page check was the same failure in miniature: it asked
whether the page was *non-blank*, and a page sitting on "Loading…" with a five-star rating
widget under it is not blank. It passed. Reading the detail it printed is what found the
bug — which is the third sprint running where the finding came from distrusting a pass.

### 6.59 Reading every written excuse back

§6.58 ended on an uncomfortable note: `getProvidersCached` had sat on the swallowed-failure
list with a written reason, and the reason was wrong. Not stale — *wrong*, from the day it
was written, and readable as sound because its four neighbours said something similar.

There are nine explained-exemption maps in this repository now. Every one has a
stale-entry check, so no entry can outlive the thing it describes. Not one checks whether
the reason is **true**. That is a judgement, so this sprint made the judgement, entry by
entry. Roughly fifty of them. Four were wrong.

**`fetchEdge`** — following and followers — returned `[]` on an error, and its entry said
the distinction was *"worth distinguishing eventually"* and had *"not been wired through"*.
That is a to-do wearing a reason's clothes. Worse, `people.ts` already spelled out the
consequence in its own comment: a wrong query *"does not throw, it returns
`{ data: null, error }` and every caller here reads that as 'you follow nobody'."* Somebody's
own social graph, reported as empty because a request failed — written down twice, in two
files, and left.

**`fetchBlocked`** said it *"feeds a filter, never a screen"*, and that failing closed was
the safe direction. Half true. It feeds the filter **and** the Blocked section of the
People screen, which quietly disappeared on a failure — telling you that you had unblocked
everybody. Both now return `{ people, failed }`; the filter still reads the empty list,
which is what the safety argument was actually about.

**`clearDatabase`** was excused as needed by *"the suites that swap Dexie for SQLite between
files"*. They do not: they call `setDatabase`. Nothing called it at all — and the same
false claim sat in the function's own doc comment, two statements agreeing with each other
and neither checked. Rather than delete the seam, it now drives the error nobody had ever
seen: the `db` proxy's *"call setDatabase() first"*, which is the message every screen in
both apps would hit if the core were ever used unbound.

**The injection guard was watching two symbols that do not exist.** `INJECTED` listed
`getConfig`, `getDatabase` and `getStorage`; only the first is real — the database is
reached through the `db` proxy and storage through `readPreference`. For its whole life
that guard covered one accessor while reading as though it covered three. It now watches
the real three, and a new check insists every name in the list is an actual core export —
the cheap mechanical half of this sprint, and the one thing here a machine can keep doing.

Three more entries were not wrong but had gone stale from my own recent changes, which the
stale checks could not see because the *keys* still matched: `/search` and `/discover` both
recorded "the provider failed" as unreachable from a browser, which §6.58 made false a
sprint earlier; and `/lists` recorded "no lists yet" as something the suite renders, which
§6.56 replaced with a sign-in gate.

**What I actually verified, and what I only read.** The distinction matters more than the
count. Mechanically re-derived: every one of the fourteen `UNREACHED` symbols, by counting
references across all six workspaces; the `INJECTED` names, by grepping the core's exports;
the lopsided-call entries, by confirming the phone has no relay and no socket at all
(`useRemote.ts` says so in as many words); the platform-number entries, by reading the two
`LANES` values — both four, which is a coincidence and is now written down as one. Read and
agreed with, but not independently derived: the `skips` prose describing what each live
suite covers, and the half-dozen `SILENT` entries whose argument is about design intent —
that a stored position which will not parse is the same as never having watched, that a
blocked key/value store must not be able to break marking an episode watched. I read the
code, I agree, and agreeing is weaker than checking. The next person should know which is
which.

The general lesson is not "write better excuses". It is that **an exemption list is a place
where a wrong reason is safe**, because it is surrounded by right ones and nothing ever asks
it a question again. A stale-entry check keeps the list describing the code. Only somebody
reading it keeps the list *true*.

### 6.60 Planting a violation against every guard

§6.59 found the injection guard watching two accessors that had never existed. It passed
either way, and read as though it covered three times what it did. Since §6.51 every new
guard has been proved by planting the bug it exists to catch; the older ones never were,
and that guard is the evidence the habit arrived too late.

So: nineteen guards, one planted violation each. Backup, mutate, run that suite alone,
read what it said, restore.

```
guard             planted                                          verdict
────────────────────────────────────────────────────────────────────────────
coreWiring        a core export nothing calls                      caught
injection         getConfig() at module scope in the core          caught
nodeResolvable    './types.ts' spelled './types'                   caught
screenStates      a route added to ROUTES, no states entry         caught
dials             a socket dialled without role and token          caught
commands          a README command naming a missing file           caught
failures          a new catch-returns-empty read, unexplained      caught
skips             describe.skip added, no SKIPS entry              caught
columnMap         a mapped column the schema does not have         caught
backendQueries    a column misspelled in a select                  caught
docs              an undocumented process.env switch               caught
schema            a follows policy loosened to `using (true)`      caught
offers            markWatched removed from the phone's Search      caught
copy              the phone's stats sentence reworded              caught
numbers           getUpcoming(60) restored on the web              caught
openState         the phone's stats window back to '30d'           caught
failureShown      a backend write returned to Promise<void>        caught
promises          the export's reactions read replaced with []     MISSED
runnable          a script importing a file that is not there      MISSED
```

**`promises` — "Everything, in full".** The test walks the schema's user tables and
asserts each appears in the export bundle. It asserted the *key*, so a table that was
fetched and came back empty passed: the sentence "in full" was being held up by
`Object.keys`. It seeds a row in each table now and asserts the row arrives — which is the
§6.56 class one layer down, an empty result standing in for one that was never really
fetched.

**`runnable` — the second failure it names.** Its own doc comment says the two ways this
code fails are *"it does not parse"* and *"it imports something that is no longer there"*.
The second was only ever checked for the edge functions. Scripts got `node --check`, which
parses a broken import perfectly happily — and an unresolvable import in a script is
precisely §6.44's bug, the one that kept the bridge from starting and was the reason this
file exists. Scripts get the import-exists check now.

Both repairs were themselves planted against, and both now catch.

**Should the planting be kept?** The obvious idea is a directory of deliberately-broken
sources the guards are pointed at. I decided against it, and the reason is worth writing
down rather than the decision: every one of these guards walks the repository, so a fixture
of broken files needs an exclusion in each of them — and an exclusion is exactly the thing
this repository keeps finding to have silently widened. The cost is nineteen new blind
spots to protect a check that runs once. What is worth keeping is the habit and this table:
a guard written without a planted violation is a guard nobody has read the output of.

Two smaller notes on method. The first pass at the `promises` and `docs` plants tested
nothing — I mutated something the guard does not look at, which reports as a guard failure
and is really a bad plant. That distinction is the whole difficulty of this exercise: a
plant has to be the violation the guard *claims*, not merely a change nearby. And several
guards fail loudly for reasons other than the plant if you are careless — a mutation that
breaks parsing makes everything fail, which proves nothing at all.

### 6.61 Looking at it

Thirty sprints have asked whether this app is correct, honest, fast, consistent, or
recoverable. None has asked whether it is any good to look at — and the pivot was to an
app-first product, where that is not a garnish. The suites have been saving thirty-odd
screenshots of real screens all along. Nobody had opened one.

**The screenshots were lying.** The web suite's 200%-text check injects
`html { font-size: 32px !important }` and never removed it, so every screenshot taken
between a call to it and the next navigation was a picture of the app at twice the text
size. That included `05-watching-live.png` — the one image of the feature the product is
built around, showing controls wrapped onto three rows and the emoji pad pushed off the
bottom. The phone's version of the same check restores what it changed; the web's did not.
Nothing caught it because a screenshot is only wrong to somebody looking at it.

Fixing that first is what made the rest of this sprint possible, and it is the finding
worth having: **an artefact nobody reads can be false for as long as it likes.**

With honest pictures, three things:

**Watching Mode opened on a void.** The top fifth of the screen — a hundred and twenty-eight
pixels — is the band where other people's reactions cross. Before any arrive it was pure
black with nothing to say what it was: the flagship element of the flagship screen,
rendered as a gap. It now says *"Other people's reactions appear here as you reach their
moments"*, quietly, and gets out of the way the moment anything arrives. Both platforms,
from the core's copy, because §6.51's guard would otherwise have caught me writing it
twice.

**Three control idioms with no rule between them.** The title page had an underlined text
link (*Add to list*), a ghost pill (*Content warnings*) and a filled accent button, all
secondary actions, all styled differently. The rule the app follows now, written down
rather than felt: filled accent for the one action a row exists for; a ghost pill for the
others; underlined text only for a rare aside that opens something else — *Use a different
poster*, *Caught up further?*. Only *Add to list* actually moved.

**The rating row read as a divider.** Five grey stars floating in an empty band under the
poster, unlabelled, repeated again in every episode row below. A screen reader always knew
what it was — the aria-labels have said "3.5 stars" since it shipped — which is exactly the
gap a picture finds and an assertion cannot. It is captioned **YOUR RATING** now, in the
same small-caps as *WHERE TO WATCH* and *SEASON 1*, so the page has one heading idiom
instead of two. The word *your* is doing work as well: this is your rating, not a crowd
score, which is the whole difference from every site that shows you an average.

That caption immediately broke the 200% check by pushing two stars off the right edge —
the precise failure the comment above the widget already described, reproduced by adding
four words, and caught by the check written after it happened the first time. Stacked
above the stars instead of beside them, it passes.

What I looked at and left alone, because a design pass that changes everything it notices
is a redesign: **Up Next's hierarchy is right** (show at 16px medium, episode at 14px muted
— the row has a subject); **the Mark/Watched emphasis is already correct** (filled accent
when unwatched, quiet when done, on both the home screen and the episode list — I had
written it down as an inconsistency from the 200% screenshot, and the real one disproved
it); **the emoji pad is the best-looking thing in the product.** Two things I noticed and
deliberately did not act on: the poster is small for a product whose ancestors were
artwork-led, and the star widget repeats once per episode row, which reads as texture
rather than as controls. Both are judgement calls that want a person's eye, and neither is
a defect I can argue for in a sentence.

### 6.62 The same pass, on the platform this became

§6.61 opened the web's screenshots, found the suite had been leaving the text doubled in
half of them, and then — with honest pictures — found three things. It looked at one of
the phone's seventeen. The phone is what this product pivoted to *be*, and its own 200%
check restores what it changes, so those pictures have been true all along. Anything found
there is a design finding rather than an artefact.

**Most watched was a bar with no number.** The web's version is a card per title: name and
hours on one line, a bar beneath, and *"12 episodes"* under it. The phone had the name and
the hours, a hairline running the full width of the screen, and no count — no card either,
so it floated against the page background and read as a progress bar rather than as a
chart. The count is the part that makes the bar mean anything: without it the picture says
one show beat another, and not by how much of what. It is a card with a count now, and its
bar has the same four-percent floor the web's has, so a show with one episode is a mark
rather than nothing.

**The phone's star row was still unlabelled** — a sprint after §6.61 captioned the web's,
which is the drift these guards exist to catch and could not: a caption is not a route, a
word, a number or a default. `COPY.title.yourRating` now feeds both.

**And it asked you to rate the thing above the sentence saying what it is.** The phone's
order was poster → stars → description; the web's is poster → description → stars. Nothing
enforces the order of a page, and nobody had put the two side by side. The phone follows
the web now, for the obvious reason: rate it after you know what it is.

Held against each other, most of what differs between the two is *merely* different and
right to leave: the phone has a navigation bar and the web has a tab bar, the phone's rows
are a few pixels tighter, the phone's headings sit under a back arrow. That is the largest
category and the easiest to mistake for a defect — the temptation is to make the pictures
match rather than to make the product good.

One thing noticed and deliberately not changed: **the phone prints the title twice** in
the top hundred and twenty pixels, once in the navigation bar and once as the page
heading. iOS solves this with a large title that collapses into the bar on scroll, which
is not available here; removing the in-page heading costs the name beside the poster, and
removing the bar's copy costs the context that stays put while somebody scrolls forty
episodes. I could not argue either in a sentence, so it stays, written down.

### 6.63 The shape of a screen

Four guards compare the platforms: where a screen lets you go (§6.50), its words (§6.51),
the numbers it passes into the core (§6.52), the state it opens in (§6.55). None of them
saw that the phone's rating row had no caption for a sprint after the web's got one, or
that the two put the same three blocks in a different order. A section heading and a
sequence are not routes, words, numbers or defaults — and the sequence is the thing a
person notices first, because it is what a screen *looks like*.

So the fifth: the ordered list of **named things** a screen renders — components, and
sentences taken from `COPY`. Coarse enough to survive two frameworks, specific enough that
a missing block shows up. It found three real ones.

**The phone's search results could not be added to a list.** The web's result row has
carried `AddToList` since lists shipped; the phone's made you open the title first. Not a
route, and not a core writer called from the screen's own file — it is a *component*, which
is exactly the hole §6.50's guard left and this one fills.

**The phone's calendar had no artwork.** The web's upcoming row carries a poster; the
phone's was three lines of text. For a product whose ancestors were artwork-led, a list of
what is coming that you cannot recognise at a glance is a list of sentences.

**And the title page's blocks were in a different order** — §6.62 fixed the description
and the stars; the guard then found `AddToList` still sitting on the far side of the
rating on the phone. Same set, wrong sequence, and once the two are printed side by side it
takes a second to see which is right.

Seven pairs differ for reasons that belong, and each says so in a sentence: the web splits
Watching Mode's clock into three components where the phone renders one; the phone extracts
a `ListItem` where the web writes the row inline; the phone's Settings is two pushed
screens. Naming is not structure, which is why the guard normalises a list's row component
— `UpNextRow`, `SuggestionRow`, `Row` are one thing — and leaves the rest to be explained.

Two notes on building it. The first draft reported `NotifyPreference`, `StatsSummary` and
`Window` as things the screens render; they are **type parameters** — `useState<Window>`
looks exactly like an element to a regex. The discriminator is what precedes the `<`: an
identifier means a generic, punctuation means JSX. And the limits are written into the
guard rather than left to be discovered: source order is not visual order once flex and
absolute positioning are involved, a heading inside a shared component is invisible to a
reader of the screen's file, and names are the comparison — two platforms doing the same
thing under different local names read as a difference until somebody says otherwise.

Proved by planting §6.62's own findings back: remove the phone's caption, swap the two
blocks, delete `AddToList` from the search row. All three fail it.

### 6.64 Open it twice

Every check in this repository drives one page. The web app is a thing people leave open —
a tab from this morning, another opened tonight — and those two share one IndexedDB, one
service worker and one outbox. Nothing had ever asked what the second does to the first.

Four checks, two pages, one context. **The local layer holds up.** A second tab opens on
the same library. A watch marked in one moves the other on — S1E1 to S1E2, no reload, no
stale row inviting somebody to mark the same episode twice. One mark is one watch event
and one queued row, not two. And two tabs pressing Mark at the same instant record two
different episodes rather than the same one twice.

That last result is the interesting one, and it is not quite as clean as it sounds. In the
probe the two tabs marked E2 and **E3** — the second tab's write arrived between the first
tab's render and its click, so the button that was pressed was no longer the button that
had been seen. Playwright resolves a locator and then clicks it; a person's finger is
slower than that. A live list is live, and no amount of care in the row prevents the row
from changing under a press.

What was missing was not prevention but **the way back**. Marking is the action this whole
product exists for, the one done in the dark one-handed, and the one most likely to be made
by accident — and Up Next offered no undo on either platform. It does now: *"Marked S1E2"*
with an **Undo** beside it, on the web and the phone, from the core's copy. It answers the
ordinary mis-tap as much as the two-tab race, which is the better argument for it.

The suite is four more checks inside the web run rather than a sixth script. It needs the
browser and the built app that are already there, and a suite nobody runs is the failure
this repository keeps finding — a sixth entry in the chain would have been another minute
on every run for something the existing one could hold.

§7 records what this does not reach: two tabs share a database and two devices do not. The
second is the sync engine's problem, and still needs the service key this checkout has
never had. Nor has anything tested a tab left open across a deployment, which is the other
half of "leaving it open" and needs two builds and a service worker update to arrange.

### 6.65 Leave it open across a deployment

§6.64 ended by naming what it had not reached: a tab open across a deployment. That is not
an exotic case. It is what every person who keeps the app in a pinned tab experiences on
the day something ships, and this repository ships from a static host with a catch-all
rewrite — the arrangement most likely to get it wrong.

Arranged with two builds and a real browser. Build A, served, a tab opened on it. Then the
source changed visibly, build B replaced the directory — new hashed filenames — and the
first tab, still running A, was asked to do things.

**Most of it survives.** Client-side navigation keeps working: the code for every screen is
already in the tab, and React does not go back to the server to render Stats. A reload
picks up B and everything is fine. The database, the outbox and the local library are
untouched, because they are the person's and not the build's.

**What breaks is anything loaded lazily**, and the way it breaks is worse than failing.
The tab asks for `assets/emojiIndex-<hash>.js` — the name A was built with, gone from the
server — and gets back **`{"status":200,"type":"text/html"}`**. Not a 404. The SPA rewrite
that makes deep links work answers *every* unknown path with `index.html`, including a
request for a JavaScript module, so the browser downloads the app's own HTML, tries to
parse it as a module, and throws `TypeError: Failed to fetch dynamically imported module`.
This is §6.31 again — the rewrite lying about a route that does not exist — on a surface
nobody had connected to it. §6.31 fixed the story for routes and left assets alone.

Both halves are fixed, because they are different failures.

**The server half.** `vercel.json` no longer rewrites `/assets/`:

```
"source": "/((?!assets/).*)"
```

A missing chunk now 404s, which is the honest answer and the one a browser can report as
itself. The exclusion is narrow on purpose — `/assets/` is Vite's output directory and
nothing a person ever types. Deep links, share URLs and the offline fallback all still
land on the shell. `scripts/deploy-web.mjs` copies `rewrites` out of this file, so the
change travels to the deployment rather than living only in the repository.

**The person's half.** A 404 is honest but still arrives as "failed to fetch", which tells
somebody nothing they can act on. `app/src/data/chunk.ts` recognises the three shapes this
failure takes across browsers — *dynamically imported module*, *Importing a module script
failed*, *MIME type* — and turns them into one sentence, from the core's copy:

> The app has been updated since you opened this tab. Reload to carry on.

`FailureBanner` renders that message with a **Reload** button instead of "Dismiss",
because dismissing it fixes nothing. Everything else the banner shows is unchanged.

Not every lazy import wants this. Two exist. The emoji index already degrades correctly —
a failed load costs the long tail and search keeps working against the curated set, which
§6.9 designed deliberately — so it stays as it is. sql.js goes through `loadChunk`, because
it is 650 KB reached at the worst possible moment: somebody importing the TV Time history
they came here to rescue. A silent failure there is the §6.56 bug class exactly — a
person's own data, and an app that cannot tell "nothing" from "I could not look".

`chunk.test.ts` proves the discrimination rather than the happy path: an import failure
becomes the update sentence, the MIME wording is recognised too, a chunk's *own* error is
re-thrown rather than swallowed behind a misleading reload prompt, and a module that loads
is returned untouched.

The honest limit is on the server half. `vite preview` has its own SPA fallback, so the
local rig cannot tell a fixed `vercel.json` from a broken one — the probe that found this
returns `200 text/html` either way. What lands instead is a check in `docs.test.ts` that
parses `vercel.json`, finds the catch-all, and runs its pattern against
`assets/index-abc123.js` (must not match) and `stats` (must match). That is a claim about
the configuration, not about Vercel's behaviour, and it is recorded as such in §7. The
browser half is real: the message and the Reload button were produced by a genuinely stale
tab in Chromium.

### 6.66 Move the clock

Everything in this repository has only ever run in one timezone. The container's clock is
UTC, and UTC is the one place on earth where the two readings of a date agree.

Two kinds of thing get called a date here. A **watch** happens at an instant — a number of
milliseconds, the same everywhere. An **air date** is a calendar date: `2026-08-26`, a
square on somebody's wall, with no hour attached to it at all. Converting the second into
the first is where every timezone bug lives, because JavaScript does it silently:
`Date.parse('2026-08-26')` is **UTC midnight**, and `new Date(ms).toISOString().slice(0, 10)`
is **UTC's day**.

**The first experiment found nothing, and that was the finding.** Running the whole core
suite at `America/Los_Angeles`: 689 passed, nothing failed. At `Pacific/Kiritimati`
(UTC+14): two failures, and neither was a product bug — one test had hardcoded
`2026-06-15` as the day of `2026-06-15T20:00:00Z`, which is a claim about the runner
rather than about the code, and one was a scale test timing out under parallel load.

The reason is worth stating plainly, because it is the shape of the whole sprint: **every
air-date fixture in the suite is days away from `now`.** `dateAt(3)`, `dateAt(-5)`,
`dateAt(90)`. An error of at most fourteen hours never crosses a boundary that is three
days wide. The tests were not wrong; they were pointed somewhere the bug is not.

So the bug was demonstrated directly instead — what `hasAired` says about an episode
airing *today*, at each hour, in three zones:

| local time | Los Angeles | UTC | Kiritimati |
|---|---|---|---|
| 00:00 | aired | aired | **not aired** |
| 09:00 | aired | aired | **not aired** |
| 17:00 | aired | aired | aired |

and about an episode airing *tomorrow*, seen from the west:

| local time on the 26th | airing on the 27th |
|---|---|
| 16:00 | not aired |
| **17:00** | **"aired"** |
| 23:00 | "aired" |

`hasAired` is the predicate Up Next is built on. So: **in Los Angeles this app offered you
an episode that had not been broadcast, from teatime onwards — on exactly the evening
people open it.** In Kiritimati it hid the episode that aired this morning until 2pm.
Fourteen hours late in one direction, seven early in the other, and nothing in the product
could tell.

The same reading was in five more places:

- **The calendar** dropped today's episodes as soon as UTC's midnight passed, and its
  window started at `now` rather than at the start of today, so today's episode vanished
  from Upcoming at lunchtime regardless of timezone.
- **The phone's calendar** printed the raw `2026-08-26` as a day heading while the web
  said *Today* / *Tomorrow* / *Friday*. The §6.51 shape again: the same screen, two
  answers, because `formatDay` lived in one platform's file.
- **Export filenames** — `reviewies-2026-08-27.json` for a file made at 9pm on the 26th
  in California. Small, and in the one place somebody goes looking for the file they made
  "yesterday".
- **The notification scheduler**, which is the one part of this product that reaches out
  to a person unprompted, matched `air_date = current_date` — UTC's date, for everybody.
- And it ran **once a day at 08:00 UTC**, which is 8am in exactly one timezone and 10pm
  in Kiritimati.

#### One converter

`core/src/time.ts` is now the only place a calendar date and an instant meet: `dayKey`,
`todayKey`, `startOfDay`, `dayHasArrived`, `daysUntil`, `formatDay`. Everything reads the
date in the viewer's own calendar, which is the only reading a person can check by looking
at their wall. `hasAired`, `getUpcoming`, the stats day key, both calendars and both export
filenames go through it.

`longestStreak` is the deliberate exception and now says so: it parses `yyyy-mm-dd` keys as
UTC midnights precisely *because* that is the wrong reading everywhere else — two UTC
midnights are exactly a day apart even across a daylight-saving change, where two local
midnights are 23 or 25 hours apart. It reads the keys back rather than the instants they
came from, and a comment explains why the rule is inverted there.

Server-side, migration `0013` adds `notification_preferences.time_zone` — an IANA name, not
an offset, because an offset is wrong for half the year anywhere that observes daylight
saving — and `queue_todays_notifications` compares against the person's own date. It also
takes an hour: run hourly rather than daily, and each person is queued when *their* morning
reaches 8am, the queue's unique key making the other twenty-three runs harmless. Somebody
who has never touched the setting falls back to UTC, which is exactly what they had before.

Mirroring that setting was six identical lines in `app/src/calendar/push.ts` and
`mobile/src/notifications.ts` — which is how the timezone would have reached one platform
and not the other. It is one core function now, and while moving it the §6.57 guard caught
that it returned `void` and swallowed its error. It reports one, and both screens show it:
a mirror that failed means somebody who just turned notifications **off** keeps getting
them, which is the direction of this people notice and resent.

#### Proving it

Nothing here is trusted because it passes. Every fix was planted against.

- Restoring the UTC reading in `hasAired`: **34 passed at UTC**, one failure in Los Angeles
  (*"is not offered at any hour of today"*), a different one in Kiritimati (*"is offered
  from the first minute of the day it airs"*). The same one-line bug, invisible at UTC,
  caught from opposite sides by two different tests.
- Restoring the old `getUpcoming`: fails even at UTC, because `from = now` was wrong
  everywhere; Los Angeles fails a second test on top.
- Reverting the scheduler to `current_date`: both new Postgres tests fail, one with nothing
  queued and one with two people queued instead of one. Those two use Kiritimati (UTC+14)
  and Honolulu (UTC-10) — exactly a day apart, so their calendar dates differ by one at
  *every* instant, which is what makes them deterministic rather than dependent on when the
  suite runs.
- Removing the local-hour gate: the *"does not queue before breakfast"* test fails.

The boundary tests that catch all of this are new, and they are the point: today and
tomorrow, at midnight, at 9am, at 5pm, at 23:59. Not `dateAt(3)`.

#### The guard, and the third run

`app/src/wiring/calendarDates.test.ts` bans the four spellings that convert without saying
whose calendar they mean — `toISOString().slice(0, 10)`, `.split('T')[0]`,
`Date.parse(airDate)`, and `` `${day}T00:00:00` `` — across core, web, phone and extension.
Each was planted into a real file and each was caught with the right message.

Its exemption map is **empty**, and that is a result rather than an oversight. `time.ts` was
written expecting to need an entry — it is the file allowed to convert — and does not:
building a date from its parts and reading one back through `getFullYear`/`getMonth`/
`getDate` never needs the UTC spellings at all. So the ban is total, including inside the
converter.

A guard is not enough on its own, because a UTC runner cannot see a UTC bug. `npm run
verify` now runs the core suite a third time at UTC+14 (`test:tz`). That is what makes the
planted proofs above reproducible by anyone, and what stops the next date-handling file
from being written the old way and passing.

Four other guards caught this sprint's own changes without being asked, which is the
argument for having them: the backend-query checker found `time_zone` missing from its
schema (its `alter table … add column` regex required a single space and the migration
wrapped over two lines — fixed, since a guard that stops seeing a column because somebody
reformatted the SQL reports a clean sweep while covering less); the docs checker demanded
`test:tz` be documented; the wiring checker noticed the web re-exporting `syncPreference`
rather than calling it, which reads as the web not using it; and the failure checker found
the `void`.

§7 records what a container still cannot reach: a device whose timezone is its own, a phone
carried across one, and a `time_zone` column that has never been written by a real client.

### 6.67 A device whose clock is wrong

§6.66 fixed *which* calendar a date is read in. This is the other half, and it turned out
to be the more serious one: sync is last-write-wins on `updatedAt`, and `updatedAt` is a
number **the device writes**. Nothing anywhere compared it to anything.

A phone whose clock is a week fast is not exotic — a dead coin cell, a bad NTP server, a
factory-reset tablet with no network yet, somebody who set the date by hand to unlock an
expired trial. Three things followed, all silent, all looking exactly like sync working.

**One device a week fast stopped every other device syncing.** The pull cursor was the
newest `updated_at` the adapter had seen. A row stamped a week ahead therefore moved a
*correct* device's cursor a week into the future, and its next pull asked for everything
later than that. Nothing is. Sync stopped — for everyone, for a week — and the only
symptom was that nothing arrived.

**Rows it touched became unwritable.** Not by the other device, not by the person
correcting their own mistake. Last-write-wins read "next Wednesday beats today", for as
long as next Wednesday was in the future.

**And the same device, once corrected, locked its own outbox.** NTP catches up, the clock
jumps back a week, and every edit made afterwards was older than the entry already queued
— which `enqueue` dropped on the floor. The button worked. The change vanished.

The opposite skew loses just as much, more quietly. A phone a week **slow** pushes rows
carrying a week-old timestamp, and every other device's cursor is already past them: the
row is on the server and nobody ever sees it.

#### Two columns, two jobs

The mistake underneath all of it is that one number was doing two jobs.

- **`updated_at`** — when the device says the change happened. Still the client's, because
  it is the only thing that can say which of two offline edits the person made second.
  Now clamped server-side so it can never be in the future.
- **`synced_at`** — when this server learned of the row. Entirely the server's, never
  accepted from a client, and what the pull cursor reads (migration `0014`).

Making the cursor server-assigned is the half that matters most. It makes paging correct
whatever any device believes the time is, and it fixes the slow-clock case at the same
time: the row's `synced_at` is now, so everyone sees it, even though it honestly claims to
have been edited a week ago.

The trigger also does something that was assumed everywhere and implemented nowhere:
**refuses a stale write.** `MemoryBackend` compares timestamps on push and its comment says
it "implements the same last-write-wins semantics the real server must" — the real server
did a plain upsert, so whoever pushed last won regardless of when they actually made the
change. Two devices offline for a week resolved by who happened to reconnect second.
Returning `null` from a `BEFORE UPDATE` trigger skips the row entirely, so `synced_at` does
not move either and nobody is woken to fetch a row that did not change.

#### Correcting at the source

The server can only clamp what reaches it. The client also needs to stop writing wrong
numbers in the first place, and there is a free reference for that: **every HTTP response
already carries a `Date` header.** `core/src/sync/clock.ts` learns the offset from requests
that were happening anyway — an auth refresh, a profile read, a push — halves the round
trip to allow for one-way delay, persists it, and `syncedNow()` is what every `updatedAt`
in the product now comes from. No extra round trip and nothing new on the wire.

Two other rules need no clock at all, and both were being decided by one:

- **An unstamped `enqueue` always supersedes what is queued.** It is happening now, in this
  process, after whatever is already there — later by construction. Only an explicit
  `updatedAt`, which the importers pass because they know their own order, is compared.
- **A pending local edit always wins over a remote change.** That sentence was already in
  `applyRemote`, and the line under it compared timestamps and did something else. On a
  slow device the person's own change lost to the thing they had just replaced.

What this deliberately does **not** become is a Lamport clock. A per-device counter is the
correct answer to "which write came after which" and does not involve wall time at all — it
also changes the wire format, the schema, and the meaning of every row already written.
Named in §7 as the thing this is not.

#### The other bug in the same file

While reading the sync path, something worse than the clock: **`SupabaseBackend.fromEnv()`
— the only backend the running app ever builds — called `createClient` itself.**
`sync/auth.ts` keeps the session under its own `storageKey`, and on a phone in AsyncStorage,
so that second client had never seen a session on either platform. Every sync therefore
raised *Not signed in*; that was classified **non-retryable**; and the engine deletes a
batch that fails permanently. Everything written offline, dropped from the outbox, silently,
on the first attempt.

Nothing caught it because **nothing had ever called `fromEnv`**. Both sync test files
construct `new SupabaseBackend(client)` with a client they signed in themselves, so the
tested path and the shipped path were not the same path — this repository's oldest recurring
shape, in the subsystem where being wrong loses somebody's history.

Two fixes. `fromEnv` reaches for the shared client. And *Not signed in* is retryable now,
because the engine's delete-on-permanent-failure is right for a row the server will never
accept and catastrophic for a failure about the **request** — a session expiring mid-sync
would take the queue with it.

#### Proving it

Every fix was planted against, and each plant is the bug it claims to be:

| planted | what failed |
|---|---|
| `Date.now()` instead of `syncedNow()` | the corrected stamp, and the slow device's edit |
| the enqueue comparison made unconditional again | the outbox lock, and the mid-push edit |
| the cursor clamp removed | the other device stops pulling |
| `applyRemote` compares timestamps again | the pending edit is overwritten |
| the trigger's future clamp removed | a future `updated_at` is stored |
| the trigger's stale-write check removed | an older write overwrites a newer one |
| `fromEnv` builds its own client | both halves of the one-client guard |

The Postgres half runs against real Postgres with the real migrations, so the guarantee is
the trigger's rather than a mock's. `app/src/wiring/oneClient.test.ts` holds the rule that
caused the second bug: exactly one `createClient` in the product's own source, and
`fromEnv` must reach for it.

#### What the fixture was hiding

`MemoryBackend` hands out a **monotonic sequence number** as its cursor. The real backend
derives one from a timestamp. So every engine test ever written has run against a server
that *could not have* the worst bug in this sprint — a fixture smaller than reality (§6.43)
in the one subsystem where being wrong loses data. The reproduction needed a second fake
whose cursor is a timestamp, and that fake is now in the suite beside the tests it exists
for.

#### The clocks that are fine

Not everything that reads `Date.now()` wanted correcting, and saying which is part of the
work. `isStale(fetchedAt)`, `expireMetadata`, the calendar's refresh throttle, the anime-id
TTL and `resumeFor` all compare two of *this device's own* timestamps — an offset cancels
exactly, and correcting one end and not the other would introduce the error rather than
remove it. A clock that *jumps* still perturbs them, and the cost is bounded and
self-healing: a cache that refreshes early, or waits longer than it should, once.

One place was not survivable. `usePlaybackClock` measures elapsed time across a whole
episode from a wall-clock anchor, so a two-minute correction half an hour in would move the
timecode two minutes and file every reaction after it at the wrong moment — in the flagship
feature. It uses `performance.now()` now, which is monotonic by definition.

#### Saying so

Sync corrects itself and needs no help. Everything else this app says about time cannot be
corrected from here — what aired today, what is coming this week, which day a watch is filed
under — so a device more than an hour out is told, once, on Settings and the phone's Data
screen: *"This device's clock is about 3 days out. Your history is safe and syncs correctly,
but dates and what is airing will look wrong until it is fixed."* The bar is deliberately
high; a few minutes is invisible and a warning about it would be noise. An unknown offset
says nothing at all, which is most people, because most people have never signed in.

### 6.68 What has never run

§6.67's second bug was not a logic error. `SupabaseBackend.fromEnv()` is the only backend
the shipped app ever builds, it was catastrophically wrong for the life of the product,
and **nothing had ever called it** — both sync test files construct the backend with a
client they signed in themselves. The tested path and the shipped path were different
paths.

No guard here can see that class. `coreWiring` asks whether an export is *reached from
somewhere*, and `fromEnv` was reached — by `driver.ts`. Nothing asks whether a line has
ever **run**. So, for the first time in this repository: measure it.

#### Distrusting the measurement first

Per workspace, a coverage report is wrong in both directions and silent about it.

`core/src/devices/relayUrl.ts` came back **entirely dead** — every statement, zero
executions. It is executed on every run, by `relay/src/pairing.test.ts`, which lives in a
different workspace. `--coverage.include='../core/src/**'` is ignored: the reporter only
ever emits files under the project root. And `core/src/data/adapters/sqlite.ts` came back
65/127 with every table accessor dead, because the run being measured was the Dexie
config and SQLite is a separate one.

A report that names live code as dead is the dangerous direction — it sends somebody to
delete it. Which is why the file list was checked against what the suites obviously do,
before a single conclusion was drawn from the numbers.

`vitest.coverage.config.ts` runs all seven projects in one process from the repo root. The
arithmetic is the check that nothing is missing: 768 + 765 + 300 + 7 + 24 + 24 + 32 =
**1920**, which is what the merged run reports. Under the merged report `sqlite.ts` is
110/127 and `relayUrl.ts` is not on the list at all.

Two smaller traps on the way there. `extends` does not carry a project's `root`, so a
workspace's `setupFiles: ['./src/test/setup.ts']` gets looked for at the repo root and
309 of 312 files fail at once — loud, at least. And `testTimeout` set in the root config
loses to each project's own, so three tests with five-second budgets timed out under
instrumentation and were reported as failures. Instrumentation roughly doubles a suite's
runtime; a timeout it causes is not a finding and must not be printed as one.

#### The workspace nothing tested

Adding up which project produced which number is how the first finding appeared.
`npm run verify` had been printing `7` where the extension should be, and seven is the
*phone's* count. The extension had **no `test` script and no unit tests at all** — and
`npm run test --workspaces --if-present` skips a workspace with no test script **in
silence**. Five hundred lines, reported green by a run that never looked at them.

The same silence, one step later, is `--passWithNoTests`: `mobile` carried it while
holding exactly one test file, so deleting that file would have gone unnoticed.

`app/src/wiring/everyWorkspaceRuns.test.ts` holds the rule now — every workspace has a
test script, contains tests for it to run, and does not pass itself when they disappear —
with an exemption map that is **empty** and a stale-entry check so it cannot fill up with
excuses for workspaces that no longer exist. All three conditions were planted and caught.

The extension has 32 unit tests now, and writing them found a bug (below). Its browser
smoke suite (§6.42) is unchanged and still the only thing that runs the real thing.

#### A film called *Netflix*

`detect()` falls back to the page title when a site's selectors find nothing — which is
the property that makes a rotted selector cost precision rather than function, and is
right. But a browse page's `document.title` is often just the service: Netflix's is
literally `Netflix`, YouTube's home page is `YouTube`. `isConfident` accepted it, because
a film legitimately has a title and no episode number.

So a billboard preview looping past the two-minute gate would be scrobbled at ninety
percent as a film called *Netflix*, straight into somebody's history — exactly the
"silent corruption of history the user has to find and undo" that `isConfident`'s own
comment says it exists to prevent. `parseTitle` already strips a trailing " – Netflix"
from an episode's title; nobody had considered the case where the service name is the
whole of it.

#### Five things in the middle of the product

Filtering the merged report to *pure, local, session-free* functions — no account, no
network, no browser, nothing that §7 already excuses — left a short list, and it was not
where anyone would have guessed:

- **`addToWatchlist`, `setWatchlistNote`, `removeFromWatchlist`.** Three of the plainest
  functions in the product, under a headline feature, with zero executions. What they
  have to do is not plain at all: each must reach the *outbox* as well as the table, and
  a delete that skips it is the `clearRating` bug — it looks like it worked and the next
  pull puts it straight back.
- **`getPreference` / `setPreference`** for notifications — including the **default**
  somebody gets without choosing, which §6.55 spent a sprint arguing is a decision like
  any other.
- **`getRegion` / `setRegion`.** Where-to-watch is entirely a statement about one
  country; every pure function *around* these was tested and the two the screen calls
  were not.
- **`deviceTimeZone`**, written last sprint and never run.
- **`getProvidersCached`.** §6.58 rewrote this function's whole shape so a failure could
  be told apart from an empty answer — the named bug class of this repository — and the
  fix had never been executed. It could not be: there was no way to make a provider
  *fail*, since the fixture catalogue always succeeds and the real one needs a token and
  a network. A `setProvider` seam, in the house style of `setDatabase`/`setStorage`, and
  the distinction now has eight tests instead of a comment.

Forty-one new tests across the five, and none of them found a second bug. That is worth
saying plainly rather than dressing up: the code was right, and it was right *unverified*,
which is a different thing from being right.

#### What this deliberately is not

There is no threshold and no percentage in `verify`. A number drifts, can be raised by
testing the easy half, and says nothing about which line matters — the standard here is a
named guard that fails for a stated reason. `npm run coverage` prints the two lists worth
reading (files nothing entered, functions nothing called) and is documented in the README
as something to run and think about, not something to satisfy.

§7 records what it still cannot see: the five browser suites drive a *built bundle*, so
every screen in both apps shows as untouched and none of that is evidence of anything.

### 6.69 Leave it running for an episode

Every axis so far has been about *what* the code does. This one is about **duration**, and
about doing a thing more than once. §6.54 filled the database with ten years of history —
that is size, not time. The longest anything in this repository had ever run was a check
measured in seconds, and every one of them did each thing exactly once.

Watching Mode is a screen somebody leaves open for forty-five minutes and steps away from
repeatedly. Two things were wrong with it, and neither could be seen by doing anything
once.

#### Two fifths of the reactions never appeared

Retirement was one element every `TRAVEL_MS / 2`, whatever had finished:

```js
setTimeout(() => setFlying((c) => c.slice(1)), TRAVEL_MS / 2);
```

The density cap held — twenty-four mounted, twenty-four on screen — so nothing looked
wrong. The cost was paid where nobody was measuring. A reaction crosses in 4.8 seconds and
its slot then stayed taken for up to another fifty, while `room = density - flyingCount`
refused every arrival meanwhile.

Measured over five minutes of a busy episode, one reaction a second:

| | reactions shown | rate |
|---|---|---|
| before | **116 of 300** | 20 a minute |
| after | **300 of 300** | everything |

Twenty a minute, against the twenty-four slots × four seconds visible that the design
allows — which is three hundred. And the ones shown were an arbitrary prefix, because
`due.slice(0, room)` takes the earliest. *"You still see everything everyone else left at
that moment"* is what this screen is for, and it was showing two fifths of it.

Retirement is by age now: each arrival carries the moment its crossing ends, and a
250 ms sweep drops everything expired. The cap still binds where it should — at ten
reactions a second the peak on screen is twenty-four, which is §6.13's readability limit
doing its job rather than an accident of the drain rate. Held still means held: WCAG
2.2.2's pause freezes the animation, so the time spent paused is added back to every
deadline on release rather than sweeping a screen somebody asked to hold still.

#### Step away twice and the clock dies

The larger one, and it needed three round trips to show.

```js
const saved = resumeFor(targetId);
clock.seek(saved.positionMs);
if (!saved.running) clock.pause();
```

`seek` moves the anchors and the position and says nothing about *running* — and a
freshly-mounted clock is stopped. So an episode that was playing came back showing the
right timecode with the clock dead.

What made it invisible is that the **first** return still looked correct: `resumeFor` had
already advanced the position by the time spent away, so the number really was further on.
The effect that persists the clock then wrote `running: false`, and from that moment the
timecode never moved again — a plausible number, frozen, for the rest of the episode, with
every reaction landing on it.

The existing check — *"and further on, because the episode did not stop"* — has passed
since doc 10 §2, because it does exactly one round trip. Three of them read `0:06 → 0:06`.

Isolating it mattered. The first run of the new block failed that check *and* the timer
census, and the obvious reading was that the instrumentation had broken something. Running
the three round trips with no instrumentation at all reproduced the freeze on its own; the
timer census was the thing that was wrong, and separately.

Both platforms had the same line and both are fixed.

#### Two checks were asserting the bug

`'and offers to resume rather than to start'` looked for a *Resume* button and found one —
because the restored clock was wrongly stopped, and the transport is labelled "Resume the
clock" when it is not running. The check passed on the strength of the defect. It says what
it was always trying to say now: the screen does not offer to *start* something already
under way, and it comes back running.

That is the third time in this project a check has turned out to encode the behaviour
rather than the intent, and it is the reason a fix has to be watched for what else it
breaks rather than only for whether its own test goes green.

#### What was fine

Worth recording, because the sprint went looking for a leak and did not find one.

- **No unbounded growth.** `ownFlown` grows with your own taps and the episode's history,
  both bounded by a person. `pending` in the announcer clears every ten seconds. `seq` is
  a number.
- **The extension's scrobble state machine**, flagged in #115 as never unit-tested and a
  candidate for exactly this: `scrobbled` is `slice(-200)` and `pending` is `slice(-50)`.
  Somebody had already thought about it.
- **Timers stop when the screen does.** Three visits leave the same number of live
  intervals as none, counted from Up Next both times.

#### What it costs to check

Six unit tests over a simulated episode — twenty minutes of playback at a reaction a
second, in about two seconds of wall clock — plus three checks in the browser suite. The
browser half is three round trips, not forty-five minutes: what breaks over an episode
breaks per visit, and a check that needs an hour is one nobody runs.

§7 records the honest limit: the clock is simulated in both halves. What is exercised is
the component's arithmetic and the screen's state handling, not forty-five minutes of a
real browser's garbage collector, and a headless Chromium in a container is not a phone
holding twenty-four compositor layers.

### 6.70 Do everything twice

Both bugs in §6.69 came from repetition rather than duration. The reaction stream was fine
for one arrival and starved from the second onward; the clock was fine for one round trip
and dead from the second — and the check that should have caught it has passed since doc
10 §2 because it leaves and returns exactly once. That looked like a class rather than a
coincidence, because **every check in this repository does each thing once.**

It is a class. Two more, both in the part of the product that is hardest to notice going
wrong: somebody's history.

#### Undo a watch and sync stops working

The outbox coalesces on `table:pk`, so a delete queued before its insert has gone out does
not follow it — it **replaces** it. A tombstone is an upsert with `deleted: true`, and the
client had been sending nothing but the key:

```js
await enqueue('watches', { id: latest.id }, { deleted: true });
```

So what reaches the server is a row it has never seen, carrying an id and nothing else.
Every not-null column is missing. Proved against real Postgres with the real migrations,
for all four syncable tables — `watches` wants `target_id` and `watched_at`, `ratings`
wants `value` and `rated_at`, `watchlist` wants `kind` and `added_at`, `library` wants
`kind`, `status` and `added_at`.

Postgres raises **23502**. `classify` does not list it among the permanent codes, so it is
*retryable*: the entry never leaves the queue. And `syncOnce` returns on a push failure —
so **every later write is stuck behind it, for ever**, with nothing on screen to say so.

Mark an episode and undo it before your next sync, and sync stops working. §6.64 added
that Undo button precisely because marking is the action done in the dark one-handed and
most likely to be a mis-tap, which makes this a designed flow rather than a mishap.

Every tombstone carries its whole row now — seven sites across `repo.ts` and
`reconcile.ts`. `core/src/sync/tombstones.test.ts` reads the not-null columns **out of the
migrations** and checks what the client actually queues against them, so a column added
tomorrow is covered without anybody remembering the file exists. Planted back, it names
exactly what is missing: *"watches tombstone is missing target_id, watched_at"*.

#### Import the same file twice and an undated history doubles

`importWatchHistoryCsv` keyed each watch as `` `${targetId}@${watchedAt}` `` — deterministic,
so re-importing overwrites rather than duplicates. Except `watchedAt` falls back to
`Date.now()` when the file carries no date, and then every import invents new ids.

| | first import | second | third |
|---|---|---|---|
| dated CSV | 2 watches | 2 | 2 |
| **undated CSV** | 2 watches | **4** | **6** |

Re-importing after a first attempt that seemed to do nothing is an ordinary thing to do,
and this is a product whose entire pitch is rescuing histories somebody else deleted.
Silently doubling one is close to the worst thing it could do.

The row's position stands in for the timestamp when there isn't one: stable across
re-imports, and still distinct for the same episode appearing twice — which the old
spelling got wrong in the other direction, collapsing two undated watches of one episode
into a single row *within a single import*, because they shared a target and a `Date.now()`.

The other importers were already right: the TV Time rescue tool and the DioCache reader key
by `` `${targetId}#${i}` ``, and a Reviewies export carries its own ids and `bulkPut`s over
itself. Recorded because "already right" is worth knowing as precisely as a bug is.

#### What held up

Said plainly rather than dressed up, because most of the sweep found nothing:

- **Mark, unmark, mark again.** Watches are events with their own ids, so the third act is
  a new row and the tombstone survives it. One watch in the database, one tombstone and one
  insert in the queue.
- **Rate, clear, rate again** and **watchlist add, remove, add.** Both are keyed by target,
  so all three acts land in one outbox slot and the last one wins — which is what should
  happen. The value the person ended on is the value that goes out.
- **Track, drop, track again.** One library row, the final status.
- **Every screen, three times.** Search, Discover, Watchlist, Stats, Upcoming, Lists,
  People — twenty-one visits, every one rendering, and no timers left behind. Now three
  checks in the browser suite, because the Watching Mode bug was exactly this shape and
  nothing had asked the question of anywhere else.
- **Pushing the same change twice** after an ambiguous response was already covered by
  `engine.test.ts`, and still is.

#### The method

Same as last time, and it is becoming the point. Reproduce first — the tombstone finding is
four `rejects.toThrow` against real Postgres written *before* any fix, and the import one is
a printed count of 2 → 4 → 6. Then fix. Then plant the old behaviour back and watch the new
checks fail for the stated reason rather than for some other one.

Nothing else broke this time, which is worth noting after §6.69 found two checks that had
been asserting a bug. `npm run verify` went from 768 to 783 in the core with no existing
check turning red.

§7 records what is still untried twice: signing out and back in, which needs the service
key this checkout has never had.

### 6.71 A queue that cannot drain, and nobody told

§6.70 found a tombstone the server could never accept. That was one row. The machinery
around it was worse in three separate ways, and none of them had ever been looked at.

#### One bad row deleted two hundred good ones

```js
if (retryable) await outbox().update(entry.key, { attempts: current.attempts + 1 });
else await outbox().delete(entry.key);
```

`entry` there is every entry in the batch. Postgres fails the *statement*, not the row, so
a permanent failure meant the client had no idea which of up to two hundred writes was the
problem — and deleted all of them. One malformed tombstone could take a hundred and
ninety-nine watch events with it, silently, from a product built to rescue exactly that
data from somebody else deleting it.

The queue now **bisects** a failed batch: push each half, recurse into whichever halves
fail, and a batch of one that fails is the answer. At most `log2(batch)` extra requests, on
a failure that is already rare, and everything that succeeds on the way is genuinely
delivered — the isolation *is* the push, done in smaller pieces.

#### And the alternative to deleting was blocking for ever

The other branch was no better. `syncOnce` returns on the first failed push, so an entry
the server refuses and calls retryable sits at the front of the queue holding up every
later write — indefinitely. That is what §6.70's tombstone did.

So the binary was wrong. There are three outcomes, not two:

- **Try again** — transient: a network that went, a 500, a session being refreshed.
- **Set aside** — the server will never take this row as it stands. Out of the queue so
  the rest can drain, and **kept**, because deleting somebody's write to unblock an upload
  is the one outcome that is never acceptable.
- Never *silently drop*, which is what the code did.

A new local table holds what was set aside, with the server's own words for why. Retryable
failures also stop after twenty attempts — roughly a day at the driver's interval —
because a row the server calls transient and refuses every time is the same jam wearing
different clothes. Retryable should buy patience, not immunity.

#### The classifier was four codes and a guess

`classify` decided permanence from `{42501, 23514, 23503, 22P02}`. Everything else retried,
including the 23502 that jammed the queue.

The reason it was so short is now visible: while "permanent" meant *delete the person's
write*, timidity was the right instinct. Once permanent means *set aside*, the list can be
honest. Each code below was observed by making real Postgres reject the shape, in
`app/src/backend/schema.test.ts`, rather than read off a reference page:

| shape | code | decision |
|---|---|---|
| tombstone with no not-null columns | 23502 | permanent — §6.70's jam |
| library status outside the four | 23514 | permanent |
| rating outside the scale | 23514 | permanent |
| rating with too many digits | 22003 | permanent |
| a column the schema does not have | 42703 | permanent, uncomfortably |
| a uuid that is not one | 22P02 | permanent |
| a duplicate the conflict target missed | 23505 | permanent |
| **a user with no profile row** | **23503** | **retryable — changed** |

Two of those deserve their reasoning said out loud.

**42703** is not literally permanent: a client running ahead of its backend would work once
the migration lands. It is here anyway, because a client can be ahead for weeks and jamming
every unrelated write behind it for weeks is the worse failure. Set aside and visible beats
invisible — and the retry button exists precisely for the deployment that fixes it.

**23503** moved the other way, off the list. The only foreign key these tables have is
`user_id → profiles`, and a missing profile is a *timing* problem that `ensureProfile()`
fixes on the next run — not a wrong row. Setting somebody's history aside for a reason that
resolves itself would be the wrong kind of caution.

#### Nobody was told

`attempts` has been counted since the engine was written and read by **nothing**. A queue
stuck for a week and a queue that is empty looked identical: no banner, no count, no error
after the first one scrolled past.

`SyncStatus` now carries `rejected` separately from `pending`, because they mean opposite
things to a person — pending is *on its way*, rejected is *not going without help*. Both
platforms say so, from one sentence in the core:

> *N changes could not be saved to your account. They are safe on this device and nothing
> is lost.*

The second half is the part somebody needs, and it is true: the write is in the local
database where it was made, and what failed is only the copy going up. Beside it, a button
that puts them back in the queue.

#### The plant that did not fail

Three plants, and the third one passed — which is the finding.

Commenting `'23502'` out of the permanent set left every check green. The guard read the
`new Set([...])` block **with its comments in**, so a code commented *out* was still
"listed". A guard that reads prose as code catches nothing, and this repository has now
found that shape three times (§6.41's skip list, §6.63's JSX detection, and here). Comments
are stripped first now, and the replanted version — commented out *and* deleted outright —
fails both ways.

The other two behaved: dropping the isolation step fails five checks, and removing the
attempts ceiling fails two.

#### Three guards caught the new table without being asked

Worth recording, because it is what they are for. Adding a local store broke the export
promise check (every user-data table must be in the export — `rejected` is bookkeeping and
holds *copies* of rows already exported, so exporting it would put the same watch in the
file twice), the v1-database upgrade check (a new store needs a new Dexie version, and the
check queries it through its index rather than by key), and the wiring check (`rejectedEntries`
was an export nothing reached — deleted rather than exempted, since the screens want a count
and a button).

§7 records the limit: none of this has run against Supabase. The classifications are real
Postgres and the engine's behaviour is a fake that models statement-level failure, which is
the part that matters — but no row has ever been set aside by the deployed backend.

### 6.72 Plant a comment, not a change

Three times this project had caught a guard reading prose as code — §6.41's skip list,
§6.63's JSX detection, §6.71's permanent-code set. The third was luck: it happened to be
the plant I chose. §107 planted a violation against every guard and that was the right
idea, but **every plant was code**. Nobody had ever planted a comment.

Twenty guards read source. Each has two ways to be wrong and neither had been asked:

- **False positive** — it fires on the *word*. Not hypothetical: every one of these guards
  carries a long explanation that quotes what it forbids.
- **False negative** — a violation it cannot see because it is commented out, or worse, a
  guard that checks for a *mention* and is satisfied by one.

Both were probed against every guard: a comment quoting the violation (must stay green),
and a real violation commented out (must stay green, then fire when restored).

#### Eleven were already right. Five were not.

| guard | wrong how |
|---|---|
| `screenStates` | **false negative** — a screen named only in a comment counted as driven |
| `dials` | false positive — worked around by excluding one file by name |
| `runnable` | false positive — a commented-out import reported as broken |
| `docs` | false positive — an env switch named in prose demanded documenting |
| `backendQueries` | false positive — a `.from('…')` in a comment checked against the schema |

`dials` is the one worth dwelling on. `relayUrl.ts` had been excluded from its scan **by
name**, because that file's own comment quotes `new WebSocket(VITE_BRIDGE_RELAY)` while
explaining why nobody should write it. The exclusion was scar tissue from exactly this
bug, applied without anybody naming the cause. Stripping comments makes it unnecessary,
and it is gone.

Eight guards had each written their own copy of the same three-line stripper and five had
none at all. There is one copy now, in `core/src/test/source.ts`, with its own tests —
including the one every hand-rolled version gets wrong eventually: `https://` is not a
comment.

#### And then the finding underneath the finding

`screenStates` asks whether the suite that claims to render a screen ever mentions it. Its
route-to-word step was:

```js
.replace(/\/\[?[\w:.]+\]?$/, '')   // meant to turn /title/:id into title
```

A slash followed by word characters at the end of the string is also exactly what
`/people` is. So every single-segment web route reduced to the empty string — and the
`if (!segment) continue` two lines below passed silently over it.

**Eleven of the fourteen web screens claiming a suite renders them had never been
checked**: `/search`, `/watchlist`, `/discover`, `/calendar`, `/lists`, `/people`,
`/stats`, `/settings`, `/more`, and the two that genuinely reduce to nothing. Only the
three carrying a parameter survived their own segment extraction. The phone was
unaffected, because expo-router spells its routes without a leading slash — which is why
the guard looked like it worked.

The comment beside that line said `/` and `*` reduce to nothing on purpose. It was right
about those two and wrong that they were the only ones, and the skip made the difference
invisible. Both halves now fail correctly: a screen mentioned only in a comment, and a
screen removed from the suite outright.

#### Two of my own plants were wrong before the guards were

Worth recording, because the method is the point and it misfired twice.

The first `runnable` plant put a broken import in `core/src` — which `runnable` does not
scan. It scans `scripts/` and `supabase/functions/`. A green result there proved nothing,
and re-running it inside the real scope turned it red immediately.

The second was better: a plant that removed every mention of *stats* from the web suite
used `PLACEHOLDERSTATS` as the replacement — which lowercases to something containing
`stats`. The guard searched case-insensitively, found its own word inside my placeholder,
and passed. A plant that defeats itself is indistinguishable from a guard that works.

Both are the same lesson as the sprint itself: a green result is a claim, and the claim
has to be checked before it is believed.

§7 records what is still not asked of these guards: nothing plants a violation inside a
*string literal*, which is the third way a text scan can be fooled and the one this
sprint did not get to.

---

### 6.73 What each guard actually proves, against what its name says

§6.72 asked whether the guards could be *fooled*. This one asks something narrower and
more embarrassing: whether each guard's title is true. Sixteen suites in
`app/src/wiring/` are named as claims — *every workspace runs*, *the copy file is used*,
*every screen has a driven state*. A title is what the next person reads instead of the
assertions. If the assertion is weaker than the title, nobody finds out by reading.

Every claim was re-read against its own body, and where the two disagreed the gap was
proved by building the thing the title forbids and watching the suite stay green.

#### A workspace with tests, a test script, and a runner that collects none of them

`everyWorkspaceRuns` was §6.68's answer to a workspace nothing tested. It checks that
each workspace is listed, has a `test` script, and has test files on disk. All three were
true of `mobile`. Its `include` was:

```js
include: ['src/**/*.test.ts']
```

expo-router puts screens in `app/`, and screens are `.tsx`. So the pattern excluded two
entire categories at once — everything under `app/`, which is nearly all of this
workspace's code, and every `.tsx` test anywhere.

Proved by dropping a deliberately failing test into each place:

```
$ npm run test --workspace mobile
 Test Files  3 passed (3)
      Tests  7 passed (7)
```

Two failing files sitting on disk, and both the runner and the guard reported the
workspace covered. That is §6.68's silence one layer down: §6.68 asked *is there a
runner*, and the honest question is *what does the runner collect*.

The fix is one line in `mobile/vitest.config.mts` — `include: ['{src,app}/**/*.test.{ts,tsx}']` —
and a fourth check that stops guessing from filenames and asks:

```js
npx vitest list --filesOnly   // run in each workspace, compared against what is on disk
```

Planted both ways: narrow the `include` again and the guard names the excluded files;
delete a test file and the disk side shrinks with it.

#### The string literal, from §6.72's last paragraph

§6.72 closed by recording the one probe it had not run: a violation inside a **string
literal**, which reads as code to a regular expression and as data to a compiler. It was
run against all twenty guards. Five fired — `dials`, `calendarDates`, `oneClient`,
`runnable`, `backendQueries` — and three that might have been expected to did not.

They stay that way, and the reasoning is now in `core/src/test/source.ts` beside the
stripper rather than in a sprint note:

- Stripping strings would **blind the guards that read them**. `screenStates` asks
  whether a suite names a screen; `commands` reads fenced shell lines; `copy` compares
  sentences. All three work by reading string content. That is a real loss traded for a
  hypothetical one.
- All five are **false positives**, on input nobody writes: a file containing the literal
  text of a banned construct without performing it. A false positive fails loudly at the
  moment of the edit and is understood in a minute. A false negative is silent for a
  year — which is the entire subject of §6.72.

§7 records this as deliberately unfixed rather than done, because that is what it is.

#### The one title that was doing less than it said

Most claims survived the audit. `numbers`, `shape`, `openState`, `failureShown` and
`commands` all assert the thing on the label; several assert more.

`copy`'s did not. Its last check reads:

> `it('is used, rather than being a file of strings nobody reads', …)`

and its body was `expect(importers.length).toBeGreaterThan(8)`. That proves the *file* is
imported by nine screens. It says nothing about any particular sentence, which is what
"strings nobody reads" sounds like it covers.

Proved by adding a group to `COPY` and referencing it from nothing. All **75** wiring
tests passed. The words sat in the file looking maintained.

This grows more likely as the file grows — `COPY.sync.*` arrived in §6.71 and
`COPY.app.*` in §6.65. If a screen stopped rendering one, the sentence would remain, and
the next person to edit it would be editing something nobody sees. Two checks now walk
every leaf of `COPY` and grep the stripped sources of `core/src`, `app/src`, `mobile/app`
and `mobile/src` for `COPY.<group>.<name>` — with the §6.41 exemption map and its
staleness check, currently empty. Three plants fire: an orphan group, an orphan leaf, and
a stale entry in the exemption list.

The haystack includes `core/src` on purpose. Two sentences are read there and nowhere
else: `time.ts` formats a day with `COPY.calendar.today`, and `sync/clock.ts` builds its
warning from `COPY.app.clockWrong`. A guard scoped to the two app trees would have called
both of them orphans on its first run.

#### What this sprint is really about

Three sprints in a row have found the same shape and it is worth naming: **a check that
is easier to satisfy than its name suggests is worse than no check**, because the name is
what gets trusted. §6.68 shipped a guard called *every workspace runs* that could not see
a runner collecting nothing. §6.72 shipped guards that read prose as code. This one
shipped a claim about sentences that only knew about a file.

The method that finds them is the same every time and it is not reading: build the thing
the title forbids, run the suite, and require it to go red.

---

### 6.74 A test that is collected, run, and proves nothing

§6.73 taught the runner to say which files it collects, and admitted in the same breath
what that leaves open: a file can be collected, and a test inside it can run to
completion, and still prove nothing. That failure is completely silent — it adds one to
the passed count like every other test.

Four classes were swept across all six workspaces: a test with no assertion at all, an
assertion that cannot fail, an assertion inside a loop that may never run, and — one
level up — a check whose needle is satisfied by something present on every screen.

#### The check satisfied by the tab bar it navigated away from

The web smoke suite opens four screens against a ten-year library and times them:

```js
for (const [path, expected] of [
  ['stats', /Watched/i],
  ['calendar', /Upcoming|Tell me about/i],
  ['watchlist', /Watchlist/i],
  ['discover', /Discover/i],
]) { … check(`${path} renders against a real library`, expected.test(body) && ms < 20000) }
```

The tab bar prints **Up Next · Search · Discover · Watchlist · More** at the bottom of
every screen in the app. Two of those four needles are tab labels.

Proved by pointing all four at `/zzz-not-a-screen`, which renders the not-found screen —
the plant carrying its own control:

```
FAIL  stats renders against a real library — 5769ms
FAIL  calendar renders against a real library — 5763ms
PASS  watchlist renders against a real library — 932ms
PASS  discover renders against a real library — 721ms
```

The two screen-specific needles failed, as they should. The two tab words passed against
a screen that is not a screen. And the timings say the rest of it: the `waitForSelector`
in front of each check also matched the tab bar, so it returned in under a second instead
of waiting for anything, which made the `ms < 20000` half meaningless too. A performance
check that never waited for the thing whose performance it was measuring.

A level-1 heading is what says a screen rendered — the not-found screen's is "Nothing at
this address" — and the navigation block twenty lines above this one was already doing
that correctly. Both now go through one `arrivedAt(target, heading)` helper, and the
suite proves its own instrument on every run:

```js
await page.goto(`${BASE}/zzz-not-a-screen`, …);
check(
  'an address that is not a screen does not count as arriving at one',
  (await arrivedAt(page, /^Nothing at this address$/, 5000)) &&
    !(await arrivedAt(page, /^Watchlist$/, 2000)) &&
    !(await arrivedAt(page, /^Discover$/, 2000)),
);
```

That is the difference between fixing two checks and keeping them fixed: an instrument
that has stopped discriminating reports exactly the same green as one that works.

The fixed check also puts a number on what was being skipped. Waiting for the real
heading, `watchlist renders against a real library` takes **6,959ms** against the
ten-year library. The tab-bar version reported 932ms — it had been timing how long the
navigation took to paint, on a screen it never reached.

#### Two assertions that could not fail, and the scenario underneath them

`engine.test.ts` had a test called *does not clobber a pending local edit with an older
remote one*:

```js
expect(result.conflictsResolvedLocally).toBeGreaterThanOrEqual(0);
expect((await db.watchlist.get('x'))?.note ?? 'mine').not.toBe('theirs');
```

A count is never below zero. And `?? 'mine'` hands the second assertion a passing value
whenever the row is missing altogether — so a sync that lost the edit entirely read the
same as one that kept it.

Tightening both to `toBe(1)` and `toBe('mine')` turned it red, and the reason is the
finding: `conflictsResolvedLocally` was **0**, because the scenario in the name never
happened. The engine pushes before it pulls, and the push supersedes the older server
row, so the conflict path is never reached from here. It cannot be reached from here at
all — a failed push returns before the pull runs. The case the name described is driven
in `clockSkew.test.ts` (§6.67), which makes the second edit *during* the push.

So the test now asserts the ordering it actually exercises, under a name that says so,
with three assertions that can all fail — proved by seeding the server row one second
newer, which turns it red on `'theirs'`.

#### Skips were enumerated in one workspace out of six

§6.40 built `skips.test.ts` so that "811 passed | 34 skipped" could not hide an `it.skip`
from a debugging session among nine live suites waiting on credentials. Every skip is
listed with what it needs and what it uniquely covers, and an unlisted skip fails.

It scanned `core/src`. Planting `it.skip` in `app/src`:

```
core   $ vitest run src/data/skips.test.ts   →  Tests  4 passed (4)
app    $ vitest run src/wiring               →  Tests  77 passed | 1 skipped (78)
```

The guard was satisfied, and the only trace was a number in a different workspace's
summary that nothing reads. The scan now starts at the repository root and walks every
workspace named in `package.json`, so a new workspace is covered the day it is added
rather than the day somebody remembers this file — with a check that each one was
actually reached, planted by making the walker skip `extension` and watching it name it.

#### A loop that may never run

`schema.test.ts`'s *comes back in timeline order* puts every assertion inside
`for (let i = 1; i < sampled.length; i++)`. An empty or single-row sample passes it
without comparing anything — and an empty sample is precisely the failure that sampling
is most likely to have. One line in front of the loop fixes it.

Twenty-four tests across the repository have every assertion inside a loop. Twenty-three
of them iterate a literal table written into the test, which cannot be empty. This was
the one that iterated something the code under test produced.

#### What the sweep did not find

Worth recording, because the point of a sweep is the shape of the answer, not only the
findings:

- **No test anywhere lacks an assertion.** All 1,192 of them were read.
- **No `await expect(…)` is missing its `.rejects`/`.resolves`** — the mistake that turns
  an async assertion into a promise nobody waits for.
- **No `catch` swallows an assertion.**

The first of those is now held by `app/src/wiring/assertions.test.ts`, which walks every
workspace and accepts either `expect(` in the body or a call to an `expectSomething(`
helper declared in the same file that asserts on its own — `tombstones.test.ts` has two
of those and inlining them would make the suite worse to read. Three plants fire: a test
that asserts nothing, an exemption for a test that asserts after all, and a parser that
finds nothing at all.

#### The scanner was wrong twice before the tests were

Same shape as §6.72's two bad plants, and worth the same paragraph.

The first pass reported **35** assertionless tests. Its match for a test declaration was
`\b(it|test)\s*\(` — and `\btest(` is also the tail of `/\.tsx?$/.test(entry.name)`. Every
regex `.test(` in a guard read as a test declaration whose body was the argument list, so
of course none of them asserted. Fifty-four phantoms, all reported as findings.

The second pass fixed that and found bodies by matching braces — which a brace inside a
string or a regex character class ends early. Eleven files misread.

Both are the same lesson as §6.72: a scan of source text is fooled by source text. There
is now a `blankLiterals` beside `stripComments` in `core/src/test/source.ts`, with its own
tests, and the two are deliberately different readings of a file: `stripComments` leaves
strings alone because guards read them, and `blankLiterals` blanks everything because a
caller looking for *structure* must not see text at all. No guard should use both
readings for the same claim.

---

### 6.75 Change a line and see whether anything notices

Every guard in this repository is proved by planting the one violation its author had in
mind. §6.74's closing line admitted what that leaves open: nobody had ever asked the
other question — **which lines can be changed with every suite still green.**

A throwaway harness answered it. One mutation at a time: write it, run the suites that
could see it, record whether anything went red, put the file back. Six modules, chosen
highest-stakes first.

| module | mutants | killed | survived |
|---|---|---|---|
| `sync/engine.ts` | 47 | 34 | 13 |
| `data/repo.ts` | 64 | 48 | 16 |
| `calendar/upcoming.ts` | 33 | 28 | 5 |
| `watching/reactions.ts` | 34 | 14 | 20 |
| `time.ts` | 16 | 12 | 4 |
| `sync/clock.ts` | 14 | 4 | 10 |

That is 208 mutations and 68 survivors, and the number is the least interesting thing
here. Where the survivors clustered is the finding.

#### Half the survivors were an artefact of how the run was scoped

Running the whole package for every mutation costs 51 seconds; running only the directory
a module lives in costs 12. The fast version was used to triage, on the understanding
that every survivor would be re-run against a wider scope before being believed. That
step was not a formality:

- **`repo.ts`: 16 survivors became 9.** Seven were killed by `src/sync` and `src/calendar`
  — `syncSeriesStatus` is tested from `engine.test.ts` and `refresh.test.ts`, two
  directories away from the file it lives in.
- **`engine.ts`: 13 became 3**, once the four tests written earlier in this sprint were in
  place and the scope reached `src/data`.
- **`clock.ts`: 10 became 4.**
- **`reactions.ts`: 20 stayed 20.**

A survivor list from a narrow scope is not a finding; it is a shortlist. Reported without
the second pass it would have claimed eleven missing tests that were not missing.

#### A test that measures a constant with the same constant

The sharpest single result. `stuck.test.ts` proves the outbox gives up on a row that keeps
failing:

```js
for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) { … }
expect((await db.rejected.toArray())[0].attempts).toBe(MAX_ATTEMPTS);
```

Change `MAX_ATTEMPTS` from 20 to 21 and it passes, because both halves move together. The
same shape appeared again in `clock.ts`, where a threshold test written *during this
sprint* referred to `NOTABLE_SKEW_MS` and therefore could not pin it. Both now assert
against the other side of the boundary — the attempt before the limit, and fifty-nine
minutes rather than sixty — and the clock one spells the hour out in minutes so the
constant is measured by something that is not itself.

#### Where nothing was watching at all

**`estimateDriftMs` — every one of eighteen mutations survived.** This is the function
that offers to correct somebody's timing mid-episode from the crowd's reactions. It had
seven tests, all of them comfortably inside every threshold: eight seconds of drift
against a two-second bar, three matches against a minimum of three, a ten-minute gap
against a thirty-second window. So the two-second bar, the thirty-second window, the
nearest-match tie-break and the entire even-length half of the median were free to move.
The even branch had never run at all.

The tie-break is the one worth naming. `Math.abs(d) < Math.abs(best)` keeps the first of
two equally distant candidates; `<=` keeps the last. With the crowd split evenly either
side of a tap, those are opposite answers — nudge forwards, or nudge backwards, five
seconds each way. Six new tests kill eight of the eighteen; two of the rest are equivalent
and eight are the Supabase read path, which needs a real server.

**`clock.ts` — 10 of 14.** The `load()` that reads a saved offset back had never run,
because every test in the file starts from a cleared clock and the only reset available
also wiped what was stored. That function is what makes a correction survive the app being
closed; without it every cold start writes wrongly-stamped rows until the first request
returns. It now has a `resetClock({ keepStored: true })` seam — the one thing that reaches
it — and three tests. Reading it back also turned up a smaller wrongness: `resetClock`
writes an empty string, and `Number('')` is 0, so a reset clock reported "the server says
this device is exactly right" rather than "the server has never answered".

**`getStats`'s windows.** The 30-day test put its two watches sixty days and two days back.
A whole extra day of margin is wide enough that thirty-one days, sixty-one minutes in an
hour and a 1,001-millisecond second all still excluded it. The fixture now sits twenty
minutes past the edge. `ytd` had never been asked anything at all — it could have started
on the first of February.

**`hasAired` with no air date.** Flipped to `return true` and nothing noticed. TMDB lists
announced episodes with no date routinely, and reading them as aired is wrong twice over:
Up Next offers an episode that does not exist, and a finished show never completes because
of an undated placeholder at the end of it.

**`syncSeriesStatus`'s return value.** Seven tests check the library row afterwards and
none of them the boolean, so it could claim a change in both cases where there is none.
`refresh.ts` counts those returns into the "3 shows reopened" line after a metadata
refresh.

#### What survives on purpose

Not every survivor is a missing test, and saying so is part of the job:

- **Equivalent.** `setTimeout(…, 0)` → `1`; `airDate.slice(0, 10)` → `(0, 11)` on a string
  that is ten characters; `diff > 1` → `>= 1` under a line that already returned on
  `diff === 1`; two `estimateDriftMs` guards that a later check catches anyway.
- **Unobservable.** `catchUpTo` sorts the episodes it is about to mark; breaking the sort
  changes the order of the writes and nothing anywhere depends on it. The set marked is
  identical.
- **Out of reach.** `MAX_PUSH_BATCHES` is a runaway-loop backstop at 500 batches of 200
  rows; reaching it means a hundred thousand queued writes. The `current &&` in
  `isolate()` differs only when an entry vanishes between being read and being cleared,
  which needs a concurrency hook the suite does not have — and its sibling mutation, the
  one that silently keeps delivered rows queued for ever, is killed by the accounting test
  §6.74 added.
- **Killed somewhere else entirely.** `UPCOMING_DAYS` is pinned in `app/src/wiring/copy.test.ts`,
  because the sentence "the next two months" has to keep matching the number. Confirmed by
  running it with the mutant in place, not by reading it.

#### Three things the run broke that were not mutations

Mutation testing turns out to be a stress test of everything around it, and all three of
these were found by the harness misbehaving rather than by a surviving mutant.

**A guard that counted a word in a comment as a use.** Writing the sentence *"`resetClock`
writes an empty string"* into `clock.ts` made `coreWiring` stop reporting `resetClock` as
unreached — its "a symbol used inside its own module is not dead" rule counts mentions in
the raw source, and the second mention was prose. §6.72 fixed this class in fifteen
guards and this one was not among them, because the plant it was given was a different
shape. Comments are stripped now, and the moment they were, a real difference surfaced
that the same bug had been hiding: **`discoverRokus` is called by the phone and not by the
web** — a browser cannot send an SSDP broadcast — and it now has a written reason like
every other asymmetry.

**A flaky test that killed mutants for the wrong reason.** `scale.test.ts` asserts an
import of 3,000 rows finishes in under twenty seconds, and vitest's default timeout is
five. Running three core configurations at once on four cores, the runner killed it
first — a red saying "timed out" where the number under test was nowhere near breached.
It appeared as the cause of death for several mutants, including `setTimeout(…, 0)` → `1`,
which cannot change behaviour at all. *A green mutation run is a claim; so is a red one.*
Both that test and one in `driver.test.ts` are now told the same number they assert.

**A smoke suite testing a previous run's build.** Four phone checks failed with the
first-run screen showing "All caught up" instead of the migration. Nothing in the diff
explained it: a `serve` from an earlier run still held port 4200, so this run's export was
published on 45303 while `smoke.mjs` talked to the stale one — with the stale one's
browser storage. `serve --no-port-switching` does not work with `-p`, so there is now a
pre-flight, `scripts/portFree.mjs`, that refuses to start when the port is taken and says
which process to look for. §6.74's shape once more: a suite that silently tests the wrong
thing.

#### Where it ended

Twenty mutants still survive across the six modules: twelve in `reactions.ts` (five
user-facing tuning constants, five on the Supabase read path, two equivalent), three in
`engine.ts`, two in `repo.ts`, one in `upcoming.ts`, one in `time.ts` — every one of them
classified above. `clock.ts` went from 4 survivors to none: its final
run is 17 mutants and 17 kills.

The harness is not committed. It is forty lines that write a file and shell out to vitest,
and the interesting part was never the tool: it is that a suite of 1,192 tests, which
§6.74 had just finished proving all *assert* something, could still be blind to a
two-second threshold, a divisor, a boundary and a whole branch of a median.

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
- **Offline here is a switch, not a bad connection.** §6.56 runs both apps with
  Playwright's offline mode, which is a clean break: every request fails at once and
  keeps failing. What that does not reproduce is the case people actually meet — a
  connection that answers slowly, or answers with a captive portal's login page, or drops
  half way through an upload. The search deadline of §6.52 exists for the first of those
  and has never met one. Nor has anything tested a device whose radio comes back while a
  write is in flight.
- **Two tabs are not two devices.** §6.64 runs the app twice in one browser, which shares
  one IndexedDB, one service worker and one outbox — so what it proves is that the *local*
  layer holds up under two readers and two writers. Two devices share none of those; they
  share a Postgres table and a sync engine, and that is still the thing this checkout has
  never been able to exercise. A tab that has been open for a week, an update installed
  under it, and a service worker deciding what to do about that are all untested too.
- **The signed-in failure paths are still out of reach.** §6.58 drives the provider's
  failures in a browser, which needs no account. Lists, People and comments all gate on a
  session, so what a failed *server* write looks like on those screens — the fixes of
  §6.57 — has been read and typechecked but never seen. That needs `SB_SECRET`, which
  this checkout does not have.
- **The scale measurements are a container's, not a phone's.** §6.54 runs the app's own
  queries against a hundred and twenty shows and six thousand episodes on both stores, and
  the screens against a hundred and fifty in Chromium. Nothing there says what a five-year-old
  Android does with the same library: no thermal throttling, no cold storage, no
  contention with anything else. What the budgets catch is a query that changes shape —
  indexed to scanning, one round trip per show to one per episode — which is an order of
  magnitude and survives the difference between machines. An absolute millisecond count
  here does not.
- **No real upgrade has happened on a device.** §6.53 opens a version 1 database with the
  current code on both stores — the browser's in the app's own smoke run, in Chromium, and
  SQLite's against sql.js, which is real SQLite rather than a stand-in. What neither can be
  is a file that has actually been carried across an app update on a phone, with expo-sqlite's
  own WAL and OPFS handling in the way. The fixtures are also the versions this repository
  *declares*; a database written by a build that no longer exists here — one shipped before a
  schema was renamed, say — cannot be reconstructed and is not covered.
- **The fingerprinter has never heard real audio through a real microphone.**
- **The Roku and MPRIS adapters have never spoken to hardware.** §6.44 runs the whole chain
  — app, relay, bridge, adapter — against a fake Roku on port 8060 found by real SSDP
  discovery, so a keypress does now leave the product and arrive somewhere. But the fake
  answers with the XML the parser expects, so a passing run says the adapter and the fixture
  agree with each other, not that either is right about a television. No physical Roku has
  ever been sent a command.
- **No MPRIS player has ever been driven.** The transport's `gdbus` command line is
  exercised against a real session bus in §6.44 and an empty bus parses correctly, which is
  more than a mock proves and less than a laptop. Registering a media player on the bus needs
  a D-Bus binding, and none is installable here.
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
- **Chromium in this container cannot reach the internet.** Node can — the live TMDB and
  AniList suites run — but the browser cannot, proxied or not. Since §6.47 fixed the
  provider, that means no browser suite here can exercise a credentialed build, and the
  quality of real search results, real import matching and real where-to-watch has never
  been seen inside the app. Doc 10's evening was driven entirely on the fixture catalogue.
- **Five guards can be fooled by a string literal, on purpose.** §6.72 asked every
  source-reading guard whether prose trips it and whether a commented-out violation trips
  it, and fixed the five that answered wrongly. §6.73 ran the third probe: a violation
  inside a string, which reads as code to a regex and as data to a compiler. `dials`,
  `calendarDates`, `oneClient`, `runnable` and `backendQueries` fire on it. They are being
  left that way — the reasoning is in `core/src/test/source.ts` — because stripping
  strings would blind the guards that read them (`screenStates`, `commands`, `copy` all
  work by reading string content), and because all five are false positives, which fail
  loudly, on input nobody writes. That is a judgement, not a measurement: nobody has hit
  one of these in the course of ordinary work, so the cost of the trade is estimated
  rather than observed.
- **`vitest list` proves collection, not execution.** §6.73's check asks each workspace's
  runner which files it would collect and compares that against what is on disk. §6.74
  went one layer in: every test in every workspace now has to assert something, and every
  skip in every workspace now has to be named and explained. What neither reaches is a
  test that is collected, runs, asserts — and cannot fail. §6.74 found two of those by
  reading (`toBeGreaterThanOrEqual(0)` on a counter, and a `?? 'mine'` fallback that
  passed when the row was missing) and there is no mechanical check for more. Telling a
  real assertion from an unfailable one means knowing what the code could have done
  instead, which is what mutation testing is for and what nothing here does. The honest
  version of this claim is: no test is silent, and some may still be toothless.
- **Six modules have been mutated; the rest have not.** §6.75 ran 208 mutations over
  `sync/engine.ts`, `data/repo.ts`, `calendar/upcoming.ts`, `watching/reactions.ts`,
  `time.ts` and `sync/clock.ts`, and every surviving mutant is either killed now or
  classified in that section. That is roughly a fifth of the core and none of `app/`,
  `mobile/`, `relay/`, `bridge/` or `extension/`. The modules were chosen for stakes
  rather than sampled, so the survival rates measured — 12% in `engine.ts`, 59% in
  `reactions.ts` — say nothing about the ones not looked at.
- **The mutation harness is not committed and not repeatable by anybody else.** It lives
  in a scratch directory: forty lines that write a file, shell out to vitest and put the
  file back. Re-running any of this means writing it again. That was the right trade for
  one sprint and it means the numbers above are a snapshot, not a check — nothing stops
  the next change from reintroducing exactly what was found.
- **Twenty mutants are alive on purpose.** Five user-facing tuning constants and five
  Supabase-only paths in `reactions.ts`, two unreachable loop caps and one concurrency
  case in `engine.ts`, and a handful of genuinely equivalent changes. Each is named in
  §6.75 with which kind it is. The two categories worth restating: a constant nothing
  behavioural depends on is not a gap, and a path that needs a real server cannot be
  reached from here at all — which is the same list as every other §7 entry about live
  code.
- **Eleven web screens were checked for the first time today.** `screenStates` had never
  examined a single-segment web route, so its claim that the suite renders them rested on
  nothing until §6.72. They pass now — but "passes a mention check" was always a weak
  claim, as that check's own comment says: it cannot tell which *state* of a screen was
  reached, only that the suite has heard of it.
- **No row has ever been set aside by the real backend.** §6.71's classifications are
  real Postgres — every code in the permanent list was observed by making the deployed
  schema reject that shape — and the engine's behaviour around them is proved against a
  fake that models statement-level failure, which is the part that matters, since a real
  server fails the statement and not the row. What has never happened is a client with a
  session pushing a row Supabase refuses and watching it land in `rejected`, or somebody
  pressing *Try those again* after a deployment and seeing it go. The retry path in
  particular has only ever been driven by a test.
- **Nobody has signed out and back in.** §6.70 did every other sequence twice — mark and
  unmark and mark, rate and clear and rate, import the same file three times, visit every
  screen three times — and the one it could not do is the account. `resetSyncState` and the
  owner check in `sync/driver.ts` exist for exactly the sequence *sign out, sign in as
  somebody else, sync*, and that path needs a session this checkout has never had. What
  can be checked without one has been: the driver's claim logic is unit-tested, and the
  policies it depends on are tested against real Postgres. What happens when a real second
  person signs into a device holding the first person's queue is still an argument from the
  code rather than an observation.
- **The tombstone fix is proved against Postgres and not against Supabase.** The four
  not-null rejections and the migration-derived column check both run for real; what has
  never happened is a client with a session pushing a tombstone at the deployed project and
  watching it land. That is the same missing service key, and it is the reason the failure
  went unnoticed for the life of the product: nothing has ever pushed anything anywhere.
- **Nothing has actually run for forty-five minutes.** §6.69 measures duration, and the
  clock is simulated in both halves: the unit tests advance `positionMs` and vitest's
  fake timers a second at a time, and the browser checks do three round trips rather than
  an episode. What that exercises is the component's arithmetic and the screen's state
  handling — which is where both bugs were — and not forty-five minutes of a real
  browser's garbage collector, a tab throttled in the background for half an hour, or a
  phone holding twenty-four compositor layers while the screen is off. Nor has anybody
  measured a heap: `performance.memory` is Chromium-only and a headless container's
  numbers would not describe a device.
- **Coverage cannot see the five browser suites.** §6.68 measures every workspace's unit
  tests in one process, and that is the whole of what it measures. The web, phone,
  extension, bridge and failure suites all drive a *built bundle* in a real browser, so
  every screen in both apps shows as entirely untouched and none of that is evidence of
  anything — the screens are the most heavily exercised code in the product. What the
  report is good for is the opposite case: code no suite of either kind enters, which is
  what §6.67's `fromEnv` was. Treat a "never entered" line on a screen as noise and one
  on a pure function as a question.
- **The report is a snapshot, not a guard.** Nothing fails when a function stops being
  executed; `npm run coverage` has to be run and read. The guard that *did* come out of
  this covers the coarser failure — a workspace nothing tests at all — and there is no
  mechanical check that, say, `getProvidersCached` still has a test tomorrow beyond the
  test itself existing.
- **No two real devices have ever synced with each other.** §6.67's clock fixes are
  proved by planting each one and watching the right test fail, and the server half runs
  against real Postgres with the real migrations — so what the trigger *does* is verified.
  What is not: any of it against a live Supabase project, which needs the service key this
  checkout has never had, and `synced_at` has never been written by a real client. Nor has
  a genuinely wrong clock been involved anywhere — `vi.setSystemTime` moves `Date.now()`
  and nothing else, so what is exercised is the arithmetic, not a phone whose whole
  operating system disagrees with the world. The `Date` header the offset is learned from
  has never been read from a real response.
- **Conflict resolution is still wall-clock last-write-wins, and that has a floor.** Two
  devices editing the same row while both offline are resolved by whose corrected clock
  says later, and a device that has never once reached the server has no correction to
  apply. A per-device counter — a Lamport clock — is the answer that does not involve wall
  time at all; it changes the wire format, the schema and the meaning of every row already
  written, and it is deliberately not what §6.67 did.
- **The outbox has never been drained against a real signed-in session.** §6.67 found that
  `SupabaseBackend.fromEnv()` — the only backend the shipped app builds — had never been
  called by any test, and built a client that could not see the session. The fix is one
  line and is now guarded, but the corrected path has still only run against fakes.
- **No clock here belongs to a person.** §6.66 fixed how dates are read and proved it by
  planting the old reading and watching it fail in Los Angeles and Kiritimati but not at
  UTC — which is real, and is a claim about a container running with `TZ` set. What has
  never happened: a phone whose timezone is its own operating system's, a device carried
  across a timezone mid-session (the app reads `Intl.DateTimeFormat().resolvedOptions()`
  once per settings change, so a traveller's server-side timezone is wherever they last
  touched the notification setting, not where they are), and a `time_zone` column written
  by a real client — that needs a session, which this checkout has never had. Migration
  `0013` runs against real Postgres in `schema.test.ts`, so what it *does* is verified;
  that it has been applied to the deployed project is not, and cannot be without the
  Supabase token. The daylight-saving arithmetic is checked against every transition of a
  year in `America/New_York` by asking the runtime where the offsets change, rather than
  against a hand-picked weekend — but no test has run *during* one.
- **The asset rewrite has never been tested against Vercel.** §6.65 found, in a real
  browser, that a tab open across a deployment asks for chunks that are gone and gets the
  app shell back as `200 text/html`. The half of the fix a person sees — the update
  sentence and the Reload button — was produced by an actually stale tab and is real. The
  other half is one line of `vercel.json`, and it cannot be verified here: `vite preview`
  runs its own SPA fallback, so the local server answers a missing asset with HTML whether
  the deployed rule is right or wrong. What stands in for it is a check that parses the
  config and tests the pattern, which proves the rule says what it should and not that
  Vercel obeys it. Nor has a tab been left open across a *service worker* update on a real
  host, where the cache is a third party to the argument.
- **The deployed site is behind.** `npm run deploy:web` needs a Vercel token that is not in
  this container, so everything since §6.14 is in the repository and not on the web.
  `npm run whats-live` confirms it from the outside: the live bundle hash does not match the
  local one.
- **Some entry points have never been started, and cannot be from here** (§6.45 ran the
  rest). `expo start --android` and `--ios` need an emulator or a device. The edge
  functions' local serve needs Deno and the Supabase CLI, neither of which is installed
  here. And the success paths of `deploy-web.mjs`, `apply-migrations.mjs` and
  `deploy-functions.mjs` have never run in this container — only their refusals, which are
  clear and exit non-zero.

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

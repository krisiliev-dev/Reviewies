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

# Reviewies — Research Phase 6: Cast/AirPlay Reverse Engineering & Fingerprint Sizing

**Date:** 14 August 2026
**Answers two questions:** can we use Cast and AirPlay natively, and how big would a fingerprint
database actually be?

---

## 1. Cast and AirPlay — yes, and they're already reverse-engineered

**Good news: we don't have to reverse-engineer anything. It's done, it's mature, and it's
production-grade.**

| Library | Covers | Status |
|---|---|---|
| [**pychromecast**](https://github.com/home-assistant-libs/pychromecast) | Chromecast, Android TV, Google TV, Cast-enabled smart TVs | Maintained by the Home Assistant team. Protobuf over TLS, port 8009. |
| [**pyatv**](https://pyatv.dev/documentation/protocols/) | Apple TV, AirPlay devices | Mature, well-documented, explicitly reverse-engineered protobuf protocols |

Both expose exactly what we need: `cast.media_controller.status` gives playback state, title **and
position**; equivalents exist in pyatv. These are the same libraries Home Assistant uses to control
millions of devices, so we'd be building on well-trodden ground rather than pioneering.

### 1.1 Your smart speaker question — this is the important part

> *"when I play something through my smart speaker I see the playback controls for it on my phone.
> How does that happen?"*

**This is the Cast session model, and it's the single most useful fact in this document.**

Cast is a **session protocol**, not a point-to-point stream. When something starts playing, the
*receiver* (the speaker, the Chromecast, the TV) holds the session and publishes its state. Any
authorised device on the local network can connect to that receiver and subscribe to `MediaStatus`
updates — title, playback state, and current position — **regardless of which device started it**.

That's why your phone shows controls for something you started elsewhere. It's not mirroring your
phone; your phone joined an existing session as an observer/controller.

**Why this matters enormously for us:** it means a bridge can attach to a Cast session it did not
initiate and read the timestamp continuously. We don't need to be the app playing the content. For
any Cast device — a very large share of smart TVs, including Sony, TCL, Hisense and Vizio — we get
automatic Watching Mode sync without the user doing anything.

That is a much stronger position than phase 5 assumed.

### 1.2 The AirPlay caveat

AirPlay is not symmetrical with Cast in this respect. When your **iPhone** AirPlays something, the
phone is the *source* — it owns the Now Playing session, and a third party on the network can't
readily observe it. But an **Apple TV** playing its own content is observable via pyatv, which is
the case that matters for second-screen use.

So: Cast is the stronger protocol for our purposes. AirPlay works for Apple TV specifically.

### 1.3 The constraint that does not change

These libraries need **raw TCP, TLS and mDNS discovery**. A browser has none of those. So this runs
in the **bridge**, not the PWA — exactly as planned in phases 4 and 5. Your framing was right: it
works "through an app, not a browser." The bridge *is* that app; it just happens to be a small
headless one rather than a phone app, which is what lets the PWA stay a PWA.

One legal note: these are clean-room reverse-engineered clients, widely distributed and used by
major open-source projects. Using them is normal practice. Shipping a *receiver* that impersonates
a Chromecast would be a different matter — we're not doing that.

---

## 2. Fingerprint database sizing — the real numbers

You asked how much space it would take to fingerprint everything. Here's the arithmetic, and then
the reason the number turns out not to matter.

### 2.1 Baseline from real deployments

Dejavu's published figures: **45 songs → 5.4 million fingerprints → 377 MB**, and a larger database
of 58.6 million fingerprints occupying ~6.7 GB. Working that back:

- 45 songs ≈ 2.6 hours of audio
- ≈ **570 hashes per second of audio**
- ≈ 70 bytes per fingerprint *as stored in MySQL rows*
- ≈ **145 MB per hour** at Dejavu's defaults

That 70 bytes/fingerprint is mostly relational row overhead. In a packed binary format (4-byte hash
+ 4-byte time offset), the same data is **8 bytes**, giving ~**16 MB per hour**.

### 2.2 We can go much sparser than Dejavu, because our problem is easier

Dejavu's density is tuned for the hard version of the problem: identify an unknown 5-second clip
against a database of millions of tracks. High hash density is what makes fingerprints
*discriminative* across a huge corpus.

**Our problem is fundamentally easier.** We already know what the user is watching — they told us.
We are not identifying content; we are locating a position within **one known episode**. Matching a
10-second sample against a single 45-minute timeline needs perhaps 20–50 hashes/second, not 570.

At 30 hashes/sec × 8 bytes ≈ **~0.9 MB per hour**, so a 45-minute episode is roughly **0.6–1 MB**.

### 2.3 Scaling to "everything"

Order-of-magnitude, with assumptions stated (episode counts across TMDB/TVDB are genuinely fuzzy, so
treat this as a sizing exercise, not a forecast):

| Corpus | Assumption | At ~1 MB/hr | At ~16 MB/hr |
|---|---|---|---|
| All TV episodes | ~3.5M episodes × 0.6 hr ≈ 2.1M hours | ~2 TB | ~34 TB |
| All films | ~1M titles × 1.8 hr ≈ 1.8M hours | ~1.8 TB | ~29 TB |
| **Everything** | ~4M hours | **~4 TB** | ~63 TB |

**So the answer to "how much space for every episode of every show" is: single-digit terabytes at
sensible density.** That is a surprisingly affordable number — a few hundred dollars a month of
object storage, or one server with disks.

### 2.4 But we never need the whole corpus — and this is the elegant part

Two things collapse the problem:

**1. No global index is required.** Because we know the episode, the search space is one file. There
is no hash → postings index over millions of tracks, which is the genuinely expensive part of a
Shazam-style system. We skip it entirely.

**2. Only what people actually watch gets fingerprinted.** Realistically that's tens to hundreds of
thousands of episodes in year one — **~30–500 GB**, which is unremarkable.

Which leads to the architecture I'd recommend:

```
Episode fingerprint = one small file (~0.6–1 MB), keyed by internal episode ID
   ↓
Client downloads it when Watching Mode starts
   ↓
Microphone sample matched LOCALLY, in the browser
   ↓
Result: exact offset. No server query. Works offline. Zero per-match server cost.
```

Matching in the client is feasible: the Web Audio API gives us FFT via `AnalyserNode`, and a
landmark-hash matcher is a few hundred lines. Chromaprint also compiles to WebAssembly if we want
its algorithm specifically.

This is genuinely cheap to run, scales to any number of users without server cost, and degrades
gracefully — no fingerprint yet for an episode simply means manual sync, and the first viewer
contributes one.

### 2.5 Your crowdsourcing plan — confirmed, with the details

Your proposal is exactly right, and the sizing above is what makes it viable:

1. First viewer of an episode syncs manually (accurately), opts in to contribute
2. Their client fingerprints the audio locally and uploads **only the fingerprint**, never audio
3. Subsequent viewers download that ~1 MB file and sync automatically
4. Multiple contributions per episode get cross-validated against each other, so one bad sync
   doesn't poison it

Non-negotiables for this to be acceptable:
- **Explicit, specific opt-in.** Not buried in a ToS. Microphone use for this purpose, stated plainly.
- **Never transmit or store raw audio.** Fingerprint locally, upload hashes only. This is both the
  privacy answer and the copyright answer — hashes are not a reproduction of the work.
- **Clear recording indicator** whenever the mic is live, and easy revocation.
- **Cross-validation before trusting** a contributed fingerprint.

One caveat worth stating: fingerprints are per-*release*. Different cuts, dubs, or regional audio
tracks won't match each other. Practically this means storing a fingerprint variant per audio track
and falling back to manual sync on a mismatch, rather than assuming one fingerprint per episode.

---

## 3. What this changes

Phase 5 ranked sync mechanisms with fingerprinting as a distant v3. Cast's session model moves the
bridge up, and the sizing work moves fingerprinting from "probably infeasible" to "clearly
feasible, just not first."

**Revised confidence in the sync ladder:**

1. **Browser extension** — exact, no hardware. Still first for laptop watching.
2. **Cast session observation via bridge** — exact, automatic, and covers a large share of smart TVs.
   Upgraded from phase 5; this is better than expected.
3. **Local OS media API via bridge** — exact, for native desktop apps.
4. **Crowd-sourced fingerprint matching** — universal fallback, feasible, client-side, cheap.
5. **Manual sync + crowd drift correction** — the everywhere-baseline that ships first.

Build order is unchanged; the ceiling is higher than I thought.

---

## 4. Correction: TMDB anime structure (verified live, 16 Aug 2026)

Phases 2 and 4 claimed TMDB flattens long-running anime into a single
hundred-episode season, and treated that as a headline risk. **Checked against the
live API, that is largely wrong** and the correction is worth recording.

| Show | TMDB structure |
|---|---|
| One Piece (1999 anime, id 37854) | **23 seasons, 1181 episodes**, split by story arc — East Blue, Alabasta, and so on. Genuinely more useful than absolute numbering. |
| Frieren (id 209867) | 1 season, 38 episodes — here the merging *does* happen |
| Kaamelott (id 11466) | 6 seasons, 458 episodes. Strong coverage of a very French show. |
| Detectorists (id 61828) | 3 seasons + specials |

So the flattening is occasional rather than systemic. Storing progress against stable
per-episode IDs still protects us when it happens, but AniList integration drops from
"MVP requirement" to "worth doing when a specific show is wrong".

**Two real issues surfaced instead, neither of which was in the original research:**

1. **Search ranking, not coverage, is the anime problem.** Searching "One Piece"
   returns the 2023 Netflix live-action first and the anime second. Nothing is
   missing; the wrong thing is simply at the top. Showing the year in results (which
   the search UI already does) is the cheap mitigation — 2023 versus 1999
   disambiguates immediately.

2. **Specials are season 0, and season 0 sorts before season 1.** One Piece has 39
   specials, Frieren 26. Any naive "first unwatched episode" query offers a recap
   special instead of episode 1. Fixed: Up Next excludes season 0, while specials
   remain visible on the show page. Iterating TMDB's reported season list rather than
   assuming `1..N` is also what makes specials fetchable at all.

**Also verified live:** watch providers return sensible per-country data (GB, US, DE
and BG all resolved for Breaking Bad), and niche/non-English titles — Detectorists,
Kaamelott, Dark, The Bureau, Nathan for You — are all present. The "any and all
series, no matter how niche" requirement holds up.

## 5. Sources (phase 6)

- [pychromecast](https://github.com/home-assistant-libs/pychromecast) · [README](https://github.com/home-assistant-libs/pychromecast/blob/master/README.rst)
- [Chromecast protocol writeup](https://kyteinsky.github.io/p/chromecast-protocol/)
- [pyatv — protocols](https://pyatv.dev/documentation/protocols/)
- [Dejavu — audio fingerprinting in Python](https://github.com/worldveil/dejavu)
- [Will Drevo — fingerprinting and audio recognition](https://willdrevo.com/fingerprinting-and-audio-recognition-with-python/)
- [Chromaprint / AcoustID](https://github.com/acoustid/chromaprint)

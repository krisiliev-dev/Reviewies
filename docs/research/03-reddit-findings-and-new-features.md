# Reviewies — Research Phase 3: Reddit Findings, Remote Control, Watching Mode

**Date:** 14 August 2026
**Status:** Research complete. Contains findings that **materially contradict** phases 1–2.

---

## 0. Read this first

Two things in here change the plan:

1. **Reddit access worked**, and the community's actual priorities are not what phases 1–2
   assumed. The #1 loved feature of TV Time was **the comments**, not tracking. The #1 demand is
   **simplicity**, stated repeatedly and forcefully. Phase 2's four-stage feature-rich roadmap is
   partly at odds with what users say they want.
2. **The competitive field is far more crowded than phase 1 reported.** TV Time's co-founder
   launched a successor called **Bingers** on 4 August 2026 — ten days ago — which is local-first,
   social-heavy, and already has users' old comments. Phase 1 missed the entire post-shutdown wave.

The remote control and watching-mode features are assessed in §3 and §4. Short version: **watching
mode is buildable and genuinely excellent; the remote control cannot be built as a PWA on iOS** and
needs a deliberate choice about how far you want to go.

---

## 1. Getting into Reddit — what worked

Phase 1 reported Reddit as inaccessible. That was true of the direct routes but I gave up too
early. What I tried and what happened:

| Route | Result |
|---|---|
| `reddit.com` / `old.reddit.com` / `api.reddit.com` JSON | 403 at Reddit's edge, regardless of user agent |
| WebSearch with `allowed_domains: reddit.com` | Hard-blocked — reddit.com is excluded from the search index available here |
| WebFetch on reddit.com | Blocked |
| Redlib/Libreddit mirrors (5 tried) | Mostly 403/502; `safereddit.com` returned 200 but sits behind an Anubis anti-bot challenge |
| **Arctic Shift** (`arctic-shift.photon-reddit.com`) | ✅ **Works.** Full post and comment archive with a JSON API — the maintained successor to Pushshift. |
| **Wayback Machine** (`archive.org`) | ✅ Works, has recent r/TVTime snapshots — useful as a cross-check |

**Method that worked:** Arctic Shift's `/api/posts/search` and `/api/comments/search`, filtered by
subreddit and epoch timestamp, sorted client-side by score. Note `sort_type` only accepts
`default` or `created_utc`, and `after` wants a Unix epoch, not a date string — both cost me a
400 before it worked.

This is reusable. If we want ongoing community sentiment, Arctic Shift can be polled on a schedule.

---

## 2. What Reddit actually said

Sources: r/tvtime, threads from June–August 2026, sorted by score and comment volume. Quotes are
verbatim.

### 2.1 The comments were the product

This is the single loudest, most consistent signal, and it reframes the whole project:

> "I could've used any other tracking app, but I stayed with TVTime because I enjoyed reading the
> comments so much. They were hilarious, sweet, insightful, or I liked reading different theories."

> "my favourite part about it was the listing system and the comment section. There was a time when
> half of my photos was screenshots of TVST comments."

> "It wasn't about features. Tv time was simple and cozy. Apps like suite has replicated the
> interface a lot but it feels **soulless**."

People did not stay for tracking. Tracking is a commodity — a dozen apps do it. They stayed for a
per-episode comment culture that nobody has successfully rebuilt, because **the community, not the
software, was the moat**. One user on the fragmentation: *"It was never an issue because TVTime had
a large community, that community's now fragmented."*

### 2.2 Simplicity is the top-line demand, stated aggressively

> "I don't want an app that has 100 features i won't use, i tried movies paradise and serialized,
> both had so much features tv time didn't had, but do you know what they lacked? **Simplicity**...
> I just want to open the app, mark the episode i watched, read the comments, close the app."

> "The ~~most~~ **only** important thing in an app is that it opens directly to the page where I can
> see and mark the next episodes of my shows."

> "All I want is a episode tracker. These have too much bluff."

> "I don't want a ton of features - I just want to know what time and channel/app the shows I watch
> come on. I also didn't want to be bombarded with ads or prompts asking me to subscribe."

**This is a direct warning about phase 2's roadmap.** Badges, year-in-review, runtime-weighted
stats, discovery — all defensible individually, and collectively they are exactly the "bluff" users
are complaining about in the competitors that already shipped them.

### 2.3 Screenshots in comments

A specific, repeatedly-named feature that competitors dropped:

> "The comments section doesn't have the ability to add screen grabs of interesting scenes that TV
> Time commenters [did]"

Image attachments in episode comments were core to the culture. Cheap to build, and named
explicitly as a gap in Serializd and Suite TV.

### 2.4 Specific competitor complaints (useful as anti-requirements)

- **Serializd:** *"Adding a new show to your home page is a pain... it's a crapshoot whether it
  decides to show up under 'new releases', 'continue watching' or not at all."* Ambiguous state
  machines are a real, named failure.
- **Trakt:** *"As long as there is no Trakt synchronization, and I mean synchronization, and not
  import, I will not go see Bingers."* Two-way sync ≠ one-time import, and users know the
  difference.
- **General:** *"I have tried 10 alternatives but they all feel clunky and slow."* Performance is a
  differentiator, not a hygiene factor.
- On what would make an app complete: *"If they add Export features, some statistics and ideally an
  API it would be perfect for me."*

### 2.5 The post-shutdown app wave — phase 1 missed this entirely

At least **eleven** TV Time successors launched or pivoted since July:

| App | Notes from Reddit / press |
|---|---|
| **Bingers** | **By TV Time co-founder Antonio Pinto.** Launched 4 Aug 2026. Leans *harder* into social. Imports old comments, followers, following. **Local-first — loads libraries on-device to offload processing**, explicitly to avoid TV Time's cost problem. 10k+ Play installs already. |
| **Movie Paradise** | Widely praised; imported the TV Time comment archive. *"Movie Paradise at this point is better than TV Time was."* |
| **Refract** | 50k+ Play installs; GDPR zip import with comments/ratings/history; near-daily updates |
| **Suite TV** | Imported the comment archive; criticised as *"soulless"* |
| **Sofa Time**, **Bingeboxd**, **Bingebase**, **Cinephile**, **Seenr**, **Purplecast** | All 10k+ installs or actively discussed |

Realistic market sizing from a well-argued comment: of TV Time's 25M registered users, roughly
**~500k were actually active**; older competitors absorbed most, and *"newer vibecoded alternatives
are fighting for the remaining scraps (<100k)."*

**Bingers is the serious one.** It is, feature-for-feature, close to what phase 2 proposed —
local-first, social-first, comment-preserving — built by the person who made the original, with the
brand recognition and the comment archive. We should assume it wins the "replace TV Time" race.

### 2.6 The biggest single opportunity: the community comment archive

Between 1–15 July, the community crowdsourced a rescue of TV Time's comments:

> "I'm already doing it... https://tvtime-archive.com/ — On july 1-15th the community helped
> gathering as much TV Time comments as possible, and we got **over 30M of them**. Now the idea is
> to make this available in all apps, so we can continue our conversations cross-platform!"

> "I'm collaborating directly with devs to integrate it, MP was first cos dev is a goated bro...
> Also movie paradise and seenr. **Soon many more! (If the devs want to ofc)**"

The site is live and confirms a cache browser and archive explorer. Movie Paradise, Suite TV and
Seenr have integrated it.

**This is the cold-start solution.** A new social TV app's hardest problem is empty comment
threads. The archive maintainer is actively offering integration to any dev who asks. If we build
the social layer, **this should be one of the first conversations we have** — the difference
between launching with 400 comments per episode on old shows and launching with zero is the
difference between "cozy" and "soulless", in users' own words.

⚠️ **Caveat:** there are unresolved questions about this data. Users on the thread asked *"I don't
have a Suite TV account, no one asked me, why are my comments there?"* The maintainer's own site
says *"Is this allowed?! ...Idk honestly."* Their position is that comments are anonymised so
there's no GDPR breach. **Do not integrate this without thinking carefully about the legal and
ethical position** — attribution, deletion requests, and whether users consented to their comments
being redistributed. Worth doing, worth doing carefully.

### 2.7 Strategic implication

Phase 1 claimed a market gap. **That gap has largely closed in the last six weeks.** Reviewies is no
longer "the app for TV Time refugees" — Bingers is, and it has an insurmountable head start on that
specific positioning.

That is not fatal, but it changes the frame. **The honest positioning now is: build the app you
want, with the two features nobody else has** (§3, §4). Those are genuinely novel and are not on
any competitor's roadmap. Competing on "TV Time but better" is a race we'd lose; competing on
"the only tracker with a real-time shared watching experience" is a race nobody else has entered.

---

## 3. Feature: embedded remote control

### 3.1 Verdict

**This cannot be built as a PWA on iOS.** Not "difficult" — structurally blocked, by three
independent walls. It is buildable natively, or via a local bridge. Details so you can pick.

### 3.2 Why the PWA route fails

**Wall 1 — Web Bluetooth does not exist on iOS.** Safari on iOS/iPadOS has never supported it, in
any version, and Apple's WebKit-only rule means Chrome and Edge on iOS inherit the same gap. The
only workaround is a third-party Safari extension (`iOSWebBLE`) that polyfills `navigator.bluetooth`
via CoreBluetooth — unusable for a mainstream app, since every user would have to install and
enable a separate extension. **The Bluetooth half of the idea is dead on iOS.**

**Wall 2 — mixed content blocking kills LAN control.** Our PWA is served over HTTPS. Smart TVs and
streaming boxes expose plain-HTTP control endpoints on the local network. A browser blocks HTTPS →
HTTP requests as mixed content, and **Safari is the strictest implementation** — it's the only
browser that blocks even mixed-content `localhost`. Chrome additionally deprecated public→private
network requests (CORS-RFC1918 / Private Network Access), and Roku's own developer community has
noted that none of the proposed PNA solutions work with their protocol.

**Wall 3 — no discovery.** Browsers cannot do mDNS or SSDP; there's no raw UDP and no multicast. So
even if the above were solved, the app cannot *find* your TV's IP address. There's a WICG proposal
for an mDNS Service Discovery API, but it's a proposal, not a shipping feature.

Worth noting how close it gets on paper: **Roku's ECP is a beautifully simple protocol** — plain
`POST /keypress/Play` to port 8060, no auth, and `GET /query/media-player` even returns the current
playback position. Fire-and-forget button presses work with `fetch(..., {mode: 'no-cors'})` since
we don't need to read the response. It works fine from a plain-HTTP page on the same network. It is
purely the HTTPS and discovery constraints that block it — which is genuinely frustrating, because
Roku alone would have delivered both the remote *and* the timestamp.

### 3.3 The device landscape, if we do build it

Coverage varies enormously, and this matters for the watching-mode premise:

| Device | Control | Reports playback position? |
|---|---|---|
| **Roku** | ECP — HTTP, no auth, trivial | ✅ Yes, `/query/media-player` |
| **Chromecast / Google TV** | Cast SDK | ✅ Yes, via media status |
| **Apple TV** | No public API. `pyatv` reverse-engineers MRP/Companion; requires pairing | ✅ Yes, via pyatv |
| **Samsung (Tizen)** | WebSocket API, token pairing | ⚠️ Limited |
| **LG (webOS)** | SSAP WebSocket | ⚠️ Limited |
| **Fire TV** | ADB | ⚠️ Awkward |

**Important caveat for watching mode:** even with a working remote, "we know exactly the media and
timestamp" is only reliably true on Roku, Chromecast and Apple TV. If you're watching Netflix
inside a smart-TV app, the platform frequently won't expose position at all. The premise holds for
some setups, not all.

### 3.4 Three ways to actually build it

**Option A — Native app via Capacitor.** iOS grants native apps a Local Network permission,
enabling mDNS/SSDP discovery, raw sockets and CoreBluetooth. Everything works. Costs $99/yr for the
Apple Developer Program and gives up the "no app store" premise — but also unlocks widgets, which
Reddit and phase 1 both flagged as a loved TV Time feature a PWA can never provide.

**Option B — Local bridge + the Plex TLS trick.** Run a small service on the LAN (Raspberry Pi,
always-on machine, Docker) that speaks the device protocols; the PWA talks to it over HTTPS. The
mixed-content problem is solvable using **exactly the trick Plex uses**: a wildcard DNS domain where
the private IP is encoded in the hostname (`192-168-1-7.<hash>.reviewies.direct`) resolving to the
LAN address, covered by a real wildcard TLS certificate. This is a proven, production pattern at
Plex's scale. Cost: a domain, a wildcard cert, and real setup friction for the user — plus it
breaks on routers with DNS-rebinding protection enabled.

**Option C — Home Assistant as the bridge.** If you run Home Assistant (or would), it already has
maintained integrations for Roku, LG, Samsung, Apple TV (via pyatv), Chromecast and Fire TV, and
exposes a REST API with proper TLS. This is by far the least work for the most device coverage — we
write an integration against one clean API instead of six flaky ones. It only works for people who
run Home Assistant, which is a small fraction of users but may well include you.

### 3.5 Recommendation

**Do not build the remote for the MVP**, and specifically do not let it block the watching-mode
feature — because, crucially, **watching mode does not depend on it** (see §4.2).

Sequence it: prove watching mode works with manual sync first; add remote control later as an
optional power-user integration, starting with Option C (cheapest, best coverage) or Roku-only via
Option B. Revisit Option A if and when you decide to go native for widgets anyway.

One honest note on scope: §2.2 shows users punishing apps for feature bloat. A remote control in a
tracking app is exactly the kind of thing that draws "too much bluff." **Your instinct to hide it in
a side drawer is the right mitigation** — invisible until summoned costs nothing in perceived
complexity. Keep it there.

---

## 4. Feature: Watching Mode (real-time timestamped reactions)

### 4.1 Verdict

**Build this. It's the best idea in the project.**

It's technically feasible today, it's genuinely novel in this market, and — most importantly — it
lands precisely on the thing Reddit says people actually miss. Users didn't love TV Time for
tracking; they loved it for *reacting together to moments in episodes*. Timestamped emoji reactions
are that same emotional need with **far less friction than writing a comment** — which also makes
the cold-start problem much easier, since a tap is cheaper than a paragraph.

### 4.2 The key insight: decouple it from the remote

The feature needs a **synchronised playback clock**. The remote is one way to get that, but not the
only way, and not the one to start with:

1. **Manual sync (start here).** User taps "Start watching" when they hit play; the app runs a
   timer. Add a resync nudge (±5s / ±30s) and a "I paused" button. Works on every device, today,
   with zero dependencies. Slightly less magical, ~95% as useful.
2. **ACR / audio fingerprinting (the magic version).** The phone's microphone samples the TV audio
   and matches it against a fingerprint to identify content *and exact timestamp*. This is exactly
   how commercial second-screen sync works — ACRCloud and similar have offered it for years. The
   Web Audio API and `getUserMedia` work in an installed PWA, so capture is feasible; the matching
   needs a fingerprint database, which is the hard/expensive part. Realistically a v2 investigation,
   possibly via a commercial ACR provider.
3. **Remote-derived position (best, narrowest).** Exact and automatic, but native-only and limited
   to Roku/Chromecast/Apple TV.

**Ship with manual sync.** It de-risks the whole feature and lets you validate whether people
actually enjoy it before investing in ACR or native device control.

### 4.3 Prior art — this is a proven format

Your description is essentially **danmaku** (弾幕) / bullet chatting, applied to a second screen:

- Invented by **Niconico** (Japan, 2006); popularised at enormous scale by **Bilibili** in China
- Comments are anchored to a video timestamp and animate across the screen during playback
- There is a **W3C Community Group specification** for Bullet Chatting, which is a useful design
  reference for rendering rules, lane allocation and collision avoidance
- Research consistently finds it produces *"a real-time emotional sharing experience"* and far
  higher comment volume than threaded comments

Your right-to-left fade is exactly the danmaku convention, and it's the correct choice — it's a
solved visual grammar people already understand. The novelty here isn't the mechanic; it's applying
it to **a second screen synced to television you're watching elsewhere**, which as far as I can
find nobody has shipped for a TV tracker.

Also relevant: **Amazon X-Ray** (timestamp-synced second-screen metadata) and **Teleparty** (synced
group watching) — both validate the sync concept, neither does timestamped reactions.

### 4.4 Design notes on your spec

Your described layout is sound. Specific observations:

- **Big preselected emoji buttons + search fallback** is the right split. Tapping must be
  effortless in a dark room without looking away from the TV — so: large targets, high contrast,
  haptic feedback, and no confirmation step.
- **Thumbs up/down as permanent fixtures** doubles as a lightweight quality signal we can aggregate
  into episode ratings for free.
- **Reactions arriving from the top and fading left** — one addition worth making: reactions should
  be **replayed from history**, not just shown live. If you watch an episode at 2am alone, an empty
  screen is a dead feature. Replaying reactions left by everyone who watched that timestamp
  previously makes it feel alive from day one, and means the feature works for old shows too. This
  is how danmaku actually works, and it's what makes it not require a live audience.
- **Spoiler safety is automatic here** — reactions are bound to a timestamp you've already reached.
  This is the same structural guarantee as phase 2's spoiler-gated comments, for free.
- **Density control** needed: Bilibili's lesson is that unfiltered danmaku becomes unreadable. Ship
  a density slider and a way to mute reaction types.
- **Aggregation is the interesting long-term artifact.** Reaction density over an episode's runtime
  is a "heat map" of its best moments — genuinely novel data nobody else in this market has, and a
  possible answer to the discovery problem that every competitor is bad at.

### 4.5 Technical requirements

- **Realtime transport:** Supabase Realtime (already in the phase 2 stack) handles broadcast fine.
- **Data model:** reactions are `(media_id, timestamp_ms, emoji, user_id)` — tiny, append-only, and
  trivially aggregatable. Store against the **stable internal episode IDs** from phase 2, not
  S/E strings.
- **Clock drift:** manual sync needs periodic correction; keep an offset the user can nudge.
- **Screen-on:** the Screen Wake Lock API works in installed PWAs and is needed so the phone doesn't
  sleep mid-episode.
- **Offline:** reactions should queue locally and flush on reconnect, like any other write.

---

## 5. Revised recommendation

Given everything above, the strategy that follows from the evidence:

**Positioning:** not "TV Time replacement" — that race is over and Bingers won it. Reviewies is
**the tracker with a live shared watching experience**. Everything else should be *good enough and
invisible*, per §2.2.

**Revised MVP — deliberately smaller than phase 2:**

1. Opens **directly** on Up Next. Mark episode watched in one tap. Fast. This is the whole product's
   credibility.
2. Search, watchlist, where-to-watch
3. Import (TV Time rescue CSVs, GDPR zips, Trakt/Simkl) + one-click export
4. **Watching Mode with manual sync** — the differentiator, in from day one
5. Per-episode comments **with image attachments** (§2.3), spoiler-gated

**Explicitly deferred** (phase 2 had these too early): badges, year-in-review, runtime-weighted
stats, recommendation engine, remote control. All defensible later; all "bluff" if shipped before
the core loop is excellent.

**Two things worth doing early because they're time-sensitive:**
- Contact the **tvtime-archive.com** maintainer about comment integration (§2.6), with the legal
  caveats understood
- Recheck your phone for the TV Time cache (phase 1 §1) — still unresolved

---

## 6. Open questions

1. **How far do you want to go on the remote?** Native app ($99/yr, everything works, also unlocks
   widgets) / Home Assistant bridge (cheap, great coverage, only if you run HA) / Roku-only web
   experiment / defer entirely.
2. **What do you actually watch on?** Roku, Apple TV, Chromecast, smart TV app, or a computer? This
   determines whether the remote is even worth building for your own use — and a computer/browser
   setup would make position detection trivial.
3. Still open from phase 2: country for streaming availability; anime library separate or unified;
   friends-only or public sign-ups.

---

## 7. Sources (phase 3)

**Reddit access**
- [Arctic Shift API](https://arctic-shift.photon-reddit.com/) — Pushshift successor, posts + comments
- r/tvtime threads: `1vhawhh` ("TvTime wasn't that good"), `1vjuvc3` ("whose gonna make all of those apps connect?"), `1vjui9t` ("TV Time PTSD")
- [TV Community Archive](https://tvtime-archive.com/) — 30M+ rescued TV Time comments

**Competitive**
- [TechCrunch — TV Time co-founder launches Bingers](https://techcrunch.com/2026/08/04/tv-time-co-founder-launches-bingers-to-revive-the-beloved-tv-tracking-app/)
- [9to5Mac — Bingers is now live](https://9to5mac.com/2026/08/04/bingers-a-new-tv-tracking-app-from-the-founder-of-tv-time-is-now-available-to-download/)
- [Engadget — TV Time functionally relaunching](https://www.engadget.com/2213944/tv-time-is-relaunching-as-its-parent-company-pivots-to-ai/)

**Remote control feasibility**
- [Can I Use — Web Bluetooth](https://caniuse.com/web-bluetooth) · [WebBluetoothCG implementation status](https://github.com/WebBluetoothCG/web-bluetooth/blob/main/implementation-status.md)
- [MDN — Mixed content](https://developer.mozilla.org/en-US/docs/Web/Security/Mixed_content)
- [Roku — External Control Protocol (ECP)](https://developer.roku.com/dev/docs/external-control-api)
- [Roku Community — ECP going away? CORS-RFC1918](https://community.roku.com/t5/Roku-Developer-Program/ECP-going-away-CORS-RFC1918/td-p/736700)
- [In-browser Roku remote in ~80 lines of TypeScript](https://dev.to/hisuperdev/i-built-an-in-browser-roku-tv-remote-with-80-lines-of-typescript-heres-how-rokus-ecp-api-56ni)
- [WICG — mDNS Service Discovery API proposal](https://discourse.wicg.io/t/preposal-mdns-service-discovery-api/5966/)
- [How Plex is doing HTTPS for all its users](https://words.filippo.io/how-plex-is-doing-https-for-all-its-users/)

**Watching mode / danmaku**
- [W3C — Bullet Chatting use cases](https://w3c.github.io/danmaku/usecase.html)
- [Logic Magazine — Bullet Time (history of danmaku)](https://logicmag.io/china/bullet-time/)
- [SmartBullets — deep-learning bullet screen filtering](https://arxiv.org/pdf/1905.05925)
- [ACRCloud — second screen synchronisation](https://acrcloud.com/second-screen-synchronization%E2%80%8B/)

# Reviewies — Research Phase 4: Remote Control Architecture & Cross-App Feature Gaps

**Date:** 14 August 2026
**Status:** Research complete. Revises the phase 3 §3 recommendation to defer the remote —
there is a viable PWA-compatible path.

---

## 1. The remote control — you were right, there is a way

Phase 3 concluded the remote couldn't be done from a PWA. That conclusion was correct about the
*direct* approach and wrong about the problem as a whole. Your Unified Remote instinct points at
the architecture that works.

### 1.1 First, the Notification Centre analogy — why it doesn't transfer directly

It's an intuitive comparison but the mechanism is different in an important way. Those controls
work because **iOS itself owns the audio session** — the OS exposes `MPRemoteCommandCenter` /
Now Playing to native code, and it's controlling media playing *on or through your phone*
(including AirPlay targets). It is not a general-purpose remote for arbitrary devices on your
network.

The web platform's equivalent, the **Media Session API**, only lets a web page publish metadata and
receive play/pause events for media *that page is playing itself*. There's no API that lets a
browser reach out and drive a separate device.

**But** — and this is the important part — the same class of API exists on desktop operating
systems, and a program running on that computer *can* read and drive it:

| OS | System media API | Gives us |
|---|---|---|
| Windows | `GlobalSystemMediaTransportControlsSessionManager` (WinRT) | Title, playback position, play/pause/seek control |
| macOS | MediaRemote / Now Playing | Title, position, transport control |
| Linux | MPRIS over D-Bus | Title, position, transport control |

So your intuition is correct — those controls *are* effectively a remote, and they're programmable.
They just need a small process running on the machine, not a browser tab.

### 1.2 How Unified Remote actually works

Unified Remote is a **native mobile app plus a server you install on the target computer**. The
phone discovers the server via **UDP broadcast on port 9511**, then communicates over TCP. It ships
70+ integrations (VLC, Spotify, YouTube, media players) and supports mouse, keyboard, media and
power functions.

Two things follow from that:

1. **It controls computers, not smart TVs.** The model depends on installing their server on the
   target, which you can't do on a Roku or a smart TV. Its TV support is not comparable to what it
   does for a laptop.
2. **Its discovery mechanism is the one part we can't copy.** UDP broadcast is unavailable to a
   browser — no raw UDP, no multicast. Copying it verbatim would force us native.

But the *companion-server model* — the actually important idea — is exactly right, and it's
copyable. We just invert the connection direction.

### 1.3 The architecture: a companion bridge with cloud relay

Instead of the phone discovering the bridge on the LAN, **the bridge dials out to our server**:

```
   PWA (HTTPS)                Our server              Bridge (on your LAN)         Target
  ┌───────────┐   WSS    ┌─────────────────┐  WSS   ┌────────────────────┐
  │  Remote   │ ───────► │  relay: routes  │ ◄───── │ outbound connection │
  │  drawer   │          │  cmd → bridge   │ ──────►│  (no port forward)  │
  └───────────┘          └─────────────────┘        └─────────┬──────────┘
                                                              │
                                        ┌─────────────────────┼──────────────────┐
                                        ▼                     ▼                  ▼
                                 Local machine          Roku (ECP)        Apple TV (pyatv)
                                 via OS media API       Chromecast        LG/Samsung
                                 (title + position!)    (Cast)            (SSAP/Tizen)
```

**Why this clears every wall from phase 3:**

| Phase 3 blocker | Resolved by |
|---|---|
| Web Bluetooth absent on iOS | Not needed — the bridge does any local protocol work |
| Mixed content (HTTPS → HTTP LAN) | All PWA traffic is WSS to our own server. Nothing touches a private IP from the browser. |
| No mDNS/SSDP discovery in browser | Bridge dials **outbound**, so nothing needs discovering. Also means no port forwarding and no router config. |
| Private Network Access deprecation | Irrelevant — no public→private requests happen |

Latency is one extra hop, realistically 50–150 ms. For play/pause/skip that is imperceptible.

**Compared to the Plex-style local TLS trick** (phase 3 Option B): cloud relay is strictly better
for our purposes. No wildcard certificate to buy and rotate, no DNS-rebinding-protection failures on
locked-down routers, and it works identically off-network. The cost is that our server sits in the
path — a privacy consideration worth being explicit about, and an argument for making the bridge
self-hostable so the relay can be pointed elsewhere.

### 1.4 The best case: if you watch on a computer

**If you watch on a laptop or desktop, this becomes dramatically better than a remote.** The bridge
runs on that machine, and via the OS media API it gets **the title and the exact playback
position** — not just the ability to send commands.

That means Watching Mode gets **perfect automatic sync for free**: no manual "start watching"
button, no clock drift, no ACR fingerprinting. The bridge just reports position, continuously.

This is the single highest-leverage configuration in the whole project, and it's much easier than
the TV path. **Worth knowing what you actually watch on before we build anything** — it changes
which half of this to build first.

### 1.5 The TV path, and its honest limits

For a TV or streaming stick, the bridge speaks the device's native protocol over the LAN:

| Device | Protocol | Position reporting |
|---|---|---|
| **Roku** | ECP — `POST /keypress/<Key>`, no auth | ✅ `/query/media-player` |
| **Chromecast / Google TV** | Cast | ✅ media status |
| **Apple TV** | pyatv (MRP/Companion), needs pairing | ✅ |
| **LG webOS** | SSAP WebSocket | ⚠️ transport yes, position patchy |
| **Samsung Tizen** | WebSocket + token pairing | ⚠️ same |
| **Fire TV** | ADB | ⚠️ awkward |

Two caveats that don't go away:
- **This requires an always-on machine on your network.** If you watch on a laptop, the laptop *is*
  the bridge — zero extra hardware. If you only watch on a TV, you need something like a Pi.
- **Streaming apps often don't report position.** Roku's ECP reports what the Roku knows; if
  Netflix's app doesn't publish it, we get transport control but not a reliable timestamp. The
  remote works; the automatic sync may not.

**Home Assistant remains the cheapest first version** — if you run it, it already maintains
integrations for every device above and exposes a clean REST API. We'd write one integration
instead of six.

### 1.6 Revised recommendation

**Phase 3 said defer the remote. Revise that to: defer the *TV* remote, prototype the *bridge*.**

Sequence:
1. **Watching Mode with manual sync** — still first, still the differentiator, still zero dependencies
2. **Bridge v1 for desktop** — a small companion (Go or Node, one binary) that reports title +
   position from the OS media API and accepts transport commands. This is the highest value for the
   least work, and it makes Watching Mode fully automatic.
3. **Bridge v2 for TV devices** — Roku first (the protocol is trivial), then Cast/pyatv. Or Home
   Assistant as a shortcut.
4. Native app only if you later want widgets — no longer required for the remote

The side-drawer placement stays right, for the reasons in phase 3 §3.5.

---

## 2. Cross-app feature gaps (r/Letterboxd, r/Serializd, r/Simkl, r/trakt)

Mined via Arctic Shift. The richest single source was
[**"What features would you add to Letterboxd if you could?"**](https://www.reddit.com/r/Letterboxd/comments/1vjp6be/) — 474 comments.

### 2.1 Triple-confirmed gaps (multiple independent sources — highest confidence)

**1. Filter out low-effort one-liner reviews**
> *"Can I get a way to filter out short one-liner reviews? Please?"* — r/Letterboxd

Independently raised on Hacker News (phase 1) and now on Reddit. Three sources, zero competitors
shipping it. **Trivial to build, disproportionately loved.** Ship it.

**2. Hide / demote already-watched content**
> *"I wish I could sort lists by 'shove all the ones I've already seen to the bottom.'"*

Also the top recurring complaint on Trakt's roadmap (phase 1). Applies to lists, discovery and
recommendations alike.

**3. Rewatch counts as a first-class number**
> *"I have seen top gun maverick total of 14 times and think that would be great to just put in the number."* — r/Letterboxd
> *"Simkl REALLY needs a rewatch feature"* — r/Simkl (27 pts)
> *"there is no number to show how much times I have rewatched it like there is in Letterboxd"* — r/Serializd

Letterboxd has it, the TV trackers don't. Requires modelling watches as **events**, not a boolean —
a schema decision to make now, not retrofit.

**4. Custom / fan-made posters, and general TMDB frustration**
> *"wish there was an option to add fanmade posters because TMDB is shit"* — r/Serializd (18 pts)
> *"Stop using TMDb so the trigger-happy mods don't get to delete all the cool posters"* — r/Letterboxd

Users resent being at the mercy of TMDB moderation. Allowing a user-supplied poster override is
easy and neatly sidesteps a frustration nobody else addresses.

### 2.2 Strong single-source ideas worth taking

**Notes on watchlist items** — my favourite find:
> *"The amount of things I have in my wishlist that i have ZERO memory for why they're there... I want to be able to write 'friend recommended'."*

Universally relatable, near-zero build cost, nobody ships it.

**Spoiler-free logging**
> *"I try to avoid seeing reviews and ratings of movies before I see them for myself. It's a little hard to do that when I have to go to the page to add it."*

Marking something watched shouldn't force you through a page covered in other people's ratings.
Argues for a quick-log action that never opens the detail page — which also aligns with the
Reddit-wide demand for speed and simplicity (phase 3 §2.2).

**Episode-level ratings for TV**
> *"TV should be rated by the episode, not by the series... a series of 8 television episodes is really just a series of 8 films."*
> *"Individual Episode Rating system"* — r/Simkl

Already in our plan; now externally validated as the correct granularity.

**Mixed lists (film + TV in one list)**
> *"Mixed Lists Remain a Severe Unmet Need"* — r/Simkl (16 pts)

A natural win for us — we're unified from the start, whereas Letterboxd is bolting TV onto a film
product and Simkl keeps them apart.

**Content/trigger warnings**
> *"There's a website called doesthedogdie where you can look up a movie and see which triggers it has... Letterboxd could either collaborate with them or create their own version."*

Community-voted content warnings. Genuinely differentiating, and the reaction data from Watching
Mode could partly generate it for free.

**Private reviews**, **stats scoped by year**, **manual list ordering**, **stackable filters**,
**filter parity between web and mobile**, **liking replies**, **clubs/groups with challenges**
(e.g. "Criterion Challenge 2026"), **rating-over-time graphs**, and **distinct cuts/versions as
separate loggable entities** (director's cuts) all came up with meaningful support.

### 2.3 Anti-patterns — things users actively punish

- **Ads over UI.** *"a seriously annoying ad appear right over the buttons at the bottom of the screen"* (r/Serializd)
- **Paywalling data export.** *"Is charging for Privacy and Data Export compliant with GDPR?"* (r/Simkl, 60 pts). Export must stay free forever — it's also our core promise.
- **Silent removal of features / silencing critics.** See below.

### 2.4 Major development: Trakt has broken its third-party ecosystem

This wasn't in phase 1 and it matters. r/trakt's top post — *"Hey Trakt. Youre a bunch of clowns"*
(130 pts) — is about Trakt **deleting free users' API clients and paywalling API access with no
warning**:

> *"I am currently maintaining Apple media center that integrates with Trakt and at this point I am considering removing support for it. I'm not interested in integrating with a service that breaks without any prior heads up."*

> *"I wouldn't even been against paying them a few bucks a month — but to nuke my keys and paywall everything without sending me any communication, a heads up, or the chance to get everything in order..."*

Plus repeated reports of critical comments being deleted and users banned from the forums, and the
OP itself being removed.

**Two implications:**
1. Trakt's developer ecosystem is actively looking for somewhere to go. An open, documented,
   free API would be genuinely differentiating — and it was already a stated user wish (*"If they
   add Export features, some statistics and ideally an API it would be perfect for me"*, phase 3).
2. **Two-way Trakt sync is now a risk, not just work.** Phase 3 noted users demand real sync over
   import. Building on an API whose owner nukes keys without notice is a dependency to take
   deliberately, if at all.

### 2.5 Validation for Watching Mode

Simkl shipped **"Watching Now" Check-In** (45 pts) — *"Track movies, live TV, and share what you're
watching."* Adjacent to your idea and well received, but it's a **status broadcast**, not
timestamped in-moment reactions. It confirms appetite for a live watching layer without occupying
the space. Our version goes considerably further.

---

## 3. Updated build order

Merging phase 3's simplicity mandate with these findings:

**MVP**
1. Opens directly on Up Next; one-tap mark watched; fast
2. **Quick-log that never opens the detail page** (spoiler-free logging)
3. Search, watchlist **with notes**, where-to-watch
4. Import (TV Time rescue CSVs, GDPR zips, Trakt/Simkl) + free one-click export
5. **Watching Mode, manual sync, reactions replayed from history**
6. Per-episode comments with image attachments, spoiler-gated
7. Imported TV Time comment archive (with the §2.6 phase-3 legal caveats)

**Fast follows — cheap, high-confidence, nobody else has them**
- Review length filter
- Rewatch counts (needs watches modelled as events **from day one**)
- Hide/demote already-watched everywhere
- Custom poster override
- Mixed film + TV lists
- Episode-level ratings

**Then**
- Desktop bridge → automatic Watching Mode sync
- TV bridge (Roku first)
- Content warnings; clubs/challenges; stats by year

---

## 4. Open questions

1. **What do you watch on?** Still the highest-value unknown. A laptop makes the bridge trivial and
   Watching Mode automatic; a TV-only setup needs a Pi.
2. Do you run **Home Assistant**? If yes, the TV remote gets much cheaper.
3. Would you want the bridge **self-hostable** (relay pointed at your own server) for privacy?
4. Still open: streaming-availability country; anime library separate or unified; friends-only vs
   public sign-ups.

---

## 5. Sources (phase 4)

**Remote architecture**
- [Unified Remote — Wikipedia](https://en.wikipedia.org/wiki/Unified_Remote)
- [openHAB Unified Remote binding](https://www.openhab.org/addons/bindings/unifiedremote/) — documents UDP discovery on port 9511
- [Roku External Control Protocol](https://developer.roku.com/dev/docs/external-control-api)
- [MDN — Media Session API](https://developer.mozilla.org/en-US/docs/Web/API/Media_Session_API)
- [LG UDAP spec (second screen / companion apps)](https://webostv.developer.lge.com/assets/netcast/NetCast-UDAP.pdf)

**Feature gaps — Reddit via [Arctic Shift](https://arctic-shift.photon-reddit.com/)**
- r/Letterboxd `1vjp6be` — "What features would you add to Letterboxd if you could?" (474 comments)
- r/trakt `1vcwlgn` — API keys deleted / paywalled (130 pts)
- r/Simkl `1v76tbh` (mixed lists), `1qcfqhl` (episode ratings), `1qd7dym` (rewatch), `1qsgzvf` ("Watching Now" check-in), `1percwc` (paywalled export / GDPR)
- r/Serializd `1vaksma` (fan posters), `1v4cioe` (rewatch counts), `1vlwxdl` (ads over UI)

# Reviewies — Research Phase 5: Universal Remote & Timestamp Sync

**Date:** 14 August 2026
**Question:** Can we connect to *anything*, and can the remote be implemented cleanly?
**Short answer:** There is no single clean protocol, and there won't be one soon. But there is a
clean *architecture*. And for your own devices, there's something better than a remote.

---

## 1. Is there one clean technological solution? No.

I looked specifically for the standard that would make this a solved problem. It doesn't exist.

**Matter Casting was the genuine hope** — an open CSA standard for casting and TV control, explicitly
positioned as the vendor-neutral alternative to AirPlay and Chromecast. It is technically good. But
adoption killed it as a universal answer:

- **Amazon is essentially the only backer.** Supported on most Fire TVs (Fire OS 7+), with Panasonic
  among the first TV brands to adopt.
- **Apple and Google have not adopted it and have announced no plans.** They both continue to push
  their proprietary standards.
- No major streaming services beyond a handful Amazon is courting (Plex, Pluto TV, Sling, STARZ).

With Apple and Google out, Matter Casting cannot be the universal layer. The other candidates fail
for their own reasons: **DLNA/UPnP** is for pushing local media files, not controlling streaming
apps; **DIAL** only launches apps, it doesn't do transport control; **Google Cast** and **AirPlay 2**
each cover a large slice but are ecosystem-locked and can't be spoken from a browser on iOS.

**So: universal connection via one protocol is not a realistic goal.** Anyone claiming otherwise —
including every "Universal TV Remote" app on the app stores — is shipping a pile of per-vendor
adapters behind a single UI. That is the actual state of the art.

---

## 2. But it *can* be implemented cleanly — the bridge is the abstraction boundary

"Clean" is achievable at the architecture level even though the device layer is irreducibly plural.
The trick is that **all the mess lives in one replaceable component**, not smeared through the app.

```
        PWA                     Relay                    Bridge
  ┌──────────────┐                              ┌──────────────────────┐
  │ remote drawer│                              │  DeviceAdapter API   │
  │              │  ── one clean API over WSS ──►  listDevices()       │
  │ play/pause   │                              │  sendCommand()       │
  │ ±15s, seek   │                              │  getPosition()       │
  └──────────────┘                              └──────────┬───────────┘
                                                           │
              ┌──────────┬──────────┬───────────┬──────────┴──────┐
              ▼          ▼          ▼           ▼                 ▼
           Cast        Roku      AirPlay/     webOS /          Local OS
                        ECP       pyatv       Tizen           media API
```

The PWA only ever knows three verbs. Adding a device type is one new adapter, shipped in the bridge,
with no app change. This is exactly how Home Assistant and every universal remote app works — there
is no shortcut, but the pattern is well-trodden and genuinely tidy.

### Coverage with a small number of adapters

| Adapter | Devices reached | Position? |
|---|---|---|
| **Google Cast** | Chromecast, Android TV, Google TV, and Cast-enabled sets from Sony, TCL, Hisense, Vizio | ✅ |
| **Roku ECP** | Roku TVs + sticks. Trivial protocol: `POST /keypress/<Key>`, no auth | ✅ `/query/media-player` |
| **AirPlay 2 / pyatv** | Apple TV, plus AirPlay-enabled Samsung, LG, Sony, Vizio | ✅ |
| **webOS SSAP / Tizen WS** | LG and Samsung native control | ⚠️ transport yes, position patchy |
| **Local OS media API** | The machine the bridge runs on | ✅ excellent |

Four adapters plus the local one covers the large majority of real households. **Roku first** — it's
the simplest protocol of the set and reports position.

### The unavoidable costs

1. **An always-on device on the LAN.** If you watch on a laptop, the laptop is the bridge — no extra
   hardware. TV-only households need a Pi or similar. This is a real adoption barrier and the main
   reason not to make the remote a headline feature.
2. **Position reporting is device-dependent even when control works.** Roku reports what the Roku
   knows; if the Netflix app doesn't publish position, we get a working remote but no reliable
   timestamp. **Control and sync are separate problems** — solving one does not solve the other.

---

## 3. For your devices, the browser extension beats the remote entirely

You watch on laptop, tablet and phone. That changes the recommendation, because for browser-based
watching there is a genuinely clean, single-mechanism solution: **read `video.currentTime` directly.**

**This is proven, not speculative.** [Universal Trakt Scrobbler](https://github.com/trakt-tools/universal-trakt-scrobbler)
is an open-source extension supporting **30+ streaming services** — Netflix, Prime, Disney+, HBO Max,
Crunchyroll and more — by scraping the page or using the service's internal API. Simkl ships an
equivalent. The category has existed for years and works.

Why this is better than a remote for your use case:

- **Exact position, continuously**, with no drift, no calibration, no microphone
- **No extra hardware, no bridge, no always-on machine**
- **No LAN protocols** — the extension talks straight to our server over HTTPS
- Works on Chrome, Firefox and Safari on desktop; Safari supports web extensions on iOS/iPadOS too
- Gives us automatic scrobbling for free — which was on the phase-2 "explicit non-goals" list purely
  because it seemed expensive. Via the extension it's nearly free.

Known limitations, from the prior art: some services are sync-only rather than live-scrobble (e.g.
Crunchyroll), Prime's detection is English-only, and each service needs its own small adapter that
breaks when they redesign. That last one is ongoing maintenance, but it's shared across a well-known
open-source ecosystem we can learn from.

**Recommendation: build the browser extension before the bridge.** It serves your primary device,
it's the cleanest mechanism available, and it delivers perfect Watching Mode sync immediately.

---

## 4. The full sync matrix

| You watch on | Best mechanism | Sync quality | Needs |
|---|---|---|---|
| **Laptop, in a browser** | **Browser extension** | ✅ Exact | Extension install |
| Laptop, native app (Netflix app, VLC, Plex) | Desktop bridge via OS media API | ✅ Exact | Bridge install |
| **Smart TV / stick** | Bridge + device adapter | ✅ Roku/Cast/ATV · ⚠️ others | Always-on LAN device |
| **Tablet** (watching there, reacting on phone) | Manual sync, or ACR later | ⚠️ Good enough | Nothing |
| **Phone** (watching + reacting on same device) | Manual sync | ⚠️ Awkward | Nothing |

**One honest note on the last row:** if you're watching *on your phone* and reacting *on your phone*,
the second-screen premise breaks down — you can't show a full-screen reaction UI over someone else's
video app. Watching on tablet and reacting on phone works fine. Phone-only is the one configuration
where Watching Mode doesn't really make sense, and that's worth accepting rather than engineering
around.

---

## 5. Audio fingerprinting — the honest assessment

You raised ACR as the universal fallback. It's the right instinct, and it has one fatal flaw in its
naive form plus a genuinely interesting way around it.

### The fatal flaw

ACR matches a microphone sample against a **reference fingerprint database**. Commercial TV
monitoring works because broadcasters upload their own content — ACRCloud's custom-content service
(~$26/month at last public pricing) is built on *you* supplying the audio.

**We would need a fingerprint of every episode of every show.** We don't have that media, can't
legally acquire it at scale, and couldn't afford to process it. Buying it isn't an option either —
no vendor sells a fingerprint index of all television.

Open-source tooling exists and is good — [Chromaprint](https://github.com/acoustid/chromaprint)
(fingerprints a 2-minute file in <100ms into ~2.5 KB) and [Dejavu](https://github.com/worldveil/dejavu)
(MIT, but weak on queries under 5 seconds). The tooling was never the problem. **The reference
corpus is.**

### The way around it: crowd-sourced fingerprints

We have an advantage commercial ACR doesn't: **we already know what you're watching** — you told us.
We don't need to *identify* content, only to locate a *position* within one known episode.

So the reference database can be built by users:
1. First viewer of an episode syncs manually and contributes a fingerprint timeline
2. Later viewers match against that crowd-built reference for automatic sync
3. Coverage grows exactly where demand is, at zero licensing cost

Fingerprints are one-way hashes, not audio — the same basis on which AcoustID operates — which puts
this on considerably safer ground than storing media. It's genuinely promising, and it's also
complex enough to be v3 work, not MVP.

### The cheap trick worth doing first

There's a much simpler idea that gets most of the benefit for almost no cost, using data we already
collect: **crowd drift correction.**

Reaction density over an episode is a fingerprint in itself. If your reactions consistently land ~8
seconds after everyone else's density spikes, we can detect that and offer *"looks like you're 8s
behind — fix?"* — or just correct silently.

No microphone, no audio processing, no reference database. It makes manual sync **self-healing**, and
it gets better as more people use the app. This should ship with Watching Mode v1.

---

## 6. Recommendation

**Yes, build the remote — but build it second, and build the extension first.**

1. **Watching Mode, manual sync + crowd drift correction.** Zero dependencies, works everywhere
   today, self-improving. Proves people enjoy the feature before we invest in plumbing.
2. **Browser extension.** Cleanest mechanism, serves your primary device, exact sync, and gives us
   automatic scrobbling as a bonus. Strong open-source prior art to learn from.
3. **Bridge v1 — desktop.** Local OS media API for native-app watching; also the natural home for
   the remote UI, since a laptop needs no extra hardware.
4. **Bridge v2 — TV adapters.** Roku first (simplest, reports position), then Cast, then pyatv. Home
   Assistant as a shortcut if you run it.
5. **Crowd-sourced ACR.** Only if manual sync plus drift correction proves insufficient in practice.

The remote drawer becomes genuinely useful from step 3 onward and grows coverage with each adapter.
Keeping it in a side drawer remains right — it stays out of the way of the simplicity mandate
(phase 3 §2.2) while being there when you want it.

**What I'd caution against:** making universal device support a launch requirement. It's the most
expensive part of the project, it needs hardware most people don't have, and it serves a feature
(Watching Mode) that works acceptably without it. Ship the feature, then deepen the sync.

---

## 7. Open questions

1. **Which browsers/apps do you actually watch in?** If it's Netflix/Prime/Disney+ in Chrome on the
   laptop, the extension covers you completely and the bridge becomes optional.
2. Would you use a **tablet + phone** pairing (watch on iPad, react on phone)? That's the
   configuration manual sync serves worst and ACR would help most.
3. Still open: streaming-availability country; anime library separate or unified; friends-only vs
   public sign-ups.

---

## 8. Sources (phase 5)

**Protocols & universality**
- [FlatpanelsHD — Matter to support TV control & universal casting](https://flatpanelshd.com/news.php?id=1639113506&subaction=showfull)
- [FlatpanelsHD — Upgraded Matter Casting takes on AirPlay and Chromecast](https://www.flatpanelshd.com/news.php?subaction=showfull&id=1715233060)
- [Matter Alpha — What is Matter Casting and which devices support it](https://www.matteralpha.com/explainer/what-is-matter-casting)
- [Amazon Fire TV — Overview of Matter Casting](https://developer.amazon.com/docs/fire-tv/overview-of-matter-casting.html)
- [TechHive — Matter Casting looks superior to AirPlay, Chromecast. Can it win?](https://www.techhive.com/article/2200884/matter-casting-looks-superior-to-airplay-chromecast-can-it-win.html)
- [AirPlay vs DLNA vs Cast vs Miracast: full guide for 2026](https://pigeoncast.com/blogs/airplay-vs-dlna-vs-cast-vs-miracast)
- [Roku External Control Protocol](https://developer.roku.com/dev/docs/external-control-api)

**Browser extension prior art**
- [Universal Trakt Scrobbler — source](https://github.com/trakt-tools/universal-trakt-scrobbler) · [Chrome Web Store listing](https://chromewebstore.google.com/detail/universal-trakt-scrobbler/mbhadeogepkjdjeikcckdkjdjhhkhlid)
- [Simkl — media player and browser scrobblers](https://simkl.com/apps/windows/)

**Audio fingerprinting**
- [Chromaprint / AcoustID](https://github.com/acoustid/chromaprint) · [acoustid.org](https://acoustid.org/chromaprint)
- [Dejavu — MIT-licensed Python audio fingerprinting](https://github.com/worldveil/dejavu)
- [ACRCloud — broadcast monitoring for custom content](https://docs.acrcloud.com/get-started/tutorials/broadcast-monitoring-for-custom-content)
- [ACRCloud — second screen synchronisation](https://acrcloud.com/second-screen-synchronization%E2%80%8B/)
- [Will Drevo — audio fingerprinting and recognition in Python](https://willdrevo.com/fingerprinting-and-audio-recognition-with-python/)

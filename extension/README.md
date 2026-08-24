# Reviewies browser extension

Reads playback position directly off the `<video>` element on streaming sites.

This is the cleanest sync mechanism available for browser-based watching — exact,
continuous, no drift, no microphone, no extra hardware. For a laptop it is better than
any remote-control approach, and it gives automatic scrobbling as a side effect.

## Build and install

```bash
cd extension
npm install
npm run build
```

Then load `extension/dist` as an unpacked extension (`chrome://extensions` →
Developer mode → Load unpacked). Set a relay URL in the extension's options if you
want playback forwarded to a running Reviewies instance; leave it blank to send
nothing.

## Driving Watching Mode

A second content script runs on the Reviewies app page itself and relays the current
playback position into it, so Watching Mode syncs automatically instead of needing a
manual start. Delivery is by `window.postMessage`, so the app needs no knowledge of
the extension's ID and behaves the same locally, self-hosted, or deployed.

The app ignores readings older than 15 seconds — a crashed or reloading extension
must not freeze the clock at its last known position — and ignores readings for a
different episode, so a show left playing in another tab cannot drag the timeline.

The manifest currently matches `localhost` and `127.0.0.1`. Add your deployed origin
to that content script entry when you host the app somewhere.

## What it reads

Only the title of what is playing and the current playback position. Nothing on the
page is modified, and no other page content leaves the tab.

## Supported sites

Netflix, Prime Video, Disney+, Max, Crunchyroll, YouTube.

## ⚠️ On selector rot

The per-site CSS selectors in `src/adapters.ts` are **unverified against the live
sites** — they were written from documented and commonly-used selectors, and streaming
services redesign without notice. Expect them to need correction. This is the same
maintenance treadmill every scrobbler extension lives on; the long-running
[Universal Trakt Scrobbler](https://github.com/trakt-tools/universal-trakt-scrobbler)
is worth reading for how it handles the same problem across 30+ services.

The design assumption is that breakage **degrades rather than fails**:

- Each adapter falls back to parsing the page title, which every site sets.
- A site with no adapter at all still works if it has a `<video>` element.
- A detection that is not confident is discarded rather than guessed at, because
  marking the wrong episode watched silently corrupts history.

So a stale selector costs precision, not function.

## Tests

The parsing and detection logic — the part that decides *which* episode gets marked —
is tested from the app package:

```bash
cd ../app && npx vitest run src/extension
```

40 tests cover the label formats each service uses, show/episode splitting, the
confidence gate, lookalike-domain rejection, preferring the longest video so adverts
and trailers are ignored, and the scrobble threshold.

# Reviewies browser extension

Reads playback position directly off the `<video>` element on streaming sites.

This is the cleanest sync mechanism available for browser-based watching — exact,
continuous, no drift, no microphone, no extra hardware. For a laptop it is better than
any remote-control approach, and it gives automatic scrobbling as a side effect.

## Does this still have a job?

Yes, and the question is worth answering here rather than in a research note, because
the product went app-first and this is a browser extension.

The phone now syncs Watching Mode by listening to the room. That solves a different
problem: watching on a *television*, where nothing is instrumentable and the only signal
available is sound. This solves watching in a *browser*, where the position is sitting
right there on a DOM element. Where both could apply, this one is strictly better —
exact rather than approximate, and it needs no crowd-contributed reference timeline at
all, which is the listening path's real weakness. An episode nobody has mapped cannot be
listened to; every episode can be read off a `<video>`.

It is also the only thing in the product that marks an episode watched without anybody
tapping anything — see *Marking things watched* below, which is a newer claim than it
looks, because until §6.42 that half posted into the void.

So it stays. What is *not* claimed for it: that its selectors work today (see below),
that it will ever cover more than a handful of services, or that it is the primary way
anyone uses Reviewies. It is the laptop case, done properly.

## Build and install

```bash
cd extension
npm install
npm run build
```

Then load `extension/dist` as an unpacked extension (`chrome://extensions` →
Developer mode → Load unpacked). There is nothing to configure: everything the
extension sees is handed to an open Reviewies tab, and if there is not one open it
waits.

There used to be an options page for a "relay URL", pointing at
`https://your-reviewies-instance/api/playback`. No Reviewies instance has ever served
that path — the app is a static site, and on the deployed origin the SPA rewrite answers
it with `index.html` and a 200, so the POST succeeded and nothing happened. It is gone,
along with the `alarms` permission, which nothing ever used.

## Driving Watching Mode

A second content script runs on the Reviewies app page itself and relays the current
playback position into it, so Watching Mode syncs automatically instead of needing a
manual start. Delivery is by `window.postMessage`, so the app needs no knowledge of
the extension's ID and behaves the same locally, self-hosted, or deployed.

The app ignores readings older than 15 seconds — a crashed or reloading extension
must not freeze the clock at its last known position — and ignores readings for a
different episode, so a show left playing in another tab cannot drag the timeline.

The manifest matches `localhost`, `127.0.0.1`, and the deployed origin. Add your own to
that content script entry if you host the app somewhere else — until an origin is listed
there, the extension cannot reach the app page at all, which is a silent nothing rather
than an error. That was true of the deployed app for some weeks: the manifest listed only
localhost while the app it was meant to drive lived on Vercel.

## Marking things watched

Past ninety per cent of an episode, the extension records it and hands it to an open
Reviewies tab on the same `postMessage` channel the position uses. The app decides what
to do with it, and is deliberately unwilling:

- only shows **already in your library** are considered. Nothing is added and nothing is
  looked up — a page title must not be able to start tracking something for you.
- the name has to match one library entry closely and beat the runner-up clearly.
  Ambiguity is declined rather than guessed at.
- an episode already watched is left alone, so a heartbeat arriving twice is not a
  rewatch.

If no Reviewies tab is open the watch waits in the extension until one is, up to fifty of
them. The rules live in `core/src/watching/scrobble.ts` and are tested there.

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

Two levels.

The parsing and detection logic — the part that decides *which* episode gets marked —
is tested from the app package:

```bash
cd ../app && npx vitest run src/extension
```

That suite covers the label formats each service uses, show/episode splitting, the
confidence gate, lookalike-domain rejection, preferring the longest video so adverts
and trailers are ignored, and the scrobble threshold.

And the extension itself runs, in a real browser:

```bash
npm run smoke
```

It loads the built extension into Chromium, serves a fixture player page on the streaming
origin so the manifest's own match patterns decide whether the content script runs, and
follows a real `<video>` through to a playback update and a watch arriving on the app
page. Until §6.42 none of `content.ts`, `background.ts` or `inject.ts` had ever been
executed by anything.

What it does not prove is the selectors. A fixture written from the same assumptions as
the adapter shows the two agree with each other, which is not the same as either being
right about Netflix.

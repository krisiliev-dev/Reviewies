import type { Detection } from './adapters';

interface Pending {
  show?: string;
  season?: number;
  episode?: number;
  at: number;
}

/**
 * Content script for the Reviewies app page itself.
 *
 * The extension already watches streaming tabs; this half delivers what it sees to
 * an open Reviewies tab, so Watching Mode syncs without a manual start.
 *
 * Delivery is by window.postMessage rather than a direct extension API, so the app
 * needs no knowledge of the extension's ID and works identically whether it is
 * running locally, self-hosted, or on a deployed origin.
 */

const MESSAGE_TYPE = 'reviewies:playback';
const WATCHED_TYPE = 'reviewies:watched';
const POLL_MS = 1000;

/**
 * `at` is when the reading was *taken*, not when it was forwarded.
 *
 * It used to be `Date.now()`, which quietly defeated the only protection the app has
 * against a stopped stream. The app ignores readings older than fifteen seconds so that
 * a crashed or reloading extension cannot freeze the clock at its last known position —
 * but this poll re-stamps the same stored reading every second, so it never aged, and a
 * position that had stopped moving looked exactly like a paused one that was still being
 * observed. Closing the streaming tab left Watching Mode following it indefinitely.
 *
 * The background worker already records when it last heard from a content script. That
 * is the timestamp with the meaning the app wants, so it is the one that travels. §6.42.
 */
function forward(detection: Detection, updatedAt: number) {
  window.postMessage(
    {
      type: MESSAGE_TYPE,
      payload: {
        show: detection.show,
        season: detection.season,
        episode: detection.episode,
        positionMs: Math.round(detection.positionSec * 1000),
        durationMs: Math.round(detection.durationSec * 1000),
        paused: detection.paused,
        at: updatedAt,
      },
    },
    window.location.origin,
  );
}

/**
 * An episode the extension watched you finish.
 *
 * Same channel as the position, and the app decides what to do with it — it will only
 * ever confirm something already in your library, and only when it is sure which. See
 * `core/src/watching/scrobble.ts`.
 */
function deliver(pending: Pending[]) {
  for (const p of pending) {
    window.postMessage({ type: WATCHED_TYPE, payload: p }, window.location.origin);
  }
  // Acknowledged after posting, so a tab closing mid-delivery leaves the watch queued
  // rather than losing it. Delivering one twice is harmless.
  void chrome.runtime
    .sendMessage({ type: 'scrobbles-taken', keys: pending.map(keyOf) })
    .catch(() => {});
}

const keyOf = (p: Pending) => [p.show, p.season, p.episode].join('|');

// Ask the background worker what is currently playing, and relay it to the page.
setInterval(() => {
  chrome.runtime
    .sendMessage({ type: 'get-playback' })
    .then(
      (
        response:
          | { detection?: Detection; updatedAt?: number; pending?: Pending[] }
          | undefined,
      ) => {
        if (response?.detection) forward(response.detection, response.updatedAt ?? 0);
        if (response?.pending?.length) deliver(response.pending);
      },
    )
    .catch(() => {
      /* Background worker asleep or extension reloading. */
    });
}, POLL_MS);

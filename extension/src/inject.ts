import type { Detection } from './adapters';

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
const POLL_MS = 1000;

function forward(detection: Detection) {
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
        at: Date.now(),
      },
    },
    window.location.origin,
  );
}

// Ask the background worker what is currently playing, and relay it to the page.
setInterval(() => {
  chrome.runtime
    .sendMessage({ type: 'get-playback' })
    .then((response: { detection?: Detection } | undefined) => {
      if (response?.detection) forward(response.detection);
    })
    .catch(() => {
      /* Background worker asleep or extension reloading. */
    });
}, POLL_MS);

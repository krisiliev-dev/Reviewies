import { detect, isRealViewing, type Detection } from './adapters';

/**
 * Content script.
 *
 * Reads playback position straight off the <video> element, which is the cleanest
 * source of truth available anywhere — exact, continuous, no drift, no microphone,
 * no hardware. For browser watching this beats any remote-control approach.
 *
 * It only ever reads. Nothing on the page is modified, and no page content beyond
 * the title and timestamp leaves the tab.
 */

const POLL_MS = 1000;
let last: Detection | undefined;
let lastSentAt = 0;

function changedMeaningfully(a: Detection | undefined, b: Detection): boolean {
  if (!a) return true;
  if (a.show !== b.show || a.season !== b.season || a.episode !== b.episode) return true;
  if (a.paused !== b.paused) return true;
  // A jump larger than the poll interval means the user seeked, which Watching
  // Mode needs to know about promptly.
  return Math.abs(a.positionSec - b.positionSec) > POLL_MS / 1000 + 2;
}

function tick() {
  const detection = detect(document, location.hostname);
  if (!detection || !isRealViewing(detection)) {
    if (last) {
      chrome.runtime.sendMessage({ type: 'playback-stopped' }).catch(() => {});
      last = undefined;
    }
    return;
  }

  const now = Date.now();
  // Send on meaningful change, and a heartbeat every 10s so the app knows we are
  // still alive and can correct any drift.
  if (changedMeaningfully(last, detection) || now - lastSentAt > 10_000) {
    chrome.runtime.sendMessage({ type: 'playback', detection }).catch(() => {});
    lastSentAt = now;
  }
  last = detection;
}

setInterval(tick, POLL_MS);
document.addEventListener('visibilitychange', tick);
tick();

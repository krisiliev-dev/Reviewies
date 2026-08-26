/**
 * Receiving live playback position from the browser extension.
 *
 * This is the cleanest sync mechanism available for browser watching: the extension
 * reads `video.currentTime` directly, so there is no drift, no calibration and no
 * microphone. Manual sync remains the fallback everywhere else.
 *
 * One way in, `postMessage` from a content script the extension injects into this page.
 * This used to say two, the second being `chrome.runtime.sendMessage` to an extension
 * whose ID the page knows — and the extension had a listener for it. That listener could
 * never have fired: a page can only message an extension that names the page's origin
 * under `externally_connectable`, and the manifest has never had that key. The app did
 * not implement its half either, so both sides described a path neither had. §6.42
 * deleted the listener and this paragraph now says what is there.
 *
 * The app is a passive receiver. It never reaches into the extension, and a missing
 * extension simply means manual sync.
 */

export interface PlaybackUpdate {
  show?: string;
  season?: number;
  episode?: number;
  /** Playback position in milliseconds. */
  positionMs: number;
  durationMs: number;
  paused: boolean;
  /** When this reading was taken, so staleness is detectable. */
  at: number;
}

/** Readings older than this are ignored — a dead extension must not freeze the clock. */
export const STALE_AFTER_MS = 15_000;

const MESSAGE_TYPE = 'reviewies:playback';

export function isPlaybackUpdate(value: unknown): value is PlaybackUpdate {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.positionMs === 'number' &&
    Number.isFinite(v.positionMs) &&
    v.positionMs >= 0 &&
    typeof v.at === 'number'
  );
}

export function isStale(update: PlaybackUpdate, now = Date.now()): boolean {
  return now - update.at > STALE_AFTER_MS;
}

/**
 * Whether an update plausibly refers to the episode being watched.
 *
 * Without this check, leaving one show playing in a background tab would drag the
 * reaction timeline of a different episode. When the extension cannot identify the
 * season and episode we accept the update, since position is still better than
 * nothing and the user chose this screen deliberately.
 */
export function matchesEpisode(
  update: PlaybackUpdate,
  expected: { season?: number; episode?: number },
): boolean {
  if (update.season == null || update.episode == null) return true;
  if (expected.season == null || expected.episode == null) return true;
  return update.season === expected.season && update.episode === expected.episode;
}

/**
 * Listen for playback updates. Returns an unsubscribe function.
 *
 * Origin is the primary guard: a message from a different origin — an ad iframe,
 * say — must never be able to drive the reaction timeline. `event.source` is checked
 * too when the environment populates it, which browsers do and jsdom does not.
 */
export function subscribeToPlayback(onUpdate: (update: PlaybackUpdate) => void): () => void {
  function handleMessage(event: MessageEvent) {
    if (event.origin && event.origin !== window.location.origin) return;
    if (event.source && event.source !== window) return;
    const data = event.data as { type?: string; payload?: unknown } | null;
    if (!data || data.type !== MESSAGE_TYPE) return;
    if (isPlaybackUpdate(data.payload)) onUpdate(data.payload);
  }

  window.addEventListener('message', handleMessage);
  return () => window.removeEventListener('message', handleMessage);
}

/** Used by the extension's content script, and by tests, to deliver a reading. */
export function emitPlayback(update: PlaybackUpdate): void {
  window.postMessage({ type: MESSAGE_TYPE, payload: update }, '*');
}

import { isWatched, type Detection } from './adapters';

/**
 * Service worker.
 *
 * Holds the current playback state and forwards it to Reviewies. Two jobs:
 *
 *  1. Live position for Watching Mode, so reactions land on the right moment
 *     without a manual sync.
 *  2. Automatic scrobbling once an episode passes the watched threshold.
 *
 * A service worker can be evicted at any time, so durable state goes to
 * chrome.storage rather than module scope.
 */

interface State {
  detection?: Detection;
  updatedAt: number;
  /** Keys of episodes already scrobbled, so eviction cannot cause duplicates. */
  scrobbled: string[];
}

const DEFAULT_STATE: State = { updatedAt: 0, scrobbled: [] };

async function getState(): Promise<State> {
  const stored = await chrome.storage.local.get('state');
  return (stored.state as State) ?? DEFAULT_STATE;
}

async function setState(state: State): Promise<void> {
  await chrome.storage.local.set({ state });
}

async function getRelayUrl(): Promise<string | undefined> {
  const { relayUrl } = await chrome.storage.sync.get('relayUrl');
  return typeof relayUrl === 'string' && relayUrl ? relayUrl : undefined;
}

function keyOf(d: Detection): string {
  return [d.show, d.season, d.episode].join('|');
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message?.type === 'playback') {
      const detection = message.detection as Detection;
      const state = await getState();
      const key = keyOf(detection);

      const next: State = { detection, updatedAt: Date.now(), scrobbled: state.scrobbled };

      // Scrobble once per episode. The guard is persisted because the worker can
      // be evicted between polls and would otherwise re-send.
      if (isWatched(detection) && !state.scrobbled.includes(key)) {
        next.scrobbled = [...state.scrobbled.slice(-200), key];
        await relay('watched', detection);
      }

      await setState(next);
      await relay('position', detection);
    }

    if (message?.type === 'playback-stopped') {
      const state = await getState();
      await setState({ ...state, detection: undefined, updatedAt: Date.now() });
    }

    sendResponse?.({ ok: true });
  })();
  // Keep the message channel open for the async work above.
  return true;
});

/**
 * Post to the configured Reviewies endpoint.
 *
 * Failures are swallowed on purpose: the extension is an enhancement, and a
 * unreachable app must never break playback or spam the console.
 */
async function relay(kind: 'position' | 'watched', detection: Detection): Promise<void> {
  const url = await getRelayUrl();
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, detection, at: Date.now() }),
    });
  } catch {
    /* App not running or offline. Nothing to do. */
  }
}

// Allow the Reviewies page to query current playback directly.
chrome.runtime.onMessageExternal?.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'get-playback') {
    void getState().then((s) => sendResponse({ detection: s.detection, updatedAt: s.updatedAt }));
    return true;
  }
  return false;
});

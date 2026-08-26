import { isWatched, type Detection } from './adapters';

/**
 * Service worker.
 *
 * Holds the current playback state and hands it to an open Reviewies tab. Two jobs:
 *
 *  1. Live position for Watching Mode, so reactions land on the right moment
 *     without a manual sync.
 *  2. Marking an episode watched once it passes the threshold — the only thing in the
 *     product that records a watch without anybody tapping anything.
 *
 * Both travel the same way, and it is worth saying why, because the second one used to
 * travel differently and therefore did not travel at all. It POSTed to a URL configured
 * on an options page: `https://your-reviewies-instance/api/playback`, an endpoint no
 * Reviewies instance has ever served. The app is a static site; on the deployed origin
 * that path is answered by the SPA rewrite with `index.html` and a 200, so the `fetch`
 * resolved, nothing was recorded, and no error was raised anywhere. §6.42.
 *
 * So: no endpoint, no configuration, no network. A watch is delivered to the app page
 * exactly as a position is, and the app writes it to its own database. Which is also
 * what the rest of the product does — local first, and sync carries it up afterwards if
 * there is an account.
 *
 * A service worker can be evicted at any time, so durable state goes to chrome.storage
 * rather than module scope.
 */

interface Pending {
  show?: string;
  season?: number;
  episode?: number;
  /** When the extension saw it finish. */
  at: number;
}

interface State {
  detection?: Detection;
  updatedAt: number;
  /** Keys of episodes already scrobbled, so eviction cannot cause duplicates. */
  scrobbled: string[];
  /** Seen finished, not yet handed to a Reviewies tab. There may not be one open. */
  pending: Pending[];
}

const DEFAULT_STATE: State = { updatedAt: 0, scrobbled: [], pending: [] };

/** A queue for something nobody may collect needs a ceiling. Oldest go first. */
const MAX_PENDING = 50;

async function getState(): Promise<State> {
  const stored = await chrome.storage.local.get('state');
  const state = (stored.state as Partial<State>) ?? {};
  return { ...DEFAULT_STATE, ...state, pending: state.pending ?? [] };
}

async function setState(state: State): Promise<void> {
  await chrome.storage.local.set({ state });
}

function keyOf(d: { show?: string; season?: number; episode?: number }): string {
  return [d.show, d.season, d.episode].join('|');
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message?.type === 'playback') {
      const detection = message.detection as Detection;
      const state = await getState();
      const key = keyOf(detection);

      const next: State = { ...state, detection, updatedAt: Date.now() };

      // Once per episode. The guard is persisted because the worker can be evicted
      // between polls and would otherwise re-send — and because the poll itself repeats
      // every second once the threshold is passed.
      if (isWatched(detection) && !state.scrobbled.includes(key)) {
        next.scrobbled = [...state.scrobbled.slice(-200), key];
        next.pending = [
          ...state.pending,
          {
            show: detection.show,
            season: detection.season,
            episode: detection.episode,
            at: Date.now(),
          },
        ].slice(-MAX_PENDING);
      }

      await setState(next);
    }

    if (message?.type === 'get-playback') {
      const state = await getState();
      sendResponse?.({
        detection: state.detection,
        updatedAt: state.updatedAt,
        pending: state.pending,
      });
      return;
    }

    // The app page confirms what it has written. Acknowledged rather than cleared on
    // send, because a tab that is closing mid-delivery would otherwise lose the watch
    // silently — and a watch delivered twice is harmless: the app declines to record a
    // second one for an episode it already has.
    if (message?.type === 'scrobbles-taken') {
      const taken = new Set((message.keys as string[] | undefined) ?? []);
      const state = await getState();
      await setState({ ...state, pending: state.pending.filter((p) => !taken.has(keyOf(p))) });
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

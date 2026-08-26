import { db } from '../data/db.ts';
import { markWatched, watchedEpisodeIds } from '../data/repo.ts';
import { normaliseName, similarity } from '../data/reconcile.ts';
import { getEpisodesCached } from '../metadata/index.ts';
import type { CachedEpisode, InternalId } from '../domain/types.ts';

/**
 * Marking an episode watched because a browser extension saw you finish it.
 *
 * The extension has computed `isWatched` since it shipped and then posted the result to
 * a URL nothing serves: `https://your-reviewies-instance/api/playback`, which no
 * Reviewies instance has, and which on the deployed origin is answered by the SPA
 * rewrite with `index.html` and a 200 — so the `fetch` succeeded, nothing was recorded,
 * and no error was ever raised. `WatchEvent['source']` has had `'extension'` in it the
 * whole time with nothing writing it. §6.42.
 *
 * The delivery path is now the one that already works: the same `postMessage` the
 * position travels on. No endpoint, no account, no server — the watch lands in the local
 * database like every other one and the outbox carries it up if there is an account.
 *
 * ## What this deliberately will not do
 *
 * Guess. A scrobble arrives as a show *name* off a streaming page, and marking the wrong
 * episode watched silently corrupts a history somebody may have spent years building —
 * which is the failure this whole product exists to protect people from. So:
 *
 *  - only titles already in the library are considered. Nothing is added, nothing is
 *    looked up, and something you do not track is not something a page title should be
 *    able to make you track.
 *  - the name has to match closely, and it has to beat the runner-up clearly. Two shows
 *    with similar names is exactly when a confident wrong answer is worst.
 *  - an episode already watched is left alone. Re-marking would fabricate a rewatch, and
 *    a heartbeat arriving twice must not read as watching it twice.
 *
 * Everything it declines to do returns a reason rather than throwing, because the caller
 * is a background listener with nowhere to show an error and the reasons are worth
 * counting.
 */

export interface Scrobble {
  show?: string;
  season?: number;
  episode?: number;
  /** When the reading was taken. */
  at: number;
}

export type ScrobbleOutcome =
  | 'marked'
  | 'incomplete'
  | 'no-match'
  | 'ambiguous'
  | 'unknown-episode'
  | 'already-watched';

/** A name has to score at least this well to be considered at all. */
export const MATCH_FLOOR = 0.82;
/** …and beat whatever came second by at least this much. */
export const MATCH_GAP = 0.12;

export function isScrobble(value: unknown): value is Scrobble {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.at === 'number' && Number.isFinite(v.at) && typeof v.show === 'string';
}

/**
 * The library title this name refers to, or nothing.
 *
 * Exported because "which show did it think you meant" is the question anybody
 * debugging a wrong scrobble will ask first, and it should be answerable without a
 * database full of watches.
 */
export async function matchLibraryTitle(
  show: string,
  candidates: Array<{ id: InternalId; name: string }>,
): Promise<{ id: InternalId; name: string; score: number } | undefined> {
  const wanted = normaliseName(show);
  if (!wanted) return undefined;

  const scored = candidates
    .map((c) => ({ ...c, score: similarity(wanted, normaliseName(c.name)) }))
    .sort((a, b) => b.score - a.score);

  const [best, second] = scored;
  if (!best || best.score < MATCH_FLOOR) return undefined;
  if (second && best.score - second.score < MATCH_GAP) return undefined;
  return best;
}

export interface ScrobbleDeps {
  episodes(seriesId: InternalId): Promise<CachedEpisode[]>;
}

const DEFAULT_DEPS: ScrobbleDeps = { episodes: (id) => getEpisodesCached(id) };

export async function applyScrobble(
  scrobble: Scrobble,
  deps: ScrobbleDeps = DEFAULT_DEPS,
): Promise<{ outcome: ScrobbleOutcome; targetId?: InternalId }> {
  if (!scrobble.show || scrobble.season == null || scrobble.episode == null) {
    return { outcome: 'incomplete' };
  }

  // The library, with names. Both tables are read whole and joined here rather than one
  // `get` per library row: the store interface has no bulk read, and a library of a few
  // hundred shows would otherwise be a few hundred round trips on every heartbeat.
  const library = await db.library.toArray();
  const tracked = new Set(library.map((l) => l.titleId));
  const candidates = (await db.titles.toArray())
    .filter((t) => tracked.has(t.id) && t.name)
    .map((t) => ({ id: t.id, name: t.name }));

  const match = await matchLibraryTitle(scrobble.show, candidates);
  if (!match) {
    // Told apart on purpose: nothing close enough is a library that does not have the
    // show, and two things equally close is a library that has two of them. The second
    // is the one worth seeing in a log, because it will not fix itself.
    const anyClose = candidates.some(
      (c) => similarity(normaliseName(scrobble.show!), normaliseName(c.name)) >= MATCH_FLOOR,
    );
    return { outcome: anyClose ? 'ambiguous' : 'no-match' };
  }

  const episodes = await deps.episodes(match.id);
  const episode = episodes.find(
    (e) => e.season === scrobble.season && e.number === scrobble.episode,
  );
  if (!episode) return { outcome: 'unknown-episode' };

  const watched = await watchedEpisodeIds(match.id);
  if (watched.has(episode.id)) return { outcome: 'already-watched', targetId: episode.id };

  await markWatched({
    targetId: episode.id,
    seriesId: match.id,
    runtimeMin: episode.runtimeMin,
    // Stamped when the extension saw it, not when the app got round to it — a scrobble
    // can sit in the worker until a Reviewies tab is open.
    watchedAt: scrobble.at,
    source: 'extension',
  });
  return { outcome: 'marked', targetId: episode.id };
}

/**
 * Listen for scrobbles from the browser extension, wherever the app happens to be.
 *
 * App-wide rather than on Watching Mode, because finishing an episode in a streaming tab
 * has nothing to do with which Reviewies screen is open — and §6.26 is the standing
 * lesson here: sync existed for a long time and only ran on two screens, so the queue
 * drained only while one of them was on show.
 *
 * Origin is checked the same way `extensionBridge` checks it. A message from an ad
 * iframe must not be able to write to somebody's history.
 */
export const WATCHED_MESSAGE = 'reviewies:watched';

export function startScrobbleListener(
  onOutcome?: (outcome: ScrobbleOutcome, scrobble: Scrobble) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};

  // Serialised: two heartbeats arriving together must not both read "not watched yet"
  // before either writes. The queue is the whole of the protection against that, and it
  // is cheaper than a lock the store does not offer.
  let queue: Promise<unknown> = Promise.resolve();

  function handle(event: MessageEvent) {
    if (event.origin && event.origin !== window.location.origin) return;
    if (event.source && event.source !== window) return;
    const data = event.data as { type?: string; payload?: unknown } | null;
    if (!data || data.type !== WATCHED_MESSAGE || !isScrobble(data.payload)) return;

    const scrobble = data.payload;
    queue = queue
      .then(() => applyScrobble(scrobble))
      .then((result) => onOutcome?.(result.outcome, scrobble))
      .catch(() => {
        // A failed write is not something to surface: the extension will send it again
        // until the app acknowledges it, and there is no screen this belongs on.
      });
  }

  window.addEventListener('message', handle);
  return () => window.removeEventListener('message', handle);
}

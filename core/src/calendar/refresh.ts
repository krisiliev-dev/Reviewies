import { db } from '../data/db.ts';
import { syncSeriesStatus } from '../data/repo.ts';
import { expireMetadata, getEpisodesCached, getTitleCached } from '../metadata/index.ts';

/**
 * Keep the calendar's idea of what is coming up from going quietly stale.
 *
 * `getUpcoming` reads the local episode cache and nothing else, and the cache is only
 * ever filled by a screen: opening a title, adding one from search, adding one from
 * discover. Nothing refreshed a show you were simply watching. So the calendar showed
 * whatever was known on the day you added the show — the rest of that season, usually,
 * and then silence. A new season announced afterwards never appeared, on either
 * platform, and neither did an air date that moved.
 *
 * The 90-day TTL did not save it, because a TTL only applies to a fetch somebody makes.
 *
 * The second thing this fixes is quieter. `syncSeriesStatus` flips a show back from
 * completed to watching when an unwatched episode exists, which is exactly what a new
 * season is — but it reads the same cache, so with nothing refreshing it, a finished
 * show could never reopen. Refreshing and re-checking status belong in the same pass.
 */

/** How old a series' episodes may be before the calendar refetches them. */
export const REFRESH_EVERY_MS = 12 * 60 * 60 * 1000;

/**
 * How many series one pass will fetch.
 *
 * A large library is hundreds of shows and each one is a request. Refreshing the
 * staleest few and coming back is kind to the rate limit and no worse for the user: the
 * calendar looks 30 days ahead, so being a pass or two behind on a show costs nothing.
 */
export const REFRESH_BATCH = 25;

/**
 * The two provider reads this makes, injectable.
 *
 * Not for convenience: `provider` is resolved when `metadata/index` loads, and this
 * repository's test environment has a real TMDB token in it. A test that did not pass
 * something here would go to the network and pass or fail on what TMDB happened to
 * return, which is the way a suite quietly stops being a suite.
 */
export interface RefreshLookup {
  title: (id: string) => Promise<unknown>;
  episodes: (id: string, maxAgeMs: number) => Promise<unknown[]>;
}

export const DEFAULT_LOOKUP: RefreshLookup = {
  title: getTitleCached,
  episodes: getEpisodesCached,
};

export interface RefreshReport {
  /** Series whose episodes were refetched. */
  refreshed: number;
  /** Cached rows deleted for being past the TTL. */
  expired: number;
  /** Series whose library status changed as a result. */
  reopened: number;
  /** Series left for the next pass because the batch was full. */
  deferred: number;
}

/**
 * Refresh the shows the calendar draws from, staleest first.
 *
 * Tracked *and* completed: a completed show is the one most likely to have a new season
 * nobody has told you about, and it is the only way back to watching.
 */
export async function refreshTracked(
  options: { maxAgeMs?: number; batch?: number; now?: number; lookup?: RefreshLookup } = {},
): Promise<RefreshReport> {
  const {
    maxAgeMs = REFRESH_EVERY_MS,
    batch = REFRESH_BATCH,
    now = Date.now(),
    lookup = DEFAULT_LOOKUP,
  } = options;

  const tracked = (await db.library.toArray()).filter(
    (item) => item.kind === 'show' && (item.status === 'watching' || item.status === 'completed'),
  );

  const withAge: Array<{ id: string; fetchedAt: number }> = [];
  for (const item of tracked) {
    const episodes = await db.episodes.where('seriesId').equals(item.titleId).toArray();
    // Never fetched at all is the stalest thing there is, and it happens: a show added
    // by an import has a library row and no episodes behind it.
    const oldest = episodes.length ? Math.min(...episodes.map((e) => e.fetchedAt)) : 0;
    if (now - oldest > maxAgeMs) withAge.push({ id: item.titleId, fetchedAt: oldest });
  }

  withAge.sort((a, b) => a.fetchedAt - b.fetchedAt);
  const due = withAge.slice(0, batch);

  // The pass that is already running on a timer is the natural place to do this: the
  // settings screens promise the cache expires automatically, and nothing was deleting
  // anything — `isStale` only stops a row being served.
  const expired = await expireMetadata(now);

  const report: RefreshReport = {
    refreshed: 0,
    reopened: 0,
    expired,
    deferred: withAge.length - due.length,
  };

  for (const { id } of due) {
    // A placeholder from a rescued history has no provider behind it. Asking would be a
    // guaranteed miss per show per pass, which is the sort of thing that gets an API
    // key rate-limited for no benefit at all.
    if (id.startsWith('local:')) continue;

    // The title too, and not only for the name: `syncSeriesStatus` will not complete a
    // show unless the title says it has ended, and "ended" is the field most likely to
    // have changed since the show was added.
    await lookup.title(id);
    const before = await db.episodes.where('seriesId').equals(id).count();
    const episodes = await lookup.episodes(id, maxAgeMs);
    // A failed fetch returns the cache unchanged rather than throwing, so count the
    // pass as done either way; the next one will try again.
    if (episodes.length >= before) report.refreshed++;

    if (await syncSeriesStatus(id, now)) report.reopened++;
  }

  return report;
}

/**
 * Run the refresh for the app, the way the sync driver runs sync.
 *
 * On a timer and on demand, never on the critical path of anything: the calendar reads
 * the cache and renders whatever is in it, and this makes what is in it better between
 * renders. Failures are swallowed on purpose — a provider outage should not surface as
 * an error on a screen nobody asked to refresh.
 */
let stopCurrent: (() => void) | undefined;
let running: Promise<RefreshReport | undefined> | undefined;

export async function requestRefresh(): Promise<RefreshReport | undefined> {
  if (running) return running;
  running = (async () => {
    try {
      return await refreshTracked();
    } catch {
      return undefined;
    } finally {
      running = undefined;
    }
  })();
  return running;
}

export function startCalendarRefresh(options: { intervalMs?: number } = {}): () => void {
  stopCurrent?.();

  const { intervalMs = REFRESH_EVERY_MS } = options;
  const timer = setInterval(() => void requestRefresh(), intervalMs);
  // Not on start: an app opening has better things to do with the network than fetch
  // twenty-five episode lists, and the calendar is a screen nobody reaches in the first
  // few seconds. The first pass happens when the calendar is opened, or on the timer.

  const stop = () => {
    clearInterval(timer);
    if (stopCurrent === stop) stopCurrent = undefined;
  };
  stopCurrent = stop;
  return stop;
}

import { db } from './db';
import { enqueue } from '../sync/engine';
import type {
  CachedEpisode,
  InternalId,
  LibraryStatus,
  MediaKind,
  WatchEvent,
} from '../domain/types';

const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

// ---------------------------------------------------------------------------
// Watching
// ---------------------------------------------------------------------------

/**
 * Record one act of watching. Calling this again for the same target is a rewatch,
 * not a no-op — that is what makes rewatch counts possible.
 */
export async function markWatched(opts: {
  targetId: InternalId;
  seriesId?: InternalId;
  runtimeMin?: number;
  watchedAt?: number;
  source?: WatchEvent['source'];
}): Promise<WatchEvent> {
  const event: WatchEvent = {
    id: uid(),
    targetId: opts.targetId,
    seriesId: opts.seriesId,
    watchedAt: opts.watchedAt ?? Date.now(),
    runtimeMin: opts.runtimeMin,
    source: opts.source ?? 'manual',
  };
  await db.watches.add(event);
  // Queued, not sent. The write above has already succeeded locally, so the UI
  // updates whether or not there is a network.
  await enqueue('watches', event as unknown as Record<string, unknown>);
  return event;
}

/** Undo the most recent watch of a target. Leaves earlier rewatches intact. */
export async function unwatchLatest(targetId: InternalId): Promise<boolean> {
  const events = await db.watches.where('targetId').equals(targetId).sortBy('watchedAt');
  const latest = events.at(-1);
  if (!latest) return false;
  await db.watches.delete(latest.id);
  // Deletes replicate as tombstones — otherwise the row returns on the next pull.
  await enqueue('watches', { id: latest.id }, { deleted: true });
  return true;
}

/** How many times a target has been watched. 0 means never. */
export async function watchCount(targetId: InternalId): Promise<number> {
  return db.watches.where('targetId').equals(targetId).count();
}

/** Every episode ID watched at least once in a series. */
export async function watchedEpisodeIds(seriesId: InternalId): Promise<Set<InternalId>> {
  const events = await db.watches.where('seriesId').equals(seriesId).toArray();
  return new Set(events.map((e) => e.targetId));
}

// ---------------------------------------------------------------------------
// Up Next — the home screen, and the thing the whole product is judged on.
//
// From r/tvtime: "The only important thing in an app is that it opens directly to
// the page where I can see and mark the next episodes of my shows."
// ---------------------------------------------------------------------------

export interface UpNextEntry {
  seriesId: InternalId;
  seriesName: string;
  posterUrl?: string;
  episode: CachedEpisode;
  /**
   * Episodes left after this one. Trakt's most-repeated complaint is that it shows a
   * vague "NEW" badge instead of a count.
   */
  remaining: number;
}

/**
 * Next unwatched aired episode for each show being watched.
 *
 * "Aired" is deliberate: users reported Trakt offering episodes marked as not yet
 * released, which destroys trust in the list.
 */
export async function getUpNext(now = Date.now()): Promise<UpNextEntry[]> {
  const shows = await db.library.where('status').equals('watching').toArray();
  const entries: UpNextEntry[] = [];

  for (const show of shows) {
    if (show.kind !== 'show') continue;

    const [episodes, watched, title] = await Promise.all([
      db.episodes.where('seriesId').equals(show.titleId).toArray(),
      watchedEpisodeIds(show.titleId),
      db.titles.get(show.titleId),
    ]);

    const aired = episodes
      // Season 0 is specials — OVAs, recaps, Christmas episodes. They sort before
      // season 1, so including them would make "Up Next" for One Piece a recap
      // special rather than episode 1. They remain visible on the show page.
      .filter((e) => e.season > 0 && hasAired(e, now))
      .sort((a, b) => a.season - b.season || a.number - b.number);

    const unwatched = aired.filter((e) => !watched.has(e.id));
    const next = unwatched[0];
    if (!next) continue;

    entries.push({
      seriesId: show.titleId,
      seriesName: title?.name ?? 'Unknown',
      posterUrl: show.posterOverride ?? title?.posterUrl,
      episode: next,
      remaining: unwatched.length - 1,
    });
  }

  // Shows you are furthest through surface first — closest to a satisfying finish.
  return entries.sort((a, b) => a.remaining - b.remaining);
}

export function hasAired(episode: CachedEpisode, now = Date.now()): boolean {
  if (!episode.airDate) return false;
  const t = Date.parse(episode.airDate);
  return Number.isFinite(t) && t <= now;
}

// ---------------------------------------------------------------------------
// Library and watchlist
// ---------------------------------------------------------------------------

export async function addToLibrary(
  titleId: InternalId,
  kind: MediaKind,
  status: LibraryStatus = 'watching',
): Promise<void> {
  const existing = await db.library.get(titleId);
  if (existing) {
    await db.library.update(titleId, { status });
    return;
  }
  await db.library.add({ titleId, kind, status, addedAt: Date.now() });
}

export async function setPosterOverride(titleId: InternalId, url?: string): Promise<void> {
  await db.library.update(titleId, { posterOverride: url });
}

export async function addToWatchlist(
  titleId: InternalId,
  kind: MediaKind,
  note?: string,
): Promise<void> {
  const item = { titleId, kind, addedAt: Date.now(), note };
  await db.watchlist.put(item);
  await enqueue('watchlist', item);
}

export async function setWatchlistNote(titleId: InternalId, note: string): Promise<void> {
  await db.watchlist.update(titleId, { note });
  const updated = await db.watchlist.get(titleId);
  if (updated) await enqueue('watchlist', updated as unknown as Record<string, unknown>);
}

export async function removeFromWatchlist(titleId: InternalId): Promise<void> {
  await db.watchlist.delete(titleId);
  await enqueue('watchlist', { titleId }, { deleted: true });
}

export async function rate(targetId: InternalId, value: number): Promise<void> {
  const rating = { targetId, value, ratedAt: Date.now() };
  await db.ratings.put(rating);
  await enqueue('ratings', rating);
}

// ---------------------------------------------------------------------------
// Stats — runtime-weighted, because a 22-minute comedy is not a 60-minute drama.
// (Named as a specific flaw in Serializd's stats by its own users.)
// ---------------------------------------------------------------------------

export interface Stats {
  episodes: number;
  minutes: number;
  distinctTitles: number;
}

export type StatsWindow = '30d' | 'ytd' | 'all';

export async function getStats(window: StatsWindow = 'all', now = Date.now()): Promise<Stats> {
  const since = windowStart(window, now);
  const events = await db.watches.where('watchedAt').above(since).toArray();

  return {
    episodes: events.length,
    // Fall back to a plausible episode length rather than dropping the event entirely.
    minutes: events.reduce((sum, e) => sum + (e.runtimeMin ?? 30), 0),
    distinctTitles: new Set(events.map((e) => e.seriesId ?? e.targetId)).size,
  };
}

function windowStart(window: StatsWindow, now: number): number {
  if (window === '30d') return now - 30 * 24 * 60 * 60 * 1000;
  if (window === 'ytd') return new Date(new Date(now).getFullYear(), 0, 1).getTime();
  return 0;
}

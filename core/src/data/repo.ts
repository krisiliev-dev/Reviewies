import { db } from './db.ts';
import { enqueue, isQueued, primaryKeyOf, queued } from '../sync/engine.ts';
import type {
  CachedEpisode,
  InternalId,
  LibraryStatus,
  MediaKind,
  WatchEvent,
} from '../domain/types.ts';
import { dayHasArrived } from '../time.ts';

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
  /** Set by bulk callers, which run the status check once at the end instead. */
  skipStatusSync?: boolean;
}): Promise<WatchEvent> {
  const event: WatchEvent = {
    id: uid(),
    targetId: opts.targetId,
    seriesId: opts.seriesId,
    watchedAt: opts.watchedAt ?? Date.now(),
    runtimeMin: opts.runtimeMin,
    source: opts.source ?? 'manual',
  };
  // Queued, not sent. The local write succeeds first so the UI updates whether or not
  // there is a network — and `queued` is what stops that ordering costing the queue
  // entry when the tab goes between the two. §6.155 measured the window at a few
  // milliseconds per tap, and what it leaves behind is an episode watched on this device
  // and no other, for ever, with nothing that could notice.
  await queued(db.watches, async () => {
    await db.watches.add(event);
    await enqueue('watches', event as unknown as Record<string, unknown>);
  });
  // Outside the pair on purpose: this is housekeeping that re-derives from the rows
  // above, so a run that never happens is corrected by the next mark or the next
  // calendar refresh. It is not part of what the watch *is*.
  //
  // Checked here rather than in the UI so every path that records a watch — Up Next,
  // the title page, an import — gets the same housekeeping.
  if (opts.seriesId && !opts.skipStatusSync) await syncSeriesStatus(opts.seriesId);
  return event;
}

/**
 * Mark everything up to and including a point in a series as watched.
 *
 * The spoiler-free half of quick logging (research doc 4 §2.2). Catching up any other
 * way means opening the show page and reading the names and synopses of episodes you
 * have not reached yet — which is exactly what someone avoiding spoilers is trying not
 * to do. Callers pass season and episode *numbers*, so nothing has to be rendered.
 *
 * Only aired, unwatched, non-special episodes are touched. Re-marking something
 * already watched would fabricate a rewatch, which is the one thing the event model
 * must never do by accident.
 *
 * Every event is stamped now, because the app does not know when these were really
 * watched and inventing plausible past dates would be worse than an honest one. The
 * UI says so.
 */
export async function catchUpTo(
  seriesId: InternalId,
  season: number,
  number: number,
  now = Date.now(),
): Promise<number> {
  const [episodes, watched] = await Promise.all([
    db.episodes.where('seriesId').equals(seriesId).toArray(),
    watchedEpisodeIds(seriesId),
  ]);

  const due = episodes
    .filter(
      (e) =>
        // Specials sort before season 1 and are not part of a linear catch-up.
        e.season > 0 &&
        hasAired(e, now) &&
        !watched.has(e.id) &&
        (e.season < season || (e.season === season && e.number <= number)),
    )
    .sort((a, b) => a.season - b.season || a.number - b.number);

  for (const episode of due) {
    await markWatched({
      targetId: episode.id,
      seriesId,
      runtimeMin: episode.runtimeMin,
      watchedAt: now,
      // Re-scanning every episode and watch after each of a hundred inserts would
      // make catching up on a long series crawl; once at the end is equivalent.
      skipStatusSync: true,
    });
  }
  await syncSeriesStatus(seriesId, now);

  return due.length;
}

/**
 * Seasons and how many episodes each has aired, for a picker that shows no names.
 *
 * Numbers only, on purpose: this is what a catch-up control renders instead of the
 * episode list.
 */
export async function airedSeasonSizes(
  seriesId: InternalId,
  now = Date.now(),
): Promise<Array<{ season: number; episodes: number }>> {
  const episodes = await db.episodes.where('seriesId').equals(seriesId).toArray();
  const counts = new Map<number, number>();

  for (const e of episodes) {
    if (e.season <= 0 || !hasAired(e, now)) continue;
    counts.set(e.season, Math.max(counts.get(e.season) ?? 0, e.number));
  }

  return [...counts.entries()]
    .map(([season, episodes]) => ({ season, episodes }))
    .sort((a, b) => a.season - b.season);
}

/**
 * Keep a series' library status in step with its episodes.
 *
 * From r/serializd, about a competitor: *"Even after I finish a show and mark all of
 * its episodes as watched, it still stays in the Currently Watching section […] Right
 * now I have over 100 shows stuck."* Housekeeping the user should never have to do.
 *
 * It runs in both directions. Completing is only ever automatic for shows TMDB reports
 * as ended or cancelled — being caught up on something still airing is not the same as
 * being finished with it. But *un*-completing has no such condition: without it,
 * unwatching one episode of a completed show would leave it out of Up Next forever,
 * which turns a convenience into a trap.
 *
 * `paused` and `dropped` are left alone in both directions. Those are decisions the
 * user made, and overriding them is not housekeeping.
 */
export async function syncSeriesStatus(seriesId: InternalId, now = Date.now()): Promise<boolean> {
  const item = await db.library.get(seriesId);
  if (!item || (item.status !== 'watching' && item.status !== 'completed')) return false;

  const [title, episodes, watched] = await Promise.all([
    db.titles.get(seriesId),
    db.episodes.where('seriesId').equals(seriesId).toArray(),
    watchedEpisodeIds(seriesId),
  ]);

  // Specials are excluded for the same reason Up Next excludes them: nobody considers
  // a show unfinished because they skipped a recap.
  const aired = episodes.filter((e) => e.season > 0 && hasAired(e, now));
  const allWatched = aired.length > 0 && aired.every((e) => watched.has(e.id));

  if (item.status === 'watching' && allWatched && title?.ended) {
    await queued(db.library, async () => {
      await db.library.update(seriesId, { status: 'completed' });
      await queueLibrary(seriesId);
    });
    return true;
  }
  if (item.status === 'completed' && !allWatched) {
    await queued(db.library, async () => {
      await db.library.update(seriesId, { status: 'watching' });
      await queueLibrary(seriesId);
    });
    return true;
  }
  return false;
}

/** Undo the most recent watch of a target. Leaves earlier rewatches intact. */
export async function unwatchLatest(targetId: InternalId): Promise<boolean> {
  const events = await db.watches.where('targetId').equals(targetId).sortBy('watchedAt');
  const latest = events.at(-1);
  if (!latest) return false;
  /**
   * The delete and its tombstone, together. The tombstone carries the **whole row**, not
   * just its key.
   *
   * Deletes replicate as tombstones — otherwise the row returns on the next pull. A
   * tombstone is an *upsert* with `deleted: true`, though, and the outbox coalesces on
   * `table:pk`: mark an episode watched and undo it before the next sync — which §6.64
   * built an Undo button for — and the delete replaces the unpushed insert, so what
   * reaches the server is a row it has never seen carrying nothing but an id.
   *
   * Every not-null column is then missing. Postgres raises 23502, which `classify` reads
   * as retryable, so the entry never leaves the queue — and `syncOnce` returns on a push
   * failure, so **every later write is stuck behind it, for ever**. Undo a watch before
   * your next sync and sync stops working. Proved against real Postgres in
   * `app/src/backend/schema.test.ts`. §6.70.
   *
   * Which is also why the pair must not come apart. A delete that lands without its
   * tombstone is a row this device has forgotten and the server still holds, and the next
   * pull puts it back — the undo silently undoing itself. §6.155.
   */
  await queued(db.watches, async () => {
    await db.watches.delete(latest.id);
    await enqueue('watches', latest as unknown as Record<string, unknown>, { deleted: true });
  });
  if (latest.seriesId) await syncSeriesStatus(latest.seriesId);
  return true;
}

/** How many times a target has been watched. 0 means never. */
export async function watchCount(targetId: InternalId): Promise<number> {
  return db.watches.where('targetId').equals(targetId).count();
}

/**
 * Whether a watch for this episode is still sitting in the outbox.
 *
 * The one fact that separates *"nobody has said anything"* from *"the server will not tell
 * you yet"*, and nothing in the product could ask it until §6.177.
 *
 * The spoiler gate on comments is enforced by the server's row-level security: it sends
 * you an episode's conversation once it knows you have watched it. Mark an episode watched
 * and the local row lands immediately — that is the whole point of the outbox — but the
 * server has not heard yet, so it correctly sends nothing, and the screen has no way to
 * tell that apart from an empty conversation. It said *"Nothing here yet. Be the first."*
 * over a conversation that exists and is being withheld, which is the exact mistake
 * `COPY.comments.sealed` was written to prevent, with that sentence sitting unreachable
 * two lines away. §6.175 proved it unreachable; this is what makes it reachable.
 *
 * Watches are events, keyed by their own id rather than by the episode, so this is a
 * lookup per event rather than one key. An episode watched five times is five rows, and
 * any one of them still queued means the server's answer is not final.
 */
export async function watchPending(targetId: InternalId): Promise<boolean> {
  const events = await db.watches.where('targetId').equals(targetId).toArray();
  for (const event of events) {
    if (await isQueued('watches', primaryKeyOf('watches', event as unknown as Record<string, unknown>))) {
      return true;
    }
  }
  return false;
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
/**
 * How much of the library came from an import and has never been matched.
 *
 * An export carries names and dates; it has no provider IDs, so those rows land under
 * local ones and the provider knows nothing about them. Until they are matched there
 * are no episode lists beyond what was watched, no artwork and no air dates, and Up
 * Next has nothing to offer for them.
 *
 * The screens use this to explain their own silence. Saying "all caught up" to somebody
 * who has just rescued two hundred shows reads as a broken app rather than an
 * unfinished one, and the difference matters most in the first five minutes.
 */
export async function unmatchedImportCount(): Promise<number> {
  const rows = await db.library.toArray();
  return rows.filter((row) => row.titleId.startsWith('local:')).length;
}

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

/**
 * Whether an episode has aired where the viewer is.
 *
 * `Date.parse` on a bare `yyyy-mm-dd` reads it as UTC midnight, which made this the most
 * consequential timezone bug in the product: it decides what Up Next offers. West of
 * Greenwich it offered tomorrow's episode from teatime today; east of it, it hid today's
 * episode all morning. `dayHasArrived` reads the date in the viewer's own calendar
 * instead. §6.66.
 */
export function hasAired(episode: CachedEpisode, now = Date.now()): boolean {
  if (!episode.airDate) return false;
  return dayHasArrived(episode.airDate, now);
}

// ---------------------------------------------------------------------------
// The past — what Up Next draws above the present.
//
// `docs/design/architecture.md` section 3. Up Next was forward-only, on a product whose whole
// subject is a record of attention already spent: `db.watches` has carried this since the
// first commit and nothing had ever drawn it.
// ---------------------------------------------------------------------------

/**
 * How far back the past goes on Up Next.
 *
 * Capped, and `architecture.md`'s seventh refusal says why: a library of three thousand
 * watches rendered above the fold is a screen that cannot open, and §6.156 measured what
 * walking a 1,220-episode library costs. Forty is about a fortnight of ordinary watching
 * and about seven screens of scrolling — far enough to answer "what did I finish on
 * Tuesday", nowhere near far enough to be a Library, which this deliberately is not.
 *
 * A number rather than "everything, lazily": a window that grows as you scroll is a
 * second mechanism to get wrong, and the honest answer to the case it would serve is the
 * Library graft `direction.md` names and nobody has built.
 */
export const HISTORY_LIMIT = 40;

/**
 * One act of watching, drawn as a row.
 *
 * Keyed by the **watch** rather than by the episode, because a rewatch is two events and
 * both of them happened. `getUpNext` is keyed by series for the opposite reason: there is
 * one next episode per show.
 */
export interface HistoryEntry {
  /** The event's own id, which is what makes a rewatch two rows rather than one. */
  watchId: string;
  /** Episode id for a show, title id for a film — `WatchEvent.targetId`. */
  targetId: InternalId;
  watchedAt: number;
  /** The series' name, or the film's. The row's title line. */
  name: string;
  posterUrl?: string;
  /** Where the row opens: the series for an episode, the film for a film. */
  titleId: InternalId;
  /**
   * Present for an episode and absent for a film, which is how a row knows its shape.
   *
   * Also absent for an episode whose row has fallen out of the metadata cache — the watch
   * is still true and still drawn, with the series' name and no code. That is the honest
   * degradation: the row says less rather than claiming the watch was of a film.
   */
  episode?: { season: number; number: number; name: string };
}

/**
 * The most recent watches, oldest first.
 *
 * **The window is the newest `limit`; the order inside it is the order they happened**,
 * because that is the order the screen draws them in — above the present, oldest at the
 * top, so scrolling up goes further back. Returning newest-first and reversing at two call
 * sites would be the same decision made twice, which is what this repository spends most
 * of its guards preventing.
 *
 * A watch whose episode or title has fallen out of the metadata cache still gets a row:
 * the event is the fact, and the name is the part that can go missing. §6.57's distinction
 * applies here as everywhere — "I could not look it up" is not "it did not happen".
 */
export async function getHistory(limit = HISTORY_LIMIT): Promise<HistoryEntry[]> {
  const events = await db.watches.orderBy('watchedAt').reverse().limit(limit).toArray();

  /*
   * One read per distinct title rather than one per row. A fortnight of one series is
   * forty rows and one show, and asking the store forty times for the same title is the
   * shape §6.156 measured on a screen that then had to be made lazy.
   */
  const titleIds = new Set<InternalId>();
  const episodes = new Map<InternalId, CachedEpisode | undefined>();
  for (const event of events) {
    if (event.seriesId) titleIds.add(event.seriesId);
    else titleIds.add(event.targetId);
  }
  await Promise.all(
    events
      .filter((event) => event.seriesId)
      .map(async (event) => episodes.set(event.targetId, await db.episodes.get(event.targetId))),
  );
  const titles = new Map(
    await Promise.all(
      [...titleIds].map(async (id) => [id, await db.titles.get(id)] as const),
    ),
  );

  const rows: HistoryEntry[] = [];
  for (const event of events) {
    const titleId = event.seriesId ?? event.targetId;
    const title = titles.get(titleId);
    const episode = event.seriesId ? episodes.get(event.targetId) : undefined;
    rows.push({
      watchId: event.id,
      targetId: event.targetId,
      watchedAt: event.watchedAt,
      name: title?.name ?? 'Unknown',
      posterUrl: title?.posterUrl,
      titleId,
      episode: episode
        ? { season: episode.season, number: episode.number, name: episode.name }
        : undefined,
    });
  }
  // Oldest first — see the header. `reverse()` above took the newest `limit`; this puts
  // that window back into the order somebody lived it.
  return rows.reverse();
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
    await queued(db.library, async () => {
      await db.library.update(titleId, { status });
      await queueLibrary(titleId);
    });
    return;
  }
  const item = { titleId, kind, status, addedAt: Date.now() };
  await queued(db.library, async () => {
    await db.library.add(item);
    await enqueue('library', item);
  });
}

/**
 * Queue whatever the library row now says.
 *
 * `update` is a patch, and the outbox sends whole rows, so the row has to be read back
 * rather than reconstructed from the patch. Every path that changes a library row goes
 * through here — tracking something, a status change, a poster override — because until
 * recently none of them did, and a library that does not replicate is the one table
 * whose absence makes a second device look empty.
 */
async function queueLibrary(titleId: InternalId): Promise<void> {
  const row = await db.library.get(titleId);
  if (row) await enqueue('library', row as unknown as Record<string, unknown>);
}

export async function setPosterOverride(titleId: InternalId, url?: string): Promise<void> {
  await queued(db.library, async () => {
    await db.library.update(titleId, { posterOverride: url });
    await queueLibrary(titleId);
  });
}

/**
 * Clear a rating.
 *
 * Here rather than in the screens, which were calling `db.ratings.delete` directly and
 * so deleted the row locally and told the server nothing. With sync configured the next
 * pull put it straight back: tapping the same star to clear it appeared to work and then
 * quietly undid itself.
 */
export async function clearRating(targetId: InternalId): Promise<void> {
  // Read before deleting: a tombstone is an upsert, and one carrying only the key cannot
  // be inserted for a row the server never received. See `unwatchLatest`. §6.70.
  const existing = await db.ratings.get(targetId);
  await queued(db.ratings, async () => {
    await db.ratings.delete(targetId);
    await enqueue('ratings', (existing ?? { targetId }) as unknown as Record<string, unknown>, {
      deleted: true,
    });
  });
}

export async function addToWatchlist(
  titleId: InternalId,
  kind: MediaKind,
  note?: string,
): Promise<void> {
  const item = { titleId, kind, addedAt: Date.now(), note };
  await queued(db.watchlist, async () => {
    await db.watchlist.put(item);
    await enqueue('watchlist', item);
  });
}

export async function setWatchlistNote(titleId: InternalId, note: string): Promise<void> {
  await queued(db.watchlist, async () => {
    await db.watchlist.update(titleId, { note });
    const updated = await db.watchlist.get(titleId);
    if (updated) await enqueue('watchlist', updated as unknown as Record<string, unknown>);
  });
}

/**
 * Start watching something you had saved: one act, not two.
 *
 * §6.167 asked what a watchlist row is *for*. It is a thing you mean to watch, and an
 * intention resolves two ways — you start it, or you give up on it. The row drew only the
 * second: `Remove` was the only element on it wearing a control's shape, on the screen
 * whose whole subject is things you want. `05-discover.png` offers the same film with
 * **Track** and **Watchlist** side by side; `06-watchlist.png` offers *Remove*.
 *
 * Tracking it takes it off the list, and that is not a nicety either. Both of the
 * products this one is answering do it — Trakt drops a title from the watchlist when you
 * watch it, Letterboxd when you log the film — and `discover/recommend.ts` already
 * excludes anything tracked *or* watchlisted, so a title in both places is one the feed
 * reasons about twice while the two lists say contradictory things about it: "I mean to
 * watch this" and "I am watching this".
 *
 * It is one function rather than two calls at four call sites because the ordering has a
 * failure mode: remove first and a crash between them loses the title from both lists.
 * Track first, and the worst case is a title tracked and still saved, which the next
 * press fixes. Two platforms writing this by hand would each get one vote on that.
 */
export async function startWatching(titleId: InternalId, kind: MediaKind): Promise<void> {
  await addToLibrary(titleId, kind);
  await removeFromWatchlist(titleId);
}

export async function removeFromWatchlist(titleId: InternalId): Promise<void> {
  const existing = await db.watchlist.get(titleId);
  await queued(db.watchlist, async () => {
    await db.watchlist.delete(titleId);
    await enqueue('watchlist', (existing ?? { titleId }) as unknown as Record<string, unknown>, {
      deleted: true,
    });
  });
}

export async function rate(targetId: InternalId, value: number): Promise<void> {
  const rating = { targetId, value, ratedAt: Date.now() };
  await queued(db.ratings, async () => {
    await db.ratings.put(rating);
    await enqueue('ratings', rating);
  });
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

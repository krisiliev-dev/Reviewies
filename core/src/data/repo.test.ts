import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db.ts';
import {
  addToLibrary,
  airedSeasonSizes,
  catchUpTo,
  getHistory,
  getStats,
  getUpNext,
  hasAired,
  HISTORY_LIMIT,
  markWatched,
  syncSeriesStatus,
  unwatchLatest,
  watchCount,
  watchedEpisodeIds,
} from './repo.ts';
import { makeId } from '../domain/types.ts';
import { dayKey } from '../time.ts';

const SERIES = makeId('tmdb', 'tv', 1);
const ep = (n: number) => makeId('tmdb', 'ep', `1-1-${n}`);

const DAY = 24 * 60 * 60 * 1000;

async function seedSeries(episodeCount: number, opts: { futureFrom?: number } = {}) {
  await db.titles.put({
    id: SERIES,
    kind: 'show',
    name: 'The Long Dark',
    fetchedAt: Date.now(),
  });

  const rows = [];
  for (let i = 1; i <= episodeCount; i++) {
    // Episodes air weekly, counting back from a week ago so all are in the past
    // unless futureFrom says otherwise.
    const aired = opts.futureFrom && i >= opts.futureFrom;
    const offset = aired ? +(i * 7 * DAY) : -((episodeCount - i + 1) * 7 * DAY);
    rows.push({
      id: ep(i),
      seriesId: SERIES,
      season: 1,
      number: i,
      name: `Episode ${i}`,
      airDate: dayKey(Date.now() + offset),
      runtimeMin: 50,
      fetchedAt: Date.now(),
    });
  }
  await db.episodes.bulkPut(rows);
  await addToLibrary(SERIES, 'show');
}

beforeEach(async () => {
  await Promise.all([
    db.library.clear(),
    db.watches.clear(),
    db.ratings.clear(),
    db.watchlist.clear(),
    db.reactions.clear(),
    db.titles.clear(),
    db.episodes.clear(),
  ]);
});

describe('watches are events, not a boolean', () => {
  it('counts each rewatch separately', async () => {
    await markWatched({ targetId: ep(1), seriesId: SERIES });
    await markWatched({ targetId: ep(1), seriesId: SERIES });
    await markWatched({ targetId: ep(1), seriesId: SERIES });

    expect(await watchCount(ep(1))).toBe(3);
  });

  it('unwatching removes only the most recent event', async () => {
    await markWatched({ targetId: ep(1), seriesId: SERIES, watchedAt: 1000 });
    await markWatched({ targetId: ep(1), seriesId: SERIES, watchedAt: 2000 });

    expect(await unwatchLatest(ep(1))).toBe(true);
    expect(await watchCount(ep(1))).toBe(1);

    const remaining = await db.watches.where('targetId').equals(ep(1)).toArray();
    expect(remaining[0].watchedAt).toBe(1000);
  });

  it('reports false when there is nothing to unwatch', async () => {
    expect(await unwatchLatest(ep(9))).toBe(false);
  });

  it('still treats an episode as watched after any number of rewatches', async () => {
    await markWatched({ targetId: ep(1), seriesId: SERIES });
    await markWatched({ targetId: ep(1), seriesId: SERIES });

    expect(await watchedEpisodeIds(SERIES)).toEqual(new Set([ep(1)]));
  });
});

describe('Up Next', () => {
  it('offers the first unwatched episode and counts what is left', async () => {
    await seedSeries(10);
    await markWatched({ targetId: ep(1), seriesId: SERIES });
    await markWatched({ targetId: ep(2), seriesId: SERIES });

    const [entry] = await getUpNext();
    expect(entry.episode.number).toBe(3);
    // 10 aired, 2 watched, so 8 remain and 7 follow the one on offer.
    expect(entry.remaining).toBe(7);
    expect(entry.seriesName).toBe('The Long Dark');
  });

  it('never offers an episode that has not aired', async () => {
    // Episodes 4 and 5 are in the future.
    await seedSeries(5, { futureFrom: 4 });
    await markWatched({ targetId: ep(1), seriesId: SERIES });
    await markWatched({ targetId: ep(2), seriesId: SERIES });
    await markWatched({ targetId: ep(3), seriesId: SERIES });

    // Everything aired has been watched, so the show should drop out entirely
    // rather than offering an unreleased episode.
    expect(await getUpNext()).toHaveLength(0);
  });

  it('drops shows that are fully watched', async () => {
    await seedSeries(2);
    await markWatched({ targetId: ep(1), seriesId: SERIES });
    await markWatched({ targetId: ep(2), seriesId: SERIES });

    expect(await getUpNext()).toHaveLength(0);
  });

  it('never offers a special, even though season 0 sorts first', async () => {
    await seedSeries(3);
    await db.episodes.put({
      id: makeId('tmdb', 'ep', 'special-1'),
      seriesId: SERIES,
      season: 0,
      number: 1,
      name: 'Recap Special',
      airDate: '2020-01-01',
      runtimeMin: 45,
      fetchedAt: Date.now(),
    });

    const [entry] = await getUpNext();
    // Without the season-0 filter this would be the recap special.
    expect(entry.episode.name).toBe('Episode 1');
    expect(entry.episode.season).toBe(1);
    // The special must not inflate the remaining count either.
    expect(entry.remaining).toBe(2);
  });

  /**
   * The boundary Up Next is decided on, which nothing tested.
   *
   * Every air date above is *weeks* from now, so reading one as UTC midnight and
   * comparing it to an instant never changed an answer. The evening before an episode
   * airs is where it changed one — and that is the evening people open this app. §6.66.
   */
  describe('an episode airing tomorrow', () => {
    async function seedOne(airDate: string) {
      await db.titles.put({ id: SERIES, kind: 'show', name: 'The Long Dark', fetchedAt: Date.now() });
      await db.episodes.put({
        id: ep(1),
        seriesId: SERIES,
        season: 1,
        number: 1,
        name: 'Pilot',
        airDate,
        runtimeMin: 50,
        fetchedAt: Date.now(),
      });
      await addToLibrary(SERIES, 'show');
    }

    it('is not offered at any hour of today', async () => {
      await seedOne('2026-08-27');
      const tomorrows = { ...(await db.episodes.get(ep(1)))! };
      for (const hour of [0, 9, 17, 20, 23]) {
        const now = new Date(2026, 7, 26, hour).getTime();
        expect(hasAired(tomorrows, now)).toBe(false);
      }
      // And the screen agrees with the predicate: nothing to watch tonight.
      expect(await getUpNext(new Date(2026, 7, 26, 20).getTime())).toHaveLength(0);
    });

    it('is offered from the first minute of the day it airs', async () => {
      await seedOne('2026-08-27');
      const [entry] = await getUpNext(new Date(2026, 7, 27, 0, 1).getTime());
      expect(entry?.episode.name).toBe('Pilot');
    });

    /**
     * An episode with no date at all has not aired.
     *
     * §6.75 flipped that line to `return true` and nothing in the package noticed. TMDB
     * lists announced episodes with no air date routinely, and reading them as aired is
     * the wrong way round twice over: Up Next would offer an episode that does not
     * exist yet, and `syncSeriesStatus` would refuse to complete a finished show
     * because of an undated placeholder sitting at the end of it.
     */
    it('is not aired at all when nobody knows when it airs', async () => {
      await seedOne('2026-08-27');
      const undated = { ...(await db.episodes.get(ep(1)))!, airDate: undefined };
      expect(hasAired(undated, new Date(2027, 0, 1).getTime())).toBe(false);

      await db.episodes.update(ep(1), { airDate: undefined });
      expect(await getUpNext(new Date(2027, 0, 1).getTime())).toHaveLength(0);
    });
  });

  it('ignores shows that are not currently being watched', async () => {
    await seedSeries(3);
    await db.library.update(SERIES, { status: 'paused' });

    expect(await getUpNext()).toHaveLength(0);
  });

  it('surfaces the show closest to finishing first', async () => {
    await seedSeries(10);
    const other = makeId('tmdb', 'tv', 2);
    await db.titles.put({ id: other, kind: 'show', name: 'Kitchen Nightshift', fetchedAt: Date.now() });
    await db.episodes.put({
      id: makeId('tmdb', 'ep', '2-1-1'),
      seriesId: other,
      season: 1,
      number: 1,
      name: 'Pilot',
      airDate: '2024-01-01',
      runtimeMin: 22,
      fetchedAt: Date.now(),
    });
    await addToLibrary(other, 'show');

    const next = await getUpNext();
    expect(next[0].seriesName).toBe('Kitchen Nightshift');
    expect(next[0].remaining).toBe(0);
  });
});

describe('stats are runtime-weighted', () => {
  it('weights a 22-minute comedy differently from a 50-minute drama', async () => {
    await markWatched({ targetId: ep(1), seriesId: SERIES, runtimeMin: 50 });
    await markWatched({ targetId: ep(2), seriesId: SERIES, runtimeMin: 22 });

    const stats = await getStats('all');
    expect(stats.episodes).toBe(2);
    expect(stats.minutes).toBe(72);
  });

  it('falls back to a default runtime rather than dropping the event', async () => {
    await markWatched({ targetId: ep(1), seriesId: SERIES });
    expect((await getStats('all')).minutes).toBe(30);
  });

  it('respects the 30-day window', async () => {
    await markWatched({ targetId: ep(1), seriesId: SERIES, runtimeMin: 50, watchedAt: Date.now() - 60 * DAY });
    await markWatched({ targetId: ep(2), seriesId: SERIES, runtimeMin: 50, watchedAt: Date.now() - 2 * DAY });

    expect((await getStats('30d')).episodes).toBe(1);
    expect((await getStats('all')).episodes).toBe(2);
  });

  /**
   * Thirty days, and the first of January.
   *
   * The test above puts its two watches sixty days and two days back, which leaves the
   * whole middle of the range untested: §6.75 could change the window to thirty-one
   * days, or to sixty-one hours a day, and nothing noticed. `ytd` was worse — nothing
   * had ever asked it anything, so it could have started on the first of February.
   *
   * These are the three buttons at the top of the Stats screen. Somebody comparing this
   * month to last is reading the answer.
   */
  it('counts thirty days back, to the minute', async () => {
    // Twenty minutes past the edge rather than a day past it: a whole extra day is
    // wide enough that every wrong version of this arithmetic still excludes it, which
    // is how the window survived being changed to thirty-one days, to sixty-one minutes
    // an hour, and to a second of 1,001 milliseconds.
    const now = Date.parse('2026-08-26T12:00:00Z');
    await markWatched({ targetId: ep(1), seriesId: SERIES, watchedAt: now - 29 * DAY });
    await markWatched({
      targetId: ep(2),
      seriesId: SERIES,
      watchedAt: now - 30 * DAY - 20 * 60_000,
    });

    expect((await getStats('30d', now)).episodes).toBe(1);
    expect((await getStats('all', now)).episodes).toBe(2);
  });

  it('starts the year on the first of January, in the local calendar', async () => {
    const now = Date.parse('2026-08-26T12:00:00Z');
    const newYear = new Date(2026, 0, 1).getTime();
    await markWatched({ targetId: ep(1), seriesId: SERIES, watchedAt: newYear + 60_000 });
    await markWatched({ targetId: ep(2), seriesId: SERIES, watchedAt: newYear - 60_000 });

    expect((await getStats('ytd', now)).episodes).toBe(1);
    expect((await getStats('all', now)).episodes).toBe(2);
  });
});

describe('spoiler-free catch-up', () => {
  /** Multi-season, so the "everything before this season" case is covered. */
  async function seedTwoSeasons() {
    await db.titles.put({ id: SERIES, kind: 'show', name: 'The Long Dark', fetchedAt: Date.now() });
    const rows = [];
    for (const [season, count] of [
      [0, 2],
      [1, 6],
      [2, 6],
    ] as const) {
      for (let n = 1; n <= count; n++) {
        rows.push({
          id: makeId('tmdb', 'ep', `1-${season}-${n}`),
          seriesId: SERIES,
          season,
          number: n,
          name: `S${season}E${n}`,
          airDate: dayKey(Date.now() - (20 - season * 6 - n) * DAY),
          runtimeMin: 50,
          fetchedAt: Date.now(),
        });
      }
    }
    await db.episodes.bulkPut(rows);
    await addToLibrary(SERIES, 'show');
  }

  const at = (season: number, n: number) => makeId('tmdb', 'ep', `1-${season}-${n}`);

  it('marks everything up to and including the chosen episode', async () => {
    await seedTwoSeasons();
    expect(await catchUpTo(SERIES, 2, 3)).toBe(9);

    const watched = await watchedEpisodeIds(SERIES);
    expect(watched.has(at(1, 6))).toBe(true);
    expect(watched.has(at(2, 3))).toBe(true);
  });

  it('leaves later episodes alone', async () => {
    await seedTwoSeasons();
    await catchUpTo(SERIES, 2, 3);

    const watched = await watchedEpisodeIds(SERIES);
    expect(watched.has(at(2, 4))).toBe(false);
  });

  it('does not sweep up specials', async () => {
    // Season 0 sorts before season 1, so a naive comparison would mark every OVA
    // and recap as watched on any catch-up at all.
    await seedTwoSeasons();
    await catchUpTo(SERIES, 2, 3);
    expect((await watchedEpisodeIds(SERIES)).has(at(0, 1))).toBe(false);
  });

  it('does not fabricate a rewatch for something already watched', async () => {
    // The one thing an event model must never do by accident.
    await seedTwoSeasons();
    await markWatched({ targetId: at(1, 1), seriesId: SERIES });
    await catchUpTo(SERIES, 1, 3);

    expect(await watchCount(at(1, 1))).toBe(1);
  });

  it('reports how many it actually marked, not how many it considered', async () => {
    await seedTwoSeasons();
    await markWatched({ targetId: at(1, 1), seriesId: SERIES });
    expect(await catchUpTo(SERIES, 1, 3)).toBe(2);
  });

  it('refuses to mark episodes that have not aired', async () => {
    await seedSeries(6, { futureFrom: 4 });
    expect(await catchUpTo(SERIES, 1, 6)).toBe(3);
  });

  it('does nothing when you are already caught up', async () => {
    await seedTwoSeasons();
    await catchUpTo(SERIES, 2, 6);
    expect(await catchUpTo(SERIES, 2, 6)).toBe(0);
  });

  it('clears the show out of Up Next when it catches up to the end', async () => {
    await seedTwoSeasons();
    await catchUpTo(SERIES, 2, 6);
    expect(await getUpNext()).toHaveLength(0);
  });
});

describe('season sizes for a nameless picker', () => {
  it('reports aired seasons and their lengths without any titles', async () => {
    await seedSeries(6);
    expect(await airedSeasonSizes(SERIES)).toEqual([{ season: 1, episodes: 6 }]);
  });

  it('counts only what has aired, so the picker cannot offer the future', async () => {
    await seedSeries(6, { futureFrom: 4 });
    expect(await airedSeasonSizes(SERIES)).toEqual([{ season: 1, episodes: 3 }]);
  });

  it('omits specials, which are not part of a linear catch-up', async () => {
    await seedSeries(3);
    await db.episodes.put({
      id: makeId('tmdb', 'ep', '1-0-1'),
      seriesId: SERIES,
      season: 0,
      number: 1,
      name: 'Recap',
      airDate: '2020-01-01',
      fetchedAt: Date.now(),
    });
    expect((await airedSeasonSizes(SERIES)).map((s) => s.season)).toEqual([1]);
  });

  it('returns nothing for a show with no cached episodes', async () => {
    expect(await airedSeasonSizes(SERIES)).toEqual([]);
  });
});

describe('a finished show leaves "watching" on its own', () => {
  /** From r/serializd: "I have over 100 shows stuck in Currently Watching." */
  const status = async () => (await db.library.get(SERIES))?.status;

  async function seedEnded(episodes = 3, ended = true) {
    await seedSeries(episodes);
    await db.titles.update(SERIES, { ended });
  }

  it('completes an ended show once every aired episode is watched', async () => {
    await seedEnded(3);
    await catchUpTo(SERIES, 1, 3);
    expect(await status()).toBe('completed');
  });

  it('leaves it alone while episodes remain', async () => {
    await seedEnded(3);
    await catchUpTo(SERIES, 1, 2);
    expect(await status()).toBe('watching');
  });

  it('does not complete a show that is still airing', async () => {
    // Caught up is not the same as finished, and claiming otherwise would quietly
    // stop the calendar mattering for that show.
    await seedEnded(3, false);
    await catchUpTo(SERIES, 1, 3);
    expect(await status()).toBe('watching');
  });

  it('treats unknown status as still running rather than guessing', async () => {
    await seedSeries(3);
    await catchUpTo(SERIES, 1, 3);
    expect(await status()).toBe('watching');
  });

  it('ignores episodes that have not aired yet', async () => {
    // Otherwise an ended show with a dated-but-unreleased final episode would never
    // complete, or would complete too early.
    await seedEnded(6);
    await db.episodes.update(ep(6), {
      airDate: dayKey(Date.now() + 30 * DAY),
    });
    await catchUpTo(SERIES, 1, 5);
    expect(await status()).toBe('completed');
  });

  it('reopens the show when an episode is unwatched again', async () => {
    // Without this, unwatching one episode of a completed show would leave it out of
    // Up Next forever — a convenience turned into a trap.
    await seedEnded(3);
    await catchUpTo(SERIES, 1, 3);
    await unwatchLatest(ep(3));

    expect(await status()).toBe('watching');
    expect(await getUpNext()).toHaveLength(1);
  });

  it('does not override a show the user paused or dropped', async () => {
    await seedEnded(3);
    await db.library.update(SERIES, { status: 'dropped' });
    await catchUpTo(SERIES, 1, 3);
    expect(await status()).toBe('dropped');
  });

  /**
   * And says whether it changed anything, which is a number somebody reads.
   *
   * Every test above checks the library row and none of them the return value, so
   * §6.75 could make `syncSeriesStatus` claim a change in both of the cases where
   * there is none — a show the user dropped, and a show already in the right state —
   * and the whole suite stayed green. `refresh.ts` counts those returns into
   * `report.reopened`, which is the "3 shows reopened" line after a metadata refresh.
   * Claiming a change that did not happen is the one thing the boolean must not do.
   */
  it('reports no change when it leaves a show alone', async () => {
    await seedEnded(3);
    await db.library.update(SERIES, { status: 'dropped' });
    expect(await syncSeriesStatus(SERIES)).toBe(false);

    // Not in the library at all is the other way in through that first line.
    expect(await syncSeriesStatus('tmdb:tv:absent')).toBe(false);

    // And the ordinary case: watching, not finished, nothing to do.
    await db.library.update(SERIES, { status: 'watching' });
    expect(await syncSeriesStatus(SERIES)).toBe(false);
  });

  it('reports the change when it makes one', async () => {
    await seedEnded(3);
    // `catchUpTo` runs the check itself, so the show is already completed here and a
    // further call has nothing to do.
    await catchUpTo(SERIES, 1, 3);
    expect(await syncSeriesStatus(SERIES)).toBe(false);

    // Put it back by hand, and the next call is the one that changes something.
    await db.library.update(SERIES, { status: 'watching' });
    expect(await syncSeriesStatus(SERIES)).toBe(true);
    expect(await status()).toBe('completed');
  });
});

/**
 * The past, which Up Next draws above the present. `docs/design/architecture.md` section 3.
 *
 * Three properties, and each is something the screen would be wrong about if the query
 * were: the order, the window, and what a rewatch is.
 */
describe('the past Up Next draws above the present', () => {
  it('returns the watches oldest first, so scrolling up goes back in time', async () => {
    await seedSeries(5);
    await markWatched({ targetId: ep(1), seriesId: SERIES, watchedAt: 1000 });
    await markWatched({ targetId: ep(2), seriesId: SERIES, watchedAt: 2000 });
    await markWatched({ targetId: ep(3), seriesId: SERIES, watchedAt: 3000 });

    const past = await getHistory();
    expect(past.map((row) => row.watchedAt)).toEqual([1000, 2000, 3000]);
    /*
     * Not merely sorted — sorted the way the screen reads. A query that came back
     * newest-first would still be "in order" and would draw the evening upside down, which
     * is the defect this clause is written against rather than a spelling of `sort`.
     */
    expect(past.at(-1)?.targetId, 'the newest watch sits nearest the present').toBe(ep(3));
  });

  it('keeps the newest watches when there are more than the cap', async () => {
    await seedSeries(HISTORY_LIMIT + 5);
    for (let i = 1; i <= HISTORY_LIMIT + 5; i++) {
      await markWatched({ targetId: ep(i), seriesId: SERIES, watchedAt: i * 1000 });
    }

    const past = await getHistory();
    expect(past.length).toBe(HISTORY_LIMIT);
    /*
     * The **newest** window, not the first page of the oldest. Both are `limit`-many rows
     * in ascending order and only one of them is a history: taking the oldest forty of a
     * decade would draw 2015 above tonight's episode.
     */
    expect(past.at(-1)?.targetId).toBe(ep(HISTORY_LIMIT + 5));
    expect(past[0]?.targetId).toBe(ep(6));
  });

  it('honours a smaller window without changing the order', async () => {
    await seedSeries(5);
    for (let i = 1; i <= 5; i++) {
      await markWatched({ targetId: ep(i), seriesId: SERIES, watchedAt: i * 1000 });
    }

    expect((await getHistory(2)).map((row) => row.targetId)).toEqual([ep(4), ep(5)]);
  });

  it('draws a rewatch twice, because it happened twice', async () => {
    await seedSeries(3);
    await markWatched({ targetId: ep(1), seriesId: SERIES, watchedAt: 1000 });
    await markWatched({ targetId: ep(1), seriesId: SERIES, watchedAt: 5000 });

    const past = await getHistory();
    expect(past.length).toBe(2);
    // Keyed by the event rather than by the episode, which is the whole difference from
    // `getUpNext` — one row per show there, one row per watch here.
    expect(new Set(past.map((row) => row.watchId)).size).toBe(2);
  });

  it('carries the series name, the poster and the episode', async () => {
    await seedSeries(3);
    await db.titles.update(SERIES, { posterUrl: 'https://example.invalid/p.jpg' });
    await markWatched({ targetId: ep(2), seriesId: SERIES, watchedAt: 1000 });

    const [row] = await getHistory();
    expect(row.name).toBe('The Long Dark');
    expect(row.posterUrl).toBe('https://example.invalid/p.jpg');
    expect(row.titleId).toBe(SERIES);
    expect(row.episode).toEqual({ season: 1, number: 2, name: 'Episode 2' });
  });

  it('still draws a watch whose episode has fallen out of the cache', async () => {
    /*
     * §6.57's distinction, on the row rather than on the screen: "I could not look it up"
     * is not "it did not happen". The metadata cache has a TTL and the watch does not.
     */
    await seedSeries(3);
    await markWatched({ targetId: ep(1), seriesId: SERIES, watchedAt: 1000 });
    await db.episodes.clear();

    const [row] = await getHistory();
    expect(row.targetId).toBe(ep(1));
    expect(row.name).toBe('The Long Dark');
    expect(row.episode).toBeUndefined();
  });

  it('draws a film, which has no episode and opens itself', async () => {
    const FILM = makeId('tmdb', 'movie', 77);
    await db.titles.put({ id: FILM, kind: 'film', name: 'Salt Flats', fetchedAt: Date.now() });
    await markWatched({ targetId: FILM, watchedAt: 1000 });

    const [row] = await getHistory();
    expect(row.titleId).toBe(FILM);
    expect(row.episode).toBeUndefined();
    expect(row.name).toBe('Salt Flats');
  });

  it('is empty rather than absent when nothing has been watched', async () => {
    expect(await getHistory()).toEqual([]);
  });
});

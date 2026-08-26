import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db.ts';
import {
  addToLibrary,
  airedSeasonSizes,
  catchUpTo,
  getStats,
  getUpNext,
  markWatched,
  unwatchLatest,
  watchCount,
  watchedEpisodeIds,
} from './repo.ts';
import { makeId } from '../domain/types.ts';

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
      airDate: new Date(Date.now() + offset).toISOString().slice(0, 10),
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
          airDate: new Date(Date.now() - (20 - season * 6 - n) * DAY).toISOString().slice(0, 10),
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
      airDate: new Date(Date.now() + 30 * DAY).toISOString().slice(0, 10),
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
});

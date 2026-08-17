import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import {
  addToLibrary,
  getStats,
  getUpNext,
  markWatched,
  unwatchLatest,
  watchCount,
  watchedEpisodeIds,
} from './repo';
import { makeId } from '../domain/types';

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

import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../data/db.ts';
import { REFRESH_EVERY_MS, refreshTracked, type RefreshLookup } from './refresh.ts';
import { getUpcoming } from './upcoming.ts';
import type { CachedEpisode, CachedTitle, LibraryItem } from '../domain/types.ts';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 0, 15);

beforeEach(async () => {
  await Promise.all([
    db.library.clear(),
    db.titles.clear(),
    db.episodes.clear(),
    db.watches.clear(),
    db.outbox.clear(),
  ]);
});

const title = (over: Partial<CachedTitle> = {}): CachedTitle => ({
  id: 'tmdb:tv:1',
  kind: 'show',
  name: 'A Show',
  fetchedAt: NOW,
  ...over,
});

const item = (over: Partial<LibraryItem> = {}): LibraryItem => ({
  titleId: 'tmdb:tv:1',
  kind: 'show',
  status: 'watching',
  addedAt: NOW,
  ...over,
});

const ep = (number: number, over: Partial<CachedEpisode> = {}): CachedEpisode => ({
  id: `tmdb:ep:${over.seriesId ?? 'tmdb:tv:1'}-${over.season ?? 1}-${number}`,
  seriesId: 'tmdb:tv:1',
  season: 1,
  number,
  name: `Episode ${number}`,
  fetchedAt: NOW,
  ...over,
});

/** Records what was asked for, and can answer with new episodes. */
function lookup(answers: Record<string, CachedEpisode[]> = {}) {
  const asked: string[] = [];
  const spy: RefreshLookup = {
    title: async (id) => id,
    episodes: async (id) => {
      asked.push(id);
      const fresh = answers[id];
      if (fresh) await db.episodes.bulkPut(fresh);
      return db.episodes.where('seriesId').equals(id).toArray();
    },
  };
  return { asked, spy };
}

describe('keeping the calendar current', () => {
  it('refetches a show whose episodes are older than the refresh age', async () => {
    await db.library.put(item());
    await db.titles.put(title());
    await db.episodes.put(ep(1, { fetchedAt: NOW - 2 * REFRESH_EVERY_MS }));

    const { asked, spy } = lookup();
    const report = await refreshTracked({ now: NOW, lookup: spy });

    expect(asked).toEqual(['tmdb:tv:1']);
    expect(report.refreshed).toBe(1);
  });

  it('leaves a show alone when its episodes were fetched recently', async () => {
    await db.library.put(item());
    await db.titles.put(title());
    await db.episodes.put(ep(1, { fetchedAt: NOW - 60_000 }));

    const { asked } = lookup();
    const { spy } = lookup();
    await refreshTracked({ now: NOW, lookup: spy });

    expect(asked).toEqual([]);
  });

  it('refetches a tracked show that has no episodes at all', async () => {
    // The state an import leaves behind: a library row and nothing behind it. Treating
    // "never fetched" as fresh is how a rescued library shows an empty calendar forever.
    await db.library.put(item());
    await db.titles.put(title());

    const { asked, spy } = lookup();
    await refreshTracked({ now: NOW, lookup: spy });

    expect(asked).toEqual(['tmdb:tv:1']);
  });

  it('asks only about the shows with nothing behind them, on a fill pass', async () => {
    /*
     * The pass Up Next runs when it opens. §6.154: a show reaches the library before its
     * episodes do — §6.153 made the fetch deliberately un-awaited so the row can say
     * `Tracking` at once — and nothing ever tried again if that fetch did not finish.
     *
     * Narrow is the whole point. The full pass refetches on *age*, up to twenty-five
     * shows, and `startCalendarRefresh` does not run on launch precisely because that is
     * not what somebody opening their list is waiting for. The stale-but-present show
     * below must be left alone.
     */
    await db.library.put(item());
    await db.titles.put(title());
    await db.episodes.put(ep(1, { fetchedAt: NOW - 2 * REFRESH_EVERY_MS }));

    await db.library.put(item({ titleId: 'tmdb:tv:2' }));
    await db.titles.put(title({ id: 'tmdb:tv:2' }));

    const { asked, spy } = lookup();
    await refreshTracked({ now: NOW, lookup: spy, missingOnly: true });

    expect(asked).toEqual(['tmdb:tv:2']);
  });

  it('does not sweep the metadata cache on a fill pass', async () => {
    // `expireMetadata` walks every cached title and episode. On the calendar, opened
    // deliberately, that is fine; on the first screen of every launch it is not.
    await db.library.put(item({ titleId: 'tmdb:tv:2' }));
    await db.titles.put(title({ id: 'tmdb:tv:2' }));
    await db.titles.put(title({ id: 'tmdb:tv:99', fetchedAt: NOW - 400 * DAY }));

    const { spy } = lookup();
    const report = await refreshTracked({ now: NOW, lookup: spy, missingOnly: true });

    expect(report.expired).toBe(0);
    expect(await db.titles.get('tmdb:tv:99')).toBeDefined();
  });

  it('never asks the provider about a title it has never heard of', async () => {
    await db.library.put(item({ titleId: 'local:tv:tvtime-900' }));

    const { asked, spy } = lookup();
    await refreshTracked({ now: NOW, lookup: spy });

    expect(asked).toEqual([]);
  });

  it('skips shows that are paused or dropped', async () => {
    await db.library.bulkPut([
      item({ titleId: 'tmdb:tv:1', status: 'paused' }),
      item({ titleId: 'tmdb:tv:2', status: 'dropped' }),
    ]);

    const { asked, spy } = lookup();
    await refreshTracked({ now: NOW, lookup: spy });

    expect(asked).toEqual([]);
  });

  it('takes the stalest shows first and leaves the rest for the next pass', async () => {
    for (const n of [1, 2, 3]) {
      await db.library.put(item({ titleId: `tmdb:tv:${n}` }));
      await db.episodes.put(
        ep(1, { seriesId: `tmdb:tv:${n}`, id: `e${n}`, fetchedAt: NOW - n * 10 * DAY }),
      );
    }

    const { asked, spy } = lookup();
    const report = await refreshTracked({ now: NOW, batch: 2, lookup: spy });

    expect(asked).toEqual(['tmdb:tv:3', 'tmdb:tv:2']);
    expect(report.deferred).toBe(1);
  });

  it('reopens a completed show when the refresh finds a new season', async () => {
    // The reason this matters beyond the calendar: `syncSeriesStatus` reads the same
    // cache, so with nothing refreshing it a finished show could never come back.
    await db.library.put(item({ status: 'completed' }));
    await db.titles.put(title({ ended: true }));
    const watched = ep(1, { fetchedAt: NOW - 2 * REFRESH_EVERY_MS, airDate: '2025-01-01' });
    await db.episodes.put(watched);
    await db.watches.put({
      id: 'w1',
      targetId: watched.id,
      seriesId: 'tmdb:tv:1',
      watchedAt: NOW - 100 * DAY,
      source: 'manual',
    });

    // Already aired. A season announced for next month does not make a show unfinished
    // — `syncSeriesStatus` counts aired episodes only, and it is right to.
    const nextSeason = ep(1, {
      id: 'tmdb:ep:s2e1',
      season: 2,
      airDate: '2026-01-10',
      fetchedAt: NOW,
    });
    const { spy } = lookup({ 'tmdb:tv:1': [nextSeason] });

    const report = await refreshTracked({ now: NOW, lookup: spy });

    expect(report.reopened).toBe(1);
    expect((await db.library.get('tmdb:tv:1'))?.status).toBe('watching');
  });

  it('puts the new season on the calendar, which is the whole point', async () => {
    await db.library.put(item());
    await db.titles.put(title());
    await db.episodes.put(ep(1, { fetchedAt: NOW - 2 * REFRESH_EVERY_MS, airDate: '2025-01-01' }));

    expect(await getUpcoming(30, NOW)).toHaveLength(0);

    const { spy } = lookup({
      'tmdb:tv:1': [ep(1, { id: 'tmdb:ep:s2e1', season: 2, airDate: '2026-01-20', fetchedAt: NOW })],
    });
    await refreshTracked({ now: NOW, lookup: spy });

    const upcoming = await getUpcoming(30, NOW);
    expect(upcoming.map((e) => e.episode.id)).toEqual(['tmdb:ep:s2e1']);
  });
});
